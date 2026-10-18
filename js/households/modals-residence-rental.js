/**
 * =============================================================================
 * STILL WATERS - RESIDENCE RENTAL MODALS (modals-residence-rental.js)
 * =============================================================================
 * 
 * LOCATION: js/systems/household/modals-residence-rental.js
 * 
 * PURPOSE
 * -------
 * Modal entry points for residence rental operations:
 * /**
 * =============================================================================
 * STILL WATERS - RESIDENCE RENTAL MODALS (modals-residence-rental.js)
 * =============================================================================
 *
 * LOCATION: js/systems/household/modals-residence-rental.js
 *
 * PURPOSE
 * -------
 * Modal entry points for residence rental operations:
 *
 *   - openSetResidenceOwnerModal(residenceId, onSuccess)
 *   - openSetResidenceRenterModal(residenceId, onSuccess)
 *   - openUpdateRentModal(residenceId, onSuccess)
 *   - openEndRentalModal(residenceId, onSuccess)
 *   - openResidenceRentalHistoryModal(residenceId)
 *   - openHouseholdRentalSummaryModal(householdId)
 *   - openRentPaymentModal(residenceId, onSuccess)
 *   - openResidenceRentalDetailsModal(residenceId)
 *
 * OWNERSHIP
 * ---------
 *   Reads:  ResidenceSystem (getResidence, getResidenceOwner,
 *           getResidenceRenter, getResidencesByOwner,
 *           getResidencesByRenter, getTotalRentIncome,
 *           getTotalRentExpenses, getResidenceRentalHistory,
 *           getRentPayments)
 *           HouseholdQueries.getHousehold
 *   Writes: ResidenceSystem (setResidenceOwner, setResidenceRenter,
 *           updateResidenceRent, endResidenceRental, recordRentPayment)
 *           + one persist() per mutation
 *   UI:     modals-core, selectors, icons
 *
 * CONVERGED PATTERN NOTES
 * -----------------------
 *   - Every rental mutation ends with ResidenceSystem.persist().
 *   - No direct residence record mutation.
 *   - No direct household record mutation.
 *   - Command result shapes fully honored.
 *   - Stale-selection prevention: changing owner type / renter type
 *     clears the current selection.
 *   - No _processingRentalModal guard.
 *   - No financial calculations here — income/expense aggregation lives
 *     in HouseholdEconomy.
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
            throw new Error('modals-residence-rental: ' + name + ' is required');
        }
        return fn;
    }

    function _requireObject(name, obj) {
        if (typeof obj === 'undefined' || obj === null) {
            throw new Error('modals-residence-rental: ' + name + ' is required');
        }
        return obj;
    }

    var _residence = _requireObject('ResidenceSystem', window.ResidenceSystem);
    _requireFunction('ResidenceSystem.persist', _residence.persist);
    _requireFunction('ResidenceSystem.setResidenceOwner',
        _residence.setResidenceOwner);
    _requireFunction('ResidenceSystem.getResidenceOwner',
        _residence.getResidenceOwner);
    _requireFunction('ResidenceSystem.setResidenceRenter',
        _residence.setResidenceRenter);
    _requireFunction('ResidenceSystem.getResidenceRenter',
        _residence.getResidenceRenter);
    _requireFunction('ResidenceSystem.endResidenceRental',
        _residence.endResidenceRental);
    _requireFunction('ResidenceSystem.updateResidenceRent',
        _residence.updateResidenceRent);
    _requireFunction('ResidenceSystem.recordRentPayment',
        _residence.recordRentPayment);
    _requireFunction('ResidenceSystem.getResidence',
        _residence.getResidence);
    _requireFunction('ResidenceSystem.getResidencesByOwner',
        _residence.getResidencesByOwner);
    _requireFunction('ResidenceSystem.getResidencesByRenter',
        _residence.getResidencesByRenter);
    _requireFunction('ResidenceSystem.getTotalRentIncome',
        _residence.getTotalRentIncome);
    _requireFunction('ResidenceSystem.getTotalRentExpenses',
        _residence.getTotalRentExpenses);
    _requireFunction('ResidenceSystem.getResidenceRentalHistory',
        _residence.getResidenceRentalHistory);
    _requireFunction('ResidenceSystem.getRentPayments',
        _residence.getRentPayments);

    var _householdQueries = _requireObject('HouseholdQueries',
        window.HouseholdQueries);
    _requireFunction('HouseholdQueries.getHousehold',
        _householdQueries.getHousehold);

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

    function _currentYear() {
        if (typeof window.getCurrentYearSafe === 'function') {
            return window.getCurrentYearSafe();
        }
        return null;
    }

    function _openHouseholdSelector(options) {
        if (typeof window.openHouseholdSelector === 'function') {
            return window.openHouseholdSelector(options);
        }
        _showToast('Household selector not available', 'error');
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

    function _lookupOwnerName(type, id) {
        if (type === 'household') {
            var h = _householdQueries.getHousehold(id);
            if (h) return h.name;
            return 'Unknown Household';
        }
        if (type === 'character') {
            if (typeof window.getCharacterById === 'function') {
                var c = window.getCharacterById(id);
                if (c) return (c.name || '') + (c.surname ? ' ' + c.surname : '');
            }
            return 'Unknown Character';
        }
        return 'Unknown';
    }

    // =========================================================================
    // 3. SET RESIDENCE OWNER MODAL
    // =========================================================================

    function openSetResidenceOwnerModal(residenceId, onSuccess) {
        var residence = _residence.getResidence(residenceId);
        if (!residence) {
            _showToast('Residence not found', 'error');
            return null;
        }

        var currentOwner = _residence.getResidenceOwner(residenceId);
        var currentOwnerName = currentOwner && currentOwner.ownerId
            ? currentOwner.ownerName : 'None';
        var currentOwnerType = currentOwner && currentOwner.ownerType
            ? currentOwner.ownerType : 'household';

        var year = _currentYear();

        var content =
            '<div style="margin-bottom:16px;">' +
                '<div style="background:var(--bg2);padding:12px;border-radius:6px;margin-bottom:12px;">' +
                    '<div style="font-size:0.7rem;"><strong>' +
                        _escapeHtml(residence.name) + '</strong></div>' +
                    '<div style="font-size:0.6rem;color:var(--dim);">Current Owner: ' +
                        _escapeHtml(currentOwnerName) +
                        (currentOwnerType
                            ? ' (' + _escapeHtml(currentOwnerType) + ')'
                            : '') +
                    '</div>' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Owner Type</label>' +
                    '<select data-field="ownerType" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                        '<option value="household"' +
                            (currentOwnerType === 'household' ? ' selected' : '') +
                            '>Household</option>' +
                        '<option value="character"' +
                            (currentOwnerType === 'character' ? ' selected' : '') +
                            '>Character</option>' +
                    '</select>' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Owner</label>' +
                    '<div style="display:flex;gap:6px;">' +
                        '<input type="text" data-field="ownerDisplay" placeholder="Select owner..." readonly ' +
                            'style="flex:1;padding:8px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;cursor:pointer;">' +
                        '<input type="hidden" data-field="ownerId">' +
                        '<button data-action="select-owner" class="btn" style="font-size:0.6rem;padding:4px 10px;">Select</button>' +
                        '<button data-action="clear-owner" class="btn" style="font-size:0.6rem;padding:4px 8px;">Clear</button>' +
                    '</div>' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Owner Since</label>' +
                    '<input type="number" data-field="ownerSince" value="' +
                        (year !== null ? year : '') +
                        '" min="1" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;">' +
                '</div>' +

                '<div style="padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;color:var(--dim);">' +
                    'Setting an owner does not affect an existing rental agreement. ' +
                    'To end a rental, use the End Rental action.' +
                '</div>' +
            '</div>';

        var handle = _openModal({
            title: 'Set Owner: ' + residence.name,
            content: content,
            confirmText: 'Set Owner',
            cancelText: 'Cancel',
            onConfirm: function() {
                var root = _resolveModalRoot();
                if (!root) return false;

                var ownerId = (root.querySelector('[data-field="ownerId"]') || {}).value;
                if (!ownerId) {
                    _showToast('Please select an owner', 'error');
                    return false;
                }
                var ownerType = (root.querySelector('[data-field="ownerType"]') || {}).value;
                var ownerSince = _parseIntOrNull(
                    (root.querySelector('[data-field="ownerSince"]') || {}).value);
                if (ownerSince === null || ownerSince < 1) {
                    _showToast('Please enter a valid year', 'error');
                    return false;
                }

                var result = _residence.setResidenceOwner(
                    residenceId, ownerType, ownerId, {
                        ownerSince: ownerSince
                    });

                if (!result.success) {
                    _reportFailure(result, 'Failed to set owner');
                    return false;
                }

                var persisted = _persistOrFail('Owner set');
                if (!persisted.ok) {
                    if (typeof onSuccess === 'function') onSuccess(result.data);
                    return true;
                }

                _showToast('Owner set successfully', 'success');
                if (typeof onSuccess === 'function') onSuccess(result.data);
                return true;
            }
        });

        setTimeout(_attachOnOpen(function(root) {
            _wireOwnerTypeChange(root);
        }), 0);

        return handle;
    }

    function _wireOwnerTypeChange(root) {
        var typeSelect = root.querySelector('[data-field="ownerType"]');
        var display = root.querySelector('[data-field="ownerDisplay"]');
        var hidden = root.querySelector('[data-field="ownerId"]');
        var selectBtn = root.querySelector('[data-action="select-owner"]');
        var clearBtn = root.querySelector('[data-action="clear-owner"]');

        if (typeSelect) {
            typeSelect.onchange = function() {
                if (display) display.value = '';
                if (hidden) hidden.value = '';
            };
        }

        if (selectBtn) {
            selectBtn.onclick = function() {
                var ownerType = typeSelect ? typeSelect.value : 'household';
                if (ownerType === 'household') {
                    _openHouseholdSelector({
                        title: 'Select Owner Household',
                        onSelect: function(household) {
                            if (!household) return;
                            if (display) display.value = household.name;
                            if (hidden) hidden.value = household.id;
                        }
                    });
                } else {
                    _openCharacterSelector({
                        title: 'Select Owner Character',
                        onSelect: function(character) {
                            if (!character) return;
                            var name = (character.name || '') +
                                (character.surname ? ' ' + character.surname : '');
                            if (display) display.value = name;
                            if (hidden) hidden.value = character.id;
                        }
                    });
                }
            };
        }

        if (clearBtn) {
            clearBtn.onclick = function() {
                if (display) display.value = '';
                if (hidden) hidden.value = '';
            };
        }
    }

    // =========================================================================
    // 4. SET RESIDENCE RENTER MODAL
    // =========================================================================

    function openSetResidenceRenterModal(residenceId, onSuccess) {
        var residence = _residence.getResidence(residenceId);
        if (!residence) {
            _showToast('Residence not found', 'error');
            return null;
        }

        if (!residence.ownerId) {
            _showToast(
                'Residence must have an owner before it can be rented',
                'error');
            return null;
        }

        var currentRenter = _residence.getResidenceRenter(residenceId);
        var currentRent = currentRenter ? currentRenter.rentAmount : 0;
        var currentRenterType = currentRenter && currentRenter.renterType
            ? currentRenter.renterType : 'household';

        var year = _currentYear();

        var content =
            '<div style="margin-bottom:16px;">' +
                '<div style="background:var(--bg2);padding:12px;border-radius:6px;margin-bottom:12px;">' +
                    '<div style="font-size:0.7rem;"><strong>' +
                        _escapeHtml(residence.name) + '</strong></div>' +
                    '<div style="font-size:0.6rem;color:var(--dim);">Owner: ' +
                        _escapeHtml(residence.ownerName || 'Unknown') + '</div>' +
                    '<div style="font-size:0.6rem;color:var(--dim);">Current Renter: ' +
                        _escapeHtml(currentRenter && currentRenter.renterId
                            ? currentRenter.renterName : 'None') + '</div>' +
                    '<div style="font-size:0.6rem;color:var(--dim);">Current Rent: ' +
                        currentRent + 'g/year</div>' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Renter Type</label>' +
                    '<select data-field="renterType" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                        '<option value="household"' +
                            (currentRenterType === 'household' ? ' selected' : '') +
                            '>Household</option>' +
                        '<option value="character"' +
                            (currentRenterType === 'character' ? ' selected' : '') +
                            '>Character</option>' +
                    '</select>' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Renter</label>' +
                    '<div style="display:flex;gap:6px;">' +
                        '<input type="text" data-field="renterDisplay" placeholder="Select renter..." readonly ' +
                            'style="flex:1;padding:8px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;cursor:pointer;">' +
                        '<input type="hidden" data-field="renterId">' +
                        '<button data-action="select-renter" class="btn" style="font-size:0.6rem;padding:4px 10px;">Select</button>' +
                        '<button data-action="clear-renter" class="btn" style="font-size:0.6rem;padding:4px 8px;">Clear</button>' +
                    '</div>' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Annual Rent (gold)</label>' +
                    '<input type="number" data-field="rentAmount" value="' +
                        (currentRent > 0 ? currentRent : 50) +
                        '" min="0" step="1" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;">' +
                    '<small style="font-size:0.55rem;color:var(--dim);">Rent is collected annually by the owner.</small>' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Rent Start Year</label>' +
                    '<input type="number" data-field="rentStartYear" value="' +
                        (year !== null ? year : '') +
                        '" min="1" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;">' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Notes (optional)</label>' +
                    '<textarea data-field="notes" rows="2" placeholder="e.g., Lease terms, conditions..." ' +
                        'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;"></textarea>' +
                '</div>' +
            '</div>';

        var handle = _openModal({
            title: 'Set Renter: ' + residence.name,
            content: content,
            confirmText: 'Set Renter',
            cancelText: 'Cancel',
            onConfirm: function() {
                var root = _resolveModalRoot();
                if (!root) return false;

                var renterId = (root.querySelector('[data-field="renterId"]') || {}).value;
                if (!renterId) {
                    _showToast('Please select a renter', 'error');
                    return false;
                }

                var renterType = (root.querySelector('[data-field="renterType"]') || {}).value;
                var rentAmount = _parseIntOrNull(
                    (root.querySelector('[data-field="rentAmount"]') || {}).value);
                if (rentAmount === null || rentAmount < 0) {
                    _showToast('Rent must be a non-negative integer', 'error');
                    return false;
                }

                var rentStartYear = _parseIntOrNull(
                    (root.querySelector('[data-field="rentStartYear"]') || {}).value);
                if (rentStartYear === null || rentStartYear < 1) {
                    _showToast('Please enter a valid year', 'error');
                    return false;
                }

                var notes =
                    ((root.querySelector('[data-field="notes"]') || {}).value || '').trim();

                var result = _residence.setResidenceRenter(
                    residenceId, renterType, renterId, rentAmount, {
                        rentStartYear: rentStartYear,
                        notes: notes
                    });

                if (!result.success) {
                    _reportFailure(result, 'Failed to set renter');
                    return false;
                }

                var persisted = _persistOrFail('Renter set');
                if (!persisted.ok) {
                    if (typeof onSuccess === 'function') onSuccess(result.data);
                    return true;
                }

                _showToast('Renter set (' + rentAmount + 'g/year)', 'success');
                if (typeof onSuccess === 'function') onSuccess(result.data);
                return true;
            }
        });

        setTimeout(_attachOnOpen(function(root) {
            _wireRenterTypeChange(root);
        }), 0);

        return handle;
    }

    function _wireRenterTypeChange(root) {
        var typeSelect = root.querySelector('[data-field="renterType"]');
        var display = root.querySelector('[data-field="renterDisplay"]');
        var hidden = root.querySelector('[data-field="renterId"]');
        var selectBtn = root.querySelector('[data-action="select-renter"]');
        var clearBtn = root.querySelector('[data-action="clear-renter"]');

        if (typeSelect) {
            typeSelect.onchange = function() {
                if (display) display.value = '';
                if (hidden) hidden.value = '';
            };
        }

        if (selectBtn) {
            selectBtn.onclick = function() {
                var renterType = typeSelect ? typeSelect.value : 'household';
                if (renterType === 'household') {
                    _openHouseholdSelector({
                        title: 'Select Renter Household',
                        onSelect: function(household) {
                            if (!household) return;
                            if (display) display.value = household.name;
                            if (hidden) hidden.value = household.id;
                        }
                    });
                } else {
                    _openCharacterSelector({
                        title: 'Select Renter Character',
                        onSelect: function(character) {
                            if (!character) return;
                            var name = (character.name || '') +
                                (character.surname ? ' ' + character.surname : '');
                            if (display) display.value = name;
                            if (hidden) hidden.value = character.id;
                        }
                    });
                }
            };
        }

        if (clearBtn) {
            clearBtn.onclick = function() {
                if (display) display.value = '';
                if (hidden) hidden.value = '';
            };
        }
    }

    // =========================================================================
    // 5. UPDATE RENT MODAL
    // =========================================================================

    function openUpdateRentModal(residenceId, onSuccess) {
        var residence = _residence.getResidence(residenceId);
        if (!residence) {
            _showToast('Residence not found', 'error');
            return null;
        }

        var renter = _residence.getResidenceRenter(residenceId);
        if (!renter || !renter.renterId) {
            _showToast('Residence has no renter', 'error');
            return null;
        }

        var currentRent = renter.rentAmount;
        var year = _currentYear();

        var content =
            '<div style="margin-bottom:16px;">' +
                '<div style="background:var(--bg2);padding:12px;border-radius:6px;margin-bottom:12px;">' +
                    '<div style="font-size:0.7rem;"><strong>' +
                        _escapeHtml(residence.name) + '</strong></div>' +
                    '<div style="font-size:0.6rem;color:var(--dim);">Renter: ' +
                        _escapeHtml(renter.renterName) + '</div>' +
                    '<div style="font-size:0.6rem;color:var(--dim);">Current Rent: ' +
                        currentRent + 'g/year</div>' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">New Annual Rent (gold)</label>' +
                    '<input type="number" data-field="newRent" value="' + currentRent +
                        '" min="0" step="1" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;">' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Effective Year</label>' +
                    '<input type="number" data-field="effectiveYear" value="' +
                        (year !== null ? year : '') +
                        '" min="1" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;">' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Reason (optional)</label>' +
                    '<input type="text" data-field="reason" placeholder="e.g., Market adjustment..." ' +
                        'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;">' +
                '</div>' +

                '<div style="padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;color:var(--warn);">' +
                    'Rent change will be recorded in the rental history and will affect annual income/expenses starting from the effective year.' +
                '</div>' +
            '</div>';

        return _openModal({
            title: 'Update Rent: ' + residence.name,
            content: content,
            confirmText: 'Update Rent',
            cancelText: 'Cancel',
            onConfirm: function() {
                var root = _resolveModalRoot();
                if (!root) return false;

                var newRent = _parseIntOrNull(
                    (root.querySelector('[data-field="newRent"]') || {}).value);
                if (newRent === null || newRent < 0) {
                    _showToast('Rent must be a non-negative integer', 'error');
                    return false;
                }

                if (newRent === currentRent) {
                    _showToast('Rent amount is unchanged', 'info');
                    if (typeof onSuccess === 'function') onSuccess();
                    return true;
                }

                var effectiveYear = _parseIntOrNull(
                    (root.querySelector('[data-field="effectiveYear"]') || {}).value);
                if (effectiveYear === null || effectiveYear < 1) {
                    _showToast('Please enter a valid year', 'error');
                    return false;
                }

                var reason =
                    ((root.querySelector('[data-field="reason"]') || {}).value || '').trim();

                var result = _residence.updateResidenceRent(
                    residenceId, newRent, effectiveYear,
                    reason || 'Rent adjustment');

                if (!result.success) {
                    _reportFailure(result, 'Failed to update rent');
                    return false;
                }

                var persisted = _persistOrFail('Rent updated');
                if (!persisted.ok) {
                    if (typeof onSuccess === 'function') onSuccess(result.data);
                    return true;
                }

                _showToast('Rent updated from ' + currentRent + ' to ' +
                    newRent + 'g/year', 'success');
                if (typeof onSuccess === 'function') onSuccess(result.data);
                return true;
            }
        });
    }

    // =========================================================================
    // 6. END RENTAL MODAL
    // =========================================================================

    function openEndRentalModal(residenceId, onSuccess) {
        var residence = _residence.getResidence(residenceId);
        if (!residence) {
            _showToast('Residence not found', 'error');
            return null;
        }

        var renter = _residence.getResidenceRenter(residenceId);
        if (!renter || !renter.renterId) {
            _showToast('Residence has no active rental', 'warning');
            if (typeof onSuccess === 'function') onSuccess();
            return null;
        }

        var year = _currentYear();

        var content =
            '<div style="margin-bottom:16px;">' +
                '<div style="background:rgba(200,68,68,0.1);border:1px solid var(--warn);border-radius:8px;padding:12px;margin-bottom:16px;">' +
                    '<div style="font-size:0.7rem;"><strong>End Rental: ' +
                        _escapeHtml(residence.name) + '</strong></div>' +
                    '<div style="font-size:0.55rem;color:var(--dim);margin-top:4px;">' +
                        'Current Renter: ' + _escapeHtml(renter.renterName) + '</div>' +
                    '<div style="font-size:0.55rem;color:var(--dim);">' +
                        'Annual Rent: ' + renter.rentAmount + 'g</div>' +
                    '<div style="font-size:0.55rem;color:var(--dim);">' +
                        'Rented since: ' +
                        (renter.rentStartYear !== null
                            ? renter.rentStartYear : 'Unknown') +
                    '</div>' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">End Year</label>' +
                    '<input type="number" data-field="endYear" value="' +
                        (year !== null ? year : '') +
                        '" min="1" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;">' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Reason</label>' +
                    '<select data-field="reason" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                        '<option value="tenant_moved_out">Tenant moved out</option>' +
                        '<option value="tenant_evicted">Tenant evicted</option>' +
                        '<option value="lease_expired">Lease expired</option>' +
                        '<option value="owner_occupying">Owner taking possession</option>' +
                        '<option value="property_sold">Property sold</option>' +
                        '<option value="mutual_agreement">Mutual agreement</option>' +
                        '<option value="custom">Custom reason</option>' +
                    '</select>' +
                '</div>' +

                '<div data-role="custom-reason-group" style="display:none;margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Custom Reason</label>' +
                    '<input type="text" data-field="customReason" placeholder="Enter custom reason..." ' +
                        'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;">' +
                '</div>' +

                '<div style="padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;color:var(--warn);">' +
                    'Ending the rental will mark the residence as vacant and remove the renter association.' +
                '</div>' +
            '</div>';

        var handle = _openModal({
            title: 'End Rental: ' + residence.name,
            content: content,
            confirmText: 'End Rental',
            cancelText: 'Cancel',
            confirmStyle: 'danger',
            onConfirm: function() {
                var root = _resolveModalRoot();
                if (!root) return false;

                var endYear = _parseIntOrNull(
                    (root.querySelector('[data-field="endYear"]') || {}).value);
                if (endYear === null || endYear < 1) {
                    _showToast('Please enter a valid year', 'error');
                    return false;
                }

                var reasonValue = (root.querySelector('[data-field="reason"]') || {}).value;
                var customReason =
                    ((root.querySelector('[data-field="customReason"]') || {}).value || '').trim();

                var reason;
                if (reasonValue === 'custom') {
                    if (!customReason) {
                        _showToast('Please enter a custom reason', 'error');
                        return false;
                    }
                    reason = customReason;
                } else {
                    reason = reasonValue;
                }

                var result = _residence.endResidenceRental(
                    residenceId, endYear, reason);
                if (!result.success) {
                    _reportFailure(result, 'Failed to end rental');
                    return false;
                }

                var persisted = _persistOrFail('Rental ended');
                if (!persisted.ok) {
                    if (typeof onSuccess === 'function') onSuccess(result.data);
                    return true;
                }

                _showToast('Rental ended for ' + renter.renterName, 'success');
                if (typeof onSuccess === 'function') onSuccess(result.data);
                return true;
            }
        });

        setTimeout(_attachOnOpen(function(root) {
            var reasonSelect = root.querySelector('[data-field="reason"]');
            var customGroup = root.querySelector('[data-role="custom-reason-group"]');
            if (reasonSelect && customGroup) {
                reasonSelect.onchange = function() {
                    customGroup.style.display =
                        reasonSelect.value === 'custom' ? 'block' : 'none';
                };
            }
        }), 0);

        return handle;
    }

    // =========================================================================
    // 7. RESIDENCE RENTAL HISTORY MODAL (pure projection)
    // =========================================================================

    function openResidenceRentalHistoryModal(residenceId) {
        var residence = _residence.getResidence(residenceId);
        if (!residence) {
            _showToast('Residence not found', 'error');
            return null;
        }

        var rentalHistory = _residence.getResidenceRentalHistory(residenceId, 50);
        var payments = _residence.getRentPayments(residenceId, 50);
        var renter = _residence.getResidenceRenter(residenceId);

        var content = _buildRentalHistoryContent(
            residence, rentalHistory, payments, renter);

        return _openModal({
            title: 'Rental History: ' + residence.name,
            content: content,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function() { /* close only */ }
        });
    }

    function _buildRentalHistoryContent(residence, rentalHistory, payments, renter) {
        var html = '<div style="margin-bottom:16px;">';

        html += '<div style="padding:12px;background:var(--bg2);border-radius:8px;margin-bottom:12px;">';
        html += '<div style="font-size:0.8rem;font-weight:bold;">' +
            _escapeHtml(residence.name) + '</div>';
        html += '<div style="font-size:0.65rem;color:var(--dim);">Current Renter: ' +
            _escapeHtml(renter && renter.renterId ? renter.renterName : 'None') +
            '</div>';
        html += '<div style="font-size:0.65rem;color:var(--dim);">Current Rent: ' +
            (renter ? renter.rentAmount : 0) + 'g/year</div>';
        html += '<div style="font-size:0.65rem;color:var(--dim);">Total Rental Events: ' +
            rentalHistory.length + ' · Payments: ' + payments.length + '</div>';
        html += '</div>';

        // Rental history
        html += '<div style="margin-bottom:16px;">';
        html += '<div style="font-size:0.7rem;color:var(--accent);margin-bottom:8px;">Rental History</div>';

        if (rentalHistory.length === 0) {
            html += '<div style="color:var(--dim);text-align:center;padding:20px;font-size:0.6rem;">No rental history</div>';
        } else {
            var actionMap = {
                'rent_started': 'Started',
                'rent_adjusted': 'Adjusted',
                'rent_ended': 'Ended'
            };
            html += '<div style="max-height:200px;overflow-y:auto;">';
            for (var i = 0; i < rentalHistory.length; i++) {
                var h = rentalHistory[i];
                var isCurrent = !h.endYear;
                var label = actionMap[h.action] || h.action || 'Event';
                var amountText = '';
                if (h.oldRentAmount !== undefined && h.newRentAmount !== undefined) {
                    amountText = ' ' + h.oldRentAmount + ' → ' +
                        h.newRentAmount + 'g';
                } else if (h.rentAmount !== undefined) {
                    amountText = ' ' + h.rentAmount + 'g';
                }

                html += '<div style="display:flex;justify-content:space-between;padding:6px 8px;border-bottom:1px solid var(--border-light);' +
                    (isCurrent ? 'background:rgba(74,158,106,0.08);' : '') + '">' +
                    '<div style="font-size:0.65rem;">' +
                        (h.renterName
                            ? '<strong>' + _escapeHtml(h.renterName) + '</strong>'
                            : '') +
                        '<span style="color:var(--dim);">' +
                            _escapeHtml(amountText) + '</span>' +
                        (h.reason
                            ? ' <span style="font-size:0.5rem;color:var(--dim);">(' +
                                _escapeHtml(h.reason) + ')</span>'
                            : '') +
                    '</div>' +
                    '<div style="font-size:0.55rem;color:var(--dim);">' +
                        label + ' ' + h.year +
                        (h.endYear ? ' - ' + h.endYear : '') +
                        (isCurrent
                            ? ' <span style="color:var(--success);">Current</span>'
                            : '') +
                    '</div>' +
                '</div>';
            }
            html += '</div>';
        }
        html += '</div>';

        // Payments
        html += '<div style="margin-bottom:16px;">';
        html += '<div style="font-size:0.7rem;color:var(--accent);margin-bottom:8px;">Payment History</div>';

        if (payments.length === 0) {
            html += '<div style="color:var(--dim);text-align:center;padding:20px;font-size:0.6rem;">No payments recorded</div>';
        } else {
            html += '<div style="max-height:150px;overflow-y:auto;">';
            for (var j = 0; j < payments.length; j++) {
                var p = payments[j];
                html += '<div style="display:flex;justify-content:space-between;padding:4px 8px;border-bottom:1px solid var(--border-light);">' +
                    '<span style="font-size:0.65rem;">' +
                        _escapeHtml(p.renterName || 'Unknown') + '</span>' +
                    '<span style="font-size:0.6rem;color:var(--success);">+' +
                        p.amount + 'g</span>' +
                    '<span style="font-size:0.55rem;color:var(--dim);">' +
                        p.year + '</span>' +
                '</div>';
            }
            html += '</div>';
        }
        html += '</div>';

        html += '</div>';
        return html;
    }

    // =========================================================================
    // 8. HOUSEHOLD RENTAL SUMMARY MODAL (pure projection)
    // =========================================================================

    function openHouseholdRentalSummaryModal(householdId) {
        var household = _householdQueries.getHousehold(householdId);
        if (!household) {
            _showToast('Household not found', 'error');
            return null;
        }

        var ownedProperties = _residence.getResidencesByOwner(
            householdId, 'household');
        var rentedProperties = _residence.getResidencesByRenter(
            householdId, 'household');
        var totalRentIncome = _residence.getTotalRentIncome(
            householdId, 'household');
        var totalRentExpenses = _residence.getTotalRentExpenses(
            householdId, 'household');
        var netRent = totalRentIncome - totalRentExpenses;

        var content = _buildHouseholdRentalSummaryContent(
            household,
            ownedProperties,
            rentedProperties,
            totalRentIncome,
            totalRentExpenses,
            netRent
        );

        return _openModal({
            title: 'Rental Summary: ' + household.name,
            content: content,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function() { /* close only */ }
        });
    }

    function _buildHouseholdRentalSummaryContent(household, owned, rented,
                                                  income, expenses, net) {
        var netColor = net >= 0 ? 'var(--success)' : 'var(--danger)';

        var html = '<div style="margin-bottom:16px;">';

        html += '<div style="padding:12px;background:var(--bg2);border-radius:8px;margin-bottom:12px;">';
        html += '<div style="font-size:0.8rem;font-weight:bold;">' +
            _escapeHtml(household.name) + '</div>';
        html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:8px;">';
        html += '<div><span style="color:var(--dim);font-size:0.6rem;">Properties Owned</span><br>' +
            '<span style="font-size:1rem;font-weight:bold;">' +
            owned.length + '</span></div>';
        html += '<div><span style="color:var(--dim);font-size:0.6rem;">Properties Rented</span><br>' +
            '<span style="font-size:1rem;font-weight:bold;">' +
            rented.length + '</span></div>';
        html += '<div><span style="color:var(--dim);font-size:0.6rem;">Net Rent</span><br>' +
            '<span style="font-size:1rem;font-weight:bold;color:' + netColor + ';">' +
            (net >= 0 ? '+' : '') + net + 'g</span></div>';
        html += '</div>';
        html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:4px;">';
        html += '<div><span style="color:var(--dim);font-size:0.55rem;">Rent Income</span><br>' +
            '<span style="color:var(--success);">+' + income + 'g</span></div>';
        html += '<div><span style="color:var(--dim);font-size:0.55rem;">Rent Expenses</span><br>' +
            '<span style="color:var(--danger);">-' + expenses + 'g</span></div>';
        html += '</div>';
        html += '</div>';

        // Owned properties
        html += '<div style="margin-bottom:12px;">';
        html += '<div style="font-size:0.7rem;color:var(--accent);margin-bottom:6px;">Properties Owned (' +
            owned.length + ')</div>';
        if (owned.length === 0) {
            html += '<div style="color:var(--dim);text-align:center;padding:12px;font-size:0.6rem;">No properties owned</div>';
        } else {
            html += '<div style="max-height:150px;overflow-y:auto;">';
            for (var i = 0; i < owned.length; i++) {
                var o = owned[i];
                var renterName = o.renterName || 'Vacant';
                var rent = o.rentAmount || 0;
                var statusColor = o.renterId ? 'var(--success)' : 'var(--warn)';
                var statusText = o.renterId ? 'Rented' : 'Vacant';

                html += '<div style="display:flex;justify-content:space-between;padding:4px 8px;border-bottom:1px solid var(--border-light);border-left:3px solid ' +
                    statusColor + ';">' +
                    '<div style="font-size:0.65rem;">' +
                        _escapeHtml(o.name) + '</div>' +
                    '<div style="font-size:0.55rem;color:var(--dim);">' +
                        statusText + ' · ' + rent + 'g/year' +
                        (o.renterId
                            ? ' · ' + _escapeHtml(renterName) : '') +
                    '</div>' +
                '</div>';
            }
            html += '</div>';
        }
        html += '</div>';

        // Rented properties
        html += '<div style="margin-bottom:12px;">';
        html += '<div style="font-size:0.7rem;color:var(--accent);margin-bottom:6px;">Properties Rented (' +
            rented.length + ')</div>';
        if (rented.length === 0) {
            html += '<div style="color:var(--dim);text-align:center;padding:12px;font-size:0.6rem;">No properties rented</div>';
        } else {
            html += '<div style="max-height:150px;overflow-y:auto;">';
            for (var j = 0; j < rented.length; j++) {
                var r = rented[j];
                html += '<div style="display:flex;justify-content:space-between;padding:4px 8px;border-bottom:1px solid var(--border-light);border-left:3px solid var(--warn);">' +
                    '<div style="font-size:0.65rem;">' +
                        _escapeHtml(r.name) + '</div>' +
                    '<div style="font-size:0.55rem;color:var(--dim);">' +
                        r.rentAmount + 'g/year · Owner: ' +
                        _escapeHtml(r.ownerName || 'Unknown') +
                    '</div>' +
                '</div>';
            }
            html += '</div>';
        }
        html += '</div>';

        html += '</div>';
        return html;
    }

    // =========================================================================
    // 9. RECORD RENT PAYMENT MODAL
    // =========================================================================

    function openRentPaymentModal(residenceId, onSuccess) {
        var residence = _residence.getResidence(residenceId);
        if (!residence) {
            _showToast('Residence not found', 'error');
            return null;
        }

        var renter = _residence.getResidenceRenter(residenceId);
        if (!renter || !renter.renterId) {
            _showToast('Residence has no renter', 'error');
            return null;
        }

        var year = _currentYear();

        var content =
            '<div style="margin-bottom:16px;">' +
                '<div style="background:var(--bg2);padding:12px;border-radius:6px;margin-bottom:12px;">' +
                    '<div style="font-size:0.7rem;"><strong>' +
                        _escapeHtml(residence.name) + '</strong></div>' +
                    '<div style="font-size:0.6rem;color:var(--dim);">Renter: ' +
                        _escapeHtml(renter.renterName) + '</div>' +
                    '<div style="font-size:0.6rem;color:var(--dim);">Annual Rent: ' +
                        renter.rentAmount + 'g</div>' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Payment Year</label>' +
                    '<input type="number" data-field="year" value="' +
                        (year !== null ? year : '') +
                        '" min="1" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;">' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Amount (blank = full rent)</label>' +
                    '<input type="number" data-field="amount" placeholder="' +
                        renter.rentAmount + '" min="0" step="1" ' +
                        'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;">' +
                    '<small style="font-size:0.55rem;color:var(--dim);">Leave blank to record the full annual rent.</small>' +
                '</div>' +
            '</div>';

        return _openModal({
            title: 'Record Rent Payment: ' + residence.name,
            content: content,
            confirmText: 'Record Payment',
            cancelText: 'Cancel',
            onConfirm: function() {
                var root = _resolveModalRoot();
                if (!root) return false;

                var pYear = _parseIntOrNull(
                    (root.querySelector('[data-field="year"]') || {}).value);
                if (pYear === null || pYear < 1) {
                    _showToast('Please enter a valid year', 'error');
                    return false;
                }

                var amountRaw = (root.querySelector('[data-field="amount"]') || {}).value;
                var amount;
                if (amountRaw === '' || amountRaw === undefined) {
                    amount = renter.rentAmount;
                } else {
                    amount = _parseIntOrNull(amountRaw);
                }
                if (amount === null || amount <= 0) {
                    _showToast('Payment amount must be a positive integer', 'error');
                    return false;
                }

                var result = _residence.recordRentPayment(
                    residenceId, renter.renterId, amount, pYear);

                if (!result.success) {
                    _reportFailure(result, 'Failed to record payment');
                    return false;
                }

                var persisted = _persistOrFail('Payment recorded');
                if (!persisted.ok) {
                    if (typeof onSuccess === 'function') onSuccess(result.data);
                    return true;
                }

                _showToast('Rent payment of ' + amount +
                    'g recorded for ' + pYear, 'success');
                if (typeof onSuccess === 'function') onSuccess(result.data);
                return true;
            }
        });
    }

    // =========================================================================
    // 10. RESIDENCE RENTAL DETAILS MODAL
    // =========================================================================

    function openResidenceRentalDetailsModal(residenceId) {
        var residence = _residence.getResidence(residenceId);
        if (!residence) {
            _showToast('Residence not found', 'error');
            return null;
        }

        var owner = _residence.getResidenceOwner(residenceId);
        var renter = _residence.getResidenceRenter(residenceId);
        var rentalHistory = _residence.getResidenceRentalHistory(residenceId, 10);
        var payments = _residence.getRentPayments(residenceId, 10);

        var content = _buildRentalDetailsContent(
            residence, owner, renter, rentalHistory, payments);

        var handle = _openModal({
            title: 'Rental Details: ' + residence.name,
            content: content,
            confirmText: '',
            cancelText: '',
            onConfirm: function() { /* close only */ }
        });

        setTimeout(_attachOnOpen(function(root) {
            _wireRentalDetailsActions(root, residenceId);
        }), 0);

        return handle;
    }

    function _buildRentalDetailsContent(residence, owner, renter,
                                        rentalHistory, payments) {
        var hasRenter = renter && renter.renterId;
        var rentAmount = renter ? renter.rentAmount : 0;
        var rentalStatus = renter ? renter.rentalStatus : 'vacant';

        var statusColor = rentalStatus === 'rented'
            ? 'var(--success)'
            : (rentalStatus === 'owner_occupied'
                ? 'var(--accent)' : 'var(--warn)');

        var html = '<div style="margin-bottom:16px;">';

        html += '<div style="padding:12px;background:var(--bg2);border-radius:8px;margin-bottom:12px;">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;">';
        html += '<div style="font-size:0.9rem;font-weight:bold;">' +
            _escapeHtml(residence.name) + '</div>';
        html += '<span style="font-size:0.6rem;padding:2px 10px;border-radius:12px;background:' +
            statusColor + ';color:white;">' +
            _escapeHtml(rentalStatus) + '</span>';
        html += '</div>';
        html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;font-size:0.65rem;">';
        html += '<div><span style="color:var(--dim);">Owner:</span> ' +
            _escapeHtml(owner && owner.ownerId ? owner.ownerName : 'None') +
            '</div>';
        html += '<div><span style="color:var(--dim);">Renter:</span> ' +
            _escapeHtml(renter && renter.renterId ? renter.renterName : 'None') +
            '</div>';
        html += '<div><span style="color:var(--dim);">Rent:</span> ' +
            rentAmount + 'g/year</div>';
        html += '<div><span style="color:var(--dim);">Since:</span> ' +
            (renter && renter.rentStartYear ? renter.rentStartYear : 'N/A') +
            '</div>';
        html += '</div>';
        html += '</div>';

        // Recent history
        html += '<div style="margin-bottom:12px;">';
        html += '<div style="font-size:0.7rem;color:var(--accent);margin-bottom:6px;">Recent Rental History</div>';
        if (rentalHistory.length === 0) {
            html += '<div style="color:var(--dim);text-align:center;padding:12px;font-size:0.6rem;">No rental history</div>';
        } else {
            var limit = Math.min(rentalHistory.length, 5);
            for (var i = 0; i < limit; i++) {
                var h = rentalHistory[i];
                html += '<div style="display:flex;justify-content:space-between;padding:4px 8px;border-bottom:1px solid var(--border-light);font-size:0.6rem;">' +
                    '<span>' + _escapeHtml(h.action || 'event') +
                        (h.renterName
                            ? ' - ' + _escapeHtml(h.renterName) : '') +
                    '</span>' +
                    '<span style="color:var(--dim);">' +
                        h.year + (h.endYear ? ' - ' + h.endYear : '') +
                    '</span>' +
                '</div>';
            }
        }
        html += '</div>';

        // Recent payments
        html += '<div style="margin-bottom:12px;">';
        html += '<div style="font-size:0.7rem;color:var(--accent);margin-bottom:6px;">Recent Payments</div>';
        if (payments.length === 0) {
            html += '<div style="color:var(--dim);text-align:center;padding:12px;font-size:0.6rem;">No payments recorded</div>';
        } else {
            var plimit = Math.min(payments.length, 5);
            for (var j = 0; j < plimit; j++) {
                var p = payments[j];
                html += '<div style="display:flex;justify-content:space-between;padding:4px 8px;border-bottom:1px solid var(--border-light);font-size:0.6rem;">' +
                    '<span>' + _escapeHtml(p.renterName || 'Unknown') + '</span>' +
                    '<span style="color:var(--success);">+' + p.amount + 'g</span>' +
                    '<span style="color:var(--dim);">' + p.year + '</span>' +
                '</div>';
            }
        }
        html += '</div>';

        // Actions
        html += '<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;border-top:1px solid var(--border);padding-top:12px;">';
        if (hasRenter) {
            html += '<button data-action="update-rent" style="font-size:0.6rem;padding:4px 12px;background:var(--accent-dim);border:1px solid var(--accent);border-radius:4px;cursor:pointer;">Update Rent</button>';
            html += '<button data-action="record-payment" style="font-size:0.6rem;padding:4px 12px;background:var(--bg3);border:1px solid var(--border);border-radius:4px;cursor:pointer;">Record Payment</button>';
            html += '<button data-action="end-rental" style="font-size:0.6rem;padding:4px 12px;background:#8a3020;border:none;color:white;border-radius:4px;cursor:pointer;">End Rental</button>';
        }
        html += '<button data-action="full-history" style="font-size:0.6rem;padding:4px 12px;background:var(--bg3);border:1px solid var(--border);border-radius:4px;cursor:pointer;">Full History</button>';
        html += '<button data-action="close" style="font-size:0.6rem;padding:4px 12px;background:var(--bg3);border:1px solid var(--border);border-radius:4px;cursor:pointer;">Close</button>';
        html += '</div>';

        html += '</div>';
        return html;
    }

    function _wireRentalDetailsActions(root, residenceId) {
        function _closeThen(fn) {
            _closeTopModal();
            setTimeout(fn, 0);
        }

        function _reopen() {
            setTimeout(function() {
                openResidenceRentalDetailsModal(residenceId);
            }, 0);
        }

        var updateBtn = root.querySelector('[data-action="update-rent"]');
        if (updateBtn) {
            updateBtn.onclick = function() {
                _closeThen(function() {
                    openUpdateRentModal(residenceId, _reopen);
                });
            };
        }

        var paymentBtn = root.querySelector('[data-action="record-payment"]');
        if (paymentBtn) {
            paymentBtn.onclick = function() {
                _closeThen(function() {
                    openRentPaymentModal(residenceId, _reopen);
                });
            };
        }

        var endBtn = root.querySelector('[data-action="end-rental"]');
        if (endBtn) {
            endBtn.onclick = function() {
                _closeThen(function() {
                    openEndRentalModal(residenceId, _reopen);
                });
            };
        }

        var historyBtn = root.querySelector('[data-action="full-history"]');
        if (historyBtn) {
            historyBtn.onclick = function() {
                _closeThen(function() {
                    openResidenceRentalHistoryModal(residenceId);
                });
            };
        }

        var closeBtn = root.querySelector('[data-action="close"]');
        if (closeBtn) {
            closeBtn.onclick = function() { _closeTopModal(); };
        }
    }

    // =========================================================================
    // 11. EXPORTS
    // =========================================================================

    window.openSetResidenceOwnerModal = openSetResidenceOwnerModal;
    window.openSetResidenceRenterModal = openSetResidenceRenterModal;
    window.openUpdateRentModal = openUpdateRentModal;
    window.openEndRentalModal = openEndRentalModal;
    window.openResidenceRentalHistoryModal = openResidenceRentalHistoryModal;
    window.openHouseholdRentalSummaryModal = openHouseholdRentalSummaryModal;
    window.openRentPaymentModal = openRentPaymentModal;
    window.openResidenceRentalDetailsModal = openResidenceRentalDetailsModal;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            openSetResidenceOwnerModal: openSetResidenceOwnerModal,
            openSetResidenceRenterModal: openSetResidenceRenterModal,
            openUpdateRentModal: openUpdateRentModal,
            openEndRentalModal: openEndRentalModal,
            openResidenceRentalHistoryModal: openResidenceRentalHistoryModal,
            openHouseholdRentalSummaryModal: openHouseholdRentalSummaryModal,
            openRentPaymentModal: openRentPaymentModal,
            openResidenceRentalDetailsModal: openResidenceRentalDetailsModal
        };
    }

})();
 *   - openSetResidenceOwnerModal(residenceId, onSuccess)
 *   - openSetResidenceRenterModal(residenceId, onSuccess)
 *   - openUpdateRentModal(residenceId, onSuccess)
 *   - openEndRentalModal(residenceId, onSuccess)
 *   - openResidenceRentalHistoryModal(residenceId)
 *   - openHouseholdRentalSummaryModal(householdId)
 *   - openRentPaymentModal(residenceId, onSuccess)
 *   - openResidenceRentalDetailsModal(residenceId)
 * 
 * OWNERSHIP
 * ---------
 *   Reads:  ResidenceSystem (getResidence, getResidenceOwner,
 *           getResidenceRenter, getResidencesByOwner,
 *           getResidencesByRenter, getTotalRentIncome,
 *           getTotalRentExpenses, getResidenceRentalHistory,
 *           getRentPayments)
 *           HouseholdQueries.getHousehold (for household name lookup)
 *   Writes: ResidenceSystem (setResidenceOwner, setResidenceRenter,
 *           updateResidenceRent, endResidenceRental, recordRentPayment)
 *   UI:     modals-core, selectors, icons
 * 
 * WHAT THIS FILE DOES NOT DO
 * --------------------------
 *   - No direct residence record mutation
 *   - No direct household record mutation
 *   - No emoji icons
 *   - No setTimeout(100)
 *   - No fabricated 1250
 *   - No silent failure swallowing
 *   - No _processingRentalModal guard
 *   - No financial calculations in the UI (income/expense comes from ResidenceSystem)
 *   - No stale-selection bugs (owner/renter type changes clear the selection)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY ACCESS
    // =========================================================================

    function _openModal(options) {
        if (typeof window.openModal === 'function') return window.openModal(options);
        if (typeof window._openModal === 'function') return window._openModal(options);
        throw new Error('modals-residence-rental: openModal is required');
    }

    function _closeTopModal() {
        if (typeof window.closeTopModal === 'function') return window.closeTopModal();
        if (typeof window._closeTopModal === 'function') return window._closeTopModal();
        throw new Error('modals-residence-rental: closeTopModal is required');
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
        if (typeof window._showToast === 'function') return window._showToast(message, type);
        if (typeof window.showToast === 'function') return window.showToast(message, type);
    }

    function _residence() {
        if (typeof window.ResidenceSystem === 'undefined') {
            throw new Error('modals-residence-rental: ResidenceSystem is required');
        }
        return window.ResidenceSystem;
    }

    function _householdQueries() {
        return typeof window.HouseholdQueries !== 'undefined'
            ? window.HouseholdQueries
            : null;
    }

    function _currentYear() {
        if (typeof window.getCurrentYearSafe === 'function') {
            return window.getCurrentYearSafe();
        }
        return null;
    }

    function _openHouseholdSelector(options) {
        if (typeof window.openHouseholdSelector === 'function') {
            return window.openHouseholdSelector(options);
        }
        _showToast('Household selector not available', 'error');
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

    function _parseFloatOrNull(value) {
        if (value === undefined || value === null) return null;
        var s = String(value).trim();
        if (s === '') return null;
        var n = Number(s);
        if (!isFinite(n)) return null;
        return n;
    }

    // =========================================================================
    // 2. HELPERS
    // =========================================================================

    function _lookupOwnerName(type, id) {
        if (type === 'household') {
            var hq = _householdQueries();
            if (hq) {
                var h = hq.getHousehold(id);
                if (h) return h.name;
            }
            return 'Unknown Household';
        }
        if (type === 'character') {
            if (typeof window.getCharacterById === 'function') {
                var c = window.getCharacterById(id);
                if (c) return (c.name || '') + (c.surname ? ' ' + c.surname : '');
            }
            return 'Unknown Character';
        }
        return 'Unknown';
    }

    // =========================================================================
    // 3. SET RESIDENCE OWNER MODAL
    // =========================================================================

    function openSetResidenceOwnerModal(residenceId, onSuccess) {
        var res = _residence();

        var residence = res.getResidence(residenceId);
        if (!residence) {
            _showToast('Residence not found', 'error');
            return null;
        }

        var currentOwner = res.getResidenceOwner(residenceId);
        var currentOwnerName = currentOwner && currentOwner.ownerId
            ? currentOwner.ownerName : 'None';
        var currentOwnerType = currentOwner && currentOwner.ownerType
            ? currentOwner.ownerType : 'household';

        var year = _currentYear();

        var content =
            '<div style="margin-bottom:16px;">' +
                '<div style="background:var(--bg2);padding:12px;border-radius:6px;margin-bottom:12px;">' +
                    '<div style="font-size:0.7rem;"><strong>' +
                        _escapeHtml(residence.name) + '</strong></div>' +
                    '<div style="font-size:0.6rem;color:var(--dim);">Current Owner: ' +
                        _escapeHtml(currentOwnerName) +
                        (currentOwnerType ? ' (' + _escapeHtml(currentOwnerType) + ')' : '') +
                    '</div>' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Owner Type</label>' +
                    '<select data-field="ownerType" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                        '<option value="household"' +
                            (currentOwnerType === 'household' ? ' selected' : '') +
                            '>Household</option>' +
                        '<option value="character"' +
                            (currentOwnerType === 'character' ? ' selected' : '') +
                            '>Character</option>' +
                    '</select>' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Owner</label>' +
                    '<div style="display:flex;gap:6px;">' +
                        '<input type="text" data-field="ownerDisplay" placeholder="Select owner..." readonly ' +
                            'style="flex:1;padding:8px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;cursor:pointer;">' +
                        '<input type="hidden" data-field="ownerId">' +
                        '<button data-action="select-owner" class="btn" style="font-size:0.6rem;padding:4px 10px;">Select</button>' +
                        '<button data-action="clear-owner" class="btn" style="font-size:0.6rem;padding:4px 8px;">Clear</button>' +
                    '</div>' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Owner Since</label>' +
                    '<input type="number" data-field="ownerSince" value="' +
                        (year !== null ? year : '') +
                        '" min="1" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;">' +
                '</div>' +

                '<div style="padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;color:var(--dim);">' +
                    'Setting an owner does not affect an existing rental agreement. ' +
                    'To end a rental, use the End Rental action.' +
                '</div>' +
            '</div>';

        var handle = _openModal({
            title: 'Set Owner: ' + residence.name,
            content: content,
            confirmText: 'Set Owner',
            cancelText: 'Cancel',
            onConfirm: function() {
                var root = _resolveModalRoot();
                if (!root) return false;

                var ownerId = (root.querySelector('[data-field="ownerId"]') || {}).value;
                if (!ownerId) {
                    _showToast('Please select an owner', 'error');
                    return false;
                }
                var ownerType = (root.querySelector('[data-field="ownerType"]') || {}).value;
                var ownerSince = _parseIntOrNull((root.querySelector('[data-field="ownerSince"]') || {}).value);
                if (ownerSince === null || ownerSince < 1) {
                    _showToast('Please enter a valid year', 'error');
                    return false;
                }

                var result = res.setResidenceOwner(residenceId, ownerType, ownerId, {
                    ownerSince: ownerSince
                });

                if (!result.success) {
                    _showToast(result.reason || 'Failed to set owner', 'error');
                    return false;
                }

                _showToast('Owner set successfully', 'success');
                if (typeof onSuccess === 'function') onSuccess(result.data);
                return true;
            }
        });

        setTimeout(_attachOnOpen(function(root) {
            _wireOwnerTypeChange(root);
        }), 0);

        return handle;
    }

    function _wireOwnerTypeChange(root) {
        var typeSelect = root.querySelector('[data-field="ownerType"]');
        var display = root.querySelector('[data-field="ownerDisplay"]');
        var hidden = root.querySelector('[data-field="ownerId"]');
        var selectBtn = root.querySelector('[data-action="select-owner"]');
        var clearBtn = root.querySelector('[data-action="clear-owner"]');

        // When the owner type changes, clear the selection.
        // This prevents the "household id + character type" mixed state bug.
        if (typeSelect) {
            typeSelect.onchange = function() {
                if (display) display.value = '';
                if (hidden) hidden.value = '';
            };
        }

        if (selectBtn) {
            selectBtn.onclick = function() {
                var ownerType = typeSelect ? typeSelect.value : 'household';
                if (ownerType === 'household') {
                    _openHouseholdSelector({
                        title: 'Select Owner Household',
                        onSelect: function(household) {
                            if (!household) return;
                            if (display) display.value = household.name;
                            if (hidden) hidden.value = household.id;
                        }
                    });
                } else {
                    _openCharacterSelector({
                        title: 'Select Owner Character',
                        onSelect: function(character) {
                            if (!character) return;
                            var name = (character.name || '') +
                                (character.surname ? ' ' + character.surname : '');
                            if (display) display.value = name;
                            if (hidden) hidden.value = character.id;
                        }
                    });
                }
            };
        }

        if (clearBtn) {
            clearBtn.onclick = function() {
                if (display) display.value = '';
                if (hidden) hidden.value = '';
            };
        }
    }

    // =========================================================================
    // 4. SET RESIDENCE RENTER MODAL
    // =========================================================================

    function openSetResidenceRenterModal(residenceId, onSuccess) {
        var res = _residence();

        var residence = res.getResidence(residenceId);
        if (!residence) {
            _showToast('Residence not found', 'error');
            return null;
        }

        if (!residence.ownerId) {
            _showToast('Residence must have an owner before it can be rented', 'error');
            return null;
        }

        var currentRenter = res.getResidenceRenter(residenceId);
        var currentRent = currentRenter ? currentRenter.rentAmount : 0;
        var currentRenterType = currentRenter && currentRenter.renterType
            ? currentRenter.renterType : 'household';

        var year = _currentYear();

        var content =
            '<div style="margin-bottom:16px;">' +
                '<div style="background:var(--bg2);padding:12px;border-radius:6px;margin-bottom:12px;">' +
                    '<div style="font-size:0.7rem;"><strong>' +
                        _escapeHtml(residence.name) + '</strong></div>' +
                    '<div style="font-size:0.6rem;color:var(--dim);">Owner: ' +
                        _escapeHtml(residence.ownerName || 'Unknown') + '</div>' +
                    '<div style="font-size:0.6rem;color:var(--dim);">Current Renter: ' +
                        _escapeHtml(currentRenter && currentRenter.renterId
                            ? currentRenter.renterName : 'None') + '</div>' +
                    '<div style="font-size:0.6rem;color:var(--dim);">Current Rent: ' +
                        currentRent + 'g/year</div>' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Renter Type</label>' +
                    '<select data-field="renterType" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                        '<option value="household"' +
                            (currentRenterType === 'household' ? ' selected' : '') +
                            '>Household</option>' +
                        '<option value="character"' +
                            (currentRenterType === 'character' ? ' selected' : '') +
                            '>Character</option>' +
                    '</select>' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Renter</label>' +
                    '<div style="display:flex;gap:6px;">' +
                        '<input type="text" data-field="renterDisplay" placeholder="Select renter..." readonly ' +
                            'style="flex:1;padding:8px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;cursor:pointer;">' +
                        '<input type="hidden" data-field="renterId">' +
                        '<button data-action="select-renter" class="btn" style="font-size:0.6rem;padding:4px 10px;">Select</button>' +
                        '<button data-action="clear-renter" class="btn" style="font-size:0.6rem;padding:4px 8px;">Clear</button>' +
                    '</div>' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Annual Rent (gold)</label>' +
                    '<input type="number" data-field="rentAmount" value="' +
                        (currentRent > 0 ? currentRent : 50) +
                        '" min="0" step="1" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;">' +
                    '<small style="font-size:0.55rem;color:var(--dim);">Rent is collected annually by the owner.</small>' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Rent Start Year</label>' +
                    '<input type="number" data-field="rentStartYear" value="' +
                        (year !== null ? year : '') +
                        '" min="1" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;">' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Notes (optional)</label>' +
                    '<textarea data-field="notes" rows="2" placeholder="e.g., Lease terms, conditions..." ' +
                        'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;"></textarea>' +
                '</div>' +
            '</div>';

        var handle = _openModal({
            title: 'Set Renter: ' + residence.name,
            content: content,
            confirmText: 'Set Renter',
            cancelText: 'Cancel',
            onConfirm: function() {
                var root = _resolveModalRoot();
                if (!root) return false;

                var renterId = (root.querySelector('[data-field="renterId"]') || {}).value;
                if (!renterId) {
                    _showToast('Please select a renter', 'error');
                    return false;
                }

                var renterType = (root.querySelector('[data-field="renterType"]') || {}).value;
                var rentAmount = _parseIntOrNull((root.querySelector('[data-field="rentAmount"]') || {}).value);
                if (rentAmount === null || rentAmount < 0) {
                    _showToast('Rent must be a non-negative integer', 'error');
                    return false;
                }

                var rentStartYear = _parseIntOrNull((root.querySelector('[data-field="rentStartYear"]') || {}).value);
                if (rentStartYear === null || rentStartYear < 1) {
                    _showToast('Please enter a valid year', 'error');
                    return false;
                }

                var notes = ((root.querySelector('[data-field="notes"]') || {}).value || '').trim();

                var result = res.setResidenceRenter(residenceId, renterType, renterId,
                    rentAmount, {
                        rentStartYear: rentStartYear,
                        notes: notes
                    });

                if (!result.success) {
                    _showToast(result.reason || 'Failed to set renter', 'error');
                    return false;
                }

                _showToast('Renter set (' + rentAmount + 'g/year)', 'success');
                if (typeof onSuccess === 'function') onSuccess(result.data);
                return true;
            }
        });

        setTimeout(_attachOnOpen(function(root) {
            _wireRenterTypeChange(root);
        }), 0);

        return handle;
    }

    function _wireRenterTypeChange(root) {
        var typeSelect = root.querySelector('[data-field="renterType"]');
        var display = root.querySelector('[data-field="renterDisplay"]');
        var hidden = root.querySelector('[data-field="renterId"]');
        var selectBtn = root.querySelector('[data-action="select-renter"]');
        var clearBtn = root.querySelector('[data-action="clear-renter"]');

        // Same stale-selection prevention as owner
        if (typeSelect) {
            typeSelect.onchange = function() {
                if (display) display.value = '';
                if (hidden) hidden.value = '';
            };
        }

        if (selectBtn) {
            selectBtn.onclick = function() {
                var renterType = typeSelect ? typeSelect.value : 'household';
                if (renterType === 'household') {
                    _openHouseholdSelector({
                        title: 'Select Renter Household',
                        onSelect: function(household) {
                            if (!household) return;
                            if (display) display.value = household.name;
                            if (hidden) hidden.value = household.id;
                        }
                    });
                } else {
                    _openCharacterSelector({
                        title: 'Select Renter Character',
                        onSelect: function(character) {
                            if (!character) return;
                            var name = (character.name || '') +
                                (character.surname ? ' ' + character.surname : '');
                            if (display) display.value = name;
                            if (hidden) hidden.value = character.id;
                        }
                    });
                }
            };
        }

        if (clearBtn) {
            clearBtn.onclick = function() {
                if (display) display.value = '';
                if (hidden) hidden.value = '';
            };
        }
    }

    // =========================================================================
    // 5. UPDATE RENT MODAL
    // =========================================================================

    function openUpdateRentModal(residenceId, onSuccess) {
        var res = _residence();

        var residence = res.getResidence(residenceId);
        if (!residence) {
            _showToast('Residence not found', 'error');
            return null;
        }

        var renter = res.getResidenceRenter(residenceId);
        if (!renter || !renter.renterId) {
            _showToast('Residence has no renter', 'error');
            return null;
        }

        var currentRent = renter.rentAmount;
        var year = _currentYear();

        var content =
            '<div style="margin-bottom:16px;">' +
                '<div style="background:var(--bg2);padding:12px;border-radius:6px;margin-bottom:12px;">' +
                    '<div style="font-size:0.7rem;"><strong>' +
                        _escapeHtml(residence.name) + '</strong></div>' +
                    '<div style="font-size:0.6rem;color:var(--dim);">Renter: ' +
                        _escapeHtml(renter.renterName) + '</div>' +
                    '<div style="font-size:0.6rem;color:var(--dim);">Current Rent: ' +
                        currentRent + 'g/year</div>' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">New Annual Rent (gold)</label>' +
                    '<input type="number" data-field="newRent" value="' + currentRent +
                        '" min="0" step="1" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;">' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Effective Year</label>' +
                    '<input type="number" data-field="effectiveYear" value="' +
                        (year !== null ? year : '') +
                        '" min="1" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;">' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Reason (optional)</label>' +
                    '<input type="text" data-field="reason" placeholder="e.g., Market adjustment..." ' +
                        'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;">' +
                '</div>' +

                '<div style="padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;color:var(--warn);">' +
                    'Rent change will be recorded in the rental history and will affect annual income/expenses starting from the effective year.' +
                '</div>' +
            '</div>';

        return _openModal({
            title: 'Update Rent: ' + residence.name,
            content: content,
            confirmText: 'Update Rent',
            cancelText: 'Cancel',
            onConfirm: function() {
                var root = _resolveModalRoot();
                if (!root) return false;

                var newRent = _parseIntOrNull((root.querySelector('[data-field="newRent"]') || {}).value);
                if (newRent === null || newRent < 0) {
                    _showToast('Rent must be a non-negative integer', 'error');
                    return false;
                }

                if (newRent === currentRent) {
                    _showToast('Rent amount is unchanged', 'info');
                    if (typeof onSuccess === 'function') onSuccess();
                    return true;
                }

                var effectiveYear = _parseIntOrNull((root.querySelector('[data-field="effectiveYear"]') || {}).value);
                if (effectiveYear === null || effectiveYear < 1) {
                    _showToast('Please enter a valid year', 'error');
                    return false;
                }

                var reason = ((root.querySelector('[data-field="reason"]') || {}).value || '').trim();

                var result = res.updateResidenceRent(residenceId, newRent,
                    effectiveYear, reason || 'Rent adjustment');

                if (!result.success) {
                    _showToast(result.reason || 'Failed to update rent', 'error');
                    return false;
                }

                _showToast('Rent updated from ' + currentRent + ' to ' + newRent +
                    'g/year', 'success');
                if (typeof onSuccess === 'function') onSuccess(result.data);
                return true;
            }
        });
    }

    // =========================================================================
    // 6. END RENTAL MODAL
    // =========================================================================

    function openEndRentalModal(residenceId, onSuccess) {
        var res = _residence();

        var residence = res.getResidence(residenceId);
        if (!residence) {
            _showToast('Residence not found', 'error');
            return null;
        }

        var renter = res.getResidenceRenter(residenceId);
        if (!renter || !renter.renterId) {
            _showToast('Residence has no active rental', 'warning');
            if (typeof onSuccess === 'function') onSuccess();
            return null;
        }

        var year = _currentYear();

        var content =
            '<div style="margin-bottom:16px;">' +
                '<div style="background:rgba(200,68,68,0.1);border:1px solid var(--warn);border-radius:8px;padding:12px;margin-bottom:16px;">' +
                    '<div style="font-size:0.7rem;"><strong>End Rental: ' +
                        _escapeHtml(residence.name) + '</strong></div>' +
                    '<div style="font-size:0.55rem;color:var(--dim);margin-top:4px;">' +
                        'Current Renter: ' + _escapeHtml(renter.renterName) + '</div>' +
                    '<div style="font-size:0.55rem;color:var(--dim);">' +
                        'Annual Rent: ' + renter.rentAmount + 'g</div>' +
                    '<div style="font-size:0.55rem;color:var(--dim);">' +
                        'Rented since: ' +
                        (renter.rentStartYear !== null ? renter.rentStartYear : 'Unknown') +
                    '</div>' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">End Year</label>' +
                    '<input type="number" data-field="endYear" value="' +
                        (year !== null ? year : '') +
                        '" min="1" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;">' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Reason</label>' +
                    '<select data-field="reason" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                        '<option value="tenant_moved_out">Tenant moved out</option>' +
                        '<option value="tenant_evicted">Tenant evicted</option>' +
                        '<option value="lease_expired">Lease expired</option>' +
                        '<option value="owner_occupying">Owner taking possession</option>' +
                        '<option value="property_sold">Property sold</option>' +
                        '<option value="mutual_agreement">Mutual agreement</option>' +
                        '<option value="custom">Custom reason</option>' +
                    '</select>' +
                '</div>' +

                '<div data-role="custom-reason-group" style="display:none;margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Custom Reason</label>' +
                    '<input type="text" data-field="customReason" placeholder="Enter custom reason..." ' +
                        'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;">' +
                '</div>' +

                '<div style="padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;color:var(--warn);">' +
                    'Ending the rental will mark the residence as vacant and remove the renter association.' +
                '</div>' +
            '</div>';

        var handle = _openModal({
            title: 'End Rental: ' + residence.name,
            content: content,
            confirmText: 'End Rental',
            cancelText: 'Cancel',
            confirmStyle: 'danger',
            onConfirm: function() {
                var root = _resolveModalRoot();
                if (!root) return false;

                var endYear = _parseIntOrNull((root.querySelector('[data-field="endYear"]') || {}).value);
                if (endYear === null || endYear < 1) {
                    _showToast('Please enter a valid year', 'error');
                    return false;
                }

                var reasonValue = (root.querySelector('[data-field="reason"]') || {}).value;
                var customReason = ((root.querySelector('[data-field="customReason"]') || {}).value || '').trim();

                var reason;
                if (reasonValue === 'custom') {
                    if (!customReason) {
                        _showToast('Please enter a custom reason', 'error');
                        return false;
                    }
                    reason = customReason;
                } else {
                    reason = reasonValue;
                }

                var result = res.endResidenceRental(residenceId, endYear, reason);
                if (!result.success) {
                    _showToast(result.reason || 'Failed to end rental', 'error');
                    return false;
                }

                _showToast('Rental ended for ' + renter.renterName, 'success');
                if (typeof onSuccess === 'function') onSuccess(result.data);
                return true;
            }
        });

        setTimeout(_attachOnOpen(function(root) {
            var reasonSelect = root.querySelector('[data-field="reason"]');
            var customGroup = root.querySelector('[data-role="custom-reason-group"]');
            if (reasonSelect && customGroup) {
                reasonSelect.onchange = function() {
                    customGroup.style.display =
                        reasonSelect.value === 'custom' ? 'block' : 'none';
                };
            }
        }), 0);

        return handle;
    }

    // =========================================================================
    // 7. RESIDENCE RENTAL HISTORY MODAL
    // =========================================================================

    function openResidenceRentalHistoryModal(residenceId) {
        var res = _residence();

        var residence = res.getResidence(residenceId);
        if (!residence) {
            _showToast('Residence not found', 'error');
            return null;
        }

        var rentalHistory = res.getResidenceRentalHistory(residenceId, 50);
        var payments = res.getRentPayments(residenceId, 50);
        var renter = res.getResidenceRenter(residenceId);

        var content = _buildRentalHistoryContent(residence, rentalHistory, payments, renter);

        return _openModal({
            title: 'Rental History: ' + residence.name,
            content: content,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function() { /* close only */ }
        });
    }

    function _buildRentalHistoryContent(residence, rentalHistory, payments, renter) {
        var html = '<div style="margin-bottom:16px;">';

        html += '<div style="padding:12px;background:var(--bg2);border-radius:8px;margin-bottom:12px;">';
        html += '<div style="font-size:0.8rem;font-weight:bold;">' +
            _escapeHtml(residence.name) + '</div>';
        html += '<div style="font-size:0.65rem;color:var(--dim);">Current Renter: ' +
            _escapeHtml(renter && renter.renterId ? renter.renterName : 'None') + '</div>';
        html += '<div style="font-size:0.65rem;color:var(--dim);">Current Rent: ' +
            (renter ? renter.rentAmount : 0) + 'g/year</div>';
        html += '<div style="font-size:0.65rem;color:var(--dim);">Total Rental Events: ' +
            rentalHistory.length + ' · Payments: ' + payments.length + '</div>';
        html += '</div>';

        // Rental history
        html += '<div style="margin-bottom:16px;">';
        html += '<div style="font-size:0.7rem;color:var(--accent);margin-bottom:8px;">Rental History</div>';

        if (rentalHistory.length === 0) {
            html += '<div style="color:var(--dim);text-align:center;padding:20px;font-size:0.6rem;">No rental history</div>';
        } else {
            var actionMap = {
                'rent_started': 'Started',
                'rent_adjusted': 'Adjusted',
                'rent_ended': 'Ended'
            };
            html += '<div style="max-height:200px;overflow-y:auto;">';
            for (var i = 0; i < rentalHistory.length; i++) {
                var h = rentalHistory[i];
                var isCurrent = !h.endYear;
                var label = actionMap[h.action] || h.action || 'Event';
                var amountText = '';
                if (h.oldRentAmount !== undefined && h.newRentAmount !== undefined) {
                    amountText = ' ' + h.oldRentAmount + ' → ' + h.newRentAmount + 'g';
                } else if (h.rentAmount !== undefined) {
                    amountText = ' ' + h.rentAmount + 'g';
                }

                html += '<div style="display:flex;justify-content:space-between;padding:6px 8px;border-bottom:1px solid var(--border-light);' +
                    (isCurrent ? 'background:rgba(74,158,106,0.08);' : '') + '">' +
                    '<div style="font-size:0.65rem;">' +
                        (h.renterName ? '<strong>' + _escapeHtml(h.renterName) + '</strong>' : '') +
                        '<span style="color:var(--dim);">' + _escapeHtml(amountText) + '</span>' +
                        (h.reason ? ' <span style="font-size:0.5rem;color:var(--dim);">(' +
                            _escapeHtml(h.reason) + ')</span>' : '') +
                    '</div>' +
                    '<div style="font-size:0.55rem;color:var(--dim);">' +
                        label + ' ' + h.year +
                        (h.endYear ? ' - ' + h.endYear : '') +
                        (isCurrent ? ' <span style="color:var(--success);">Current</span>' : '') +
                    '</div>' +
                '</div>';
            }
            html += '</div>';
        }
        html += '</div>';

        // Payments
        html += '<div style="margin-bottom:16px;">';
        html += '<div style="font-size:0.7rem;color:var(--accent);margin-bottom:8px;">Payment History</div>';

        if (payments.length === 0) {
            html += '<div style="color:var(--dim);text-align:center;padding:20px;font-size:0.6rem;">No payments recorded</div>';
        } else {
            html += '<div style="max-height:150px;overflow-y:auto;">';
            for (var j = 0; j < payments.length; j++) {
                var p = payments[j];
                html += '<div style="display:flex;justify-content:space-between;padding:4px 8px;border-bottom:1px solid var(--border-light);">' +
                    '<span style="font-size:0.65rem;">' +
                        _escapeHtml(p.renterName || 'Unknown') + '</span>' +
                    '<span style="font-size:0.6rem;color:var(--success);">+' +
                        p.amount + 'g</span>' +
                    '<span style="font-size:0.55rem;color:var(--dim);">' +
                        p.year + '</span>' +
                '</div>';
            }
            html += '</div>';
        }
        html += '</div>';

        html += '</div>';
        return html;
    }

    // =========================================================================
    // 8. HOUSEHOLD RENTAL SUMMARY MODAL
    // =========================================================================

    function openHouseholdRentalSummaryModal(householdId) {
        var res = _residence();
        var hq = _householdQueries();

        var household = hq ? hq.getHousehold(householdId) : null;
        if (!household) {
            _showToast('Household not found', 'error');
            return null;
        }

        var ownedProperties = res.getResidencesByOwner(householdId, 'household');
        var rentedProperties = res.getResidencesByRenter(householdId, 'household');
        var totalRentIncome = res.getTotalRentIncome(householdId, 'household');
        var totalRentExpenses = res.getTotalRentExpenses(householdId, 'household');
        var netRent = totalRentIncome - totalRentExpenses;

        var content = _buildHouseholdRentalSummaryContent(
            household,
            ownedProperties,
            rentedProperties,
            totalRentIncome,
            totalRentExpenses,
            netRent
        );

        return _openModal({
            title: 'Rental Summary: ' + household.name,
            content: content,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function() { /* close only */ }
        });
    }

    function _buildHouseholdRentalSummaryContent(household, owned, rented,
                                                  income, expenses, net) {
        var netColor = net >= 0 ? 'var(--success)' : 'var(--danger)';

        var html = '<div style="margin-bottom:16px;">';

        html += '<div style="padding:12px;background:var(--bg2);border-radius:8px;margin-bottom:12px;">';
        html += '<div style="font-size:0.8rem;font-weight:bold;">' +
            _escapeHtml(household.name) + '</div>';
        html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:8px;">';
        html += '<div><span style="color:var(--dim);font-size:0.6rem;">Properties Owned</span><br>' +
            '<span style="font-size:1rem;font-weight:bold;">' + owned.length + '</span></div>';
        html += '<div><span style="color:var(--dim);font-size:0.6rem;">Properties Rented</span><br>' +
            '<span style="font-size:1rem;font-weight:bold;">' + rented.length + '</span></div>';
        html += '<div><span style="color:var(--dim);font-size:0.6rem;">Net Rent</span><br>' +
            '<span style="font-size:1rem;font-weight:bold;color:' + netColor + ';">' +
            (net >= 0 ? '+' : '') + net + 'g</span></div>';
        html += '</div>';
        html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:4px;">';
        html += '<div><span style="color:var(--dim);font-size:0.55rem;">Rent Income</span><br>' +
            '<span style="color:var(--success);">+' + income + 'g</span></div>';
        html += '<div><span style="color:var(--dim);font-size:0.55rem;">Rent Expenses</span><br>' +
            '<span style="color:var(--danger);">-' + expenses + 'g</span></div>';
        html += '</div>';
        html += '</div>';

        // Owned properties
        html += '<div style="margin-bottom:12px;">';
        html += '<div style="font-size:0.7rem;color:var(--accent);margin-bottom:6px;">Properties Owned (' +
            owned.length + ')</div>';
        if (owned.length === 0) {
            html += '<div style="color:var(--dim);text-align:center;padding:12px;font-size:0.6rem;">No properties owned</div>';
        } else {
            html += '<div style="max-height:150px;overflow-y:auto;">';
            for (var i = 0; i < owned.length; i++) {
                var o = owned[i];
                var renterName = o.renterName || 'Vacant';
                var rent = o.rentAmount || 0;
                var statusColor = o.renterId ? 'var(--success)' : 'var(--warn)';
                var statusText = o.renterId ? 'Rented' : 'Vacant';

                html += '<div style="display:flex;justify-content:space-between;padding:4px 8px;border-bottom:1px solid var(--border-light);border-left:3px solid ' +
                    statusColor + ';">' +
                    '<div style="font-size:0.65rem;">' + _escapeHtml(o.name) + '</div>' +
                    '<div style="font-size:0.55rem;color:var(--dim);">' +
                        statusText + ' · ' + rent + 'g/year' +
                        (o.renterId ? ' · ' + _escapeHtml(renterName) : '') +
                    '</div>' +
                '</div>';
            }
            html += '</div>';
        }
        html += '</div>';

        // Rented properties
        html += '<div style="margin-bottom:12px;">';
        html += '<div style="font-size:0.7rem;color:var(--accent);margin-bottom:6px;">Properties Rented (' +
            rented.length + ')</div>';
        if (rented.length === 0) {
            html += '<div style="color:var(--dim);text-align:center;padding:12px;font-size:0.6rem;">No properties rented</div>';
        } else {
            html += '<div style="max-height:150px;overflow-y:auto;">';
            for (var j = 0; j < rented.length; j++) {
                var r = rented[j];
                html += '<div style="display:flex;justify-content:space-between;padding:4px 8px;border-bottom:1px solid var(--border-light);border-left:3px solid var(--warn);">' +
                    '<div style="font-size:0.65rem;">' + _escapeHtml(r.name) + '</div>' +
                    '<div style="font-size:0.55rem;color:var(--dim);">' +
                        r.rentAmount + 'g/year · Owner: ' +
                        _escapeHtml(r.ownerName || 'Unknown') +
                    '</div>' +
                '</div>';
            }
            html += '</div>';
        }
        html += '</div>';

        html += '</div>';
        return html;
    }

    // =========================================================================
    // 9. RECORD RENT PAYMENT MODAL
    // =========================================================================

    function openRentPaymentModal(residenceId, onSuccess) {
        var res = _residence();

        var residence = res.getResidence(residenceId);
        if (!residence) {
            _showToast('Residence not found', 'error');
            return null;
        }

        var renter = res.getResidenceRenter(residenceId);
        if (!renter || !renter.renterId) {
            _showToast('Residence has no renter', 'error');
            return null;
        }

        var year = _currentYear();

        var content =
            '<div style="margin-bottom:16px;">' +
                '<div style="background:var(--bg2);padding:12px;border-radius:6px;margin-bottom:12px;">' +
                    '<div style="font-size:0.7rem;"><strong>' +
                        _escapeHtml(residence.name) + '</strong></div>' +
                    '<div style="font-size:0.6rem;color:var(--dim);">Renter: ' +
                        _escapeHtml(renter.renterName) + '</div>' +
                    '<div style="font-size:0.6rem;color:var(--dim);">Annual Rent: ' +
                        renter.rentAmount + 'g</div>' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Payment Year</label>' +
                    '<input type="number" data-field="year" value="' +
                        (year !== null ? year : '') +
                        '" min="1" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;">' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Amount (blank = full rent)</label>' +
                    '<input type="number" data-field="amount" placeholder="' +
                        renter.rentAmount + '" min="0" step="1" ' +
                        'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;">' +
                    '<small style="font-size:0.55rem;color:var(--dim);">Leave blank to record the full annual rent.</small>' +
                '</div>' +
            '</div>';

        return _openModal({
            title: 'Record Rent Payment: ' + residence.name,
            content: content,
            confirmText: 'Record Payment',
            cancelText: 'Cancel',
            onConfirm: function() {
                var root = _resolveModalRoot();
                if (!root) return false;

                var pYear = _parseIntOrNull((root.querySelector('[data-field="year"]') || {}).value);
                if (pYear === null || pYear < 1) {
                    _showToast('Please enter a valid year', 'error');
                    return false;
                }

                var amountRaw = (root.querySelector('[data-field="amount"]') || {}).value;
                var amount;
                if (amountRaw === '' || amountRaw === undefined) {
                    amount = renter.rentAmount;
                } else {
                    amount = _parseIntOrNull(amountRaw);
                }
                if (amount === null || amount <= 0) {
                    _showToast('Payment amount must be a positive integer', 'error');
                    return false;
                }

                var result = res.recordRentPayment(residenceId, renter.renterId,
                    amount, pYear);

                if (!result.success) {
                    _showToast(result.reason || 'Failed to record payment', 'error');
                    return false;
                }

                _showToast('Rent payment of ' + amount + 'g recorded for ' + pYear,
                    'success');
                if (typeof onSuccess === 'function') onSuccess(result.data);
                return true;
            }
        });
    }

    // =========================================================================
    // 10. RESIDENCE RENTAL DETAILS MODAL
    // =========================================================================

    function openResidenceRentalDetailsModal(residenceId) {
        var res = _residence();

        var residence = res.getResidence(residenceId);
        if (!residence) {
            _showToast('Residence not found', 'error');
            return null;
        }

        var owner = res.getResidenceOwner(residenceId);
        var renter = res.getResidenceRenter(residenceId);
        var rentalHistory = res.getResidenceRentalHistory(residenceId, 10);
        var payments = res.getRentPayments(residenceId, 10);

        var content = _buildRentalDetailsContent(residence, owner, renter,
            rentalHistory, payments);

        var handle = _openModal({
            title: 'Rental Details: ' + residence.name,
            content: content,
            confirmText: '',
            cancelText: '',
            onConfirm: function() { /* close only */ }
        });

        setTimeout(_attachOnOpen(function(root) {
            _wireRentalDetailsActions(root, residenceId);
        }), 0);

        return handle;
    }

    function _buildRentalDetailsContent(residence, owner, renter,
                                        rentalHistory, payments) {
        var hasOwner = owner && owner.ownerId;
        var hasRenter = renter && renter.renterId;
        var rentAmount = renter ? renter.rentAmount : 0;
        var rentalStatus = renter ? renter.rentalStatus : 'vacant';

        var statusColor = rentalStatus === 'rented'
            ? 'var(--success)'
            : (rentalStatus === 'owner_occupied' ? 'var(--accent)' : 'var(--warn)');

        var html = '<div style="margin-bottom:16px;">';

        // Header
        html += '<div style="padding:12px;background:var(--bg2);border-radius:8px;margin-bottom:12px;">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;">';
        html += '<div style="font-size:0.9rem;font-weight:bold;">' +
            _escapeHtml(residence.name) + '</div>';
        html += '<span style="font-size:0.6rem;padding:2px 10px;border-radius:12px;background:' +
            statusColor + ';color:white;">' + _escapeHtml(rentalStatus) + '</span>';
        html += '</div>';
        html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;font-size:0.65rem;">';
        html += '<div><span style="color:var(--dim);">Owner:</span> ' +
            _escapeHtml(owner && owner.ownerId ? owner.ownerName : 'None') + '</div>';
        html += '<div><span style="color:var(--dim);">Renter:</span> ' +
            _escapeHtml(renter && renter.renterId ? renter.renterName : 'None') + '</div>';
        html += '<div><span style="color:var(--dim);">Rent:</span> ' +
            rentAmount + 'g/year</div>';
        html += '<div><span style="color:var(--dim);">Since:</span> ' +
            (renter && renter.rentStartYear ? renter.rentStartYear : 'N/A') + '</div>';
        html += '</div>';
        html += '</div>';

        // Recent history
        html += '<div style="margin-bottom:12px;">';
        html += '<div style="font-size:0.7rem;color:var(--accent);margin-bottom:6px;">Recent Rental History</div>';
        if (rentalHistory.length === 0) {
            html += '<div style="color:var(--dim);text-align:center;padding:12px;font-size:0.6rem;">No rental history</div>';
        } else {
            var limit = Math.min(rentalHistory.length, 5);
            for (var i = 0; i < limit; i++) {
                var h = rentalHistory[i];
                html += '<div style="display:flex;justify-content:space-between;padding:4px 8px;border-bottom:1px solid var(--border-light);font-size:0.6rem;">' +
                    '<span>' + _escapeHtml(h.action || 'event') +
                        (h.renterName ? ' - ' + _escapeHtml(h.renterName) : '') + '</span>' +
                    '<span style="color:var(--dim);">' +
                        h.year + (h.endYear ? ' - ' + h.endYear : '') +
                    '</span>' +
                '</div>';
            }
        }
        html += '</div>';

        // Recent payments
        html += '<div style="margin-bottom:12px;">';
        html += '<div style="font-size:0.7rem;color:var(--accent);margin-bottom:6px;">Recent Payments</div>';
        if (payments.length === 0) {
            html += '<div style="color:var(--dim);text-align:center;padding:12px;font-size:0.6rem;">No payments recorded</div>';
        } else {
            var plimit = Math.min(payments.length, 5);
            for (var j = 0; j < plimit; j++) {
                var p = payments[j];
                html += '<div style="display:flex;justify-content:space-between;padding:4px 8px;border-bottom:1px solid var(--border-light);font-size:0.6rem;">' +
                    '<span>' + _escapeHtml(p.renterName || 'Unknown') + '</span>' +
                    '<span style="color:var(--success);">+' + p.amount + 'g</span>' +
                    '<span style="color:var(--dim);">' + p.year + '</span>' +
                '</div>';
            }
        }
        html += '</div>';

        // Actions
        html += '<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;border-top:1px solid var(--border);padding-top:12px;">';
        if (hasRenter) {
            html += '<button data-action="update-rent" style="font-size:0.6rem;padding:4px 12px;background:var(--accent-dim);border:1px solid var(--accent);border-radius:4px;cursor:pointer;">Update Rent</button>';
            html += '<button data-action="record-payment" style="font-size:0.6rem;padding:4px 12px;background:var(--bg3);border:1px solid var(--border);border-radius:4px;cursor:pointer;">Record Payment</button>';
            html += '<button data-action="end-rental" style="font-size:0.6rem;padding:4px 12px;background:#8a3020;border:none;color:white;border-radius:4px;cursor:pointer;">End Rental</button>';
        }
        html += '<button data-action="full-history" style="font-size:0.6rem;padding:4px 12px;background:var(--bg3);border:1px solid var(--border);border-radius:4px;cursor:pointer;">Full History</button>';
        html += '<button data-action="close" style="font-size:0.6rem;padding:4px 12px;background:var(--bg3);border:1px solid var(--border);border-radius:4px;cursor:pointer;">Close</button>';
        html += '</div>';

        html += '</div>';
        return html;
    }

    function _wireRentalDetailsActions(root, residenceId) {
        function _closeThen(fn) {
            _closeTopModal();
            setTimeout(fn, 0);
        }

        function _reopen() {
            setTimeout(function() {
                openResidenceRentalDetailsModal(residenceId);
            }, 0);
        }

        var updateBtn = root.querySelector('[data-action="update-rent"]');
        if (updateBtn) {
            updateBtn.onclick = function() {
                _closeThen(function() {
                    openUpdateRentModal(residenceId, _reopen);
                });
            };
        }

        var paymentBtn = root.querySelector('[data-action="record-payment"]');
        if (paymentBtn) {
            paymentBtn.onclick = function() {
                _closeThen(function() {
                    openRentPaymentModal(residenceId, _reopen);
                });
            };
        }

        var endBtn = root.querySelector('[data-action="end-rental"]');
        if (endBtn) {
            endBtn.onclick = function() {
                _closeThen(function() {
                    openEndRentalModal(residenceId, _reopen);
                });
            };
        }

        var historyBtn = root.querySelector('[data-action="full-history"]');
        if (historyBtn) {
            historyBtn.onclick = function() {
                _closeThen(function() {
                    openResidenceRentalHistoryModal(residenceId);
                });
            };
        }

        var closeBtn = root.querySelector('[data-action="close"]');
        if (closeBtn) {
            closeBtn.onclick = function() { _closeTopModal(); };
        }
    }

    // =========================================================================
    // 11. EXPORTS
    // =========================================================================

    window.openSetResidenceOwnerModal = openSetResidenceOwnerModal;
    window.openSetResidenceRenterModal = openSetResidenceRenterModal;
    window.openUpdateRentModal = openUpdateRentModal;
    window.openEndRentalModal = openEndRentalModal;
    window.openResidenceRentalHistoryModal = openResidenceRentalHistoryModal;
    window.openHouseholdRentalSummaryModal = openHouseholdRentalSummaryModal;
    window.openRentPaymentModal = openRentPaymentModal;
    window.openResidenceRentalDetailsModal = openResidenceRentalDetailsModal;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            openSetResidenceOwnerModal: openSetResidenceOwnerModal,
            openSetResidenceRenterModal: openSetResidenceRenterModal,
            openUpdateRentModal: openUpdateRentModal,
            openEndRentalModal: openEndRentalModal,
            openResidenceRentalHistoryModal: openResidenceRentalHistoryModal,
            openHouseholdRentalSummaryModal: openHouseholdRentalSummaryModal,
            openRentPaymentModal: openRentPaymentModal,
            openResidenceRentalDetailsModal: openResidenceRentalDetailsModal
        };
    }

})();
