/**
 * =============================================================================
 * LOCATION HIERARCHY - Business logic for location hierarchy
 * =============================================================================
 * 
 * LOCATION: js/location/location-hierarchy.js
 * 
 * Responsibilities:
 * - Hierarchy validation (prevent circular references)
 * - Relationship detection (ancestor, same country, LCA)
 * - Inheritance chain resolution
 * 
 * DEPENDENCIES:
 *   - LocationState (public API)
 *   - Core wrappers from modals-core.js
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
    // 2. DEPENDENCY WRAPPERS (Using core wrappers)
    // =========================================================================

    function _getLocationTypePriority(typeId) {
        return LocationState.getLocationTypePriority(typeId);
    }

    function _getLocationTypeName(typeId) {
        return LocationState.getLocationTypeName(typeId);
    }

    function _showToast(message, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(message, type);
        }
    }

    // =========================================================================
    // 3. HIERARCHY VALIDATION
    // =========================================================================

    /**
     * Validates if a place can be moved to a new parent
     * @param {string} placeId - Place ID to validate
     * @param {string} newParentId - Proposed new parent ID
     * @returns {Object} { valid: boolean, reason: string }
     */
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
                return { 
                    valid: false, 
                    reason: 'Parent type priority (' + parentPriority + ') is lower than child type (' + placePriority + ')' 
                };
            }

            return { valid: true, reason: 'Valid hierarchy' };

        } finally {
            _processingHierarchy = false;
        }
    }

    // =========================================================================
    // 4. INHERITANCE CHAIN
    // =========================================================================

    /**
     * Gets the inheritance chain for a place (with type info)
     * @param {string} placeId - Place ID
     * @returns {Array} Array of chain objects
     */
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

    /**
     * Checks if one place is an ancestor of another
     * @param {string} ancestorId - Potential ancestor ID
     * @param {string} placeId - Place ID to check
     * @returns {boolean} True if ancestor
     */
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

    /**
     * Checks if two places are in the same country
     * @param {string} placeId1 - First place ID
     * @param {string} placeId2 - Second place ID
     * @returns {boolean} True if same country
     */
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

    /**
     * Finds the lowest common ancestor of two places
     * @param {string} placeId1 - First place ID
     * @param {string} placeId2 - Second place ID
     * @returns {Object|null} Common ancestor place or null
     */
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

    /**
     * Gets the depth of a place in the hierarchy
     * @param {string} placeId - Place ID
     * @returns {number} Depth (0 = root)
     */
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

    /**
     * Gets all places of a specific type priority
     * @param {number} typePriority - Type priority (1-5)
     * @returns {Array} Array of place objects
     */
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
    // 6. HIERARCHY NAVIGATION HELPERS
    // =========================================================================

    /**
     * Gets the next higher priority location in the hierarchy
     * @param {string} placeId - Place ID
     * @param {number} targetPriority - Target priority (lower = higher)
     * @returns {Object|null} Place object or null
     */
    function getAncestorAtPriority(placeId, targetPriority) {
        if (_processingHierarchy) {
            return null;
        }
        _processingHierarchy = true;

        try {
            var hierarchy = LocationState.getPlaceHierarchy(placeId);
            
            // Search from bottom up (closest first)
            for (var i = hierarchy.length - 1; i >= 0; i--) {
                var p = hierarchy[i];
                var priority = _getLocationTypePriority(p.typeId);
                if (priority === targetPriority) {
                    return p;
                }
            }

            return null;

        } finally {
            _processingHierarchy = false;
        }
    }

    /**
     * Gets all descendants of a place with a specific type priority
     * @param {string} placeId - Place ID
     * @param {number} targetPriority - Target priority
     * @returns {Array} Array of place objects
     */
    function getDescendantsAtPriority(placeId, targetPriority) {
        if (_processingHierarchy) {
            return [];
        }
        _processingHierarchy = true;

        try {
            var descendants = LocationState.getPlaceChildren(placeId, true);
            var result = [];

            for (var i = 0; i < descendants.length; i++) {
                var p = descendants[i];
                var priority = _getLocationTypePriority(p.typeId);
                if (priority === targetPriority) {
                    result.push(p);
                }
            }

            return result;

        } finally {
            _processingHierarchy = false;
        }
    }

    /**
     * Gets the immediate parent of a place with a specific priority
     * @param {string} placeId - Place ID
     * @param {number} targetPriority - Target priority
     * @returns {Object|null} Place object or null
     */
    function getImmediateAncestorAtPriority(placeId, targetPriority) {
        if (_processingHierarchy) {
            return null;
        }
        _processingHierarchy = true;

        try {
            var hierarchy = LocationState.getPlaceHierarchy(placeId);
            
            // Find the closest ancestor with the target priority
            for (var i = hierarchy.length - 2; i >= 0; i--) {
                var p = hierarchy[i];
                var priority = _getLocationTypePriority(p.typeId);
                if (priority === targetPriority) {
                    return p;
                }
            }

            return null;

        } finally {
            _processingHierarchy = false;
        }
    }

    /**
     * Checks if a place has a child of a specific priority
     * @param {string} placeId - Place ID
     * @param {number} targetPriority - Target priority
     * @returns {boolean} True if has child of that priority
     */
    function hasChildAtPriority(placeId, targetPriority) {
        if (_processingHierarchy) {
            return false;
        }
        _processingHierarchy = true;

        try {
            var children = LocationState.getPlaceChildren(placeId, false);
            for (var i = 0; i < children.length; i++) {
                var priority = _getLocationTypePriority(children[i].typeId);
                if (priority === targetPriority) {
                    return true;
                }
            }
            return false;

        } finally {
            _processingHierarchy = false;
        }
    }

    /**
     * Gets the country ID for a place (wrapper)
     * @param {string} placeId - Place ID
     * @returns {string|null} Country ID or null
     */
    function getCountryId(placeId) {
        if (_processingHierarchy) {
            return null;
        }
        _processingHierarchy = true;

        try {
            return LocationState.getCountryId(placeId);

        } finally {
            _processingHierarchy = false;
        }
    }

    /**
     * Gets the region ID (priority 2) for a place
     * @param {string} placeId - Place ID
     * @returns {string|null} Region ID or null
     */
    function getRegionId(placeId) {
        if (_processingHierarchy) {
            return null;
        }
        _processingHierarchy = true;

        try {
            var place = LocationState.getPlace(placeId);
            if (!place) return null;
            
            var hierarchy = LocationState.getPlaceHierarchy(placeId);
            for (var i = hierarchy.length - 1; i >= 0; i--) {
                var p = hierarchy[i];
                var priority = _getLocationTypePriority(p.typeId);
                if (priority === 2) {
                    return p.id;
                }
            }
            return null;

        } finally {
            _processingHierarchy = false;
        }
    }

    /**
     * Gets the region name for a place
     * @param {string} placeId - Place ID
     * @returns {string} Region name or 'Unknown'
     */
    function getRegionName(placeId) {
        if (_processingHierarchy) {
            return 'Unknown';
        }
        _processingHierarchy = true;

        try {
            var regionId = getRegionId(placeId);
            if (!regionId) return 'Unknown';
            var region = LocationState.getPlace(regionId);
            return region ? region.displayName : 'Unknown';

        } finally {
            _processingHierarchy = false;
        }
    }

    /**
     * Gets the county ID (priority 3) for a place
     * @param {string} placeId - Place ID
     * @returns {string|null} County ID or null
     */
    function getCountyId(placeId) {
        if (_processingHierarchy) {
            return null;
        }
        _processingHierarchy = true;

        try {
            var place = LocationState.getPlace(placeId);
            if (!place) return null;
            
            var hierarchy = LocationState.getPlaceHierarchy(placeId);
            for (var i = hierarchy.length - 1; i >= 0; i--) {
                var p = hierarchy[i];
                var priority = _getLocationTypePriority(p.typeId);
                if (priority === 3) {
                    return p.id;
                }
            }
            return null;

        } finally {
            _processingHierarchy = false;
        }
    }

    /**
     * Gets the county name for a place
     * @param {string} placeId - Place ID
     * @returns {string} County name or 'Unknown'
     */
    function getCountyName(placeId) {
        if (_processingHierarchy) {
            return 'Unknown';
        }
        _processingHierarchy = true;

        try {
            var countyId = getCountyId(placeId);
            if (!countyId) return 'Unknown';
            var county = LocationState.getPlace(countyId);
            return county ? county.displayName : 'Unknown';

        } finally {
            _processingHierarchy = false;
        }
    }

    /**
     * Checks if a place is a root (has no parent)
     * @param {string} placeId - Place ID
     * @returns {boolean} True if root
     */
    function isRootPlace(placeId) {
        if (_processingHierarchy) {
            return false;
        }
        _processingHierarchy = true;

        try {
            var place = LocationState.getPlace(placeId);
            return place ? !place.parentId : false;

        } finally {
            _processingHierarchy = false;
        }
    }

    /**
     * Gets all root places (countries/kingdoms)
     * @param {Object} options - Filter options
     * @returns {Array} Array of root place objects
     */
    function getRootPlaces(options) {
        if (_processingHierarchy) {
            return [];
        }
        _processingHierarchy = true;

        try {
            return LocationState.getRootPlaces(options || { includeDeprecated: false });

        } finally {
            _processingHierarchy = false;
        }
    }

    /**
     * Gets the full hierarchy path as a formatted string
     * @param {string} placeId - Place ID
     * @param {string} separator - Separator string
     * @returns {string} Formatted hierarchy
     */
    function getHierarchyPath(placeId, separator) {
        if (_processingHierarchy) {
            return '';
        }
        _processingHierarchy = true;

        try {
            separator = separator || ' → ';
            var hierarchy = LocationState.getPlaceHierarchy(placeId);
            var names = [];
            for (var i = 0; i < hierarchy.length; i++) {
                names.push(hierarchy[i].displayName);
            }
            return names.join(separator);

        } finally {
            _processingHierarchy = false;
        }
    }

    // =========================================================================
    // 7. EXPORTS
    // =========================================================================

    window.LocationHierarchy = {
        // Validation
        validateHierarchy: validateHierarchy,

        // Inheritance
        getInheritanceChain: getInheritanceChain,

        // Relationship detection
        isAncestorOf: isAncestorOf,
        areInSameCountry: areInSameCountry,
        findLowestCommonAncestor: findLowestCommonAncestor,

        // Depth and type
        getLocationDepth: getLocationDepth,
        getTypeHierarchy: getTypeHierarchy,

        // Navigation helpers
        getAncestorAtPriority: getAncestorAtPriority,
        getDescendantsAtPriority: getDescendantsAtPriority,
        getImmediateAncestorAtPriority: getImmediateAncestorAtPriority,
        hasChildAtPriority: hasChildAtPriority,

        // Country/Region/County
        getCountryId: getCountryId,
        getRegionId: getRegionId,
        getRegionName: getRegionName,
        getCountyId: getCountyId,
        getCountyName: getCountyName,

        // Root helpers
        isRootPlace: isRootPlace,
        getRootPlaces: getRootPlaces,

        // Path
        getHierarchyPath: getHierarchyPath
    };

})();