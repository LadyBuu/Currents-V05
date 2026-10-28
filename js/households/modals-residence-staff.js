/**
 * =============================================================================
 * STILL WATERS - RESIDENCE STAFF MODALS (modals-residence-staff.js)
 * =============================================================================
 *
 * LOCATION: js/households/modals-residence-staff.js
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
 *           accessors.js (getCharacterById, getCharacters)
 *           RoleQueries / RoleState — via HouseholdModals.getRoleById /
 *                                     getAllRoles
 *   Writes: ResidenceSystem (addStaffPosition, updateStaffPosition,
 *                            removeStaffPosition,
 *                            assignCharacterToStaffPosition,
 *                            endStaffAssignment, deleteStaffAssignment)
 *           + one persist() per mutation batch
 *   UI:     modals-core, selectors, icons, HouseholdModals,
 *           HouseholdViewModels
 *
 * CONVERGED PATTERN NOTES
 * -----------------------
 *   - Every staff mutation ends with ResidenceSystem.persist() (via
 *     HouseholdModals.persistResidenceOrFail).
 *   - No direct residence record mutation.
 *   - No direct _saveMasterData() from UI.
 *   - No _processingStaffModal guard.
 *   - addRoleIfMissing checkbox REMOVED: the current residence command
 *     does not support it. Role indicators are preserved so users can
 *     see the outcome. If the command later accepts the option, re-add
 *     the checkbox and pass addRoleIfMissing through.
 *
 * SHARED HELPERS
 * --------------
 *   Every shared helper used by this file — rootFrom, persist*OrFail,
 *   reportFailure, esc, readValue, readIntOrNull, readChecked, onOpen,
 *   currentYear, closeThen, confirmDialog, getRoleById, getAllRoles,
 *   buildRoleOptions, renderStaffCandidates, wireStaffCandidateSelection,
 *   buildRecentAssignmentHistory — lives in HouseholdModals. This file
 *   keeps only its local aliases (var _esc = _Modals.esc; etc.) and its
 *   domain-specific builders (_buildUnitOptions, the wire functions for
 *   the management modal, and the small presentation helpers).
 *
 *   Prior revisions carried local copies of getRoleById, getAllRoles,
 *   buildRoleOptions, _buildCandidateList, _wireCandidateSelection, and
 *   _buildRecentHistory. Those are now HouseholdModals exports;
 *   modals-household-staff.js and modals-residence-staff.js both call
 *   the same implementation.
 *
 * DOM-SCOPE
 * ---------
 *   Every DOM lookup is scoped to the modal's own `handle.element` via
 *   HouseholdModals.rootFrom(modal). See modals-helper.js for the full
 *   rationale on why the prior _resolveModalRoot() fallback (which
 *   ended at document.body) was wrong.
 *
 * PERSIST CONTRACT
 * ----------------
 *   ResidenceSystem.persist returns { success, data } | { success:
 *   false, code, reason } — not boolean. HouseholdModals.persistResidenceOrFail
 *   adapts the shape to { ok, reason } for the modal flows. The local
 *   wrapper that existed in prior revisions is gone.
 *
 * DEPENDENCIES (REQUIRED, verified at load):
 *   - modals-core.js (openModal, closeTopModal, confirmDialog)
 *   - accessors.js (getCharacterById, getCharacters)
 *   - household-modals-helper.js (HouseholdModals)
 *   - household-view-models.js (HouseholdViewModels)
 *   - residence-system.js (ResidenceSystem)
 *
 * DEPENDENCIES (OPTIONAL, checked at call time):
 *   - RoleQueries / RoleState — via HouseholdModals.getRoleById /
 *     getAllRoles
 *   - selectors/modals-char-selector.js (openCharacterSelector)
 *
 * ICON POLICY: SVG from icons.js. No emojis.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - Removed the local copies of _persistOrFail, _currentYear,
 *       _confirmDialog, and _closeThen. All four were structurally
 *       identical to the shared versions exported by HouseholdModals.
 *     - Removed the local copies of _getRoleById, _getAllRoles,
 *       _buildRoleOptions, _buildCandidateList, _wireCandidateSelection,
 *       and _buildRecentHistory. Those are now HouseholdModals exports;
 *       modals-household-staff.js and this file both call the same
 *       implementation, so the two staff modals stay in lockstep.
 *     - _buildCandidateList now wraps HouseholdModals.renderStaffCandidates
 *       by projecting the residence-specific candidate shape (which
 *       carries characterName/surname) to the normalized shape the
 *       shared renderer consumes.
 *     - _wireCandidateSelection now delegates the candidate-list DOM
 *       wiring to HouseholdModals.wireStaffCandidateSelection and only
 *       adds the "Select Other Character" flow, which is
 *       residence-specific.
 *     - _buildRecentHistory now wraps
 *       HouseholdModals.buildRecentAssignmentHistory with a residence-
 *       specific label resolver (residence entries carry characterName,
 *       not title).
 *     - No behavioural change to any modal entry point.
 *   Previous revisions:
 *     - Every DOM lookup scoped to handle.element via rootFrom.
 *     - addRoleIfMissing checkbox removed (residence command does not
 *       support the flag).
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. LOAD-TIME DEPENDENCY VERIFICATION
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

    var _Modals = _requireObject('HouseholdModals', window.HouseholdModals);
    _requireFunction('HouseholdModals.rootFrom', _Modals.rootFrom);
    _requireFunction('HouseholdModals.persistResidenceOrFail',
        _Modals.persistResidenceOrFail);
    _requireFunction('HouseholdModals.reportFailure', _Modals.reportFailure);
    _requireFunction('HouseholdModals.esc', _Modals.esc);
    _requireFunction('HouseholdModals.readValue', _Modals.readValue);
    _requireFunction('HouseholdModals.readIntOrNull', _Modals.readIntOrNull);
    _requireFunction('HouseholdModals.readChecked', _Modals.readChecked);
    _requireFunction('HouseholdModals.onOpen', _Modals.onOpen);
    _requireFunction('HouseholdModals.currentYear', _Modals.currentYear);
    _requireFunction('HouseholdModals.closeThen', _Modals.closeThen);
    _requireFunction('HouseholdModals.confirmDialog', _Modals.confirmDialog);
    _requireFunction('HouseholdModals.getRoleById', _Modals.getRoleById);
    _requireFunction('HouseholdModals.getAllRoles', _Modals.getAllRoles);
    _requireFunction('HouseholdModals.buildRoleOptions',
        _Modals.buildRoleOptions);
    _requireFunction('HouseholdModals.renderStaffCandidates',
        _Modals.renderStaffCandidates);
    _requireFunction('HouseholdModals.wireStaffCandidateSelection',
        _Modals.wireStaffCandidateSelection);
    _requireFunction('HouseholdModals.buildRecentAssignmentHistory',
        _Modals.buildRecentAssignmentHistory);

    var _VM = _requireObject('HouseholdViewModels', window.HouseholdViewModels);

    // Local aliases. Keep the call sites short and unchanged.
    var _esc = _Modals.esc;
    var _showSuccess = _Modals.showSuccess;
    var _showWarning = _Modals.showWarning;
    var _showInfo = _Modals.showInfo;
    var _showError = _Modals.showError;

    // Per-modal delegates to the shared helpers. The prior revision
    // defined these as standalone functions; they are now one-line
    // delegations to HouseholdModals.
    var _persistOrFail = _Modals.persistResidenceOrFail;
    var _confirmDialog = _Modals.confirmDialog;
    var _currentYear = _Modals.currentYear;
    var _closeThen = _Modals.closeThen;

    // =========================================================================
    // 1. LOCAL HELPERS
    // =========================================================================
    //
    // The role lookups, role-option builder, candidate renderer, and
    // candidate-selection wiring now live in HouseholdModals. The three
    // helpers below are residence-specific:
    //
    //   _getAllCharacters       — accessors wrapper (getCharacters may be
    //                             absent in a minimal test harness)
    //   _openCharacterSelector  — fail-loud wrapper on openCharacterSelector
    //   _buildUnitOptions       — residence-specific unit dropdown
    //
    // Everything else is a thin adapter over HouseholdModals.

    function _getAllCharacters() {
        if (typeof window.getCharacters === 'function') {
            return window.getCharacters() || [];
        }
        return [];
    }

    function _openCharacterSelector(options) {
        if (typeof window.openCharacterSelector === 'function') {
            return window.openCharacterSelector(options);
        }
        _showError('Character selector not available');
        return null;
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
    // 2. CREATE STAFF POSITION MODAL
    // =========================================================================

    function openCreateResidenceStaffPositionModal(residenceId, onSuccess) {
        var residence = _residence.getResidence(residenceId);
        if (!residence) {
            _showError('Residence not found');
            return null;
        }

        var unitOptions = _buildUnitOptions(residenceId, null);
        var roleOptions = _Modals.buildRoleOptions(null, 'No role required');

        var content =
            '<div style="margin-bottom:16px;">' +
                '<div style="background:var(--bg3);border-radius:6px;padding:8px 12px;margin-bottom:12px;font-size:0.6rem;color:var(--dim);">' +
                    'Creating a staff position for <strong>' +
                        _esc(residence.name) + '</strong>' +
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

        var modal = _openModal({
            title: 'Create Residence Staff Position',
            content: content,
            confirmText: 'Create Position',
            cancelText: 'Cancel',
            onConfirm: function() {
                var root = _Modals.rootFrom(modal);
                if (!root) {
                    _showError('Modal root unavailable');
                    return false;
                }

                var name = _Modals.readValue(root, '[data-field="name"]').trim();
                if (!name) {
                    _showError('Position name is required');
                    return false;
                }

                var unitNumberRaw = _Modals.readValue(root, '[data-field="unitNumber"]');
                var unitNumber = unitNumberRaw === ''
                    ? null
                    : _Modals.readIntOrNull(root, '[data-field="unitNumber"]');
                if (unitNumberRaw !== '' && unitNumber === null) {
                    _showError('Invalid unit number');
                    return false;
                }

                var requiredRoleId =
                    _Modals.readValue(root, '[data-field="requiredRoleId"]') || null;

                var minSkillLevel = _Modals.readIntOrNull(
                    root, '[data-field="minSkillLevel"]');
                if (minSkillLevel === null) minSkillLevel = 0;

                var notes = _Modals.readValue(root, '[data-field="notes"]').trim();

                var result = _residence.addStaffPosition(residenceId, {
                    name: name,
                    unitNumber: unitNumber,
                    requiredRoleId: requiredRoleId,
                    minSkillLevel: minSkillLevel,
                    notes: notes
                });

                if (!result.success) {
                    _Modals.reportFailure(result, 'Failed to create position');
                    return false;
                }

                var persisted = _persistOrFail('Position created');
                if (!persisted.ok) {
                    return false;
                }

                _showSuccess('Position "' + name + '" created');
                if (typeof onSuccess === 'function') onSuccess(result.data);
                return true;
            }
        });

        return modal;
    }

    // =========================================================================
    // 3. EDIT STAFF POSITION MODAL
    // =========================================================================

    function openEditResidenceStaffPositionModal(residenceId, positionId, onSuccess) {
        var residence = _residence.getResidence(residenceId);
        if (!residence) {
            _showError('Residence not found');
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
            _showError('Position not found');
            return null;
        }

        var unitOptions = _buildUnitOptions(residenceId, position.unitNumber);
        var roleOptions = _Modals.buildRoleOptions(
            position.requiredRoleId, 'No role required');

        var content =
            '<div style="margin-bottom:16px;">' +
                '<div style="background:var(--bg3);border-radius:6px;padding:8px 12px;margin-bottom:12px;font-size:0.6rem;color:var(--dim);">' +
                    'Editing staff position for <strong>' +
                        _esc(residence.name) + '</strong>' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Position Name *</label>' +
                    '<input type="text" data-field="name" value="' +
                        _esc(position.name) +
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
                        _esc(position.notes || '') +
                    '</textarea>' +
                '</div>' +
            '</div>';

        var modal = _openModal({
            title: 'Edit Staff Position: ' + position.name,
            content: content,
            confirmText: 'Save Changes',
            cancelText: 'Cancel',
            onConfirm: function() {
                var root = _Modals.rootFrom(modal);
                if (!root) {
                    _showError('Modal root unavailable');
                    return false;
                }

                var name = _Modals.readValue(root, '[data-field="name"]').trim();
                if (!name) {
                    _showError('Position name is required');
                    return false;
                }

                var unitNumberRaw = _Modals.readValue(root, '[data-field="unitNumber"]');
                var unitNumber = unitNumberRaw === ''
                    ? null
                    : _Modals.readIntOrNull(root, '[data-field="unitNumber"]');
                if (unitNumberRaw !== '' && unitNumber === null) {
                    _showError('Invalid unit number');
                    return false;
                }

                var requiredRoleId =
                    _Modals.readValue(root, '[data-field="requiredRoleId"]') || null;

                var minSkillLevel = _Modals.readIntOrNull(
                    root, '[data-field="minSkillLevel"]');
                if (minSkillLevel === null) minSkillLevel = 0;

                var notes = _Modals.readValue(root, '[data-field="notes"]').trim();

                var result = _residence.updateStaffPosition(
                    residenceId, positionId, {
                        name: name,
                        unitNumber: unitNumber,
                        requiredRoleId: requiredRoleId,
                        minSkillLevel: minSkillLevel,
                        notes: notes
                    });

                if (!result.success) {
                    _Modals.reportFailure(result, 'Failed to update position');
                    return false;
                }

                var persisted = _persistOrFail('Position updated');
                if (!persisted.ok) {
                    return false;
                }

                _showSuccess('Position updated');
                if (typeof onSuccess === 'function') onSuccess(result.data);
                return true;
            }
        });

        return modal;
    }

    // =========================================================================
    // 4. DELETE STAFF POSITION MODAL
    // =========================================================================

    function openDeleteResidenceStaffPositionModal(residenceId, positionId, onSuccess) {
        var residence = _residence.getResidence(residenceId);
        if (!residence) {
            _showError('Residence not found');
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
            _showError('Position not found');
            return null;
        }

        var activeAssignments = _residence.getStaffAssignments(residenceId, {
            positionId: positionId,
            activeOnly: true
        });

        var roleName = position.requiredRoleId
            ? (_Modals.getRoleById(position.requiredRoleId) || {}).name || 'Unknown'
            : null;

        var content =
            '<div style="margin-bottom:16px;">' +
                '<div style="background:rgba(200,68,68,0.15);border:1px solid var(--warn);border-radius:8px;padding:12px;margin-bottom:16px;">' +
                    '<strong>Delete Staff Position: ' +
                        _esc(position.name) + '</strong>' +
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
                            _esc(position.name) + '</strong></span>' +
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
                            '<span>' + _esc(roleName) + '</span>' +
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

        var modal = _openModal({
            title: 'Delete Staff Position: ' + position.name,
            content: content,
            confirmText: 'Delete Position',
            cancelText: 'Cancel',
            confirmStyle: 'danger',
            onConfirm: function() {
                var root = _Modals.rootFrom(modal);
                if (!root) {
                    _showError('Modal root unavailable');
                    return false;
                }

                var removeAssignments = _Modals.readChecked(
                    root, '[data-field="removeAssignments"]');

                var result = _residence.removeStaffPosition(
                    residenceId, positionId, {
                        removeAssignments: removeAssignments
                    });

                if (!result.success) {
                    _Modals.reportFailure(result, 'Failed to delete position');
                    return false;
                }

                var persisted = _persistOrFail('Position deleted');
                if (!persisted.ok) {
                    return false;
                }

                _showInfo('Position "' + position.name + '" deleted');
                if (typeof onSuccess === 'function') onSuccess(result.data);
                return true;
            }
        });

        return modal;
    }

    // =========================================================================
    // 5. ASSIGN STAFF MODAL
    // =========================================================================
    //
    // Note: the residence command does not support addRoleIfMissing. The
    // old checkbox is removed. Role indicators (has role / missing role)
    // are preserved so users can see the outcome.
    //
    // The candidate list rendering is delegated to
    // HouseholdModals.renderStaffCandidates via _buildCandidateList
    // (which projects residence-specific candidate objects to the
    // shared normalized shape). The wiring is delegated to
    // HouseholdModals.wireStaffCandidateSelection via
    // _wireCandidateSelection (which adds the "select other character"
    // flow that is residence-specific).

    function openAssignResidenceStaffModal(residenceId, positionId, onSuccess) {
        var residence = _residence.getResidence(residenceId);
        if (!residence) {
            _showError('Residence not found');
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
            _showError('Position not found');
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
            ? (_Modals.getRoleById(position.requiredRoleId) || {}).name || 'Unknown'
            : 'None';

        var candidatesHtml = _Modals.renderStaffCandidates(candidates, position);
        var history = _residence.getStaffAssignments(residenceId, {
            positionId: positionId,
            activeOnly: false
        });
        var historyHtml = _buildRecentHistory(history, 5);

        var content =
            '<div style="margin-bottom:12px;padding:8px;background:var(--bg2);border-radius:6px;">' +
                '<strong>Residence:</strong> ' + _esc(residence.name) + '<br>' +
                '<strong>Position:</strong> ' + _esc(position.name) +
                (position.unitNumber !== null && position.unitNumber !== undefined
                    ? ' (Unit ' + position.unitNumber + ')' : '') +
                '<br><strong>Required Role:</strong> ' +
                    _esc(roleDisplay) +
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
                    _esc(position.name) +
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

        var modal = _openModal({
            title: 'Assign Staff to ' + position.name,
            content: content,
            confirmText: 'Assign Staff',
            cancelText: 'Cancel',
            onConfirm: function() {
                var root = _Modals.rootFrom(modal);
                if (!root) {
                    _showError('Modal root unavailable');
                    return false;
                }

                var selected = root.querySelector('.staff-candidate.selected');
                var characterId = selected ? selected.dataset.characterId : null;
                if (!characterId) {
                    _showError('Please select a character');
                    return false;
                }

                var startYear = _Modals.readIntOrNull(root, '[data-field="startYear"]');
                if (startYear === null || startYear < 1) {
                    _showError('Start year is required');
                    return false;
                }

                var endYearRaw = _Modals.readValue(root, '[data-field="endYear"]');
                var endYear = null;
                if (endYearRaw !== '') {
                    endYear = _Modals.readIntOrNull(root, '[data-field="endYear"]');
                    if (endYear === null) {
                        _showError('End year must be a valid year');
                        return false;
                    }
                }
                if (endYear !== null && endYear <= startYear) {
                    _showError('End year must be after start year');
                    return false;
                }

                var title = _Modals.readValue(root, '[data-field="title"]').trim() ||
                    position.name;
                var notes = _Modals.readValue(root, '[data-field="notes"]');

                var result = _residence.assignCharacterToStaffPosition(
                    residenceId,
                    positionId,
                    characterId,
                    {
                        startYear: startYear,
                        endYear: endYear,
                        title: title,
                        notes: notes,
                        skillLevelAtAssignment: _VM.DEFAULT_SKILL_LEVEL
                    }
                );

                if (!result.success) {
                    _Modals.reportFailure(result, 'Failed to assign staff');
                    return false;
                }

                var persisted = _persistOrFail('Staff assigned');
                if (!persisted.ok) {
                    return false;
                }

                _showSuccess('Staff assigned to ' + position.name);
                if (typeof onSuccess === 'function') onSuccess(result.data);
                return true;
            }
        });

        _Modals.onOpen(modal, function(root) {
            _wireCandidateSelection(root, residenceId, positionId, onSuccess);
        });

        return modal;
    }

    // =========================================================================
    // 6. CANDIDATE WIRING ADAPTERS
    // =========================================================================
    //
    // The shared helpers live in HouseholdModals. These two adapters
    // exist because the residence staff modal adds the "Select Other
    // Character" flow (openCharacterSelector then reopen this modal),
    // which is residence-specific. The candidate-list wiring itself is
    // delegated.

    /**
     * Wires the candidate list plus the "Select Other Character" flow.
     * Delegates the candidate-list wiring to
     * HouseholdModals.wireStaffCandidateSelection.
     *
     * @param {HTMLElement} root
     * @param {string} residenceId
     * @param {string} positionId
     * @param {Function} onSuccess
     */
    function _wireCandidateSelection(root, residenceId, positionId, onSuccess) {
        _Modals.wireStaffCandidateSelection(root, {
            onSelectOther: function() {
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
            }
        });
    }

    /**
     * Wraps HouseholdModals.buildRecentAssignmentHistory with a
     * residence-specific label resolver. Residence staff assignments
     * carry `characterName`, not `title`, so the label resolver picks
     * the right field.
     */
    function _buildRecentHistory(history, limit) {
        return _Modals.buildRecentAssignmentHistory(
            history,
            limit,
            function resolveRoleName(roleId) {
                var role = _Modals.getRoleById(roleId);
                return role ? role.name : null;
            },
            function resolveName(entry) {
                return entry.characterName || entry.title || 'Unknown';
            }
        );
    }

    // =========================================================================
    // 7. VIEW STAFF POSITIONS MODAL (pure projection)
    // =========================================================================

    function openViewResidenceStaffPositionsModal(residenceId, onSelect) {
        var residence = _residence.getResidence(residenceId);
        if (!residence) {
            _showError('Residence not found');
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
                    ? (_Modals.getRoleById(pos.requiredRoleId) || {}).name || 'Unknown'
                    : 'None';

                rows += '<div class="position-item" data-position-id="' +
                    _esc(pos.id) +
                    '" style="background:var(--bg3);border:1px solid var(--border);' +
                    'border-radius:6px;padding:10px 12px;cursor:pointer;">' +
                    '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:6px;">' +
                        '<div>' +
                            '<strong>' + _esc(pos.name) + '</strong>' +
                            (pos.unitNumber !== null && pos.unitNumber !== undefined
                                ? '<span style="font-size:0.55rem;color:var(--dim);margin-left:8px;">Unit ' +
                                    pos.unitNumber + '</span>'
                                : '') +
                            '<span style="font-size:0.55rem;color:var(--accent);margin-left:8px;">Role: ' +
                                _esc(roleName) + '</span>' +
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
                            _esc(pos.notes) + '</div>'
                        : '') +
                '</div>';
            }
            rows += '</div>';
        }

        var content =
            '<div style="margin-bottom:16px;padding:12px;background:var(--bg2);border-radius:8px;">' +
                '<strong>Residence:</strong> ' + _esc(residence.name) +
                '<div style="font-size:0.6rem;color:var(--dim);margin-top:4px;">' +
                    positions.length + ' staff positions · ' +
                    assignments.length + ' active assignments' +
                '</div>' +
            '</div>' +
            rows +
            '<div style="margin-top:12px;padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;">' +
                'Click on a position to manage it.' +
            '</div>';

        var modal = _openModal({
            title: 'Staff Positions: ' + residence.name,
            content: content,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function() { /* close only */ }
        });

        _Modals.onOpen(modal, function(root) {
            var items = root.querySelectorAll('.position-item');
            for (var j = 0; j < items.length; j++) {
                (function(el) {
                    el.onclick = function() {
                        var posId = el.dataset.positionId;
                        _closeTopModal();
                        setTimeout(function() {
                            if (typeof onSelect === 'function') onSelect(posId);
                        }, 0);
                    };
                })(items[j]);
            }
        });

        return modal;
    }

    // =========================================================================
    // 8. VIEW STAFF ASSIGNMENTS MODAL (pure projection + one mutation path)
    // =========================================================================

    function openViewResidenceStaffAssignmentsModal(residenceId) {
        var residence = _residence.getResidence(residenceId);
        if (!residence) {
            _showError('Residence not found');
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
                    ? (_Modals.getRoleById(asg.roleIdAtAssignment) || {}).name || 'Unknown'
                    : 'None';

                rows += '<div style="display:flex;justify-content:space-between;align-items:center;' +
                    'padding:8px 10px;background:var(--bg2);border-radius:4px;' +
                    'border-left:3px solid var(--accent);">' +
                    '<div>' +
                        '<strong>' + _esc(asg.characterName || 'Unknown') + '</strong>' +
                        (pos
                            ? '<span style="font-size:0.55rem;color:var(--dim);margin-left:6px;">' +
                                _esc(pos.name) + '</span>'
                            : '') +
                        (roleName !== 'None'
                            ? '<span style="font-size:0.5rem;color:var(--accent);margin-left:6px;">Role: ' +
                                _esc(roleName) + '</span>'
                            : '') +
                    '</div>' +
                    '<div style="font-size:0.5rem;color:var(--dim);display:flex;align-items:center;gap:8px;">' +
                        'Since ' + asg.startYear +
                        '<button data-action="end-assignment" data-assignment-id="' +
                            _esc(asg.id) +
                            '" style="padding:2px 6px;font-size:0.45rem;background:#8a5a20;border:none;color:white;border-radius:3px;cursor:pointer;">End</button>' +
                    '</div>' +
                '</div>';
            }
            rows += '</div>';
        }

        var content =
            '<div style="margin-bottom:16px;padding:12px;background:var(--bg2);border-radius:8px;">' +
                '<strong>Staff Assignments: ' +
                    _esc(residence.name) + '</strong>' +
                '<div style="font-size:0.6rem;color:var(--dim);margin-top:4px;">' +
                    assignments.length + ' active staff members' +
                '</div>' +
            '</div>' +
            rows +
            '<div style="margin-top:12px;padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;">' +
                'Click "End" to terminate a staff assignment.' +
            '</div>';

        var modal = _openModal({
            title: 'Staff Assignments: ' + residence.name,
            content: content,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function() { /* close only */ }
        });

        _Modals.onOpen(modal, function(root) {
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
                                    _Modals.reportFailure(result,
                                        'Failed to end assignment');
                                    return;
                                }

                                var persisted = _persistOrFail('Assignment ended');
                                if (!persisted.ok) {
                                    return;
                                }

                                _showSuccess('Assignment ended');
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
        });

        return modal;
    }

    // =========================================================================
    // 9. COMBINED STAFF MANAGEMENT MODAL
    // =========================================================================

    function openResidenceStaffManagementModal(residenceId, onSuccess) {
        var residence = _residence.getResidence(residenceId);
        if (!residence) {
            _showError('Residence not found');
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
                    ? (_Modals.getRoleById(pos.requiredRoleId) || {}).name || 'Unknown'
                    : 'None';

                rows += '<div style="display:flex;justify-content:space-between;align-items:center;' +
                    'padding:6px 8px;background:var(--bg2);border-radius:4px;' +
                    'border-left:3px solid ' +
                    (activeCount > 0 ? 'var(--accent)' : 'var(--border)') + ';">' +
                    '<div>' +
                        '<strong>' + _esc(pos.name) + '</strong>' +
                        (pos.unitNumber !== null && pos.unitNumber !== undefined
                            ? '<span style="font-size:0.45rem;color:var(--dim);margin-left:4px;">Unit ' +
                                pos.unitNumber + '</span>'
                            : '') +
                        '<span style="font-size:0.45rem;color:var(--accent);margin-left:4px;">Role: ' +
                            _esc(roleName) + '</span>' +
                    '</div>' +
                    '<div style="display:flex;gap:4px;align-items:center;">' +
                        '<span style="font-size:0.5rem;color:var(--accent);">' +
                            activeCount + ' assigned</span>' +
                        '<button data-action="pos-assign" data-position-id="' +
                            _esc(pos.id) +
                            '" style="padding:2px 6px;font-size:0.4rem;background:var(--accent-dim);border:1px solid var(--accent);border-radius:3px;cursor:pointer;">Assign</button>' +
                        '<button data-action="pos-edit" data-position-id="' +
                            _esc(pos.id) +
                            '" style="padding:2px 6px;font-size:0.4rem;background:var(--bg3);border:1px solid var(--border);border-radius:3px;cursor:pointer;">Edit</button>' +
                        '<button data-action="pos-delete" data-position-id="' +
                            _esc(pos.id) +
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
                        _esc(residence.name) + '</strong></div>' +
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

        var modal = _openModal({
            title: 'Staff Management: ' + residence.name,
            content: content,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function() {
                if (typeof onSuccess === 'function') onSuccess();
                return true;
            }
        });

        _Modals.onOpen(modal, function(root) {
            _wireStaffManagement(root, residenceId, onSuccess);
        });

        return modal;
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
                _closeThen(function() {
                    openCreateResidenceStaffPositionModal(residenceId, _reopen);
                });
            };
        }

        var viewBtn = root.querySelector('[data-action="view-assignments"]');
        if (viewBtn) {
            viewBtn.onclick = function() {
                _closeThen(function() {
                    openViewResidenceStaffAssignmentsModal(residenceId);
                });
            };
        }

        var assignBtns = root.querySelectorAll('[data-action="pos-assign"]');
        for (var i = 0; i < assignBtns.length; i++) {
            (function(btn) {
                btn.onclick = function() {
                    var posId = btn.dataset.positionId;
                    _closeThen(function() {
                        openAssignResidenceStaffModal(residenceId, posId, _reopen);
                    });
                };
            })(assignBtns[i]);
        }

        var editBtns = root.querySelectorAll('[data-action="pos-edit"]');
        for (var j = 0; j < editBtns.length; j++) {
            (function(btn) {
                btn.onclick = function() {
                    var posId = btn.dataset.positionId;
                    _closeThen(function() {
                        openEditResidenceStaffPositionModal(
                            residenceId, posId, _reopen);
                    });
                };
            })(editBtns[j]);
        }

        var deleteBtns = root.querySelectorAll('[data-action="pos-delete"]');
        for (var k = 0; k < deleteBtns.length; k++) {
            (function(btn) {
                btn.onclick = function() {
                    var posId = btn.dataset.positionId;
                    _closeThen(function() {
                        openDeleteResidenceStaffPositionModal(
                            residenceId, posId, _reopen);
                    });
                };
            })(deleteBtns[k]);
        }
    }

    // =========================================================================
    // 10. EXPORTS
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
