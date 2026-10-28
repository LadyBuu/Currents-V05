/**
 * =============================================================================
 * STILL WATERS - HOUSEHOLD MODALS (modals-household.js)
 * =============================================================================
 *
 * LOCATION: js/households/modals-household.js
 *
 * PURPOSE
 * -------
 * Modal entry points for household CRUD and detail viewing.
 *
 *   - openCreateHouseholdModal(onSuccess)
 *   - openEditHouseholdModal(householdId, onSuccess)
 *   - openDeleteHouseholdModal(householdId, onSuccess)
 *   - openHouseholdDetailsModal(householdId, onSuccess)
 *
 * OWNERSHIP
 * ---------
 *   Reads:  HouseholdQueries, HouseholdEconomy (pure calcs)
 *   Writes: HouseholdCommands + one persist() call per batch
 *   UI:     modals-core, selectors, icons, HouseholdModals,
 *           HouseholdViewModels
 *
 * CONVERGED PATTERN NOTES
 * -----------------------
 *   - Every mutation invokes HouseholdCommands.* then a single
 *     HouseholdCommands.persist() at the end of the batch (via
 *     HouseholdModals.persistOrFail).
 *   - No HouseholdState access.
 *   - No _saveMasterData call here.
 *   - No _processingModal guard.
 *   - Command return shapes are read via { success, data } / { success,
 *     code, reason } — no raw boolean checks.
 *   - processAnnualEconomy reads .data.* (economy already returns
 *     structured results).
 *
 * PERSIST-FAILURE BEHAVIOR
 * ------------------------
 *   The create and edit modals apply a two-part contract to persist
 *   failures:
 *
 *     1. The mutation command has ALREADY succeeded in memory when
 *        _persistOrFail runs. The command layer's own commit has set
 *        in-memory state; the only thing that can fail is the flush to
 *        localStorage.
 *
 *     2. If the flush fails, onConfirm returns false so the modal stays
 *        open. The user sees an error toast and can click the primary
 *        button again to retry the persist.
 *
 *   RETRY IDEMPOTENCY:
 *     The create and edit modals track whether the mutation phase has
 *     already succeeded for the current modal session. On retry:
 *
 *       - If the mutation phase already succeeded, onConfirm skips the
 *         command layer entirely and only re-runs _persistOrFail.
 *         Retrying a create does NOT create a second household; the
 *         id from the first attempt is retained in the modal closure.
 *         Retrying an edit does NOT re-apply the updates to an already-
 *         updated record.
 *
 *       - If the mutation phase did NOT succeed (e.g. the user edited a
 *         field after a validation failure), onConfirm starts fresh.
 *         The guard only protects the narrow window between "command
 *         succeeded, persist failed" and "user retried".
 *
 *   Before this revision, both modals returned true from onConfirm even
 *   when persist failed, which:
 *     - showed a success toast AND an error toast in the same breath
 *     - fired onSuccess as if the write had landed
 *     - closed the modal, discarding the user's in-memory attempt
 *     - allowed the caller's onSuccess handler to clear forms or
 *       navigate away, losing the record on the next page load
 *
 *   The delete modal uses confirmDialog, which cannot keep itself open
 *   after the confirm click. Its behavior on persist failure is
 *   unchanged: the mutation succeeded in memory, the persist failure is
 *   toasted, and onSuccess fires. This is documented as the known
 *   limitation of the confirm-dialog shape.
 *
 * SHARED HELPERS
 * --------------
 *   Every shared helper used by this file — rootFrom, persistOrFail,
 *   reportFailure, esc, readValue, readIntOrNull, onOpen, currentYear,
 *   closeThen, confirmDialog — lives in HouseholdModals. This file
 *   keeps only its local aliases (var _esc = _Modals.esc; etc.) and its
 *   domain-specific builders (_buildLocationOptions, the details-content
 *   builders, and the wire functions for the details modal).
 *
 * DOM-SCOPE
 * ---------
 *   Every DOM lookup is scoped to the modal's own `handle.element` via
 *   HouseholdModals.rootFrom(modal). See modals-helper.js for the full
 *   rationale on why the prior _resolveModalRoot() fallback (which
 *   ended at document.body) was wrong.
 *
 * DEPENDENCIES (REQUIRED, verified at load):
 *   - formatting.js (escapeHtml)
 *   - icons.js (Icons)
 *   - modals-core.js (openModal, closeTopModal, confirmDialog)
 *   - ui.js (showToast) — used by HouseholdModals
 *   - household-queries.js (HouseholdQueries)
 *   - household-commands.js (HouseholdCommands)
 *   - household-modals-helper.js (HouseholdModals)
 *   - household-view-models.js (HouseholdViewModels)
 *
 * DEPENDENCIES (OPTIONAL, checked at call time):
 *   - household-economy.js (processAnnualEconomy)
 *   - industry-* (enterprise list/detail modals — reached via window
 *     function checks)
 *   - selectors/modals-char-selector.js (openCharacterSelector)
 *
 * ICON POLICY: SVG from icons.js. No emojis.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision (secondary item #3):
 *     - openCreateHouseholdModal and openEditHouseholdModal now return
 *       false from onConfirm when _persistOrFail fails, keeping the
 *       modal open so the user can retry the persist. Prior revisions
 *       returned true unconditionally, which produced a success-toast
 *       + error-toast pair, fired onSuccess as if the write had
 *       landed, and closed the modal.
 *     - Both modals now carry a mutation-succeeded flag in their
 *       onConfirm closure. On retry, they skip the command layer and
 *       only re-run _persistOrFail. This makes retry idempotent for the
 *       create case (no duplicate household) and for the edit case (no
 *       double-application of the same updates). See RETRY IDEMPOTENCY
 *       in PERSIST-FAILURE BEHAVIOR.
 *     - Header PERSIST-FAILURE BEHAVIOR section added.
 *     - No public signatures changed. No rendered HTML changed. No
 *       behavior change on the happy path.
 *     - KNOWN LIMITATION (not addressed here): the delete modal uses
 *       confirmDialog and cannot apply the same pattern. Its
 *       persist-failure behavior is unchanged.
 *     - KNOWN LIMITATION (not addressed here, in
 *       modals-household-snapshot.js): openDeleteNamePeriodModal's
 *       onConfirm re-runs deleteNamePeriod on retry after a persist
 *       failure. The second call deletes a different period (whatever
 *       lands at the same index after the first splice). That is a
 *       separate file and a separate fix.
 *   Previous revisions:
 *     - Removed the local copies of _persistOrFail, _confirmDialog,
 *       _currentYear, and _closeThen. All four were structurally
 *       identical to the shared versions exported by HouseholdModals.
 *     - Every DOM lookup is scoped to handle.element via
 *       HouseholdModals.rootFrom(modal).
 *     - _buildLocationOptions falls back to getPlaces when
 *       buildLocationDropdown is unavailable.
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. LOAD-TIME DEPENDENCY VERIFICATION
    // =========================================================================

    function _requireFunction(name, fn) {
        if (typeof fn !== 'function') {
            throw new Error('modals-household: ' + name + ' is required');
        }
        return fn;
    }

    function _requireObject(name, obj) {
        if (typeof obj === 'undefined' || obj === null) {
            throw new Error('modals-household: ' + name + ' is required');
        }
        return obj;
    }

    var _queries = _requireObject('HouseholdQueries', window.HouseholdQueries);
    _requireFunction('HouseholdQueries.getHousehold', _queries.getHousehold);
    _requireFunction('HouseholdQueries.getHouseholdDetails',
        _queries.getHouseholdDetails);
    _requireFunction('HouseholdQueries.getHouseholdEnterprises',
        _queries.getHouseholdEnterprises);

    var _commands = _requireObject('HouseholdCommands', window.HouseholdCommands);
    _requireFunction('HouseholdCommands.createHousehold',
        _commands.createHousehold);
    _requireFunction('HouseholdCommands.updateHousehold',
        _commands.updateHousehold);
    _requireFunction('HouseholdCommands.setStatus', _commands.setStatus);
    _requireFunction('HouseholdCommands.deleteHousehold',
        _commands.deleteHousehold);

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
    _requireFunction('HouseholdModals.onOpen', _Modals.onOpen);
    _requireFunction('HouseholdModals.currentYear', _Modals.currentYear);
    _requireFunction('HouseholdModals.closeThen', _Modals.closeThen);
    _requireFunction('HouseholdModals.confirmDialog', _Modals.confirmDialog);

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
    // 1. LOCATION OPTIONS
    // =========================================================================

    function _buildLocationOptions(selectedId, placeholder) {
        if (typeof window.buildLocationDropdown === 'function') {
            return window.buildLocationDropdown(selectedId, placeholder, false);
        }
        if (typeof window.getPlaces !== 'function') {
            return '<option value="">' + _esc(placeholder || '') + '</option>';
        }
        var places = window.getPlaces() || [];
        var html = '<option value="">' + _esc(placeholder || '') + '</option>';
        var sorted = places.slice().sort(function(a, b) {
            return (a.displayName || '').localeCompare(b.displayName || '');
        });
        for (var i = 0; i < sorted.length; i++) {
            var p = sorted[i];
            var label = p.displayName || p.name || 'Unknown';
            var selected = (selectedId === p.id) ? ' selected' : '';
            html += '<option value="' + _esc(p.id) + '"' + selected + '>' +
                _esc(label) + '</option>';
        }
        return html;
    }

    // =========================================================================
    // 2. CREATE HOUSEHOLD MODAL
    // =========================================================================
    //
    // RETRY IDEMPOTENCY:
    //   `createdHouseholdId` tracks whether the createHousehold command
    //   has already succeeded in this modal session. On the first
    //   successful command, the id is captured. On any subsequent
    //   onConfirm invocation (which can only happen if the previous
    //   invocation returned false, i.e. persist failed), the command is
    //   skipped and only the persist is retried. This prevents the
    //   duplicate-household hazard that would otherwise exist: the user
    //   clicks Create a second time after a persist failure, and
    //   createHousehold would otherwise create a second record.

    function openCreateHouseholdModal(onSuccess, options) {
        options = options || {};

        var locationOptions = _buildLocationOptions(null, '-- Select location --');
        var currentYear = _currentYear();

        var content =
            '<div style="max-height:500px;overflow-y:auto;padding:4px;">' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Household Name *</label>' +
                    '<input type="text" data-field="name" placeholder="Enter household name" ' +
                        'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;">' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Location</label>' +
                    '<select data-field="locationId" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;">' +
                        locationOptions +
                    '</select>' +
                '</div>' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">' +
                    '<div>' +
                        '<label style="display:block;font-size:0.6rem;color:var(--dim);margin-bottom:4px;">Initial Wealth</label>' +
                        '<input type="number" data-field="wealth" value="' +
                            _VM.DEFAULT_INITIAL_WEALTH +
                            '" style="width:100%;padding:6px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.7rem;">' +
                    '</div>' +
                    '<div>' +
                        '<label style="display:block;font-size:0.6rem;color:var(--dim);margin-bottom:4px;">Initial Reputation</label>' +
                        '<input type="number" data-field="reputation" value="' +
                            _VM.DEFAULT_INITIAL_REPUTATION +
                            '" min="0" max="100" style="width:100%;padding:6px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.7rem;">' +
                    '</div>' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Head of Household</label>' +
                    '<div style="display:flex;gap:6px;">' +
                        '<input type="text" data-field="headDisplay" placeholder="Select head..." readonly ' +
                            'style="flex:1;padding:6px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;font-size:0.7rem;cursor:pointer;">' +
                        '<input type="hidden" data-field="headId">' +
                        '<button data-action="select-head" class="btn" style="font-size:0.6rem;padding:4px 10px;">Select</button>' +
                        '<button data-action="clear-head" class="btn" style="font-size:0.6rem;padding:4px 8px;">Clear</button>' +
                    '</div>' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Notes</label>' +
                    '<textarea data-field="notes" rows="2" placeholder="Additional notes..." ' +
                        'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;"></textarea>' +
                '</div>' +
            '</div>';

        // Retry idempotency: the id of the household created on the first
        // successful command invocation, or null.
        var createdHouseholdId = null;
        var createdHouseholdData = null;

        var modal = _openModal({
            title: 'Create Household',
            content: content,
            confirmText: 'Create',
            cancelText: 'Cancel',
            onConfirm: function() {
                var root = _Modals.rootFrom(modal);
                if (!root) {
                    _showError('Modal root unavailable');
                    return false;
                }

                // RETRY PATH: the command already succeeded on a prior
                // onConfirm invocation. Skip the command layer entirely
                // and only retry the persist.
                if (createdHouseholdId !== null) {
                    var retryPersist = _persistOrFail('Household created');
                    if (!retryPersist.ok) {
                        return false;
                    }
                    _showSuccess('Household created: ' +
                        (createdHouseholdData ? createdHouseholdData.name : ''));
                    if (typeof onSuccess === 'function') {
                        onSuccess(createdHouseholdData);
                    }
                    return true;
                }

                // FIRST PATH: validate, run the command, then persist.
                var name = _Modals.readValue(root, '[data-field="name"]');
                if (!name || name.trim() === '') {
                    _showError('Household name is required');
                    return false;
                }

                var wealth = _Modals.readIntOrNull(root, '[data-field="wealth"]');
                if (wealth === null) wealth = _VM.DEFAULT_INITIAL_WEALTH;

                var reputation = _Modals.readIntOrNull(
                    root, '[data-field="reputation"]');
                if (reputation === null) reputation = _VM.DEFAULT_INITIAL_REPUTATION;

                var data = {
                    name: name.trim(),
                    locationId: _Modals.readValue(root, '[data-field="locationId"]') || null,
                    wealth: wealth,
                    reputation: reputation,
                    foundedYear: currentYear,
                    notes: _Modals.readValue(root, '[data-field="notes"]')
                };
                var headId = _Modals.readValue(root, '[data-field="headId"]');
                if (headId) data.headId = headId;

                var result = _commands.createHousehold(data);
                if (!result.success) {
                    _Modals.reportFailure(result, 'Failed to create household');
                    return false;
                }

                // Capture the created id before persisting. If persist
                // fails, the retry path above uses this id to skip the
                // command layer.
                createdHouseholdId = result.data.householdId;
                createdHouseholdData = result.data;

                var persisted = _persistOrFail('Household created');
                if (!persisted.ok) {
                    // Keep the modal open so the user can retry the
                    // persist. The created id is retained; the retry path
                    // skips createHousehold and only retries the flush.
                    return false;
                }

                _showSuccess('Household created: ' + data.name);

                if (typeof onSuccess === 'function') {
                    onSuccess(result.data);
                }
                return true;
            }
        });

        // Post-open wiring: character selector for head.
        _Modals.onOpen(modal, function(root) {
            var selectBtn = root.querySelector('[data-action="select-head"]');
            var clearBtn = root.querySelector('[data-action="clear-head"]');
            var display = root.querySelector('[data-field="headDisplay"]');
            var hidden = root.querySelector('[data-field="headId"]');

            if (selectBtn) {
                selectBtn.onclick = function() {
                    if (typeof window.openCharacterSelector !== 'function') {
                        _showWarning('Character selector not available');
                        return;
                    }
                    window.openCharacterSelector({
                        title: 'Select Head of Household',
                        filters: { gender: 'all', status: 'all', showDeceased: false },
                        onSelect: function(character) {
                            if (!character) return;
                            if (display) {
                                display.value = (character.name || '') +
                                    (character.surname ? ' ' + character.surname : '');
                            }
                            if (hidden) hidden.value = character.id;
                        }
                    });
                };
            }
            if (clearBtn) {
                clearBtn.onclick = function() {
                    if (display) display.value = '';
                    if (hidden) hidden.value = '';
                };
            }
        });

        return modal;
    }

    // =========================================================================
    // 3. EDIT HOUSEHOLD MODAL
    // =========================================================================
    //
    // RETRY IDEMPOTENCY:
    //   Same pattern as the create modal. `mutationSucceeded` tracks
    //   whether updateHousehold + setStatus have already been applied in
    //   memory. On retry after a persist failure, the command layer is
    //   skipped and only _persistOrFail runs.

    function openEditHouseholdModal(householdId, onSuccess) {
        var household = _queries.getHousehold(householdId);
        if (!household) {
            _showError('Household not found');
            return null;
        }

        var locationOptions = _buildLocationOptions(
            household.locationId, '-- Select location --');

        var content =
            '<div style="max-height:500px;overflow-y:auto;padding:4px;">' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Household Name *</label>' +
                    '<input type="text" data-field="name" value="' +
                        _esc(household.name) +
                        '" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;">' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Location</label>' +
                    '<select data-field="locationId" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;">' +
                        locationOptions +
                    '</select>' +
                '</div>' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">' +
                    '<div>' +
                        '<label style="display:block;font-size:0.6rem;color:var(--dim);margin-bottom:4px;">Wealth</label>' +
                        '<input type="number" data-field="wealth" value="' +
                            (household.wealth !== null ? household.wealth : 0) +
                            '" style="width:100%;padding:6px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.7rem;">' +
                    '</div>' +
                    '<div>' +
                        '<label style="display:block;font-size:0.6rem;color:var(--dim);margin-bottom:4px;">Reputation</label>' +
                        '<input type="number" data-field="reputation" value="' +
                            (household.reputation !== null ? household.reputation : 10) +
                            '" min="0" max="100" style="width:100%;padding:6px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.7rem;">' +
                    '</div>' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Status</label>' +
                    '<select data-field="status" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;">' +
                        _VM.getHouseholdStatusOptions(household.status) +
                    '</select>' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Notes</label>' +
                    '<textarea data-field="notes" rows="2" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;">' +
                        _esc(household.notes || '') +
                    '</textarea>' +
                '</div>' +
                '<div style="margin-bottom:12px;padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;color:var(--dim);">' +
                    'Wealth edits here are direct corrections. For economic transactions, use the Household Economy panel.' +
                '</div>' +
            '</div>';

        // Retry idempotency: same pattern as the create modal.
        var mutationSucceeded = false;
        var mutationData = null;
        var statusChangeFailedReason = null;

        var modal = _openModal({
            title: 'Edit Household: ' + household.name,
            content: content,
            confirmText: 'Save',
            cancelText: 'Cancel',
            onConfirm: function() {
                var root = _Modals.rootFrom(modal);
                if (!root) {
                    _showError('Modal root unavailable');
                    return false;
                }

                // RETRY PATH: the command phase already succeeded on a
                // prior onConfirm invocation. Skip the command layer and
                // only retry the persist.
                if (mutationSucceeded) {
                    var retryPersist = _persistOrFail('Household updated');
                    if (!retryPersist.ok) {
                        return false;
                    }
                    if (statusChangeFailedReason) {
                        _showWarning(
                            'Household updated but status change failed: ' +
                            statusChangeFailedReason);
                    } else {
                        _showSuccess('Household updated');
                    }
                    if (typeof onSuccess === 'function') {
                        onSuccess(mutationData);
                    }
                    return true;
                }

                // FIRST PATH: validate, run the commands, then persist.
                var name = _Modals.readValue(root, '[data-field="name"]');
                if (!name || name.trim() === '') {
                    _showError('Household name is required');
                    return false;
                }

                var updates = {
                    name: name.trim(),
                    locationId: _Modals.readValue(root, '[data-field="locationId"]') || null
                };

                var wealth = _Modals.readIntOrNull(root, '[data-field="wealth"]');
                if (wealth !== null) updates.wealth = wealth;

                var reputation = _Modals.readIntOrNull(root, '[data-field="reputation"]');
                if (reputation !== null) updates.reputation = reputation;

                var notes = _Modals.readValue(root, '[data-field="notes"]');
                if (notes !== undefined) updates.notes = notes;

                var status = _Modals.readValue(root, '[data-field="status"]');

                // Command 1: field updates.
                var result = _commands.updateHousehold(householdId, updates);
                if (!result.success) {
                    _Modals.reportFailure(result, 'Failed to update household');
                    return false;
                }

                // Command 2 (optional): status change.
                var statusChangeFailed = null;
                if (status && status !== household.status) {
                    var statusResult = _commands.setStatus(householdId, status, {
                        year: _currentYear(),
                        reason: 'Edited via modal',
                        recordEvent: true
                    });
                    if (statusResult.success !== true) {
                        statusChangeFailed = statusResult.reason;
                    }
                }

                // Capture the mutation-succeeded state before persisting.
                // If persist fails, the retry path above uses this flag
                // to skip the command layer.
                mutationSucceeded = true;
                mutationData = result.data;
                statusChangeFailedReason = statusChangeFailed;

                // Persist once for the batch.
                var persisted = _persistOrFail('Household updated');
                if (!persisted.ok) {
                    // Keep the modal open so the user can retry the
                    // persist. The command mutations already succeeded
                    // in memory; only the flush failed.
                    return false;
                }

                if (statusChangeFailed) {
                    _showWarning(
                        'Household updated but status change failed: ' +
                        statusChangeFailed);
                } else {
                    _showSuccess('Household updated');
                }

                if (typeof onSuccess === 'function') {
                    onSuccess(result.data);
                }
                return true;
            }
        });

        return modal;
    }

    // =========================================================================
    // 4. DELETE HOUSEHOLD MODAL
    // =========================================================================

    function openDeleteHouseholdModal(householdId, onSuccess) {
        var household = _queries.getHousehold(householdId);
        if (!household) {
            _showError('Household not found');
            return null;
        }

        var memberCount = household.memberCount || 0;
        var enterprises = [];
        try { enterprises = _queries.getHouseholdEnterprises(householdId); }
        catch (e) { enterprises = []; }

        var message =
            'Delete household "' + household.name + '"?\n\n' +
            'This will:\n' +
            '- Remove all ' + memberCount + ' members from this household\n' +
            '- Mark the household as deprecated\n' +
            '- Remove any residence associations\n' +
            (enterprises.length > 0
                ? '- Transfer ' + enterprises.length + ' owned enterprise(s) to the Crown\n'
                : '') +
            '\nThis action can be undone by restoring the household.';

        _confirmDialog(message, 'Delete Household', function() {
            var result = _commands.deleteHousehold(householdId, {
                removeFromCharacters: true
            });
            if (!result.success) {
                _Modals.reportFailure(result, 'Failed to delete household');
                return;
            }

            _persistOrFail('Household deleted');
            _showInfo('Household deleted: ' + household.name);

            if (typeof onSuccess === 'function') {
                onSuccess(result.data);
            }
        });

        return null;
    }

    // =========================================================================
    // 5. HOUSEHOLD DETAILS MODAL
    // =========================================================================

    function openHouseholdDetailsModal(householdId, onSuccess) {
        var details;
        try {
            details = _queries.getHouseholdDetails(householdId);
        } catch (e) {
            details = null;
        }
        if (!details) {
            _showError('Household not found');
            return null;
        }

        var content = _buildDetailsContent(details);

        var modal = _openModal({
            title: 'Household Details',
            content: content,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function() { /* close only */ }
        });

        _Modals.onOpen(modal, function(root) {
            _wireDetailsActions(root, householdId, details, onSuccess);
        });

        return modal;
    }

    function _buildDetailsContent(details) {
        var household = details.household;
        var status = details.status;
        var members = details.members;
        var head = details.head;
        var demographics = details.demographics;
        var residence = details.residence;
        var enterprises = details.enterprises || [];
        var enterpriseStats = details.enterpriseStats || null;

        var html = '<div style="max-height:500px;overflow-y:auto;padding:4px;">';

        html += _buildHeader(household, status);
        html += _buildStatsGrid(household, members, head);

        if (demographics) {
            html += _buildDemographics(demographics);
        }

        if (residence) {
            html += _buildResidenceRow(residence);
        }

        html += _buildMembersList(members);
        html += _buildEnterprisesSection(enterprises, enterpriseStats, householdId);

        if (household.notes) {
            html += '<div style="background:var(--bg2);padding:8px;border-radius:6px;margin-top:12px;font-size:0.6rem;color:var(--dim);">' +
                _esc(household.notes) + '</div>';
        }

        html += _buildActionsRow();
        html += '</div>';
        return html;
    }

    function _buildHeader(household, status) {
        var badge = _VM.getStatusBadge(status.status);
        var statusIcon = '';
        if (window.Icons && window.Icons[badge.icon]) {
            statusIcon = window.Icons[badge.icon];
        }
        var statusColor = badge.color;

        return '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
            '<div>' +
                '<h3 style="margin:0;font-size:1rem;">' +
                    _esc(household.name) + '</h3>' +
                '<div style="font-size:0.6rem;color:var(--dim);">' +
                    'Founded ' + (household.foundedYear !== null
                        ? household.foundedYear : 'Unknown') +
                    (household.locationName
                        ? ' · ' + _esc(household.locationName) : '') +
                '</div>' +
            '</div>' +
            '<div style="text-align:right;">' +
                '<div style="font-size:0.65rem;color:' + statusColor +
                    ';display:flex;align-items:center;gap:4px;justify-content:flex-end;">' +
                    statusIcon + ' ' + _esc(badge.label) +
                '</div>' +
                '<div style="font-size:0.55rem;color:var(--dim);">' +
                    status.livingCount + ' living · ' +
                    status.deceasedCount + ' deceased' +
                    (status.missingCount > 0
                        ? ' · ' + status.missingCount + ' missing' : '') +
                '</div>' +
            '</div>' +
        '</div>';
    }

    function _buildStatsGrid(household, members, head) {
        var wealthDisplay = household.wealth !== null ? household.wealth : '—';
        var repDisplay = household.reputation !== null ? household.reputation : '—';
        var wealthColor = _VM.getWealthColor(household.wealth);

        return '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;margin-bottom:12px;">' +
            _statCell('Members', members.length) +
            _statCell('Wealth', wealthDisplay, wealthColor) +
            _statCell('Reputation', repDisplay) +
            _statCell('Head', head ? head.characterName : 'None') +
        '</div>';
    }

    function _statCell(label, value, color) {
        return '<div style="background:var(--bg2);padding:8px;border-radius:6px;text-align:center;">' +
            '<div style="font-size:0.5rem;color:var(--dim);">' +
                _esc(label) + '</div>' +
            '<div style="font-size:0.9rem;font-weight:bold;' +
                (color ? 'color:' + color + ';' : '') + '">' +
                _esc(String(value)) +
            '</div>' +
        '</div>';
    }

    function _buildDemographics(d) {
        return '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;margin-bottom:12px;">' +
            _demoCell('Male', d.male) +
            _demoCell('Female', d.female) +
            _demoCell('Children', d.children) +
            _demoCell('Elders', d.elders) +
        '</div>';
    }

    function _demoCell(label, value) {
        return '<div style="background:var(--bg2);padding:6px 8px;border-radius:4px;text-align:center;font-size:0.55rem;">' +
            '<span style="color:var(--dim);">' + _esc(label) + '</span> ' +
            (value !== undefined ? value : 0) +
        '</div>';
    }

    function _buildResidenceRow(residence) {
        return '<div style="background:var(--bg2);padding:8px;border-radius:6px;margin-bottom:12px;font-size:0.65rem;">' +
            '<span style="color:var(--dim);">Residence:</span> ' +
            _esc(residence.residenceName || 'Unknown') +
            (residence.unitNumber
                ? ' (Unit ' + residence.unitNumber + ')' : '') +
            (residence.associatedYear
                ? ' · since ' + residence.associatedYear : '') +
        '</div>';
    }

    function _buildMembersList(members) {
        var html = '<div style="margin-bottom:12px;">' +
            '<div style="font-size:0.7rem;color:var(--accent);margin-bottom:4px;">' +
                'Members (' + members.length + ')' +
            '</div>' +
            '<div style="max-height:150px;overflow-y:auto;">';

        if (members.length === 0) {
            html += '<div style="text-align:center;padding:8px;color:var(--dim);font-size:0.6rem;">No members</div>';
        } else {
            for (var i = 0; i < members.length; i++) {
                var m = members[i];
                var headIcon = m.isHead && window.Icons
                    ? (window.Icons.CROWN || '') : '';
                var personIcon = window.Icons
                    ? (window.Icons.PERSON || '') : '';
                var deceasedSuffix = m.isDeceased ? ' (deceased)' : '';
                var ageStr = (m.age !== null && m.age !== undefined)
                    ? m.age + ' years' : '—';

                html += '<div style="display:flex;justify-content:space-between;padding:3px 8px;background:var(--bg2);border-radius:4px;margin-bottom:2px;font-size:0.65rem;">' +
                    '<span>' + headIcon + ' ' + personIcon + ' ' +
                        _esc(m.characterName) + deceasedSuffix +
                    '</span>' +
                    '<span style="color:var(--dim);">' +
                        _esc(m.role || m.type || 'Member') +
                        ' · ' + ageStr +
                    '</span>' +
                '</div>';
            }
        }

        html += '</div></div>';
        return html;
    }

    function _buildEnterprisesSection(enterprises, stats, householdId) {
        if (!enterprises || enterprises.length === 0) {
            return '<div style="margin-top:12px;border-top:1px solid var(--border);padding-top:12px;">' +
                '<div style="font-size:0.7rem;color:var(--dim);">No enterprises owned</div>' +
                '<div style="margin-top:6px;">' +
                    '<button data-action="create-enterprise" data-household-id="' +
                        _esc(householdId) +
                        '" class="btn primary" style="font-size:0.55rem;padding:2px 10px;">Create Enterprise</button>' +
                '</div>' +
            '</div>';
        }

        var totalProfit = stats ? (stats.totalProfit || 0) : 0;
        var profitColor = _VM.getProfitColor(totalProfit);

        var summary = '';
        if (stats) {
            if (stats.publicCount > 0 || stats.privateCount > 0) {
                summary = ' (' +
                    (stats.publicCount > 0
                        ? stats.publicCount + ' Public' : '') +
                    (stats.publicCount > 0 && stats.privateCount > 0
                        ? ', ' : '') +
                    (stats.privateCount > 0
                        ? stats.privateCount + ' Private' : '') +
                    ')';
            }
        }

        var html = '<div style="margin-top:12px;border-top:1px solid var(--border);padding-top:12px;">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">';
        html += '<div style="font-size:0.7rem;color:var(--accent);">' +
            'Owned Enterprises (' + enterprises.length + ')' +
            _esc(summary) + '</div>';
        html += '<div style="font-size:0.6rem;color:var(--dim);">';
        html += 'Total Profit: <span style="color:' + profitColor +
            ';font-weight:bold;">' +
            (totalProfit >= 0 ? '+' : '') + totalProfit + '</span>';
        if (stats) {
            html += ' <span style="margin-left:8px;">Workers: ' +
                (stats.totalWorkers || 0) + '</span>';
        }
        html += '</div></div>';

        html += '<div style="max-height:120px;overflow-y:auto;">';
        var limit = Math.min(enterprises.length, 5);
        for (var i = 0; i < limit; i++) {
            var e = enterprises[i];
            var profit = e.annualProfit || 0;
            var pc = _VM.getProfitColor(profit);
            var ownership = e.ownershipType === 'public'
                ? ' <span style="font-size:0.45rem;color:var(--accent);">(Public)</span>'
                : ' <span style="font-size:0.45rem;color:var(--dim);">(Private)</span>';
            var statusText = e.status && e.status !== 'active'
                ? ' <span style="font-size:0.5rem;color:var(--warn);">(' +
                    _esc(e.status) + ')</span>'
                : '';

            html += '<div class="enterprise-item" data-enterprise-id="' +
                _esc(e.id) +
                '" style="display:flex;justify-content:space-between;align-items:center;padding:4px 8px;background:var(--bg);border-radius:4px;margin-bottom:2px;font-size:0.65rem;cursor:pointer;">' +
                '<span>' + _esc(e.name) + ownership + statusText + '</span>' +
                '<span style="color:' + pc + ';">' +
                    (profit >= 0 ? '+' : '') + profit + '</span>' +
            '</div>';
        }
        html += '</div>';

        if (enterprises.length > 5) {
            html += '<div style="text-align:center;font-size:0.55rem;color:var(--dim);padding-top:4px;">+' +
                (enterprises.length - 5) + ' more</div>';
        }

        html += '<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;">';
        html += '<button data-action="view-enterprises" class="btn" style="font-size:0.55rem;padding:2px 10px;">View All</button>';
        html += '<button data-action="create-enterprise" data-household-id="' +
            _esc(householdId) +
            '" class="btn primary" style="font-size:0.55rem;padding:2px 10px;">Create Enterprise</button>';
        html += '</div>';

        html += '</div>';
        return html;
    }

    function _buildActionsRow() {
        return '<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;border-top:1px solid var(--border);padding-top:12px;">' +
            '<button data-action="edit" class="btn primary" style="font-size:0.65rem;padding:4px 12px;">Edit</button>' +
            '<button data-action="manage-members" class="btn" style="font-size:0.65rem;padding:4px 12px;">Manage Members</button>' +
            '<button data-action="manage-departments" class="btn" style="font-size:0.65rem;padding:4px 12px;">Departments</button>' +
            '<button data-action="process-economy" class="btn" style="font-size:0.65rem;padding:4px 12px;">Process Year</button>' +
            '<button data-action="delete" class="btn danger" style="font-size:0.65rem;padding:4px 12px;">Delete</button>' +
        '</div>';
    }

    function _wireDetailsActions(root, householdId, details, onSuccess) {
        var editBtn = root.querySelector('[data-action="edit"]');
        if (editBtn) {
            editBtn.onclick = function() {
                _closeThen(function() {
                    openEditHouseholdModal(householdId, onSuccess);
                });
            };
        }

        var deleteBtn = root.querySelector('[data-action="delete"]');
        if (deleteBtn) {
            deleteBtn.onclick = function() {
                _closeThen(function() {
                    openDeleteHouseholdModal(householdId, onSuccess);
                });
            };
        }

        var membersBtn = root.querySelector('[data-action="manage-members"]');
        if (membersBtn) {
            membersBtn.onclick = function() {
                _closeThen(function() {
                    if (typeof window.openHouseholdMemberManagerModal === 'function') {
                        window.openHouseholdMemberManagerModal(householdId, onSuccess);
                    } else {
                        _showWarning('Member manager not available');
                    }
                });
            };
        }

        var deptBtn = root.querySelector('[data-action="manage-departments"]');
        if (deptBtn) {
            deptBtn.onclick = function() {
                _closeThen(function() {
                    if (typeof window.openHouseholdDepartmentManagerModal === 'function') {
                        window.openHouseholdDepartmentManagerModal(householdId, onSuccess);
                    } else {
                        _showWarning('Department manager not available');
                    }
                });
            };
        }

        var processBtn = root.querySelector('[data-action="process-economy"]');
        if (processBtn) {
            processBtn.onclick = function() {
                if (typeof window.HouseholdEconomy === 'undefined' ||
                    typeof window.HouseholdEconomy.processAnnualEconomy !== 'function') {
                    _showError('Household economy not available');
                    return;
                }

                // processAnnualEconomy returns { success, data } and
                // persists internally via HouseholdCommands.
                var result = window.HouseholdEconomy.processAnnualEconomy(householdId);
                if (!result || result.success === false) {
                    _Modals.reportFailure(result, 'Failed to process year');
                    return;
                }
                var data = result.data || {};
                var net = data.netChange;
                var netStr = (typeof net === 'number')
                    ? ((net >= 0 ? '+' : '') + net)
                    : '?';
                _showSuccess(
                    'Processed year for ' +
                    (data.householdName || details.household.name) + ': ' +
                    netStr);

                _closeThen(function() {
                    if (typeof onSuccess === 'function') onSuccess();
                });
            };
        }

        // Enterprise row clicks.
        var eItems = root.querySelectorAll('.enterprise-item');
        for (var i = 0; i < eItems.length; i++) {
            (function(item) {
                item.onclick = function() {
                    var id = item.dataset.enterpriseId;
                    _closeThen(function() {
                        if (typeof window.openEnterpriseDetailsModal === 'function') {
                            window.openEnterpriseDetailsModal(id, function() {
                                openHouseholdDetailsModal(householdId, onSuccess);
                            });
                        }
                    });
                };
            })(eItems[i]);
        }

        var viewEntBtn = root.querySelector('[data-action="view-enterprises"]');
        if (viewEntBtn) {
            viewEntBtn.onclick = function() {
                _closeThen(function() {
                    if (typeof window.openEnterpriseListModal === 'function') {
                        window.openEnterpriseListModal(function(enterprise) {
                            if (enterprise &&
                                typeof window.openEnterpriseDetailsModal === 'function') {
                                window.openEnterpriseDetailsModal(enterprise.id);
                            }
                        });
                    }
                });
            };
        }

        var createEntBtn = root.querySelector('[data-action="create-enterprise"]');
        if (createEntBtn) {
            createEntBtn.onclick = function() {
                var hid = createEntBtn.dataset.householdId || householdId;
                _closeThen(function() {
                    if (typeof window.openCreateEnterpriseModal === 'function') {
                        window.openCreateEnterpriseModal(function(enterprise) {
                            if (enterprise) {
                                _showSuccess('Enterprise created: ' + enterprise.name);
                                if (typeof onSuccess === 'function') onSuccess();
                            }
                        }, {
                            ownerType: 'household',
                            ownerId: hid,
                            ownerName: details.household.name,
                            locationId: details.household.locationId || null
                        });
                    } else {
                        _showWarning('Enterprise creation not available');
                    }
                });
            };
        }
    }

    // =========================================================================
    // 6. EXPORTS
    // =========================================================================

    window.openCreateHouseholdModal = openCreateHouseholdModal;
    window.openEditHouseholdModal = openEditHouseholdModal;
    window.openDeleteHouseholdModal = openDeleteHouseholdModal;
    window.openHouseholdDetailsModal = openHouseholdDetailsModal;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            openCreateHouseholdModal: openCreateHouseholdModal,
            openEditHouseholdModal: openEditHouseholdModal,
            openDeleteHouseholdModal: openDeleteHouseholdModal,
            openHouseholdDetailsModal: openHouseholdDetailsModal
        };
    }

})();
