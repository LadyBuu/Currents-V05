/**
 * =============================================================================
 * STILL WATERS - GOVERNMENT UI (governmentTabUI.js)
 * =============================================================================
 * 
 * UPDATED: Full integration with GovernmentState, GovernmentCommands,
 *          GovernmentQueries, GovernmentEconomy, GovernmentAssignment
 * 
 * This file contains ALL government management UI for places including:
 * - Government assignment (type and style)
 * - Leader assignment (current and historical)
 * - Leader term management
 * - Rank restrictions display
 * - Government type statistics
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARD
    // =========================================================================

    var _rendering = false;
    var _processingAction = false;

    // =========================================================================
    // 2. SVG ICON HELPERS
    // =========================================================================

    function _getIcon(name, fallback) {
        if (typeof window.Icons !== 'undefined' && window.Icons[name]) {
            return window.Icons[name];
        }
        return fallback || '●';
    }

    function _getCheckIcon() { return _getIcon('CHECK', '✓'); }
    function _getCrossIcon() { return _getIcon('X', '✗'); }
    function _getCircleIcon() { return _getIcon('CIRCLE', '●'); }
    function _getHomeIcon() { return _getIcon('HOME', '⌂'); }
    function _getWarningIcon() { return _getIcon('WARNING', '⚠'); }
    function _getRefreshIcon() { return _getIcon('REFRESH', '⟳'); }
    function _getSearchIcon() { return _getIcon('SEARCH', '⌕'); }
    function _getStarIcon() { return _getIcon('STAR', '★'); }
    function _getGearIcon() { return _getIcon('GEAR', '⚙'); }
    function _getShieldIcon() { return _getIcon('SHIELD', '🛡'); }
    function _getPersonIcon() { return _getIcon('PERSON', '👤'); }
    function _getFlagIcon() { return _getIcon('FLAG', '🏴'); }
    function _getCrownIcon() { return _getIcon('CROWN', '👑'); }
    function _getBookIcon() { return _getIcon('BOOK', '📚'); }
    function _getCoinIcon() { return _getIcon('COIN', '♢'); }

    // =========================================================================
    // 3. DEPENDENCY WRAPPERS
    // =========================================================================

    function _escapeHtml(str) {
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function _showToast(msg, type) {
        if (typeof window._showToast === 'function') return window._showToast(msg, type);
        if (typeof window.showToast === 'function') return window.showToast(msg, type);
        console.log('[' + (type || 'info') + '] ' + msg);
    }

    function _getCurrentYear() {
        if (typeof window._getCurrentYear === 'function') return window._getCurrentYear();
        if (typeof window.getCurrentYearSafe === 'function') return window.getCurrentYearSafe();
        if (typeof window.getCurrentYear === 'function') return window.getCurrentYear();
        return 1250;
    }

    function _getPlaceById(id) {
        return typeof window.getPlaceById === 'function' ? window.getPlaceById(id) : null;
    }

    function _getPlaces() {
        return typeof window.getPlaces === 'function' ? window.getPlaces() : [];
    }

    function _getCharacterById(id) {
        return typeof window.getCharacterById === 'function' ? window.getCharacterById(id) : null;
    }

    function _getCharacters() {
        return typeof window.getCharacters === 'function' ? window.getCharacters() : [];
    }

    function _getRankById(id) {
        return typeof window.getRankById === 'function' ? window.getRankById(id) : null;
    }

    function _getRanks() {
        if (typeof window.getRanks === 'function') return window.getRanks();
        return [];
    }

    function _getActiveRankDisplay(character) {
        if (typeof window.getActiveRankDisplay === 'function') {
            return window.getActiveRankDisplay(character);
        }
        return null;
    }

    function _calculateAge(birthYear, isDeceased, deathYear) {
        if (typeof window.calculateAge === 'function') return window.calculateAge(birthYear, isDeceased, deathYear);
        var currentYear = _getCurrentYear();
        if (!birthYear) return 0;
        if (isDeceased && deathYear) return Math.max(0, deathYear - birthYear);
        return Math.max(0, currentYear - birthYear);
    }

    function _openModal(options) {
        if (typeof window.openModal === 'function') return window.openModal(options);
        if (typeof window._openModal === 'function') return window._openModal(options);
        return null;
    }

    function _closeTopModal() {
        if (typeof window.closeTopModal === 'function') window.closeTopModal();
        if (typeof window._closeTopModal === 'function') window._closeTopModal();
    }

    // =========================================================================
    // 4. GOVERNMENT SYSTEM WRAPPERS
    // =========================================================================

    var _state = window.GovernmentState;
    var _commands = window.GovernmentCommands;
    var _queries = window.GovernmentQueries;
    var _economy = window.GovernmentEconomy;

    function _getGovernmentTypes() {
        return _state ? _state.getGovernmentTypes() : [];
    }

    function _getGovernmentTypeById(id) {
        return _state ? _state.getGovernmentTypeById(id) : null;
    }

    function _getCurrentLeader(placeId) {
        return _queries ? _queries.getCurrentLeader(placeId) : null;
    }

    function _getLeaderHistory(placeId) {
        return _queries ? _queries.getLeaderHistory(placeId) : [];
    }

    function _getLeaderCount(placeId) {
        return _queries ? _queries.getLeaderCount(placeId) : 0;
    }

    function _assignLeader(placeId, characterId, startYear, title) {
        return _commands ? _commands.assignLeader(placeId, characterId, startYear, title) : null;
    }

    function _endLeaderTerm(placeId, characterId, endYear) {
        return _commands ? _commands.endLeaderTerm(placeId, characterId, endYear) : false;
    }

    function _assignGovernment(placeId, govTypeId, govStyle) {
        if (typeof window.assignGovernment === 'function') {
            return window.assignGovernment(placeId, govTypeId, govStyle);
        }
        // Fallback: direct state update
        var place = _getPlaceById(placeId);
        if (place) {
            place.governmentTypeId = govTypeId || null;
            place.governmentStyle = govStyle || null;
            place.updatedAt = Date.now();
            if (typeof window.saveMasterData === 'function') window.saveMasterData();
            if (typeof window.invalidateAccessorCaches === 'function') window.invalidateAccessorCaches();
            return true;
        }
        return false;
    }

    function _getLocationGovernmentSummary(locationId) {
        return _queries ? _queries.getLocationGovernmentSummary(locationId) : null;
    }

    function _getGovernmentStatistics() {
        return _queries ? _queries.getStatistics({ includeDeprecated: false }) : null;
    }

    // =========================================================================
    // 5. STATE
    // =========================================================================

    var governmentUIState = {
        expandedHistoricalLeaders: false,
        showRankRestrictions: false
    };

    // =========================================================================
    // 6. MAIN RENDER FUNCTION
    // =========================================================================

    function renderGovernmentTab(containerId, placeId, onRefresh) {
        if (_rendering) return;
        _rendering = true;

        try {
            var container = document.getElementById(containerId);
            if (!container) return;

            var place = _getPlaceById(placeId);
            if (!place) {
                container.innerHTML = '<div class="empty-state">' + _getHomeIcon() + ' Place not found</div>';
                return;
            }

            var govTypes = _getGovernmentTypes();
            var currentLeader = _getCurrentLeader(placeId);
            var formerLeaders = _getLeaderHistory(placeId).filter(function(l) { return l.endYear; });
            var govType = place.governmentTypeId ? _getGovernmentTypeById(place.governmentTypeId) : null;
            var summary = _getLocationGovernmentSummary(placeId);
            var stats = _getGovernmentStatistics();

            // Get allowed ranks for this government type
            var allowedRanks = [];
            if (govType && govType.allowedRankIds) {
                for (var i = 0; i < govType.allowedRankIds.length; i++) {
                    var rank = _getRankById(govType.allowedRankIds[i]);
                    if (rank) allowedRanks.push(rank);
                }
            }

            var html = 
                '<div class="government-tab" style="padding:16px;">' +
                '<div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px;">' +
                '<div>' +
                '<h3 style="margin:0;">' + _getGearIcon() + ' Government</h3>' +
                '<div style="font-size:0.6rem; color:var(--dim);">' + _getHomeIcon() + ' ' + _escapeHtml(place.displayName) +
                (govType ? ' · ' + _getShieldIcon() + ' ' + _escapeHtml(govType.name) : '') +
                (currentLeader ? ' · ' + _getCrownIcon() + ' ' + _escapeHtml(currentLeader.character ? currentLeader.character.name : 'Unknown') : '') +
                '</div>' +
                '</div>' +
                '<div style="display:flex; gap:8px; flex-wrap:wrap;">' +
                '<button id="refreshGovTabBtn" class="btn small" style="padding:4px 10px;background:var(--bg3);border:1px solid var(--border);border-radius:4px;cursor:pointer;">' + _getRefreshIcon() + ' Refresh</button>' +
                '</div></div>';

            // Stats bar
            html +=
                '<div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(100px,1fr)); gap:8px; margin-bottom:16px;">' +
                '<div style="background:var(--bg2); padding:6px; border-radius:6px; text-align:center;">' +
                '<div style="font-size:0.5rem; color:var(--dim);">' + _getHomeIcon() + ' Departments</div>' +
                '<div style="font-size:0.8rem; font-weight:bold;">' + (summary ? summary.totalDepartments : '0') + '</div></div>' +
                '<div style="background:var(--bg2); padding:6px; border-radius:6px; text-align:center;">' +
                '<div style="font-size:0.5rem; color:var(--dim);">' + _getPersonIcon() + ' Assignments</div>' +
                '<div style="font-size:0.8rem; font-weight:bold;">' + (summary ? summary.totalAssignments : '0') + '</div></div>' +
                '<div style="background:var(--bg2); padding:6px; border-radius:6px; text-align:center;">' +
                '<div style="font-size:0.5rem; color:var(--dim);">' + _getCrownIcon() + ' Leaders</div>' +
                '<div style="font-size:0.8rem; font-weight:bold;">' + (_getLeaderCount(placeId) || '0') + '</div></div>' +
                '<div style="background:var(--bg2); padding:6px; border-radius:6px; text-align:center;">' +
                '<div style="font-size:0.5rem; color:var(--dim);">' + _getShieldIcon() + ' Types</div>' +
                '<div style="font-size:0.8rem; font-weight:bold;">' + govTypes.length + '</div></div>' +
                '</div>';

            // Government Type Section
            html += 
                '<div style="margin-top:12px;background:var(--bg2);padding:16px;border-radius:8px;border:1px solid var(--border);">' +
                '<div style="font-size:0.8rem;font-weight:bold;color:var(--accent);margin-bottom:12px;">' + _getGearIcon() + ' Government Type</div>' +
                '<form id="govForm">' +
                '<div style="display:grid;grid-template-columns:2fr 1fr;gap:12px;">' +
                '<div>' +
                '<label style="display:block;font-size:0.7rem;color:var(--dim);margin-bottom:4px;">Government Type</label>' +
                '<select id="govTypeSelect" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
                '<option value="">— None —</option>' +
                govTypes.map(function(t) {
                    return '<option value="' + t.id + '" ' + (place.governmentTypeId === t.id ? 'selected' : '') + '>' + _escapeHtml(t.name) + '</option>';
                }).join('') +
                '</select>' +
                '</div>' +
                '<div>' +
                '<label style="display:block;font-size:0.7rem;color:var(--dim);margin-bottom:4px;">Style</label>' +
                '<input type="text" id="govStyle" value="' + _escapeHtml(place.governmentStyle || '') + '" placeholder="e.g., Sultanate of..." style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
                '</div>' +
                '</div>' +
                '<div style="display:flex;gap:8px;margin-top:12px;">' +
                '<button type="submit" class="btn primary" style="padding:6px 14px;background:var(--accent);border:none;color:white;border-radius:4px;cursor:pointer;">' + _getCheckIcon() + ' Save</button>' +
                '<button type="button" id="clearGovBtn" class="btn danger" style="padding:6px 14px;background:#8a3020;border:none;color:white;border-radius:4px;cursor:pointer;">' + _getCrossIcon() + ' Clear</button>' +
                '</div>' +
                '</form>' +
                '</div>';

            // Allowed Ranks Section
            if (govType && allowedRanks.length > 0) {
                html += 
                    '<div style="margin-top:12px;background:var(--bg2);padding:12px 16px;border-radius:8px;border:1px solid var(--border);">' +
                    '<div style="font-size:0.65rem;color:var(--accent);margin-bottom:6px;">' + _getShieldIcon() + ' Allowed Ranks for ' + _escapeHtml(govType.name) + '</div>' +
                    '<div style="display:flex;flex-wrap:wrap;gap:6px;">' +
                    allowedRanks.map(function(rank) {
                        return '<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;background:rgba(106,158,207,0.15);border:1px solid var(--accent);border-radius:16px;font-size:0.6rem;color:var(--accent);">' +
                            (rank.symbol || _getCircleIcon()) + ' ' + _escapeHtml(rank.name) +
                            '</span>';
                    }).join('') +
                    '</div>' +
                    '<div style="font-size:0.55rem;color:var(--dim);margin-top:6px;">Only characters with these ranks can be leaders of this government type.</div>' +
                    '</div>';
            }

            // Current Leader Section
            html += 
                '<div style="margin-top:12px;background:var(--bg2);padding:16px;border-radius:8px;border:1px solid var(--border);">' +
                '<div style="font-size:0.8rem;font-weight:bold;color:var(--accent);margin-bottom:12px;">' + _getCrownIcon() + ' Current Leadership</div>' +
                (currentLeader ? 
                '<div>' +
                '<div style="display:flex; align-items:center; gap:8px;">' +
                '<span style="font-size:1.2rem;">' + _getCrownIcon() + '</span>' +
                '<span class="clickable" data-char-id="' + currentLeader.characterId + '" style="cursor:pointer;color:var(--accent);font-size:0.9rem;font-weight:bold;">' +
                _escapeHtml(currentLeader.character ? currentLeader.character.name : 'Unknown') + ' ' + _escapeHtml(currentLeader.character ? currentLeader.character.surname || '' : '') +
                '</span>' +
                '</div>' +
                '<div style="margin-top:8px;display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:6px;font-size:0.65rem;">' +
                '<div><span style="color:var(--dim);">Title:</span> ' + _escapeHtml(currentLeader.title || 'Leader') + '</div>' +
                '<div><span style="color:var(--dim);">Since:</span> ' + currentLeader.startYear + '</div>' +
                (currentLeader.character ? 
                '<div><span style="color:var(--dim);">Age:</span> ' + _calculateAge(currentLeader.character.birthYear, false, null) + ' years</div>' +
                '<div><span style="color:var(--dim);">Rank:</span> ' + (_getActiveRankDisplay(currentLeader.character) ? _getActiveRankDisplay(currentLeader.character).name : 'None') + '</div>' : '') +
                '</div>' +
                '<div style="margin-top:10px;">' +
                '<button id="endLeaderBtn" class="btn small warning" style="padding:4px 12px;background:var(--warn);border:none;color:white;border-radius:4px;cursor:pointer;">' + _getCrossIcon() + ' End Term (' + _getCurrentYear() + ')</button>' +
                '</div>' +
                '</div>' : '<div style="color:var(--dim);font-size:0.8rem;">' + _getCircleIcon() + ' No current leader</div>') +
                '</div>';

            // Assign New Leader Section
            html += 
                '<div style="margin-top:12px;background:var(--bg2);padding:16px;border-radius:8px;border:1px solid var(--border);">' +
                '<div style="font-size:0.8rem;font-weight:bold;color:var(--accent);margin-bottom:12px;">' + _getPersonIcon() + ' Assign New Leader</div>' +
                '<form id="assignLeaderForm">' +
                '<div style="margin-bottom:10px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--dim);margin-bottom:4px;">Select Character</label>' +
                '<select id="leaderSelect" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);"></select>' +
                '</div>' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">' +
                '<div>' +
                '<label style="display:block;font-size:0.7rem;color:var(--dim);margin-bottom:4px;">Title</label>' +
                '<input type="text" id="leaderTitle" placeholder="e.g., King, Mayor" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
                '</div>' +
                '<div>' +
                '<label style="display:block;font-size:0.7rem;color:var(--dim);margin-bottom:4px;">Start Year</label>' +
                '<input type="number" id="leaderStartYear" value="' + _getCurrentYear() + '" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
                '</div>' +
                '</div>' +
                '<button type="submit" class="btn primary" style="padding:6px 14px;background:var(--accent);border:none;color:white;border-radius:4px;cursor:pointer;">' + _getCrownIcon() + ' Assign</button>' +
                '</form>' +
                '</div>';

            // Former Leaders Section
            html += 
                '<div style="margin-top:12px;background:var(--bg2);padding:16px;border-radius:8px;border:1px solid var(--border);">' +
                '<div data-section="historical" style="display:flex;align-items:center;gap:8px;font-size:0.8rem;font-weight:bold;color:var(--accent);cursor:pointer;">' +
                '<span class="toggle-icon" style="font-size:0.6rem;">' + (governmentUIState.expandedHistoricalLeaders ? '▼' : '▶') + '</span>' +
                '<span>' + _getFlagIcon() + ' Former Leaders (' + formerLeaders.length + ')</span>' +
                '</div>' +
                '<div style="' + (governmentUIState.expandedHistoricalLeaders ? '' : 'display:none') + 'margin-top:12px;">' +
                (formerLeaders.length === 0 ? '<div style="color:var(--dim);font-size:0.8rem;">' + _getCircleIcon() + ' No former leaders</div>' : 
                '<div style="display:flex;flex-direction:column;gap:6px;">' +
                formerLeaders.map(function(leader) {
                    var charName = leader.character ? leader.character.name : 'Unknown';
                    var charSurname = leader.character ? leader.character.surname || '' : '';
                    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:var(--bg3);border-radius:6px;flex-wrap:wrap;gap:6px;">' +
                        '<span class="clickable" data-char-id="' + leader.characterId + '" style="cursor:pointer;color:var(--accent);font-weight:bold;font-size:0.7rem;">' +
                        _escapeHtml(charName) + ' ' + _escapeHtml(charSurname) +
                        '</span>' +
                        '<span style="font-size:0.6rem;color:var(--dim);">' + leader.startYear + ' — ' + leader.endYear + '</span>' +
                        '<span style="font-size:0.6rem;color:var(--accent);">' + _escapeHtml(leader.title || 'Leader') + '</span>' +
                        '</div>';
                }).join('') +
                '</div>') +
                '</div>' +
                '</div>' +
                '</div>';

            container.innerHTML = html;

            // Populate leader select dropdown
            populateLeaderSelect(placeId, govType);

            // Attach event handlers
            attachGovernmentFormHandlers(placeId, onRefresh);
            attachLeaderAssignmentHandlers(placeId, onRefresh);
            attachGovernmentUIHandlers(placeId, onRefresh);

        } finally {
            _rendering = false;
        }
    }

    // =========================================================================
    // 7. POPULATE LEADER SELECT
    // =========================================================================

    function populateLeaderSelect(placeId, govType) {
        var leaderSelect = document.getElementById('leaderSelect');
        if (!leaderSelect) return;

        var eligible = _getCharacters().filter(function(c) { return !c.isDeceased; });

        // Filter by allowed ranks if government type has restrictions
        if (govType && govType.allowedRankIds && govType.allowedRankIds.length > 0) {
            eligible = eligible.filter(function(c) {
                var hasAllowedRank = false;
                if (c.rankAssignments) {
                    for (var i = 0; i < c.rankAssignments.length; i++) {
                        if (!c.rankAssignments[i].isDeprecated && govType.allowedRankIds.indexOf(c.rankAssignments[i].rankId) !== -1) {
                            hasAllowedRank = true;
                            break;
                        }
                    }
                }
                return hasAllowedRank || (c.activeRankId && govType.allowedRankIds.indexOf(c.activeRankId) !== -1);
            });
        }

        // Sort by name
        eligible.sort(function(a, b) { return a.name.localeCompare(b.name); });

        var optionsHtml = '<option value="">— Select character —</option>';
        for (var i = 0; i < eligible.length; i++) {
            var char = eligible[i];
            var age = _calculateAge(char.birthYear, false, null);
            var rank = _getActiveRankDisplay(char);
            var rankDisplay = rank ? (rank.display || rank.name) + ' ' : '';
            var genderIcon = char.gender === 'male' ? '♂' : (char.gender === 'female' ? '♀' : '⚥');
            optionsHtml += '<option value="' + char.id + '">' + rankDisplay + _escapeHtml(char.name) + ' ' + _escapeHtml(char.surname || '') + ' (' + age + 'y, ' + genderIcon + ')</option>';
        }

        leaderSelect.innerHTML = optionsHtml;
    }

    // =========================================================================
    // 8. EVENT HANDLERS
    // =========================================================================

    function attachGovernmentFormHandlers(placeId, onRefresh) {
        var govForm = document.getElementById('govForm');
        var clearBtn = document.getElementById('clearGovBtn');

        if (govForm && !govForm._submitAttached) {
            govForm.addEventListener('submit', function(e) {
                e.preventDefault();

                var govTypeId = document.getElementById('govTypeSelect').value || null;
                var govStyle = document.getElementById('govStyle').value || null;

                var result = _assignGovernment(placeId, govTypeId, govStyle);
                if (result) {
                    if (onRefresh) onRefresh();
                    _showToast(_getCheckIcon() + ' Government saved', 'success');
                } else {
                    _showToast(_getCrossIcon() + ' Failed to save government', 'error');
                }
            });
            govForm._submitAttached = true;
        }

        if (clearBtn && !clearBtn._clickAttached) {
            clearBtn.addEventListener('click', function() {
                var result = _assignGovernment(placeId, null, null);
                if (result) {
                    if (onRefresh) onRefresh();
                    _showToast(_getCircleIcon() + ' Government cleared', 'info');
                } else {
                    _showToast(_getCrossIcon() + ' Failed to clear government', 'error');
                }
            });
            clearBtn._clickAttached = true;
        }
    }

    function attachLeaderAssignmentHandlers(placeId, onRefresh) {
        var assignForm = document.getElementById('assignLeaderForm');
        var endLeaderBtn = document.getElementById('endLeaderBtn');

        if (assignForm && !assignForm._submitAttached) {
            assignForm.addEventListener('submit', function(e) {
                e.preventDefault();

                var characterId = document.getElementById('leaderSelect').value;
                var title = document.getElementById('leaderTitle').value;
                var startYear = parseInt(document.getElementById('leaderStartYear').value);

                if (!characterId) {
                    _showToast(_getCrossIcon() + ' Select a character', 'error');
                    return;
                }
                if (isNaN(startYear)) {
                    _showToast(_getCrossIcon() + ' Enter a valid start year', 'error');
                    return;
                }

                var result = _assignLeader(placeId, characterId, startYear, title);
                if (result) {
                    if (onRefresh) onRefresh();
                    _showToast(_getCheckIcon() + ' Leader assigned', 'success');
                } else {
                    _showToast(_getCrossIcon() + ' Failed to assign leader', 'error');
                }
            });
            assignForm._submitAttached = true;
        }

        if (endLeaderBtn && !endLeaderBtn._clickAttached) {
            endLeaderBtn.addEventListener('click', function() {
                var currentLeader = _getCurrentLeader(placeId);
                if (!currentLeader) {
                    _showToast(_getWarningIcon() + ' No current leader to end', 'warning');
                    return;
                }

                var endYear = _getCurrentYear();

                _openModal({
                    title: _getCrossIcon() + ' End Term',
                    content: 
                        '<div style="margin-bottom:12px;">' +
                        '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">End Year</label>' +
                        '<input type="number" id="endYearInput" value="' + endYear + '" min="' + currentLeader.startYear + '" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
                        '</div>' +
                        '<div style="margin-bottom:12px;">' +
                        '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Reason</label>' +
                        '<input type="text" id="endReasonInput" placeholder="e.g., Died, Abdicated" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
                        '</div>',
                    confirmText: _getCheckIcon() + ' End Term',
                    onConfirm: function() {
                        var year = parseInt(document.getElementById('endYearInput').value);
                        var reason = document.getElementById('endReasonInput').value;

                        if (isNaN(year)) {
                            _showToast(_getCrossIcon() + ' Enter a valid year', 'error');
                            return false;
                        }

                        var result = _endLeaderTerm(placeId, currentLeader.characterId, year);
                        if (result) {
                            _closeTopModal();
                            if (onRefresh) onRefresh();
                            _showToast(_getCheckIcon() + ' Leader term ended in ' + year, 'info');
                            return true;
                        } else {
                            _showToast(_getCrossIcon() + ' Failed to end term', 'error');
                            return false;
                        }
                    }
                });
            });
            endLeaderBtn._clickAttached = true;
        }
    }

    function attachGovernmentUIHandlers(placeId, onRefresh) {
        // Historical leaders collapsible section
        var histHeader = document.querySelector('[data-section="historical"]');
        if (histHeader && !histHeader._clickAttached) {
            histHeader.addEventListener('click', function() {
                var content = this.nextElementSibling;
                var icon = this.querySelector('.toggle-icon');
                var isExpanded = content ? content.style.display !== 'none' : false;

                if (content) {
                    content.style.display = isExpanded ? 'none' : 'block';
                    if (icon) icon.textContent = isExpanded ? '▶' : '▼';
                    governmentUIState.expandedHistoricalLeaders = !isExpanded;
                }
            });
            histHeader._clickAttached = true;
        }

        // Clickable leader names
        var clickableNames = document.querySelectorAll('.clickable[data-char-id]');
        for (var i = 0; i < clickableNames.length; i++) {
            var name = clickableNames[i];
            if (name._clickAttached) continue;
            name.addEventListener('click', function() {
                var charId = this.dataset.charId;
                if (charId) {
                    if (typeof window.selectCharacter === 'function') {
                        window.selectCharacter(charId);
                    } else if (typeof window.openCharacterDetailsModal === 'function') {
                        window.openCharacterDetailsModal(charId);
                    }
                }
            });
            name._clickAttached = true;
        }

        var refreshBtn = document.getElementById('refreshGovTabBtn');
        if (refreshBtn && !refreshBtn._clickAttached) {
            refreshBtn.addEventListener('click', function() {
                if (onRefresh) onRefresh();
                _showToast(_getRefreshIcon() + ' Refreshed', 'success');
            });
            refreshBtn._clickAttached = true;
        }
    }

    // =========================================================================
    // 9. EXPORTS
    // =========================================================================

    window.renderGovernmentTab = renderGovernmentTab;
    window.governmentUIState = governmentUIState;

 

})();