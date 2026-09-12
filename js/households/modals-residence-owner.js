/**
 * =============================================================================
 * RESIDENCE OWNER MODALS (modals-residence-owner.js)
 * =============================================================================
 * 
 * PURPOSE: UI modals for residence owner management.
 * 
 * DEPENDS ON:
 *   - modals-core.js (openModal, closeTopModal, _escapeHtml, _showToast, _getIcon)
 *   - modals-household-selector.js (openHouseholdSelector)
 *   - modals-char-select.js (openCharacterSelector)
 *   - residence-system.js (ResidenceSystem)
 *   - household-state.js (HouseholdState)
 * 
 * EXPORTS:
 *   - openResidenceOwnerDetailsModal() - View owner details and owned properties
 *   - openManageOwnedPropertiesModal() - Manage all properties owned by an owner
 *   - openTransferOwnershipModal() - Transfer ownership to another entity
 *   - openOwnerStatsModal() - View owner statistics
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

    var _processingOwnerModal = false;

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

    function _getPlaceById(placeId) {
        if (typeof window.getPlaceById === 'function') {
            return window.getPlaceById(placeId);
        }
        return null;
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
    // 3. RESIDENCE OWNER DETAILS MODAL
    // =========================================================================

    function openResidenceOwnerDetailsModal(residenceId, onRefresh) {
        if (_processingOwnerModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingOwnerModal = true;

        try {
            var residence = _getResidenceById(residenceId);
            if (!residence) {
                _showToast('Residence not found', 'error');
                _processingOwnerModal = false;
                return;
            }

            var residenceSystem = _getResidenceSystem();
            if (!residenceSystem) {
                _showToast('Residence system not available', 'error');
                _processingOwnerModal = false;
                return;
            }

            var ownerInfo = residenceSystem.getResidenceOwner(residenceId);
            var renterInfo = residenceSystem.getResidenceRenter(residenceId);
            var ownedProperties = residenceSystem.getResidencesByOwner(residence.ownerId, residence.ownerType);
            var totalRentIncome = residenceSystem.getTotalRentIncome(residence.ownerId, residence.ownerType);

            var ownerDisplay = ownerInfo ? ownerInfo.ownerName : 'None';
            var ownerType = ownerInfo ? ownerInfo.ownerType : 'none';
            var ownerSince = ownerInfo ? ownerInfo.ownerSince : 'Unknown';
            var renterDisplay = renterInfo ? renterInfo.renterName : 'None';
            var rentAmount = renterInfo ? renterInfo.rentAmount : 0;

            // Build owned properties HTML
            var propertiesHtml = '';
            if (ownedProperties.length === 0) {
                propertiesHtml = '<div style="color: var(--dim); text-align: center; padding: 12px; font-size: 0.6rem;">No other properties owned by this owner</div>';
            } else {
                propertiesHtml = '<div style="max-height: 200px; overflow-y: auto;">';
                for (var i = 0; i < ownedProperties.length; i++) {
                    var p = ownedProperties[i];
                    var isCurrent = p.id === residenceId;
                    var renterName = p.renterName || 'Vacant';
                    var rent = p.rentAmount || 0;
                    var statusColor = p.renterId ? 'var(--success)' : 'var(--warn)';
                    var statusText = p.renterId ? 'Rented' : 'Vacant';

                    propertiesHtml += 
                        '<div class="owned-property-item" data-id="' + p.id + '" style="' +
                        'display: flex; justify-content: space-between; padding: 4px 8px; border-bottom: 1px solid var(--border-light); ' +
                        'border-left: 3px solid ' + (isCurrent ? 'var(--accent)' : statusColor) + '; ' +
                        'cursor: pointer; ' +
                        (isCurrent ? 'background: rgba(106,158,207,0.08);' : '') +
                        '">' +
                        '<div style="font-size: 0.65rem;">' + _escapeHtml(p.name) + (isCurrent ? ' <span style="color:var(--accent);font-size:0.5rem;">(Current)</span>' : '') + '</div>' +
                        '<div style="font-size: 0.55rem; color: var(--dim);">' +
                        statusText + ' · ' + rent + 'g/year' +
                        (p.renterId ? ' · ' + _escapeHtml(renterName) : '') +
                        '</div>' +
                        '</div>';
                }
                propertiesHtml += '</div>';
            }

            var modalContent = 
                '<div style="margin-bottom: 16px; padding: 12px; background: var(--bg2); border-radius: 8px;">' +
                '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">' +
                '<div style="font-size: 0.8rem; font-weight: bold;">' + _escapeHtml(residence.name) + '</div>' +
                '<span style="font-size: 0.55rem; padding: 2px 10px; border-radius: 12px; background: var(--accent); color: white;">Owner: ' + _escapeHtml(ownerDisplay) + '</span>' +
                '</div>' +
                '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-top: 8px; font-size: 0.65rem;">' +
                '<div><span style="color: var(--dim);">Owner Type:</span> ' + _escapeHtml(ownerType) + '</div>' +
                '<div><span style="color: var(--dim);">Owner Since:</span> ' + ownerSince + '</div>' +
                '<div><span style="color: var(--dim);">Total Properties:</span> ' + ownedProperties.length + '</div>' +
                '<div><span style="color: var(--dim);">Total Rent Income:</span> <span style="color:var(--success);">+' + totalRentIncome + 'g/year</span></div>' +
                '<div><span style="color: var(--dim);">Current Renter:</span> ' + _escapeHtml(renterDisplay) + '</div>' +
                '<div><span style="color: var(--dim);">Current Rent:</span> ' + rentAmount + 'g/year</div>' +
                '</div>' +
                '</div>' +
                '<div style="margin-bottom: 12px;">' +
                '<div style="font-size: 0.7rem; color: var(--accent); margin-bottom: 6px;">Properties Owned by ' + _escapeHtml(ownerDisplay) + ' (' + ownedProperties.length + ')</div>' +
                propertiesHtml +
                '</div>' +
                '<div style="display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; border-top: 1px solid var(--border); padding-top: 12px;">' +
                '<button id="ownerSetOwnerBtn" class="btn" style="font-size: 0.6rem; padding: 4px 12px; background: var(--accent-dim); border: 1px solid var(--accent); border-radius: 4px; cursor: pointer;">Change Owner</button>' +
                '<button id="ownerTransferBtn" class="btn" style="font-size: 0.6rem; padding: 4px 12px; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">Transfer Ownership</button>' +
                '<button id="ownerManageBtn" class="btn" style="font-size: 0.6rem; padding: 4px 12px; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">Manage All Properties</button>' +
                '<button id="ownerCloseBtn" class="btn" style="font-size: 0.6rem; padding: 4px 12px; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">Close</button>' +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Owner Details: ' + residence.name,
                content: modalContent,
                confirmText: '',
                cancelText: '',
                onConfirm: function() {
                    _closeTopModal();
                    _processingOwnerModal = false;
                    if (onRefresh) onRefresh();
                }
            });

            // Set up event handlers
            setTimeout(function() {
                // Click on owned property to view it
                var propertyItems = document.querySelectorAll('.owned-property-item');
                for (var i = 0; i < propertyItems.length; i++) {
                    (function(item) {
                        item.onclick = function() {
                            var id = this.dataset.id;
                            if (id && id !== residenceId) {
                                _closeTopModal();
                                if (typeof window.openResidenceDetailsModal === 'function') {
                                    window.openResidenceDetailsModal(id, function() {
                                        setTimeout(function() {
                                            openResidenceOwnerDetailsModal(residenceId, onRefresh);
                                        }, 100);
                                    });
                                } else {
                                    _showToast('Residence details not available', 'info');
                                }
                            }
                        };
                    })(propertyItems[i]);
                }

                var setOwnerBtn = document.getElementById('ownerSetOwnerBtn');
                if (setOwnerBtn) {
                    setOwnerBtn.onclick = function() {
                        _closeTopModal();
                        if (typeof window.openSetResidenceOwnerModal === 'function') {
                            window.openSetResidenceOwnerModal(residenceId, function() {
                                setTimeout(function() {
                                    openResidenceOwnerDetailsModal(residenceId, onRefresh);
                                }, 100);
                            });
                        } else {
                            _showToast('Set owner modal not available', 'error');
                        }
                    };
                }

                var transferBtn = document.getElementById('ownerTransferBtn');
                if (transferBtn) {
                    transferBtn.onclick = function() {
                        _closeTopModal();
                        openTransferOwnershipModal(residenceId, function() {
                            setTimeout(function() {
                                openResidenceOwnerDetailsModal(residenceId, onRefresh);
                            }, 100);
                        });
                    };
                }

                var manageBtn = document.getElementById('ownerManageBtn');
                if (manageBtn) {
                    manageBtn.onclick = function() {
                        _closeTopModal();
                        if (residence.ownerId) {
                            openManageOwnedPropertiesModal(residence.ownerId, residence.ownerType);
                        } else {
                            _showToast('Residence has no owner', 'warning');
                        }
                    };
                }

                var closeBtn = document.getElementById('ownerCloseBtn');
                if (closeBtn) {
                    closeBtn.onclick = function() {
                        _closeTopModal();
                        _processingOwnerModal = false;
                        if (onRefresh) onRefresh();
                    };
                }
            }, 100);

        } catch (e) {
            _processingOwnerModal = false;
            _showToast('Error opening owner details', 'error');
        }
    }

    // =========================================================================
    // 4. MANAGE OWNED PROPERTIES MODAL
    // =========================================================================

    function openManageOwnedPropertiesModal(ownerId, ownerType, onSuccess) {
        if (_processingOwnerModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingOwnerModal = true;

        try {
            var residenceSystem = _getResidenceSystem();
            if (!residenceSystem) {
                _showToast('Residence system not available', 'error');
                _processingOwnerModal = false;
                return;
            }

            var ownedProperties = residenceSystem.getResidencesByOwner(ownerId, ownerType);
            var totalRentIncome = residenceSystem.getTotalRentIncome(ownerId, ownerType);

            // Get owner name
            var ownerName = 'Unknown';
            if (ownerType === 'household') {
                var household = _getHousehold(ownerId);
                if (household) ownerName = household.name;
            } else if (ownerType === 'character') {
                var character = _getCharacterById(ownerId);
                if (character) ownerName = character.name + (character.surname ? ' ' + character.surname : '');
            }

            if (ownedProperties.length === 0) {
                _showToast('No properties owned by ' + ownerName, 'info');
                _processingOwnerModal = false;
                if (onSuccess) onSuccess();
                return;
            }

            var propertiesHtml = '';
            for (var i = 0; i < ownedProperties.length; i++) {
                var p = ownedProperties[i];
                var renterName = p.renterName || 'Vacant';
                var rentAmount = p.rentAmount || 0;
                var statusColor = p.renterId ? 'var(--success)' : 'var(--warn)';
                var statusText = p.renterId ? 'Rented' : 'Vacant';
                var locationName = p.locationName || 'Unknown';

                propertiesHtml += 
                    '<div class="owned-property-item" data-id="' + p.id + '" style="' +
                    'display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; border-bottom: 1px solid var(--border-light); ' +
                    'border-left: 3px solid ' + statusColor + '; ' +
                    'cursor: pointer; ' +
                    'transition: background 0.1s;' +
                    '">' +
                    '<div>' +
                    '<div style="font-size: 0.7rem; font-weight: bold;">' + _escapeHtml(p.name) + '</div>' +
                    '<div style="font-size: 0.55rem; color: var(--dim);">' + _escapeHtml(locationName) + ' · ' + _escapeHtml(p.typeName || 'Unknown') + '</div>' +
                    '</div>' +
                    '<div style="text-align: right;">' +
                    '<div style="font-size: 0.6rem; color: ' + statusColor + ';">' + statusText + '</div>' +
                    '<div style="font-size: 0.55rem; color: var(--dim);">' + rentAmount + 'g/year' + (p.renterId ? ' · ' + _escapeHtml(renterName) : '') + '</div>' +
                    '</div>' +
                    '</div>';
            }

            var modalContent = 
                '<div style="margin-bottom: 16px; padding: 12px; background: var(--bg2); border-radius: 8px;">' +
                '<div style="font-size: 0.8rem; font-weight: bold;">Properties Owned by ' + _escapeHtml(ownerName) + '</div>' +
                '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; font-size: 0.65rem;">' +
                '<div><span style="color: var(--dim);">Total Properties:</span> ' + ownedProperties.length + '</div>' +
                '<div><span style="color: var(--dim);">Total Rent Income:</span> <span style="color:var(--success);">+' + totalRentIncome + 'g/year</span></div>' +
                '</div>' +
                '</div>' +
                '<div style="margin-bottom: 12px; max-height: 350px; overflow-y: auto;">' +
                propertiesHtml +
                '</div>' +
                '<div style="display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; border-top: 1px solid var(--border); padding-top: 12px;">' +
                '<button id="ownerStatsBtn" class="btn" style="font-size: 0.6rem; padding: 4px 12px; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">View Statistics</button>' +
                '<button id="ownerCloseBtn" class="btn" style="font-size: 0.6rem; padding: 4px 12px; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">Close</button>' +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Properties Owned by ' + ownerName,
                content: modalContent,
                confirmText: '',
                cancelText: '',
                onConfirm: function() {
                    _closeTopModal();
                    _processingOwnerModal = false;
                    if (onSuccess) onSuccess();
                }
            });

            // Set up event handlers
            setTimeout(function() {
                // Click on property to view details
                var propertyItems = document.querySelectorAll('.owned-property-item');
                for (var i = 0; i < propertyItems.length; i++) {
                    (function(item) {
                        item.onclick = function() {
                            var id = this.dataset.id;
                            if (id) {
                                _closeTopModal();
                                if (typeof window.openResidenceDetailsModal === 'function') {
                                    window.openResidenceDetailsModal(id, function() {
                                        setTimeout(function() {
                                            openManageOwnedPropertiesModal(ownerId, ownerType, onSuccess);
                                        }, 100);
                                    });
                                } else {
                                    _showToast('Residence details not available', 'info');
                                }
                            }
                        };
                        item.onmouseenter = function() {
                            this.style.background = 'var(--bg2)';
                        };
                        item.onmouseleave = function() {
                            this.style.background = 'transparent';
                        };
                    })(propertyItems[i]);
                }

                var statsBtn = document.getElementById('ownerStatsBtn');
                if (statsBtn) {
                    statsBtn.onclick = function() {
                        _closeTopModal();
                        if (typeof window.openOwnerStatsModal === 'function') {
                            window.openOwnerStatsModal(ownerId, ownerType);
                        } else {
                            openOwnerStatsModal(ownerId, ownerType);
                        }
                    };
                }

                var closeBtn = document.getElementById('ownerCloseBtn');
                if (closeBtn) {
                    closeBtn.onclick = function() {
                        _closeTopModal();
                        _processingOwnerModal = false;
                        if (onSuccess) onSuccess();
                    };
                }
            }, 100);

        } catch (e) {
            _processingOwnerModal = false;
            _showToast('Error opening managed properties', 'error');
        }
    }

    // =========================================================================
    // 5. TRANSFER OWNERSHIP MODAL
    // =========================================================================

    function openTransferOwnershipModal(residenceId, onSuccess) {
        if (_processingOwnerModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingOwnerModal = true;

        try {
            var residence = _getResidenceById(residenceId);
            if (!residence) {
                _showToast('Residence not found', 'error');
                _processingOwnerModal = false;
                return;
            }

            var residenceSystem = _getResidenceSystem();
            if (!residenceSystem) {
                _showToast('Residence system not available', 'error');
                _processingOwnerModal = false;
                return;
            }

            var currentOwner = residence.ownerName || 'None';

            var modalContent = 
                '<div style="margin-bottom: 16px;">' +
                '<div style="background: rgba(200, 168, 68, 0.1); border: 1px solid var(--accent); border-radius: 8px; padding: 12px; margin-bottom: 16px;">' +
                '<div style="font-size: 0.7rem;"><strong>Transfer Ownership: ' + _escapeHtml(residence.name) + '</strong></div>' +
                '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 4px;">Current Owner: ' + _escapeHtml(currentOwner) + '</div>' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Current Renter: ' + _escapeHtml(residence.renterName || 'None') + '</div>' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Current Rent: ' + (residence.rentAmount || 0) + 'g/year</div>' +
                '</div>' +
                '<div style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">New Owner Type</label>' +
                '<select id="transferOwnerType" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;">' +
                '<option value="household">Household</option>' +
                '<option value="character">Character</option>' +
                '</select>' +
                '</div>' +
                '<div style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">New Owner</label>' +
                '<div style="display: flex; gap: 6px;">' +
                '<input type="text" id="transferOwnerDisplay" placeholder="Select new owner..." readonly style="flex: 1; padding: 8px; background: var(--bg2); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem; cursor: pointer;">' +
                '<input type="hidden" id="transferOwnerId">' +
                '<button id="transferSelectOwnerBtn" class="btn" style="font-size: 0.6rem; padding: 4px 10px;">Select</button>' +
                '<button id="transferClearOwnerBtn" class="btn" style="font-size: 0.6rem; padding: 4px 8px;">Clear</button>' +
                '</div>' +
                '</div>' +
                '<div style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Transfer Year</label>' +
                '<input type="number" id="transferYear" value="' + _getCurrentYear() + '" min="1" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '</div>' +
                '<div style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Reason (optional)</label>' +
                '<input type="text" id="transferReason" placeholder="e.g., Purchase, Inheritance, Gift..." style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '</div>' +
                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--warn);">' +
                'Transferring ownership will keep the current renter and rent agreement in place unless the new owner chooses to end it.' +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Transfer Ownership: ' + residence.name,
                content: modalContent,
                confirmText: 'Transfer Ownership',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var newOwnerType = document.getElementById('transferOwnerType').value;
                    var newOwnerId = document.getElementById('transferOwnerId').value;
                    var year = parseInt(document.getElementById('transferYear').value) || _getCurrentYear();
                    var reason = document.getElementById('transferReason').value;

                    if (!newOwnerId) {
                        _showToast('Please select a new owner', 'error');
                        return false;
                    }

                    // Check if same as current owner
                    if (newOwnerId === residence.ownerId && newOwnerType === residence.ownerType) {
                        _showToast('New owner is the same as current owner', 'info');
                        _closeTopModal();
                        _processingOwnerModal = false;
                        if (onSuccess) onSuccess();
                        return true;
                    }

                    // Set new owner
                    var result = residenceSystem.setResidenceOwner(residenceId, newOwnerType, newOwnerId, {
                        ownerSince: year,
                        ownerName: null // Will be auto-filled
                    });

                    if (result) {
                        // Record transfer in history
                        if (!residence.ownershipHistory) residence.ownershipHistory = [];
                        residence.ownershipHistory.push({
                            ownerType: newOwnerType,
                            ownerId: newOwnerId,
                            ownerName: residence.ownerName,
                            year: year,
                            action: 'transferred',
                            reason: reason || 'Transfer',
                            previousOwnerId: residence.ownerId,
                            previousOwnerType: residence.ownerType,
                            previousOwnerName: residence.ownerName,
                            timestamp: Date.now()
                        });

                        // Add timeline event
                        residenceSystem.addResidenceTimelineEvent(residenceId, {
                            year: year,
                            type: 'ownership_transferred',
                            details: 'Ownership transferred to ' + residence.ownerName + (reason ? ' (' + reason + ')' : ''),
                            householdName: residence.ownerName
                        });

                        _showToast('Ownership transferred to ' + residence.ownerName, 'success');
                        _closeTopModal();
                        _processingOwnerModal = false;
                        if (onSuccess) onSuccess(result);
                        return true;
                    }
                    return false;
                },
                onCancel: function() {
                    _processingOwnerModal = false;
                }
            });

            // Set up event handlers
            setTimeout(function() {
                var selectBtn = document.getElementById('transferSelectOwnerBtn');
                if (selectBtn) {
                    selectBtn.onclick = function() {
                        var ownerType = document.getElementById('transferOwnerType').value;
                        if (ownerType === 'household') {
                            _openHouseholdSelector({
                                title: 'Select New Owner Household',
                                onSelect: function(household) {
                                    if (household) {
                                        document.getElementById('transferOwnerDisplay').value = household.name;
                                        document.getElementById('transferOwnerId').value = household.id;
                                        _showToast('Selected: ' + household.name, 'success');
                                    }
                                },
                                onCancel: function() {
                                    _showToast('Selection cancelled', 'info');
                                }
                            });
                        } else {
                            _openCharacterSelector({
                                title: 'Select New Owner Character',
                                onSelect: function(character) {
                                    if (character) {
                                        document.getElementById('transferOwnerDisplay').value = character.name + (character.surname ? ' ' + character.surname : '');
                                        document.getElementById('transferOwnerId').value = character.id;
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

                var clearBtn = document.getElementById('transferClearOwnerBtn');
                if (clearBtn) {
                    clearBtn.onclick = function() {
                        document.getElementById('transferOwnerDisplay').value = '';
                        document.getElementById('transferOwnerId').value = '';
                        _showToast('Owner cleared', 'info');
                    };
                }
            }, 100);

        } catch (e) {
            _processingOwnerModal = false;
            _showToast('Error opening transfer ownership modal', 'error');
        }
    }

    // =========================================================================
    // 6. OWNER STATS MODAL
    // =========================================================================

    function openOwnerStatsModal(ownerId, ownerType) {
        if (_processingOwnerModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingOwnerModal = true;

        try {
            var residenceSystem = _getResidenceSystem();
            if (!residenceSystem) {
                _showToast('Residence system not available', 'error');
                _processingOwnerModal = false;
                return;
            }

            var ownedProperties = residenceSystem.getResidencesByOwner(ownerId, ownerType);
            var totalRentIncome = residenceSystem.getTotalRentIncome(ownerId, ownerType);

            // Get owner name
            var ownerName = 'Unknown';
            var ownerTypeLabel = ownerType || 'unknown';
            if (ownerType === 'household') {
                var household = _getHousehold(ownerId);
                if (household) ownerName = household.name;
            } else if (ownerType === 'character') {
                var character = _getCharacterById(ownerId);
                if (character) ownerName = character.name + (character.surname ? ' ' + character.surname : '');
            }

            // Calculate statistics
            var totalProperties = ownedProperties.length;
            var rentedCount = 0;
            var vacantCount = 0;
            var totalRent = 0;
            var totalValue = 0;
            var byLocation = {};
            var byType = {};

            for (var i = 0; i < ownedProperties.length; i++) {
                var p = ownedProperties[i];
                if (p.renterId) rentedCount++;
                else vacantCount++;

                if (p.rentAmount) totalRent += p.rentAmount;
                if (p.estimatedValue) totalValue += p.estimatedValue;

                var locKey = p.locationName || 'Unknown';
                if (!byLocation[locKey]) byLocation[locKey] = 0;
                byLocation[locKey]++;

                var typeKey = p.typeName || 'Unknown';
                if (!byType[typeKey]) byType[typeKey] = 0;
                byType[typeKey]++;
            }

            // Build location breakdown
            var locationHtml = '';
            var locKeys = Object.keys(byLocation).sort();
            for (var i = 0; i < locKeys.length; i++) {
                var key = locKeys[i];
                locationHtml += '<div style="display:flex;justify-content:space-between;padding:2px 0;font-size:0.6rem;border-bottom:1px solid var(--border-light);">' +
                    '<span>' + _escapeHtml(key) + '</span>' +
                    '<span>' + byLocation[key] + '</span>' +
                    '</div>';
            }

            // Build type breakdown
            var typeHtml = '';
            var typeKeys = Object.keys(byType).sort();
            for (var i = 0; i < typeKeys.length; i++) {
                var key = typeKeys[i];
                typeHtml += '<div style="display:flex;justify-content:space-between;padding:2px 0;font-size:0.6rem;border-bottom:1px solid var(--border-light);">' +
                    '<span>' + _escapeHtml(key) + '</span>' +
                    '<span>' + byType[key] + '</span>' +
                    '</div>';
            }

            var occupancyRate = totalProperties > 0 ? Math.round((rentedCount / totalProperties) * 100) : 0;

            var modalContent = 
                '<div style="margin-bottom: 16px; padding: 12px; background: var(--bg2); border-radius: 8px;">' +
                '<div style="font-size: 0.8rem; font-weight: bold;">Owner Statistics: ' + _escapeHtml(ownerName) + '</div>' +
                '<div style="font-size: 0.6rem; color: var(--dim);">' + _escapeHtml(ownerTypeLabel) + '</div>' +
                '</div>' +
                '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 12px;">' +
                '<div style="background: var(--bg3); padding: 8px; border-radius: 6px; text-align: center;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Properties</div>' +
                '<div style="font-size: 1rem; font-weight: bold;">' + totalProperties + '</div>' +
                '</div>' +
                '<div style="background: var(--bg3); padding: 8px; border-radius: 6px; text-align: center;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Occupancy</div>' +
                '<div style="font-size: 1rem; font-weight: bold;">' + occupancyRate + '%</div>' +
                '</div>' +
                '<div style="background: var(--bg3); padding: 8px; border-radius: 6px; text-align: center;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Annual Rent</div>' +
                '<div style="font-size: 1rem; font-weight: bold; color: var(--success);">+' + totalRent + 'g</div>' +
                '</div>' +
                '</div>' +
                '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">' +
                '<div style="background: var(--bg3); padding: 8px; border-radius: 6px;">' +
                '<div style="font-size: 0.6rem; color: var(--accent); margin-bottom: 4px;">Status</div>' +
                '<div style="display:flex;justify-content:space-between;padding:2px 0;font-size:0.6rem;"><span style="color:var(--dim);">Rented</span><span style="color:var(--success);">' + rentedCount + '</span></div>' +
                '<div style="display:flex;justify-content:space-between;padding:2px 0;font-size:0.6rem;"><span style="color:var(--dim);">Vacant</span><span style="color:var(--warn);">' + vacantCount + '</span></div>' +
                '</div>' +
                '<div style="background: var(--bg3); padding: 8px; border-radius: 6px;">' +
                '<div style="font-size: 0.6rem; color: var(--accent); margin-bottom: 4px;">Value</div>' +
                '<div style="display:flex;justify-content:space-between;padding:2px 0;font-size:0.6rem;"><span style="color:var(--dim);">Total Value</span><span>' + totalValue + 'g</span></div>' +
                '<div style="display:flex;justify-content:space-between;padding:2px 0;font-size:0.6rem;"><span style="color:var(--dim);">Average Value</span><span>' + (totalProperties > 0 ? Math.round(totalValue / totalProperties) : 0) + 'g</span></div>' +
                '</div>' +
                '</div>' +
                '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">' +
                '<div style="background: var(--bg3); padding: 8px; border-radius: 6px;">' +
                '<div style="font-size: 0.6rem; color: var(--accent); margin-bottom: 4px;">By Location</div>' +
                locationHtml +
                '</div>' +
                '<div style="background: var(--bg3); padding: 8px; border-radius: 6px;">' +
                '<div style="font-size: 0.6rem; color: var(--accent); margin-bottom: 4px;">By Type</div>' +
                typeHtml +
                '</div>' +
                '</div>' +
                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem;">' +
                'Statistics show the property portfolio performance and composition.' +
                '</div>';

            _openModal({
                title: 'Owner Statistics: ' + ownerName,
                content: modalContent,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {
                    _closeTopModal();
                    _processingOwnerModal = false;
                }
            });

        } catch (e) {
            _processingOwnerModal = false;
            _showToast('Error opening owner stats', 'error');
        }
    }

    // =========================================================================
    // 7. EXPORTS
    // =========================================================================

    window.openResidenceOwnerDetailsModal = openResidenceOwnerDetailsModal;
    window.openManageOwnedPropertiesModal = openManageOwnedPropertiesModal;
    window.openTransferOwnershipModal = openTransferOwnershipModal;
    window.openOwnerStatsModal = openOwnerStatsModal;

    // Legacy aliases
    window._openResidenceOwnerDetailsModal = openResidenceOwnerDetailsModal;
    window._openManageOwnedPropertiesModal = openManageOwnedPropertiesModal;
    window._openTransferOwnershipModal = openTransferOwnershipModal;
    window._openOwnerStatsModal = openOwnerStatsModal;

    // ES Module exports
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            openResidenceOwnerDetailsModal: openResidenceOwnerDetailsModal,
            openManageOwnedPropertiesModal: openManageOwnedPropertiesModal,
            openTransferOwnershipModal: openTransferOwnershipModal,
            openOwnerStatsModal: openOwnerStatsModal
        };
    }

})();