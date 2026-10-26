/**
 * =============================================================================
 * STILL WATERS - RESIDENCE OWNER MODALS (modals-residence-owner.js)
 * =============================================================================
 *
 * LOCATION: js/households/modals-residence-owner.js
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
 *   Reads:  ResidenceSystem.getResidence / getResidenceOwner /
 *           getResidencesByOwner / getTotalRentIncome
 *           HouseholdQueries.getHousehold
 *           accessors.js getCharacterById
 *   Writes: ResidenceSystem.setResidenceOwner (canonical ownership
 *           mutation) + one persist() per batch
 *   UI:     modals-core, selectors, icons, HouseholdModals,
 *           HouseholdViewModels
 *
 * CONVERGED PATTERN NOTES
 * -----------------------
 *   - Ownership transfer is ONE logical operation: the modal calls
 *     setResidenceOwner once, then persist() once. No ownershipHistory
 *     mutation happens in the UI — the command owns that.
 *   - No direct residence record mutation.
 *   - No stale selection between owner types — changing ownerType
 *     clears the current selection.
 *   - No _processingOwnerModal guard.
 *   - Result shape: setResidenceOwner returns { success, data } |
 *     { success: false, code, reason }. The modal reads .success.
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
 *   This modal persists via ResidenceSystem.persist(), which returns
 *   { success, data } | { success: false, code, reason }. The local
 *   `_persistOrFail` adapts the shape to { ok, reason } for the modal
 *   flows.
 *
 *   HouseholdModals.persistOrFail is not used here because it calls
 *   HouseholdCommands.persist specifically. Same reasoning as
 *   modals-residence.js.
 *
 * DEPENDENCIES (REQUIRED, verified at load):
 *   - modals-core.js (openModal, closeTopModal)
 *   - accessors.js (getCharacterById)
 *   - household-queries.js (HouseholdQueries)
 *   - household-modals-helper.js (HouseholdModals)
 *   - household-view-models.js (HouseholdViewModels)
 *   - residence-system.js (ResidenceSystem)
 *
 * DEPENDENCIES (OPTIONAL, checked at call time):
 *   - selectors/modals-household-selector.js (openHouseholdSelector)
 *   - selectors/modals-char-selector.js (openCharacterSelector)
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
            throw new Error('modals-residence-owner: ' + name + ' is required');
        }
        return fn;
    }

    function _requireObject(name, obj) {
        if (typeof obj === 'undefined' || obj === null) {
            throw new Error('modals-residence-owner: ' + name + ' is required');
        }
        return obj;
    }

    var _residence = _requireObject('ResidenceSystem', window.ResidenceSystem);
    _requireFunction('ResidenceSystem.persist', _residence.persist);
    _requireFunction('ResidenceSystem.setResidenceOwner',
        _residence.setResidenceOwner);
    _requireFunction('ResidenceSystem.getResidenceOwner',
        _residence.getResidenceOwner);
    _requireFunction('ResidenceSystem.getResidenceRenter',
        _residence.getResidenceRenter);
    _requireFunction('ResidenceSystem.getResidence',
        _residence.getResidence);
    _requireFunction('ResidenceSystem.getResidencesByOwner',
        _residence.getResidencesByOwner);
    _requireFunction('ResidenceSystem.getTotalRentIncome',
        _residence.getTotalRentIncome);

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

    var _getCharacterById = _requireFunction('getCharacterById',
        window.getCharacterById);

    var _Modals = _requireObject('HouseholdModals', window.HouseholdModals);
    _requireFunction('HouseholdModals.rootFrom', _Modals.rootFrom);
    _requireFunction('HouseholdModals.reportFailure', _Modals.reportFailure);
    _requireFunction('HouseholdModals.esc', _Modals.esc);
    _requireFunction('HouseholdModals.readValue', _Modals.readValue);
    _requireFunction('HouseholdModals.readIntOrNull', _Modals.readIntOrNull);
    _requireFunction('HouseholdModals.onOpen', _Modals.onOpen);

    var _VM = _requireObject('HouseholdViewModels', window.HouseholdViewModels);

    // Local aliases.
    var _esc = _Modals.esc;
    var _showSuccess = _Modals.showSuccess;
    var _showWarning = _Modals.showWarning;
    var _showInfo = _Modals.showInfo;
    var _showError = _Modals.showError;

    function _currentYear() {
        return (typeof window.getCurrentYearSafe === 'function')
            ? window.getCurrentYearSafe()
            : null;
    }

    // =========================================================================
    // 1. LOCAL PERSIST (ResidenceSystem shape)
    // =========================================================================
    //
    // ResidenceSystem.persist returns { success, data } | { success: false,
    // code, reason } — not a boolean. This wrapper adapts to the
    // { ok, reason } shape the modal flows expect.

    function _persistOrFail(messagePrefix) {
        var result;
        try {
            result = _residence.persist();
        } catch (e) {
            var threwReason = (e && e.message) ? e.message : 'persist threw';
            _showError(
                (messagePrefix || 'Changes made') +
                ' but could not save: ' + threwReason);
            return { ok: false, reason: threwReason };
        }

        if (!result || result.success === false) {
            var reason = (result && result.reason) || 'Unknown persist error';
            _showError(
                (messagePrefix || 'Changes made') +
                ' but could not save: ' + reason);
            return { ok: false, reason: reason };
        }

        return { ok: true };
    }

    // =========================================================================
    // 2. OWNER / PORTFOLIO LOOKUPS
    // =========================================================================

    function _resolveOwnerDisplay(ownerType, ownerId, fallbackName) {
        if (!ownerId) return 'None';
        if (fallbackName) return fallbackName;

        if (ownerType === 'household') {
            var h = _householdQueries.getHousehold(ownerId);
            if (h) return h.name;
            return 'Unknown Household';
        }
        if (ownerType === 'character') {
            var c = _getCharacterById(ownerId);
            if (c) return (c.name || '') + (c.surname ? ' ' + c.surname : '');
            return 'Unknown Character';
        }
        return 'Unknown';
    }

    function _openHouseholdSelector(options) {
        if (typeof window.openHouseholdSelector === 'function') {
            return window.openHouseholdSelector(options);
        }
        _showError('Household selector not available');
        return null;
    }

    function _openCharacterSelector(options) {
        if (typeof window.openCharacterSelector === 'function') {
            return window.openCharacterSelector(options);
        }
        _showError('Character selector not available');
        return null;
    }

    // =========================================================================
    // 3. RESIDENCE OWNER DETAILS MODAL (pure projection)
    // =========================================================================

    function openResidenceOwnerDetailsModal(residenceId, onRefresh) {
        var residence = _residence.getResidence(residenceId);
        if (!residence) {
            _showError('Residence not found');
            return null;
        }

        var owner = _residence.getResidenceOwner(residenceId);
        var renter = _residence.getResidenceRenter(residenceId);

        var ownerId = owner ? owner.ownerId : null;
        var ownerType = owner ? owner.ownerType : null;

        var ownedProperties = ownerId
            ? _residence.getResidencesByOwner(ownerId, ownerType)
            : [];
        var totalRentIncome = ownerId
            ? _residence.getTotalRentIncome(ownerId, ownerType)
            : 0;

        var content = _buildOwnerDetailsContent(
            residence, owner, renter, ownedProperties, totalRentIncome
        );

        var modal = _openModal({
            title: 'Owner Details: ' + residence.name,
            content: content,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function() {
                if (typeof onRefresh === 'function') onRefresh();
            }
        });

        _Modals.onOpen(modal, function(root) {
            _wireOwnerDetailsActions(root, residenceId, residence, onRefresh);
        });

        return modal;
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

        // Header.
        html += '<div style="padding:12px;background:var(--bg2);border-radius:8px;margin-bottom:12px;">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">';
        html += '<div style="font-size:0.8rem;font-weight:bold;">' +
            _esc(residence.name) + '</div>';
        html += '<span style="font-size:0.55rem;padding:2px 10px;border-radius:12px;background:var(--accent);color:white;">Owner: ' +
            _esc(ownerDisplay) + '</span>';
        html += '</div>';
        html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:8px;font-size:0.65rem;">';
        html += '<div><span style="color:var(--dim);">Owner Type:</span> ' +
            _esc(ownerType) + '</div>';
        html += '<div><span style="color:var(--dim);">Owner Since:</span> ' +
            _esc(String(ownerSince)) + '</div>';
        html += '<div><span style="color:var(--dim);">Total Properties:</span> ' +
            ownedProperties.length + '</div>';
        html += '<div><span style="color:var(--dim);">Total Rent Income:</span> ' +
            '<span style="color:var(--success);">+' + totalRentIncome +
            'g/year</span></div>';
        html += '<div><span style="color:var(--dim);">Current Renter:</span> ' +
            _esc(renterDisplay) + '</div>';
        html += '<div><span style="color:var(--dim);">Current Rent:</span> ' +
            rentAmount + 'g/year</div>';
        html += '</div>';
        html += '</div>';

        // Owned properties list.
        html += '<div style="margin-bottom:12px;">';
        html += '<div style="font-size:0.7rem;color:var(--accent);margin-bottom:6px;">' +
            'Properties Owned by ' + _esc(ownerDisplay) +
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
                    _esc(p.id) +
                    '" style="display:flex;justify-content:space-between;padding:6px 8px;' +
                    'border-bottom:1px solid var(--border-light);' +
                    'border-left:3px solid ' +
                        (isCurrent ? 'var(--accent)' : statusColor) + ';' +
                    'cursor:pointer;' +
                    (isCurrent ? 'background:rgba(106,158,207,0.08);' : '') + '">';
                html += '<div style="font-size:0.65rem;">' +
                    _esc(p.name) +
                    (isCurrent
                        ? ' <span style="color:var(--accent);font-size:0.5rem;">(Current)</span>'
                        : '') +
                    '</div>';
                html += '<div style="font-size:0.55rem;color:var(--dim);">' +
                    statusText + ' · ' + propRent + 'g/year' +
                    (p.renterId
                        ? ' · ' + _esc(propRenter) : '') +
                '</div>';
                html += '</div>';
            }
            html += '</div>';
        }
        html += '</div>';

        // Actions.
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
        function _closeThen(fn) {
            _closeTopModal();
            setTimeout(fn, 0);
        }

        function _reopen() {
            if (typeof onRefresh === 'function') onRefresh();
            setTimeout(function() {
                openResidenceOwnerDetailsModal(residenceId, onRefresh);
            }, 0);
        }

        // Click property → open that residence's details.
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
                                    openResidenceOwnerDetailsModal(
                                        residenceId, onRefresh);
                                }, 0);
                            });
                        } else {
                            _showInfo('Residence details not available');
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
                        _showError('Set owner modal not available');
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
                var owner = _residence.getResidenceOwner(residenceId);
                if (!owner || !owner.ownerId) {
                    _showWarning('Residence has no owner');
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
                var owner = _residence.getResidenceOwner(residenceId);
                if (!owner || !owner.ownerId) {
                    _showWarning('Residence has no owner');
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
                setTimeout(function() {
                    if (typeof onRefresh === 'function') onRefresh();
                }, 0);
            };
        }
    }

    // =========================================================================
    // 4. MANAGE OWNED PROPERTIES MODAL (pure projection)
    // =========================================================================

    function openManageOwnedPropertiesModal(ownerId, ownerType, onSuccess) {
        var ownerDisplay = _resolveOwnerDisplay(ownerType, ownerId, null);
        var ownedProperties = _residence.getResidencesByOwner(ownerId, ownerType);
        var totalRentIncome = _residence.getTotalRentIncome(ownerId, ownerType);

        if (ownedProperties.length === 0) {
            _showInfo(ownerDisplay + ' owns no properties');
            if (typeof onSuccess === 'function') onSuccess();
            return null;
        }

        var content = _buildManageOwnedPropertiesContent(
            ownerDisplay, ownerId, ownerType, ownedProperties, totalRentIncome
        );

        var modal = _openModal({
            title: 'Properties Owned by ' + ownerDisplay,
            content: content,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function() {
                if (typeof onSuccess === 'function') onSuccess();
            }
        });

        _Modals.onOpen(modal, function(root) {
            _wireManagePropertiesActions(root, ownerId, ownerType, onSuccess);
        });

        return modal;
    }

    function _buildManageOwnedPropertiesContent(ownerDisplay, ownerId, ownerType,
                                                 properties, totalRentIncome) {
        var html = '<div style="margin-bottom:16px;">';

        html += '<div style="padding:12px;background:var(--bg2);border-radius:8px;margin-bottom:12px;">';
        html += '<div style="font-size:0.8rem;font-weight:bold;">' +
            _esc(ownerDisplay) + '</div>';
        html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;font-size:0.65rem;">';
        html += '<div><span style="color:var(--dim);">Total Properties:</span> ' +
            properties.length + '</div>';
        html += '<div><span style="color:var(--dim);">Total Rent Income:</span> ' +
            '<span style="color:var(--success);">+' + totalRentIncome +
            'g/year</span></div>';
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
                _esc(p.id) +
                '" style="display:flex;justify-content:space-between;align-items:center;' +
                'padding:8px 10px;border-bottom:1px solid var(--border-light);' +
                'border-left:3px solid ' + statusColor + ';cursor:pointer;">';
            html += '<div>';
            html += '<div style="font-size:0.7rem;font-weight:bold;">' +
                _esc(p.name) + '</div>';
            html += '<div style="font-size:0.55rem;color:var(--dim);">' +
                _esc(locationName) + ' · ' +
                _esc(p.typeName || 'Unknown') + '</div>';
            html += '</div>';
            html += '<div style="text-align:right;">';
            html += '<div style="font-size:0.6rem;color:' + statusColor + ';">' +
                statusText + '</div>';
            html += '<div style="font-size:0.55rem;color:var(--dim);">' +
                rentAmount + 'g/year' +
                (p.renterId ? ' · ' + _esc(renterName) : '') +
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
        function _closeThen(fn) {
            _closeTopModal();
            setTimeout(fn, 0);
        }

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
                    _closeThen(function() {
                        if (typeof window.openResidenceDetailsModal === 'function') {
                            window.openResidenceDetailsModal(id, _reopen);
                        } else {
                            _showInfo('Residence details not available');
                        }
                    });
                };
            })(items[i]);
        }

        var statsBtn = root.querySelector('[data-action="view-stats"]');
        if (statsBtn) {
            statsBtn.onclick = function() {
                _closeThen(function() {
                    openOwnerStatsModal(ownerId, ownerType);
                });
            };
        }

        var closeBtn = root.querySelector('[data-action="close"]');
        if (closeBtn) {
            closeBtn.onclick = function() {
                _closeTopModal();
                setTimeout(function() {
                    if (typeof onSuccess === 'function') onSuccess();
                }, 0);
            };
        }
    }

    // =========================================================================
    // 5. TRANSFER OWNERSHIP MODAL
    // =========================================================================
    //
    // Ownership transfer is a single logical operation. The ResidenceSystem
    // command setResidenceOwner owns:
    //   - validation
    //   - owner field mutation
    //   - ownership history append
    //   - persistence (via the modal's _persistOrFail)
    //
    // This modal does NOT touch the residence record. It collects input,
    // calls the command, then persists once.

    function openTransferOwnershipModal(residenceId, onSuccess) {
        var residence = _residence.getResidence(residenceId);
        if (!residence) {
            _showError('Residence not found');
            return null;
        }

        var currentOwner = _residence.getResidenceOwner(residenceId);
        var currentOwnerDisplay = currentOwner && currentOwner.ownerId
            ? currentOwner.ownerName : 'None';
        var currentOwnerType = currentOwner && currentOwner.ownerType
            ? currentOwner.ownerType : 'household';

        var year = _currentYear();

        var content =
            '<div style="margin-bottom:16px;">' +
                '<div style="background:rgba(200,168,68,0.1);border:1px solid var(--accent);border-radius:8px;padding:12px;margin-bottom:16px;">' +
                    '<div style="font-size:0.7rem;"><strong>Transfer Ownership: ' +
                        _esc(residence.name) + '</strong></div>' +
                    '<div style="font-size:0.55rem;color:var(--dim);margin-top:4px;">Current Owner: ' +
                        _esc(currentOwnerDisplay) + '</div>' +
                    '<div style="font-size:0.55rem;color:var(--dim);">Current Renter: ' +
                        _esc(residence.renterName || 'None') + '</div>' +
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

        var modal = _openModal({
            title: 'Transfer Ownership: ' + residence.name,
            content: content,
            confirmText: 'Transfer Ownership',
            cancelText: 'Cancel',
            onConfirm: function() {
                var root = _Modals.rootFrom(modal);
                if (!root) {
                    _showError('Modal root unavailable');
                    return false;
                }

                var newOwnerId = _Modals.readValue(root, '[data-field="ownerId"]');
                if (!newOwnerId) {
                    _showError('Please select a new owner');
                    return false;
                }
                var newOwnerType = _Modals.readValue(root, '[data-field="ownerType"]');

                if (newOwnerType === currentOwnerType &&
                    currentOwner && newOwnerId === currentOwner.ownerId) {
                    _showInfo('New owner is the same as current owner');
                    if (typeof onSuccess === 'function') onSuccess();
                    return true;
                }

                var transferYear = _Modals.readIntOrNull(root, '[data-field="year"]');
                if (transferYear === null || transferYear < 1) {
                    _showError('Please enter a valid year');
                    return false;
                }

                var reason = _Modals.readValue(root, '[data-field="reason"]').trim();

                // Single command. It owns history, timeline.
                var result = _residence.setResidenceOwner(
                    residenceId,
                    newOwnerType,
                    newOwnerId,
                    {
                        ownerSince: transferYear,
                        reason: reason || 'Transfer'
                    }
                );

                if (!result.success) {
                    _Modals.reportFailure(result, 'Failed to transfer ownership');
                    return false;
                }

                var persisted = _persistOrFail('Ownership transferred');
                if (!persisted.ok) {
                    return false;
                }

                _showSuccess('Ownership transferred');
                if (typeof onSuccess === 'function') onSuccess(result.data);
                return true;
            }
        });

        _Modals.onOpen(modal, function(root) {
            _wireTransferOwnerActions(root);
        });

        return modal;
    }

    function _wireTransferOwnerActions(root) {
        var typeSelect = root.querySelector('[data-field="ownerType"]');
        var display = root.querySelector('[data-field="ownerDisplay"]');
        var hidden = root.querySelector('[data-field="ownerId"]');
        var selectBtn = root.querySelector('[data-action="select-owner"]');
        var clearBtn = root.querySelector('[data-action="clear-owner"]');

        // Clear selection when type changes to prevent stale id/type mismatch.
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
    // 6. OWNER STATS MODAL (pure projection)
    // =========================================================================

    function openOwnerStatsModal(ownerId, ownerType) {
        var ownerDisplay = _resolveOwnerDisplay(ownerType, ownerId, null);
        var properties = _residence.getResidencesByOwner(ownerId, ownerType);

        if (properties.length === 0) {
            _showInfo(ownerDisplay + ' owns no properties');
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

        html += '<div style="padding:12px;background:var(--bg2);border-radius:8px;margin-bottom:12px;">';
        html += '<div style="font-size:0.8rem;font-weight:bold;">' +
            _esc(ownerDisplay) + '</div>';
        html += '<div style="font-size:0.6rem;color:var(--dim);">' +
            _esc(ownerType) + '</div>';
        html += '</div>';

        html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px;">';
        html += _statCell('Properties', stats.totalProperties);
        html += _statCell('Occupancy', stats.occupancyRate + '%');
        html += _statCell('Annual Rent', '+' + stats.totalRent + 'g',
            'var(--success)');
        html += '</div>';

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

        html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">';
        html += _breakdownCell('By Location', stats.byLocation);
        html += _breakdownCell('By Type', stats.byType);
        html += '</div>';

        html += '<div style="padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;color:var(--dim);">' +
            'Statistics show the property portfolio composition and performance.' +
        '</div>';

        html += '</div>';
        return html;
    }

    function _statCell(label, value, color) {
        return '<div style="background:var(--bg3);padding:8px;border-radius:6px;text-align:center;">' +
            '<div style="font-size:0.55rem;color:var(--dim);">' +
                _esc(label) + '</div>' +
            '<div style="font-size:1rem;font-weight:bold;' +
                (color ? 'color:' + color + ';' : '') + '">' +
                _esc(String(value)) +
            '</div>' +
        '</div>';
    }

    function _kvRow(key, value, color) {
        return '<div style="display:flex;justify-content:space-between;padding:2px 0;font-size:0.6rem;' +
            'border-bottom:1px solid var(--border-light);">' +
            '<span style="color:var(--dim);">' + _esc(key) + '</span>' +
            '<span' + (color ? ' style="color:' + color + ';"' : '') + '>' +
                _esc(String(value)) +
            '</span>' +
        '</div>';
    }

    function _breakdownCell(title, breakdown) {
        var html = '<div style="background:var(--bg3);padding:8px;border-radius:6px;">';
        html += '<div style="font-size:0.6rem;color:var(--accent);margin-bottom:4px;">' +
            _esc(title) + '</div>';
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
