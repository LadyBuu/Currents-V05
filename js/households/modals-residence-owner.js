/**
 * =============================================================================
 * STILL WATERS - RESIDENCE OWNER MODALS (modals-residence-owner.js)
 * =============================================================================
 * 
 * LOCATION: js/systems/household/modals-residence-owner.js
 * 
 * PURPOSE
 * -------
 * Modal entry points for residence owner/portfolio management:
 * 
 *   - openResidenceOwnerDetailsModal(residenceId, onRefresh)
 *   - openManageOwnedPropertiesModal(ownerId, ownerType, onSuccess)
 *   - openTransferOwnershipModal(residenceId, onSuccess)
 *   - openOwnerStatsModal(ownerId, ownerType)
 * 
 * OWNERSHIP
 * ---------
 *   Reads:  ResidenceSystem (getResidence, getResidenceOwner,
 *           getResidencesByOwner, getTotalRentIncome)
 *           HouseholdQueries.getHousehold
 *           CharacterQueries (getCharacterById)
 *   Writes: ResidenceSystem.setResidenceOwner (canonical ownership mutation)
 *   UI:     modals-core, selectors, icons
 * 
 * WHAT THIS FILE DOES NOT DO
 * --------------------------
 *   - No direct residence record mutation
 *   - No ownershipHistory.push() from the UI (the command owns that)
 *   - No addResidenceTimelineEvent() from the UI (the command owns that)
 *   - No household record mutation
 *   - No emoji icons
 *   - No setTimeout(100)
 *   - No fabricated 1250
 *   - No `_processingOwnerModal` guard
 *   - No stale selection between owner types
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
        throw new Error('modals-residence-owner: openModal is required');
    }

    function _closeTopModal() {
        if (typeof window.closeTopModal === 'function') return window.closeTopModal();
        if (typeof window._closeTopModal === 'function') return window._closeTopModal();
        throw new Error('modals-residence-owner: closeTopModal is required');
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
            throw new Error('modals-residence-owner: ResidenceSystem is required');
        }
        return window.ResidenceSystem;
    }

    function _householdQueries() {
        return typeof window.HouseholdQueries !== 'undefined'
            ? window.HouseholdQueries
            : null;
    }

    function _getCharacterById(id) {
        if (typeof window.getCharacterById !== 'function') return null;
        return window.getCharacterById(id);
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

    // =========================================================================
    // 2. OWNER NAME RESOLUTION (for display)
    // =========================================================================

    function _resolveOwnerDisplay(ownerType, ownerId, fallbackName) {
        if (!ownerId) return 'None';
        if (fallbackName) return fallbackName;

        if (ownerType === 'household') {
            var hq = _householdQueries();
            if (hq) {
                var h = hq.getHousehold(ownerId);
                if (h) return h.name;
            }
            return 'Unknown Household';
        }
        if (ownerType === 'character') {
            var c = _getCharacterById(ownerId);
            if (c) return (c.name || '') + (c.surname ? ' ' + c.surname : '');
            return 'Unknown Character';
        }
        return 'Unknown';
    }

    // =========================================================================
    // 3. RESIDENCE OWNER DETAILS MODAL
    // =========================================================================

    function openResidenceOwnerDetailsModal(residenceId, onRefresh) {
        var res = _residence();

        var residence = res.getResidence(residenceId);
        if (!residence) {
            _showToast('Residence not found', 'error');
            return null;
        }

        var owner = res.getResidenceOwner(residenceId);
        var renter = res.getResidenceRenter(residenceId);

        var ownerId = owner ? owner.ownerId : null;
        var ownerType = owner ? owner.ownerType : null;

        var ownedProperties = ownerId
            ? res.getResidencesByOwner(ownerId, ownerType)
            : [];
        var totalRentIncome = ownerId
            ? res.getTotalRentIncome(ownerId, ownerType)
            : 0;

        var content = _buildOwnerDetailsContent(
            residence, owner, renter, ownedProperties, totalRentIncome
        );

        var handle = _openModal({
            title: 'Owner Details: ' + residence.name,
            content: content,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function() {
                if (typeof onRefresh === 'function') onRefresh();
            }
        });

        setTimeout(_attachOnOpen(function(root) {
            _wireOwnerDetailsActions(root, residenceId, residence, onRefresh);
        }), 0);

        return handle;
    }

    function _buildOwnerDetailsContent(residence, owner, renter,
                                        ownedProperties, totalRentIncome) {
        var ownerDisplay = _resolveOwnerDisplay(
            owner ? owner.ownerType : null,
            owner ? owner.ownerId : null,
            owner ? owner.ownerName : null
        );
        var ownerType = owner ? owner.ownerType : 'none';
        var ownerSince = owner && owner.ownerSince !== null
            ? owner.ownerSince : '—';
        var renterDisplay = renter && renter.renterId
            ? renter.renterName : 'None';
        var rentAmount = renter ? renter.rentAmount : 0;

        var html = '<div style="margin-bottom:16px;">';

        // Header
        html += '<div style="padding:12px;background:var(--bg2);border-radius:8px;margin-bottom:12px;">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">';
        html += '<div style="font-size:0.8rem;font-weight:bold;">' +
            _escapeHtml(residence.name) + '</div>';
        html += '<span style="font-size:0.55rem;padding:2px 10px;border-radius:12px;background:var(--accent);color:white;">Owner: ' +
            _escapeHtml(ownerDisplay) + '</span>';
        html += '</div>';
        html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:8px;font-size:0.65rem;">';
        html += '<div><span style="color:var(--dim);">Owner Type:</span> ' +
            _escapeHtml(ownerType) + '</div>';
        html += '<div><span style="color:var(--dim);">Owner Since:</span> ' +
            _escapeHtml(String(ownerSince)) + '</div>';
        html += '<div><span style="color:var(--dim);">Total Properties:</span> ' +
            ownedProperties.length + '</div>';
        html += '<div><span style="color:var(--dim);">Total Rent Income:</span> ' +
            '<span style="color:var(--success);">+' + totalRentIncome + 'g/year</span></div>';
        html += '<div><span style="color:var(--dim);">Current Renter:</span> ' +
            _escapeHtml(renterDisplay) + '</div>';
        html += '<div><span style="color:var(--dim);">Current Rent:</span> ' +
            rentAmount + 'g/year</div>';
        html += '</div>';
        html += '</div>';

        // Owned properties list
        html += '<div style="margin-bottom:12px;">';
        html += '<div style="font-size:0.7rem;color:var(--accent);margin-bottom:6px;">' +
            'Properties Owned by ' + _escapeHtml(ownerDisplay) +
            ' (' + ownedProperties.length + ')' +
        '</div>';

        if (ownedProperties.length === 0) {
            html += '<div style="color:var(--dim);text-align:center;padding:12px;font-size:0.6rem;">No properties owned</div>';
        } else {
            html += '<div style="max-height:200px;overflow-y:auto;">';
            for (var i = 0; i < ownedProperties.length; i++) {
                var p = ownedProperties[i];
                var isCurrent = p.id === residence.id;
                var propRenter = p.renterName || 'Vacant';
                var propRent = p.rentAmount || 0;
                var statusColor = p.renterId ? 'var(--success)' : 'var(--warn)';
                var statusText = p.renterId ? 'Rented' : 'Vacant';

                html += '<div class="owned-property-item" data-residence-id="' +
                    _escapeHtml(p.id) +
                    '" style="display:flex;justify-content:space-between;padding:6px 8px;' +
                    'border-bottom:1px solid var(--border-light);' +
                    'border-left:3px solid ' +
                        (isCurrent ? 'var(--accent)' : statusColor) + ';' +
                    'cursor:pointer;' +
                    (isCurrent ? 'background:rgba(106,158,207,0.08);' : '') + '">';
                html += '<div style="font-size:0.65rem;">' + _escapeHtml(p.name) +
                    (isCurrent
                        ? ' <span style="color:var(--accent);font-size:0.5rem;">(Current)</span>'
                        : '') +
                    '</div>';
                html += '<div style="font-size:0.55rem;color:var(--dim);">' +
                    statusText + ' · ' + propRent + 'g/year' +
                    (p.renterId ? ' · ' + _escapeHtml(propRenter) : '') +
                '</div>';
                html += '</div>';
            }
            html += '</div>';
        }
        html += '</div>';

        // Actions
        html += '<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;border-top:1px solid var(--border);padding-top:12px;">';
        html += '<button data-action="change-owner" style="font-size:0.6rem;padding:4px 12px;background:var(--accent-dim);border:1px solid var(--accent);border-radius:4px;cursor:pointer;">Change Owner</button>';
        html += '<button data-action="transfer-ownership" style="font-size:0.6rem;padding:4px 12px;background:var(--bg3);border:1px solid var(--border);border-radius:4px;cursor:pointer;">Transfer Ownership</button>';
        html += '<button data-action="manage-properties" style="font-size:0.6rem;padding:4px 12px;background:var(--bg3);border:1px solid var(--border);border-radius:4px;cursor:pointer;">Manage All Properties</button>';
        html += '<button data-action="view-stats" style="font-size:0.6rem;padding:4px 12px;background:var(--bg3);border:1px solid var(--border);border-radius:4px;cursor:pointer;">Owner Stats</button>';
        html += '<button data-action="close" style="font-size:0.6rem;padding:4px 12px;background:var(--bg3);border:1px solid var(--border);border-radius:4px;cursor:pointer;">Close</button>';
        html += '</div>';

        html += '</div>';
        return html;
    }

    function _wireOwnerDetailsActions(root, residenceId, residence, onRefresh) {
        function _reopen() {
            if (typeof onRefresh === 'function') onRefresh();
            setTimeout(function() {
                openResidenceOwnerDetailsModal(residenceId, onRefresh);
            }, 0);
        }

        function _closeThen(fn) {
            _closeTopModal();
            setTimeout(fn, 0);
        }

        // Click on property → open that residence's owner details
        var propertyItems = root.querySelectorAll('.owned-property-item');
        for (var i = 0; i < propertyItems.length; i++) {
            (function(el) {
                el.onclick = function() {
                    var id = el.dataset.residenceId;
                    if (!id || id === residenceId) return;
                    _closeThen(function() {
                        if (typeof window.openResidenceDetailsModal === 'function') {
                            window.openResidenceDetailsModal(id, function() {
                                setTimeout(function() {
                                    openResidenceOwnerDetailsModal(residenceId, onRefresh);
                                }, 0);
                            });
                        } else {
                            _showToast('Residence details not available', 'info');
                        }
                    });
                };
            })(propertyItems[i]);
        }

        var changeBtn = root.querySelector('[data-action="change-owner"]');
        if (changeBtn) {
            changeBtn.onclick = function() {
                _closeThen(function() {
                    if (typeof window.openSetResidenceOwnerModal === 'function') {
                        window.openSetResidenceOwnerModal(residenceId, _reopen);
                    } else {
                        _showToast('Set owner modal not available', 'error');
                    }
                });
            };
        }

        var transferBtn = root.querySelector('[data-action="transfer-ownership"]');
        if (transferBtn) {
            transferBtn.onclick = function() {
                _closeThen(function() {
                    openTransferOwnershipModal(residenceId, _reopen);
                });
            };
        }

        var manageBtn = root.querySelector('[data-action="manage-properties"]');
        if (manageBtn) {
            manageBtn.onclick = function() {
                var owner = _residence().getResidenceOwner(residenceId);
                if (!owner || !owner.ownerId) {
                    _showToast('Residence has no owner', 'warning');
                    return;
                }
                _closeThen(function() {
                    openManageOwnedPropertiesModal(owner.ownerId, owner.ownerType);
                });
            };
        }

        var statsBtn = root.querySelector('[data-action="view-stats"]');
        if (statsBtn) {
            statsBtn.onclick = function() {
                var owner = _residence().getResidenceOwner(residenceId);
                if (!owner || !owner.ownerId) {
                    _showToast('Residence has no owner', 'warning');
                    return;
                }
                _closeThen(function() {
                    openOwnerStatsModal(owner.ownerId, owner.ownerType);
                });
            };
        }

        var closeBtn = root.querySelector('[data-action="close"]');
        if (closeBtn) {
            closeBtn.onclick = function() {
                _closeTopModal();
                if (typeof onRefresh === 'function') onRefresh();
            };
        }
    }

    // =========================================================================
    // 4. MANAGE OWNED PROPERTIES MODAL
    // =========================================================================

    function openManageOwnedPropertiesModal(ownerId, ownerType, onSuccess) {
        var res = _residence();

        var ownerDisplay = _resolveOwnerDisplay(ownerType, ownerId, null);
        var ownedProperties = res.getResidencesByOwner(ownerId, ownerType);
        var totalRentIncome = res.getTotalRentIncome(ownerId, ownerType);

        if (ownedProperties.length === 0) {
            _showToast(ownerDisplay + ' owns no properties', 'info');
            if (typeof onSuccess === 'function') onSuccess();
            return null;
        }

        var content = _buildManageOwnedPropertiesContent(
            ownerDisplay, ownerId, ownerType, ownedProperties, totalRentIncome
        );

        var handle = _openModal({
            title: 'Properties Owned by ' + ownerDisplay,
            content: content,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function() {
                if (typeof onSuccess === 'function') onSuccess();
            }
        });

        setTimeout(_attachOnOpen(function(root) {
            _wireManagePropertiesActions(root, ownerId, ownerType, onSuccess);
        }), 0);

        return handle;
    }

    function _buildManageOwnedPropertiesContent(ownerDisplay, ownerId, ownerType,
                                                 properties, totalRentIncome) {
        var html = '<div style="margin-bottom:16px;">';

        html += '<div style="padding:12px;background:var(--bg2);border-radius:8px;margin-bottom:12px;">';
        html += '<div style="font-size:0.8rem;font-weight:bold;">' +
            _escapeHtml(ownerDisplay) + '</div>';
        html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;font-size:0.65rem;">';
        html += '<div><span style="color:var(--dim);">Total Properties:</span> ' +
            properties.length + '</div>';
        html += '<div><span style="color:var(--dim);">Total Rent Income:</span> ' +
            '<span style="color:var(--success);">+' + totalRentIncome + 'g/year</span></div>';
        html += '</div>';
        html += '</div>';

        html += '<div style="max-height:350px;overflow-y:auto;">';
        for (var i = 0; i < properties.length; i++) {
            var p = properties[i];
            var renterName = p.renterName || 'Vacant';
            var rentAmount = p.rentAmount || 0;
            var statusColor = p.renterId ? 'var(--success)' : 'var(--warn)';
            var statusText = p.renterId ? 'Rented' : 'Vacant';
            var locationName = p.locationName || 'Unknown';

            html += '<div class="owned-property-item" data-residence-id="' +
                _escapeHtml(p.id) +
                '" style="display:flex;justify-content:space-between;align-items:center;' +
                'padding:8px 10px;border-bottom:1px solid var(--border-light);' +
                'border-left:3px solid ' + statusColor + ';cursor:pointer;">';
            html += '<div>';
            html += '<div style="font-size:0.7rem;font-weight:bold;">' +
                _escapeHtml(p.name) + '</div>';
            html += '<div style="font-size:0.55rem;color:var(--dim);">' +
                _escapeHtml(locationName) + ' · ' +
                _escapeHtml(p.typeName || 'Unknown') + '</div>';
            html += '</div>';
            html += '<div style="text-align:right;">';
            html += '<div style="font-size:0.6rem;color:' + statusColor + ';">' +
                statusText + '</div>';
            html += '<div style="font-size:0.55rem;color:var(--dim);">' +
                rentAmount + 'g/year' +
                (p.renterId ? ' · ' + _escapeHtml(renterName) : '') +
            '</div>';
            html += '</div>';
            html += '</div>';
        }
        html += '</div>';

        html += '<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;border-top:1px solid var(--border);padding-top:12px;margin-top:12px;">';
        html += '<button data-action="view-stats" style="font-size:0.6rem;padding:4px 12px;background:var(--bg3);border:1px solid var(--border);border-radius:4px;cursor:pointer;">View Statistics</button>';
        html += '<button data-action="close" style="font-size:0.6rem;padding:4px 12px;background:var(--bg3);border:1px solid var(--border);border-radius:4px;cursor:pointer;">Close</button>';
        html += '</div>';

        html += '</div>';
        return html;
    }

    function _wireManagePropertiesActions(root, ownerId, ownerType, onSuccess) {
        function _reopen() {
            setTimeout(function() {
                openManageOwnedPropertiesModal(ownerId, ownerType, onSuccess);
            }, 0);
        }

        var items = root.querySelectorAll('.owned-property-item');
        for (var i = 0; i < items.length; i++) {
            (function(el) {
                el.onclick = function() {
                    var id = el.dataset.residenceId;
                    if (!id) return;
                    _closeTopModal();
                    setTimeout(function() {
                        if (typeof window.openResidenceDetailsModal === 'function') {
                            window.openResidenceDetailsModal(id, _reopen);
                        } else {
                            _showToast('Residence details not available', 'info');
                        }
                    }, 0);
                };
            })(items[i]);
        }

        var statsBtn = root.querySelector('[data-action="view-stats"]');
        if (statsBtn) {
            statsBtn.onclick = function() {
                _closeTopModal();
                setTimeout(function() {
                    openOwnerStatsModal(ownerId, ownerType);
                }, 0);
            };
        }

        var closeBtn = root.querySelector('[data-action="close"]');
        if (closeBtn) {
            closeBtn.onclick = function() {
                _closeTopModal();
                if (typeof onSuccess === 'function') onSuccess();
            };
        }
    }

    // =========================================================================
    // 5. TRANSFER OWNERSHIP MODAL
    // =========================================================================
    //
    // Ownership transfer is a single logical operation. The ResidenceSystem
    // command `setResidenceOwner` owns:
    //   - validation
    //   - owner field mutation
    //   - ownership history append
    //   - timeline event
    //   - persistence
    //
    // This modal does NOT touch the residence record. It just collects input
    // and calls the command.
    // =========================================================================

    function openTransferOwnershipModal(residenceId, onSuccess) {
        var res = _residence();

        var residence = res.getResidence(residenceId);
        if (!residence) {
            _showToast('Residence not found', 'error');
            return null;
        }

        var currentOwner = res.getResidenceOwner(residenceId);
        var currentOwnerDisplay = currentOwner && currentOwner.ownerId
            ? currentOwner.ownerName : 'None';
        var currentOwnerType = currentOwner && currentOwner.ownerType
            ? currentOwner.ownerType : 'household';

        var year = _currentYear();

        var content =
            '<div style="margin-bottom:16px;">' +
                '<div style="background:rgba(200,168,68,0.1);border:1px solid var(--accent);border-radius:8px;padding:12px;margin-bottom:16px;">' +
                    '<div style="font-size:0.7rem;"><strong>Transfer Ownership: ' +
                        _escapeHtml(residence.name) + '</strong></div>' +
                    '<div style="font-size:0.55rem;color:var(--dim);margin-top:4px;">Current Owner: ' +
                        _escapeHtml(currentOwnerDisplay) + '</div>' +
                    '<div style="font-size:0.55rem;color:var(--dim);">Current Renter: ' +
                        _escapeHtml(residence.renterName || 'None') + '</div>' +
                    '<div style="font-size:0.55rem;color:var(--dim);">Current Rent: ' +
                        (residence.rentAmount || 0) + 'g/year</div>' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">New Owner Type</label>' +
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
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">New Owner</label>' +
                    '<div style="display:flex;gap:6px;">' +
                        '<input type="text" data-field="ownerDisplay" placeholder="Select new owner..." readonly ' +
                            'style="flex:1;padding:8px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;cursor:pointer;">' +
                        '<input type="hidden" data-field="ownerId">' +
                        '<button data-action="select-owner" class="btn" style="font-size:0.6rem;padding:4px 10px;">Select</button>' +
                        '<button data-action="clear-owner" class="btn" style="font-size:0.6rem;padding:4px 8px;">Clear</button>' +
                    '</div>' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Transfer Year</label>' +
                    '<input type="number" data-field="year" value="' +
                        (year !== null ? year : '') +
                        '" min="1" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;">' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Reason (optional)</label>' +
                    '<input type="text" data-field="reason" placeholder="e.g., Purchase, Inheritance, Gift..." ' +
                        'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;">' +
                '</div>' +

                '<div style="padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;">' +
                    'Transferring ownership keeps the current renter and rent agreement in place. ' +
                    'To end the rental, use the End Rental action after the transfer.' +
                '</div>' +
            '</div>';

        var handle = _openModal({
            title: 'Transfer Ownership: ' + residence.name,
            content: content,
            confirmText: 'Transfer Ownership',
            cancelText: 'Cancel',
            onConfirm: function() {
                var root = _resolveModalRoot();
                if (!root) return false;

                var newOwnerId = (root.querySelector('[data-field="ownerId"]') || {}).value;
                if (!newOwnerId) {
                    _showToast('Please select a new owner', 'error');
                    return false;
                }
                var newOwnerType = (root.querySelector('[data-field="ownerType"]') || {}).value;

                if (newOwnerType === currentOwnerType && newOwnerId === currentOwner.ownerId) {
                    _showToast('New owner is the same as current owner', 'info');
                    if (typeof onSuccess === 'function') onSuccess();
                    return true;
                }

                var transferYear = _parseIntOrNull((root.querySelector('[data-field="year"]') || {}).value);
                if (transferYear === null || transferYear < 1) {
                    _showToast('Please enter a valid year', 'error');
                    return false;
                }

                var reason = ((root.querySelector('[data-field="reason"]') || {}).value || '').trim();

                // Single command. It owns history, timeline, persistence.
                // We do NOT call updateResidenceNameWithHistory or
                // addResidenceTimelineEvent from here.
                var result = res.setResidenceOwner(
                    residenceId,
                    newOwnerType,
                    newOwnerId,
                    {
                        ownerSince: transferYear,
                        reason: reason || 'Transfer'
                    }
                );

                if (!result.success) {
                    _showToast(result.reason || 'Failed to transfer ownership', 'error');
                    return false;
                }

                _showToast('Ownership transferred', 'success');
                if (typeof onSuccess === 'function') onSuccess(result.data);
                return true;
            }
        });

        setTimeout(_attachOnOpen(function(root) {
            _wireTransferOwnerActions(root);
        }), 0);

        return handle;
    }

    function _wireTransferOwnerActions(root) {
        var typeSelect = root.querySelector('[data-field="ownerType"]');
        var display = root.querySelector('[data-field="ownerDisplay"]');
        var hidden = root.querySelector('[data-field="ownerId"]');
        var selectBtn = root.querySelector('[data-action="select-owner"]');
        var clearBtn = root.querySelector('[data-action="clear-owner"]');

        // Clear selection when type changes to prevent stale id/type mismatch
        if (typeSelect) {
            typeSelect.onchange = function() {
                if (display) display.value = '';
                if (hidden) hidden.value = '';
            };
        }

        if (selectBtn) {
            selectBtn.onclick = function() {
                var type = typeSelect ? typeSelect.value : 'household';
                if (type === 'household') {
                    _openHouseholdSelector({
                        title: 'Select New Owner Household',
                        onSelect: function(household) {
                            if (!household) return;
                            if (display) display.value = household.name;
                            if (hidden) hidden.value = household.id;
                        }
                    });
                } else {
                    _openCharacterSelector({
                        title: 'Select New Owner Character',
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
    // 6. OWNER STATS MODAL
    // =========================================================================

    function openOwnerStatsModal(ownerId, ownerType) {
        var res = _residence();

        var ownerDisplay = _resolveOwnerDisplay(ownerType, ownerId, null);
        var properties = res.getResidencesByOwner(ownerId, ownerType);

        if (properties.length === 0) {
            _showToast(ownerDisplay + ' owns no properties', 'info');
            return null;
        }

        var stats = _computeOwnerStats(properties);
        var content = _buildOwnerStatsContent(ownerDisplay, ownerType, stats);

        return _openModal({
            title: 'Owner Statistics: ' + ownerDisplay,
            content: content,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function() { /* close only */ }
        });
    }

    function _computeOwnerStats(properties) {
        var stats = {
            totalProperties: properties.length,
            rentedCount: 0,
            vacantCount: 0,
            totalRent: 0,
            totalValue: 0,
            byLocation: {},
            byType: {}
        };

        for (var i = 0; i < properties.length; i++) {
            var p = properties[i];
            if (p.renterId) stats.rentedCount++;
            else stats.vacantCount++;

            var rent = p.rentAmount || 0;
            stats.totalRent += rent;

            var value = p.estimatedValue || 0;
            stats.totalValue += value;

            var locKey = p.locationName || 'Unknown';
            stats.byLocation[locKey] = (stats.byLocation[locKey] || 0) + 1;

            var typeKey = p.typeName || 'Unknown';
            stats.byType[typeKey] = (stats.byType[typeKey] || 0) + 1;
        }

        stats.occupancyRate = stats.totalProperties > 0
            ? Math.round((stats.rentedCount / stats.totalProperties) * 100)
            : 0;
        stats.averageValue = stats.totalProperties > 0
            ? Math.round(stats.totalValue / stats.totalProperties)
            : 0;

        return stats;
    }

    function _buildOwnerStatsContent(ownerDisplay, ownerType, stats) {
        var html = '<div style="margin-bottom:16px;">';

        // Header
        html += '<div style="padding:12px;background:var(--bg2);border-radius:8px;margin-bottom:12px;">';
        html += '<div style="font-size:0.8rem;font-weight:bold;">' +
            _escapeHtml(ownerDisplay) + '</div>';
        html += '<div style="font-size:0.6rem;color:var(--dim);">' +
            _escapeHtml(ownerType) + '</div>';
        html += '</div>';

        // Primary metrics
        html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px;">';
        html += _statCell('Properties', stats.totalProperties);
        html += _statCell('Occupancy', stats.occupancyRate + '%');
        html += _statCell('Annual Rent', '+' + stats.totalRent + 'g', 'var(--success)');
        html += '</div>';

        // Secondary metrics
        html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">';
        html += '<div style="background:var(--bg3);padding:8px;border-radius:6px;">';
        html += '<div style="font-size:0.6rem;color:var(--accent);margin-bottom:4px;">Status</div>';
        html += _kvRow('Rented', stats.rentedCount, 'var(--success)');
        html += _kvRow('Vacant', stats.vacantCount, 'var(--warn)');
        html += '</div>';
        html += '<div style="background:var(--bg3);padding:8px;border-radius:6px;">';
        html += '<div style="font-size:0.6rem;color:var(--accent);margin-bottom:4px;">Value</div>';
        html += _kvRow('Total', stats.totalValue + 'g');
        html += _kvRow('Average', stats.averageValue + 'g');
        html += '</div>';
        html += '</div>';

        // Breakdowns
        html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">';
        html += _breakdownCell('By Location', stats.byLocation);
        html += _breakdownCell('By Type', stats.byType);
        html += '</div>';

        // Note
        html += '<div style="padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;color:var(--dim);">' +
            'Statistics show the property portfolio composition and performance.' +
        '</div>';

        html += '</div>';
        return html;
    }

    function _statCell(label, value, color) {
        return '<div style="background:var(--bg3);padding:8px;border-radius:6px;text-align:center;">' +
            '<div style="font-size:0.55rem;color:var(--dim);">' + _escapeHtml(label) + '</div>' +
            '<div style="font-size:1rem;font-weight:bold;' +
                (color ? 'color:' + color + ';' : '') + '">' +
                _escapeHtml(String(value)) +
            '</div>' +
        '</div>';
    }

    function _kvRow(key, value, color) {
        return '<div style="display:flex;justify-content:space-between;padding:2px 0;font-size:0.6rem;' +
            'border-bottom:1px solid var(--border-light);">' +
            '<span style="color:var(--dim);">' + _escapeHtml(key) + '</span>' +
            '<span' + (color ? ' style="color:' + color + ';"' : '') + '>' +
                _escapeHtml(String(value)) +
            '</span>' +
        '</div>';
    }

    function _breakdownCell(title, breakdown) {
        var html = '<div style="background:var(--bg3);padding:8px;border-radius:6px;">';
        html += '<div style="font-size:0.6rem;color:var(--accent);margin-bottom:4px;">' +
            _escapeHtml(title) + '</div>';
        var keys = Object.keys(breakdown).sort();
        if (keys.length === 0) {
            html += '<div style="font-size:0.55rem;color:var(--dim);">No data</div>';
        } else {
            for (var i = 0; i < keys.length; i++) {
                html += _kvRow(keys[i], breakdown[keys[i]]);
            }
        }
        html += '</div>';
        return html;
    }

    // =========================================================================
    // 7. EXPORTS
    // =========================================================================

    window.openResidenceOwnerDetailsModal = openResidenceOwnerDetailsModal;
    window.openManageOwnedPropertiesModal = openManageOwnedPropertiesModal;
    window.openTransferOwnershipModal = openTransferOwnershipModal;
    window.openOwnerStatsModal = openOwnerStatsModal;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            openResidenceOwnerDetailsModal: openResidenceOwnerDetailsModal,
            openManageOwnedPropertiesModal: openManageOwnedPropertiesModal,
            openTransferOwnershipModal: openTransferOwnershipModal,
            openOwnerStatsModal: openOwnerStatsModal
        };
    }

})();
