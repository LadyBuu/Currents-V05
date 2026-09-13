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
 *   - Location type / priority resolution
 *   - Current-location resolution from character.moves
 *   - Character grouping by location (using stable IDs, not display strings)
 * 
 * OUT OF SCOPE:
 *   - Display strings ("Unknown", "Other Locations", breadcrumbs with arrows)
 *     → see formatting.js / location-presentation.js
 *   - Mutation of moves → character-commands / location-movement
 *   - Selected-location UI state → SettlementState / LocationState
 * 
 * SEMANTIC RULES:
 *   - Missing/invalid IDs return null.
 *   - Priority 0 is valid.
 *   - Recursion is bounded by Set-based cycle detection, not magic depths.
 *   - Grouping keys are stable location IDs, not display strings.
 *   - Current-location resolution is deterministic; ties break by first
 *     record in the moves array.
 * 
 * DEPENDENCIES (all REQUIRED):
 *   - accessors.js: getPlaces, getPlaceById, getLocationTypeById, getCharacters
 *   - time.js: isValidYear (for move year validation) — optional if you
 *     don't require strict year validation here
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

    // =========================================================================
    // 1. INTERNAL WRAPPERS
    // =========================================================================

    function _getPlaces() {
        _requireAccessors();
        return window.getPlaces();
    }

    function _getPlaceById(id) {
        _requireAccessors();
        return window.getPlaceById(id);
    }

    function _getLocationTypeById(id) {
        _requireAccessors();
        return window.getLocationTypeById(id);
    }

    function _getCharacters() {
        _requireAccessors();
        return window.getCharacters();
    }

    /**
     * Returns a numeric priority for a location type, or null if the type
     * is missing or has no valid priority.
     * Preserves explicit 0.
     * @private
     */
    function _typePriority(type) {
        if (!type) return null;
        var p = type.priority;
        if (typeof p === 'number' && Number.isFinite(p)) return p;
        return null;
    }

    /**
     * Sort comparator mapping null priorities to the end.
     * @private
     */
    function _compareByPriority(a, b) {
        var pa = (a === null || a === undefined) ? Infinity : a;
        var pb = (b === null || b === undefined) ? Infinity : b;
        return pa - pb;
    }

    // =========================================================================
    // 2. LOCATION TYPE / PRIORITY QUERIES
    // =========================================================================

    /**
     * Gets the priority of a location type by ID.
     * Returns null for missing type or missing priority.
     * 
     * @param {string} typeId
     * @returns {number|null}
     */
    function getLocationTypePriority(typeId) {
        if (typeof typeId !== 'string' || typeId.length === 0) return null;
        var type = _getLocationTypeById(typeId);
        return _typePriority(type);
    }

    /**
     * Gets the priority of a place.
     * Returns null for missing place or missing priority.
     */
    function getPlacePriority(place) {
        if (!place) return null;
        return getLocationTypePriority(place.typeId);
    }

    // =========================================================================
    // 3. HIERARCHY QUERIES
    // =========================================================================

    /**
     * Gets direct children of a place.
     * If `recursive`, walks the full subtree using an iterative stack with
     * a visited set (no magic depth limit).
     * 
     * @param {string} parentId
     * @param {boolean} [recursive]
     * @returns {Array}
     */
    function getChildPlaces(parentId, recursive) {
        if (typeof parentId !== 'string' || parentId.length === 0) return [];
        recursive = recursive === true;

        var places = _getPlaces();
        var result = [];

        if (!recursive) {
            for (var i = 0; i < places.length; i++) {
                if (places[i].parentId === parentId) {
                    result.push(places[i]);
                }
            }
            return result;
        }

        // Recursive: iterative traversal with cycle guard
        var visited = new Set();
        var stack = [parentId];

        while (stack.length > 0) {
            var currentId = stack.pop();
            if (visited.has(currentId)) continue;
            visited.add(currentId);

            for (var j = 0; j < places.length; j++) {
                if (places[j].parentId === currentId) {
                    result.push(places[j]);
                    if (!visited.has(places[j].id)) {
                        stack.push(places[j].id);
                    }
                }
            }
        }
        return result;
    }

    /**
     * Gets top-level places (no parent).
     * Uses explicit missing check (not truthiness).
     */
    function getTopLevelPlaces() {
        var places = _getPlaces();
        var result = [];
        for (var i = 0; i < places.length; i++) {
            var p = places[i];
            if (p.parentId === null || p.parentId === undefined) {
                result.push(p);
            }
        }
        return result;
    }

    /**
     * Gets places by priority.
     * @param {number} priority
     * @returns {Array}
     */
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

    // =========================================================================
    // 4. PATH QUERIES
    // =========================================================================

    /**
     * Gets the full parent chain for a place, ordered root → leaf.
     * Includes the place itself.
     * 
     * Cycle guard uses a Set; no arbitrary depth limit.
     * 
     * @param {Object} place
     * @returns {Array}
     */
    function getParentChain(place) {
        if (!place) return [];
        var chain = [];
        var current = place;
        var seen = new Set();

        while (current) {
            if (seen.has(current.id)) break;
            seen.add(current.id);
            chain.unshift(current);
            if (!current.parentId) break;
            current = _getPlaceById(current.parentId);
        }
        return chain;
    }

    /**
     * True if `possibleAncestor` appears in the parent chain of `place`.
     */
    function isAncestorOf(possibleAncestor, place) {
        if (!possibleAncestor || !place) return false;
        if (possibleAncestor.id === place.id) return false;

        var current = place;
        var seen = new Set();
        while (current) {
            if (seen.has(current.id)) break;
            seen.add(current.id);
            if (current.parentId === possibleAncestor.id) return true;
            current = _getPlaceById(current.parentId);
        }
        return false;
    }

    /**
     * Gets the country-level ancestor of a place.
     * 
     * Resolution:
     *   1. Highest ancestor with location type priority === 1
     *   2. Otherwise the topmost ancestor
     * 
     * Returns the place object or null. Presentation decides how to display
     * a missing country.
     * 
     * @param {Object} place
     * @returns {Object|null}
     */
    function getLocationCountry(place) {
        if (!place) return null;
        var chain = getParentChain(place);
        if (chain.length === 0) return null;

        for (var i = 0; i < chain.length; i++) {
            if (getLocationTypePriority(chain[i].typeId) === 1) {
                return chain[i];
            }
        }
        return chain[0];
    }

    /**
     * Gets the district-level ancestor of a place, if any.
     * Returns the place object or null.
     */
    function getLocationDistrict(place) {
        if (!place) return null;
        var chain = getParentChain(place);
        for (var i = 0; i < chain.length; i++) {
            if (getLocationTypePriority(chain[i].typeId) === 2) {
                return chain[i];
            }
        }
        return null;
    }

    // =========================================================================
    // 5. CURRENT-LOCATION RESOLUTION
    // =========================================================================
    // 
    // A character's current location is resolved in this order:
    //   1. `character.currentLocationId` (explicit override)
    //   2. Latest valid move in `character.moves` (highest year; ties break
    //      by first-encountered in array order)
    //   3. `character.birthplaceId` (documented fallback)
    // 
    // Moves with invalid years (non-integer, non-finite, out of range) are
    // skipped. If all moves have invalid years, falls back to birthplace.
    // 
    // If you later add an explicit ordering field to moves, replace the
    // tie-break rule accordingly.
    // =========================================================================

    function _isValidMoveYear(year) {
        if (typeof window.isValidYear === 'function') {
            return window.isValidYear(year);
        }
        return typeof year === 'number' && Number.isFinite(year) && Number.isInteger(year);
    }

    /**
     * Gets the current location ID for a character.
     * @param {Object} character
     * @returns {string|null}
     */
    function getCurrentLocationId(character) {
        if (!character) return null;

        if (typeof character.currentLocationId === 'string' && character.currentLocationId.length > 0) {
            return character.currentLocationId;
        }

        if (Array.isArray(character.moves) && character.moves.length > 0) {
            var best = null;
            var bestYear = -Infinity;

            for (var i = 0; i < character.moves.length; i++) {
                var move = character.moves[i];
                if (!move || typeof move.locationId !== 'string' || move.locationId.length === 0) {
                    continue;
                }
                if (!_isValidMoveYear(move.year)) continue;

                if (move.year > bestYear) {
                    bestYear = move.year;
                    best = move;
                }
                // Ties: first-encountered wins (do not overwrite on equal year)
            }

            if (best) return best.locationId;
        }

        if (typeof character.birthplaceId === 'string' && character.birthplaceId.length > 0) {
            return character.birthplaceId;
        }

        return null;
    }

    /**
     * Gets the current location place object for a character.
     * Returns null if no location can be resolved.
     * 
     * Callers who want a display name use:
     *   var place = getCurrentPlace(character);
     *   var label = place ? place.displayName : 'Unknown';
     * 
     * @param {Object} character
     * @returns {Object|null}
     */
    function getCurrentPlace(character) {
        var id = getCurrentLocationId(character);
        if (!id) return null;
        return _getPlaceById(id);
    }

    /**
     * Gets a character's location path as an array of
     * { id, name, priority, typeId }, ordered root → leaf.
     * Returns [] if no location can be resolved.
     * 
     * `name` may be undefined if a place has no displayName. Callers who
     * need a display label should compose one.
     */
    function getCharacterLocationPath(character) {
        var place = getCurrentPlace(character);
        if (!place) return [];

        var chain = getParentChain(place);
        var path = [];
        for (var i = 0; i < chain.length; i++) {
            var p = chain[i];
            path.push({
                id: p.id,
                name: p.displayName,
                priority: getLocationTypePriority(p.typeId),
                typeId: p.typeId
            });
        }
        return path;
    }

    /**
     * Groups characters by the ID of their resolved current place.
     * 
     * Returns an array of:
     *   {
     *     locationId: string,
     *     place: Object,
     *     characters: Array
     *   }
     * 
     * Characters with no resolvable location are returned in a group with
     * locationId === null and place === null.
     * 
     * The groups are ordered by location hierarchy path (root → leaf) using
     * display names as a secondary sort within equal-priority groups.
     * 
     * Presentation callers who want "Kingdom → Duchy" strings should
     * compose them from place objects themselves.
     * 
     * @param {boolean} [includeDeceased]
     * @returns {Array<{ locationId: string|null, place: Object|null, characters: Array }>}
     */
    function getCharactersGroupedByLocation(includeDeceased) {
        includeDeceased = includeDeceased === true;

        var characters = _getCharacters();
        var groupsByLocationId = new Map();
        var ungrouped = [];

        for (var i = 0; i < characters.length; i++) {
            var char = characters[i];
            if (!includeDeceased && char.isDeceased) continue;

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

        // Sort groups by their parent-chain length (shallow first), then by
        // displayName for determinism.
        groups.sort(function(a, b) {
            var chainA = getParentChain(a.place);
            var chainB = getParentChain(b.place);
            if (chainA.length !== chainB.length) {
                return chainA.length - chainB.length;
            }
            var na = (a.place.displayName || '');
            var nb = (b.place.displayName || '');
            return na.localeCompare(nb);
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
    // 6. EXPORTS
    // =========================================================================

    window.getLocationTypePriority = getLocationTypePriority;
    window.getPlacePriority = getPlacePriority;

    window.getChildPlaces = getChildPlaces;
    window.getTopLevelPlaces = getTopLevelPlaces;
    window.getPlacesByPriority = getPlacesByPriority;

    window.getParentChain = getParentChain;
    window.isAncestorOf = isAncestorOf;
    window.getLocationCountry = getLocationCountry;
    window.getLocationDistrict = getLocationDistrict;

    window.getCurrentLocationId = getCurrentLocationId;
    window.getCurrentPlace = getCurrentPlace;
    window.getCharacterLocationPath = getCharacterLocationPath;
    window.getCharactersGroupedByLocation = getCharactersGroupedByLocation;

})();