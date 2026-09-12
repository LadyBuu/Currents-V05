/**
 * =============================================================================
 * HOUSEHOLD MEMBERS TAB (household-members-tab.js)
 * =============================================================================
 * 
 * PURPOSE: Modular members tab for the Household Manager tool.
 *          Displays current and former members with full management
 *          capabilities: add, remove, transfer, change roles, edit dates.
 * 
 * DEPENDS ON:
 *   - HouseholdState (household-state.js)
 *   - HouseholdCommands (household-commands.js)
 *   - HouseholdQueries (household-queries.js)
 *   - HouseholdAssignment (household-assignment.js)
 *   - modals-core.js (for modal wrappers)
 *   - ui.js (for toast notifications)
 *   - icons.js (for icons)
 *   - modals-char-selector.js (for character selection)
 * 
 * ICON POLICY: Uses icons.js - NO emojis
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARD
    // =========================================================================

    var _rendering = false;
    var _processingMemberAction = false;

    // =========================================================================
    // 2. GET CURRENT HOUSEHOLD ID - FIXED
    // =========================================================================

    function _getCurrentHouseholdId() {
        if (window._currentHouseholdId) return window._currentHouseholdId;
        if (window.currentHouseholdId) return window.currentHouseholdId;
        if (window.selectedHouseholdId) return window.selectedHouseholdId;
        return null;
    }

    // =========================================================================
    // 3. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getState() {
        return typeof window.HouseholdState !== 'undefined' ? window.HouseholdState : null;
    }

    function _getCommands() {
        return typeof window.HouseholdCommands !== 'undefined' ? window.HouseholdCommands : null;
    }

    function _getQueries() {
        return typeof window.HouseholdQueries !== 'undefined' ? window.HouseholdQueries : null;
    }

    function _getAssignment() {
        return typeof window.HouseholdAssignment !== 'undefined' ? window.HouseholdAssignment : null;
    }

    function _getCharacterById(id) {
        if (typeof window.getCharacterById === 'function') {
            return window.getCharacterById(id);
        }
        return null;
    }

    function _getCharacters() {
        if (typeof window.getCharacters === 'function') {
            return window.getCharacters();
        }
        return [];
    }

    function _getPlaceById(id) {
        if (typeof window.getPlaceById === 'function') {
            return window.getPlaceById(id);
        }
        return null;
    }

    function _getCurrentYear() {
    // Delegates to time.js — do not add fallback logic here.
    return typeof window.getCurrentYearSafe === 'function'
        ? window.getCurrentYearSafe()
        : 1250;
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
        }
    }

    function _getIcon(name) {
        if (window.Icons && window.Icons[name]) {
            return window.Icons[name];
        }
        return '';
    }

    function _getIconSafe(name) {
        var icon = _getIcon(name);
        return icon || '';
    }

    function _openCharacterSelector(options) {
        if (typeof window.openCharacterSelector === 'function') {
            return window.openCharacterSelector(options);
        }
        if (typeof window._openCharacterSelector === 'function') {
            return window._openCharacterSelector(options);
        }
        _showToast('Character selector not available', 'error');
        return null;
    }

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

    function _confirmDialog(message, title, onConfirm) {
        if (typeof window.confirmDialog === 'function') {
            return window.confirmDialog(message, title, onConfirm);
        }
        if (typeof window._confirmDialog === 'function') {
            return window._confirmDialog(message, title, onConfirm);
        }
        if (confirm(message)) {
            onConfirm();
        }
    }

    // =========================================================================
    // 4. ICON HELPERS
    // =========================================================================

    function _iconSpan(icon, title) {
        if (!icon) return '';
        var titleAttr = title ? ' title="' + _escapeHtml(title) + '"' : '';
        return '<span style="display:inline-flex;align-items:center;vertical-align:middle;' + (title ? 'cursor:help;' : '') + '"' + titleAttr + '>' + icon + '</span>';
    }

    // =========================================================================
    // 5. DATA FETCHER
    // =========================================================================

    function _getMembersData(householdId) {
        var HS = _getState();
        var HQ = _getQueries();

        if (!HS) {
            return { error: 'Household system not available' };
        }

        var household = HS.getHousehold(householdId);
        if (!household) {
            return { error: 'Household not found' };
        }

        var members = HS.getHouseholdMembersWithCharacters(householdId);
        var status = HS.getHouseholdStatus(householdId);
        var head = HS.getHouseholdHead(householdId);
        var departments = household.departments || [];

        return {
            household: household,
            members: members,
            status: status,
            head: head,
            departments: departments,
            currentYear: _getCurrentYear()
        };
    }

    // =========================================================================
    // 6. RENDER FUNCTIONS
    // =========================================================================

    function _renderMemberRow(member, index, isCurrent, departments, householdId) {
        var char = member.character;
        var isHead = member.isHead || false;
        var isDeceased = char ? char.isDeceased : false;
        var age = '?';
        var genderSymbol = '⚥';

        if (char) {
            if (char.gender === 'male') genderSymbol = '♂';
            else if (char.gender === 'female') genderSymbol = '♀';

            if (char.birthYear) {
                if (isDeceased && char.deathYear) {
                    age = char.deathYear - char.birthYear;
                } else {
                    age = _getCurrentYear() - char.birthYear;
                }
            }
        }

        var personIcon = _getIconSafe('PERSON');
        var crownIcon = _getIconSafe('CROWN');
        var editIcon = _getIconSafe('EDIT');
        var trashIcon = _getIconSafe('X_HEAVY');
        var transferIcon = _getIconSafe('ARROW_DOUBLE_H');

        var nameDisplay = char ? (char.name + (char.surname ? ' ' + char.surname : '')) : 'Unknown';
        var roleDisplay = member.role || 'Member';
        var typeDisplay = member.type || 'family';
        var joinedYear = member.joinedYear || '?';
        var notes = member.notes || '';

        var departmentName = 'None';
        if (member.departmentId && departments) {
            for (var i = 0; i < departments.length; i++) {
                if (departments[i].id === member.departmentId) {
                    departmentName = departments[i].name;
                    break;
                }
            }
        }

        var statusText = isDeceased ? 'Deceased' : 'Living';
        var statusColor = isDeceased ? 'var(--dim)' : 'var(--success)';
        var rowClass = isDeceased ? 'opacity:0.6;' : '';

        var headBadge = isHead ?
            '<span style="background:var(--accent-dim);padding:1px 8px;border-radius:10px;font-size:0.45rem;color:var(--accent);">' + crownIcon + ' Head</span>' :
            '';

        var typeBadge = typeDisplay === 'family' ?
            '<span style="background:var(--bg2);padding:1px 6px;border-radius:10px;font-size:0.45rem;color:var(--dim);">Family</span>' :
            '<span style="background:var(--bg2);padding:1px 6px;border-radius:10px;font-size:0.45rem;color:var(--accent);">Staff</span>';

        var actionButtons = '';
        if (!isDeceased) {
            actionButtons = '' +
                '<button class="member-edit-btn" data-char-id="' + (char ? char.id : '') + '" data-member-index="' + index + '" style="padding:1px 6px;font-size:0.4rem;background:var(--accent-dim);border:1px solid var(--accent);border-radius:3px;cursor:pointer;" title="Edit member">' + editIcon + '</button>' +
                '<button class="member-transfer-btn" data-char-id="' + (char ? char.id : '') + '" style="padding:1px 6px;font-size:0.4rem;background:var(--bg3);border:1px solid var(--border);border-radius:3px;cursor:pointer;" title="Transfer to another household">' + transferIcon + '</button>' +
                '<button class="member-remove-btn" data-char-id="' + (char ? char.id : '') + '" style="padding:1px 6px;font-size:0.4rem;background:#8a3020;border:none;color:white;border-radius:3px;cursor:pointer;" title="Remove from household">' + trashIcon + '</button>';
        }

        return '' +
            '<div class="member-row" data-char-id="' + (char ? char.id : '') + '" style="' +
                'display:flex;justify-content:space-between;align-items:center;padding:6px 10px;' +
                'background:var(--bg3);border-radius:4px;margin-bottom:2px;' +
                'border-left:3px solid ' + (isHead ? 'var(--accent)' : (isDeceased ? 'var(--dim)' : 'var(--border)')) + ';' +
                rowClass +
            '">' +
                '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;flex:1;min-width:0;">' +
                    '<span style="font-size:0.7rem;">' + genderSymbol + '</span>' +
                    '<span style="font-size:0.7rem;font-weight:' + (isHead ? 'bold' : 'normal') + ';">' + _escapeHtml(nameDisplay) + '</span>' +
                    '<span style="font-size:0.5rem;color:var(--dim);">(' + age + 'y)</span>' +
                    '<span style="font-size:0.55rem;color:' + statusColor + ';">' + statusText + '</span>' +
                    headBadge +
                    typeBadge +
                    '<span style="font-size:0.5rem;color:var(--accent);">' + _escapeHtml(roleDisplay) + '</span>' +
                    (departmentName !== 'None' ? '<span style="font-size:0.45rem;color:var(--dim);">(' + _escapeHtml(departmentName) + ')</span>' : '') +
                    '<span style="font-size:0.45rem;color:var(--dim);">Joined: ' + joinedYear + '</span>' +
                    (notes ? '<span style="font-size:0.4rem;color:var(--dim);">' + _escapeHtml(notes) + '</span>' : '') +
                '</div>' +
                '<div style="display:flex;gap:4px;flex-shrink:0;">' +
                    actionButtons +
                '</div>' +
            '</div>';
    }

    function _renderCurrentMembers(data) {
        var members = data.members || [];
        var currentMembers = members.filter(function(m) {
            var char = m.character;
            return char && !char.isDeceased;
        });

        if (currentMembers.length === 0) {
            return '<div style="text-align:center;padding:20px;color:var(--dim);font-size:0.65rem;">No living members</div>';
        }

        currentMembers.sort(function(a, b) {
            if (a.isHead && !b.isHead) return -1;
            if (!a.isHead && b.isHead) return 1;
            return (a.characterName || '').localeCompare(b.characterName || '');
        });

        var html = '<div style="display:flex;flex-direction:column;gap:2px;">';
        for (var i = 0; i < currentMembers.length; i++) {
            html += _renderMemberRow(currentMembers[i], i, true, data.departments, data.household.id);
        }
        html += '</div>';

        return html;
    }

    function _renderFormerMembers(data) {
        var members = data.members || [];
        var formerMembers = members.filter(function(m) {
            var char = m.character;
            return char && char.isDeceased;
        });

        if (formerMembers.length === 0) {
            return '<div style="text-align:center;padding:10px;color:var(--dim);font-size:0.6rem;">No former members</div>';
        }

        formerMembers.sort(function(a, b) {
            var aDeath = a.character && a.character.deathYear ? a.character.deathYear : 0;
            var bDeath = b.character && b.character.deathYear ? b.character.deathYear : 0;
            return bDeath - aDeath;
        });

        var html = '<div style="display:flex;flex-direction:column;gap:2px;opacity:0.7;">';
        for (var i = 0; i < formerMembers.length; i++) {
            html += _renderMemberRow(formerMembers[i], i, false, data.departments, data.household.id);
        }
        html += '</div>';

        return html;
    }

    function _renderStats(data) {
        var members = data.members || [];
        var living = members.filter(function(m) {
            var char = m.character;
            return char && !char.isDeceased;
        });
        var deceased = members.filter(function(m) {
            var char = m.character;
            return char && char.isDeceased;
        });
        var family = members.filter(function(m) { return m.type === 'family'; });
        var staff = members.filter(function(m) { return m.type === 'staff'; });

        var personIcon = _getIconSafe('PERSON');

        return '' +
            '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr 1fr;gap:6px;margin-bottom:12px;">' +
                '<div style="background:var(--bg3);padding:6px;border-radius:4px;text-align:center;">' +
                    '<div style="font-size:0.5rem;color:var(--dim);">' + personIcon + ' Total</div>' +
                    '<div style="font-size:0.85rem;font-weight:bold;">' + members.length + '</div>' +
                '</div>' +
                '<div style="background:var(--bg3);padding:6px;border-radius:4px;text-align:center;">' +
                    '<div style="font-size:0.5rem;color:var(--dim);">Living</div>' +
                    '<div style="font-size:0.85rem;font-weight:bold;color:var(--success);">' + living.length + '</div>' +
                '</div>' +
                '<div style="background:var(--bg3);padding:6px;border-radius:4px;text-align:center;">' +
                    '<div style="font-size:0.5rem;color:var(--dim);">Deceased</div>' +
                    '<div style="font-size:0.85rem;font-weight:bold;color:var(--dim);">' + deceased.length + '</div>' +
                '</div>' +
                '<div style="background:var(--bg3);padding:6px;border-radius:4px;text-align:center;">' +
                    '<div style="font-size:0.5rem;color:var(--dim);">Family</div>' +
                    '<div style="font-size:0.85rem;font-weight:bold;">' + family.length + '</div>' +
                '</div>' +
                '<div style="background:var(--bg3);padding:6px;border-radius:4px;text-align:center;">' +
                    '<div style="font-size:0.5rem;color:var(--dim);">Staff</div>' +
                    '<div style="font-size:0.85rem;font-weight:bold;">' + staff.length + '</div>' +
                '</div>' +
            '</div>';
    }

    // =========================================================================
    // 7. MAIN RENDER FUNCTION - FIXED to use window._currentHouseholdId
    // =========================================================================

    function renderHouseholdMembersTab(containerId, householdId) {
        if (_rendering) {
            return;
        }
        _rendering = true;

        try {
            var container = document.getElementById(containerId);
            if (!container) {
                console.warn('[MembersTab] Container not found: ' + containerId);
                return;
            }

            // If no householdId provided, try to get it from the global variable
            if (!householdId) {
                householdId = _getCurrentHouseholdId();
            }

            if (!householdId) {
                container.innerHTML = '<div class="placeholder">No household selected</div>';
                return;
            }

            console.log('[MembersTab] Rendering for household:', householdId);

            var data = _getMembersData(householdId);

            if (data.error) {
                container.innerHTML = '<div class="placeholder" style="color:var(--danger);">' + _escapeHtml(data.error) + '</div>';
                return;
            }

            var personIcon = _getIconSafe('PERSON');
            var plusIcon = _getIconSafe('PLUS');
            var head = data.head;
            var headName = head ? (head.name + (head.surname ? ' ' + head.surname : '')) : 'None';

            var html = '' +
                '<div style="max-width:750px;margin:0 auto;">' +
                    '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:16px;margin-bottom:12px;">' +
                        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:8px;">' +
                            '<div>' +
                                '<h3 style="font-size:0.7rem;color:var(--accent);margin:0;">' + personIcon + ' Members</h3>' +
                                '<div style="font-size:0.55rem;color:var(--dim);margin-top:2px;">Head: ' + _escapeHtml(headName) + '</div>' +
                            '</div>' +
                            '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
                                '<button id="membersAddBtn" class="btn" style="padding:3px 10px;font-size:0.55rem;background:var(--accent-dim);border:1px solid var(--accent);border-radius:4px;cursor:pointer;">' + plusIcon + ' Add Member</button>' +
                                '<button id="membersTransferInBtn" class="btn" style="padding:3px 10px;font-size:0.55rem;background:var(--bg3);border:1px solid var(--border);border-radius:4px;cursor:pointer;">Transfer In</button>' +
                            '</div>' +
                        '</div>' +

                        _renderStats(data) +

                        '<div style="margin-bottom:12px;">' +
                            '<div style="font-size:0.6rem;color:var(--accent);margin-bottom:4px;">Current Members</div>' +
                            _renderCurrentMembers(data) +
                        '</div>' +

                        '<div>' +
                            '<div style="font-size:0.6rem;color:var(--dim);margin-bottom:4px;">Former Members (Deceased)</div>' +
                            _renderFormerMembers(data) +
                        '</div>' +
                    '</div>' +
                    '<div style="font-size:0.5rem;color:var(--dim);text-align:center;">' +
                        data.members.length + ' total members · ' +
                        data.members.filter(function(m) { var c = m.character; return c && !c.isDeceased; }).length + ' living' +
                    '</div>' +
                '</div>';

            container.innerHTML = html;

            // Attach event handlers
            _attachEventHandlers(container, householdId);

        } catch (e) {
            console.error('[MembersTab] Error:', e);
            var container = document.getElementById(containerId);
            if (container) {
                container.innerHTML = '<div class="placeholder" style="color:var(--danger);">Error loading members</div>';
            }
        } finally {
            _rendering = false;
        }
    }

    // =========================================================================
    // 8. EVENT HANDLERS
    // =========================================================================

    function _attachEventHandlers(container, householdId) {
        var HS = _getState();
        var HC = _getCommands();
        var HA = _getAssignment();

        if (!HS || !HC) return;

        var addBtn = container.querySelector('#membersAddBtn');
        if (addBtn) {
            addBtn.onclick = function() {
                _openAddMemberModal(householdId);
            };
        }

        var transferInBtn = container.querySelector('#membersTransferInBtn');
        if (transferInBtn) {
            transferInBtn.onclick = function() {
                _openTransferInModal(householdId);
            };
        }

        var editBtns = container.querySelectorAll('.member-edit-btn');
        editBtns.forEach(function(btn) {
            btn.onclick = function(e) {
                e.stopPropagation();
                var charId = this.dataset.charId;
                if (charId) {
                    _openEditMemberModal(householdId, charId);
                }
            };
        });

        var transferBtns = container.querySelectorAll('.member-transfer-btn');
        transferBtns.forEach(function(btn) {
            btn.onclick = function(e) {
                e.stopPropagation();
                var charId = this.dataset.charId;
                if (charId) {
                    _openTransferMemberModal(householdId, charId);
                }
            };
        });

        var removeBtns = container.querySelectorAll('.member-remove-btn');
        removeBtns.forEach(function(btn) {
            btn.onclick = function(e) {
                e.stopPropagation();
                var charId = this.dataset.charId;
                if (charId) {
                    _confirmRemoveMember(householdId, charId);
                }
            };
        });
    }

    // =========================================================================
    // 9. ADD MEMBER MODAL
    // =========================================================================

    function _openAddMemberModal(householdId) {
        var HS = _getState();
        var household = HS ? HS.getHousehold(householdId) : null;
        if (!household) {
            _showToast('Household not found', 'error');
            return;
        }

        _openCharacterSelector({
            title: 'Add Member to ' + household.name,
            filters: { showDeceased: false },
            onSelect: function(character) {
                if (character) {
                    _doAddMember(householdId, character.id);
                }
            }
        });
    }

    function _doAddMember(householdId, characterId) {
        if (_processingMemberAction) return;
        _processingMemberAction = true;

        try {
            var HC = _getCommands();
            if (!HC) {
                _showToast('Household commands not available', 'error');
                return;
            }

            var currentYear = _getCurrentYear();

            var content = '' +
                '<div style="margin-bottom:12px;">' +
                    '<div class="form-group" style="margin-bottom:12px;">' +
                        '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Member Type</label>' +
                        '<select id="addMemberType" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                            '<option value="family">Family</option>' +
                            '<option value="staff">Staff</option>' +
                        '</select>' +
                    '</div>' +
                    '<div class="form-group" style="margin-bottom:12px;">' +
                        '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Role</label>' +
                        '<input type="text" id="addMemberRole" placeholder="e.g., Family Member, Butler..." value="Family Member" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                    '</div>' +
                    '<div class="form-group" style="margin-bottom:12px;">' +
                        '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Joined Year</label>' +
                        '<input type="number" id="addMemberYear" value="' + currentYear + '" min="1" max="' + (currentYear + 5) + '" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                    '</div>' +
                    '<div class="form-group" style="margin-bottom:12px;">' +
                        '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Make Head</label>' +
                        '<select id="addMemberHead" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                            '<option value="false">No</option>' +
                            '<option value="true">Yes</option>' +
                        '</select>' +
                    '</div>' +
                    '<div class="form-group" style="margin-bottom:12px;">' +
                        '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Notes</label>' +
                        '<textarea id="addMemberNotes" rows="2" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;" placeholder="Additional notes..."></textarea>' +
                    '</div>' +
                '</div>';

            _openModal({
                title: 'Add Member to Household',
                content: content,
                confirmText: 'Add Member',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var type = document.getElementById('addMemberType').value;
                    var role = document.getElementById('addMemberRole').value.trim() || (type === 'family' ? 'Family Member' : 'Staff');
                    var year = parseInt(document.getElementById('addMemberYear').value) || currentYear;
                    var isHead = document.getElementById('addMemberHead').value === 'true';
                    var notes = document.getElementById('addMemberNotes').value.trim();

                    if (isNaN(year) || year < 1) {
                        _showToast('Please enter a valid year', 'error');
                        return false;
                    }

                    var result = HC.addMember(householdId, characterId, type, {
                        role: role,
                        joinedYear: year,
                        isHead: isHead,
                        notes: notes || null
                    });

                    if (result && result.success) {
                        var char = _getCharacterById(characterId);
                        _showToast((char ? char.name : 'Member') + ' added to household', 'success');
                        _closeTopModal();
                        renderHouseholdMembersTab('tab-members', householdId);
                        if (typeof window.renderHouseholdList === 'function') {
                            window.renderHouseholdList();
                        }
                        return true;
                    } else {
                        _showToast(result ? result.reason : 'Failed to add member', 'error');
                        return false;
                    }
                }
            });

        } finally {
            _processingMemberAction = false;
        }
    }

    // =========================================================================
    // 10. EDIT MEMBER MODAL
    // =========================================================================

    function _openEditMemberModal(householdId, characterId) {
        if (_processingMemberAction) return;
        _processingMemberAction = true;

        try {
            var HS = _getState();
            var HC = _getCommands();
            if (!HS || !HC) {
                _showToast('Household system not available', 'error');
                return;
            }

            var household = HS.getHousehold(householdId);
            if (!household) {
                _showToast('Household not found', 'error');
                return;
            }

            var member = null;
            var memberIndex = -1;
            for (var i = 0; i < household.members.length; i++) {
                if (household.members[i].characterId === characterId) {
                    member = household.members[i];
                    memberIndex = i;
                    break;
                }
            }

            if (!member) {
                _showToast('Member not found', 'error');
                return;
            }

            var char = _getCharacterById(characterId);
            var charName = char ? (char.name + (char.surname ? ' ' + char.surname : '')) : 'Unknown';
            var departments = household.departments || [];

            var deptOptions = '<option value="">None</option>';
            for (var i = 0; i < departments.length; i++) {
                var selected = (member.departmentId === departments[i].id) ? 'selected' : '';
                deptOptions += '<option value="' + departments[i].id + '" ' + selected + '>' + _escapeHtml(departments[i].name) + '</option>';
            }

            var content = '' +
                '<div style="margin-bottom:12px;">' +
                    '<div style="background:var(--bg3);padding:8px;border-radius:6px;margin-bottom:12px;font-size:0.6rem;">' +
                        'Editing: <strong>' + _escapeHtml(charName) + '</strong>' +
                        (member.isHead ? ' · <span style="color:var(--accent);">Head</span>' : '') +
                    '</div>' +
                    '<div class="form-group" style="margin-bottom:12px;">' +
                        '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Member Type</label>' +
                        '<select id="editMemberType" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                            '<option value="family" ' + (member.type === 'family' ? 'selected' : '') + '>Family</option>' +
                            '<option value="staff" ' + (member.type === 'staff' ? 'selected' : '') + '>Staff</option>' +
                        '</select>' +
                    '</div>' +
                    '<div class="form-group" style="margin-bottom:12px;">' +
                        '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Role</label>' +
                        '<input type="text" id="editMemberRole" value="' + _escapeHtml(member.role || '') + '" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                    '</div>' +
                    '<div class="form-group" style="margin-bottom:12px;">' +
                        '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Department</label>' +
                        '<select id="editMemberDepartment" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                            deptOptions +
                        '</select>' +
                    '</div>' +
                    '<div class="form-group" style="margin-bottom:12px;">' +
                        '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Joined Year</label>' +
                        '<input type="number" id="editMemberYear" value="' + (member.joinedYear || _getCurrentYear()) + '" min="1" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                    '</div>' +
                    '<div class="form-group" style="margin-bottom:12px;">' +
                        '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Make Head</label>' +
                        '<select id="editMemberHead" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                            '<option value="false" ' + (member.isHead ? '' : 'selected') + '>No</option>' +
                            '<option value="true" ' + (member.isHead ? 'selected' : '') + '>Yes</option>' +
                        '</select>' +
                    '</div>' +
                    '<div class="form-group" style="margin-bottom:12px;">' +
                        '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Notes</label>' +
                        '<textarea id="editMemberNotes" rows="2" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' + _escapeHtml(member.notes || '') + '</textarea>' +
                    '</div>' +
                '</div>';

            _openModal({
                title: 'Edit Member: ' + charName,
                content: content,
                confirmText: 'Save Changes',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var type = document.getElementById('editMemberType').value;
                    var role = document.getElementById('editMemberRole').value.trim() || (type === 'family' ? 'Family Member' : 'Staff');
                    var departmentId = document.getElementById('editMemberDepartment').value || null;
                    var year = parseInt(document.getElementById('editMemberYear').value);
                    var isHead = document.getElementById('editMemberHead').value === 'true';
                    var notes = document.getElementById('editMemberNotes').value.trim();

                    if (isNaN(year) || year < 1) {
                        _showToast('Please enter a valid year', 'error');
                        return false;
                    }

                    var updates = {
                        type: type,
                        role: role,
                        departmentId: departmentId,
                        joinedYear: year,
                        isHead: isHead,
                        notes: notes || null
                    };

                    var result = HC.updateMember(householdId, characterId, updates);

                    if (result && result.success) {
                        _showToast('Member updated', 'success');
                        _closeTopModal();
                        renderHouseholdMembersTab('tab-members', householdId);
                        if (typeof window.renderHouseholdList === 'function') {
                            window.renderHouseholdList();
                        }
                        return true;
                    } else {
                        _showToast(result ? result.reason : 'Failed to update member', 'error');
                        return false;
                    }
                }
            });

        } finally {
            _processingMemberAction = false;
        }
    }

    // =========================================================================
    // 11. TRANSFER MEMBER MODAL
    // =========================================================================

    function _openTransferMemberModal(householdId, characterId) {
        if (_processingMemberAction) return;
        _processingMemberAction = true;

        try {
            var HS = _getState();
            var HC = _getCommands();
            var HA = _getAssignment();
            if (!HS || !HC) {
                _showToast('Household system not available', 'error');
                return;
            }

            var char = _getCharacterById(characterId);
            if (!char) {
                _showToast('Character not found', 'error');
                return;
            }

            var currentYear = _getCurrentYear();
            var charName = char.name + (char.surname ? ' ' + char.surname : '');

            var allHouseholds = HS.getAllHouseholds();
            var targetOptions = allHouseholds
                .filter(function(h) { return h.id !== householdId && h.status !== 'deprecated'; })
                .map(function(h) {
                    return '<option value="' + h.id + '">' + _escapeHtml(h.name) + '</option>';
                }).join('');

            if (!targetOptions) {
                _showToast('No other households available for transfer', 'warning');
                return;
            }

            var content = '' +
                '<div style="margin-bottom:12px;">' +
                    '<div style="background:var(--bg3);padding:8px;border-radius:6px;margin-bottom:12px;font-size:0.6rem;">' +
                        'Transferring: <strong>' + _escapeHtml(charName) + '</strong>' +
                    '</div>' +
                    '<div class="form-group" style="margin-bottom:12px;">' +
                        '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Target Household</label>' +
                        '<select id="transferTargetHousehold" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                            '<option value="">Select a household</option>' +
                            targetOptions +
                        '</select>' +
                    '</div>' +
                    '<div class="form-group" style="margin-bottom:12px;">' +
                        '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Transfer Year</label>' +
                        '<input type="number" id="transferYear" value="' + currentYear + '" min="1" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                    '</div>' +
                    '<div class="form-group" style="margin-bottom:12px;">' +
                        '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Reason</label>' +
                        '<input type="text" id="transferReason" placeholder="e.g., Marriage, Employment..." style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                    '</div>' +
                '</div>';

            _openModal({
                title: 'Transfer Member: ' + charName,
                content: content,
                confirmText: 'Transfer',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var targetId = document.getElementById('transferTargetHousehold').value;
                    var year = parseInt(document.getElementById('transferYear').value) || currentYear;
                    var reason = document.getElementById('transferReason').value.trim() || 'Transferred';

                    if (!targetId) {
                        _showToast('Please select a target household', 'error');
                        return false;
                    }

                    var result = HC.transferMember(characterId, targetId, {
                        year: year,
                        reason: reason
                    });

                    if (result && result.success) {
                        _showToast(charName + ' transferred to ' + result.toHousehold.name, 'success');
                        _closeTopModal();
                        renderHouseholdMembersTab('tab-members', householdId);
                        if (typeof window.renderHouseholdList === 'function') {
                            window.renderHouseholdList();
                        }
                        return true;
                    } else {
                        _showToast(result ? result.reason : 'Failed to transfer member', 'error');
                        return false;
                    }
                }
            });

        } finally {
            _processingMemberAction = false;
        }
    }

    // =========================================================================
    // 12. TRANSFER IN MODAL
    // =========================================================================

    function _openTransferInModal(householdId) {
        if (_processingMemberAction) return;
        _processingMemberAction = true;

        try {
            var HS = _getState();
            var HC = _getCommands();
            if (!HS || !HC) {
                _showToast('Household system not available', 'error');
                return;
            }

            var household = HS.getHousehold(householdId);
            if (!household) {
                _showToast('Household not found', 'error');
                return;
            }

            _openCharacterSelector({
                title: 'Transfer Character to ' + household.name,
                filters: { showDeceased: false },
                onSelect: function(character) {
                    if (character) {
                        var currentHH = HS.getCharacterHousehold(character.id);
                        if (currentHH && currentHH.id === householdId) {
                            _showToast('Character is already in this household', 'warning');
                            return;
                        }

                        var currentYear = _getCurrentYear();
                        var content = '' +
                            '<div style="margin-bottom:12px;">' +
                                '<div style="background:var(--bg3);padding:8px;border-radius:6px;margin-bottom:12px;font-size:0.6rem;">' +
                                    'Transferring: <strong>' + _escapeHtml(character.name + (character.surname ? ' ' + character.surname : '')) + '</strong>' +
                                    (currentHH ? ' from <strong>' + _escapeHtml(currentHH.name) + '</strong>' : '') +
                                '</div>' +
                                '<div class="form-group" style="margin-bottom:12px;">' +
                                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Member Type</label>' +
                                    '<select id="transferInType" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                                        '<option value="family">Family</option>' +
                                        '<option value="staff">Staff</option>' +
                                    '</select>' +
                                '</div>' +
                                '<div class="form-group" style="margin-bottom:12px;">' +
                                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Role</label>' +
                                    '<input type="text" id="transferInRole" placeholder="e.g., Family Member, Butler..." value="Family Member" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                                '</div>' +
                                '<div class="form-group" style="margin-bottom:12px;">' +
                                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Transfer Year</label>' +
                                    '<input type="number" id="transferInYear" value="' + currentYear + '" min="1" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                                '</div>' +
                                '<div class="form-group" style="margin-bottom:12px;">' +
                                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Reason</label>' +
                                    '<input type="text" id="transferInReason" placeholder="e.g., Marriage, Employment..." style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                                '</div>' +
                            '</div>';

                        _openModal({
                            title: 'Transfer Character to ' + household.name,
                            content: content,
                            confirmText: 'Transfer',
                            cancelText: 'Cancel',
                            onConfirm: function() {
                                var type = document.getElementById('transferInType').value;
                                var role = document.getElementById('transferInRole').value.trim() || (type === 'family' ? 'Family Member' : 'Staff');
                                var year = parseInt(document.getElementById('transferInYear').value) || currentYear;
                                var reason = document.getElementById('transferInReason').value.trim() || 'Transferred';

                                var result = HC.transferMember(character.id, householdId, {
                                    year: year,
                                    reason: reason,
                                    role: role,
                                    type: type
                                });

                                if (result && result.success) {
                                    _showToast(character.name + ' transferred to ' + household.name, 'success');
                                    _closeTopModal();
                                    renderHouseholdMembersTab('tab-members', householdId);
                                    if (typeof window.renderHouseholdList === 'function') {
                                        window.renderHouseholdList();
                                    }
                                    return true;
                                } else {
                                    _showToast(result ? result.reason : 'Failed to transfer member', 'error');
                                    return false;
                                }
                            }
                        });
                    }
                }
            });

        } finally {
            _processingMemberAction = false;
        }
    }

    // =========================================================================
    // 13. REMOVE MEMBER
    // =========================================================================

    function _confirmRemoveMember(householdId, characterId) {
        var char = _getCharacterById(characterId);
        var charName = char ? (char.name + (char.surname ? ' ' + char.surname : '')) : 'Unknown';

        _confirmDialog('Remove ' + charName + ' from the household?', 'Remove Member', function() {
            _doRemoveMember(householdId, characterId);
        });
    }

    function _doRemoveMember(householdId, characterId) {
        if (_processingMemberAction) return;
        _processingMemberAction = true;

        try {
            var HC = _getCommands();
            if (!HC) {
                _showToast('Household commands not available', 'error');
                return;
            }

            var currentYear = _getCurrentYear();
            var char = _getCharacterById(characterId);
            var charName = char ? (char.name + (char.surname ? ' ' + char.surname : '')) : 'Unknown';

            var result = HC.removeMember(householdId, characterId, {
                reason: 'Removed',
                leftYear: currentYear
            });

            if (result && result.success) {
                _showToast(charName + ' removed from household', 'info');
                renderHouseholdMembersTab('tab-members', householdId);
                if (typeof window.renderHouseholdList === 'function') {
                    window.renderHouseholdList();
                }
                if (typeof window.showHouseholdDetails === 'function') {
                    window.showHouseholdDetails(householdId);
                }
            } else {
                _showToast(result ? result.reason : 'Failed to remove member', 'error');
            }

        } finally {
            _processingMemberAction = false;
        }
    }

    // =========================================================================
    // 14. REFRESH FUNCTION
    // =========================================================================

    function refreshHouseholdMembersTab(householdId) {
        var containerId = 'tab-members';
        var container = document.getElementById(containerId);
        if (!container) {
            var containers = document.querySelectorAll('.tab-pane[id*="members"]');
            for (var i = 0; i < containers.length; i++) {
                if (containers[i].id) {
                    containerId = containers[i].id;
                    container = containers[i];
                    break;
                }
            }
        }

        if (!container) {
            console.warn('[MembersTab] Container not found');
            return;
        }

        renderHouseholdMembersTab(containerId, householdId);
    }

    // =========================================================================
    // 15. TAB SYSTEM REGISTRATION
    // =========================================================================

    function registerMembersTabRenderer() {
        if (typeof window.registerTabRenderer === 'function') {
            window.registerTabRenderer('members', function(containerId, locationId, summary) {
                var householdId = _getCurrentHouseholdId();
                if (!householdId) {
                    var container = document.getElementById(containerId);
                    if (container) {
                        container.innerHTML = '<div class="placeholder">No household selected</div>';
                    }
                    return;
                }
                renderHouseholdMembersTab(containerId, householdId);
            }, true);
            console.log('[HouseholdMembersTab] Registered with tab system');
        }
    }

    // =========================================================================
    // 16. EXPORTS
    // =========================================================================

    window.renderHouseholdMembersTab = renderHouseholdMembersTab;
    window.refreshHouseholdMembersTab = refreshHouseholdMembersTab;
    window.registerMembersTabRenderer = registerMembersTabRenderer;

    // Auto-register if tab system is available
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(registerMembersTabRenderer, 100);
        });
    } else {
        setTimeout(registerMembersTabRenderer, 100);
    }

})();