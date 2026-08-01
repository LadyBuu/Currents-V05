/**
 * =============================================================================
 * SETTLEMENT RESIDENCE TAB - UI for residence management in settlements
 * =============================================================================
 * 
 * PURPOSE: Displays all residences in a settlement with full management capabilities:
 *   - View all residences with details (type, condition, occupancy, value)
 *   - Create new residences
 *   - Edit residence properties
 *   - Delete residences
 *   - Manage units (add, remove, assign, vacate)
 *   - Manage ownership and rental
 *   - View residence history
 *   - Filter and search
 * 
 * DEPENDS ON:
 *   - ResidenceSystem (residence-system.js)
 *   - HouseholdState (household-state.js)
 *   - LocationState (location-state.js)
 *   - modals-core.js (openModal, closeTopModal, _escapeHtml, _showToast, _getIcon)
 * 
 * ICON POLICY: Uses icons.js - NO emojis
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARD
    // =========================================================================

    var _rendering = false;
    var _modalOpen = false;
    var _filterTimeout = null;

    // =========================================================================
    // 2. GET CURRENT SETTLEMENT ID
    // =========================================================================

    function _getCurrentSettlementId() {
        if (window._currentSettlementId) return window._currentSettlementId;
        if (window.currentSettlementId) return window.currentSettlementId;
        if (window.selectedLocationId) return window.selectedLocationId;
        return null;
    }

    // =========================================================================
    // 3. DEPENDENCY WRAPPERS
    // =========================================================================

    function _escapeHtml(str) {
        if (typeof window._escapeHtml === 'function') return window._escapeHtml(str);
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
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

    function _getIcon(name) {
        if (window.Icons && window.Icons[name]) {
            return window.Icons[name];
        }
        return '';
    }

    function _getIconSafe(name) {
        var icon = _getIcon(name);
        return icon || '';
    }

    function _getPlaceById(id) {
        if (typeof window.getPlaceById === 'function') {
            return window.getPlaceById(id);
        }
        if (typeof window._getPlaceById === 'function') {
            return window._getPlaceById(id);
        }
        return null;
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

    function _getResidenceSystem() {
        return typeof window.ResidenceSystem !== 'undefined' ? window.ResidenceSystem : null;
    }

    function _getHousehold(householdId) {
        if (typeof window.HouseholdState !== 'undefined' && 
            typeof window.HouseholdState.getHousehold === 'function') {
            return window.HouseholdState.getHousehold(householdId);
        }
        return null;
    }

    function _getCharacterById(id) {
        if (typeof window.getCharacterById === 'function') {
            return window.getCharacterById(id);
        }
        if (typeof window._getCharacterById === 'function') {
            return window._getCharacterById(id);
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

    function _getAllResidences() {
        var RS = _getResidenceSystem();
        if (RS && typeof RS.getResidences === 'function') {
            return RS.getResidences();
        }
        return [];
    }

    function _getResidenceById(id) {
        var RS = _getResidenceSystem();
        if (RS && typeof RS.getResidenceById === 'function') {
            return RS.getResidenceById(id);
        }
        return null;
    }

    function _getResidencesByLocation(locationId) {
        var RS = _getResidenceSystem();
        if (RS && typeof RS.getResidencesByLocation === 'function') {
            return RS.getResidencesByLocation(locationId);
        }
        var all = _getAllResidences();
        var result = [];
        for (var i = 0; i < all.length; i++) {
            if (all[i].locationId === locationId) {
                result.push(all[i]);
            }
        }
        return result;
    }

    function _getResidenceUnits(residenceId) {
        var RS = _getResidenceSystem();
        if (RS && typeof RS.getResidenceUnits === 'function') {
            return RS.getResidenceUnits(residenceId);
        }
        return [];
    }

    function _getUnitStats(residenceId) {
        var RS = _getResidenceSystem();
        if (RS && typeof RS.getUnitStats === 'function') {
            return RS.getUnitStats(residenceId);
        }
        return { total: 0, occupied: 0, vacant: 0, demolished: 0, occupancyRate: 0 };
    }

    function _getResidenceOwner(residenceId) {
        var RS = _getResidenceSystem();
        if (RS && typeof RS.getResidenceOwner === 'function') {
            return RS.getResidenceOwner(residenceId);
        }
        return null;
    }

    function _getResidenceRenter(residenceId) {
        var RS = _getResidenceSystem();
        if (RS && typeof RS.getResidenceRenter === 'function') {
            return RS.getResidenceRenter(residenceId);
        }
        return null;
    }

    function _getResidenceNameHistory(residenceId) {
        var RS = _getResidenceSystem();
        if (RS && typeof RS.getResidenceNameHistory === 'function') {
            return RS.getResidenceNameHistory(residenceId);
        }
        return [];
    }

    function _getResidenceCurrentNameInfo(residenceId) {
        var RS = _getResidenceSystem();
        if (RS && typeof RS.getResidenceCurrentNameInfo === 'function') {
            return RS.getResidenceCurrentNameInfo(residenceId);
        }
        return null;
    }

    function _createResidence(name, locationId, typeId, options) {
        var RS = _getResidenceSystem();
        if (RS && typeof RS.createResidence === 'function') {
            return RS.createResidence(name, locationId, typeId, options);
        }
        return null;
    }

    function _updateResidence(residenceId, updates) {
        var RS = _getResidenceSystem();
        if (RS && typeof RS.updateResidence === 'function') {
            return RS.updateResidence(residenceId, updates);
        }
        return null;
    }

    function _deleteResidence(residenceId, options) {
        var RS = _getResidenceSystem();
        if (RS && typeof RS.deleteResidence === 'function') {
            return RS.deleteResidence(residenceId, options);
        }
        return false;
    }

    function _addResidenceUnit(residenceId, options) {
        var RS = _getResidenceSystem();
        if (RS && typeof RS.addResidenceUnit === 'function') {
            return RS.addResidenceUnit(residenceId, options);
        }
        return null;
    }

    function _removeResidenceUnit(residenceId, unitNumber, options) {
        var RS = _getResidenceSystem();
        if (RS && typeof RS.removeResidenceUnit === 'function') {
            return RS.removeResidenceUnit(residenceId, unitNumber, options);
        }
        return null;
    }

    function _assignHouseholdToUnit(residenceId, unitNumber, householdId, householdName, year, options) {
        var RS = _getResidenceSystem();
        if (RS && typeof RS.assignHouseholdToUnit === 'function') {
            return RS.assignHouseholdToUnit(residenceId, unitNumber, householdId, householdName, year, options);
        }
        return null;
    }

    function _markUnitVacant(residenceId, unitNumber, reason, year) {
        var RS = _getResidenceSystem();
        if (RS && typeof RS.markUnitVacant === 'function') {
            return RS.markUnitVacant(residenceId, unitNumber, reason, year);
        }
        return null;
    }

    function _setResidenceOwner(residenceId, ownerType, ownerId, options) {
        var RS = _getResidenceSystem();
        if (RS && typeof RS.setResidenceOwner === 'function') {
            return RS.setResidenceOwner(residenceId, ownerType, ownerId, options);
        }
        return null;
    }

    function _setResidenceRenter(residenceId, renterType, renterId, rentAmount, options) {
        var RS = _getResidenceSystem();
        if (RS && typeof RS.setResidenceRenter === 'function') {
            return RS.setResidenceRenter(residenceId, renterType, renterId, rentAmount, options);
        }
        return null;
    }

    function _endResidenceRental(residenceId, endYear, reason) {
        var RS = _getResidenceSystem();
        if (RS && typeof RS.endResidenceRental === 'function') {
            return RS.endResidenceRental(residenceId, endYear, reason);
        }
        return null;
    }

    function _updateResidenceRent(residenceId, newRentAmount, effectiveYear, reason) {
        var RS = _getResidenceSystem();
        if (RS && typeof RS.updateResidenceRent === 'function') {
            return RS.updateResidenceRent(residenceId, newRentAmount, effectiveYear, reason);
        }
        return null;
    }

    function _updateResidenceNameWithHistory(residenceId, newName, options) {
        var RS = _getResidenceSystem();
        if (RS && typeof RS.updateResidenceNameWithHistory === 'function') {
            return RS.updateResidenceNameWithHistory(residenceId, newName, options);
        }
        return null;
    }

    function _markResidenceVacant(residenceId, reason, year) {
        var RS = _getResidenceSystem();
        if (RS && typeof RS.markResidenceVacant === 'function') {
            return RS.markResidenceVacant(residenceId, reason, year);
        }
        return null;
    }

    function _rehabilitateResidence(residenceId, targetCondition, year) {
        var RS = _getResidenceSystem();
        if (RS && typeof RS.rehabilitateResidence === 'function') {
            return RS.rehabilitateResidence(residenceId, targetCondition, year);
        }
        return null;
    }

    function _demolishResidence(residenceId, reason, year, options) {
        var RS = _getResidenceSystem();
        if (RS && typeof RS.demolishResidence === 'function') {
            return RS.demolishResidence(residenceId, reason, year, options);
        }
        return null;
    }

    function _getAllResidenceTypes() {
        var RS = _getResidenceSystem();
        if (RS && typeof RS.getAllResidenceTypes === 'function') {
            return RS.getAllResidenceTypes();
        }
        return {};
    }

    function _getAllResidenceConditions() {
        var RS = _getResidenceSystem();
        if (RS && typeof RS.getAllResidenceConditions === 'function') {
            return RS.getAllResidenceConditions();
        }
        return [
            { id: 'pristine', name: 'Pristine' },
            { id: 'good', name: 'Good' },
            { id: 'fair', name: 'Fair' },
            { id: 'poor', name: 'Poor' },
            { id: 'ruined', name: 'Ruined' }
        ];
    }

    function _isMultiUnitResidence(residenceId) {
        var RS = _getResidenceSystem();
        if (RS && typeof RS.isMultiUnitResidence === 'function') {
            return RS.isMultiUnitResidence(residenceId);
        }
        return false;
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

    function _getLocationDropdown(selectedId, placeholderText) {
        if (typeof window.buildLocationDropdown === 'function') {
            return window.buildLocationDropdown(selectedId, placeholderText, false);
        }
        if (typeof window._buildLocationDropdown === 'function') {
            return window._buildLocationDropdown(selectedId, placeholderText, false);
        }
        var places = typeof window.getPlaces === 'function' ? window.getPlaces() : [];
        var html = '';
        if (placeholderText) {
            html += '<option value="">' + _escapeHtml(placeholderText) + '</option>';
        }
        for (var i = 0; i < places.length; i++) {
            var selected = (selectedId === places[i].id) ? 'selected' : '';
            html += '<option value="' + places[i].id + '" ' + selected + '>' + _escapeHtml(places[i].displayName) + '</option>';
        }
        return html;
    }

    // =========================================================================
    // 4. ICON HELPERS
    // =========================================================================

    function _iconSpan(icon, title) {
        if (!icon) return '';
        var titleAttr = title ? ' title="' + _escapeHtml(title) + '"' : '';
        return '<span style="display:inline-flex;align-items:center;vertical-align:middle;' + (title ? 'cursor:help;' : '') + '"' + titleAttr + '>' + icon + '</span>';
    }

    // =========================================================================
    // 5. MAIN RENDER FUNCTION
    // =========================================================================

    function renderSettlementResidences(containerId, locationId) {
        if (_rendering) {
            return;
        }
        _rendering = true;

        try {
            var container = document.getElementById(containerId);
            if (!container) {
                console.warn('[ResidenceTab] Container not found: ' + containerId);
                return;
            }

            if (!locationId) {
                locationId = _getCurrentSettlementId();
            }

            if (!locationId) {
                container.innerHTML = '<div class="placeholder">No settlement selected</div>';
                return;
            }

            var place = _getPlaceById(locationId);
            var placeName = place ? place.displayName : 'Unknown';

            console.log('[ResidenceTab] Rendering for settlement:', locationId);

            var residences = _getResidencesByLocation(locationId);
            var filterState = _loadFilterState(locationId);

            var homeIcon = _getIconSafe('HOME');
            var plusIcon = _getIconSafe('PLUS');
            var searchIcon = _getIconSafe('SEARCH');
            var refreshIcon = _getIconSafe('REFRESH');
            var editIcon = _getIconSafe('EDIT');
            var trashIcon = _getIconSafe('X_HEAVY');
            var infoIcon = _getIconSafe('CIRCLE_DOT');
            var personIcon = _getIconSafe('PERSON');
            var coinIcon = _getIconSafe('COIN');

            // Calculate stats
            var totalResidences = residences.length;
            var occupied = 0;
            var vacant = 0;
            var demolished = 0;
            var totalUnits = 0;
            var occupiedUnits = 0;
            var vacantUnits = 0;
            var totalRentIncome = 0;

            for (var i = 0; i < residences.length; i++) {
                var r = residences[i];
                if (r.isDemolished) {
                    demolished++;
                    continue;
                }
                if (r.isVacant) {
                    vacant++;
                } else {
                    occupied++;
                }
                var unitStats = _getUnitStats(r.id);
                totalUnits += unitStats.total;
                occupiedUnits += unitStats.occupied;
                vacantUnits += unitStats.vacant;
                if (r.renterId && r.rentAmount) {
                    totalRentIncome += r.rentAmount;
                }
            }

            var html = '' +
                '<div style="max-width: 900px; margin: 0 auto; padding: 4px;">' +
                    // HEADER
                    '<div style="background: var(--bg2); border: 1px solid var(--border); border-radius: 8px; padding: 12px 16px; margin-bottom: 12px;">' +
                        '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">' +
                            '<div>' +
                                '<h3 style="font-size: 0.85rem; color: var(--accent); margin: 0;">' + homeIcon + ' Residence Management</h3>' +
                                '<div style="font-size: 0.65rem; color: var(--dim);">' + _escapeHtml(placeName) + ' · ' + totalResidences + ' residences</div>' +
                            '</div>' +
                            '<div style="display: flex; gap: 4px; flex-wrap: wrap;">' +
                                '<button id="resAddBtn" class="btn" style="padding: 3px 10px; font-size: 0.55rem; background: var(--accent-dim); border: 1px solid var(--accent); border-radius: 4px; cursor: pointer;">' + plusIcon + ' Add Residence</button>' +
                                '<button id="resRefreshBtn" class="btn" style="padding: 3px 10px; font-size: 0.55rem; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">' + refreshIcon + ' Refresh</button>' +
                            '</div>' +
                        '</div>' +
                        // Stats row
                        '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr 1fr; gap: 6px; margin-top: 8px;">' +
                            '<div style="background: var(--bg3); padding: 4px 6px; border-radius: 4px; text-align: center;">' +
                                '<div style="font-size: 0.45rem; color: var(--dim);">Total</div>' +
                                '<div style="font-size: 0.7rem; font-weight: bold;">' + totalResidences + '</div>' +
                            '</div>' +
                            '<div style="background: var(--bg3); padding: 4px 6px; border-radius: 4px; text-align: center;">' +
                                '<div style="font-size: 0.45rem; color: var(--dim);">Occupied</div>' +
                                '<div style="font-size: 0.7rem; font-weight: bold; color: var(--success);">' + occupied + '</div>' +
                            '</div>' +
                            '<div style="background: var(--bg3); padding: 4px 6px; border-radius: 4px; text-align: center;">' +
                                '<div style="font-size: 0.45rem; color: var(--dim);">Vacant</div>' +
                                '<div style="font-size: 0.7rem; font-weight: bold; color: var(--warn);">' + vacant + '</div>' +
                            '</div>' +
                            '<div style="background: var(--bg3); padding: 4px 6px; border-radius: 4px; text-align: center;">' +
                                '<div style="font-size: 0.45rem; color: var(--dim);">Units</div>' +
                                '<div style="font-size: 0.7rem; font-weight: bold;">' + totalUnits + '</div>' +
                            '</div>' +
                            '<div style="background: var(--bg3); padding: 4px 6px; border-radius: 4px; text-align: center;">' +
                                '<div style="font-size: 0.45rem; color: var(--dim);">Rent Income</div>' +
                                '<div style="font-size: 0.7rem; font-weight: bold; color: var(--success);">+' + totalRentIncome + 'g</div>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +

                    // FILTERS
                    '<div style="background: var(--bg2); border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px; margin-bottom: 12px;">' +
                        '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;">' +
                            '<div>' +
                                '<label style="font-size: 0.5rem; color: var(--dim); display: block; margin-bottom: 2px;">' + searchIcon + ' Search</label>' +
                                '<input type="text" id="resSearchInput" value="' + _escapeHtml(filterState.search || '') + '" placeholder="Search residences..." style="width: 100%; padding: 3px 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; font-size: 0.6rem; color: var(--text);">' +
                            '</div>' +
                            '<div>' +
                                '<label style="font-size: 0.5rem; color: var(--dim); display: block; margin-bottom: 2px;">Status</label>' +
                                '<select id="resStatusFilter" style="width: 100%; padding: 3px 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; font-size: 0.6rem; color: var(--text);">' +
                                    '<option value="all" ' + (filterState.status === 'all' ? 'selected' : '') + '>All</option>' +
                                    '<option value="occupied" ' + (filterState.status === 'occupied' ? 'selected' : '') + '>Occupied</option>' +
                                    '<option value="vacant" ' + (filterState.status === 'vacant' ? 'selected' : '') + '>Vacant</option>' +
                                    '<option value="demolished" ' + (filterState.status === 'demolished' ? 'selected' : '') + '>Demolished</option>' +
                                '</select>' +
                            '</div>' +
                            '<div>' +
                                '<label style="font-size: 0.5rem; color: var(--dim); display: block; margin-bottom: 2px;">Condition</label>' +
                                '<select id="resConditionFilter" style="width: 100%; padding: 3px 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; font-size: 0.6rem; color: var(--text);">' +
                                    '<option value="all" ' + (filterState.condition === 'all' ? 'selected' : '') + '>All</option>' +
                                    '<option value="pristine" ' + (filterState.condition === 'pristine' ? 'selected' : '') + '>Pristine</option>' +
                                    '<option value="good" ' + (filterState.condition === 'good' ? 'selected' : '') + '>Good</option>' +
                                    '<option value="fair" ' + (filterState.condition === 'fair' ? 'selected' : '') + '>Fair</option>' +
                                    '<option value="poor" ' + (filterState.condition === 'poor' ? 'selected' : '') + '>Poor</option>' +
                                    '<option value="ruined" ' + (filterState.condition === 'ruined' ? 'selected' : '') + '>Ruined</option>' +
                                '</select>' +
                            '</div>' +
                        '</div>' +
                        '<div style="display: flex; justify-content: flex-end; margin-top: 4px;">' +
                            '<button id="resClearFiltersBtn" class="btn tiny" style="padding: 1px 8px; font-size: 0.5rem; background: var(--bg3); border: 1px solid var(--border); border-radius: 3px; cursor: pointer;">Clear Filters</button>' +
                        '</div>' +
                    '</div>' +

                    // RESIDENCE LIST
                    '<div style="background: var(--bg2); border: 1px solid var(--border); border-radius: 8px; padding: 12px 16px;">' +
                        '<div id="residenceList">';

            var filtered = _applyFilters(residences, filterState);

            if (filtered.length === 0) {
                html += '<div style="text-align: center; padding: 30px; color: var(--dim); font-size: 0.65rem;">' +
                            homeIcon + ' No residences found' +
                            (residences.length > 0 ? ' matching the current filters' : ' in this settlement') +
                        '</div>';
            } else {
                for (var i = 0; i < filtered.length; i++) {
                    html += _renderResidenceCard(filtered[i]);
                }
            }

            html +=
                        '</div>' +
                    '</div>' +

                    '<div style="font-size: 0.5rem; color: var(--dim); text-align: center; margin-top: 8px;">' +
                        'Showing ' + filtered.length + ' of ' + residences.length + ' residences' +
                    '</div>' +
                '</div>';

            container.innerHTML = html;

            _attachEventHandlers(container, locationId);

        } catch (e) {
            console.error('[ResidenceTab] Error:', e);
            var container = document.getElementById(containerId);
            if (container) {
                container.innerHTML = '<div class="placeholder" style="color: var(--danger);">Error loading residences: ' + _escapeHtml(e.message) + '</div>';
            }
        } finally {
            _rendering = false;
        }
    }

    // =========================================================================
    // 6. RENDER RESIDENCE CARD
    // =========================================================================

    function _renderResidenceCard(residence) {
        var RS = _getResidenceSystem();
        var homeIcon = _getIconSafe('HOME');
        var personIcon = _getIconSafe('PERSON');
        var coinIcon = _getIconSafe('COIN');
        var editIcon = _getIconSafe('EDIT');
        var trashIcon = _getIconSafe('X_HEAVY');
        var infoIcon = _getIconSafe('CIRCLE_DOT');
        var warningIcon = _getIconSafe('WARNING');

        var isDemolished = residence.isDemolished || false;
        var isVacant = residence.isVacant || false;
        var unitStats = _getUnitStats(residence.id);
        var owner = _getResidenceOwner(residence.id);
        var renter = _getResidenceRenter(residence.id);
        var typeName = residence.typeName || residence.typeId || 'Unknown';
        var condition = residence.condition || 'good';
        var estimatedValue = residence.estimatedValue || 0;

        var statusText = isDemolished ? 'Demolished' : (isVacant ? 'Vacant' : 'Occupied');
        var statusColor = isDemolished ? 'var(--danger)' : (isVacant ? 'var(--warn)' : 'var(--success)');
        var statusIcon = isDemolished ? '💀' : (isVacant ? '◻' : '◉');

        var conditionColors = {
            'pristine': 'var(--success)',
            'good': 'var(--accent)',
            'fair': 'var(--warn)',
            'poor': 'var(--danger)',
            'ruined': 'var(--danger-dark)'
        };
        var conditionColor = conditionColors[condition] || 'var(--dim)';

        var ownerDisplay = owner && owner.ownerName ? owner.ownerName : 'None';
        var renterDisplay = renter && renter.renterName ? renter.renterName : 'None';
        var rentDisplay = renter && renter.rentAmount ? renter.rentAmount + 'g/year' : 'N/A';

        var unitDisplay = '';
        if (residence.isMultiUnit) {
            unitDisplay = unitStats.total + ' units · ' + unitStats.occupied + ' occupied · ' + unitStats.vacant + ' vacant';
        } else {
            unitDisplay = 'Single unit';
        }

        var nameHistory = _getResidenceNameHistory(residence.id);
        var nameChangeCount = nameHistory ? nameHistory.length : 0;

        var actionsHtml = '' +
            '<button class="res-view-btn" data-res-id="' + residence.id + '" style="padding: 2px 8px; font-size: 0.45rem; background: var(--bg3); border: 1px solid var(--border); border-radius: 3px; cursor: pointer;" title="View Details">' + infoIcon + '</button>' +
            '<button class="res-edit-btn" data-res-id="' + residence.id + '" style="padding: 2px 8px; font-size: 0.45rem; background: var(--accent-dim); border: 1px solid var(--accent); border-radius: 3px; cursor: pointer;" title="Edit">' + editIcon + '</button>' +
            (!isDemolished ? '<button class="res-demolish-btn" data-res-id="' + residence.id + '" style="padding: 2px 8px; font-size: 0.45rem; background: #8a3020; border: none; color: white; border-radius: 3px; cursor: pointer;" title="Demolish">💀</button>' : '') +
            '<button class="res-delete-btn" data-res-id="' + residence.id + '" style="padding: 2px 8px; font-size: 0.45rem; background: #6a2020; border: none; color: white; border-radius: 3px; cursor: pointer;" title="Delete">' + trashIcon + '</button>';

        return '' +
            '<div class="residence-card" data-res-id="' + residence.id + '" style="' +
                'background: var(--bg3);' +
                'border: 1px solid var(--border);' +
                'border-radius: 6px;' +
                'padding: 10px 12px;' +
                'margin-bottom: 6px;' +
                (isDemolished ? 'opacity: 0.6;' : '') +
                'border-left: 3px solid ' + statusColor + ';' +
            '">' +
                '<div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 6px;">' +
                    '<div style="flex: 1; min-width: 0;">' +
                        '<div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">' +
                            '<span style="font-size: 0.75rem; font-weight: bold; ' + (isDemolished ? 'text-decoration: line-through;' : '') + '">' + homeIcon + ' ' + _escapeHtml(residence.name) + '</span>' +
                            '<span style="font-size: 0.5rem; color: var(--dim); padding: 1px 6px; border: 1px solid var(--border); border-radius: 8px;">' + _escapeHtml(typeName) + '</span>' +
                            '<span style="font-size: 0.45rem; color: ' + statusColor + '; padding: 1px 6px; border: 1px solid ' + statusColor + '; border-radius: 8px;">' + statusIcon + ' ' + statusText + '</span>' +
                            '<span style="font-size: 0.45rem; color: ' + conditionColor + '; padding: 1px 6px; border: 1px solid ' + conditionColor + '; border-radius: 8px;">' + _escapeHtml(condition) + '</span>' +
                            (residence.isMultiUnit ? '<span style="font-size: 0.4rem; color: var(--accent); padding: 1px 4px; border: 1px solid var(--accent); border-radius: 8px;">Multi-unit</span>' : '') +
                            (nameChangeCount > 0 ? '<span style="font-size: 0.4rem; color: var(--dim);">📜 ' + nameChangeCount + '</span>' : '') +
                        '</div>' +
                        '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 2px; display: flex; flex-wrap: wrap; gap: 8px;">' +
                            '<span>' + coinIcon + ' ' + estimatedValue + 'g</span>' +
                            '<span>' + personIcon + ' Owner: ' + _escapeHtml(ownerDisplay) + '</span>' +
                            (renter && renter.renterId ? '<span>' + personIcon + ' Renter: ' + _escapeHtml(renterDisplay) + '</span>' : '') +
                            (renter && renter.rentAmount ? '<span>' + coinIcon + ' Rent: ' + renter.rentAmount + 'g/yr</span>' : '') +
                            '<span>⌂ ' + unitDisplay + '</span>' +
                        '</div>' +
                    '</div>' +
                    '<div style="display: flex; gap: 4px; flex-shrink: 0;">' +
                        actionsHtml +
                    '</div>' +
                '</div>' +
            '</div>';
    }

    // =========================================================================
    // 7. FILTER FUNCTIONS
    // =========================================================================

    function _applyFilters(residences, filterState) {
        var result = residences.slice();
        var search = (filterState.search || '').toLowerCase().trim();
        var status = filterState.status || 'all';
        var condition = filterState.condition || 'all';

        if (search) {
            result = result.filter(function(r) {
                return r.name.toLowerCase().indexOf(search) !== -1 ||
                       (r.typeName && r.typeName.toLowerCase().indexOf(search) !== -1) ||
                       (r.householdName && r.householdName.toLowerCase().indexOf(search) !== -1);
            });
        }

        if (status !== 'all') {
            result = result.filter(function(r) {
                if (status === 'occupied') return !r.isVacant && !r.isDemolished;
                if (status === 'vacant') return r.isVacant && !r.isDemolished;
                if (status === 'demolished') return r.isDemolished;
                return true;
            });
        }

        if (condition !== 'all') {
            result = result.filter(function(r) {
                return (r.condition || 'good') === condition;
            });
        }

        result.sort(function(a, b) {
            if (a.isDemolished && !b.isDemolished) return 1;
            if (!a.isDemolished && b.isDemolished) return -1;
            return a.name.localeCompare(b.name);
        });

        return result;
    }

    function _loadFilterState(locationId) {
        var key = 'residence_filter_' + locationId;
        try {
            var stored = localStorage.getItem(key);
            if (stored) {
                return JSON.parse(stored);
            }
        } catch(e) {}
        return { search: '', status: 'all', condition: 'all' };
    }

    function _saveFilterState(locationId, state) {
        var key = 'residence_filter_' + locationId;
        try {
            localStorage.setItem(key, JSON.stringify(state));
        } catch(e) {}
    }

    // =========================================================================
    // 8. EVENT HANDLERS
    // =========================================================================

    function _attachEventHandlers(container, locationId) {
        var RS = _getResidenceSystem();

        // Add Residence button
        var addBtn = container.querySelector('#resAddBtn');
        if (addBtn) {
            addBtn.onclick = function() {
                _openCreateResidenceModal(locationId);
            };
        }

        // Refresh button
        var refreshBtn = container.querySelector('#resRefreshBtn');
        if (refreshBtn) {
            refreshBtn.onclick = function() {
                renderSettlementResidences('tab-residences', locationId);
            };
        }

        // Search input
        var searchInput = container.querySelector('#resSearchInput');
        if (searchInput) {
            searchInput.oninput = function() {
                if (_filterTimeout) clearTimeout(_filterTimeout);
                _filterTimeout = setTimeout(function() {
                    var state = {
                        search: searchInput.value,
                        status: document.querySelector('#resStatusFilter')?.value || 'all',
                        condition: document.querySelector('#resConditionFilter')?.value || 'all'
                    };
                    _saveFilterState(locationId, state);
                    renderSettlementResidences('tab-residences', locationId);
                }, 300);
            };
        }

        // Status filter
        var statusFilter = container.querySelector('#resStatusFilter');
        if (statusFilter) {
            statusFilter.onchange = function() {
                var state = {
                    search: document.querySelector('#resSearchInput')?.value || '',
                    status: this.value,
                    condition: document.querySelector('#resConditionFilter')?.value || 'all'
                };
                _saveFilterState(locationId, state);
                renderSettlementResidences('tab-residences', locationId);
            };
        }

        // Condition filter
        var conditionFilter = container.querySelector('#resConditionFilter');
        if (conditionFilter) {
            conditionFilter.onchange = function() {
                var state = {
                    search: document.querySelector('#resSearchInput')?.value || '',
                    status: document.querySelector('#resStatusFilter')?.value || 'all',
                    condition: this.value
                };
                _saveFilterState(locationId, state);
                renderSettlementResidences('tab-residences', locationId);
            };
        }

        // Clear filters button
        var clearBtn = container.querySelector('#resClearFiltersBtn');
        if (clearBtn) {
            clearBtn.onclick = function() {
                var searchInput = document.querySelector('#resSearchInput');
                var statusFilter = document.querySelector('#resStatusFilter');
                var conditionFilter = document.querySelector('#resConditionFilter');
                if (searchInput) searchInput.value = '';
                if (statusFilter) statusFilter.value = 'all';
                if (conditionFilter) conditionFilter.value = 'all';
                var state = { search: '', status: 'all', condition: 'all' };
                _saveFilterState(locationId, state);
                renderSettlementResidences('tab-residences', locationId);
            };
        }

        // View buttons
        var viewBtns = container.querySelectorAll('.res-view-btn');
        for (var i = 0; i < viewBtns.length; i++) {
            (function(btn) {
                btn.onclick = function(e) {
                    e.stopPropagation();
                    var resId = this.dataset.resId;
                    if (resId && RS) {
                        _openResidenceDetailsModal(resId, locationId);
                    }
                };
            })(viewBtns[i]);
        }

        // Edit buttons
        var editBtns = container.querySelectorAll('.res-edit-btn');
        for (var i = 0; i < editBtns.length; i++) {
            (function(btn) {
                btn.onclick = function(e) {
                    e.stopPropagation();
                    var resId = this.dataset.resId;
                    if (resId) {
                        _openEditResidenceModal(resId, locationId);
                    }
                };
            })(editBtns[i]);
        }

        // Demolish buttons
        var demolishBtns = container.querySelectorAll('.res-demolish-btn');
        for (var i = 0; i < demolishBtns.length; i++) {
            (function(btn) {
                btn.onclick = function(e) {
                    e.stopPropagation();
                    var resId = this.dataset.resId;
                    if (resId) {
                        _confirmDemolishResidence(resId, locationId);
                    }
                };
            })(demolishBtns[i]);
        }

        // Delete buttons
        var deleteBtns = container.querySelectorAll('.res-delete-btn');
        for (var i = 0; i < deleteBtns.length; i++) {
            (function(btn) {
                btn.onclick = function(e) {
                    e.stopPropagation();
                    var resId = this.dataset.resId;
                    if (resId) {
                        _confirmDeleteResidence(resId, locationId);
                    }
                };
            })(deleteBtns[i]);
        }

        // Click on card to view details
        var cards = container.querySelectorAll('.residence-card');
        for (var i = 0; i < cards.length; i++) {
            (function(card) {
                card.onclick = function(e) {
                    if (e.target.closest('button')) return;
                    var resId = this.dataset.resId;
                    if (resId && RS) {
                        _openResidenceDetailsModal(resId, locationId);
                    }
                };
            })(cards[i]);
        }
    }

    // =========================================================================
    // 9. CREATE RESIDENCE MODAL
    // =========================================================================

    function _openCreateResidenceModal(locationId) {
        if (_modalOpen) return;
        _modalOpen = true;

        try {
            var place = _getPlaceById(locationId);
            var types = _getAllResidenceTypes();
            var conditions = _getAllResidenceConditions();
            var currentYear = _getCurrentYear();

            var typeOptions = '';
            for (var key in types) {
                var t = types[key];
                typeOptions += '<option value="' + t.id + '">' + _escapeHtml(t.name) + ' (' + (t.isMultiUnit ? 'Multi-unit' : 'Single') + ')</option>';
            }

            var conditionOptions = conditions.map(function(c) {
                return '<option value="' + c.id + '" ' + (c.id === 'good' ? 'selected' : '') + '>' + _escapeHtml(c.name) + '</option>';
            }).join('');

            var content = '' +
                '<div style="margin-bottom: 16px;">' +
                    '<div style="background: var(--bg3); border-radius: 6px; padding: 8px 12px; margin-bottom: 12px; font-size: 0.6rem; color: var(--dim);">' +
                        'Creating a residence in <strong>' + _escapeHtml(place ? place.displayName : 'Unknown') + '</strong>' +
                    '</div>' +
                    '<div class="form-group" style="margin-bottom: 12px;">' +
                        '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Residence Name *</label>' +
                        '<input type="text" id="newResName" placeholder="e.g., Thornwood Manor" autofocus style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem; color: var(--text);">' +
                    '</div>' +
                    '<div class="form-group" style="margin-bottom: 12px;">' +
                        '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Residence Type</label>' +
                        '<select id="newResType" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem; color: var(--text);">' +
                            typeOptions +
                        '</select>' +
                    '</div>' +
                    '<div class="form-group" style="margin-bottom: 12px;">' +
                        '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Condition</label>' +
                        '<select id="newResCondition" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem; color: var(--text);">' +
                            conditionOptions +
                        '</select>' +
                    '</div>' +
                    '<div class="form-group" style="margin-bottom: 12px;">' +
                        '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Built Year</label>' +
                        '<input type="number" id="newResBuiltYear" value="' + currentYear + '" min="1" max="' + (currentYear + 5) + '" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem; color: var(--text);">' +
                    '</div>' +
                    '<div class="form-group" style="margin-bottom: 12px;">' +
                        '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Initial Units (for multi-unit types)</label>' +
                        '<input type="number" id="newResUnits" value="1" min="1" max="20" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem; color: var(--text);">' +
                        '<small style="font-size: 0.55rem; color: var(--dim);">Only applies to multi-unit residence types</small>' +
                    '</div>' +
                    '<div class="form-group" style="margin-bottom: 12px;">' +
                        '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Estimated Value</label>' +
                        '<input type="number" id="newResValue" value="500" min="0" step="100" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem; color: var(--text);">' +
                    '</div>' +
                    '<div class="form-group" style="margin-bottom: 12px;">' +
                        '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Notes</label>' +
                        '<textarea id="newResNotes" rows="2" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem; color: var(--text);" placeholder="Historical notes..."></textarea>' +
                    '</div>' +
                '</div>';

            _openModal({
                title: 'Add Residence to ' + (place ? place.displayName : 'Location'),
                content: content,
                confirmText: 'Create Residence',
                cancelText: 'Cancel',
                onOpen: function() {
                    var nameInput = document.getElementById('newResName');
                    if (nameInput) {
                        setTimeout(function() { nameInput.focus(); }, 100);
                    }
                },
                onConfirm: function() {
                    var name = document.getElementById('newResName').value.trim();
                    var typeId = document.getElementById('newResType').value;
                    var condition = document.getElementById('newResCondition').value;
                    var builtYear = parseInt(document.getElementById('newResBuiltYear').value);
                    var units = parseInt(document.getElementById('newResUnits').value) || 1;
                    var value = parseInt(document.getElementById('newResValue').value) || 500;
                    var notes = document.getElementById('newResNotes').value.trim();

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

                    var type = _getAllResidenceTypes()[typeId.toUpperCase()];
                    var isMultiUnit = type ? type.isMultiUnit : false;
                    var unitCount = isMultiUnit ? Math.max(1, Math.min(units, 20)) : 1;

                    var newResidence = _createResidence(name, locationId, typeId, {
                        condition: condition,
                        builtYear: builtYear,
                        estimatedValue: value,
                        notes: notes,
                        unitCount: unitCount,
                        isMultiUnit: isMultiUnit
                    });

                    if (newResidence) {
                        _showToast('Residence "' + name + '" created with ' + unitCount + ' unit(s)', 'success');
                        _closeTopModal();
                        _modalOpen = false;
                        renderSettlementResidences('tab-residences', locationId);
                        return true;
                    } else {
                        _showToast('Failed to create residence', 'error');
                        return false;
                    }
                },
                onCancel: function() {
                    _modalOpen = false;
                }
            });

        } catch (e) {
            _modalOpen = false;
            _showToast('Error opening create residence modal', 'error');
        }
    }

    // =========================================================================
    // 10. EDIT RESIDENCE MODAL
    // =========================================================================

    function _openEditResidenceModal(residenceId, locationId) {
        if (_modalOpen) return;
        _modalOpen = true;

        try {
            var residence = _getResidenceById(residenceId);
            if (!residence) {
                _showToast('Residence not found', 'error');
                _modalOpen = false;
                return;
            }

            var types = _getAllResidenceTypes();
            var conditions = _getAllResidenceConditions();
            var currentYear = _getCurrentYear();

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

            var currentNameInfo = _getResidenceCurrentNameInfo(residenceId);
            var nameSince = currentNameInfo ? currentNameInfo.since : 'Unknown';

            var content = '' +
                '<div style="margin-bottom: 16px;">' +
                    '<div style="background: var(--bg3); border-radius: 6px; padding: 8px 12px; margin-bottom: 12px; font-size: 0.6rem; color: var(--dim);">' +
                        'Editing <strong>' + _escapeHtml(residence.name) + '</strong> · Name since ' + nameSince +
                        (residence.isMultiUnit ? ' · Multi-unit' : '') +
                    '</div>' +
                    '<div class="form-group" style="margin-bottom: 12px;">' +
                        '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Residence Name</label>' +
                        '<input type="text" id="editResName" value="' + _escapeHtml(residence.name) + '" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem; color: var(--text);">' +
                    '</div>' +
                    '<div style="margin-bottom: 12px; padding: 8px; background: var(--bg3); border-radius: 6px;">' +
                        '<label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 0.65rem; color: var(--dim);">' +
                            '<input type="checkbox" id="editRenameWithHistory" checked>' +
                            '<span>Record name change in history</span>' +
                        '</label>' +
                        '<div id="editRenameHistoryOptions" style="margin-top: 6px; padding-left: 24px;">' +
                            '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">' +
                                '<div><label style="font-size: 0.55rem; color: var(--dim);">Year</label>' +
                                    '<input type="number" id="editRenameYear" value="' + currentYear + '" min="1" style="width: 100%; padding: 4px 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; font-size: 0.55rem; color: var(--text);">' +
                                '</div>' +
                                '<div><label style="font-size: 0.55rem; color: var(--dim);">Reason</label>' +
                                    '<input type="text" id="editRenameReason" placeholder="e.g., Renovation, Inheritance..." style="width: 100%; padding: 4px 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; font-size: 0.55rem; color: var(--text);">' +
                                '</div>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="form-group" style="margin-bottom: 12px;">' +
                        '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Residence Type</label>' +
                        '<select id="editResType" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem; color: var(--text);">' +
                            typeOptions +
                        '</select>' +
                    '</div>' +
                    '<div class="form-group" style="margin-bottom: 12px;">' +
                        '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Condition</label>' +
                        '<select id="editResCondition" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem; color: var(--text);">' +
                            conditionOptions +
                        '</select>' +
                    '</div>' +
                    '<div class="form-group" style="margin-bottom: 12px;">' +
                        '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Built Year</label>' +
                        '<input type="number" id="editResBuiltYear" value="' + (residence.builtYear || currentYear) + '" min="1" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem; color: var(--text);">' +
                    '</div>' +
                    '<div class="form-group" style="margin-bottom: 12px;">' +
                        '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Estimated Value</label>' +
                        '<input type="number" id="editResValue" value="' + (residence.estimatedValue || 500) + '" min="0" step="100" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem; color: var(--text);">' +
                    '</div>' +
                    '<div class="form-group" style="margin-bottom: 12px;">' +
                        '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Notes</label>' +
                        '<textarea id="editResNotes" rows="2" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem; color: var(--text);">' + _escapeHtml(residence.notes || '') + '</textarea>' +
                    '</div>' +
                '</div>';

            _openModal({
                title: 'Edit Residence: ' + residence.name,
                content: content,
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
                    var nameInput = document.getElementById('editResName');
                    if (nameInput) {
                        setTimeout(function() { nameInput.focus(); }, 100);
                    }
                },
                onConfirm: function() {
                    var name = document.getElementById('editResName').value.trim();
                    var typeId = document.getElementById('editResType').value;
                    var condition = document.getElementById('editResCondition').value;
                    var builtYear = parseInt(document.getElementById('editResBuiltYear').value);
                    var value = parseInt(document.getElementById('editResValue').value) || 500;
                    var notes = document.getElementById('editResNotes').value.trim();
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
                            _showToast('Residence renamed from "' + residence.name + '" to "' + name + '"', 'success');
                        }
                    }

                    var updates = {
                        typeId: typeId,
                        condition: condition,
                        builtYear: builtYear,
                        estimatedValue: value,
                        notes: notes || null
                    };

                    if (name !== residence.name) {
                        updates.name = name;
                    }

                    var result = _updateResidence(residenceId, updates);

                    if (result) {
                        _showToast('Residence updated', 'success');
                        _closeTopModal();
                        _modalOpen = false;
                        renderSettlementResidences('tab-residences', locationId);
                        return true;
                    } else {
                        _showToast('Failed to update residence', 'error');
                        return false;
                    }
                },
                onCancel: function() {
                    _modalOpen = false;
                }
            });

        } catch (e) {
            _modalOpen = false;
            _showToast('Error opening edit residence modal', 'error');
        }
    }

    // =========================================================================
    // 11. RESIDENCE DETAILS MODAL
    // =========================================================================

    function _openResidenceDetailsModal(residenceId, locationId) {
        if (_modalOpen) return;
        _modalOpen = true;

        try {
            var residence = _getResidenceById(residenceId);
            if (!residence) {
                _showToast('Residence not found', 'error');
                _modalOpen = false;
                return;
            }

            var RS = _getResidenceSystem();
            var units = _getResidenceUnits(residenceId);
            var unitStats = _getUnitStats(residenceId);
            var owner = _getResidenceOwner(residenceId);
            var renter = _getResidenceRenter(residenceId);
            var nameHistory = _getResidenceNameHistory(residenceId);
            var currentNameInfo = _getResidenceCurrentNameInfo(residenceId);
            var isMultiUnit = residence.isMultiUnit || false;
            var isDemolished = residence.isDemolished || false;
            var isVacant = residence.isVacant || false;

            var homeIcon = _getIconSafe('HOME');
            var personIcon = _getIconSafe('PERSON');
            var coinIcon = _getIconSafe('COIN');
            var editIcon = _getIconSafe('EDIT');
            var trashIcon = _getIconSafe('X_HEAVY');
            var infoIcon = _getIconSafe('CIRCLE_DOT');

            var statusText = isDemolished ? 'Demolished' : (isVacant ? 'Vacant' : 'Occupied');
            var statusColor = isDemolished ? 'var(--danger)' : (isVacant ? 'var(--warn)' : 'var(--success)');

            var conditionColors = {
                'pristine': 'var(--success)',
                'good': 'var(--accent)',
                'fair': 'var(--warn)',
                'poor': 'var(--danger)',
                'ruined': 'var(--danger-dark)'
            };
            var conditionColor = conditionColors[residence.condition] || 'var(--dim)';

            var ownerDisplay = owner && owner.ownerName ? owner.ownerName : 'None';
            var ownerType = owner && owner.ownerType ? owner.ownerType : 'none';
            var renterDisplay = renter && renter.renterName ? renter.renterName : 'None';
            var rentAmount = renter && renter.rentAmount ? renter.rentAmount : 0;
            var rentalStatus = renter && renter.rentalStatus ? renter.rentalStatus : 'Vacant';

            // Build units HTML
            var unitsHtml = '';
            if (isMultiUnit && units.length > 0) {
                unitsHtml = '<div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border);">' +
                    '<div style="font-size: 0.6rem; color: var(--accent); margin-bottom: 6px;">Units (' + units.length + ')</div>';

                for (var i = 0; i < units.length; i++) {
                    var u = units[i];
                    var uStatus = u.isDemolished ? 'Demolished' : (u.isVacant ? 'Vacant' : 'Occupied');
                    var uColor = u.isDemolished ? '#8a2020' : (u.isVacant ? '#c87040' : '#4a9e6a');
                    var uHousehold = u.householdName || 'Unassigned';

                    unitsHtml +=
                        '<div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 8px; background: var(--bg); border-radius: 4px; margin-bottom: 2px; border-left: 3px solid ' + uColor + ';">' +
                            '<div style="font-size: 0.55rem;">Unit ' + u.unitNumber + ' · ' + _escapeHtml(uHousehold) + '</div>' +
                            '<div style="font-size: 0.45rem; color: ' + uColor + ';">' + uStatus + '</div>' +
                        '</div>';
                }
                unitsHtml += '</div>';
            }

            // Build name history HTML
            var historyHtml = '';
            if (nameHistory && nameHistory.length > 0) {
                var sortedHistory = nameHistory.slice().sort(function(a, b) { return b.year - a.year; });
                historyHtml = '<div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border);">' +
                    '<div style="font-size: 0.6rem; color: var(--accent); margin-bottom: 6px;">Name History (' + nameHistory.length + ' changes)</div>';
                for (var i = 0; i < Math.min(sortedHistory.length, 5); i++) {
                    var h = sortedHistory[i];
                    historyHtml +=
                        '<div style="font-size: 0.5rem; color: var(--dim); padding: 2px 0; border-bottom: 1px solid var(--border-light);">' +
                            h.year + ': ' + _escapeHtml(h.oldName || '—') + ' → ' + _escapeHtml(h.newName) +
                            (h.reason ? ' (' + _escapeHtml(h.reason) + ')' : '') +
                        '</div>';
                }
                if (sortedHistory.length > 5) {
                    historyHtml += '<div style="font-size: 0.45rem; color: var(--dim);">... and ' + (sortedHistory.length - 5) + ' more</div>';
                }
                historyHtml += '</div>';
            }

            var content = '' +
                '<div style="max-height: 500px; overflow-y: auto; padding: 4px;">' +
                    '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; border-left: 4px solid ' + statusColor + '; margin-bottom: 12px;">' +
                        '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">' +
                            '<div>' +
                                '<div style="font-size: 0.9rem; font-weight: bold;">' + homeIcon + ' ' + _escapeHtml(residence.name) + '</div>' +
                                '<div style="font-size: 0.65rem; color: var(--dim);">' + _escapeHtml(residence.typeName || residence.typeId || 'Unknown') + ' · ' + statusText + ' · Condition: <span style="color:' + conditionColor + ';">' + _escapeHtml(residence.condition || 'good') + '</span></div>' +
                                (currentNameInfo ? '<div style="font-size: 0.55rem; color: var(--dim);">Current name since ' + currentNameInfo.since + (currentNameInfo.original ? ' · Original: ' + _escapeHtml(currentNameInfo.original) : '') + '</div>' : '') +
                            '</div>' +
                            '<span style="font-size: 0.55rem; padding: 2px 10px; border-radius: 12px; background: ' + statusColor + '; color: white;">' + statusText + '</span>' +
                        '</div>' +
                    '</div>' +

                    '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px 16px; font-size: 0.7rem; margin-bottom: 12px; padding: 12px; background: var(--bg3); border-radius: 6px;">' +
                        '<div><span style="color: var(--dim);">' + coinIcon + ' Value</span><br><span style="font-weight: bold;">' + (residence.estimatedValue || 0) + 'g</span></div>' +
                        '<div><span style="color: var(--dim);">Built</span><br><span style="font-weight: bold;">' + (residence.builtYear || 'Unknown') + '</span></div>' +
                        '<div><span style="color: var(--dim);">Condition</span><br><span style="font-weight: bold; color:' + conditionColor + ';">' + _escapeHtml(residence.condition || 'good') + '</span></div>' +
                        '<div><span style="color: var(--dim);">Owner</span><br><span style="font-weight: bold;">' + _escapeHtml(ownerDisplay) + ' (' + ownerType + ')</span></div>' +
                        (renter && renter.renterId ? '<div><span style="color: var(--dim);">Renter</span><br><span style="font-weight: bold;">' + _escapeHtml(renterDisplay) + '</span></div>' : '') +
                        (renter && renter.rentAmount ? '<div><span style="color: var(--dim);">Rent</span><br><span style="font-weight: bold; color: var(--success);">' + rentAmount + 'g/year</span></div>' : '') +
                        '<div><span style="color: var(--dim);">Rental Status</span><br><span style="font-weight: bold;">' + _escapeHtml(rentalStatus) + '</span></div>' +
                        (residence.isMultiUnit ? '<div><span style="color: var(--dim);">Units</span><br><span style="font-weight: bold;">' + unitStats.total + ' (' + unitStats.occupied + ' occupied, ' + unitStats.vacant + ' vacant)</span></div>' : '') +
                    '</div>' +

                    unitsHtml +
                    historyHtml +

                    (residence.notes ? '<div style="margin-top: 12px; padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.6rem; color: var(--dim);">' + _escapeHtml(residence.notes) + '</div>' : '') +

                    '<div style="margin-top: 16px; display: flex; gap: 6px; flex-wrap: wrap; border-top: 1px solid var(--border); padding-top: 12px;">' +
                        '<button id="resDetailEditBtn" class="btn" style="font-size: 0.55rem; padding: 4px 12px; background: var(--accent-dim); border: 1px solid var(--accent); border-radius: 4px; cursor: pointer;">' + editIcon + ' Edit</button>' +
                        (!isDemolished ? '<button id="resDetailVacateBtn" class="btn" style="font-size: 0.55rem; padding: 4px 12px; background: #8a5a20; border: none; color: white; border-radius: 4px; cursor: pointer;">Mark Vacant</button>' : '') +
                        (!isDemolished && residence.condition !== 'pristine' ? '<button id="resDetailRehabBtn" class="btn" style="font-size: 0.55rem; padding: 4px 12px; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">Rehabilitate</button>' : '') +
                        (!isDemolished ? '<button id="resDetailDemolishBtn" class="btn" style="font-size: 0.55rem; padding: 4px 12px; background: #8a3020; border: none; color: white; border-radius: 4px; cursor: pointer;">Demolish</button>' : '') +
                        (!isDemolished ? '<button id="resDetailSetOwnerBtn" class="btn" style="font-size: 0.55rem; padding: 4px 12px; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">Set Owner</button>' : '') +
                        (!isDemolished ? '<button id="resDetailSetRenterBtn" class="btn" style="font-size: 0.55rem; padding: 4px 12px; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">Set Renter</button>' : '') +
                        (renter && renter.renterId && !isDemolished ? '<button id="resDetailEndRentalBtn" class="btn" style="font-size: 0.55rem; padding: 4px 12px; background: #8a5a20; border: none; color: white; border-radius: 4px; cursor: pointer;">End Rental</button>' : '') +
                        (residence.isMultiUnit ? '<button id="resDetailAddUnitBtn" class="btn" style="font-size: 0.55rem; padding: 4px 12px; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">Add Unit</button>' : '') +
                        '<button id="resDetailDeleteBtn" class="btn" style="font-size: 0.55rem; padding: 4px 12px; background: #6a2020; border: none; color: white; border-radius: 4px; cursor: pointer;">' + trashIcon + ' Delete</button>' +
                    '</div>' +
                '</div>';

            _openModal({
                title: 'Residence Details: ' + residence.name,
                content: content,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {
                    _closeTopModal();
                    _modalOpen = false;
                },
                onCancel: function() {
                    _modalOpen = false;
                }
            });

            // Attach detail modal event handlers
            setTimeout(function() {
                var editBtn = document.getElementById('resDetailEditBtn');
                if (editBtn) {
                    editBtn.onclick = function() {
                        _closeTopModal();
                        _modalOpen = false;
                        _openEditResidenceModal(residenceId, locationId);
                    };
                }

                var vacateBtn = document.getElementById('resDetailVacateBtn');
                if (vacateBtn) {
                    vacateBtn.onclick = function() {
                        _closeTopModal();
                        _modalOpen = false;
                        _openVacateResidenceModal(residenceId, locationId);
                    };
                }

                var rehabBtn = document.getElementById('resDetailRehabBtn');
                if (rehabBtn) {
                    rehabBtn.onclick = function() {
                        _closeTopModal();
                        _modalOpen = false;
                        _openRehabilitateResidenceModal(residenceId, locationId);
                    };
                }

                var demolishBtn = document.getElementById('resDetailDemolishBtn');
                if (demolishBtn) {
                    demolishBtn.onclick = function() {
                        _closeTopModal();
                        _modalOpen = false;
                        _confirmDemolishResidence(residenceId, locationId);
                    };
                }

                var setOwnerBtn = document.getElementById('resDetailSetOwnerBtn');
                if (setOwnerBtn) {
                    setOwnerBtn.onclick = function() {
                        _closeTopModal();
                        _modalOpen = false;
                        _openSetOwnerModal(residenceId, locationId);
                    };
                }

                var setRenterBtn = document.getElementById('resDetailSetRenterBtn');
                if (setRenterBtn) {
                    setRenterBtn.onclick = function() {
                        _closeTopModal();
                        _modalOpen = false;
                        _openSetRenterModal(residenceId, locationId);
                    };
                }

                var endRentalBtn = document.getElementById('resDetailEndRentalBtn');
                if (endRentalBtn) {
                    endRentalBtn.onclick = function() {
                        _closeTopModal();
                        _modalOpen = false;
                        _confirmEndRental(residenceId, locationId);
                    };
                }

                var addUnitBtn = document.getElementById('resDetailAddUnitBtn');
                if (addUnitBtn) {
                    addUnitBtn.onclick = function() {
                        _closeTopModal();
                        _modalOpen = false;
                        _openAddUnitModal(residenceId, locationId);
                    };
                }

                var deleteBtn = document.getElementById('resDetailDeleteBtn');
                if (deleteBtn) {
                    deleteBtn.onclick = function() {
                        _closeTopModal();
                        _modalOpen = false;
                        _confirmDeleteResidence(residenceId, locationId);
                    };
                }
            }, 100);

        } catch (e) {
            _modalOpen = false;
            _showToast('Error opening residence details', 'error');
        }
    }

    // =========================================================================
    // 12. VACATE RESIDENCE MODAL
    // =========================================================================

    function _openVacateResidenceModal(residenceId, locationId) {
        if (_modalOpen) return;
        _modalOpen = true;

        try {
            var residence = _getResidenceById(residenceId);
            if (!residence) {
                _showToast('Residence not found', 'error');
                _modalOpen = false;
                return;
            }

            if (residence.isVacant) {
                _showToast('Residence is already vacant', 'warning');
                _modalOpen = false;
                return;
            }

            if (residence.isDemolished) {
                _showToast('Residence has been demolished', 'error');
                _modalOpen = false;
                return;
            }

            var currentYear = _getCurrentYear();

            var content = '' +
                '<div style="margin-bottom: 16px;">' +
                    '<div style="background: var(--bg3); border-radius: 6px; padding: 12px; margin-bottom: 12px;">' +
                        '<div style="font-size: 0.7rem;"><strong>' + _escapeHtml(residence.name) + '</strong></div>' +
                        '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 4px;">Current Household: ' + _escapeHtml(residence.householdName || 'None') + '</div>' +
                        (residence.assignedYear ? '<div style="font-size: 0.55rem; color: var(--dim);">Assigned: ' + residence.assignedYear + '</div>' : '') +
                    '</div>' +
                    '<div class="form-group" style="margin-bottom: 12px;">' +
                        '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Vacancy Year</label>' +
                        '<input type="number" id="vacateYear" value="' + currentYear + '" min="1" max="' + (currentYear + 5) + '" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem; color: var(--text);">' +
                    '</div>' +
                    '<div class="form-group" style="margin-bottom: 12px;">' +
                        '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Reason</label>' +
                        '<select id="vacateReason" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem; color: var(--text);">' +
                            '<option value="household_moved">Household moved out</option>' +
                            '<option value="household_disassociated">Household disassociated</option>' +
                            '<option value="manual">Manual (admin)</option>' +
                            '<option value="sold">Sold</option>' +
                            '<option value="destroyed">Destroyed</option>' +
                        '</select>' +
                    '</div>' +
                    '<div style="font-size: 0.55rem; color: var(--dim);">This will make the residence available for assignment to another household.</div>' +
                '</div>';

            _openModal({
                title: 'Vacate Residence: ' + residence.name,
                content: content,
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
                        _showToast('Residence "' + residence.name + '" marked vacant', 'success');
                        _closeTopModal();
                        _modalOpen = false;
                        renderSettlementResidences('tab-residences', locationId);
                        return true;
                    } else {
                        _showToast(result ? result.reason : 'Failed to mark vacant', 'error');
                        return false;
                    }
                },
                onCancel: function() {
                    _modalOpen = false;
                }
            });

        } catch (e) {
            _modalOpen = false;
            _showToast('Error opening vacate residence modal', 'error');
        }
    }

    // =========================================================================
    // 13. REHABILITATE RESIDENCE MODAL
    // =========================================================================

    function _openRehabilitateResidenceModal(residenceId, locationId) {
        if (_modalOpen) return;
        _modalOpen = true;

        try {
            var residence = _getResidenceById(residenceId);
            if (!residence) {
                _showToast('Residence not found', 'error');
                _modalOpen = false;
                return;
            }

            if (residence.isDemolished) {
                _showToast('Residence has been demolished', 'error');
                _modalOpen = false;
                return;
            }

            var conditions = _getAllResidenceConditions();
            var currentYear = _getCurrentYear();

            // Calculate repair cost using ResidenceSystem if available
            var RS = _getResidenceSystem();
            var repairCost = 0;
            if (RS && typeof RS.calculateRepairCost === 'function') {
                repairCost = RS.calculateRepairCost(residence, 'good');
            }

            var conditionOptions = conditions.map(function(c) {
                var selected = (c.id === 'good' || c.id === residence.condition) ? 'selected' : '';
                return '<option value="' + c.id + '" ' + selected + '>' + _escapeHtml(c.name) + '</option>';
            }).join('');

            var content = '' +
                '<div style="margin-bottom: 16px;">' +
                    '<div style="background: var(--bg3); border-radius: 6px; padding: 12px; margin-bottom: 12px;">' +
                        '<div style="font-size: 0.7rem;"><strong>' + _escapeHtml(residence.name) + '</strong></div>' +
                        '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px 12px; margin-top: 8px; font-size: 0.6rem;">' +
                            '<div><span style="color: var(--dim);">Current Condition:</span> ' + _escapeHtml(residence.condition || 'good') + '</div>' +
                            '<div><span style="color: var(--dim);">Estimated Value:</span> ' + (residence.estimatedValue || 0) + 'g</div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="form-group" style="margin-bottom: 12px;">' +
                        '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Target Condition</label>' +
                        '<select id="rehabTargetCondition" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem; color: var(--text);">' +
                            conditionOptions +
                        '</select>' +
                    '</div>' +
                    '<div class="form-group" style="margin-bottom: 12px;">' +
                        '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Year of Renovation</label>' +
                        '<input type="number" id="rehabYear" value="' + currentYear + '" min="1" max="' + (currentYear + 5) + '" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem; color: var(--text);">' +
                    '</div>' +
                    '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem;">' +
                        'Estimated cost: <strong id="rehabCostDisplay">' + repairCost + '</strong> gold' +
                    '</div>' +
                '</div>';

            _openModal({
                title: 'Rehabilitate Residence: ' + residence.name,
                content: content,
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
                        _showToast('Residence rehabilitated from "' + result.oldCondition + '" to "' + result.newCondition + '"', 'success');
                        _closeTopModal();
                        _modalOpen = false;
                        renderSettlementResidences('tab-residences', locationId);
                        return true;
                    } else {
                        _showToast(result ? result.reason : 'Failed to rehabilitate residence', 'error');
                        return false;
                    }
                },
                onCancel: function() {
                    _modalOpen = false;
                }
            });

            setTimeout(function() {
                var targetSelect = document.getElementById('rehabTargetCondition');
                var costDisplay = document.getElementById('rehabCostDisplay');
                if (targetSelect && costDisplay && RS && typeof RS.calculateRepairCost === 'function') {
                    targetSelect.onchange = function() {
                        var cost = RS.calculateRepairCost(residence, targetSelect.value);
                        costDisplay.textContent = cost;
                    };
                }
            }, 100);

        } catch (e) {
            _modalOpen = false;
            _showToast('Error opening rehabilitate residence modal', 'error');
        }
    }

    // =========================================================================
    // 14. CONFIRM DEMOLISH RESIDENCE
    // =========================================================================

    function _confirmDemolishResidence(residenceId, locationId) {
        var residence = _getResidenceById(residenceId);
        if (!residence) {
            _showToast('Residence not found', 'error');
            return;
        }

        if (residence.isDemolished) {
            _showToast('Residence is already demolished', 'warning');
            return;
        }

        var unitStats = _getUnitStats(residenceId);

        _confirmDialog(
            'Demolish "' + residence.name + '"?\n\n' +
            (unitStats.occupied > 0 ? 'Warning: ' + unitStats.occupied + ' unit(s) are occupied!\n' : '') +
            'This will destroy the residence and mark it as demolished.\n\n' +
            'This action cannot be undone.',
            'Demolish Residence',
            function() {
                var result = _demolishResidence(residenceId, 'Manual demolition', _getCurrentYear(), {
                    destroyedBy: 'manual'
                });

                if (result && result.success) {
                    _showToast('Residence "' + residence.name + '" demolished', 'info');
                    renderSettlementResidences('tab-residences', locationId);
                } else {
                    _showToast(result && result.error ? result.error : 'Failed to demolish residence', 'error');
                }
            },
            function() {
                // Cancel
            }
        );
    }

    // =========================================================================
    // 15. CONFIRM DELETE RESIDENCE
    // =========================================================================

    function _confirmDeleteResidence(residenceId, locationId) {
        var residence = _getResidenceById(residenceId);
        if (!residence) {
            _showToast('Residence not found', 'error');
            return;
        }

        var unitStats = _getUnitStats(residenceId);
        var hasOccupied = unitStats.occupied > 0;

        _confirmDialog(
            'Delete "' + residence.name + '"?\n\n' +
            (hasOccupied ? 'Warning: ' + unitStats.occupied + ' unit(s) are still occupied!\n' : '') +
            'This will permanently remove the residence from the game world.\n\n' +
            'This action cannot be undone.',
            'Delete Residence',
            function() {
                var result = _deleteResidence(residenceId, { force: !hasOccupied });

                if (result) {
                    _showToast('Residence "' + residence.name + '" deleted', 'info');
                    renderSettlementResidences('tab-residences', locationId);
                } else {
                    _showToast('Failed to delete residence - occupied units must be vacated first', 'error');
                }
            },
            function() {
                // Cancel
            }
        );
    }

    // =========================================================================
    // 16. SET OWNER MODAL
    // =========================================================================

    function _openSetOwnerModal(residenceId, locationId) {
        if (_modalOpen) return;
        _modalOpen = true;

        try {
            var residence = _getResidenceById(residenceId);
            if (!residence) {
                _showToast('Residence not found', 'error');
                _modalOpen = false;
                return;
            }

            var currentOwner = _getResidenceOwner(residenceId);
            var currentYear = _getCurrentYear();

            var content = '' +
                '<div style="margin-bottom: 16px;">' +
                    '<div style="background: var(--bg3); border-radius: 6px; padding: 12px; margin-bottom: 12px;">' +
                        '<div style="font-size: 0.7rem;"><strong>' + _escapeHtml(residence.name) + '</strong></div>' +
                        '<div style="font-size: 0.6rem; color: var(--dim);">Current Owner: ' + (currentOwner ? _escapeHtml(currentOwner.ownerName) : 'None') + '</div>' +
                    '</div>' +
                    '<div class="form-group" style="margin-bottom: 12px;">' +
                        '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Owner Type</label>' +
                        '<select id="setOwnerType" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem; color: var(--text);">' +
                            '<option value="household">Household</option>' +
                            '<option value="character">Character</option>' +
                        '</select>' +
                    '</div>' +
                    '<div class="form-group" style="margin-bottom: 12px;">' +
                        '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Owner</label>' +
                        '<div style="display: flex; gap: 6px;">' +
                            '<input type="text" id="setOwnerDisplay" placeholder="Select owner..." readonly style="flex: 1; padding: 8px; background: var(--bg2); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem; color: var(--text); cursor: pointer;">' +
                            '<input type="hidden" id="setOwnerId">' +
                            '<button id="setOwnerSelectBtn" class="btn" style="font-size: 0.6rem; padding: 4px 10px;">Select</button>' +
                            '<button id="setOwnerClearBtn" class="btn" style="font-size: 0.6rem; padding: 4px 8px;">Clear</button>' +
                        '</div>' +
                    '</div>' +
                    '<div class="form-group" style="margin-bottom: 12px;">' +
                        '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Owner Since</label>' +
                        '<input type="number" id="setOwnerSince" value="' + currentYear + '" min="1" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem; color: var(--text);">' +
                    '</div>' +
                '</div>';

            _openModal({
                title: 'Set Owner: ' + residence.name,
                content: content,
                confirmText: 'Set Owner',
                cancelText: 'Cancel',
                onOpen: function() {
                    var selectBtn = document.getElementById('setOwnerSelectBtn');
                    var displayInput = document.getElementById('setOwnerDisplay');
                    var hiddenInput = document.getElementById('setOwnerId');

                    if (selectBtn) {
                        selectBtn.onclick = function() {
                            var ownerType = document.getElementById('setOwnerType').value;
                            if (ownerType === 'household') {
                                _openHouseholdSelector({
                                    title: 'Select Owner Household',
                                    onSelect: function(household) {
                                        if (household) {
                                            displayInput.value = household.name;
                                            hiddenInput.value = household.id;
                                            _showToast('Selected: ' + household.name, 'success');
                                        }
                                    }
                                });
                            } else {
                                _openCharacterSelector({
                                    title: 'Select Owner Character',
                                    onSelect: function(character) {
                                        if (character) {
                                            displayInput.value = character.name + (character.surname ? ' ' + character.surname : '');
                                            hiddenInput.value = character.id;
                                            _showToast('Selected: ' + character.name, 'success');
                                        }
                                    }
                                });
                            }
                        };
                    }

                    var clearBtn = document.getElementById('setOwnerClearBtn');
                    if (clearBtn) {
                        clearBtn.onclick = function() {
                            displayInput.value = '';
                            hiddenInput.value = '';
                        };
                    }
                },
                onConfirm: function() {
                    var ownerType = document.getElementById('setOwnerType').value;
                    var ownerId = document.getElementById('setOwnerId').value;
                    var ownerSince = parseInt(document.getElementById('setOwnerSince').value) || currentYear;

                    if (!ownerId) {
                        _showToast('Please select an owner', 'error');
                        return false;
                    }

                    var result = _setResidenceOwner(residenceId, ownerType, ownerId, {
                        ownerSince: ownerSince
                    });

                    if (result) {
                        _showToast('Owner set successfully', 'success');
                        _closeTopModal();
                        _modalOpen = false;
                        renderSettlementResidences('tab-residences', locationId);
                        return true;
                    } else {
                        _showToast('Failed to set owner', 'error');
                        return false;
                    }
                },
                onCancel: function() {
                    _modalOpen = false;
                }
            });

        } catch (e) {
            _modalOpen = false;
            _showToast('Error opening set owner modal', 'error');
        }
    }

    // =========================================================================
    // 17. SET RENTER MODAL
    // =========================================================================

    function _openSetRenterModal(residenceId, locationId) {
        if (_modalOpen) return;
        _modalOpen = true;

        try {
            var residence = _getResidenceById(residenceId);
            if (!residence) {
                _showToast('Residence not found', 'error');
                _modalOpen = false;
                return;
            }

            if (!residence.ownerId) {
                _showToast('Residence must have an owner before it can be rented', 'error');
                _modalOpen = false;
                return;
            }

            var currentRenter = _getResidenceRenter(residenceId);
            var currentYear = _getCurrentYear();

            var content = '' +
                '<div style="margin-bottom: 16px;">' +
                    '<div style="background: var(--bg3); border-radius: 6px; padding: 12px; margin-bottom: 12px;">' +
                        '<div style="font-size: 0.7rem;"><strong>' + _escapeHtml(residence.name) + '</strong></div>' +
                        '<div style="font-size: 0.6rem; color: var(--dim);">Owner: ' + (residence.ownerName || 'Unknown') + '</div>' +
                        '<div style="font-size: 0.6rem; color: var(--dim);">Current Renter: ' + (currentRenter ? _escapeHtml(currentRenter.renterName) : 'None') + '</div>' +
                        '<div style="font-size: 0.6rem; color: var(--dim);">Current Rent: ' + (currentRenter ? currentRenter.rentAmount + 'g' : '0g') + '</div>' +
                    '</div>' +
                    '<div class="form-group" style="margin-bottom: 12px;">' +
                        '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Renter Type</label>' +
                        '<select id="setRenterType" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem; color: var(--text);">' +
                            '<option value="household">Household</option>' +
                            '<option value="character">Character</option>' +
                        '</select>' +
                    '</div>' +
                    '<div class="form-group" style="margin-bottom: 12px;">' +
                        '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Renter</label>' +
                        '<div style="display: flex; gap: 6px;">' +
                            '<input type="text" id="setRenterDisplay" placeholder="Select renter..." readonly style="flex: 1; padding: 8px; background: var(--bg2); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem; color: var(--text); cursor: pointer;">' +
                            '<input type="hidden" id="setRenterId">' +
                            '<button id="setRenterSelectBtn" class="btn" style="font-size: 0.6rem; padding: 4px 10px;">Select</button>' +
                            '<button id="setRenterClearBtn" class="btn" style="font-size: 0.6rem; padding: 4px 8px;">Clear</button>' +
                        '</div>' +
                    '</div>' +
                    '<div class="form-group" style="margin-bottom: 12px;">' +
                        '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Annual Rent Amount (gold)</label>' +
                        '<input type="number" id="setRentAmount" value="' + (currentRenter ? currentRenter.rentAmount || 50 : 50) + '" min="0" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem; color: var(--text);">' +
                        '<small style="font-size: 0.55rem; color: var(--dim);">Rent is collected annually</small>' +
                    '</div>' +
                    '<div class="form-group" style="margin-bottom: 12px;">' +
                        '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Rent Start Year</label>' +
                        '<input type="number" id="setRentStartYear" value="' + currentYear + '" min="1" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem; color: var(--text);">' +
                    '</div>' +
                    '<div class="form-group" style="margin-bottom: 12px;">' +
                        '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Notes</label>' +
                        '<textarea id="setRentNotes" rows="2" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem; color: var(--text);" placeholder="Lease terms..."></textarea>' +
                    '</div>' +
                '</div>';

            _openModal({
                title: 'Set Renter: ' + residence.name,
                content: content,
                confirmText: 'Set Renter',
                cancelText: 'Cancel',
                onOpen: function() {
                    var selectBtn = document.getElementById('setRenterSelectBtn');
                    var displayInput = document.getElementById('setRenterDisplay');
                    var hiddenInput = document.getElementById('setRenterId');

                    if (selectBtn) {
                        selectBtn.onclick = function() {
                            var renterType = document.getElementById('setRenterType').value;
                            if (renterType === 'household') {
                                _openHouseholdSelector({
                                    title: 'Select Renter Household',
                                    onSelect: function(household) {
                                        if (household) {
                                            displayInput.value = household.name;
                                            hiddenInput.value = household.id;
                                            _showToast('Selected: ' + household.name, 'success');
                                        }
                                    }
                                });
                            } else {
                                _openCharacterSelector({
                                    title: 'Select Renter Character',
                                    onSelect: function(character) {
                                        if (character) {
                                            displayInput.value = character.name + (character.surname ? ' ' + character.surname : '');
                                            hiddenInput.value = character.id;
                                            _showToast('Selected: ' + character.name, 'success');
                                        }
                                    }
                                });
                            }
                        };
                    }

                    var clearBtn = document.getElementById('setRenterClearBtn');
                    if (clearBtn) {
                        clearBtn.onclick = function() {
                            displayInput.value = '';
                            hiddenInput.value = '';
                        };
                    }
                },
                onConfirm: function() {
                    var renterType = document.getElementById('setRenterType').value;
                    var renterId = document.getElementById('setRenterId').value;
                    var rentAmount = parseInt(document.getElementById('setRentAmount').value) || 0;
                    var rentStartYear = parseInt(document.getElementById('setRentStartYear').value) || currentYear;
                    var notes = document.getElementById('setRentNotes').value.trim();

                    if (!renterId) {
                        _showToast('Please select a renter', 'error');
                        return false;
                    }

                    if (rentAmount < 0) {
                        _showToast('Rent amount cannot be negative', 'error');
                        return false;
                    }

                    var result = _setResidenceRenter(residenceId, renterType, renterId, rentAmount, {
                        rentStartYear: rentStartYear,
                        notes: notes
                    });

                    if (result) {
                        _showToast('Renter set successfully (Rent: ' + rentAmount + 'g/year)', 'success');
                        _closeTopModal();
                        _modalOpen = false;
                        renderSettlementResidences('tab-residences', locationId);
                        return true;
                    } else {
                        _showToast('Failed to set renter', 'error');
                        return false;
                    }
                },
                onCancel: function() {
                    _modalOpen = false;
                }
            });

        } catch (e) {
            _modalOpen = false;
            _showToast('Error opening set renter modal', 'error');
        }
    }

    // =========================================================================
    // 18. CONFIRM END RENTAL
    // =========================================================================

    function _confirmEndRental(residenceId, locationId) {
        var residence = _getResidenceById(residenceId);
        if (!residence) {
            _showToast('Residence not found', 'error');
            return;
        }

        if (!residence.renterId) {
            _showToast('Residence has no renter', 'warning');
            return;
        }

        _confirmDialog(
            'End rental for "' + residence.name + '"?\n\n' +
            'Current Renter: ' + _escapeHtml(residence.renterName || 'Unknown') + '\n' +
            'Current Rent: ' + (residence.rentAmount || 0) + 'g/year\n\n' +
            'This will mark the residence as vacant.',
            'End Rental',
            function() {
                var result = _endResidenceRental(residenceId, _getCurrentYear(), 'Ended by administrator');

                if (result) {
                    _showToast('Rental ended for ' + (residence.renterName || 'Unknown'), 'success');
                    renderSettlementResidences('tab-residences', locationId);
                } else {
                    _showToast('Failed to end rental', 'error');
                }
            },
            function() {
                // Cancel
            }
        );
    }

    // =========================================================================
    // 19. ADD UNIT MODAL
    // =========================================================================

    function _openAddUnitModal(residenceId, locationId) {
        if (_modalOpen) return;
        _modalOpen = true;

        try {
            var residence = _getResidenceById(residenceId);
            if (!residence) {
                _showToast('Residence not found', 'error');
                _modalOpen = false;
                return;
            }

            if (!residence.isMultiUnit) {
                _showToast('Cannot add units to a non-multi-unit residence', 'error');
                _modalOpen = false;
                return;
            }

            if (residence.isDemolished) {
                _showToast('Residence has been demolished', 'error');
                _modalOpen = false;
                return;
            }

            var currentUnits = residence.units || [];
            var maxUnits = residence.maxUnits || 20;
            var unitCount = currentUnits.length;

            if (unitCount >= maxUnits) {
                _showToast('Maximum units reached (' + maxUnits + ')', 'warning');
                _modalOpen = false;
                return;
            }

            var content = '' +
                '<div style="margin-bottom: 16px;">' +
                    '<div style="background: var(--bg3); border-radius: 6px; padding: 8px 12px; margin-bottom: 12px; font-size: 0.6rem; color: var(--dim);">' +
                        'Adding a new unit to <strong>' + _escapeHtml(residence.name) + '</strong>' +
                        '<div style="margin-top: 4px;">' + unitCount + ' of ' + maxUnits + ' units currently exist</div>' +
                    '</div>' +
                    '<div class="form-group" style="margin-bottom: 12px;">' +
                        '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Unit Number (auto-assigned if not specified)</label>' +
                        '<input type="number" id="addUnitNumber" placeholder="Leave blank for auto-assign" min="1" max="' + maxUnits + '" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem; color: var(--text);">' +
                        '<small style="font-size: 0.55rem; color: var(--dim);">Numbers must be unique within the residence</small>' +
                    '</div>' +
                    '<div class="form-group" style="margin-bottom: 12px;">' +
                        '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Notes</label>' +
                        '<textarea id="addUnitNotes" rows="2" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem; color: var(--text);" placeholder="e.g., Ground floor unit"></textarea>' +
                    '</div>' +
                '</div>';

            _openModal({
                title: 'Add Unit to ' + residence.name,
                content: content,
                confirmText: 'Add Unit',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var unitNumberInput = document.getElementById('addUnitNumber').value;
                    var notes = document.getElementById('addUnitNotes').value.trim();

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
                        _modalOpen = false;
                        renderSettlementResidences('tab-residences', locationId);
                        return true;
                    } else {
                        _showToast(result ? result.reason : 'Failed to add unit', 'error');
                        return false;
                    }
                },
                onCancel: function() {
                    _modalOpen = false;
                }
            });

        } catch (e) {
            _modalOpen = false;
            _showToast('Error opening add unit modal', 'error');
        }
    }

    // =========================================================================
    // 20. REGISTER WITH TAB SYSTEM
    // =========================================================================

    function registerResidenceTabRenderer() {
        if (typeof window.registerTabRenderer === 'function') {
            window.registerTabRenderer('residences', function(containerId, locationId, summary) {
                renderSettlementResidences(containerId, locationId);
            }, true);
            console.log('[ResidenceTab] Registered with tab system');
        }
    }

    // =========================================================================
    // 21. EXPORTS
    // =========================================================================

    window.renderSettlementResidences = renderSettlementResidences;
    window._renderSettlementResidences = renderSettlementResidences;
    window.registerResidenceTabRenderer = registerResidenceTabRenderer;

    // Auto-register if tab system is available
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(registerResidenceTabRenderer, 100);
        });
    } else {
        setTimeout(registerResidenceTabRenderer, 100);
    }

})();