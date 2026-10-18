/**
 * =============================================================================
 * STILL WATERS - RESIDENCE STAFF MODALS (modals-residence-staff.js)
 * =============================================================================
 *
 * LOCATION: js/systems/household/modals-residence-staff.js
 *
 * PURPOSE
 * -------
 * Modal entry points for residence staff position management:
 *
 *   - openCreateResidenceStaffPositionModal(residenceId, onSuccess)
 *   - openEditResidenceStaffPositionModal(residenceId, positionId, onSuccess)
 *   - openDeleteResidenceStaffPositionModal(residenceId, positionId, onSuccess)
 *   - openAssignResidenceStaffModal(residenceId, positionId, onSuccess)
 *   - openViewResidenceStaffPositionsModal(residenceId, onSelect)
 *   - openViewResidenceStaffAssignmentsModal(residenceId)
 *   - openResidenceStaffManagementModal(residenceId, onSuccess)
 *
 * OWNERSHIP
 * ---------
 *   Reads:  ResidenceSystem (getResidence, getUnits, getStaffPositions,
 *                            getStaffAssignments)
 *           CharacterQueries (getCharacterById, getCharacters)
 *           RoleQueries (getRoleById, getAllRoles)
 *   Writes: ResidenceSystem (addStaffPosition, updateStaffPosition,
 *                            removeStaffPosition,
 *                            assignCharacterToStaffPosition,
 *                            endStaffAssignment, deleteStaffAssignment)
 *           + one persist() per mutation batch
 *   UI:     modals-core, selectors, icons
 *
 * CONVERGED PATTERN NOTES
 * -----------------------
 *   - Every staff mutation ends with ResidenceSystem.persist().
 *   - No direct residence record mutation.
 *   - No direct _saveMasterData() from UI.
 *   - No _processingStaffModal guard.
 *   - addRoleIfMissing checkbox REMOVED: the current residence command
 *     does not support it. Role indicators are preserved so users can
 *     see the outcome. If the command later accepts the option, re-add
 *     the checkbox and pass addRoleIfMissing through.
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
            throw new Error('modals-residence-staff: ' + name + ' is required');
        }
        return fn;
    }

    function _requireObject(name, obj) {
        if (typeof obj === 'undefined' || obj === null) {
            throw new Error('modals-residence-staff: ' + name + ' is required');
        }
        return obj;
    }

    var _residence = _requireObject('ResidenceSystem', window.ResidenceSystem);
    _requireFunction('ResidenceSystem.persist', _residence.persist);
    _requireFunction('ResidenceSystem.addStaffPosition',
        _residence.addStaffPosition);
    _requireFunction('ResidenceSystem.updateStaffPosition',
        _residence.updateStaffPosition);
    _requireFunction('ResidenceSystem.removeStaffPosition',
        _residence.removeStaffPosition);
    _requireFunction('ResidenceSystem.assignCharacterToStaffPosition',
        _residence.assignCharacterToStaffPosition);
    _requireFunction('ResidenceSystem.endStaffAssignment',
        _residence.endStaffAssignment);
    _requireFunction('ResidenceSystem.deleteStaffAssignment',
        _residence.deleteStaffAssignment);
    _requireFunction('ResidenceSystem.getStaffPositions',
        _residence.getStaffPositions);
    _requireFunction('ResidenceSystem.getStaffAssignments',
        _residence.getStaffAssignments);
    _requireFunction('ResidenceSystem.getResidence',
        _residence.getResidence);
    _requireFunction('ResidenceSystem.getUnits',
        _residence.getUnits);

    var _getCharacterById = _requireFunction('getCharacterById',
        window.getCharacterById);

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

    function _getAllCharacters() {
        if (typeof window.getCharacters === 'function') {
            return window.getCharacters() || [];
        }
        return [];
    }

    function _currentYear() {
        if (typeof window.getCurrentYearSafe === 'function') {
            return window.getCurrentYearSafe();
        }
        return null;
    }

    function _openCharacterSelector(options) {
        if (typeof window.openCharacterSelector === 'function') {
            return window.openCharacterSelector(options);
        }
        _showToast('Character selector not available', 'error');
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
        var result = _residence.persist();
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
    // Only used for the assignCharacterToStaffPosition skillLevelAtAssignment
    // default when a role is already present.
    var DEFAULT_SKILL_LEVEL = 10;

    // =========================================================================
    // 3. ROLE / UNIT OPTIONS BUILDERS
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

    function _buildUnitOptions(residenceId, selectedUnitNumber) {
        var units = _residence.getUnits(residenceId);

        var html = '<option value="">Whole Residence</option>';
        for (var i = 0; i < units.length; i++) {
            var u = units[i];
            if (u.isDemolished) continue;
            var selected = (u.unitNumber === selectedUnitNumber)
                ? ' selected' : '';
            html += '<option value="' + u.unitNumber + '"' + selected + '>Unit ' +
                u.unitNumber + '</option>';
        }
        return html;
    }

    // =========================================================================
    // 4. CREATE STAFF POSITION MODAL
    // =========================================================================

    function openCreateResidenceStaffPositionModal(residenceId, onSuccess) {
        var residence = _residence.getResidence(residenceId);
        if (!residence) {
            _showToast('Residence not found', 'error');
            return null;
        }

        var unitOptions = _buildUnitOptions(residenceId, null);
        var roleOptions = _buildRoleOptions(null, 'No role required');

        var content =
            '<div style="margin-bottom:16px;">' +
                '<div style="background:var(--bg3);border-radius:6px;padding:8px 12px;margin-bottom:12px;font-size:0.6rem;color:var(--dim);">' +
                    'Creating a staff position for <strong>' +
                        _escapeHtml(residence.name) + '</strong>' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Position Name *</label>' +
                    '<input type="text" data-field="name" placeholder="e.g., Maid, Cook, Butler, Gardener" autofocus ' +
                        'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;">' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Unit (optional)</label>' +
                    '<select data-field="unitNumber" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                        unitOptions +
                    '</select>' +
                    '<small style="font-size:0.55rem;color:var(--dim);">' +
                        'If assigned to a unit, this position only applies to that unit.' +
                    '</small>' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Required Role</label>' +
                    '<select data-field="requiredRoleId" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                        roleOptions +
                    '</select>' +
                    '<small style="font-size:0.55rem;color:var(--dim);">' +
                        'Optional: link this position to a role.' +
                    '</small>' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Minimum Skill Level</label>' +
                    '<input type="number" data-field="minSkillLevel" value="0" min="0" max="100" ' +
                        'style="width:80px;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;">' +
                    '<small style="font-size:0.55rem;color:var(--dim);">Only applies if a role is selected.</small>' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Notes (optional)</label>' +
                    '<textarea data-field="notes" rows="2" placeholder="e.g., Responsible for meal preparation" ' +
                        'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;"></textarea>' +
                '</div>' +

                '<div style="padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;color:var(--dim);">' +
                    'Staff positions define specific roles within a residence. Staff can be assigned to positions, ' +
                    'and positions can require a specific role.' +
                '</div>' +
            '</div>';

        return _openModal({
            title: 'Create Residence Staff Position',
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

                var unitNumberRaw = (root.querySelector('[data-field="unitNumber"]') || {}).value;
                var unitNumber = unitNumberRaw === ''
                    ? null
                    : _parseIntOrNull(unitNumberRaw);
                if (unitNumberRaw !== '' && unitNumber === null) {
                    _showToast('Invalid unit number', 'error');
                    return false;
                }

                var requiredRoleId =
                    (root.querySelector('[data-field="requiredRoleId"]') || {}).value || null;

                var minSkillLevel = _parseIntOrNull(
                    (root.querySelector('[data-field="minSkillLevel"]') || {}).value);
                if (minSkillLevel === null) minSkillLevel = 0;

                var notes =
                    ((root.querySelector('[data-field="notes"]') || {}).value || '').trim();

                var result = _residence.addStaffPosition(residenceId, {
                    name: name,
                    unitNumber: unitNumber,
                    requiredRoleId: requiredRoleId,
                    minSkillLevel: minSkillLevel,
                    notes: notes
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
    // 5. EDIT STAFF POSITION MODAL
    // =========================================================================

    function openEditResidenceStaffPositionModal(residenceId, positionId, onSuccess) {
        var residence = _residence.getResidence(residenceId);
        if (!residence) {
            _showToast('Residence not found', 'error');
            return null;
        }

        var positions = _residence.getStaffPositions(residenceId);
        var position = null;
        for (var i = 0; i < positions.length; i++) {
            if (positions[i].id === positionId) {
                position = positions[i];
                break;
            }
        }
        if (!position) {
            _showToast('Position not found', 'error');
            return null;
        }

        var unitOptions = _buildUnitOptions(residenceId, position.unitNumber);
        var roleOptions = _buildRoleOptions(
            position.requiredRoleId, 'No role required');

        var content =
            '<div style="margin-bottom:16px;">' +
                '<div style="background:var(--bg3);border-radius:6px;padding:8px 12px;margin-bottom:12px;font-size:0.6rem;color:var(--dim);">' +
                    'Editing staff position for <strong>' +
                        _escapeHtml(residence.name) + '</strong>' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Position Name *</label>' +
                    '<input type="text" data-field="name" value="' +
                        _escapeHtml(position.name) +
                        '" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;">' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Unit</label>' +
                    '<select data-field="unitNumber" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                        unitOptions +
                    '</select>' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Required Role</label>' +
                    '<select data-field="requiredRoleId" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                        roleOptions +
                    '</select>' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Minimum Skill Level</label>' +
                    '<input type="number" data-field="minSkillLevel" value="' +
                        (position.minSkillLevel !== null
                            ? position.minSkillLevel : 0) +
                        '" min="0" max="100" style="width:80px;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;">' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Notes</label>' +
                    '<textarea data-field="notes" rows="2" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                        _escapeHtml(position.notes || '') +
                    '</textarea>' +
                '</div>' +
            '</div>';

        return _openModal({
            title: 'Edit Staff Position: ' + position.name,
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

                var unitNumberRaw = (root.querySelector('[data-field="unitNumber"]') || {}).value;
                var unitNumber = unitNumberRaw === ''
                    ? null
                    : _parseIntOrNull(unitNumberRaw);
                if (unitNumberRaw !== '' && unitNumber === null) {
                    _showToast('Invalid unit number', 'error');
                    return false;
                }

                var requiredRoleId =
                    (root.querySelector('[data-field="requiredRoleId"]') || {}).value || null;

                var minSkillLevel = _parseIntOrNull(
                    (root.querySelector('[data-field="minSkillLevel"]') || {}).value);
                if (minSkillLevel === null) minSkillLevel = 0;

                var notes =
                    ((root.querySelector('[data-field="notes"]') || {}).value || '').trim();

                var result = _residence.updateStaffPosition(
                    residenceId, positionId, {
                        name: name,
                        unitNumber: unitNumber,
                        requiredRoleId: requiredRoleId,
                        minSkillLevel: minSkillLevel,
                        notes: notes
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
    // 6. DELETE STAFF POSITION MODAL
    // =========================================================================

    function openDeleteResidenceStaffPositionModal(residenceId, positionId, onSuccess) {
        var residence = _residence.getResidence(residenceId);
        if (!residence) {
            _showToast('Residence not found', 'error');
            return null;
        }

        var positions = _residence.getStaffPositions(residenceId);
        var position = null;
        for (var i = 0; i < positions.length; i++) {
            if (positions[i].id === positionId) {
                position = positions[i];
                break;
            }
        }
        if (!position) {
            _showToast('Position not found', 'error');
            return null;
        }

        var activeAssignments = _residence.getStaffAssignments(residenceId, {
            positionId: positionId,
            activeOnly: true
        });

        var roleName = position.requiredRoleId
            ? (_getRoleById(position.requiredRoleId) || {}).name || 'Unknown'
            : null;

        var content =
            '<div style="margin-bottom:16px;">' +
                '<div style="background:rgba(200,68,68,0.15);border:1px solid var(--warn);border-radius:8px;padding:12px;margin-bottom:16px;">' +
                    '<strong>Delete Staff Position: ' +
                        _escapeHtml(position.name) + '</strong>' +
                    '<div style="margin-top:8px;font-size:0.65rem;">' +
                        'This will permanently remove the position from the residence.' +
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
                    (position.unitNumber !== null && position.unitNumber !== undefined
                        ? '<div style="display:flex;justify-content:space-between;font-size:0.6rem;margin-top:4px;">' +
                            '<span>Unit:</span>' +
                            '<span>' + position.unitNumber + '</span>' +
                          '</div>'
                        : '') +
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
            title: 'Delete Staff Position: ' + position.name,
            content: content,
            confirmText: 'Delete Position',
            cancelText: 'Cancel',
            confirmStyle: 'danger',
            onConfirm: function() {
                var root = _resolveModalRoot();
                var removeAssignments = root
                    ? (root.querySelector('[data-field="removeAssignments"]') || {}).checked !== false
                    : true;

                var result = _residence.removeStaffPosition(
                    residenceId, positionId, {
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

                _showToast('Position "' + position.name + '" deleted', 'info');
                if (typeof onSuccess === 'function') onSuccess(result.data);
                return true;
            }
        });
    }

    // =========================================================================
    // 7. ASSIGN STAFF MODAL
    // =========================================================================
    //
    // Note: the residence command does not support addRoleIfMissing. The
    // old checkbox is removed. Role indicators (has role / missing role)
    // are preserved so users can see the outcome.
    // =========================================================================

    function openAssignResidenceStaffModal(residenceId, positionId, onSuccess) {
        var residence = _residence.getResidence(residenceId);
        if (!residence) {
            _showToast('Residence not found', 'error');
            return null;
        }

        var positions = _residence.getStaffPositions(residenceId);
        var position = null;
        for (var i = 0; i < positions.length; i++) {
            if (positions[i].id === positionId) {
                position = positions[i];
                break;
            }
        }
        if (!position) {
            _showToast('Position not found', 'error');
            return null;
        }

        var currentYear = _currentYear();
        var existingAssignments = _residence.getStaffAssignments(residenceId, {
            positionId: positionId,
            activeOnly: true
        });

        var assignedIds = {};
        for (var j = 0; j < existingAssignments.length; j++) {
            assignedIds[existingAssignments[j].characterId] = true;
        }

        var allChars = _getAllCharacters();
        var candidates = [];
        for (var k = 0; k < allChars.length; k++) {
            var c = allChars[k];
            if (c.isDeceased) continue;
            if (assignedIds[c.id]) continue;

            var hasRole = false;
            var skillLevel = 0;
            if (position.requiredRoleId && Array.isArray(c.professions)) {
                for (var p = 0; p < c.professions.length; p++) {
                    if (c.professions[p].id === position.requiredRoleId) {
                        hasRole = true;
                        skillLevel = c.professions[p].skillLevel || 0;
                        break;
                    }
                }
            }

            var age = (c.birthYear !== undefined && currentYear !== null)
                ? currentYear - c.birthYear
                : null;

            candidates.push({
                characterId: c.id,
                name: c.name || '',
                surname: c.surname || '',
                displayName: (c.name || '') +
                    (c.surname ? ' ' + c.surname : ''),
                age: age,
                hasRole: hasRole,
                skillLevel: skillLevel
            });
        }

        var roleDisplay = position.requiredRoleId
            ? (_getRoleById(position.requiredRoleId) || {}).name || 'Unknown'
            : 'None';

        var candidatesHtml = _buildCandidateList(candidates, position);
        var history = _residence.getStaffAssignments(residenceId, {
            positionId: positionId,
            activeOnly: false
        });
        var historyHtml = _buildRecentHistory(history, 5);

        var content =
            '<div style="margin-bottom:12px;padding:8px;background:var(--bg2);border-radius:6px;">' +
                '<strong>Residence:</strong> ' + _escapeHtml(residence.name) + '<br>' +
                '<strong>Position:</strong> ' + _escapeHtml(position.name) +
                (position.unitNumber !== null && position.unitNumber !== undefined
                    ? ' (Unit ' + position.unitNumber + ')' : '') +
                '<br><strong>Required Role:</strong> ' +
                    _escapeHtml(roleDisplay) +
                (position.minSkillLevel > 0
                    ? ' · <strong>Min Skill:</strong> ' + position.minSkillLevel
                    : '') +
            '</div>' +

            '<div style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Select Character</label>' +
                candidatesHtml +
            '</div>' +

            '<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">' +
                '<button data-action="select-other" style="padding:3px 10px;font-size:0.55rem;background:var(--accent-dim);border:1px solid var(--accent);border-radius:4px;cursor:pointer;">Select Other Character</button>' +
            '</div>' +

            '<div style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Custom Title</label>' +
                '<input type="text" data-field="title" value="' +
                    _escapeHtml(position.name) +
                    '" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
            '</div>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">' +
                '<div>' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Start Year</label>' +
                    '<input type="number" data-field="startYear" value="' +
                        (currentYear !== null ? currentYear : '') +
                        '" min="1" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
                '</div>' +
                '<div>' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">End Year</label>' +
                    '<input type="number" data-field="endYear" placeholder="Leave empty for ongoing" min="1" ' +
                        'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
                    '<small style="font-size:0.5rem;color:var(--dim);">If set, this assignment will be historical.</small>' +
                '</div>' +
            '</div>' +

            '<div style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Notes</label>' +
                '<textarea data-field="notes" rows="2" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);"></textarea>' +
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
                    _showToast('Please select a character', 'error');
                    return false;
                }

                var startYear = _parseIntOrNull(
                    (root.querySelector('[data-field="startYear"]') || {}).value);
                if (startYear === null || startYear < 1) {
                    _showToast('Start year is required', 'error');
                    return false;
                }

                var endYearRaw = (root.querySelector('[data-field="endYear"]') || {}).value;
                var endYear = (endYearRaw === '' || endYearRaw === undefined)
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

                var title = ((root.querySelector('[data-field="title"]') || {}).value || '').trim() ||
                    position.name;
                var notes = (root.querySelector('[data-field="notes"]') || {}).value || '';

                var result = _residence.assignCharacterToStaffPosition(
                    residenceId,
                    positionId,
                    characterId,
                    {
                        startYear: startYear,
                        endYear: endYear,
                        title: title,
                        notes: notes,
                        skillLevelAtAssignment: DEFAULT_SKILL_LEVEL
                    }
                );

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
            _wireCandidateSelection(root, residenceId, positionId, onSuccess);
        }), 0);

        return handle;
    }

    function _buildCandidateList(candidates, position) {
        if (candidates.length === 0) {
            return '<div style="color:var(--dim);text-align:center;padding:20px;font-size:0.6rem;">' +
                'No available characters' +
            '</div>';
        }

        var html = '<div style="max-height:250px;overflow-y:auto;">';
        for (var i = 0; i < candidates.length; i++) {
            var c = candidates[i];
            var roleIndicator = position.requiredRoleId
                ? (c.hasRole
                    ? '<span style="font-size:0.45rem;color:var(--success);">has role</span>'
                    : '<span style="font-size:0.45rem;color:var(--warn);">missing role</span>')
                : '';
            var skillText = c.skillLevel > 0
                ? '<span style="font-size:0.45rem;color:var(--accent);">(Skill: ' +
                    c.skillLevel + ')</span>'
                : '';
            var ageText = c.age !== null
                ? ' <span style="font-size:0.5rem;color:var(--dim);">' +
                    c.age + 'y</span>'
                : '';

            html += '<div class="staff-candidate" data-character-id="' +
                _escapeHtml(c.characterId) +
                '" style="padding:8px 10px;margin-bottom:4px;background:var(--bg2);' +
                'border:1px solid var(--border);border-left:3px solid ' +
                    (position.requiredRoleId && !c.hasRole
                        ? 'var(--warn)' : 'var(--success)') +
                ';border-radius:4px;cursor:pointer;transition:background 0.1s;">' +
                '<div>' +
                    '<strong>' + _escapeHtml(c.displayName) + '</strong>' +
                    ageText +
                    ' ' + roleIndicator + ' ' + skillText +
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
            var color = !h.endYear ? 'var(--success)' : 'var(--dim)';
            var roleName = h.roleIdAtAssignment
                ? (_getRoleById(h.roleIdAtAssignment) || {}).name || null
                : null;

            html += '<div style="display:flex;justify-content:space-between;padding:4px 0;' +
                'border-bottom:1px solid var(--border-light);font-size:0.6rem;">' +
                '<span>' + _escapeHtml(h.characterName || 'Unknown') +
                    (h.title
                        ? ' <span style="color:var(--dim);">(' +
                            _escapeHtml(h.title) + ')</span>'
                        : '') +
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

    function _wireCandidateSelection(root, residenceId, positionId, onSuccess) {
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

        var otherBtn = root.querySelector('[data-action="select-other"]');
        if (otherBtn) {
            otherBtn.onclick = function() {
                _openCharacterSelector({
                    title: 'Select Character for Position',
                    onSelect: function(character) {
                        if (!character) return;
                        _closeTopModal();
                        setTimeout(function() {
                            openAssignResidenceStaffModal(
                                residenceId, positionId, onSuccess);
                        }, 0);
                    }
                });
            };
        }
    }

    // =========================================================================
    // 8. VIEW STAFF POSITIONS MODAL (pure projection)
    // =========================================================================

    function openViewResidenceStaffPositionsModal(residenceId, onSelect) {
        var residence = _residence.getResidence(residenceId);
        if (!residence) {
            _showToast('Residence not found', 'error');
            return null;
        }

        var positions = _residence.getStaffPositions(residenceId);
        var assignments = _residence.getStaffAssignments(residenceId, {
            activeOnly: true
        });

        var assignmentMap = {};
        for (var i = 0; i < assignments.length; i++) {
            var a = assignments[i];
            if (!assignmentMap[a.positionId]) assignmentMap[a.positionId] = [];
            assignmentMap[a.positionId].push(a);
        }

        var rows = '';
        if (positions.length === 0) {
            rows = '<div style="color:var(--dim);text-align:center;padding:40px;font-size:0.6rem;">' +
                'No staff positions created' +
            '</div>';
        } else {
            rows = '<div style="display:flex;flex-direction:column;gap:6px;">';
            for (var p = 0; p < positions.length; p++) {
                var pos = positions[p];
                var activeCount = (assignmentMap[pos.id] || []).length;
                var roleName = pos.requiredRoleId
                    ? (_getRoleById(pos.requiredRoleId) || {}).name || 'Unknown'
                    : 'None';

                rows += '<div class="position-item" data-position-id="' +
                    _escapeHtml(pos.id) +
                    '" style="background:var(--bg3);border:1px solid var(--border);' +
                    'border-radius:6px;padding:10px 12px;cursor:pointer;">' +
                    '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:6px;">' +
                        '<div>' +
                            '<strong>' + _escapeHtml(pos.name) + '</strong>' +
                            (pos.unitNumber !== null && pos.unitNumber !== undefined
                                ? '<span style="font-size:0.55rem;color:var(--dim);margin-left:8px;">Unit ' +
                                    pos.unitNumber + '</span>'
                                : '') +
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
                    (pos.notes
                        ? '<div style="font-size:0.5rem;color:var(--dim);margin-top:2px;">' +
                            _escapeHtml(pos.notes) + '</div>'
                        : '') +
                '</div>';
            }
            rows += '</div>';
        }

        var content =
            '<div style="margin-bottom:16px;padding:12px;background:var(--bg2);border-radius:8px;">' +
                '<strong>Residence:</strong> ' + _escapeHtml(residence.name) +
                '<div style="font-size:0.6rem;color:var(--dim);margin-top:4px;">' +
                    positions.length + ' staff positions · ' +
                    assignments.length + ' active assignments' +
                '</div>' +
            '</div>' +
            rows +
            '<div style="margin-top:12px;padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;">' +
                'Click on a position to manage it.' +
            '</div>';

        var handle = _openModal({
            title: 'Staff Positions: ' + residence.name,
            content: content,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function() { /* close only */ }
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
                })(items[j]);
            }
        }), 0);

        return handle;
    }

    // =========================================================================
    // 9. VIEW STAFF ASSIGNMENTS MODAL (pure projection + one mutation path)
    // =========================================================================

    function openViewResidenceStaffAssignmentsModal(residenceId) {
        var residence = _residence.getResidence(residenceId);
        if (!residence) {
            _showToast('Residence not found', 'error');
            return null;
        }

        var assignments = _residence.getStaffAssignments(residenceId, {
            activeOnly: true
        });
        var positions = _residence.getStaffPositions(residenceId);
        var positionMap = {};
        for (var i = 0; i < positions.length; i++) {
            positionMap[positions[i].id] = positions[i];
        }

        var rows = '';
        if (assignments.length === 0) {
            rows = '<div style="color:var(--dim);text-align:center;padding:40px;font-size:0.6rem;">' +
                'No staff assignments' +
            '</div>';
        } else {
            rows = '<div style="display:flex;flex-direction:column;gap:4px;">';
            for (var j = 0; j < assignments.length; j++) {
                var asg = assignments[j];
                var pos = positionMap[asg.positionId];
                var roleName = asg.roleIdAtAssignment
                    ? (_getRoleById(asg.roleIdAtAssignment) || {}).name || 'Unknown'
                    : 'None';

                rows += '<div style="display:flex;justify-content:space-between;align-items:center;' +
                    'padding:8px 10px;background:var(--bg2);border-radius:4px;' +
                    'border-left:3px solid var(--accent);">' +
                    '<div>' +
                        '<strong>' + _escapeHtml(asg.characterName || 'Unknown') + '</strong>' +
                        (pos
                            ? '<span style="font-size:0.55rem;color:var(--dim);margin-left:6px;">' +
                                _escapeHtml(pos.name) + '</span>'
                            : '') +
                        (roleName !== 'None'
                            ? '<span style="font-size:0.5rem;color:var(--accent);margin-left:6px;">Role: ' +
                                _escapeHtml(roleName) + '</span>'
                            : '') +
                    '</div>' +
                    '<div style="font-size:0.5rem;color:var(--dim);display:flex;align-items:center;gap:8px;">' +
                        'Since ' + asg.startYear +
                        '<button data-action="end-assignment" data-assignment-id="' +
                            _escapeHtml(asg.id) +
                            '" style="padding:2px 6px;font-size:0.45rem;background:#8a5a20;border:none;color:white;border-radius:3px;cursor:pointer;">End</button>' +
                    '</div>' +
                '</div>';
            }
            rows += '</div>';
        }

        var content =
            '<div style="margin-bottom:16px;padding:12px;background:var(--bg2);border-radius:8px;">' +
                '<strong>Staff Assignments: ' +
                    _escapeHtml(residence.name) + '</strong>' +
                '<div style="font-size:0.6rem;color:var(--dim);margin-top:4px;">' +
                    assignments.length + ' active staff members' +
                '</div>' +
            '</div>' +
            rows +
            '<div style="margin-top:12px;padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;">' +
                'Click "End" to terminate a staff assignment.' +
            '</div>';

        var handle = _openModal({
            title: 'Staff Assignments: ' + residence.name,
            content: content,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function() { /* close only */ }
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
                                var result = _residence.endStaffAssignment(
                                    residenceId,
                                    assignmentId,
                                    currentYear,
                                    'Ended by user'
                                );
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
                                    openViewResidenceStaffAssignmentsModal(
                                        residenceId);
                                }, 0);
                            },
                            function() { /* cancelled */ }
                        );
                    };
                })(btns[b]);
            }
        }), 0);

        return handle;
    }

    // =========================================================================
    // 10. COMBINED STAFF MANAGEMENT MODAL
    // =========================================================================

    function openResidenceStaffManagementModal(residenceId, onSuccess) {
        var residence = _residence.getResidence(residenceId);
        if (!residence) {
            _showToast('Residence not found', 'error');
            return null;
        }

        var positions = _residence.getStaffPositions(residenceId);
        var assignments = _residence.getStaffAssignments(residenceId, {
            activeOnly: true
        });

        var assignmentMap = {};
        for (var i = 0; i < assignments.length; i++) {
            var a = assignments[i];
            if (!assignmentMap[a.positionId]) assignmentMap[a.positionId] = [];
            assignmentMap[a.positionId].push(a);
        }

        var rows = '';
        if (positions.length === 0) {
            rows = '<div style="color:var(--dim);text-align:center;padding:20px;font-size:0.6rem;">' +
                'No staff positions created' +
            '</div>';
        } else {
            rows = '<div style="display:flex;flex-direction:column;gap:4px;">';
            for (var p = 0; p < positions.length; p++) {
                var pos = positions[p];
                var activeCount = (assignmentMap[pos.id] || []).length;
                var roleName = pos.requiredRoleId
                    ? (_getRoleById(pos.requiredRoleId) || {}).name || 'Unknown'
                    : 'None';

                rows += '<div style="display:flex;justify-content:space-between;align-items:center;' +
                    'padding:6px 8px;background:var(--bg2);border-radius:4px;' +
                    'border-left:3px solid ' +
                    (activeCount > 0 ? 'var(--accent)' : 'var(--border)') + ';">' +
                    '<div>' +
                        '<strong>' + _escapeHtml(pos.name) + '</strong>' +
                        (pos.unitNumber !== null && pos.unitNumber !== undefined
                            ? '<span style="font-size:0.45rem;color:var(--dim);margin-left:4px;">Unit ' +
                                pos.unitNumber + '</span>'
                            : '') +
                        '<span style="font-size:0.45rem;color:var(--accent);margin-left:4px;">Role: ' +
                            _escapeHtml(roleName) + '</span>' +
                    '</div>' +
                    '<div style="display:flex;gap:4px;align-items:center;">' +
                        '<span style="font-size:0.5rem;color:var(--accent);">' +
                            activeCount + ' assigned</span>' +
                        '<button data-action="pos-assign" data-position-id="' +
                            _escapeHtml(pos.id) +
                            '" style="padding:2px 6px;font-size:0.4rem;background:var(--accent-dim);border:1px solid var(--accent);border-radius:3px;cursor:pointer;">Assign</button>' +
                        '<button data-action="pos-edit" data-position-id="' +
                            _escapeHtml(pos.id) +
                            '" style="padding:2px 6px;font-size:0.4rem;background:var(--bg3);border:1px solid var(--border);border-radius:3px;cursor:pointer;">Edit</button>' +
                        '<button data-action="pos-delete" data-position-id="' +
                            _escapeHtml(pos.id) +
                            '" style="padding:2px 6px;font-size:0.4rem;background:#8a3020;border:none;color:white;border-radius:3px;cursor:pointer;">Del</button>' +
                    '</div>' +
                '</div>';
            }
            rows += '</div>';
        }

        var content =
            '<div style="margin-bottom:16px;padding:12px;background:var(--bg2);border-radius:8px;">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">' +
                    '<div><strong>Staff Management: ' +
                        _escapeHtml(residence.name) + '</strong></div>' +
                    '<div style="font-size:0.6rem;color:var(--dim);">' +
                        positions.length + ' positions · ' +
                        assignments.length + ' assigned' +
                    '</div>' +
                '</div>' +
            '</div>' +

            '<div style="margin-bottom:12px;">' +
                '<button data-action="create-position" style="background:var(--accent);border:none;color:white;padding:4px 12px;border-radius:4px;cursor:pointer;font-size:0.65rem;">Create Position</button>' +
                '<button data-action="view-assignments" style="background:var(--bg3);border:1px solid var(--border);padding:4px 12px;border-radius:4px;cursor:pointer;font-size:0.65rem;margin-left:4px;">View Assignments</button>' +
            '</div>' +

            rows +

            '<div style="margin-top:12px;padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;">' +
                'Manage staff positions and assignments. Click "Assign" to add staff, "Edit" to modify a position, "Del" to remove it.' +
            '</div>';

        var handle = _openModal({
            title: 'Staff Management: ' + residence.name,
            content: content,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function() {
                if (typeof onSuccess === 'function') onSuccess();
                return true;
            }
        });

        setTimeout(_attachOnOpen(function(root) {
            _wireStaffManagement(root, residenceId, onSuccess);
        }), 0);

        return handle;
    }

    function _wireStaffManagement(root, residenceId, onSuccess) {
        function _reopen() {
            setTimeout(function() {
                openResidenceStaffManagementModal(residenceId, onSuccess);
            }, 0);
        }

        var createBtn = root.querySelector('[data-action="create-position"]');
        if (createBtn) {
            createBtn.onclick = function() {
                _closeTopModal();
                openCreateResidenceStaffPositionModal(residenceId, _reopen);
            };
        }

        var viewBtn = root.querySelector('[data-action="view-assignments"]');
        if (viewBtn) {
            viewBtn.onclick = function() {
                _closeTopModal();
                openViewResidenceStaffAssignmentsModal(residenceId);
            };
        }

        var assignBtns = root.querySelectorAll('[data-action="pos-assign"]');
        for (var i = 0; i < assignBtns.length; i++) {
            (function(btn) {
                btn.onclick = function() {
                    var posId = btn.dataset.positionId;
                    _closeTopModal();
                    openAssignResidenceStaffModal(residenceId, posId, _reopen);
                };
            })(assignBtns[i]);
        }

        var editBtns = root.querySelectorAll('[data-action="pos-edit"]');
        for (var j = 0; j < editBtns.length; j++) {
            (function(btn) {
                btn.onclick = function() {
                    var posId = btn.dataset.positionId;
                    _closeTopModal();
                    openEditResidenceStaffPositionModal(
                        residenceId, posId, _reopen);
                };
            })(editBtns[j]);
        }

        var deleteBtns = root.querySelectorAll('[data-action="pos-delete"]');
        for (var k = 0; k < deleteBtns.length; k++) {
            (function(btn) {
                btn.onclick = function() {
                    var posId = btn.dataset.positionId;
                    _closeTopModal();
                    openDeleteResidenceStaffPositionModal(
                        residenceId, posId, _reopen);
                };
            })(deleteBtns[k]);
        }
    }

    // =========================================================================
    // 11. EXPORTS
    // =========================================================================

    window.openCreateResidenceStaffPositionModal = openCreateResidenceStaffPositionModal;
    window.openEditResidenceStaffPositionModal = openEditResidenceStaffPositionModal;
    window.openDeleteResidenceStaffPositionModal = openDeleteResidenceStaffPositionModal;
    window.openAssignResidenceStaffModal = openAssignResidenceStaffModal;
    window.openViewResidenceStaffPositionsModal = openViewResidenceStaffPositionsModal;
    window.openViewResidenceStaffAssignmentsModal = openViewResidenceStaffAssignmentsModal;
    window.openResidenceStaffManagementModal = openResidenceStaffManagementModal;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            openCreateResidenceStaffPositionModal: openCreateResidenceStaffPositionModal,
            openEditResidenceStaffPositionModal: openEditResidenceStaffPositionModal,
            openDeleteResidenceStaffPositionModal: openDeleteResidenceStaffPositionModal,
            openAssignResidenceStaffModal: openAssignResidenceStaffModal,
            openViewResidenceStaffPositionsModal: openViewResidenceStaffPositionsModal,
            openViewResidenceStaffAssignmentsModal: openViewResidenceStaffAssignmentsModal,
            openResidenceStaffManagementModal: openResidenceStaffManagementModal
        };
    }

})();
