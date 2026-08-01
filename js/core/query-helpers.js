/**
 * =============================================================================
 * QUERY HELPERS - Core query utilities (js/core/query-helpers.js)
 * =============================================================================
 * 
 * This file provides basic query utilities using ONLY core dependencies.
 * NO dependencies on system files (relationship-registry, etc.)
 * 
 * DEPENDENCIES:
 *   - accessors.js (core)
 *   - time.js (core)
 *   - constants.js (core)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS - Core only
    // =========================================================================

    function _getCharacterById(id) {
        return typeof window.getCharacterById === 'function' ? window.getCharacterById(id) : null;
    }

    function _getCharacters() {
        return typeof window.getCharacters === 'function' ? window.getCharacters() : [];
    }

    function _getPlaceById(id) {
        return typeof window.getPlaceById === 'function' ? window.getPlaceById(id) : null;
    }

    function _getPlaces() {
        return typeof window.getPlaces === 'function' ? window.getPlaces() : [];
    }

    function _getCurrentYear() {
        if (typeof window.getCurrentYearSafe === 'function') return window.getCurrentYearSafe();
        if (typeof window.getCurrentYear === 'function') return window.getCurrentYear();
        return 1250;
    }

    function _calculateAge(birthYear, isDeceased, deathYear) {
        if (typeof window.calculateAge === 'function') {
            return window.calculateAge(birthYear, isDeceased, deathYear);
        }
        var currentYear = _getCurrentYear();
        if (!birthYear) return 0;
        if (isDeceased && deathYear) return Math.max(0, deathYear - birthYear);
        return Math.max(0, currentYear - birthYear);
    }

    function _getAgeGroups() {
        return window.AGE_GROUPS || ['0-10', '11-20', '21-30', '31-40', '41-50', '51-60', '61-70', '71-80', '81-90', '91+'];
    }

    function _getAgeGroupLabel(group) {
        if (window.AGE_GROUPS_MAP && window.AGE_GROUPS_MAP[group]) {
            return window.AGE_GROUPS_MAP[group].label;
        }
        return group + ' years';
    }

    // =========================================================================
    // 2. CHARACTER STATUS - Pure core logic (no relationship system)
    // =========================================================================

    /**
     * Gets character status using ONLY character data (no relationship system)
     * This is a core-level query that doesn't depend on system files.
     */
    function getCharacterStatusBasic(char) {
        if (!char) return 'single';
        if (char.isDeceased) return 'deceased';

        // Check relationships array directly (this is on the character object)
        if (char.relationships && char.relationships.length > 0) {
            var hasActivePartner = false;
            var hasWidowed = false;

            for (var i = 0; i < char.relationships.length; i++) {
                var rel = char.relationships[i];
                var relType = rel.type || (rel.details && rel.details.type);
                
                if (relType === 'committed' || relType === 'marriage' || relType === 'romance' || relType === 'casual_dating') {
                    if (rel.status === 'ongoing' || rel.status === 'active') {
                        hasActivePartner = true;
                    } else if (rel.status === 'widowed') {
                        hasWidowed = true;
                    }
                }
            }

            if (hasActivePartner) return 'partnered';
            if (hasWidowed) return 'widowed';
        }

        return 'single';
    }

    // =========================================================================
    // 3. CHARACTER ROLES - Core only
    // =========================================================================

    function getCharacterRoles(char) {
        if (!char || !char.professions) return [];
        var roles = [];
        for (var i = 0; i < char.professions.length; i++) {
            var prof = char.professions[i];
            if (typeof prof === 'string') {
                roles.push(prof);
            } else if (prof && typeof prof === 'object') {
                roles.push(prof.name || prof.id || '');
            }
        }
        return roles;
    }

    // =========================================================================
    // 4. CHARACTER LOCATION - Core only
    // =========================================================================

    function getCharacterLocationId(char) {
        if (!char) return null;
        if (char.currentLocationId) return char.currentLocationId;
        if (char.currentLocation) return char.currentLocation;

        if (char.moves && char.moves.length > 0) {
            var sorted = char.moves.slice().sort(function(a, b) {
                return (b.year || 0) - (a.year || 0);
            });
            if (sorted[0] && sorted[0].locationId) {
                return sorted[0].locationId;
            }
        }

        return char.birthplaceId || null;
    }

    function getCharacterLocationName(char) {
        var locId = getCharacterLocationId(char);
        if (!locId) return 'Unknown';
        var place = _getPlaceById(locId);
        return place ? place.displayName : 'Unknown';
    }

    // =========================================================================
    // 5. PARENT/CHILD QUERIES - Core only (no relationship system)
    // =========================================================================

    function getCharacterParents(char) {
        if (!char) return { father: null, mother: null };
        return {
            father: char.fatherId ? _getCharacterById(char.fatherId) : null,
            mother: char.motherId ? _getCharacterById(char.motherId) : null
        };
    }

    function getCharacterChildren(char) {
        if (!char) return [];
        var allChars = _getCharacters();
        var children = [];
        for (var i = 0; i < allChars.length; i++) {
            var c = allChars[i];
            if (c.motherId === char.id || c.fatherId === char.id) {
                children.push(c);
            }
        }
        return children;
    }

    function getCharacterHasChildren(char) {
        return getCharacterChildren(char).length > 0;
    }

    function getCharacterHasParents(char) {
        var parents = getCharacterParents(char);
        return !!(parents.father || parents.mother);
    }

    // =========================================================================
    // 6. AGE GROUP - Core only
    // =========================================================================

    function getAgeGroupForAge(age) {
        var groups = _getAgeGroups();
        for (var i = 0; i < groups.length; i++) {
            var parts = groups[i].split('-');
            var min = parseInt(parts[0]);
            var max = parts[1] === '+' ? Infinity : parseInt(parts[1]);
            if (age >= min && age <= max) {
                return groups[i];
            }
        }
        return groups[groups.length - 1];
    }

    function getAgeGroupLabel(group) {
        return _getAgeGroupLabel(group);
    }

    // =========================================================================
    // 7. LOCATION HIERARCHY - Core only
    // =========================================================================

    function getLocationHierarchy(place) {
        if (!place) return [];
        var hierarchy = [];
        var current = place;
        var safety = 0;
        while (current && safety < 20) {
            hierarchy.unshift(current);
            if (!current.parentId) break;
            current = _getPlaceById(current.parentId);
            safety++;
        }
        return hierarchy;
    }

    function getLocationHierarchyDisplay(place) {
        var hierarchy = getLocationHierarchy(place);
        return hierarchy.map(function(p) { return p.displayName; }).join(' → ');
    }

    function getAllLocationsHierarchical() {
        var places = _getPlaces();
        var locationMap = {};

        for (var i = 0; i < places.length; i++) {
            var place = places[i];
            if (place.variableKey !== undefined && place.variableKey !== '') {
                locationMap[place.id] = {
                    id: place.id,
                    name: place.displayName || place.name || 'Unknown',
                    parentId: place.parentId || null,
                    children: []
                };
            }
        }

        var roots = [];
        for (var id in locationMap) {
            if (locationMap.hasOwnProperty(id)) {
                var node = locationMap[id];
                if (node.parentId && locationMap[node.parentId]) {
                    locationMap[node.parentId].children.push(node);
                } else {
                    roots.push(node);
                }
            }
        }

        function sortNodes(nodes) {
            nodes.sort(function(a, b) { return a.name.localeCompare(b.name); });
            for (var i = 0; i < nodes.length; i++) {
                if (nodes[i].children && nodes[i].children.length > 0) {
                    sortNodes(nodes[i].children);
                }
            }
        }
        sortNodes(roots);

        function flattenNodes(nodes, depth) {
            depth = depth || 0;
            var flat = [];
            var indent = '';
            for (var j = 0; j < depth; j++) {
                indent += '  ';
            }
            for (var i = 0; i < nodes.length; i++) {
                var node = nodes[i];
                flat.push({
                    id: node.id,
                    name: node.name,
                    displayName: indent + node.name,
                    depth: depth
                });
                if (node.children && node.children.length > 0) {
                    var childFlat = flattenNodes(node.children, depth + 1);
                    flat = flat.concat(childFlat);
                }
            }
            return flat;
        }

        return flattenNodes(roots);
    }

    // =========================================================================
    // 8. EXPORTS
    // =========================================================================

    window.QueryHelpers = {
        getCharacterStatusBasic: getCharacterStatusBasic,
        getCharacterRoles: getCharacterRoles,
        getCharacterLocationId: getCharacterLocationId,
        getCharacterLocationName: getCharacterLocationName,
        getCharacterParents: getCharacterParents,
        getCharacterChildren: getCharacterChildren,
        getCharacterHasChildren: getCharacterHasChildren,
        getCharacterHasParents: getCharacterHasParents,
        getAgeGroupForAge: getAgeGroupForAge,
        getAgeGroupLabel: getAgeGroupLabel,
        getLocationHierarchy: getLocationHierarchy,
        getLocationHierarchyDisplay: getLocationHierarchyDisplay,
        getAllLocationsHierarchical: getAllLocationsHierarchical,
        // Core accessors passed through
        getCharacterById: _getCharacterById,
        getCharacters: _getCharacters,
        getPlaceById: _getPlaceById,
        getPlaces: _getPlaces,
        getCurrentYear: _getCurrentYear,
        calculateAge: _calculateAge
    };

    // Backward compatibility aliases
    window._getCharacterById = _getCharacterById;
    window._getCharacters = _getCharacters;
    window._getPlaceById = _getPlaceById;
    window._getPlaces = _getPlaces;
    window._getCurrentYear = _getCurrentYear;
    window._calculateAge = _calculateAge;

})();