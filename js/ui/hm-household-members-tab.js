/**
 * =============================================================================
 * HOUSEHOLD MEMBERS TAB
 * =============================================================================
 * 
 * UPDATED: Full integration with HouseholdState, HouseholdCommands,
 *          HouseholdQueries, HouseholdEconomy, HouseholdAssignment,
 *          and HouseholdServant
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. RECURSION GUARD
    // =========================================================================

    var _rendering = false;

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _escapeHtml(str) {
        if (typeof window._escapeHtml === 'function') return window._escapeHtml(str);
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

    function _getIcon(name) {
        if (typeof window._getIcon === 'function') return window._getIcon(name);
        if (window.Icons && window.Icons[name]) return window.Icons[name];
        return '';
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

    function _confirmDialog(message, title, onConfirm, onCancel) {
        if (typeof window.confirmDialog === 'function') return window.confirmDialog(message, title, onConfirm, onCancel);
        if (typeof window._confirmDialog === 'function') return window._confirmDialog(message, title, onConfirm, onCancel);
        if (confirm(message)) {
            if (onConfirm) onConfirm();
        } else {
            if (onCancel) onCancel();
        }
    }

    function _openCharacterSelector(options) {
        if (typeof window.openCharacterSelector === 'function') return window.openCharacterSelector(options);
        if (typeof window.openUnifiedCharacterSelector === 'function') return window.openUnifiedCharacterSelector(options);
        if (typeof window._openCharacterSelector === 'function') return window._openCharacterSelector(options);
        _showToast('Character selector not available', 'error');
        return null;
    }

    // =========================================================================
    // 2. STATE, COMMANDS, QUERIES, ECONOMY, ASSIGNMENT, SERVANT
    // =========================================================================

    var _state = window.HouseholdState;
    var _commands = window.HouseholdCommands;
    var _queries = window.HouseholdQueries;
    var _economy = window.HouseholdEconomy;
    var _assignment = window.HouseholdAssignment;
    var _servant = window.HouseholdServant;

    // =========================================================================
    // 3. ICON HELPERS
    // =========================================================================

    function _getIconSafe(name) {
        var icon = _getIcon(name);
        return icon || '';
    }

    // =========================================================================
    // 4. BUSINESS LOGIC WRAPPERS
    // =========================================================================

    function _getHousehold(householdId) {
        return _state ? _state.getHousehold(householdId) : null;
    }

    function _getCharacterById(characterId) {
        if (typeof window.getCharacterById === 'function') return window.getCharacterById(characterId);
        return null;
    }

    function _getCharacters() {
        if (typeof window.getCharacters === 'function') return window.getCharacters();
        return [];
    }

    function _getHouseholdMembers(householdId) {
        return _state ? _state.getHouseholdMembersWithCharacters(householdId) : [];
    }

    function _getDepartments(householdId) {
        var household = _getHousehold(householdId);
        return household ? (household.departments || []) : [];
    }

    function _getActiveRankDisplay(character) {
        if (typeof window.getActiveRankDisplay === 'function') return window.getActiveRankDisplay(character);
        return null;
    }

    function _getEducationLevel(characterId) {
        if (typeof window.getEducationLevel === 'function') return window.getEducationLevel(characterId);
        return null;
    }

    function _isLiterate(characterId) {
        if (typeof window.isLiterate === 'function') return window.isLiterate(characterId);
        return false;
    }

    function _calculateAge(birthYear, isDeceased, deathYear) {
        if (typeof window.calculateAge === 'function') return window.calculateAge(birthYear, isDeceased, deathYear);
        var currentYear = _getCurrentYear();
        if (!birthYear) return 0;
        if (isDeceased && deathYear) return Math.max(0, deathYear - birthYear);
        return Math.max(0, currentYear - birthYear);
    }

    // =========================================================================
    // 5. SERVICE RELATIONSHIP HELPERS
    // =========================================================================

    function _getServiceBetween(employerId, servantId) {
        return _servant ? _servant.getServiceBetween(employerId, servantId) : null;
    }

    function _getServiceQuality(relationshipId) {
        return _servant ? _servant.getServiceQuality(relationshipId) : null;
    }

    function _createServiceRelationship(employerId, servantId, options) {
        return _servant ? _servant.createServiceRelationship(employerId, servantId, options) : null;
    }

    function _terminateService(employerId, servantId, options) {
        return _servant ? _servant.terminateService(employerId, servantId, options) : false;
    }

    function _promoteServant(employerId, servantId, newServiceTypeId, options) {
        return _servant ? _servant.promoteServant(employerId, servantId, newServiceTypeId, options) : null;
    }

    function _adjustServantWages(employerId, servantId, newWage, reason) {
        return _servant ? _servant.adjustServantWages(employerId, servantId, newWage, reason) : null;
    }

    function _getServants(employerId) {
        return _servant ? _servant.getServants(employerId) : [];
    }

    function _getServiceHistory(characterId) {
        return _servant ? _servant.getServiceHistory(characterId) : [];
    }

    function _generateServiceReference(employerId, servantId) {
        return _servant ? _servant.generateServiceReference(employerId, servantId) : null;
    }

    // =========================================================================
    // 6. ASSIGNMENT HELPERS
    // =========================================================================

    function _transferCharacterToHousehold(characterId, targetHouseholdId, options) {
        return _assignment ? _assignment.transferCharacterToHousehold(characterId, targetHouseholdId, options) : null;
    }

    function _assignNewbornToHousehold(childId, motherId, fatherId, options) {
        return _assignment ? _assignment.assignNewbornToHousehold(childId, motherId, fatherId, options) : null;
    }

    function _assignToSpouseHousehold(characterId, spouseId, options) {
        return _assignment ? _assignment.assignToSpouseHousehold(characterId, spouseId, options) : null;
    }

    function _autoAssignHouseholdHead(householdId, deceasedId, options) {
        return _assignment ? _assignment.autoAssignHouseholdHead(householdId, deceasedId, options) : null;
    }

    function _processHouseholdInheritanceOnDeath(characterId, options) {
        return _assignment ? _assignment.processHouseholdInheritanceOnDeath(characterId, options) : [];
    }

    // =========================================================================
    // 7. ECONOMY HELPERS
    // =========================================================================

    function _modifyHouseholdWealth(householdId, amount, reason) {
        return _economy ? _economy.updateHouseholdWealth(householdId, amount, reason) : null;
    }

    function _modifyHouseholdReputation(householdId, delta, reason) {
        var household = _getHousehold(householdId);
        if (household && _state && typeof _state.updateHousehold === 'function') {
            var newRep = Math.max(0, Math.min(100, (household.reputation || 50) + delta));
            _state.updateHousehold(householdId, { reputation: newRep }, { recordHistory: false });
            return newRep;
        }
        return null;
    }

    function _getHouseholdWealth(householdId) {
        var household = _getHousehold(householdId);
        return household ? (household.wealth || 0) : 0;
    }

    // =========================================================================
    // 8. MODAL WRAPPERS
    // =========================================================================

    function _openAddMemberModal(householdId, type, onSuccess) {
        if (typeof window.openAddMemberModal === 'function') {
            return window.openAddMemberModal(householdId, type, onSuccess);
        }
        if (typeof window._openAddMemberModal === 'function') {
            return window._openAddMemberModal(householdId, type, onSuccess);
        }
        _showToast('Add member modal not available', 'error');
        return null;
    }

    function _openEditMemberModal(householdId, characterId, onSuccess) {
        if (typeof window.openEditMemberModal === 'function') {
            return window.openEditMemberModal(householdId, characterId, onSuccess);
        }
        if (typeof window._openEditMemberModal === 'function') {
            return window._openEditMemberModal(householdId, characterId, onSuccess);
        }
        _showToast('Edit member modal not available', 'error');
        return null;
    }

    function _openTransferMemberModal(householdId, characterId, onSuccess) {
        if (typeof window.openTransferMemberModal === 'function') {
            return window.openTransferMemberModal(householdId, characterId, onSuccess);
        }
        if (typeof window._openTransferMemberModal === 'function') {
            return window._openTransferMemberModal(householdId, characterId, onSuccess);
        }
        _showToast('Transfer member modal not available', 'error');
        return null;
    }

    function _openCharacterModal(characterId) {
        if (typeof window.openCharacterModal === 'function') return window.openCharacterModal(characterId);
        if (typeof window.openCharacterDetailsModal === 'function') return window.openCharacterDetailsModal(characterId);
        var character = _getCharacterById(characterId);
        if (character) _showToast('Selected: ' + character.name, 'info');
        return null;
    }

    function _openServiceReferenceModal(employerId, servantId) {
        if (typeof window.openServiceReferenceModal === 'function') {
            return window.openServiceReferenceModal(employerId, servantId);
        }
        var reference = _generateServiceReference(employerId, servantId);
        if (reference) {
            _showToast('Service reference generated for ' + reference.servantName, 'success');
        }
        return null;
    }

    // =========================================================================
    // 9. HELPER FUNCTIONS
    // =========================================================================

    function _isActiveMember(character, householdId) {
        if (!character) return false;
        if (character.isDeceased) return false;

        if (character.householdHistory && character.householdHistory.length > 0) {
            for (var i = 0; i < character.householdHistory.length; i++) {
                if (character.householdHistory[i].householdId === householdId) {
                    if (character.householdHistory[i].leftYear) return false;
                    return true;
                }
            }
        }
        return character.household === householdId;
    }

    function _getLeftYear(character, householdId) {
        if (!character || !character.householdHistory) return null;
        for (var i = 0; i < character.householdHistory.length; i++) {
            if (character.householdHistory[i].householdId === householdId && character.householdHistory[i].leftYear) {
                return character.householdHistory[i].leftYear;
            }
        }
        return null;
    }

    function _getLeftReason(character, householdId) {
        if (!character || !character.householdHistory) return null;
        for (var i = 0; i < character.householdHistory.length; i++) {
            if (character.householdHistory[i].householdId === householdId && character.householdHistory[i].leftReason) {
                return character.householdHistory[i].leftReason;
            }
        }
        return null;
    }

    function _handleStaffRemoval(householdId, employerId, servantId, servantName, reason) {
        var terminated = _terminateService(employerId, servantId, {
            endYear: _getCurrentYear(),
            reason: reason
        });

        if (terminated) _showToast('Service relationship terminated for ' + servantName, 'info');

        if (reason === 'fired' || reason === 'misconduct') {
            _modifyHouseholdReputation(householdId, -2, 'Fired staff member: ' + servantName);
        } else if (reason === 'resigned') {
            _modifyHouseholdReputation(householdId, 0, 'Staff member resigned: ' + servantName);
        } else {
            _modifyHouseholdReputation(householdId, -1, 'Staff removed: ' + servantName);
        }
        return terminated;
    }

    function _createStaffServiceRelationship(householdId, employerId, servantId, role, wage, year) {
        var serviceTypeMap = {
            'Servant': 'household_staff',
            'Maid': 'maid',
            'Cook': 'cook',
            'Gardener': 'gardener',
            'Groom': 'groom',
            'Steward': 'steward',
            'Butler': 'butler',
            'Valet': 'valet',
            'Chamberlain': 'chamberlain',
            'Retainer': 'retainer'
        };

        var roleLower = role.toLowerCase();
        var serviceTypeId = 'household_staff';
        for (var key in serviceTypeMap) {
            if (roleLower.indexOf(key.toLowerCase()) !== -1) {
                serviceTypeId = serviceTypeMap[key];
                break;
            }
        }

        return _createServiceRelationship(employerId, servantId, {
            serviceTypeId: serviceTypeId,
            wage: wage || 5,
            startYear: year || _getCurrentYear(),
            initialQuality: 'average'
        });
    }

    // =========================================================================
    // 10. MAIN RENDER FUNCTION
    // =========================================================================

    function renderHouseholdMembersTab(containerId, householdId, onRefresh, onSelectCharacter) {
        if (_rendering) return;
        _rendering = true;

        try {
            var container = document.getElementById(containerId);
            if (!container) return;

            var household = _getHousehold(householdId);
            if (!household) {
                container.innerHTML = '<div class="empty-state">Household not found</div>';
                return;
            }

            var allMembers = _getHouseholdMembers(householdId);
            var departments = _getDepartments(householdId);
            var currentYear = _getCurrentYear();

            var householdHead = null;
            for (var i = 0; i < allMembers.length; i++) {
                if (allMembers[i].isHead === true) {
                    householdHead = allMembers[i];
                    break;
                }
            }
            var employerId = householdHead ? householdHead.characterId : null;

            // Separate current vs former members
            var currentMembers = [];
            var formerMembers = [];

            for (var i = 0; i < allMembers.length; i++) {
                var m = allMembers[i];
                var char = m.character;
                if (!char) continue;

                if (_isActiveMember(char, householdId)) {
                    currentMembers.push(m);
                } else {
                    formerMembers.push(m);
                }
            }

            var deceasedMembers = formerMembers.filter(function(m) {
                return m.character && m.character.isDeceased === true;
            });

            var movedOutMembers = formerMembers.filter(function(m) {
                var char = m.character;
                if (!char) return false;
                if (char.isDeceased) return false;
                var leftYear = _getLeftYear(char, householdId);
                return leftYear !== null;
            });

            var currentFamily = currentMembers.filter(function(m) { return m.type === 'family'; });
            var currentStaff = currentMembers.filter(function(m) { return m.type === 'staff'; });

            // =========================================================================
            // BUILD HTML
            // =========================================================================

            var html = '';
            html += '<div style="padding: 16px;">';
            html += '<div style="display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap;">';
            html += '<button id="addFamilyBtn" class="btn" style="background: var(--accent); border: none; color: white; padding: 8px 16px; border-radius: 6px; cursor: pointer;">+ Add Family</button>';
            html += '<button id="addStaffBtn" class="btn" style="background: var(--bg3); border: 1px solid var(--border); padding: 8px 16px; border-radius: 6px; cursor: pointer;">+ Add Staff</button>';
            html += '<button id="showServantsBtn" class="btn" style="background: var(--bg3); border: 1px solid var(--border); padding: 8px 16px; border-radius: 6px; cursor: pointer;">Show Servants</button>';
            html += '<button id="successionBtn" class="btn" style="background: var(--bg3); border: 1px solid var(--border); padding: 8px 16px; border-radius: 6px; cursor: pointer;">Succession</button>';
            html += '</div>';

            // Current Family Members
            html += '<div style="margin-bottom: 24px;">';
            html += '<h3 style="color: var(--accent); margin: 0 0 12px 0; font-size: 0.85rem; border-bottom: 1px solid var(--border); padding-bottom: 6px;">';
            html += 'Current Family Members (' + currentFamily.length + ')';
            html += '</h3>';

            if (currentFamily.length > 0) {
                for (var i = 0; i < currentFamily.length; i++) {
                    var member = currentFamily[i];
                    var character = member.character;
                    var isHead = member.isHead === true;
                    var age = _calculateAge(character.birthYear, character.isDeceased, character.deathYear);
                    var rankDisplay = _getActiveRankDisplay(character);
                    var educationLevel = _getEducationLevel(character.id);
                    var isLiterate = _isLiterate(character.id);
                    var joinedYear = member.joinedYear || '?';
                    var yearsWithHousehold = joinedYear !== '?' ? currentYear - joinedYear : 0;

                    var educationIcon = '';
                    if (educationLevel) {
                        if (educationLevel.id === 'scholar') educationIcon = '⌆';
                        else if (educationLevel.id === 'educated') educationIcon = '✓';
                        else if (educationLevel.id === 'literate') educationIcon = '✓';
                    }
                    if (isLiterate && !educationIcon) educationIcon = '✓';

                    html += '<div class="member-card" data-character-id="' + character.id + '" style="';
                    html += 'background: var(--bg2);';
                    html += 'border-left: 3px solid ' + (isHead ? 'var(--accent)' : 'var(--border)') + ';';
                    html += 'border-radius: 8px;';
                    html += 'margin-bottom: 8px;';
                    html += 'cursor: pointer;';
                    html += '">';
                    html += '<div style="display: flex; justify-content: space-between; align-items: center; padding: 12px;">';
                    html += '<div style="flex: 1;">';
                    html += '<div style="display: flex; align-items: center; flex-wrap: wrap; gap: 6px;">';
                    html += '<strong>' + _escapeHtml(character.name) + ' ' + _escapeHtml(character.surname || '') + '</strong>';
                    if (isHead) html += '<span style="background: var(--accent-dim); padding: 2px 6px; border-radius: 4px; font-size: 0.55rem;">Head</span>';
                    if (rankDisplay) html += '<span style="color: var(--accent); font-size: 0.6rem;">' + _escapeHtml(rankDisplay.display || rankDisplay) + '</span>';
                    if (educationIcon) html += '<span style="color: var(--dim); font-size: 0.6rem;" title="' + _escapeHtml(educationLevel ? educationLevel.name : '') + '">' + educationIcon + '</span>';
                    html += '</div>';
                    html += '<div style="font-size: 0.6rem; color: var(--dim); margin-top: 4px; display: flex; flex-wrap: wrap; gap: 12px;">';
                    html += '<span>Age: ' + age + '</span>';
                    html += '<span>Joined: ' + joinedYear + (yearsWithHousehold > 0 ? ' (' + yearsWithHousehold + 'y ago)' : '') + '</span>';
                    if (member.role && !isHead) html += '<span>Role: ' + _escapeHtml(member.role) + '</span>';
                    html += '</div>';
                    if (member.notes) html += '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 4px;">' + _escapeHtml(member.notes) + '</div>';
                    html += '</div>';
                    html += '<div style="display: flex; gap: 6px;">';
                    html += '<button class="edit-member-btn btn small" data-character-id="' + character.id + '" style="padding: 4px 8px; font-size: 0.55rem; background: var(--accent-dim); border: 1px solid var(--accent); border-radius: 4px; cursor: pointer;" title="Edit member details">Edit</button>';
                    html += '<button class="transfer-member-btn btn small" data-character-id="' + character.id + '" style="padding: 4px 8px; font-size: 0.55rem; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer;" title="Transfer to another household">Transfer</button>';
                    html += '<button class="remove-member-btn btn small" data-character-id="' + character.id + '" style="padding: 4px 8px; font-size: 0.55rem; background: #8a3020; border: none; color: white; border-radius: 4px; cursor: pointer;" title="Remove from household">Remove</button>';
                    html += '</div>';
                    html += '</div>';
                    html += '</div>';
                }
            } else {
                html += '<div style="color: var(--dim); text-align: center; padding: 20px; background: var(--bg3); border-radius: 8px;">No current family members</div>';
            }

            html += '</div>';

            // Current Staff Members
            html += '<div style="margin-bottom: 24px;">';
            html += '<h3 style="color: var(--accent); margin: 0 0 12px 0; font-size: 0.85rem; border-bottom: 1px solid var(--border); padding-bottom: 6px;">';
            html += 'Current Staff Members (' + currentStaff.length + ')';
            html += '</h3>';

            if (currentStaff.length > 0) {
                for (var i = 0; i < currentStaff.length; i++) {
                    var member = currentStaff[i];
                    var character = member.character;
                    var age = _calculateAge(character.birthYear, character.isDeceased, character.deathYear);
                    var joinedYear = member.joinedYear || '?';
                    var yearsWithHousehold = joinedYear !== '?' ? currentYear - joinedYear : 0;

                    var department = null;
                    var isDeptHead = false;
                    if (member.departmentId) {
                        for (var j = 0; j < departments.length; j++) {
                            if (departments[j].id === member.departmentId) {
                                department = departments[j];
                                if (department.headId === character.id) isDeptHead = true;
                                break;
                            }
                        }
                    }

                    var serviceQuality = null;
                    var wage = null;
                    var serviceRelId = null;
                    if (employerId && employerId !== character.id) {
                        var serviceRel = _getServiceBetween(employerId, character.id);
                        if (serviceRel) {
                            serviceRelId = serviceRel.id;
                            var quality = _getServiceQuality(serviceRel.id);
                            if (quality) serviceQuality = quality.name || quality.id;
                            wage = serviceRel.metadata ? serviceRel.metadata.wage : null;
                        }
                    }

                    var role = member.role || 'Staff';

                    html += '<div class="member-card" data-character-id="' + character.id + '" style="';
                    html += 'background: var(--bg2);';
                    html += 'border-radius: 8px;';
                    html += 'margin-bottom: 8px;';
                    html += 'cursor: pointer;';
                    html += '">';
                    html += '<div style="padding: 12px;">';
                    html += '<div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap;">';
                    html += '<div style="flex: 1;">';
                    html += '<div style="display: flex; align-items: center; flex-wrap: wrap; gap: 6px;">';
                    html += '<strong>' + _escapeHtml(character.name) + ' ' + _escapeHtml(character.surname || '') + '</strong>';
                    html += '<span style="color: var(--accent-dim); font-size: 0.6rem;">' + _escapeHtml(role) + '</span>';
                    if (isDeptHead) html += '<span style="background: var(--accent-dim); padding: 2px 6px; border-radius: 4px; font-size: 0.55rem;">Dept Head</span>';
                    if (serviceQuality) html += '<span style="color: var(--dim); font-size: 0.55rem;" title="Service Quality">' + _escapeHtml(serviceQuality) + '</span>';
                    html += '</div>';
                    html += '<div style="font-size: 0.6rem; color: var(--dim); margin-top: 4px; display: flex; flex-wrap: wrap; gap: 12px;">';
                    html += '<span>Age: ' + age + '</span>';
                    html += '<span>Joined: ' + joinedYear + (yearsWithHousehold > 0 ? ' (' + yearsWithHousehold + 'y ago)' : '') + '</span>';
                    if (department) html += '<span>Dept: ' + _escapeHtml(department.name) + '</span>';
                    else html += '<span style="color: var(--warn);">Unassigned</span>';
                    if (wage !== null) html += '<span>Wage: ' + wage + '/yr</span>';
                    html += '</div>';
                    if (member.notes) html += '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 4px;">' + _escapeHtml(member.notes) + '</div>';
                    html += '</div>';
                    html += '<div style="display: flex; gap: 6px; margin-top: 4px; flex-wrap: wrap;">';
                    if (!department || !member.departmentId) {
                        html += '<button class="assign-dept-btn btn small" data-character-id="' + character.id + '" style="padding: 4px 8px; font-size: 0.55rem; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer;" title="Assign to department">Assign</button>';
                    } else {
                        html += '<button class="unassign-dept-btn btn small" data-character-id="' + character.id + '" data-dept-id="' + department.id + '" style="padding: 4px 8px; font-size: 0.55rem; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer;" title="Remove from department">Unassign</button>';
                    }
                    if (isDeptHead) {
                        html += '<button class="adjust-wage-btn btn small" data-character-id="' + character.id + '" data-current-wage="' + (wage || 5) + '" style="padding: 4px 8px; font-size: 0.55rem; background: var(--accent-dim); border: 1px solid var(--accent); border-radius: 4px; cursor: pointer;" title="Adjust wage">Wage</button>';
                        html += '<button class="promote-servant-btn btn small" data-character-id="' + character.id + '" style="padding: 4px 8px; font-size: 0.55rem; background: var(--accent-dim); border: 1px solid var(--accent); border-radius: 4px; cursor: pointer;" title="Promote servant">Promote</button>';
                    }
                    if (employerId && employerId !== character.id) {
                        html += '<button class="reference-btn btn small" data-character-id="' + character.id + '" style="padding: 4px 8px; font-size: 0.55rem; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer;" title="Generate service reference">Reference</button>';
                    }
                    html += '<button class="edit-member-btn btn small" data-character-id="' + character.id + '" style="padding: 4px 8px; font-size: 0.55rem; background: var(--accent-dim); border: 1px solid var(--accent); border-radius: 4px; cursor: pointer;" title="Edit member details">Edit</button>';
                    html += '<button class="transfer-member-btn btn small" data-character-id="' + character.id + '" style="padding: 4px 8px; font-size: 0.55rem; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer;" title="Transfer to another household">Transfer</button>';
                    html += '<button class="remove-member-btn btn small" data-character-id="' + character.id + '" data-service-rel-id="' + (serviceRelId || '') + '" style="padding: 4px 8px; font-size: 0.55rem; background: #8a3020; border: none; color: white; border-radius: 4px; cursor: pointer;" title="Remove from household">Remove</button>';
                    html += '</div>';
                    html += '</div>';
                    html += '</div>';
                    html += '</div>';
                }
            } else {
                html += '<div style="color: var(--dim); text-align: center; padding: 20px; background: var(--bg3); border-radius: 8px;">No current staff members</div>';
            }

            html += '</div>';

            // Former Members
            if (formerMembers.length > 0) {
                html += '<div style="margin-top: 24px;">';
                html += '<h3 style="color: var(--dim); margin: 0 0 12px 0; font-size: 0.75rem; border-bottom: 1px solid var(--border); padding-bottom: 6px;">';
                html += 'Former Members (' + formerMembers.length + ')';
                html += '</h3>';
                html += '<details style="margin-bottom: 16px;">';
                html += '<summary style="cursor: pointer; padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.65rem; color: var(--accent);">';
                html += '▼ Show former members (' + formerMembers.length + ')';
                html += '</summary>';
                html += '<div style="margin-top: 8px;">';

                // Deceased Members
                if (deceasedMembers.length > 0) {
                    html += '<div style="margin-bottom: 16px;">';
                    html += '<div style="font-size: 0.65rem; color: var(--accent); margin-bottom: 8px;">Deceased (' + deceasedMembers.length + ')</div>';
                    for (var i = 0; i < deceasedMembers.length; i++) {
                        var member = deceasedMembers[i];
                        var character = member.character;
                        var age = _calculateAge(character.birthYear, character.isDeceased, character.deathYear);
                        var deathYear = character.deathYear || '?';
                        var deathCause = character.deathCause || 'Unknown';
                        var joinedYear = member.joinedYear || '?';
                        var role = member.role || (member.type === 'family' ? 'Family Member' : 'Staff');
                        var leftYear = _getLeftYear(character, householdId) || deathYear;

                        html += '<div class="former-member-card" data-character-id="' + character.id + '" style="';
                        html += 'background: var(--bg3);';
                        html += 'border-radius: 6px;';
                        html += 'margin-bottom: 6px;';
                        html += 'padding: 8px 12px;';
                        html += 'cursor: pointer;';
                        html += 'border-left: 3px solid #f44336;';
                        html += '">';
                        html += '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">';
                        html += '<div>';
                        html += '<span style="text-decoration: line-through;">' + _escapeHtml(character.name) + ' ' + _escapeHtml(character.surname || '') + '</span>';
                        html += '<span style="font-size: 0.55rem; color: var(--dim); margin-left: 6px;">(' + role + ')</span>';
                        html += '<div style="font-size: 0.55rem; color: var(--dim);">';
                        html += 'Lived: ' + age + ' years · Died: ' + deathYear + ' (' + deathCause + ')';
                        html += '</div>';
                        html += '<div style="font-size: 0.5rem; color: var(--dim);">Joined: ' + joinedYear + ' · Left: ' + leftYear + '</div>';
                        html += '</div>';
                        html += '<div style="display: flex; gap: 4px;">';
                        html += '<button class="view-character-btn btn small" data-character-id="' + character.id + '" style="padding: 2px 6px; font-size: 0.5rem;">View</button>';
                        if (character.id && householdId && _assignment) {
                            html += '<button class="process-inheritance-btn btn small" data-character-id="' + character.id + '" style="padding: 2px 6px; font-size: 0.5rem; background: var(--accent-dim); border: 1px solid var(--accent); cursor: pointer;">Inheritance</button>';
                        }
                        html += '</div>';
                        html += '</div>';
                        html += '</div>';
                    }
                    html += '</div>';
                }

                // Moved Out Members
                if (movedOutMembers.length > 0) {
                    html += '<div style="margin-bottom: 16px;">';
                    html += '<div style="font-size: 0.65rem; color: var(--accent); margin-bottom: 8px;">Moved Out (' + movedOutMembers.length + ')</div>';
                    for (var i = 0; i < movedOutMembers.length; i++) {
                        var member = movedOutMembers[i];
                        var character = member.character;
                        var age = _calculateAge(character.birthYear, false, null);
                        var joinedYear = member.joinedYear || '?';
                        var role = member.role || (member.type === 'family' ? 'Family Member' : 'Staff');
                        var leftYear = _getLeftYear(character, householdId) || '?';
                        var leftReason = _getLeftReason(character, householdId) || 'Unknown';

                        html += '<div class="former-member-card" data-character-id="' + character.id + '" style="';
                        html += 'background: var(--bg3);';
                        html += 'border-radius: 6px;';
                        html += 'margin-bottom: 6px;';
                        html += 'padding: 8px 12px;';
                        html += 'cursor: pointer;';
                        html += 'border-left: 3px solid #ff9800;';
                        html += '">';
                        html += '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">';
                        html += '<div>';
                        html += '<span>' + _escapeHtml(character.name) + ' ' + _escapeHtml(character.surname || '') + '</span>';
                        html += '<span style="font-size: 0.55rem; color: var(--dim); margin-left: 6px;">(' + role + ')</span>';
                        html += '<div style="font-size: 0.55rem; color: var(--dim);">';
                        html += 'Age: ' + age + ' · Left: ' + leftYear + ' (' + leftReason + ')';
                        html += '</div>';
                        html += '<div style="font-size: 0.5rem; color: var(--dim);">Was with household: ' + joinedYear + ' - ' + leftYear + '</div>';
                        html += '</div>';
                        html += '<div style="display: flex; gap: 4px;">';
                        html += '<button class="view-character-btn btn small" data-character-id="' + character.id + '" style="padding: 2px 6px; font-size: 0.5rem;">View</button>';
                        html += '</div>';
                        html += '</div>';
                        html += '</div>';
                    }
                    html += '</div>';
                }

                html += '</div>';
                html += '</details>';
                html += '</div>';
            }

            if (currentMembers.length === 0 && formerMembers.length === 0) {
                html += '<div class="empty-state" style="text-align: center; padding: 60px 20px; color: var(--dim); background: var(--bg2); border-radius: 12px;">';
                html += '<div style="font-size: 2rem; margin-bottom: 12px;">⌂</div>';
                html += '<div>No members yet.</div>';
                html += '<div style="font-size: 0.65rem; margin-top: 8px;">Click "Add Family" or "Add Staff" to get started.</div>';
                html += '</div>';
            }

            html += '</div>';
            container.innerHTML = html;

            // =============================================================
            // EVENT HANDLERS
            // =============================================================

            var addFamilyBtn = document.getElementById('addFamilyBtn');
            if (addFamilyBtn) {
                addFamilyBtn.onclick = function() {
                    _openCharacterSelector({
                        title: 'Select Family Member',
                        targetId: null,
                        filters: {
                            showDeceased: false,
                            gender: 'all',
                            ageGroup: 'all',
                            location: 'all',
                            role: 'all'
                        },
                        excludeIds: (function() {
                            var ids = [];
                            if (household && household.members) {
                                for (var i = 0; i < household.members.length; i++) {
                                    ids.push(household.members[i].characterId);
                                }
                            }
                            return ids;
                        })(),
                        onSelect: function(character) {
                            if (character) {
                                _openAddMemberModal(householdId, 'family', function() {
                                    _modifyHouseholdReputation(householdId, 1, 'New family member added');
                                    if (onRefresh) onRefresh();
                                });
                            }
                        }
                    });
                };
            }

            var addStaffBtn = document.getElementById('addStaffBtn');
            if (addStaffBtn) {
                addStaffBtn.onclick = function() {
                    _openCharacterSelector({
                        title: 'Select Staff Member',
                        targetId: null,
                        filters: {
                            showDeceased: false,
                            gender: 'all',
                            ageGroup: 'all',
                            location: 'all',
                            role: 'all'
                        },
                        excludeIds: (function() {
                            var ids = [];
                            if (household && household.members) {
                                for (var i = 0; i < household.members.length; i++) {
                                    ids.push(household.members[i].characterId);
                                }
                            }
                            return ids;
                        })(),
                        onSelect: function(character) {
                            if (character) {
                                _openAddMemberModal(householdId, 'staff', function() {
                                    if (employerId && character.id && _servant) {
                                        var role = 'Staff';
                                        var wage = 5;
                                        var existingMember = null;
                                        for (var i = 0; i < household.members.length; i++) {
                                            if (household.members[i].characterId === character.id) {
                                                existingMember = household.members[i];
                                                break;
                                            }
                                        }
                                        if (existingMember) role = existingMember.role || 'Staff';
                                        _createStaffServiceRelationship(householdId, employerId, character.id, role, wage, _getCurrentYear());
                                        _modifyHouseholdWealth(householdId, -wage, 'Hired ' + role + ': ' + character.name);
                                        _modifyHouseholdReputation(householdId, 1, 'Hired new staff: ' + role);
                                        _showToast('Service contract created for ' + role + ' (wage: ' + wage + ')', 'success');
                                    }
                                    if (onRefresh) onRefresh();
                                });
                            }
                        }
                    });
                };
            }

            var showServantsBtn = document.getElementById('showServantsBtn');
            if (showServantsBtn && employerId && _servant) {
                showServantsBtn.onclick = function() {
                    var servants = _getServants(employerId);
                    if (servants.length === 0) {
                        _showToast('No servants found for this household', 'info');
                        return;
                    }
                    var servantNames = servants.map(function(s) {
                        var servant = _getCharacterById(s.participantB);
                        var quality = _getServiceQuality(s.id);
                        var wage = s.metadata ? s.metadata.wage : null;
                        return (servant ? servant.name : 'Unknown') +
                            (quality ? ' (' + quality.name + ')' : '') +
                            (wage !== null ? ' - ' + wage + 'g' : '');
                    }).join('\n');
                    _showToast('Servants:\n' + servantNames, 'info');
                };
            }

            var successionBtn = document.getElementById('successionBtn');
            if (successionBtn) {
                successionBtn.onclick = function() {
                    var head = _getHouseholdHead(householdId);
                    if (!head) {
                        _showToast('No head of household - succession not applicable', 'warning');
                        return;
                    }
                    var heirs = _assignment ? _assignment.getHouseholdHeirs(householdId, head.id, {
                        includeExternal: true,
                        maxAge: 60,
                        minAge: 16
                    }) : [];
                    if (heirs.length === 0) {
                        _showToast('No eligible heirs found for this household', 'info');
                        return;
                    }
                    var heirNames = heirs.slice(0, 10).map(function(h, i) {
                        return (i + 1) + '. ' + h.name + ' (' + h.age + ') - ' + h.relation;
                    }).join('\n');
                    if (heirs.length > 10) heirNames += '\n... and ' + (heirs.length - 10) + ' more';
                    _showToast('Heirs:\n' + heirNames, 'info');
                };
            }

            // =============================================================
            // ATTACH EVENT HANDLERS TO DYNAMIC ELEMENTS
            // =============================================================

            _attachMemberEventHandlers(container, householdId, departments, employerId, onRefresh, onSelectCharacter);

        } finally {
            _rendering = false;
        }
    }

    // =========================================================================
    // 11. ATTACH MEMBER EVENT HANDLERS
    // =========================================================================

    function _attachMemberEventHandlers(container, householdId, departments, employerId, onRefresh, onSelectCharacter) {
        var memberCards = container.querySelectorAll('.member-card, .former-member-card');
        for (var i = 0; i < memberCards.length; i++) {
            var card = memberCards[i];
            var characterId = card.dataset.characterId;
            if (!characterId) continue;

            var newCard = card.cloneNode(true);
            card.parentNode.replaceChild(newCard, card);

            // Character view handler (click on card)
            newCard.addEventListener('click', function(e) {
                if (e.target.classList.contains('remove-member-btn')) return;
                if (e.target.classList.contains('transfer-member-btn')) return;
                if (e.target.classList.contains('assign-dept-btn')) return;
                if (e.target.classList.contains('unassign-dept-btn')) return;
                if (e.target.classList.contains('adjust-wage-btn')) return;
                if (e.target.classList.contains('promote-servant-btn')) return;
                if (e.target.classList.contains('reference-btn')) return;
                if (e.target.classList.contains('edit-member-btn')) return;
                if (e.target.classList.contains('view-character-btn')) return;
                if (e.target.classList.contains('process-inheritance-btn')) return;
                var charId = this.dataset.characterId;
                if (onSelectCharacter) {
                    onSelectCharacter(charId);
                } else {
                    _openCharacterModal(charId);
                }
            });

            // Edit member button
            var editBtn = newCard.querySelector('.edit-member-btn');
            if (editBtn) {
                editBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var charId = this.dataset.characterId;
                    _openEditMemberModal(householdId, charId, function() {
                        if (onRefresh) onRefresh();
                    });
                });
            }

            // Remove button
            var removeBtn = newCard.querySelector('.remove-member-btn');
            if (removeBtn) {
                var serviceRelId = removeBtn.dataset.serviceRelId;
                removeBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var charId = this.dataset.characterId;
                    var character = _getCharacterById(charId);
                    var memberName = character ? (character.name + ' ' + (character.surname || '')).trim() : 'this member';
                    var memberType = null;
                    var currentMembers = _getHouseholdMembers(householdId);
                    for (var j = 0; j < currentMembers.length; j++) {
                        if (currentMembers[j].characterId === charId) {
                            memberType = currentMembers[j].type;
                            break;
                        }
                    }

                    _confirmDialog('Remove ' + memberName + ' from ' + (_getHousehold(householdId) ? _getHousehold(householdId).name : 'household') + '?', 'Remove Member', function() {
                        var result = _commands.removeMember(householdId, charId);
                        if (result && result.success) {
                            if (memberType === 'staff' && employerId) {
                                _handleStaffRemoval(householdId, employerId, charId, memberName, 'removed');
                            }
                            if (memberType === 'family') {
                                _modifyHouseholdReputation(householdId, -5, 'Family member removed: ' + memberName);
                            }
                            _showToast(memberName + ' removed from household', 'info');
                            if (onRefresh) onRefresh();
                        } else {
                            _showToast('Failed to remove member', 'error');
                        }
                    });
                });
            }

            // Transfer button
            var transferBtn = newCard.querySelector('.transfer-member-btn');
            if (transferBtn) {
                transferBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var charId = this.dataset.characterId;
                    var character = _getCharacterById(charId);
                    if (!character) return;

                    _openTransferMemberModal(householdId, charId, function() {
                        _modifyHouseholdReputation(householdId, -2, 'Member transferred out: ' + character.name);
                        if (onRefresh) onRefresh();
                    });
                });
            }

            // Assign department button
            var assignBtn = newCard.querySelector('.assign-dept-btn');
            if (assignBtn && departments.length > 0) {
                assignBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var charId = this.dataset.characterId;

                    var deptOptions = '';
                    for (var j = 0; j < departments.length; j++) {
                        deptOptions += '<option value="' + departments[j].id + '">' + _escapeHtml(departments[j].name) + '</option>';
                    }

                    _openModal({
                        title: 'Assign to Department',
                        content: '<div class="form-group" style="margin-bottom: 12px;">' +
                            '<label style="display: block; font-size: 0.7rem; margin-bottom: 4px;">Select Department</label>' +
                            '<select id="deptSelect" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">' +
                            deptOptions +
                            '</select></div>' +
                            '<div class="info-note" style="margin-top: 12px; padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem;">' +
                            'Assigning staff to a department helps organize household management.</div>',
                        confirmText: 'Assign',
                        cancelText: 'Cancel',
                        onConfirm: function() {
                            var deptId = document.getElementById('deptSelect').value;
                            var result = _commands.updateMember(householdId, charId, { departmentId: deptId });
                            if (result && result.success) {
                                _showToast('Staff assigned to department', 'success');
                                if (onRefresh) onRefresh();
                            } else {
                                _showToast('Failed to assign staff', 'error');
                            }
                        }
                    });
                });
            }

            // Unassign department button
            var unassignBtn = newCard.querySelector('.unassign-dept-btn');
            if (unassignBtn) {
                unassignBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var charId = this.dataset.characterId;
                    _confirmDialog('Remove this staff member from their department?', 'Unassign', function() {
                        var result = _commands.updateMember(householdId, charId, { departmentId: null });
                        if (result && result.success) {
                            _showToast('Staff unassigned from department', 'info');
                            if (onRefresh) onRefresh();
                        } else {
                            _showToast('Failed to unassign staff', 'error');
                        }
                    });
                });
            }

            // Adjust wage button
            var wageBtn = newCard.querySelector('.adjust-wage-btn');
            if (wageBtn) {
                var currentWage = parseInt(wageBtn.dataset.currentWage) || 5;
                wageBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var charId = this.dataset.characterId;
                    var character = _getCharacterById(charId);

                    _openModal({
                        title: 'Adjust Wage',
                        content: '<div class="form-group" style="margin-bottom: 12px;">' +
                            '<label style="display: block; font-size: 0.7rem; margin-bottom: 4px;">New Annual Wage (gold)</label>' +
                            '<input type="number" id="newWage" value="' + currentWage + '" min="1" max="100" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">' +
                            '</div>' +
                            '<div class="form-group" style="margin-bottom: 12px;">' +
                            '<label style="display: block; font-size: 0.7rem; margin-bottom: 4px;">Reason</label>' +
                            '<input type="text" id="wageReason" placeholder="e.g., Performance bonus, Cost cutting" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">' +
                            '</div>',
                        confirmText: 'Adjust Wage',
                        cancelText: 'Cancel',
                        onConfirm: function() {
                            var newWage = parseInt(document.getElementById('newWage').value);
                            var reason = document.getElementById('wageReason').value || 'Wage adjustment';

                            if (employerId && !isNaN(newWage) && newWage > 0) {
                                var adjusted = _adjustServantWages(employerId, charId, newWage, reason);
                                if (adjusted) {
                                    var wageDiff = newWage - currentWage;
                                    if (wageDiff > 0) {
                                        _modifyHouseholdWealth(householdId, -wageDiff, 'Wage increase for ' + character.name);
                                        _modifyHouseholdReputation(householdId, 2, 'Increased wages for ' + character.name);
                                    } else if (wageDiff < 0) {
                                        _modifyHouseholdWealth(householdId, Math.abs(wageDiff), 'Wage decrease for ' + character.name);
                                        _modifyHouseholdReputation(householdId, -2, 'Decreased wages for ' + character.name);
                                    }
                                    _showToast(character.name + ' wage adjusted to ' + newWage, 'success');
                                    if (onRefresh) onRefresh();
                                } else {
                                    _showToast('Failed to adjust wage', 'error');
                                }
                            }
                        }
                    });
                });
            }

            // Promote servant button
            var promoteBtn = newCard.querySelector('.promote-servant-btn');
            if (promoteBtn && employerId) {
                promoteBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var charId = this.dataset.characterId;
                    var character = _getCharacterById(charId);

                    var serviceTypes = ['steward', 'butler', 'chamberlain', 'valet', 'lady_maid'];
                    var typeOptions = serviceTypes.map(function(t) {
                        return '<option value="' + t + '">' + t.charAt(0).toUpperCase() + t.slice(1) + '</option>';
                    }).join('');

                    _openModal({
                        title: 'Promote Servant: ' + (character ? character.name : 'Unknown'),
                        content: '<div class="form-group" style="margin-bottom: 12px;">' +
                            '<label style="display: block; font-size: 0.7rem; margin-bottom: 4px;">New Position</label>' +
                            '<select id="promoteType" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">' +
                            typeOptions +
                            '</select></div>' +
                            '<div class="form-group" style="margin-bottom: 12px;">' +
                            '<label style="display: block; font-size: 0.7rem; margin-bottom: 4px;">New Wage</label>' +
                            '<input type="number" id="promoteWage" value="' + (currentWage + 5) + '" min="1" max="100" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">' +
                            '</div>',
                        confirmText: 'Promote',
                        cancelText: 'Cancel',
                        onConfirm: function() {
                            var newType = document.getElementById('promoteType').value;
                            var newWage = parseInt(document.getElementById('promoteWage').value);
                            if (!isNaN(newWage) && newWage > 0 && character) {
                                var promoted = _promoteServant(employerId, charId, newType, {
                                    newWage: newWage,
                                    notes: 'Promoted via UI',
                                    promotionYear: _getCurrentYear()
                                });
                                if (promoted) {
                                    _modifyHouseholdReputation(householdId, 3, 'Promoted ' + character.name + ' to ' + newType);
                                    _showToast(character.name + ' promoted to ' + newType + ' (wage: ' + newWage + ')', 'success');
                                    if (onRefresh) onRefresh();
                                } else {
                                    _showToast('Failed to promote servant', 'error');
                                }
                            }
                        }
                    });
                });
            }

            // Reference button
            var refBtn = newCard.querySelector('.reference-btn');
            if (refBtn && employerId) {
                refBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var charId = this.dataset.characterId;
                    _openServiceReferenceModal(employerId, charId);
                });
            }

            // Process inheritance button (for deceased members)
            var inheritanceBtn = newCard.querySelector('.process-inheritance-btn');
            if (inheritanceBtn) {
                inheritanceBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var charId = this.dataset.characterId;
                    var character = _getCharacterById(charId);
                    if (!character) return;

                    _confirmDialog('Process inheritance for ' + character.name + '?\n\nThis will transfer any households they headed to eligible heirs.', 'Process Inheritance', function() {
                        var results = _processHouseholdInheritanceOnDeath(charId, {
                            deathYear: character.deathYear || _getCurrentYear(),
                            includeExternal: true,
                            autoTransfer: true
                        });
                        if (results && results.length > 0) {
                            _showToast('Processed inheritance for ' + results.length + ' households', 'success');
                            if (onRefresh) onRefresh();
                        } else {
                            _showToast('No households affected by inheritance', 'info');
                        }
                    });
                });
            }

            // View character button (for former members)
            var viewBtn = newCard.querySelector('.view-character-btn');
            if (viewBtn) {
                viewBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var charId = this.dataset.characterId;
                    if (onSelectCharacter) {
                        onSelectCharacter(charId);
                    } else {
                        _openCharacterModal(charId);
                    }
                });
            }
        }
    }

    // =========================================================================
    // 12. EXPORTS
    // =========================================================================

    window.renderHouseholdMembersTab = renderHouseholdMembersTab;

})();