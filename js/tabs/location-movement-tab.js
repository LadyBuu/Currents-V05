// js/tabs/location-movement-tab.js
/**
 * =============================================================================
 * LOCATION MOVEMENT TAB
 * js/tabs/location-movement-tab.js
 * =============================================================================
 *
 * LOCATION: js/tabs/location-movement-tab.js
 *
 * Displays every character move that touches this location — arrivals
 * (move.locationId === this place) and departures
 * (move.fromLocationId === this place), newest-first.
 *
 * RENDERER CONTRACT (from LocationManagerBootstrap):
 *   fn(container, context) where context = { locationId, locationName }
 *
 * DATA SOURCES:
 *   - LocationQueries.getPlace(id)
 *   - LocationQueries.getMovesForLocation(id)  (returns [{ move, character, isArrival }])
 *
 * FILTERS: none.
 *
 * DEPENDENCIES (all soft; guarded at call time):
 *   - LocationQueries — REQUIRED
 *   - TabManager      — REQUIRED
 *   - formatting.js   (escapeHtml) — REQUIRED
 *   - icons.js        (Icons)      — soft
 *
 * TIME CONTRACT: none (years are read from the move record, not the clock).
 * ICON POLICY: no emojis. The arrival/departure arrow is text (→ / ←), not an emoji.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Refactored to the Education tab skeleton:
 *     - Renderer contract is fn(container, context).
 *     - Registers with TabManager at load time.
 *     - Empty states are three-way: no-context / no-place / no-moves.
 *     - querySelectorAll+forEach pattern removed; no per-row listeners at all.
 * =============================================================================
 */

(function () {
    'use strict';

    var TAB_ID = 'movement';
    var SCOPE  = 'location';

    function _queries() {
        return (typeof window.LocationQueries !== 'undefined') ? window.LocationQueries : null;
    }
    function _tabManager() {
        return (typeof window.TabManager !== 'undefined') ? window.TabManager : null;
    }
    function _esc(v) {
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(v);
        if (v === null || v === undefined) return '';
        return String(v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function _icon(name) {
        if (typeof window.getIcon === 'function') {
            try { var s = window.getIcon(name); if (typeof s === 'string') return s; }
            catch (e) { /* fall through */ }
        }
        if (window.Icons && typeof window.Icons[name] === 'string') return window.Icons[name];
        return '';
    }

    function _characterName(character) {
        if (!character) return 'Unknown';
        var full = ((character.name || '') + ' ' + (character.surname || '')).trim();
        return full || 'Unknown';
    }
    function _placeName(placeId, cachedName, Q) {
        if (cachedName) return cachedName;
        if (!placeId) return 'Unknown';
        var p = Q.getPlace(placeId);
        return p && p.displayName ? p.displayName : 'Unknown';
    }

    function _renderEvent(e, Q) {
        var move = e.move || {};
        var char = e.character || {};
        var isArrival = e.isArrival === true;
        var rowClass = isArrival
            ? 'loc-move-row loc-move-row--arrival'
            : 'loc-move-row loc-move-row--departure';
        var actionLabel = isArrival ? 'Arrived' : 'Departed';
        var arrow = isArrival ? '\u2192' : '\u2190';
        var year = (move.year === null || move.year === undefined) ? '?' : String(move.year);

        var detail;
        if (isArrival) {
            detail = 'from ' + _placeName(move.fromLocationId, move.fromLocationName, Q);
        } else {
            detail = 'to ' + _placeName(move.locationId, move.locationName, Q);
        }

        var html = '<div class="' + rowClass + '">';
        html +=   '<div class="loc-move-row-body">';
        html +=     '<div class="loc-move-row-char">' + _esc(_characterName(char)) + '</div>';
        html +=     '<div class="loc-move-row-detail">' +
                      '<span class="loc-move-row-action">' + _esc(arrow + ' ' + actionLabel) + '</span> ' +
                      _esc(detail) +
                    '</div>';
        html +=   '</div>';
        html +=   '<div class="loc-move-row-year">Year ' + _esc(year) + '</div>';
        html += '</div>';
        return html;
    }

    function renderMovementTab(container, context) {
        if (!container) return;
        if (!context || !context.locationId) {
            container.innerHTML = '<div class="empty-state">Select a location from the sidebar.</div>';
            return;
        }
        var Q = _queries();
        if (!Q) {
            container.innerHTML =
                '<div class="rt-unavailable">LocationQueries is not available. ' +
                'Load js/location/location-queries.js.</div>';
            return;
        }
        var place = Q.getPlace(context.locationId);
        if (!place) {
            container.innerHTML = '<div class="empty-state">Location not found.</div>';
            return;
        }

        var events = [];
        if (typeof Q.getMovesForLocation === 'function') {
            try { events = Q.getMovesForLocation(context.locationId) || []; }
            catch (e) { events = []; }
        }

        var html = '<div class="loc-tab">';
        html += '<div class="loc-tab-header">' +
                    '<div class="loc-tab-header-text">' +
                      '<div class="loc-tab-header-title">' +
                        _icon('TIMELINE') + ' Movement History: ' + _esc(place.displayName) +
                      '</div>' +
                      '<div class="loc-tab-header-subtitle">' +
                        events.length + ' total movement event' +
                        (events.length === 1 ? '' : 's') + ' recorded' +
                      '</div>' +
                    '</div>' +
                '</div>';
        html += '<div class="loc-tab-section">';
        if (events.length === 0) {
            html += '<div class="loc-tab-empty">No movement records found for this location.</div>';
        } else {
            html += '<div class="loc-move-list">';
            for (var i = 0; i < events.length; i++) {
                html += _renderEvent(events[i], Q);
            }
            html += '</div>';
        }
        html += '</div>';
        html += '</div>';
        container.innerHTML = html;
    }

    var TM = _tabManager();
    if (TM && typeof TM.register === 'function') {
        TM.register(SCOPE, TAB_ID, renderMovementTab);
    } else if (typeof console !== 'undefined' && console.warn) {
        console.warn('location-movement-tab.js: TabManager is not available at load time; the tab was not registered. Load tab-manager.js first.');
    }

    window.LocationMovementTab = { id: TAB_ID, render: renderMovementTab };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.LocationMovementTab;
    }
})();
