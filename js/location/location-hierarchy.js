/**
 * =============================================================================
 * LOCATION HIERARCHY
 * =============================================================================
 *
 * Owns hierarchy semantics:
 *   - Ancestry / descent relationships
 *   - Structural validation (cycle prevention, type-priority rules)
 *   - Nearest ancestor at priority
 *   - Depth, inheritance chain
 *
 * Depends on (checked at load time):
 *   - LocationState     (primitive indexes)
 *
 * Depends on (checked at call time):
 *   - LocationQueries   (chain/hierarchy retrieval)
 *
 *   LocationQueries is CALL-TIME, not load-time. This is deliberate:
 *   the documented load order is state → hierarchy → commands → queries.
 *   Hierarchy must load before commands (commands requires hierarchy's
 *   validateHierarchy), and commands loads before queries (queries has
 *   no dependents among commands, but the HTML order keeps queries last
 *   to ensure commands never accidentally requires it). Therefore
 *   hierarchy loads before queries. If hierarchy required queries at
 *   load time, it would throw at load. See LOAD ORDER AND THE
 *   QUERIES DEPENDENCY below.
 *
 * Does NOT delegate hierarchy rules back to State.
 * Does NOT format display strings (ViewModel layer does).
 * Does NOT mutate. All writes belong to LocationCommands.
 *
 * LOAD ORDER AND THE QUERIES DEPENDENCY:
 *   The canonical HTML load order is:
 *
 *     location-state.js
 *     location-hierarchy.js
 *     location-commands.js
 *     location-queries.js
 *
 *   This module needs LocationQueries for hierarchy walks
 *   (getPlaceHierarchy, getParentChain, getPlaceChildren,
 *   findLowestCommonAncestor, etc.). Those functions are only reachable
 *   through the LocationQueries namespace, which is installed by
 *   location-queries.js — loaded AFTER this file.
 *
 *   Prior revisions treated LocationQueries as a load-time dependency,
 *   which threw at load with the documented HTML order. That is a bug,
 *   not a load-order mistake. The fix is to resolve LocationQueries at
 *   call time, not at load time. Every function below that needs
 *   LocationQueries calls _requireQueries() first, which throws a clear
 *   error when LocationQueries is missing at call time — a real
 *   load-order bug (some HTML file loaded this module without ever
 *   loading queries) is still loud, but the module itself is
 *   loadable in the documented order.
 *
 *   Call-time resolution matches the pattern established by
 *   family-queries.js for its optional FamilyQueries dependency and by
 *   location-bootstrap.js for its "init after masterData is available"
 *   model. It is not a workaround; it is the correct dependency shape
 *   for a module that is part of a load-order chain where one of its
 *   dependencies loads after it.
 *
 * CALL-TIME DEPENDENCY GUARD:
 *   _requireQueries() throws if window.LocationQueries is missing or
 *   lacks a required method. Every public function that reaches into
 *   LocationQueries calls it first. Public functions that only touch
 *   LocationState do not call it.
 *
 *   This means a bare test harness that loads only LocationState and
 *   LocationHierarchy can call, e.g., validateHierarchy (which needs
 *   LocationQueries) and get a clear error, or isRootPlace (which does
 *   not) and get a real result. That is more useful than a load-time
 *   throw that precludes any use of the module.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Previous revision:
 *     - Hard load-time dependency on LocationQueries. Every public
 *       function that reaches into queries relied on the load-time
 *       guard having already fired.
 *   Current revision:
 *     - Removed the load-time LocationQueries dependency. Added
 *       _requireQueries() call-time guard. Every public function that
 *       reads from LocationQueries now calls _requireQueries() first.
 *     - Header LOAD ORDER AND THE QUERIES DEPENDENCY section added,
 *       explaining the dependency shape and the reasoning for moving
 *       the guard to call time.
 *     - Header CALL-TIME DEPENDENCY GUARD section added, explaining
 *       which functions trigger it and which do not.
 *     - No public signature change, no public return-shape change.
 *       Callers see the same functions with the same behavior; the
 *       only difference is that the module can now be loaded in the
 *       documented order.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. HARD DEPENDENCY CHECKS (load time)
    // =========================================================================

    if (!window.LocationState) {
        throw new Error('location-hierarchy.js requires location-state.js first.');
    }

    var LS = window.LocationState;

    // =========================================================================
    // 2. CALL-TIME DEPENDENCY GUARD
    // =========================================================================
    //
    // LocationQueries loads after this file in the documented HTML order.
    // Every function below that reaches into it calls _requireQueries()
    // first. Functions that touch only LocationState do not.
    //
    // _requireQueries() checks the whole required surface once, so a
    // caller that triggers it gets a single clear error naming exactly
    // which methods are missing — not a scattered null dereference later.

    var _REQUIRED_QUERY_METHODS = [
        'getPlaceHierarchy',
        'getPlaceChildren',
        'getParentChain',
        'getLocationTypePriority',
        'isAncestorOf',
        'areInSameCountry',
        'findLowestCommonAncestor',
        'getCountryId',
        'getLocationAtPriority'
    ];

    function _requireQueries() {
        if (!window.LocationQueries) {
            throw new Error(
                'location-hierarchy.js: LocationQueries is required at call ' +
                'time. Load location-queries.js before invoking hierarchy ' +
                'operations. (This module loads before queries per the ' +
                'canonical HTML order; it is not a load-time dependency.)'
            );
        }
        var missing = [];
        for (var i = 0; i < _REQUIRED_QUERY_METHODS.length; i++) {
            var m = _REQUIRED_QUERY_METHODS[i];
            if (typeof window.LocationQueries[m] !== 'function') {
                missing.push('LocationQueries.' + m);
            }
        }
        if (missing.length > 0) {
            throw new Error(
                'location-hierarchy.js: LocationQueries is loaded but ' +
                'missing required methods: ' + missing.join(', ')
            );
        }
        return window.LocationQueries;
    }

    // Convenience alias for call sites that use LQ repeatedly.
    // Every function that reads from LocationQueries calls _requireQueries()
    // at its own entry point, then uses this alias. The alias is refreshed
    // by _requireQueries() so a broken or replaced LocationQueries after
    // load time is caught here, not silently used.
    function _queries() {
        return _requireQueries();
    }

    // =========================================================================
    // 3. VALIDATION
    // =========================================================================

    /**
     * Parent type priority must be <= child type priority.
     * Priority 1 is the highest (country). Priority 5 is the lowest.
     * A country (1) can parent anything. A locality (5) can parent only a
     * locality.
     *
     * Returns false if either type has no priority (unknown type).
     */
    function isValidParentType(parentTypeId, childTypeId) {
        var LQ = _queries();
        var parentPrio = LQ.getLocationTypePriority(parentTypeId);
        var childPrio = LQ.getLocationTypePriority(childTypeId);
        if (parentPrio === null || childPrio === null) return false;
        return parentPrio <= childPrio;
    }

    /**
     * Structural validation for a proposed parent change.
     *
     * Rules:
     *   - Place must exist.
     *   - No self-parenting.
     *   - New parent must exist.
     *   - No cycle: new parent must not be a descendant of place.
     *   - Parent type priority must be <= child type priority.
     *
     * Returns { valid: boolean, reason: string }.
     * Does not mutate. Does not validate business intent (location status,
     * leadership, etc.) — those are command-level concerns.
     *
     * Note: the place and parent existence checks go through
     * LocationState.getPlaceById, which does not require LocationQueries.
     * The cycle and type checks do. _queries() is called once at the top
     * so the whole validation path is coherent (no partial evaluation if
     * LocationQueries is missing).
     */
    function validateHierarchy(placeId, newParentId) {
        if (!placeId) {
            return { valid: false, reason: 'Place ID is required' };
        }

        var place = LS.getPlaceById(placeId);
        if (!place) {
            return { valid: false, reason: 'Place not found' };
        }

        if (!newParentId) {
            return { valid: true, reason: 'Valid: no parent (root)' };
        }

        var LQ = _queries();

        if (newParentId === placeId) {
            return { valid: false, reason: 'Place cannot be its own parent' };
        }

        var parent = LS.getPlaceById(newParentId);
        if (!parent) {
            return { valid: false, reason: 'Parent place not found' };
        }

        if (LQ.isAncestorOf(placeId, newParentId)) {
            return { valid: false, reason: 'Would create circular reference' };
        }

        if (!isValidParentType(parent.typeId, place.typeId)) {
            return {
                valid: false,
                reason: 'Parent type priority must be equal to or higher than child type'
            };
        }

        return { valid: true, reason: 'Valid hierarchy' };
    }

    // =========================================================================
    // 4. ANCESTRY (delegates to LocationQueries)
    // =========================================================================

    function isAncestorOf(ancestorId, placeId) {
        var LQ = _queries();
        return LQ.isAncestorOf(ancestorId, placeId);
    }

    function areInSameCountry(id1, id2) {
        var LQ = _queries();
        return LQ.areInSameCountry(id1, id2);
    }

    function findLowestCommonAncestor(id1, id2) {
        var LQ = _queries();
        return LQ.findLowestCommonAncestor(id1, id2);
    }

    /**
     * Depth of the place in the hierarchy. 0 = root.
     * Returns null if the place does not exist.
     */
    function getLocationDepth(placeId) {
        var place = LS.getPlaceById(placeId);
        if (!place) return null;
        var LQ = _queries();
        return LQ.getPlaceHierarchy(placeId).length - 1;
    }

    /**
     * Nearest ancestor (excluding self) whose type priority equals
     * targetPriority. Returns null if none exists.
     */
    function getNearestAncestorAtPriority(placeId, targetPriority) {
        if (targetPriority === null || targetPriority === undefined) return null;
        var LQ = _queries();
        var chain = LQ.getParentChain(placeId);
        for (var i = chain.length - 1; i >= 0; i--) {
            if (LQ.getLocationTypePriority(chain[i].typeId) === targetPriority) {
                return chain[i];
            }
        }
        return null;
    }

    function getDescendantsAtPriority(placeId, targetPriority) {
        if (targetPriority === null || targetPriority === undefined) return [];
        var LQ = _queries();
        var descendants = LQ.getPlaceChildren(placeId, true);
        var result = [];
        for (var i = 0; i < descendants.length; i++) {
            if (LQ.getLocationTypePriority(descendants[i].typeId) ===
                targetPriority) {
                result.push(descendants[i]);
            }
        }
        return result;
    }

    function hasChildAtPriority(placeId, targetPriority) {
        if (targetPriority === null || targetPriority === undefined) return false;
        var LQ = _queries();
        var children = LQ.getPlaceChildren(placeId, false);
        for (var i = 0; i < children.length; i++) {
            if (LQ.getLocationTypePriority(children[i].typeId) ===
                targetPriority) {
                return true;
            }
        }
        return false;
    }

    // =========================================================================
    // 5. IDs AT PRIORITY
    // =========================================================================

    function getRegionId(placeId) {
        var LQ = _queries();
        var p = getNearestAncestorAtPriority(placeId, 2);
        if (p) return p.id;
        var self = LS.getPlaceById(placeId);
        if (self && LQ.getLocationTypePriority(self.typeId) === 2) {
            return self.id;
        }
        return null;
    }

    function getCountyId(placeId) {
        var LQ = _queries();
        var p = getNearestAncestorAtPriority(placeId, 3);
        if (p) return p.id;
        var self = LS.getPlaceById(placeId);
        if (self && LQ.getLocationTypePriority(self.typeId) === 3) {
            return self.id;
        }
        return null;
    }

    function getCountryId(placeId) {
        var LQ = _queries();
        return LQ.getCountryId(placeId);
    }

    /**
     * Returns true/false/null.
     * null when the place does not exist (distinct from "not root").
     *
     * Does NOT require LocationQueries — reads only LocationState.
     */
    function isRootPlace(placeId) {
        var place = LS.getPlaceById(placeId);
        if (!place) return null;
        return !place.parentId;
    }

    /**
     * Domain projection of the inheritance chain.
     * No display names, no status defaults.
     *
     * Shape per entry:
     *   {
     *     id,
     *     typeId,
     *     typePriority,
     *     isCapital,
     *     status
     *   }
     */
    function getInheritanceChain(placeId) {
        var LQ = _queries();
        var chain = LQ.getPlaceHierarchy(placeId);
        var result = [];
        for (var i = 0; i < chain.length; i++) {
            var p = chain[i];
            result.push({
                id: p.id,
                typeId: p.typeId,
                typePriority: LQ.getLocationTypePriority(p.typeId),
                isCapital: p.isCapital === true,
                status: p.status === undefined ? null : p.status
            });
        }
        return result;
    }

    // =========================================================================
    // 6. DISTANCE / RELATION
    // =========================================================================

    /**
     * Hierarchy edge distance between two places.
     * Returns:
     *   0    same place
     *   N>0  connected places
     *   null if either place missing or they are disconnected
     */
    function getHierarchyDistance(id1, id2) {
        if (!id1 || !id2) return null;
        if (id1 === id2) return 0;
        if (!LS.getPlaceById(id1) || !LS.getPlaceById(id2)) return null;

        var LQ = _queries();
        var lca = LQ.findLowestCommonAncestor(id1, id2);
        if (!lca) return null;

        var d1 = LQ.getPlaceHierarchy(id1).length;
        var d2 = LQ.getPlaceHierarchy(id2).length;
        var dl = LQ.getPlaceHierarchy(lca.id).length;
        return (d1 - dl) + (d2 - dl);
    }

    function areLocationsRelated(id1, id2) {
        if (!id1 || !id2) return false;
        if (id1 === id2) return true;
        var LQ = _queries();
        return LQ.findLowestCommonAncestor(id1, id2) !== null;
    }

    function getCommonAncestor(locationIds) {
        if (!locationIds || locationIds.length === 0) return null;
        var common = LS.getPlaceById(locationIds[0]);
        if (!common) return null;
        var LQ = _queries();
        for (var i = 1; i < locationIds.length; i++) {
            if (!LS.getPlaceById(locationIds[i])) return null;
            var lca = LQ.findLowestCommonAncestor(common.id, locationIds[i]);
            if (!lca) return null;
            common = lca;
        }
        return common;
    }

    // =========================================================================
    // 7. TYPE HIERARCHY
    // =========================================================================

    /**
     * All places of a given type priority.
     * Priority 1 = country, 2 = region, 3 = county, 4 = town, 5 = locality.
     */
    function getTypeHierarchy(typePriority) {
        if (typePriority === null || typePriority === undefined) return [];
        var LQ = _queries();
        var ids = LS.getAllPlaceIds();
        var out = [];
        for (var i = 0; i < ids.length; i++) {
            var p = LS.getPlaceById(ids[i]);
            if (!p) continue;
            if (LQ.getLocationTypePriority(p.typeId) === typePriority) {
                out.push(p);
            }
        }
        return out;
    }

    /**
     * Nearest ancestor at or above a priority, including self.
     * Priority 2 for a town returns its region (or itself if it is a region).
     */
    function getAncestorAtPriority(placeId, targetPriority) {
        if (targetPriority === null || targetPriority === undefined) return null;
        var LQ = _queries();
        var self = LS.getPlaceById(placeId);
        if (self && LQ.getLocationTypePriority(self.typeId) === targetPriority) {
            return self;
        }
        return getNearestAncestorAtPriority(placeId, targetPriority);
    }

    /**
     * Nearest ancestor strictly above a priority (excludes self).
     */
    function getImmediateAncestorAtPriority(placeId, targetPriority) {
        return getNearestAncestorAtPriority(placeId, targetPriority);
    }

    // =========================================================================
    // 8. REGION / COUNTY NAMES (display helpers)
    // =========================================================================

    function getRegionName(placeId) {
        var regionId = getRegionId(placeId);
        if (!regionId) return null;
        var region = LS.getPlaceById(regionId);
        return region ? region.displayName : null;
    }

    function getCountyName(placeId) {
        var countyId = getCountyId(placeId);
        if (!countyId) return null;
        var county = LS.getPlaceById(countyId);
        return county ? county.displayName : null;
    }

    // =========================================================================
    // 9. DISPLAY PATH
    // =========================================================================

    /**
     * Full hierarchy path as a string, joined by separator.
     * Default separator is ' > '.
     * Empty string if the place does not exist.
     *
     * Presentation defaults live in LocationViewModels for view-facing paths.
     * This is a convenience for non-view callers (logging, debugging,
     * cross-domain diagnostics).
     */
    function getHierarchyPath(placeId, separator) {
        var joiner = (separator === undefined || separator === null)
            ? ' > '
            : separator;
        var LQ = _queries();
        var chain = LQ.getPlaceHierarchy(placeId);
        if (chain.length === 0) return '';
        var names = [];
        for (var i = 0; i < chain.length; i++) {
            var p = chain[i];
            if (p && p.displayName) names.push(p.displayName);
        }
        return names.join(joiner);
    }

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

    window.LocationHierarchy = {
        // Validation
        validateHierarchy: validateHierarchy,
        isValidParentType: isValidParentType,

        // Ancestry
        isAncestorOf: isAncestorOf,
        areInSameCountry: areInSameCountry,
        findLowestCommonAncestor: findLowestCommonAncestor,
        getLocationDepth: getLocationDepth,
        getNearestAncestorAtPriority: getNearestAncestorAtPriority,
        getDescendantsAtPriority: getDescendantsAtPriority,
        hasChildAtPriority: hasChildAtPriority,

        // IDs at priority
        getRegionId: getRegionId,
        getCountyId: getCountyId,
        getCountryId: getCountryId,
        isRootPlace: isRootPlace,
        getInheritanceChain: getInheritanceChain,

        // Type hierarchy
        getTypeHierarchy: getTypeHierarchy,
        getAncestorAtPriority: getAncestorAtPriority,
        getImmediateAncestorAtPriority: getImmediateAncestorAtPriority,

        // Names
        getRegionName: getRegionName,
        getCountyName: getCountyName,

        // Distance / relation
        getHierarchyDistance: getHierarchyDistance,
        areLocationsRelated: areLocationsRelated,
        getCommonAncestor: getCommonAncestor,

        // Display path
        getHierarchyPath: getHierarchyPath
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.LocationHierarchy;
    }

})();
