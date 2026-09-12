/**
 * =============================================================================
 * RESIDENCE RENTAL MODALS (modals-residence-rental.js)
 * =============================================================================
 * 
 * PURPOSE: UI modals for residence rental management.
 * 
 * DEPENDS ON:
 *   - modals-core.js (openModal, closeTopModal, _escapeHtml, _showToast, _getIcon)
 *   - modals-household-selector.js (openHouseholdSelector)
 *   - modals-char-select.js (openCharacterSelector)
 *   - residence-system.js (ResidenceSystem)
 *   - household-state.js (HouseholdState)
 * 
 * EXPORTS:
 *   - openSetResidenceOwnerModal() - Set owner of a residence
 *   - openSetResidenceRenterModal() - Set renter with rent amount
 *   - openUpdateRentModal() - Update rent amount
 *   - openEndRentalModal() - End rental agreement
 *   - openResidenceRentalHistoryModal() - View rental history
 *   - openHouseholdRentalSummaryModal() - View household rental summary
 *   - openRentPaymentModal() - Record rent payment
 *   - openResidenceRentalDetailsModal() - View detailed rental info
 * 
 * ICON POLICY:
 *   - All icons from icons.js via _getIcon()
 *   - NO emojis
 *   - NO icons in confirm/cancel buttons
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. RECURSION GUARD
    // =========================================================================

    var _processingRentalModal = false;

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
    // Delegates to time.js — do not add fallback logic here.
    return typeof window.getCurrentYearSafe === 'function'
        ? window.getCurrentYearSafe()
        : 1250;
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

    function _openHouseholdSelector(options) {
        if (typeof window.openHouseholdSelector === 'function') {
            return window.openHouseholdSelector(options);
        }
        if (typeof window._openHouseholdSelector === 'function') {
            return window._openHouseholdSelector(options);
        }
        _showToast('Household selector not available', 'error');
        return null;
    }

    function _openCharacterSelector(options) {
        if (typeof window.openCharacterSelector === 'function') {
            return window.openCharacterSelector(options);
        }
        if (typeof window.openUnifiedCharacterSelector === 'function') {
            return window.openUnifiedCharacterSelector(options);
        }
        if (typeof window._openCharacterSelector === 'function') {
            return window._openCharacterSelector(options);
        }
        _showToast('Character selector not available', 'error');
        return null;
    }

    function _getResidenceById(residenceId) {
        if (typeof window.ResidenceSystem !== 'undefined' && 
            typeof window.ResidenceSystem.getResidenceById === 'function') {
            return window.ResidenceSystem.getResidenceById(residenceId);
        }
        return null;
    }

    function _getHousehold(householdId) {
        if (typeof window.HouseholdState !== 'undefined' && 
            typeof window.HouseholdState.getHousehold === 'function') {
            return window.HouseholdState.getHousehold(householdId);
        }
        return null;
    }

    function _getCharacterById(characterId) {
        if (typeof window.getCharacterById === 'function') {
            return window.getCharacterById(characterId);
        }
        return null;
    }

    function _getAllHouseholds() {
        if (typeof window.HouseholdState !== 'undefined' && 
            typeof window.HouseholdState.getAllHouseholds === 'function') {
            return window.HouseholdState.getAllHouseholds();
        }
        return [];
    }

    function _getResidenceSystem() {
        return window.ResidenceSystem;
    }

    // =========================================================================
    // 2. ICON HELPERS
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
    // 3. SET RESIDENCE OWNER MODAL
    // =========================================================================

    function openSetResidenceOwnerModal(residenceId, onSuccess) {
        if (_processingRentalModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingRentalModal = true;

        try {
            var residence = _getResidenceById(residenceId);
            if (!residence) {
                _showToast('Residence not found', 'error');
                _processingRentalModal = false;
                return;
            }

            var currentOwner = residence.ownerName || 'None';
            var currentOwnerType = residence.ownerType || 'none';

            var modalContent = 
                '<div style="margin-bottom: 16px;">' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 6px; margin-bottom: 12px;">' +
                '<div style="font-size: 0.7rem;"><strong>' + _escapeHtml(residence.name) + '</strong></div>' +
                '<div style="font-size: 0.6rem; color: var(--dim);">Current Owner: ' + _escapeHtml(currentOwner) + 
                (currentOwnerType !== 'none' ? ' (' + _escapeHtml(currentOwnerType) + ')' : '') +
                '</div>' +
                '</div>' +
                '<div style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Owner Type</label>' +
                '<select id="ownerTypeSelect" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;">' +
                '<option value="household">Household</option>' +
                '<option value="character">Character</option>' +
                '</select>' +
                '</div>' +
                '<div style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Owner</label>' +
                '<div style="display: flex; gap: 6px;">' +
                '<input type="text" id="ownerDisplay" placeholder="Select owner..." readonly style="flex: 1; padding: 8px; background: var(--bg2); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem; cursor: pointer;">' +
                '<input type="hidden" id="ownerId">' +
                '<button id="selectOwnerBtn" class="btn" style="font-size: 0.6rem; padding: 4px 10px;">Select</button>' +
                '<button id="clearOwnerBtn" class="btn" style="font-size: 0.6rem; padding: 4px 8px;">Clear</button>' +
                '</div>' +
                '</div>' +
                '<div style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Owner Since</label>' +
                '<input type="number" id="ownerSince" value="' + _getCurrentYear() + '" min="1" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Set Owner: ' + residence.name,
                content: modalContent,
                confirmText: 'Set Owner',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var ownerType = document.getElementById('ownerTypeSelect').value;
                    var ownerId = document.getElementById('ownerId').value;
                    var ownerSince = parseInt(document.getElementById('ownerSince').value) || _getCurrentYear();

                    if (!ownerId) {
                        _showToast('Please select an owner', 'error');
                        return false;
                    }

                    var residenceSystem = _getResidenceSystem();
                    if (!residenceSystem) {
                        _showToast('Residence system not available', 'error');
                        return false;
                    }

                    var result = residenceSystem.setResidenceOwner(residenceId, ownerType, ownerId, {
                        ownerSince: ownerSince
                    });

                    if (result) {
                        _showToast('Owner set successfully', 'success');
                        _closeTopModal();
                        _processingRentalModal = false;
                        if (onSuccess) onSuccess(result);
                        return true;
                    }
                    return false;
                },
                onCancel: function() {
                    _processingRentalModal = false;
                }
            });

            // Set up event handlers
            setTimeout(function() {
                var selectBtn = document.getElementById('selectOwnerBtn');
                if (selectBtn) {
                    selectBtn.onclick = function() {
                        var ownerType = document.getElementById('ownerTypeSelect').value;
                        if (ownerType === 'household') {
                            _openHouseholdSelector({
                                title: 'Select Owner Household',
                                onSelect: function(household) {
                                    if (household) {
                                        document.getElementById('ownerDisplay').value = household.name;
                                        document.getElementById('ownerId').value = household.id;
                                        _showToast('Selected: ' + household.name, 'success');
                                    }
                                },
                                onCancel: function() {
                                    _showToast('Selection cancelled', 'info');
                                }
                            });
                        } else {
                            _openCharacterSelector({
                                title: 'Select Owner Character',
                                onSelect: function(character) {
                                    if (character) {
                                        document.getElementById('ownerDisplay').value = character.name + (character.surname ? ' ' + character.surname : '');
                                        document.getElementById('ownerId').value = character.id;
                                        _showToast('Selected: ' + character.name, 'success');
                                    }
                                },
                                onCancel: function() {
                                    _showToast('Selection cancelled', 'info');
                                }
                            });
                        }
                    };
                }

                var clearBtn = document.getElementById('clearOwnerBtn');
                if (clearBtn) {
                    clearBtn.onclick = function() {
                        document.getElementById('ownerDisplay').value = '';
                        document.getElementById('ownerId').value = '';
                        _showToast('Owner cleared', 'info');
                    };
                }
            }, 100);

        } catch (e) {
            _processingRentalModal = false;
            _showToast('Error opening set owner modal', 'error');
        }
    }

    // =========================================================================
    // 4. SET RESIDENCE RENTER MODAL
    // =========================================================================

    function openSetResidenceRenterModal(residenceId, onSuccess) {
        if (_processingRentalModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingRentalModal = true;

        try {
            var residence = _getResidenceById(residenceId);
            if (!residence) {
                _showToast('Residence not found', 'error');
                _processingRentalModal = false;
                return;
            }

            if (!residence.ownerId) {
                _showToast('Residence must have an owner before it can be rented', 'error');
                _processingRentalModal = false;
                return;
            }

            var currentRenter = residence.renterName || 'None';
            var currentRent = residence.rentAmount || 0;

            var modalContent = 
                '<div style="margin-bottom: 16px;">' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 6px; margin-bottom: 12px;">' +
                '<div style="font-size: 0.7rem;"><strong>' + _escapeHtml(residence.name) + '</strong></div>' +
                '<div style="font-size: 0.6rem; color: var(--dim);">Owner: ' + _escapeHtml(residence.ownerName || 'Unknown') + '</div>' +
                '<div style="font-size: 0.6rem; color: var(--dim);">Current Renter: ' + _escapeHtml(currentRenter) + '</div>' +
                '<div style="font-size: 0.6rem; color: var(--dim);">Current Rent: ' + currentRent + 'g/year</div>' +
                '</div>' +
                '<div style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Renter Type</label>' +
                '<select id="renterTypeSelect" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;">' +
                '<option value="household">Household</option>' +
                '<option value="character">Character</option>' +
                '</select>' +
                '</div>' +
                '<div style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Renter</label>' +
                '<div style="display: flex; gap: 6px;">' +
                '<input type="text" id="renterDisplay" placeholder="Select renter..." readonly style="flex: 1; padding: 8px; background: var(--bg2); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem; cursor: pointer;">' +
                '<input type="hidden" id="renterId">' +
                '<button id="selectRenterBtn" class="btn" style="font-size: 0.6rem; padding: 4px 10px;">Select</button>' +
                '<button id="clearRenterBtn" class="btn" style="font-size: 0.6rem; padding: 4px 8px;">Clear</button>' +
                '</div>' +
                '</div>' +
                '<div style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Annual Rent Amount (gold)</label>' +
                '<input type="number" id="rentAmountInput" value="' + (currentRent || 50) + '" min="0" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '<small style="font-size: 0.55rem; color: var(--dim);">Rent is collected annually</small>' +
                '</div>' +
                '<div style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Rent Start Year</label>' +
                '<input type="number" id="rentStartYear" value="' + _getCurrentYear() + '" min="1" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '</div>' +
                '<div style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Notes (optional)</label>' +
                '<textarea id="rentNotes" rows="2" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;" placeholder="e.g., Lease terms, conditions..."></textarea>' +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Set Renter: ' + residence.name,
                content: modalContent,
                confirmText: 'Set Renter',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var renterType = document.getElementById('renterTypeSelect').value;
                    var renterId = document.getElementById('renterId').value;
                    var rentAmount = parseInt(document.getElementById('rentAmountInput').value) || 0;
                    var rentStartYear = parseInt(document.getElementById('rentStartYear').value) || _getCurrentYear();
                    var notes = document.getElementById('rentNotes').value;

                    if (!renterId) {
                        _showToast('Please select a renter', 'error');
                        return false;
                    }

                    if (rentAmount < 0) {
                        _showToast('Rent amount cannot be negative', 'error');
                        return false;
                    }

                    var residenceSystem = _getResidenceSystem();
                    if (!residenceSystem) {
                        _showToast('Residence system not available', 'error');
                        return false;
                    }

                    var result = residenceSystem.setResidenceRenter(residenceId, renterType, renterId, rentAmount, {
                        rentStartYear: rentStartYear,
                        notes: notes
                    });

                    if (result) {
                        _showToast('Renter set successfully (Rent: ' + rentAmount + 'g/year)', 'success');
                        _closeTopModal();
                        _processingRentalModal = false;
                        if (onSuccess) onSuccess(result);
                        return true;
                    }
                    return false;
                },
                onCancel: function() {
                    _processingRentalModal = false;
                }
            });

            // Set up event handlers
            setTimeout(function() {
                var selectBtn = document.getElementById('selectRenterBtn');
                if (selectBtn) {
                    selectBtn.onclick = function() {
                        var renterType = document.getElementById('renterTypeSelect').value;
                        if (renterType === 'household') {
                            _openHouseholdSelector({
                                title: 'Select Renter Household',
                                onSelect: function(household) {
                                    if (household) {
                                        document.getElementById('renterDisplay').value = household.name;
                                        document.getElementById('renterId').value = household.id;
                                        _showToast('Selected: ' + household.name, 'success');
                                    }
                                },
                                onCancel: function() {
                                    _showToast('Selection cancelled', 'info');
                                }
                            });
                        } else {
                            _openCharacterSelector({
                                title: 'Select Renter Character',
                                onSelect: function(character) {
                                    if (character) {
                                        document.getElementById('renterDisplay').value = character.name + (character.surname ? ' ' + character.surname : '');
                                        document.getElementById('renterId').value = character.id;
                                        _showToast('Selected: ' + character.name, 'success');
                                    }
                                },
                                onCancel: function() {
                                    _showToast('Selection cancelled', 'info');
                                }
                            });
                        }
                    };
                }

                var clearBtn = document.getElementById('clearRenterBtn');
                if (clearBtn) {
                    clearBtn.onclick = function() {
                        document.getElementById('renterDisplay').value = '';
                        document.getElementById('renterId').value = '';
                        _showToast('Renter cleared', 'info');
                    };
                }
            }, 100);

        } catch (e) {
            _processingRentalModal = false;
            _showToast('Error opening set renter modal', 'error');
        }
    }

    // =========================================================================
    // 5. UPDATE RENT MODAL
    // =========================================================================

    function openUpdateRentModal(residenceId, onSuccess) {
        if (_processingRentalModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingRentalModal = true;

        try {
            var residence = _getResidenceById(residenceId);
            if (!residence) {
                _showToast('Residence not found', 'error');
                _processingRentalModal = false;
                return;
            }

            if (!residence.renterId) {
                _showToast('Residence has no renter', 'error');
                _processingRentalModal = false;
                return;
            }

            var currentRent = residence.rentAmount || 0;

            var modalContent = 
                '<div style="margin-bottom: 16px;">' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 6px; margin-bottom: 12px;">' +
                '<div style="font-size: 0.7rem;"><strong>' + _escapeHtml(residence.name) + '</strong></div>' +
                '<div style="font-size: 0.6rem; color: var(--dim);">Current Renter: ' + _escapeHtml(residence.renterName || 'Unknown') + '</div>' +
                '<div style="font-size: 0.6rem; color: var(--dim);">Current Rent: ' + currentRent + 'g/year</div>' +
                '</div>' +
                '<div style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">New Annual Rent (gold)</label>' +
                '<input type="number" id="newRentAmount" value="' + currentRent + '" min="0" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '</div>' +
                '<div style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Effective Year</label>' +
                '<input type="number" id="rentEffectiveYear" value="' + _getCurrentYear() + '" min="1" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '</div>' +
                '<div style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Reason (optional)</label>' +
                '<input type="text" id="rentUpdateReason" placeholder="e.g., Market adjustment, Renegotiation..." style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '</div>' +
                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--warn);">' +
                'Rent change will be recorded in the rental history and will affect annual income/expenses starting from the effective year.' +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Update Rent: ' + residence.name,
                content: modalContent,
                confirmText: 'Update Rent',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var newRent = parseInt(document.getElementById('newRentAmount').value) || 0;
                    var effectiveYear = parseInt(document.getElementById('rentEffectiveYear').value) || _getCurrentYear();
                    var reason = document.getElementById('rentUpdateReason').value;

                    if (newRent < 0) {
                        _showToast('Rent amount cannot be negative', 'error');
                        return false;
                    }

                    if (newRent === currentRent) {
                        _showToast('Rent amount is the same', 'info');
                        _closeTopModal();
                        _processingRentalModal = false;
                        if (onSuccess) onSuccess();
                        return true;
                    }

                    var residenceSystem = _getResidenceSystem();
                    if (!residenceSystem) {
                        _showToast('Residence system not available', 'error');
                        return false;
                    }

                    var result = residenceSystem.updateResidenceRent(residenceId, newRent, effectiveYear, reason || 'Rent adjustment');

                    if (result) {
                        _showToast('Rent updated from ' + currentRent + ' to ' + newRent + 'g/year', 'success');
                        _closeTopModal();
                        _processingRentalModal = false;
                        if (onSuccess) onSuccess(result);
                        return true;
                    }
                    return false;
                },
                onCancel: function() {
                    _processingRentalModal = false;
                }
            });

        } catch (e) {
            _processingRentalModal = false;
            _showToast('Error opening update rent modal', 'error');
        }
    }

    // =========================================================================
    // 6. END RENTAL MODAL
    // =========================================================================

    function openEndRentalModal(residenceId, onSuccess) {
        if (_processingRentalModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingRentalModal = true;

        try {
            var residence = _getResidenceById(residenceId);
            if (!residence) {
                _showToast('Residence not found', 'error');
                _processingRentalModal = false;
                return;
            }

            if (!residence.renterId) {
                _showToast('Residence has no renter', 'warning');
                _processingRentalModal = false;
                if (onSuccess) onSuccess();
                return;
            }

            var modalContent = 
                '<div style="margin-bottom: 16px;">' +
                '<div style="background: rgba(200, 68, 68, 0.1); border: 1px solid var(--warn); border-radius: 8px; padding: 12px; margin-bottom: 16px;">' +
                '<div style="font-size: 0.7rem;"><strong>End Rental: ' + _escapeHtml(residence.name) + '</strong></div>' +
                '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 4px;">Current Renter: ' + _escapeHtml(residence.renterName || 'Unknown') + '</div>' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Current Rent: ' + (residence.rentAmount || 0) + 'g/year</div>' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Rented since: ' + (residence.rentStartYear || 'Unknown') + '</div>' +
                '</div>' +
                '<div style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">End Year</label>' +
                '<input type="number" id="rentEndYear" value="' + _getCurrentYear() + '" min="1" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '</div>' +
                '<div style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Reason</label>' +
                '<select id="rentEndReason" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;">' +
                '<option value="tenant_moved_out">Tenant moved out</option>' +
                '<option value="tenant_evicted">Tenant evicted</option>' +
                '<option value="lease_expired">Lease expired</option>' +
                '<option value="owner_occupying">Owner taking possession</option>' +
                '<option value="property_sold">Property sold</option>' +
                '<option value="mutual_agreement">Mutual agreement</option>' +
                '<option value="custom">Custom reason</option>' +
                '</select>' +
                '</div>' +
                '<div id="customEndReasonGroup" style="display: none; margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Custom Reason</label>' +
                '<input type="text" id="customEndReason" placeholder="Enter custom reason..." style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '</div>' +
                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--warn);">' +
                'Ending this rental will mark the residence as vacant and remove the household association.' +
                '</div>' +
                '</div>';

            _openModal({
                title: 'End Rental: ' + residence.name,
                content: modalContent,
                confirmText: 'End Rental',
                cancelText: 'Cancel',
                confirmStyle: 'danger',
                onConfirm: function() {
                    var endYear = parseInt(document.getElementById('rentEndYear').value) || _getCurrentYear();
                    var reasonSelect = document.getElementById('rentEndReason').value;
                    var customReason = document.getElementById('customEndReason') ? document.getElementById('customEndReason').value : '';
                    var reason = reasonSelect === 'custom' ? (customReason || 'Rental ended') : reasonSelect;

                    var residenceSystem = _getResidenceSystem();
                    if (!residenceSystem) {
                        _showToast('Residence system not available', 'error');
                        return false;
                    }

                    var result = residenceSystem.endResidenceRental(residenceId, endYear, reason);

                    if (result) {
                        _showToast('Rental ended for ' + (residence.renterName || 'Unknown'), 'success');
                        _closeTopModal();
                        _processingRentalModal = false;
                        if (onSuccess) onSuccess(result);
                        return true;
                    }
                    return false;
                },
                onCancel: function() {
                    _processingRentalModal = false;
                }
            });

            // Show/hide custom reason
            setTimeout(function() {
                var reasonSelect = document.getElementById('rentEndReason');
                if (reasonSelect) {
                    reasonSelect.onchange = function() {
                        var customGroup = document.getElementById('customEndReasonGroup');
                        if (customGroup) {
                            customGroup.style.display = this.value === 'custom' ? 'block' : 'none';
                        }
                    };
                }
            }, 100);

        } catch (e) {
            _processingRentalModal = false;
            _showToast('Error opening end rental modal', 'error');
        }
    }

    // =========================================================================
    // 7. RESIDENCE RENTAL HISTORY MODAL
    // =========================================================================

    function openResidenceRentalHistoryModal(residenceId) {
        if (_processingRentalModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingRentalModal = true;

        try {
            var residence = _getResidenceById(residenceId);
            if (!residence) {
                _showToast('Residence not found', 'error');
                _processingRentalModal = false;
                return;
            }

            var residenceSystem = _getResidenceSystem();
            if (!residenceSystem) {
                _showToast('Residence system not available', 'error');
                _processingRentalModal = false;
                return;
            }

            var rentalHistory = residenceSystem.getResidenceRentalHistory(residenceId, 50);
            var rentPayments = residenceSystem.getRentPayments(residenceId, 50);
            var currentRenter = residence.renterName || 'None';
            var currentRent = residence.rentAmount || 0;

            var historyHtml = '';
            if (rentalHistory.length === 0) {
                historyHtml = '<div style="color: var(--dim); text-align: center; padding: 20px; font-size: 0.6rem;">No rental history found</div>';
            } else {
                historyHtml = '<div style="max-height: 200px; overflow-y: auto;">';
                for (var i = 0; i < rentalHistory.length; i++) {
                    var h = rentalHistory[i];
                    var isCurrent = !h.endYear;
                    var actionLabel = h.action || 'rent_event';
                    var actionMap = {
                        'rent_started': 'Started',
                        'rent_adjusted': 'Adjusted',
                        'rent_ended': 'Ended'
                    };
                    var label = actionMap[actionLabel] || actionLabel;

                    historyHtml += 
                        '<div style="display: flex; justify-content: space-between; padding: 6px 8px; border-bottom: 1px solid var(--border-light); ' + 
                        (isCurrent ? 'background: rgba(74,158,106,0.08);' : '') + '">' +
                        '<div style="font-size: 0.65rem;">' +
                        (h.renterName ? '<strong>' + _escapeHtml(h.renterName) + '</strong>' : '') +
                        (h.oldRentAmount !== undefined && h.newRentAmount !== undefined ? 
                            ' <span style="color:var(--dim);">' + h.oldRentAmount + ' → ' + h.newRentAmount + 'g</span>' : '') +
                        (h.rentAmount !== undefined && actionLabel === 'rent_started' ? 
                            ' <span style="color:var(--success);">' + h.rentAmount + 'g/year</span>' : '') +
                        (h.reason ? ' <span style="font-size:0.5rem;color:var(--dim);">(' + _escapeHtml(h.reason) + ')</span>' : '') +
                        '</div>' +
                        '<div style="font-size: 0.55rem; color: var(--dim);">' +
                        label + ' ' + h.year +
                        (h.endYear ? ' - ' + h.endYear : '') +
                        (isCurrent ? ' <span style="color:var(--success);">Current</span>' : '') +
                        '</div>' +
                        '</div>';
                }
                historyHtml += '</div>';
            }

            var paymentsHtml = '';
            if (rentPayments.length === 0) {
                paymentsHtml = '<div style="color: var(--dim); text-align: center; padding: 20px; font-size: 0.6rem;">No rent payments recorded</div>';
            } else {
                paymentsHtml = '<div style="max-height: 150px; overflow-y: auto;">';
                for (var i = 0; i < rentPayments.length; i++) {
                    var p = rentPayments[i];
                    paymentsHtml += 
                        '<div style="display: flex; justify-content: space-between; padding: 4px 8px; border-bottom: 1px solid var(--border-light);">' +
                        '<span style="font-size: 0.65rem;">' + _escapeHtml(p.renterName || 'Unknown') + '</span>' +
                        '<span style="font-size: 0.6rem; color: var(--success);">+' + p.amount + 'g</span>' +
                        '<span style="font-size: 0.55rem; color: var(--dim);">' + p.year + '</span>' +
                        '</div>';
                }
                paymentsHtml += '</div>';
            }

            var modalContent = 
                '<div style="margin-bottom: 16px; padding: 12px; background: var(--bg2); border-radius: 8px;">' +
                '<div style="font-size: 0.8rem; font-weight: bold;">' + _escapeHtml(residence.name) + '</div>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">Current Renter: ' + _escapeHtml(currentRenter) + '</div>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">Current Rent: ' + currentRent + 'g/year</div>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">Total Rental Events: ' + rentalHistory.length + '</div>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">Total Payments: ' + rentPayments.length + '</div>' +
                '</div>' +
                '<div style="margin-bottom: 16px;">' +
                '<div style="font-size: 0.7rem; color: var(--accent); margin-bottom: 8px;">Rental History</div>' +
                historyHtml +
                '</div>' +
                '<div style="margin-bottom: 16px;">' +
                '<div style="font-size: 0.7rem; color: var(--accent); margin-bottom: 8px;">Payment History</div>' +
                paymentsHtml +
                '</div>' +
                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem;">' +
                'Rental history tracks all tenancy events and rent payments for this residence.' +
                '</div>';

            _openModal({
                title: 'Rental History: ' + residence.name,
                content: modalContent,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {
                    _closeTopModal();
                    _processingRentalModal = false;
                }
            });

        } catch (e) {
            _processingRentalModal = false;
            _showToast('Error opening rental history', 'error');
        }
    }

    // =========================================================================
    // 8. HOUSEHOLD RENTAL SUMMARY MODAL
    // =========================================================================

    function openHouseholdRentalSummaryModal(householdId) {
        if (_processingRentalModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingRentalModal = true;

        try {
            var household = _getHousehold(householdId);
            if (!household) {
                _showToast('Household not found', 'error');
                _processingRentalModal = false;
                return;
            }

            var residenceSystem = _getResidenceSystem();
            if (!residenceSystem) {
                _showToast('Residence system not available', 'error');
                _processingRentalModal = false;
                return;
            }

            // Get properties owned and rented
            var ownedProperties = residenceSystem.getResidencesByOwner(householdId, 'household');
            var rentedProperties = residenceSystem.getResidencesByRenter(householdId, 'household');
            var totalRentIncome = residenceSystem.getTotalRentIncome(householdId, 'household');
            var totalRentExpenses = residenceSystem.getTotalRentExpenses(householdId, 'household');

            // Build owned properties HTML
            var ownedHtml = '';
            if (ownedProperties.length === 0) {
                ownedHtml = '<div style="color: var(--dim); text-align: center; padding: 12px; font-size: 0.6rem;">No properties owned</div>';
            } else {
                ownedHtml = '<div style="max-height: 150px; overflow-y: auto;">';
                for (var i = 0; i < ownedProperties.length; i++) {
                    var p = ownedProperties[i];
                    var renterName = p.renterName || 'Vacant';
                    var rentAmount = p.rentAmount || 0;
                    var statusColor = p.renterId ? 'var(--success)' : 'var(--warn)';
                    var statusText = p.renterId ? 'Rented' : 'Vacant';

                    ownedHtml += 
                        '<div style="display: flex; justify-content: space-between; padding: 4px 8px; border-bottom: 1px solid var(--border-light); border-left: 3px solid ' + statusColor + ';">' +
                        '<div style="font-size: 0.65rem;">' + _escapeHtml(p.name) + '</div>' +
                        '<div style="font-size: 0.55rem; color: var(--dim);">' +
                        statusText + ' · ' + rentAmount + 'g/year' +
                        (p.renterId ? ' · ' + _escapeHtml(renterName) : '') +
                        '</div>' +
                        '</div>';
                }
                ownedHtml += '</div>';
            }

            // Build rented properties HTML
            var rentedHtml = '';
            if (rentedProperties.length === 0) {
                rentedHtml = '<div style="color: var(--dim); text-align: center; padding: 12px; font-size: 0.6rem;">No properties rented</div>';
            } else {
                rentedHtml = '<div style="max-height: 150px; overflow-y: auto;">';
                for (var i = 0; i < rentedProperties.length; i++) {
                    var r = rentedProperties[i];
                    var ownerName = r.ownerName || 'Unknown';
                    var rentAmount = r.rentAmount || 0;

                    rentedHtml += 
                        '<div style="display: flex; justify-content: space-between; padding: 4px 8px; border-bottom: 1px solid var(--border-light); border-left: 3px solid var(--warn);">' +
                        '<div style="font-size: 0.65rem;">' + _escapeHtml(r.name) + '</div>' +
                        '<div style="font-size: 0.55rem; color: var(--dim);">' +
                        rentAmount + 'g/year · Owner: ' + _escapeHtml(ownerName) +
                        '</div>' +
                        '</div>';
                }
                rentedHtml += '</div>';
            }

            var netRent = totalRentIncome - totalRentExpenses;
            var netColor = netRent >= 0 ? 'var(--success)' : 'var(--danger)';

            var modalContent = 
                '<div style="margin-bottom: 16px; padding: 12px; background: var(--bg2); border-radius: 8px;">' +
                '<div style="font-size: 0.8rem; font-weight: bold;">' + _escapeHtml(household.name) + '</div>' +
                '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-top: 8px;">' +
                '<div><span style="color: var(--dim); font-size: 0.6rem;">Properties Owned</span><br><span style="font-size: 1rem; font-weight: bold;">' + ownedProperties.length + '</span></div>' +
                '<div><span style="color: var(--dim); font-size: 0.6rem;">Properties Rented</span><br><span style="font-size: 1rem; font-weight: bold;">' + rentedProperties.length + '</span></div>' +
                '<div><span style="color: var(--dim); font-size: 0.6rem;">Net Rent</span><br><span style="font-size: 1rem; font-weight: bold; color: ' + netColor + ';">' + (netRent >= 0 ? '+' : '') + netRent + 'g</span></div>' +
                '</div>' +
                '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 4px;">' +
                '<div><span style="color: var(--dim); font-size: 0.55rem;">Rent Income</span><br><span style="color: var(--success);">+' + totalRentIncome + 'g</span></div>' +
                '<div><span style="color: var(--dim); font-size: 0.55rem;">Rent Expenses</span><br><span style="color: var(--danger);">-' + totalRentExpenses + 'g</span></div>' +
                '</div>' +
                '</div>' +
                '<div style="margin-bottom: 12px;">' +
                '<div style="font-size: 0.7rem; color: var(--accent); margin-bottom: 6px;">Properties Owned (' + ownedProperties.length + ')</div>' +
                ownedHtml +
                '</div>' +
                '<div style="margin-bottom: 12px;">' +
                '<div style="font-size: 0.7rem; color: var(--accent); margin-bottom: 6px;">Properties Rented (' + rentedProperties.length + ')</div>' +
                rentedHtml +
                '</div>' +
                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem;">' +
                'Rental summary shows all properties owned and rented by this household.' +
                ' Rent income is added to household wealth annually, and rent expenses are deducted.' +
                '</div>';

            _openModal({
                title: 'Rental Summary: ' + household.name,
                content: modalContent,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {
                    _closeTopModal();
                    _processingRentalModal = false;
                }
            });

        } catch (e) {
            _processingRentalModal = false;
            _showToast('Error opening rental summary', 'error');
        }
    }

    // =========================================================================
    // 9. RECORD RENT PAYMENT MODAL
    // =========================================================================

    function openRentPaymentModal(residenceId, onSuccess) {
        if (_processingRentalModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingRentalModal = true;

        try {
            var residence = _getResidenceById(residenceId);
            if (!residence) {
                _showToast('Residence not found', 'error');
                _processingRentalModal = false;
                return;
            }

            if (!residence.renterId) {
                _showToast('Residence has no renter', 'error');
                _processingRentalModal = false;
                return;
            }

            var residenceSystem = _getResidenceSystem();
            if (!residenceSystem) {
                _showToast('Residence system not available', 'error');
                _processingRentalModal = false;
                return;
            }

            var modalContent = 
                '<div style="margin-bottom: 16px;">' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 6px; margin-bottom: 12px;">' +
                '<div style="font-size: 0.7rem;"><strong>' + _escapeHtml(residence.name) + '</strong></div>' +
                '<div style="font-size: 0.6rem; color: var(--dim);">Renter: ' + _escapeHtml(residence.renterName || 'Unknown') + '</div>' +
                '<div style="font-size: 0.6rem; color: var(--dim);">Annual Rent: ' + (residence.rentAmount || 0) + 'g</div>' +
                '</div>' +
                '<div style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Payment Year</label>' +
                '<input type="number" id="paymentYear" value="' + _getCurrentYear() + '" min="1" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '</div>' +
                '<div style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Amount (leave empty for full rent)</label>' +
                '<input type="number" id="paymentAmount" placeholder="' + (residence.rentAmount || 0) + '" min="0" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '<small style="font-size: 0.55rem; color: var(--dim);">Leave empty to record the full annual rent amount</small>' +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Record Rent Payment: ' + residence.name,
                content: modalContent,
                confirmText: 'Record Payment',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var year = parseInt(document.getElementById('paymentYear').value) || _getCurrentYear();
                    var amountInput = document.getElementById('paymentAmount').value;
                    var amount = amountInput ? parseInt(amountInput) : (residence.rentAmount || 0);

                    if (amount <= 0) {
                        _showToast('Payment amount must be greater than 0', 'error');
                        return false;
                    }

                    var result = residenceSystem.recordRentPayment(residenceId, residence.renterId, amount, year);

                    if (result) {
                        _showToast('Rent payment of ' + amount + 'g recorded for ' + year, 'success');
                        _closeTopModal();
                        _processingRentalModal = false;
                        if (onSuccess) onSuccess();
                        return true;
                    }
                    return false;
                },
                onCancel: function() {
                    _processingRentalModal = false;
                }
            });

        } catch (e) {
            _processingRentalModal = false;
            _showToast('Error opening rent payment modal', 'error');
        }
    }

    // =========================================================================
    // 10. RESIDENCE RENTAL DETAILS MODAL
    // =========================================================================

    function openResidenceRentalDetailsModal(residenceId) {
        if (_processingRentalModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingRentalModal = true;

        try {
            var residence = _getResidenceById(residenceId);
            if (!residence) {
                _showToast('Residence not found', 'error');
                _processingRentalModal = false;
                return;
            }

            var residenceSystem = _getResidenceSystem();
            if (!residenceSystem) {
                _showToast('Residence system not available', 'error');
                _processingRentalModal = false;
                return;
            }

            var ownerInfo = residenceSystem.getResidenceOwner(residenceId);
            var renterInfo = residenceSystem.getResidenceRenter(residenceId);
            var rentalHistory = residenceSystem.getResidenceRentalHistory(residenceId, 10);
            var payments = residenceSystem.getRentPayments(residenceId, 10);

            var isRented = renterInfo && renterInfo.renterId;
            var ownerDisplay = ownerInfo ? ownerInfo.ownerName : 'None';
            var renterDisplay = renterInfo ? renterInfo.renterName : 'None';
            var rentAmount = renterInfo ? renterInfo.rentAmount : 0;
            var rentStart = renterInfo ? renterInfo.rentStartYear : 'N/A';
            var rentalStatus = renterInfo ? renterInfo.rentalStatus : 'Vacant';

            var statusColor = rentalStatus === 'rented' ? 'var(--success)' : 
                             rentalStatus === 'owner_occupied' ? 'var(--accent)' : 'var(--warn)';

            var modalContent = 
                '<div style="margin-bottom: 16px; padding: 12px; background: var(--bg2); border-radius: 8px;">' +
                '<div style="display: flex; justify-content: space-between; align-items: center;">' +
                '<div style="font-size: 0.9rem; font-weight: bold;">' + _escapeHtml(residence.name) + '</div>' +
                '<span style="font-size: 0.6rem; padding: 2px 10px; border-radius: 12px; background: ' + statusColor + '; color: white;">' + _escapeHtml(rentalStatus) + '</span>' +
                '</div>' +
                '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; font-size: 0.65rem;">' +
                '<div><span style="color: var(--dim);">Owner:</span> ' + _escapeHtml(ownerDisplay) + '</div>' +
                '<div><span style="color: var(--dim);">Renter:</span> ' + _escapeHtml(renterDisplay) + '</div>' +
                '<div><span style="color: var(--dim);">Rent:</span> ' + rentAmount + 'g/year</div>' +
                '<div><span style="color: var(--dim);">Since:</span> ' + rentStart + '</div>' +
                '</div>' +
                '</div>' +
                '<div style="margin-bottom: 12px;">' +
                '<div style="font-size: 0.7rem; color: var(--accent); margin-bottom: 6px;">Recent Rental History</div>' +
                (rentalHistory.length === 0 ? 
                    '<div style="color: var(--dim); text-align: center; padding: 12px; font-size: 0.6rem;">No rental history</div>' :
                    rentalHistory.slice(0, 5).map(function(h) {
                        var label = h.action || 'event';
                        return '<div style="display: flex; justify-content: space-between; padding: 4px 8px; border-bottom: 1px solid var(--border-light); font-size: 0.6rem;">' +
                            '<span>' + _escapeHtml(label) + (h.renterName ? ' - ' + _escapeHtml(h.renterName) : '') + '</span>' +
                            '<span style="color: var(--dim);">' + h.year + (h.endYear ? ' - ' + h.endYear : '') + '</span>' +
                            '</div>';
                    }).join('')
                ) +
                '</div>' +
                '<div style="margin-bottom: 12px;">' +
                '<div style="font-size: 0.7rem; color: var(--accent); margin-bottom: 6px;">Recent Payments</div>' +
                (payments.length === 0 ? 
                    '<div style="color: var(--dim); text-align: center; padding: 12px; font-size: 0.6rem;">No payments recorded</div>' :
                    payments.slice(0, 5).map(function(p) {
                        return '<div style="display: flex; justify-content: space-between; padding: 4px 8px; border-bottom: 1px solid var(--border-light); font-size: 0.6rem;">' +
                            '<span>' + _escapeHtml(p.renterName || 'Unknown') + '</span>' +
                            '<span style="color: var(--success);">+' + p.amount + 'g</span>' +
                            '<span style="color: var(--dim);">' + p.year + '</span>' +
                            '</div>';
                    }).join('')
                ) +
                '</div>' +
                '<div style="display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; border-top: 1px solid var(--border); padding-top: 12px;">' +
                (isRented ? 
                    '<button id="rentalUpdateRentBtn" class="btn" style="font-size: 0.6rem; padding: 4px 12px; background: var(--accent-dim); border: 1px solid var(--accent); border-radius: 4px; cursor: pointer;">Update Rent</button>' +
                    '<button id="rentalEndRentalBtn" class="btn danger" style="font-size: 0.6rem; padding: 4px 12px; background: #8a3020; border: none; color: white; border-radius: 4px; cursor: pointer;">End Rental</button>' +
                    '<button id="rentalRecordPaymentBtn" class="btn" style="font-size: 0.6rem; padding: 4px 12px; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">Record Payment</button>' : 
                    ''
                ) +
                '<button id="rentalHistoryBtn" class="btn" style="font-size: 0.6rem; padding: 4px 12px; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">Full History</button>' +
                '<button id="rentalCloseBtn" class="btn" style="font-size: 0.6rem; padding: 4px 12px; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">Close</button>' +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Rental Details: ' + residence.name,
                content: modalContent,
                confirmText: '',
                cancelText: '',
                onConfirm: function() {
                    _closeTopModal();
                    _processingRentalModal = false;
                }
            });

            // Set up event handlers
            setTimeout(function() {
                var updateRentBtn = document.getElementById('rentalUpdateRentBtn');
                if (updateRentBtn) {
                    updateRentBtn.onclick = function() {
                        _closeTopModal();
                        openUpdateRentModal(residenceId, function() {
                            setTimeout(function() {
                                openResidenceRentalDetailsModal(residenceId);
                            }, 100);
                        });
                    };
                }

                var endRentalBtn = document.getElementById('rentalEndRentalBtn');
                if (endRentalBtn) {
                    endRentalBtn.onclick = function() {
                        _closeTopModal();
                        openEndRentalModal(residenceId, function() {
                            setTimeout(function() {
                                openResidenceRentalDetailsModal(residenceId);
                            }, 100);
                        });
                    };
                }

                var recordPaymentBtn = document.getElementById('rentalRecordPaymentBtn');
                if (recordPaymentBtn) {
                    recordPaymentBtn.onclick = function() {
                        _closeTopModal();
                        openRentPaymentModal(residenceId, function() {
                            setTimeout(function() {
                                openResidenceRentalDetailsModal(residenceId);
                            }, 100);
                        });
                    };
                }

                var historyBtn = document.getElementById('rentalHistoryBtn');
                if (historyBtn) {
                    historyBtn.onclick = function() {
                        _closeTopModal();
                        openResidenceRentalHistoryModal(residenceId);
                    };
                }

                var closeBtn = document.getElementById('rentalCloseBtn');
                if (closeBtn) {
                    closeBtn.onclick = function() {
                        _closeTopModal();
                        _processingRentalModal = false;
                    };
                }
            }, 100);

        } catch (e) {
            _processingRentalModal = false;
            _showToast('Error opening rental details', 'error');
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

    // Legacy aliases
    window._openSetResidenceOwnerModal = openSetResidenceOwnerModal;
    window._openSetResidenceRenterModal = openSetResidenceRenterModal;
    window._openUpdateRentModal = openUpdateRentModal;
    window._openEndRentalModal = openEndRentalModal;
    window._openResidenceRentalHistoryModal = openResidenceRentalHistoryModal;
    window._openHouseholdRentalSummaryModal = openHouseholdRentalSummaryModal;
    window._openRentPaymentModal = openRentPaymentModal;
    window._openResidenceRentalDetailsModal = openResidenceRentalDetailsModal;

    // ES Module exports
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