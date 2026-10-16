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
 * Depends on (checked at load time):
 *   - LocationQueries
 *
 * Load order note:
 *   This file has no dependents among the location modules. It is
 *   optional — the domain functions without it. UI code that renders
 *   grouping labels uses it.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. HARD DEPENDENCY CHECKS (load time)
    // =========================================================================

    if (!window.LocationQueries) {
        throw new Error(
            'location-presentation.js requires location-queries.js first.'
        );
    }

    var LQ = window.LocationQueries;

    // =========================================================================
    // 2. FORMATTING
    // =========================================================================

    /**
     * Display label for a place. Returns null if the place is missing or
     * has no displayName. Does not fabricate '(unnamed)' — that decision
     * belongs to LocationViewModels.
     */
    function getPlaceLabel(place) {
        if (!place) return null;
        if (typeof place.displayName !== 'string') return null;
        if (place.displayName.length === 0) return null;
        return place.displayName;
    }

    /**
     * Display label for a country place. Falls back to 'Other Locations'
     * only when the country is missing — that is a presentation decision,
     * not a domain fallback.
     */
    function getCountryLabel(countryPlace) {
        if (!countryPlace) return 'Other Locations';
        if (typeof countryPlace.displayName !== 'string') {
            return 'Other Locations';
        }
        if (countryPlace.displayName.length === 0) {
            return 'Other Locations';
        }
        return countryPlace.displayName;
    }

    /**
     * Formats an array of place records as a joined hierarchy string.
     * separator defaults to ' → '.
     *
     * Skips records with missing or empty displayName. Returns '' if
     * nothing to join.
     */
    function getHierarchyDisplay(chain, separator) {
        var joiner = (separator === undefined || separator === null)
            ? ' → '
            : separator;
        if (!chain || chain.length === 0) return '';

        var names = [];
        for (var i = 0; i < chain.length; i++) {
            var p = chain[i];
            if (p && typeof p.displayName === 'string' &&
                p.displayName.length > 0) {
                names.push(p.displayName);
            }
        }
        return names.join(joiner);
    }

    /**
     * Grouping label for a place group. group.place is required.
     * Returns 'Ungrouped' when group or group.place is missing.
     *
     * Uses the full hierarchy chain from LocationQueries.
     */
    function getGroupingLabel(group, separator) {
        if (!group || !group.place) return 'Ungrouped';
        var chain = LQ.getPlaceHierarchy(group.place.id);
        return getHierarchyDisplay(chain, separator);
    }

    // =========================================================================
    // 3. EXPORTS
    // =========================================================================

    window.LocationPresentation = {
        getPlaceLabel: getPlaceLabel,
        getCountryLabel: getCountryLabel,
        getHierarchyDisplay: getHierarchyDisplay,
        getGroupingLabel: getGroupingLabel
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.LocationPresentation;
    }

})();
