/**
 * =============================================================================
 * STILL WATERS - HOUSEHOLD STAFF POSITION MODALS (modals-household-staff.js)
 * =============================================================================
 *
 * LOCATION: js/households/modals-household-staff.js
 *
 * PURPOSE
 * -------
 * Modal entry points for household staff position management.
 *
 * Reads:  HouseholdQueries, RoleQueries (via HouseholdModals.getRoleById /
 *         getAllRoles — RoleQueries not a hard dependency)
 * Writes: HouseholdCommands + one persist() per batch
 * UI:     modals-core, selectors, icons, HouseholdModals, HouseholdViewModels
 *
 * CONVERGED PATTERN NOTES
 * -----------------------
 *   - Every mutation batch invokes HouseholdCommands.* then one
 *     HouseholdCommands.persist() at the end (via
 *     HouseholdModals.persistOrFail).
 *   - Position create / update / delete: one command + one persist.
 *   - Single assignment: one command + one persist.
 *   - Bulk assignment: one bulkAssign command (which internally commits
 *     once) + one persist in the modal.
 *   - Assignment end / delete: one command + one persist.
 *   - No HouseholdState access.
 *   - No _processingStaffModal guard.
 *
 * ADD-ROLE-IF-MISSING
 * -------------------
 *   The single-assignment modal exposes an "Add role if missing"
 *   checkbox. When checked, it passes `options.addRoleIfMissing: true`
 *   and `options.defaultSkillLevel` to
 *   HouseholdCommands.assignCharacterToPosition, which honors the flag.
 *   If the role-add fails, the command returns ROLE_ADD_FAILED and the
 *   modal reports the failure and keeps open.
 *
 *   When unchecked, the assignment proceeds and the result carries
 *   `roleWarning` (if applicable). The modal surfaces that warning as
 *   an informational toast, and the assignment still succeeds.
 *
 *   The bulk-assign modal does not expose the checkbox — bulkAssign
 *   defaults to addRoleIfMissing based on the caller's options. The
 *   modal passes `addRoleIfMissing: true` unconditionally for the bulk
 *   path because bulk assignment is an administrative action where the
 *   user expects the roles to be added if required; the warnings array
 *   in the result captures any per-entry role warning that arises.
 *
 *   If bulkAssign's role-add path fails for one entry, that entry is
 *   reported in result.data.failed with code ROLE_ADD_FAILED, and the
 *   rest of the batch continues.
 *
 * SHARED HELPERS
 * --------------
 *   Every shared helper used by this file — rootFrom, persistOrFail,
 *   reportFailure, esc, readValue, readIntOrNull, readChecked, onOpen,
 *   currentYear, closeThen, confirmDialog, getRoleById, getAllRoles,
 *   buildRoleOptions, renderStaffCandidates, wireStaffCandidateSelection,
 *   buildRecentAssignmentHistory — lives in HouseholdModals. This file
 *   keeps only its local aliases (var _esc = _Modals.esc; etc.) and its
 *   domain-specific builders (_buildDepartmentOptions, the wire functions
 *   for the management modal, and the small presentation helpers).
 *
 *   Prior revisions carried local copies of getRoleById, getAllRoles,
 *   buildRoleOptions, _buildCandidateList, _wireCandidateSelection, and
 *   _buildRecentHistory. Those are now HouseholdModals exports;
 *   modals-residence-staff.js and this file both call the same
 *   implementation, so the two staff modals stay in lockstep.
 *
 * DEFAULT_SKILL_LEVEL
 * -------------------
 *   The prior version defined `var DEFAULT_SKILL_LEVEL = 10;` locally.
 *   That value now lives in HouseholdViewModels.DEFAULT_SKILL_LEVEL.
 *   This module reads from there so there's one canonical number.
 *   (Mirrors the same consolidation in modals-residence-staff.js.)
 *
 * DOM-SCOPE
 * ---------
 *   Every DOM lookup is scoped to the modal's own `handle.element` via
 *   HouseholdModals.rootFrom(modal). See modals-helper.js for the full
 *   rationale on why the prior _resolveModalRoot() fallback (which
 *   ended at document.body) was wrong.
 *
 * DEPENDENCIES (REQUIRED, verified at load):
 *   - modals-core.js (openModal, closeTopModal, confirmDialog)
 *   - accessors.js (getCharacterById, getCharacters)
 *   - household-queries.js (HouseholdQueries)
 *   - household-commands.js (HouseholdCommands)
 *   - household-modals-helper.js (HouseholdModals)
 *   - household-view-models.js (HouseholdViewModels)
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
 *       modals-residence-staff.js and this file both call the same
 *       implementation.
 *     - The assign-staff modal now delegates candidate-list rendering to
 *       HouseholdModals.renderStaffCandidates (projecting the household
 *       member shape to the shared normalized candidate shape) and DOM
 *       wiring to HouseholdModals.wireStaffCandidateSelection.
 *     - The recent-history block now delegates to
 *       HouseholdModals.buildRecentAssignmentHistory with a household-
 *       specific label resolver (household assignment entries carry
 *       characterName/title, not the residence-side shape).
 *     - No behavioural change to any modal entry point.
 *   Previous revisions:
 *     - assignStaff modal wired addRoleIfMissing through to
 *       HouseholdCommands.assignCharacterToPosition.
 *     - bulkAssign modal passed addRoleIfMissing: true through to
 *       HouseholdCommands.bulkAssign.
 *     - Every DOM lookup scoped to handle.element via rootFrom.
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. LOAD-TIME DEPENDENCY VERIFICATION
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
    _requireFunction('HouseholdQueries.getHouseholdDepartments',
        _queries.getHouseholdDepartments);
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

    var _Modals = _requireObject('HouseholdModals', window.HouseholdModals);
    _requireFunction('HouseholdModals.rootFrom', _Modals.rootFrom);
    _requireFunction('HouseholdModals.persistOrFail', _Modals.persistOrFail);
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
    var _persistOrFail = _Modals.persistOrFail;
    var _confirmDialog = _Modals.confirmDialog;
    var _currentYear = _Modals.currentYear;
    var _closeThen = _Modals.closeThen;

    // =========================================================================
    // 1. LOCAL HELPERS
    // =========================================================================
    //
    // The role lookups, role-option builder, candidate renderer, and
    // candidate-selection wiring now live in HouseholdModals. The two
    // helpers below are household-specific:
    //
    //   _openCharacterSelector  — fail-loud wrapper on openCharacterSelector
    //   _buildDepartmentOptions — household-specific department dropdown
    //
    // Everything else is a thin adapter over HouseholdModals.

    function _openCharacterSelector(options) {
        if (typeof window.openCharacterSelector === 'function') {
            return window.openCharacterSelector(options);
        }
        _showError('Character selector not available');
        return null;
    }

    function _buildDepartmentOptions(householdId, selectedId) {
        var html = '<option value="">None</option>';
        var departments = _queries.getHouseholdDepartments(householdId);
        if (!Array.isArray(departments)) return html;

        for (var i = 0; i < departments.length; i++) {
            var d = departments[i];
            var selected = (d.id === selectedId) ? ' selected' : '';
            html += '<option value="' + _esc(d.id) + '"' + selected + '>' +
                _esc(d.name) + '</option>';
        }
        return html;
    }

    // =========================================================================
    // 2. CREATE POSITION MODAL
    // =========================================================================

    function openCreateHouseholdPositionModal(householdId, onSuccess) {
        var household = _queries.getHousehold(householdId);
        if (!household) {
            _showError('Household not found');
            return null;
        }

        var departmentOptionsHtml = _buildDepartmentOptions(householdId, null);
        var roleOptionsHtml = _Modals.buildRoleOptions(null, 'No role required');

        var content =
            '<div style="margin-bottom:16px;">' +
                '<div style="background:var(--bg3);border-radius:6px;padding:8px 12px;margin-bottom:12px;font-size:0.6rem;color:var(--dim);">' +
                    'Creating a position for <strong>' +
                        _esc(household.name) + '</strong>' +
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

        var modal = _openModal({
            title: 'Create Household Position',
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

                var departmentId =
                    _Modals.readValue(root, '[data-field="departmentId"]') || null;
                var requiredRoleId =
                    _Modals.readValue(root, '[data-field="requiredRoleId"]') || null;

                var minSkillLevel = _Modals.readIntOrNull(
                    root, '[data-field="minSkillLevel"]');
                if (minSkillLevel === null) minSkillLevel = 0;

                var priority = _Modals.readIntOrNull(root, '[data-field="priority"]');
                if (priority === null) priority = 10;

                var description =
                    _Modals.readValue(root, '[data-field="description"]').trim();

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
                    _Modals.reportFailure(result, 'Failed to create position');
                    return false;
                }

                var persisted = _persistOrFail('Position created');
                if (!persisted.ok) {
                    // Keep the modal open so the user can retry.
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
    // 3. EDIT POSITION MODAL
    // =========================================================================

    function openEditHouseholdPositionModal(householdId, positionId, onSuccess) {
        var household = _queries.getHousehold(householdId);
        if (!household) {
            _showError('Household not found');
            return null;
        }

        var position = _queries.getHouseholdPosition(positionId);
        if (!position) {
            _showError('Position not found');
            return null;
        }

        var roleOptionsHtml = _Modals.buildRoleOptions(
            position.requiredRoleId, 'No role required');
        var departmentOptionsHtml = _buildDepartmentOptions(
            householdId, position.departmentId);

        var content =
            '<div style="margin-bottom:16px;">' +
                '<div style="background:var(--bg3);border-radius:6px;padding:8px 12px;margin-bottom:12px;font-size:0.6rem;color:var(--dim);">' +
                    'Editing position in <strong>' +
                        _esc(household.name) + '</strong>' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Position Name *</label>' +
                    '<input type="text" data-field="name" value="' +
                        _esc(position.name) +
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
                        _esc(position.description || '') +
                        '" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;">' +
                '</div>' +
            '</div>';

        var modal = _openModal({
            title: 'Edit Position: ' + position.name,
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

                var departmentId =
                    _Modals.readValue(root, '[data-field="departmentId"]') || null;
                var requiredRoleId =
                    _Modals.readValue(root, '[data-field="requiredRoleId"]') || null;

                var minSkillLevel = _Modals.readIntOrNull(
                    root, '[data-field="minSkillLevel"]');
                if (minSkillLevel === null) minSkillLevel = 0;

                var priority = _Modals.readIntOrNull(root, '[data-field="priority"]');
                if (priority === null) priority = 10;

                var description =
                    _Modals.readValue(root, '[data-field="description"]').trim();

                var result = _commands.updatePosition(positionId, {
                    name: name,
                    departmentId: departmentId,
                    requiredRoleId: requiredRoleId,
                    minSkillLevel: minSkillLevel,
                    priority: priority,
                    description: description
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
    // 4. DELETE POSITION MODAL
    // =========================================================================

    function openDeleteHouseholdPositionModal(householdId, positionId, onSuccess) {
        var household = _queries.getHousehold(householdId);
        var position = _queries.getHouseholdPosition(positionId);
        if (!household || !position) {
            _showError('Household or position not found');
            return null;
        }

        var activeAssignments = _queries.getAssignmentsForPosition(positionId, true);
        var roleName = position.requiredRoleId
            ? (_Modals.getRoleById(position.requiredRoleId) || {}).name || 'Unknown'
            : null;

        var content =
            '<div style="margin-bottom:16px;">' +
                '<div style="background:rgba(200,68,68,0.15);border:1px solid var(--warn);border-radius:8px;padding:12px;margin-bottom:16px;">' +
                    '<strong>Delete Position: ' +
                        _esc(position.name) + '</strong>' +
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
                            _esc(position.name) + '</strong></span>' +
                    '</div>' +
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
            title: 'Delete Position: ' + position.name,
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

                var result = _commands.deletePosition(positionId, {
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
    // Candidates come from the household member list (via
    // getHouseholdDetails). The shared candidate renderer
    // (HouseholdModals.renderStaffCandidates) consumes a normalized
    // array with { characterId, displayName, age, hasRole, skillLevel }.
    // The assign modal projects household member entries into that shape
    // and passes the position (for the requiredRoleId indicator) through.
    //
    // The candidate DOM wiring is delegated to
    // HouseholdModals.wireStaffCandidateSelection via
    // _wireCandidateSelection, which adds the "Select Other Character"
    // flow that is household-specific.
    //
    // addRoleIfMissing is wired through to
    // HouseholdCommands.assignCharacterToPosition: when the checkbox is
    // checked the command adds the missing role; when unchecked the
    // command succeeds with a roleWarning that this modal surfaces.

    function openAssignStaffToHouseholdPositionModal(householdId, positionId, onSuccess) {
        var household = _queries.getHousehold(householdId);
        var position = _queries.getHouseholdPosition(positionId);
        if (!household || !position) {
            _showError('Household or position not found');
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
                displayName: mem.characterName,
                age: mem.age,
                hasRole: hasRole,
                skillLevel: skillLevel
            });
        }

        var roleDisplay = position.requiredRoleId
            ? (_Modals.getRoleById(position.requiredRoleId) || {}).name || 'Unknown'
            : 'None';

        var candidatesHtml = _Modals.renderStaffCandidates(candidates, position);
        var history = _queries.getAssignmentsForPosition(positionId, false);
        var historyHtml = _buildRecentHistory(history, 5);

        var content =
            '<div style="margin-bottom:12px;padding:8px;background:var(--bg2);border-radius:6px;">' +
                '<strong>Household:</strong> ' + _esc(household.name) + '<br>' +
                '<strong>Position:</strong> ' + _esc(position.name) + '<br>' +
                '<strong>Required Role:</strong> ' + _esc(roleDisplay) +
                (position.minSkillLevel > 0
                    ? ' · <strong>Min Skill:</strong> ' + position.minSkillLevel
                    : '') +
            '</div>' +

            '<div style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Select Staff Member</label>' +
                candidatesHtml +
            '</div>' +

            '<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center;">' +
                '<button data-action="select-other-character" style="padding:3px 10px;font-size:0.55rem;background:var(--accent-dim);border:1px solid var(--accent);border-radius:4px;cursor:pointer;">Select Other Character</button>' +
                '<label style="display:flex;align-items:center;gap:6px;font-size:0.55rem;cursor:pointer;">' +
                    '<input type="checkbox" data-field="addRoleIfMissing" checked>' +
                    '<span>Add role if missing</span>' +
                '</label>' +
            '</div>' +

            '<div style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Custom Title</label>' +
                '<input type="text" data-field="title" value="' +
                    _esc(position.name) +
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
                    _showError('Please select a staff member');
                    return false;
                }

                var startYear = _Modals.readIntOrNull(root, '[data-field="startYear"]');
                if (startYear === null) {
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
                var addRoleIfMissing = _Modals.readChecked(
                    root, '[data-field="addRoleIfMissing"]');

                var result = _commands.assignCharacterToPosition(
                    positionId, characterId, {
                        startYear: startYear,
                        endYear: endYear,
                        title: title,
                        notes: notes,
                        addRoleIfMissing: addRoleIfMissing,
                        defaultSkillLevel: _VM.DEFAULT_SKILL_LEVEL
                    });

                if (!result.success) {
                    _Modals.reportFailure(result, 'Failed to assign staff');
                    return false;
                }

                var persisted = _persistOrFail('Staff assigned');
                if (!persisted.ok) {
                    return false;
                }

                // Surface a role warning if the command reported one
                // (only happens when addRoleIfMissing was false and the
                // character lacks the required role).
                if (result.data && result.data.roleWarning) {
                    _showWarning(
                        'Staff assigned, but the character lacks the ' +
                        'required role. Check "Add role if missing" to ' +
                        'grant it automatically.');
                } else {
                    _showSuccess('Staff assigned to ' + position.name);
                }

                if (typeof onSuccess === 'function') onSuccess(result.data);
                return true;
            }
        });

        _Modals.onOpen(modal, function(root) {
            _wireCandidateSelection(root, householdId, positionId, onSuccess);
        });

        return modal;
    }

    // =========================================================================
    // 6. CANDIDATE WIRING ADAPTERS
    // =========================================================================
    //
    // The shared helpers live in HouseholdModals. These two adapters
    // exist because the household staff modal adds the "Select Other
    // Character" flow (openCharacterSelector then reopen this modal),
    // which is household-specific. The candidate-list wiring itself is
    // delegated.

    /**
     * Wires the candidate list plus the "Select Other Character" flow.
     * Delegates the candidate-list wiring to
     * HouseholdModals.wireStaffCandidateSelection.
     *
     * @param {HTMLElement} root
     * @param {string} householdId
     * @param {string} positionId
     * @param {Function} onSuccess
     */
    function _wireCandidateSelection(root, householdId, positionId, onSuccess) {
        _Modals.wireStaffCandidateSelection(root, {
            onSelectOther: function() {
                _openCharacterSelector({
                    title: 'Select Character for ' +
                        (_queries.getHouseholdPosition(positionId) || {}).name ||
                        'position',
                    onSelect: function(character) {
                        if (!character) return;
                        _closeTopModal();
                        setTimeout(function() {
                            openAssignStaffToHouseholdPositionModal(
                                householdId, positionId, onSuccess);
                        }, 0);
                    }
                });
            }
        });
    }

    /**
     * Wraps HouseholdModals.buildRecentAssignmentHistory with a
     * household-specific label resolver. Household staff assignments
     * carry `characterName` and `title` (the custom position title),
     * not the residence-side shape.
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
                var base = entry.characterName || 'Unknown';
                if (entry.title && entry.title !== entry.characterName) {
                    return base + ' (' + entry.title + ')';
                }
                return base;
            }
        );
    }

    // =========================================================================
    // 7. REMOVE / END ASSIGNMENT MODAL
    // =========================================================================

    function openRemoveHouseholdAssignmentModal(householdId, assignmentId, onSuccess) {
        var household = _queries.getHousehold(householdId);
        if (!household) {
            _showError('Household not found');
            return null;
        }

        var assignment = _queries.getHouseholdAssignment(assignmentId);
        if (!assignment) {
            _showError('Assignment not found');
            return null;
        }

        var position = _queries.getHouseholdPosition(assignment.positionId);
        var roleName = assignment.roleIdAtAssignment
            ? (_Modals.getRoleById(assignment.roleIdAtAssignment) || {}).name || 'Unknown'
            : 'None';

        var isAlreadyEnded = assignment.endYear !== null &&
            assignment.endYear !== undefined;

        var content;
        if (isAlreadyEnded) {
            content =
                '<div style="margin-bottom:16px;">' +
                    '<div style="background:var(--bg2);padding:8px;border-radius:6px;margin-bottom:12px;">' +
                        '<strong>Character:</strong> ' +
                            _esc(assignment.title || assignment.positionId) + '<br>' +
                        (position
                            ? '<strong>Position:</strong> ' +
                                _esc(position.name) + '<br>'
                            : '') +
                        '<strong>Started:</strong> ' +
                            assignment.startYear + '<br>' +
                        '<strong>Ended:</strong> ' + assignment.endYear +
                        (assignment.endReason
                            ? '<br><strong>End Reason:</strong> ' +
                                _esc(assignment.endReason)
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
                            _esc(assignment.title || 'Unknown') +
                        (position ? ' (' + _esc(position.name) + ')' : '') +
                        '<br><strong>Role at Assignment:</strong> ' +
                            _esc(roleName) +
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

        var modal = _openModal({
            title: isAlreadyEnded ? 'Delete Assignment' : 'End Assignment',
            content: content,
            confirmText: isAlreadyEnded ? 'Delete' : 'End Assignment',
            cancelText: 'Cancel',
            confirmStyle: isAlreadyEnded ? 'danger' : '',
            onConfirm: function() {
                var root = _Modals.rootFrom(modal);
                if (!root) {
                    _showError('Modal root unavailable');
                    return false;
                }

                if (isAlreadyEnded) {
                    var delResult = _commands.deleteAssignment(assignmentId);
                    if (!delResult.success) {
                        _Modals.reportFailure(delResult, 'Failed to delete assignment');
                        return false;
                    }

                    var delPersisted = _persistOrFail('Assignment deleted');
                    if (!delPersisted.ok) {
                        return false;
                    }

                    _showInfo('Assignment deleted');
                    if (typeof onSuccess === 'function') onSuccess(delResult.data);
                    return true;
                }

                var endYear = _Modals.readIntOrNull(root, '[data-field="endYear"]');
                if (endYear === null || endYear < assignment.startYear) {
                    _showError('End year must be at or after start year');
                    return false;
                }

                var reason = _Modals.readValue(root, '[data-field="reason"]').trim() ||
                    'Term ended';

                var endResult = _commands.endAssignment(
                    assignmentId, endYear, reason);
                if (!endResult.success) {
                    _Modals.reportFailure(endResult, 'Failed to end assignment');
                    return false;
                }

                var endPersisted = _persistOrFail('Assignment ended');
                if (!endPersisted.ok) {
                    return false;
                }

                _showSuccess(
                    'Assignment ended in ' + endYear + ' (' + reason + ')');
                if (typeof onSuccess === 'function') onSuccess(endResult.data);
                return true;
            }
        });

        return modal;
    }

    // =========================================================================
    // 8. ASSIGNMENT HISTORY MODAL (pure projection)
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
                _showError('No filter provided');
                return null;
            }
        } catch (e) {
            _showError('Failed to load assignment history');
            return null;
        }

        if (!history || history.length === 0) {
            _showInfo('No assignment history found');
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
                ? (_Modals.getRoleById(h.roleIdAtAssignment) || {}).name || null
                : null;
            var color = h.isActive ? 'var(--success)' : 'var(--dim)';

            html += '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border-light);">' +
                '<div>' +
                    '<span style="font-size:0.7rem;">' +
                        _esc(h.title || 'Unknown') + '</span>' +
                    (roleName
                        ? ' <span style="font-size:0.45rem;color:var(--accent);">(Role: ' +
                            _esc(roleName) + ')</span>'
                        : '') +
                    (h.skillLevelAtAssignment
                        ? ' <span style="font-size:0.45rem;color:var(--accent);">(Skill: ' +
                            h.skillLevelAtAssignment + ')</span>'
                        : '') +
                '</div>' +
                '<div style="font-size:0.55rem;color:' + color + ';">' +
                    h.startYear + ' - ' + endDisplay +
                    (h.endReason ? ' - ' + _esc(h.endReason) : '') +
                '</div>' +
            '</div>';
        }
        html += '</div>';

        html += '</div>';
        return html;
    }

    // =========================================================================
    // 9. BULK ASSIGN MODAL
    // =========================================================================

    function openBulkHouseholdAssignModal(householdId, positionId, onSuccess) {
        var household = _queries.getHousehold(householdId);
        var position = _queries.getHouseholdPosition(positionId);
        if (!household || !position) {
            _showError('Household or position not found');
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
                displayName: mem.characterName,
                age: mem.age,
                hasRole: hasRole,
                skillLevel: skillLevel
            });
        }

        if (candidates.length === 0) {
            _showInfo('No available staff to assign');
            if (typeof onSuccess === 'function') {
                onSuccess({ succeeded: [], failed: [], warnings: [] });
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
                _esc(c.characterId) +
                '" style="background:var(--bg2);border:1px solid var(--border);border-radius:4px;padding:6px 8px;margin-bottom:4px;cursor:pointer;transition:background 0.1s;">' +
                '<div style="display:flex;align-items:center;gap:8px;">' +
                    '<input type="checkbox" data-role="bulk-checkbox" data-character-id="' +
                        _esc(c.characterId) + '" style="cursor:pointer;">' +
                    '<span style="font-size:0.65rem;">' +
                        _esc(c.displayName) + ' (' + ageText + ')' +
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
                '<strong>Household:</strong> ' + _esc(household.name) + '<br>' +
                '<strong>Position:</strong> ' + _esc(position.name) +
                (position.requiredRoleId
                    ? '<br><strong>Required Role:</strong> ' +
                        _esc((_Modals.getRoleById(position.requiredRoleId) || {}).name || 'Unknown')
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
                'Missing roles will be added automatically. Failures will be reported per-character.' +
            '</div>';

        var modal = _openModal({
            title: 'Bulk Assign Staff: ' + position.name,
            content: content,
            confirmText: 'Assign Selected',
            cancelText: 'Cancel',
            onConfirm: function() {
                var root = _Modals.rootFrom(modal);
                if (!root) {
                    _showError('Modal root unavailable');
                    return false;
                }

                var checked = root.querySelectorAll(
                    '[data-role="bulk-checkbox"]:checked');
                if (checked.length === 0) {
                    _showWarning('No staff members selected');
                    return false;
                }

                var startYear = _Modals.readIntOrNull(root, '[data-field="startYear"]');
                if (startYear === null) {
                    _showError('Start year is required');
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
                    defaultSkillLevel: _VM.DEFAULT_SKILL_LEVEL
                });

                if (!result.success) {
                    _Modals.reportFailure(result, 'Bulk assignment failed');
                    return false;
                }

                var persisted = _persistOrFail('Bulk assignment saved');

                var succeeded = (result.data.succeeded || []).length;
                var failed = (result.data.failed || []).length;
                var msg = 'Assigned ' + succeeded + ' staff';
                if (failed > 0) msg += ', ' + failed + ' failed';
                if (!persisted.ok) {
                    _showWarning(msg + ' (not saved: ' + persisted.reason + ')');
                } else if (failed > 0) {
                    _showWarning(msg);
                } else {
                    _showSuccess(msg);
                }

                if (typeof onSuccess === 'function') onSuccess(result.data);
                return true;
            }
        });

        _Modals.onOpen(modal, function(root) {
            _wireBulkSelection(root);
        });

        return modal;
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
                if (!checkbox) return;
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
    // 10. VIEW POSITIONS MODAL (pure projection)
    // =========================================================================

    function openViewHouseholdPositionsModal(householdId, onSelect) {
        var household = _queries.getHousehold(householdId);
        if (!household) {
            _showError('Household not found');
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
                    ? (_Modals.getRoleById(pos.requiredRoleId) || {}).name || 'Unknown'
                    : 'None';

                rows += '<div class="position-item" data-position-id="' +
                    _esc(pos.id) +
                    '" style="background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:10px 12px;cursor:pointer;">' +
                    '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:6px;">' +
                        '<div>' +
                            '<strong>' + _esc(pos.name) + '</strong>' +
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
                    (pos.description
                        ? '<div style="font-size:0.5rem;color:var(--dim);margin-top:2px;">' +
                            _esc(pos.description) + '</div>'
                        : '') +
                '</div>';
            }
            rows += '</div>';
        }

        var content =
            '<div style="margin-bottom:16px;padding:12px;background:var(--bg2);border-radius:8px;">' +
                '<strong>Household:</strong> ' + _esc(household.name) +
                '<div style="font-size:0.6rem;color:var(--dim);margin-top:4px;">' +
                    positions.length + ' positions · ' +
                    assignments.length + ' active assignments' +
                '</div>' +
            '</div>' +
            rows +
            '<div style="margin-top:12px;padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;">' +
                'Click on a position to manage it.' +
            '</div>';

        var modal = _openModal({
            title: 'Household Positions: ' + household.name,
            content: content,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function() {}
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
        });

        return modal;
    }

    // =========================================================================
    // 11. VIEW STAFF ASSIGNMENTS MODAL
    // =========================================================================

    function openViewStaffAssignmentsModal(householdId) {
        var household = _queries.getHousehold(householdId);
        if (!household) {
            _showError('Household not found');
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
                    ? (_Modals.getRoleById(asg.roleIdAtAssignment) || {}).name || 'Unknown'
                    : 'None';

                rows += '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:var(--bg2);border-radius:4px;border-left:3px solid var(--accent);">' +
                    '<div>' +
                        '<strong>' + _esc(asg.title || 'Unknown') + '</strong>' +
                        (pos
                            ? '<span style="font-size:0.55rem;color:var(--dim);margin-left:6px;">' +
                                _esc(pos.name) + '</span>'
                            : '') +
                        (roleName !== 'None'
                            ? '<span style="font-size:0.5rem;color:var(--accent);margin-left:6px;">Role: ' +
                                _esc(roleName) + '</span>'
                            : '') +
                    '</div>' +
                    '<div style="font-size:0.5rem;color:var(--dim);">' +
                        'Since ' + asg.startYear +
                        '<button data-action="end-assignment" data-assignment-id="' +
                            _esc(asg.id) +
                            '" style="margin-left:8px;padding:2px 6px;font-size:0.45rem;background:#8a5a20;border:none;color:white;border-radius:3px;cursor:pointer;">End</button>' +
                    '</div>' +
                '</div>';
            }
            rows += '</div>';
        }

        var content =
            '<div style="margin-bottom:16px;padding:12px;background:var(--bg2);border-radius:8px;">' +
                '<strong>Staff Assignments: ' +
                    _esc(household.name) + '</strong>' +
                '<div style="font-size:0.6rem;color:var(--dim);margin-top:4px;">' +
                    assignments.length + ' active staff members' +
                '</div>' +
            '</div>' +
            rows +
            '<div style="margin-top:12px;padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;">' +
                'Click "End" to terminate a staff assignment.' +
            '</div>';

        var modal = _openModal({
            title: 'Staff Assignments',
            content: content,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function() {}
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
                                var result = _commands.endAssignment(
                                    assignmentId, currentYear, 'Ended by user');
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
                                    openViewStaffAssignmentsModal(householdId);
                                }, 0);
                            },
                            function() {}
                        );
                    };
                })(btns[b]);
            }
        });

        return modal;
    }

    // =========================================================================
    // 12. COMBINED STAFF MANAGEMENT MODAL
    // =========================================================================

    function openStaffManagementModal(householdId, onSuccess) {
        var household = _queries.getHousehold(householdId);
        if (!household) {
            _showError('Household not found');
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
                    ? (_Modals.getRoleById(pos.requiredRoleId) || {}).name || 'Unknown'
                    : 'None';

                rows += '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;background:var(--bg2);border-radius:4px;border-left:3px solid ' +
                    (activeCount > 0 ? 'var(--accent)' : 'var(--border)') + ';">' +
                    '<div>' +
                        '<strong>' + _esc(pos.name) + '</strong>' +
                        '<span style="font-size:0.5rem;color:var(--accent);margin-left:6px;">Role: ' +
                            _esc(roleName) + '</span>' +
                        (pos.minSkillLevel > 0
                            ? '<span style="font-size:0.5rem;color:var(--dim);margin-left:4px;">(Min: ' +
                                pos.minSkillLevel + ')</span>'
                            : '') +
                    '</div>' +
                    '<div style="display:flex;gap:4px;align-items:center;">' +
                        '<span style="font-size:0.5rem;color:var(--accent);">' +
                            activeCount + ' assigned</span>' +
                        '<button data-action="pos-assign" data-position-id="' +
                            _esc(pos.id) +
                            '" style="padding:2px 6px;font-size:0.45rem;background:var(--accent-dim);border:1px solid var(--accent);border-radius:3px;cursor:pointer;">Assign</button>' +
                        '<button data-action="pos-edit" data-position-id="' +
                            _esc(pos.id) +
                            '" style="padding:2px 6px;font-size:0.45rem;background:var(--bg3);border:1px solid var(--border);border-radius:3px;cursor:pointer;">Edit</button>' +
                        '<button data-action="pos-delete" data-position-id="' +
                            _esc(pos.id) +
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
                        _esc(household.name) + '</strong></div>' +
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

        var modal = _openModal({
            title: 'Staff Management',
            content: content,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function() {
                if (typeof onSuccess === 'function') onSuccess();
                return true;
            }
        });

        _Modals.onOpen(modal, function(root) {
            _wireStaffManagement(root, householdId, onSuccess);
        });

        return modal;
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
                _closeThen(function() {
                    openCreateHouseholdPositionModal(householdId, _reopen);
                });
            };
        }

        var viewAssignBtn = root.querySelector('[data-action="view-assignments"]');
        if (viewAssignBtn) {
            viewAssignBtn.onclick = function() {
                _closeThen(function() {
                    openViewStaffAssignmentsModal(householdId);
                });
            };
        }

        var assignBtns = root.querySelectorAll('[data-action="pos-assign"]');
        for (var i = 0; i < assignBtns.length; i++) {
            (function(btn) {
                btn.onclick = function() {
                    var posId = btn.dataset.positionId;
                    _closeThen(function() {
                        openAssignStaffToHouseholdPositionModal(
                            householdId, posId, _reopen);
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
                        openEditHouseholdPositionModal(
                            householdId, posId, _reopen);
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
                        openDeleteHouseholdPositionModal(
                            householdId, posId, _reopen);
                    });
                };
            })(deleteBtns[k]);
        }
    }

    // =========================================================================
    // 13. EXPORTS
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
