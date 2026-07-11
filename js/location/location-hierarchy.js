/**
 * =============================================================================
 * LOCATION HIERARCHY - Business logic for location hierarchy
 * =============================================================================
 * 
 * Responsibilities:
 * - Hierarchy validation (prevent circular references)
 * - Relationship detection (ancestor, same country, LCA)
 * - Inheritance chain resolution
 * 
 * DEPENDENCIES:
 *   - location-state.js (LocationState)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARD
    // =========================================================================

    var _processingHierarchy = false;

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getLocationTypePriority(typeId) {
        return LocationState.getLocationTypePriority(typeId);
    }

    // =========================================================================
    // 3. HIERARCHY VALIDATION
    // =========================================================================

    function validateHierarchy(placeId, newParentId) {
        if (_processingHierarchy) {
            return { valid: false, reason: 'Hierarchy validation already in progress' };
        }
        _processingHierarchy = true;

        try {
            if (!placeId) {
                return { valid: false, reason: 'Place ID is required' };
            }

            var place = LocationState.getPlace(placeId);
            if (!place) {
                return { valid: false, reason: 'Place not found' };
            }

            if (!newParentId) {
                return { valid: true, reason: 'Valid: Removing parent' };
            }

            var parent = LocationState.getPlace(newParentId);
            if (!parent) {
                return { valid: false, reason: 'Parent place not found' };
            }

            if (newParentId === placeId) {
                return { valid: false, reason: 'Place cannot be its own parent' };
            }

            // Check for circular reference
            if (LocationState.isAncestorOf(placeId, newParentId)) {
                return { valid: false, reason: 'Would create circular reference' };
            }

            // Check type priority: parent should have equal or higher priority (lower number)
            var placePriority = _getLocationTypePriority(place.typeId);
            var parentPriority = _getLocationTypePriority(parent.typeId);

            if (parentPriority > placePriority) {
                return { valid: false, reason: 'Parent type priority is lower than child type' };
            }

            return { valid: true, reason: 'Valid hierarchy' };

        } finally {
            _processingHierarchy = false;
        }
    }

    // =========================================================================
    // 4. INHERITANCE CHAIN
    // =========================================================================

    function getInheritanceChain(placeId) {
        if (_processingHierarchy) {
            return [];
        }
        _processingHierarchy = true;

        try {
            var hierarchy = LocationState.getPlaceHierarchy(placeId);
            var chain = [];

            for (var i = 0; i < hierarchy.length; i++) {
                var p = hierarchy[i];
                chain.push({
                    id: p.id,
                    name: p.displayName,
                    type: LocationState.getLocationTypeName(p.typeId),
                    typePriority: _getLocationTypePriority(p.typeId),
                    isCapital: p.isCapital || false,
                    status: p.status || 'active'
                });
            }

            return chain;

        } finally {
            _processingHierarchy = false;
        }
    }

    // =========================================================================
    // 5. RELATIONSHIP DETECTION
    // =========================================================================

    function isAncestorOf(ancestorId, placeId) {
        if (_processingHierarchy) {
            return false;
        }
        _processingHierarchy = true;

        try {
            return LocationState.isAncestorOf(ancestorId, placeId);

        } finally {
            _processingHierarchy = false;
        }
    }

    function areInSameCountry(placeId1, placeId2) {
        if (_processingHierarchy) {
            return false;
        }
        _processingHierarchy = true;

        try {
            return LocationState.areInSameCountry(placeId1, placeId2);

        } finally {
            _processingHierarchy = false;
        }
    }

    function findLowestCommonAncestor(placeId1, placeId2) {
        if (_processingHierarchy) {
            return null;
        }
        _processingHierarchy = true;

        try {
            return LocationState.findLowestCommonAncestor(placeId1, placeId2);

        } finally {
            _processingHierarchy = false;
        }
    }

    function getLocationDepth(placeId) {
        if (_processingHierarchy) {
            return 0;
        }
        _processingHierarchy = true;

        try {
            var hierarchy = LocationState.getPlaceHierarchy(placeId);
            return hierarchy.length;

        } finally {
            _processingHierarchy = false;
        }
    }

    function getTypeHierarchy(typePriority) {
        if (_processingHierarchy) {
            return [];
        }
        _processingHierarchy = true;

        try {
            var places = LocationState.getAllPlaces({ includeDeprecated: false });
            var result = [];

            for (var i = 0; i < places.length; i++) {
                var p = places[i];
                var priority = _getLocationTypePriority(p.typeId);
                if (priority === typePriority) {
                    result.push(p);
                }
            }

            return result;

        } finally {
            _processingHierarchy = false;
        }
    }

    // =========================================================================
    // 6. EXPORTS
    // =========================================================================

    window.LocationHierarchy = {
        validateHierarchy: validateHierarchy,
        getInheritanceChain: getInheritanceChain,
        isAncestorOf: isAncestorOf,
        areInSameCountry: areInSameCountry,
        findLowestCommonAncestor: findLowestCommonAncestor,
        getLocationDepth: getLocationDepth,
        getTypeHierarchy: getTypeHierarchy
    };

})();