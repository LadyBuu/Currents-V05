/**
 * =============================================================================
 * STILL WATERS - WORLD SYSTEM (js/core/world.js) - PURE QUERY LAYER
 * =============================================================================
 * 
 * This file contains PURE read-only queries using ONLY accessors.js.
 * NO dependency on location-state.js or any location system files.
 * 
 * DEPENDENCIES:
 *   - accessors.js (getPlaces, getPlaceById, getLocationTypes, getCharacters)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS (only accessors)
    // =========================================================================

    function _getPlaces() {
        return typeof window.getPlaces === 'function' ? window.getPlaces() : [];
    }

    function _getPlaceById(id) {
        return typeof window.getPlaceById === 'function' ? window.getPlaceById(id) : null;
    }

    function _getLocationTypes() {
        return typeof window.getLocationTypes === 'function' ? window.getLocationTypes() : [];
    }

    function _getLocationTypeById(id) {
        return typeof window.getLocationTypeById === 'function' ? window.getLocationTypeById(id) : null;
    }

    function _getCharacters() {
        return typeof window.getCharacters === 'function' ? window.getCharacters() : [];
    }

    // =========================================================================
    // 2. PURE LOCATION QUERIES (no state dependency)
    // =========================================================================

    function getLocationTypePriority(typeId) {
        var type = _getLocationTypeById(typeId);
        return type ? type.priority || 5 : 999;
    }

    function getPlacePriority(place) {
        if (!place) return 999;
        return getLocationTypePriority(place.typeId);
    }

    function getChildPlaces(parentId, recursive) {
        var places = _getPlaces();
        var result = [];

        for (var i = 0; i < places.length; i++) {
            if (places[i].parentId === parentId) {
                result.push(places[i]);
                if (recursive) {
                    var children = getChildPlaces(places[i].id, true);
                    result = result.concat(children);
                }
            }
        }
        return result;
    }

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

    function getPlacesByPriority(priority) {
        var places = _getPlaces();
        var result = [];
        for (var i = 0; i < places.length; i++) {
            var type = _getLocationTypeById(places[i].typeId);
            if (type && (type.priority || 5) === priority) {
                result.push(places[i]);
            }
        }
        return result;
    }

    function getLocationHierarchyDisplay(place) {
        if (!place) return '';
        var hierarchy = [];
        var current = place;
        var safety = 0;
        while (current && safety < 20) {
            hierarchy.unshift(current.displayName);
            if (!current.parentId) break;
            current = _getPlaceById(current.parentId);
            safety++;
        }
        return hierarchy.join(' → ');
    }

    function getParentChain(place) {
        if (!place) return [];
        var chain = [];
        var current = place;
        var safety = 0;
        while (current && safety < 20) {
            chain.unshift(current);
            if (!current.parentId) break;
            current = _getPlaceById(current.parentId);
            safety++;
        }
        return chain;
    }

    function isAncestorOf(possibleAncestor, place) {
        if (!possibleAncestor || !place) return false;
        var current = place;
        var safety = 0;
        while (current && safety < 20) {
            if (current.parentId === possibleAncestor.id) return true;
            current = _getPlaceById(current.parentId);
            safety++;
        }
        return false;
    }

    function getLocationCountry(place) {
        if (!place) return 'Other Locations';
        var chain = getParentChain(place);
        for (var i = 0; i < chain.length; i++) {
            var priority = getLocationTypePriority(chain[i].typeId);
            if (priority === 1) {
                return chain[i].displayName || 'Unknown';
            }
        }
        // If no country found, return the topmost
        if (chain.length > 0) {
            return chain[0].displayName || 'Other Locations';
        }
        return 'Other Locations';
    }

    function getLocationDistrict(place) {
        if (!place) return null;
        var chain = getParentChain(place);
        for (var i = 0; i < chain.length; i++) {
            var priority = getLocationTypePriority(chain[i].typeId);
            if (priority === 2) {
                return chain[i].displayName || null;
            }
        }
        return null;
    }

    // =========================================================================
    // 3. CHARACTER LOCATION QUERIES (pure, using moves data)
    // =========================================================================

    function getCurrentLocationId(character) {
        if (!character) return null;
        if (character.currentLocationId) return character.currentLocationId;

        // Check moves array (stored on character)
        if (character.moves && character.moves.length > 0) {
            var sorted = character.moves.slice().sort(function(a, b) {
                return (b.year || 0) - (a.year || 0);
            });
            if (sorted[0] && sorted[0].locationId) {
                return sorted[0].locationId;
            }
        }

        if (character.birthplaceId) return character.birthplaceId;
        return null;
    }

    function getCurrentLocation(character) {
        if (!character) return 'Unknown';
        var id = getCurrentLocationId(character);
        if (!id) return 'Unknown';
        var place = _getPlaceById(id);
        return place ? place.displayName : 'Unknown';
    }

    function getCharacterLocationPath(character) {
        if (!character) return [];
        var locId = getCurrentLocationId(character);
        if (!locId) return [];

        var place = _getPlaceById(locId);
        if (!place) return [];

        var chain = getParentChain(place);
        var path = [];
        for (var i = 0; i < chain.length; i++) {
            var p = chain[i];
            var priority = getLocationTypePriority(p.typeId);
            path.push({
                id: p.id,
                name: p.displayName,
                priority: priority,
                typeId: p.typeId
            });
        }
        return path;
    }

    function getCharactersGroupedByLocation(includeDeceased) {
        includeDeceased = includeDeceased || false;
        var characters = _getCharacters();
        var groups = {};
        var ungrouped = [];

        for (var i = 0; i < characters.length; i++) {
            var char = characters[i];
            if (!includeDeceased && char.isDeceased) continue;

            var locId = getCurrentLocationId(char);
            var place = locId ? _getPlaceById(locId) : null;
            var groupName = place ? getLocationHierarchyDisplay(place) : 'Ungrouped';

            if (groupName === 'Ungrouped' || !groupName) {
                ungrouped.push(char);
                continue;
            }
            if (!groups[groupName]) {
                groups[groupName] = [];
            }
            groups[groupName].push(char);
        }

        // Sort groups
        var result = {};
        var keys = Object.keys(groups).sort();
        for (var i = 0; i < keys.length; i++) {
            result[keys[i]] = groups[keys[i]];
        }
        if (ungrouped.length > 0) {
            result['Ungrouped'] = ungrouped;
        }

        return result;
    }

    // =========================================================================
    // 4. EXPORTS - PURE QUERIES ONLY
    // =========================================================================

    window.getChildPlaces = getChildPlaces;
    window.getPlacesByPriority = getPlacesByPriority;
    window.getTopLevelPlaces = getTopLevelPlaces;
    window.getLocationHierarchyDisplay = getLocationHierarchyDisplay;
    window.getLocationTypePriority = getLocationTypePriority;
    window.getPlacePriority = getPlacePriority;
    window.getLocationCountry = getLocationCountry;
    window.getLocationDistrict = getLocationDistrict;
    window.getParentChain = getParentChain;
    window.isAncestorOf = isAncestorOf;

    window.getCurrentLocationId = getCurrentLocationId;
    window.getCurrentLocation = getCurrentLocation;
    window.getCharacterLocationPath = getCharacterLocationPath;
    window.getCharactersGroupedByLocation = getCharactersGroupedByLocation;

})();