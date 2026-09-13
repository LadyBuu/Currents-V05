/**
 * =============================================================================
 * STILL WATERS - WORLD SYSTEM (world.js) - PURE QUERY LAYER
 * =============================================================================
 * 
 * LOCATION: js/core/world.js
 * 
 * This file contains PURE read-only queries using ONLY accessors.js.
 * NO dependency on location-state.js or any location system files.
 * NO mutation. NO UI. NO caches of its own.
 * 
 * SCOPE:
 *   - Location hierarchy queries (parents, children, ancestors)
 *   - Location type / priority resolution
 *   - Character current-location resolution from character.moves
 *   - Character grouping by location
 * 
 * OUT OF SCOPE:
 *   - Mutating moves (see character-commands or location-movement)
 *   - Selected/current location state (see SettlementState or LocationState)
 *   - Formatting/breadcrumbs with arrows (see formatting.js)
 * 
 * SEMANTIC RULES:
 *   - Missing/invalid IDs return null, not fabricated defaults.
 *   - Priority 0 is valid; `||` must not be used for priority.
 *   - Recursive traversal has a cycle guard.
 *   - Location hierarchy safety depth is bounded.
 * 
 * DEPENDENCIES:
 *   - accessors.js (getPlaces, getPlaceById, getLocationTypes,
 *                  getLocationTypeById, getCharacters)
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
        if (typeof window.getPlaces !== 'function'
            || typeof window.getPlaceById !== 'function'
            || typeof window.getCharacters !== 'function') {
            throw new Error('world.js: accessors.js must load first.');
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
        if (typeof window.getLocationTypeById === 'function') {
            return window.getLocationTypeById(id);
        }
        return null;
    }

    function _getCharacters() {
        _requireAccessors();
        return window.getCharacters();
    }

    /**
     * Returns a numeric priority for a location type.
     * Falls back to 5 if the type is missing.
     * Preserves explicit 0.
     * @private
     */
    function _typePriority(type) {
        if (!type) return 5;
        var p = type.priority;
        if (typeof p === 'number' && Number.isFinite(p)) return p;
        return 5;
    }

    // =========================================================================
    // 2. LOCATION TYPE / PRIORITY QUERIES
    // =========================================================================

    /**
     * Gets the priority of a location type by ID.
     * Returns 999 for unknown types (so they sort last).
     * Preserves explicit priority 0.
     */
    function getLocationTypePriority(typeId) {
        if (!typeId) return 999;
        var type = _getLocationTypeById(typeId);
        if (!type) return 999;
        var p = type.priority;
        if (typeof p === 'number' && Number.isFinite(p)) return p;
        return 5;
    }

    /**
     * Gets the priority of a place.
     */
    function getPlacePriority(place) {
        if (!place) return 999;
        return getLocationTypePriority(place.typeId);
    }

    // =========================================================================
    // 3. HIERARCHY QUERIES
    // =========================================================================

    /**
     * Gets direct children of a place.
     * If `recursive` is true, walks the full subtree using an iterative
     * stack with a visited set to prevent infinite loops on malformed data.
     * 
     * @param {string} parentId
     * @param {boolean} [recursive]
     * @returns {Array}
     */
    function getChildPlaces(parentId, recursive) {
        if (!parentId) return [];
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
        var maxNodes = places.length + 1; // hard ceiling
        var processed = 0;

        while (stack.length > 0 && processed < maxNodes) {
            var currentId = stack.pop();
            if (visited.has(currentId)) continue;
            visited.add(currentId);
            processed++;

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
     */
    function getTopLevelPlaces() {
        var places = _getPlaces();
        var result = [];
        for (var i = 0; i < places.length; i++) {
            if (!places[i].parentId) {
                result.push(places[i]);
            }
        }
        return result;
    }

    /**
     * Gets places by priority.
     */
    function getPlacesByPriority(priority) {
        if (typeof priority !== 'number' || !Number.isFinite(priority)) return [];
        var places = _getPlaces();
        var result = [];
        for (var i = 0; i < places.length; i++) {
            var type = _getLocationTypeById(places[i].typeId);
            if (type && _typePriority(type) === priority) {
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
     * Has a safety depth limit to prevent infinite loops on circular data.
     * (Circular data should be caught by validation, but query code must
     * not hang if malformed data slips through.)
     */
    function getParentChain(place) {
        if (!place) return [];
        var chain = [];
        var current = place;
        var seen = new Set();
        var depth = 0;
        var MAX_DEPTH = 20;

        while (current && depth < MAX_DEPTH) {
            if (seen.has(current.id)) break;
            seen.add(current.id);
            chain.unshift(current);
            if (!current.parentId) break;
            current = _getPlaceById(current.parentId);
            depth++;
        }
        return chain;
    }

    /**
     * Returns true if `possibleAncestor` appears in the parent chain of `place`.
     */
    function isAncestorOf(possibleAncestor, place) {
        if (!possibleAncestor || !place) return false;
        if (possibleAncestor.id === place.id) return false;

        var current = place;
        var depth = 0;
        var seen = new Set();
        while (current && depth < 20) {
            if (seen.has(current.id)) break;
            seen.add(current.id);
            if (current.parentId === possibleAncestor.id) return true;
            current = _getPlaceById(current.parentId);
            depth++;
        }
        return false;
    }

    /**
     * Gets the topmost ancestor (typically the country) of a place.
     * Returns 'Other Locations' if no chain can be established.
     */
    function getLocationCountry(place) {
        if (!place) return 'Other Locations';
        var chain = getParentChain(place);
        if (chain.length === 0) return 'Other Locations';

        // Prefer the highest-priority ancestor (priority 1 = country)
        for (var i = 0; i < chain.length; i++) {
            var priority = getLocationTypePriority(chain[i].typeId);
            if (priority === 1) return chain[i].displayName || 'Other Locations';
        }
        // Fallback: topmost
        return chain[0].displayName || 'Other Locations';
    }

    /**
     * Gets the district-level ancestor of a place, if any.
     */
    function getLocationDistrict(place) {
        if (!place) return null;
        var chain = getParentChain(place);
        for (var i = 0; i < chain.length; i++) {
            var priority = getLocationTypePriority(chain[i].typeId);
            if (priority === 2) return chain[i].displayName || null;
        }
        return null;
    }

    // =========================================================================
    // 5. CHARACTER LOCATION QUERIES
    // =========================================================================
    // 
    // SEMANTIC NOTE:
    //   A character's current location is resolved in this order:
    //     1. `character.currentLocationId` (explicit override)
    //     2. Latest move in `character.moves` (by year, descending)
    //     3. `character.birthplaceId` (documented fallback)
    //   The birthplace fallback is deliberate for this yearly-resolution
    //   world model. It is documented here so no other module has to
    //   invent its own version.
    // =========================================================================

    /**
     * Gets the current location ID for a character.
     * @param {Object} character
     * @returns {string|null}
     */
    function getCurrentLocationId(character) {
        if (!character) return null;

        if (typeof character.currentLocationId === 'string' && character.currentLocationId) {
            return character.currentLocationId;
        }

        if (Array.isArray(character.moves) && character.moves.length > 0) {
            var best = null;
            var bestYear = -Infinity;
            for (var i = 0; i < character.moves.length; i++) {
                var move = character.moves[i];
                if (!move || !move.locationId) continue;
                var y = typeof move.year === 'number' && Number.isFinite(move.year)
                    ? move.year
                    : -Infinity;
                if (y > bestYear) {
                    bestYear = y;
                    best = move;
                }
            }
            if (best) return best.locationId;
        }

        if (typeof character.birthplaceId === 'string' && character.birthplaceId) {
            return character.birthplaceId;
        }

        return null;
    }

    /**
     * Gets the current location display name for a character.
     * Returns 'Unknown' if no location can be resolved.
     */
    function getCurrentLocation(character) {
        var id = getCurrentLocationId(character);
        if (!id) return 'Unknown';
        var place = _getPlaceById(id);
        return place ? (place.displayName || 'Unknown') : 'Unknown';
    }

    /**
     * Gets a character's location path as an array of { id, name, priority, typeId },
     * ordered root → leaf.
     */
    function getCharacterLocationPath(character) {
        var locId = getCurrentLocationId(character);
        if (!locId) return [];
        var place = _getPlaceById(locId);
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
     * Groups characters by their location hierarchy display string.
     * 
     * Returns an object keyed by the hierarchy string (e.g., "Kingdom → Duchy").
     * Characters with no resolvable location appear under "Ungrouped".
     * 
     * NOTE: The keys are display strings, which means they change if a
     * location is renamed. If you need stable identifiers, group by the
     * location ID instead.
     * 
     * @param {boolean} [includeDeceased]
     * @returns {Object}
     */
    function getCharactersGroupedByLocation(includeDeceased) {
        includeDeceased = includeDeceased === true;

        var characters = _getCharacters();
        var groups = {};
        var ungrouped = [];

        for (var i = 0; i < characters.length; i++) {
            var char = characters[i];
            if (!includeDeceased && char.isDeceased) continue;

            var locId = getCurrentLocationId(char);
            var place = locId ? _getPlaceById(locId) : null;

            if (!place) {
                ungrouped.push(char);
                continue;
            }

            var chain = getParentChain(place);
            var names = [];
            for (var j = 0; j < chain.length; j++) {
                names.push(chain[j].displayName || 'Unknown');
            }
            var key = names.join(' → ');

            if (!groups[key]) groups[key] = [];
            groups[key].push(char);
        }

        // Sort group keys
        var sortedKeys = Object.keys(groups).sort();
        var ordered = {};
        for (var k = 0; k < sortedKeys.length; k++) {
            ordered[sortedKeys[k]] = groups[sortedKeys[k]];
        }
        if (ungrouped.length > 0) {
            ordered['Ungrouped'] = ungrouped;
        }

        return ordered;
    }

    // =========================================================================
    // 6. EXPORTS
    // =========================================================================

    // Location type / priority
    window.getLocationTypePriority = getLocationTypePriority;
    window.getPlacePriority = getPlacePriority;

    // Hierarchy
    window.getChildPlaces = getChildPlaces;
    window.getTopLevelPlaces = getTopLevelPlaces;
    window.getPlacesByPriority = getPlacesByPriority;

    // Path
    window.getParentChain = getParentChain;
    window.isAncestorOf = isAncestorOf;
    window.getLocationCountry = getLocationCountry;
    window.getLocationDistrict = getLocationDistrict;

    // Character location
    window.getCurrentLocationId = getCurrentLocationId;
    window.getCurrentLocation = getCurrentLocation;
    window.getCharacterLocationPath = getCharacterLocationPath;
    window.getCharactersGroupedByLocation = getCharactersGroupedByLocation;

})();