// js/tabs/government-history-tab.js
/**
 * =============================================================================
 * GOVERNMENT HISTORY TAB
 * js/tabs/government-history-tab.js
 * =============================================================================
 *
 * LOCATION: js/tabs/government-history-tab.js
 *
 * PURPOSE:
 *   Render government history — current and former leaders with their
 *   terms, and associated government officials (department position
 *   holders) — and manage leader assignments through LocationCommands.
 *
 * RENDERER CONTRACT (from GovernmentManagerBootstrap):
 *   fn(container, context)
 *   container  HTMLElement  — already emptied by TabManager
 *   context    { locationId, locationName, governmentState }
 *
 * DATA SOURCES:
 *   - window.getPlaceById(locationId)             deep clone; safe to read
 *   - window.getCharacterById(charId)
 *   - GovernmentState.getDepartmentsByLocationId(locationId)  (officials)
 *   - LocationCommands.assignLeader / endLeaderTerm / persist
 *
 * WRITE PATH:
 *   place.leaderAssignments is Location-owned. The tab reads it via
 *   getPlaceById (deep clone — safe to read) and writes only through
 *   LocationCommands.assignLeader / endLeaderTerm. Each user action
 *   calls LocationCommands.persist() exactly once, in the modal's
 *   onConfirm, after the command(s) succeed.
 *
 *   The tab never mutates the cloned place record. The tab never calls
 *   saveMasterData. Mutating the clone and calling saveMasterData was
 *   the bug in the prior revision: that write never reached canonical
 *   data — the retroactive leader was silently discarded.
 *
 * RETROACTIVE LEADERS:
 *   LocationCommands.assignLeader(placeId, charId, startYear, title)
 *   always ends the currently active leader. There is no "record a
 *   past leader without disturbing the current one" command today.
 *
 *   This tab handles retroactive entries as:
 *     1. assignLeader(placeId, charId, startYear, title)
 *        — installs the character as the new current leader
 *     2. endLeaderTerm(placeId, charId, endYear)
 *        — immediately ends that assignment at the requested year
 *     3. LocationCommands.persist() — once, at the end
 *
 *   The net data result is a correct past-leader record, but any
 *   leader who was active before step 1 has been ended. The modal copy
 *   says so. Do not change this without adding a command that records
 *   a past leader without disturbing the current one.
 *
 * MODAL KEY TRANSLATION:
 *   modals-core.js reads titleHtml / contentHtml. The call sites in
 *   this file pass title / content. _openModal() forwards title →
 *   titleHtml and content → contentHtml, only when the *Html variant
 *   is not already supplied.
 *
 * DEPENDENCIES (hard — throw at load if missing):
 *   - js/core/accessors.js               (getPlaceById, getCharacterById)
 *   - js/government/government-state.js  (GovernmentState)
 *   - js/location/location-commands.js   (assignLeader, endLeaderTerm, persist)
 *   - js/core/formatting.js              (escapeHtml)
 *   - js/core/icons.js                   (Icons)
 *   - js/core/modals-core.js             (openModal)
 *   - js/core/tab-manager.js             (TabManager)
 *   - js/core/time.js                    (getCurrentYear, calculateAge)
 *
 * DEPENDENCIES (soft — toast at click if missing):
 *   - js/core/ui.js                         (showToast)
 *   - js/selectors/modals-char-selector.js  (openCharacterSelector)
 *
 * TIME CONTRACT: uses window.getCurrentYear and window.calculateAge
 *   (no fallback).
 * ICON POLICY: glyphs from Icons[name] via _icon; no emojis; no literal
 *   Unicode glyphs in string output. Arrow separators are the literal
 *   " → " string — a typographic glyph, not an icon, and permitted.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   - Migrated from renderGovernmentHistoryTab(containerId, locationId)
 *     to the TabManager renderer contract fn(container, context).
 *   - Self-registers with TabManager at load.
 *   - Stale-location bug fixed: click handlers and the past-leaders
 *     toggle read container.dataset.locationId at click time. The
 *     original captured currentLocationId in a refresh closure; after
 *     a sidebar switch the closure re-rendered the old location.
 *   - Past-leaders collapsed state now uses a class toggle
 *     (.gh-subsection-body.is-collapsed) with CSS display, rather
 *     than inline style.display. Keyboard activation added on the
 *     toggle (role=button + tabindex + Enter/Space).
 *   - Modal entry points accept (locationId) — no refresh callback
 *     threaded through a bind-time closure. They call module-level
 *     _refresh() on success, which calls TM.requestRender(SCOPE, TAB_ID).
 *   - Removed dead refreshGovernmentHistoryTab(locationId) id-scanning
 *     helper; TM.requestRender(SCOPE, TAB_ID) is the only supported
 *     refresh path.
 *   - _getAllGovernmentOfficials returns Object.values of an object
 *     keyed by characterId. That order is unspecified in older JS
 *     engines; the result is now explicitly sorted by display name,
 *     matching the sort applied to _getAssociatedCharacters.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. CONSTANTS
    // =========================================================================

    var TAB_ID = 'history';
    var SCOPE  = 'government';

    // =========================================================================
    // 2. LOAD-TIME DEPENDENCY CHECKS
    // =========================================================================

    if (typeof window.getPlaceById !== 'function') {
        throw new Error(
            'government-history-tab.js: accessors.js (getPlaceById) must load first.'
        );
    }
    if (typeof window.getCharacterById !== 'function') {
        throw new Error(
            'government-history-tab.js: accessors.js (getCharacterById) must load first.'
        );
    }
    if (!window.GovernmentState) {
        throw new Error(
            'government-history-tab.js: government-state.js must load first.'
        );
    }
    if (!window.LocationCommands
        || typeof window.LocationCommands.assignLeader !== 'function'
        || typeof window.LocationCommands.endLeaderTerm !== 'function'
        || typeof window.LocationCommands.persist !== 'function') {
        throw new Error(
            'government-history-tab.js: location-commands.js must load first ' +
            '(assignLeader / endLeaderTerm / persist must all be present).'
        );
    }
    if (typeof window.escapeHtml !== 'function') {
        throw new Error(
            'government-history-tab.js: formatting.js (escapeHtml) must load first.'
        );
    }
    if (!window.Icons || typeof window.Icons !== 'object') {
        throw new Error(
            'government-history-tab.js: icons.js must load first.'
        );
    }
    if (typeof window.openModal !== 'function') {
        throw new Error(
            'government-history-tab.js: modals-core.js (openModal) must load first.'
        );
    }
    if (typeof window.getCurrentYear !== 'function') {
        throw new Error(
            'government-history-tab.js: time.js (getCurrentYear) must load first.'
        );
    }
    if (typeof window.calculateAge !== 'function') {
        throw new Error(
            'government-history-tab.js: time.js (calculateAge) must load first.'
        );
    }
    if (!window.TabManager || typeof window.TabManager.register !== 'function') {
        throw new Error(
            'government-history-tab.js: tab-manager.js must load first.'
        );
    }

    var GS = window.GovernmentState;
    var LC = window.LocationCommands;
    var TM = window.TabManager;

    // =========================================================================
    // 3. DEPENDENCY WRAPPERS (soft)
    // =========================================================================

    function _esc(v) {
        if (typeof window.escapeHtml === 'function') {
            return window.escapeHtml(v);
        }
        if (v === null || v === undefined) return '';
        return String(v)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _getIcon(name) {
        if (typeof window.getIcon === 'function') {
            try {
                var s = window.getIcon(name);
                if (typeof s === 'string') return s;
            } catch (e) { /* fall through */ }
        }
        return (window.Icons && typeof window.Icons[name] === 'string')
            ? window.Icons[name]
            : '';
    }

    function _iconSpan(name) {
        var i = _getIcon(name);
        return i
            ? '<span class="gov-tab-icon" aria-hidden="true">' + i + '</span>'
            : '';
    }

    function _toast(msg, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(msg, type || 'info');
        } else if (typeof window._showToast === 'function') {
            window._showToast(msg, type || 'info');
        }
    }

    function _getPlaceById(id) {
        return typeof window.getPlaceById === 'function'
            ? window.getPlaceById(id)
            : null;
    }

    function _getCharacterById(id) {
        return typeof window.getCharacterById === 'function'
            ? window.getCharacterById(id)
            : null;
    }

    function _openCharacterSelector(options) {
        if (typeof window.openCharacterSelector === 'function') {
            return window.openCharacterSelector(options);
        }
        _toast('Character selector unavailable', 'error');
        return null;
    }

    function _getCurrentYear() {
        return window.getCurrentYear();
    }

    function _openModal(opts) {
        var forwarded = {};
        for (var k in opts) {
            if (Object.prototype.hasOwnProperty.call(opts, k)) {
                forwarded[k] = opts[k];
            }
        }
        if (forwarded.titleHtml === undefined && forwarded.title !== undefined) {
            forwarded.titleHtml = forwarded.title;
        }
        if (forwarded.contentHtml === undefined && forwarded.content !== undefined) {
            forwarded.contentHtml = forwarded.content;
        }
        return window.openModal(forwarded);
    }

    // =========================================================================
    // 4. DATA HELPERS
    // =========================================================================

    /**
     * Age of a character. Passes the deceased flag so calculateAge
     * computes age-at-death correctly.
     */
    function _calculateCharacterAge(character, asOfYear) {
        if (!character) return null;
        var birthYear = character.birthYear;
        if (typeof birthYear !== 'number' || !isFinite(birthYear)) return null;
        return window.calculateAge(
            birthYear,
            character.isDeceased === true,
            character.deathYear,
            asOfYear
        );
    }

    function _getAllLeaderAssignments(place) {
        if (!place) return [];
        return Array.isArray(place.leaderAssignments)
            ? place.leaderAssignments
            : [];
    }

    function _getAssociatedCharacters(place) {
        if (!GS || !place) return [];

        var depts;
        try {
            depts = (typeof GS.getDepartmentsByLocationId === 'function')
                ? (GS.getDepartmentsByLocationId(place.id) || [])
                : [];
        } catch (e) {
            depts = [];
        }

        var associated = Object.create(null);
        for (var i = 0; i < depts.length; i++) {
            var dept = depts[i];
            if (!dept || !Array.isArray(dept.assignments)) continue;

            for (var a = 0; a < dept.assignments.length; a++) {
                var assignment = dept.assignments[a];
                if (!assignment || assignment.endYear) continue;

                var charId = assignment.characterId;
                if (!charId) continue;

                if (!associated[charId]) {
                    associated[charId] = {
                        characterId: charId,
                        positions: [],
                        departments: []
                    };
                }

                var pos = null;
                for (var p = 0; p < (dept.positions || []).length; p++) {
                    if (dept.positions[p].id === assignment.positionId) {
                        pos = dept.positions[p];
                        break;
                    }
                }

                associated[charId].positions.push(
                    pos ? pos.name : assignment.positionId
                );
                associated[charId].departments.push(dept.name);
            }
        }

        var result = [];
        for (var cid in associated) {
            if (!Object.prototype.hasOwnProperty.call(associated, cid)) continue;
            var char = _getCharacterById(cid);
            if (!char) continue;
            result.push({
                characterId: cid,
                character: char,
                positions: associated[cid].positions,
                departments: associated[cid].departments,
                isDeceased: char.isDeceased === true
            });
        }

        result.sort(function (a, b) {
            var nameA = (a.character.name || '') +
                (a.character.surname || '');
            var nameB = (b.character.name || '') +
                (b.character.surname || '');
            return nameA.localeCompare(nameB);
        });

        return result;
    }

    /**
     * Merges leader assignments and department-position holders into a
     * single officials list keyed by characterId. A leader who is also
     * a department official appears once, with both roles. Sort order
     * is by display name (the object is a temporary key map; the
     * result order is explicitly sorted).
     */
    function _getAllGovernmentOfficials(place) {
        var leaders = _getAllLeaderAssignments(place);
        var associated = _getAssociatedCharacters(place);

        var officials = Object.create(null);

        for (var i = 0; i < leaders.length; i++) {
            var leader = leaders[i];
            if (!leader || !leader.characterId) continue;
            var lchar = _getCharacterById(leader.characterId);
            if (!lchar) continue;

            officials[leader.characterId] = {
                characterId: leader.characterId,
                character: lchar,
                type: 'leader',
                leaderInfo: leader,
                isActive: leader.isActive === true && !leader.endYear,
                positions: [],
                departments: []
            };
        }

        for (var a = 0; a < associated.length; a++) {
            var assoc = associated[a];
            if (officials[assoc.characterId]) {
                officials[assoc.characterId].positions = assoc.positions;
                officials[assoc.characterId].departments = assoc.departments;
            } else {
                officials[assoc.characterId] = {
                    characterId: assoc.characterId,
                    character: assoc.character,
                    type: 'official',
                    leaderInfo: null,
                    isActive: true,
                    positions: assoc.positions,
                    departments: assoc.departments
                };
            }
        }

        var result = [];
        for (var cid in officials) {
            if (!Object.prototype.hasOwnProperty.call(officials, cid)) continue;
            result.push(officials[cid]);
        }
        result.sort(function (a, b) {
            var nameA = (a.character.name || '') +
                (a.character.surname || '');
            var nameB = (b.character.name || '') +
                (b.character.surname || '');
            return nameA.localeCompare(nameB);
        });
        return result;
    }

    // =========================================================================
    // 5. RENDER HELPERS
    // =========================================================================

    function _renderLeaderCard(assignment, index) {
        var char = _getCharacterById(assignment.characterId);
        var charName = char
            ? (char.name + (char.surname ? ' ' + char.surname : ''))
            : 'Unknown';
        var isActive = assignment.isActive === true && !assignment.endYear;
        var age = char ? _calculateCharacterAge(char) : null;

        var html = '<div class="gh-leader-card" ' +
            'data-leader-id="' + _esc(assignment.id) + '">';
        html += '<div class="gh-leader-number">#' + (index + 1) + '</div>';
        html += '<div class="gh-leader-info">';
        html += '<div class="gh-leader-name">' +
            _esc(charName) + '</div>';
        if (assignment.title) {
            html += '<div class="gh-leader-title">' +
                _esc(assignment.title) + '</div>';
        }
        html += '<div class="gh-leader-period">';
        html += '<span class="gh-leader-start">' +
            (assignment.startYear || '?') + '</span>';
        if (assignment.endYear) {
            html += ' <span class="gh-leader-arrow" aria-hidden="true">→</span> ' +
                '<span class="gh-leader-end">' +
                assignment.endYear + '</span>';
        } else {
            html += ' <span class="gh-leader-arrow" aria-hidden="true">→</span> ' +
                '<span class="gh-leader-present">Present</span>';
        }
        if (assignment.endReason) {
            html += ' <span class="gh-leader-reason">(' +
                _esc(assignment.endReason) + ')</span>';
        }
        html += '</div>';
        if (age !== null) {
            html += '<div class="gh-leader-age">Age: ' +
                (char.isDeceased === true ? age + ' (at death)' : age) +
                ' years</div>';
        }
        if (char && char.birthYear) {
            html += '<div class="gh-leader-birth">Born: ' +
                char.birthYear + '</div>';
        }
        if (isActive) {
            html += '<div class="gh-leader-status active">' +
                'Current Leader</div>';
        } else {
            html += '<div class="gh-leader-status ended">' +
                'Former Leader</div>';
        }
        html += '</div>';

        html += '<div class="gh-leader-actions">';
        if (isActive) {
            html += '<button type="button" class="gh-btn gh-btn-end" ' +
                'data-action="end-leader" ' +
                'data-leader-id="' + _esc(assignment.id) + '" ' +
                'data-char-id="' + _esc(assignment.characterId) + '" ' +
                'aria-label="End leadership term">' +
                _getIcon('X') + ' End Term' +
                '</button>';
        }
        html += '</div>';

        html += '</div>';
        return html;
    }

    function _renderOfficialCard(official) {
        var char = official.character;
        var charName = char
            ? (char.name + (char.surname ? ' ' + char.surname : ''))
            : 'Unknown';
        var age = char ? _calculateCharacterAge(char) : null;

        var html = '<div class="gh-official-card">';
        html += '<div class="gh-official-info">';
        html += '<div class="gh-official-name">' +
            _esc(charName) + '</div>';
        if (official.positions.length > 0) {
            html += '<div class="gh-official-positions">';
            for (var i = 0; i < official.positions.length; i++) {
                html += '<span class="gh-official-position">' +
                    _esc(official.positions[i]) + '</span>';
            }
            html += '</div>';
        }
        if (official.departments.length > 0) {
            html += '<div class="gh-official-departments">' +
                'Department: ' + _esc(official.departments.join(', ')) +
                '</div>';
        }
        if (age !== null) {
            html += '<div class="gh-official-age">Age: ' +
                (char.isDeceased === true ? age + ' (at death)' : age) +
                ' years</div>';
        }
        if (official.isDeceased) {
            html += '<div class="gh-official-status deceased">Deceased</div>';
        } else {
            html += '<div class="gh-official-status active">Active</div>';
        }
        html += '</div>';
        html += '</div>';
        return html;
    }

    function _renderGovernmentHistory(place) {
        if (!place) {
            return '<div class="gh-details-empty">' +
                'Select a government from the sidebar to view history.' +
                '</div>';
        }

        var leaders = _getAllLeaderAssignments(place);
        var officials = _getAllGovernmentOfficials(place);

        var sortedLeaders = leaders.slice().sort(function (a, b) {
            return (a.startYear || 0) - (b.startYear || 0);
        });

        var currentLeaders = sortedLeaders.filter(function (l) {
            return l.isActive === true && !l.endYear;
        });
        var formerLeaders = sortedLeaders.filter(function (l) {
            return !(l.isActive === true && !l.endYear);
        });

        var html = '<div class="gh-tab-container" ' +
            'data-location-id="' + _esc(place.id || '') + '">';

        // Header
        html += '<div class="gh-tab-header">';
        html += '<h3>Government History - ' +
            _esc(place.displayName || place.name) + '</h3>';
        html += '<div class="gh-tab-actions">';
        html += '<button type="button" class="gh-btn gh-btn-add" ' +
            'data-action="add-leader">' +
            _iconSpan('PLUS') + ' Add Leader' +
            '</button>';
        html += '<button type="button" class="gh-btn" ' +
            'data-action="refresh-history">' +
            _iconSpan('REFRESH') + ' Refresh' +
            '</button>';
        html += '</div>';
        html += '</div>';

        // Stats
        html += '<div class="gh-stats-summary">';
        html += '<div class="gh-stat">' +
            '<span class="gh-stat-label">Total Leaders</span>' +
            '<span class="gh-stat-value">' + leaders.length + '</span>' +
            '</div>';
        html += '<div class="gh-stat">' +
            '<span class="gh-stat-label">Current</span>' +
            '<span class="gh-stat-value is-active">' +
            currentLeaders.length + '</span>' +
            '</div>';
        html += '<div class="gh-stat">' +
            '<span class="gh-stat-label">Former</span>' +
            '<span class="gh-stat-value is-ended">' +
            formerLeaders.length + '</span>' +
            '</div>';
        html += '<div class="gh-stat">' +
            '<span class="gh-stat-label">Officials</span>' +
            '<span class="gh-stat-value is-officials">' +
            officials.length + '</span>' +
            '</div>';
        html += '</div>';

        // Leaders section
        html += '<div class="gh-section">';
        html += '<div class="gh-section-header">' +
            '<span>Leadership History</span></div>';

        if (leaders.length === 0) {
            html += '<div class="gh-empty">' +
                '<p>No leaders in history. Assign a leader to begin.</p>' +
                '</div>';
        } else {
            if (currentLeaders.length > 0) {
                html += '<div class="gh-subsection">';
                html += '<div class="gh-subsection-header">' +
                    'Current Leaders</div>';
                html += '<div class="gh-leaders-list">';
                for (var i = 0; i < currentLeaders.length; i++) {
                    var leaderIdx = sortedLeaders.indexOf(currentLeaders[i]);
                    html += _renderLeaderCard(currentLeaders[i], leaderIdx);
                }
                html += '</div></div>';
            }

            if (formerLeaders.length > 0) {
                html += '<div class="gh-subsection gh-subsection-ended">';
                html += '<div class="gh-subsection-toggle" ' +
                    'data-toggle="former-leaders" ' +
                    'role="button" tabindex="0" aria-expanded="false">';
                html += '<span class="gh-subsection-label">' +
                    'Former Leaders (' + formerLeaders.length + ')</span>';
                html += '<span class="gh-toggle-icon" aria-hidden="true">' +
                    _getIcon('TRIANGLE_RIGHT') + '</span>';
                html += '</div>';
                html += '<div class="gh-subsection-body is-collapsed">';
                html += '<div class="gh-leaders-list">';
                for (var f = 0; f < formerLeaders.length; f++) {
                    var formerIdx = sortedLeaders.indexOf(formerLeaders[f]);
                    html += _renderLeaderCard(formerLeaders[f], formerIdx);
                }
                html += '</div></div></div>';
            }
        }
        html += '</div>';

        // Officials section
        html += '<div class="gh-section">';
        html += '<div class="gh-section-header">' +
            '<span>Government Officials (' + officials.length + ')</span>' +
            '</div>';

        if (officials.length === 0) {
            html += '<div class="gh-empty">' +
                '<p>No government officials found. Assign characters ' +
                'to department positions.</p>' +
                '</div>';
        } else {
            html += '<div class="gh-officials-grid">';
            for (var o = 0; o < officials.length; o++) {
                html += _renderOfficialCard(officials[o]);
            }
            html += '</div>';
        }
        html += '</div>';

        html += '</div>';
        return html;
    }

    // =========================================================================
    // 6. RENDERER (TabManager contract: fn(container, context))
    // =========================================================================

    function renderGovernmentHistoryTab(container, context) {
        if (!container) return;

        if (!context || !context.locationId) {
            container.innerHTML =
                '<div class="empty-state">' +
                'Select a government from the sidebar to view history.' +
                '</div>';
            return;
        }

        var locationId = context.locationId;
        var place = (context.governmentState && context.governmentState.place)
            ? context.governmentState.place
            : _getPlaceById(locationId);

        container.innerHTML = _renderGovernmentHistory(place);
        container.dataset.locationId = locationId;

        _bindActions(container);
    }

    function _refresh() {
        if (TM && typeof TM.requestRender === 'function') {
            TM.requestRender(SCOPE, TAB_ID);
        }
    }

    // =========================================================================
    // 7. ACTION BINDING (delegated, on the tab container)
    // =========================================================================

    function _bindActions(container) {
        if (container._ghBound) return;
        container._ghBound = true;

        container.addEventListener('click', function (event) {
            var target = event.target.closest('[data-action]');
            if (!target || !container.contains(target)) return;

            var action = target.getAttribute('data-action');
            var locationId = container.dataset.locationId;
            if (!locationId) return;

            if (action === 'add-leader') {
                event.preventDefault();
                _addLeaderToLocation(locationId);
                return;
            }

            if (action === 'refresh-history') {
                event.preventDefault();
                _refresh();
                _toast('History refreshed', 'info');
                return;
            }

            if (action === 'end-leader') {
                event.preventDefault();
                var charId = target.getAttribute('data-char-id');
                if (!charId) return;
                _endLeaderTerm(locationId, charId);
                return;
            }
        });

        // Former-leaders collapse toggle. Location is not needed here;
        // the toggle only manipulates local DOM.
        container.addEventListener('click', function (event) {
            var toggle = event.target.closest('[data-toggle="former-leaders"]');
            if (!toggle || !container.contains(toggle)) return;
            event.preventDefault();
            _toggleFormerLeaders(toggle);
        });

        // Keyboard activation for the toggle.
        container.addEventListener('keydown', function (event) {
            var toggle = event.target.closest('[data-toggle="former-leaders"]');
            if (!toggle || !container.contains(toggle)) return;
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            _toggleFormerLeaders(toggle);
        });
    }

    function _toggleFormerLeaders(toggle) {
        var body = toggle.nextElementSibling;
        if (!body) return;
        var collapsed = body.classList.toggle('is-collapsed');
        var icon = toggle.querySelector('.gh-toggle-icon');
        if (icon) {
            icon.innerHTML = collapsed
                ? _getIcon('TRIANGLE_RIGHT')
                : _getIcon('TRIANGLE_DOWN');
        }
        toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    }

    // =========================================================================
    // 8. LEADER ACTIONS (through LocationCommands)
    // =========================================================================

    function _addLeaderToLocation(locationId) {
        var place = _getPlaceById(locationId);
        if (!place) {
            _toast('Location not found', 'error');
            return;
        }

        _openCharacterSelector({
            title: 'Add Leader to ' + (place.displayName || place.name),
            preset: 'available',
            filters: {
                location: locationId,
                showDeceased: true
            },
            onSelect: function (characterId) {
                var char = _getCharacterById(characterId);
                if (!char) {
                    _toast('Character not found', 'error');
                    return;
                }

                var charDisplay = char.name +
                    (char.surname ? ' ' + char.surname : '');

                var content = '<div class="gh-leader-form">';
                content += '<p>Add <strong>' + _esc(charDisplay) +
                    '</strong> as a leader.</p>';
                content += '<div class="form-group">';
                content += '<label for="gh-leader-title-input">Title</label>';
                content += '<input type="text" id="gh-leader-title-input" ' +
                    'class="form-control" ' +
                    'placeholder="e.g., Mayor, Governor, King" ' +
                    'value="Leader">';
                content += '</div>';
                content += '<div class="form-row">';
                content += '<div class="form-group">';
                content += '<label for="gh-leader-start-year">' +
                    'Start Year *</label>';
                content += '<input type="number" id="gh-leader-start-year" ' +
                    'class="form-control" value="' + _getCurrentYear() + '">';
                content += '</div>';
                content += '<div class="form-group">';
                content += '<label for="gh-leader-end-year">' +
                    'End Year (leave empty for current)</label>';
                content += '<input type="number" id="gh-leader-end-year" ' +
                    'class="form-control" placeholder="Optional">';
                content += '</div>';
                content += '</div>';
                content += '<div class="form-group">';
                content += '<label for="gh-leader-reason">' +
                    'End Reason (if ended)</label>';
                content += '<input type="text" id="gh-leader-reason" ' +
                    'class="form-control" ' +
                    'placeholder="e.g., Term ended, Resigned, Removed">';
                content += '</div>';
                content += '<div class="form-group">';
                content += '<label class="gh-checkbox-label">';
                content += '<input type="checkbox" id="gh-leader-is-active" ' +
                    'checked> ';
                content += 'This is a current/active leader';
                content += '</label>';
                content += '</div>';
                content += '<p class="gov-modal-note">' +
                    'Note: adding an active leader will end the current ' +
                    'leader\'s term. Adding a past leader records the ' +
                    'assignment but also ends the current term — the ' +
                    'tab then starts with no active leader.' +
                    '</p>';
                content += '</div>';

                _openModal({
                    title: 'Add Leader',
                    content: content,
                    confirmText: 'Add Leader',
                    cancelText: 'Cancel',
                    onMount: function (root) {
                        var activeCheck = root.querySelector('#gh-leader-is-active');
                        var endYearInput = root.querySelector('#gh-leader-end-year');
                        var reasonInput = root.querySelector('#gh-leader-reason');
                        if (!activeCheck || !endYearInput || !reasonInput) return;

                        function sync() {
                            if (activeCheck.checked) {
                                endYearInput.disabled = true;
                                endYearInput.value = '';
                                reasonInput.disabled = true;
                                reasonInput.value = '';
                            } else {
                                endYearInput.disabled = false;
                                reasonInput.disabled = false;
                            }
                        }
                        activeCheck.addEventListener('change', sync);
                        sync();
                    },
                    onConfirm: function (root) {
                        var titleEl = root.querySelector('#gh-leader-title-input');
                        var startEl = root.querySelector('#gh-leader-start-year');
                        var endEl = root.querySelector('#gh-leader-end-year');
                        var activeEl = root.querySelector('#gh-leader-is-active');
                        if (!titleEl || !startEl || !activeEl) {
                            _toast('Form not found in modal', 'error');
                            return false;
                        }

                        var title = titleEl.value.trim() || 'Leader';
                        var startYear = parseInt(startEl.value, 10);
                        if (!isFinite(startYear)) {
                            _toast('Start year is required', 'error');
                            return false;
                        }

                        var isActive = activeEl.checked === true;
                        var endYear = null;
                        if (!isActive) {
                            endYear = endEl
                                ? parseInt(endEl.value, 10)
                                : NaN;
                            if (!isFinite(endYear)) {
                                _toast(
                                    'End year is required for ended terms',
                                    'error'
                                );
                                return false;
                            }
                            if (endYear <= startYear) {
                                _toast(
                                    'End year must be after start year',
                                    'error'
                                );
                                return false;
                            }
                        }

                        var assignResult;
                        try {
                            assignResult = LC.assignLeader(
                                locationId, characterId, startYear, title
                            );
                        } catch (err) {
                            _toast(
                                'Assign leader failed: ' +
                                (err && err.message ? err.message : 'threw'),
                                'error'
                            );
                            return false;
                        }

                        if (!assignResult || assignResult.success !== true) {
                            _toast(
                                (assignResult && assignResult.reason)
                                    ? assignResult.reason
                                    : 'Failed to assign leader',
                                'error'
                            );
                            return false;
                        }

                        if (!isActive) {
                            var endResult;
                            try {
                                endResult = LC.endLeaderTerm(
                                    locationId, characterId, endYear
                                );
                            } catch (err) {
                                endResult = {
                                    success: false,
                                    reason: err && err.message
                                };
                            }
                            if (!endResult || endResult.success !== true) {
                                _toast(
                                    'Leader assigned but end-term failed: ' +
                                    (endResult && endResult.reason
                                        ? endResult.reason
                                        : 'unknown'),
                                    'error'
                                );
                                // Persist the assignment that did succeed.
                                try { LC.persist(); } catch (e) { /* logged below via _refresh */ }
                                _refresh();
                                return false;
                            }
                        }

                        var persistResult;
                        try { persistResult = LC.persist(); }
                        catch (err) {
                            persistResult = { success: false, reason: 'persist threw' };
                        }
                        if (persistResult && persistResult.success !== true) {
                            _toast(
                                'Leader added, but save failed: ' +
                                (persistResult.reason || 'unknown'),
                                'warning'
                            );
                        } else {
                            _toast(
                                isActive ? 'Leader assigned' : 'Past leader recorded',
                                'success'
                            );
                        }

                        _refresh();
                        return true;
                    }
                });
            }
        });
    }

    function _endLeaderTerm(locationId, characterId) {
        var char = _getCharacterById(characterId);
        var charName = char
            ? (char.name + (char.surname ? ' ' + char.surname : ''))
            : 'Unknown';

        var content = '<div class="gh-leader-form">';
        content += '<p>End leadership term for <strong>' +
            _esc(charName) + '</strong>?</p>';
        content += '<div class="form-group">';
        content += '<label for="gh-end-year-input">End Year</label>';
        content += '<input type="number" id="gh-end-year-input" ' +
            'class="form-control" value="' + _getCurrentYear() + '">';
        content += '</div>';
        content += '</div>';

        _openModal({
            title: 'End Leadership Term',
            content: content,
            confirmText: 'End Term',
            cancelText: 'Cancel',
            onConfirm: function (root) {
                var yearEl = root.querySelector('#gh-end-year-input');
                if (!yearEl) {
                    _toast('Form not found in modal', 'error');
                    return false;
                }

                var endYear = parseInt(yearEl.value, 10);
                if (!isFinite(endYear)) {
                    endYear = _getCurrentYear();
                }

                var result;
                try {
                    result = LC.endLeaderTerm(locationId, characterId, endYear);
                } catch (err) {
                    _toast(
                        'End leader term failed: ' +
                        (err && err.message ? err.message : 'threw'),
                        'error'
                    );
                    return false;
                }

                if (!result || result.success !== true) {
                    _toast(
                        (result && result.reason)
                            ? result.reason
                            : 'Failed to end leader term',
                        'error'
                    );
                    return false;
                }

                var persistResult;
                try { persistResult = LC.persist(); }
                catch (err) {
                    persistResult = { success: false, reason: 'persist threw' };
                }
                if (persistResult && persistResult.success !== true) {
                    _toast(
                        'Term ended, but save failed: ' +
                        (persistResult.reason || 'unknown'),
                        'warning'
                    );
                } else {
                    _toast('Leadership term ended', 'info');
                }

                _refresh();
                return true;
            }
        });
    }

    // =========================================================================
    // 9. REGISTRATION (playbook §5)
    // =========================================================================

    TM.register(SCOPE, TAB_ID, renderGovernmentHistoryTab);

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

    window.GovernmentHistoryTab = {
        id: TAB_ID,
        render: renderGovernmentHistoryTab,

        // Data accessors, exposed for tests and for any future caller
        // that wants the same projections this tab uses.
        getLeaders: _getAllLeaderAssignments,
        getOfficials: _getAllGovernmentOfficials,

        // Internal helpers, exposed for tests.
        _renderLeaderCard: _renderLeaderCard,
        _renderOfficialCard: _renderOfficialCard,
        _addLeader: _addLeaderToLocation,
        _endLeader: _endLeaderTerm
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.GovernmentHistoryTab;
    }
})();
