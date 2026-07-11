
/**
 * =============================================================================
 * STILL WATERS - HOUSEHOLD DEPARTMENTS TAB UI
 * =============================================================================
 * 
 * UPDATED: Uses new HouseholdState/HouseholdCommands/HouseholdQueries system
 * 
 * DEPENDENCIES:
 *   - household-state.js (HouseholdState)
 *   - household-commands.js (HouseholdCommands)
 *   - household-queries.js (HouseholdQueries)
 *   - modals-core.js (_escapeHtml, _showToast, _getIcon)
 *   - modals-char-select.js (openCharacterSelector)
 *   - modals-assign-staff.js (openAssignStaffModal)
 *   - household-servant.js (HouseholdServant)
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

    function _promptDialog(message, defaultValue, onConfirm, onCancel) {
        if (typeof window.promptDialog === 'function') {
            return window.promptDialog(message, defaultValue, onConfirm, onCancel);
        }
        if (typeof window._promptDialog === 'function') {
            return window._promptDialog(message, defaultValue, onConfirm, onCancel);
        }
        var result = prompt(message, defaultValue);
        if (result !== null && result.trim()) {
            if (onConfirm) onConfirm(result.trim());
        } else {
            if (onCancel) onCancel();
        }
    }

    // =========================================================================
    // 2. STATE, COMMANDS, AND QUERIES REFERENCE
    // =========================================================================

    var _state = window.HouseholdState;
    var _commands = window.HouseholdCommands;
    var _queries = window.HouseholdQueries;
    var _servant = window.HouseholdServant;

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
    // 4. BUSINESS LOGIC WRAPPERS (Using new system)
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

    function _getActiveRankDisplay(character) {
        if (typeof window.getActiveRankDisplay === 'function') {
            return window.getActiveRankDisplay(character);
        }
        return null;
    }

    function _getHouseholdHeadCharacter(householdId) {
        return _state ? _state.getHouseholdHead(householdId) : null;
    }

    function _getDepartments(householdId) {
        var household = _getHousehold(householdId);
        return household ? (household.departments || []) : [];
    }

    function _getHouseholdMembers(householdId) {
        var household = _getHousehold(householdId);
        return household ? (household.members || []) : [];
    }

    function _getCharacterDepartmentHead(householdId, characterId) {
        if (typeof window.getCharacterDepartmentHead === 'function') {
            return window.getCharacterDepartmentHead(householdId, characterId);
        }
        var household = _getHousehold(householdId);
        if (!household || !household.departments) return null;
        for (var i = 0; i < household.departments.length; i++) {
            if (household.departments[i].headId === characterId) {
                return household.departments[i];
            }
        }
        return null;
    }

    function _modifyHouseholdReputation(householdId, delta, reason) {
        if (typeof window.modifyHouseholdReputation === 'function') {
            return window.modifyHouseholdReputation(householdId, delta, reason);
        }
        // Use state update if available
        var household = _getHousehold(householdId);
        if (household && _state && typeof _state.updateHousehold === 'function') {
            var newRep = Math.max(0, Math.min(100, (household.reputation || 50) + delta));
            _state.updateHousehold(householdId, { reputation: newRep }, { recordHistory: false });
            return newRep;
        }
        return null;
    }

    function _modifyHouseholdWealth(householdId, amount, reason) {
        if (typeof window.modifyHouseholdWealth === 'function') {
            return window.modifyHouseholdWealth(householdId, amount, reason);
        }
        // Use state update if available
        var household = _getHousehold(householdId);
        if (household && _state && typeof _state.updateHousehold === 'function') {
            var newWealth = Math.max(0, (household.wealth || 0) + amount);
            _state.updateHousehold(householdId, { wealth: newWealth }, { recordHistory: false });
            return newWealth;
        }
        return null;
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

    function _promoteServant(employerId, servantId, newServiceTypeId, options) {
        return _servant ? _servant.promoteServant(employerId, servantId, newServiceTypeId, options) : null;
    }

    function _adjustServantWages(employerId, servantId, newWage, reason) {
        return _servant ? _servant.adjustServantWages(employerId, servantId, newWage, reason) : null;
    }

    function _createServiceRelationship(employerId, servantId, options) {
        return _servant ? _servant.createServiceRelationship(employerId, servantId, options) : null;
    }

    function _terminateService(employerId, servantId, options) {
        return _servant ? _servant.terminateService(employerId, servantId, options) : false;
    }

    function _getServants(employerId) {
        return _servant ? _servant.getServants(employerId) : [];
    }

    // =========================================================================
    // 6. STAFF ASSIGNMENT MODAL WRAPPER
    // =========================================================================

    function _openAssignStaffModal(householdId, departmentId, onSuccess) {
        if (typeof window.openAssignStaffModal === 'function') {
            return window.openAssignStaffModal(householdId, departmentId, onSuccess);
        }
        if (typeof window._openAssignStaffModal === 'function') {
            return window._openAssignStaffModal(householdId, departmentId, onSuccess);
        }
        _showToast('Assign staff modal not available', 'error');
        return null;
    }

    // =========================================================================
    // 7. HELPER FUNCTIONS
    // =========================================================================

    function getDepartmentStats(householdId) {
        var household = _getHousehold(householdId);
        if (!household) return { total: 0, withHeads: 0, totalMembers: 0, avgSize: 0 };

        var departments = household.departments || [];
        var total = departments.length;
        var withHeads = departments.filter(function(d) { return d.headId; }).length;

        var totalMembers = 0;
        for (var i = 0; i < departments.length; i++) {
            var members = (household.members || []).filter(function(m) { return m.departmentId === departments[i].id; });
            totalMembers += members.length;
        }

        return {
            total: total,
            withHeads: withHeads,
            totalMembers: totalMembers,
            avgSize: total > 0 ? Math.round(totalMembers / total) : 0
        };
    }

    function _handleDepartmentHeadPromotion(householdId, employerId, servantId, servantName, departmentName, currentWage) {
        var newWage = (currentWage || 5) + 5;

        var promoted = _promoteServant(employerId, servantId, 'steward', {
            newWage: newWage,
            notes: 'Promoted to head of ' + departmentName + ' department',
            promotionYear: _getCurrentYear()
        });

        if (promoted) {
            _showToast('⭐ ' + servantName + ' promoted to head of ' + departmentName + ' (wage: ' + newWage + ')', 'success');
            _modifyHouseholdReputation(householdId, 3, 'Promoted ' + servantName + ' to department head');
            _modifyHouseholdWealth(householdId, -5, 'Wage increase for department head ' + servantName);
            return true;
        }
        return false;
    }

    function _handleDepartmentHeadDemotion(householdId, employerId, servantId, servantName, departmentName, currentWage) {
        var newWage = Math.max(3, (currentWage || 10) - 3);

        var adjusted = _adjustServantWages(employerId, servantId, newWage, 'Demoted from head of ' + departmentName + ' department');

        if (adjusted) {
            _showToast('⌂ ' + servantName + ' demoted from ' + departmentName + ' (wage: ' + newWage + ')', 'info');
            _modifyHouseholdReputation(householdId, -1, 'Demoted ' + servantName + ' from department head');
            _modifyHouseholdWealth(householdId, 3, 'Wage decrease for demoted ' + servantName);
            return true;
        }
        return false;
    }

    // =========================================================================
    // 8. UI RENDERING
    // =========================================================================

    function renderHouseholdDepartmentsTab(containerId, householdId, onRefresh) {
        if (_rendering) return;
        _rendering = true;

        try {
            var container = document.getElementById(containerId);
            if (!container) return;

            var household = _getHousehold(householdId);
            if (!household) {
                container.innerHTML = '<div class="empty-state">⌂ Household not found</div>';
                return;
            }

            var departments = household.departments || [];
            var members = household.members || [];
            var householdHead = _getHouseholdHeadCharacter(householdId);
            var employerId = householdHead ? householdHead.id : null;
            var stats = getDepartmentStats(householdId);

            var html = '';
            html += '<div class="household-departments-tab" style="padding: 16px;">';
            html += '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">';
            html += '<div>';
            html += '<h3 style="margin: 0; font-size: 0.9rem;">⌂ Department Management</h3>';
            html += '<div style="font-size: 0.6rem; color: var(--dim); margin-top: 4px;">';
            html += stats.total + ' departments · ' + stats.withHeads + ' with heads · ' + stats.totalMembers + ' members assigned';
            html += '</div></div>';
            html += '<button id="addDeptBtn" class="btn primary" style="background: var(--accent); border: none; color: white; padding: 6px 12px; border-radius: 6px; cursor: pointer;">✓ Add Department</button>';
            html += '</div>';

            if (departments.length === 0) {
                html += '<div class="empty-state" style="text-align: center; padding: 60px 20px; color: var(--dim); background: var(--bg2); border-radius: 12px;">';
                html += '<div style="font-size: 2rem; margin-bottom: 12px;">⌂</div>';
                html += '<div>No departments yet</div>';
                html += '<div style="font-size: 0.65rem; margin-top: 8px;">Click "Add Department" to create one</div>';
                html += '</div>';
            } else {
                for (var i = 0; i < departments.length; i++) {
                    var dept = departments[i];
                    var deptMembers = members.filter(function(m) { return m.departmentId === dept.id; });
                    var head = deptMembers.find(function(m) { return m.isHead; });
                    var headChar = head ? _getCharacterById(head.characterId) : null;
                    var uniqueId = 'dept-' + dept.id + '-' + i;
                    var isEven = i % 2 === 0;

                    var serviceQuality = null;
                    var currentWage = null;
                    if (householdHead && headChar && householdHead.id !== headChar.id) {
                        var serviceRel = _getServiceBetween(householdHead.id, headChar.id);
                        if (serviceRel) {
                            var quality = _getServiceQuality(serviceRel.id);
                            if (quality) serviceQuality = quality.name || quality.id;
                            currentWage = serviceRel.metadata ? serviceRel.metadata.wage : null;
                        }
                    }

                    var deptIcon = '⌂';
                    var deptNameLower = dept.name.toLowerCase();
                    if (deptNameLower.indexOf('guard') !== -1 || deptNameLower.indexOf('militia') !== -1 || deptNameLower.indexOf('watch') !== -1) {
                        deptIcon = '⚔';
                    } else if (deptNameLower.indexOf('kitchen') !== -1 || deptNameLower.indexOf('cook') !== -1) {
                        deptIcon = '⌂';
                    } else if (deptNameLower.indexOf('stable') !== -1) {
                        deptIcon = '⌂';
                    } else if (deptNameLower.indexOf('account') !== -1 || deptNameLower.indexOf('treasury') !== -1) {
                        deptIcon = '⭐';
                    }

                    html += '<div class="department-card" data-dept-id="' + dept.id + '" style="';
                    html += 'background: var(--bg2);';
                    html += 'border-radius: 8px;';
                    html += 'margin-bottom: 12px;';
                    html += 'border: 1px solid var(--border);';
                    html += 'overflow: hidden;';
                    html += '">';
                    html += '<div id="dept-header-' + uniqueId + '" class="dept-header" style="';
                    html += 'padding: 12px 16px;';
                    html += 'display: flex;';
                    html += 'justify-content: space-between;';
                    html += 'align-items: center;';
                    html += 'background: ' + (isEven ? 'var(--bg3)' : 'var(--bg2)') + ';';
                    html += 'cursor: pointer;';
                    html += 'transition: background 0.2s;';
                    html += '">';
                    html += '<div>';
                    html += '<strong>' + deptIcon + ' ' + _escapeHtml(dept.name) + '</strong>';
                    html += '<span style="color: var(--dim); margin-left: 8px; font-size: 0.7rem;">(' + deptMembers.length + ' members)</span>';
                    if (headChar) {
                        html += '<span style="background: var(--accent-dim); padding: 2px 6px; border-radius: 4px; margin-left: 8px; font-size: 0.55rem;">♡ Head: ' + _escapeHtml(headChar.name) + '</span>';
                    }
                    if (serviceQuality) {
                        html += '<span style="color: var(--dim); margin-left: 8px; font-size: 0.55rem;" title="Service Quality">⌆ ' + _escapeHtml(serviceQuality) + '</span>';
                    }
                    if (currentWage) {
                        html += '<span style="color: var(--accent); margin-left: 8px; font-size: 0.55rem;">♡ ' + currentWage + '/yr</span>';
                    }
                    html += '</div>';
                    html += '<span class="dept-toggle" style="color: var(--accent); font-size: 0.8rem;">▼</span>';
                    html += '</div>';
                    html += '<div id="dept-body-' + uniqueId + '" class="dept-body" style="padding: 12px 16px; display: none; border-top: 1px solid var(--border-light);">';
                    html += _renderDepartmentBody(householdId, dept, deptMembers, headChar, householdHead, employerId, currentWage, onRefresh);
                    html += '</div></div>';
                }
            }

            html += '</div>';
            container.innerHTML = html;

            _attachEventHandlers(container, householdId, departments, employerId, onRefresh);

        } finally {
            _rendering = false;
        }
    }

    function _renderDepartmentBody(householdId, dept, deptMembers, headChar, householdHead, employerId, currentWage, onRefresh) {
        var canSetHead = deptMembers.length > 0 && !headChar;
        var canDemoteHead = headChar && employerId && employerId !== headChar.id;

        var membersHtml = '';
        if (deptMembers.length > 0) {
            for (var i = 0; i < deptMembers.length; i++) {
                var m = deptMembers[i];
                var char = _getCharacterById(m.characterId);
                if (!char) continue;

                var rankDisplay = _getActiveRankDisplay(char);
                var isHead = m.isHead === true;

                var staffQuality = null;
                var wage = null;
                if (householdHead && householdHead.id !== char.id) {
                    var serviceRel = _getServiceBetween(householdHead.id, char.id);
                    if (serviceRel) {
                        var quality = _getServiceQuality(serviceRel.id);
                        if (quality) staffQuality = quality.name || quality.id;
                        wage = serviceRel.metadata ? serviceRel.metadata.wage : null;
                    }
                }

                membersHtml += '<div class="member-row" data-character-id="' + char.id + '" style="';
                membersHtml += 'display: flex;';
                membersHtml += 'justify-content: space-between;';
                membersHtml += 'align-items: center;';
                membersHtml += 'padding: 8px 0;';
                membersHtml += 'border-bottom: 1px solid var(--border-light);';
                membersHtml += 'cursor: pointer;';
                membersHtml += '">';
                membersHtml += '<div style="flex: 1;">';
                membersHtml += '<div style="display: flex; align-items: center; flex-wrap: wrap; gap: 6px;">';
                membersHtml += '<span><strong>' + _escapeHtml(char.name) + ' ' + _escapeHtml(char.surname || '') + '</strong></span>';
                if (isHead) membersHtml += '<span style="background: var(--accent-dim); padding: 2px 6px; border-radius: 4px; font-size: 0.5rem;">♡ Head</span>';
                if (rankDisplay) membersHtml += '<span style="color: var(--accent); font-size: 0.55rem;">⌂ ' + _escapeHtml(rankDisplay.display || rankDisplay) + '</span>';
                if (staffQuality) membersHtml += '<span style="color: var(--dim); font-size: 0.55rem;" title="Service Quality">⌆ ' + _escapeHtml(staffQuality) + '</span>';
                if (wage !== null) membersHtml += '<span style="color: var(--accent); font-size: 0.55rem;">♡ ' + wage + '/yr</span>';
                membersHtml += '</div>';
                if (m.role && !isHead) {
                    membersHtml += '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 2px;">⚙️ ' + _escapeHtml(m.role) + '</div>';
                }
                membersHtml += '</div>';
                membersHtml += '<button class="btn small remove-member-dept" data-dept-id="' + dept.id + '" data-character-id="' + char.id + '" ';
                membersHtml += 'style="padding: 2px 8px; font-size: 0.5rem; background: #8a3020; border: none; color: white; border-radius: 4px; cursor: pointer;" ';
                membersHtml += 'title="Remove from department">✗ Remove</button>';
                membersHtml += '</div>';
            }
        } else {
            membersHtml = '<div style="color: var(--dim); padding: 12px 0; text-align: center;">No members assigned to this department</div>';
        }

        return '<div style="margin-bottom: 12px;">' +
            '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 8px;">' +
            '<div><strong>♡ Department Head:</strong> <span>' + (headChar ? _escapeHtml(headChar.name) + ' ' + (_escapeHtml(headChar.surname || '')) : '<span style="color: var(--dim);">Vacant</span>') + '</span>' +
            (currentWage && headChar ? '<span style="color: var(--accent); margin-left: 8px; font-size: 0.6rem;">(♡ ' + currentWage + '/yr)</span>' : '') +
            '</div>' +
            '<div style="display: flex; gap: 8px;">' +
            (canSetHead ? '<button class="btn small set-head-btn" data-dept-id="' + dept.id + '" style="background: var(--accent-dim); border: 1px solid var(--accent); padding: 4px 12px; border-radius: 4px; cursor: pointer;">♡ Set Head</button>' : '') +
            (canDemoteHead ? '<button class="btn small demote-head-btn" data-dept-id="' + dept.id + '" data-character-id="' + headChar.id + '" data-current-wage="' + (currentWage || 10) + '" style="background: #8a3020; border: none; color: white; padding: 4px 12px; border-radius: 4px; cursor: pointer;">✗ Demote Head</button>' : '') +
            '</div></div>' +
            '<div style="margin-bottom: 12px;">' +
            '<div style="margin-bottom: 8px;"><strong>Members (' + deptMembers.length + '):</strong></div>' +
            '<div style="max-height: 250px; overflow-y: auto;">' + membersHtml + '</div></div>' +
            '<div style="display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap;">' +
            '<button class="btn small assign-staff-btn" data-dept-id="' + dept.id + '" style="background: var(--accent-dim); border: 1px solid var(--accent); padding: 4px 12px; border-radius: 4px; cursor: pointer;">✓ Assign Staff</button>' +
            '<button class="btn small danger delete-dept-btn" data-dept-id="' + dept.id + '" style="background: #8a3020; border: none; color: white; padding: 4px 12px; border-radius: 4px; cursor: pointer;">✗ Delete Department</button>' +
            '</div>';
    }

    // =========================================================================
    // 9. EVENT HANDLERS
    // =========================================================================

    function _attachEventHandlers(container, householdId, departments, employerId, onRefresh) {
        var addDeptBtn = document.getElementById('addDeptBtn');
        if (addDeptBtn) {
            addDeptBtn.onclick = function() {
                _promptDialog('Department name:', 'New Department', function(name) {
                    if (name) {
                        var result = _commands.addDepartment(householdId, name);
                        if (result && result.success) {
                            _showToast('✓ Department "' + name + '" created', 'success');
                            _modifyHouseholdReputation(householdId, 1, 'Created new department: ' + name);
                            if (onRefresh) onRefresh();
                        } else {
                            _showToast('✗ Failed to create department', 'error');
                        }
                    }
                });
            };
        }

        var deleteBtns = container.querySelectorAll('.delete-dept-btn');
        for (var i = 0; i < deleteBtns.length; i++) {
            var btn = deleteBtns[i];
            btn.onclick = function(e) {
                e.stopPropagation();
                var deptId = this.dataset.deptId;
                var dept = departments.find(function(d) { return d.id === deptId; });
                var deptName = dept ? dept.name : 'this department';

                _confirmDialog('✗ Delete department "' + deptName + '"?\n\nMembers will be unassigned.', 'Delete Department', function() {
                    var success = _commands.removeDepartment(householdId, deptId);
                    if (success && success.success) {
                        _showToast('✗ Department "' + deptName + '" deleted', 'info');
                        _modifyHouseholdReputation(householdId, -1, 'Deleted department: ' + deptName);
                        if (onRefresh) onRefresh();
                    } else {
                        _showToast('✗ Failed to delete department', 'error');
                    }
                });
            };
        }

        var assignBtns = container.querySelectorAll('.assign-staff-btn');
        for (var i = 0; i < assignBtns.length; i++) {
            var btn = assignBtns[i];
            btn.onclick = function(e) {
                e.stopPropagation();
                var deptId = this.dataset.deptId;
                _openAssignStaffModal(householdId, deptId, function() {
                    if (onRefresh) onRefresh();
                });
            };
        }

        var setHeadBtns = container.querySelectorAll('.set-head-btn');
        for (var i = 0; i < setHeadBtns.length; i++) {
            var btn = setHeadBtns[i];
            btn.onclick = function(e) {
                e.stopPropagation();
                var deptId = this.dataset.deptId;
                var dept = departments.find(function(d) { return d.id === deptId; });
                var deptMembers = (householdId ? _getHouseholdMembers(householdId) : []).filter(function(m) { return m.departmentId === deptId; });

                if (deptMembers.length === 0) {
                    _showToast('No members in this department to assign as head', 'error');
                    return;
                }

                var memberOptions = deptMembers.map(function(m) {
                    var c = _getCharacterById(m.characterId);
                    var currentWageInfo = employerId ? _getServiceBetween(employerId, c ? c.id : null) : null;
                    var wage = currentWageInfo && currentWageInfo.metadata ? currentWageInfo.metadata.wage : null;
                    return c ? '<option value="' + c.id + '" data-current-wage="' + (wage || 5) + '">' + _escapeHtml(c.name) + ' ' + _escapeHtml(c.surname || '') + (m.isHead ? ' (Current Head)' : '') + (wage ? ' - ' + wage + '/yr' : '') + '</option>' : '';
                }).join('');

                _openModal({
                    title: '♡ Set Department Head',
                    content: '<div class="form-group" style="margin-bottom: 12px;">' +
                        '<label style="display: block; font-size: 0.7rem; margin-bottom: 4px;">Select Department Head</label>' +
                        '<select id="headSelect" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">' +
                        memberOptions +
                        '</select></div>' +
                        '<div class="info-note" style="margin-top: 12px; padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem;">' +
                        'Department heads receive additional authority (wage +5) and may command higher respect.</div>',
                    confirmText: '✓ Set Head',
                    cancelText: 'Cancel',
                    onConfirm: function() {
                        var selectedCharId = document.getElementById('headSelect') ? document.getElementById('headSelect').value : null;
                        if (selectedCharId) {
                            var selectedOption = document.querySelector('#headSelect option[value="' + selectedCharId + '"]');
                            var currentWage = parseInt(selectedOption ? selectedOption.dataset.currentWage : 5) || 5;
                            var character = _getCharacterById(selectedCharId);

                            var result = _commands.setDepartmentHead(householdId, deptId, selectedCharId);
                            if (result && result.success) {
                                if (employerId && character && employerId !== character.id) {
                                    _handleDepartmentHeadPromotion(householdId, employerId, selectedCharId, character.name, dept ? dept.name : 'Department', currentWage);
                                }
                                _showToast('♡ ' + (character ? character.name : 'Unknown') + ' is now head of ' + (dept ? dept.name : 'department'), 'success');
                                if (onRefresh) onRefresh();
                            } else {
                                _showToast('✗ Failed to set department head', 'error');
                            }
                        }
                    }
                });
            };
        }

        var demoteBtns = container.querySelectorAll('.demote-head-btn');
        for (var i = 0; i < demoteBtns.length; i++) {
            var btn = demoteBtns[i];
            btn.onclick = function(e) {
                e.stopPropagation();
                var deptId = this.dataset.deptId;
                var characterId = this.dataset.characterId;
                var currentWage = parseInt(this.dataset.currentWage) || 10;
                var character = _getCharacterById(characterId);
                var dept = departments.find(function(d) { return d.id === deptId; });

                _confirmDialog('✗ Demote ' + (character ? character.name : 'Unknown') + ' from head of ' + (dept ? dept.name : 'department') + '?\n\nThey will remain in the department as regular staff.', 'Demote Department Head', function() {
                    var result = _commands.setDepartmentHead(householdId, deptId, null);
                    if (result && result.success) {
                        if (employerId && character && employerId !== character.id) {
                            _handleDepartmentHeadDemotion(householdId, employerId, characterId, character.name, dept ? dept.name : 'Department', currentWage);
                        }
                        _showToast('⌂ ' + (character ? character.name : 'Unknown') + ' demoted from ' + (dept ? dept.name : 'department'), 'info');
                        if (onRefresh) onRefresh();
                    } else {
                        _showToast('✗ Failed to demote department head', 'error');
                    }
                });
            };
        }

        var removeMemberBtns = container.querySelectorAll('.remove-member-dept');
        for (var i = 0; i < removeMemberBtns.length; i++) {
            var btn = removeMemberBtns[i];
            btn.onclick = function(e) {
                e.stopPropagation();
                var deptId = this.dataset.deptId;
                var characterId = this.dataset.characterId;
                var character = _getCharacterById(characterId);
                var dept = departments.find(function(d) { return d.id === deptId; });
                var isHead = dept ? dept.headId === characterId : false;

                var warningMessage = '✗ Remove ' + (character ? character.name : 'Unknown') + ' from ' + (dept ? dept.name : 'department') + '?';
                if (isHead) {
                    warningMessage = '⚠ ' + (character ? character.name : 'Unknown') + ' is the head of this department!\n\nRemoving them will leave the department without a head. Continue?';
                }

                _confirmDialog(warningMessage, 'Remove Member', function() {
                    var success = _commands.updateMember(householdId, characterId, { departmentId: null });
                    if (success && success.success) {
                        if (isHead) {
                            _modifyHouseholdReputation(householdId, -2, 'Department head removed from ' + (dept ? dept.name : 'department'));
                        }
                        _showToast('⌂ ' + (character ? character.name : 'Unknown') + ' removed from department', 'info');
                        if (onRefresh) onRefresh();
                    } else {
                        _showToast('✗ Failed to remove member', 'error');
                    }
                });
            };
        }

        var headers = container.querySelectorAll('.dept-header');
        for (var i = 0; i < headers.length; i++) {
            var header = headers[i];
            var handler = (function(h) {
                return function() {
                    var body = h.nextElementSibling;
                    var toggle = h.querySelector('.dept-toggle');
                    if (body) {
                        var isVisible = body.style.display !== 'none';
                        body.style.display = isVisible ? 'none' : 'block';
                        if (toggle) toggle.textContent = isVisible ? '▼' : '▲';
                    }
                };
            })(header);
            header.onclick = handler;
        }
    }

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

    window.renderHouseholdDepartmentsTab = renderHouseholdDepartmentsTab;
    window.getDepartmentStats = getDepartmentStats;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            renderHouseholdDepartmentsTab: renderHouseholdDepartmentsTab,
            getDepartmentStats: getDepartmentStats
        };
    }

})();