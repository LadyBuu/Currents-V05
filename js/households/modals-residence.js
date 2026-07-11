/**
 * =============================================================================
 * RESIDENCE MODALS (modals-residence.js)
 * =============================================================================
 * 
 * PURPOSE: UI modals for residence management (CRUD, details, units,
 *          vacancy, rehabilitation, demolition).
 * 
 * DEPENDS ON:
 *   - modals-core.js (openModal, closeTopModal, _escapeHtml, _showToast, _getIcon)
 *   - modals-char-select.js (openCharacterSelector)
 *   - modals-household-selector.js (openHouseholdSelector)
 *   - household-state.js (HouseholdState)
 *   - household-commands.js (HouseholdCommands)
 *   - residence-system.js (ResidenceSystem)
 * 
 * EXPORTS:
 *   - openNewResidenceModal()
 *   - openEditResidenceModal()
 *   - openDeleteResidenceModal()
 *   - openResidenceDetailsModal()
 *   - openRenameResidenceModal()
 *   - openResidenceNameHistoryModal()
 *   - openAssignResidenceModal()
 *   - openVacateResidenceModal()
 *   - openRehabilitateResidenceModal()
 *   - openDemolishResidenceModal()
 *   - openResidenceHeirFinderModal()
 *   - openAddUnitModal()
 *   - openRemoveUnitModal()
 *   - openAssignUnitModal()
 *   - openMarkUnitVacantModal()
 *   - openUnitDetailsModal()
 *   - openResidenceSelector()
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

    var _processingResidenceModal = false;

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

    function _getResidenceNameHistory(residenceId) {
        return _residence ? _residence.getResidenceNameHistory(residenceId) : [];
    }

    function _getResidenceCurrentNameInfo(residenceId) {
        return _residence ? _residence.getResidenceCurrentNameInfo(residenceId) : null;
    }

    function _getResidenceOriginalName(residenceId) {
        return _residence ? _residence.getResidenceOriginalName(residenceId) : 'Unknown';
    }

    function _getResidenceNameChangeCount(residenceId) {
        return _residence ? _residence.getResidenceNameChangeCount(residenceId) : 0;
    }

    function _getResidenceAssociationHistory(residenceId) {
        return _residence ? _residence.getResidenceAssociationHistory(residenceId) : [];
    }

    function _getHouseholdUnits(householdId) {
        return _residence ? _residence.getHouseholdUnits(householdId) : [];
    }

    function _getResidenceHouseholds(residenceId) {
        return _residence ? _residence.getResidenceHouseholds(residenceId) : [];
    }

    function _createResidence(name, locationId, typeId, options) {
        return _residence ? _residence.createResidence(name, locationId, typeId, options) : null;
    }

    function _updateResidence(residenceId, updates) {
        return _residence ? _residence.updateResidence(residenceId, updates) : null;
    }

    function _deleteResidence(residenceId, options) {
        return _residence ? _residence.deleteResidence(residenceId, options) : false;
    }

    function _updateResidenceNameWithHistory(residenceId, newName, options) {
        return _residence ? _residence.updateResidenceNameWithHistory(residenceId, newName, options) : null;
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

    function _getAllResidenceTypes() {
        return _residence ? _residence.getAllResidenceTypes() : {};
    }

    function _getAllResidenceConditions() {
        return _residence ? _residence.getAllResidenceConditions() : [];
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
    // 5. NEW RESIDENCE MODAL
    // =========================================================================

    function openNewResidenceModal(locationId, locationName, onSuccess) {
        if (_processingResidenceModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingResidenceModal = true;

        try {
            var currentYear = _getCurrentYear();
            var types = _getAllResidenceTypes();
            var conditions = _getAllResidenceConditions();

            // Resolve location
            var resolvedLocationId = null;
            var resolvedLocationName = 'Unknown';

            if (locationId) {
                if (typeof locationId === 'string') {
                    resolvedLocationId = locationId;
                    var place = _getPlaceById(locationId);
                    if (place) {
                        resolvedLocationName = place.displayName || 'Unknown';
                    } else if (locationName) {
                        resolvedLocationName = locationName;
                    }
                } else if (typeof locationId === 'object' && locationId.id) {
                    resolvedLocationId = locationId.id;
                    resolvedLocationName = locationId.displayName || locationId.name || 'Unknown';
                }
            }

            if (locationName && typeof locationName === 'string') {
                resolvedLocationName = locationName;
            }

            var typeOptions = '';
            for (var key in types) {
                var t = types[key];
                typeOptions += '<option value="' + t.id + '">' + _escapeHtml(t.name) + ' (' + (t.isMultiUnit ? 'Multi-unit' : 'Single') + ')</option>';
            }

            var conditionOptions = conditions.map(function(c) {
                return '<option value="' + c.id + '" ' + (c.id === 'good' ? 'selected' : '') + '>' + _escapeHtml(c.name) + '</option>';
            }).join('');

            var locationOptions = _buildLocationDropdown(resolvedLocationId, '— No location —', false);

            var modalContent =
                '<div style="margin-bottom: 16px;">' +
                '<div style="background: var(--bg3); border-radius: 6px; padding: 8px 12px; margin-bottom: 12px; font-size: 0.6rem; color: var(--dim);">' +
                'Creating a new residence in <strong>' + _escapeHtml(resolvedLocationName) + '</strong>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Residence Name *</label>' +
                '<input type="text" id="newResidenceName" placeholder="e.g., Thornwood Manor" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Residence Type</label>' +
                '<select id="newResidenceType" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;">' +
                typeOptions +
                '</select>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Location</label>' +
                '<select id="newResidenceLocation" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;">' +
                locationOptions +
                '</select>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Condition</label>' +
                '<select id="newResidenceCondition" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;">' +
                conditionOptions +
                '</select>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Built Year</label>' +
                '<input type="number" id="newResidenceBuiltYear" value="' + currentYear + '" min="1" max="' + (currentYear + 5) + '" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Notes (optional)</label>' +
                '<textarea id="newResidenceNotes" rows="2" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;" placeholder="Historical notes..."></textarea>' +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Add Residence to ' + (resolvedLocationName || 'Location'),
                content: modalContent,
                confirmText: 'Create Residence',
                cancelText: 'Cancel',
                onOpen: function() {
                    var nameInput = document.getElementById('newResidenceName');
                    if (nameInput) {
                        setTimeout(function() { nameInput.focus(); }, 100);
                    }
                },
                onConfirm: function() {
                    var name = document.getElementById('newResidenceName').value.trim();
                    var typeId = document.getElementById('newResidenceType').value;
                    var locationId = document.getElementById('newResidenceLocation').value;
                    var condition = document.getElementById('newResidenceCondition').value;
                    var builtYear = parseInt(document.getElementById('newResidenceBuiltYear').value);
                    var notes = document.getElementById('newResidenceNotes').value;

                    if (!name) {
                        _showToast('Please enter a residence name', 'error');
                        return false;
                    }

                    if (!typeId) {
                        _showToast('Please select a residence type', 'error');
                        return false;
                    }

                    if (isNaN(builtYear) || builtYear < 1) {
                        _showToast('Please enter a valid built year', 'error');
                        return false;
                    }

                    var finalLocationId = locationId || resolvedLocationId || null;

                    var newResidence = _createResidence(name, finalLocationId, typeId, {
                        condition: condition,
                        builtYear: builtYear,
                        notes: notes || null
                    });

                    if (newResidence) {
                        _showToast('Residence "' + name + '" created', 'success');
                        _closeTopModal();
                        _processingResidenceModal = false;
                        if (onSuccess) {
                            onSuccess(newResidence.id);
                        }
                    } else {
                        _showToast('Failed to create residence', 'error');
                    }
                    return true;
                },
                onCancel: function() {
                    _processingResidenceModal = false;
                }
            });

        } catch (e) {
            _processingResidenceModal = false;
            _showToast('Error opening new residence modal', 'error');
        }
    }

    // =========================================================================
    // 6. EDIT RESIDENCE MODAL
    // =========================================================================

    function openEditResidenceModal(residenceId, onSuccess) {
        if (_processingResidenceModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingResidenceModal = true;

        try {
            var residence = _getResidenceById(residenceId);
            if (!residence) {
                _showToast('Residence not found', 'error');
                _processingResidenceModal = false;
                return;
            }

            var currentYear = _getCurrentYear();
            var types = _getAllResidenceTypes();
            var conditions = _getAllResidenceConditions();

            var typeOptions = '';
            for (var key in types) {
                var t = types[key];
                var selected = (residence.typeId === t.id) ? 'selected' : '';
                typeOptions += '<option value="' + t.id + '" ' + selected + '>' + _escapeHtml(t.name) + ' (' + (t.isMultiUnit ? 'Multi-unit' : 'Single') + ')</option>';
            }

            var conditionOptions = conditions.map(function(c) {
                var selected = (residence.condition === c.id) ? 'selected' : '';
                return '<option value="' + c.id + '" ' + selected + '>' + _escapeHtml(c.name) + '</option>';
            }).join('');

            var locationOptions = _buildLocationDropdown(residence.locationId, '— No location —', false);

            var modalContent =
                '<div style="margin-bottom: 16px;">' +
                '<div style="background: var(--bg3); border-radius: 6px; padding: 8px 12px; margin-bottom: 12px; font-size: 0.6rem; color: var(--dim);">' +
                'Editing <strong>' + _escapeHtml(residence.name) + '</strong>' +
                ' · Type: ' + _escapeHtml(residence.typeName || residence.typeId) +
                ' · Location: ' + _escapeHtml(residence.locationName || 'None') +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Residence Name *</label>' +
                '<input type="text" id="editResidenceName" value="' + _escapeHtml(residence.name) + '" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '</div>' +
                '<div style="margin-bottom: 12px; padding: 8px; background: var(--bg3); border-radius: 6px;">' +
                '<label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 0.65rem;">' +
                '<input type="checkbox" id="editRenameWithHistory" checked>' +
                '<span>Record this name change in history</span>' +
                '</label>' +
                '<div id="editRenameHistoryOptions" style="margin-top: 8px; padding-left: 24px;">' +
                '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">' +
                '<div><label style="font-size: 0.55rem; color: var(--dim);">Year</label>' +
                '<input type="number" id="editRenameYear" value="' + currentYear + '" min="1" style="width: 100%; padding: 4px 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; font-size: 0.55rem; color: var(--text);">' +
                '</div>' +
                '<div><label style="font-size: 0.55rem; color: var(--dim);">Reason</label>' +
                '<input type="text" id="editRenameReason" placeholder="e.g., Renovation, Inheritance..." style="width: 100%; padding: 4px 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; font-size: 0.55rem; color: var(--text);">' +
                '</div>' +
                '</div></div></div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Residence Type</label>' +
                '<select id="editResidenceType" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;">' +
                typeOptions +
                '</select>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Location</label>' +
                '<select id="editResidenceLocation" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;">' +
                locationOptions +
                '</select>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Condition</label>' +
                '<select id="editResidenceCondition" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;">' +
                conditionOptions +
                '</select>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Built Year</label>' +
                '<input type="number" id="editResidenceBuiltYear" value="' + (residence.builtYear || currentYear) + '" min="1" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Notes</label>' +
                '<textarea id="editResidenceNotes" rows="2" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;">' + _escapeHtml(residence.notes || '') + '</textarea>' +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Edit Residence: ' + residence.name,
                content: modalContent,
                confirmText: 'Save Changes',
                cancelText: 'Cancel',
                onOpen: function() {
                    var historyCheckbox = document.getElementById('editRenameWithHistory');
                    var historyOptions = document.getElementById('editRenameHistoryOptions');
                    if (historyCheckbox && historyOptions) {
                        historyCheckbox.onchange = function() {
                            historyOptions.style.display = this.checked ? 'block' : 'none';
                        };
                    }
                    var nameInput = document.getElementById('editResidenceName');
                    if (nameInput) {
                        setTimeout(function() { nameInput.focus(); }, 100);
                    }
                },
                onConfirm: function() {
                    var name = document.getElementById('editResidenceName').value.trim();
                    var typeId = document.getElementById('editResidenceType').value;
                    var locationId = document.getElementById('editResidenceLocation').value;
                    var condition = document.getElementById('editResidenceCondition').value;
                    var builtYear = parseInt(document.getElementById('editResidenceBuiltYear').value);
                    var notes = document.getElementById('editResidenceNotes').value.trim();
                    var renameWithHistory = document.getElementById('editRenameWithHistory').checked;
                    var renameYear = parseInt(document.getElementById('editRenameYear').value);
                    var renameReason = document.getElementById('editRenameReason').value.trim();

                    if (!name) {
                        _showToast('Please enter a residence name', 'error');
                        return false;
                    }

                    if (isNaN(builtYear) || builtYear < 1) {
                        _showToast('Please enter a valid built year', 'error');
                        return false;
                    }

                    // Handle name change
                    if (name !== residence.name) {
                        var nameResult = _updateResidenceNameWithHistory(residenceId, name, {
                            year: renameYear || currentYear,
                            reason: renameReason || 'Edited',
                            changedBy: 'User',
                            addToHistory: renameWithHistory
                        });

                        if (!nameResult || !nameResult.success) {
                            _showToast(nameResult ? nameResult.reason : 'Failed to rename residence', 'error');
                            return false;
                        }

                        if (renameWithHistory) {
                            _showToast('Residence renamed from "' + residence.name + '" to "' + name + '" (' + (renameYear || currentYear) + ')', 'success');
                        } else {
                            _showToast('Residence name changed to "' + name + '" (no trace)', 'info');
                        }
                    }

                    var updates = {
                        typeId: typeId,
                        locationId: locationId || null,
                        condition: condition,
                        builtYear: builtYear,
                        notes: notes || null
                    };

                    if (name !== residence.name) {
                        updates.name = name;
                    }

                    var result = _updateResidence(residenceId, updates);

                    if (result) {
                        _showToast('Residence updated', 'success');
                        _closeTopModal();
                        _processingResidenceModal = false;
                        if (onSuccess) {
                            onSuccess();
                        }
                    } else {
                        _showToast('Failed to update residence', 'error');
                    }
                    return true;
                },
                onCancel: function() {
                    _processingResidenceModal = false;
                }
            });

        } catch (e) {
            _processingResidenceModal = false;
            _showToast('Error opening edit residence modal', 'error');
        }
    }

    // =========================================================================
    // 7. DELETE RESIDENCE MODAL
    // =========================================================================

    function openDeleteResidenceModal(residenceId, onSuccess) {
        if (_processingResidenceModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingResidenceModal = true;

        try {
            var residence = _getResidenceById(residenceId);
            if (!residence) {
                _showToast('Residence not found', 'error');
                _processingResidenceModal = false;
                return;
            }

            var unitCount = residence.units ? residence.units.length : 0;
            var occupiedUnits = 0;
            for (var i = 0; i < (residence.units || []).length; i++) {
                if (!residence.units[i].isVacant && !residence.units[i].isDemolished) {
                    occupiedUnits++;
                }
            }

            var modalContent =
                '<div style="margin-bottom: 16px;">' +
                '<div style="background: rgba(244, 67, 54, 0.1); border-radius: 8px; padding: 16px; border-left: 3px solid #f44336; margin-bottom: 16px;">' +
                '<div style="font-size: 0.9rem; color: #f44336;">Warning: This action cannot be undone</div>' +
                '<div style="font-size: 0.65rem; color: var(--dim); margin-top: 4px;">' +
                'Deleting "' + _escapeHtml(residence.name) + '" will remove it from the game world.' +
                (occupiedUnits > 0 ? ' ' + occupiedUnits + ' unit(s) are currently occupied.' : '') +
                (unitCount > 0 ? ' ' + unitCount + ' total unit(s) will be removed.' : '') +
                '</div>' +
                '</div>' +
                '<div style="background: var(--bg3); border-radius: 8px; padding: 12px; margin-bottom: 12px;">' +
                '<div style="display: flex; justify-content: space-between; font-size: 0.7rem;">' +
                '<span>Name:</span>' +
                '<span style="font-weight: bold;">' + _escapeHtml(residence.name) + '</span>' +
                '</div>' +
                '<div style="display: flex; justify-content: space-between; font-size: 0.7rem; margin-top: 4px;">' +
                '<span>Type:</span>' +
                '<span>' + _escapeHtml(residence.typeName || residence.typeId) + '</span>' +
                '</div>' +
                '<div style="display: flex; justify-content: space-between; font-size: 0.7rem; margin-top: 4px;">' +
                '<span>Units:</span>' +
                '<span>' + unitCount + ' (' + occupiedUnits + ' occupied)</span>' +
                '</div>' +
                '</div>' +
                '<div style="font-size: 0.6rem; color: var(--warn);">' +
                'Are you sure you want to delete this residence?' +
                '</div>' +
                '<div class="form-group" style="margin-top: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Type "<strong>' + _escapeHtml(residence.name) + '</strong>" to confirm</label>' +
                '<input type="text" id="confirmDeleteResidenceName" placeholder="Enter residence name" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Delete Residence: ' + residence.name,
                content: modalContent,
                confirmText: 'Delete Residence',
                cancelText: 'Cancel',
                confirmStyle: 'danger',
                onConfirm: function() {
                    var confirmName = document.getElementById('confirmDeleteResidenceName').value.trim();
                    if (confirmName !== residence.name) {
                        _showToast('Residence name does not match', 'error');
                        return false;
                    }

                    var force = occupiedUnits === 0;
                    var result = _deleteResidence(residenceId, { force: force });

                    if (result) {
                        _showToast('Residence "' + residence.name + '" deleted', 'info');
                        _closeTopModal();
                        _processingResidenceModal = false;
                        if (onSuccess) {
                            onSuccess();
                        }
                    } else {
                        _showToast('Failed to delete residence - occupied units must be vacated first', 'error');
                    }
                    return true;
                },
                onCancel: function() {
                    _processingResidenceModal = false;
                }
            });

        } catch (e) {
            _processingResidenceModal = false;
            _showToast('Error opening delete residence modal', 'error');
        }
    }

    // =========================================================================
    // 8. RENAME RESIDENCE MODAL
    // =========================================================================

    function openRenameResidenceModal(residenceId, onSuccess) {
        if (_processingResidenceModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingResidenceModal = true;

        try {
            var residence = _getResidenceById(residenceId);
            if (!residence) {
                _showToast('Residence not found', 'error');
                _processingResidenceModal = false;
                return;
            }

            var currentYear = _getCurrentYear();
            var nameHistory = _getResidenceNameHistory(residenceId);
            var currentNameInfo = _getResidenceCurrentNameInfo(residenceId);

            var historyHtml = '';
            if (nameHistory.length > 0) {
                var sortedHistory = nameHistory.slice().sort(function(a, b) { return b.year - a.year; });
                historyHtml =
                    '<div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--border);">' +
                    '<div style="font-size: 0.6rem; color: var(--accent); margin-bottom: 8px;">Name Change History</div>' +
                    '<div style="max-height: 150px; overflow-y: auto; background: var(--bg3); border-radius: 6px; padding: 8px;">';
                for (var i = 0; i < Math.min(sortedHistory.length, 10); i++) {
                    var h = sortedHistory[i];
                    historyHtml +=
                        '<div style="font-size: 0.55rem; padding: 4px 0; border-bottom: 1px solid var(--border-light);">' +
                        '<strong>' + h.year + ':</strong> ' + _escapeHtml(h.oldName || '—') + ' -> ' + _escapeHtml(h.newName) +
                        (h.reason ? ' (' + _escapeHtml(h.reason) + ')' : '') +
                        '</div>';
                }
                if (sortedHistory.length > 10) {
                    historyHtml += '<div style="font-size: 0.5rem; color: var(--dim); text-align: center; padding-top: 4px;">... and ' + (sortedHistory.length - 10) + ' more</div>';
                }
                historyHtml += '</div></div>';
            }

            var modalContent =
                '<div style="margin-bottom: 16px;">' +
                '<div style="background: var(--bg3); border-radius: 6px; padding: 8px 12px; margin-bottom: 12px; font-size: 0.6rem; color: var(--dim);">' +
                'Current name: <strong>' + _escapeHtml(residence.name) + '</strong>' +
                (currentNameInfo ? ' · Since: ' + currentNameInfo.since : '') +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">New Name *</label>' +
                '<input type="text" id="renameResidenceInput" value="' + _escapeHtml(residence.name) + '" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '</div>' +
                '<div style="margin-bottom: 12px; padding: 8px; background: var(--bg3); border-radius: 6px;">' +
                '<label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 0.65rem;">' +
                '<input type="checkbox" id="renameWithHistory" checked>' +
                '<span>Record this name change in history</span>' +
                '</label>' +
                '<div id="renameHistoryOptions" style="margin-top: 8px; padding-left: 24px;">' +
                '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">' +
                '<div><label style="font-size: 0.55rem; color: var(--dim);">Year</label>' +
                '<input type="number" id="renameYear" value="' + currentYear + '" min="1" max="' + (currentYear + 5) + '" style="width: 100%; padding: 4px 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; font-size: 0.55rem; color: var(--text);">' +
                '</div>' +
                '<div><label style="font-size: 0.55rem; color: var(--dim);">Reason</label>' +
                '<input type="text" id="renameReason" placeholder="e.g., Succession" style="width: 100%; padding: 4px 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; font-size: 0.55rem; color: var(--text);">' +
                '</div>' +
                '</div>' +
                '</div>' +
                '</div>' +
                historyHtml +
                '</div>';

            _openModal({
                title: 'Rename Residence: ' + residence.name,
                content: modalContent,
                confirmText: 'Rename',
                cancelText: 'Cancel',
                onOpen: function() {
                    var input = document.getElementById('renameResidenceInput');
                    if (input) {
                        setTimeout(function() { input.focus(); input.select(); }, 100);
                    }

                    var historyCheckbox = document.getElementById('renameWithHistory');
                    var historyOptions = document.getElementById('renameHistoryOptions');
                    if (historyCheckbox && historyOptions) {
                        historyCheckbox.onchange = function() {
                            historyOptions.style.display = this.checked ? 'block' : 'none';
                        };
                    }
                },
                onConfirm: function() {
                    var newName = document.getElementById('renameResidenceInput').value.trim();
                    var year = parseInt(document.getElementById('renameYear').value);
                    var reason = document.getElementById('renameReason').value.trim();
                    var addToHistory = document.getElementById('renameWithHistory').checked;

                    if (!newName) {
                        _showToast('Please enter a residence name', 'error');
                        return false;
                    }

                    if (newName === residence.name) {
                        _showToast('Name is the same', 'info');
                        _closeTopModal();
                        _processingResidenceModal = false;
                        if (onSuccess) {
                            onSuccess();
                        }
                        return true;
                    }

                    if (isNaN(year) || year < 1) {
                        _showToast('Please enter a valid year', 'error');
                        return false;
                    }

                    var result = _updateResidenceNameWithHistory(residenceId, newName, {
                        year: year,
                        reason: reason || 'Renamed',
                        changedBy: 'User',
                        addToHistory: addToHistory
                    });

                    if (result && result.success) {
                        _showToast('Residence renamed from "' + result.oldName + '" to "' + result.newName + '" (' + year + ')', 'success');
                        _closeTopModal();
                        _processingResidenceModal = false;
                        if (onSuccess) {
                            onSuccess();
                        }
                    } else {
                        _showToast(result ? result.reason : 'Failed to rename residence', 'error');
                    }
                    return true;
                },
                onCancel: function() {
                    _processingResidenceModal = false;
                }
            });

        } catch (e) {
            _processingResidenceModal = false;
            _showToast('Error opening rename residence modal', 'error');
        }
    }

    // =========================================================================
    // 9. RESIDENCE NAME HISTORY MODAL
    // =========================================================================

    function openResidenceNameHistoryModal(residenceId) {
        if (_processingResidenceModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingResidenceModal = true;

        try {
            var residence = _getResidenceById(residenceId);
            if (!residence) {
                _showToast('Residence not found', 'error');
                _processingResidenceModal = false;
                return;
            }

            var nameHistory = _getResidenceNameHistory(residenceId);
            var currentNameInfo = _getResidenceCurrentNameInfo(residenceId);
            var originalName = _getResidenceOriginalName(residenceId);

            var historyHtml = '';
            if (nameHistory.length === 0) {
                historyHtml = '<div style="color: var(--dim); text-align: center; padding: 20px;">No name change history recorded</div>';
            } else {
                var sortedHistory = nameHistory.slice().sort(function(a, b) { return a.year - b.year; });
                historyHtml = '<div style="display: flex; flex-direction: column; gap: 8px;">';
                for (var i = 0; i < sortedHistory.length; i++) {
                    var h = sortedHistory[i];
                    var isCurrent = i === sortedHistory.length - 1;
                    historyHtml +=
                        '<div style="background: var(--bg3); border-radius: 6px; padding: 10px; border-left: 3px solid ' + (isCurrent ? 'var(--accent)' : 'var(--border)') + ';">' +
                        '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">' +
                        '<div><span style="font-weight: bold;">' + h.year + '</span> ' + _escapeHtml(h.oldName || '—') + ' -> <strong>' + _escapeHtml(h.newName) + '</strong></div>' +
                        (isCurrent ? '<span style="font-size: 0.55rem; color: var(--accent);">Current</span>' : '') +
                        '</div>' +
                        (h.reason ? '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 4px;">Reason: ' + _escapeHtml(h.reason) + '</div>' : '') +
                        (h.changedBy ? '<div style="font-size: 0.5rem; color: var(--dim); margin-top: 2px;">By: ' + _escapeHtml(h.changedBy) + '</div>' : '') +
                        '</div>';
                }
                historyHtml += '</div>';
            }

            var modalContent =
                '<div style="margin-bottom: 16px; background: var(--bg2); padding: 12px; border-radius: 8px;">' +
                '<div><strong>' + _escapeHtml(residence.name) + '</strong></div>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">Current name since: ' + (currentNameInfo ? currentNameInfo.since : 'Unknown') + '</div>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">Original name: ' + _escapeHtml(originalName) + '</div>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">Total name changes: ' + nameHistory.length + '</div>' +
                '</div>' +
                '<div style="margin-bottom: 16px;">' +
                '<div style="font-size: 0.7rem; color: var(--accent); margin-bottom: 8px;">Name Change History</div>' +
                historyHtml +
                '</div>' +
                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem;">' +
                'Name changes help track the evolution of a residence through time.' +
                '</div>';

            _openModal({
                title: 'Residence Name History: ' + residence.name,
                content: modalContent,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {
                    _closeTopModal();
                    _processingResidenceModal = false;
                }
            });

        } catch (e) {
            _processingResidenceModal = false;
            _showToast('Error opening residence name history', 'error');
        }
    }

    // =========================================================================
    // 10. RESIDENCE DETAILS MODAL
    // =========================================================================

    function openResidenceDetailsModal(residenceId, onRefresh) {
        if (_processingResidenceModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingResidenceModal = true;

        try {
            var residence = _getResidenceById(residenceId);
            if (!residence) {
                _showToast('Residence not found', 'error');
                _processingResidenceModal = false;
                return;
            }

            var currentYear = _getCurrentYear();
            var isVacant = residence.isVacant === true;
            var isDemolished = residence.isDemolished === true;
            var location = _getPlaceById(residence.locationId);
            var isMultiUnit = residence.isMultiUnit === true;
            var units = residence.units || [];
            var unitStats = _getUnitStats(residenceId);
            var associationHistory = _getResidenceAssociationHistory(residenceId);
            var recommendations = _getResidenceRecommendations(residenceId);

            var locationDisplay = location ? location.displayName : 'Unknown';
            var typeDisplay = residence.typeName || residence.typeId || 'Unknown';

            // Build members HTML (household members)
            var membersHtml = '';
            var household = residence.householdId ? _getHousehold(residence.householdId) : null;
            var householdMembers = [];

            if (household && household.members) {
                var characters = _getCharacters();
                var charMap = {};
                for (var i = 0; i < characters.length; i++) {
                    charMap[characters[i].id] = characters[i];
                }

                for (var i = 0; i < household.members.length; i++) {
                    var member = household.members[i];
                    var char = charMap[member.characterId];
                    if (char) {
                        var age = _calculateAge(char.birthYear, char.isDeceased, char.deathYear);
                        var genderText = char.gender === 'male' ? 'Male' : (char.gender === 'female' ? 'Female' : 'Unknown');
                        var headText = member.isHead ? ' (Head)' : '';

                        householdMembers.push({
                            character: char,
                            member: member,
                            age: age,
                            genderText: genderText,
                            headText: headText
                        });
                    }
                }

                householdMembers.sort(function(a, b) {
                    if (a.member.isHead && !b.member.isHead) return -1;
                    if (!a.member.isHead && b.member.isHead) return 1;
                    return (a.member.joinedYear || 0) - (b.member.joinedYear || 0);
                });

                membersHtml = '<div style="background: var(--bg3); padding: 10px; border-radius: 8px; margin-bottom: 12px;">' +
                    '<div style="font-size: 0.6rem; color: var(--accent); margin-bottom: 4px;">Household: ' + _escapeHtml(household.name) + ' (' + householdMembers.length + ' members)</div>';

                for (var i = 0; i < Math.min(householdMembers.length, 10); i++) {
                    var m = householdMembers[i];
                    membersHtml +=
                        '<div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid var(--border-light); font-size: 0.55rem;">' +
                        '<span>' + _escapeHtml(m.character.name) + ' ' + _escapeHtml(m.character.surname || '') + m.headText + '</span>' +
                        '<span style="color: var(--dim);">' + m.age + 'y · ' + (m.member.role || 'Member') + '</span>' +
                        '</div>';
                }
                if (householdMembers.length > 10) {
                    membersHtml += '<div style="font-size: 0.5rem; color: var(--dim); text-align: center; padding-top: 4px;">... and ' + (householdMembers.length - 10) + ' more</div>';
                }
                membersHtml += '</div>';
            } else if (isVacant && !isDemolished) {
                membersHtml =
                    '<div style="background: var(--bg3); padding: 10px; border-radius: 8px; margin-bottom: 12px;">' +
                    '<div style="font-size: 0.6rem; color: #c87040;">Vacant</div>' +
                    '<div style="font-size: 0.55rem; color: var(--dim);">This residence is currently vacant. ' +
                    (residence.vacantYear ? 'Vacant since ' + residence.vacantYear + '.' : '') +
                    (residence.vacantReason ? ' Reason: ' + residence.vacantReason : '') +
                    '</div>' +
                    '</div>';
            } else if (isDemolished) {
                membersHtml =
                    '<div style="background: var(--bg3); padding: 10px; border-radius: 8px; margin-bottom: 12px;">' +
                    '<div style="font-size: 0.6rem; color: #8a2020;">Demolished</div>' +
                    '<div style="font-size: 0.55rem; color: var(--dim);">This residence was demolished in ' + (residence.demolishedYear || 'Unknown') +
                    (residence.demolishedReason ? '. Reason: ' + residence.demolishedReason : '') +
                    '</div>' +
                    '</div>';
            }

            // Build units HTML
            var unitsHtml = '';
            if (isMultiUnit && units.length > 0) {
                unitsHtml =
                    '<div style="background: var(--bg3); padding: 10px; border-radius: 8px; margin-bottom: 12px;">' +
                    '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">' +
                    '<div style="font-size: 0.6rem; color: var(--accent);">Units (' + units.length + ' of ' + (residence.maxUnits || units.length) + ')</div>' +
                    '<span style="font-size: 0.5rem; color: var(--dim);">' + unitStats.occupied + ' occupied · ' + unitStats.vacant + ' vacant</span>' +
                    '</div>' +
                    '<div style="max-height: 200px; overflow-y: auto;">';

                for (var i = 0; i < units.length; i++) {
                    var u = units[i];
                    var unitStatus = u.isDemolished ? 'Demolished' : (u.isVacant ? 'Vacant' : 'Occupied');
                    var unitColor = u.isDemolished ? '#8a2020' : (u.isVacant ? '#c87040' : '#4a9e6a');
                    var unitHousehold = u.householdName || 'Unassigned';

                    unitsHtml +=
                        '<div class="unit-item" data-unit-number="' + u.unitNumber + '" style="' +
                        'display: flex; ' +
                        'justify-content: space-between; ' +
                        'align-items: center; ' +
                        'padding: 6px 8px; ' +
                        'border-bottom: 1px solid var(--border-light); ' +
                        'cursor: pointer; ' +
                        'border-left: 3px solid ' + unitColor + '; ' +
                        'margin-bottom: 2px; ' +
                        'background: var(--bg2); ' +
                        'border-radius: 4px;' +
                        '">' +
                        '<div>' +
                        '<span style="font-weight: bold; font-size: 0.6rem;">Unit ' + u.unitNumber + '</span>' +
                        '<span style="font-size: 0.5rem; color: ' + unitColor + '; margin-left: 6px;">' + unitStatus + '</span>' +
                        '<span style="font-size: 0.5rem; color: var(--dim); margin-left: 6px;">' + _escapeHtml(unitHousehold) + '</span>' +
                        '</div>' +
                        '<div style="display: flex; gap: 4px;">' +
                        '<button class="unit-details-btn btn small" data-unit-number="' + u.unitNumber + '" style="padding: 2px 6px; font-size: 0.45rem; background: var(--bg3); border: 1px solid var(--border); border-radius: 3px; cursor: pointer;">View</button>' +
                        (u.isVacant && !u.isDemolished ?
                            '<button class="unit-assign-btn btn small" data-unit-number="' + u.unitNumber + '" style="padding: 2px 6px; font-size: 0.45rem; background: var(--accent-dim); border: 1px solid var(--accent); border-radius: 3px; cursor: pointer;">Assign</button>' :
                            (!u.isDemolished ?
                                '<button class="unit-mark-vacant-btn btn small" data-unit-number="' + u.unitNumber + '" style="padding: 2px 6px; font-size: 0.45rem; background: #8a5a20; border: none; color: white; border-radius: 3px; cursor: pointer;">Vacant</button>' :
                                ''
                            )
                        ) +
                        (!u.isDemolished ?
                            '<button class="unit-remove-btn btn small" data-unit-number="' + u.unitNumber + '" style="padding: 2px 6px; font-size: 0.45rem; background: #8a3020; border: none; color: white; border-radius: 3px; cursor: pointer;">✗</button>' :
                            ''
                        ) +
                        '</div>' +
                        '</div>';
                }

                unitsHtml += '</div>' +
                    '<div style="margin-top: 6px; text-align: center;">' +
                    '<button id="addUnitBtn" class="btn small" style="padding: 3px 10px; font-size: 0.5rem; background: var(--accent-dim); border: 1px solid var(--accent); border-radius: 4px; cursor: pointer;">Add Unit</button>' +
                    '</div>' +
                    '</div>';
            } else if (isMultiUnit && units.length === 0) {
                unitsHtml =
                    '<div style="background: var(--bg3); padding: 10px; border-radius: 8px; margin-bottom: 12px;">' +
                    '<div style="font-size: 0.6rem; color: var(--accent); margin-bottom: 4px;">Units</div>' +
                    '<div style="color: var(--dim); font-size: 0.55rem; text-align: center; padding: 12px;">No units created yet</div>' +
                    '<div style="margin-top: 6px; text-align: center;">' +
                    '<button id="addUnitBtn" class="btn small" style="padding: 3px 10px; font-size: 0.5rem; background: var(--accent-dim); border: 1px solid var(--accent); border-radius: 4px; cursor: pointer;">Add Unit</button>' +
                    '</div>' +
                    '</div>';
            }

            // Build features HTML
            var featuresHtml = '';
            if (residence.features && residence.features.length > 0) {
                var allFeatures = [
                    { id: 'garden', name: 'Garden' },
                    { id: 'wall', name: 'Wall' },
                    { id: 'gate', name: 'Gate' },
                    { id: 'stable', name: 'Stable' },
                    { id: 'kitchen', name: 'Kitchen' },
                    { id: 'library', name: 'Library' },
                    { id: 'forge', name: 'Forge' },
                    { id: 'chapel', name: 'Chapel' },
                    { id: 'well', name: 'Well' },
                    { id: 'courtyard', name: 'Courtyard' },
                    { id: 'tower', name: 'Tower' },
                    { id: 'cellar', name: 'Cellar' },
                    { id: 'study', name: 'Study' },
                    { id: 'great_hall', name: 'Great Hall' }
                ];
                var featureNames = [];
                for (var i = 0; i < residence.features.length; i++) {
                    var found = allFeatures.find(function(f) { return f.id === residence.features[i]; });
                    if (found) featureNames.push(found.name);
                    else featureNames.push(residence.features[i]);
                }
                featuresHtml = featureNames.map(function(f) {
                    return '<span style="background: var(--bg3); padding: 2px 8px; border-radius: 12px; font-size: 0.55rem; margin: 2px;">' + _escapeHtml(f) + '</span>';
                }).join(' ');
            } else {
                featuresHtml = '<span style="color: var(--dim); font-size: 0.55rem;">No features</span>';
            }

            // Build association history HTML
            var associationsHtml = '';
            if (associationHistory.length > 0) {
                associationsHtml =
                    '<div style="background: var(--bg3); padding: 10px; border-radius: 8px; margin-bottom: 12px;">' +
                    '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">' +
                    '<div style="font-size: 0.6rem; color: var(--accent);">Historical Households</div>' +
                    '<span style="font-size: 0.5rem; color: var(--dim);">' + associationHistory.length + ' records</span>' +
                    '</div>' +
                    '<div style="max-height: 150px; overflow-y: auto; font-size: 0.55rem;">';

                var displayAssociations = associationHistory.slice(-10).reverse();
                for (var i = 0; i < displayAssociations.length; i++) {
                    var a = displayAssociations[i];
                    var isCurrent = !a.endedYear;
                    var isCurrentHousehold = a.householdId === residence.householdId;
                    var statusText = isCurrent ? '(Current)' : '(Ended ' + a.endedYear + ')';
                    var statusColor = isCurrent ? '#4a9e6a' : '#8a8a8a';

                    associationsHtml +=
                        '<div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid var(--border-light);' + (isCurrentHousehold ? 'background: rgba(74,158,106,0.1);' : '') + '">' +
                        '<div>' +
                        '<strong>' + _escapeHtml(a.householdName) + '</strong>' +
                        '<span style="color: ' + statusColor + '; font-size: 0.5rem; margin-left: 6px;">' + statusText + '</span>' +
                        (a.reason ? '<div style="font-size: 0.5rem; color: var(--dim);">' + _escapeHtml(a.reason) + '</div>' : '') +
                        '</div>' +
                        '<div style="text-align: right; font-size: 0.5rem; color: var(--dim);">' +
                        a.year + (a.endedYear ? ' - ' + a.endedYear : '') +
                        (a.unitNumber ? ' · Unit ' + a.unitNumber : '') +
                        '</div>' +
                        '</div>';
                }
                if (associationHistory.length > 10) {
                    associationsHtml += '<div style="font-size: 0.5rem; color: var(--dim); text-align: center; padding-top: 4px;">... and ' + (associationHistory.length - 10) + ' more</div>';
                }

                associationsHtml +=
                    '</div>' +
                    (associationHistory.some(function(a) { return !a.endedYear; }) && household ?
                        '<div style="margin-top: 6px; text-align: center;">' +
                        '<button id="endAssociationBtn" class="btn small" style="padding: 3px 10px; font-size: 0.5rem; background: #8a5a20; border: none; color: white; border-radius: 4px; cursor: pointer;">End Current Association</button>' +
                        '</div>' :
                        ''
                    ) +
                    '</div>';
            }

            // Build recommendations HTML
            var recommendationsHtml = '';
            if (recommendations && recommendations.length > 0 && !isDemolished) {
                recommendationsHtml =
                    '<div style="margin-top: 12px; border-top: 1px solid var(--border); padding-top: 12px;">' +
                    '<div style="font-size: 0.6rem; color: var(--accent); margin-bottom: 6px;">Recommendations</div>';
                for (var i = 0; i < recommendations.length; i++) {
                    var r = recommendations[i];
                    var priorityColor = r.priority === 'high' ? '#c87040' : (r.priority === 'medium' ? '#c8a844' : '#4a9e6a');
                    recommendationsHtml +=
                        '<div style="font-size: 0.55rem; padding: 4px 0; border-bottom: 1px solid var(--border-light);">' +
                        '<span style="color: ' + priorityColor + ';">' + r.priority + ':</span> ' + _escapeHtml(r.message) +
                        (r.estimatedCost ? ' (Cost: ' + r.estimatedCost + ' gold)' : '') +
                        '</div>';
                }
                recommendationsHtml += '</div>';
            }

            var statusText = isDemolished ? 'Demolished' : (isVacant ? 'Vacant' : 'Occupied');
            var statusColor = isDemolished ? '#8a2020' : (isVacant ? '#c87040' : '#4a9e6a');

            var canDemolish = !isDemolished && (unitStats.occupied === 0);

            // Build action buttons - NO ICONS
            var actionButtonsHtml =
                '<div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--border);">' +
                '<div style="display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 4px;">' +
                '<button id="resDetailsEditBtn" class="btn small" style="padding: 3px 10px; font-size: 0.55rem; background: var(--accent-dim); border: 1px solid var(--accent); border-radius: 3px; cursor: pointer;">Edit</button>' +
                '<button id="resDetailsRenameBtn" class="btn small" style="padding: 3px 10px; font-size: 0.55rem; background: var(--bg3); border: 1px solid var(--border); border-radius: 3px; cursor: pointer;">Rename</button>' +
                '<button id="resDetailsHistoryBtn" class="btn small" style="padding: 3px 10px; font-size: 0.55rem; background: var(--bg3); border: 1px solid var(--border); border-radius: 3px; cursor: pointer;">History</button>' +
                '</div>' +
                (!isVacant && !isDemolished ?
                    '<div style="display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 4px;">' +
                    '<button id="resDetailsVacateBtn" class="btn small" style="padding: 3px 10px; font-size: 0.55rem; background: #8a5a20; border: none; color: white; border-radius: 3px; cursor: pointer;">Mark Vacant</button>' +
                    '</div>' :
                    ''
                ) +
                (isVacant && !isDemolished ?
                    '<div style="display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 4px;">' +
                    '<button id="resDetailsAssignBtn" class="btn small" style="padding: 3px 10px; font-size: 0.55rem; background: var(--accent); border: none; color: white; border-radius: 3px; cursor: pointer;">Assign Household</button>' +
                    '<button id="resDetailsHeirsBtn" class="btn small" style="padding: 3px 10px; font-size: 0.55rem; background: var(--accent-dim); border: 1px solid var(--accent); border-radius: 3px; cursor: pointer;">Find Heirs</button>' +
                    '</div>' :
                    ''
                ) +
                (residence.condition !== 'pristine' && !isDemolished ?
                    '<div style="display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 4px;">' +
                    '<button id="resDetailsRehabBtn" class="btn small" style="padding: 3px 10px; font-size: 0.55rem; background: var(--bg3); border: 1px solid var(--border); border-radius: 3px; cursor: pointer;">Rehabilitate</button>' +
                    '</div>' :
                    ''
                ) +
                (canDemolish ?
                    '<div style="display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 4px;">' +
                    '<button id="resDetailsDemolishBtn" class="btn small" style="padding: 3px 10px; font-size: 0.55rem; background: #8a3020; border: none; color: white; border-radius: 3px; cursor: pointer;">Demolish</button>' +
                    '</div>' :
                    ''
                ) +
                '<div style="display: flex; gap: 4px; flex-wrap: wrap;">' +
                '<button id="resDetailsDeleteBtn" class="btn danger small" style="padding: 3px 10px; font-size: 0.55rem; background: #8a3020; border: none; color: white; border-radius: 3px; cursor: pointer;">Delete</button>' +
                '</div></div>';

            var modalContent =
                '<div style="margin-bottom: 16px;">' +
                '<div style="background: var(--bg2); border-radius: 8px; padding: 12px; margin-bottom: 12px;">' +
                '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">' +
                '<div>' +
                '<div style="font-size: 1.1rem; font-weight: bold;">' + _escapeHtml(residence.name) + '</div>' +
                '<div style="font-size: 0.65rem; color: var(--dim); margin-top: 2px;">' +
                _escapeHtml(typeDisplay) + ' · ' + _escapeHtml(locationDisplay) +
                ' · Built ' + (residence.builtYear || 'Unknown') +
                ' · Condition: ' + _escapeHtml(residence.condition || 'good') +
                (isMultiUnit ? ' · Multi-unit' : '') +
                '</div>' +
                '</div>' +
                '<div><span style="background: ' + statusColor + '; padding: 4px 10px; border-radius: 16px; font-size: 0.6rem; color: white;">' + statusText + '</span></div>' +
                '</div>' +
                (residence.description ? '<div style="margin-top: 8px; font-size: 0.6rem; color: var(--dim);">' + _escapeHtml(residence.description) + '</div>' : '') +
                '</div>' +
                membersHtml +
                unitsHtml +
                '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 12px; font-size: 0.6rem;">' +
                '<div style="background: var(--bg3); padding: 8px; border-radius: 6px; text-align: center;"><span style="color: var(--dim);">Value</span><br>' + (residence.estimatedValue || 0).toLocaleString() + ' gold</div>' +
                '<div style="background: var(--bg3); padding: 8px; border-radius: 6px; text-align: center;"><span style="color: var(--dim);">Built</span><br>' + (residence.builtYear || 'Unknown') + '</div>' +
                '<div style="background: var(--bg3); padding: 8px; border-radius: 6px; text-align: center;"><span style="color: var(--dim);">Condition</span><br>' + _escapeHtml(residence.condition || 'good') + '</div>' +
                (residence.lastRenovated ? '<div style="background: var(--bg3); padding: 8px; border-radius: 6px; text-align: center;"><span style="color: var(--dim);">Last Renovated</span><br>' + residence.lastRenovated + '</div>' : '') +
                (residence.isFortified ? '<div style="background: var(--bg3); padding: 8px; border-radius: 6px; text-align: center;"><span style="color: var(--dim);">Fortified</span><br>Yes</div>' : '') +
                (residence.defenseValue ? '<div style="background: var(--bg3); padding: 8px; border-radius: 6px; text-align: center;"><span style="color: var(--dim);">Defense</span><br>' + residence.defenseValue + '</div>' : '') +
                '</div>' +
                '<div style="background: var(--bg3); padding: 10px; border-radius: 8px; margin-bottom: 12px;">' +
                '<div style="font-size: 0.6rem; color: var(--accent); margin-bottom: 4px;">Features</div>' +
                '<div style="display: flex; flex-wrap: wrap; gap: 4px;">' + featuresHtml + '</div>' +
                '</div>' +
                associationsHtml +
                recommendationsHtml +
                actionButtonsHtml +
                '<div style="margin-top: 12px; text-align: center;">' +
                '<button id="closeResDetailsBtn" class="btn" style="padding: 6px 20px; font-size: 0.6rem; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">Close</button>' +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Residence Details: ' + residence.name,
                content: modalContent,
                confirmText: '',
                cancelText: '',
                onConfirm: function() {
                    _closeTopModal();
                    _processingResidenceModal = false;
                    if (onRefresh) {
                        onRefresh();
                    }
                }
            });

            // Attach event handlers
            setTimeout(function() {
                var isProcessing = false;

                function closeAndReopen(callback) {
                    if (isProcessing) return;
                    isProcessing = true;
                    _closeTopModal();
                    setTimeout(function() {
                        callback();
                        isProcessing = false;
                    }, 50);
                }

                var editBtn = document.getElementById('resDetailsEditBtn');
                if (editBtn) {
                    editBtn.onclick = function() {
                        closeAndReopen(function() {
                            openEditResidenceModal(residenceId, function() {
                                openResidenceDetailsModal(residenceId, onRefresh);
                            });
                        });
                    };
                }

                var renameBtn = document.getElementById('resDetailsRenameBtn');
                if (renameBtn) {
                    renameBtn.onclick = function() {
                        closeAndReopen(function() {
                            openRenameResidenceModal(residenceId, function() {
                                openResidenceDetailsModal(residenceId, onRefresh);
                            });
                        });
                    };
                }

                var historyBtn = document.getElementById('resDetailsHistoryBtn');
                if (historyBtn) {
                    historyBtn.onclick = function() {
                        closeAndReopen(function() {
                            openResidenceNameHistoryModal(residenceId);
                        });
                    };
                }

                var vacateBtn = document.getElementById('resDetailsVacateBtn');
                if (vacateBtn) {
                    vacateBtn.onclick = function() {
                        closeAndReopen(function() {
                            openVacateResidenceModal(residenceId, function() {
                                openResidenceDetailsModal(residenceId, onRefresh);
                            });
                        });
                    };
                }

                var assignBtn = document.getElementById('resDetailsAssignBtn');
                if (assignBtn) {
                    assignBtn.onclick = function() {
                        closeAndReopen(function() {
                            openAssignResidenceModal(residenceId, function() {
                                openResidenceDetailsModal(residenceId, onRefresh);
                            });
                        });
                    };
                }

                var heirsBtn = document.getElementById('resDetailsHeirsBtn');
                if (heirsBtn) {
                    heirsBtn.onclick = function() {
                        closeAndReopen(function() {
                            openResidenceHeirFinderModal(residenceId);
                        });
                    };
                }

                var rehabBtn = document.getElementById('resDetailsRehabBtn');
                if (rehabBtn) {
                    rehabBtn.onclick = function() {
                        closeAndReopen(function() {
                            openRehabilitateResidenceModal(residenceId, function() {
                                openResidenceDetailsModal(residenceId, onRefresh);
                            });
                        });
                    };
                }

                var demolishBtn = document.getElementById('resDetailsDemolishBtn');
                if (demolishBtn) {
                    demolishBtn.onclick = function() {
                        closeAndReopen(function() {
                            openDemolishResidenceModal(residenceId, function() {
                                _processingResidenceModal = false;
                                if (onRefresh) {
                                    onRefresh();
                                }
                            });
                        });
                    };
                }

                var deleteBtn = document.getElementById('resDetailsDeleteBtn');
                if (deleteBtn) {
                    deleteBtn.onclick = function() {
                        closeAndReopen(function() {
                            openDeleteResidenceModal(residenceId, function() {
                                _processingResidenceModal = false;
                                if (onRefresh) {
                                    onRefresh();
                                }
                            });
                        });
                    };
                }

                var endAssocBtn = document.getElementById('endAssociationBtn');
                if (endAssocBtn) {
                    endAssocBtn.onclick = function() {
                        if (isProcessing) return;
                        isProcessing = true;
                        _closeTopModal();
                        setTimeout(function() {
                            openEndResidenceAssociationModal(residenceId, function() {
                                isProcessing = false;
                                openResidenceDetailsModal(residenceId, onRefresh);
                            });
                        }, 50);
                    };
                }

                var addUnitBtn = document.getElementById('addUnitBtn');
                if (addUnitBtn) {
                    addUnitBtn.onclick = function() {
                        closeAndReopen(function() {
                            openAddUnitModal(residenceId, function() {
                                openResidenceDetailsModal(residenceId, onRefresh);
                            });
                        });
                    };
                }

                // Unit buttons
                var unitItems = document.querySelectorAll('.unit-item');
                unitItems.forEach(function(item) {
                    var newItem = item.cloneNode(true);
                    if (item.parentNode) {
                        item.parentNode.replaceChild(newItem, item);
                    }

                    newItem.onclick = function(e) {
                        if (e.target.closest('button')) return;
                        var unitNumber = parseInt(this.dataset.unitNumber);
                        if (!isProcessing) {
                            isProcessing = true;
                            _closeTopModal();
                            setTimeout(function() {
                                openUnitDetailsModal(residenceId, unitNumber);
                                isProcessing = false;
                            }, 50);
                        }
                    };
                });

                var unitDetailsBtns = document.querySelectorAll('.unit-details-btn');
                unitDetailsBtns.forEach(function(btn) {
                    var newBtn = btn.cloneNode(true);
                    if (btn.parentNode) {
                        btn.parentNode.replaceChild(newBtn, btn);
                    }

                    newBtn.onclick = function(e) {
                        e.stopPropagation();
                        var unitNumber = parseInt(this.dataset.unitNumber);
                        if (!isProcessing) {
                            isProcessing = true;
                            _closeTopModal();
                            setTimeout(function() {
                                openUnitDetailsModal(residenceId, unitNumber);
                                isProcessing = false;
                            }, 50);
                        }
                    };
                });

                var unitAssignBtns = document.querySelectorAll('.unit-assign-btn');
                unitAssignBtns.forEach(function(btn) {
                    var newBtn = btn.cloneNode(true);
                    if (btn.parentNode) {
                        btn.parentNode.replaceChild(newBtn, btn);
                    }

                    newBtn.onclick = function(e) {
                        e.stopPropagation();
                        var unitNumber = parseInt(this.dataset.unitNumber);
                        closeAndReopen(function() {
                            openAssignUnitModal(residenceId, unitNumber, function() {
                                openResidenceDetailsModal(residenceId, onRefresh);
                            });
                        });
                    };
                });

                var unitMarkVacantBtns = document.querySelectorAll('.unit-mark-vacant-btn');
                unitMarkVacantBtns.forEach(function(btn) {
                    var newBtn = btn.cloneNode(true);
                    if (btn.parentNode) {
                        btn.parentNode.replaceChild(newBtn, btn);
                    }

                    newBtn.onclick = function(e) {
                        e.stopPropagation();
                        var unitNumber = parseInt(this.dataset.unitNumber);
                        closeAndReopen(function() {
                            openMarkUnitVacantModal(residenceId, unitNumber, function() {
                                openResidenceDetailsModal(residenceId, onRefresh);
                            });
                        });
                    };
                });

                var unitRemoveBtns = document.querySelectorAll('.unit-remove-btn');
                unitRemoveBtns.forEach(function(btn) {
                    var newBtn = btn.cloneNode(true);
                    if (btn.parentNode) {
                        btn.parentNode.replaceChild(newBtn, btn);
                    }

                    newBtn.onclick = function(e) {
                        e.stopPropagation();
                        var unitNumber = parseInt(this.dataset.unitNumber);
                        closeAndReopen(function() {
                            openRemoveUnitModal(residenceId, unitNumber, function() {
                                openResidenceDetailsModal(residenceId, onRefresh);
                            });
                        });
                    };
                });

                var closeBtn = document.getElementById('closeResDetailsBtn');
                if (closeBtn) {
                    closeBtn.onclick = function() {
                        _closeTopModal();
                        _processingResidenceModal = false;
                        if (onRefresh) {
                            onRefresh();
                        }
                    };
                }

            }, 100);

        } catch (e) {
            _processingResidenceModal = false;
            _showToast('Error opening residence details', 'error');
        }
    }

    // =========================================================================
    // 11. VACATE RESIDENCE MODAL
    // =========================================================================

    function openVacateResidenceModal(residenceId, onSuccess) {
        if (_processingResidenceModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingResidenceModal = true;

        try {
            var residence = _getResidenceById(residenceId);
            if (!residence) {
                _showToast('Residence not found', 'error');
                _processingResidenceModal = false;
                return;
            }

            if (residence.isVacant) {
                _showToast('Residence is already vacant', 'warning');
                _processingResidenceModal = false;
                if (onSuccess) {
                    onSuccess();
                }
                return;
            }

            if (residence.isDemolished) {
                _showToast('Residence has been demolished', 'error');
                _processingResidenceModal = false;
                return;
            }

            var currentYear = _getCurrentYear();
            var householdName = residence.householdName || 'Unknown';

            var modalContent =
                '<div style="margin-bottom: 16px;">' +
                '<div style="background: var(--bg3); border-radius: 6px; padding: 12px; margin-bottom: 12px;">' +
                '<div style="font-size: 0.7rem;"><strong>' + _escapeHtml(residence.name) + '</strong></div>' +
                '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 4px;">Current Household: ' + _escapeHtml(householdName) + '</div>' +
                (residence.assignedYear ? '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 2px;">Assigned: ' + residence.assignedYear + '</div>' : '') +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Vacancy Year</label>' +
                '<input type="number" id="vacateYear" value="' + currentYear + '" min="1" max="' + (currentYear + 5) + '" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Reason</label>' +
                '<select id="vacateReason" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;">' +
                '<option value="household_moved">Household moved out</option>' +
                '<option value="household_disassociated">Household disassociated</option>' +
                '<option value="manual">Manual (admin)</option>' +
                '<option value="sold">Sold</option>' +
                '<option value="destroyed">Destroyed</option>' +
                '</select>' +
                '</div>' +
                '<div style="font-size: 0.55rem; color: var(--warn);">This will make the residence available for assignment to another household.</div>' +
                '</div>';

            _openModal({
                title: 'Vacate Residence: ' + residence.name,
                content: modalContent,
                confirmText: 'Mark Vacant',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var year = parseInt(document.getElementById('vacateYear').value);
                    var reason = document.getElementById('vacateReason').value;

                    if (isNaN(year) || year < 1) {
                        _showToast('Please enter a valid year', 'error');
                        return false;
                    }

                    var result = _markResidenceVacant(residenceId, reason, year);

                    if (result && result.success) {
                        _showToast('Residence "' + residence.name + '" marked vacant' + (reason ? ' (' + reason + ')' : ''), 'success');
                        _closeTopModal();
                        _processingResidenceModal = false;
                        if (onSuccess) {
                            onSuccess();
                        }
                    } else {
                        _showToast(result ? result.reason : 'Failed to mark vacant', 'error');
                    }
                    return true;
                },
                onCancel: function() {
                    _processingResidenceModal = false;
                }
            });

        } catch (e) {
            _processingResidenceModal = false;
            _showToast('Error opening vacate residence modal', 'error');
        }
    }

    // =========================================================================
    // 12. ASSIGN RESIDENCE MODAL
    // =========================================================================

    function openAssignResidenceModal(residenceId, onSuccess) {
        if (_processingResidenceModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingResidenceModal = true;

        try {
            var residence = _getResidenceById(residenceId);
            if (!residence) {
                _showToast('Residence not found', 'error');
                _processingResidenceModal = false;
                return;
            }

            if (!residence.isVacant) {
                _showToast('Residence is not vacant', 'error');
                _processingResidenceModal = false;
                return;
            }

            if (residence.isDemolished) {
                _showToast('Residence has been demolished', 'error');
                _processingResidenceModal = false;
                return;
            }

            var currentYear = _getCurrentYear();

            _openHouseholdSelector({
                title: 'Select Household to Assign to ' + residence.name,
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
                        _processingResidenceModal = false;
                        return;
                    }

                    // Check if household already has a residence
                    var householdUnits = _getHouseholdUnits(household.id);
                    if (householdUnits.length > 0) {
                        _confirmDialog(
                            household.name + ' already occupies ' + householdUnits.length + ' unit(s). Assign them to this residence anyway?',
                            'Existing Residence',
                            function() {
                                _proceedWithResidenceAssignment(residence, household, currentYear, onSuccess);
                            },
                            function() {
                                _processingResidenceModal = false;
                            }
                        );
                    } else {
                        _proceedWithResidenceAssignment(residence, household, currentYear, onSuccess);
                    }
                },
                onCancel: function() {
                    _showToast('Assignment cancelled', 'info');
                    _processingResidenceModal = false;
                }
            });

        } catch (e) {
            _processingResidenceModal = false;
            _showToast('Error opening assign residence modal', 'error');
        }
    }

    function _proceedWithResidenceAssignment(residence, household, year, onSuccess) {
        var unitCount = residence.units ? residence.units.length : 1;
        var unitNumber = 1;

        // Find first vacant unit
        if (residence.units) {
            for (var i = 0; i < residence.units.length; i++) {
                if (residence.units[i].isVacant && !residence.units[i].isDemolished) {
                    unitNumber = residence.units[i].unitNumber;
                    break;
                }
            }
        }

        var result = _assignHouseholdToVacantResidence(
            residence.id,
            household.id,
            household.name,
            year,
            {
                renameOnAssign: false,
                notes: 'Assigned via residence modal',
                reason: 'Assigned'
            }
        );

        if (result && result.success) {
            _showToast(household.name + ' assigned to "' + residence.name + '"' + (result.unitNumber ? ' (Unit ' + result.unitNumber + ')' : ''), 'success');
            _closeTopModal();
            _processingResidenceModal = false;
            if (onSuccess) {
                onSuccess();
            }
        } else {
            _showToast(result ? result.reason : 'Failed to assign household', 'error');
            _processingResidenceModal = false;
        }
    }

    // =========================================================================
    // 13. REHABILITATE RESIDENCE MODAL
    // =========================================================================

    function openRehabilitateResidenceModal(residenceId, onSuccess) {
        if (_processingResidenceModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingResidenceModal = true;

        try {
            var residence = _getResidenceById(residenceId);
            if (!residence) {
                _showToast('Residence not found', 'error');
                _processingResidenceModal = false;
                return;
            }

            if (residence.isDemolished) {
                _showToast('Residence has been demolished', 'error');
                _processingResidenceModal = false;
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
                        _processingResidenceModal = false;
                        if (onSuccess) {
                            onSuccess();
                        }
                    } else {
                        _showToast(result ? result.reason : 'Failed to rehabilitate residence', 'error');
                    }
                    return true;
                },
                onCancel: function() {
                    _processingResidenceModal = false;
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
            _processingResidenceModal = false;
            _showToast('Error opening rehabilitate residence modal', 'error');
        }
    }

    // =========================================================================
    // 14. DEMOLISH RESIDENCE MODAL
    // =========================================================================

    function openDemolishResidenceModal(residenceId, onSuccess) {
        if (_processingResidenceModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingResidenceModal = true;

        try {
            var residence = _getResidenceById(residenceId);
            if (!residence) {
                _showToast('Residence not found', 'error');
                _processingResidenceModal = false;
                return;
            }

            if (residence.isDemolished) {
                _showToast('Residence has already been demolished', 'warning');
                _processingResidenceModal = false;
                if (onSuccess) {
                    onSuccess();
                }
                return;
            }

            var unitStats = _getUnitStats(residenceId);
            if (unitStats.occupied > 0) {
                _showToast('Cannot demolish residence with occupied units. Vacate all units first.', 'error');
                _processingResidenceModal = false;
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

                    // Update residence to demolished
                    var result = _updateResidence(residenceId, {
                        isDemolished: true,
                        demolishedYear: year,
                        demolishedReason: reason,
                        demolishedNotes: notes || null,
                        isVacant: true,
                        vacantYear: year,
                        vacantReason: 'Demolished: ' + reason,
                        householdId: null,
                        householdName: null,
                        status: RESIDENCE_STATUS.DEMOLISHED
                    });

                    if (result) {
                        // Add timeline event
                        _residence.addResidenceTimelineEvent(residenceId, {
                            year: year,
                            type: 'demolished',
                            details: 'Demolished: ' + reason + (notes ? ' (' + notes + ')' : ''),
                            reason: reason,
                            notes: notes
                        });

                        // Update any associated household
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
                        _processingResidenceModal = false;
                        if (onSuccess) {
                            onSuccess();
                        }
                    } else {
                        _showToast('Failed to demolish residence', 'error');
                    }
                    return true;
                },
                onCancel: function() {
                    _processingResidenceModal = false;
                }
            });

        } catch (e) {
            _processingResidenceModal = false;
            _showToast('Error opening demolish residence modal', 'error');
        }
    }

    // =========================================================================
    // 15. RESIDENCE HEIR FINDER MODAL (Placeholder - calls vacancy module)
    // =========================================================================

    function openResidenceHeirFinderModal(residenceId) {
        if (_processingResidenceModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingResidenceModal = true;

        try {
            var residence = _getResidenceById(residenceId);
            if (!residence) {
                _showToast('Residence not found', 'error');
                _processingResidenceModal = false;
                return;
            }

            // Check if vacancy module has heir finder
            if (typeof window.openResidenceHeirFinderModal === 'function' &&
                window.openResidenceHeirFinderModal !== openResidenceHeirFinderModal) {
                _closeTopModal();
                window.openResidenceHeirFinderModal(residenceId);
                _processingResidenceModal = false;
                return;
            }

            // Fallback: show vacancy details
            var vacancyDetails = _getResidenceVacancyDetails(residenceId);
            if (!vacancyDetails || !vacancyDetails.isVacant) {
                _showToast('Residence is not vacant. Heirs are only relevant for vacant properties.', 'warning');
                _processingResidenceModal = false;
                return;
            }

            _showToast('Heir finder will be available in the vacancy management module.', 'info');
            _processingResidenceModal = false;

        } catch (e) {
            _processingResidenceModal = false;
            _showToast('Error opening heir finder', 'error');
        }
    }

    // =========================================================================
    // 16. UNIT MODALS (Stubs - will be expanded)
    // =========================================================================

    function openAddUnitModal(residenceId, onSuccess) {
        if (_processingResidenceModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingResidenceModal = true;

        try {
            var residence = _getResidenceById(residenceId);
            if (!residence) {
                _showToast('Residence not found', 'error');
                _processingResidenceModal = false;
                return;
            }

            if (!residence.isMultiUnit) {
                _showToast('Cannot add units to a non-multi-unit residence', 'error');
                _processingResidenceModal = false;
                return;
            }

            var currentUnits = residence.units || [];
            var maxUnits = residence.maxUnits || 20;
            var unitCount = currentUnits.length;

            if (unitCount >= maxUnits) {
                _showToast('Maximum units reached (' + maxUnits + ')', 'error');
                _processingResidenceModal = false;
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
                        _processingResidenceModal = false;
                        if (onSuccess) {
                            onSuccess(result);
                        }
                    } else {
                        _showToast(result ? result.reason : 'Failed to add unit', 'error');
                    }
                    return true;
                },
                onCancel: function() {
                    _processingResidenceModal = false;
                }
            });

        } catch (e) {
            _processingResidenceModal = false;
            _showToast('Error opening add unit modal', 'error');
        }
    }

    function openRemoveUnitModal(residenceId, unitNumber, onSuccess) {
        if (_processingResidenceModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingResidenceModal = true;

        try {
            var residence = _getResidenceById(residenceId);
            if (!residence) {
                _showToast('Residence not found', 'error');
                _processingResidenceModal = false;
                return;
            }

            var unit = _getResidenceUnit(residenceId, unitNumber);
            if (!unit) {
                _showToast('Unit ' + unitNumber + ' not found', 'error');
                _processingResidenceModal = false;
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
                        _processingResidenceModal = false;
                        if (onSuccess) {
                            onSuccess(result);
                        }
                    } else {
                        _showToast(result ? result.reason : 'Failed to remove unit', 'error');
                    }
                    return true;
                },
                onCancel: function() {
                    _processingResidenceModal = false;
                }
            });

        } catch (e) {
            _processingResidenceModal = false;
            _showToast('Error opening remove unit modal', 'error');
        }
    }

    function openAssignUnitModal(residenceId, unitNumber, onSuccess) {
        if (_processingResidenceModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingResidenceModal = true;

        try {
            var residence = _getResidenceById(residenceId);
            if (!residence) {
                _showToast('Residence not found', 'error');
                _processingResidenceModal = false;
                return;
            }

            var unit = _getResidenceUnit(residenceId, unitNumber);
            if (!unit) {
                _showToast('Unit ' + unitNumber + ' not found', 'error');
                _processingResidenceModal = false;
                return;
            }

            if (!unit.isVacant) {
                _showToast('Unit ' + unitNumber + ' is already occupied', 'error');
                _processingResidenceModal = false;
                return;
            }

            if (unit.isDemolished) {
                _showToast('Unit ' + unitNumber + ' has been demolished', 'error');
                _processingResidenceModal = false;
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
                        _processingResidenceModal = false;
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
                        _processingResidenceModal = false;
                        if (onSuccess) {
                            onSuccess(result);
                        }
                    } else {
                        _showToast(result ? result.reason : 'Failed to assign household', 'error');
                        _processingResidenceModal = false;
                    }
                },
                onCancel: function() {
                    _showToast('Assignment cancelled', 'info');
                    _processingResidenceModal = false;
                }
            });

        } catch (e) {
            _processingResidenceModal = false;
            _showToast('Error opening assign unit modal', 'error');
        }
    }

    function openMarkUnitVacantModal(residenceId, unitNumber, onSuccess) {
        if (_processingResidenceModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingResidenceModal = true;

        try {
            var residence = _getResidenceById(residenceId);
            if (!residence) {
                _showToast('Residence not found', 'error');
                _processingResidenceModal = false;
                return;
            }

            var unit = _getResidenceUnit(residenceId, unitNumber);
            if (!unit) {
                _showToast('Unit ' + unitNumber + ' not found', 'error');
                _processingResidenceModal = false;
                return;
            }

            if (unit.isVacant) {
                _showToast('Unit ' + unitNumber + ' is already vacant', 'info');
                _processingResidenceModal = false;
                if (onSuccess) {
                    onSuccess();
                }
                return;
            }

            if (unit.isDemolished) {
                _showToast('Unit ' + unitNumber + ' has been demolished', 'error');
                _processingResidenceModal = false;
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
                        _processingResidenceModal = false;
                        if (onSuccess) {
                            onSuccess();
                        }
                    } else {
                        _showToast(result ? result.reason : 'Failed to mark unit vacant', 'error');
                    }
                    return true;
                },
                onCancel: function() {
                    _processingResidenceModal = false;
                }
            });

        } catch (e) {
            _processingResidenceModal = false;
            _showToast('Error opening mark unit vacant modal', 'error');
        }
    }

    function openUnitDetailsModal(residenceId, unitNumber) {
        if (_processingResidenceModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingResidenceModal = true;

        try {
            var residence = _getResidenceById(residenceId);
            if (!residence) {
                _showToast('Residence not found', 'error');
                _processingResidenceModal = false;
                return;
            }

            var unit = _getResidenceUnit(residenceId, unitNumber);
            if (!unit) {
                _showToast('Unit ' + unitNumber + ' not found', 'error');
                _processingResidenceModal = false;
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
                    _processingResidenceModal = false;
                }
            });

            setTimeout(function() {
                var assignBtn = document.getElementById('unitAssignBtn');
                if (assignBtn) {
                    assignBtn.onclick = function() {
                        _closeTopModal();
                        openAssignUnitModal(residenceId, unitNumber, function() {
                            _processingResidenceModal = false;
                        });
                    };
                }

                var markVacantBtn = document.getElementById('unitMarkVacantBtn');
                if (markVacantBtn) {
                    markVacantBtn.onclick = function() {
                        _closeTopModal();
                        openMarkUnitVacantModal(residenceId, unitNumber, function() {
                            _processingResidenceModal = false;
                        });
                    };
                }

                var removeBtn = document.getElementById('unitRemoveBtn');
                if (removeBtn) {
                    removeBtn.onclick = function() {
                        _closeTopModal();
                        openRemoveUnitModal(residenceId, unitNumber, function() {
                            _processingResidenceModal = false;
                        });
                    };
                }

                var closeBtn = document.getElementById('unitCloseBtn');
                if (closeBtn) {
                    closeBtn.onclick = function() {
                        _closeTopModal();
                        _processingResidenceModal = false;
                    };
                }
            }, 100);

        } catch (e) {
            _processingResidenceModal = false;
            _showToast('Error opening unit details', 'error');
        }
    }

    // =========================================================================
    // 17. END RESIDENCE ASSOCIATION MODAL
    // =========================================================================

    function openEndResidenceAssociationModal(residenceId, onSuccess) {
        if (_processingResidenceModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingResidenceModal = true;

        try {
            var residence = _getResidenceById(residenceId);
            if (!residence) {
                _showToast('Residence not found', 'error');
                _processingResidenceModal = false;
                return;
            }

            var householdId = residence.householdId;
            if (!householdId) {
                _showToast('Residence is not currently associated with a household', 'warning');
                _processingResidenceModal = false;
                if (onSuccess) {
                    onSuccess();
                }
                return;
            }

            var household = _getHousehold(householdId);
            if (!household) {
                _showToast('Associated household not found', 'error');
                _processingResidenceModal = false;
                return;
            }

            var currentYear = _getCurrentYear();

            var modalContent =
                '<div style="margin-bottom: 16px;">' +
                '<div style="background: var(--bg3); border-radius: 6px; padding: 12px; margin-bottom: 12px;">' +
                '<div style="font-size: 0.7rem;"><strong>Residence:</strong> ' + _escapeHtml(residence.name) + '</div>' +
                '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 4px;"><strong>Household:</strong> ' + _escapeHtml(household.name) + '</div>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Year Association Ended</label>' +
                '<input type="number" id="endAssocYear" value="' + currentYear + '" min="1" max="' + (currentYear + 5) + '" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Reason</label>' +
                '<select id="endAssocReason" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;">' +
                '<option value="household_moved">Household moved out</option>' +
                '<option value="residence_sold">Residence sold</option>' +
                '<option value="inheritance">Inheritance / Transfer</option>' +
                '<option value="destruction">Residence destroyed</option>' +
                '<option value="disassociation">Voluntary disassociation</option>' +
                '<option value="custom">Custom reason</option>' +
                '</select>' +
                '</div>' +
                '<div id="customEndReasonGroup" style="display: none; margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Custom Reason</label>' +
                '<input type="text" id="customEndReason" placeholder="Enter custom reason..." style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '</div>' +
                '<div style="font-size: 0.55rem; color: var(--dim);">This will mark the association as ended but keep it in the historical record.</div>' +
                '</div>';

            _openModal({
                title: 'End Association: ' + household.name + ' & ' + residence.name,
                content: modalContent,
                confirmText: 'End Association',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var endedYear = parseInt(document.getElementById('endAssocYear').value);
                    var reasonSelect = document.getElementById('endAssocReason').value;
                    var customReason = document.getElementById('customEndReason') ? document.getElementById('customEndReason').value : '';

                    var reason = reasonSelect === 'custom' ? (customReason || 'Ended') : reasonSelect;

                    if (isNaN(endedYear) || endedYear < 1) {
                        _showToast('Please enter a valid year', 'error');
                        return false;
                    }

                    var result = _residence.endResidenceAssociation(residenceId, householdId, endedYear, reason);

                    if (result) {
                        _showToast('Association ended between ' + household.name + ' and ' + residence.name, 'success');
                        _closeTopModal();
                        _processingResidenceModal = false;
                        if (onSuccess) {
                            onSuccess();
                        }
                    } else {
                        _showToast('Failed to end association', 'error');
                    }
                    return true;
                },
                onCancel: function() {
                    _processingResidenceModal = false;
                }
            });

            setTimeout(function() {
                var reasonSelect = document.getElementById('endAssocReason');
                var customGroup = document.getElementById('customEndReasonGroup');
                if (reasonSelect) {
                    reasonSelect.onchange = function() {
                        if (customGroup) {
                            customGroup.style.display = reasonSelect.value === 'custom' ? 'block' : 'none';
                        }
                    };
                }
            }, 100);

        } catch (e) {
            _processingResidenceModal = false;
            _showToast('Error opening end association modal', 'error');
        }
    }

    // =========================================================================
    // 18. RESIDENCE SELECTOR
    // =========================================================================

    function openResidenceSelector(options) {
        if (_processingResidenceModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingResidenceModal = true;

        try {
            options = options || {};

            var title = options.title || 'Select Residence';
            var locationId = options.locationId || null;
            var vacantOnly = options.vacantOnly || false;
            var onSelect = options.onSelect || function() {};
            var onCancel = options.onCancel || function() {};

            var residences = locationId ? _getResidencesByLocation(locationId) : _getResidences();

            if (vacantOnly) {
                residences = residences.filter(function(r) { return r.isVacant && !r.isDemolished; });
            } else {
                residences = residences.filter(function(r) { return !r.isDemolished; });
            }

            if (residences.length === 0) {
                _showToast('No residences available', 'error');
                _processingResidenceModal = false;
                if (onCancel) onCancel();
                return;
            }

            var optionsHtml = residences.map(function(r) {
                var status = r.isVacant ? 'Vacant' : 'Occupied';
                var statusColor = r.isVacant ? '#c87040' : '#4a9e6a';
                var unitCount = r.units ? r.units.length : 1;
                var locationName = r.locationName || 'Unknown';
                return '<option value="' + r.id + '">' +
                    _escapeHtml(r.name) + ' (' + _escapeHtml(locationName) + ') - ' + status +
                    (r.isMultiUnit ? ' - ' + unitCount + ' units' : '') +
                    '</option>';
            }).join('');

            var modalContent =
                '<div style="margin-bottom: 16px;">' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Select Residence</label>' +
                '<select id="residenceSelectorSelect" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '<option value="">— Select a residence —</option>' +
                optionsHtml +
                '</select>' +
                '</div>' +
                '</div>';

            _openModal({
                title: title,
                content: modalContent,
                confirmText: 'Select',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var select = document.getElementById('residenceSelectorSelect');
                    if (select && select.value) {
                        var residence = _getResidenceById(select.value);
                        if (residence) {
                            _closeTopModal();
                            _processingResidenceModal = false;
                            onSelect(residence);
                        } else {
                            _showToast('Residence not found', 'error');
                            return false;
                        }
                    } else {
                        _showToast('Please select a residence', 'error');
                        return false;
                    }
                    return true;
                },
                onCancel: function() {
                    _processingResidenceModal = false;
                    if (onCancel) onCancel();
                }
            });

        } catch (e) {
            _processingResidenceModal = false;
            _showToast('Error opening residence selector', 'error');
        }
    }

    // =========================================================================
    // 19. EXPORTS
    // =========================================================================

    window.openNewResidenceModal = openNewResidenceModal;
    window.openEditResidenceModal = openEditResidenceModal;
    window.openDeleteResidenceModal = openDeleteResidenceModal;
    window.openResidenceDetailsModal = openResidenceDetailsModal;
    window.openRenameResidenceModal = openRenameResidenceModal;
    window.openResidenceNameHistoryModal = openResidenceNameHistoryModal;
    window.openAssignResidenceModal = openAssignResidenceModal;
    window.openVacateResidenceModal = openVacateResidenceModal;
    window.openRehabilitateResidenceModal = openRehabilitateResidenceModal;
    window.openDemolishResidenceModal = openDemolishResidenceModal;
    window.openResidenceHeirFinderModal = openResidenceHeirFinderModal;
    window.openAddUnitModal = openAddUnitModal;
    window.openRemoveUnitModal = openRemoveUnitModal;
    window.openAssignUnitModal = openAssignUnitModal;
    window.openMarkUnitVacantModal = openMarkUnitVacantModal;
    window.openUnitDetailsModal = openUnitDetailsModal;
    window.openResidenceSelector = openResidenceSelector;
    window.openEndResidenceAssociationModal = openEndResidenceAssociationModal;

    // ES Module exports
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            openNewResidenceModal: openNewResidenceModal,
            openEditResidenceModal: openEditResidenceModal,
            openDeleteResidenceModal: openDeleteResidenceModal,
            openResidenceDetailsModal: openResidenceDetailsModal,
            openRenameResidenceModal: openRenameResidenceModal,
            openResidenceNameHistoryModal: openResidenceNameHistoryModal,
            openAssignResidenceModal: openAssignResidenceModal,
            openVacateResidenceModal: openVacateResidenceModal,
            openRehabilitateResidenceModal: openRehabilitateResidenceModal,
            openDemolishResidenceModal: openDemolishResidenceModal,
            openResidenceHeirFinderModal: openResidenceHeirFinderModal,
            openAddUnitModal: openAddUnitModal,
            openRemoveUnitModal: openRemoveUnitModal,
            openAssignUnitModal: openAssignUnitModal,
            openMarkUnitVacantModal: openMarkUnitVacantModal,
            openUnitDetailsModal: openUnitDetailsModal,
            openResidenceSelector: openResidenceSelector,
            openEndResidenceAssociationModal: openEndResidenceAssociationModal
        };
    }

})();