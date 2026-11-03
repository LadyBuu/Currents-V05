// js/tabs/location-movement-tab.js
/**
 * =============================================================================
 * LOCATION MOVEMENT TAB
 * =============================================================================
 *
 * Displays every character move that touches this location — arrivals
 * (move.locationId === this place) and departures
 * (move.fromLocationId === this place), sorted newest-first.
 *
 * SCOPE
 * -----
 * - Read the place and the moves touching it via LocationQueries.
 * - Render the movement list with arrival/departure styling and year.
 *
 * OUT OF SCOPE
 * ------------
 * - Enumerating character moves (owned by LocationQueries.getMovesForLocation).
 * - Resolving current locations (owned by LocationQueries._resolveCurrentLocationId).
 * - Character name resolution (owned by CharacterQueries/accessors).
 * - Travel restrictions (owned by LocationMovement.getTravelRestrictions;
 *   not surfaced on this tab because it is character-specific).
 * - Inline CSS. All styling comes from css/location-tabs.css.
 *
 * HARD DEPENDENCIES (load-time):
 *   - js/core/formatting.js           (window.escapeHtml)
 *   - js/core/icons.js                (window.getIcon)
 *   - js/location/location-queries.js (window.LocationQueries)
 *
 * CALL-TIME DEPENDENCIES (soft — resolved per call):
 *   - window.getCharacterById  (character display name; 'Unknown' fallback)
 *   - window.LocationQueries.getMovesForLocation (added in location-queries.js)
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
            'location-movement-tab.js requires core/formatting.js ' +
            '(window.escapeHtml).'
        );
    }
    if (typeof window.getIcon !== 'function') {
        throw new Error(
            'location-movement-tab.js requires core/icons.js ' +
            '(window.getIcon).'
        );
    }
    if (!window.LocationQueries ||
        typeof window.LocationQueries.getPlace !== 'function') {
        throw new Error(
            'location-movement-tab.js requires location-queries.js ' +
            '(window.LocationQueries.getPlace).'
        );
    }

    // =========================================================================
    // 2. LOCAL ALIASES
    // =========================================================================

    var LQ = window.LocationQueries;

    // =========================================================================
    // 3. PRESENTATION HELPERS
    // =========================================================================

    function _characterName(character) {
        if (!character) return 'Unknown';
        var full = ((character.name || '') + ' ' +
                    (character.surname || '')).trim();
        return full || 'Unknown';
    }

    function _placeName(placeId, cachedName) {
        if (cachedName) return cachedName;
        if (!placeId) return 'Unknown';
        var p = LQ.getPlace(placeId);
        return p && p.displayName ? p.displayName : 'Unknown';
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

        // Enumerate moves touching this location via the shared query.
        // Falls back to [] if the query is missing (bare harness).
        var events = [];
        if (typeof LQ.getMovesForLocation === 'function') {
            events = LQ.getMovesForLocation(locationId) || [];
        }

        var html = '';

        // ---- HEADER ----
        html += '<div class="loc-tab-header">';
        html +=   '<div class="loc-tab-header-text">';
        html +=     '<div class="loc-tab-header-title">' +
                        window.getIcon('TIMELINE') + ' Movement History: ' +
                        window.escapeHtml(place.displayName) +
                    '</div>';
        html +=     '<div class="loc-tab-header-subtitle">' +
                        events.length + ' total movement event' +
                        (events.length === 1 ? '' : 's') + ' recorded' +
                    '</div>';
        html +=   '</div>';
        html += '</div>';

        // ---- LIST ----
        html += '<div class="loc-tab-section">';

        if (events.length === 0) {
            html += '<div class="loc-tab-empty">' +
                        'No movement records found for this location.' +
                    '</div>';
        } else {
            html += '<div class="loc-move-list">';

            for (var i = 0; i < events.length; i++) {
                var e = events[i];
                var move = e.move || {};
                var char = e.character || {};

                var isArrival = e.isArrival === true;
                var rowClass = isArrival
                    ? 'loc-move-row loc-move-row--arrival'
                    : 'loc-move-row loc-move-row--departure';

                var actionLabel = isArrival ? 'Arrived' : 'Departed';
                var arrow = isArrival ? '\u2192' : '\u2190'; // → / ←
                var charName = _characterName(char);
                var year = (move.year === null || move.year === undefined)
                    ? '?' : String(move.year);

                // Build the "from/to" detail line.
                var detail;
                if (isArrival) {
                    var fromName = _placeName(
                        move.fromLocationId, move.fromLocationName);
                    detail = 'from ' + fromName;
                } else {
                    var toName = _placeName(
                        move.locationId, move.locationName);
                    detail = 'to ' + toName;
                }

                html += '<div class="' + rowClass + '">';
                html +=   '<div class="loc-move-row-body">';
                html +=     '<div class="loc-move-row-char">' +
                                window.escapeHtml(charName) +
                            '</div>';
                html +=     '<div class="loc-move-row-detail">' +
                                '<span class="loc-move-row-action">' +
                                    window.escapeHtml(arrow + ' ' + actionLabel) +
                                '</span> ' +
                                window.escapeHtml(detail) +
                            '</div>';
                html +=   '</div>';
                html +=   '<div class="loc-move-row-year">' +
                                'Year ' + window.escapeHtml(year) +
                          '</div>';
                html += '</div>';
            }

            html += '</div>';
        }

        html += '</div>';

        container.innerHTML = html;

        // No interactive elements on this tab, so no event binding.
        // `onRefresh` is unused; the parameter is kept for signature
        // compatibility with the other tab renderers.
    }

    // =========================================================================
    // 5. EXPORTS
    // =========================================================================

    window.LocationMovementTab = { render: render };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.LocationMovementTab;
    }

})();
