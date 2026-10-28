/**
 * =============================================================================
 * LOCATION QUERIES
 * =============================================================================
 *
 * Interpretation and composition of location-domain data.
 *
 * Owns:
 *   - Hierarchy interpretation (walks, ancestry, projection)
 *   - Search / filtering
 *   - Population analytics
 *   - Movement interpretation (delegating to CharacterQueries)
 *   - Place projections (summary, government, leadership)
 *   - Cross-domain read composition
 *
 * Does NOT own:
 *   - Canonical data
 *   - Mutations
 *   - Presentation defaults (nulls stay null)
 *   - Fallback implementations of other domains
 *
 * Depends on (checked at load time):
 *   - LocationState
 *   - CharacterQueries
 *
 * Note on TimeQueries:
 *   TimeQueries does not exist. Queries does not need time access; the
 *   time-dependent reads (getLocationAtYear) operate on already-stored move
 *   records and do not compute the current year.
 *
 * Cross-domain policy:
 *   LocationQueries may compose other domains' Queries.
 *   LocationQueries may not reproduce another domain's rules.
 *
 * CURRENT-LOCATION RESOLUTION (REVISED):
 *   There are two distinct notions of "current location" in this
 *   codebase, and they are NOT the same function:
 *
 *     CharacterQueries.getCurrentLocationId(id)
 *       Returns the character's EXPLICIT currentLocationId field.
 *       Null when the field is missing. Does NOT fall back to the
 *       latest move or to birthplace. This is the domain-literal
 *       "what is the character's currentLocationId field set to".
 *
 *     World.getCurrentLocationId(character)
 *       RESOLVES a location from a character projection. Precedence:
 *         1. character.currentLocationId (explicit override)
 *         2. latest valid move in character.moves (highest year)
 *         3. character.birthplaceId
 *       Returns null only when no location can be resolved.
 *       This is the SEMANTIC "where is this character located,
 *       considering their whole history".
 *
 *   The location domain's population and current-location reads
 *   consume the SECOND notion. A character created before the moves
 *   system existed has currentLocationId set; a character whose only
 *   location signal is a move (the moves system records it, nothing
 *   set currentLocationId) is correctly placed by World resolution
 *   and missing under CharacterQueries.
 *
 *   Prior revisions of this module used CharacterQueries.getCurrentLocationId
 *   exclusively. That under-counted populations for characters placed
 *   via moves, and returned null for the current location of anyone
 *   whose explicit field was empty even when a move placed them.
 *
 *   This revision composes with World when available, and falls back
 *   to CharacterQueries.getCurrentLocationId otherwise. The fallback
 *   preserves the module's behavior in a bare test harness that loads
 *   only LocationState + CharacterQueries, at the cost of the semantic
 *   resolution described above. In production, world.js is loaded
 *   before this module, so the correct resolution is always used.
 *
 * Load order note:
 *   This file loads AFTER location-commands.js in the HTML. It must not be
 *   required by commands.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - getPopulationCount, getOwnPopulation, getCurrentLocation,
 *       getCurrentLocationId, getCurrentLocationName, getMoveStatistics
 *       now resolve the character's location through
 *       _resolveCurrentLocationId(character), which prefers
 *       World.getCurrentLocationId when loaded and falls back to
 *       CharacterQueries.getCurrentLocationId otherwise. This fixes the
 *       semantic divergence between the two resolution models (see
 *       CURRENT-LOCATION RESOLUTION in the module header).
 *     - The public function getCurrentLocationId(characterId) still
 *       returns the resolved location id (not the field) — same
 *       contract as before, but now with correct resolution. Callers
 *       that want the raw field should use CharacterQueries directly.
 *     - No public signature change, no public return-shape change.
 *       The fix is internal to the resolution path.
 *   Previous revisions:
 *     - Initial implementation.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. HARD DEPENDENCY CHECKS (load time)
    // =========================================================================

    if (!window.LocationState) {
        throw new Error('location-queries.js requires location-state.js first.');
    }
    if (!window.CharacterQueries) {
        throw new Error(
            'location-queries.js requires character-queries.js ' +
            '(CharacterQueries) first.'
        );
    }

    var _requiredCharacterQueryMethods = [
        'getAllCharacters',
        'getCharacterById',
        'getCurrentLocationId',
        'getMoveHistory'
    ];
    for (var _i = 0; _i < _requiredCharacterQueryMethods.length; _i++) {
        var _m = _requiredCharacterQueryMethods[_i];
        if (typeof window.CharacterQueries[_m] !== 'function') {
            throw new Error(
                'location-queries.js: CharacterQueries.' + _m +
                ' is required.'
            );
        }
    }

    var LS = window.LocationState;
    var CQ = window.CharacterQueries;

    // =========================================================================
    // 2. CURRENT-LOCATION RESOLUTION
    // =========================================================================
    //
    // See CURRENT-LOCATION RESOLUTION in the module header. This helper
    // is the single place in this module where the resolution model is
    // chosen. Every function that needs a character's current location
    // calls it, so a future change to the resolution rules is a one-line
    // edit here.

    function _resolveCurrentLocationId(character) {
        if (!character) return null;

        // Prefer the canonical resolver. It honours the explicit
        // currentLocationId override, the moves-based fallback, and the
        // birthplace fallback.
        if (typeof window.getCurrentLocationId === 'function') {
            try {
                var resolved = window.getCurrentLocationId(character);
                // World.getCurrentLocationId returns string|null. A null
                // result is a legitimate "no location resolved" — do
                // not fall through to the weaker resolver.
                if (resolved === null) return null;
                if (typeof resolved === 'string' && resolved.length > 0) {
                    return resolved;
                }
                // Malformed return; fall through to the fallback.
            } catch (e) {
                // World resolver threw; fall through to the fallback.
            }
        }

        // Fallback: the domain-literal currentLocationId field.
        // CharacterQueries.getCurrentLocationId accepts an id, so call
        // it with character.id.
        if (typeof CQ.getCurrentLocationId === 'function' && character.id) {
            try {
                return CQ.getCurrentLocationId(character.id);
            } catch (e) {
                return null;
            }
        }
        return null;
    }

    // =========================================================================
    // 3. BASIC PLACE QUERIES
    // =========================================================================

    function getPlace(placeId) {
        return LS.getPlaceById(placeId);
    }

    function getAllPlaces(options) {
        options = options || {};
        var ids = LS.getAllPlaceIds();
        var result = [];

        for (var i = 0; i < ids.length; i++) {
            var p = LS.getPlaceById(ids[i]);
            if (!p) continue;
            if (options.includeDeprecated === false &&
                p.status === 'deprecated') continue;
            if (options.typeId && p.typeId !== options.typeId) continue;
            if (options.status && p.status !== options.status) continue;
            result.push(p);
        }
        return result;
    }

    function getPlacesByParent(parentId, options) {
        options = options || {};
        var list = LS.getPlacesByParentId(parentId);
        if (options.includeDeprecated === false) {
            list = list.filter(function (p) {
                return p.status !== 'deprecated';
            });
        }
        return list;
    }

    function getPlacesByType(typeId, options) {
        options = options || {};
        var list = LS.getPlacesByTypeId(typeId);
        if (options.includeDeprecated === false) {
            list = list.filter(function (p) {
                return p.status !== 'deprecated';
            });
        }
        return list;
    }

    function getRootPlaces(options) {
        return getPlacesByParent(null, options);
    }

    // =========================================================================
    // 4. LOCATION TYPES
    // =========================================================================

    function getLocationTypes() {
        var ids = LS.getAllLocationTypeIds();
        var result = [];
        for (var i = 0; i < ids.length; i++) {
            var t = LS.getLocationTypeById(ids[i]);
            if (t) result.push(t);
        }
        return result;
    }

    function getLocationType(typeId) {
        return LS.getLocationTypeById(typeId);
    }

    function getLocationTypePriority(typeId) {
        var type = LS.getLocationTypeById(typeId);
        return type ? type.priority : null;
    }

    function getLocationTypeName(typeId) {
        var type = LS.getLocationTypeById(typeId);
        return type ? type.displayName : null;
    }

    // =========================================================================
    // 5. HIERARCHY WALKS
    // =========================================================================

    function getPlaceHierarchy(placeId) {
        if (!placeId) return [];
        var chain = [];
        var seen = {};
        var current = LS.getPlaceById(placeId);
        while (current) {
            if (seen[current.id]) break;
            seen[current.id] = true;
            chain.unshift(current);
            if (!current.parentId) break;
            current = LS.getPlaceById(current.parentId);
        }
        return chain;
    }

    function getPlaceChildren(placeId, recursive) {
        var direct = LS.getPlacesByParentId(placeId);
        if (!recursive) return direct;

        var result = [];
        var seen = {};
        var stack = direct.slice();
        while (stack.length > 0) {
            var next = stack.shift();
            if (!next || !next.id) continue;
            if (seen[next.id]) continue;
            seen[next.id] = true;
            result.push(next);
            var kids = LS.getPlacesByParentId(next.id);
            for (var i = 0; i < kids.length; i++) stack.push(kids[i]);
        }
        return result;
    }

    function getAllSubLocationIds(locationId) {
        if (!locationId) return [];
        var result = [locationId];
        var descendants = getPlaceChildren(locationId, true);
        for (var i = 0; i < descendants.length; i++) {
            result.push(descendants[i].id);
        }
        return result;
    }

    function getParentChain(placeId) {
        var chain = getPlaceHierarchy(placeId);
        return chain.slice(0, -1);
    }

    function getLocationAtPriority(placeId, targetPriority) {
        if (targetPriority === null || targetPriority === undefined) return null;
        var chain = getPlaceHierarchy(placeId);
        for (var i = chain.length - 1; i >= 0; i--) {
            var p = chain[i];
            if (getLocationTypePriority(p.typeId) === targetPriority) {
                return p;
            }
        }
        return null;
    }

    function getCountryId(placeId) {
        var p = getLocationAtPriority(placeId, 1);
        return p ? p.id : null;
    }

    function getLocationCountry(placeId) {
        var countryId = getCountryId(placeId);
        if (!countryId) return null;
        var country = LS.getPlaceById(countryId);
        return country ? country.displayName : null;
    }

    function getLocationDistrict(placeId) {
        var chain = getPlaceHierarchy(placeId);
        for (var i = chain.length - 1; i >= 0; i--) {
            var prio = getLocationTypePriority(chain[i].typeId);
            if (prio === 2 || prio === 3) return chain[i].displayName;
        }
        return null;
    }

    function isAncestorOf(ancestorId, placeId) {
        if (!ancestorId || !placeId) return false;
        if (ancestorId === placeId) return false;
        var chain = getPlaceHierarchy(placeId);
        for (var i = 0; i < chain.length; i++) {
            if (chain[i].id === ancestorId) return true;
        }
        return false;
    }

    function areInSameCountry(placeId1, placeId2) {
        if (!placeId1 || !placeId2) return false;
        if (placeId1 === placeId2) return true;
        var c1 = getCountryId(placeId1);
        var c2 = getCountryId(placeId2);
        return c1 !== null && c1 === c2;
    }

    function findLowestCommonAncestor(placeId1, placeId2) {
        if (!placeId1 || !placeId2) return null;
        if (placeId1 === placeId2) return LS.getPlaceById(placeId1);
        var h1 = getPlaceHierarchy(placeId1);
        var h2 = getPlaceHierarchy(placeId2);
        var common = null;
        var min = Math.min(h1.length, h2.length);
        for (var i = 0; i < min; i++) {
            if (h1[i].id === h2[i].id) common = h1[i];
            else break;
        }
        return common;
    }

    // =========================================================================
    // 6. PLACE PROJECTIONS
    // =========================================================================

    function getPlaceSummary(placeId) {
        var place = LS.getPlaceById(placeId);
        if (!place) return null;

        return {
            id: place.id,
            displayName: place.displayName || null,
            typeId: place.typeId || null,
            typeName: getLocationTypeName(place.typeId),
            parentId: place.parentId !== undefined ? place.parentId : null,
            status: place.status !== undefined ? place.status : null,
            isCapital: place.isCapital === true,
            governmentTypeId: place.governmentTypeId || null,
            governmentStyle: place.governmentStyle || null,
            cultureId: place.cultureId || null,
            variableKey: place.variableKey !== undefined
                ? place.variableKey
                : null,
            notes: place.notes !== undefined ? place.notes : null
        };
    }

    function getPlaceSummaries(options) {
        options = options || {};
        var places = getAllPlaces(options);
        var out = [];
        for (var i = 0; i < places.length; i++) {
            var s = getPlaceSummary(places[i].id);
            if (s) out.push(s);
        }
        return out;
    }

    function getPlacesUsingGovernmentType(governmentTypeId) {
        if (!governmentTypeId) return [];
        var ids = LS.getAllPlaceIds();
        var out = [];
        for (var i = 0; i < ids.length; i++) {
            var p = LS.getPlaceById(ids[i]);
            if (p && p.governmentTypeId === governmentTypeId) {
                var s = getPlaceSummary(p.id);
                if (s) out.push(s);
            }
        }
        return out;
    }

    // =========================================================================
    // 7. LEADERSHIP PROJECTIONS
    // =========================================================================

    function _projectLeaderAssignment(a) {
        if (!a) return null;
        return {
            id: a.id,
            characterId: a.characterId,
            characterName: a.characterName || null,
            startYear: a.startYear !== undefined ? a.startYear : null,
            endYear: a.endYear !== undefined ? a.endYear : null,
            title: a.title || 'Leader',
            notes: a.notes || '',
            isActive: a.isActive === true ||
                (a.isActive !== false &&
                 (a.endYear === null || a.endYear === undefined)),
            endReason: a.endReason || null
        };
    }

    function getCurrentLeader(placeId) {
        var place = LS.getPlaceById(placeId);
        if (!place || !Array.isArray(place.leaderAssignments)) return null;

        for (var i = 0; i < place.leaderAssignments.length; i++) {
            var a = place.leaderAssignments[i];
            if (!a) continue;
            var active = a.isActive === true ||
                (a.isActive !== false &&
                 (a.endYear === null || a.endYear === undefined));
            if (active) return _projectLeaderAssignment(a);
        }
        return null;
    }

    function getLeaderHistory(placeId) {
        var place = LS.getPlaceById(placeId);
        if (!place || !Array.isArray(place.leaderAssignments)) return [];

        var out = [];
        for (var i = 0; i < place.leaderAssignments.length; i++) {
            var p = _projectLeaderAssignment(place.leaderAssignments[i]);
            if (p) out.push(p);
        }
        out.sort(function (x, y) {
            var xStart = x.startYear !== null ? x.startYear : -Infinity;
            var yStart = y.startYear !== null ? y.startYear : -Infinity;
            return yStart - xStart;
        });
        return out;
    }

    function getActiveLeaderCount() {
        var ids = LS.getAllPlaceIds();
        var count = 0;
        for (var i = 0; i < ids.length; i++) {
            if (getCurrentLeader(ids[i])) count++;
        }
        return count;
    }

    function getLeadersByLocation(locationId) {
        var place = LS.getPlaceById(locationId);
        if (!place) return [];

        var out = [];

        var own = getCurrentLeader(locationId);
        if (own) {
            out.push({
                placeId: locationId,
                placeName: place.displayName || null,
                leader: own
            });
        }

        var children = LS.getPlacesByParentId(locationId);
        for (var i = 0; i < children.length; i++) {
            var childLeader = getCurrentLeader(children[i].id);
            if (childLeader) {
                out.push({
                    placeId: children[i].id,
                    placeName: children[i].displayName || null,
                    leader: childLeader
                });
            }
        }

        return out;
    }

    function getPlaceGovernmentSummary(placeId) {
        var place = LS.getPlaceById(placeId);
        if (!place) return null;

        return {
            placeId: place.id,
            displayName: place.displayName || null,
            governmentTypeId: place.governmentTypeId || null,
            governmentStyle: place.governmentStyle || null,
            currentLeader: getCurrentLeader(placeId),
            leaderCount: getLeaderHistory(placeId).length
        };
    }

    // =========================================================================
    // 8. POPULATION
    // =========================================================================

    function getPopulationCount(locationId, includeDeceased) {
        includeDeceased = includeDeceased === true;

        var ids = getAllSubLocationIds(locationId);
        if (ids.length === 0) return 0;
        var idSet = {};
        for (var i = 0; i < ids.length; i++) idSet[ids[i]] = true;

        var chars = CQ.getAllCharacters();
        var count = 0;
        for (var j = 0; j < chars.length; j++) {
            var c = chars[j];
            if (!c || !c.id) continue;
            if (!includeDeceased && c.isDeceased) continue;
            var locId = _resolveCurrentLocationId(c);
            if (locId && idSet[locId]) count++;
        }
        return count;
    }

    function getOwnPopulation(locationId, includeDeceased) {
        includeDeceased = includeDeceased === true;

        var chars = CQ.getAllCharacters();
        var count = 0;
        for (var i = 0; i < chars.length; i++) {
            var c = chars[i];
            if (!c || !c.id) continue;
            if (!includeDeceased && c.isDeceased) continue;
            var locId = _resolveCurrentLocationId(c);
            if (locId === locationId) count++;
        }
        return count;
    }

    // =========================================================================
    // 9. MOVEMENT
    // =========================================================================

    function getMoveHistory(characterId) {
        return CQ.getMoveHistory(characterId);
    }

    function getLastMove(characterId) {
        var moves = CQ.getMoveHistory(characterId);
        return moves.length === 0 ? null : moves[moves.length - 1];
    }

    function getCurrentLocation(characterId) {
        var character = CQ.getCharacterById(characterId);
        if (!character) return null;

        var locId = _resolveCurrentLocationId(character);
        if (!locId) return null;
        var place = LS.getPlaceById(locId);
        return place
            ? { id: place.id, name: place.displayName }
            : { id: locId, name: null };
    }

    function getCurrentLocationId(characterId) {
        var character = CQ.getCharacterById(characterId);
        if (!character) return null;
        return _resolveCurrentLocationId(character);
    }

    function getCurrentLocationName(characterId) {
        var loc = getCurrentLocation(characterId);
        return loc ? loc.name : null;
    }

    function getLocationAtYear(characterId, year) {
        var moves = CQ.getMoveHistory(characterId);
        var result = null;
        for (var i = 0; i < moves.length; i++) {
            var m = moves[i];
            if (m.year === null || m.year === undefined) continue;
            if (m.year <= year) result = m;
            else break;
        }
        return result ? result.locationName : null;
    }

    // =========================================================================
    // 10. SEARCH
    // =========================================================================

    function searchLocations(options) {
        options = options || {};
        var places = getAllPlaces({
            includeDeprecated: options.includeDeprecated === true
        });
        var results = [];

        for (var i = 0; i < places.length; i++) {
            var p = places[i];
            var match = true;

            if (options.search) {
                var lower = options.search.toLowerCase();
                var nameMatch = p.displayName &&
                    p.displayName.toLowerCase().indexOf(lower) !== -1;
                var keyMatch = p.variableKey &&
                    p.variableKey.toLowerCase().indexOf(lower) !== -1;
                if (!nameMatch && !keyMatch) match = false;
            }
            if (match && options.typeId && p.typeId !== options.typeId) {
                match = false;
            }
            if (match && options.parentId !== undefined &&
                p.parentId !== options.parentId) {
                match = false;
            }
            if (match && options.status && p.status !== options.status) {
                match = false;
            }
            if (match && options.isCapital !== undefined &&
                !!p.isCapital !== options.isCapital) {
                match = false;
            }
            if (match && options.hasChildren !== undefined) {
                var kids = LS.getPlacesByParentId(p.id);
                if ((kids.length > 0) !== options.hasChildren) match = false;
            }
            if (match) results.push(p);
        }

        if (options.sortBy) {
            var order = options.sortOrder === 'desc' ? -1 : 1;
            results.sort(function (a, b) {
                var cmp = 0;
                switch (options.sortBy) {
                    case 'name':
                        cmp = (a.displayName || '').localeCompare(b.displayName || '');
                        break;
                    case 'type':
                        cmp = (getLocationTypeName(a.typeId) || '')
                            .localeCompare(getLocationTypeName(b.typeId) || '');
                        break;
                    case 'createdAt':
                        cmp = (a.createdAt || 0) - (b.createdAt || 0);
                        break;
                    case 'updatedAt':
                        cmp = (a.updatedAt || 0) - (b.updatedAt || 0);
                        break;
                    default:
                        cmp = (a.displayName || '').localeCompare(b.displayName || '');
                }
                return cmp * order;
            });
        }

        if (options.limit !== undefined && options.limit !== null) {
            results = results.slice(0, options.limit);
        }
        return results;
    }

    // =========================================================================
    // 11. STATISTICS
    // =========================================================================

    function getLocationStatistics(locationId) {
        var place = LS.getPlaceById(locationId);
        if (!place) return null;

        var directChildren = LS.getPlacesByParentId(locationId);
        var allChildren = getPlaceChildren(locationId, true);
        var hierarchy = getPlaceHierarchy(locationId);
        var parent = place.parentId
            ? LS.getPlaceById(place.parentId)
            : null;

        return {
            id: place.id,
            name: place.displayName,
            typeId: place.typeId,
            typeName: getLocationTypeName(place.typeId),
            typePriority: getLocationTypePriority(place.typeId),
            status: place.status === undefined ? null : place.status,
            isCapital: place.isCapital === true,
            parentId: place.parentId === undefined ? null : place.parentId,
            parentName: parent ? parent.displayName : null,
            depth: hierarchy.length,
            childCount: directChildren.length,
            totalDescendants: allChildren.length,
            ownPopulation: getOwnPopulation(locationId, false),
            totalPopulation: getPopulationCount(locationId, false),
            variableKey: place.variableKey === undefined
                ? null
                : place.variableKey,
            notes: place.notes === undefined ? null : place.notes,
            createdAt: place.createdAt,
            updatedAt: place.updatedAt
        };
    }

    function getGlobalLocationStatistics() {
        var places = getAllPlaces({});
        var stats = {
            totalLocations: places.length,
            byType: {},
            byStatus: {},
            capitals: 0,
            rootLocations: 0,
            withChildren: 0,
            totalPopulation: 0,
            typeCounts: {}
        };

        for (var i = 0; i < places.length; i++) {
            var p = places[i];
            var typeName = getLocationTypeName(p.typeId);
            var typeKey = typeName === null ? null : typeName;
            stats.byType[typeKey] = (stats.byType[typeKey] || 0) + 1;

            var statusKey = p.status === undefined ? null : p.status;
            stats.byStatus[statusKey] = (stats.byStatus[statusKey] || 0) + 1;

            if (p.isCapital) stats.capitals++;
            if (!p.parentId) stats.rootLocations++;
            if (LS.getPlacesByParentId(p.id).length > 0) stats.withChildren++;

            stats.totalPopulation += getPopulationCount(p.id, false);

            var prio = getLocationTypePriority(p.typeId);
            stats.typeCounts[prio] = (stats.typeCounts[prio] || 0) + 1;
        }

        return stats;
    }

    // =========================================================================
    // 12. COMPARISON
    // =========================================================================

    function _cmp(a, b) {
        if (a > b) return 'greater';
        if (a < b) return 'less';
        return 'equal';
    }

    function compareLocations(id1, id2) {
        var s1 = getLocationStatistics(id1);
        var s2 = getLocationStatistics(id2);
        if (!s1 || !s2) return null;

        return {
            location1: s1,
            location2: s2,
            comparison: {
                populationDifference: s1.totalPopulation - s2.totalPopulation,
                populationRelation: _cmp(s1.totalPopulation, s2.totalPopulation),
                depthDifference: s1.depth - s2.depth,
                depthRelation: _cmp(s1.depth, s2.depth),
                childCountDifference: s1.childCount - s2.childCount,
                childCountRelation: _cmp(s1.childCount, s2.childCount)
            }
        };
    }

    // =========================================================================
    // 13. RANKINGS
    // =========================================================================

    function getLargestLocations(limit) {
        var places = getAllPlaces({});
        var rows = places.map(function (p) {
            return {
                locationId: p.id,
                typeId: p.typeId,
                isCapital: p.isCapital === true,
                population: getPopulationCount(p.id, false)
            };
        });
        rows.sort(function (a, b) { return b.population - a.population; });
        return (limit === undefined || limit === null)
            ? rows
            : rows.slice(0, limit);
    }

    function getPopulationPerNodeRanking(limit) {
        var places = getAllPlaces({});
        var rows = places.map(function (p) {
            var pop = getPopulationCount(p.id, false);
            var nodes = getPlaceChildren(p.id, true).length + 1;
            return {
                locationId: p.id,
                typeId: p.typeId,
                population: pop,
                nodeCount: nodes,
                populationPerNode: Math.round(pop / nodes)
            };
        });
        rows.sort(function (a, b) {
            return b.populationPerNode - a.populationPerNode;
        });
        return (limit === undefined || limit === null)
            ? rows
            : rows.slice(0, limit);
    }

    // =========================================================================
    // 14. MOVEMENT ANALYTICS
    // =========================================================================

    function getMoveStatistics(characterId) {
        var moves = CQ.getMoveHistory(characterId);
        var character = CQ.getCharacterById(characterId);
        if (!character) return null;

        var byLocation = {};
        var byDecade = {};
        var unique = {};

        for (var i = 0; i < moves.length; i++) {
            var m = moves[i];
            if (m.locationId) unique[m.locationId] = true;
            var key = (m.locationId === null || m.locationId === undefined)
                ? null
                : m.locationId;
            byLocation[key] = (byLocation[key] || 0) + 1;

            if (m.year !== null && m.year !== undefined) {
                var decade = Math.floor(m.year / 10) * 10;
                byDecade[decade] = (byDecade[decade] || 0) + 1;
            }
        }

        var totalSpan = 0;
        var validIntervals = 0;
        for (var j = 1; j < moves.length; j++) {
            var a = moves[j - 1].year;
            var b = moves[j].year;
            if (a === null || a === undefined ||
                b === null || b === undefined) continue;
            totalSpan += Math.abs(b - a);
            validIntervals++;
        }

        return {
            characterId: characterId,
            totalMoves: moves.length,
            uniqueLocations: Object.keys(unique).length,
            averageYearsBetweenMoves: validIntervals > 0
                ? Math.round((totalSpan / validIntervals) * 10) / 10
                : null,
            byLocation: byLocation,
            byDecade: byDecade
        };
    }

    // =========================================================================
    // 15. EXPORTS
    // =========================================================================

    window.LocationQueries = {
        getPlace: getPlace,
        getAllPlaces: getAllPlaces,
        getPlacesByParent: getPlacesByParent,
        getPlacesByType: getPlacesByType,
        getRootPlaces: getRootPlaces,

        getPlaceSummary: getPlaceSummary,
        getPlaceSummaries: getPlaceSummaries,
        getPlacesUsingGovernmentType: getPlacesUsingGovernmentType,
        getPlaceGovernmentSummary: getPlaceGovernmentSummary,

        getLocationTypes: getLocationTypes,
        getLocationType: getLocationType,
        getLocationTypePriority: getLocationTypePriority,
        getLocationTypeName: getLocationTypeName,

        getPlaceHierarchy: getPlaceHierarchy,
        getPlaceChildren: getPlaceChildren,
        getAllSubLocationIds: getAllSubLocationIds,
        getParentChain: getParentChain,
        getLocationAtPriority: getLocationAtPriority,
        getCountryId: getCountryId,
        getLocationCountry: getLocationCountry,
        getLocationDistrict: getLocationDistrict,
        isAncestorOf: isAncestorOf,
        areInSameCountry: areInSameCountry,
        findLowestCommonAncestor: findLowestCommonAncestor,

        getPopulationCount: getPopulationCount,
        getOwnPopulation: getOwnPopulation,

        getMoveHistory: getMoveHistory,
        getLastMove: getLastMove,
        getCurrentLocation: getCurrentLocation,
        getCurrentLocationId: getCurrentLocationId,
        getCurrentLocationName: getCurrentLocationName,
        getLocationAtYear: getLocationAtYear,

        getCurrentLeader: getCurrentLeader,
        getLeaderHistory: getLeaderHistory,
        getActiveLeaderCount: getActiveLeaderCount,
        getLeadersByLocation: getLeadersByLocation,

        searchLocations: searchLocations,
        getLocationStatistics: getLocationStatistics,
        getGlobalLocationStatistics: getGlobalLocationStatistics,
        compareLocations: compareLocations,
        getLargestLocations: getLargestLocations,
        getPopulationPerNodeRanking: getPopulationPerNodeRanking,
        getMoveStatistics: getMoveStatistics
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.LocationQueries;
    }

})();
