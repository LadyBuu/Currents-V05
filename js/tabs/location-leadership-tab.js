// js/tabs/location-leadership-tab.js
/**
 * =============================================================================
 * LOCATION LEADERSHIP TAB
 * js/tabs/location-leadership-tab.js
 * =============================================================================
 *
 * LOCATION: js/tabs/location-leadership-tab.js
 *
 * Displays the current leader and past leaders for a location. Provides
 * "Assign Leader" and "End Term" actions. Both actions call
 * LocationCommands.assignLeader / endLeaderTerm and then persist exactly
 * once via LocationCommands.persist().
 *
 * RENDERER CONTRACT (from LocationManagerBootstrap):
 *   fn(container, context) where context = { locationId, locationName }
 *
 * DATA SOURCES:
 *   - LocationQueries.getPlace(id)
 *   - LocationQueries.getCurrentLeader(id)
 *   - LocationQueries.getLeaderHistory(id)
 *
 * WRITES (this tab is the inline writer for leader assignments):
 *   - LocationCommands.assignLeader(locationId, characterId, year, title)
 *   - LocationCommands.endLeaderTerm(locationId, characterId, year)
 *   - LocationCommands.persist()  ← exactly once per user action
 *
 * FILTERS: none.
 *
 * DEPENDENCIES (all soft; guarded at call time):
 *   - LocationQueries   — REQUIRED
 *   - LocationCommands  — REQUIRED
 *   - TabManager        — REQUIRED
 *   - formatting.js     (escapeHtml) — REQUIRED
 *   - icons.js          (Icons)      — soft
 *   - ui.js             (showToast)  — soft
 *   - selectors/modals-char-selector.js (openCharacterSelector) — soft (toast if missing)
 *
 * TIME CONTRACT: uses window.getCurrentYear (no fallback year). If the year
 *   is unavailable, the action toasts and refuses rather than defaulting to
 *   1250 (the prior revision's data-corruption bug).
 * ICON POLICY: no emojis. Glyphs from Icons[name], '' fallback.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Refactored to the Education tab skeleton:
 *     - Renderer contract is fn(container, context).
 *     - Registers with TabManager at load time.
 *     - Removed the 1250 fallback year. _currentYear() returns null when
 *       the year is unavailable; callers refuse the action.
 *     - Removed per-button listeners. One delegated click handler on the
 *       container, routed via data-action + data-char-id.
 *     - Modal delegate is resolved at click time via _resolveModal (toasts
 *       on absence rather than silently no-op'ing).
 *     - Persist ownership is documented and honored: this tab owns
 *       persist() for leader writes; no modal calls persist() on its behalf.
 * =============================================================================
 */

(function () {
    'use strict';

    var TAB_ID = 'leadership';
    var SCOPE  = 'location';

    function _queries() {
        return (typeof window.LocationQueries !== 'undefined') ? window.LocationQueries : null;
    }
    function _commands() {
        return (typeof window.LocationCommands !== 'undefined') ? window.LocationCommands : null;
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
    function _toast(msg, type) {
        if (typeof window.showToast === 'function') window.showToast(msg, type);
    }
    function _resolveModal(name) {
        var fn = window[name];
        if (typeof fn !== 'function') {
            _toast('Action unavailable: ' + name + ' is not loaded.', 'error');
            return null;
        }
        return fn;
    }

    function _currentYear() {
        if (typeof window.getCurrentYear !== 'function') return null;
        var y = window.getCurrentYear();
        return (typeof y === 'number' && isFinite(y)) ? y : null;
    }
    function _characterName(characterId) {
        if (!characterId) return 'Unknown';
        if (typeof window.getCharacterById !== 'function') return 'Unknown';
        var c = window.getCharacterById(characterId);
        if (!c) return 'Unknown';
        var full = ((c.name || '') + ' ' + (c.surname || '')).trim();
        return full || 'Unknown';
    }
    function _isActiveAssignment(assignment) {
        if (!assignment) return false;
        if (assignment.isActive !== true) return false;
        if (assignment.endYear !== null && assignment.endYear !== undefined) return false;
        return true;
    }

    function _renderCurrentLeader(currentLeader) {
        var html = '<div class="loc-tab-section">';
        html += '<div class="loc-tab-section-title">Current Leader</div>';
        if (currentLeader) {
            var name = _characterName(currentLeader.characterId);
            var title = currentLeader.title || 'Leader';
            var start = (currentLeader.startYear === null || currentLeader.startYear === undefined)
                ? '?' : String(currentLeader.startYear);
            html += '<div class="loc-leader-card">';
            html +=   '<div class="loc-leader-card-body">';
            html +=     '<div class="loc-leader-card-name">' + _esc(name) + '</div>';
            html +=     '<div class="loc-leader-card-title">' + _esc(title) + '</div>';
            html +=     '<div class="loc-leader-card-since">Since year ' + _esc(start) + '</div>';
            html +=   '</div>';
            html +=   '<button type="button" class="loc-tab-btn loc-tab-btn--danger" ' +
                        'data-action="end-term" data-char-id="' + _esc(currentLeader.characterId) + '">' +
                        'End Term' +
                      '</button>';
            html += '</div>';
        } else {
            html += '<div class="loc-tab-empty">No current leader.</div>';
        }
        html += '</div>';
        return html;
    }

    function _renderPastLeaders(pastLeaders) {
        var html = '<div class="loc-tab-section">';
        html += '<div class="loc-tab-section-title">Past Leaders (' + pastLeaders.length + ')</div>';
        if (pastLeaders.length === 0) {
            html += '<div class="loc-tab-empty">No past leaders recorded.</div>';
        } else {
            html += '<div class="loc-leader-history-list">';
            for (var h = 0; h < pastLeaders.length; h++) {
                var past = pastLeaders[h];
                var name = _characterName(past.characterId);
                var title = past.title || 'Leader';
                var start = (past.startYear === null || past.startYear === undefined) ? '?' : String(past.startYear);
                var end   = (past.endYear === null || past.endYear === undefined) ? '?' : String(past.endYear);
                html += '<div class="loc-leader-history-row">';
                html +=   '<div class="loc-leader-history-info">';
                html +=     '<div class="loc-leader-history-name">' + _esc(name) + '</div>';
                html +=     '<div class="loc-leader-history-title">' + _esc(title) + '</div>';
                html +=   '</div>';
                html +=   '<div class="loc-leader-history-years">' +
                            _esc(start) + ' – ' + _esc(end) +
                          '</div>';
                html += '</div>';
            }
            html += '</div>';
        }
        html += '</div>';
        return html;
    }

    function renderLeadershipTab(container, context) {
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

        var currentLeader = null;
        try { currentLeader = Q.getCurrentLeader(context.locationId); }
        catch (e) { currentLeader = null; }

        var allHistory = [];
        try { allHistory = Q.getLeaderHistory(context.locationId) || []; }
        catch (e) { allHistory = []; }

        var past = [];
        for (var i = 0; i < allHistory.length; i++) {
            if (!_isActiveAssignment(allHistory[i])) past.push(allHistory[i]);
        }

        var html = '<div class="loc-tab">';
        html += '<div class="loc-tab-header">' +
                    '<div class="loc-tab-header-text">' +
                      '<div class="loc-tab-header-title">' +
                        _icon('CROWN') + ' Leadership: ' + _esc(place.displayName) +
                      '</div>' +
                      '<div class="loc-tab-header-subtitle">Manage the ruler of this location</div>' +
                    '</div>' +
                    '<div class="loc-tab-header-actions">' +
                      '<button type="button" class="loc-tab-btn loc-tab-btn--primary" data-action="assign">' +
                        _icon('PLUS') + ' Assign Leader' +
                      '</button>' +
                    '</div>' +
                '</div>';
        html += _renderCurrentLeader(currentLeader);
        html += _renderPastLeaders(past);
        html += '</div>';
        container.innerHTML = html;

        if (!container.__locationLeadershipWired) {
            container.__locationLeadershipWired = true;
            container.addEventListener('click', function (e) {
                var btn = e.target.closest('[data-action]');
                if (!btn || !container.contains(btn)) return;
                var action = btn.dataset.action;
                if (action === 'assign') _handleAssign(context);
                else if (action === 'end-term') _handleEndTerm(context, btn.getAttribute('data-char-id'));
            });
        }
    }

    // =========================================================================
    // 4. ACTIONS (persist exactly once per user action)
    // =========================================================================

    function _handleAssign(context) {
        var LC = _commands();
        if (!LC || typeof LC.assignLeader !== 'function' || typeof LC.persist !== 'function') {
            _toast('Leader assignment is unavailable. Load location-commands.js.', 'error');
            return;
        }
        var openSelector = _resolveModal('openCharacterSelector')
            || _resolveModal('openUnifiedCharacterSelector');
        if (!openSelector) return;

        var place = _queries().getPlace(context.locationId);
        openSelector({
            title: 'Select Leader for ' + (place ? place.displayName : 'Location'),
            preset: 'available',
            filters: { location: context.locationId, showDeceased: false },
            onSelect: function (characterId) {
                if (!characterId) return;
                var year = _currentYear();
                if (year === null) {
                    _toast('The current year is unavailable; cannot assign a leader.', 'error');
                    return;
                }
                var res = LC.assignLeader(context.locationId, characterId, year, 'Leader');
                if (!res || res.success !== true) {
                    _toast((res && res.reason) ? res.reason : 'Failed to assign leader', 'error');
                    return;
                }
                var p = LC.persist();
                if (!p || p.success !== true) {
                    _toast((p && p.reason) ? p.reason : 'Failed to save leader assignment', 'error');
                    return;
                }
                _toast('Leader assigned', 'success');
                _refresh();
            }
        });
    }

    function _handleEndTerm(context, characterId) {
        if (!characterId) return;
        var LC = _commands();
        if (!LC || typeof LC.endLeaderTerm !== 'function' || typeof LC.persist !== 'function') {
            _toast('End-term is unavailable. Load location-commands.js.', 'error');
            return;
        }
        var year = _currentYear();
        if (year === null) {
            _toast('The current year is unavailable; cannot end a term.', 'error');
            return;
        }
        var res = LC.endLeaderTerm(context.locationId, characterId, year);
        if (!res || res.success !== true) {
            _toast((res && res.reason) ? res.reason : 'Failed to end term', 'error');
            return;
        }
        var p = LC.persist();
        if (!p || p.success !== true) {
            _toast((p && p.reason) ? p.reason : 'Failed to save term end', 'error');
            return;
        }
        _toast('Term ended', 'info');
        _refresh();
    }

    function _refresh() {
        var TM = _tabManager();
        if (TM && typeof TM.requestRender === 'function') {
            try { TM.requestRender(SCOPE); } catch (e) { /* ignore */ }
        }
    }

    // =========================================================================
    // 5. REGISTRATION
    // =========================================================================

    var TM = _tabManager();
    if (TM && typeof TM.register === 'function') {
        TM.register(SCOPE, TAB_ID, renderLeadershipTab);
    } else if (typeof console !== 'undefined' && console.warn) {
        console.warn('location-leadership-tab.js: TabManager is not available at load time; the tab was not registered. Load tab-manager.js first.');
    }

    // =========================================================================
    // 6. EXPORTS
    // =========================================================================

    window.LocationLeadershipTab = { id: TAB_ID, render: renderLeadershipTab };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.LocationLeadershipTab;
    }
})();
