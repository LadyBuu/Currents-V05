// js/tabs/location-population-tab.js
/**
 * =============================================================================
 * LOCATION POPULATION TAB
 * =============================================================================
 * 
 * Displays demographics and resident lists for a location.
 * 
 * Exports:
 *   - window.LocationPopulationTab.render(containerId, locationId, onRefresh)
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

    function _getPopulationStats(locationId) {
        if (window.LocationQueries && window.LocationQueries.getLocationStatistics) {
            return window.LocationQueries.getLocationStatistics(locationId);
        }
        return null;
    }

    function _getResidents(locationId) {
        if (!window.CharacterQueries || !window.CharacterQueries.getAllCharacters) return [];
        
        var allChars = window.CharacterQueries.getAllCharacters();
        var residents = [];
        
        for (var i = 0; i < allChars.length; i++) {
            var c = allChars[i];
            if (!c || !c.id) continue;
            
            // Resolve current location using the semantic query
            var locId = null;
            if (window.LocationQueries && window.LocationQueries.getCurrentLocationId) {
                locId = window.LocationQueries.getCurrentLocationId(c.id);
            }
            
            if (locId === locationId) {
                residents.push(c);
            }
        }
        return residents;
    }

    function _calculateAge(character) {
        if (!character || typeof character.birthYear !== 'number') return null;
        var currentYear = (window.getCurrentYear) ? window.getCurrentYear() : 1250;
        if (character.isDeceased) {
            if (typeof character.deathYear === 'number') {
                return Math.max(0, character.deathYear - character.birthYear);
            }
            return Math.max(0, currentYear - character.birthYear); // fallback
        }
        return Math.max(0, currentYear - character.birthYear);
    }

    function render(containerId, locationId, onRefresh) {
        var container = document.getElementById(containerId);
        if (!container) return;

        var place = _getPlace(locationId);
        if (!place) {
            container.innerHTML = '<div class="empty-state">Location not found</div>';
            return;
        }

        var stats = _getPopulationStats(locationId);
        var residents = _getResidents(locationId);

        // Calculate demographic breakdowns
        var living = 0;
        var deceased = 0;
        var children = 0; // < 18
        var adults = 0;   // 18 - 59
        var elderly = 0;  // >= 60

        for (var i = 0; i < residents.length; i++) {
            var c = residents[i];
            if (c.isDeceased) {
                deceased++;
                continue;
            }
            living++;
            var age = _calculateAge(c);
            if (age !== null) {
                if (age < 18) children++;
                else if (age >= 60) elderly++;
                else adults++;
            }
        }

        var html = '<div style="padding: 4px;">';

        // HEADER
        html += '<div style="background: var(--bg2); padding: 14px; border-radius: 8px; margin-bottom: 16px; border: 1px solid var(--border);">' +
            '<div style="font-size: 0.75rem; color: var(--accent-light); font-weight: bold; margin-bottom: 8px;">' + _getIcon('PERSON') + ' Demographics: ' + _escapeHtml(place.displayName) + '</div>' +
            '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 12px; text-align: center;">' +
            
            '<div style="background: var(--bg3); padding: 10px; border-radius: 6px;">' +
            '<div style="font-size: 1.2rem; font-weight: bold; color: var(--accent);">' + (stats ? stats.totalPopulation : 0) + '</div>' +
            '<div style="font-size: 0.55rem; color: var(--dim); text-transform: uppercase;">Total Pop</div>' +
            '</div>' +

            '<div style="background: var(--bg3); padding: 10px; border-radius: 6px;">' +
            '<div style="font-size: 1.2rem; font-weight: bold; color: var(--ok);">' + (stats ? stats.ownPopulation : 0) + '</div>' +
            '<div style="font-size: 0.55rem; color: var(--dim); text-transform: uppercase;">Direct Residents</div>' +
            '</div>' +

            '<div style="background: var(--bg3); padding: 10px; border-radius: 6px;">' +
            '<div style="font-size: 1.2rem; font-weight: bold; color: var(--text);">' + living + '</div>' +
            '<div style="font-size: 0.55rem; color: var(--dim); text-transform: uppercase;">Living</div>' +
            '</div>' +

            '<div style="background: var(--bg3); padding: 10px; border-radius: 6px;">' +
            '<div style="font-size: 1.2rem; font-weight: bold; color: var(--danger-lt);">' + deceased + '</div>' +
            '<div style="font-size: 0.55rem; color: var(--dim); text-transform: uppercase;">Deceased</div>' +
            '</div>' +

            '</div>' +
            '</div>';

        // AGE BREAKDOWN
        html += '<div style="background: var(--bg2); padding: 14px; border-radius: 8px; margin-bottom: 16px; border: 1px solid var(--border);">' +
            '<div style="font-size: 0.65rem; color: var(--accent-light); font-weight: bold; margin-bottom: 8px;">Age Breakdown (Living)</div>' +
            '<div style="display: flex; gap: 16px; flex-wrap: wrap;">' +
            '<div><span style="color: var(--dim); font-size: 0.6rem;">Children (0-17):</span> <span style="color: var(--text); font-weight: bold;">' + children + '</span></div>' +
            '<div><span style="color: var(--dim); font-size: 0.6rem;">Adults (18-59):</span> <span style="color: var(--text); font-weight: bold;">' + adults + '</span></div>' +
            '<div><span style="color: var(--dim); font-size: 0.6rem;">Elderly (60+):</span> <span style="color: var(--text); font-weight: bold;">' + elderly + '</span></div>' +
            '</div>' +
            '</div>';

        // RESIDENT LIST
        html += '<div style="background: var(--bg2); padding: 14px; border-radius: 8px; border: 1px solid var(--border);">' +
            '<div style="font-size: 0.65rem; color: var(--accent-light); font-weight: bold; margin-bottom: 8px;">Resident List (' + residents.length + ')</div>';

        if (residents.length === 0) {
            html += '<div style="color: var(--dim); font-size: 0.7rem; text-align: center; padding: 12px 0;">No characters reside here.</div>';
        } else {
            html += '<div style="display: flex; flex-direction: column; gap: 4px; max-height: 400px; overflow-y: auto;">';
            
            // Sort residents by name
            residents.sort(function(a, b) {
                var nameA = (a.name || '') + ' ' + (a.surname || '');
                var nameB = (b.name || '') + ' ' + (b.surname || '');
                return nameA.localeCompare(nameB);
            });

            for (var k = 0; k < residents.length; k++) {
                var res = residents[k];
                var resName = ((res.name || '') + ' ' + (res.surname || '')).trim() || 'Unknown';
                var age = _calculateAge(res);
                var isDead = res.isDeceased === true;
                
                var statusIcon = isDead ? '<span style="color: var(--danger-lt); font-size: 0.6rem;">(Deceased)</span>' : '';
                var genderIcon = res.gender === 'male' ? '♂' : (res.gender === 'female' ? '♀' : '?');

                html += '<div style="display: flex; justify-content: space-between; align-items: center; background: var(--bg3); padding: 6px 10px; border-radius: 4px;">' +
                    '<div style="font-size: 0.7rem; color: var(--text); display: flex; align-items: center; gap: 6px;">' +
                    '<span style="opacity: 0.6;">' + genderIcon + '</span>' +
                    '<span>' + _escapeHtml(resName) + '</span>' +
                    statusIcon +
                    '</div>' +
                    '<div style="font-size: 0.6rem; color: var(--dim);">' +
                    (age !== null ? age + ' years' : 'Age unknown') +
                    '</div>' +
                    '</div>';
            }
            html += '</div>';
        }

        html += '</div>';
        html += '</div>';

        container.innerHTML = html;
    }

    window.LocationPopulationTab = {
        render: render
    };

})();
