/**
 * =============================================================================
 * LOCATION QUERIES
 * =============================================================================
 *
 * Interpretation and composition of location-domain data.
 *
 * Owns:
 *   - Hierarchy interpretation
 *   - Search / filtering
 *   - Population analytics
 *   - Movement interpretation
 *   - Place projections (summary, government, leadership)
 *   - Cross-domain read composition (via explicit deps)
 *
 * Does NOT own:
 *   - Canonical data
 *   - Mutations
 *   - Presentation defaults (nulls stay null)
 *   - Fallback implementations of other domains
 *
 * Explicit dependencies (must exist at call time):
 *   - LocationState
 *   - CharacterQueries
 *   - TimeQueries
 *
 * Cross-domain policy:
 *   LocationQueries may compose other domains' Queries.
 *   LocationQueries may not reproduce another domain's rules.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // -------------------------------------------------------------------------
    // EXPLICIT DEPENDENCIES
    // -------------------------------------------------------------------------

    function _state() {
        if (!window.LocationState) {
            throw new Error('LocationQueries: LocationState is required');
        }
        return window.LocationState;
    }

    function _characters() {
        if (!window.CharacterQueries) {
            throw new Error('LocationQueries: CharacterQueries is required');
        }
        return window.CharacterQueries;
    }

    function _time() {
        if (!window.TimeQueries) {
            throw new Error('LocationQueries: TimeQueries is required');
        }
        return window.TimeQueries;
    }

    // -------------------------------------------------------------------------
    // BASIC PLACE QUERIES
    // -------------------------------------------------------------------------

    function getPlace(placeId) {
        return _state().getPlaceById(placeId);
    }

    function getAllPlaces(options) {
        options = options || {};
        var ids = _state().getAllPlaceIds();
        var result = [];

        for (var i = 0; i < ids.length; i++) {
            var p = _state().getPlaceById(ids[i]);
            if (!p) continue;
            if (options.includeDeprecated === false && p.status === 'deprecated') continue;
            if (options.typeId && p.typeId !== options.typeId) continue;
            if (options.status && p.status !== options.status) continue;
            result.push(p);
        }
        return result;
    }

    function getPlacesByParent(parentId, options) {
        options = options || {};
        var list = _state().getPlacesByParentId(parentId);
        if (options.includeDeprecated === false) {
            list = list.filter(function (p) { return p.status !== 'deprecated'; });
        }
        return list;
    }

    function getPlacesByType(typeId, options) {
        options = options || {};
        var list = _state().getPlacesByTypeId(typeId);
        if (options.includeDeprecated === false) {
            list = list.filter(function (p) { return p.status !== 'deprecated'; });
        }
        return list;
    }

    function getRootPlaces(options) {
        return getPlacesByParent(null, options);
    }

    // -------------------------------------------------------------------------
    // LOCATION TYPES
    // -------------------------------------------------------------------------

    function getLocationTypes() {
        var ids = _state().getAllLocationTypeIds();
        var result = [];
        for (var i = 0; i < ids.length; i++) {
            var t = _state().getLocationTypeById(ids[i]);
            if (t) result.push(t);
        }
        return result;
    }

    function getLocationType(typeId) {
        return _state().getLocationTypeById(typeId);
    }

    function getLocationTypePriority(typeId) {
        var type = _state().getLocationTypeById(typeId);
        return type ? type.priority : null;
    }

    function getLocationTypeName(typeId) {
        var type = _state().getLocationTypeById(typeId);
        return type ? type.displayName : null;
    }

    // -------------------------------------------------------------------------
    // PLACE PROJECTIONS (defensive snapshots for UI / cross-domain reads)
    // -------------------------------------------------------------------------

    /**
     * Returns a defensive summary of a place. Uses only fields that are
     * canonical on the place record. Missing fields are reported as null;
     * they are not fabricated.
     *
     * @param {string} placeId
     * @returns {Object|null}
     */
    function getPlaceSummary(placeId) {
        var place = _state().getPlaceById(placeId);
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
            variableKey: place.variableKey !== undefined ? place.variableKey : null,
            notes: place.notes !== undefined ? place.notes : null
        };
    }

    /**
     * Returns summaries for all places, optionally filtered.
     * @param {Object} [options]
     * @returns {Array}
     */
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

    /**
     * Returns places whose governmentTypeId equals the given id.
     * Used by cross-domain validation (e.g. cannot delete a government
     * type while a place still uses it).
     *
     * @param {string} governmentTypeId
     * @returns {Array<Object>}
     */
    function getPlacesUsingGovernmentType(governmentTypeId) {
        if (!governmentTypeId) return [];
        var ids = _state().getAllPlaceIds();
        var out = [];
        for (var i = 0; i < ids.length; i++) {
            var p = _state().getPlaceById(ids[i]);
            if (p && p.governmentTypeId === governmentTypeId) {
                var s = getPlaceSummary(p.id);
                if (s) out.push(s);
            }
        }
        return out;
    }

    // -------------------------------------------------------------------------
    // LEADERSHIP PROJECTIONS
    // -------------------------------------------------------------------------
    //
    // Leader assignments are stored on the place record as
    // place.leaderAssignments (canonical Location data). These queries
    // return defensive projections; they never expose the live array.
    // -------------------------------------------------------------------------

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

    /**
     * Returns the current (active) leader for a place, or null.
     *
     * @param {string} placeId
     * @returns {Object|null}
     */
    function getCurrentLeader(placeId) {
        var place = _state().getPlaceById(placeId);
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

    /**
     * Returns a place's full leadership history, most recent first.
     *
     * @param {string} placeId
     * @returns {Array}
     */
    function getLeaderHistory(placeId) {
        var place = _state().getPlaceById(placeId);
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

    /**
     * Returns the number of places that currently have an active leader.
     *
     * @returns {number}
     */
    function getActiveLeaderCount() {
        var ids = _state().getAllPlaceIds();
        var count = 0;
        for (var i = 0; i < ids.length; i++) {
            if (getCurrentLeader(ids[i])) count++;
        }
        return count;
    }

    /**
     * Returns leaders for a location and its direct children.
     *
     * @param {string} locationId
     * @returns {Array<{ placeId, placeName, leader }>}
     */
    function getLeadersByLocation(locationId) {
        var place = _state().getPlaceById(locationId);
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

        var children = _state().getPlacesByParentId(locationId);
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

    /**
     * Composite government projection for a place.
     *
     * Returns the fields a Government UI or Government query needs to
     * describe a location's government without reaching into the raw
     * place record.
     *
     * @param {string} placeId
     * @returns {Object|null}
     */
    function getPlaceGovernmentSummary(placeId) {
        var place = _state().getPlaceById(placeId);
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

    // -------------------------------------------------------------------------
    // HIERARCHY QUERIES
    // -------------------------------------------------------------------------

    function getPlaceHierarchy(placeId) {
        if (!placeId) return [];
        var chain = [];
        var seen = {};
        var current = _state().getPlaceById(placeId);
        while (current) {
            if (seen[current.id]) break;
            seen[current.id] = true;
            chain.unshift(current);
            if (!current.parentId) break;
            current = _state().getPlaceById(current.parentId);
        }
        return chain;
    }

    function getPlaceChildren(placeId, recursive) {
        var direct = _state().getPlacesByParentId(placeId);
        if (!recursive) return direct;
        var result = direct.slice();
        for (var i = 0; i < direct.length; i++) {
            result = result.concat(getPlaceChildren(direct[i].id, true));
        }
        return result;
    }

    function getAllSubLocationIds(locationId) {
        var result = [locationId];
        var children = getPlaceChildren(locationId, true);
        for (var i = 0; i < children.length; i++) result.push(children[i].id);
        return result;
    }

    function getParentChain(placeId) {
        var chain = getPlaceHierarchy(placeId);
        return chain.slice(0, -1);
    }

    function getLocationAtPriority(placeId, targetPriority) {
        var chain = getPlaceHierarchy(placeId);
        for (var i = chain.length - 1; i >= 0; i--) {
            var p = chain[i];
            if (getLocationTypePriority(p.typeId) === targetPriority) return p;
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
        var country = _state().getPlaceById(countryId);
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
        if (placeId1 === placeId2) return _state().getPlaceById(placeId1);
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

    // -------------------------------------------------------------------------
    // POPULATION
    // -------------------------------------------------------------------------

    function getPopulationCount(locationId, includeDeceased) {
        includeDeceased = includeDeceased === true;

        var ids = getAllSubLocationIds(locationId);
        var idSet = {};
        for (var i = 0; i < ids.length; i++) idSet[ids[i]] = true;

        var chars = _characters().getAllCharacters();
        var count = 0;
        for (var j = 0; j < chars.length; j++) {
            var c = chars[j];
            if (!includeDeceased && c.isDeceased) continue;
            var locId = _characters().getCurrentLocationId(c.id);
            if (locId && idSet[locId]) count++;
        }
        return count;
    }

    function getOwnPopulation(locationId, includeDeceased) {
        includeDeceased = includeDeceased === true;
        var chars = _characters().getAllCharacters();
        var count = 0;
        for (var i = 0; i < chars.length; i++) {
            var c = chars[i];
            if (!includeDeceased && c.isDeceased) continue;
            var locId = _characters().getCurrentLocationId(c.id);
            if (locId === locationId) count++;
        }
        return count;
    }

    // -------------------------------------------------------------------------
    // MOVEMENT
    // -------------------------------------------------------------------------

    function getMoveHistory(characterId) {
        return _characters().getMoveHistory(characterId);
    }

    function getLastMove(characterId) {
        var moves = _characters().getMoveHistory(characterId);
        return moves.length === 0 ? null : moves[moves.length - 1];
    }

    function getCurrentLocation(characterId) {
        var locId = _characters().getCurrentLocationId(characterId);
        if (!locId) return null;
        var place = _state().getPlaceById(locId);
        return place ? { id: place.id, name: place.displayName } : { id: locId, name: null };
    }

    function getCurrentLocationId(characterId) {
        return _characters().getCurrentLocationId(characterId);
    }

    function getCurrentLocationName(characterId) {
        var loc = getCurrentLocation(characterId);
        return loc ? loc.name : null;
    }

    function getLocationAtYear(characterId, year) {
        var moves = _characters().getMoveHistory(characterId);
        var result = null;
        for (var i = 0; i < moves.length; i++) {
            var m = moves[i];
            if (m.year === null || m.year === undefined) continue;
            if (m.year <= year) result = m;
            else break;
        }
        return result ? result.locationName : null;
    }

    // -------------------------------------------------------------------------
    // SEARCH
    // -------------------------------------------------------------------------

    function searchLocations(options) {
        options = options || {};
        var places = getAllPlaces({ includeDeprecated: options.includeDeprecated === true });
        var results = [];

        for (var i = 0; i < places.length; i++) {
            var p = places[i];
            var match = true;

            if (options.search) {
                var lower = options.search.toLowerCase();
                var nameMatch = p.displayName && p.displayName.toLowerCase().indexOf(lower) !== -1;
                var keyMatch = p.variableKey && p.variableKey.toLowerCase().indexOf(lower) !== -1;
                if (!nameMatch && !keyMatch) match = false;
            }
            if (match && options.typeId && p.typeId !== options.typeId) match = false;
            if (match && options.parentId !== undefined && p.parentId !== options.parentId) match = false;
            if (match && options.status && p.status !== options.status) match = false;
            if (match && options.isCapital !== undefined && !!p.isCapital !== options.isCapital) match = false;

            if (match && options.hasChildren !== undefined) {
                var kids = getPlaceChildren(p.id, false);
                if ((kids.length > 0) !== options.hasChildren) match = false;
            }
            if (match) results.push(p);
        }

        if (options.sortBy) {
            var order = options.sortOrder === 'desc' ? -1 : 1;
            results.sort(function (a, b) {
                var cmp = 0;
                switch (options.sortBy) {
                    case 'name': cmp = (a.displayName || '').localeCompare(b.displayName || ''); break;
                    case 'type': cmp = (getLocationTypeName(a.typeId) || '').localeCompare(getLocationTypeName(b.typeId) || ''); break;
                    case 'createdAt': cmp = (a.createdAt || 0) - (b.createdAt || 0); break;
                    case 'updatedAt': cmp = (a.updatedAt || 0) - (b.updatedAt || 0); break;
                    default: cmp = (a.displayName || '').localeCompare(b.displayName || '');
                }
                return cmp * order;
            });
        }

        if (options.limit !== undefined && options.limit !== null) {
            results = results.slice(0, options.limit);
        }
        return results;
    }

    // -------------------------------------------------------------------------
    // STATISTICS
    // -------------------------------------------------------------------------

    function getLocationStatistics(locationId) {
        var place = _state().getPlaceById(locationId);
        if (!place) return null;

        var directChildren = getPlaceChildren(locationId, false);
        var allChildren = getPlaceChildren(locationId, true);
        var hierarchy = getPlaceHierarchy(locationId);
        var parent = place.parentId ? _state().getPlaceById(place.parentId) : null;

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
            variableKey: place.variableKey === undefined ? null : place.variableKey,
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
            if (getPlaceChildren(p.id, false).length > 0) stats.withChildren++;

            stats.totalPopulation += getPopulationCount(p.id, false);

            var prio = getLocationTypePriority(p.typeId);
            stats.typeCounts[prio] = (stats.typeCounts[prio] || 0) + 1;
        }

        return stats;
    }

    // -------------------------------------------------------------------------
    // COMPARISON
    // -------------------------------------------------------------------------

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

    // -------------------------------------------------------------------------
    // RANKINGS
    // -------------------------------------------------------------------------

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
        return limit === undefined || limit === null ? rows : rows.slice(0, limit);
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
        rows.sort(function (a, b) { return b.populationPerNode - a.populationPerNode; });
        return limit === undefined || limit === null ? rows : rows.slice(0, limit);
    }

    // -------------------------------------------------------------------------
    // MOVEMENT ANALYTICS
    // -------------------------------------------------------------------------

    function getMoveStatistics(characterId) {
        var moves = _characters().getMoveHistory(characterId);
        var character = _characters().getCharacterById(characterId);
        if (!character) return null;

        var byLocation = {};
        var byDecade = {};
        var unique = {};

        for (var i = 0; i < moves.length; i++) {
            var m = moves[i];
            if (m.locationId) unique[m.locationId] = true;
            var key = m.locationId === null || m.locationId === undefined ? null : m.locationId;
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
            if (a === null || a === undefined || b === null || b === undefined) continue;
            totalSpan += Math.abs(b - a);
            validIntervals++;
        }

        return {
            characterId: characterId,
            totalMoves: moves.length,
            uniqueLocations: Object.keys(unique).length,
            averageYearsBetweenMoves: validIntervals > 0 ? Math.round((totalSpan / validIntervals) * 10) / 10 : null,
            byLocation: byLocation,
            byDecade: byDecade
        };
    }

    // -------------------------------------------------------------------------
    // EXPORTS
    // -------------------------------------------------------------------------

    window.LocationQueries = {
        // Basic place
        getPlace: getPlace,
        getAllPlaces: getAllPlaces,
        getPlacesByParent: getPlacesByParent,
        getPlacesByType: getPlacesByType,
        getRootPlaces: getRootPlaces,

        // Place projections
        getPlaceSummary: getPlaceSummary,
        getPlaceSummaries: getPlaceSummaries,
        getPlacesUsingGovernmentType: getPlacesUsingGovernmentType,
        getPlaceGovernmentSummary: getPlaceGovernmentSummary,

        // Types
        getLocationTypes: getLocationTypes,
        getLocationType: getLocationType,
        getLocationTypePriority: getLocationTypePriority,
        getLocationTypeName: getLocationTypeName,

        // Hierarchy
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

        // Population
        getPopulationCount: getPopulationCount,
        getOwnPopulation: getOwnPopulation,

        // Movement
        getMoveHistory: getMoveHistory,
        getLastMove: getLastMove,
        getCurrentLocation: getCurrentLocation,
        getCurrentLocationId: getCurrentLocationId,
        getCurrentLocationName: getCurrentLocationName,
        getLocationAtYear: getLocationAtYear,

        // Leadership
        getCurrentLeader: getCurrentLeader,
        getLeaderHistory: getLeaderHistory,
        getActiveLeaderCount: getActiveLeaderCount,
        getLeadersByLocation: getLeadersByLocation,

        // Search / analytics
        searchLocations: searchLocations,
        getLocationStatistics: getLocationStatistics,
        getGlobalLocationStatistics: getGlobalLocationStatistics,
        compareLocations: compareLocations,
        getLargestLocations: getLargestLocations,
        getPopulationPerNodeRanking: getPopulationPerNodeRanking,
        getMoveStatistics: getMoveStatistics
    };

})();
