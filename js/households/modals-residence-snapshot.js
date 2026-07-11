/**
 * =============================================================================
 * HOUSEHOLD SNAPSHOT MODALS (modals-household-snapshot.js)
 * =============================================================================
 * 
 * PURPOSE: UI modals for household snapshots and name period management.
 * 
 * DEPENDS ON:
 *   - modals-core.js (openModal, closeTopModal, _escapeHtml, _showToast, _getIcon)
 *   - household-state.js (HouseholdState)
 *   - household-commands.js (HouseholdCommands)
 *   - household-queries.js (HouseholdQueries)
 * 
 * EXPORTS:
 *   - openViewHouseholdHistoryModal()
 *   - openHouseholdSnapshotModal()
 *   - openCharacterHouseholdSnapshotModal()
 *   - openEditNamePeriodModal()
 *   - openDeleteNamePeriodModal()
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

    var _processingSnapshotModal = false;

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

    // =========================================================================
    // 2. STATE AND SYSTEM REFERENCE
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

    function _getPlaceById(placeId) {
        if (typeof window.getPlaceById === 'function') {
            return window.getPlaceById(placeId);
        }
        return null;
    }

    function _getHouseholdNameHistory(householdId) {
        var household = _getHousehold(householdId);
        return household ? (household.nameHistory || []) : [];
    }

    function _getHouseholdNamePeriods(householdId) {
        if (typeof window.getHouseholdNamePeriods === 'function') {
            return window.getHouseholdNamePeriods(householdId);
        }
        var household = _getHousehold(householdId);
        if (!household) return [];

        var history = (household.nameHistory || []).slice().sort(function(a, b) { return a.year - b.year; });
        var currentYear = _getCurrentYear();

        if (history.length === 0) {
            return [{
                oldName: null,
                newName: household.name,
                year: household.foundedYear || currentYear,
                periodEnd: null,
                members: [],
                isCurrent: true,
                index: 0,
                reason: 'Household founded',
                changedBy: null
            }];
        }

        for (var i = 0; i < history.length; i++) {
            if (i < history.length - 1) {
                history[i].periodEnd = history[i + 1].year - 1;
            } else {
                history[i].periodEnd = null;
            }
            history[i].isCurrent = (i === history.length - 1);
            history[i].index = i;
        }

        return history;
    }

    function _getHouseholdSnapshot(householdId, year, viewMode) {
        if (typeof window.getHouseholdSnapshot === 'function') {
            return window.getHouseholdSnapshot(householdId, year, viewMode);
        }
        return null;
    }

    function _editHouseholdNamePeriod(householdId, periodIndex, updates) {
        if (typeof window.editHouseholdNamePeriod === 'function') {
            return window.editHouseholdNamePeriod(householdId, periodIndex, updates);
        }
        return false;
    }

    function _deleteHouseholdNamePeriod(householdId, periodIndex) {
        if (typeof window.deleteHouseholdNamePeriod === 'function') {
            return window.deleteHouseholdNamePeriod(householdId, periodIndex);
        }
        return false;
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
    // 5. VIEW HOUSEHOLD HISTORY MODAL
    // =========================================================================

    function openViewHouseholdHistoryModal(householdId) {
        if (_processingSnapshotModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingSnapshotModal = true;

        try {
            var household = _getHousehold(householdId);
            if (!household) {
                _showToast('Household not found', 'error');
                _processingSnapshotModal = false;
                return;
            }

            var nameHistory = _getHouseholdNameHistory(householdId);
            var periods = _getHouseholdNamePeriods(householdId);
            var currentYear = _getCurrentYear();

            var historyHtml = '';
            if (nameHistory.length === 0) {
                historyHtml = '<div style="color: var(--dim); text-align: center; padding: 20px;">No name change history recorded</div>';
            } else {
                historyHtml = '<div style="display: flex; flex-direction: column; gap: 8px;">';
                for (var i = 0; i < nameHistory.length; i++) {
                    var h = nameHistory[i];
                    var isCurrent = i === nameHistory.length - 1;
                    var period = periods[i] || {};
                    var periodDisplay = '';
                    if (period.periodEnd) {
                        periodDisplay = ' (' + period.year + ' - ' + period.periodEnd + ')';
                    } else {
                        periodDisplay = ' (' + period.year + ' - present)';
                    }

                    historyHtml +=
                        '<div style="background: var(--bg3); border-radius: 6px; padding: 10px; border-left: 3px solid ' + (isCurrent ? 'var(--accent)' : 'var(--border)') + ';">' +
                        '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">' +
                        '<div>' +
                        '<span style="font-weight: bold;">' + h.year + '</span>' +
                        '<span style="margin-left: 8px;">' + _escapeHtml(h.oldName || '—') + ' → <strong>' + _escapeHtml(h.newName) + '</strong></span>' +
                        '<span style="font-size: 0.55rem; color: var(--dim); margin-left: 8px;">' + periodDisplay + '</span>' +
                        '</div>' +
                        (isCurrent ? '<span style="font-size: 0.55rem; color: var(--accent);">Current</span>' : '') +
                        '</div>' +
                        (h.reason ? '<div style="font-size: 0.6rem; color: var(--dim); margin-top: 4px;">Reason: ' + _escapeHtml(h.reason) + '</div>' : '') +
                        (h.changedBy ? '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 2px;">By: ' + _escapeHtml(h.changedBy) + '</div>' : '') +
                        '<div style="margin-top: 6px; display: flex; gap: 4px;">' +
                        '<button class="edit-period-btn btn small" data-index="' + i + '" style="padding: 2px 6px; font-size: 0.5rem; background: var(--accent-dim); border: 1px solid var(--accent); border-radius: 3px; cursor: pointer;">Edit</button>' +
                        (nameHistory.length > 1 ? '<button class="delete-period-btn btn small danger" data-index="' + i + '" style="padding: 2px 6px; font-size: 0.5rem; background: #8a3020; border: none; color: white; border-radius: 3px; cursor: pointer;">Delete</button>' : '') +
                        '</div>' +
                        '</div>';
                }
                historyHtml += '</div>';
            }

            var modalContent =
                '<div style="margin-bottom: 16px; background: var(--bg2); padding: 12px; border-radius: 8px;">' +
                '<div><strong>' + _escapeHtml(household.name) + '</strong></div>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">Founded: ' + (household.foundedYear || '?') + ' · Current name since: ' + (household.currentNameSince || household.foundedYear || '?') + '</div>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">Total name changes: ' + nameHistory.length + '</div>' +
                '</div>' +
                '<div style="margin-bottom: 16px;">' +
                '<div style="font-size: 0.7rem; color: var(--accent); margin-bottom: 8px;">Name Change History</div>' +
                historyHtml +
                '</div>' +
                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem;">' +
                'Name changes help track the evolution of a household through generations. Click "Edit" to correct name or year, "Delete" to remove an entry.' +
                '</div>';

            _openModal({
                title: 'Household History: ' + household.name,
                content: modalContent,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {
                    _closeTopModal();
                    _processingSnapshotModal = false;
                }
            });

            // Attach event handlers
            setTimeout(function() {
                // Edit period buttons
                var editBtns = document.querySelectorAll('.edit-period-btn');
                editBtns.forEach(function(btn) {
                    var newBtn = btn.cloneNode(true);
                    if (btn.parentNode) {
                        btn.parentNode.replaceChild(newBtn, btn);
                    }

                    newBtn.onclick = function(e) {
                        e.stopPropagation();
                        var index = parseInt(this.dataset.index);
                        _closeTopModal();
                        _processingSnapshotModal = false;
                        openEditNamePeriodModal(householdId, index, function() {
                            setTimeout(function() {
                                openViewHouseholdHistoryModal(householdId);
                            }, 100);
                        });
                    };
                });

                // Delete period buttons
                var deleteBtns = document.querySelectorAll('.delete-period-btn');
                deleteBtns.forEach(function(btn) {
                    var newBtn = btn.cloneNode(true);
                    if (btn.parentNode) {
                        btn.parentNode.replaceChild(newBtn, btn);
                    }

                    newBtn.onclick = function(e) {
                        e.stopPropagation();
                        var index = parseInt(this.dataset.index);
                        var period = periods[index];
                        if (period) {
                            _confirmDialog(
                                'Delete the name period "' + period.newName + '" (' + period.year + ')?\n\nThis will remove this name change from history.',
                                'Delete Name Period',
                                function() {
                                    var success = _deleteHouseholdNamePeriod(householdId, index);
                                    if (success) {
                                        _showToast('Name period deleted', 'info');
                                        _closeTopModal();
                                        _processingSnapshotModal = false;
                                        setTimeout(function() {
                                            openViewHouseholdHistoryModal(householdId);
                                        }, 100);
                                    } else {
                                        _showToast('Failed to delete name period', 'error');
                                    }
                                },
                                function() {
                                    _processingSnapshotModal = false;
                                }
                            );
                        }
                    };
                });
            }, 100);

        } catch (e) {
            _processingSnapshotModal = false;
            _showToast('Error opening household history', 'error');
        }
    }

    // =========================================================================
    // 6. EDIT NAME PERIOD MODAL
    // =========================================================================

    function openEditNamePeriodModal(householdId, periodIndex, onSuccess) {
        if (_processingSnapshotModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingSnapshotModal = true;

        try {
            var household = _getHousehold(householdId);
            if (!household) {
                _showToast('Household not found', 'error');
                _processingSnapshotModal = false;
                return;
            }

            var history = (household.nameHistory || []).slice().sort(function(a, b) { return a.year - b.year; });
            var period = history[periodIndex];
            if (!period) {
                _showToast('Name period not found', 'error');
                _processingSnapshotModal = false;
                return;
            }

            var isCurrent = periodIndex === history.length - 1;
            var currentYear = _getCurrentYear();

            var modalContent =
                '<div style="margin-bottom: 16px;">' +
                '<div style="background: var(--bg3); border-radius: 6px; padding: 8px 12px; margin-bottom: 12px; font-size: 0.6rem; color: var(--dim);">' +
                'Editing Name Period' +
                '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 4px;">' + (isCurrent ? 'This is the current name period.' : 'This is a historical name period.') + '</div>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Name</label>' +
                '<input type="text" id="editPeriodName" value="' + _escapeHtml(period.newName) + '" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Year of Change</label>' +
                '<input type="number" id="editPeriodYear" value="' + period.year + '" min="1" max="' + (currentYear + 5) + '" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Reason</label>' +
                '<input type="text" id="editPeriodReason" value="' + _escapeHtml(period.reason || '') + '" placeholder="e.g., Succession, Marriage..." style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Changed By (optional)</label>' +
                '<input type="text" id="editPeriodChangedBy" value="' + _escapeHtml(period.changedBy || '') + '" placeholder="Who changed the name" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '</div>' +
                (isCurrent ? '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; margin-top: 8px;">Changing the current period name will update the household name.</div>' : '') +
                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; margin-top: 8px;">' +
                (isCurrent ? 'Changing the current period name will update the household name.' : 'Changing a historical period will not affect the current household name.') +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Edit Name Period: ' + period.newName,
                content: modalContent,
                confirmText: 'Save Changes',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var name = document.getElementById('editPeriodName').value.trim();
                    var year = parseInt(document.getElementById('editPeriodYear').value);
                    var reason = document.getElementById('editPeriodReason').value;
                    var changedBy = document.getElementById('editPeriodChangedBy').value;

                    if (!name) {
                        _showToast('Please enter a name', 'error');
                        return false;
                    }

                    if (isNaN(year) || year < 1) {
                        _showToast('Please enter a valid year', 'error');
                        return false;
                    }

                    var updates = {
                        name: name,
                        year: year,
                        reason: reason || null,
                        changedBy: changedBy || null
                    };

                    var success = _editHouseholdNamePeriod(householdId, periodIndex, updates);

                    if (success) {
                        _showToast('Name period updated', 'success');
                        _closeTopModal();
                        _processingSnapshotModal = false;
                        if (onSuccess) {
                            onSuccess();
                        }
                    } else {
                        _showToast('Failed to update name period', 'error');
                    }
                    return true;
                },
                onCancel: function() {
                    _processingSnapshotModal = false;
                }
            });

        } catch (e) {
            _processingSnapshotModal = false;
            _showToast('Error opening edit name period modal', 'error');
        }
    }

    // =========================================================================
    // 7. DELETE NAME PERIOD MODAL
    // =========================================================================

    function openDeleteNamePeriodModal(householdId, periodIndex, onSuccess) {
        if (_processingSnapshotModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingSnapshotModal = true;

        try {
            var household = _getHousehold(householdId);
            if (!household) {
                _showToast('Household not found', 'error');
                _processingSnapshotModal = false;
                return;
            }

            var history = (household.nameHistory || []).slice().sort(function(a, b) { return a.year - b.year; });
            var period = history[periodIndex];
            if (!period) {
                _showToast('Name period not found', 'error');
                _processingSnapshotModal = false;
                return;
            }

            if (history.length <= 1) {
                _showToast('Cannot delete the only name period', 'error');
                _processingSnapshotModal = false;
                if (onSuccess) {
                    onSuccess();
                }
                return;
            }

            var isCurrent = periodIndex === history.length - 1;

            var modalContent =
                '<div style="margin-bottom: 16px;">' +
                '<div style="background: rgba(200, 68, 68, 0.15); border: 1px solid var(--warn); border-radius: 8px; padding: 12px; margin-bottom: 16px;">' +
                '<strong>Delete Name Period</strong>' +
                '<div style="margin-top: 8px; font-size: 0.65rem;">' +
                'You are about to delete the name period "' + _escapeHtml(period.newName) + '" (' + period.year + ').' +
                (isCurrent ? ' This is the current name period. The household name will revert to the previous period.' : '') +
                '</div>' +
                '<div style="margin-top: 8px; font-size: 0.6rem; color: var(--warn);">' +
                'Warning: This action cannot be undone.' +
                '</div>' +
                '</div>' +
                '<div style="background: var(--bg3); border-radius: 6px; padding: 12px;">' +
                '<div style="display: flex; justify-content: space-between; font-size: 0.6rem;">' +
                '<span>Period:</span>' +
                '<span>' + period.year + ' - ' + (period.periodEnd || 'present') + '</span>' +
                '</div>' +
                '<div style="display: flex; justify-content: space-between; font-size: 0.6rem; margin-top: 4px;">' +
                '<span>Name:</span>' +
                '<span><strong>' + _escapeHtml(period.newName) + '</strong>' + (period.oldName ? ' (was ' + _escapeHtml(period.oldName) + ')' : '') + '</span>' +
                '</div>' +
                (period.reason ? '<div style="display: flex; justify-content: space-between; font-size: 0.55rem; margin-top: 4px; color: var(--dim);"><span>Reason:</span><span>' + _escapeHtml(period.reason) + '</span></div>' : '') +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Delete Name Period',
                content: modalContent,
                confirmText: 'Delete Period',
                cancelText: 'Cancel',
                confirmStyle: 'danger',
                onConfirm: function() {
                    var success = _deleteHouseholdNamePeriod(householdId, periodIndex);

                    if (success) {
                        _showToast('Name period deleted', 'info');
                        _closeTopModal();
                        _processingSnapshotModal = false;
                        if (onSuccess) {
                            onSuccess();
                        }
                    } else {
                        _showToast('Failed to delete name period', 'error');
                    }
                    return true;
                },
                onCancel: function() {
                    _processingSnapshotModal = false;
                }
            });

        } catch (e) {
            _processingSnapshotModal = false;
            _showToast('Error opening delete name period modal', 'error');
        }
    }

    // =========================================================================
    // 8. HOUSEHOLD SNAPSHOT MODAL
    // =========================================================================

    function openHouseholdSnapshotModal(householdId, year, viewMode) {
        if (_processingSnapshotModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingSnapshotModal = true;

        try {
            var household = _getHousehold(householdId);
            if (!household) {
                _showToast('Household not found', 'error');
                _processingSnapshotModal = false;
                return;
            }

            var snapshotYear = year || _getCurrentYear();
            var viewModeDisplay = viewMode || 'all';

            var snapshot = _getHouseholdSnapshot(householdId, snapshotYear, viewModeDisplay);
            if (!snapshot) {
                _showToast('Could not generate snapshot', 'error');
                _processingSnapshotModal = false;
                return;
            }

            var viewModeLabels = {
                'all': 'All Members',
                'at_death': 'At Death',
                'at_join': 'At Join'
            };

            // Build members HTML
            var membersHtml = '';
            if (snapshot.members && snapshot.members.length > 0) {
                membersHtml = '<div style="max-height: 300px; overflow-y: auto;">';
                for (var i = 0; i < snapshot.members.length; i++) {
                    var m = snapshot.members[i];
                    var character = m.character;
                    var member = m.member;

                    var isDeceased = m.isDeceased || false;
                    var aliveAtTime = m.aliveAtTime || false;
                    var isHead = m.isHead || false;
                    var age = _calculateAge(character.birthYear, isDeceased, character.deathYear);
                    var genderSymbol = character.gender === 'male' ? '♂' : (character.gender === 'female' ? '♀' : '?');

                    var statusText = '';
                    if (isDeceased) {
                        statusText = 'Deceased';
                    } else if (!aliveAtTime) {
                        statusText = 'Not in household';
                    } else {
                        statusText = 'Living';
                    }

                    var statusColor = isDeceased ? '#8a2020' : (aliveAtTime ? '#4a9e6a' : '#8a8a8a');

                    membersHtml +=
                        '<div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; border-bottom: 1px solid var(--border-light); ' + (isDeceased ? 'opacity: 0.6;' : '') + '">' +
                        '<div>' +
                        '<span>' + (isHead ? '◆ ' : '') + genderSymbol + ' ' + _escapeHtml(character.name) + ' ' + _escapeHtml(character.surname || '') + '</span>' +
                        (isDeceased ? ' <span style="font-size: 0.5rem; color: var(--dim);">†</span>' : '') +
                        (m.role ? ' <span style="font-size: 0.5rem; color: var(--dim);">(' + _escapeHtml(m.role) + ')</span>' : '') +
                        '</div>' +
                        '<div style="font-size: 0.5rem; color: ' + statusColor + ';">' +
                        statusText + ' · ' + age + 'y' +
                        (m.joinedYear ? ' · Joined: ' + m.joinedYear : '') +
                        (m.leftYear ? ' · Left: ' + m.leftYear : '') +
                        '</div>' +
                        '</div>';
                }
                membersHtml += '</div>';
            } else {
                membersHtml = '<div style="color: var(--dim); text-align: center; padding: 20px;">No members in this snapshot</div>';
            }

            var periodName = snapshot.nameAtTime || household.name;
            var periodInfo = snapshot.period ? snapshot.period : null;

            var modalContent =
                '<div style="margin-bottom: 16px; padding: 12px; background: var(--bg2); border-radius: 8px;">' +
                '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">' +
                '<div>' +
                '<div style="font-size: 0.8rem; font-weight: bold;">' + _escapeHtml(periodName) + '</div>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">' + _escapeHtml(household.name) + '</div>' +
                '</div>' +
                '<div style="font-size: 0.6rem; color: var(--dim);">' + viewModeLabels[viewModeDisplay] || viewModeDisplay + '</div>' +
                '</div>' +
                '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-top: 8px; font-size: 0.55rem;">' +
                '<div><span style="color: var(--dim);">Year:</span> ' + snapshotYear + '</div>' +
                '<div><span style="color: var(--dim);">Total:</span> ' + snapshot.totalMembers + ' members</div>' +
                '<div><span style="color: var(--dim);">Living:</span> ' + snapshot.livingCount + '</div>' +
                '</div>' +
                (periodInfo ? '<div style="font-size: 0.5rem; color: var(--dim); margin-top: 4px;">Period: ' + periodInfo.year + (periodInfo.periodEnd ? ' - ' + periodInfo.periodEnd : ' - present') + (periodInfo.reason ? ' · ' + _escapeHtml(periodInfo.reason) : '') + '</div>' : '') +
                '</div>' +
                '<div style="margin-bottom: 12px;">' +
                '<div style="font-size: 0.6rem; color: var(--accent); margin-bottom: 8px;">Members</div>' +
                membersHtml +
                '</div>' +
                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem;">' +
                'Snapshot shows the household at a specific point in time. Use "All Members" to see everyone associated with this household.' +
                '</div>';

            _openModal({
                title: 'Household Snapshot: ' + household.name + ' (' + snapshotYear + ')',
                content: modalContent,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {
                    _closeTopModal();
                    _processingSnapshotModal = false;
                }
            });

        } catch (e) {
            _processingSnapshotModal = false;
            _showToast('Error opening household snapshot', 'error');
        }
    }

    // =========================================================================
    // 9. CHARACTER HOUSEHOLD SNAPSHOT MODAL
    // =========================================================================

    function openCharacterHouseholdSnapshotModal(characterId, viewMode) {
        if (_processingSnapshotModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingSnapshotModal = true;

        try {
            var character = _getCharacterById(characterId);
            if (!character) {
                _showToast('Character not found', 'error');
                _processingSnapshotModal = false;
                return;
            }

            var viewModeDisplay = viewMode || 'at_death';
            var snapshot = _getHouseholdSnapshot(characterId, null, viewModeDisplay);

            if (!snapshot) {
                var household = _state ? _state.getCharacterHousehold(characterId) : null;
                if (household) {
                    _showToast('Could not generate snapshot for character', 'error');
                } else {
                    _showToast('Character is not in a household', 'info');
                }
                _processingSnapshotModal = false;
                return;
            }

            // Reuse the snapshot modal with character context
            var viewModeLabels = {
                'all': 'All Members',
                'at_death': 'At Death',
                'at_join': 'At Join'
            };

            var membersHtml = '';
            if (snapshot.members && snapshot.members.length > 0) {
                membersHtml = '<div style="max-height: 300px; overflow-y: auto;">';
                for (var i = 0; i < snapshot.members.length; i++) {
                    var m = snapshot.members[i];
                    var char = m.character;
                    var isDeceased = m.isDeceased || false;
                    var aliveAtTime = m.aliveAtTime || false;
                    var isHead = m.isHead || false;
                    var age = _calculateAge(char.birthYear, isDeceased, char.deathYear);
                    var genderSymbol = char.gender === 'male' ? '♂' : (char.gender === 'female' ? '♀' : '?');

                    var isTarget = char.id === characterId;
                    var statusText = '';
                    if (isTarget) statusText = '★ You';
                    else if (isDeceased) statusText = 'Deceased';
                    else if (!aliveAtTime) statusText = 'Not in household';
                    else statusText = 'Living';

                    var statusColor = isTarget ? 'var(--accent)' : (isDeceased ? '#8a2020' : (aliveAtTime ? '#4a9e6a' : '#8a8a8a'));

                    membersHtml +=
                        '<div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; border-bottom: 1px solid var(--border-light); ' + (isDeceased ? 'opacity: 0.6;' : '') + (isTarget ? 'background: var(--accent-dim);' : '') + '">' +
                        '<div>' +
                        '<span>' + (isHead ? '◆ ' : '') + genderSymbol + ' ' + _escapeHtml(char.name) + ' ' + _escapeHtml(char.surname || '') + (isTarget ? ' <strong>(You)</strong>' : '') + '</span>' +
                        (isDeceased ? ' <span style="font-size: 0.5rem; color: var(--dim);">†</span>' : '') +
                        (m.role ? ' <span style="font-size: 0.5rem; color: var(--dim);">(' + _escapeHtml(m.role) + ')</span>' : '') +
                        '</div>' +
                        '<div style="font-size: 0.5rem; color: ' + statusColor + ';">' +
                        statusText + ' · ' + age + 'y' +
                        (m.joinedYear ? ' · Joined: ' + m.joinedYear : '') +
                        (m.leftYear ? ' · Left: ' + m.leftYear : '') +
                        '</div>' +
                        '</div>';
                }
                membersHtml += '</div>';
            } else {
                membersHtml = '<div style="color: var(--dim); text-align: center; padding: 20px;">No members in this snapshot</div>';
            }

            var periodName = snapshot.nameAtTime || snapshot.householdName;

            var modalContent =
                '<div style="margin-bottom: 16px; padding: 12px; background: var(--bg2); border-radius: 8px;">' +
                '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">' +
                '<div>' +
                '<div style="font-size: 0.8rem; font-weight: bold;">' + _escapeHtml(character.name) + ' ' + _escapeHtml(character.surname || '') + '</div>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">' + _escapeHtml(periodName) + '</div>' +
                '</div>' +
                '<div style="font-size: 0.6rem; color: var(--dim);">' + (viewModeLabels[viewModeDisplay] || viewModeDisplay) + '</div>' +
                '</div>' +
                '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-top: 8px; font-size: 0.55rem;">' +
                '<div><span style="color: var(--dim);">Year:</span> ' + snapshot.snapshotYear + '</div>' +
                '<div><span style="color: var(--dim);">Total:</span> ' + snapshot.totalMembers + ' members</div>' +
                '<div><span style="color: var(--dim);">Living:</span> ' + snapshot.livingCount + '</div>' +
                '</div>' +
                '</div>' +
                '<div style="margin-bottom: 12px;">' +
                '<div style="font-size: 0.6rem; color: var(--accent); margin-bottom: 8px;">Members</div>' +
                membersHtml +
                '</div>' +
                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem;">' +
                'Snapshot shows the household at a specific point in time. ★ indicates the target character.' +
                '</div>';

            _openModal({
                title: 'Character Household Snapshot: ' + character.name,
                content: modalContent,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {
                    _closeTopModal();
                    _processingSnapshotModal = false;
                }
            });

        } catch (e) {
            _processingSnapshotModal = false;
            _showToast('Error opening character household snapshot', 'error');
        }
    }

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

    window.openViewHouseholdHistoryModal = openViewHouseholdHistoryModal;
    window.openEditNamePeriodModal = openEditNamePeriodModal;
    window.openDeleteNamePeriodModal = openDeleteNamePeriodModal;
    window.openHouseholdSnapshotModal = openHouseholdSnapshotModal;
    window.openCharacterHouseholdSnapshotModal = openCharacterHouseholdSnapshotModal;

    // ES Module exports
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