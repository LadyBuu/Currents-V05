// js/tabs/location-movement-tab.js
/**
 * =============================================================================
 * LOCATION MOVEMENT TAB
 * =============================================================================
 * 
 * Displays movement history (who moved here) and travel statistics.
 * 
 * Exports:
 *   - window.LocationMovementTab.render(containerId, locationId, onRefresh)
 * =============================================================================
 */

(function() {
    'use strict';

    function _escapeHtml(str) {
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
        if (typeof window._escapeHtml === 'function') return window._escapeHtml(str);
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function _getIcon(name) {
        return (window.Icons && window.Icons[name]) ? window.Icons[name] : '';
    }

    function _getPlace(id) {
        if (window.LocationQueries && window.LocationQueries.getPlace) {
            return window.LocationQueries.getPlace(id);
        }
        return null;
    }

    function _getMoveHistoryForLocation(locationId) {
        if (!window.CharacterQueries || !window.CharacterQueries.getAllCharacters) return [];
        
        var allChars = window.CharacterQueries.getAllCharacters();
        var events = [];
        
        for (var i = 0; i < allChars.length; i++) {
            var c = allChars[i];
            if (!c || !c.id || !Array.isArray(c.moves)) continue;
            
            for (var j = 0; j < c.moves.length; j++) {
                var m = c.moves[j];
                // If the move is to this location, or from this location
                if (m.locationId === locationId || m.fromLocationId === locationId) {
                    events.push({
                        character: c,
                        move: m,
                        isArrival: m.locationId === locationId,
                        isDeparture: m.fromLocationId === locationId
                    });
                }
            }
        }
        
        // Sort by year descending
        events.sort(function(a, b) {
            return (b.move.year || 0) - (a.move.year || 0);
        });
        
        return events;
    }

    function _getTravelRestrictions(locationId) {
        if (window.LocationMovement && window.LocationMovement.getTravelRestrictions) {
            // Optional: Could show restrictions for a dummy character here, but usually this is character-specific.
            // We'll skip the general restrictions and show a placeholder if needed.
            return [];
        }
        return [];
    }

    function render(containerId, locationId, onRefresh) {
        var container = document.getElementById(containerId);
        if (!container) return;

        var place = _getPlace(locationId);
        if (!place) {
            container.innerHTML = '<div class="empty-state">Location not found</div>';
            return;
        }

        var events = _getMoveHistoryForLocation(locationId);

        var html = '<div style="padding: 4px;">';

        // HEADER
        html += '<div style="background: var(--bg2); padding: 14px; border-radius: 8px; margin-bottom: 16px; border: 1px solid var(--border);">' +
            '<div style="font-size: 0.75rem; color: var(--accent-light); font-weight: bold; margin-bottom: 4px;">' + _getIcon('TIMELINE') + ' Movement History: ' + _escapeHtml(place.displayName) + '</div>' +
            '<div style="font-size: 0.6rem; color: var(--dim);">' + events.length + ' total movement events recorded</div>' +
            '</div>';

        // LIST
        html += '<div style="background: var(--bg2); padding: 14px; border-radius: 8px; border: 1px solid var(--border);">';
        
        if (events.length === 0) {
            html += '<div style="color: var(--dim); font-size: 0.7rem; text-align: center; padding: 12px 0;">No movement records found for this location.</div>';
        } else {
            html += '<div style="display: flex; flex-direction: column; gap: 6px; max-height: 500px; overflow-y: auto;">';
            
            for (var i = 0; i < events.length; i++) {
                var e = events[i];
                var char = e.character;
                var move = e.move;
                
                var charName = ((char.name || '') + ' ' + (char.surname || '')).trim() || 'Unknown';
                var year = move.year || '?';
                
                var actionColor = e.isArrival ? 'var(--ok)' : 'var(--danger-lt)';
                var actionText = e.isArrival ? 'Arrived' : 'Departed';
                var arrowIcon = e.isArrival ? '→' : '←';
                
                var otherLocId = e.isArrival ? move.fromLocationId : move.locationId;
                var otherLocName = move.fromLocationName;
                if (e.isArrival && !otherLocName && otherLocId) {
                    var otherPlace = _getPlace(otherLocId);
                    if (otherPlace) otherLocName = otherPlace.displayName;
                }
                
                var detailText = '';
                if (e.isArrival) {
                    detailText = 'from ' + (otherLocName || 'Unknown');
                } else {
                    detailText = 'to ' + (move.locationName || 'Unknown');
                }

                html += '<div style="display: flex; justify-content: space-between; align-items: center; background: var(--bg3); padding: 8px 12px; border-radius: 6px; border-left: 3px solid ' + actionColor + ';">' +
                    '<div style="display: flex; flex-direction: column; gap: 2px;">' +
                    '<div style="font-size: 0.7rem; font-weight: 500; color: var(--text);">' +
                    _escapeHtml(charName) +
                    '</div>' +
                    '<div style="font-size: 0.55rem; color: var(--dim);">' +
                    '<span style="color: ' + actionColor + '; font-weight: bold;">' + arrowIcon + ' ' + actionText + '</span> ' +
                    _escapeHtml(detailText) +
                    '</div>' +
                    '</div>' +
                    '<div style="font-size: 0.65rem; font-family: monospace; color: var(--dim); background: var(--bg); padding: 2px 8px; border-radius: 4px;">' +
                    'Year ' + _escapeHtml(String(year)) +
                    '</div>' +
                    '</div>';
            }
            html += '</div>';
        }
        
        html += '</div>';
        html += '</div>';

        container.innerHTML = html;
    }

    window.LocationMovementTab = {
        render: render
    };

})();
