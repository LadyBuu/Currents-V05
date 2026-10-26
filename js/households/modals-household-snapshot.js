/**
 * =============================================================================
 * STILL WATERS - HOUSEHOLD SNAPSHOT MODALS (modals-household-snapshot.js)
 * =============================================================================
 *
 * LOCATION: js/households/modals-household-snapshot.js
 *
 * PURPOSE
 * -------
 * Modal entry points for household temporal/historical views:
 *
 *   - openViewHouseholdHistoryModal(householdId)
 *   - openEditNamePeriodModal(householdId, periodIndex, onSuccess)
 *   - openDeleteNamePeriodModal(householdId, periodIndex, onSuccess)
 *   - openHouseholdSnapshotModal(householdId, year, viewMode)
 *   - openCharacterHouseholdSnapshotModal(characterId, viewMode)
 *
 * OWNERSHIP
 * ---------
 *   Reads:  HouseholdQueries.getHouseholdNamePeriods /
 *           getHouseholdSnapshot / getCharacterHouseholdSnapshot /
 *           getHousehold
 *   Writes: HouseholdCommands.editNamePeriod / deleteNamePeriod +
 *           one HouseholdCommands.persist() per mutation (via
 *           HouseholdModals.persistOrFail)
 *   UI:     modals-core, icons, HouseholdModals, HouseholdViewModels
 *
 * CONVERGED PATTERN NOTES
 * -----------------------
 *   - All snapshot queries are implemented in household-queries.js.
 *   - Name period mutations persist once each.
 *   - No HouseholdState access.
 *   - No snapshot computation here; all projection lives in queries.
 *   - No mutation of nameHistory records during reads.
 *   - Historical references use explicit referenceYear.
 *
 * DOM-SCOPE
 * ---------
 *   Every DOM lookup is scoped to the modal's own `handle.element` via
 *   HouseholdModals.rootFrom(modal). See modals-helper.js for the full
 *   rationale on why the prior _resolveModalRoot() fallback (which ended
 *   at document.body) was wrong.
 *
 * PERSIST FAILURE CONTRACT (REVISED)
 * ----------------------------------
 *   The prior edit-name-period and delete-name-period modals returned
 *   `true` from onConfirm even when persist failed, closing the modal
 *   and leaving the user with an in-memory mutation and an error toast.
 *   That behaviour was inconsistent with the modals-core close contract
 *   and left the user without a way to retry.
 *
 *   This version keeps the modal OPEN when persist fails, so the user
 *   sees the error toast, can retry the persist by clicking Save again,
 *   or can cancel. This is the only correct behaviour when the mutation
 *   is destructive (a deleted name period cannot be un-deleted).
 *
 *   For the create/edit household modals (modals-household.js), which
 *   close on persist failure with a success toast, the reasoning is
 *   documented there: those flows treat "create succeeded in memory"
 *   as a valid outcome for the caller. Name periods are different —
 *   they're a list the user is actively editing, and a partial save is
 *   a state the user should see.
 *
 * DEPENDENCIES (REQUIRED, verified at load):
 *   - modals-core.js (openModal, closeTopModal, confirmDialog)
 *   - accessors.js (getCharacterById)
 *   - household-queries.js (HouseholdQueries)
 *   - household-commands.js (HouseholdCommands)
 *   - household-modals-helper.js (HouseholdModals)
 *   - household-view-models.js (HouseholdViewModels)
 *
 * ICON POLICY: SVG from icons.js. No emojis.
 *
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. LOAD-TIME DEPENDENCY VERIFICATION
    // =========================================================================

    function _requireFunction(name, fn) {
        if (typeof fn !== 'function') {
            throw new Error('modals-household-snapshot: ' + name + ' is required');
        }
        return fn;
    }

    function _requireObject(name, obj) {
        if (typeof obj === 'undefined' || obj === null) {
            throw new Error('modals-household-snapshot: ' + name + ' is required');
        }
        return obj;
    }

    var _queries = _requireObject('HouseholdQueries', window.HouseholdQueries);
    _requireFunction('HouseholdQueries.getHousehold', _queries.getHousehold);
    _requireFunction('HouseholdQueries.getHouseholdNamePeriods',
        _queries.getHouseholdNamePeriods);
    _requireFunction('HouseholdQueries.getHouseholdSnapshot',
        _queries.getHouseholdSnapshot);
    _requireFunction('HouseholdQueries.getCharacterHouseholdSnapshot',
        _queries.getCharacterHouseholdSnapshot);

    var _commands = _requireObject('HouseholdCommands', window.HouseholdCommands);
    _requireFunction('HouseholdCommands.editNamePeriod',
        _commands.editNamePeriod);
    _requireFunction('HouseholdCommands.deleteNamePeriod',
        _commands.deleteNamePeriod);

    var _openModal = _requireFunction('openModal',
        typeof window.openModal === 'function'
            ? window.openModal
            : window._openModal);
    var _closeTopModal = _requireFunction('closeTopModal',
        typeof window.closeTopModal === 'function'
            ? window.closeTopModal
            : window._closeTopModal);

    var _getCharacterById = _requireFunction('getCharacterById',
        window.getCharacterById);

    var _Modals = _requireObject('HouseholdModals', window.HouseholdModals);
    _requireFunction('HouseholdModals.rootFrom', _Modals.rootFrom);
    _requireFunction('HouseholdModals.persistOrFail', _Modals.persistOrFail);
    _requireFunction('HouseholdModals.reportFailure', _Modals.reportFailure);
    _requireFunction('HouseholdModals.esc', _Modals.esc);
    _requireFunction('HouseholdModals.readValue', _Modals.readValue);
    _requireFunction('HouseholdModals.readIntOrNull', _Modals.readIntOrNull);
    _requireFunction('HouseholdModals.onOpen', _Modals.onOpen);

    var _VM = _requireObject('HouseholdViewModels', window.HouseholdViewModels);

    // Local aliases.
    var _esc = _Modals.esc;
    var _showSuccess = _Modals.showSuccess;
    var _showInfo = _Modals.showInfo;
    var _showError = _Modals.showError;

    function _currentYear() {
        return (typeof window.getCurrentYearSafe === 'function')
            ? window.getCurrentYearSafe()
            : null;
    }

    // =========================================================================
    // 1. CONFIRM DIALOG
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

    // =========================================================================
    // 2. VIEW HOUSEHOLD HISTORY MODAL
    // =========================================================================

    function openViewHouseholdHistoryModal(householdId) {
        var household = _queries.getHousehold(householdId);
        if (!household) {
            _showError('Household not found');
            return null;
        }

        var periods = _queries.getHouseholdNamePeriods(householdId);

        var content = _buildHistoryContent(household, periods);

        var modal = _openModal({
            title: 'Household History: ' + household.name,
            content: content,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function() { /* close only */ }
        });

        _Modals.onOpen(modal, function(root) {
            _wireHistoryActions(root, householdId, periods);
        });

        return modal;
    }

    function _buildHistoryContent(household, periods) {
        var html = '<div style="margin-bottom:16px;">';

        html += '<div style="background:var(--bg2);padding:12px;border-radius:8px;margin-bottom:16px;">' +
            '<div><strong>' + _esc(household.name) + '</strong></div>' +
            '<div style="font-size:0.65rem;color:var(--dim);">' +
                'Founded: ' + (household.foundedYear !== null
                    ? household.foundedYear : '?') +
                ' · Current name since: ' +
                (household.currentNameSince !== null
                    ? household.currentNameSince
                    : (household.foundedYear !== null
                        ? household.foundedYear : '?')) +
            '</div>' +
            '<div style="font-size:0.65rem;color:var(--dim);">' +
                'Total name periods: ' + periods.length +
            '</div>' +
        '</div>';

        html += '<div style="margin-bottom:16px;">';
        html += '<div style="font-size:0.7rem;color:var(--accent);margin-bottom:8px;">' +
            'Name Change History' +
        '</div>';

        if (periods.length === 0) {
            html += '<div style="color:var(--dim);text-align:center;padding:20px;">' +
                'No name change history recorded' +
            '</div>';
        } else {
            html += '<div style="display:flex;flex-direction:column;gap:8px;">';
            for (var i = 0; i < periods.length; i++) {
                html += _buildPeriodRow(periods[i], periods.length);
            }
            html += '</div>';
        }
        html += '</div>';

        html += '<div style="padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;color:var(--dim);">' +
            'Name changes help track the evolution of a household through generations.' +
        '</div>';

        html += '</div>';
        return html;
    }

    function _buildPeriodRow(period, totalPeriods) {
        var isCurrent = period.isCurrent === true;
        var periodDisplay;
        if (period.periodEnd !== null && period.periodEnd !== undefined) {
            periodDisplay = '(' + period.year + ' - ' + period.periodEnd + ')';
        } else {
            periodDisplay = '(' + period.year + ' - present)';
        }

        var html = '<div style="background:var(--bg3);border-radius:6px;padding:10px;' +
            'border-left:3px solid ' + (isCurrent ? 'var(--accent)' : 'var(--border)') + ';">';

        html += '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;">';
        html += '<div>';
        html += '<span style="font-weight:bold;">' + period.year + '</span>';
        html += '<span style="margin-left:8px;">' +
            _esc(period.oldName || '—') + ' → <strong>' +
            _esc(period.newName) + '</strong></span>';
        html += '<span style="font-size:0.55rem;color:var(--dim);margin-left:8px;">' +
            _esc(periodDisplay) + '</span>';
        html += '</div>';
        if (isCurrent) {
            html += '<span style="font-size:0.55rem;color:var(--accent);">Current</span>';
        }
        html += '</div>';

        if (period.reason) {
            html += '<div style="font-size:0.6rem;color:var(--dim);margin-top:4px;">' +
                'Reason: ' + _esc(period.reason) +
            '</div>';
        }
        if (period.changedBy) {
            html += '<div style="font-size:0.55rem;color:var(--dim);margin-top:2px;">' +
                'By: ' + _esc(period.changedBy) +
            '</div>';
        }

        html += '<div style="margin-top:6px;display:flex;gap:4px;">';
        html += '<button data-action="edit-period" data-period-index="' + period.index +
            '" style="padding:2px 6px;font-size:0.5rem;background:var(--accent-dim);' +
            'border:1px solid var(--accent);border-radius:3px;cursor:pointer;">Edit</button>';
        if (totalPeriods > 1) {
            html += '<button data-action="delete-period" data-period-index="' + period.index +
                '" style="padding:2px 6px;font-size:0.5rem;background:#8a3020;border:none;' +
                'color:white;border-radius:3px;cursor:pointer;">Delete</button>';
        }
        html += '</div>';

        html += '</div>';
        return html;
    }

    function _wireHistoryActions(root, householdId, periods) {
        function _closeThen(fn) {
            _closeTopModal();
            setTimeout(fn, 0);
        }

        var editBtns = root.querySelectorAll('[data-action="edit-period"]');
        for (var i = 0; i < editBtns.length; i++) {
            (function(btn) {
                btn.onclick = function(event) {
                    event.stopPropagation();
                    var index = _Modals.readIntOrNull(btn, '') !== null
                        ? parseInt(btn.dataset.periodIndex, 10)
                        : null;
                    // Simpler read: parse dataset directly.
                    var parsed = parseInt(btn.dataset.periodIndex, 10);
                    if (!Number.isInteger(parsed)) return;
                    _closeThen(function() {
                        openEditNamePeriodModal(householdId, parsed, function() {
                            setTimeout(function() {
                                openViewHouseholdHistoryModal(householdId);
                            }, 0);
                        });
                    });
                };
            })(editBtns[i]);
        }

        var deleteBtns = root.querySelectorAll('[data-action="delete-period"]');
        for (var j = 0; j < deleteBtns.length; j++) {
            (function(btn) {
                btn.onclick = function(event) {
                    event.stopPropagation();
                    var index = parseInt(btn.dataset.periodIndex, 10);
                    if (!Number.isInteger(index)) return;

                    var period = null;
                    for (var k = 0; k < periods.length; k++) {
                        if (periods[k].index === index) {
                            period = periods[k];
                            break;
                        }
                    }
                    if (!period) return;

                    _confirmDialog(
                        'Delete the name period "' + period.newName + '" (' +
                        period.year + ')?\n\n' +
                        'This will remove this name change from history.',
                        'Delete Name Period',
                        function() {
                            var result = _commands.deleteNamePeriod(
                                householdId, index);
                            if (!result.success) {
                                _Modals.reportFailure(result,
                                    'Failed to delete name period');
                                return;
                            }

                            var persisted = _Modals.persistOrFail('Name period deleted');
                            if (!persisted.ok) {
                                // Modal already closed by confirmDialog.
                                // Show toast; the caller can retry via the
                                // history modal.
                                return;
                            }

                            _showInfo('Name period deleted');
                            _closeTopModal();
                            setTimeout(function() {
                                openViewHouseholdHistoryModal(householdId);
                            }, 0);
                        },
                        function() { /* cancelled */ }
                    );
                };
            })(deleteBtns[j]);
        }
    }

    // =========================================================================
    // 3. EDIT NAME PERIOD MODAL
    // =========================================================================

    function openEditNamePeriodModal(householdId, periodIndex, onSuccess) {
        var household = _queries.getHousehold(householdId);
        if (!household) {
            _showError('Household not found');
            return null;
        }

        var periods = _queries.getHouseholdNamePeriods(householdId);
        var period = null;
        for (var i = 0; i < periods.length; i++) {
            if (periods[i].index === periodIndex) {
                period = periods[i];
                break;
            }
        }

        if (!period) {
            _showError('Name period not found');
            return null;
        }

        var isCurrent = period.isCurrent === true;
        var currentYear = _currentYear();

        var content =
            '<div style="margin-bottom:16px;">' +
                '<div style="background:var(--bg3);border-radius:6px;padding:8px 12px;margin-bottom:12px;font-size:0.6rem;color:var(--dim);">' +
                    'Editing Name Period' +
                    '<div style="font-size:0.55rem;color:var(--dim);margin-top:4px;">' +
                        (isCurrent
                            ? 'This is the current name period. Changes will update the household name.'
                            : 'This is a historical name period. Changes will not affect the current name.') +
                    '</div>' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Name</label>' +
                    '<input type="text" data-field="name" value="' +
                        _esc(period.newName) +
                        '" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;">' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Year of Change</label>' +
                    '<input type="number" data-field="year" value="' + period.year +
                        '" min="1"' +
                        (currentYear !== null
                            ? ' max="' + (currentYear + 5) + '"'
                            : '') +
                        ' style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;">' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Reason</label>' +
                    '<input type="text" data-field="reason" value="' +
                        _esc(period.reason || '') +
                        '" placeholder="e.g., Succession, Marriage..." ' +
                        'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;">' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Changed By (optional)</label>' +
                    '<input type="text" data-field="changedBy" value="' +
                        _esc(period.changedBy || '') +
                        '" placeholder="Who changed the name" ' +
                        'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;">' +
                '</div>' +
            '</div>';

        var modal = _openModal({
            title: 'Edit Name Period: ' + period.newName,
            content: content,
            confirmText: 'Save Changes',
            cancelText: 'Cancel',
            onConfirm: function() {
                var root = _Modals.rootFrom(modal);
                if (!root) {
                    _showError('Modal root unavailable');
                    return false;
                }

                var newName = _Modals.readValue(root, '[data-field="name"]').trim();
                if (!newName) {
                    _showError('Please enter a name');
                    return false;
                }

                var year = _Modals.readIntOrNull(root, '[data-field="year"]');
                if (year === null || year < 1) {
                    _showError('Please enter a valid year');
                    return false;
                }

                var reason = _Modals.readValue(root, '[data-field="reason"]');
                var changedBy = _Modals.readValue(root, '[data-field="changedBy"]');

                var result = _commands.editNamePeriod(householdId, periodIndex, {
                    newName: newName,
                    year: year,
                    reason: reason || null,
                    changedBy: changedBy || null
                });

                if (!result.success) {
                    _Modals.reportFailure(result, 'Failed to update name period');
                    return false;
                }

                var persisted = _Modals.persistOrFail('Name period updated');
                if (!persisted.ok) {
                    // Keep the modal open so the user can retry. The
                    // mutation is in memory; clicking Save again persists.
                    return false;
                }

                _showSuccess('Name period updated');
                if (typeof onSuccess === 'function') onSuccess(result.data);
                return true;
            }
        });

        return modal;
    }

    // =========================================================================
    // 4. DELETE NAME PERIOD MODAL
    // =========================================================================

    function openDeleteNamePeriodModal(householdId, periodIndex, onSuccess) {
        var household = _queries.getHousehold(householdId);
        if (!household) {
            _showError('Household not found');
            return null;
        }

        var periods = _queries.getHouseholdNamePeriods(householdId);
        var period = null;
        for (var i = 0; i < periods.length; i++) {
            if (periods[i].index === periodIndex) {
                period = periods[i];
                break;
            }
        }

        if (!period) {
            _showError('Name period not found');
            return null;
        }

        if (periods.length <= 1) {
            _showError('Cannot delete the only name period');
            return null;
        }

        var isCurrent = period.isCurrent === true;

        var content =
            '<div style="margin-bottom:16px;">' +
                '<div style="background:rgba(200,68,68,0.15);border:1px solid var(--warn);border-radius:8px;padding:12px;margin-bottom:16px;">' +
                    '<strong>Delete Name Period</strong>' +
                    '<div style="margin-top:8px;font-size:0.65rem;">' +
                        'You are about to delete the name period "' +
                        _esc(period.newName) + '" (' + period.year + ').' +
                        (isCurrent
                            ? ' This is the current name period. The household name will revert to the previous period.'
                            : '') +
                    '</div>' +
                    '<div style="margin-top:8px;font-size:0.6rem;color:var(--warn);">' +
                        'Warning: This action cannot be undone.' +
                    '</div>' +
                '</div>' +

                '<div style="background:var(--bg3);border-radius:6px;padding:12px;">' +
                    '<div style="display:flex;justify-content:space-between;font-size:0.6rem;">' +
                        '<span>Period:</span>' +
                        '<span>' + period.year + ' - ' +
                            (period.periodEnd !== null
                                ? period.periodEnd : 'present') +
                        '</span>' +
                    '</div>' +
                    '<div style="display:flex;justify-content:space-between;font-size:0.6rem;margin-top:4px;">' +
                        '<span>Name:</span>' +
                        '<span><strong>' + _esc(period.newName) + '</strong>' +
                            (period.oldName
                                ? ' (was ' + _esc(period.oldName) + ')'
                                : '') +
                        '</span>' +
                    '</div>' +
                    (period.reason
                        ? '<div style="display:flex;justify-content:space-between;font-size:0.55rem;margin-top:4px;color:var(--dim);">' +
                            '<span>Reason:</span>' +
                            '<span>' + _esc(period.reason) + '</span>' +
                          '</div>'
                        : '') +
                '</div>' +
            '</div>';

        var modal = _openModal({
            title: 'Delete Name Period',
            content: content,
            confirmText: 'Delete Period',
            cancelText: 'Cancel',
            confirmStyle: 'danger',
            onConfirm: function() {
                var result = _commands.deleteNamePeriod(householdId, periodIndex);
                if (!result.success) {
                    _Modals.reportFailure(result, 'Failed to delete name period');
                    return false;
                }

                var persisted = _Modals.persistOrFail('Name period deleted');
                if (!persisted.ok) {
                    // Keep the modal open so the user can retry.
                    return false;
                }

                _showInfo('Name period deleted');
                if (typeof onSuccess === 'function') onSuccess(result.data);
                return true;
            }
        });

        return modal;
    }

    // =========================================================================
    // 5. HOUSEHOLD SNAPSHOT MODAL
    // =========================================================================

    function openHouseholdSnapshotModal(householdId, year, viewMode) {
        var household = _queries.getHousehold(householdId);
        if (!household) {
            _showError('Household not found');
            return null;
        }

        var snapshotYear = (year !== undefined && year !== null)
            ? year
            : _currentYear();
        if (snapshotYear === null) {
            _showError('Current year unavailable');
            return null;
        }

        var mode = viewMode || 'all';

        var snapshot;
        try {
            snapshot = _queries.getHouseholdSnapshot(householdId, snapshotYear, mode);
        } catch (e) {
            snapshot = null;
        }

        if (!snapshot) {
            _showError('Could not generate snapshot');
            return null;
        }

        var content = _buildSnapshotContent(snapshot, null);

        return _openModal({
            title: 'Household Snapshot: ' + household.name +
                ' (' + snapshotYear + ')',
            content: content,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function() { /* close only */ }
        });
    }

    // =========================================================================
    // 6. CHARACTER HOUSEHOLD SNAPSHOT MODAL
    // =========================================================================

    function openCharacterHouseholdSnapshotModal(characterId, viewMode) {
        var character = null;
        try {
            character = _getCharacterById(characterId);
        } catch (e) {
            character = null;
        }
        if (!character) {
            _showError('Character not found');
            return null;
        }

        var mode = viewMode || 'at_death';

        var snapshot;
        try {
            snapshot = _queries.getCharacterHouseholdSnapshot(characterId, mode);
        } catch (e) {
            snapshot = null;
        }

        if (!snapshot) {
            _showInfo('Could not generate snapshot for character');
            return null;
        }

        var content = _buildSnapshotContent(snapshot, characterId);

        return _openModal({
            title: 'Character Household Snapshot: ' +
                (character.name || 'Unknown'),
            content: content,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function() { /* close only */ }
        });
    }

    // =========================================================================
    // 7. SNAPSHOT CONTENT BUILDER
    // =========================================================================

    function _buildSnapshotContent(snapshot, targetCharacterId) {
        var html = '<div style="margin-bottom:16px;">';

        var periodLabel = snapshot.periodName || snapshot.nameAtTime ||
            snapshot.householdName || 'Unknown';
        var yearLabel = snapshot.snapshotYear !== undefined
            ? snapshot.snapshotYear : '?';

        html += '<div style="padding:12px;background:var(--bg2);border-radius:8px;margin-bottom:12px;">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">';
        html += '<div>';
        html += '<div style="font-size:0.8rem;font-weight:bold;">' +
            _esc(periodLabel) + '</div>';
        if (snapshot.householdName && snapshot.householdName !== periodLabel) {
            html += '<div style="font-size:0.65rem;color:var(--dim);">' +
                _esc(snapshot.householdName) + '</div>';
        }
        html += '</div>';
        html += '<div style="font-size:0.6rem;color:var(--dim);">' +
            _esc(_VM.getViewModeLabel(snapshot.viewMode)) + '</div>';
        html += '</div>';

        html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:8px;font-size:0.55rem;">';
        html += '<div><span style="color:var(--dim);">Year:</span> ' +
            yearLabel + '</div>';
        html += '<div><span style="color:var(--dim);">Total:</span> ' +
            (snapshot.totalMembers || 0) + ' members</div>';
        html += '<div><span style="color:var(--dim);">Living:</span> ' +
            (snapshot.livingCount || 0) + '</div>';
        html += '</div>';

        if (snapshot.period) {
            var periodStart = snapshot.period.startYear !== undefined
                ? snapshot.period.startYear
                : (snapshot.period.year !== undefined
                    ? snapshot.period.year : '?');
            var periodEnd = snapshot.period.endYear !== undefined &&
                snapshot.period.endYear !== null
                ? snapshot.period.endYear : 'present';
            html += '<div style="font-size:0.5rem;color:var(--dim);margin-top:4px;">';
            html += 'Period: ' + periodStart + ' - ' + periodEnd;
            if (snapshot.period.reason) {
                html += ' · ' + _esc(snapshot.period.reason);
            }
            html += '</div>';
        }

        html += '</div>';

        // Members list.
        html += '<div style="margin-bottom:12px;">';
        html += '<div style="font-size:0.6rem;color:var(--accent);margin-bottom:8px;">Members</div>';

        if (!snapshot.members || snapshot.members.length === 0) {
            html += '<div style="color:var(--dim);text-align:center;padding:20px;">' +
                'No members in this snapshot' +
            '</div>';
        } else {
            html += '<div style="max-height:300px;overflow-y:auto;">';
            for (var i = 0; i < snapshot.members.length; i++) {
                html += _buildSnapshotMemberRow(
                    snapshot.members[i], targetCharacterId);
            }
            html += '</div>';
        }

        html += '</div>';

        html += '<div style="padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;color:var(--dim);">' +
            'Snapshot shows the household at a specific point in time.' +
            (targetCharacterId
                ? ' The target character is highlighted.'
                : '') +
        '</div>';

        html += '</div>';
        return html;
    }

    function _buildSnapshotMemberRow(member, targetCharacterId) {
        var isTarget = targetCharacterId &&
            member.characterId === targetCharacterId;
        var isHead = member.isHead === true;
        var aliveAtSnapshot = member.aliveAtSnapshot === true;
        var currentlyDeceased = member.currentlyDeceased === true;
        var isMissing = member.isMissing === true;

        var statusText = '';
        var statusColor = 'var(--dim)';
        if (isTarget) {
            statusText = 'Target';
            statusColor = 'var(--accent)';
        } else if (isMissing) {
            statusText = 'Missing';
            statusColor = 'var(--warn)';
        } else if (!aliveAtSnapshot) {
            statusText = 'Not in household';
            statusColor = 'var(--dim)';
        } else if (currentlyDeceased) {
            statusText = 'Deceased';
            statusColor = '#8a2020';
        } else {
            statusText = 'Living';
            statusColor = 'var(--success)';
        }

        var displayName = member.displayName ||
            ((member.name || '') +
                (member.surname ? ' ' + member.surname : '')) ||
            'Unknown';

        var ageText = (member.ageAtSnapshot !== null &&
            member.ageAtSnapshot !== undefined)
            ? member.ageAtSnapshot + 'y'
            : '—';

        var dim = (!aliveAtSnapshot && !isTarget) ? 'opacity:0.6;' : '';
        var highlight = isTarget ? 'background:var(--accent-dim);' : '';

        var headIcon = '';
        if (isHead && window.Icons && window.Icons.CROWN) {
            headIcon = window.Icons.CROWN;
        }

        var html = '<div style="display:flex;justify-content:space-between;align-items:center;' +
            'padding:6px 8px;border-bottom:1px solid var(--border-light);' +
            dim + highlight + '">';

        html += '<div>';
        if (headIcon) html += headIcon + ' ';
        html += _esc(displayName);
        if (member.role) {
            html += ' <span style="font-size:0.5rem;color:var(--dim);">(' +
                _esc(member.role) + ')</span>';
        }
        html += '</div>';

        html += '<div style="font-size:0.5rem;color:' + statusColor + ';">';
        html += statusText + ' · ' + ageText;
        if (member.joinedYear !== null && member.joinedYear !== undefined) {
            html += ' · Joined: ' + member.joinedYear;
        }
        if (member.leftYear !== null && member.leftYear !== undefined) {
            html += ' · Left: ' + member.leftYear;
        }
        html += '</div>';

        html += '</div>';
        return html;
    }

    // =========================================================================
    // 8. EXPORTS
    // =========================================================================

    window.openViewHouseholdHistoryModal = openViewHouseholdHistoryModal;
    window.openEditNamePeriodModal = openEditNamePeriodModal;
    window.openDeleteNamePeriodModal = openDeleteNamePeriodModal;
    window.openHouseholdSnapshotModal = openHouseholdSnapshotModal;
    window.openCharacterHouseholdSnapshotModal = openCharacterHouseholdSnapshotModal;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            openViewHouseholdHistoryModal: openViewHouseholdHistoryModal,
            openEditNamePeriodModal: openEditNamePeriodModal,
            openDeleteNamePeriodModal: openDeleteNamePeriodModal,
            openHouseholdSnapshotModal: openHouseholdSnapshotModal,
            openCharacterHouseholdSnapshotModal: openCharacterHouseholdSnapshotModal
        };
    }

})();
