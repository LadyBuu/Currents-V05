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
 *   - Location scope resolution (country, district)
 *   - Current-location resolution from character.moves
 *   - Character grouping by location (using stable IDs, not display strings)
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
 *     A cycle cannot cause the starting place to appear in its own
 *     descendant result.
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
 *   Location types may declare a `locationScope` field ('country',
 *   'region', 'district', 'locality', or similar) that denotes their
 *   semantic position in a hierarchy. Separately, they may declare
 *   `priority` for sort ordering. This module uses `locationScope` when it
 *   needs semantic hierarchy levels and `priority` when it needs sort
 *   order. Do not conflate the two.
 *
 *   Types without `locationScope` are treated as scope-less: they can
 *   still be part of a hierarchy (via parentId), but they are not
 *   recognized as a country, district, etc.
 *
 * DEPENDENCIES (all REQUIRED):
 *   - accessors.js: getPlaces, getPlaceById, getLocationTypeById, getCharacters
 *   - time.js:      isValidYear
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

    function _hasId(id) {
        return typeof id === 'string' && id.length > 0;
    }

    function _isMissing(v) {
        return v === undefined || v === null;
    }

    /**
     * Returns a numeric priority for a location type, or null if the type
     * is missing or has no valid priority. Preserves explicit 0.
     * @private
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
     * @private
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

    /**
     * Gets the priority of a location type by ID.
     * Returns null for missing type or missing priority. Priority 0 is
     * preserved as a valid value.
     *
     * @param {string} typeId
     * @returns {number|null}
     */
    function getLocationTypePriority(typeId) {
        if (!_hasId(typeId)) return null;
        return _typePriority(_getLocationTypeById(typeId));
    }

    /**
     * Gets the priority of a place.
     * Returns null for missing place or missing priority.
     */
    function getPlacePriority(place) {
        if (!place) return null;
        return getLocationTypePriority(place.typeId);
    }

    /**
     * Gets the semantic scope of a location type by ID.
     * Returns null for missing type or missing scope.
     *
     * @param {string} typeId
     * @returns {string|null}
     */
    function getLocationTypeScope(typeId) {
        if (!_hasId(typeId)) return null;
        return _typeScope(_getLocationTypeById(typeId));
    }

    /**
     * Gets the scope of a place.
     */
    function getPlaceScope(place) {
        if (!place) return null;
        return getLocationTypeScope(place.typeId);
    }

    // =========================================================================
    // 3. HIERARCHY QUERIES
    // =========================================================================

    /**
     * Gets direct children of a place, or the full subtree if recursive.
     *
     * Cycle safety:
     *   - The starting place never appears in its own result.
     *   - Each descendant appears at most once.
     *   - Corrupted cycles are not repaired; they simply stop contributing
     *     new descendants once every reachable node has been visited.
     *
     * @param {string} parentId
     * @param {boolean} [recursive]
     * @returns {Array}
     */
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

        // Recursive traversal. The starting place is pre-marked as
        // "already accounted for" so a cycle cannot insert it into its
        // own descendant list.
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

    /**
     * Gets top-level places (no parent).
     * Uses explicit missing check (not truthiness).
     */
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

    /**
     * Gets places whose location type has the given priority.
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

    /**
     * Gets places whose location type has the given scope.
     * @param {string} scope
     * @returns {Array}
     */
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

    /**
     * Gets the full parent chain for a place, ordered root → leaf.
     * Includes the place itself.
     *
     * Returns [] when `place` is missing or has no valid ID.
     *
     * Cycle guard uses a Set; no arbitrary depth limit. If a cycle is
     * encountered, the chain stops at the first repeated ID.
     *
     * @param {Object} place
     * @returns {Array}
     */
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

    /**
     * True if `possibleAncestor` appears in the parent chain of `place`.
     */
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
     * Gets the country-level ancestor of a place, if any.
     *
     * Resolution: highest ancestor whose location type's scope is
     * 'country'. Returns null when no such ancestor exists.
     *
     * This module does NOT substitute the root place for a missing
     * country. Callers who want "country or topmost ancestor" should
     * compose that themselves with getParentChain()[0].
     *
     * @param {Object} place
     * @returns {Object|null}
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
     * Gets the district-level ancestor of a place, if any.
     * Returns null when no such ancestor exists.
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
    // 5. CURRENT-LOCATION RESOLUTION
    // =========================================================================
    //
    // See DANGING LOCATION REFERENCES in the file header.
    //
    // A character's current location ID is resolved in this order:
    //   1. character.currentLocationId (explicit override)
    //   2. Latest valid move in character.moves (highest year; ties break
    //      by first-encountered in array order)
    //   3. character.birthplaceId
    //
    // Moves with invalid years are skipped. If all moves have invalid
    // years, resolution falls back to birthplaceId.
    //
    // The returned ID may be dangling: it may not correspond to a place
    // currently in the world. Use getCurrentPlace() to resolve.

    function _isValidMoveYear(year) {
        _requireTime();
        return window.isValidYear(year);
    }

    /**
     * Gets the current location ID for a character. The ID may be dangling.
     * Returns null when no location can be resolved from the character
     * record.
     *
     * @param {Object} character
     * @returns {string|null}
     */
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
                // Ties: first-encountered wins (do not overwrite on equal year)
            }

            if (best) return best.locationId;
        }

        if (_hasId(character.birthplaceId)) {
            return character.birthplaceId;
        }

        return null;
    }

    /**
     * Gets the current location place object for a character.
     * Returns null if no location can be resolved, or if the resolved
     * ID is dangling.
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
     * Gets a character's location path as an array of stable structural
     * fields, ordered root → leaf. Returns [] if no location can be
     * resolved or the resolved reference is dangling.
     *
     * Each entry contains:
     *   { id, typeId, priority, scope }
     *
     * The presentation layer is responsible for turning these into labels
     * (display names, breadcrumbs, etc.).
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
                typeId: p.typeId,
                priority: getLocationTypePriority(p.typeId),
                scope: getLocationTypeScope(p.typeId)
            });
        }
        return path;
    }

    /**
     * Groups characters by the ID of their resolved current place.
     *
     * Returns an array of:
     *   {
     *     locationId: string|null,
     *     place: Object|null,
     *     characters: Array
     *   }
     *
     * Characters with no resolvable location are returned in a single
     * group with locationId === null and place === null.
     *
     * GROUPS ARE ORDERED BY:
     *   1. Parent-chain length (shallow before deep)
     *   2. Ancestor ID path, lexicographic (root → leaf, joined by '/')
     *
     * Stable IDs are used for ordering. Display names are not consulted;
     * renaming a location does not change group order.
     *
     * @param {boolean} [includeDeceased]
     * @returns {Array}
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

        // Deterministic sort key: the joined ancestor ID path (root → leaf).
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
    // 6. EXPORTS
    // =========================================================================

    window.getLocationTypePriority = getLocationTypePriority;
    window.getPlacePriority = getPlacePriority;
    window.getLocationTypeScope = getLocationTypeScope;
    window.getPlaceScope = getPlaceScope;

    window.getChildPlaces = getChildPlaces;
    window.getTopLevelPlaces = getTopLevelPlaces;
    window.getPlacesByPriority = getPlacesByPriority;
    window.getPlacesByScope = getPlacesByScope;

    window.getParentChain = getParentChain;
    window.isAncestorOf = isAncestorOf;
    window.getLocationCountry = getLocationCountry;
    window.getLocationDistrict = getLocationDistrict;

    window.getCurrentLocationId = getCurrentLocationId;
    window.getCurrentPlace = getCurrentPlace;
    window.getCharacterLocationPath = getCharacterLocationPath;
    window.getCharactersGroupedByLocation = getCharactersGroupedByLocation;

})();