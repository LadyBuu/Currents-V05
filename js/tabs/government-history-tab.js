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
 * DEPENDENCIES:
 *   - accessors.js (getPlaceById, getCharacterById, getCharacters)
 *   - government-state.js (GovernmentState)
 *   - government-commands.js (GovernmentCommands)
 *   - formatting.js (escapeHtml)
 *   - icons.js (Icons)
 *   - ui.js (showToast)
 *   - modals-core.js (openModal, confirmDialog)
 *   - modals-char-select.js (openCharacterSelector)
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getPlaceById(id) {
        return typeof window.getPlaceById === 'function' ? window.getPlaceById(id) : null;
    }

    function _getCharacterById(id) {
        return typeof window.getCharacterById === 'function' ? window.getCharacterById(id) : null;
    }

    function _getCharacters() {
        return typeof window.getCharacters === 'function' ? window.getCharacters() : [];
    }

    function _getGovernmentState() {
        return typeof window.GovernmentState !== 'undefined' ? window.GovernmentState : null;
    }

    function _getGovernmentCommands() {
        return typeof window.GovernmentCommands !== 'undefined' ? window.GovernmentCommands : null;
    }

    function _escapeHtml(str) {
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
        if (typeof str !== 'string') return String(str);
        return str.replace(/[&<>"']/g, function(m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            if (m === '"') return '&quot;';
            if (m === "'") return '&#039;';
            return m;
        });
    }

    function _getIcon(name) {
        if (typeof window.getIcon === 'function') return window.getIcon(name);
        if (typeof window.Icons !== 'undefined' && window.Icons[name]) return window.Icons[name];
        return '';
    }

    function _showToast(message, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        } else if (typeof window.showToastMessage === 'function') {
            window.showToastMessage(message, type);
        }
    }

    function _openModal(options) {
        if (typeof window.openModal === 'function') return window.openModal(options);
        return null;
    }

    function _openCharacterSelector(options) {
        if (typeof window.openCharacterSelector === 'function') {
            return window.openCharacterSelector(options);
        }
        return null;
    }

    function _confirmDialog(message, title, onConfirm) {
        if (typeof window.confirmDialog === 'function') {
            window.confirmDialog(message, title, onConfirm);
            return true;
        }
        return false;
    }

    function _saveMasterData() {
        if (typeof window.saveMasterData === 'function') window.saveMasterData();
    }

    function _getCurrentYear() {
        if (typeof window.getCurrentYearSafe === 'function') return window.getCurrentYearSafe();
        if (typeof window.getCurrentYear === 'function') return window.getCurrentYear();
        return 1250;
    }

    function _calculateAge(birthYear, deathYear, currentYear) {
        if (typeof window.calculateAge === 'function') {
            return window.calculateAge(birthYear, false, deathYear, currentYear);
        }
        if (!birthYear) return null;
        var year = currentYear || _getCurrentYear();
        if (deathYear && deathYear < year) year = deathYear;
        return Math.max(0, year - birthYear);
    }

    // =========================================================================
    // 2. DATA HELPERS
    // =========================================================================

    function _getAllLeaderAssignments(place) {
        if (!place) return [];
        return place.leaderAssignments || [];
    }

    function _getAssociatedCharacters(place) {
        // Get characters who have positions in departments at this location
        var state = _getGovernmentState();
        if (!state) return [];
        
        var depts = state.getDepartmentsByLocation ? state.getDepartmentsByLocation(place.id) : [];
        var associated = {};
        var characters = _getCharacters();

        for (var i = 0; i < depts.length; i++) {
            var dept = depts[i];
            if (!dept.assignments) continue;
            
            for (var a = 0; a < dept.assignments.length; a++) {
                var assignment = dept.assignments[a];
                if (assignment.endYear) continue; // Only active assignments
                
                var charId = assignment.characterId;
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
                
                associated[charId].positions.push(pos ? pos.name : assignment.positionId);
                associated[charId].departments.push(dept.name);
            }
        }

        // Convert to array and add character info
        var result = [];
        for (var charId in associated) {
            var char = _getCharacterById(charId);
            if (!char) continue;
            
            result.push({
                characterId: charId,
                character: char,
                positions: associated[charId].positions,
                departments: associated[charId].departments,
                isDeceased: char.isDeceased || false
            });
        }

        // Sort by name
        result.sort(function(a, b) {
            var nameA = a.character.name + (a.character.surname || '');
            var nameB = b.character.name + (b.character.surname || '');
            return nameA.localeCompare(nameB);
        });

        return result;
    }

    function _getAllGovernmentOfficials(place) {
        // Get characters who are leaders or have government positions
        var leaders = _getAllLeaderAssignments(place);
        var associated = _getAssociatedCharacters(place);
        
        var officials = {};
        
        // Add leaders
        for (var i = 0; i < leaders.length; i++) {
            var leader = leaders[i];
            var char = _getCharacterById(leader.characterId);
            if (!char) continue;
            
            officials[leader.characterId] = {
                characterId: leader.characterId,
                character: char,
                type: 'leader',
                leaderInfo: leader,
                isActive: leader.isActive && !leader.endYear,
                positions: [],
                departments: []
            };
        }
        
        // Add associated characters (if not already leaders)
        for (var a = 0; a < associated.length; a++) {
            var assoc = associated[a];
            if (officials[assoc.characterId]) {
                // Already a leader, add positions
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
    // 3. RENDER FUNCTIONS
    // =========================================================================

    function _renderLeaderCard(assignment, placeId, index) {
        var char = _getCharacterById(assignment.characterId);
        var charName = char ? (char.name + (char.surname ? ' ' + char.surname : '')) : 'Unknown';
        var isActive = assignment.isActive && !assignment.endYear;
        var age = char ? _calculateAge(char.birthYear, char.deathYear) : null;

        var html = '<div class="gh-leader-card" data-leader-id="' + _escapeHtml(assignment.id) + '">';
        html += '<div class="gh-leader-number">#' + (index + 1) + '</div>';
        html += '<div class="gh-leader-info">';
        html += '<div class="gh-leader-name">' + _escapeHtml(charName) + '</div>';
        if (assignment.title) {
            html += '<div class="gh-leader-title">' + _escapeHtml(assignment.title) + '</div>';
        }
        html += '<div class="gh-leader-period">';
        html += '<span class="gh-leader-start">' + (assignment.startYear || '?') + '</span>';
        if (assignment.endYear) {
            html += ' <span class="gh-leader-arrow">→</span> <span class="gh-leader-end">' + assignment.endYear + '</span>';
        } else {
            html += ' <span class="gh-leader-arrow">→</span> <span class="gh-leader-present">Present</span>';
        }
        if (assignment.endReason) {
            html += ' <span class="gh-leader-reason">(' + _escapeHtml(assignment.endReason) + ')</span>';
        }
        html += '</div>';
        if (age !== null) {
            html += '<div class="gh-leader-age">Age: ' + age + ' years</div>';
        }
        if (char && char.birthYear) {
            html += '<div class="gh-leader-birth">Born: ' + char.birthYear + '</div>';
        }
        if (isActive) {
            html += '<div class="gh-leader-status active">Current Leader</div>';
        } else {
            html += '<div class="gh-leader-status ended">Former Leader</div>';
        }
        html += '</div>';
        html += '<div class="gh-leader-actions">';
        if (isActive) {
            html += '<button class="gh-btn gh-btn-end" data-action="end-leader" data-leader-id="' + _escapeHtml(assignment.id) + '" data-char-id="' + _escapeHtml(assignment.characterId) + '">' + _getIcon('X') + ' End Term</button>';
        }
        html += '</div>';
        html += '</div>';
        
        return html;
    }

    function _renderOfficialCard(official) {
        var char = official.character;
        var charName = char ? (char.name + (char.surname ? ' ' + char.surname : '')) : 'Unknown';
        var age = char ? _calculateAge(char.birthYear, char.deathYear) : null;

        var html = '<div class="gh-official-card">';
        html += '<div class="gh-official-info">';
        html += '<div class="gh-official-name">' + _escapeHtml(charName) + '</div>';
        if (official.positions.length > 0) {
            html += '<div class="gh-official-positions">';
            for (var i = 0; i < official.positions.length; i++) {
                html += '<span class="gh-official-position">' + _escapeHtml(official.positions[i]) + '</span>';
            }
            html += '</div>';
        }
        if (official.departments.length > 0) {
            html += '<div class="gh-official-departments">';
            html += 'Department: ' + _escapeHtml(official.departments.join(', '));
            html += '</div>';
        }
        if (age !== null) {
            html += '<div class="gh-official-age">Age: ' + age + ' years</div>';
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
            return '<div class="gh-details-empty">Select a location to view government history.</div>';
        }

        var leaders = _getAllLeaderAssignments(place);
        var officials = _getAllGovernmentOfficials(place);
        
        // Sort leaders by start year (oldest first)
        var sortedLeaders = leaders.slice().sort(function(a, b) {
            return (a.startYear || 0) - (b.startYear || 0);
        });

        // Separate current and former
        var currentLeaders = sortedLeaders.filter(function(l) { return l.isActive && !l.endYear; });
        var formerLeaders = sortedLeaders.filter(function(l) { return !l.isActive || l.endYear; });

        var html = '<div class="gh-tab-container">';
        
        // Header
        html += '<div class="gh-tab-header">';
        html += '<h3>Government History - ' + _escapeHtml(place.displayName || place.name) + '</h3>';
        html += '<div class="gh-tab-actions">';
        html += '<button class="gh-btn gh-btn-add" data-action="add-leader">' + _getIcon('PLUS') + ' Add Leader</button>';
        html += '<button class="gh-btn gh-btn-refresh" data-action="refresh-history">' + _getIcon('REFRESH') + ' Refresh</button>';
        html += '</div>';
        html += '</div>';

        // Summary stats
        html += '<div class="gh-stats-summary">';
        html += '<div class="gh-stat"><span class="gh-stat-label">Total Leaders</span><span class="gh-stat-value">' + leaders.length + '</span></div>';
        html += '<div class="gh-stat"><span class="gh-stat-label">Current</span><span class="gh-stat-value" style="color:#28a745;">' + currentLeaders.length + '</span></div>';
        html += '<div class="gh-stat"><span class="gh-stat-label">Former</span><span class="gh-stat-value" style="color:#dc3545;">' + formerLeaders.length + '</span></div>';
        html += '<div class="gh-stat"><span class="gh-stat-label">Officials</span><span class="gh-stat-value" style="color:#4a90d9;">' + officials.length + '</span></div>';
        html += '</div>';

        // =============================================================
        // LEADERS SECTION
        // =============================================================
        html += '<div class="gh-section">';
        html += '<div class="gh-section-header">';
        html += '<span>Leadership History</span>';
        html += '</div>';

        if (leaders.length === 0) {
            html += '<div class="gh-empty">';
            html += '<p>No leaders in history. Assign a leader to begin.</p>';
            html += '</div>';
        } else {
            // Current leaders
            if (currentLeaders.length > 0) {
                html += '<div class="gh-subsection">';
                html += '<div class="gh-subsection-header">Current Leaders</div>';
                html += '<div class="gh-leaders-list">';
                for (var i = 0; i < currentLeaders.length; i++) {
                    var leaderIndex = sortedLeaders.indexOf(currentLeaders[i]);
                    html += _renderLeaderCard(currentLeaders[i], place.id, leaderIndex);
                }
                html += '</div>';
                html += '</div>';
            }

            // Former leaders (collapsible)
            if (formerLeaders.length > 0) {
                html += '<div class="gh-subsection gh-subsection-ended">';
                html += '<div class="gh-subsection-toggle" data-toggle="former-leaders">';
                html += '<span class="gh-subsection-label">Former Leaders (' + formerLeaders.length + ')</span>';
                html += '<span class="gh-toggle-icon">' + _getIcon('TRIANGLE_RIGHT') + '</span>';
                html += '</div>';
                html += '<div class="gh-subsection-body" style="display:none;">';
                html += '<div class="gh-leaders-list">';
                for (var f = 0; f < formerLeaders.length; f++) {
                    var leaderIdx = sortedLeaders.indexOf(formerLeaders[f]);
                    html += _renderLeaderCard(formerLeaders[f], place.id, leaderIdx);
                }
                html += '</div>';
                html += '</div>';
                html += '</div>';
            }
        }
        html += '</div>';

        // =============================================================
        // OFFICIALS SECTION
        // =============================================================
        html += '<div class="gh-section">';
        html += '<div class="gh-section-header">';
        html += '<span>Government Officials (' + officials.length + ')</span>';
        html += '</div>';

        if (officials.length === 0) {
            html += '<div class="gh-empty">';
            html += '<p>No government officials found. Assign characters to department positions.</p>';
            html += '</div>';
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
    // 4. LEADER ACTIONS
    // =========================================================================

    function _addLeaderToLocation(placeId) {
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

                var content = '<div class="gh-leader-form">';
                content += '<p>Add <strong>' + _escapeHtml(char.name + (char.surname ? ' ' + char.surname : '')) + '</strong> as a leader.</p>';
                content += '<div class="form-group">';
                content += '<label for="gh-leader-title-input">Title</label>';
                content += '<input type="text" id="gh-leader-title-input" class="form-control" placeholder="e.g., Mayor, Governor, King" value="Leader">';
                content += '</div>';
                content += '<div class="form-row">';
                content += '<div class="form-group">';
                content += '<label for="gh-leader-start-year">Start Year *</label>';
                content += '<input type="number" id="gh-leader-start-year" class="form-control" value="' + _getCurrentYear() + '">';
                content += '</div>';
                content += '<div class="form-group">';
                content += '<label for="gh-leader-end-year">End Year (leave empty for current)</label>';
                content += '<input type="number" id="gh-leader-end-year" class="form-control" placeholder="Optional">';
                content += '</div>';
                content += '</div>';
                content += '<div class="form-group">';
                content += '<label for="gh-leader-reason">End Reason (if ended)</label>';
                content += '<input type="text" id="gh-leader-reason" class="form-control" placeholder="e.g., Term ended, Resigned, Removed">';
                content += '</div>';
                content += '<div class="form-group">';
                content += '<label class="gh-checkbox-label">';
                content += '<input type="checkbox" id="gh-leader-is-active" checked> ';
                content += 'This is a current/active leader';
                content += '</label>';
                content += '</div>';
                content += '</div>';

                _openModal({
                    title: 'Add Leader',
                    content: content,
                    confirmText: 'Add Leader',
                    cancelText: 'Cancel',
                    onOpen: function() {
                        // Toggle end year visibility based on active status
                        var activeCheck = document.getElementById('gh-leader-is-active');
                        var endYearInput = document.getElementById('gh-leader-end-year');
                        var reasonInput = document.getElementById('gh-leader-reason');
                        
                        if (activeCheck && endYearInput && reasonInput) {
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
                        }
                    },
                    onConfirm: function() {
                        var titleInput = document.getElementById('gh-leader-title-input');
                        var startYearInput = document.getElementById('gh-leader-start-year');
                        var endYearInput = document.getElementById('gh-leader-end-year');
                        var reasonInput = document.getElementById('gh-leader-reason');
                        var activeCheck = document.getElementById('gh-leader-is-active');
                        
                        var title = titleInput ? titleInput.value.trim() || 'Leader' : 'Leader';
                        var startYear = startYearInput ? parseInt(startYearInput.value) || _getCurrentYear() : _getCurrentYear();
                        var isActive = activeCheck ? activeCheck.checked : true;
                        var endYear = null;
                        var reason = null;

                        if (!isActive) {
                            endYear = endYearInput ? parseInt(endYearInput.value) || null : null;
                            reason = reasonInput ? reasonInput.value.trim() || 'Term ended' : 'Term ended';
                        }

                        // Validate
                        if (!startYear) {
                            _showToast('Start year is required', 'error');
                            return;
                        }
                        if (!isActive && !endYear) {
                            _showToast('End year is required for ended terms', 'error');
                            return;
                        }
                        if (endYear && endYear <= startYear) {
                            _showToast('End year must be after start year', 'error');
                            return;
                        }

                        var commands = _getGovernmentCommands();
                        if (!commands || !commands.assignLeader) {
                            _showToast('Government commands not available', 'error');
                            return;
                        }

                        // If active, assign as current leader (this will end any existing active leader)
                        if (isActive) {
                            var result = commands.assignLeader(placeId, characterId, startYear, title);
                            if (result) {
                                _showToast('Leader assigned', 'success');
                                if (typeof window.refreshGovernmentHistoryTab === 'function') {
                                    window.refreshGovernmentHistoryTab(placeId);
                                }
                            }
                        } else {
                            // Retroactive leader - add directly to leaderAssignments without ending current
                            if (!place.leaderAssignments) place.leaderAssignments = [];
                            
                            var assignment = {
                                id: _generateId ? _generateId('leader') : 'leader_' + Date.now(),
                                characterId: characterId,
                                characterName: char.name + (char.surname ? ' ' + char.surname : ''),
                                startYear: startYear,
                                endYear: endYear,
                                title: title,
                                isActive: false,
                                endReason: reason || 'Term ended',
                                notes: '',
                                timestamp: Date.now()
                            };
                            
                            place.leaderAssignments.push(assignment);
                            place.updatedAt = Date.now();
                            _saveMasterData();
                            
                            if (typeof window.LocationState !== 'undefined' && 
                                typeof window.LocationState.invalidateCache === 'function') {
                                window.LocationState.invalidateCache();
                            }
                            
                            _showToast('Retroactive leader added', 'success');
                            if (typeof window.refreshGovernmentHistoryTab === 'function') {
                                window.refreshGovernmentHistoryTab(placeId);
                            }
                        }
                    }
                });
            }
        });
    }

    function _endLeaderTerm(placeId, leaderId, characterId) {
        var commands = _getGovernmentCommands();
        if (!commands || !commands.endLeaderTerm) {
            _showToast('Government commands not available', 'error');
            return;
        }

        var char = _getCharacterById(characterId);
        var charName = char ? (char.name + (char.surname ? ' ' + char.surname : '')) : 'Unknown';

        var content = '<div class="gh-leader-form">';
        content += '<p>End leadership term for <strong>' + _escapeHtml(charName) + '</strong>?</p>';
        content += '<div class="form-group">';
        content += '<label for="gh-end-year-input">End Year</label>';
        content += '<input type="number" id="gh-end-year-input" class="form-control" value="' + _getCurrentYear() + '">';
        content += '</div>';
        content += '<div class="form-group">';
        content += '<label for="gh-end-reason-input">Reason</label>';
        content += '<input type="text" id="gh-end-reason-input" class="form-control" placeholder="e.g., Term ended, Resigned, Removed" value="Term ended">';
        content += '</div>';
        content += '</div>';

        _openModal({
            title: 'End Leadership Term',
            content: content,
            confirmText: 'End Term',
            cancelText: 'Cancel',
            onConfirm: function() {
                var yearInput = document.getElementById('gh-end-year-input');
                var reasonInput = document.getElementById('gh-end-reason-input');
                
                var endYear = yearInput ? parseInt(yearInput.value) || _getCurrentYear() : _getCurrentYear();
                var reason = reasonInput ? reasonInput.value.trim() || 'Term ended' : 'Term ended';

                var result = commands.endLeaderTerm(placeId, characterId, endYear);
                if (result) {
                    _showToast('Leadership term ended', 'info');
                    if (typeof window.refreshGovernmentHistoryTab === 'function') {
                        window.refreshGovernmentHistoryTab(placeId);
                    }
                }
            }
        });
    }

    // =========================================================================
    // 5. MAIN EXPORTED FUNCTIONS
    // =========================================================================

    /**
     * Renders the government history tab for a specific location
     * @param {string} containerId - The ID of the container element
     * @param {string} locationId - The ID of the location to display
     */
    function renderGovernmentHistoryTab(containerId, locationId) {
        var container = document.getElementById(containerId);
        if (!container) {
            console.warn('Government history container not found:', containerId);
            return;
        }

        var place = locationId ? _getPlaceById(locationId) : null;
        container.innerHTML = _renderGovernmentHistory(place);
        container.dataset.locationId = locationId || '';

        // Set up event listeners - delegated
        container.addEventListener('click', function(e) {
            var target = e.target.closest('[data-action]');
            if (!target) return;

            var action = target.dataset.action;
            var currentLocationId = container.dataset.locationId;

            switch (action) {
                case 'add-leader':
                    if (currentLocationId) {
                        _addLeaderToLocation(currentLocationId);
                    } else {
                        _showToast('No location selected', 'warning');
                    }
                    break;

                case 'refresh-history':
                    if (currentLocationId) {
                        renderGovernmentHistoryTab(containerId, currentLocationId);
                        _showToast('History refreshed', 'info');
                    }
                    break;

                case 'end-leader':
                    if (currentLocationId) {
                        var leaderId = target.dataset.leaderId;
                        var charId = target.dataset.charId;
                        if (leaderId && charId) {
                            _endLeaderTerm(currentLocationId, leaderId, charId);
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
            if (body) {
                var isHidden = body.style.display === 'none';
                body.style.display = isHidden ? 'block' : 'none';
                var icon = toggle.querySelector('.gh-toggle-icon');
                if (icon) {
                    icon.innerHTML = isHidden ? _getIcon('TRIANGLE_DOWN') : _getIcon('TRIANGLE_RIGHT');
                }
            }
        });
    }

    /**
     * Refreshes the government history tab
     * @param {string} locationId - The ID of the location to display
     */
    function refreshGovernmentHistoryTab(locationId) {
        var container = document.querySelector('.gh-tab-container');
        if (!container) {
            var containers = document.querySelectorAll('.gh-tab-container, #government-history-tab');
            if (containers.length > 0) {
                container = containers[0];
            }
        }
        if (container) {
            renderGovernmentHistoryTab(container.id || 'government-history-tab', locationId);
        }
    }

    // =========================================================================
    // 6. EXPORTS
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

    // Legacy aliases
    window.renderGovernmentHistoryTab = renderGovernmentHistoryTab;
    window.refreshGovernmentHistoryTab = refreshGovernmentHistoryTab;

})();