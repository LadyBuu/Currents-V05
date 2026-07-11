/**
 * =============================================================================
 * HOUSEHOLD OVERVIEW TAB (householdOverviewTab.js)
 * =============================================================================
 * 
 * UPDATED: Uses new HouseholdState/HouseholdCommands/HouseholdQueries system
 * 
 * DEPENDENCIES:
 *   - household-state.js (HouseholdState)
 *   - household-commands.js (HouseholdCommands)
 *   - household-queries.js (HouseholdQueries)
 *   - residence-system.js (ResidenceSystem)
 *   - modals-core.js (_escapeHtml, _showToast, _getIcon)
 *   - modals-char-select.js (openCharacterSelector)
 *   - modals-household-selector.js (openHouseholdSelector)
 *   - modals-residence.js (openResidenceDetailsModal, openEditResidenceModal, openRenameResidenceModal)
 *   - modals-residence-vacancy.js (openMarkResidenceVacantModal, openAssignResidenceToHouseholdModal)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. RECURSION GUARD
    // =========================================================================

    var _rendering = false;

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

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

    function _showToast(msg, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(msg, type);
        } else if (typeof window.showToast === 'function') {
            window.showToast(msg, type);
        } else if (typeof window.showToastMessage === 'function') {
            window.showToastMessage(msg, type);
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

    function _promptDialog(message, defaultValue, onConfirm, onCancel) {
        if (typeof window.promptDialog === 'function') {
            return window.promptDialog(message, defaultValue, onConfirm, onCancel);
        }
        if (typeof window._promptDialog === 'function') {
            return window._promptDialog(message, defaultValue, onConfirm, onCancel);
        }
        var result = prompt(message, defaultValue);
        if (result !== null && result.trim()) {
            if (onConfirm) onConfirm(result.trim());
        } else {
            if (onCancel) onCancel();
        }
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

    // =========================================================================
    // 2. STATE, COMMANDS, AND QUERIES REFERENCE
    // =========================================================================

    var _state = window.HouseholdState;
    var _commands = window.HouseholdCommands;
    var _queries = window.HouseholdQueries;
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

    function _getHouseholdMembers(householdId) {
        var household = _getHousehold(householdId);
        return household ? (household.members || []) : [];
    }

    function _getHouseholdHead(householdId) {
        return _state ? _state.getHouseholdHead(householdId) : null;
    }

    function _getHouseholdLocation(householdId) {
        var household = _getHousehold(householdId);
        if (!household || !household.locationId) return null;
        return _getPlaceById(household.locationId);
    }

    function _getHouseholdNameHistory(householdId) {
        var household = _getHousehold(householdId);
        return household ? (household.nameHistory || []) : [];
    }

    function _getHouseholdWealth(householdId) {
        var household = _getHousehold(householdId);
        return household ? (household.wealth || 0) : 0;
    }

    function _getHouseholdReputation(householdId) {
        var household = _getHousehold(householdId);
        return household ? (household.reputation || 50) : 50;
    }

    function _getHouseholdStatus(householdId) {
        return _state ? _state.getHouseholdStatus(householdId) : { status: 'active', statusMessage: 'Active' };
    }

    function _getHouseholdSnapshot(householdId, year) {
        if (typeof window.getHouseholdSnapshot === 'function') {
            return window.getHouseholdSnapshot(householdId, year);
        }
        return null;
    }

    function _updateHousehold(householdId, updates) {
        return _state ? _state.updateHousehold(householdId, updates, { recordHistory: false }) : null;
    }

    // =========================================================================
    // 5. RESIDENCE WRAPPERS
    // =========================================================================

    function _getResidencesByHousehold(householdId) {
        return _residence ? _residence.getResidencesByHousehold(householdId) : [];
    }

    function _getResidenceById(residenceId) {
        return _residence ? _residence.getResidenceById(residenceId) : null;
    }

    function _getVacantResidences(locationId) {
        return _residence ? _residence.getVacantResidences(locationId) : [];
    }

    function _createResidence(data) {
        return _residence ? _residence.createResidence(data.name, data.locationId, data.typeId, data) : null;
    }

    function _associateResidenceWithHousehold(residenceId, householdId, householdName, options) {
        if (typeof window.associateResidenceWithHousehold === 'function') {
            return window.associateResidenceWithHousehold(residenceId, householdId, householdName, options);
        }
        // Use assignHouseholdToVacantResidence as fallback
        if (_residence && typeof _residence.assignHouseholdToVacantResidence === 'function') {
            var year = (options && options.year) || _getCurrentYear();
            return _residence.assignHouseholdToVacantResidence(residenceId, householdId, householdName, year, {
                notes: (options && options.notes) || 'Associated with household'
            });
        }
        return false;
    }

    function _disassociateResidenceFromHousehold(residenceId, reason, year) {
        if (typeof window.disassociateResidenceFromHousehold === 'function') {
            return window.disassociateResidenceFromHousehold(residenceId, reason, year);
        }
        if (_residence && typeof _residence.endResidenceAssociation === 'function') {
            var residence = _getResidenceById(residenceId);
            if (residence && residence.householdId) {
                return _residence.endResidenceAssociation(residenceId, residence.householdId, year || _getCurrentYear(), reason || 'Disassociated');
            }
        }
        return false;
    }

    function _updateResidence(residenceId, updates) {
        return _residence ? _residence.updateResidence(residenceId, updates) : null;
    }

    function _getResidenceStatus(residence) {
        if (typeof window.getResidenceStatus === 'function') {
            return window.getResidenceStatus(residence);
        }
        if (!residence) return { status: 'unknown', label: 'Unknown', icon: '?', color: '#8a8a8a' };
        var isVacant = residence.isVacant === true;
        var hasHousehold = !!residence.householdId;
        if (hasHousehold && !isVacant) {
            return { status: 'occupied', label: 'Occupied', icon: '✓', color: '#4a9e6a' };
        } else if (hasHousehold && isVacant) {
            return { status: 'vacant', label: 'Vacant', icon: '⚠', color: '#c87040' };
        } else {
            return { status: 'empty', label: 'Empty', icon: '⌇', color: '#8a8a8a' };
        }
    }

    // =========================================================================
    // 6. MODAL WRAPPERS
    // =========================================================================

    function _openResidenceDetailsModal(residenceId, onRefresh) {
        if (typeof window.openResidenceDetailsModal === 'function') {
            return window.openResidenceDetailsModal(residenceId, onRefresh);
        }
        if (typeof window._openResidenceDetailsModal === 'function') {
            return window._openResidenceDetailsModal(residenceId, onRefresh);
        }
        _showToast('Residence details modal not available', 'error');
        return null;
    }

    function _openEditResidenceModal(residenceId, onSuccess) {
        if (typeof window.openEditResidenceModal === 'function') {
            return window.openEditResidenceModal(residenceId, onSuccess);
        }
        if (typeof window._openEditResidenceModal === 'function') {
            return window._openEditResidenceModal(residenceId, onSuccess);
        }
        _showToast('Edit residence modal not available', 'error');
        return null;
    }

    function _openRenameResidenceModal(residenceId, onSuccess) {
        if (typeof window.openRenameResidenceModal === 'function') {
            return window.openRenameResidenceModal(residenceId, onSuccess);
        }
        if (typeof window._openRenameResidenceModal === 'function') {
            return window._openRenameResidenceModal(residenceId, onSuccess);
        }
        _showToast('Rename residence modal not available', 'error');
        return null;
    }

    function _openMarkResidenceVacantModal(residenceId, onSuccess) {
        if (typeof window.openMarkResidenceVacantModal === 'function') {
            return window.openMarkResidenceVacantModal(residenceId, onSuccess);
        }
        if (typeof window._openMarkResidenceVacantModal === 'function') {
            return window._openMarkResidenceVacantModal(residenceId, onSuccess);
        }
        _showToast('Mark residence vacant modal not available', 'error');
        return null;
    }

    function _openAssignResidenceToHouseholdModal(householdId, onSuccess, options) {
        if (typeof window.openAssignResidenceToHouseholdModal === 'function') {
            return window.openAssignResidenceToHouseholdModal(householdId, onSuccess, options);
        }
        if (typeof window._openAssignResidenceToHouseholdModal === 'function') {
            return window._openAssignResidenceToHouseholdModal(householdId, onSuccess, options);
        }
        _showToast('Assign residence modal not available', 'error');
        return null;
    }

    function _openAddResidenceModal(locationId, locationName, onSuccess) {
        if (typeof window.openAddResidenceModal === 'function') {
            return window.openAddResidenceModal(locationId, locationName, onSuccess);
        }
        if (typeof window._openAddResidenceModal === 'function') {
            return window._openAddResidenceModal(locationId, locationName, onSuccess);
        }
        _showToast('Add residence modal not available', 'error');
        return null;
    }

    function _openEditHouseholdModal(householdId, onSuccess) {
        if (typeof window.openEditHouseholdModal === 'function') {
            return window.openEditHouseholdModal(householdId, onSuccess);
        }
        if (typeof window._openEditHouseholdModal === 'function') {
            return window._openEditHouseholdModal(householdId, onSuccess);
        }
        _showToast('Edit household modal not available', 'error');
        return null;
    }

    function _openRenameHouseholdModal(householdId, onSuccess) {
        if (typeof window.openRenameHouseholdModal === 'function') {
            return window.openRenameHouseholdModal(householdId, onSuccess);
        }
        if (typeof window._openRenameHouseholdModal === 'function') {
            return window._openRenameHouseholdModal(householdId, onSuccess);
        }
        _showToast('Rename household modal not available', 'error');
        return null;
    }

    function _openDeleteHouseholdModal(householdId, onSuccess) {
        if (typeof window.openDeleteHouseholdModal === 'function') {
            return window.openDeleteHouseholdModal(householdId, onSuccess);
        }
        if (typeof window._openDeleteHouseholdModal === 'function') {
            return window._openDeleteHouseholdModal(householdId, onSuccess);
        }
        _showToast('Delete household modal not available', 'error');
        return null;
    }

    function _openAddMemberModal(householdId, type, onSuccess) {
        if (typeof window.openAddMemberModal === 'function') {
            return window.openAddMemberModal(householdId, type, onSuccess);
        }
        if (typeof window._openAddMemberModal === 'function') {
            return window._openAddMemberModal(householdId, type, onSuccess);
        }
        _showToast('Add member modal not available', 'error');
        return null;
    }

    // =========================================================================
    // 7. LOCATION SETTING HELPERS
    // =========================================================================

    function buildLocationOptions(selectedId) {
        selectedId = selectedId || null;
        var places = _getPlaces();
        var placesByCountry = {};

        for (var i = 0; i < places.length; i++) {
            var place = places[i];
            if (!place.variableKey && place.variableKey !== '') continue;
            var countryId = typeof window.getCountryId === 'function' ? window.getCountryId(place) : null;
            var country = countryId ? _getPlaceById(countryId) : null;
            var countryName = country ? country.displayName : 'Other Locations';

            if (!placesByCountry[countryName]) {
                placesByCountry[countryName] = [];
            }
            placesByCountry[countryName].push(place);
        }

        for (var country in placesByCountry) {
            placesByCountry[country].sort(function(a, b) { return a.displayName.localeCompare(b.displayName); });
        }

        var html = '<option value="">No location (optional)</option>';
        var sortedCountries = Object.keys(placesByCountry).sort();

        for (var i = 0; i < sortedCountries.length; i++) {
            var country = sortedCountries[i];
            var countryPlaces = placesByCountry[country];
            html += '<optgroup label="' + _escapeHtml(country) + '">';
            for (var j = 0; j < countryPlaces.length; j++) {
                var place = countryPlaces[j];
                var selected = (selectedId === place.id) ? 'selected' : '';
                html += '<option value="' + place.id + '" ' + selected + '>' + _escapeHtml(place.displayName) + '</option>';
            }
            html += '</optgroup>';
        }

        return html;
    }

    function openSetLocationModal(householdId, onSuccess) {
        var places = _getPlaces();
        if (places.length === 0) {
            _showToast('No locations available. Create a location first.', 'error');
            return;
        }

        var locationOptions = buildLocationOptions(null);

        var modalContent =
            '<div class="info-box" style="margin-bottom:16px;padding:12px;background:var(--bg3);border-radius:8px;font-size:0.65rem;">' +
            'Select a location for this household. This will enable residence creation and assignment.' +
            '</div>' +
            '<div class="form-group" style="margin-bottom:12px;">' +
            '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Select Location</label>' +
            '<select id="locationSelect" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;">' +
            '<option value="">— Select a location —</option>' +
            locationOptions +
            '</select></div>';

        _openModal({
            title: 'Set Household Location',
            content: modalContent,
            confirmText: 'Set Location',
            cancelText: 'Cancel',
            onConfirm: function() {
                var locationId = document.getElementById('locationSelect').value;
                if (!locationId) {
                    _showToast('Please select a location', 'error');
                    return false;
                }

                var result = _updateHousehold(householdId, { locationId: locationId });
                if (result) {
                    _showToast('Household location set', 'success');
                    _closeTopModal();
                    if (onSuccess) onSuccess();
                } else {
                    _showToast('Failed to set location', 'error');
                }
                return true;
            }
        });
    }

    // =========================================================================
    // 8. CREATE RESIDENCE MODAL
    // =========================================================================

    function openCreateResidenceModal(householdId, locationId, locationName, onSuccess) {
        var household = _getHousehold(householdId);

        _openAddResidenceModal(locationId, locationName, function(newResidenceId) {
            if (newResidenceId) {
                var result = _associateResidenceWithHousehold(
                    newResidenceId,
                    householdId,
                    household ? household.name : null,
                    {
                        year: _getCurrentYear(),
                        notes: 'Created for household'
                    }
                );
                if (result) {
                    _showToast('Residence created and associated with household', 'success');
                } else {
                    _showToast('Residence created but could not be associated with household', 'warning');
                }
                if (onSuccess) onSuccess(newResidenceId);
            }
        });
    }

    // =========================================================================
    // 9. ASSIGN VACANT RESIDENCE MODAL
    // =========================================================================

    function openAssignVacantResidenceModal(householdId, locationId, locationName, onSuccess) {
        var household = _getHousehold(householdId);
        if (!household) {
            _showToast('Household not found', 'error');
            if (onSuccess) onSuccess(null);
            return;
        }

        _openAssignResidenceToHouseholdModal(
            householdId,
            function(result) {
                if (result && result.success) {
                    _showToast('Residence assigned to ' + household.name, 'success');
                }
                if (onSuccess) onSuccess(result);
            },
            { locationId: locationId }
        );
    }

    // =========================================================================
    // 10. RESIDENCE SECTION RENDERER
    // =========================================================================

    function renderResidenceSection(householdId, household, location) {
        var residences = _getResidencesByHousehold(householdId);
        var currentResidence = residences.length > 0 ? residences[0] : null;
        var hasResidence = currentResidence !== null;
        var locationId = household.locationId;
        var locationName = location ? location.displayName : household.locationName || 'Unknown';

        var html = '<div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border);">';
        html += '<div style="font-size:0.7rem;color:var(--accent);margin-bottom:12px;">Residence</div>';

        if (hasResidence) {
            var res = currentResidence;
            var typeIcon = res.typeIcon || '';
            var conditionIcon = '';
            if (res.condition === 'pristine') conditionIcon = '⭐';
            else if (res.condition === 'good') conditionIcon = '✓';
            else if (res.condition === 'deteriorating') conditionIcon = '⚠';
            else if (res.condition === 'damaged') conditionIcon = '✗';

            var isVacant = res.isVacant === true;
            var status = _getResidenceStatus(res);

            html += (
                '<div style="background:var(--bg3);border-radius:8px;padding:12px;border-left:3px solid ' + (isVacant ? '#ff9800' : '#4caf50') + ';">' +
                '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;">' +
                '<div>' +
                '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">' +
                (typeIcon ? '<span style="font-size:1rem;">' + typeIcon + '</span>' : '') +
                '<strong style="font-size:0.8rem;">' + _escapeHtml(res.name) + '</strong>' +
                '<span style="font-size:0.55rem;color:var(--accent);">' + _escapeHtml(res.typeName || res.typeId) + '</span>' +
                (isVacant ? '<span style="font-size:0.55rem;color:#ff9800;">Vacant</span>' : '<span style="font-size:0.55rem;color:#4caf50;">Occupied</span>') +
                '</div>' +
                '<div style="font-size:0.6rem;color:var(--dim);margin-top:4px;">' +
                conditionIcon + ' ' + _escapeHtml(res.condition || 'good') + ' · ' +
                'Value: ' + (res.estimatedValue || 0).toLocaleString() + ' gold' +
                (res.builtYear ? ' · Built: ' + res.builtYear : '') +
                '</div>' +
                (res.description ? '<div style="font-size:0.55rem;color:var(--dim);margin-top:4px;">' + _escapeHtml(res.description) + '</div>' : '') +
                (res.features && res.features.length > 0 ?
                    '<div style="font-size:0.5rem;color:var(--dim);margin-top:4px;">Features: ' + res.features.join(', ') + '</div>' : '') +
                '</div>' +
                '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
                '<button class="view-residence-btn btn small" data-res-id="' + res.id + '" style="padding:3px 8px;font-size:0.55rem;cursor:pointer;">View</button>' +
                '<button class="edit-residence-btn btn small" data-res-id="' + res.id + '" style="padding:3px 8px;font-size:0.55rem;cursor:pointer;">Edit</button>' +
                '<button class="disassociate-residence-btn btn small" data-res-id="' + res.id + '" style="padding:3px 8px;font-size:0.55rem;background:#8a3020;color:white;border:none;cursor:pointer;">Disassociate</button>' +
                '</div></div>' +
                (res.notes ? '<div style="font-size:0.5rem;color:var(--dim);margin-top:6px;padding-top:6px;border-top:1px solid var(--border-light);">' + _escapeHtml(res.notes) + '</div>' : '') +
                '</div>'
            );

            if (isVacant) {
                html += (
                    '<div style="margin-top:8px;display:flex;gap:8px;">' +
                    '<button id="assignHouseholdToResidenceBtn" class="btn small primary" style="padding:4px 12px;font-size:0.6rem;background:var(--accent);border:none;color:white;border-radius:4px;cursor:pointer;">Re-assign Household</button>' +
                    '</div>'
                );
            }

        } else {
            if (locationId) {
                var vacantResidences = _getVacantResidences(locationId);
                var hasVacant = vacantResidences.length > 0;

                html += (
                    '<div style="background:var(--bg3);border-radius:8px;padding:16px;text-align:center;border:1px dashed var(--border);">' +
                    '<div style="font-size:0.9rem;margin-bottom:8px;">⌂</div>' +
                    '<div style="font-size:0.7rem;color:var(--dim);">No residence associated with this household</div>' +
                    '<div style="font-size:0.55rem;color:var(--dim);margin-top:4px;">Location: ' + _escapeHtml(locationName) + '</div>' +
                    '<div style="margin-top:12px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">' +
                    '<button id="createResidenceBtn" class="btn primary" style="padding:6px 16px;font-size:0.65rem;background:var(--accent);border:none;color:white;border-radius:6px;cursor:pointer;">Create New Residence</button>' +
                    (hasVacant ? '<button id="assignVacantResidenceBtn" class="btn" style="padding:6px 16px;font-size:0.65rem;background:var(--bg2);border:1px solid var(--border);border-radius:6px;cursor:pointer;">Assign Vacant Residence</button>' : '') +
                    '</div></div>'
                );
            } else {
                html += (
                    '<div style="background:var(--bg3);border-radius:8px;padding:16px;text-align:center;border:1px dashed var(--warn);">' +
                    '<div style="font-size:0.9rem;margin-bottom:8px;">⚠</div>' +
                    '<div style="font-size:0.7rem;color:var(--warn);">Household has no location set</div>' +
                    '<div style="font-size:0.55rem;color:var(--dim);margin-top:4px;">Set a location first to create or assign a residence</div>' +
                    '<button id="setLocationForResidenceBtn" class="btn primary" style="margin-top:12px;padding:6px 16px;font-size:0.65rem;background:var(--accent);border:none;color:white;border-radius:6px;cursor:pointer;">Set Household Location</button>' +
                    '</div>'
                );
            }
        }

        html += '</div>';
        return html;
    }

    // =========================================================================
    // 11. MAIN RENDER FUNCTION
    // =========================================================================

    function renderHouseholdOverviewTab(containerId, householdId) {
        if (_rendering) return;
        _rendering = true;

        try {
            var container = document.getElementById(containerId);
            if (!container) return;

            var household = _getHousehold(householdId);
            if (!household) {
                container.innerHTML = '<div class="empty-state">Household not found</div>';
                return;
            }

            var currentYear = _getCurrentYear();

            // Get household snapshot for current year
            var snapshot = null;
            var nameAtTime = household.name;
            var isNameHistoryActive = false;
            var periodYear = null;
            var periodEnd = null;
            var totalPeriods = 0;

            if (typeof window.getHouseholdSnapshot === 'function') {
                snapshot = window.getHouseholdSnapshot(householdId, currentYear);
                if (snapshot) {
                    nameAtTime = snapshot.nameAtTime || household.name;
                    isNameHistoryActive = snapshot.periodIndex > 0;
                    periodYear = snapshot.periodYear;
                    periodEnd = snapshot.periodEnd;
                    totalPeriods = snapshot.periodIndex !== undefined ? snapshot.periodIndex + 1 : 0;
                }
            }

            var members = _getHouseholdMembers(householdId);
            var head = _getHouseholdHead(householdId);
            var location = _getHouseholdLocation(householdId);
            var nameHistory = _getHouseholdNameHistory(householdId);
            var wealth = _getHouseholdWealth(householdId);
            var reputation = _getHouseholdReputation(householdId);
            var statusInfo = _getHouseholdStatus(householdId);

            var familyMembers = [];
            var staffMembers = [];
            for (var i = 0; i < members.length; i++) {
                if (members[i].type === 'family') familyMembers.push(members[i]);
                else staffMembers.push(members[i]);
            }

            // Build name history HTML
            var historyHtml = '';
            if (nameHistory && nameHistory.length > 0) {
                var recentHistory = nameHistory.slice(-5).reverse();
                historyHtml =
                    '<div class="name-history-section" style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);">' +
                    '<div style="font-size:0.6rem;color:var(--accent);margin-bottom:8px;">Name History (' + nameHistory.length + ' changes)</div>';
                for (var i = 0; i < recentHistory.length; i++) {
                    var h = recentHistory[i];
                    var isCurrent = i === 0 && !h.periodEnd;
                    historyHtml +=
                        '<div style="font-size:0.55rem;color:var(--dim);padding:4px 0;border-bottom:1px solid var(--border-light);' + (isCurrent ? 'background:var(--accent-dim);border-radius:4px;padding:4px 8px;' : '') + '">' +
                        '<strong>' + h.year + ':</strong> ' + _escapeHtml(h.oldName || '—') + ' → ' + _escapeHtml(h.newName) +
                        (h.reason ? '<span style="font-size:0.5rem;color:var(--dim);margin-left:8px;">(' + _escapeHtml(h.reason) + ')</span>' : '') +
                        (isCurrent ? ' <span style="font-size:0.45rem;color:var(--accent);">(Current)</span>' : '') +
                        '</div>';
                }
                if (nameHistory.length > 5) {
                    historyHtml += '<div style="font-size:0.5rem;color:var(--dim);text-align:center;padding-top:4px;">... and ' + (nameHistory.length - 5) + ' more</div>';
                }
                historyHtml += '</div>';
            }

            var statusColor = '#4a9e6a';
            if (statusInfo.status === 'vacant') statusColor = '#ff9800';
            else if (statusInfo.status === 'abandoned') statusColor = '#f44336';

            // Build members HTML
            var membersHtml = '';
            if (members.length === 0) {
                membersHtml = '<div style="color:var(--dim);font-size:0.6rem;text-align:center;padding:20px;">No members</div>';
            } else {
                if (familyMembers.length > 0) {
                    membersHtml +=
                        '<div style="margin-bottom:8px;">' +
                        '<div style="font-size:0.55rem;color:var(--accent);margin-bottom:4px;">Family (' + familyMembers.length + ')</div>';
                    var displayFamily = familyMembers.slice(0, 10);
                    for (var i = 0; i < displayFamily.length; i++) {
                        var m = displayFamily[i];
                        var char = _getCharacterById(m.characterId);
                        if (!char) continue;
                        var isHead = m.isHead || (head && head.id === char.id);
                        membersHtml +=
                            '<div class="clickable-member" data-character-id="' + char.id + '" style="' +
                            'display:flex;' +
                            'justify-content:space-between;' +
                            'align-items:center;' +
                            'padding:4px 8px;' +
                            'border-bottom:1px solid var(--border-light);' +
                            'cursor:pointer;' +
                            'transition:background 0.2s;' +
                            '">' +
                            '<span style="font-size:0.65rem;">' + _escapeHtml(char.name) + ' ' + _escapeHtml(char.surname || '') + '</span>' +
                            '<span style="font-size:0.5rem;color:var(--dim);">' +
                            (isHead ? 'Head' : '') +
                            (m.role && !isHead ? _escapeHtml(m.role) : '') +
                            (m.joinedYear ? '· ' + m.joinedYear : '') +
                            '</span></div>';
                    }
                    if (familyMembers.length > 10) {
                        membersHtml += '<div style="font-size:0.5rem;color:var(--dim);text-align:center;padding-top:4px;">... and ' + (familyMembers.length - 10) + ' more</div>';
                    }
                    membersHtml += '</div>';
                }

                if (staffMembers.length > 0) {
                    membersHtml +=
                        '<div style="margin-bottom:8px;">' +
                        '<div style="font-size:0.55rem;color:var(--accent);margin-bottom:4px;">Staff (' + staffMembers.length + ')</div>';
                    var displayStaff = staffMembers.slice(0, 10);
                    for (var i = 0; i < displayStaff.length; i++) {
                        var m = displayStaff[i];
                        var char = _getCharacterById(m.characterId);
                        if (!char) continue;
                        membersHtml +=
                            '<div class="clickable-member" data-character-id="' + char.id + '" style="' +
                            'display:flex;' +
                            'justify-content:space-between;' +
                            'align-items:center;' +
                            'padding:4px 8px;' +
                            'border-bottom:1px solid var(--border-light);' +
                            'cursor:pointer;' +
                            'transition:background 0.2s;' +
                            '">' +
                            '<span style="font-size:0.65rem;">' + _escapeHtml(char.name) + ' ' + _escapeHtml(char.surname || '') + '</span>' +
                            '<span style="font-size:0.5rem;color:var(--dim);">' +
                            (m.role ? _escapeHtml(m.role) : 'Staff') +
                            (m.joinedYear ? '· ' + m.joinedYear : '') +
                            '</span></div>';
                    }
                    if (staffMembers.length > 10) {
                        membersHtml += '<div style="font-size:0.5rem;color:var(--dim);text-align:center;padding-top:4px;">... and ' + (staffMembers.length - 10) + ' more</div>';
                    }
                    membersHtml += '</div>';
                }
            }

            var residenceHtml = renderResidenceSection(householdId, household, location);

            var periodIndicator = '';
            if (isNameHistoryActive && periodYear) {
                var periodText = 'Current name period (since ' + periodYear;
                if (periodEnd) {
                    periodText += ' until ' + periodEnd;
                }
                periodText += ')';
                periodIndicator = '<div style="font-size:0.55rem;color:var(--accent-dim);margin-top:2px;">' + periodText + '</div>';
            } else if (totalPeriods > 0) {
                periodIndicator = '<div style="font-size:0.55rem;color:var(--dim);margin-top:2px;">Original name (unchanged)</div>';
            }

            // =========================================================================
            // BUILD COMPLETE HTML
            // =========================================================================
            var html =
                '<div class="household-overview" style="max-width:800px;margin:0 auto;">' +

                // Header with snapshot name
                '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;margin-bottom:20px;">' +
                '<div>' +
                '<h2 style="margin:0;font-size:1.2rem;color:var(--accent);">' + _escapeHtml(nameAtTime) + '</h2>' +
                periodIndicator +
                '<div style="font-size:0.6rem;color:var(--dim);margin-top:4px;">' +
                'Founded: ' + (household.foundedYear || 'Unknown') + ' · ' +
                'Status: <span style="color:' + statusColor + ';">' + statusInfo.statusMessage + '</span>' +
                (household.abandonedYear ? ' · Abandoned: ' + household.abandonedYear : '') +
                (totalPeriods > 1 ? ' · ' + totalPeriods + ' name periods' : '') +
                '</div></div>' +
                '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
                '<button id="editHouseholdBtn" class="btn small" style="padding:4px 10px;">Edit</button>' +
                '<button id="renameHouseholdBtn" class="btn small" style="padding:4px 10px;">Rename</button>' +
                '<button id="deleteHouseholdBtn" class="btn small danger" style="padding:4px 10px;">Delete</button>' +
                '</div></div>' +

                // Stats
                '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;margin-bottom:20px;">' +
                '<div class="stat-card" style="background:var(--bg3);padding:12px;border-radius:8px;text-align:center;">' +
                '<div class="stat-value" style="font-size:1rem;font-weight:bold;color:var(--accent);">' + members.length + '</div>' +
                '<div class="stat-label" style="font-size:0.55rem;color:var(--dim);">Members</div></div>' +
                '<div class="stat-card" style="background:var(--bg3);padding:12px;border-radius:8px;text-align:center;">' +
                '<div class="stat-value" style="font-size:1rem;font-weight:bold;color:var(--accent);">' + (head ? _escapeHtml(head.name) : 'None') + '</div>' +
                '<div class="stat-label" style="font-size:0.55rem;color:var(--dim);">Head</div></div>' +
                '<div class="stat-card" style="background:var(--bg3);padding:12px;border-radius:8px;text-align:center;">' +
                '<div class="stat-value" style="font-size:1rem;font-weight:bold;color:var(--accent);">' + wealth.toLocaleString() + '</div>' +
                '<div class="stat-label" style="font-size:0.55rem;color:var(--dim);">Wealth</div></div>' +
                '<div class="stat-card" style="background:var(--bg3);padding:12px;border-radius:8px;text-align:center;">' +
                '<div class="stat-value" style="font-size:1rem;font-weight:bold;color:var(--accent);">' + reputation + '</div>' +
                '<div class="stat-label" style="font-size:0.55rem;color:var(--dim);">Reputation</div></div></div>' +

                // Info Grid
                '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:20px;">' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
                '<div><div style="font-size:0.55rem;color:var(--accent);">Location</div><div style="font-size:0.7rem;">' + (location ? _escapeHtml(location.displayName) : 'None') + '</div></div>' +
                '<div><div style="font-size:0.55rem;color:var(--accent);">Founded</div><div style="font-size:0.7rem;">' + (household.foundedYear || 'Unknown') + '</div></div>' +
                '<div><div style="font-size:0.55rem;color:var(--accent);">ID</div><div style="font-size:0.6rem;color:var(--dim);">' + (household.id ? household.id.slice(-8) : 'New') + '</div></div>' +
                '<div><div style="font-size:0.55rem;color:var(--accent);">Departments</div><div style="font-size:0.7rem;">' + (household.departments ? household.departments.length : 0) + '</div></div>' +
                '</div></div>' +

                // Members
                '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:20px;">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
                '<div style="font-size:0.6rem;color:var(--accent);">Members (' + members.length + ')</div>' +
                '<div style="display:flex;gap:6px;">' +
                '<button id="addFamilyMemberBtn" class="btn small" style="padding:2px 8px;font-size:0.55rem;">+ Family</button>' +
                '<button id="addStaffMemberBtn" class="btn small" style="padding:2px 8px;font-size:0.55rem;">+ Staff</button>' +
                '</div></div>' +
                membersHtml +
                '</div>' +

                // Residence
                residenceHtml +

                // Name History
                historyHtml +

                // Notes
                (household.notes ?
                    '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:16px;margin-top:20px;">' +
                    '<div style="font-size:0.6rem;color:var(--accent);margin-bottom:8px;">Notes</div>' +
                    '<div style="font-size:0.65rem;color:var(--dim);">' + _escapeHtml(household.notes) + '</div></div>' : '') +
                '</div>';

            container.innerHTML = html;
            _attachOverviewEventHandlers(container, containerId, householdId);

        } finally {
            _rendering = false;
        }
    }

    // =========================================================================
    // 12. EVENT HANDLERS
    // =========================================================================

    function _attachOverviewEventHandlers(container, containerId, householdId) {
        // Edit button
        var editBtn = document.getElementById('editHouseholdBtn');
        if (editBtn) {
            editBtn.onclick = function() {
                _openEditHouseholdModal(householdId, function() {
                    renderHouseholdOverviewTab(containerId, householdId);
                });
            };
        }

        // Rename button
        var renameBtn = document.getElementById('renameHouseholdBtn');
        if (renameBtn) {
            renameBtn.onclick = function() {
                _openRenameHouseholdModal(householdId, function() {
                    renderHouseholdOverviewTab(containerId, householdId);
                });
            };
        }

        // Delete button
        var deleteBtn = document.getElementById('deleteHouseholdBtn');
        if (deleteBtn) {
            deleteBtn.onclick = function() {
                _openDeleteHouseholdModal(householdId, function() {
                    if (typeof window.selectHousehold === 'function') {
                        window.selectHousehold(null);
                    }
                });
            };
        }

        // Add family member button
        var addFamilyBtn = document.getElementById('addFamilyMemberBtn');
        if (addFamilyBtn) {
            addFamilyBtn.onclick = function() {
                var household = _getHousehold(householdId);
                var existingMemberIds = [];
                if (household && household.members) {
                    for (var i = 0; i < household.members.length; i++) {
                        existingMemberIds.push(household.members[i].characterId);
                    }
                }

                _openCharacterSelector({
                    title: 'Select Family Member',
                    targetId: null,
                    filters: {
                        showDeceased: false,
                        gender: 'all',
                        ageGroup: 'all',
                        location: 'all',
                        role: 'all'
                    },
                    excludeIds: existingMemberIds,
                    onSelect: function(character) {
                        if (character) {
                            _openAddMemberModal(householdId, 'family', function() {
                                renderHouseholdOverviewTab(containerId, householdId);
                            });
                        }
                    }
                });
            };
        }

        // Add staff member button
        var addStaffBtn = document.getElementById('addStaffMemberBtn');
        if (addStaffBtn) {
            addStaffBtn.onclick = function() {
                var household = _getHousehold(householdId);
                var existingMemberIds = [];
                if (household && household.members) {
                    for (var i = 0; i < household.members.length; i++) {
                        existingMemberIds.push(household.members[i].characterId);
                    }
                }

                _openCharacterSelector({
                    title: 'Select Staff Member',
                    targetId: null,
                    filters: {
                        showDeceased: false,
                        gender: 'all',
                        ageGroup: 'all',
                        location: 'all',
                        role: 'all'
                    },
                    excludeIds: existingMemberIds,
                    onSelect: function(character) {
                        if (character) {
                            _openAddMemberModal(householdId, 'staff', function() {
                                renderHouseholdOverviewTab(containerId, householdId);
                            });
                        }
                    }
                });
            };
        }

        // =========================================================================
        // RESIDENCE EVENT HANDLERS
        // =========================================================================

        var viewResidenceBtns = container.querySelectorAll('.view-residence-btn');
        for (var i = 0; i < viewResidenceBtns.length; i++) {
            var btn = viewResidenceBtns[i];
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                var resId = this.dataset.resId;
                _openResidenceDetailsModal(resId, function() {
                    renderHouseholdOverviewTab(containerId, householdId);
                });
            });
        }

        var editResidenceBtns = container.querySelectorAll('.edit-residence-btn');
        for (var i = 0; i < editResidenceBtns.length; i++) {
            var btn = editResidenceBtns[i];
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                var resId = this.dataset.resId;
                _openEditResidenceModal(resId, function() {
                    renderHouseholdOverviewTab(containerId, householdId);
                });
            });
        }

        var disassociateBtns = container.querySelectorAll('.disassociate-residence-btn');
        for (var i = 0; i < disassociateBtns.length; i++) {
            var btn = disassociateBtns[i];
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                var resId = this.dataset.resId;
                var residence = _getResidenceById(resId);
                var resName = residence ? residence.name : 'this residence';
                var household = _getHousehold(householdId);

                _confirmDialog('Disassociate ' + resName + ' from ' + (household ? household.name : 'this household') + '?\n\nThe residence will become vacant.', 'Disassociate Residence', function() {
                    var result = _disassociateResidenceFromHousehold(resId, 'household_disassociated', _getCurrentYear());
                    if (result) {
                        _showToast('Residence disassociated from ' + (household ? household.name : 'household'), 'success');
                        renderHouseholdOverviewTab(containerId, householdId);
                    } else {
                        _showToast('Failed to disassociate residence', 'error');
                    }
                });
            });
        }

        var assignResBtn = document.getElementById('assignHouseholdToResidenceBtn');
        if (assignResBtn) {
            assignResBtn.onclick = function() {
                var household = _getHousehold(householdId);
                if (household) {
                    _openAssignResidenceToHouseholdModal(householdId, function() {
                        renderHouseholdOverviewTab(containerId, householdId);
                    });
                }
            };
        }

        var createResBtn = document.getElementById('createResidenceBtn');
        if (createResBtn) {
            createResBtn.onclick = function() {
                var loc = _getHouseholdLocation(householdId);
                if (loc) {
                    openCreateResidenceModal(householdId, loc.id, loc.displayName, function() {
                        renderHouseholdOverviewTab(containerId, householdId);
                    });
                } else {
                    _showToast('Household has no location', 'error');
                }
            };
        }

        var assignVacantBtn = document.getElementById('assignVacantResidenceBtn');
        if (assignVacantBtn) {
            assignVacantBtn.onclick = function() {
                var loc = _getHouseholdLocation(householdId);
                if (loc) {
                    openAssignVacantResidenceModal(householdId, loc.id, loc.displayName, function() {
                        renderHouseholdOverviewTab(containerId, householdId);
                    });
                } else {
                    _showToast('Household has no location', 'error');
                }
            };
        }

        var setLocationBtn = document.getElementById('setLocationForResidenceBtn');
        if (setLocationBtn) {
            setLocationBtn.onclick = function() {
                openSetLocationModal(householdId, function() {
                    renderHouseholdOverviewTab(containerId, householdId);
                });
            };
        }

        // Clickable members
        var clickableMembers = container.querySelectorAll('.clickable-member');
        for (var i = 0; i < clickableMembers.length; i++) {
            var el = clickableMembers[i];
            el.addEventListener('click', function(e) {
                e.stopPropagation();
                var charId = this.dataset.characterId;
                if (charId) {
                    if (typeof window.selectCharacter === 'function') {
                        window.selectCharacter(charId);
                    } else if (typeof window.openCharacterDetailsModal === 'function') {
                        window.openCharacterDetailsModal(charId);
                    } else {
                        _showToast('Open character: ' + charId, 'info');
                    }
                }
            });
            el.style.cursor = 'pointer';
            el.addEventListener('mouseenter', function() {
                this.style.background = 'var(--accent-dim)';
            });
            el.addEventListener('mouseleave', function() {
                this.style.background = '';
            });
        }
    }

    // =========================================================================
    // 13. EXPORTS
    // =========================================================================

    window.renderHouseholdOverviewTab = renderHouseholdOverviewTab;
    window.openSetLocationModal = openSetLocationModal;
    window.openCreateResidenceModal = openCreateResidenceModal;
    window.openAssignVacantResidenceModal = openAssignVacantResidenceModal;
    window.renderResidenceSection = renderResidenceSection;

})();