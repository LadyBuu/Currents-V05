/**
 * =============================================================================
 * HOUSEHOLD ASSIGNMENT MODALS (modals-household-assignments.js)
 * =============================================================================
 * 
 * PURPOSE: UI modals for household assignment management (staff position assignments).
 * 
 * DEPENDS ON:
 *   - modals-core.js (openModal, closeTopModal, _escapeHtml, _showToast, _getIcon)
 *   - household-state.js (HouseholdState)
 *   - household-commands.js (HouseholdCommands)
 *   - household-queries.js (HouseholdQueries)
 *   - modals-char-select.js (openCharacterSelector)
 *   - role-state.js (RoleState) - for role queries
 * 
 * ICON POLICY:
 *   - All icons from icons.js via _getIcon()
 *   - NO emojis
 *   - NO icons in confirm/cancel buttons (plain text only)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. RECURSION GUARD
    // =========================================================================

    var _processingModal = false;

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _openModal(options) {
        if (typeof window.openModal === 'function') {
            return window.openModal(options);
        }
        if (typeof window._openModal === 'function') {
            return window._openModal(options);
        }
        return null;
    }

    function _closeTopModal() {
        if (typeof window.closeTopModal === 'function') {
            window.closeTopModal();
        }
        if (typeof window._closeTopModal === 'function') {
            window._closeTopModal();
        }
    }

    function _confirmDialog(message, title, onConfirm, onCancel) {
        if (typeof window.confirmDialog === 'function') {
            return window.confirmDialog(message, title, onConfirm, onCancel);
        }
        if (typeof window._confirmDialog === 'function') {
            return window._confirmDialog(message, title, onConfirm, onCancel);
        }
        if (confirm(message)) {
            if (onConfirm) onConfirm();
        } else {
            if (onCancel) onCancel();
        }
    }

    function _escapeHtml(str) {
        if (typeof window._escapeHtml === 'function') {
            return window._escapeHtml(str);
        }
        if (typeof window.escapeHtml === 'function') {
            return window.escapeHtml(str);
        }
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function _showToast(message, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(message, type);
        } else if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        } else if (typeof window.showToastMessage === 'function') {
            window.showToastMessage(message, type);
        }
    }

    function _getCurrentYear() {
        if (typeof window._getCurrentYear === 'function') {
            return window._getCurrentYear();
        }
        if (typeof window.getCurrentYearSafe === 'function') {
            return window.getCurrentYearSafe();
        }
        if (typeof window.getCurrentYear === 'function') {
            return window.getCurrentYear();
        }
        return 1250;
    }

    function _getIcon(name) {
        if (typeof window._getIcon === 'function') {
            return window._getIcon(name);
        }
        if (window.Icons && window.Icons[name]) {
            return window.Icons[name];
        }
        return '';
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
    // 2. STATE AND COMMANDS REFERENCE
    // =========================================================================

    var _state = window.HouseholdState;
    var _commands = window.HouseholdCommands;
    var _queries = window.HouseholdQueries;
    var _roleState = window.RoleState;

    // =========================================================================
    // 3. ICON HELPERS
    // =========================================================================

    function _getIconSafe(name) {
        var icon = _getIcon(name);
        return icon || '';
    }

    function _iconSpan(icon, title) {
        if (!icon) return '';
        var titleAttr = title ? ' title="' + _escapeHtml(title) + '"' : '';
        return '<span style="display:inline-flex;align-items:center;vertical-align:middle;' + (title ? 'cursor:help;' : '') + '"' + titleAttr + '>' + icon + '</span>';
    }

    // =========================================================================
    // 4. BUSINESS LOGIC WRAPPERS
    // =========================================================================

    function _getHousehold(householdId) {
        return _state ? _state.getHousehold(householdId) : null;
    }

    function _getHouseholdPosition(positionId) {
        return _state ? _state.getHouseholdPosition(positionId) : null;
    }

    function _getHouseholdPositions(householdId) {
        return _state ? _state.getHouseholdPositions({ householdId: householdId }) : [];
    }

    function _getAssignmentsForPosition(positionId, activeOnly) {
        return _state ? _state.getAssignmentsForPosition(positionId, activeOnly) : [];
    }

    function _getAssignmentById(assignmentId) {
        return _state ? _state.getHouseholdAssignment(assignmentId) : null;
    }

    function _getCharacterById(characterId) {
        if (typeof window.getCharacterById === 'function') {
            return window.getCharacterById(characterId);
        }
        return null;
    }

    function _getCharacters() {
        if (typeof window.getCharacters === 'function') {
            return window.getCharacters();
        }
        return [];
    }

    function _getRoleById(id) {
        if (typeof window.getRoleById === 'function') {
            return window.getRoleById(id);
        }
        return null;
    }

    function _getAllRoles() {
        if (typeof window.RoleState !== 'undefined' && window.RoleState.getAllRoles) {
            return window.RoleState.getAllRoles();
        }
        if (typeof window.getRoles === 'function') {
            return window.getRoles();
        }
        return [];
    }

    function _getHouseholdStaff(householdId) {
        return _queries ? _queries.getHouseholdStaff(householdId, { activeOnly: true }) : [];
    }

    function _getUnassignedHouseholdStaff(householdId) {
        return _queries ? _queries.getUnassignedHouseholdStaff(householdId) : [];
    }

    // =========================================================================
    // 5. ASSIGN STAFF TO HOUSEHOLD POSITION MODAL
    // =========================================================================

    function openAssignStaffToHouseholdPositionModal(householdId, positionId, onSuccess) {
        if (_processingModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingModal = true;

        try {
            var household = _getHousehold(householdId);
            if (!household) {
                _showToast('Household not found', 'error');
                _processingModal = false;
                return;
            }

            var position = _getHouseholdPosition(positionId);
            if (!position) {
                _showToast('Position not found', 'error');
                _processingModal = false;
                return;
            }

            var currentAssignments = _getAssignmentsForPosition(positionId, true);
            var currentYear = _getCurrentYear();

            // Get staff members (both assigned and unassigned)
            var staff = _getHouseholdStaff(householdId);
            var assignedIds = {};
            for (var i = 0; i < currentAssignments.length; i++) {
                assignedIds[currentAssignments[i].characterId] = true;
            }

            // Filter: exclude already assigned to this position
            var availableStaff = staff.filter(function(s) {
                return !assignedIds[s.characterId];
            });

            // Also get unassigned staff (not yet assigned to any position)
            var unassigned = _getUnassignedHouseholdStaff(householdId);
            for (var i = 0; i < unassigned.length; i++) {
                if (!assignedIds[unassigned[i].characterId]) {
                    // Check if already in availableStaff
                    var exists = availableStaff.some(function(s) { return s.characterId === unassigned[i].characterId; });
                    if (!exists) {
                        availableStaff.push(unassigned[i]);
                    }
                }
            }

            // Build character list
            var charsHtml = '';
            var selectedCharacterId = null;

            if (availableStaff.length === 0) {
                charsHtml = '<div style="color: var(--dim); text-align: center; padding: 20px; font-size: 0.6rem;">No available staff members</div>';
            } else {
                charsHtml = '<div style="max-height: 250px; overflow-y: auto;">';
                for (var i = 0; i < availableStaff.length; i++) {
                    var s = availableStaff[i];
                    var char = s.character;
                    var age = _getCurrentYear() - (char.birthYear || 0);
                    var genderSymbol = char.gender === 'male' ? '♂' : (char.gender === 'female' ? '♀' : '⚥');

                    var hasRole = false;
                    var skillLevel = 0;
                    if (position.requiredRoleId && char.professions) {
                        for (var j = 0; j < char.professions.length; j++) {
                            if (char.professions[j].id === position.requiredRoleId) {
                                hasRole = true;
                                skillLevel = char.professions[j].skillLevel || 0;
                                break;
                            }
                        }
                    }

                    var roleStatus = '';
                    if (position.requiredRoleId) {
                        if (hasRole) {
                            roleStatus = '<span style="font-size:0.45rem; color:var(--success);">✓ Has role</span>';
                        } else {
                            roleStatus = '<span style="font-size:0.45rem; color:var(--warn);">⚠️ Missing role</span>';
                        }
                    }

                    var currentPos = s.assignment ? s.assignment.positionName : 'None';
                    var currentPosDisplay = s.assignment ? ' (Currently: ' + _escapeHtml(currentPos) + ')' : '';

                    charsHtml +=
                        '<div class="assign-staff-item" data-char-id="' + char.id + '" style="' +
                        'padding: 8px 10px; ' +
                        'margin-bottom: 4px; ' +
                        'background: var(--bg2); ' +
                        'border: 1px solid var(--border); ' +
                        'border-left: 3px solid ' + (hasRole || !position.requiredRoleId ? 'var(--success)' : 'var(--warn)') + '; ' +
                        'border-radius: 4px; ' +
                        'cursor: pointer; ' +
                        'transition: all 0.1s; ' +
                        '">' +
                        '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 4px;">' +
                        '<div>' +
                        '<strong>' + _escapeHtml(char.name) + ' ' + _escapeHtml(char.surname || '') + '</strong>' +
                        '<span style="font-size: 0.5rem; color: var(--dim); margin-left: 6px;">' + genderSymbol + ' ' + age + 'y</span>' +
                        (position.requiredRoleId ? '<span style="margin-left: 6px;">' + roleStatus + '</span>' : '') +
                        (skillLevel > 0 ? '<span style="font-size:0.45rem; color:var(--accent); margin-left:4px;">(Skill: ' + skillLevel + ')</span>' : '') +
                        '<span style="font-size:0.45rem; color:var(--dim); margin-left:4px;">' + currentPosDisplay + '</span>' +
                        '</div>' +
                        '<div style="font-size: 0.45rem; color: var(--dim);">' +
                        (s.role || 'Staff') +
                        '</div>' +
                        '</div>' +
                        (!hasRole && position.requiredRoleId ? '<div style="font-size:0.4rem; color:var(--warn);">Requires role: ' + _escapeHtml(_getRoleById(position.requiredRoleId)?.name || position.requiredRoleId) + '</div>' : '') +
                        '</div>';
                }
                charsHtml += '</div>';
            }

            var roleDisplay = position.requiredRoleId ?
                '<span style="color: var(--accent);">' + _escapeHtml(_getRoleById(position.requiredRoleId)?.name || 'Unknown') + '</span>' :
                '<span style="color: var(--dim);">None</span>';

            // Build position history
            var history = _state.getAssignmentsForPosition(positionId, false);
            var historyHtml = '';
            if (history && history.length > 0) {
                var sortedHistory = history.slice().sort(function(a, b) { return (b.startYear || 0) - (a.startYear || 0); });
                var recentHistory = sortedHistory.slice(0, 5);

                historyHtml =
                    '<div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--border);">' +
                    '<div style="font-size: 0.65rem; color: var(--accent); margin-bottom: 8px;">Recent History</div>' +
                    '<div style="max-height: 120px; overflow-y: auto; background: var(--bg3); border-radius: 6px; padding: 8px;">';

                for (var i = 0; i < recentHistory.length; i++) {
                    var h = recentHistory[i];
                    var isActive = !h.endYear;
                    var endDisplay = h.endYear || 'Present';
                    var color = isActive ? 'var(--success)' : 'var(--dim)';
                    var char = _getCharacterById(h.characterId);
                    var charName = h.characterName || (char ? char.name : 'Unknown');
                    var roleName = h.roleIdAtAssignment ? (_getRoleById(h.roleIdAtAssignment)?.name || 'Unknown') : null;

                    historyHtml +=
                        '<div style="display:flex; justify-content:space-between; padding: 4px 0; border-bottom: 1px solid var(--border-light); font-size: 0.6rem;">' +
                        '<span>' + _escapeHtml(charName) +
                        (h.title && h.title !== position.name ? ' (' + _escapeHtml(h.title) + ')' : '') +
                        (roleName ? ' <span style="color:var(--accent);">(Role: ' + _escapeHtml(roleName) + ')</span>' : '') +
                        '</span>' +
                        '<span style="color:' + color + ';">' + h.startYear + ' - ' + endDisplay + '</span>' +
                        '</div>';
                }

                historyHtml += '</div></div>';
            }

            var modalContent =
                '<div style="margin-bottom: 12px; padding: 8px; background: var(--bg2); border-radius: 6px;">' +
                '<strong>Household:</strong> ' + _escapeHtml(household.name) + '<br>' +
                '<strong>Position:</strong> ' + _escapeHtml(position.name) +
                '<br><strong>Required Role:</strong> ' + roleDisplay +
                (position.minSkillLevel > 0 ? ' · <strong>Min Skill:</strong> ' + position.minSkillLevel : '') +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Select Staff Member</label>' +
                charsHtml +
                '</div>' +
                '<div style="display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap;">' +
                '<button id="selectOtherStaffBtn" class="btn small" style="padding: 3px 10px; font-size: 0.55rem; background: var(--accent-dim); border: 1px solid var(--accent); border-radius: 4px; cursor: pointer;">Select Other Character</button>' +
                '<label style="display: flex; align-items: center; gap: 6px; font-size: 0.55rem; cursor: pointer;">' +
                '<input type="checkbox" id="assignAddRoleIfMissing" checked>' +
                '<span>Add role if missing</span>' +
                '</label>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Custom Title</label>' +
                '<input type="text" id="assignTitle" value="' + _escapeHtml(position.name) + '" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                '</div>' +
                '<div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">' +
                '<div class="form-group">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Start Year</label>' +
                '<input type="number" id="assignStartYear" value="' + currentYear + '" min="1" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                '</div>' +
                '<div class="form-group">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">End Year</label>' +
                '<input type="number" id="assignEndYear" placeholder="Leave empty for ongoing" min="1" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                '<small style="font-size:0.5rem; color:var(--dim);">If set, this assignment will be marked as historical</small>' +
                '</div>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Notes</label>' +
                '<textarea id="assignNotes" rows="2" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);"></textarea>' +
                '</div>' +
                historyHtml +
                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; margin-top: 12px;">' +
                'Assignments track who holds this position over time. Setting an end year records it as historical.' +
                '</div>';

            _openModal({
                title: 'Assign Staff to ' + position.name,
                content: modalContent,
                confirmText: 'Assign Staff',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var characterId = selectedCharacterId || document.querySelector('.assign-staff-item.selected')?.dataset.charId;
                    if (!characterId) {
                        _showToast('Please select a staff member', 'error');
                        return false;
                    }

                    var startYear = parseInt(document.getElementById('assignStartYear').value) || currentYear;
                    var endYear = document.getElementById('assignEndYear').value;
                    var endYearValue = endYear ? parseInt(endYear) : null;
                    var notes = document.getElementById('assignNotes').value || '';
                    var title = document.getElementById('assignTitle').value || position.name;
                    var addRoleIfMissing = document.getElementById('assignAddRoleIfMissing')?.checked !== false;

                    if (endYearValue && endYearValue <= startYear) {
                        _showToast('End year must be after start year', 'error');
                        return false;
                    }

                    var result = _commands.assignCharacterToHouseholdPosition(positionId, characterId, {
                        startYear: startYear,
                        endYear: endYearValue,
                        title: title,
                        notes: notes,
                        addRoleIfMissing: addRoleIfMissing,
                        defaultSkillLevel: 10
                    });

                    if (result && result.success) {
                        var char = _getCharacterById(characterId);
                        var endMsg = endYearValue ? ' until ' + endYearValue : '';
                        _showToast((char ? char.name : 'Staff member') + ' assigned as ' + title + endMsg, 'success');
                        _closeTopModal();
                        _processingModal = false;
                        if (onSuccess) {
                            onSuccess(result.assignment);
                        }
                        return true;
                    } else {
                        _showToast(result ? result.reason : 'Failed to assign staff', 'error');
                        return false;
                    }
                },
                onCancel: function() {
                    _processingModal = false;
                }
            });

            // Click handlers for staff selection
            setTimeout(function() {
                var items = document.querySelectorAll('.assign-staff-item');
                items.forEach(function(item) {
                    var newItem = item.cloneNode(true);
                    if (item.parentNode) {
                        item.parentNode.replaceChild(newItem, item);
                    }

                    newItem.onclick = function() {
                        document.querySelectorAll('.assign-staff-item').forEach(function(el) {
                            el.classList.remove('selected');
                            el.style.background = 'var(--bg2)';
                            el.style.borderColor = 'var(--border)';
                        });
                        this.classList.add('selected');
                        this.style.background = 'rgba(var(--accent-rgb), 0.15)';
                        this.style.borderColor = 'var(--accent)';
                        selectedCharacterId = this.dataset.charId;
                    };

                    newItem.onmouseenter = function() {
                        if (!this.classList.contains('selected')) {
                            this.style.background = 'var(--bg3)';
                        }
                    };
                    newItem.onmouseleave = function() {
                        if (!this.classList.contains('selected')) {
                            this.style.background = 'var(--bg2)';
                        }
                    };
                });

                // Select other character button
                var selectOtherBtn = document.getElementById('selectOtherStaffBtn');
                if (selectOtherBtn) {
                    selectOtherBtn.onclick = function() {
                        var existingIds = {};
                        var items = document.querySelectorAll('.assign-staff-item');
                        items.forEach(function(item) {
                            existingIds[item.dataset.charId] = true;
                        });

                        _openCharacterSelector({
                            title: 'Select Character for ' + position.name,
                            excludeIds: Object.keys(existingIds),
                            filters: {
                                showDeceased: false,
                                gender: 'all'
                            },
                            onSelect: function(character) {
                                if (character) {
                                    _closeTopModal();
                                    _processingModal = false;
                                    // Reopen with the selected character pre-selected
                                    openAssignStaffToHouseholdPositionModal(householdId, positionId, onSuccess);
                                }
                            }
                        });
                    };
                }
            }, 100);

        } catch (e) {
            _processingModal = false;
            _showToast('Error opening assign staff modal', 'error');
        }
    }

    // =========================================================================
    // 6. REMOVE/END HOUSEHOLD ASSIGNMENT MODAL
    // =========================================================================

    function openRemoveHouseholdAssignmentModal(householdId, assignmentId, onSuccess) {
        if (_processingModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingModal = true;

        try {
            var household = _getHousehold(householdId);
            if (!household) {
                _showToast('Household not found', 'error');
                _processingModal = false;
                return;
            }

            var assignment = _getAssignmentById(assignmentId);
            if (!assignment) {
                _showToast('Assignment not found', 'error');
                _processingModal = false;
                return;
            }

            var character = _getCharacterById(assignment.characterId);
            var charName = assignment.characterName || (character ? character.name : 'Unknown');
            var position = _getHouseholdPosition(assignment.positionId);
            var infoIcon = _getIcon('CIRCLE_DOT');

            var isAlreadyEnded = !!assignment.endYear;
            var roleName = assignment.roleIdAtAssignment ? (_getRoleById(assignment.roleIdAtAssignment)?.name || 'Unknown') : 'None';

            var modalContent =
                '<div style="margin-bottom: 12px; padding: 8px; background: var(--bg2); border-radius: 6px;">' +
                '<strong>Character:</strong> ' + _escapeHtml(charName) + '<br>' +
                '<strong>Position:</strong> ' + _escapeHtml(assignment.title || assignment.positionId) +
                (position ? ' (' + _escapeHtml(position.name) + ')' : '') +
                (assignment.roleIdAtAssignment ? '<br><strong>Role at Assignment:</strong> ' + _escapeHtml(roleName) + (assignment.skillLevelAtAssignment ? ' (Skill: ' + assignment.skillLevelAtAssignment + ')' : '') : '') +
                (assignment.startYear ? '<br><strong>Started:</strong> ' + assignment.startYear : '') +
                (assignment.endYear ? '<br><strong>Ended:</strong> ' + assignment.endYear : '') +
                (assignment.endReason ? '<br><strong>End Reason:</strong> ' + _escapeHtml(assignment.endReason) : '') +
                '</div>';

            if (isAlreadyEnded) {
                modalContent +=
                    '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; margin-bottom: 12px;">' +
                    'This assignment has already ended. You can delete it permanently, or leave it as historical.' +
                    '</div>' +
                    '<div style="display: flex; gap: 8px; flex-wrap: wrap;">' +
                    '<button id="deleteHouseholdAssignmentBtn" class="btn small danger" style="padding: 4px 12px; font-size: 0.55rem; background: #8a3020; border: none; color: white; border-radius: 4px; cursor: pointer;">Delete Permanently</button>' +
                    '</div>';
            } else {
                modalContent +=
                    '<div class="form-group" style="margin-bottom: 12px;">' +
                    '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">End Year</label>' +
                    '<input type="number" id="removeEndYear" value="' + (assignment.endYear || _getCurrentYear()) + '" min="' + (assignment.startYear || 1) + '" style="width:100px; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                    '<small style="font-size:0.55rem; color:var(--dim);">This will mark the assignment as ended. Leave as current year.</small>' +
                    '</div>' +
                    '<div class="form-group" style="margin-bottom: 12px;">' +
                    '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Reason</label>' +
                    '<input type="text" id="removeReason" placeholder="e.g., Resignation, Term ended, Dismissed..." style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                    '</div>' +
                    '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem;">' +
                    infoIcon + ' This will mark the assignment as ended and keep it in the position history.' +
                    '</div>';
            }

            _openModal({
                title: isAlreadyEnded ? 'Delete Assignment' : 'End Assignment',
                content: modalContent,
                confirmText: isAlreadyEnded ? 'Delete' : 'End Assignment',
                cancelText: 'Cancel',
                confirmStyle: isAlreadyEnded ? 'danger' : '',
                onConfirm: function() {
                    if (isAlreadyEnded) {
                        var result = _commands.deleteHouseholdAssignment(assignmentId);
                        if (result) {
                            _showToast('Assignment deleted', 'info');
                            _closeTopModal();
                            _processingModal = false;
                            if (onSuccess) {
                                onSuccess();
                            }
                            return true;
                        } else {
                            _showToast('Failed to delete assignment', 'error');
                            return false;
                        }
                    } else {
                        var endYear = parseInt(document.getElementById('removeEndYear').value);
                        var reason = document.getElementById('removeReason').value || 'Term ended';

                        if (isNaN(endYear) || endYear < (assignment.startYear || 1)) {
                            _showToast('End year must be after start year', 'error');
                            return false;
                        }

                        var result = _commands.endHouseholdAssignment(assignmentId, endYear, reason);
                        if (result) {
                            _showToast('Assignment ended in ' + endYear + ' (' + reason + ')', 'success');
                            _closeTopModal();
                            _processingModal = false;
                            if (onSuccess) {
                                onSuccess();
                            }
                            return true;
                        } else {
                            _showToast('Failed to end assignment', 'error');
                            return false;
                        }
                    }
                },
                onCancel: function() {
                    _processingModal = false;
                }
            });

            setTimeout(function() {
                var deleteBtn = document.getElementById('deleteHouseholdAssignmentBtn');
                if (deleteBtn) {
                    deleteBtn.onclick = function() {
                        _closeTopModal();
                        _processingModal = false;
                        // Reopen with delete mode
                        openRemoveHouseholdAssignmentModal(householdId, assignmentId, onSuccess);
                    };
                }
            }, 100);

        } catch (e) {
            _processingModal = false;
            _showToast('Error opening remove assignment modal', 'error');
        }
    }

    // =========================================================================
    // 7. VIEW HOUSEHOLD ASSIGNMENT HISTORY MODAL
    // =========================================================================

    function openHouseholdAssignmentHistoryModal(householdId, positionId, characterId) {
        if (_processingModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingModal = true;

        try {
            var history = [];

            if (positionId) {
                history = _state.getAssignmentsForPosition(positionId, false);
            } else if (householdId) {
                history = _state.getAssignmentsForHousehold(householdId, false);
            } else if (characterId) {
                history = _state.getAssignmentsForCharacter(characterId, false);
            } else {
                _showToast('No filter provided', 'error');
                _processingModal = false;
                return;
            }

            var infoIcon = _getIcon('CIRCLE_DOT');
            var personIcon = _getIcon('PERSON');

            if (!history || history.length === 0) {
                _showToast('No assignment history found', 'info');
                _processingModal = false;
                return;
            }

            var title = 'Household Assignment History';
            if (householdId) {
                var household = _getHousehold(householdId);
                if (household) title += ': ' + household.name;
            }
            if (positionId) {
                var pos = _getHouseholdPosition(positionId);
                if (pos) title += ' - ' + pos.name;
            }
            if (characterId) {
                var char = _getCharacterById(characterId);
                if (char) title += ' - ' + char.name;
            }

            var sortedHistory = history.slice().sort(function(a, b) {
                return (b.startYear || 0) - (a.startYear || 0);
            });

            var historyHtml = '';
            for (var i = 0; i < sortedHistory.length; i++) {
                var h = sortedHistory[i];
                var isActive = !h.endYear;
                var endDisplay = h.endYear || 'Present';
                var char = _getCharacterById(h.characterId);
                var charName = h.characterName || (char ? char.name : 'Unknown');
                var pos = _getHouseholdPosition(h.positionId);
                var posName = pos ? pos.name : 'Unknown';
                var roleName = h.roleIdAtAssignment ? (_getRoleById(h.roleIdAtAssignment)?.name || 'Unknown') : null;

                historyHtml +=
                    '<div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid var(--border-light);">' +
                    '<div>' +
                    '<span style="font-size: 0.7rem;">' + personIcon + ' ' + _escapeHtml(charName) + '</span>' +
                    (posName ? ' <span style="font-size: 0.55rem; color: var(--dim);">→ ' + _escapeHtml(posName) + '</span>' : '') +
                    (h.title && h.title !== posName ? ' <span style="font-size: 0.5rem; color: var(--dim);">(' + _escapeHtml(h.title) + ')</span>' : '') +
                    (roleName ? ' <span style="font-size: 0.45rem; color: var(--accent);">(Role: ' + _escapeHtml(roleName) + ')</span>' : '') +
                    (h.skillLevelAtAssignment ? ' <span style="font-size: 0.45rem; color: var(--accent);">(Skill: ' + h.skillLevelAtAssignment + ')</span>' : '') +
                    '</div>' +
                    '<div style="font-size: 0.55rem; color: ' + (isActive ? 'var(--success)' : 'var(--dim)') + ';">' +
                    h.startYear + ' - ' + endDisplay +
                    (h.endReason ? ' - ' + _escapeHtml(h.endReason) : '') +
                    '</div>' +
                    '</div>';
            }

            // Build summary stats
            var totalAssignments = sortedHistory.length;
            var activeCount = sortedHistory.filter(function(h) { return !h.endYear; }).length;
            var withRoles = sortedHistory.filter(function(h) { return h.roleIdAtAssignment; }).length;

            var modalContent =
                '<div style="margin-bottom: 16px; padding: 12px; background: var(--bg2); border-radius: 8px;">' +
                '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; font-size: 0.55rem;">' +
                '<div><span style="color: var(--dim);">Total</span><br><span style="font-size: 0.9rem; font-weight: bold;">' + totalAssignments + '</span></div>' +
                '<div><span style="color: var(--dim);">Active</span><br><span style="font-size: 0.9rem; font-weight: bold; color: var(--success);">' + activeCount + '</span></div>' +
                '<div><span style="color: var(--dim);">With Roles</span><br><span style="font-size: 0.9rem; font-weight: bold; color: var(--accent);">' + withRoles + '</span></div>' +
                '</div>' +
                '</div>' +
                '<div style="max-height: 350px; overflow-y: auto;">' +
                '<div style="font-size: 0.65rem; color: var(--dim); margin-bottom: 8px;">' + sortedHistory.length + ' assignment(s) found</div>' +
                historyHtml +
                '</div>' +
                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; margin-top: 12px;">' +
                infoIcon + ' Shows all assignments in chronological order (most recent first).' +
                '</div>';

            _openModal({
                title: title,
                content: modalContent,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {
                    _closeTopModal();
                    _processingModal = false;
                }
            });

        } catch (e) {
            _processingModal = false;
            _showToast('Error opening assignment history', 'error');
        }
    }

    // =========================================================================
    // 8. BULK STAFF ASSIGN MODAL
    // =========================================================================

    function openBulkHouseholdAssignModal(householdId, positionId, onSuccess) {
        if (_processingModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingModal = true;

        try {
            var household = _getHousehold(householdId);
            if (!household) {
                _showToast('Household not found', 'error');
                _processingModal = false;
                return;
            }

            var position = _getHouseholdPosition(positionId);
            if (!position) {
                _showToast('Position not found', 'error');
                _processingModal = false;
                return;
            }

            var currentYear = _getCurrentYear();

            // Get all staff members
            var staff = _getHouseholdStaff(householdId);
            var currentAssignments = _getAssignmentsForPosition(positionId, true);
            var assignedIds = {};
            for (var i = 0; i < currentAssignments.length; i++) {
                assignedIds[currentAssignments[i].characterId] = true;
            }

            // Also get unassigned staff
            var unassigned = _getUnassignedHouseholdStaff(householdId);
            var availableStaff = [];
            var staffMap = {};

            for (var i = 0; i < staff.length; i++) {
                if (!assignedIds[staff[i].characterId]) {
                    availableStaff.push(staff[i]);
                    staffMap[staff[i].characterId] = staff[i];
                }
            }

            for (var i = 0; i < unassigned.length; i++) {
                if (!assignedIds[unassigned[i].characterId] && !staffMap[unassigned[i].characterId]) {
                    availableStaff.push(unassigned[i]);
                }
            }

            if (availableStaff.length === 0) {
                _showToast('No available staff members to assign', 'info');
                _processingModal = false;
                if (onSuccess) {
                    onSuccess();
                }
                return;
            }

            var selectedCharIds = [];

            var charsHtml = '';
            for (var i = 0; i < availableStaff.length; i++) {
                var s = availableStaff[i];
                var char = s.character;
                var age = _getCurrentYear() - (char.birthYear || 0);
                var genderSymbol = char.gender === 'male' ? '♂' : (char.gender === 'female' ? '♀' : '⚥');

                var hasRole = false;
                var skillLevel = 0;
                if (position.requiredRoleId && char.professions) {
                    for (var j = 0; j < char.professions.length; j++) {
                        if (char.professions[j].id === position.requiredRoleId) {
                            hasRole = true;
                            skillLevel = char.professions[j].skillLevel || 0;
                            break;
                        }
                    }
                }
                var roleStatus = position.requiredRoleId ? (hasRole ? '✓' : '⚠️') : '';
                var currentPos = s.assignment ? s.assignment.positionName : 'None';

                charsHtml +=
                    '<div class="bulk-staff-item" data-char-id="' + char.id + '" style="' +
                    'background: var(--bg2); ' +
                    'border: 1px solid var(--border); ' +
                    'border-radius: 4px; ' +
                    'padding: 6px 8px; ' +
                    'margin-bottom: 4px; ' +
                    'cursor: pointer; ' +
                    'transition: all 0.1s;' +
                    '">' +
                    '<div style="display: flex; align-items: center; gap: 8px;">' +
                    '<input type="checkbox" class="bulk-staff-checkbox" data-char-id="' + char.id + '" style="cursor: pointer;">' +
                    '<span style="font-size: 0.65rem;">' + genderSymbol + ' ' + _escapeHtml(char.name) + ' ' + _escapeHtml(char.surname || '') + ' (' + age + 'y)</span>' +
                    (position.requiredRoleId ? '<span style="font-size:0.45rem; color:' + (hasRole ? 'var(--success)' : 'var(--warn)') + ';">' + roleStatus + '</span>' : '') +
                    (skillLevel > 0 ? '<span style="font-size:0.45rem; color:var(--accent);">Skill: ' + skillLevel + '</span>' : '') +
                    '<span style="font-size:0.4rem; color:var(--dim);">(Current: ' + _escapeHtml(currentPos) + ')</span>' +
                    '</div>' +
                    '</div>';
            }

            var modalContent =
                '<div style="margin-bottom: 12px; padding: 8px; background: var(--bg2); border-radius: 6px;">' +
                '<strong>Household:</strong> ' + _escapeHtml(household.name) + '<br>' +
                '<strong>Position:</strong> ' + _escapeHtml(position.name) +
                (position.requiredRoleId ? '<br><strong>Required Role:</strong> ' + _escapeHtml(_getRoleById(position.requiredRoleId)?.name || 'Unknown') : '') +
                '</div>' +
                '<div style="margin-bottom: 12px;">' +
                '<div style="font-size: 0.65rem; color: var(--accent); margin-bottom: 8px;">Select Staff Members (' + availableStaff.length + ' available)</div>' +
                '<div style="max-height: 250px; overflow-y: auto;">' +
                charsHtml +
                '</div>' +
                '</div>' +
                '<div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px;">' +
                '<button id="bulkStaffSelectAllBtn" class="btn small" style="padding: 3px 10px; font-size: 0.55rem; background: var(--accent-dim); border: 1px solid var(--accent); border-radius: 4px; cursor: pointer;">Select All</button>' +
                '<button id="bulkStaffSelectNoneBtn" class="btn small" style="padding: 3px 10px; font-size: 0.55rem; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">Select None</button>' +
                '<span style="font-size:0.55rem; color:var(--dim); margin-left:auto;"><span id="bulkStaffSelectedCount">0</span> selected</span>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Start Year</label>' +
                '<input type="number" id="bulkStaffStartYear" value="' + currentYear + '" min="1" style="width:100px; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                '</div>' +
                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem;">' +
                'Select multiple staff members to assign them to this position. All assignments will use the same start year.' +
                '</div>';

            _openModal({
                title: 'Bulk Assign Staff: ' + position.name,
                content: modalContent,
                confirmText: 'Assign Selected',
                cancelText: 'Cancel',
                onConfirm: function() {
                    if (selectedCharIds.length === 0) {
                        _showToast('No staff members selected', 'warning');
                        return false;
                    }

                    var startYear = parseInt(document.getElementById('bulkStaffStartYear').value) || currentYear;

                    var assignments = selectedCharIds.map(function(charId) {
                        return {
                            positionId: positionId,
                            characterId: charId,
                            startYear: startYear,
                            title: position.name,
                            addRoleIfMissing: true
                        };
                    });

                    var results = _commands.bulkAssignHouseholdPositions(assignments, {
                        startYear: startYear,
                        addRoleIfMissing: true,
                        defaultSkillLevel: 10
                    });

                    if (results.success > 0) {
                        _showToast('Assigned ' + results.success + ' staff members to ' + position.name, 'success');
                        _closeTopModal();
                        _processingModal = false;
                        if (onSuccess) {
                            onSuccess(results);
                        }
                        return true;
                    } else {
                        _showToast('Failed to assign staff members', 'error');
                        return false;
                    }
                },
                onCancel: function() {
                    _processingModal = false;
                }
            });

            // Event handlers
            setTimeout(function() {
                var items = document.querySelectorAll('.bulk-staff-item');
                items.forEach(function(item) {
                    var newItem = item.cloneNode(true);
                    if (item.parentNode) {
                        item.parentNode.replaceChild(newItem, item);
                    }

                    var checkbox = newItem.querySelector('.bulk-staff-checkbox');
                    var charId = newItem.dataset.charId;

                    newItem.onclick = function(e) {
                        if (e.target.type !== 'checkbox') {
                            checkbox.checked = !checkbox.checked;
                            var event = new Event('change');
                            checkbox.dispatchEvent(event);
                        }
                    };

                    if (checkbox) {
                        checkbox.onchange = function(e) {
                            e.stopPropagation();
                            var charId = this.dataset.charId;
                            var idx = selectedCharIds.indexOf(charId);
                            if (this.checked) {
                                if (idx === -1) selectedCharIds.push(charId);
                                newItem.style.background = 'rgba(var(--accent-rgb), 0.15)';
                                newItem.style.borderColor = 'var(--accent)';
                            } else {
                                if (idx !== -1) selectedCharIds.splice(idx, 1);
                                newItem.style.background = 'var(--bg2)';
                                newItem.style.borderColor = 'var(--border)';
                            }
                            var countEl = document.getElementById('bulkStaffSelectedCount');
                            if (countEl) countEl.textContent = selectedCharIds.length;
                        };
                    }
                });

                var selectAllBtn = document.getElementById('bulkStaffSelectAllBtn');
                if (selectAllBtn) {
                    selectAllBtn.onclick = function() {
                        var checkboxes = document.querySelectorAll('.bulk-staff-checkbox');
                        checkboxes.forEach(function(cb) {
                            cb.checked = true;
                            var event = new Event('change');
                            cb.dispatchEvent(event);
                        });
                    };
                }

                var selectNoneBtn = document.getElementById('bulkStaffSelectNoneBtn');
                if (selectNoneBtn) {
                    selectNoneBtn.onclick = function() {
                        var checkboxes = document.querySelectorAll('.bulk-staff-checkbox');
                        checkboxes.forEach(function(cb) {
                            cb.checked = false;
                            var event = new Event('change');
                            cb.dispatchEvent(event);
                        });
                    };
                }
            }, 100);

        } catch (e) {
            _processingModal = false;
            _showToast('Error opening bulk staff assign modal', 'error');
        }
    }

    // =========================================================================
    // 9. VIEW HOUSEHOLD STAFF ASSIGNMENTS MODAL
    // =========================================================================

    function openViewHouseholdStaffAssignmentsModal(householdId) {
        if (_processingModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingModal = true;

        try {
            var household = _getHousehold(householdId);
            if (!household) {
                _showToast('Household not found', 'error');
                _processingModal = false;
                return;
            }

            var staff = _queries ? _queries.getHouseholdStaff(householdId, { activeOnly: true }) : [];
            var personIcon = _getIconSafe('PERSON');

            var staffHtml = '';
            if (staff.length === 0) {
                staffHtml = '<div style="color: var(--dim); text-align: center; padding: 40px; font-size: 0.6rem;">No staff members</div>';
            } else {
                staffHtml = '<div style="display: flex; flex-direction: column; gap: 4px;">';
                for (var i = 0; i < staff.length; i++) {
                    var s = staff[i];
                    var char = s.character;
                    var age = _getCurrentYear() - (char.birthYear || 0);
                    var genderSymbol = char.gender === 'male' ? '♂' : (char.gender === 'female' ? '♀' : '⚥');
                    var posName = s.assignment ? s.assignment.positionName : 'Unassigned';
                    var title = s.assignment ? s.assignment.title : 'None';
                    var roleName = s.assignment?.roleNameAtAssignment || 'None';
                    var skillLevel = s.assignment?.skillLevelAtAssignment || 0;
                    var isActive = s.assignment ? s.assignment.isActive : false;

                    staffHtml +=
                        '<div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: var(--bg2); border-radius: 4px; border-left: 3px solid ' + (isActive ? 'var(--accent)' : 'var(--border)') + ';">' +
                        '<div>' +
                        '<strong>' + _escapeHtml(char.name) + ' ' + _escapeHtml(char.surname || '') + '</strong>' +
                        '<span style="font-size: 0.55rem; color: var(--dim); margin-left: 6px;">' + genderSymbol + ' ' + age + 'y</span>' +
                        '<span style="font-size: 0.55rem; color: var(--accent); margin-left: 6px;">' + _escapeHtml(posName) + '</span>' +
                        (title && title !== posName ? ' <span style="font-size:0.5rem; color:var(--dim);">(' + _escapeHtml(title) + ')</span>' : '') +
                        (roleName !== 'None' ? ' <span style="font-size:0.45rem; color:var(--accent);">(Role: ' + _escapeHtml(roleName) + (skillLevel > 0 ? ' - ' + skillLevel : '') + ')</span>' : '') +
                        '</div>' +
                        '<div style="display: flex; gap: 8px; align-items: center; font-size: 0.5rem; color: var(--dim);">' +
                        (s.assignment && s.assignment.startYear ? 'Since ' + s.assignment.startYear : '') +
                        (isActive ? ' <span style="color:var(--success);">Active</span>' : ' <span style="color:var(--dim);">Inactive</span>') +
                        '</div>' +
                        '</div>';
                }
                staffHtml += '</div>';
            }

            var modalContent =
                '<div style="margin-bottom: 16px; padding: 12px; background: var(--bg2); border-radius: 8px;">' +
                '<strong>Household:</strong> ' + _escapeHtml(household.name) +
                '<div style="font-size: 0.6rem; color: var(--dim); margin-top: 4px;">' + staff.length + ' staff members</div>' +
                '</div>' +
                staffHtml +
                '<div style="margin-top: 12px; padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem;">' +
                'Shows all staff members and their current positions.' +
                '</div>';

            _openModal({
                title: 'Staff Assignments: ' + household.name,
                content: modalContent,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {
                    _closeTopModal();
                    _processingModal = false;
                }
            });

        } catch (e) {
            _processingModal = false;
            _showToast('Error opening staff assignments', 'error');
        }
    }

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

    window.openAssignStaffToHouseholdPositionModal = openAssignStaffToHouseholdPositionModal;
    window.openRemoveHouseholdAssignmentModal = openRemoveHouseholdAssignmentModal;
    window.openHouseholdAssignmentHistoryModal = openHouseholdAssignmentHistoryModal;
    window.openBulkHouseholdAssignModal = openBulkHouseholdAssignModal;
    window.openViewHouseholdStaffAssignmentsModal = openViewHouseholdStaffAssignmentsModal;

    // Legacy aliases
    window._openAssignStaffToHouseholdPositionModal = openAssignStaffToHouseholdPositionModal;
    window._openRemoveHouseholdAssignmentModal = openRemoveHouseholdAssignmentModal;
    window._openHouseholdAssignmentHistoryModal = openHouseholdAssignmentHistoryModal;
    window._openBulkHouseholdAssignModal = openBulkHouseholdAssignModal;
    window._openViewHouseholdStaffAssignmentsModal = openViewHouseholdStaffAssignmentsModal;

})();