/**
 * =============================================================================
 * STILL WATERS - GOVERNMENT UI
 * File: js/ui/gm-government-tab-ui.js
 * =============================================================================
 * 
 * UPDATED: Fixed duplicate buttons - removed extra "Assign Type" button
 * UPDATED: Assign leader now uses character selector
 * UPDATED: Removed duplicate refresh button
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
    function _getGearIcon() { return _getIcon('GEAR', '⚙'); }
    function _getShieldIcon() { return _getIcon('SHIELD', '🛡'); }
    function _getPersonIcon() { return _getIcon('PERSON', '👤'); }
    function _getFlagIcon() { return _getIcon('FLAG', '🏴'); }
    function _getCrownIcon() { return _getIcon('CROWN', '👑'); }

    // =========================================================================
    // 3. DEPENDENCY WRAPPERS
    // =========================================================================

    function _escapeHtml(str) {
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
        if (typeof window._escapeHtml === 'function') return window._escapeHtml(str);
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function _showToast(msg, type) {
        var plainMessage = msg;
        if (typeof msg === 'string') {
            plainMessage = msg.replace(/<[^>]*>/g, '');
        }
        if (typeof window._showToast === 'function') return window._showToast(plainMessage, type);
        if (typeof window.showToast === 'function') return window.showToast(plainMessage, type);
        console.log('[' + (type || 'info') + '] ' + plainMessage);
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

    function _getCharacterById(id) {
        return typeof window.getCharacterById === 'function' ? window.getCharacterById(id) : null;
    }

    function _getCharacters() {
        return typeof window.getCharacters === 'function' ? window.getCharacters() : [];
    }

    function _getRankById(id) {
        return typeof window.getRankById === 'function' ? window.getRankById(id) : null;
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

    // =========================================================================
    // 4. MODAL WRAPPERS
    // =========================================================================

    function _openModal(options) {
        if (typeof window.openModal === 'function') return window.openModal(options);
        if (typeof window._openModal === 'function') return window._openModal(options);
        return null;
    }

    function _closeTopModal() {
        if (typeof window.closeTopModal === 'function') window.closeTopModal();
        if (typeof window._closeTopModal === 'function') window._closeTopModal();
    }

    function _openAssignGovernmentModal(placeId, onSuccess) {
        if (typeof window.openAssignGovernmentModal === 'function') {
            return window.openAssignGovernmentModal(placeId, onSuccess);
        }
        if (typeof window._openAssignGovernmentModal === 'function') {
            return window._openAssignGovernmentModal(placeId, onSuccess);
        }
        _showToast('Assign government modal not available', 'error');
        return null;
    }

    function _openCharacterSelector(options) {
        if (typeof window.openCharacterSelector === 'function') {
            return window.openCharacterSelector(options);
        }
        if (typeof window.openUnifiedCharacterSelector === 'function') {
            return window.openUnifiedCharacterSelector(options);
        }
        if (typeof window._openCharacterSelector === 'function') {
            return window._openCharacterSelector(options);
        }
        _showToast('Character selector not available', 'error');
        return null;
    }

    // =========================================================================
    // 5. GOVERNMENT SYSTEM WRAPPERS
    // =========================================================================

    var _state = window.GovernmentState;
    var _commands = window.GovernmentCommands;
    var _queries = window.GovernmentQueries;

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

    // =========================================================================
    // 6. STATE
    // =========================================================================

    var governmentUIState = {
        expandedHistoricalLeaders: false
    };

    // =========================================================================
    // 7. MAIN RENDER FUNCTION
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

            var allowedRanks = [];
            if (govType && govType.allowedRankIds) {
                for (var i = 0; i < govType.allowedRankIds.length; i++) {
                    var rank = _getRankById(govType.allowedRankIds[i]);
                    if (rank) allowedRanks.push(rank);
                }
            }

            // --- HEADER ---
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
                // Only refresh button in header - NO Assign Type button here
                '<div style="display:flex; gap:8px; flex-wrap:wrap;">' +
                '<button id="refreshGovTabBtn" class="btn small" style="padding:4px 10px;background:var(--bg3);border:1px solid var(--border);border-radius:4px;cursor:pointer;">' + _getRefreshIcon() + ' Refresh</button>' +
                '</div></div>';

            // --- STATS ROW ---
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

            // --- SINGLE Government Type Section - ONE button only ---
            html += 
                '<div style="margin-top:12px;background:var(--bg2);padding:16px;border-radius:8px;border:1px solid var(--border);">' +
                '<div style="font-size:0.8rem;font-weight:bold;color:var(--accent);margin-bottom:12px;">' + _getGearIcon() + ' Government Type</div>' +
                '<div style="display:flex; gap:16px; flex-wrap:wrap; align-items:center;">' +
                '<div><span style="color:var(--dim);">Current Type:</span> ' + (govType ? _escapeHtml(govType.name) : 'None') + '</div>' +
                '<div><span style="color:var(--dim);">Style:</span> ' + (place.governmentStyle ? _escapeHtml(place.governmentStyle) : 'None') + '</div>' +
                '<div><button id="assignGovTypeBtn" class="btn primary" style="padding:4px 12px;background:var(--accent);border:none;color:white;border-radius:4px;cursor:pointer;">' + _getGearIcon() + ' Assign</button></div>' +
                '<div><button id="clearGovBtn" class="btn danger" style="padding:4px 12px;background:#8a3020;border:none;color:white;border-radius:4px;cursor:pointer;">' + _getCrossIcon() + ' Clear</button></div>' +
                '</div>' +
                '</div>';

            // --- Allowed Ranks Section ---
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

            // --- Current Leader Section ---
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

            // --- Assign New Leader Section (with character selector) ---
            html += 
                '<div style="margin-top:12px;background:var(--bg2);padding:16px;border-radius:8px;border:1px solid var(--border);">' +
                '<div style="font-size:0.8rem;font-weight:bold;color:var(--accent);margin-bottom:12px;">' + _getPersonIcon() + ' Assign New Leader</div>' +
                '<div style="display:flex; gap:12px; flex-wrap:wrap; align-items:center; margin-bottom:12px;">' +
                '<button id="selectLeaderBtn" class="btn primary" style="padding:6px 14px;background:var(--accent);border:none;color:white;border-radius:4px;cursor:pointer;">' + _getPersonIcon() + ' Select Character</button>' +
                '<span id="selectedLeaderDisplay" style="font-size:0.7rem;color:var(--dim);">No character selected</span>' +
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
                '<button id="assignLeaderBtn" class="btn primary" style="padding:6px 14px;background:var(--accent);border:none;color:white;border-radius:4px;cursor:pointer;">' + _getCrownIcon() + ' Assign</button>' +
                '</div>';

            // --- Former Leaders Section ---
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
            attachGovernmentTabHandlers(placeId, onRefresh);

        } finally {
            _rendering = false;
        }
    }

    // =========================================================================
    // 8. EVENT HANDLERS - FIXED: No duplicate handlers
    // =========================================================================

    function attachGovernmentTabHandlers(placeId, onRefresh) {
        // Track selected leader
        var selectedLeaderId = null;

        // SINGLE Assign government type button (in the government type section)
        var assignGovTypeBtn = document.getElementById('assignGovTypeBtn');
        if (assignGovTypeBtn && !assignGovTypeBtn._clickAttached) {
            assignGovTypeBtn.addEventListener('click', function() {
                _openAssignGovernmentModal(placeId, function() {
                    if (onRefresh) onRefresh();
                });
            });
            assignGovTypeBtn._clickAttached = true;
        }

        // Clear government button
        var clearBtn = document.getElementById('clearGovBtn');
        if (clearBtn && !clearBtn._clickAttached) {
            clearBtn.addEventListener('click', function() {
                var result = _assignGovernment(placeId, null, null);
                if (result) {
                    if (onRefresh) onRefresh();
                    _showToast('Government cleared', 'info');
                } else {
                    _showToast('Failed to clear government', 'error');
                }
            });
            clearBtn._clickAttached = true;
        }

        // Select Leader button - opens character selector
        var selectLeaderBtn = document.getElementById('selectLeaderBtn');
        if (selectLeaderBtn && !selectLeaderBtn._clickAttached) {
            selectLeaderBtn.addEventListener('click', function() {
                _openCharacterSelector({
                    title: 'Select Leader',
                    filters: {
                        status: 'all',
                        showDeceased: false
                    },
                    onSelect: function(character) {
                        selectedLeaderId = character.id;
                        var display = document.getElementById('selectedLeaderDisplay');
                        if (display) {
                            display.textContent = character.name + ' ' + (character.surname || '');
                            display.style.color = 'var(--accent)';
                        }
                        _showToast('Selected: ' + character.name, 'success');
                    },
                    onCancel: function() {
                        // Do nothing
                    }
                });
            });
            selectLeaderBtn._clickAttached = true;
        }

        // Assign Leader button
        var assignLeaderBtn = document.getElementById('assignLeaderBtn');
        if (assignLeaderBtn && !assignLeaderBtn._clickAttached) {
            assignLeaderBtn.addEventListener('click', function() {
                if (!selectedLeaderId) {
                    _showToast('Select a character first', 'warning');
                    return;
                }
                
                var title = document.getElementById('leaderTitle').value || 'Leader';
                var startYear = parseInt(document.getElementById('leaderStartYear').value) || _getCurrentYear();
                
                var result = _assignLeader(placeId, selectedLeaderId, startYear, title);
                if (result) {
                    if (onRefresh) onRefresh();
                    _showToast('Leader assigned', 'success');
                    selectedLeaderId = null;
                    var display = document.getElementById('selectedLeaderDisplay');
                    if (display) {
                        display.textContent = 'No character selected';
                        display.style.color = 'var(--dim)';
                    }
                } else {
                    _showToast('Failed to assign leader', 'error');
                }
            });
            assignLeaderBtn._clickAttached = true;
        }

        // End leader button
        var endLeaderBtn = document.getElementById('endLeaderBtn');
        if (endLeaderBtn && !endLeaderBtn._clickAttached) {
            endLeaderBtn.addEventListener('click', function() {
                var currentLeader = _getCurrentLeader(placeId);
                if (!currentLeader) {
                    _showToast('No current leader to end', 'warning');
                    return;
                }

                var endYear = _getCurrentYear();

                _openModal({
                    title: 'End Term',
                    content: 
                        '<div style="margin-bottom:12px;">' +
                        '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">End Year</label>' +
                        '<input type="number" id="endYearInput" value="' + endYear + '" min="' + currentLeader.startYear + '" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
                        '</div>' +
                        '<div style="margin-bottom:12px;">' +
                        '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Reason</label>' +
                        '<input type="text" id="endReasonInput" placeholder="e.g., Died, Abdicated" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
                        '</div>',
                    confirmText: 'End Term',
                    cancelText: 'Cancel',
                    onConfirm: function() {
                        var year = parseInt(document.getElementById('endYearInput').value);
                        if (isNaN(year)) {
                            _showToast('Enter a valid year', 'error');
                            return false;
                        }

                        var result = _endLeaderTerm(placeId, currentLeader.characterId, year);
                        if (result) {
                            _closeTopModal();
                            if (onRefresh) onRefresh();
                            _showToast('Leader term ended in ' + year, 'info');
                            return true;
                        } else {
                            _showToast('Failed to end term', 'error');
                            return false;
                        }
                    }
                });
            });
            endLeaderBtn._clickAttached = true;
        }

        // Historical leaders collapsible
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

        // Refresh button
        var refreshBtn = document.getElementById('refreshGovTabBtn');
        if (refreshBtn && !refreshBtn._clickAttached) {
            refreshBtn.addEventListener('click', function() {
                if (onRefresh) onRefresh();
                _showToast('Refreshed', 'success');
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