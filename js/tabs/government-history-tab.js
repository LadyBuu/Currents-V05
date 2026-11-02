// js/tabs/government-history-tab.js
/**
 * =============================================================================
 * GOVERNMENT HISTORY TAB (js/tabs/government-history-tab.js)
 * =============================================================================
 *
 * PURPOSE: Provides a modular tab for viewing government history including:
 *          - Current and former leaders with their terms
 *          - Add leaders (current or retroactive)
 *          - Track associated characters (ministers, officials, etc.)
 *
 * DEPENDENCIES (checked at load time):
 *   - accessors.js          (getPlaceById, getCharacterById, getCharacters)
 *   - government-state.js   (GovernmentState)
 *   - government-commands.js (GovernmentCommands — reads only; writes
 *                           go through LocationCommands)
 *   - location-commands.js  (LocationCommands — assignLeader,
 *                           endLeaderTerm, persist)
 *   - formatting.js         (escapeHtml)
 *   - icons.js              (Icons)
 *   - ui.js                 (showToast)
 *   - modals-core.js        (openModal, confirmDialog)
 *   - modals-char-selector.js (openCharacterSelector)
 *   - time.js               (getCurrentYear, calculateAge)
 *
 * WRITE PATH:
 *   place.leaderAssignments is Location-owned. The tab reads it via
 *   getPlaceById (deep clone — safe to read) and writes only through
 *   LocationCommands.assignLeader / endLeaderTerm.
 *
 *   The previous revision of this file mutated the cloned place record
 *   directly and called saveMasterData(). That write never reached
 *   canonical data — the retroactive leader was silently discarded.
 *
 * RETROACTIVE LEADERS:
 *   LocationCommands.assignLeader(placeId, charId, startYear, title)
 *   always ends the currently active leader. There is no "record a past
 *   leader without disturbing the current one" command today.
 *
 *   This tab handles retroactive entries by:
 *     1. assignLeader(placeId, charId, startYear, title)
 *        — installs the character as the new current leader
 *     2. endLeaderTerm(placeId, charId, endYear)
 *        — immediately ends that assignment at the requested year
 *     3. LocationCommands.persist() — once, at the end
 *
 *   The net data result is a correct past-leader assignment record, but
 *   any leader who was active before step 1 has been ended. Adding a
 *   past leader this way will end the current one. A future
 *   LocationCommands.addPastLeaderAssignment command would remove that
 *   limitation; the tab does not attempt to invent that path here.
 *
 * MODAL KEY TRANSLATION:
 *   modals-core.js reads titleHtml / contentHtml. The call sites in
 *   this file pass title / content. The local _openModal helper
 *   translates.
 *
 * MODAL INPUT SCOPING:
 *   Every onConfirm / onOpen reads inputs via root.querySelector.
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. LOAD-TIME DEPENDENCY CHECKS
    // =========================================================================

    if (!window.LocationCommands) {
        throw new Error(
            'government-history-tab.js: location-commands.js must load ' +
            'first (LocationCommands.assignLeader / endLeaderTerm / ' +
            'persist missing).'
        );
    }
    if (!window.GovernmentState) {
        throw new Error(
            'government-history-tab.js: government-state.js must load first.'
        );
    }
    if (typeof window.openModal !== 'function') {
        throw new Error(
            'government-history-tab.js: modals-core.js must load first ' +
            '(openModal missing).'
        );
    }
    if (typeof window.escapeHtml !== 'function') {
        throw new Error(
            'government-history-tab.js: formatting.js (escapeHtml) must ' +
            'load first.'
        );
    }
    if (!window.Icons || typeof window.Icons !== 'object') {
        throw new Error(
            'government-history-tab.js: icons.js must load first.'
        );
    }
    if (typeof window.getCurrentYear !== 'function') {
        throw new Error(
            'government-history-tab.js: time.js (getCurrentYear) must load ' +
            'first.'
        );
    }
    if (typeof window.calculateAge !== 'function') {
        throw new Error(
            'government-history-tab.js: time.js (calculateAge) must load ' +
            'first.'
        );
    }

    var GS = window.GovernmentState;
    var LC = window.LocationCommands;

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

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

    function _escapeHtml(str) {
        return window.escapeHtml(str);
    }

    function _getIcon(name) {
        var svg = window.Icons[name];
        return typeof svg === 'string' ? svg : '';
    }

    function _showToast(message, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type || 'info');
        }
    }

    function _confirmDialog(message, title, onConfirm) {
        if (typeof window.confirmDialog === 'function') {
            window.confirmDialog(message, title, onConfirm);
        }
    }

    function _openCharacterSelector(options) {
        if (typeof window.openCharacterSelector === 'function') {
            return window.openCharacterSelector(options);
        }
        _showToast('Character selector unavailable', 'error');
        return null;
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

    function _getCurrentYear() {
        return window.getCurrentYear();
    }

    /**
     * Age of a character. Takes the full character projection (or a
     * subset that carries birthYear, isDeceased, deathYear) so the
     * deceased flag reaches calculateAge. Passing only birth/death
     * years silently returned "age today if still alive" for deceased
     * characters — a bug in the previous revision.
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

    // =========================================================================
    // 3. DATA HELPERS
    // =========================================================================

    function _getAllLeaderAssignments(place) {
        if (!place) return [];
        return Array.isArray(place.leaderAssignments)
            ? place.leaderAssignments
            : [];
    }

    function _getAssociatedCharacters(place) {
        if (!GS || !place) return [];

        var depts = typeof GS.getDepartmentsByLocationId === 'function'
            ? (GS.getDepartmentsByLocationId(place.id) || [])
            : [];

        var associated = {};
        for (var i = 0; i < depts.length; i++) {
            var dept = depts[i];
            if (!dept || !Array.isArray(dept.assignments)) continue;

            for (var a = 0; a < dept.assignments.length; a++) {
                var assignment = dept.assignments[a];
                if (assignment.endYear) continue; // active only

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

        result.sort(function(a, b) {
            var nameA = (a.character.name || '') +
                (a.character.surname || '');
            var nameB = (b.character.name || '') +
                (b.character.surname || '');
            return nameA.localeCompare(nameB);
        });

        return result;
    }

    function _getAllGovernmentOfficials(place) {
        var leaders = _getAllLeaderAssignments(place);
        var associated = _getAssociatedCharacters(place);

        var officials = {};

        // Leaders first
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

        // Non-leader officials
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

        return Object.values(officials);
    }

    // =========================================================================
    // 4. RENDER FUNCTIONS
    // =========================================================================

    function _renderLeaderCard(assignment, placeId, index) {
        var char = _getCharacterById(assignment.characterId);
        var charName = char
            ? (char.name + (char.surname ? ' ' + char.surname : ''))
            : 'Unknown';
        var isActive = assignment.isActive === true && !assignment.endYear;
        var age = char ? _calculateCharacterAge(char) : null;

        var html = '<div class="gh-leader-card" ' +
            'data-leader-id="' + _escapeHtml(assignment.id) + '">';
        html += '<div class="gh-leader-number">#' + (index + 1) + '</div>';
        html += '<div class="gh-leader-info">';
        html += '<div class="gh-leader-name">' +
            _escapeHtml(charName) + '</div>';
        if (assignment.title) {
            html += '<div class="gh-leader-title">' +
                _escapeHtml(assignment.title) + '</div>';
        }
        html += '<div class="gh-leader-period">';
        html += '<span class="gh-leader-start">' +
            (assignment.startYear || '?') + '</span>';
        if (assignment.endYear) {
            html += ' <span class="gh-leader-arrow">→</span> ' +
                '<span class="gh-leader-end">' +
                assignment.endYear + '</span>';
        } else {
            html += ' <span class="gh-leader-arrow">→</span> ' +
                '<span class="gh-leader-present">Present</span>';
        }
        if (assignment.endReason) {
            html += ' <span class="gh-leader-reason">(' +
                _escapeHtml(assignment.endReason) + ')</span>';
        }
        html += '</div>';
        if (age !== null) {
            html += '<div class="gh-leader-age">Age: ' +
                (char.isDeceased === true
                    ? age + ' (at death)'
                    : age) +
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
            html += '<button class="gh-btn gh-btn-end" ' +
                'data-action="end-leader" ' +
                'data-leader-id="' + _escapeHtml(assignment.id) + '" ' +
                'data-char-id="' + _escapeHtml(assignment.characterId) + '">' +
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
            _escapeHtml(charName) + '</div>';
        if (official.positions.length > 0) {
            html += '<div class="gh-official-positions">';
            for (var i = 0; i < official.positions.length; i++) {
                html += '<span class="gh-official-position">' +
                    _escapeHtml(official.positions[i]) + '</span>';
            }
            html += '</div>';
        }
        if (official.departments.length > 0) {
            html += '<div class="gh-official-departments">' +
                'Department: ' + _escapeHtml(official.departments.join(', ')) +
                '</div>';
        }
        if (age !== null) {
            html += '<div class="gh-official-age">Age: ' +
                (char.isDeceased === true
                    ? age + ' (at death)'
                    : age) +
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
                'Select a location to view government history.</div>';
        }

        var leaders = _getAllLeaderAssignments(place);
        var officials = _getAllGovernmentOfficials(place);

        var sortedLeaders = leaders.slice().sort(function(a, b) {
            return (a.startYear || 0) - (b.startYear || 0);
        });

        var currentLeaders = sortedLeaders.filter(function(l) {
            return l.isActive === true && !l.endYear;
        });
        var formerLeaders = sortedLeaders.filter(function(l) {
            return !(l.isActive === true && !l.endYear);
        });

        var html = '<div class="gh-tab-container">';

        // Header
        html += '<div class="gh-tab-header">';
        html += '<h3>Government History - ' +
            _escapeHtml(place.displayName || place.name) + '</h3>';
        html += '<div class="gh-tab-actions">';
        html += '<button class="gh-btn gh-btn-add" data-action="add-leader">' +
            _getIcon('PLUS') + ' Add Leader' +
            '</button>';
        html += '<button class="gh-btn gh-btn-refresh" ' +
            'data-action="refresh-history">' +
            _getIcon('REFRESH') + ' Refresh' +
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
            '<span class="gh-stat-value" style="color:#28a745;">' +
            currentLeaders.length + '</span>' +
            '</div>';
        html += '<div class="gh-stat">' +
            '<span class="gh-stat-label">Former</span>' +
            '<span class="gh-stat-value" style="color:#dc3545;">' +
            formerLeaders.length + '</span>' +
            '</div>';
        html += '<div class="gh-stat">' +
            '<span class="gh-stat-label">Officials</span>' +
            '<span class="gh-stat-value" style="color:#4a90d9;">' +
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
                    html += _renderLeaderCard(
                        currentLeaders[i], place.id, leaderIdx
                    );
                }
                html += '</div>';
                html += '</div>';
            }

            if (formerLeaders.length > 0) {
                html += '<div class="gh-subsection gh-subsection-ended">';
                html += '<div class="gh-subsection-toggle" ' +
                    'data-toggle="former-leaders">';
                html += '<span class="gh-subsection-label">' +
                    'Former Leaders (' + formerLeaders.length + ')</span>';
                html += '<span class="gh-toggle-icon">' +
                    _getIcon('TRIANGLE_RIGHT') + '</span>';
                html += '</div>';
                html += '<div class="gh-subsection-body" style="display:none;">';
                html += '<div class="gh-leaders-list">';
                for (var f = 0; f < formerLeaders.length; f++) {
                    var formerIdx = sortedLeaders.indexOf(formerLeaders[f]);
                    html += _renderLeaderCard(
                        formerLeaders[f], place.id, formerIdx
                    );
                }
                html += '</div>';
                html += '</div>';
                html += '</div>';
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

        html += '</div>'; // end gh-tab-container

        return html;
    }

    // =========================================================================
    // 5. LEADER ACTIONS (through LocationCommands)
    // =========================================================================

    function _addLeaderToLocation(placeId, onComplete) {
        var place = _getPlaceById(placeId);
        if (!place) {
            _showToast('Location not found', 'error');
            return;
        }

        _openCharacterSelector({
            title: 'Add Leader to ' + (place.displayName || place.name),
            preset: 'available',
            filters: {
                location: placeId,
                showDeceased: true
            },
            onSelect: function(characterId) {
                var char = _getCharacterById(characterId);
                if (!char) {
                    _showToast('Character not found', 'error');
                    return;
                }

                var charDisplay = char.name +
                    (char.surname ? ' ' + char.surname : '');

                var content = '<div class="gh-leader-form">';
                content += '<p>Add <strong>' + _escapeHtml(charDisplay) +
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
                content += '<p class="gh-modal-note">' +
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
                    onOpen: function(root) {
                        var activeCheck = root.querySelector('#gh-leader-is-active');
                        var endYearInput = root.querySelector('#gh-leader-end-year');
                        var reasonInput = root.querySelector('#gh-leader-reason');
                        if (!activeCheck || !endYearInput || !reasonInput) return;

                        activeCheck.addEventListener('change', function() {
                            if (this.checked) {
                                endYearInput.disabled = true;
                                endYearInput.value = '';
                                reasonInput.disabled = true;
                                reasonInput.value = '';
                            } else {
                                endYearInput.disabled = false;
                                reasonInput.disabled = false;
                            }
                        });
                    },
                    onConfirm: function(root) {
                        var titleEl = root.querySelector('#gh-leader-title-input');
                        var startEl = root.querySelector('#gh-leader-start-year');
                        var endEl = root.querySelector('#gh-leader-end-year');
                        var activeEl = root.querySelector('#gh-leader-is-active');
                        if (!titleEl || !startEl || !activeEl) {
                            _showToast('Form not found in modal', 'error');
                            return false;
                        }

                        var title = titleEl.value.trim() || 'Leader';
                        var startYear = parseInt(startEl.value, 10);
                        if (!Number.isFinite(startYear)) {
                            _showToast('Start year is required', 'error');
                            return false;
                        }

                        var isActive = activeEl.checked === true;
                        var endYear = null;
                        if (!isActive) {
                            endYear = endEl
                                ? parseInt(endEl.value, 10)
                                : NaN;
                            if (!Number.isFinite(endYear)) {
                                _showToast(
                                    'End year is required for ended terms',
                                    'error'
                                );
                                return false;
                            }
                            if (endYear <= startYear) {
                                _showToast(
                                    'End year must be after start year',
                                    'error'
                                );
                                return false;
                            }
                        }

                        // Step 1: install (as current leader — ends any
                        // prior active leader).
                        var assignResult = LC.assignLeader(
                            placeId, characterId, startYear, title
                        );
                        if (!assignResult || assignResult.success !== true) {
                            _showToast(
                                (assignResult && assignResult.reason)
                                    ? assignResult.reason
                                    : 'Failed to assign leader',
                                'error'
                            );
                            return false;
                        }

                        // Step 2: if the caller wants this entry to be
                        // a past term, end it immediately.
                        if (!isActive) {
                            var endResult = LC.endLeaderTerm(
                                placeId, characterId, endYear
                            );
                            if (!endResult || endResult.success !== true) {
                                // Roll back is not available — the
                                // assignment is live. Report loudly so
                                // the caller knows.
                                _showToast(
                                    'Leader assigned but end-term failed: ' +
                                    (endResult && endResult.reason
                                        ? endResult.reason
                                        : 'unknown'),
                                    'error'
                                );
                                LC.persist();
                                if (typeof onComplete === 'function') onComplete();
                                return false;
                            }
                        }

                        var persistResult = LC.persist();
                        if (persistResult && persistResult.success !== true) {
                            _showToast(
                                'Leader added, but save failed: ' +
                                (persistResult.reason || 'unknown'),
                                'warning'
                            );
                        } else {
                            _showToast(
                                isActive
                                    ? 'Leader assigned'
                                    : 'Past leader recorded',
                                'success'
                            );
                        }

                        if (typeof onComplete === 'function') onComplete();
                        return true;
                    }
                });
            }
        });
    }

    function _endLeaderTerm(placeId, characterId, onComplete) {
        var char = _getCharacterById(characterId);
        var charName = char
            ? (char.name + (char.surname ? ' ' + char.surname : ''))
            : 'Unknown';

        var content = '<div class="gh-leader-form">';
        content += '<p>End leadership term for <strong>' +
            _escapeHtml(charName) + '</strong>?</p>';
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
            onConfirm: function(root) {
                var yearEl = root.querySelector('#gh-end-year-input');
                if (!yearEl) {
                    _showToast('Form not found in modal', 'error');
                    return false;
                }

                var endYear = parseInt(yearEl.value, 10);
                if (!Number.isFinite(endYear)) {
                    endYear = _getCurrentYear();
                }

                var result = LC.endLeaderTerm(placeId, characterId, endYear);
                if (!result || result.success !== true) {
                    _showToast(
                        (result && result.reason)
                            ? result.reason
                            : 'Failed to end leader term',
                        'error'
                    );
                    return false;
                }

                var persistResult = LC.persist();
                if (persistResult && persistResult.success !== true) {
                    _showToast(
                        'Term ended, but save failed: ' +
                        (persistResult.reason || 'unknown'),
                        'warning'
                    );
                } else {
                    _showToast('Leadership term ended', 'info');
                }

                if (typeof onComplete === 'function') onComplete();
                return true;
            }
        });
    }

    // =========================================================================
    // 6. MAIN RENDER
    // =========================================================================

    function renderGovernmentHistoryTab(containerId, locationId) {
        var container = document.getElementById(containerId);
        if (!container) {
            console.warn(
                'Government history container not found:', containerId
            );
            return;
        }

        var place = locationId ? _getPlaceById(locationId) : null;
        container.innerHTML = _renderGovernmentHistory(place);
        container.dataset.locationId = locationId || '';

        if (!container._ghBound) {
            container._ghBound = true;

            container.addEventListener('click', function(e) {
                var target = e.target.closest('[data-action]');
                if (!target) return;

                var action = target.dataset.action;
                var currentLocationId = container.dataset.locationId;
                var refresh = function() {
                    renderGovernmentHistoryTab(containerId, currentLocationId);
                };

                switch (action) {
                    case 'add-leader':
                        if (currentLocationId) {
                            _addLeaderToLocation(currentLocationId, refresh);
                        } else {
                            _showToast('No location selected', 'warning');
                        }
                        break;

                    case 'refresh-history':
                        if (currentLocationId) {
                            renderGovernmentHistoryTab(
                                containerId, currentLocationId
                            );
                            _showToast('History refreshed', 'info');
                        }
                        break;

                    case 'end-leader':
                        if (currentLocationId) {
                            var charId = target.dataset.charId;
                            if (charId) {
                                _endLeaderTerm(currentLocationId, charId, refresh);
                            }
                        }
                        break;
                }
            });

            // Toggle for former leaders
            container.addEventListener('click', function(e) {
                var toggle = e.target.closest('[data-toggle="former-leaders"]');
                if (!toggle) return;
                var body = toggle.nextElementSibling;
                if (!body) return;
                var isHidden = body.style.display === 'none';
                body.style.display = isHidden ? 'block' : 'none';
                var icon = toggle.querySelector('.gh-toggle-icon');
                if (icon) {
                    icon.innerHTML = isHidden
                        ? _getIcon('TRIANGLE_DOWN')
                        : _getIcon('TRIANGLE_RIGHT');
                }
            });
        }
    }

    function refreshGovernmentHistoryTab(locationId) {
        var container = document.querySelector('.gh-tab-container');
        if (!container) {
            var candidates = document.querySelectorAll(
                '.gh-tab-container, #government-history-tab'
            );
            if (candidates.length > 0) container = candidates[0];
        }
        if (container) {
            renderGovernmentHistoryTab(
                container.id || 'government-history-tab',
                locationId
            );
        }
    }

    // =========================================================================
    // 7. EXPORTS
    // =========================================================================

    window.GovernmentHistoryTab = {
        render: renderGovernmentHistoryTab,
        refresh: refreshGovernmentHistoryTab,
        getLeaders: _getAllLeaderAssignments,
        getOfficials: _getAllGovernmentOfficials,
        _renderLeaderCard: _renderLeaderCard,
        _renderOfficialCard: _renderOfficialCard,
        _addLeader: _addLeaderToLocation,
        _endLeader: _endLeaderTerm
    };

    window.renderGovernmentHistoryTab = renderGovernmentHistoryTab;
    window.refreshGovernmentHistoryTab = refreshGovernmentHistoryTab;

})();
