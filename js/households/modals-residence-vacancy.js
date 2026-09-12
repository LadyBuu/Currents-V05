/**
 * =============================================================================
 * RESIDENCE VACANCY MODALS (modals-residence-vacancy.js)
 * =============================================================================
 * 
 * PURPOSE: UI modals for residence vacancy and unit management.
 * 
 * DEPENDS ON:
 *   - modals-core.js (openModal, closeTopModal, _escapeHtml, _showToast, _getIcon)
 *   - modals-household-selector.js (openHouseholdSelector)
 *   - modals-residence.js (openResidenceDetailsModal)
 *   - residence-system.js (ResidenceSystem)
 *   - household-state.js (HouseholdState)
 *   - household-commands.js (HouseholdCommands)
 * 
 * EXPORTS:
 *   - openMarkResidenceVacantModal()
 *   - openResidenceVacancyDetailsModal()
 *   - openAssignResidenceToHouseholdModal()
 *   - openRehabilitateResidenceModal()
 *   - openDemolishResidenceModal()
 *   - openResidenceHeirFinderModal()
 *   - openAddUnitModal()
 *   - openRemoveUnitModal()
 *   - openAssignUnitModal()
 *   - openMarkUnitVacantModal()
 *   - openUnitDetailsModal()
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

    var _processingVacancyModal = false;

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

    function _buildLocationDropdown(selectedId, placeholderText, includeAll) {
        if (typeof window.buildLocationDropdown === 'function') {
            return window.buildLocationDropdown(selectedId, placeholderText, includeAll, true);
        }
        if (typeof window._buildLocationDropdown === 'function') {
            return window._buildLocationDropdown(selectedId, placeholderText, includeAll, true);
        }
        return '';
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

    // =========================================================================
    // 2. STATE AND SYSTEM REFERENCE
    // =========================================================================

    var _state = window.HouseholdState;
    var _commands = window.HouseholdCommands;
    var _residence = window.ResidenceSystem;

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

    function _getPlaces() {
        if (typeof window.getPlaces === 'function') {
            return window.getPlaces();
        }
        return window.masterData?.data?.places || [];
    }

    function _getResidenceById(residenceId) {
        return _residence ? _residence.getResidenceById(residenceId) : null;
    }

    function _getResidences() {
        return _residence ? _residence.getResidences() : [];
    }

    function _getResidencesByLocation(locationId) {
        return _residence ? _residence.getResidencesByLocation(locationId) : [];
    }

    function _getVacantResidences(locationId) {
        return _residence ? _residence.getVacantResidences(locationId) : [];
    }

    function _getResidenceUnits(residenceId) {
        return _residence ? _residence.getResidenceUnits(residenceId) : [];
    }

    function _getResidenceUnit(residenceId, unitNumber) {
        return _residence ? _residence.getResidenceUnit(residenceId, unitNumber) : null;
    }

    function _getVacantUnits(residenceId) {
        return _residence ? _residence.getVacantUnits(residenceId) : [];
    }

    function _getUnitStats(residenceId) {
        return _residence ? _residence.getUnitStats(residenceId) : { total: 0, occupied: 0, vacant: 0, demolished: 0, occupancyRate: 0 };
    }

    function _getResidenceVacancyDetails(residenceId) {
        return _residence ? _residence.getResidenceVacancyDetails(residenceId) : null;
    }

    function _getResidenceRecommendations(residenceId) {
        return _residence ? _residence.getResidenceRecommendations(residenceId) : [];
    }

    function _assignHouseholdToVacantResidence(residenceId, householdId, householdName, year, options) {
        return _residence ? _residence.assignHouseholdToVacantResidence(residenceId, householdId, householdName, year, options) : null;
    }

    function _markResidenceVacant(residenceId, reason, year) {
        return _residence ? _residence.markResidenceVacant(residenceId, reason, year) : null;
    }

    function _rehabilitateResidence(residenceId, targetCondition, year) {
        return _residence ? _residence.rehabilitateResidence(residenceId, targetCondition, year) : null;
    }

    function _calculateRepairCost(residence, targetCondition) {
        return _residence ? _residence.calculateRepairCost(residence, targetCondition) : 0;
    }

    function _updateResidence(residenceId, updates) {
        return _residence ? _residence.updateResidence(residenceId, updates) : null;
    }

    function _addResidenceUnit(residenceId, options) {
        return _residence ? _residence.addResidenceUnit(residenceId, options) : null;
    }

    function _removeResidenceUnit(residenceId, unitNumber, options) {
        return _residence ? _residence.removeResidenceUnit(residenceId, unitNumber, options) : null;
    }

    function _assignHouseholdToUnit(residenceId, unitNumber, householdId, householdName, year, options) {
        return _residence ? _residence.assignHouseholdToUnit(residenceId, unitNumber, householdId, householdName, year, options) : null;
    }

    function _markUnitVacant(residenceId, unitNumber, reason, year) {
        return _residence ? _residence.markUnitVacant(residenceId, unitNumber, reason, year) : null;
    }

    function _demolishUnit(residenceId, unitNumber, reason, year) {
        return _residence ? _residence.demolishUnit(residenceId, unitNumber, reason, year) : null;
    }

    function _getAllResidenceConditions() {
        return _residence ? _residence.getAllResidenceConditions() : [];
    }

    function _getAllResidenceTypes() {
        return _residence ? _residence.getAllResidenceTypes() : {};
    }

    function _calculateAge(birthYear, isDeceased, deathYear) {
    // Delegates to time.js — do not reimplement age logic here.
    if (typeof window.calculateAge === 'function') {
        return window.calculateAge(birthYear, isDeceased, deathYear);
    }
    return null;
}

    function _addHouseholdActivityLog(householdId, action, details, actorId) {
        if (typeof window.addHouseholdActivityLog === 'function') {
            return window.addHouseholdActivityLog(householdId, action, details, actorId);
        }
        return false;
    }

    // =========================================================================
    // 5. MARK RESIDENCE VACANT MODAL
    // =========================================================================

    function openMarkResidenceVacantModal(residenceId, onSuccess) {
        if (_processingVacancyModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingVacancyModal = true;

        try {
            var residence = _getResidenceById(residenceId);
            if (!residence) {
                _showToast('Residence not found', 'error');
                _processingVacancyModal = false;
                return;
            }

            if (residence.isVacant) {
                _showToast('Residence is already vacant', 'warning');
                _processingVacancyModal = false;
                if (onSuccess) {
                    onSuccess();
                }
                return;
            }

            if (residence.isDemolished) {
                _showToast('Residence has been demolished', 'error');
                _processingVacancyModal = false;
                return;
            }

            var currentYear = _getCurrentYear();
            var householdName = residence.householdName || 'Unknown';

            var modalContent =
                '<div style="margin-bottom: 16px;">' +
                '<div style="background: rgba(200, 112, 64, 0.15); border: 1px solid var(--warn); border-radius: 8px; padding: 12px; margin-bottom: 16px;">' +
                '<div style="font-size: 0.7rem;"><strong>Residence:</strong> ' + _escapeHtml(residence.name) + '</div>' +
                '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 4px;"><strong>Current Household:</strong> ' + _escapeHtml(householdName) + '</div>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Vacancy Year</label>' +
                '<input type="number" id="vacantYear" value="' + currentYear + '" min="1" max="' + (currentYear + 5) + '" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Reason for Vacancy</label>' +
                '<select id="vacantReason" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;">' +
                '<option value="household_moved">Household moved out</option>' +
                '<option value="household_disassociated">Household disassociated</option>' +
                '<option value="manual">Manual (admin)</option>' +
                '<option value="sold">Sold</option>' +
                '<option value="destroyed">Destroyed</option>' +
                '</select>' +
                '</div>' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Marking this residence as vacant will make it available for assignment to another household.</div>' +
                '</div>';

            _openModal({
                title: 'Mark Residence Vacant: ' + residence.name,
                content: modalContent,
                confirmText: 'Mark Vacant',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var year = parseInt(document.getElementById('vacantYear').value);
                    var reason = document.getElementById('vacantReason').value;

                    if (isNaN(year) || year < 1) {
                        _showToast('Please enter a valid year', 'error');
                        return false;
                    }

                    var result = _markResidenceVacant(residenceId, reason, year);

                    if (result && result.success) {
                        _showToast('Residence "' + residence.name + '" marked vacant (' + reason + ')', 'success');
                        _closeTopModal();
                        _processingVacancyModal = false;
                        if (onSuccess) {
                            onSuccess();
                        }
                    } else {
                        _showToast(result ? result.reason : 'Failed to mark vacant', 'error');
                    }
                    return true;
                },
                onCancel: function() {
                    _processingVacancyModal = false;
                }
            });

        } catch (e) {
            _processingVacancyModal = false;
            _showToast('Error opening mark vacant modal', 'error');
        }
    }

    // =========================================================================
    // 6. RESIDENCE VACANCY DETAILS MODAL
    // =========================================================================

    function openResidenceVacancyDetailsModal(residenceId) {
        if (_processingVacancyModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingVacancyModal = true;

        try {
            var residence = _getResidenceById(residenceId);
            if (!residence) {
                _showToast('Residence not found', 'error');
                _processingVacancyModal = false;
                return;
            }

            var details = _getResidenceVacancyDetails(residenceId);
            if (!details) {
                _showToast('Could not get vacancy details', 'error');
                _processingVacancyModal = false;
                return;
            }

            var currentYear = _getCurrentYear();
            var vacantDuration = details.vacantYear ? currentYear - details.vacantYear : 0;

            // Build vacancy history HTML
            var historyHtml = '';
            if (details.vacancyHistory && details.vacancyHistory.length > 0) {
                historyHtml =
                    '<div style="margin-top: 12px; border-top: 1px solid var(--border); padding-top: 12px;">' +
                    '<div style="font-size: 0.6rem; color: var(--accent); margin-bottom: 6px;">Vacancy History</div>';
                for (var i = 0; i < details.vacancyHistory.length; i++) {
                    var v = details.vacancyHistory[i];
                    var endedText = v.endedVacantYear ? 'Ended: ' + v.endedVacantYear : 'Ongoing';
                    var endedByText = v.endedByHouseholdName ? ' · Assigned to: ' + _escapeHtml(v.endedByHouseholdName) : '';
                    historyHtml +=
                        '<div style="font-size: 0.55rem; color: var(--dim); padding: 4px 0; border-bottom: 1px solid var(--border-light);">' +
                        'Started: ' + v.startedVacantYear + ' · ' + endedText + endedByText +
                        (v.reason ? ' · Reason: ' + _escapeHtml(v.reason) : '') +
                        '</div>';
                }
                historyHtml += '</div>';
            }

            var modalContent =
                '<div style="margin-bottom: 16px; padding: 12px; background: var(--bg2); border-radius: 8px;">' +
                '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">' +
                '<div><strong>' + _escapeHtml(residence.name) + '</strong>' +
                '<span style="font-size: 0.6rem; color: var(--dim); margin-left: 8px;">' + _escapeHtml(residence.typeName || residence.typeId || 'Unknown') + '</span></div>' +
                '<div style="font-size: 0.65rem; color: var(--warn);">Vacant</div></div>' +
                '<div style="font-size: 0.6rem; color: var(--dim); margin-top: 4px;">' +
                'Vacant for ' + vacantDuration + ' year' + (vacantDuration !== 1 ? 's' : '') +
                (details.vacantReason ? ' · Reason: ' + _escapeHtml(details.vacantReason) : '') +
                '</div>' +
                (details.previousHousehold ? '<div style="font-size: 0.6rem; color: var(--dim); margin-top: 4px;">Previous Household: ' + _escapeHtml(details.previousHousehold) + '</div>' : '') +
                '</div>' +
                '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;">' +
                '<div style="background: var(--bg3); padding: 8px 12px; border-radius: 6px;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Value</div>' +
                '<div style="font-size: 0.8rem;">' + (residence.estimatedValue || 0).toLocaleString() + ' gold</div></div>' +
                '<div style="background: var(--bg3); padding: 8px 12px; border-radius: 6px;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Condition</div>' +
                '<div style="font-size: 0.8rem;">' + _escapeHtml(residence.condition || 'good') + '</div></div>' +
                '<div style="background: var(--bg3); padding: 8px 12px; border-radius: 6px;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Built</div>' +
                '<div style="font-size: 0.8rem;">' + (residence.builtYear || 'Unknown') + '</div></div>' +
                '<div style="background: var(--bg3); padding: 8px 12px; border-radius: 6px;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Location</div>' +
                '<div style="font-size: 0.8rem;">' + _escapeHtml(residence.locationName || 'Unknown') + '</div></div>' +
                '</div>' +
                historyHtml +
                '<div style="margin-top: 16px; display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; border-top: 1px solid var(--border); padding-top: 16px;">' +
                '<button id="vacancyAssignBtn" class="btn primary" style="background: var(--accent); border: none; color: white; padding: 6px 14px; border-radius: 6px; cursor: pointer;">Assign Household</button>' +
                '<button id="vacancyFindHeirsBtn" class="btn" style="background: var(--accent-dim); border: 1px solid var(--accent); padding: 6px 14px; border-radius: 6px; cursor: pointer;">Find Heirs</button>' +
                '<button id="vacancyViewResidenceBtn" class="btn" style="background: var(--bg3); border: 1px solid var(--border); padding: 6px 14px; border-radius: 6px; cursor: pointer;">View Details</button>' +
                '<button id="vacancyCloseBtn" class="btn" style="background: var(--bg3); border: 1px solid var(--border); padding: 6px 14px; border-radius: 6px; cursor: pointer;">Close</button>' +
                '</div>';

            _openModal({
                title: 'Vacancy Details: ' + residence.name,
                content: modalContent,
                confirmText: '',
                cancelText: '',
                onConfirm: function() {
                    _closeTopModal();
                    _processingVacancyModal = false;
                }
            });

            setTimeout(function() {
                var assignBtn = document.getElementById('vacancyAssignBtn');
                if (assignBtn) {
                    assignBtn.onclick = function() {
                        _closeTopModal();
                        _processingVacancyModal = false;
                        if (typeof window.openAssignResidenceToHouseholdModal === 'function') {
                            window.openAssignResidenceToHouseholdModal(
                                null,
                                function(result) {
                                    if (result && result.success) {
                                        _showToast('Household assigned to ' + residence.name, 'success');
                                    }
                                },
                                { preselectedResidenceId: residenceId }
                            );
                        } else {
                            _showToast('Assign function not available', 'error');
                        }
                    };
                }

                var heirsBtn = document.getElementById('vacancyFindHeirsBtn');
                if (heirsBtn) {
                    heirsBtn.onclick = function() {
                        _closeTopModal();
                        _processingVacancyModal = false;
                        if (typeof window.openResidenceHeirFinderModal === 'function') {
                            window.openResidenceHeirFinderModal(residenceId);
                        } else {
                            _showToast('Heir finder not available', 'error');
                        }
                    };
                }

                var viewBtn = document.getElementById('vacancyViewResidenceBtn');
                if (viewBtn) {
                    viewBtn.onclick = function() {
                        _closeTopModal();
                        _processingVacancyModal = false;
                        if (typeof window.openResidenceDetailsModal === 'function') {
                            window.openResidenceDetailsModal(residenceId);
                        } else {
                            _showToast('View residence not available', 'error');
                        }
                    };
                }

                var closeBtn = document.getElementById('vacancyCloseBtn');
                if (closeBtn) {
                    closeBtn.onclick = function() {
                        _closeTopModal();
                        _processingVacancyModal = false;
                    };
                }
            }, 100);

        } catch (e) {
            _processingVacancyModal = false;
            _showToast('Error opening vacancy details', 'error');
        }
    }

    // =========================================================================
    // 7. ASSIGN RESIDENCE TO HOUSEHOLD MODAL
    // =========================================================================

    function openAssignResidenceToHouseholdModal(householdId, onSuccess, options) {
        if (_processingVacancyModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingVacancyModal = true;

        try {
            options = options || {};
            var preselectedResidenceId = options.preselectedResidenceId || null;
            var locationId = options.locationId || null;
            var currentYear = _getCurrentYear();

            var targetHousehold = householdId ? _getHousehold(householdId) : null;

            // Get vacant residences and units
            var vacantResidences = [];
            if (preselectedResidenceId) {
                var res = _getResidenceById(preselectedResidenceId);
                if (res && res.isVacant && !res.isDemolished) {
                    vacantResidences = [res];
                } else if (res) {
                    _showToast('Selected residence is not vacant or is demolished', 'error');
                    _processingVacancyModal = false;
                    if (onSuccess) onSuccess(null);
                    return;
                }
            } else if (locationId) {
                vacantResidences = _getVacantResidences(locationId);
                vacantResidences = vacantResidences.filter(function(r) { return !r.isDemolished; });
            } else {
                vacantResidences = _getVacantResidences();
                vacantResidences = vacantResidences.filter(function(r) { return !r.isDemolished; });
            }

            var vacantUnits = [];
            var allResidences = _getResidences();
            for (var i = 0; i < allResidences.length; i++) {
                var r = allResidences[i];
                if (r.isDemolished) continue;
                if (locationId && r.locationId !== locationId) continue;
                if (r.isVacant) continue;
                if (r.units && r.units.length > 0) {
                    for (var j = 0; j < r.units.length; j++) {
                        if (r.units[j].isVacant && !r.units[j].isDemolished) {
                            vacantUnits.push({
                                residence: r,
                                unit: r.units[j]
                            });
                        }
                    }
                }
            }

            if (vacantResidences.length === 0 && vacantUnits.length === 0) {
                _showToast('No vacant residences or units available', 'error');
                _processingVacancyModal = false;
                if (onSuccess) onSuccess(null);
                return;
            }

            // Build residence options
            var residenceOptions = '';

            if (vacantResidences.length > 0) {
                residenceOptions += '<optgroup label="Whole Residences">';
                for (var i = 0; i < vacantResidences.length; i++) {
                    var r = vacantResidences[i];
                    var selected = (preselectedResidenceId && r.id === preselectedResidenceId) ? 'selected' : '';
                    var locationName = r.locationName || 'Unknown';
                    var vacantText = r.vacantYear ? ' (Vacant since ' + r.vacantYear + ')' : '';
                    var typeDisplay = r.typeName || r.typeId || 'Unknown';
                    residenceOptions += '<option value="res_' + r.id + '" ' + selected + '>' +
                        _escapeHtml(r.name) + ' (' + _escapeHtml(locationName) + ')' + vacantText +
                        (r.isMultiUnit ? ' - Multi-unit' : '') +
                        ' [' + _escapeHtml(typeDisplay) + ']' +
                        '</option>';
                }
                residenceOptions += '</optgroup>';
            }

            if (vacantUnits.length > 0) {
                residenceOptions += '<optgroup label="Vacant Units">';
                for (var i = 0; i < vacantUnits.length; i++) {
                    var vu = vacantUnits[i];
                    var unitLabel = 'Unit ' + vu.unit.unitNumber + ' of ' + vu.residence.name;
                    var unitLocation = vu.residence.locationName || 'Unknown';
                    var selected = false;
                    if (preselectedResidenceId) {
                        var preselectedRes = _getResidenceById(preselectedResidenceId);
                        if (preselectedRes && preselectedRes.id === vu.residence.id) {
                            var presetUnits = _getResidenceUnits(preselectedResidenceId);
                            for (var j = 0; j < presetUnits.length; j++) {
                                if (presetUnits[j].unitNumber === vu.unit.unitNumber && presetUnits[j].isVacant) {
                                    selected = true;
                                    break;
                                }
                            }
                        }
                    }
                    var vacantText = vu.unit.vacantYear ? ' (Vacant since ' + vu.unit.vacantYear + ')' : '';
                    var typeDisplay = vu.residence.typeName || vu.residence.typeId || 'Unknown';
                    residenceOptions += '<option value="unit_' + vu.residence.id + '_' + vu.unit.unitNumber + '" ' + (selected ? 'selected' : '') + '>' +
                        _escapeHtml(unitLabel) + ' (' + _escapeHtml(unitLocation) + ')' + vacantText +
                        ' [' + _escapeHtml(typeDisplay) + ']' +
                        '</option>';
                }
                residenceOptions += '</optgroup>';
            }

            // If household is provided, show assignment directly
            if (targetHousehold) {
                var memberCount = targetHousehold.members ? targetHousehold.members.length : 0;

                var modalContent =
                    '<div style="margin-bottom: 16px; padding: 12px; background: var(--bg2); border-radius: 8px; font-size: 0.65rem;">' +
                    '<div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">' +
                    '<strong>' + _escapeHtml(targetHousehold.name) + '</strong>' +
                    '<span style="font-size: 0.55rem; color: var(--dim);">' + memberCount + ' members · Founded ' + (targetHousehold.foundedYear || 'Unknown') + '</span>' +
                    (locationId ? '<span style="font-size: 0.55rem; color: var(--accent);">Location: ' + _escapeHtml(_getPlaceById(locationId) ? _getPlaceById(locationId).displayName : 'Unknown') + '</span>' : '') +
                    '</div>' +
                    '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 4px;">Select a vacant residence or unit to assign this household</div>' +
                    '</div>' +
                    '<div class="form-group" style="margin-bottom: 12px;">' +
                    '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Select Residence or Unit</label>' +
                    '<select id="assignResidenceSelect" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;">' +
                    '<option value="">Select an option</option>' +
                    residenceOptions +
                    '</select>' +
                    '</div>' +
                    '<div class="form-group" style="margin-bottom: 12px;">' +
                    '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Assignment Year</label>' +
                    '<input type="number" id="assignYear" value="' + currentYear + '" min="1" max="' + (currentYear + 10) + '" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                    '</div>' +
                    '<div class="form-group" style="margin-bottom: 12px;">' +
                    '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Notes (optional)</label>' +
                    '<textarea id="assignNotes" rows="2" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;" placeholder="e.g., Granted by the crown, Purchased..."></textarea>' +
                    '</div>';

                _openModal({
                    title: 'Assign ' + targetHousehold.name + ' to Residence or Unit',
                    content: modalContent,
                    confirmText: 'Assign',
                    cancelText: 'Cancel',
                    onConfirm: function() {
                        var selectedOption = document.getElementById('assignResidenceSelect').value;
                        var year = parseInt(document.getElementById('assignYear').value);
                        var notes = document.getElementById('assignNotes').value;

                        if (!selectedOption) {
                            _showToast('Please select a residence or unit', 'error');
                            return false;
                        }

                        if (isNaN(year) || year < 1) {
                            _showToast('Please enter a valid year', 'error');
                            return false;
                        }

                        var result = null;

                        if (selectedOption.startsWith('unit_')) {
                            var parts = selectedOption.split('_');
                            var resId = parts[1];
                            var unitNumber = parseInt(parts[2]);

                            var residence = _getResidenceById(resId);
                            if (!residence) {
                                _showToast('Residence not found', 'error');
                                return false;
                            }

                            var unit = _getResidenceUnit(resId, unitNumber);
                            if (!unit) {
                                _showToast('Unit not found', 'error');
                                return false;
                            }

                            if (!unit.isVacant) {
                                _showToast('Unit ' + unitNumber + ' is not vacant', 'error');
                                return false;
                            }

                            if (unit.isDemolished) {
                                _showToast('Unit ' + unitNumber + ' has been demolished', 'error');
                                return false;
                            }

                            result = _assignHouseholdToUnit(resId, unitNumber, targetHousehold.id, targetHousehold.name, year, {
                                notes: notes || null,
                                reason: 'Assigned via modal'
                            });
                        } else {
                            var resId = selectedOption.replace('res_', '');
                            var residence = _getResidenceById(resId);
                            if (!residence) {
                                _showToast('Residence not found', 'error');
                                return false;
                            }

                            if (!residence.isVacant) {
                                _showToast('Residence "' + residence.name + '" is not vacant', 'error');
                                return false;
                            }

                            if (residence.isDemolished) {
                                _showToast('Residence "' + residence.name + '" has been demolished', 'error');
                                return false;
                            }

                            result = _assignHouseholdToVacantResidence(resId, targetHousehold.id, targetHousehold.name, year, {
                                renameOnAssign: false,
                                notes: notes || null,
                                reason: 'Assigned via modal'
                            });
                        }

                        if (result && result.success) {
                            var msg = targetHousehold.name + ' assigned to ';
                            if (selectedOption.startsWith('unit_')) {
                                msg += 'Unit ' + result.unitNumber + ' of "' + result.residence.name + '"';
                            } else {
                                msg += '"' + result.residence.name + '"';
                            }
                            _showToast(msg, 'success');
                            _closeTopModal();
                            _processingVacancyModal = false;
                            if (onSuccess) onSuccess(result);
                            return true;
                        } else {
                            _showToast(result ? result.reason : 'Failed to assign', 'error');
                            return false;
                        }
                    },
                    onCancel: function() {
                        _processingVacancyModal = false;
                    }
                });
                return;
            }

            // Full selector with household dropdown
            var households = _state ? _state.getAllHouseholds() : [];
            var activeHouseholds = households.filter(function(h) {
                return h.status === 'active' || !h.status || h.status === undefined;
            });

            if (activeHouseholds.length === 0) {
                _showToast('No active households available', 'error');
                _processingVacancyModal = false;
                if (onSuccess) onSuccess(null);
                return;
            }

            var householdOptions = activeHouseholds.map(function(h) {
                var selected = (targetHousehold && h.id === targetHousehold.id) ? 'selected' : '';
                var memberCount = h.members ? h.members.length : 0;
                return '<option value="' + h.id + '" ' + selected + '>' +
                    _escapeHtml(h.name) + ' (' + memberCount + ' members)</option>';
            }).join('');

            var modalContent =
                '<div style="margin-bottom: 16px; padding: 12px; background: var(--bg2); border-radius: 8px; font-size: 0.65rem;">' +
                'Assign a household to a vacant residence or unit' +
                (locationId ? ' in ' + _escapeHtml(_getPlaceById(locationId) ? _getPlaceById(locationId).displayName : 'Unknown') : '') +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Select Household</label>' +
                '<select id="assignHouseholdSelect" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;">' +
                '<option value="">Select a household</option>' +
                householdOptions +
                '</select>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Select Residence or Unit</label>' +
                '<select id="assignResidenceSelect" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;">' +
                '<option value="">Select an option</option>' +
                residenceOptions +
                '</select>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Assignment Year</label>' +
                '<input type="number" id="assignYear" value="' + currentYear + '" min="1" max="' + (currentYear + 10) + '" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Notes (optional)</label>' +
                '<textarea id="assignNotes" rows="2" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;" placeholder="e.g., Granted by the crown, Purchased..."></textarea>' +
                '</div>';

            _openModal({
                title: 'Assign Household to Residence or Unit',
                content: modalContent,
                confirmText: 'Assign',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var selectedHouseholdId = document.getElementById('assignHouseholdSelect').value;
                    var selectedOption = document.getElementById('assignResidenceSelect').value;
                    var year = parseInt(document.getElementById('assignYear').value);
                    var notes = document.getElementById('assignNotes').value;

                    if (!selectedHouseholdId) {
                        _showToast('Please select a household', 'error');
                        return false;
                    }

                    if (!selectedOption) {
                        _showToast('Please select a residence or unit', 'error');
                        return false;
                    }

                    if (isNaN(year) || year < 1) {
                        _showToast('Please enter a valid year', 'error');
                        return false;
                    }

                    var household = _getHousehold(selectedHouseholdId);
                    if (!household) {
                        _showToast('Household not found', 'error');
                        return false;
                    }

                    var result = null;

                    if (selectedOption.startsWith('unit_')) {
                        var parts = selectedOption.split('_');
                        var resId = parts[1];
                        var unitNumber = parseInt(parts[2]);

                        var residence = _getResidenceById(resId);
                        if (!residence) {
                            _showToast('Residence not found', 'error');
                            return false;
                        }

                        var unit = _getResidenceUnit(resId, unitNumber);
                        if (!unit) {
                            _showToast('Unit not found', 'error');
                            return false;
                        }

                        if (!unit.isVacant) {
                            _showToast('Unit ' + unitNumber + ' is not vacant', 'error');
                            return false;
                        }

                        if (unit.isDemolished) {
                            _showToast('Unit ' + unitNumber + ' has been demolished', 'error');
                            return false;
                        }

                        result = _assignHouseholdToUnit(resId, unitNumber, selectedHouseholdId, household.name, year, {
                            notes: notes || null,
                            reason: 'Assigned via modal'
                        });
                    } else {
                        var resId = selectedOption.replace('res_', '');
                        var residence = _getResidenceById(resId);
                        if (!residence) {
                            _showToast('Residence not found', 'error');
                            return false;
                        }

                        if (!residence.isVacant) {
                            _showToast('Residence "' + residence.name + '" is not vacant', 'error');
                            return false;
                        }

                        if (residence.isDemolished) {
                            _showToast('Residence "' + residence.name + '" has been demolished', 'error');
                            return false;
                        }

                        result = _assignHouseholdToVacantResidence(resId, selectedHouseholdId, household.name, year, {
                            renameOnAssign: false,
                            notes: notes || null,
                            reason: 'Assigned via modal'
                        });
                    }

                    if (result && result.success) {
                        var msg = household.name + ' assigned to ';
                        if (selectedOption.startsWith('unit_')) {
                            msg += 'Unit ' + result.unitNumber + ' of "' + result.residence.name + '"';
                        } else {
                            msg += '"' + result.residence.name + '"';
                        }
                        _showToast(msg, 'success');
                        _closeTopModal();
                        _processingVacancyModal = false;
                        if (onSuccess) onSuccess(result);
                        return true;
                    } else {
                        _showToast(result ? result.reason : 'Failed to assign', 'error');
                        return false;
                    }
                },
                onCancel: function() {
                    _processingVacancyModal = false;
                }
            });

        } catch (e) {
            _processingVacancyModal = false;
            _showToast('Error opening assign residence modal', 'error');
        }
    }

    // =========================================================================
    // 8. REHABILITATE RESIDENCE MODAL
    // =========================================================================

    function openRehabilitateResidenceModal(residenceId, onSuccess) {
        if (_processingVacancyModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingVacancyModal = true;

        try {
            var residence = _getResidenceById(residenceId);
            if (!residence) {
                _showToast('Residence not found', 'error');
                _processingVacancyModal = false;
                return;
            }

            if (residence.isDemolished) {
                _showToast('Residence has been demolished', 'error');
                _processingVacancyModal = false;
                return;
            }

            var conditions = _getAllResidenceConditions();
            var currentYear = _getCurrentYear();
            var currentCost = _calculateRepairCost(residence, 'good');

            var conditionOptions = conditions.map(function(c) {
                var label = c.name;
                var modifier = c.modifier ? ' (' + (c.modifier * 100) + '% value)' : '';
                return '<option value="' + c.id + '" ' + (c.id === 'good' ? 'selected' : '') + '>' + _escapeHtml(c.name) + modifier + '</option>';
            }).join('');

            var modalContent =
                '<div style="margin-bottom: 16px;">' +
                '<div style="background: var(--bg3); border-radius: 6px; padding: 12px; margin-bottom: 12px;">' +
                '<div style="font-size: 0.7rem;"><strong>' + _escapeHtml(residence.name) + '</strong></div>' +
                '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px 12px; margin-top: 8px; font-size: 0.6rem;">' +
                '<div><span style="color: var(--dim);">Current Condition:</span> ' + _escapeHtml(residence.condition || 'good') + '</div>' +
                '<div><span style="color: var(--dim);">Estimated Value:</span> ' + (residence.estimatedValue || 0).toLocaleString() + ' gold</div>' +
                '<div><span style="color: var(--dim);">Last Renovated:</span> ' + (residence.lastRenovated || 'Never') + '</div>' +
                '</div>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Target Condition</label>' +
                '<select id="rehabTargetCondition" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;">' +
                conditionOptions +
                '</select>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Year of Renovation</label>' +
                '<input type="number" id="rehabYear" value="' + currentYear + '" min="1" max="' + (currentYear + 5) + '" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '</div>' +
                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem;">' +
                'Estimated cost: <strong id="rehabCostDisplay">' + currentCost + '</strong> gold' +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Rehabilitate Residence: ' + residence.name,
                content: modalContent,
                confirmText: 'Rehabilitate',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var targetCondition = document.getElementById('rehabTargetCondition').value;
                    var year = parseInt(document.getElementById('rehabYear').value);

                    if (isNaN(year) || year < 1) {
                        _showToast('Please enter a valid year', 'error');
                        return false;
                    }

                    var result = _rehabilitateResidence(residenceId, targetCondition, year);

                    if (result && result.success) {
                        _showToast('Residence rehabilitated from "' + result.oldCondition + '" to "' + result.newCondition + '" (' + year + ')', 'success');
                        _closeTopModal();
                        _processingVacancyModal = false;
                        if (onSuccess) {
                            onSuccess();
                        }
                    } else {
                        _showToast(result ? result.reason : 'Failed to rehabilitate residence', 'error');
                    }
                    return true;
                },
                onCancel: function() {
                    _processingVacancyModal = false;
                }
            });

            setTimeout(function() {
                var targetSelect = document.getElementById('rehabTargetCondition');
                var costDisplay = document.getElementById('rehabCostDisplay');

                if (targetSelect) {
                    targetSelect.onchange = function() {
                        var cost = _calculateRepairCost(residence, targetSelect.value);
                        if (costDisplay) {
                            costDisplay.textContent = cost;
                        }
                    };
                }
            }, 100);

        } catch (e) {
            _processingVacancyModal = false;
            _showToast('Error opening rehabilitate modal', 'error');
        }
    }

    // =========================================================================
    // 9. DEMOLISH RESIDENCE MODAL
    // =========================================================================

    function openDemolishResidenceModal(residenceId, onSuccess) {
        if (_processingVacancyModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingVacancyModal = true;

        try {
            var residence = _getResidenceById(residenceId);
            if (!residence) {
                _showToast('Residence not found', 'error');
                _processingVacancyModal = false;
                return;
            }

            if (residence.isDemolished) {
                _showToast('Residence has already been demolished', 'warning');
                _processingVacancyModal = false;
                if (onSuccess) {
                    onSuccess();
                }
                return;
            }

            var unitStats = _getUnitStats(residenceId);
            if (unitStats.occupied > 0) {
                _showToast('Cannot demolish residence with occupied units. Vacate all units first.', 'error');
                _processingVacancyModal = false;
                return;
            }

            var currentYear = _getCurrentYear();

            var modalContent =
                '<div style="margin-bottom: 16px;">' +
                '<div style="background: rgba(200, 68, 68, 0.15); border: 1px solid var(--warn); border-radius: 8px; padding: 12px; margin-bottom: 16px;">' +
                '<strong>Demolish Residence: ' + _escapeHtml(residence.name) + '</strong>' +
                '<div style="margin-top: 8px; font-size: 0.65rem;">' +
                'Demolishing this residence will destroy the building but keep its history.' +
                ' The residence will be marked as "Demolished" and cannot be assigned to any household.' +
                '</div>' +
                '<div style="margin-top: 8px; font-size: 0.6rem; color: var(--warn);">' +
                'Warning: This action cannot be undone.' +
                '</div>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Year of Demolition</label>' +
                '<input type="number" id="demolishYear" value="' + currentYear + '" min="1" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Reason for Demolition</label>' +
                '<select id="demolishReason" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;">' +
                '<option value="condemned">Condemned / Unsafe</option>' +
                '<option value="fire">Destroyed by fire</option>' +
                '<option value="war">Destroyed in war</option>' +
                '<option value="renovation">Renovation / Rebuilding</option>' +
                '<option value="decay">Decay / Abandonment</option>' +
                '<option value="manual">Manual decision</option>' +
                '</select>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Notes (optional)</label>' +
                '<textarea id="demolishNotes" rows="2" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;" placeholder="Additional details..."></textarea>' +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Demolish Residence: ' + residence.name,
                content: modalContent,
                confirmText: 'Demolish',
                cancelText: 'Cancel',
                confirmStyle: 'danger',
                onConfirm: function() {
                    var year = parseInt(document.getElementById('demolishYear').value);
                    var reason = document.getElementById('demolishReason').value;
                    var notes = document.getElementById('demolishNotes').value;

                    if (isNaN(year) || year < 1) {
                        _showToast('Please enter a valid year', 'error');
                        return false;
                    }

                    var updates = {
                        isDemolished: true,
                        demolishedYear: year,
                        demolishedReason: reason,
                        demolishedNotes: notes || null,
                        isVacant: true,
                        vacantYear: year,
                        vacantReason: 'Demolished: ' + reason,
                        householdId: null,
                        householdName: null,
                        status: 'demolished'
                    };

                    var result = _updateResidence(residenceId, updates);

                    if (result) {
                        _residence.addResidenceTimelineEvent(residenceId, {
                            year: year,
                            type: 'demolished',
                            details: 'Demolished: ' + reason + (notes ? ' (' + notes + ')' : ''),
                            reason: reason,
                            notes: notes
                        });

                        if (residence.householdId && _state && typeof _state.updateHousehold === 'function') {
                            _state.updateHousehold(residence.householdId, {
                                residenceId: null,
                                residenceName: null,
                                residenceType: null,
                                associatedYear: null,
                                residenceUnitNumber: null,
                                residenceNotes: null
                            }, { recordHistory: false });
                        }

                        _showToast('Residence "' + residence.name + '" demolished in ' + year, 'info');
                        _closeTopModal();
                        _processingVacancyModal = false;
                        if (onSuccess) {
                            onSuccess();
                        }
                    } else {
                        _showToast('Failed to demolish residence', 'error');
                    }
                    return true;
                },
                onCancel: function() {
                    _processingVacancyModal = false;
                }
            });

        } catch (e) {
            _processingVacancyModal = false;
            _showToast('Error opening demolish modal', 'error');
        }
    }

    // =========================================================================
    // 10. RESIDENCE HEIR FINDER MODAL
    // =========================================================================

    function openResidenceHeirFinderModal(residenceId) {
        if (_processingVacancyModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingVacancyModal = true;

        try {
            var residence = _getResidenceById(residenceId);
            if (!residence) {
                _showToast('Residence not found', 'error');
                _processingVacancyModal = false;
                return;
            }

            if (!residence.isVacant) {
                _showToast('Residence is not vacant. Heirs are only relevant for vacant properties.', 'warning');
                _processingVacancyModal = false;
                return;
            }

            if (residence.isDemolished) {
                _showToast('Residence has been demolished. Cannot find heirs for demolished property.', 'error');
                _processingVacancyModal = false;
                return;
            }

            // Try to find heirs using the vacancy module's function if available
            if (typeof window.findResidenceHeirs === 'function') {
                var result = window.findResidenceHeirs(residenceId);

                if (!result || !result.success) {
                    _showToast(result ? result.reason : 'Could not find heirs', 'error');
                    _processingVacancyModal = false;
                    return;
                }

                _showHeirResultsModal(residence, result);
                return;
            }

            // Fallback: show basic vacancy info
            var details = _getResidenceVacancyDetails(residenceId);
            var modalContent =
                '<div style="margin-bottom: 16px;">' +
                '<div style="background: var(--bg3); border-radius: 6px; padding: 12px; margin-bottom: 12px;">' +
                '<div style="font-size: 0.7rem;"><strong>' + _escapeHtml(residence.name) + '</strong></div>' +
                '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 4px;">Vacant since ' + (details.vacantYear || 'Unknown') + '</div>' +
                (details.previousHousehold ? '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 2px;">Previous Household: ' + _escapeHtml(details.previousHousehold) + '</div>' : '') +
                '</div>' +
                '<div style="font-size: 0.6rem; color: var(--dim); text-align: center; padding: 20px;">' +
                'Heir finder functionality is available when the vacancy module is loaded.' +
                '</div>' +
                '<div style="margin-top: 12px; text-align: center;">' +
                '<button id="heirAssignBtn" class="btn primary" style="background: var(--accent); border: none; color: white; padding: 6px 14px; border-radius: 6px; cursor: pointer;">Assign Household</button>' +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Heirs for ' + residence.name,
                content: modalContent,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {
                    _closeTopModal();
                    _processingVacancyModal = false;
                }
            });

            setTimeout(function() {
                var assignBtn = document.getElementById('heirAssignBtn');
                if (assignBtn) {
                    assignBtn.onclick = function() {
                        _closeTopModal();
                        _processingVacancyModal = false;
                        if (typeof window.openAssignResidenceToHouseholdModal === 'function') {
                            window.openAssignResidenceToHouseholdModal(
                                null,
                                function(result) {
                                    if (result && result.success) {
                                        _showToast('Household assigned to ' + residence.name, 'success');
                                    }
                                },
                                { preselectedResidenceId: residenceId }
                            );
                        } else {
                            _showToast('Assign function not available', 'error');
                        }
                    };
                }
            }, 100);

        } catch (e) {
            _processingVacancyModal = false;
            _showToast('Error opening heir finder', 'error');
        }
    }

    // =========================================================================
    // 11. HEIR RESULTS MODAL (Helper)
    // =========================================================================

    function _showHeirResultsModal(residence, result) {
        var heirs = result.heirs || [];

        var heirsHtml = '';
        if (heirs.length === 0) {
            heirsHtml = '<div style="text-align: center; padding: 40px; color: var(--dim);">No direct heirs found for this residence.</div>';
        } else {
            heirsHtml = '<div style="max-height: 400px; overflow-y: auto;">';

            for (var i = 0; i < heirs.length; i++) {
                var h = heirs[i];
                var char = h.character;
                var statusText = h.hasResidence ? 'Has Residence' : (h.hasHousehold ? 'Has Household' : 'Homeless');
                var wasInHousehold = h.wasInPreviousHousehold ? 'Was in this household' : '';
                var leftInfo = h.leftYear ? 'Left: ' + h.leftYear + (h.leftReason ? ' (' + h.leftReason + ')' : '') : '';

                var householdName = h.householdName || 'None';

                var residenceNames = '';
                if (h.residenceList && h.residenceList.length > 0) {
                    residenceNames = h.residenceList.map(function(r) { return r.name; }).join(', ');
                }

                heirsHtml +=
                    '<div style="background: ' + (h.wasInPreviousHousehold ? 'rgba(106,158,207,0.1)' : 'var(--bg3)') + '; border: 1px solid ' + (h.wasInPreviousHousehold ? 'var(--accent)' : 'var(--border)') + '; border-radius: 8px; padding: 10px 12px; margin-bottom: 8px;">' +
                    '<div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 8px;">' +
                    '<div>' +
                    '<div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">' +
                    '<strong>' + _escapeHtml(char.name) + ' ' + _escapeHtml(char.surname || '') + '</strong>' +
                    '<span style="font-size: 0.55rem; color: var(--dim);">' + h.age + ' years</span>' +
                    '<span style="font-size: 0.55rem; color: var(--accent);">' + h.relationship + '</span>' +
                    (h.wasInPreviousHousehold ? '<span style="font-size: 0.5rem; background: var(--accent-dim); padding: 2px 6px; border-radius: 10px;">Previous Household</span>' : '') +
                    '</div>' +
                    '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 4px;">' +
                    'Household: ' + _escapeHtml(householdName) +
                    (leftInfo ? ' · ' + leftInfo : '') +
                    '</div>' +
                    (residenceNames ? '<div style="font-size: 0.5rem; color: var(--accent); margin-top: 2px;">Residences: ' + _escapeHtml(residenceNames) + '</div>' : '') +
                    '</div>' +
                    '<div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">' +
                    '<span style="font-size: 0.55rem;">' + statusText + '</span>' +
                    (!h.hasResidence ?
                        '<button class="assign-heir-btn btn small" data-char-id="' + char.id + '" data-char-name="' + _escapeHtml(char.name) + '" style="padding: 4px 8px; font-size: 0.5rem; background: var(--accent-dim); border: 1px solid var(--accent); border-radius: 4px; cursor: pointer;">Assign</button>' :
                        ''
                    ) +
                    '<button class="view-heir-btn btn small" data-char-id="' + char.id + '" style="padding: 4px 8px; font-size: 0.5rem; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">View</button>' +
                    '</div>' +
                    '</div>' +
                    '</div>';
            }
            heirsHtml += '</div>';
        }

        var modalContent =
            '<div style="margin-bottom: 16px; padding: 12px; background: var(--bg2); border-radius: 8px;">' +
            '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">' +
            '<div><strong>' + _escapeHtml(residence.name) + '</strong></div>' +
            '<div style="font-size: 0.6rem; color: var(--dim);">Vacant since ' + (residence.vacantYear || 'Unknown') + '</div>' +
            '</div>' +
            '<div style="font-size: 0.65rem; color: var(--dim); margin-top: 4px;">' +
            '<strong>Previous Household:</strong> ' + _escapeHtml(result.previousHousehold.name) + ' | ' +
            '<strong>Last Deceased:</strong> ' + _escapeHtml(result.lastDeceased.character.name) + ' (' + result.lastDeathYear + ')' +
            '</div>' +
            '<div style="font-size: 0.55rem; color: var(--accent); margin-top: 6px;">' +
            result.totalHeirs + ' heirs found · ' + result.withResidence + ' with residence · ' + result.withHousehold + ' with household · ' + result.homeless + ' homeless' +
            '</div>' +
            '</div>' +
            heirsHtml +
            '<div style="margin-top: 12px; padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem;">' +
            'Heirs are descendants of the last deceased member of the previous household. Click "Assign" to assign a homeless heir to this residence.' +
            '</div>';

        _openModal({
            title: 'Heirs for ' + residence.name,
            content: modalContent,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function() {
                _closeTopModal();
                _processingVacancyModal = false;
            }
        });

        // Attach event handlers
        setTimeout(function() {
            // Assign heir buttons
            var assignBtns = document.querySelectorAll('.assign-heir-btn');
            assignBtns.forEach(function(btn) {
                var newBtn = btn.cloneNode(true);
                if (btn.parentNode) {
                    btn.parentNode.replaceChild(newBtn, btn);
                }

                newBtn.onclick = function(e) {
                    e.stopPropagation();
                    var charId = this.dataset.charId;
                    var charName = this.dataset.charName;
                    var character = _getCharacterById(charId);

                    if (!character) {
                        _showToast('Character not found', 'error');
                        return;
                    }

                    var household = _state ? _state.getCharacterHousehold(charId) : null;

                    if (!household) {
                        _showToast(charName + ' has no household. Create one first?', 'warning');
                        if (confirm('Create a new household for ' + charName + '?')) {
                            if (typeof window.openNewHouseholdModal === 'function') {
                                _closeTopModal();
                                window.openNewHouseholdModal(function(newHouseholdId) {
                                    if (newHouseholdId) {
                                        var newHousehold = _getHousehold(newHouseholdId);
                                        if (newHousehold) {
                                            _commands.addMember(newHousehold.id, charId, 'family', {
                                                role: 'Head of Household',
                                                joinedYear: _getCurrentYear(),
                                                isHead: true
                                            });
                                            _state.updateHousehold(newHouseholdId, {
                                                residenceId: residence.id,
                                                residenceName: residence.name,
                                                associatedYear: _getCurrentYear()
                                            }, { recordHistory: false });
                                            _showToast(charName + ' assigned to ' + residence.name, 'success');
                                            _closeTopModal();
                                            _processingVacancyModal = false;
                                        }
                                    }
                                }, {
                                    suggestedHeadId: charId,
                                    suggestedName: charName + ' Household',
                                    suggestedFoundedYear: _getCurrentYear()
                                });
                            }
                        }
                        return;
                    }

                    var result = _assignHouseholdToVacantResidence(
                        residence.id,
                        household.id,
                        household.name,
                        _getCurrentYear(),
                        { notes: 'Assigned via heir finder', reason: 'heir_assignment' }
                    );

                    if (result && result.success) {
                        _showToast(household.name + ' assigned to "' + residence.name + '"', 'success');
                        _closeTopModal();
                        _processingVacancyModal = false;
                    } else {
                        _showToast(result ? result.reason : 'Failed to assign', 'error');
                    }
                };
            });

            // View heir buttons
            var viewBtns = document.querySelectorAll('.view-heir-btn');
            viewBtns.forEach(function(btn) {
                var newBtn = btn.cloneNode(true);
                if (btn.parentNode) {
                    btn.parentNode.replaceChild(newBtn, btn);
                }

                newBtn.onclick = function(e) {
                    e.stopPropagation();
                    var charId = this.dataset.charId;
                    if (charId && typeof window.openCharacterModal === 'function') {
                        _closeTopModal();
                        window.openCharacterModal(charId);
                    } else {
                        _showToast('Character details not available', 'info');
                    }
                };
            });
        }, 100);
    }

    // =========================================================================
    // 12. UNIT MODALS
    // =========================================================================

    function openAddUnitModal(residenceId, onSuccess) {
        if (_processingVacancyModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingVacancyModal = true;

        try {
            var residence = _getResidenceById(residenceId);
            if (!residence) {
                _showToast('Residence not found', 'error');
                _processingVacancyModal = false;
                return;
            }

            if (!residence.isMultiUnit) {
                _showToast('Cannot add units to a non-multi-unit residence', 'error');
                _processingVacancyModal = false;
                return;
            }

            var currentUnits = residence.units || [];
            var maxUnits = residence.maxUnits || 20;
            var unitCount = currentUnits.length;

            if (unitCount >= maxUnits) {
                _showToast('Maximum units reached (' + maxUnits + ')', 'error');
                _processingVacancyModal = false;
                return;
            }

            var modalContent =
                '<div style="margin-bottom: 16px;">' +
                '<div style="background: var(--bg3); border-radius: 6px; padding: 8px 12px; margin-bottom: 12px; font-size: 0.6rem; color: var(--dim);">' +
                'Adding a new unit to <strong>' + _escapeHtml(residence.name) + '</strong>' +
                '<div style="margin-top: 4px;">' + unitCount + ' of ' + maxUnits + ' units currently exist</div>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Unit Number (auto-assigned if not specified)</label>' +
                '<input type="number" id="unitNumberInput" placeholder="Leave blank for auto-assign" min="1" max="' + maxUnits + '" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '<small style="font-size: 0.55rem; color: var(--dim);">Numbers must be unique within the residence</small>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Notes (optional)</label>' +
                '<textarea id="unitNotes" rows="2" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;" placeholder="e.g., Ground floor unit, South wing..."></textarea>' +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Add Unit to ' + residence.name,
                content: modalContent,
                confirmText: 'Add Unit',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var unitNumberInput = document.getElementById('unitNumberInput').value;
                    var notes = document.getElementById('unitNotes').value;

                    var options = {
                        notes: notes || null
                    };

                    if (unitNumberInput) {
                        var num = parseInt(unitNumberInput);
                        if (!isNaN(num) && num > 0 && num <= maxUnits) {
                            options.unitNumber = num;
                        }
                    }

                    var result = _addResidenceUnit(residenceId, options);

                    if (result && result.success) {
                        _showToast('Unit ' + result.unitNumber + ' added to ' + residence.name, 'success');
                        _closeTopModal();
                        _processingVacancyModal = false;
                        if (onSuccess) {
                            onSuccess(result);
                        }
                    } else {
                        _showToast(result ? result.reason : 'Failed to add unit', 'error');
                    }
                    return true;
                },
                onCancel: function() {
                    _processingVacancyModal = false;
                }
            });

        } catch (e) {
            _processingVacancyModal = false;
            _showToast('Error opening add unit modal', 'error');
        }
    }

    function openRemoveUnitModal(residenceId, unitNumber, onSuccess) {
        if (_processingVacancyModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingVacancyModal = true;

        try {
            var residence = _getResidenceById(residenceId);
            if (!residence) {
                _showToast('Residence not found', 'error');
                _processingVacancyModal = false;
                return;
            }

            var unit = _getResidenceUnit(residenceId, unitNumber);
            if (!unit) {
                _showToast('Unit ' + unitNumber + ' not found', 'error');
                _processingVacancyModal = false;
                return;
            }

            var isOccupied = !unit.isVacant && !unit.isDemolished;
            var householdName = unit.householdName || 'Unknown';

            var modalContent =
                '<div style="margin-bottom: 16px;">' +
                '<div style="background: rgba(200, 68, 68, 0.15); border: 1px solid var(--warn); border-radius: 8px; padding: 12px; margin-bottom: 16px;">' +
                '<strong>Remove Unit ' + unitNumber + ' from ' + _escapeHtml(residence.name) + '</strong>' +
                (isOccupied ? '<div style="margin-top: 8px; color: #c87040;">Warning: This unit is currently occupied by ' + _escapeHtml(householdName) + '.</div>' : '') +
                '<div style="margin-top: 4px; font-size: 0.65rem;">' + (isOccupied ? 'The household will need to be reassigned.' : 'The unit will be permanently removed.') + '</div>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Reason (optional)</label>' +
                '<input type="text" id="removeUnitReason" placeholder="e.g., Renovation, Condemned..." style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '</div>' +
                '<div style="font-size: 0.55rem; color: var(--warn);">This action cannot be undone. The unit will be permanently removed from the residence.</div>' +
                '</div>';

            _openModal({
                title: 'Remove Unit ' + unitNumber,
                content: modalContent,
                confirmText: 'Remove Unit',
                cancelText: 'Cancel',
                confirmStyle: 'danger',
                onConfirm: function() {
                    var reason = document.getElementById('removeUnitReason').value;

                    var result = _removeResidenceUnit(residenceId, unitNumber, {
                        force: true,
                        reason: reason || 'Removed'
                    });

                    if (result && result.success) {
                        _showToast('Unit ' + unitNumber + ' removed from ' + residence.name, 'success');
                        _closeTopModal();
                        _processingVacancyModal = false;
                        if (onSuccess) {
                            onSuccess(result);
                        }
                    } else {
                        _showToast(result ? result.reason : 'Failed to remove unit', 'error');
                    }
                    return true;
                },
                onCancel: function() {
                    _processingVacancyModal = false;
                }
            });

        } catch (e) {
            _processingVacancyModal = false;
            _showToast('Error opening remove unit modal', 'error');
        }
    }

    function openAssignUnitModal(residenceId, unitNumber, onSuccess) {
        if (_processingVacancyModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingVacancyModal = true;

        try {
            var residence = _getResidenceById(residenceId);
            if (!residence) {
                _showToast('Residence not found', 'error');
                _processingVacancyModal = false;
                return;
            }

            var unit = _getResidenceUnit(residenceId, unitNumber);
            if (!unit) {
                _showToast('Unit ' + unitNumber + ' not found', 'error');
                _processingVacancyModal = false;
                return;
            }

            if (!unit.isVacant) {
                _showToast('Unit ' + unitNumber + ' is already occupied', 'error');
                _processingVacancyModal = false;
                return;
            }

            if (unit.isDemolished) {
                _showToast('Unit ' + unitNumber + ' has been demolished', 'error');
                _processingVacancyModal = false;
                return;
            }

            var currentYear = _getCurrentYear();

            _openHouseholdSelector({
                title: 'Assign Household to Unit ' + unitNumber + ' of ' + residence.name,
                targetCharacterId: null,
                filterConfig: {
                    showActive: true,
                    showVacant: false,
                    showEmpty: false,
                    showDeprecated: false
                },
                onSelect: function(household) {
                    if (!household) {
                        _showToast('Selection cancelled', 'info');
                        _processingVacancyModal = false;
                        return;
                    }

                    var result = _assignHouseholdToUnit(
                        residenceId,
                        unitNumber,
                        household.id,
                        household.name,
                        currentYear,
                        {
                            notes: 'Assigned to Unit ' + unitNumber + ' via modal',
                            reason: 'unit_assignment'
                        }
                    );

                    if (result && result.success) {
                        _showToast(household.name + ' assigned to Unit ' + unitNumber + ' of ' + residence.name, 'success');
                        _closeTopModal();
                        _processingVacancyModal = false;
                        if (onSuccess) {
                            onSuccess(result);
                        }
                    } else {
                        _showToast(result ? result.reason : 'Failed to assign household', 'error');
                        _processingVacancyModal = false;
                    }
                },
                onCancel: function() {
                    _showToast('Assignment cancelled', 'info');
                    _processingVacancyModal = false;
                }
            });

        } catch (e) {
            _processingVacancyModal = false;
            _showToast('Error opening assign unit modal', 'error');
        }
    }

    function openMarkUnitVacantModal(residenceId, unitNumber, onSuccess) {
        if (_processingVacancyModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingVacancyModal = true;

        try {
            var residence = _getResidenceById(residenceId);
            if (!residence) {
                _showToast('Residence not found', 'error');
                _processingVacancyModal = false;
                return;
            }

            var unit = _getResidenceUnit(residenceId, unitNumber);
            if (!unit) {
                _showToast('Unit ' + unitNumber + ' not found', 'error');
                _processingVacancyModal = false;
                return;
            }

            if (unit.isVacant) {
                _showToast('Unit ' + unitNumber + ' is already vacant', 'info');
                _processingVacancyModal = false;
                if (onSuccess) {
                    onSuccess();
                }
                return;
            }

            if (unit.isDemolished) {
                _showToast('Unit ' + unitNumber + ' has been demolished', 'error');
                _processingVacancyModal = false;
                return;
            }

            var currentYear = _getCurrentYear();
            var householdName = unit.householdName || 'Unknown';

            var modalContent =
                '<div style="margin-bottom: 16px;">' +
                '<div style="background: rgba(200, 112, 64, 0.15); border: 1px solid var(--warn); border-radius: 8px; padding: 12px; margin-bottom: 16px;">' +
                '<div style="font-size: 0.7rem;"><strong>Unit ' + unitNumber + ' of ' + _escapeHtml(residence.name) + '</strong></div>' +
                '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 4px;">Current Household: ' + _escapeHtml(householdName) + '</div>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Vacancy Year</label>' +
                '<input type="number" id="unitVacantYear" value="' + currentYear + '" min="1" max="' + (currentYear + 5) + '" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Reason</label>' +
                '<select id="unitVacantReason" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;">' +
                '<option value="household_moved">Household moved out</option>' +
                '<option value="household_disassociated">Household disassociated</option>' +
                '<option value="manual">Manual (admin)</option>' +
                '</select>' +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Mark Unit ' + unitNumber + ' Vacant',
                content: modalContent,
                confirmText: 'Mark Vacant',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var year = parseInt(document.getElementById('unitVacantYear').value);
                    var reason = document.getElementById('unitVacantReason').value;

                    if (isNaN(year) || year < 1) {
                        _showToast('Please enter a valid year', 'error');
                        return false;
                    }

                    var result = _markUnitVacant(residenceId, unitNumber, reason, year);

                    if (result && result.success) {
                        _showToast('Unit ' + unitNumber + ' marked vacant', 'success');
                        _closeTopModal();
                        _processingVacancyModal = false;
                        if (onSuccess) {
                            onSuccess();
                        }
                    } else {
                        _showToast(result ? result.reason : 'Failed to mark unit vacant', 'error');
                    }
                    return true;
                },
                onCancel: function() {
                    _processingVacancyModal = false;
                }
            });

        } catch (e) {
            _processingVacancyModal = false;
            _showToast('Error opening mark unit vacant modal', 'error');
        }
    }

    function openUnitDetailsModal(residenceId, unitNumber) {
        if (_processingVacancyModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingVacancyModal = true;

        try {
            var residence = _getResidenceById(residenceId);
            if (!residence) {
                _showToast('Residence not found', 'error');
                _processingVacancyModal = false;
                return;
            }

            var unit = _getResidenceUnit(residenceId, unitNumber);
            if (!unit) {
                _showToast('Unit ' + unitNumber + ' not found', 'error');
                _processingVacancyModal = false;
                return;
            }

            var currentYear = _getCurrentYear();
            var isVacant = unit.isVacant === true;
            var isDemolished = unit.isDemolished === true;
            var householdName = unit.householdName || 'Vacant';
            var assignedYear = unit.assignedYear || 'N/A';
            var vacantYear = unit.vacantYear || 'N/A';
            var vacantDuration = unit.vacantYear ? currentYear - unit.vacantYear : 0;

            var associationHistory = unit.associationHistory || [];

            var associationHtml = '';
            if (associationHistory.length > 0) {
                associationHtml =
                    '<div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border);">' +
                    '<div style="font-size: 0.6rem; color: var(--accent); margin-bottom: 6px;">Association History</div>';
                for (var i = 0; i < Math.min(associationHistory.length, 5); i++) {
                    var a = associationHistory[i];
                    var isCurrent = !a.endedYear && a.householdId === unit.householdId;
                    associationHtml +=
                        '<div style="font-size: 0.55rem; padding: 4px 0; border-bottom: 1px solid var(--border-light);">' +
                        '<span>' + _escapeHtml(a.householdName) + '</span>' +
                        (isCurrent ? ' <span style="color: var(--accent); font-size: 0.5rem;">(Current)</span>' : '') +
                        '<span style="float: right; color: var(--dim);">' + a.year + (a.endedYear ? ' - ' + a.endedYear : '') + '</span>' +
                        '</div>';
                }
                if (associationHistory.length > 5) {
                    associationHtml += '<div style="font-size: 0.5rem; color: var(--dim); text-align: center; padding-top: 4px;">... and ' + (associationHistory.length - 5) + ' more</div>';
                }
                associationHtml += '</div>';
            }

            var statusColor = isDemolished ? '#8a2020' : (isVacant ? '#c87040' : '#4a9e6a');
            var statusText = isDemolished ? 'Demolished' : (isVacant ? 'Vacant' : 'Occupied');

            var modalContent =
                '<div style="max-width: 500px;">' +
                '<div style="margin-bottom: 16px; padding: 12px; background: var(--bg2); border-radius: 8px; border-left: 3px solid ' + statusColor + ';">' +
                '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">' +
                '<div>' +
                '<div style="font-size: 1rem; font-weight: bold;">Unit ' + unitNumber + '</div>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">' + _escapeHtml(residence.name) + '</div>' +
                '</div>' +
                '<span style="background: ' + statusColor + '; padding: 4px 10px; border-radius: 12px; font-size: 0.6rem; color: white;">' + statusText + '</span>' +
                '</div>' +
                '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.6rem; margin-top: 8px;">' +
                '<div><span style="color: var(--dim);">Household:</span> ' + _escapeHtml(householdName) + '</div>' +
                '<div><span style="color: var(--dim);">Assigned:</span> ' + assignedYear + '</div>' +
                (isVacant ? '<div><span style="color: var(--dim);">Vacant since:</span> ' + vacantYear + ' (' + vacantDuration + ' years)</div>' : '') +
                (unit.notes ? '<div style="grid-column: span 2;"><span style="color: var(--dim);">Notes:</span> ' + _escapeHtml(unit.notes) + '</div>' : '') +
                '</div>' +
                '</div>' +
                associationHtml +
                '<div style="margin-top: 16px; display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; border-top: 1px solid var(--border); padding-top: 16px;">' +
                (isVacant && !isDemolished ?
                    '<button id="unitAssignBtn" class="btn primary" style="background: var(--accent); border: none; color: white; padding: 6px 14px; border-radius: 6px; cursor: pointer;">Assign Household</button>' :
                    (!isDemolished ?
                        '<button id="unitMarkVacantBtn" class="btn" style="background: var(--bg3); border: 1px solid var(--border); padding: 6px 14px; border-radius: 6px; cursor: pointer;">Mark Vacant</button>' :
                        ''
                    )
                ) +
                (!isDemolished ?
                    '<button id="unitRemoveBtn" class="btn danger" style="background: #8a3020; border: none; color: white; padding: 6px 14px; border-radius: 6px; cursor: pointer;">Remove Unit</button>' :
                    ''
                ) +
                '<button id="unitCloseBtn" class="btn" style="background: var(--bg3); border: 1px solid var(--border); padding: 6px 14px; border-radius: 6px; cursor: pointer;">Close</button>' +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Unit ' + unitNumber + ' Details',
                content: modalContent,
                confirmText: '',
                cancelText: '',
                onConfirm: function() {
                    _closeTopModal();
                    _processingVacancyModal = false;
                }
            });

            setTimeout(function() {
                var assignBtn = document.getElementById('unitAssignBtn');
                if (assignBtn) {
                    assignBtn.onclick = function() {
                        _closeTopModal();
                        openAssignUnitModal(residenceId, unitNumber, function() {
                            _processingVacancyModal = false;
                        });
                    };
                }

                var markVacantBtn = document.getElementById('unitMarkVacantBtn');
                if (markVacantBtn) {
                    markVacantBtn.onclick = function() {
                        _closeTopModal();
                        openMarkUnitVacantModal(residenceId, unitNumber, function() {
                            _processingVacancyModal = false;
                        });
                    };
                }

                var removeBtn = document.getElementById('unitRemoveBtn');
                if (removeBtn) {
                    removeBtn.onclick = function() {
                        _closeTopModal();
                        openRemoveUnitModal(residenceId, unitNumber, function() {
                            _processingVacancyModal = false;
                        });
                    };
                }

                var closeBtn = document.getElementById('unitCloseBtn');
                if (closeBtn) {
                    closeBtn.onclick = function() {
                        _closeTopModal();
                        _processingVacancyModal = false;
                    };
                }
            }, 100);

        } catch (e) {
            _processingVacancyModal = false;
            _showToast('Error opening unit details', 'error');
        }
    }

    // =========================================================================
    // 13. EXPORTS
    // =========================================================================

    window.openMarkResidenceVacantModal = openMarkResidenceVacantModal;
    window.openResidenceVacancyDetailsModal = openResidenceVacancyDetailsModal;
    window.openAssignResidenceToHouseholdModal = openAssignResidenceToHouseholdModal;
    window.openRehabilitateResidenceModal = openRehabilitateResidenceModal;
    window.openDemolishResidenceModal = openDemolishResidenceModal;
    window.openResidenceHeirFinderModal = openResidenceHeirFinderModal;
    window.openAddUnitModal = openAddUnitModal;
    window.openRemoveUnitModal = openRemoveUnitModal;
    window.openAssignUnitModal = openAssignUnitModal;
    window.openMarkUnitVacantModal = openMarkUnitVacantModal;
    window.openUnitDetailsModal = openUnitDetailsModal;

    // ES Module exports
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            openMarkResidenceVacantModal: openMarkResidenceVacantModal,
            openResidenceVacancyDetailsModal: openResidenceVacancyDetailsModal,
            openAssignResidenceToHouseholdModal: openAssignResidenceToHouseholdModal,
            openRehabilitateResidenceModal: openRehabilitateResidenceModal,
            openDemolishResidenceModal: openDemolishResidenceModal,
            openResidenceHeirFinderModal: openResidenceHeirFinderModal,
            openAddUnitModal: openAddUnitModal,
            openRemoveUnitModal: openRemoveUnitModal,
            openAssignUnitModal: openAssignUnitModal,
            openMarkUnitVacantModal: openMarkUnitVacantModal,
            openUnitDetailsModal: openUnitDetailsModal
        };
    }

})();