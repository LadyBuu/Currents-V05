/**
 * =============================================================================
 * STILL WATERS - WORLD SYSTEM (world.js) - PURE QUERY LAYER
 * =============================================================================
 *
 * LOCATION: js/core/world.js
 *
 * PURE read-only queries over canonical location data. Uses ONLY accessors.
 *
 * SCOPE:
 *   - Location hierarchy queries (parents, children, ancestors)
 *   - Location type / priority / scope resolution
 *   - Country and district resolution for places and characters
 *   - Current-location resolution from character.moves
 *   - Character grouping by location (using stable IDs, not display strings)
 *   - Location population count (demographic queries)
 *
 * OUT OF SCOPE:
 *   - Display strings ("Unknown", "Other Locations", breadcrumbs with arrows)
 *     → see formatting.js / location-presentation.js
 *   - Mutation of moves → character-commands / location-movement
 *   - Selected-location UI state → SettlementState / LocationState
 *   - Cycle repair → integrity.js
 *
 * SEMANTIC RULES:
 *   - Missing/invalid IDs return null (singular) or [] (collection).
 *   - Priority 0 is valid.
 *   - Recursion is bounded by Set-based cycle detection, not magic depths.
 *   - Grouping keys are stable location IDs, not display strings.
 *   - Current-location resolution is deterministic; ties break by first
 *     record in the moves array.
 *   - This module does NOT repair malformed hierarchies. Integrity reports
 *     cycles; this module refuses to traverse them.
 *
 * DANGING LOCATION REFERENCES:
 *   getCurrentLocationId() may return an ID that no longer resolves to a
 *   place. This is intentional: the ID reflects what the character record
 *   says, not what the world currently contains. getCurrentPlace() returns
 *   null when the reference is dangling. Callers who need to distinguish
 *   "no location recorded" from "recorded location missing" should use the
 *   two functions separately.
 *
 *   An explicit character.currentLocationId override takes precedence even
 *   when its target is missing. See getCurrentLocationId().
 *
 * HIERARCHY SCOPE vs PRIORITY:
 *   Location types declare a `locationScope` field ('country', 'region',
 *   'district', 'locality', or similar) that denotes their semantic
 *   position in a hierarchy. Separately, they may declare `priority` for
 *   sort ordering. This module uses `locationScope` when it needs semantic
 *   hierarchy levels and `priority` when it needs sort order. Do not
 *   conflate the two.
 *
 *   Types without `locationScope` are treated as scope-less: they can
 *   still be part of a hierarchy (via parentId), but they are not
 *   recognized as a country, district, etc.
 *
 * POPULATION QUERIES:
 *   getLocationPopulationCount(locationId, options) counts characters
 *   whose resolved current location is the given location or (by default)
 *   any location in its subtree.
 *
 *   Resolution uses getCharactersGroupedByLocation internally: each
 *   character's current place is resolved once, then grouped by place
 *   id. The count is the sum of groups whose place id equals the target
 *   or appears in the target's descendant set (computed via
 *   getChildPlaces(locationId, true)).
 *
 *   Options:
 *     includeDescendants  default true
 *       When true, counts the target location AND every descendant.
 *       When false, counts only characters whose current place IS the
 *       target location.
 *
 *     aliveOnly           default false
 *       When true, excludes characters with isDeceased === true.
 *       The grouping is done with includeDeceased=false when set, so
 *       the filter is applied at the source rather than post-sum.
 *
 *   Return value:
 *     number   count of matching characters (0 is a real answer)
 *     null     locationId is not a valid string, or the target place
 *              does not exist
 *
 *   The function returns a NUMBER, not a projection. Callers that need
 *   the underlying character IDs must use getCharactersGroupedByLocation
 *   directly, or getCharactersInLocations from character-queries.js.
 *
 * SHADOWING BY locationDropdown.js:
 *   This module exports:
 *     window.getLocationCountry(place)     — accepts a PLACE OBJECT.
 *     window.getLocationDistrict(place)    — accepts a PLACE OBJECT.
 *
 *   js/selectors/locationDropdown.js also exports functions with the
 *   same names, but accepting a PLACE OBJECT OR A PLACE ID STRING.
 *   Under the documented load order (world.js before selectors), the
 *   selector's version loads LAST and OVERWRITES these exports on
 *   window.
 *
 *   The runtime winner is therefore the SELECTOR's version. That
 *   version delegates to THIS module's version for place-object
 *   inputs, so behaviour is identical to what this module provides.
 *   For id-string inputs, the selector's version resolves the place
 *   first, then delegates to this module's version — a strict
 *   extension, not a conflict.
 *
 *   Consequences for callers:
 *     - If you only have a place object, call
 *       window.getLocationCountry(place) and forget about this
 *       shadowing note. The result is identical regardless of which
 *       version is currently on window.
 *     - If you have a place id and want to avoid depending on the
 *       selector file being loaded, call
 *       window.getPlaceById(id) first, then pass the place object.
 *       This works regardless of load order.
 *     - If you want to reach THIS module's version directly
 *       (bypassing the selector), there is no stable name for it.
 *       This module's exports ARE the window globals; there is no
 *       `World.getLocationCountry` namespace. If a future refactor
 *       needs a stable module-private reference, add a namespace
 *       export; do not rely on capturing the function before the
 *       selector overwrites it.
 *
 *   This shadowing is intentional and documented from both sides. See
 *   the SHADOWING section in js/selectors/locationDropdown.js for the
 *   other side of the contract.
 *
 *   A caller who reaches for window.getLocationCountry at runtime
 *   should assume the SUPERSET contract (accepts place OR id). Do not
 *   assume the world.js signature (place only) unless you have
 *   verified the load order excludes locationDropdown.js.
 *
 * DEPENDENCIES (all REQUIRED):
 *   - accessors.js: getPlaces, getPlaceById, getLocationTypeById, getCharacters
 *   - time.js:      isValidYear
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - Header SHADOWING BY locationDropdown.js section added.
 *       Documents that js/selectors/locationDropdown.js overwrites
 *       window.getLocationCountry and window.getLocationDistrict
 *       under the documented load order, that the selector's version
 *       is a strict superset (accepts place OR id), and that callers
 *       should treat the runtime global as the superset contract.
 *     - Inline docstrings on getLocationCountry and
 *       getLocationDistrict updated to reflect the runtime contract
 *       (place OR id after selectors load).
 *     - No behavioural change. Every function's logic is unchanged.
 *   Previous revision:
 *     - Added getLocationPopulationCount(locationId, options).
 *       education-queries.js requires this function (per its
 *       LOCATION RESOLUTION section) and previously threw for
 *       getEducationHealthScore, recommendNewSchoolLocations,
 *       getEducationDemandBySettlement, and
 *       getStudentDensityBySettlement because the primitive did not
 *       exist. See POPULATION QUERIES in the header.
 *     - Header POPULATION QUERIES section added.
 *     - No behavioural change to any existing function.
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. DEPENDENCY GUARDS
    // =========================================================================

    function _requireAccessors() {
        var required = [
            'getPlaces',
            'getPlaceById',
            'getLocationTypeById',
            'getCharacters'
        ];
        var missing = [];
        for (var i = 0; i < required.length; i++) {
            if (typeof window[required[i]] !== 'function') {
                missing.push(required[i]);
            }
        }
        if (missing.length > 0) {
            throw new Error('world.js: missing required dependencies: ' + missing.join(', '));
        }
    }

    function _requireTime() {
        if (typeof window.isValidYear !== 'function') {
            throw new Error(
                'world.js: time.js must load first (isValidYear missing).'
            );
        }
    }

    function _requireAll() {
        _requireAccessors();
        _requireTime();
    }

    _requireAll();

    // =========================================================================
    // 1. INTERNAL WRAPPERS
    // =========================================================================

    function _getPlaces() {
        return window.getPlaces();
    }

    function _getPlaceById(id) {
        return window.getPlaceById(id);
    }

    function _getLocationTypeById(id) {
        return window.getLocationTypeById(id);
    }

    function _getCharacters() {
        return window.getCharacters();
    }

    function _hasId(id) {
        return typeof id === 'string' && id.length > 0;
    }

    function _isMissing(v) {
        return v === undefined || v === null;
    }

    /**
     * Returns a numeric priority for a location type, or null if the type
     * is missing or has no valid priority. Preserves explicit 0.
     */
    function _typePriority(type) {
        if (!type) return null;
        var p = type.priority;
        if (typeof p === 'number' && Number.isFinite(p)) return p;
        return null;
    }

    /**
     * Returns the semantic scope string for a location type, or null if
     * the type has no declared scope.
     */
    function _typeScope(type) {
        if (!type) return null;
        var scope = type.locationScope;
        if (typeof scope === 'string' && scope.length > 0) return scope;
        return null;
    }

    // =========================================================================
    // 2. LOCATION TYPE QUERIES
    // =========================================================================

    function getLocationTypePriority(typeId) {
        if (!_hasId(typeId)) return null;
        return _typePriority(_getLocationTypeById(typeId));
    }

    function getPlacePriority(place) {
        if (!place) return null;
        return getLocationTypePriority(place.typeId);
    }

    function getLocationTypeScope(typeId) {
        if (!_hasId(typeId)) return null;
        return _typeScope(_getLocationTypeById(typeId));
    }

    function getPlaceScope(place) {
        if (!place) return null;
        return getLocationTypeScope(place.typeId);
    }

    // =========================================================================
    // 3. HIERARCHY QUERIES
    // =========================================================================

    function getChildPlaces(parentId, recursive) {
        if (!_hasId(parentId)) return [];
        recursive = recursive === true;

        var places = _getPlaces();

        if (!recursive) {
            var direct = [];
            for (var i = 0; i < places.length; i++) {
                if (places[i].parentId === parentId) {
                    direct.push(places[i]);
                }
            }
            return direct;
        }

        var visited = new Set();
        visited.add(parentId);

        var resultIds = new Set();
        var result = [];
        var stack = [parentId];

        while (stack.length > 0) {
            var currentId = stack.pop();

            for (var j = 0; j < places.length; j++) {
                var child = places[j];
                if (child.parentId !== currentId) continue;
                if (!_hasId(child.id)) continue;
                if (resultIds.has(child.id)) continue;

                resultIds.add(child.id);
                result.push(child);

                if (!visited.has(child.id)) {
                    visited.add(child.id);
                    stack.push(child.id);
                }
            }
        }

        return result;
    }

    function getTopLevelPlaces() {
        var places = _getPlaces();
        var result = [];
        for (var i = 0; i < places.length; i++) {
            var p = places[i];
            if (_isMissing(p.parentId)) {
                result.push(p);
            }
        }
        return result;
    }

    function getPlacesByPriority(priority) {
        if (typeof priority !== 'number' || !Number.isFinite(priority)) return [];
        var places = _getPlaces();
        var result = [];
        for (var i = 0; i < places.length; i++) {
            if (getPlacePriority(places[i]) === priority) {
                result.push(places[i]);
            }
        }
        return result;
    }

    function getPlacesByScope(scope) {
        if (typeof scope !== 'string' || scope.length === 0) return [];
        var places = _getPlaces();
        var result = [];
        for (var i = 0; i < places.length; i++) {
            if (getPlaceScope(places[i]) === scope) {
                result.push(places[i]);
            }
        }
        return result;
    }

    // =========================================================================
    // 4. PATH QUERIES
    // =========================================================================

    function getParentChain(place) {
        if (!place || !_hasId(place.id)) return [];

        var chain = [];
        var current = place;
        var seen = new Set();

        while (current) {
            if (!_hasId(current.id)) break;
            if (seen.has(current.id)) break;
            seen.add(current.id);
            chain.unshift(current);

            if (_isMissing(current.parentId)) break;
            current = _getPlaceById(current.parentId);
        }
        return chain;
    }

    function isAncestorOf(possibleAncestor, place) {
        if (!possibleAncestor || !_hasId(possibleAncestor.id)) return false;
        if (!place || !_hasId(place.id)) return false;
        if (possibleAncestor.id === place.id) return false;

        var current = place;
        var seen = new Set();
        while (current && _hasId(current.id)) {
            if (seen.has(current.id)) break;
            seen.add(current.id);

            if (current.parentId === possibleAncestor.id) return true;

            if (_isMissing(current.parentId)) break;
            current = _getPlaceById(current.parentId);
        }
        return false;
    }

    /**
     * Returns the country-scoped ancestor of `place`, or null.
     *
     * RUNTIME CONTRACT (post-load-order): under the documented load
     * order, js/selectors/locationDropdown.js overwrites this export
     * with a superset version that also accepts a place id string.
     * Callers reaching the global at runtime should assume the
     * superset contract. See SHADOWING BY locationDropdown.js in the
     * module header.
     *
     * This module's version accepts only place objects.
     */
    function getLocationCountry(place) {
        if (!place) return null;
        var chain = getParentChain(place);
        for (var i = 0; i < chain.length; i++) {
            if (getPlaceScope(chain[i]) === 'country') {
                return chain[i];
            }
        }
        return null;
    }

    /**
     * Returns the district-scoped ancestor of `place`, or null.
     *
     * RUNTIME CONTRACT (post-load-order): under the documented load
     * order, js/selectors/locationDropdown.js overwrites this export
     * with a superset version that also accepts a place id string.
     * Callers reaching the global at runtime should assume the
     * superset contract. See SHADOWING BY locationDropdown.js in the
     * module header.
     *
     * This module's version accepts only place objects.
     */
    function getLocationDistrict(place) {
        if (!place) return null;
        var chain = getParentChain(place);
        for (var i = 0; i < chain.length; i++) {
            if (getPlaceScope(chain[i]) === 'district') {
                return chain[i];
            }
        }
        return null;
    }

    // =========================================================================
    // 5. COUNTRY RESOLUTION HELPERS
    // =========================================================================

    function getCountryPlaces() {
        return getPlacesByScope('country');
    }

    function getCountryIdForPlace(placeId) {
        if (!_hasId(placeId)) return null;
        var place = _getPlaceById(placeId);
        if (!place) return null;
        var country = getLocationCountry(place);
        return country ? country.id : null;
    }

    function getCharacterCountryId(characterId) {
        if (!_hasId(characterId)) return null;

        if (typeof window.getCharacterById !== 'function') return null;
        var character = window.getCharacterById(characterId);
        if (!character) return null;

        var locationId = getCurrentLocationId(character);
        if (_hasId(locationId)) {
            var countryId = getCountryIdForPlace(locationId);
            if (countryId) return countryId;
        }

        if (_hasId(character.birthplaceId)) {
            var birthplaceCountryId = getCountryIdForPlace(character.birthplaceId);
            if (birthplaceCountryId) return birthplaceCountryId;
        }

        return null;
    }

    function getCharacterCountry(characterId) {
        var countryId = getCharacterCountryId(characterId);
        if (!countryId) return null;
        return _getPlaceById(countryId);
    }

    // =========================================================================
    // 6. CURRENT-LOCATION RESOLUTION
    // =========================================================================

    function _isValidMoveYear(year) {
        return window.isValidYear(year);
    }

    function getCurrentLocationId(character) {
        if (!character) return null;

        if (_hasId(character.currentLocationId)) {
            return character.currentLocationId;
        }

        if (Array.isArray(character.moves) && character.moves.length > 0) {
            var best = null;
            var bestYear = -Infinity;

            for (var i = 0; i < character.moves.length; i++) {
                var move = character.moves[i];
                if (!move || !_hasId(move.locationId)) continue;
                if (!_isValidMoveYear(move.year)) continue;

                if (move.year > bestYear) {
                    bestYear = move.year;
                    best = move;
                }
            }

            if (best) return best.locationId;
        }

        if (_hasId(character.birthplaceId)) {
            return character.birthplaceId;
        }

        return null;
    }

    function getCurrentPlace(character) {
        var id = getCurrentLocationId(character);
        if (!id) return null;
        return _getPlaceById(id);
    }

    function getCharacterLocationPath(character) {
        var place = getCurrentPlace(character);
        if (!place) return [];

        var chain = getParentChain(place);
        var path = [];
        for (var i = 0; i < chain.length; i++) {
            var p = chain[i];
            path.push({
                id: p.id,
                typeId: p.typeId,
                priority: getLocationTypePriority(p.typeId),
                scope: getLocationTypeScope(p.typeId)
            });
        }
        return path;
    }

    function getCharactersGroupedByLocation(includeDeceased) {
        includeDeceased = includeDeceased === true;

        var characters = _getCharacters();
        var groupsByLocationId = new Map();
        var ungrouped = [];

        for (var i = 0; i < characters.length; i++) {
            var char = characters[i];
            if (!includeDeceased && char.isDeceased === true) continue;

            var place = getCurrentPlace(char);
            if (!place) {
                ungrouped.push(char);
                continue;
            }

            if (!groupsByLocationId.has(place.id)) {
                groupsByLocationId.set(place.id, { place: place, characters: [] });
            }
            groupsByLocationId.get(place.id).characters.push(char);
        }

        var groups = [];
        groupsByLocationId.forEach(function(entry, locationId) {
            groups.push({
                locationId: locationId,
                place: entry.place,
                characters: entry.characters
            });
        });

        function pathKey(place) {
            var chain = getParentChain(place);
            var ids = [];
            for (var k = 0; k < chain.length; k++) ids.push(chain[k].id);
            return ids.join('/');
        }

        groups.sort(function(a, b) {
            var chainA = getParentChain(a.place);
            var chainB = getParentChain(b.place);
            if (chainA.length !== chainB.length) {
                return chainA.length - chainB.length;
            }
            var ka = pathKey(a.place);
            var kb = pathKey(b.place);
            return ka < kb ? -1 : (ka > kb ? 1 : 0);
        });

        if (ungrouped.length > 0) {
            groups.push({
                locationId: null,
                place: null,
                characters: ungrouped
            });
        }

        return groups;
    }

    // =========================================================================
    // 7. POPULATION QUERIES
    // =========================================================================
    //
    // See POPULATION QUERIES in the header.
    //
    // getLocationPopulationCount(locationId, options) counts characters
    // whose resolved current location is the given location or (by default)
    // any location in its subtree.
    //
    // Implementation note: uses getCharactersGroupedByLocation to avoid a
    // second pass over characters. The grouping function already resolves
    // each character's current place exactly once; the count sums the
    // groups whose place is in the target set. That is O(characters) +
    // O(places) for the descendant walk, not O(characters × places).

    /**
     * Counts the characters whose current location is the given place
     * (or, when includeDescendants is true, any place in its subtree).
     *
     * @param {string} locationId
     * @param {Object} [options]
     * @param {boolean} [options.includeDescendants=true]
     * @param {boolean} [options.aliveOnly=false]
     * @returns {number|null}
     *   number  count of matching characters (0 is a real answer)
     *   null    locationId is not a valid string, or the target place
     *           does not exist
     */
    function getLocationPopulationCount(locationId, options) {
        if (!_hasId(locationId)) return null;

        var place = _getPlaceById(locationId);
        if (!place) return null;

        options = options || {};
        var includeDescendants = options.includeDescendants !== false;
        var aliveOnly = options.aliveOnly === true;

        // Build the target location id set.
        var targetIds = new Set();
        targetIds.add(locationId);

        if (includeDescendants) {
            var children = getChildPlaces(locationId, true);
            for (var i = 0; i < children.length; i++) {
                if (children[i] && _hasId(children[i].id)) {
                    targetIds.add(children[i].id);
                }
            }
        }

        // getCharactersGroupedByLocation resolves each character's
        // current place exactly once. When aliveOnly is set, the
        // grouping function's includeDeceased=false filter runs first,
        // so we do not pay for deceased characters that we would then
        // filter out.
        var groups = getCharactersGroupedByLocation(aliveOnly ? false : true);

        var count = 0;
        for (var g = 0; g < groups.length; g++) {
            var group = groups[g];
            if (!group || !group.locationId) continue;
            if (!targetIds.has(group.locationId)) continue;
            count += group.characters.length;
        }

        return count;
    }

    // =========================================================================
    // 8. EXPORTS
    // =========================================================================

    // Type / priority / scope
    window.getLocationTypePriority = getLocationTypePriority;
    window.getPlacePriority = getPlacePriority;
    window.getLocationTypeScope = getLocationTypeScope;
    window.getPlaceScope = getPlaceScope;

    // Hierarchy
    window.getChildPlaces = getChildPlaces;
    window.getTopLevelPlaces = getTopLevelPlaces;
    window.getPlacesByPriority = getPlacesByPriority;
    window.getPlacesByScope = getPlacesByScope;

    // Path and ancestry
    window.getParentChain = getParentChain;
    window.isAncestorOf = isAncestorOf;

    // Country/district resolution — NOTE: these exports are shadowed
    // by js/selectors/locationDropdown.js under the documented load
    // order. See SHADOWING BY locationDropdown.js in the module header.
    window.getLocationCountry = getLocationCountry;
    window.getLocationDistrict = getLocationDistrict;

    // Country resolution helpers
    window.getCountryPlaces = getCountryPlaces;
    window.getCountryIdForPlace = getCountryIdForPlace;
    window.getCharacterCountryId = getCharacterCountryId;
    window.getCharacterCountry = getCharacterCountry;

    // Current location
    window.getCurrentLocationId = getCurrentLocationId;
    window.getCurrentPlace = getCurrentPlace;
    window.getCharacterLocationPath = getCharacterLocationPath;
    window.getCharactersGroupedByLocation = getCharactersGroupedByLocation;

    // Population
    window.getLocationPopulationCount = getLocationPopulationCount;

})();
