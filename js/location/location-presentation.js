/**
 * =============================================================================
 * LOCATION PRESENTATION
 * =============================================================================
 *
 * Thin formatting helpers.
 * No domain resolution. No dependency fallbacks. No fabricated values.
 *
 * Input: domain objects or values.
 * Output: strings for display.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    function getPlaceLabel(place) {
        if (!place) return null;
        return place.displayName || null;
    }

    function getCountryLabel(countryPlace) {
        if (!countryPlace) return 'Other Locations';
        return countryPlace.displayName || 'Other Locations';
    }

    function getHierarchyDisplay(chain, separator) {
        var joiner = separator === undefined || separator === null ? ' → ' : separator;
        if (!chain || chain.length === 0) return '';
        var names = [];
        for (var i = 0; i < chain.length; i++) {
            var p = chain[i];
            if (p && p.displayName) names.push(p.displayName);
        }
        return names.join(joiner);
    }

    function getGroupingLabel(group, separator) {
        if (!group || !group.place) return 'Ungrouped';
        var chain = window.LocationQueries
            ? window.LocationQueries.getPlaceHierarchy(group.place.id)
            : [];
        return getHierarchyDisplay(chain, separator);
    }

    window.LocationPresentation = {
        getPlaceLabel: getPlaceLabel,
        getCountryLabel: getCountryLabel,
        getHierarchyDisplay: getHierarchyDisplay,
        getGroupingLabel: getGroupingLabel
    };

})();
