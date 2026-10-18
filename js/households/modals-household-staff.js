/**
 * =============================================================================
 * STILL WATERS - HOUSEHOLD STAFF POSITION MODALS (modals-household-staff.js)
 * =============================================================================
 *
 * LOCATION: js/systems/household/modals-household-staff.js
 *
 * PURPOSE
 * -------
 * Modal entry points for household staff position management.
 *
 * Reads:  HouseholdQueries, RoleQueries
 * Writes: HouseholdCommands + one persist() per batch
 * UI:     modals-core, selectors, icons
 *
 * CONVERGED PATTERN NOTES
 * -----------------------
 *   - Every mutation batch invokes HouseholdCommands.* then one
 *     HouseholdCommands.persist() at the end.
 *   - Position create / update / delete: one command + one persist.
 *   - Single assignment: one command + one persist.
 *   - Bulk assignment: one bulkAssign command (which internally commits
 *     once) + one persist in the modal.
 *   - Assignment end / delete: one command + one persist.
 *   - No HouseholdState access.
 *   - No _processingStaffModal guard.
 *   - addRoleIfMissing is now honored by the command (see addendum in
 *     household-commands.js). The modal passes the flag through and
 *     reports the outcome.
 *
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. LOAD-TIME DEPENDENCY VERIFICATION
    // =========================================================================

    function _requireFunction(name, fn) {
        if (typeof fn !== 'function') {
            throw new Error('modals-household-staff: ' + name + ' is required');
        }
        return fn;
    }

    function _requireObject(name, obj) {
        if (typeof obj === 'undefined' || obj === null) {
            throw new Error('modals-household-staff: ' + name + ' is required');
        }
        return obj;
    }

    var _queries = _requireObject('HouseholdQueries', window.HouseholdQueries);
    _requireFunction('HouseholdQueries.getHousehold', _queries.getHousehold);
    _requireFunction('HouseholdQueries.getHouseholdPosition',
        _queries.getHouseholdPosition);
    _requireFunction('HouseholdQueries.getHouseholdPositions',
        _queries.getHouseholdPositions);
    _requireFunction('HouseholdQueries.getHouseholdDetails',
        _queries.getHouseholdDetails);
    _requireFunction('HouseholdQueries.getAssignmentsForPosition',
        _queries.getAssignmentsForPosition);
    _requireFunction('HouseholdQueries.getAssignmentsForCharacter',
        _queries.getAssignmentsForCharacter);
    _requireFunction('HouseholdQueries.getAssignmentsForHousehold',
        _queries.getAssignmentsForHousehold);
    _requireFunction('HouseholdQueries.getHouseholdAssignment',
        _queries.getHouseholdAssignment);

    var _commands = _requireObject('HouseholdCommands', window.HouseholdCommands);
    _requireFunction('HouseholdCommands.persist', _commands.persist);
    _requireFunction('HouseholdCommands.createPosition',
        _commands.createPosition);
    _requireFunction('HouseholdCommands.updatePosition',
        _commands.updatePosition);
    _requireFunction('HouseholdCommands.deletePosition',
        _commands.deletePosition);
    _requireFunction('HouseholdCommands.assignCharacterToPosition',
        _commands.assignCharacterToPosition);
    _requireFunction('HouseholdCommands.endAssignment',
        _commands.endAssignment);
    _requireFunction('HouseholdCommands.deleteAssignment',
        _commands.deleteAssignment);
    _requireFunction('HouseholdCommands.bulkAssign', _commands.bulkAssign);

    var _openModal = _requireFunction('openModal',
        typeof window.openModal === 'function'
            ? window.openModal
            : window._openModal);
    var _closeTopModal = _requireFunction('closeTopModal',
        typeof window.closeTopModal === 'function'
            ? window.closeTopModal
            : window._closeTopModal);

    // =========================================================================
    // 2. HELPERS
    // =========================================================================

    function _confirmDialog(message, title, onConfirm, onCancel) {
        if (typeof window.confirmDialog === 'function') {
            return window.confirmDialog(message, title, onConfirm, onCancel);
        }
        if (typeof window._confirmDialog === 'function') {
            return window._confirmDialog(message, title, onConfirm, onCancel);
        }
        if (window.confirm(message)) {
            if (onConfirm) onConfirm();
        } else if (onCancel) {
            onCancel();
        }
    }

    function _escapeHtml(str) {
        if (typeof window._escapeHtml === 'function') return window._escapeHtml(str);
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
        if (str === undefined || str === null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _showToast(message, type) {
        if (typeof window._showToast === 'function') {
            return window._showToast(message, type);
        }
        if (typeof window.showToast === 'function') {
            return window.showToast(message, type);
        }
    }

    function _getIcon(name) {
        if (typeof window._getIcon === 'function') {
            return window._getIcon(name) || '';
        }
        if (window.Icons && window.Icons[name]) return window.Icons[name];
        return '';
    }

    function _getRoleById(id) {
        if (!id) return null;
        if (typeof window.getRoleById === 'function') return window.getRoleById(id);
        if (typeof window.RoleQueries !== 'undefined' &&
            typeof window.RoleQueries.getRoleById === 'function') {
            return window.RoleQueries.getRoleById(id);
        }
        return null;
    }

    function _getAllRoles() {
        if (typeof window.RoleState !== 'undefined' &&
            typeof window.RoleState.getAllRoles === 'function') {
            return window.RoleState.getAllRoles();
        }
        if (typeof window.RoleQueries !== 'undefined' &&
            typeof window.RoleQueries.getAllRoles === 'function') {
            return window.RoleQueries.getAllRoles();
        }
        return [];
    }

    function _currentYear() {
        if (typeof window.getCurrentYearSafe === 'function') {
            return window.getCurrentYearSafe();
        }
        return null;
    }

    function _resolveModalRoot() {
        if (typeof document === 'undefined') return null;
        return document.querySelector('[data-modal-root="top"]') ||
               document.querySelector('.modal-root:last-of-type') ||
               document.body;
    }

    function _attachOnOpen(handler) {
        return function() {
            var root = _resolveModalRoot();
            if (root) handler(root);
        };
    }

    function _parseIntOrNull(value) {
        if (value === undefined || value === null) return null;
        var s = String(value).trim();
        if (s === '') return null;
        var n = Number(s);
        if (!isFinite(n)) return null;
        return Math.floor(n);
    }

    function _persistOrFail(messagePrefix) {
        var result = _commands.persist();
        if (!result || result.success === false) {
            var reason = (result && result.reason) || 'Unknown persist error';
            _showToast(
                (messagePrefix || 'Changes made') +
                ' but could not save: ' + reason,
                'error');
            return { ok: false, reason: reason };
        }
        return { ok: true };
    }

    function _reportFailure(result, fallbackPrefix) {
        var reason = (result && result.reason) || 'Unknown error';
        _showToast((fallbackPrefix || 'Operation failed') + ': ' + reason,
            'error');
    }

    // Deferred: presentation default. Move to view-models in a later pass.
    var DEFAULT_SKILL_LEVEL = 10;

    // =========================================================================
    // 3. ROLE / DEPARTMENT OPTIONS BUILDERS
    // =========================================================================

    function _buildRoleOptions(selectedId, emptyLabel) {
        emptyLabel = emptyLabel || 'No role required';
        var html = '<option value="">' + _escapeHtml(emptyLabel) + '</option>';
        var roles = _getAllRoles();
        if (!Array.isArray(roles)) return html;

        for (var i = 0; i < roles.length; i++) {
            var r = roles[i];
            var selected = (r.id === selectedId) ? ' selected' : '';
            var icon = _getIcon(r.iconKey || r.icon) || '';
            var category = r.category || 'Uncategorized';
            var label = (icon ? icon + ' ' : '') + (r.name || 'Unnamed') +
                ' (' + category + ')';
            html += '<option value="' + _escapeHtml(r.id) + '"' + selected + '>' +
                _escapeHtml(label) + '</option>';
        }
        return html;
    }

    function _buildDepartmentOptions(householdId, selectedId) {
        var html = '<option value="">None</option>';
        var departments = _queries.getHouseholdDepartments(householdId);
        if (!Array.isArray(departments)) return html;

        for (var i = 0; i < departments.length; i++) {
            var d = departments[i];
            var selected = (d.id === selectedId) ? ' selected' : '';
            html += '<option value="' + _escapeHtml(d.id) + '"' + selected + '>' +
                _escapeHtml(d.name) + '</option>';
        }
        return html;
    }

    // =========================================================================
    // 4. CREATE POSITION MODAL
    // =========================================================================

    function openCreateHouseholdPositionModal(householdId, onSuccess) {
        var household = _queries.getHousehold(householdId);
        if (!household) {
            _showToast('Household not found', 'error');
            return null;
        }

        var departmentOptionsHtml = _buildDepartmentOptions(householdId, null);
        var roleOptionsHtml = _buildRoleOptions(null, 'No role required');

        var content =
            '<div style="margin-bottom:16px;">' +
                '<div style="background:var(--bg3);border-radius:6px;padding:8px 12px;margin-bottom:12px;font-size:0.6rem;color:var(--dim);">' +
                    'Creating a position for <strong>' +
                        _escapeHtml(household.name) + '</strong>' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Position Name *</label>' +
                    '<input type="text" data-field="name" placeholder="e.g., Cook, Maid, Butler, Gardener" autofocus ' +
                        'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;">' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Department</label>' +
                    '<select data-field="departmentId" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                        departmentOptionsHtml +
                    '</select>' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Required Role</label>' +
                    '<select data-field="requiredRoleId" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                        roleOptionsHtml +
                    '</select>' +
                    '<small style="font-size:0.55rem;color:var(--dim);">Optional: link this position to a role.</small>' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Minimum Skill Level</label>' +
                    '<input type="number" data-field="minSkillLevel" value="0" min="0" max="100" ' +
                        'style="width:80px;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;">' +
                    '<small style="font-size:0.55rem;color:var(--dim);">Only applies if a role is selected.</small>' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Priority (lower = higher rank)</label>' +
                    '<input type="number" data-field="priority" value="10" min="1" max="100" ' +
                        'style="width:80px;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;">' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Description (optional)</label>' +
                    '<input type="text" data-field="description" placeholder="e.g., Responsible for meal preparation" ' +
                        'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;">' +
                '</div>' +

                '<div style="padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;color:var(--dim);">' +
                    'Positions define specific roles within a household. Staff can be assigned to positions, ' +
                    'and positions can require a specific role.' +
                '</div>' +
            '</div>';

        return _openModal({
            title: 'Create Household Position',
            content: content,
            confirmText: 'Create Position',
            cancelText: 'Cancel',
            onConfirm: function() {
                var root = _resolveModalRoot();
                if (!root) return false;

                var name = ((root.querySelector('[data-field="name"]') || {}).value || '').trim();
                if (!name) {
                    _showToast('Position name is required', 'error');
                    return false;
                }

                var departmentId =
                    (root.querySelector('[data-field="departmentId"]') || {}).value || null;
                var requiredRoleId =
                    (root.querySelector('[data-field="requiredRoleId"]') || {}).value || null;

                var minSkillLevel = _parseIntOrNull(
                    (root.querySelector('[data-field="minSkillLevel"]') || {}).value);
                if (minSkillLevel === null) minSkillLevel = 0;

                var priority = _parseIntOrNull(
                    (root.querySelector('[data-field="priority"]') || {}).value);
                if (priority === null) priority = 10;

                var description =
                    ((root.querySelector('[data-field="description"]') || {}).value || '').trim();

                var result = _commands.createPosition({
                    name: name,
                    householdId: householdId,
                    departmentId: departmentId,
                    requiredRoleId: requiredRoleId,
                    minSkillLevel: minSkillLevel,
                    priority: priority,
                    description: description
                });

                if (!result.success) {
                    _reportFailure(result, 'Failed to create position');
                    return false;
                }

                var persisted = _persistOrFail('Position created');
                if (!persisted.ok) {
                    if (typeof onSuccess === 'function') onSuccess(result.data);
                    return true;
                }

                _showToast('Position "' + name + '" created', 'success');
                if (typeof onSuccess === 'function') onSuccess(result.data);
                return true;
            }
        });
    }

    // =========================================================================
    // 5. EDIT POSITION MODAL
    // =========================================================================

    function openEditHouseholdPositionModal(householdId, positionId, onSuccess) {
        var household = _queries.getHousehold(householdId);
        if (!household) {
            _showToast('Household not found', 'error');
            return null;
        }

        var position = _queries.getHouseholdPosition(positionId);
        if (!position) {
            _showToast('Position not found', 'error');
            return null;
        }

        var roleOptionsHtml = _buildRoleOptions(
            position.requiredRoleId, 'No role required');
        var departmentOptionsHtml = _buildDepartmentOptions(
            householdId, position.departmentId);

        var content =
            '<div style="margin-bottom:16px;">' +
                '<div style="background:var(--bg3);border-radius:6px;padding:8px 12px;margin-bottom:12px;font-size:0.6rem;color:var(--dim);">' +
                    'Editing position in <strong>' +
                        _escapeHtml(household.name) + '</strong>' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Position Name *</label>' +
                    '<input type="text" data-field="name" value="' +
                        _escapeHtml(position.name) +
                        '" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;">' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Department</label>' +
                    '<select data-field="departmentId" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                        departmentOptionsHtml +
                    '</select>' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Required Role</label>' +
                    '<select data-field="requiredRoleId" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                        roleOptionsHtml +
                    '</select>' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Minimum Skill Level</label>' +
                    '<input type="number" data-field="minSkillLevel" value="' +
                        (position.minSkillLevel !== null ? position.minSkillLevel : 0) +
                        '" min="0" max="100" style="width:80px;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;">' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Priority</label>' +
                    '<input type="number" data-field="priority" value="' +
                        (position.priority !== null ? position.priority : 10) +
                        '" min="1" max="100" style="width:80px;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;">' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Description</label>' +
                    '<input type="text" data-field="description" value="' +
                        _escapeHtml(position.description || '') +
                        '" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;">' +
                '</div>' +
            '</div>';

        return _openModal({
            title: 'Edit Position: ' + position.name,
            content: content,
            confirmText: 'Save Changes',
            cancelText: 'Cancel',
            onConfirm: function() {
                var root = _resolveModalRoot();
                if (!root) return false;

                var name = ((root.querySelector('[data-field="name"]') || {}).value || '').trim();
                if (!name) {
                    _showToast('Position name is required', 'error');
                    return false;
                }

                var departmentId =
                    (root.querySelector('[data-field="departmentId"]') || {}).value || null;
                var requiredRoleId =
                    (root.querySelector('[data-field="requiredRoleId"]') || {}).value || null;

                var minSkillLevel = _parseIntOrNull(
                    (root.querySelector('[data-field="minSkillLevel"]') || {}).value);
                if (minSkillLevel === null) minSkillLevel = 0;

                var priority = _parseIntOrNull(
                    (root.querySelector('[data-field="priority"]') || {}).value);
                if (priority === null) priority = 10;

                var description =
                    ((root.querySelector('[data-field="description"]') || {}).value || '').trim();

                var result = _commands.updatePosition(positionId, {
                    name: name,
                    departmentId: departmentId,
                    requiredRoleId: requiredRoleId,
                    minSkillLevel: minSkillLevel,
                    priority: priority,
                    description: description
                });

                if (!result.success) {
                    _reportFailure(result, 'Failed to update position');
                    return false;
                }

                var persisted = _persistOrFail('Position updated');
                if (!persisted.ok) {
                    if (typeof onSuccess === 'function') onSuccess(result.data);
                    return true;
                }

                _showToast('Position updated', 'success');
                if (typeof onSuccess === 'function') onSuccess(result.data);
                return true;
            }
        });
    }

    // =========================================================================
    // 6. DELETE POSITION MODAL
    // =========================================================================

    function openDeleteHouseholdPositionModal(householdId, positionId, onSuccess) {
        var household = _queries.getHousehold(householdId);
        var position = _queries.getHouseholdPosition(positionId);
        if (!household || !position) {
            _showToast('Household or position not found', 'error');
            return null;
        }

        var activeAssignments = _queries.getAssignmentsForPosition(positionId, true);
        var roleName = position.requiredRoleId
            ? (_getRoleById(position.requiredRoleId) || {}).name || 'Unknown'
            : null;

        var content =
            '<div style="margin-bottom:16px;">' +
                '<div style="background:rgba(200,68,68,0.15);border:1px solid var(--warn);border-radius:8px;padding:12px;margin-bottom:16px;">' +
                    '<strong>Delete Position: ' +
                        _escapeHtml(position.name) + '</strong>' +
                    '<div style="margin-top:8px;font-size:0.65rem;">' +
                        'This will permanently remove the position from the household.' +
                        (activeAssignments.length > 0
                            ? ' ' + activeAssignments.length +
                                ' staff member(s) are currently assigned.'
                            : '') +
                    '</div>' +
                    '<div style="margin-top:8px;font-size:0.6rem;color:var(--warn);">' +
                        'Warning: This action cannot be undone.' +
                    '</div>' +
                '</div>' +

                '<div style="background:var(--bg3);border-radius:6px;padding:12px;">' +
                    '<div style="display:flex;justify-content:space-between;font-size:0.7rem;">' +
                        '<span>Position:</span>' +
                        '<span><strong>' +
                            _escapeHtml(position.name) + '</strong></span>' +
                    '</div>' +
                    (roleName
                        ? '<div style="display:flex;justify-content:space-between;font-size:0.6rem;margin-top:4px;">' +
                            '<span>Required Role:</span>' +
                            '<span>' + _escapeHtml(roleName) + '</span>' +
                          '</div>'
                        : '') +
                    '<div style="display:flex;justify-content:space-between;font-size:0.6rem;margin-top:4px;">' +
                        '<span>Active Assignments:</span>' +
                        '<span>' + activeAssignments.length + '</span>' +
                    '</div>' +
                '</div>' +

                '<div style="margin-top:12px;">' +
                    '<label style="display:flex;align-items:center;gap:8px;font-size:0.65rem;cursor:pointer;">' +
                        '<input type="checkbox" data-field="removeAssignments" ' +
                            (activeAssignments.length > 0 ? 'checked' : '') + '>' +
                        '<span>Remove all assignments from this position</span>' +
                    '</label>' +
                '</div>' +
            '</div>';

        return _openModal({
            title: 'Delete Position: ' + position.name,
            content: content,
            confirmText: 'Delete Position',
            cancelText: 'Cancel',
            confirmStyle: 'danger',
            onConfirm: function() {
                var root = _resolveModalRoot();
                var removeAssignments = root
                    ? (root.querySelector('[data-field="removeAssignments"]') || {}).checked !== false
                    : true;

                var result = _commands.deletePosition(positionId, {
                    removeAssignments: removeAssignments
                });

                if (!result.success) {
                    _reportFailure(result, 'Failed to delete position');
                    return false;
                }

                var persisted = _persistOrFail('Position deleted');
                if (!persisted.ok) {
                    if (typeof onSuccess === 'function') onSuccess(result.data);
                    return true;
                }

                _showToast(
                    'Position "' + position.name + '" deleted',
                    'info');
                if (typeof onSuccess === 'function') onSuccess(result.data);
                return true;
            }
        });
    }

    // =========================================================================
    // 7. ASSIGN STAFF MODAL
    // =========================================================================

    function openAssignStaffToHouseholdPositionModal(householdId, positionId, onSuccess) {
        var household = _queries.getHousehold(householdId);
        var position = _queries.getHouseholdPosition(positionId);
        if (!household || !position) {
            _showToast('Household or position not found', 'error');
            return null;
        }

        var currentYear = _currentYear();
        var details = _queries.getHouseholdDetails(householdId);
        var members = details ? details.members : [];

        var existingAssignments = _queries.getAssignmentsForPosition(positionId, true);
        var assignedIds = {};
        for (var i = 0; i < existingAssignments.length; i++) {
            assignedIds[existingAssignments[i].characterId] = true;
        }

        var candidates = [];
        for (var m = 0; m < members.length; m++) {
            var mem = members[m];
            if (assignedIds[mem.characterId]) continue;
            if (mem.isDeceased) continue;

            var hasRole = false;
            var skillLevel = 0;
            if (position.requiredRoleId && mem.character &&
                Array.isArray(mem.character.professions)) {
                for (var p = 0; p < mem.character.professions.length; p++) {
                    var prof = mem.character.professions[p];
                    if (prof.id === position.requiredRoleId) {
                        hasRole = true;
                        skillLevel = prof.skillLevel || 0;
                        break;
                    }
                }
            }

            candidates.push({
                characterId: mem.characterId,
                characterName: mem.characterName,
                age: mem.age,
                gender: mem.character ? mem.character.gender : null,
                currentRole: mem.role,
                currentType: mem.type,
                hasRole: hasRole,
                skillLevel: skillLevel
            });
        }

        var roleDisplay = position.requiredRoleId
            ? (_getRoleById(position.requiredRoleId) || {}).name || 'Unknown'
            : 'None';

        var candidatesHtml = _buildCandidateList(candidates, position);
        var history = _queries.getAssignmentsForPosition(positionId, false);
        var historyHtml = _buildRecentHistory(history, 5);

        var content =
            '<div style="margin-bottom:12px;padding:8px;background:var(--bg2);border-radius:6px;">' +
                '<strong>Household:</strong> ' + _escapeHtml(household.name) + '<br>' +
                '<strong>Position:</strong> ' + _escapeHtml(position.name) + '<br>' +
                '<strong>Required Role:</strong> ' + _escapeHtml(roleDisplay) +
                (position.minSkillLevel > 0
                    ? ' · <strong>Min Skill:</strong> ' + position.minSkillLevel
                    : '') +
            '</div>' +

            '<div style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Select Staff Member</label>' +
                candidatesHtml +
            '</div>' +

            '<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">' +
                '<button data-action="select-other-character" style="padding:3px 10px;font-size:0.55rem;background:var(--accent-dim);border:1px solid var(--accent);border-radius:4px;cursor:pointer;">Select Other Character</button>' +
                '<label style="display:flex;align-items:center;gap:6px;font-size:0.55rem;cursor:pointer;">' +
                    '<input type="checkbox" data-field="addRoleIfMissing" checked>' +
                    '<span>Add role if missing</span>' +
                '</label>' +
            '</div>' +

            '<div style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Custom Title</label>' +
                '<input type="text" data-field="title" value="' +
                    _escapeHtml(position.name) +
                    '" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;">' +
            '</div>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">' +
                '<div>' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Start Year</label>' +
                    '<input type="number" data-field="startYear" value="' +
                        (currentYear !== null ? currentYear : '') +
                        '" min="1" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;">' +
                '</div>' +
                '<div>' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">End Year</label>' +
                    '<input type="number" data-field="endYear" placeholder="Leave empty for ongoing" min="1" ' +
                        'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;">' +
                    '<small style="font-size:0.5rem;color:var(--dim);">If set, this assignment will be marked historical.</small>' +
                '</div>' +
            '</div>' +

            '<div style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Notes</label>' +
                '<textarea data-field="notes" rows="2" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;"></textarea>' +
            '</div>' +

            historyHtml +

            '<div style="padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;margin-top:12px;">' +
                'Assignments track who holds this position over time. Setting an end year records it as historical.' +
            '</div>';

        var handle = _openModal({
            title: 'Assign Staff to ' + position.name,
            content: content,
            confirmText: 'Assign Staff',
            cancelText: 'Cancel',
            onConfirm: function() {
                var root = _resolveModalRoot();
                if (!root) return false;

                var selected = root.querySelector('.staff-candidate.selected');
                var characterId = selected ? selected.dataset.characterId : null;
                if (!characterId) {
                    _showToast('Please select a staff member', 'error');
                    return false;
                }

                var startYear = _parseIntOrNull(
                    (root.querySelector('[data-field="startYear"]') || {}).value);
                if (startYear === null) {
                    _showToast('Start year is required', 'error');
                    return false;
                }

                var endYearRaw = (root.querySelector('[data-field="endYear"]') || {}).value;
                var endYear = endYearRaw === '' || endYearRaw === undefined
                    ? null
                    : _parseIntOrNull(endYearRaw);
                if (endYearRaw !== '' && endYear === null) {
                    _showToast('End year must be a valid year', 'error');
                    return false;
                }
                if (endYear !== null && endYear <= startYear) {
                    _showToast('End year must be after start year', 'error');
                    return false;
                }

                var title =
                    ((root.querySelector('[data-field="title"]') || {}).value || '').trim() ||
                    position.name;
                var notes =
                    (root.querySelector('[data-field="notes"]') || {}).value || '';
                var addRoleIfMissing =
                    (root.querySelector('[data-field="addRoleIfMissing"]') || {}).checked !== false;

                var result = _commands.assignCharacterToPosition(
                    positionId, characterId, {
                        startYear: startYear,
                        endYear: endYear,
                        title: title,
                        notes: notes,
                        addRoleIfMissing: addRoleIfMissing,
                        defaultSkillLevel: DEFAULT_SKILL_LEVEL
                    });

                if (!result.success) {
                    _reportFailure(result, 'Failed to assign staff');
                    return false;
                }

                var persisted = _persistOrFail('Staff assigned');
                if (!persisted.ok) {
                    if (typeof onSuccess === 'function') onSuccess(result.data);
                    return true;
                }

                _showToast('Staff assigned to ' + position.name, 'success');
                if (typeof onSuccess === 'function') onSuccess(result.data);
                return true;
            }
        });

        setTimeout(_attachOnOpen(function(root) {
            _wireCandidateSelection(root, householdId, positionId, position, onSuccess);
        }), 0);

        return handle;
    }

    function _buildCandidateList(candidates, position) {
        if (candidates.length === 0) {
            return '<div style="color:var(--dim);text-align:center;padding:20px;font-size:0.6rem;">' +
                'No available staff members' +
            '</div>';
        }

        var html = '<div style="max-height:250px;overflow-y:auto;">';
        for (var i = 0; i < candidates.length; i++) {
            var c = candidates[i];
            var skillText = position.requiredRoleId
                ? (c.hasRole
                    ? '<span style="font-size:0.45rem;color:var(--success);">✓ has role</span>'
                    : '<span style="font-size:0.45rem;color:var(--warn);">missing role</span>')
                : '';
            var skillLevelText = c.skillLevel > 0
                ? '<span style="font-size:0.45rem;color:var(--accent);">(Skill: ' +
                    c.skillLevel + ')</span>'
                : '';
            var ageText = (c.age !== null && c.age !== undefined)
                ? c.age + 'y' : '—';

            html += '<div class="staff-candidate" data-character-id="' +
                _escapeHtml(c.characterId) +
                '" style="padding:8px 10px;margin-bottom:4px;background:var(--bg2);border:1px solid var(--border);' +
                'border-left:3px solid ' +
                    (position.requiredRoleId && !c.hasRole ? 'var(--warn)' : 'var(--success)') +
                ';border-radius:4px;cursor:pointer;transition:background 0.1s;">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;">' +
                    '<div>' +
                        '<strong>' + _escapeHtml(c.characterName) + '</strong>' +
                        ' <span style="font-size:0.5rem;color:var(--dim);">' +
                            ageText +
                            (c.currentRole
                                ? ' · ' + _escapeHtml(c.currentRole) : '') +
                        '</span>' +
                        ' ' + skillText + ' ' + skillLevelText +
                    '</div>' +
                '</div>' +
                '</div>';
        }
        html += '</div>';
        return html;
    }

    function _buildRecentHistory(history, limit) {
        if (!history || history.length === 0) return '';

        var sorted = history.slice().sort(function(a, b) {
            return (b.startYear || 0) - (a.startYear || 0);
        });
        var recent = sorted.slice(0, limit);

        var html = '<div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border);">';
        html += '<div style="font-size:0.65rem;color:var(--accent);margin-bottom:8px;">Recent History</div>';
        html += '<div style="max-height:120px;overflow-y:auto;background:var(--bg3);border-radius:6px;padding:8px;">';

        for (var i = 0; i < recent.length; i++) {
            var h = recent[i];
            var endDisplay = h.endYear !== null ? h.endYear : 'Present';
            var color = h.isActive ? 'var(--success)' : 'var(--dim)';
            var roleName = h.roleIdAtAssignment
                ? (_getRoleById(h.roleIdAtAssignment) || {}).name || null
                : null;

            html += '<div style="display:flex;justify-content:space-between;padding:4px 0;' +
                'border-bottom:1px solid var(--border-light);font-size:0.6rem;">' +
                '<span>' + _escapeHtml(h.title || 'Unknown') +
                    (roleName
                        ? ' <span style="color:var(--accent);">(' +
                            _escapeHtml(roleName) + ')</span>'
                        : '') +
                '</span>' +
                '<span style="color:' + color + ';">' +
                    h.startYear + ' - ' + endDisplay +
                '</span>' +
            '</div>';
        }
        html += '</div></div>';
        return html;
    }

    function _wireCandidateSelection(root, householdId, positionId, position, onSuccess) {
        var candidates = root.querySelectorAll('.staff-candidate');
        for (var i = 0; i < candidates.length; i++) {
            (function(el) {
                el.onclick = function() {
                    var all = root.querySelectorAll('.staff-candidate');
                    for (var j = 0; j < all.length; j++) {
                        all[j].classList.remove('selected');
                        all[j].style.background = 'var(--bg2)';
                        all[j].style.borderColor = 'var(--border)';
                    }
                    el.classList.add('selected');
                    el.style.background = 'rgba(var(--accent-rgb), 0.15)';
                    el.style.borderColor = 'var(--accent)';
                };
                el.onmouseenter = function() {
                    if (!el.classList.contains('selected')) {
                        el.style.background = 'var(--bg3)';
                    }
                };
                el.onmouseleave = function() {
                    if (!el.classList.contains('selected')) {
                        el.style.background = 'var(--bg2)';
                    }
                };
            })(candidates[i]);
        }

        var otherBtn = root.querySelector('[data-action="select-other-character"]');
        if (otherBtn) {
            otherBtn.onclick = function() {
                if (typeof window.openCharacterSelector !== 'function') {
                    _showToast('Character selector not available', 'warning');
                    return;
                }
                window.openCharacterSelector({
                    title: 'Select Character for ' +
                        (position ? position.name : 'position'),
                    onSelect: function(character) {
                        if (!character) return;
                        _closeTopModal();
                        setTimeout(function() {
                            openAssignStaffToHouseholdPositionModal(
                                householdId, positionId, onSuccess);
                        }, 0);
                    }
                });
            };
        }
    }

    // =========================================================================
    // 8. REMOVE / END ASSIGNMENT MODAL
    // =========================================================================

    function openRemoveHouseholdAssignmentModal(householdId, assignmentId, onSuccess) {
        var household = _queries.getHousehold(householdId);
        if (!household) {
            _showToast('Household not found', 'error');
            return null;
        }

        var assignment = _queries.getHouseholdAssignment(assignmentId);
        if (!assignment) {
            _showToast('Assignment not found', 'error');
            return null;
        }

        var position = _queries.getHouseholdPosition(assignment.positionId);
        var roleName = assignment.roleIdAtAssignment
            ? (_getRoleById(assignment.roleIdAtAssignment) || {}).name || 'Unknown'
            : 'None';

        var isAlreadyEnded = assignment.endYear !== null &&
            assignment.endYear !== undefined;

        var content;
        if (isAlreadyEnded) {
            content =
                '<div style="margin-bottom:16px;">' +
                    '<div style="background:var(--bg2);padding:8px;border-radius:6px;margin-bottom:12px;">' +
                        '<strong>Character:</strong> ' +
                            _escapeHtml(assignment.title || assignment.positionId) + '<br>' +
                        (position
                            ? '<strong>Position:</strong> ' +
                                _escapeHtml(position.name) + '<br>'
                            : '') +
                        '<strong>Started:</strong> ' +
                            assignment.startYear + '<br>' +
                        '<strong>Ended:</strong> ' + assignment.endYear +
                        (assignment.endReason
                            ? '<br><strong>End Reason:</strong> ' +
                                _escapeHtml(assignment.endReason)
                            : '') +
                    '</div>' +
                    '<div style="padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;margin-bottom:12px;">' +
                        'This assignment has already ended. You can delete it permanently.' +
                    '</div>' +
                '</div>';
        } else {
            var currentYear = _currentYear();
            content =
                '<div style="margin-bottom:16px;">' +
                    '<div style="background:var(--bg2);padding:8px;border-radius:6px;margin-bottom:12px;">' +
                        '<strong>Position:</strong> ' +
                            _escapeHtml(assignment.title || 'Unknown') +
                        (position ? ' (' + _escapeHtml(position.name) + ')' : '') +
                        '<br><strong>Role at Assignment:</strong> ' +
                            _escapeHtml(roleName) +
                        (assignment.skillLevelAtAssignment
                            ? ' (Skill: ' + assignment.skillLevelAtAssignment + ')'
                            : '') + '<br>' +
                        '<strong>Started:</strong> ' + assignment.startYear +
                    '</div>' +

                    '<div style="margin-bottom:12px;">' +
                        '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">End Year</label>' +
                        '<input type="number" data-field="endYear" value="' +
                            (currentYear !== null ? currentYear : assignment.startYear) +
                            '" min="' + assignment.startYear +
                            '" style="width:100px;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;">' +
                    '</div>' +

                    '<div style="margin-bottom:12px;">' +
                        '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Reason</label>' +
                        '<input type="text" data-field="reason" placeholder="e.g., Resignation, Term ended, Dismissed..." ' +
                            'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;">' +
                    '</div>' +

                    '<div style="padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;">' +
                        'This will mark the assignment as ended and keep it in the position history.' +
                    '</div>' +
                '</div>';
        }

        return _openModal({
            title: isAlreadyEnded ? 'Delete Assignment' : 'End Assignment',
            content: content,
            confirmText: isAlreadyEnded ? 'Delete' : 'End Assignment',
            cancelText: 'Cancel',
            confirmStyle: isAlreadyEnded ? 'danger' : '',
            onConfirm: function() {
                var root = _resolveModalRoot();

                if (isAlreadyEnded) {
                    var delResult = _commands.deleteAssignment(assignmentId);
                    if (!delResult.success) {
                        _reportFailure(delResult, 'Failed to delete assignment');
                        return false;
                    }

                    var delPersisted = _persistOrFail('Assignment deleted');
                    if (!delPersisted.ok) {
                        if (typeof onSuccess === 'function') onSuccess(delResult.data);
                        return true;
                    }

                    _showToast('Assignment deleted', 'info');
                    if (typeof onSuccess === 'function') onSuccess(delResult.data);
                    return true;
                }

                var endYear = _parseIntOrNull(
                    (root.querySelector('[data-field="endYear"]') || {}).value);
                if (endYear === null || endYear < assignment.startYear) {
                    _showToast('End year must be at or after start year', 'error');
                    return false;
                }

                var reason =
                    ((root.querySelector('[data-field="reason"]') || {}).value || '').trim() ||
                    'Term ended';

                var endResult = _commands.endAssignment(
                    assignmentId, endYear, reason);
                if (!endResult.success) {
                    _reportFailure(endResult, 'Failed to end assignment');
                    return false;
                }

                var endPersisted = _persistOrFail('Assignment ended');
                if (!endPersisted.ok) {
                    if (typeof onSuccess === 'function') onSuccess(endResult.data);
                    return true;
                }

                _showToast(
                    'Assignment ended in ' + endYear + ' (' + reason + ')',
                    'success');
                if (typeof onSuccess === 'function') onSuccess(endResult.data);
                return true;
            }
        });
    }

    // =========================================================================
    // 9. ASSIGNMENT HISTORY MODAL (pure projection)
    // =========================================================================

    function openHouseholdAssignmentHistoryModal(householdId, positionId, characterId) {
        var history;
        try {
            if (positionId) {
                history = _queries.getAssignmentsForPosition(positionId, false);
            } else if (characterId) {
                history = _queries.getAssignmentsForCharacter(characterId, false);
            } else if (householdId) {
                history = _queries.getAssignmentsForHousehold(householdId, false);
            } else {
                _showToast('No filter provided', 'error');
                return null;
            }
        } catch (e) {
            _showToast('Failed to load assignment history', 'error');
            return null;
        }

        if (!history || history.length === 0) {
            _showToast('No assignment history found', 'info');
            return null;
        }

        var title = 'Household Assignment History';
        if (householdId) {
            var household = _queries.getHousehold(householdId);
            if (household) title += ': ' + household.name;
        }
        if (positionId) {
            var pos = _queries.getHouseholdPosition(positionId);
            if (pos) title += ' - ' + pos.name;
        }

        var content = _buildAssignmentHistoryContent(history);

        return _openModal({
            title: title,
            content: content,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function() {}
        });
    }

    function _buildAssignmentHistoryContent(history) {
        var sorted = history.slice().sort(function(a, b) {
            return (b.startYear || 0) - (a.startYear || 0);
        });

        var total = sorted.length;
        var activeCount = 0;
        var withRoles = 0;
        for (var i = 0; i < sorted.length; i++) {
            if (sorted[i].isActive) activeCount++;
            if (sorted[i].roleIdAtAssignment) withRoles++;
        }

        var html = '<div style="margin-bottom:16px;">';

        html += '<div style="padding:12px;background:var(--bg2);border-radius:8px;margin-bottom:16px;">';
        html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;font-size:0.55rem;">';
        html += '<div><span style="color:var(--dim);">Total</span><br>' +
            '<span style="font-size:0.9rem;font-weight:bold;">' + total + '</span></div>';
        html += '<div><span style="color:var(--dim);">Active</span><br>' +
            '<span style="font-size:0.9rem;font-weight:bold;color:var(--success);">' +
            activeCount + '</span></div>';
        html += '<div><span style="color:var(--dim);">With Roles</span><br>' +
            '<span style="font-size:0.9rem;font-weight:bold;color:var(--accent);">' +
            withRoles + '</span></div>';
        html += '</div></div>';

        html += '<div style="max-height:350px;overflow-y:auto;">';
        html += '<div style="font-size:0.65rem;color:var(--dim);margin-bottom:8px;">' +
            sorted.length + ' assignment(s) found (most recent first)' +
        '</div>';

        for (var j = 0; j < sorted.length; j++) {
            var h = sorted[j];
            var endDisplay = h.endYear !== null ? h.endYear : 'Present';
            var roleName = h.roleIdAtAssignment
                ? (_getRoleById(h.roleIdAtAssignment) || {}).name || null
                : null;
            var color = h.isActive ? 'var(--success)' : 'var(--dim)';

            html += '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border-light);">' +
                '<div>' +
                    '<span style="font-size:0.7rem;">' +
                        _escapeHtml(h.title || 'Unknown') + '</span>' +
                    (roleName
                        ? ' <span style="font-size:0.45rem;color:var(--accent);">(Role: ' +
                            _escapeHtml(roleName) + ')</span>'
                        : '') +
                    (h.skillLevelAtAssignment
                        ? ' <span style="font-size:0.45rem;color:var(--accent);">(Skill: ' +
                            h.skillLevelAtAssignment + ')</span>'
                        : '') +
                '</div>' +
                '<div style="font-size:0.55rem;color:' + color + ';">' +
                    h.startYear + ' - ' + endDisplay +
                    (h.endReason ? ' - ' + _escapeHtml(h.endReason) : '') +
                '</div>' +
            '</div>';
        }
        html += '</div>';

        html += '</div>';
        return html;
    }

    // =========================================================================
    // 10. BULK ASSIGN MODAL
    // =========================================================================

    function openBulkHouseholdAssignModal(householdId, positionId, onSuccess) {
        var household = _queries.getHousehold(householdId);
        var position = _queries.getHouseholdPosition(positionId);
        if (!household || !position) {
            _showToast('Household or position not found', 'error');
            return null;
        }

        var details = _queries.getHouseholdDetails(householdId);
        var members = details ? details.members : [];
        var existing = _queries.getAssignmentsForPosition(positionId, true);

        var assignedIds = {};
        for (var i = 0; i < existing.length; i++) {
            assignedIds[existing[i].characterId] = true;
        }

        var candidates = [];
        for (var m = 0; m < members.length; m++) {
            var mem = members[m];
            if (assignedIds[mem.characterId]) continue;
            if (mem.isDeceased) continue;

            var hasRole = false;
            var skillLevel = 0;
            if (position.requiredRoleId && mem.character &&
                Array.isArray(mem.character.professions)) {
                for (var p = 0; p < mem.character.professions.length; p++) {
                    if (mem.character.professions[p].id === position.requiredRoleId) {
                        hasRole = true;
                        skillLevel = mem.character.professions[p].skillLevel || 0;
                        break;
                    }
                }
            }

            candidates.push({
                characterId: mem.characterId,
                characterName: mem.characterName,
                age: mem.age,
                hasRole: hasRole,
                skillLevel: skillLevel
            });
        }

        if (candidates.length === 0) {
            _showToast('No available staff to assign', 'info');
            if (typeof onSuccess === 'function') {
                onSuccess({ succeeded: [], failed: [] });
            }
            return null;
        }

        var currentYear = _currentYear();
        var rows = '';
        for (var r = 0; r < candidates.length; r++) {
            var c = candidates[r];
            var roleIcon = position.requiredRoleId
                ? (c.hasRole
                    ? '<span style="font-size:0.5rem;color:var(--success);">✓</span>'
                    : '<span style="font-size:0.5rem;color:var(--warn);">!</span>')
                : '';
            var ageText = c.age !== null ? c.age + 'y' : '—';

            rows += '<div class="bulk-candidate" data-character-id="' +
                _escapeHtml(c.characterId) +
                '" style="background:var(--bg2);border:1px solid var(--border);border-radius:4px;padding:6px 8px;margin-bottom:4px;cursor:pointer;transition:background 0.1s;">' +
                '<div style="display:flex;align-items:center;gap:8px;">' +
                    '<input type="checkbox" data-role="bulk-checkbox" data-character-id="' +
                        _escapeHtml(c.characterId) + '" style="cursor:pointer;">' +
                    '<span style="font-size:0.65rem;">' +
                        _escapeHtml(c.characterName) + ' (' + ageText + ')' +
                    '</span>' +
                    roleIcon +
                    (c.skillLevel > 0
                        ? '<span style="font-size:0.45rem;color:var(--accent);">Skill: ' +
                            c.skillLevel + '</span>'
                        : '') +
                '</div>' +
            '</div>';
        }

        var content =
            '<div style="margin-bottom:12px;padding:8px;background:var(--bg2);border-radius:6px;">' +
                '<strong>Household:</strong> ' + _escapeHtml(household.name) + '<br>' +
                '<strong>Position:</strong> ' + _escapeHtml(position.name) +
                (position.requiredRoleId
                    ? '<br><strong>Required Role:</strong> ' +
                        _escapeHtml((_getRoleById(position.requiredRoleId) || {}).name || 'Unknown')
                    : '') +
            '</div>' +

            '<div style="margin-bottom:12px;">' +
                '<div style="font-size:0.65rem;color:var(--accent);margin-bottom:8px;">' +
                    'Select Staff Members (' + candidates.length + ' available)' +
                '</div>' +
                '<div style="max-height:250px;overflow-y:auto;">' + rows + '</div>' +
            '</div>' +

            '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">' +
                '<button data-action="select-all" style="padding:3px 10px;font-size:0.55rem;background:var(--accent-dim);border:1px solid var(--accent);border-radius:4px;cursor:pointer;">Select All</button>' +
                '<button data-action="select-none" style="padding:3px 10px;font-size:0.55rem;background:var(--bg3);border:1px solid var(--border);border-radius:4px;cursor:pointer;">Select None</button>' +
                '<span style="font-size:0.55rem;color:var(--dim);margin-left:auto;">' +
                    '<span data-role="selected-count">0</span> selected' +
                '</span>' +
            '</div>' +

            '<div style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Start Year</label>' +
                '<input type="number" data-field="startYear" value="' +
                    (currentYear !== null ? currentYear : '') +
                    '" min="1" style="width:100px;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;">' +
            '</div>' +

            '<div style="padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;">' +
                'All selected staff will be assigned to this position with the same start year. ' +
                'Failures will be reported per-character.' +
            '</div>';

        var handle = _openModal({
            title: 'Bulk Assign Staff: ' + position.name,
            content: content,
            confirmText: 'Assign Selected',
            cancelText: 'Cancel',
            onConfirm: function() {
                var root = _resolveModalRoot();
                if (!root) return false;

                var checked = root.querySelectorAll('[data-role="bulk-checkbox"]:checked');
                if (checked.length === 0) {
                    _showToast('No staff members selected', 'warning');
                    return false;
                }

                var startYear = _parseIntOrNull(
                    (root.querySelector('[data-field="startYear"]') || {}).value);
                if (startYear === null) {
                    _showToast('Start year is required', 'error');
                    return false;
                }

                var assignments = [];
                for (var i = 0; i < checked.length; i++) {
                    assignments.push({
                        positionId: positionId,
                        characterId: checked[i].dataset.characterId,
                        startYear: startYear,
                        title: position.name
                    });
                }

                var result = _commands.bulkAssign(assignments, {
                    addRoleIfMissing: true,
                    defaultSkillLevel: DEFAULT_SKILL_LEVEL
                });

                if (!result.success) {
                    _reportFailure(result, 'Bulk assignment failed');
                    return false;
                }

                // bulkAssign commits once internally. Persist once here.
                var persisted = _persistOrFail('Bulk assignment saved');

                var succeeded = result.data.succeeded.length;
                var failed = result.data.failed.length;
                var msg = 'Assigned ' + succeeded + ' staff';
                if (failed > 0) msg += ', ' + failed + ' failed';
                if (!persisted.ok) {
                    _showToast(msg + ' (not saved: ' + persisted.reason + ')',
                        'warning');
                } else {
                    _showToast(msg, failed > 0 ? 'warning' : 'success');
                }

                if (typeof onSuccess === 'function') onSuccess(result.data);
                return true;
            }
        });

        setTimeout(_attachOnOpen(function(root) {
            _wireBulkSelection(root);
        }), 0);

        return handle;
    }

    function _wireBulkSelection(root) {
        function _updateCount() {
            var checked = root.querySelectorAll('[data-role="bulk-checkbox"]:checked');
            var countEl = root.querySelector('[data-role="selected-count"]');
            if (countEl) countEl.textContent = checked.length;
        }

        var rows = root.querySelectorAll('.bulk-candidate');
        for (var i = 0; i < rows.length; i++) {
            (function(el) {
                var checkbox = el.querySelector('[data-role="bulk-checkbox"]');
                el.onclick = function(e) {
                    if (e.target !== checkbox) {
                        checkbox.checked = !checkbox.checked;
                        _updateCount();
                    }
                    if (checkbox.checked) {
                        el.style.background = 'rgba(var(--accent-rgb), 0.15)';
                        el.style.borderColor = 'var(--accent)';
                    } else {
                        el.style.background = 'var(--bg2)';
                        el.style.borderColor = 'var(--border)';
                    }
                };
                checkbox.onchange = function() {
                    _updateCount();
                    if (checkbox.checked) {
                        el.style.background = 'rgba(var(--accent-rgb), 0.15)';
                        el.style.borderColor = 'var(--accent)';
                    } else {
                        el.style.background = 'var(--bg2)';
                        el.style.borderColor = 'var(--border)';
                    }
                };
            })(rows[i]);
        }

        var selectAll = root.querySelector('[data-action="select-all"]');
        if (selectAll) {
            selectAll.onclick = function() {
                var cbs = root.querySelectorAll('[data-role="bulk-checkbox"]');
                for (var k = 0; k < cbs.length; k++) {
                    cbs[k].checked = true;
                    cbs[k].onchange();
                }
                _updateCount();
            };
        }

        var selectNone = root.querySelector('[data-action="select-none"]');
        if (selectNone) {
            selectNone.onclick = function() {
                var cbs = root.querySelectorAll('[data-role="bulk-checkbox"]');
                for (var k = 0; k < cbs.length; k++) {
                    cbs[k].checked = false;
                    cbs[k].onchange();
                }
                _updateCount();
            };
        }
    }

    // =========================================================================
    // 11. VIEW POSITIONS MODAL (pure projection)
    // =========================================================================

    function openViewHouseholdPositionsModal(householdId, onSelect) {
        var household = _queries.getHousehold(householdId);
        if (!household) {
            _showToast('Household not found', 'error');
            return null;
        }

        var positions = _queries.getHouseholdPositions({ householdId: householdId });
        var assignments = _queries.getAssignmentsForHousehold(householdId, true);

        var assignmentMap = {};
        for (var i = 0; i < assignments.length; i++) {
            var a = assignments[i];
            if (!assignmentMap[a.positionId]) assignmentMap[a.positionId] = [];
            assignmentMap[a.positionId].push(a);
        }

        var rows = '';
        if (positions.length === 0) {
            rows = '<div style="color:var(--dim);text-align:center;padding:40px;font-size:0.6rem;">' +
                'No positions created yet</div>';
        } else {
            rows = '<div style="display:flex;flex-direction:column;gap:6px;">';
            for (var p = 0; p < positions.length; p++) {
                var pos = positions[p];
                var posAssignments = assignmentMap[pos.id] || [];
                var activeCount = 0;
                for (var q = 0; q < posAssignments.length; q++) {
                    if (posAssignments[q].isActive) activeCount++;
                }
                var roleName = pos.requiredRoleId
                    ? (_getRoleById(pos.requiredRoleId) || {}).name || 'Unknown'
                    : 'None';

                rows += '<div class="position-item" data-position-id="' +
                    _escapeHtml(pos.id) +
                    '" style="background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:10px 12px;cursor:pointer;">' +
                    '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:6px;">' +
                        '<div>' +
                            '<strong>' + _escapeHtml(pos.name) + '</strong>' +
                            '<span style="font-size:0.55rem;color:var(--accent);margin-left:8px;">Role: ' +
                                _escapeHtml(roleName) + '</span>' +
                            (pos.minSkillLevel > 0
                                ? '<span style="font-size:0.55rem;color:var(--dim);margin-left:4px;">(Min: ' +
                                    pos.minSkillLevel + ')</span>'
                                : '') +
                        '</div>' +
                        '<div style="font-size:0.55rem;color:var(--accent);">' +
                            activeCount + ' assigned' +
                        '</div>' +
                    '</div>' +
                    (pos.description
                        ? '<div style="font-size:0.5rem;color:var(--dim);margin-top:2px;">' +
                            _escapeHtml(pos.description) + '</div>'
                        : '') +
                '</div>';
            }
            rows += '</div>';
        }

        var content =
            '<div style="margin-bottom:16px;padding:12px;background:var(--bg2);border-radius:8px;">' +
                '<strong>Household:</strong> ' + _escapeHtml(household.name) +
                '<div style="font-size:0.6rem;color:var(--dim);margin-top:4px;">' +
                    positions.length + ' positions · ' +
                    assignments.length + ' active assignments' +
                '</div>' +
            '</div>' +
            rows +
            '<div style="margin-top:12px;padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;">' +
                'Click on a position to manage it.' +
            '</div>';

        var handle = _openModal({
            title: 'Household Positions: ' + household.name,
            content: content,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function() {}
        });

        setTimeout(_attachOnOpen(function(root) {
            var items = root.querySelectorAll('.position-item');
            for (var j = 0; j < items.length; j++) {
                (function(el) {
                    el.onclick = function() {
                        var posId = el.dataset.positionId;
                        _closeTopModal();
                        if (typeof onSelect === 'function') onSelect(posId);
                    };
                    el.onmouseenter = function() {
                        el.style.background = 'var(--bg2)';
                        el.style.borderColor = 'var(--accent)';
                    };
                    el.onmouseleave = function() {
                        el.style.background = 'var(--bg3)';
                        el.style.borderColor = 'var(--border)';
                    };
                })(items[j]);
            }
        }), 0);

        return handle;
    }

    // =========================================================================
    // 12. VIEW STAFF ASSIGNMENTS MODAL
    // =========================================================================

    function openViewStaffAssignmentsModal(householdId) {
        var household = _queries.getHousehold(householdId);
        if (!household) {
            _showToast('Household not found', 'error');
            return null;
        }

        var assignments = _queries.getAssignmentsForHousehold(householdId, true);
        var positions = _queries.getHouseholdPositions({ householdId: householdId });
        var positionMap = {};
        for (var i = 0; i < positions.length; i++) {
            positionMap[positions[i].id] = positions[i];
        }

        var rows = '';
        if (assignments.length === 0) {
            rows = '<div style="color:var(--dim);text-align:center;padding:40px;font-size:0.6rem;">' +
                'No staff assignments</div>';
        } else {
            rows = '<div style="display:flex;flex-direction:column;gap:4px;">';
            for (var a = 0; a < assignments.length; a++) {
                var asg = assignments[a];
                var pos = positionMap[asg.positionId];
                var roleName = asg.roleIdAtAssignment
                    ? (_getRoleById(asg.roleIdAtAssignment) || {}).name || 'Unknown'
                    : 'None';

                rows += '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:var(--bg2);border-radius:4px;border-left:3px solid var(--accent);">' +
                    '<div>' +
                        '<strong>' + _escapeHtml(asg.title || 'Unknown') + '</strong>' +
                        (pos
                            ? '<span style="font-size:0.55rem;color:var(--dim);margin-left:6px;">' +
                                _escapeHtml(pos.name) + '</span>'
                            : '') +
                        (roleName !== 'None'
                            ? '<span style="font-size:0.5rem;color:var(--accent);margin-left:6px;">Role: ' +
                                _escapeHtml(roleName) + '</span>'
                            : '') +
                    '</div>' +
                    '<div style="font-size:0.5rem;color:var(--dim);">' +
                        'Since ' + asg.startYear +
                        '<button data-action="end-assignment" data-assignment-id="' +
                            _escapeHtml(asg.id) +
                            '" style="margin-left:8px;padding:2px 6px;font-size:0.45rem;background:#8a5a20;border:none;color:white;border-radius:3px;cursor:pointer;">End</button>' +
                    '</div>' +
                '</div>';
            }
            rows += '</div>';
        }

        var content =
            '<div style="margin-bottom:16px;padding:12px;background:var(--bg2);border-radius:8px;">' +
                '<strong>Staff Assignments: ' +
                    _escapeHtml(household.name) + '</strong>' +
                '<div style="font-size:0.6rem;color:var(--dim);margin-top:4px;">' +
                    assignments.length + ' active staff members' +
                '</div>' +
            '</div>' +
            rows +
            '<div style="margin-top:12px;padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;">' +
                'Click "End" to terminate a staff assignment.' +
            '</div>';

        var handle = _openModal({
            title: 'Staff Assignments',
            content: content,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function() {}
        });

        setTimeout(_attachOnOpen(function(root) {
            var btns = root.querySelectorAll('[data-action="end-assignment"]');
            for (var b = 0; b < btns.length; b++) {
                (function(btn) {
                    btn.onclick = function(e) {
                        e.stopPropagation();
                        var assignmentId = btn.dataset.assignmentId;
                        var currentYear = _currentYear();

                        _confirmDialog(
                            'End this staff assignment?',
                            'End Assignment',
                            function() {
                                var result = _commands.endAssignment(
                                    assignmentId, currentYear, 'Ended by user');
                                if (!result.success) {
                                    _reportFailure(result,
                                        'Failed to end assignment');
                                    return;
                                }

                                var persisted = _persistOrFail('Assignment ended');
                                if (!persisted.ok) {
                                    // Leave modal open so user sees the error toast
                                    return;
                                }

                                _showToast('Assignment ended', 'success');
                                _closeTopModal();
                                setTimeout(function() {
                                    openViewStaffAssignmentsModal(householdId);
                                }, 0);
                            },
                            function() {}
                        );
                    };
                })(btns[b]);
            }
        }), 0);

        return handle;
    }

    // =========================================================================
    // 13. COMBINED STAFF MANAGEMENT MODAL
    // =========================================================================

    function openStaffManagementModal(householdId, onSuccess) {
        var household = _queries.getHousehold(householdId);
        if (!household) {
            _showToast('Household not found', 'error');
            return null;
        }

        var positions = _queries.getHouseholdPositions({ householdId: householdId });
        var assignments = _queries.getAssignmentsForHousehold(householdId, true);

        var assignmentMap = {};
        for (var i = 0; i < assignments.length; i++) {
            var a = assignments[i];
            if (!assignmentMap[a.positionId]) assignmentMap[a.positionId] = [];
            assignmentMap[a.positionId].push(a);
        }

        var rows = '';
        if (positions.length === 0) {
            rows = '<div style="color:var(--dim);text-align:center;padding:20px;font-size:0.6rem;">' +
                'No positions created yet</div>';
        } else {
            rows = '<div style="display:flex;flex-direction:column;gap:4px;">';
            for (var p = 0; p < positions.length; p++) {
                var pos = positions[p];
                var posAssignments = assignmentMap[pos.id] || [];
                var activeCount = 0;
                for (var q = 0; q < posAssignments.length; q++) {
                    if (posAssignments[q].isActive) activeCount++;
                }
                var roleName = pos.requiredRoleId
                    ? (_getRoleById(pos.requiredRoleId) || {}).name || 'Unknown'
                    : 'None';

                rows += '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;background:var(--bg2);border-radius:4px;border-left:3px solid ' +
                    (activeCount > 0 ? 'var(--accent)' : 'var(--border)') + ';">' +
                    '<div>' +
                        '<strong>' + _escapeHtml(pos.name) + '</strong>' +
                        '<span style="font-size:0.5rem;color:var(--accent);margin-left:6px;">Role: ' +
                            _escapeHtml(roleName) + '</span>' +
                        (pos.minSkillLevel > 0
                            ? '<span style="font-size:0.5rem;color:var(--dim);margin-left:4px;">(Min: ' +
                                pos.minSkillLevel + ')</span>'
                            : '') +
                    '</div>' +
                    '<div style="display:flex;gap:4px;align-items:center;">' +
                        '<span style="font-size:0.5rem;color:var(--accent);">' +
                            activeCount + ' assigned</span>' +
                        '<button data-action="pos-assign" data-position-id="' +
                            _escapeHtml(pos.id) +
                            '" style="padding:2px 6px;font-size:0.45rem;background:var(--accent-dim);border:1px solid var(--accent);border-radius:3px;cursor:pointer;">Assign</button>' +
                        '<button data-action="pos-edit" data-position-id="' +
                            _escapeHtml(pos.id) +
                            '" style="padding:2px 6px;font-size:0.45rem;background:var(--bg3);border:1px solid var(--border);border-radius:3px;cursor:pointer;">Edit</button>' +
                        '<button data-action="pos-delete" data-position-id="' +
                            _escapeHtml(pos.id) +
                            '" style="padding:2px 6px;font-size:0.45rem;background:#8a3020;border:none;color:white;border-radius:3px;cursor:pointer;">Delete</button>' +
                    '</div>' +
                '</div>';
            }
            rows += '</div>';
        }

        var content =
            '<div style="margin-bottom:16px;padding:12px;background:var(--bg2);border-radius:8px;">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">' +
                    '<div><strong>Staff Management: ' +
                        _escapeHtml(household.name) + '</strong></div>' +
                    '<div style="font-size:0.6rem;color:var(--dim);">' +
                        positions.length + ' positions · ' +
                        assignments.length + ' active' +
                    '</div>' +
                '</div>' +
            '</div>' +

            '<div style="margin-bottom:12px;">' +
                '<button data-action="create-position" style="background:var(--accent);border:none;color:white;padding:4px 12px;border-radius:4px;cursor:pointer;font-size:0.65rem;">Create Position</button>' +
                '<button data-action="view-assignments" style="background:var(--bg3);border:1px solid var(--border);padding:4px 12px;border-radius:4px;cursor:pointer;font-size:0.65rem;margin-left:4px;">View Assignments</button>' +
            '</div>' +

            rows +

            '<div style="margin-top:12px;padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;">' +
                'Manage staff positions and assignments. Click "Assign" to add staff, "Edit" to modify a position, "Delete" to remove it.' +
            '</div>';

        var handle = _openModal({
            title: 'Staff Management',
            content: content,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function() {
                if (typeof onSuccess === 'function') onSuccess();
                return true;
            }
        });

        setTimeout(_attachOnOpen(function(root) {
            _wireStaffManagement(root, householdId, onSuccess);
        }), 0);

        return handle;
    }

    function _wireStaffManagement(root, householdId, onSuccess) {
        function _reopen() {
            setTimeout(function() {
                openStaffManagementModal(householdId, onSuccess);
            }, 0);
        }

        var createBtn = root.querySelector('[data-action="create-position"]');
        if (createBtn) {
            createBtn.onclick = function() {
                _closeTopModal();
                openCreateHouseholdPositionModal(householdId, _reopen);
            };
        }

        var viewAssignBtn = root.querySelector('[data-action="view-assignments"]');
        if (viewAssignBtn) {
            viewAssignBtn.onclick = function() {
                _closeTopModal();
                openViewStaffAssignmentsModal(householdId);
            };
        }

        var assignBtns = root.querySelectorAll('[data-action="pos-assign"]');
        for (var i = 0; i < assignBtns.length; i++) {
            (function(btn) {
                btn.onclick = function() {
                    var posId = btn.dataset.positionId;
                    _closeTopModal();
                    openAssignStaffToHouseholdPositionModal(
                        householdId, posId, _reopen);
                };
            })(assignBtns[i]);
        }

        var editBtns = root.querySelectorAll('[data-action="pos-edit"]');
        for (var j = 0; j < editBtns.length; j++) {
            (function(btn) {
                btn.onclick = function() {
                    var posId = btn.dataset.positionId;
                    _closeTopModal();
                    openEditHouseholdPositionModal(
                        householdId, posId, _reopen);
                };
            })(editBtns[j]);
        }

        var deleteBtns = root.querySelectorAll('[data-action="pos-delete"]');
        for (var k = 0; k < deleteBtns.length; k++) {
            (function(btn) {
                btn.onclick = function() {
                    var posId = btn.dataset.positionId;
                    _closeTopModal();
                    openDeleteHouseholdPositionModal(
                        householdId, posId, _reopen);
                };
            })(deleteBtns[k]);
        }
    }

    // =========================================================================
    // 14. EXPORTS
    // =========================================================================

    window.openCreateHouseholdPositionModal = openCreateHouseholdPositionModal;
    window.openEditHouseholdPositionModal = openEditHouseholdPositionModal;
    window.openDeleteHouseholdPositionModal = openDeleteHouseholdPositionModal;
    window.openViewHouseholdPositionsModal = openViewHouseholdPositionsModal;
    window.openViewStaffAssignmentsModal = openViewStaffAssignmentsModal;
    window.openStaffManagementModal = openStaffManagementModal;

    window.openAssignStaffToHouseholdPositionModal = openAssignStaffToHouseholdPositionModal;
    window.openRemoveHouseholdAssignmentModal = openRemoveHouseholdAssignmentModal;
    window.openHouseholdAssignmentHistoryModal = openHouseholdAssignmentHistoryModal;
    window.openBulkHouseholdAssignModal = openBulkHouseholdAssignModal;
    window.openViewHouseholdStaffAssignmentsModal = openViewStaffAssignmentsModal;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            openCreateHouseholdPositionModal: openCreateHouseholdPositionModal,
            openEditHouseholdPositionModal: openEditHouseholdPositionModal,
            openDeleteHouseholdPositionModal: openDeleteHouseholdPositionModal,
            openViewHouseholdPositionsModal: openViewHouseholdPositionsModal,
            openViewStaffAssignmentsModal: openViewStaffAssignmentsModal,
            openStaffManagementModal: openStaffManagementModal,
            openAssignStaffToHouseholdPositionModal: openAssignStaffToHouseholdPositionModal,
            openRemoveHouseholdAssignmentModal: openRemoveHouseholdAssignmentModal,
            openHouseholdAssignmentHistoryModal: openHouseholdAssignmentHistoryModal,
            openBulkHouseholdAssignModal: openBulkHouseholdAssignModal,
            openViewHouseholdStaffAssignmentsModal: openViewStaffAssignmentsModal
        };
    }

})();
