// js/tabs/location-population-tab.js
/**
 * =============================================================================
 * LOCATION POPULATION TAB
 * =============================================================================
 *
 * Displays demographics and resident lists for a location.
 *
 * SCOPE
 * -----
 * - Read population statistics via LocationQueries.getLocationStatistics.
 * - Read the resident list via LocationQueries.getResidentsAtLocation.
 * - Compute age-band breakdowns (children / adults / elderly) for
 *   presentation — this is a presentation aggregation, not domain logic.
 * - Render the stats header, age breakdown, and resident list.
 *
 * OUT OF SCOPE
 * ------------
 * - Enumerating residents (owned by LocationQueries.getResidentsAtLocation).
 * - Current-location resolution (owned by LocationQueries._resolveCurrentLocationId).
 * - Age computation (owned by time.js window.calculateAge).
 * - Character name resolution (owned by CharacterQueries/accessors).
 * - Inline CSS. All styling comes from css/location-tabs.css.
 *
 * HARD DEPENDENCIES (load-time):
 *   - js/core/formatting.js           (window.escapeHtml)
 *   - js/core/icons.js                (window.getIcon)
 *   - js/location/location-queries.js (window.LocationQueries)
 *
 * CALL-TIME DEPENDENCIES (soft — resolved per call):
 *   - window.getCharacterById  (character projection for name/age/gender)
 *   - window.calculateAge      (canonical age; time.js)
 *   - window.getCurrentYear    (fallback year for calculateAge; time.js)
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. LOAD-TIME DEPENDENCY CHECKS
    // =========================================================================

    if (typeof window.escapeHtml !== 'function') {
        throw new Error(
            'location-population-tab.js requires core/formatting.js ' +
            '(window.escapeHtml).'
        );
    }
    if (typeof window.getIcon !== 'function') {
        throw new Error(
            'location-population-tab.js requires core/icons.js ' +
            '(window.getIcon).'
        );
    }
    if (!window.LocationQueries ||
        typeof window.LocationQueries.getPlace !== 'function' ||
        typeof window.LocationQueries.getLocationStatistics !== 'function') {
        throw new Error(
            'location-population-tab.js requires location-queries.js ' +
            '(getPlace, getLocationStatistics).'
        );
    }

    // =========================================================================
    // 2. LOCAL ALIASES
    // =========================================================================

    var LQ = window.LocationQueries;

    // =========================================================================
    // 3. PRESENTATION HELPERS
    // =========================================================================

    /**
     * Resolve a character's age via the canonical time.js calculator.
     * Returns null when birthYear is missing or calculateAge is absent.
     * This is a thin wrapper — the actual arithmetic lives in time.js.
     */
    function _ageOf(character) {
        if (!character) return null;
        if (typeof character.birthYear !== 'number') return null;
        if (typeof window.calculateAge !== 'function') return null;
        var currentYear = (typeof window.getCurrentYear === 'function')
            ? window.getCurrentYear()
            : null;
        if (currentYear === null) return null;
        return window.calculateAge(
            character.birthYear,
            character.isDeceased === true,
            character.deathYear,
            currentYear
        );
    }

    function _displayName(character) {
        if (!character) return 'Unknown';
        var full = ((character.name || '') + ' ' +
                    (character.surname || '')).trim();
        return full || 'Unknown';
    }

    function _genderIcon(gender) {
        if (gender === 'male') return '\u2642';   // ♂
        if (gender === 'female') return '\u2640'; // ♀
        return '?';
    }

    // =========================================================================
    // 4. RENDER
    // =========================================================================

    function render(containerId, locationId, onRefresh) {
        var container = document.getElementById(containerId);
        if (!container) return;

        var place = LQ.getPlace(locationId);
        if (!place) {
            container.innerHTML =
                '<div class="empty-state">Location not found</div>';
            return;
        }

        var stats = LQ.getLocationStatistics(locationId) || {};

        // Resident enumeration via the shared query. Falls back to []
        // in a bare harness where the query is absent.
        var residents = [];
        if (typeof LQ.getResidentsAtLocation === 'function') {
            residents = LQ.getResidentsAtLocation(locationId, {
                includeDeceased: true
            }) || [];
        }

        // Age-band aggregation. This is presentation shape, not a domain
        // fact — the same residents could be bucketed differently by a
        // different view. Keep the boundaries local to this tab.
        var living = 0;
        var deceased = 0;
        var children = 0;   // < 18
        var adults = 0;     // 18–59
        var elderly = 0;    // >= 60

        for (var i = 0; i < residents.length; i++) {
            var c = residents[i];
            if (c.isDeceased === true) {
                deceased++;
                continue;
            }
            living++;
            var age = _ageOf(c);
            if (age === null) continue;
            if (age < 18) children++;
            else if (age >= 60) elderly++;
            else adults++;
        }

        var html = '';

        // ---- HEADER + STATS ----
        html += '<div class="loc-tab-header">';
        html +=   '<div class="loc-tab-header-text">';
        html +=     '<div class="loc-tab-header-title">' +
                        window.getIcon('PERSON') + ' Demographics: ' +
                        window.escapeHtml(place.displayName) +
                    '</div>';
        html +=   '</div>';
        html += '</div>';

        html += '<div class="loc-tab-stats-grid loc-tab-stats-grid--wrap">';

        html +=   '<div class="loc-tab-stat">';
        html +=     '<div class="loc-tab-stat-value loc-tab-stat-value--accent">' +
                        (stats.totalPopulation || 0).toLocaleString() +
                    '</div>';
        html +=     '<div class="loc-tab-stat-label">Total Pop</div>';
        html +=   '</div>';

        html +=   '<div class="loc-tab-stat">';
        html +=     '<div class="loc-tab-stat-value loc-tab-stat-value--ok">' +
                        (stats.ownPopulation || 0).toLocaleString() +
                    '</div>';
        html +=     '<div class="loc-tab-stat-label">Direct Residents</div>';
        html +=   '</div>';

        html +=   '<div class="loc-tab-stat">';
        html +=     '<div class="loc-tab-stat-value">' +
                        living.toLocaleString() +
                    '</div>';
        html +=     '<div class="loc-tab-stat-label">Living</div>';
        html +=   '</div>';

        html +=   '<div class="loc-tab-stat">';
        html +=     '<div class="loc-tab-stat-value loc-tab-stat-value--danger">' +
                        deceased.toLocaleString() +
                    '</div>';
        html +=     '<div class="loc-tab-stat-label">Deceased</div>';
        html +=   '</div>';

        html += '</div>';

        // ---- AGE BREAKDOWN ----
        html += '<div class="loc-tab-section">';
        html +=   '<div class="loc-tab-section-title">Age Breakdown (Living)</div>';
        html +=   '<div class="loc-pop-age-row">';
        html +=     '<div><span class="loc-tab-label">Children (0-17):</span> ' +
                        '<span class="loc-tab-value loc-tab-value--bold">' +
                            children + '</span></div>';
        html +=     '<div><span class="loc-tab-label">Adults (18-59):</span> ' +
                        '<span class="loc-tab-value loc-tab-value--bold">' +
                            adults + '</span></div>';
        html +=     '<div><span class="loc-tab-label">Elderly (60+):</span> ' +
                        '<span class="loc-tab-value loc-tab-value--bold">' +
                            elderly + '</span></div>';
        html +=   '</div>';
        html += '</div>';

        // ---- RESIDENT LIST ----
        html += '<div class="loc-tab-section">';
        html +=   '<div class="loc-tab-section-title">' +
                    'Resident List (' + residents.length + ')' +
                  '</div>';

        if (residents.length === 0) {
            html += '<div class="loc-tab-empty">' +
                        'No characters reside here.' +
                    '</div>';
        } else {
            // Sort by full name for stable, scannable display.
            var sorted = residents.slice().sort(function (a, b) {
                return _displayName(a).localeCompare(_displayName(b));
            });

            html += '<div class="loc-resident-list">';
            for (var k = 0; k < sorted.length; k++) {
                var res = sorted[k];
                var resName = _displayName(res);
                var age = _ageOf(res);
                var isDead = res.isDeceased === true;
                var genderSym = _genderIcon(res.gender);

                html += '<div class="loc-resident-row">';
                html +=   '<div class="loc-resident-row-name">';
                html +=     '<span class="loc-resident-row-gender">' +
                                window.escapeHtml(genderSym) +
                            '</span>';
                html +=     '<span>' + window.escapeHtml(resName) + '</span>';
                if (isDead) {
                    html += '<span class="loc-resident-row-deceased">' +
                                '(Deceased)' +
                            '</span>';
                }
                html +=   '</div>';
                html +=   '<div class="loc-resident-row-age">' +
                            (age !== null
                                ? window.escapeHtml(String(age)) + ' years'
                                : 'Age unknown') +
                          '</div>';
                html += '</div>';
            }
            html += '</div>';
        }

        html += '</div>';

        container.innerHTML = html;

        // No interactive elements on this tab. `onRefresh` is kept for
        // signature compatibility with the other tab renderers.
    }

    // =========================================================================
    // 5. EXPORTS
    // =========================================================================

    window.LocationPopulationTab = { render: render };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.LocationPopulationTab;
    }

})();
