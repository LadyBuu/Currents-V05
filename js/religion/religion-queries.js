/**
 * =============================================================================
 * STILL WATERS - RELIGION QUERIES (religion-queries.js)
 * =============================================================================
 *
 * LOCATION: js/religion/religion-queries.js
 *
 * All read-only queries for religion data.
 *
 * Every public read returns a clone or a defensive projection. The one
 * exception is character-record reads, which go through the character
 * domain's projection path (CharacterQueries.getCharacterSummary /
 * CharacterState._project). Those projections are their own defensive
 * copy — the character domain does not hand out live records through
 * its public read surface, and religion queries must not bypass that
 * rule.
 *
 * CHARACTER PROJECTIONS:
 *   getFollowers, getFollowerCount, getFollowersByLocation,
 *   getCharactersByReligion, getCharactersByReligionAndLocation all
 *   return the SAME projection shape the character domain returns:
 *
 *     {
 *       id, name, surname, gender, birthYear, isDeceased, deathYear,
 *       religionId, religionHistory, currentLocationId, moves,
 *       professions, rankAssignments, ...
 *     }
 *
 *   The projection is produced by the character domain's public reader
 *   (window.getCharacterById, which under the documented load order is
 *   character-queries.js's projection-returning override). It is not a
 *   live canonical record: mutating it does NOT affect canonical state,
 *   and does NOT affect other callers' reads.
 *
 *   Prior revisions returned the live records reached through
 *   ReligionState.getFollowersByReligion (which returns slice()s of the
 *   live records the follower index holds). Callers that trusted the C5
 *   header ("defensive projection") and mutated the result silently
 *   corrupted canonical state. That hazard is now eliminated at the
 *   query boundary: every character returned by every public read in
 *   this module is the character-domain projection, not the live record.
 *
 * No fallbacks. Missing load-time dependencies throw at load. Missing
 * canonical data throws at call time (except for the legitimate
 * empty-array case where masterData.data.religions is absent).
 *
 * TIME CONTRACT:
 *   Uses window.getCurrentYear from js/core/time.js. The deprecated
 *   window.getCurrentYearSafe alias is NOT used.
 *
 * LOCATION-RESOLUTION CONTRACT:
 *   "Where is this character currently located?" resolves through:
 *
 *     1. LocationQueries.getCurrentLocationId(characterId)
 *          The location domain's semantic resolver. Honours the explicit
 *          currentLocationId field, the moves-based fallback, and the
 *          birthplace fallback.
 *
 *     2. CharacterQueries.getCurrentLocationId(characterId)
 *          The raw currentLocationId FIELD. Fallback for bare harnesses.
 *
 *     3. null
 *
 *   Every function that needs a character's location calls
 *   _resolveCurrentLocationId. Do NOT call window.getCurrentLocationId
 *   directly — its name is overloaded.
 *
 * RELIGIOUS BREAKDOWN:
 *   getReligiousBreakdown(locationId) returns the per-religion counts
 *   for ONE location, keyed by religion id plus 'unaffiliated'. See §9.
 *
 *   getReligiousBreakdownForLocations(locationIds) returns the SAME
 *   breakdown shape AGGREGATED across an array of locations, in the
 *   shape settlement-religion-queries.js expects:
 *
 *     {
 *       byReligion: { [religionId]: { count: number } },
 *       unaffiliated: number,
 *       total: number
 *     }
 *
 *   The single-location form is the module's canonical breakdown for
 *   religion-side callers. The multi-location form is required by the
 *   settlement domain, which spans a location subtree. Both are exposed
 *   because the shapes serve different consumers; neither is derivable
 *   trivially from the other without the caller reimplementing location
 *   resolution and unaffiliated counting.
 *
 * COMPATIBILITY QUERIES:
 *   isCulturallyCompatible and isReligiouslyPermitted are stubs.
 *   Both return a successful verdict with a reason naming the
 *   unimplemented domain. Callers MUST NOT treat the boolean as a
 *   definitive answer; use the reason to distinguish.
 *
 * DEPENDENCIES (required, verified at load):
 *   - religion-state.js:   ReligionState (indexes, clones)
 *   - religion-format.js:  ReligionFormat (display labels)
 *   - accessors.js:        getCharacterById, getCharacters
 *   - time.js:             getCurrentYear
 *
 * DEPENDENCIES (required at call time, guarded per-call):
 *   - location-queries.js: LocationQueries.getCurrentLocationId
 *   - character-queries.js: CharacterQueries.getCurrentLocationId
 *
 * ICON POLICY: No emojis. No icons in confirm/cancel buttons.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - getReligiousBreakdownForLocations(locationIds) added. Returns
 *       { byReligion: { [id]: { count } }, unaffiliated, total }.
 *       settlement-religion-queries.js requires this function; prior
 *       revisions exported only getReligiousBreakdown(locationId) and
 *       the settlement module's caller threw TypeError on first call.
 *       Every settlement religious-unity / dominant-religion query was
 *       dead.
 *     - getFollowers, getFollowerCount, getFollowersByLocation,
 *       getCharactersByReligion, getCharactersByReligionAndLocation
 *       now return the CHARACTER-DOMAIN PROJECTION via
 *       window.getCharacterById, not the live record that
 *       ReligionState.getFollowersByReligion returned via slice().
 *       Prior revisions returned live records, contradicting the C5
 *       header's "defensive projection" claim. A caller that mutated
 *       the returned object corrupted canonical state silently.
 *
 *       The projection preserves every field religion queries read
 *       (religionId, religionHistory, isDeceased, currentLocationId,
 *       moves, etc.) because those are all projection fields per the
 *       character-queries.js CHARACTER PROJECTION CONTRACT.
 *
 *     - getDominantReligion and getReligiousBreakdown now iterate
 *       _getProjectedCharacters() (which maps over
 *       window.getCharacters() and projects each record through
 *       window.getCharacterById). Prior revisions read the live
 *       records directly. Same corruption class as the getFollowers
 *       fix, same resolution.
 *
 *     - getReligionGrowth now reads character religionHistory through
 *       the projection path, not the live record.
 *
 *     - getFollowers* and getCharactersByReligion* now return `null`
 *       on invalid input (matching the singular-read contract), not
 *       `[]`. Prior revisions conflated "unknown religion id" with
 *       "known religion with zero followers". The settlement-side
 *       contract distinguishes them.
 *       NOTE: Callers that assumed getFollowers(id) === [] for an
 *       unknown id must be updated to null-check. Grep for
 *       `getFollowers(` and `getCharactersByReligion(` in the tree
 *       before deploying.
 *
 *       Actually — reconsidering: keeping `[]` for unknown id would
 *       break nothing and preserve backward compat. The semantic
 *       argument for null is weaker than the compat argument for [].
 *       REVERTED: getFollowers* and getCharactersByReligion* continue
 *       to return `[]` for unknown religion id. Only the singular
 *       getReligion(id) returns null for unknown id, matching
 *       prior behavior and the settlement domain's convention for
 *       collection reads vs. singular reads.
 *
 *     - isReligiouslyPermitted now fails CLOSED (returns
 *       permitted: false with a reason naming the unimplemented
 *       domain). Prior revisions returned permitted: true, which
 *       made a caller that reads only the boolean treat an
 *       unimplemented check as permission. Matches selector-base.js
 *       isSpouseBasic's fail-closed semantics for its own domain.
 *
 *     - No behavioral change to getReligion, getAllReligions,
 *       getActiveReligions, getDeprecatedReligions,
 *       getReligionsByLocation, getReligionsByTrait,
 *       getReligionByLeader, god reads, law reads, character-religion
 *       reads, statistics, inheritance summaries, or conversion stats.
 *   Previous revisions:
 *     - C5: docstring clarification attempt (did not match code).
 *     - C1: isReligiouslyPermitted stubbed.
 *     - A1: _resolveCurrentLocationId helper added; getDominantReligion
 *       rewritten to enumerate characters at the location.
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
    // 2. PROJECTION HELPER
    // =========================================================================
    //
    // Returns a character-domain projection for an id. Every public
    // read that returns a character goes through this helper, so the
    // projection contract is enforced at one boundary.

    function _projectCharacter(id) {
        if (!id) return null;
        return _getCharacterById(id);
    }

    /**
     * Returns an array of character-domain projections, one per entry
     * in the live character array, filtered through a predicate.
     * Used by queries that need to iterate all characters.
     */
    function _getProjectedCharacters(filterFn) {
        var live = _getCharacters();
        if (!Array.isArray(live)) return [];
        var out = [];
        for (var i = 0; i < live.length; i++) {
            var lc = live[i];
            if (!lc || !lc.id) continue;
            if (filterFn && !filterFn(lc)) continue;
            var projected = _getCharacterById(lc.id);
            if (projected) out.push(projected);
        }
        return out;
    }

    // =========================================================================
    // 3. LOCATION RESOLUTION
    // =========================================================================
    //
    // See LOCATION-RESOLUTION CONTRACT in the header.

    function _resolveCurrentLocationId(character) {
        if (!character || !character.id) return null;

        if (typeof window.LocationQueries !== 'undefined'
            && window.LocationQueries !== null
            && typeof window.LocationQueries.getCurrentLocationId === 'function') {
            try {
                var resolved = window.LocationQueries.getCurrentLocationId(character.id);
                if (resolved === null) return null;
                if (typeof resolved === 'string' && resolved.length > 0) {
                    return resolved;
                }
            } catch (e) {
                // Fall through.
            }
        }

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
    // 4. CANONICAL ENUMERATION (only used by getAllReligions)
    // =========================================================================

    function _enumerateCanonicalReligions() {
        if (!window.masterData || !window.masterData.data) {
            throw new Error(
                'ReligionQueries: masterData.data is not initialized. ' +
                'This is a canonical store dependency, not an optional one.'
            );
        }
        var religions = window.masterData.data.religions;
        if (!Array.isArray(religions)) {
            return [];
        }
        return religions;
    }

    // =========================================================================
    // 5. CLONE
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
    // 6. BASIC QUERIES
    // =========================================================================

    function getReligion(id) {
        if (!id) return null;
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
    // 7. GOD QUERIES
    // =========================================================================

    function getGod(godId) {
        if (!godId) return null;
        return _getState().getGodById(godId);
    }

    function getGodsByReligion(religionId) {
        var religion = getReligion(religionId);
        if (!religion) return [];
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
    // 8. LAW QUERIES
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
    // 9. FOLLOWER QUERIES
    // =========================================================================
    //
    // Every character returned here is a CHARACTER-DOMAIN PROJECTION via
    // _projectCharacter(). See CHARACTER PROJECTIONS in the header.
    //
    // Callers can read any projection field safely. Mutating the
    // returned object does NOT affect canonical state and does NOT
    // affect other callers. For live records, use
    // CharacterState.getLiveCharacterForMutation.

    function _projectFollowers(religionId, options) {
        options = options || {};
        var includeDeceased = options.includeDeceased === true;

        var liveList = _getState().getFollowersByReligion(religionId);
        if (!Array.isArray(liveList) || liveList.length === 0) return [];

        var out = [];
        for (var i = 0; i < liveList.length; i++) {
            var live = liveList[i];
            if (!live || !live.id) continue;
            if (!includeDeceased && live.isDeceased === true) continue;
            var projected = _projectCharacter(live.id);
            if (projected) out.push(projected);
        }
        return out;
    }

    /**
     * Returns the followers of a religion, as character projections.
     *
     * @param {string} religionId
     * @param {Object} [options]
     * @param {boolean} [options.includeDeceased] - default false
     * @returns {Array<Object>}
     */
    function getFollowers(religionId, options) {
        return _projectFollowers(religionId, options);
    }

    /**
     * Counts living followers of a religion.
     *
     * @param {string} religionId
     * @returns {number}
     */
    function getFollowerCount(religionId) {
        var liveList = _getState().getFollowersByReligion(religionId);
        if (!Array.isArray(liveList) || liveList.length === 0) return 0;
        var count = 0;
        for (var i = 0; i < liveList.length; i++) {
            var live = liveList[i];
            if (!live) continue;
            if (live.isDeceased === true) continue;
            count++;
        }
        return count;
    }

    /**
     * Followers of a religion currently at a specific location.
     *
     * Each element is a character projection. Deceased followers are
     * excluded. Location is resolved via _resolveCurrentLocationId.
     *
     * @param {string} religionId
     * @param {string} locationId
     * @returns {Array<Object>}
     */
    function getFollowersByLocation(religionId, locationId) {
        if (!religionId || !locationId) return [];

        var liveList = _getState().getFollowersByReligion(religionId);
        if (!Array.isArray(liveList) || liveList.length === 0) return [];

        var result = [];
        for (var i = 0; i < liveList.length; i++) {
            var live = liveList[i];
            if (!live || !live.id) continue;
            if (live.isDeceased === true) continue;

            var projected = _projectCharacter(live.id);
            if (!projected) continue;

            var locId = _resolveCurrentLocationId(projected);
            if (locId === locationId) {
                result.push(projected);
            }
        }

        return result;
    }

    /**
     * The religion with the most living followers at a location.
     * Returns a clone of the religion record, or null.
     */
    function getDominantReligion(locationId) {
        if (!locationId) return null;

        var characters = _getProjectedCharacters();
        var counts = {};
        var dominantReligionId = null;
        var dominantCount = 0;

        for (var i = 0; i < characters.length; i++) {
            var c = characters[i];
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
     * bucket. Returns a plain object whose keys are religion ids plus
     * the literal key 'unaffiliated'. Each value is
     * { name: string, count: number }.
     */
    function getReligiousBreakdown(locationId) {
        if (!locationId) return {};

        var characters = _getProjectedCharacters();
        var byReligionId = {};
        var unaffiliated = 0;

        for (var i = 0; i < characters.length; i++) {
            var c = characters[i];
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

    /**
     * Per-religion follower counts aggregated across an ARRAY of
     * locations, in the shape settlement-religion-queries.js expects:
     *
     *   {
     *     byReligion: { [religionId]: { count: number } },
     *     unaffiliated: number,
     *     total: number
     *   }
     *
     * Locations are matched via _resolveCurrentLocationId. Deceased
     * characters are excluded. Duplicate location ids in the input
     * array are deduplicated, so a character whose current location
     * matches two entries in locationIds is counted once.
     *
     * Returns the empty-shape object (all zeros, empty byReligion) when
     * locationIds is empty or invalid. Never returns null: a location
     * set with zero population is a legitimate "0/0/0" result, not a
     * missing-settlement case. Callers that need to distinguish "no
     * such settlement" from "settlement with zero counted population"
     * check the settlement record first, not this function.
     *
     * @param {string[]} locationIds
     * @returns {{ byReligion: Object, unaffiliated: number, total: number }}
     */
    function getReligiousBreakdownForLocations(locationIds) {
        var empty = {
            byReligion: {},
            unaffiliated: 0,
            total: 0
        };

        if (!Array.isArray(locationIds) || locationIds.length === 0) {
            return empty;
        }

        // Deduplicate. A character whose current location appears twice
        // in locationIds is counted once.
        var targetIdSet = {};
        var anyTarget = false;
        for (var t = 0; t < locationIds.length; t++) {
            var lid = locationIds[t];
            if (typeof lid !== 'string' || lid.length === 0) continue;
            targetIdSet[lid] = true;
            anyTarget = true;
        }
        if (!anyTarget) return empty;

        var characters = _getProjectedCharacters();
        var byReligionCount = {};
        var unaffiliated = 0;
        var total = 0;

        for (var i = 0; i < characters.length; i++) {
            var c = characters[i];
            if (!c || !c.id) continue;
            if (c.isDeceased === true) continue;

            var locId = _resolveCurrentLocationId(c);
            if (!locId) continue;
            if (!Object.prototype.hasOwnProperty.call(targetIdSet, locId)) continue;

            total++;
            if (!c.religionId) {
                unaffiliated++;
                continue;
            }
            byReligionCount[c.religionId] = (byReligionCount[c.religionId] || 0) + 1;
        }

        var byReligion = {};
        for (var religionId in byReligionCount) {
            if (!Object.prototype.hasOwnProperty.call(byReligionCount, religionId)) {
                continue;
            }
            byReligion[religionId] = {
                count: byReligionCount[religionId]
            };
        }

        return {
            byReligion: byReligion,
            unaffiliated: unaffiliated,
            total: total
        };
    }

    // =========================================================================
    // 10. CHARACTER RELIGION QUERIES
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
    // 11. RELIGION STATISTICS
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
    // 12. INHERITANCE QUERIES
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
    // 13. GROWTH QUERIES (range-based)
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

        var characters = _getProjectedCharacters();
        var conversions = [];

        for (var i = 0; i < characters.length; i++) {
            var char = characters[i];
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
    // 14. PLACE OF WORSHIP QUERIES
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
    // 15. COMPATIBILITY QUERIES (stubs — both fail closed)
    // =========================================================================

    /**
     * Reports whether two characters are culturally compatible.
     *
     * NOT YET IMPLEMENTED. Cultural compatibility belongs to the
     * culture domain's rules layer, which does not currently exist.
     * This stub returns compatible: false with a reason, matching
     * selector-base.js::isSpouseBasic's fail-closed semantics for its
     * own domain. Callers that need the boolean as a hard gate get
     * "not compatible" (conservative) rather than "compatible"
     * (permissive) when the check is unavailable.
     *
     * @param {string} characterIdA
     * @param {string} characterIdB
     * @returns {{ compatible: boolean, reason: string }}
     */
    function isCulturallyCompatible(characterIdA, characterIdB) {
        return {
            compatible: false,
            reason: 'Cultural compatibility is not yet implemented. ' +
                    'This check will move to the culture domain when ' +
                    'its rules layer ships.'
        };
    }

    /**
     * Reports whether two characters may marry under any religion's laws.
     *
     * NOT YET IMPLEMENTED. Returns permitted: false with a reason.
     * Prior revisions returned permitted: true, which made a caller
     * that reads only the boolean treat an unimplemented check as
     * permission. See the header for the full rationale.
     *
     * @param {string} characterIdA
     * @param {string} characterIdB
     * @returns {{ permitted: boolean, reason: string }}
     */
    function isReligiouslyPermitted(characterIdA, characterIdB) {
        return {
            permitted: false,
            reason: 'Interfaith marriage eligibility is not yet ' +
                    'implemented. This check will move to the relationship ' +
                    'domain when it ships.'
        };
    }

    // =========================================================================
    // 16. LOAD-TIME VERIFICATION
    // =========================================================================

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
    // 17. PUBLIC API
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
        getReligiousBreakdownForLocations: getReligiousBreakdownForLocations,

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

        // Compatibility (stubs — both fail closed)
        isCulturallyCompatible: isCulturallyCompatible,
        isReligiouslyPermitted: isReligiouslyPermitted
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { ReligionQueries: window.ReligionQueries };
    }

})();
