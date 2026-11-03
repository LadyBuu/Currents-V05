// js/tabs/location-leadership-tab.js
/**
 * =============================================================================
 * LOCATION LEADERSHIP TAB
 * =============================================================================
 * 
 * Displays current and past leaders for a location.
 * Allows assigning new leaders and ending active terms.
 * 
 * Exports:
 *   - window.LocationLeadershipTab.render(containerId, locationId, onRefresh)
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

    function _getCurrentLeader(locationId) {
        if (window.LocationQueries && window.LocationQueries.getCurrentLeader) {
            return window.LocationQueries.getCurrentLeader(locationId);
        }
        return null;
    }

    function _getLeaderHistory(locationId) {
        if (window.LocationQueries && window.LocationQueries.getLeaderHistory) {
            return window.LocationQueries.getLeaderHistory(locationId);
        }
        return [];
    }

    function _getCharacterName(charId) {
        if (!charId) return 'Unknown';
        if (window.CharacterQueries && window.CharacterQueries.getCharacterById) {
            var c = window.CharacterQueries.getCharacterById(charId);
            if (c) return ((c.name || '') + ' ' + (c.surname || '')).trim() || 'Unknown';
        }
        return 'Unknown';
    }

    function _assignLeader(locationId, characterId, startYear, title) {
        if (window.LocationCommands && window.LocationCommands.assignLeader) {
            return window.LocationCommands.assignLeader(locationId, characterId, startYear, title);
        }
        return { success: false, reason: 'LocationCommands unavailable' };
    }

    function _endLeaderTerm(locationId, characterId, endYear) {
        if (window.LocationCommands && window.LocationCommands.endLeaderTerm) {
            return window.LocationCommands.endLeaderTerm(locationId, characterId, endYear);
        }
        return { success: false, reason: 'LocationCommands unavailable' };
    }

    function _persist() {
        if (window.LocationCommands && window.LocationCommands.persist) {
            return window.LocationCommands.persist();
        }
        return { success: false, reason: 'persist unavailable' };
    }

    function _openCharacterSelector(options) {
        if (typeof window.openCharacterSelector === 'function') {
            return window.openCharacterSelector(options);
        }
        if (typeof window.openUnifiedCharacterSelector === 'function') {
            return window.openUnifiedCharacterSelector(options);
        }
        if (typeof window.showToast === 'function') {
            window.showToast('Character selector unavailable', 'error');
        }
        return null;
    }

    function _showToast(msg, type) {
        if (typeof window.showToast === 'function') window.showToast(msg, type);
        else if (typeof window._showToast === 'function') window._showToast(msg, type);
    }

    function render(containerId, locationId, onRefresh) {
        var container = document.getElementById(containerId);
        if (!container) return;

        var place = _getPlace(locationId);
        if (!place) {
            container.innerHTML = '<div class="empty-state">Location not found</div>';
            return;
        }

        var currentLeader = _getCurrentLeader(locationId);
        var history = _getLeaderHistory(locationId);

        var html = '<div style="padding: 4px;">';

        // HEADER
        html += '<div style="background: var(--bg2); padding: 14px; border-radius: 8px; margin-bottom: 16px; border: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">' +
            '<div>' +
            '<div style="font-size: 0.75rem; color: var(--accent-light); font-weight: bold;">' + _getIcon('CROWN') + ' Leadership: ' + _escapeHtml(place.displayName) + '</div>' +
            '<div style="font-size: 0.6rem; color: var(--dim);">Manage the ruler of this location</div>' +
            '</div>' +
            '<button id="assignLeaderBtn" class="btn" style="background: var(--accent); border: 1px solid var(--accent); color: var(--accent-fg); padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 0.65rem;">' +
            _getIcon('PLUS') + ' Assign Leader' +
            '</button>' +
            '</div>';

        // CURRENT LEADER
        html += '<div style="background: var(--bg2); border: 1px solid var(--border); border-radius: 8px; padding: 14px; margin-bottom: 16px;">';
        html += '<div style="font-size: 0.65rem; color: var(--accent-light); font-weight: bold; margin-bottom: 8px;">Current Leader</div>';
        
        if (currentLeader) {
            var leaderName = _getCharacterName(currentLeader.characterId);
            html += '<div style="display: flex; justify-content: space-between; align-items: center; background: var(--bg3); padding: 10px 14px; border-radius: 6px; border-left: 4px solid var(--accent);">' +
                '<div>' +
                '<div style="font-size: 0.85rem; font-weight: 600; color: var(--text);">' + _escapeHtml(leaderName) + '</div>' +
                '<div style="font-size: 0.6rem; color: var(--accent-light);">' + _escapeHtml(currentLeader.title || 'Leader') + '</div>' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Since year ' + (currentLeader.startYear || '?') + '</div>' +
                '</div>' +
                '<button id="endLeaderBtn" class="btn" data-char-id="' + currentLeader.characterId + '" style="background: transparent; border: 1px solid var(--danger-lt); color: var(--danger-lt); padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 0.6rem;">' +
                'End Term' +
                '</button>' +
                '</div>';
        } else {
            html += '<div style="color: var(--dim); font-size: 0.7rem; text-align: center; padding: 12px 0;">No current leader.</div>';
        }
        html += '</div>';

        // HISTORY
        html += '<div style="background: var(--bg2); border: 1px solid var(--border); border-radius: 8px; padding: 14px;">';
        html += '<div style="font-size: 0.65rem; color: var(--accent-light); font-weight: bold; margin-bottom: 8px;">Past Leaders (' + history.length + ')</div>';

        if (history.length === 0) {
            html += '<div style="color: var(--dim); font-size: 0.7rem; text-align: center; padding: 12px 0;">No past leaders recorded.</div>';
        } else {
            html += '<div style="display: flex; flex-direction: column; gap: 4px;">';
            for (var i = 0; i < history.length; i++) {
                var h = history[i];
                var hName = _getCharacterName(h.characterId);
                var isActive = h.isActive && !h.endYear;
                
                // Skip active leaders in the history list (they are in the current section)
                if (isActive) continue;

                html += '<div style="display: flex; justify-content: space-between; align-items: center; background: var(--bg3); padding: 8px 12px; border-radius: 4px;">' +
                    '<div>' +
                    '<div style="font-size: 0.7rem; color: var(--text); font-weight: 500;">' + _escapeHtml(hName) + '</div>' +
                    '<div style="font-size: 0.55rem; color: var(--dim);">' + _escapeHtml(h.title || 'Leader') + '</div>' +
                    '</div>' +
                    '<div style="font-size: 0.6rem; font-family: monospace; color: var(--dim);">' +
                    (h.startYear || '?') + ' – ' + (h.endYear || '?') +
                    '</div>' +
                    '</div>';
            }
            html += '</div>';
        }
        html += '</div>';

        html += '</div>';
        container.innerHTML = html;

        // Bind Assign Leader
        var assignBtn = container.querySelector('#assignLeaderBtn');
        if (assignBtn) {
            assignBtn.addEventListener('click', function() {
                _openCharacterSelector({
                    title: 'Select Leader for ' + place.displayName,
                    preset: 'available',
                    filters: { location: locationId, showDeceased: false },
                    onSelect: function(characterId) {
                        var year = (window.getCurrentYear) ? window.getCurrentYear() : 1250;
                        var res = _assignLeader(locationId, characterId, year, 'Leader');
                        if (!res || res.success !== true) {
                            _showToast(res && res.reason ? res.reason : 'Failed to assign', 'error');
                            return;
                        }
                        _persist();
                        _showToast('Leader assigned', 'success');
                        if (typeof onRefresh === 'function') onRefresh();
                    }
                });
            });
        }

        // Bind End Term
        var endBtn = container.querySelector('#endLeaderBtn');
        if (endBtn) {
            endBtn.addEventListener('click', function() {
                var charId = this.getAttribute('data-char-id');
                if (!charId) return;
                
                var year = (window.getCurrentYear) ? window.getCurrentYear() : 1250;
                var res = _endLeaderTerm(locationId, charId, year);
                if (!res || res.success !== true) {
                    _showToast(res && res.reason ? res.reason : 'Failed to end term', 'error');
                    return;
                }
                _persist();
                _showToast('Term ended', 'info');
                if (typeof onRefresh === 'function') onRefresh();
            });
        }
    }

    window.LocationLeadershipTab = {
        render: render
    };

})();
