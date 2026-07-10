/**
 * =============================================================================
 * STAFF ASSIGNMENT MODALS (modals-assign-staff.js)
 * =============================================================================
 * 
 * PURPOSE: UI modals for staff management (assigning to departments,
 *          removing assignments, viewing staff by department).
 * 
 * DEPENDS ON:
 *   - modals-core.js (openModal, closeTopModal, _escapeHtml, _showToast, _getIcon)
 *   - modals-char-select.js (openCharacterSelector)
 *   - household-state.js (HouseholdState)
 *   - household-commands.js (HouseholdCommands)
 *   - household-queries.js (HouseholdQueries)
 * 
 * EXPORTS:
 *   - openAssignStaffModal()
 *   - openRemoveStaffAssignmentModal()
 *   - openViewStaffByDepartmentModal()
 *   - openStaffDetailsModal()
 *   - openViewAllStaffModal()
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

    var _processingStaffModal = false;

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

    function _getDepartments(householdId) {
        var household = _getHousehold(householdId);
        return household ? (household.departments || []) : [];
    }

    function _getDepartment(householdId, departmentId) {
        var departments = _getDepartments(householdId);
        for (var i = 0; i < departments.length; i++) {
            if (departments[i].id === departmentId) {
                return departments[i];
            }
        }
        return null;
    }

    function _getHouseholdMembers(householdId) {
        var household = _getHousehold(householdId);
        return household ? (household.members || []) : [];
    }

    function _getHouseholdStaff(householdId) {
        var members = _getHouseholdMembers(householdId);
        var staff = [];
        var characters = _getCharacters();
        var charMap = {};
        for (var i = 0; i < characters.length; i++) {
            charMap[characters[i].id] = characters[i];
        }

        for (var i = 0; i < members.length; i++) {
            if (members[i].type === 'staff') {
                var char = charMap[members[i].characterId];
                if (char) {
                    staff.push({
                        character: char,
                        member: members[i]
                    });
                }
            }
        }
        return staff;
    }

    function _getUnassignedStaff(householdId) {
        var staff = _getHouseholdStaff(householdId);
        var unassigned = [];
        for (var i = 0; i < staff.length; i++) {
            if (!staff[i].member.departmentId) {
                unassigned.push(staff[i]);
            }
        }
        return unassigned;
    }

    function _getStaffByDepartment(householdId, departmentId) {
        var staff = _getHouseholdStaff(householdId);
        var result = [];
        for (var i = 0; i < staff.length; i++) {
            if (staff[i].member.departmentId === departmentId) {
                result.push(staff[i]);
            }
        }
        return result;
    }

    function _calculateAge(birthYear, isDeceased, deathYear) {
        if (typeof window.calculateAge === 'function') {
            return window.calculateAge(birthYear, isDeceased, deathYear);
        }
        var currentYear = _getCurrentYear();
        if (!birthYear) return 0;
        if (isDeceased && deathYear) return Math.max(0, deathYear - birthYear);
        return Math.max(0, currentYear - birthYear);
    }

    // =========================================================================
    // 5. ASSIGN STAFF MODAL
    // =========================================================================

    function openAssignStaffModal(householdId, departmentId, onSuccess) {
        if (_processingStaffModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingStaffModal = true;

        try {
            var household = _getHousehold(householdId);
            if (!household) {
                _showToast('Household not found', 'error');
                _processingStaffModal = false;
                return;
            }

            var department = _getDepartment(householdId, departmentId);
            if (!department) {
                _showToast('Department not found', 'error');
                _processingStaffModal = false;
                return;
            }

            var unassignedStaff = _getUnassignedStaff(householdId);

            if (unassignedStaff.length === 0) {
                _showToast('No unassigned staff members available', 'info');
                _processingStaffModal = false;
                if (onSuccess) {
                    onSuccess();
                }
                return;
            }

            var staffListHtml = unassignedStaff.map(function(s) {
                var char = s.character;
                var age = _calculateAge(char.birthYear, char.isDeceased, char.deathYear);
                var role = s.member.role || 'Staff';
                var genderSymbol = char.gender === 'male' ? '♂' : (char.gender === 'female' ? '♀' : '?');

                return '<div class="staff-select-item" data-char-id="' + char.id + '" style="' +
                    'padding: 10px 12px;' +
                    'margin: 4px 0;' +
                    'background: var(--bg);' +
                    'border: 1px solid var(--border2);' +
                    'border-radius: 8px;' +
                    'cursor: pointer;' +
                    'transition: all 0.2s;' +
                    '">' +
                    '<div style="display: flex; justify-content: space-between; align-items: center;">' +
                    '<div>' +
                    '<strong>' + _escapeHtml(char.name) + ' ' + _escapeHtml(char.surname || '') + '</strong>' +
                    ' <span style="font-size: 0.5rem; color: var(--dim);">' + genderSymbol + ' ' + age + 'y</span>' +
                    '<div style="font-size: 0.55rem; color: var(--dim);">Role: ' + _escapeHtml(role) + '</div>' +
                    '</div>' +
                    '<span style="font-size: 0.6rem; color: var(--accent);">Assign</span>' +
                    '</div></div>';
            }).join('');

            var modalContent =
                '<div style="margin-bottom: 16px; padding: 12px; background: var(--bg2); border-radius: 8px;">' +
                '<strong>Department:</strong> ' + _escapeHtml(department.name) + '<br>' +
                '<strong>Household:</strong> ' + _escapeHtml(household.name) +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="font-size: 0.7rem; color: var(--accent);">Select Staff Member to Assign</label>' +
                '<div class="staff-list" style="max-height: 300px; overflow-y: auto;">' +
                staffListHtml +
                '</div></div>';

            _openModal({
                title: 'Assign Staff to ' + department.name,
                content: modalContent,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {
                    _closeTopModal();
                    _processingStaffModal = false;
                }
            });

            // Attach click handlers
            setTimeout(function() {
                var items = document.querySelectorAll('.staff-select-item');
                items.forEach(function(item) {
                    var newItem = item.cloneNode(true);
                    if (item.parentNode) {
                        item.parentNode.replaceChild(newItem, item);
                    }

                    newItem.onclick = function() {
                        var charId = this.dataset.charId;
                        var character = _getCharacterById(charId);

                        var result = _commands.updateMember(householdId, charId, {
                            departmentId: departmentId
                        });

                        if (result && result.success) {
                            _showToast(character.name + ' assigned to ' + department.name, 'success');
                            _closeTopModal();
                            _processingStaffModal = false;
                            if (onSuccess) {
                                onSuccess();
                            }
                        } else {
                            _showToast(result ? result.reason : 'Failed to assign staff', 'error');
                        }
                    };

                    newItem.onmouseenter = function() {
                        this.style.background = 'var(--accent-dim)';
                        this.style.borderColor = 'var(--accent)';
                    };
                    newItem.onmouseleave = function() {
                        this.style.background = 'var(--bg)';
                        this.style.borderColor = 'var(--border2)';
                    };
                });
            }, 100);

        } catch (e) {
            _processingStaffModal = false;
            _showToast('Error opening assign staff modal', 'error');
        }
    }

    // =========================================================================
    // 6. REMOVE STAFF ASSIGNMENT MODAL
    // =========================================================================

    function openRemoveStaffAssignmentModal(householdId, characterId, onSuccess) {
        if (_processingStaffModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingStaffModal = true;

        try {
            var household = _getHousehold(householdId);
            if (!household) {
                _showToast('Household not found', 'error');
                _processingStaffModal = false;
                return;
            }

            var character = _getCharacterById(characterId);
            if (!character) {
                _showToast('Character not found', 'error');
                _processingStaffModal = false;
                return;
            }

            var member = null;
            for (var i = 0; i < household.members.length; i++) {
                if (household.members[i].characterId === characterId) {
                    member = household.members[i];
                    break;
                }
            }

            if (!member || member.type !== 'staff') {
                _showToast('Staff member not found', 'error');
                _processingStaffModal = false;
                return;
            }

            var department = null;
            if (member.departmentId) {
                department = _getDepartment(householdId, member.departmentId);
            }

            if (!department) {
                _showToast(character.name + ' has no department assignment', 'info');
                _processingStaffModal = false;
                if (onSuccess) {
                    onSuccess();
                }
                return;
            }

            var modalContent =
                '<div style="margin-bottom: 16px;">' +
                '<div style="background: var(--bg3); border-radius: 6px; padding: 12px; margin-bottom: 12px;">' +
                '<div style="font-size: 0.7rem;"><strong>' + _escapeHtml(character.name) + ' ' + _escapeHtml(character.surname || '') + '</strong></div>' +
                '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 4px;">Current Department: ' + _escapeHtml(department.name) + '</div>' +
                '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 2px;">Household: ' + _escapeHtml(household.name) + '</div>' +
                '</div>' +
                '<div style="font-size: 0.6rem; color: var(--warn);">This will remove the staff member from this department.</div>' +
                '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 8px;">The staff member will remain in the household but unassigned.</div>' +
                '</div>';

            _openModal({
                title: 'Remove Staff Assignment',
                content: modalContent,
                confirmText: 'Remove Assignment',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var result = _commands.updateMember(householdId, characterId, {
                        departmentId: null
                    });

                    if (result && result.success) {
                        _showToast(character.name + ' removed from ' + department.name, 'info');
                        _closeTopModal();
                        _processingStaffModal = false;
                        if (onSuccess) {
                            onSuccess();
                        }
                    } else {
                        _showToast(result ? result.reason : 'Failed to remove assignment', 'error');
                    }
                    return true;
                },
                onCancel: function() {
                    _processingStaffModal = false;
                }
            });

        } catch (e) {
            _processingStaffModal = false;
            _showToast('Error opening remove assignment modal', 'error');
        }
    }

    // =========================================================================
    // 7. VIEW STAFF BY DEPARTMENT MODAL
    // =========================================================================

    function openViewStaffByDepartmentModal(householdId, departmentId) {
        if (_processingStaffModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingStaffModal = true;

        try {
            var household = _getHousehold(householdId);
            if (!household) {
                _showToast('Household not found', 'error');
                _processingStaffModal = false;
                return;
            }

            var department = _getDepartment(householdId, departmentId);
            if (!department) {
                _showToast('Department not found', 'error');
                _processingStaffModal = false;
                return;
            }

            var staff = _getStaffByDepartment(householdId, departmentId);

            var staffHtml = '';
            if (staff.length === 0) {
                staffHtml = '<div style="color: var(--dim); text-align: center; padding: 20px; font-size: 0.6rem;">No staff assigned to this department</div>';
            } else {
                staffHtml = '<div style="display: flex; flex-direction: column; gap: 6px;">';
                for (var i = 0; i < staff.length; i++) {
                    var char = staff[i].character;
                    var member = staff[i].member;
                    var age = _calculateAge(char.birthYear, char.isDeceased, char.deathYear);
                    var genderSymbol = char.gender === 'male' ? '♂' : (char.gender === 'female' ? '♀' : '?');

                    staffHtml +=
                        '<div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: var(--bg2); border-radius: 6px; border-left: 3px solid var(--accent);">' +
                        '<div>' +
                        '<strong>' + _escapeHtml(char.name) + ' ' + _escapeHtml(char.surname || '') + '</strong>' +
                        ' <span style="font-size: 0.5rem; color: var(--dim);">' + genderSymbol + ' ' + age + 'y</span>' +
                        '<div style="font-size: 0.5rem; color: var(--dim);">Role: ' + _escapeHtml(member.role || 'Staff') + '</div>' +
                        '</div>' +
                        '<div style="display: flex; gap: 4px;">' +
                        '<button class="remove-staff-btn btn small" data-char-id="' + char.id + '" style="padding: 2px 8px; font-size: 0.45rem; background: #8a3020; border: none; color: white; border-radius: 3px; cursor: pointer;">Remove</button>' +
                        '<button class="view-staff-btn btn small" data-char-id="' + char.id + '" style="padding: 2px 8px; font-size: 0.45rem; background: var(--bg3); border: 1px solid var(--border); border-radius: 3px; cursor: pointer;">View</button>' +
                        '</div>' +
                        '</div>';
                }
                staffHtml += '</div>';
            }

            var modalContent =
                '<div style="margin-bottom: 16px; padding: 12px; background: var(--bg2); border-radius: 8px;">' +
                '<strong>Department:</strong> ' + _escapeHtml(department.name) + '<br>' +
                '<strong>Household:</strong> ' + _escapeHtml(household.name) +
                '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 4px;">Total Staff: ' + staff.length + '</div>' +
                '</div>' +
                '<div style="max-height: 350px; overflow-y: auto;">' +
                staffHtml +
                '</div>';

            _openModal({
                title: 'Staff of ' + department.name,
                content: modalContent,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {
                    _closeTopModal();
                    _processingStaffModal = false;
                }
            });

            // Attach event handlers
            setTimeout(function() {
                // Remove staff buttons
                var removeBtns = document.querySelectorAll('.remove-staff-btn');
                removeBtns.forEach(function(btn) {
                    var newBtn = btn.cloneNode(true);
                    if (btn.parentNode) {
                        btn.parentNode.replaceChild(newBtn, btn);
                    }

                    newBtn.onclick = function(e) {
                        e.stopPropagation();
                        var charId = this.dataset.charId;
                        var char = _getCharacterById(charId);
                        if (char) {
                            _closeTopModal();
                            openRemoveStaffAssignmentModal(householdId, charId, function() {
                                setTimeout(function() {
                                    openViewStaffByDepartmentModal(householdId, departmentId);
                                }, 100);
                            });
                        }
                    };
                });

                // View staff buttons
                var viewBtns = document.querySelectorAll('.view-staff-btn');
                viewBtns.forEach(function(btn) {
                    var newBtn = btn.cloneNode(true);
                    if (btn.parentNode) {
                        btn.parentNode.replaceChild(newBtn, btn);
                    }

                    newBtn.onclick = function(e) {
                        e.stopPropagation();
                        var charId = this.dataset.charId;
                        var char = _getCharacterById(charId);
                        if (char && typeof window.openCharacterModal === 'function') {
                            _closeTopModal();
                            window.openCharacterModal(charId);
                        } else {
                            _showToast('Character details not available', 'info');
                        }
                    };
                });

            }, 100);

        } catch (e) {
            _processingStaffModal = false;
            _showToast('Error opening staff view', 'error');
        }
    }

    // =========================================================================
    // 8. STAFF DETAILS MODAL
    // =========================================================================

    function openStaffDetailsModal(householdId, characterId) {
        if (_processingStaffModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingStaffModal = true;

        try {
            var household = _getHousehold(householdId);
            if (!household) {
                _showToast('Household not found', 'error');
                _processingStaffModal = false;
                return;
            }

            var character = _getCharacterById(characterId);
            if (!character) {
                _showToast('Character not found', 'error');
                _processingStaffModal = false;
                return;
            }

            var member = null;
            for (var i = 0; i < household.members.length; i++) {
                if (household.members[i].characterId === characterId) {
                    member = household.members[i];
                    break;
                }
            }

            if (!member) {
                _showToast('Member not found', 'error');
                _processingStaffModal = false;
                return;
            }

            var age = _calculateAge(character.birthYear, character.isDeceased, character.deathYear);
            var department = member.departmentId ? _getDepartment(householdId, member.departmentId) : null;

            var modalContent =
                '<div style="margin-bottom: 16px;">' +
                '<div style="background: var(--bg3); border-radius: 6px; padding: 12px; margin-bottom: 12px;">' +
                '<div style="font-size: 0.8rem;"><strong>' + _escapeHtml(character.name) + ' ' + _escapeHtml(character.surname || '') + '</strong></div>' +
                '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px; margin-top: 8px; font-size: 0.6rem;">' +
                '<div><span style="color: var(--dim);">Age:</span> ' + age + ' years</div>' +
                '<div><span style="color: var(--dim);">Gender:</span> ' + (character.gender || 'Unknown') + '</div>' +
                '<div><span style="color: var(--dim);">Role:</span> ' + _escapeHtml(member.role || 'Staff') + '</div>' +
                '<div><span style="color: var(--dim);">Status:</span> ' + (character.isDeceased ? 'Deceased' : 'Living') + '</div>' +
                '<div><span style="color: var(--dim);">Department:</span> ' + (department ? _escapeHtml(department.name) : 'None') + '</div>' +
                '<div><span style="color: var(--dim);">Joined:</span> ' + (member.joinedYear || 'Unknown') + '</div>' +
                '</div>' +
                (member.notes ? '<div style="margin-top: 8px; font-size: 0.55rem; color: var(--dim);">Notes: ' + _escapeHtml(member.notes) + '</div>' : '') +
                '</div>' +
                (member.departmentId ?
                    '<div style="display: flex; gap: 8px; margin-top: 8px;">' +
                    '<button id="staffDetailsRemoveBtn" class="btn small" style="padding: 4px 12px; font-size: 0.6rem; background: #8a3020; border: none; color: white; border-radius: 4px; cursor: pointer;">Remove from Department</button>' +
                    '</div>' :
                    '<div style="display: flex; gap: 8px; margin-top: 8px;">' +
                    '<button id="staffDetailsAssignBtn" class="btn small" style="padding: 4px 12px; font-size: 0.6rem; background: var(--accent); border: none; color: white; border-radius: 4px; cursor: pointer;">Assign to Department</button>' +
                    '</div>'
                ) +
                '</div>';

            _openModal({
                title: 'Staff Details: ' + character.name,
                content: modalContent,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {
                    _closeTopModal();
                    _processingStaffModal = false;
                }
            });

            setTimeout(function() {
                var removeBtn = document.getElementById('staffDetailsRemoveBtn');
                if (removeBtn) {
                    removeBtn.onclick = function() {
                        _closeTopModal();
                        openRemoveStaffAssignmentModal(householdId, characterId, function() {
                            _processingStaffModal = false;
                        });
                    };
                }

                var assignBtn = document.getElementById('staffDetailsAssignBtn');
                if (assignBtn) {
                    assignBtn.onclick = function() {
                        _closeTopModal();
                        var departments = _getDepartments(householdId);
                        if (departments.length === 0) {
                            _showToast('No departments available. Create one first.', 'warning');
                            _processingStaffModal = false;
                            return;
                        }

                        var deptOptions = departments.map(function(d) {
                            return '<option value="' + d.id + '">' + _escapeHtml(d.name) + '</option>';
                        }).join('');

                        var deptModalContent =
                            '<div style="margin-bottom: 16px;">' +
                            '<div style="background: var(--bg3); border-radius: 6px; padding: 12px; margin-bottom: 12px;">' +
                            '<div style="font-size: 0.7rem;"><strong>' + _escapeHtml(character.name) + ' ' + _escapeHtml(character.surname || '') + '</strong></div>' +
                            '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 4px;">Household: ' + _escapeHtml(household.name) + '</div>' +
                            '</div>' +
                            '<div class="form-group" style="margin-bottom: 12px;">' +
                            '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Select Department</label>' +
                            '<select id="assignDepartmentSelect" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;">' +
                            '<option value="">Select a department</option>' +
                            deptOptions +
                            '</select>' +
                            '</div>' +
                            '</div>';

                        _openModal({
                            title: 'Assign to Department',
                            content: deptModalContent,
                            confirmText: 'Assign',
                            cancelText: 'Cancel',
                            onConfirm: function() {
                                var deptId = document.getElementById('assignDepartmentSelect').value;
                                if (!deptId) {
                                    _showToast('Please select a department', 'error');
                                    return false;
                                }

                                var result = _commands.updateMember(householdId, characterId, {
                                    departmentId: deptId
                                });

                                if (result && result.success) {
                                    var dept = _getDepartment(householdId, deptId);
                                    _showToast(character.name + ' assigned to ' + dept.name, 'success');
                                    _closeTopModal();
                                    _processingStaffModal = false;
                                } else {
                                    _showToast(result ? result.reason : 'Failed to assign', 'error');
                                }
                                return true;
                            },
                            onCancel: function() {
                                _processingStaffModal = false;
                            }
                        });
                    };
                }
            }, 100);

        } catch (e) {
            _processingStaffModal = false;
            _showToast('Error opening staff details', 'error');
        }
    }

    // =========================================================================
    // 9. VIEW ALL STAFF MODAL
    // =========================================================================

    function openViewAllStaffModal(householdId) {
        if (_processingStaffModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingStaffModal = true;

        try {
            var household = _getHousehold(householdId);
            if (!household) {
                _showToast('Household not found', 'error');
                _processingStaffModal = false;
                return;
            }

            var staff = _getHouseholdStaff(householdId);
            var departments = _getDepartments(householdId);
            var deptMap = {};
            for (var i = 0; i < departments.length; i++) {
                deptMap[departments[i].id] = departments[i].name;
            }

            var staffHtml = '';
            if (staff.length === 0) {
                staffHtml = '<div style="color: var(--dim); text-align: center; padding: 40px; font-size: 0.6rem;">No staff members in this household</div>';
            } else {
                // Group by department
                var grouped = {
                    assigned: {},
                    unassigned: []
                };

                for (var i = 0; i < staff.length; i++) {
                    var s = staff[i];
                    if (s.member.departmentId) {
                        if (!grouped.assigned[s.member.departmentId]) {
                            grouped.assigned[s.member.departmentId] = [];
                        }
                        grouped.assigned[s.member.departmentId].push(s);
                    } else {
                        grouped.unassigned.push(s);
                    }
                }

                // Render assigned staff
                for (var deptId in grouped.assigned) {
                    var deptName = deptMap[deptId] || 'Unknown Department';
                    var members = grouped.assigned[deptId];

                    staffHtml +=
                        '<div style="margin-top: 8px;">' +
                        '<div style="font-size: 0.6rem; color: var(--accent); margin-bottom: 4px;">' + _escapeHtml(deptName) + ' (' + members.length + ')</div>';

                    for (var i = 0; i < members.length; i++) {
                        var char = members[i].character;
                        var member = members[i].member;
                        var age = _calculateAge(char.birthYear, char.isDeceased, char.deathYear);
                        var genderSymbol = char.gender === 'male' ? '♂' : (char.gender === 'female' ? '♀' : '?');

                        staffHtml +=
                            '<div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 8px; background: var(--bg2); border-radius: 4px; margin-bottom: 2px; font-size: 0.55rem;">' +
                            '<span>' + genderSymbol + ' ' + _escapeHtml(char.name) + ' ' + _escapeHtml(char.surname || '') + ' <span style="color: var(--dim);">(' + age + 'y)</span></span>' +
                            '<span style="color: var(--dim); font-size: 0.5rem;">' + _escapeHtml(member.role || 'Staff') + '</span>' +
                            '</div>';
                    }

                    staffHtml += '</div>';
                }

                // Render unassigned staff
                if (grouped.unassigned.length > 0) {
                    staffHtml +=
                        '<div style="margin-top: 8px;">' +
                        '<div style="font-size: 0.6rem; color: var(--warn); margin-bottom: 4px;">Unassigned (' + grouped.unassigned.length + ')</div>';

                    for (var i = 0; i < grouped.unassigned.length; i++) {
                        var char = grouped.unassigned[i].character;
                        var member = grouped.unassigned[i].member;
                        var age = _calculateAge(char.birthYear, char.isDeceased, char.deathYear);
                        var genderSymbol = char.gender === 'male' ? '♂' : (char.gender === 'female' ? '♀' : '?');

                        staffHtml +=
                            '<div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 8px; background: var(--bg2); border-radius: 4px; margin-bottom: 2px; font-size: 0.55rem;">' +
                            '<span>' + genderSymbol + ' ' + _escapeHtml(char.name) + ' ' + _escapeHtml(char.surname || '') + ' <span style="color: var(--dim);">(' + age + 'y)</span></span>' +
                            '<span style="color: var(--dim); font-size: 0.5rem;">' + _escapeHtml(member.role || 'Staff') + '</span>' +
                            '</div>';
                    }

                    staffHtml += '</div>';
                }
            }

            var modalContent =
                '<div style="margin-bottom: 16px; padding: 12px; background: var(--bg2); border-radius: 8px;">' +
                '<strong>Household:</strong> ' + _escapeHtml(household.name) +
                '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 4px;">Total Staff: ' + staff.length + '</div>' +
                '</div>' +
                '<div style="max-height: 400px; overflow-y: auto;">' +
                staffHtml +
                '</div>';

            _openModal({
                title: 'Staff of ' + household.name,
                content: modalContent,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {
                    _closeTopModal();
                    _processingStaffModal = false;
                }
            });

        } catch (e) {
            _processingStaffModal = false;
            _showToast('Error opening staff view', 'error');
        }
    }

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

    window.openAssignStaffModal = openAssignStaffModal;
    window.openRemoveStaffAssignmentModal = openRemoveStaffAssignmentModal;
    window.openViewStaffByDepartmentModal = openViewStaffByDepartmentModal;
    window.openStaffDetailsModal = openStaffDetailsModal;
    window.openViewAllStaffModal = openViewAllStaffModal;

    // ES Module exports
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            openAssignStaffModal: openAssignStaffModal,
            openRemoveStaffAssignmentModal: openRemoveStaffAssignmentModal,
            openViewStaffByDepartmentModal: openViewStaffByDepartmentModal,
            openStaffDetailsModal: openStaffDetailsModal,
            openViewAllStaffModal: openViewAllStaffModal
        };
    }

})();