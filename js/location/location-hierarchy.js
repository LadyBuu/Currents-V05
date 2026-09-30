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
 * Depends on:
 *   - LocationState (primitive indexes)
 *   - LocationQueries (for chain/hierarchy retrieval)
 *
 * Does NOT delegate hierarchy rules back to State.
 * Does NOT format display strings (ViewModel layer does).
 *
 * =============================================================================
 */

(function () {
    'use strict';

    function _state() {
        if (!window.LocationState) throw new Error('LocationHierarchy: LocationState required');
        return window.LocationState;
    }
    function _queries() {
        if (!window.LocationQueries) throw new Error('LocationHierarchy: LocationQueries required');
        return window.LocationQueries;
    }

    // -------------------------------------------------------------------------
    // VALIDATION
    // -------------------------------------------------------------------------

    function isValidParentType(parentTypeId, childTypeId) {
        var parentPrio = _queries().getLocationTypePriority(parentTypeId);
        var childPrio = _queries().getLocationTypePriority(childTypeId);
        if (parentPrio === null || childPrio === null) return false;
        return parentPrio <= childPrio;
    }

    function validateHierarchy(placeId, newParentId) {
        if (!placeId) return { valid: false, reason: 'Place ID is required' };

        var place = _state().getPlaceById(placeId);
        if (!place) return { valid: false, reason: 'Place not found' };

        if (!newParentId) return { valid: true, reason: 'Valid: no parent (root)' };

        if (newParentId === placeId) {
            return { valid: false, reason: 'Place cannot be its own parent' };
        }

        var parent = _state().getPlaceById(newParentId);
        if (!parent) return { valid: false, reason: 'Parent place not found' };

        if (_queries().isAncestorOf(placeId, newParentId)) {
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

    // -------------------------------------------------------------------------
    // ANCESTRY
    // -------------------------------------------------------------------------

    function isAncestorOf(ancestorId, placeId) {
        return _queries().isAncestorOf(ancestorId, placeId);
    }

    function areInSameCountry(id1, id2) {
        return _queries().areInSameCountry(id1, id2);
    }

    function findLowestCommonAncestor(id1, id2) {
        return _queries().findLowestCommonAncestor(id1, id2);
    }

    /**
     * Depth of the place in the hierarchy. 0 = root.
     * Returns null if the place does not exist.
     */
    function getLocationDepth(placeId) {
        var place = _state().getPlaceById(placeId);
        if (!place) return null;
        return _queries().getPlaceHierarchy(placeId).length - 1;
    }

    /**
     * Nearest ancestor (excluding self) whose type priority equals targetPriority.
     * Returns null if none exists.
     */
    function getNearestAncestorAtPriority(placeId, targetPriority) {
        var chain = _queries().getParentChain(placeId);
        for (var i = chain.length - 1; i >= 0; i--) {
            if (_queries().getLocationTypePriority(chain[i].typeId) === targetPriority) {
                return chain[i];
            }
        }
        return null;
    }

    function getDescendantsAtPriority(placeId, targetPriority) {
        var descendants = _queries().getPlaceChildren(placeId, true);
        var result = [];
        for (var i = 0; i < descendants.length; i++) {
            if (_queries().getLocationTypePriority(descendants[i].typeId) === targetPriority) {
                result.push(descendants[i]);
            }
        }
        return result;
    }

    function hasChildAtPriority(placeId, targetPriority) {
        var children = _queries().getPlaceChildren(placeId, false);
        for (var i = 0; i < children.length; i++) {
            if (_queries().getLocationTypePriority(children[i].typeId) === targetPriority) return true;
        }
        return false;
    }

    function getRegionId(placeId) {
        var p = getNearestAncestorAtPriority(placeId, 2);
        if (p) return p.id;
        // Region may be the place itself
        var self = _queries().getPlace(placeId);
        if (self && _queries().getLocationTypePriority(self.typeId) === 2) return self.id;
        return null;
    }

    function getCountyId(placeId) {
        var p = getNearestAncestorAtPriority(placeId, 3);
        if (p) return p.id;
        var self = _queries().getPlace(placeId);
        if (self && _queries().getLocationTypePriority(self.typeId) === 3) return self.id;
        return null;
    }

    function getCountryId(placeId) {
        return _queries().getCountryId(placeId);
    }

    /**
     * Returns true/false/null.
     * null when the place does not exist (distinct from "not root").
     */
    function isRootPlace(placeId) {
        var place = _state().getPlaceById(placeId);
        if (!place) return null;
        return !place.parentId;
    }

    /**
     * Domain projection of the inheritance chain.
     * No display names, no status defaults.
     */
    function getInheritanceChain(placeId) {
        var chain = _queries().getPlaceHierarchy(placeId);
        var result = [];
        for (var i = 0; i < chain.length; i++) {
            var p = chain[i];
            result.push({
                id: p.id,
                typeId: p.typeId,
                typePriority: _queries().getLocationTypePriority(p.typeId),
                isCapital: p.isCapital === true,
                status: p.status === undefined ? null : p.status
            });
        }
        return result;
    }

    // -------------------------------------------------------------------------
    // DISTANCE / RELATION
    // -------------------------------------------------------------------------

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
        if (!_state().getPlaceById(id1) || !_state().getPlaceById(id2)) return null;

        var lca = _queries().findLowestCommonAncestor(id1, id2);
        if (!lca) return null;

        var d1 = _queries().getPlaceHierarchy(id1).length;
        var d2 = _queries().getPlaceHierarchy(id2).length;
        var dl = _queries().getPlaceHierarchy(lca.id).length;
        return (d1 - dl) + (d2 - dl);
    }

    function areLocationsRelated(id1, id2) {
        if (!id1 || !id2) return false;
        if (id1 === id2) return true;
        return _queries().findLowestCommonAncestor(id1, id2) !== null;
    }

    function getCommonAncestor(locationIds) {
        if (!locationIds || locationIds.length === 0) return null;
        var common = _state().getPlaceById(locationIds[0]);
        if (!common) return null;
        for (var i = 1; i < locationIds.length; i++) {
            if (!_state().getPlaceById(locationIds[i])) return null;
            var lca = _queries().findLowestCommonAncestor(common.id, locationIds[i]);
            if (!lca) return null;
            common = lca;
        }
        return common;
    }

    // -------------------------------------------------------------------------
    // EXPORTS
    // -------------------------------------------------------------------------

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

        // Distance / relation
        getHierarchyDistance: getHierarchyDistance,
        areLocationsRelated: areLocationsRelated,
        getCommonAncestor: getCommonAncestor
    };

})();
