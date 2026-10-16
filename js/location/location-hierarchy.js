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
 *   - LocationQueries   (chain/hierarchy retrieval)
 *
 * Does NOT delegate hierarchy rules back to State.
 * Does NOT format display strings (ViewModel layer does).
 * Does NOT mutate. All writes belong to LocationCommands.
 *
 * Load order note:
 *   This file loads after location-queries.js per the HTML order.
 *   It has no dependents among commands (commands reimplements the one
 *   hierarchy check it needs by calling LocationHierarchy.validateHierarchy,
 *   which is the only command-facing export of this module).
 *
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
    if (!window.LocationQueries) {
        throw new Error(
            'location-hierarchy.js requires location-queries.js first.'
        );
    }

    var _requiredQueryMethods = [
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
    for (var _i = 0; _i < _requiredQueryMethods.length; _i++) {
        var _m = _requiredQueryMethods[_i];
        if (typeof window.LocationQueries[_m] !== 'function') {
            throw new Error(
                'location-hierarchy.js: LocationQueries.' + _m +
                ' is required.'
            );
        }
    }

    var LS = window.LocationState;
    var LQ = window.LocationQueries;

    // =========================================================================
    // 2. VALIDATION
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
    // 3. ANCESTRY (delegates to LocationQueries)
    // =========================================================================

    function isAncestorOf(ancestorId, placeId) {
        return LQ.isAncestorOf(ancestorId, placeId);
    }

    function areInSameCountry(id1, id2) {
        return LQ.areInSameCountry(id1, id2);
    }

    function findLowestCommonAncestor(id1, id2) {
        return LQ.findLowestCommonAncestor(id1, id2);
    }

    /**
     * Depth of the place in the hierarchy. 0 = root.
     * Returns null if the place does not exist.
     */
    function getLocationDepth(placeId) {
        var place = LS.getPlaceById(placeId);
        if (!place) return null;
        return LQ.getPlaceHierarchy(placeId).length - 1;
    }

    /**
     * Nearest ancestor (excluding self) whose type priority equals
     * targetPriority. Returns null if none exists.
     */
    function getNearestAncestorAtPriority(placeId, targetPriority) {
        if (targetPriority === null || targetPriority === undefined) return null;
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
    // 4. IDs AT PRIORITY
    // =========================================================================

    function getRegionId(placeId) {
        var p = getNearestAncestorAtPriority(placeId, 2);
        if (p) return p.id;
        // Region may be the place itself.
        var self = LS.getPlaceById(placeId);
        if (self && LQ.getLocationTypePriority(self.typeId) === 2) {
            return self.id;
        }
        return null;
    }

    function getCountyId(placeId) {
        var p = getNearestAncestorAtPriority(placeId, 3);
        if (p) return p.id;
        var self = LS.getPlaceById(placeId);
        if (self && LQ.getLocationTypePriority(self.typeId) === 3) {
            return self.id;
        }
        return null;
    }

    function getCountryId(placeId) {
        return LQ.getCountryId(placeId);
    }

    /**
     * Returns true/false/null.
     * null when the place does not exist (distinct from "not root").
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
    // 5. DISTANCE / RELATION
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
        return LQ.findLowestCommonAncestor(id1, id2) !== null;
    }

    function getCommonAncestor(locationIds) {
        if (!locationIds || locationIds.length === 0) return null;
        var common = LS.getPlaceById(locationIds[0]);
        if (!common) return null;
        for (var i = 1; i < locationIds.length; i++) {
            if (!LS.getPlaceById(locationIds[i])) return null;
            var lca = LQ.findLowestCommonAncestor(common.id, locationIds[i]);
            if (!lca) return null;
            common = lca;
        }
        return common;
    }

    // =========================================================================
    // 6. TYPE HIERARCHY
    // =========================================================================

    /**
     * All places of a given type priority.
     * Priority 1 = country, 2 = region, 3 = county, 4 = town, 5 = locality.
     */
    function getTypeHierarchy(typePriority) {
        if (typePriority === null || typePriority === undefined) return [];
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
    // 7. REGION / COUNTY NAMES (display helpers)
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
    // 8. DISPLAY PATH
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
    // 9. EXPORTS
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
