/**
 * =============================================================================
 * STILL WATERS - LOCATION PRESENTATION (location-presentation.js)
 * =============================================================================
 * 
 * LOCATION: js/modules/locations/location-presentation.js
 * 
 * Display strings for locations. Consumes world.js queries.
 * 
 * DEPENDENCIES:
 *   - world.js (getCurrentPlace, getParentChain, getLocationCountry, ...)
 * 
 * ICON POLICY: No emojis. No icons.
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    function getCurrentLocationLabel(character) {
        if (typeof window.getCurrentPlace !== 'function') return 'Unknown';
        var place = window.getCurrentPlace(character);
        if (!place) return 'Unknown';
        return place.displayName || 'Unknown';
    }

    function getCountryLabel(place) {
        if (typeof window.getLocationCountry !== 'function') return 'Other Locations';
        var country = window.getLocationCountry(place);
        if (!country) return 'Other Locations';
        return country.displayName || 'Other Locations';
    }

    function getHierarchyDisplay(place, separator) {
        separator = separator || ' → ';
        if (typeof window.getParentChain !== 'function') return '';
        var chain = window.getParentChain(place);
        if (chain.length === 0) return '';
        var names = [];
        for (var i = 0; i < chain.length; i++) {
            if (chain[i].displayName) names.push(chain[i].displayName);
        }
        return names.join(separator);
    }

    function getGroupingLabel(group, separator) {
        separator = separator || ' → ';
        if (!group || !group.place) return 'Ungrouped';
        return getHierarchyDisplay(group.place, separator);
    }

    window.getCurrentLocationLabel = getCurrentLocationLabel;
    window.getCountryLabel = getCountryLabel;
    window.getHierarchyDisplay = getHierarchyDisplay;
    window.getGroupingLabel = getGroupingLabel;
})();