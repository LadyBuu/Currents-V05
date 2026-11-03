// js/tabs/location-leadership-tab.js
/**
 * =============================================================================
 * LOCATION LEADERSHIP TAB
 * =============================================================================
 *
 * Displays the current leader and the leader history for a location.
 * Allows assigning a new leader and ending an active term.
 *
 * SCOPE
 * -----
 * - Read the current leader and history via LocationQueries.
 * - Render the current leader card and the history list.
 * - Provide "Assign Leader" and "End Term" actions that call
 *   LocationCommands.assignLeader / endLeaderTerm, then persist
 *   exactly once via LocationCommands.persist().
 * - Open the shared character selector modal to pick a new leader.
 *
 * OUT OF SCOPE
 * ------------
 * - Leader assignment storage (owned by place.leaderAssignments).
 * - Character name resolution (owned by CharacterQueries/accessors).
 * - Character selector UI (owned by selectors/modals-char-selector.js).
 * - Modal / toast plumbing (owned by core/ui.js and modals-core.js).
 * - Inline CSS. All styling comes from css/location-tabs.css.
 *
 * HARD DEPENDENCIES (load-time):
 *   - js/core/formatting.js           (window.escapeHtml)
 *   - js/core/icons.js                (window.getIcon)
 *   - js/location/location-queries.js (window.LocationQueries)
 *   - js/location/location-commands.js (window.LocationCommands)
 *
 * OPTIONAL DEPENDENCIES (call-time, guarded):
 *   - window.openCharacterSelector (or openUnifiedCharacterSelector)
 *   - window.getCharacterById      (character display-name resolution)
 *   - window.getCurrentYear        (year default for term boundaries)
 *   - window.showToast             (user feedback)
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
            'location-leadership-tab.js requires core/formatting.js ' +
            '(window.escapeHtml).'
        );
    }
    if (typeof window.getIcon !== 'function') {
        throw new Error(
            'location-leadership-tab.js requires core/icons.js ' +
            '(window.getIcon).'
        );
    }
    if (!window.LocationQueries ||
        typeof window.LocationQueries.getPlace !== 'function' ||
        typeof window.LocationQueries.getCurrentLeader !== 'function' ||
        typeof window.LocationQueries.getLeaderHistory !== 'function') {
        throw new Error(
            'location-leadership-tab.js requires location-queries.js ' +
            '(getPlace, getCurrentLeader, getLeaderHistory).'
        );
    }
    if (!window.LocationCommands ||
        typeof window.LocationCommands.assignLeader !== 'function' ||
        typeof window.LocationCommands.endLeaderTerm !== 'function' ||
        typeof window.LocationCommands.persist !== 'function') {
        throw new Error(
            'location-leadership-tab.js requires location-commands.js ' +
            '(assignLeader, endLeaderTerm, persist).'
        );
    }

    // =========================================================================
    // 2. LOCAL ALIASES (direct references — no wrappers)
    // =========================================================================

    var LQ = window.LocationQueries;
    var LC = window.LocationCommands;

    // =========================================================================
    // 3. SMALL PRESENTATION HELPERS
    //    (resolve names / years; do not reimplement domain logic)
    // =========================================================================

    /**
     * Resolve a character's display name. Character projections are the
     * canonical shape returned by window.getCharacterById under the
     * documented load order. Returns 'Unknown' for a missing record; that
     * is a presentation fallback, not a domain default.
     */
    function _characterName(characterId) {
        if (!characterId) return 'Unknown';
        if (typeof window.getCharacterById !== 'function') return 'Unknown';
        var c = window.getCharacterById(characterId);
        if (!c) return 'Unknown';
        var full = ((c.name || '') + ' ' + (c.surname || '')).trim();
        return full || 'Unknown';
    }

    /**
     * The current world year, with the documented default fallback. The
     * location domain uses getCurrentYear (not getCurrentYearSafe); this
     * helper mirrors that contract for the tab layer.
     */
    function _currentYear() {
        if (typeof window.getCurrentYear === 'function') {
            return window.getCurrentYear();
        }
        return 1250;
    }

    function _toast(message, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type || 'info');
        }
    }

    // =========================================================================
    // 4. LEADER HISTORY HELPERS
    // =========================================================================

    /**
     * An assignment is active iff isActive === true AND endYear is
     * null/undefined. LocationQueries.getCurrentLeader already returns
     * the active assignment (or null); getLeaderHistory returns every
     * assignment. We separate them here to render "past" leaders.
     */
    function _isActiveAssignment(assignment) {
        if (!assignment) return false;
        if (assignment.isActive !== true) return false;
        if (assignment.endYear !== null && assignment.endYear !== undefined) {
            return false;
        }
        return true;
    }

    // =========================================================================
    // 5. RENDER
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

        var currentLeader = LQ.getCurrentLeader(locationId);
        var allHistory = LQ.getLeaderHistory(locationId) || [];

        // The history list omits the active assignment (which is shown
        // in the current-leader card above it). Ended / past terms only.
        var pastLeaders = [];
        for (var i = 0; i < allHistory.length; i++) {
            if (!_isActiveAssignment(allHistory[i])) {
                pastLeaders.push(allHistory[i]);
            }
        }

        var html = '';

        // ---- HEADER ----
        html += '<div class="loc-tab-header">';
        html +=   '<div class="loc-tab-header-text">';
        html +=     '<div class="loc-tab-header-title">' +
                        window.getIcon('CROWN') + ' Leadership: ' +
                        window.escapeHtml(place.displayName) +
                    '</div>';
        html +=     '<div class="loc-tab-header-subtitle">' +
                        'Manage the ruler of this location' +
                    '</div>';
        html +=   '</div>';
        html +=   '<button type="button" id="assignLeaderBtn" ' +
                    'class="loc-tab-btn loc-tab-btn--primary">' +
                    window.getIcon('PLUS') + ' Assign Leader' +
                  '</button>';
        html += '</div>';

        // ---- CURRENT LEADER ----
        html += '<div class="loc-tab-section">';
        html +=   '<div class="loc-tab-section-title">Current Leader</div>';

        if (currentLeader) {
            var leaderName = _characterName(currentLeader.characterId);
            var leaderTitle = currentLeader.title || 'Leader';
            var leaderStart = (currentLeader.startYear === null ||
                               currentLeader.startYear === undefined)
                ? '?' : currentLeader.startYear;

            html += '<div class="loc-leader-card">';
            html +=   '<div class="loc-leader-card-body">';
            html +=     '<div class="loc-leader-card-name">' +
                            window.escapeHtml(leaderName) +
                        '</div>';
            html +=     '<div class="loc-leader-card-title">' +
                            window.escapeHtml(leaderTitle) +
                        '</div>';
            html +=     '<div class="loc-leader-card-since">' +
                            'Since year ' + window.escapeHtml(String(leaderStart)) +
                        '</div>';
            html +=   '</div>';
            html +=   '<button type="button" id="endLeaderBtn" ' +
                        'class="loc-tab-btn loc-tab-btn--danger" ' +
                        'data-char-id="' +
                        window.escapeHtml(currentLeader.characterId) + '">' +
                        'End Term' +
                      '</button>';
            html += '</div>';
        } else {
            html += '<div class="loc-tab-empty">No current leader.</div>';
        }

        html += '</div>';

        // ---- PAST LEADERS ----
        html += '<div class="loc-tab-section">';
        html +=   '<div class="loc-tab-section-title">' +
                    'Past Leaders (' + pastLeaders.length + ')' +
                  '</div>';

        if (pastLeaders.length === 0) {
            html += '<div class="loc-tab-empty">No past leaders recorded.</div>';
        } else {
            html += '<div class="loc-leader-history-list">';
            for (var h = 0; h < pastLeaders.length; h++) {
                var past = pastLeaders[h];
                var pastName = _characterName(past.characterId);
                var pastTitle = past.title || 'Leader';
                var startYear = (past.startYear === null ||
                                 past.startYear === undefined)
                    ? '?' : String(past.startYear);
                var endYear = (past.endYear === null ||
                               past.endYear === undefined)
                    ? '?' : String(past.endYear);

                html += '<div class="loc-leader-history-row">';
                html +=   '<div class="loc-leader-history-info">';
                html +=     '<div class="loc-leader-history-name">' +
                                window.escapeHtml(pastName) +
                            '</div>';
                html +=     '<div class="loc-leader-history-title">' +
                                window.escapeHtml(pastTitle) +
                            '</div>';
                html +=   '</div>';
                html +=   '<div class="loc-leader-history-years">' +
                                window.escapeHtml(startYear) + ' – ' +
                                window.escapeHtml(endYear) +
                          '</div>';
                html += '</div>';
            }
            html += '</div>';
        }

        html += '</div>';

        container.innerHTML = html;

        // ---- BIND EVENTS ----
        _bindAssignButton(container, locationId, place, onRefresh);
        _bindEndTermButton(container, locationId, onRefresh);
    }

    // =========================================================================
    // 6. EVENT HANDLERS
    // =========================================================================

    /**
     * Assign Leader: opens the character selector, then on selection
     * calls LocationCommands.assignLeader followed by a single persist.
     *
     * The selector is loaded lazily and the call is guarded — the tab
     * works in a bare harness; the action is a no-op (with a toast) when
     * the selector module is absent.
     */
    function _bindAssignButton(container, locationId, place, onRefresh) {
        var btn = container.querySelector('#assignLeaderBtn');
        if (!btn) return;

        btn.addEventListener('click', function () {
            var openSelector =
                (typeof window.openCharacterSelector === 'function')
                    ? window.openCharacterSelector
                    : (typeof window.openUnifiedCharacterSelector === 'function')
                        ? window.openUnifiedCharacterSelector
                        : null;

            if (!openSelector) {
                _toast('Character selector unavailable', 'error');
                return;
            }

            openSelector({
                title: 'Select Leader for ' + place.displayName,
                preset: 'available',
                filters: {
                    location: locationId,
                    showDeceased: false
                },
                onSelect: function (characterId) {
                    if (!characterId) return;

                    var year = _currentYear();
                    var res = LC.assignLeader(
                        locationId,
                        characterId,
                        year,
                        'Leader'
                    );

                    if (!res || res.success !== true) {
                        _toast(
                            (res && res.reason) ? res.reason
                                                : 'Failed to assign leader',
                            'error'
                        );
                        return;
                    }

                    var persistRes = LC.persist();
                    if (!persistRes || persistRes.success !== true) {
                        _toast(
                            (persistRes && persistRes.reason)
                                ? persistRes.reason
                                : 'Failed to save leader assignment',
                            'error'
                        );
                        return;
                    }

                    _toast('Leader assigned', 'success');
                    if (typeof onRefresh === 'function') onRefresh();
                }
            });
        });
    }

    /**
     * End Term: calls LocationCommands.endLeaderTerm followed by a
     * single persist. The current-year end is recorded on the
     * assignment; the record itself stays in the place's history.
     */
    function _bindEndTermButton(container, locationId, onRefresh) {
        var btn = container.querySelector('#endLeaderBtn');
        if (!btn) return;

        btn.addEventListener('click', function () {
            var characterId = this.getAttribute('data-char-id');
            if (!characterId) return;

            var year = _currentYear();
            var res = LC.endLeaderTerm(locationId, characterId, year);

            if (!res || res.success !== true) {
                _toast(
                    (res && res.reason) ? res.reason : 'Failed to end term',
                    'error'
                );
                return;
            }

            var persistRes = LC.persist();
            if (!persistRes || persistRes.success !== true) {
                _toast(
                    (persistRes && persistRes.reason)
                        ? persistRes.reason
                        : 'Failed to save term end',
                    'error'
                );
                return;
            }

            _toast('Term ended', 'info');
            if (typeof onRefresh === 'function') onRefresh();
        });
    }

    // =========================================================================
    // 7. EXPORTS
    // =========================================================================

    window.LocationLeadershipTab = { render: render };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.LocationLeadershipTab;
    }

})();
