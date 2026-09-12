/**
 * =============================================================================
 * STILL WATERS - CRIME MODALS (modals-crime.js)
 * =============================================================================
 * 
 * LOCATION: js/core/crime/modals-crime.js
 * 
 * This file contains ALL modal dialogs for crime and vendetta operations.
 * 
 * EXPORTED FUNCTIONS:
 *   - CrimeModals.openMurderModal(options)
 *   - CrimeModals.openExecutionModal(options)
 *   - CrimeModals.openVendettaModal(options)
 *   - CrimeModals.openCrimeDetailsModal(crimeId)
 *   - CrimeModals.openVendettaDetailsModal(vendettaId)
 *   - CrimeModals.openCrimeStatsModal(locationId)
 * 
 * DEPENDENCIES:
 *   - modals-core.js: openModal, closeTopModal, _escapeHtml, _getIcon, _showToast
 *   - modals-char-select.js: openCharacterSelector, FILTER_PRESETS
 *   - locationDropdown.js: getFilteredLocationOptions, createLocationSelector
 *   - modals-household-selector.js: openHouseholdSelector
 *   - crime-commands.js: CrimeCommands
 *   - crime-queries.js: CrimeQueries
 *   - accessors.js: getCharacterById, getPlaceById, getPlaceName
 *   - time.js: getCurrentYearSafe
 * 
 * ICON POLICY: No emojis. Uses icons.js via _getIcon.
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. RECURSION GUARD
    // =========================================================================

    var _processingModal = false;

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _openModal(options) {
        if (typeof window.openModal === 'function') {
            return window.openModal(options);
        }
        return null;
    }

    function _closeTopModal() {
        if (typeof window.closeTopModal === 'function') {
            window.closeTopModal();
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
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
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

    function _showToast(message, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(message, type);
        } else if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        }
    }

    function _getCurrentYear() {
    // Delegates to time.js — do not add fallback logic here.
    return typeof window.getCurrentYearSafe === 'function'
        ? window.getCurrentYearSafe()
        : 1250;
}

    function _getCharacterById(id) {
        if (typeof window.getCharacterById === 'function') {
            return window.getCharacterById(id);
        }
        return null;
    }

    function _getPlaceById(id) {
        if (typeof window.getPlaceById === 'function') {
            return window.getPlaceById(id);
        }
        return null;
    }

    function _getPlaceName(id) {
        if (typeof window.getPlaceName === 'function') {
            return window.getPlaceName(id);
        }
        var place = _getPlaceById(id);
        return place ? place.displayName : 'Unknown';
    }

    function _getFilteredLocationOptions(selectedId) {
        if (typeof window.getFilteredLocationOptions === 'function') {
            return window.getFilteredLocationOptions(selectedId);
        }
        return '<option value="">No locations available</option>';
    }

    function _openCharacterSelector(options) {
        if (typeof window.openCharacterSelector === 'function') {
            return window.openCharacterSelector(options);
        }
        return null;
    }

    function _openHouseholdSelector(options) {
        if (typeof window.openHouseholdSelector === 'function') {
            return window.openHouseholdSelector(options);
        }
        return null;
    }

    function _getCrimeTypes() {
        return window.CRIME_TYPES || {
            MURDER: 'murder',
            EXECUTION: 'execution',
            THEFT: 'theft',
            ADULTERY: 'adultery',
            TREASON: 'treason'
        };
    }

    // =========================================================================
    // 2. ICON HELPERS
    // =========================================================================

    function _getIconSafe(name) {
        var icon = _getIcon(name);
        return icon || '';
    }

    function _getCrimeIcon(type) {
        var icons = {
            'murder': 'X_HEAVY',
            'execution': 'X_HEAVY',
            'theft': 'WARNING',
            'adultery': 'HEART_OUTLINE',
            'treason': 'SHIELD',
            'assault': 'SWORD',
            'vendetta': 'FLAG'
        };
        return _getIconSafe(icons[type] || 'CIRCLE_DOT');
    }

    // =========================================================================
    // 3. MURDER MODAL
    // =========================================================================

    /**
     * Opens the murder modal
     * @param {Object} options
     * @param {string} options.title - Modal title (default: 'Record Murder')
     * @param {string} options.victimId - Pre-selected victim ID
     * @param {string} options.killerId - Pre-selected killer ID
     * @param {number} options.year - Year (default: current)
     * @param {function} options.onComplete - Callback after murder
     * @returns {Object|null} Modal reference
     */
    function openMurderModal(options) {
        if (_processingModal) {
            _showToast('Modal is already processing', 'warning');
            return null;
        }
        _processingModal = true;

        try {
            options = options || {};
            var title = options.title || 'Record Murder';
            var currentYear = _getCurrentYear();
            var year = options.year || currentYear;

            var locationSelectHtml = _getFilteredLocationOptions(null);

            var modalContent =
                '<div style="margin-bottom: 12px;">' +
                '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px;">' +
                '<div>' +
                '<label style="display: block; font-size: 0.65rem; color: var(--accent); margin-bottom: 4px;">Victim</label>' +
                '<button id="crimeSelectVictim" class="btn" style="width: 100%; padding: 8px; background: var(--bg3); border: 1px solid var(--border); border-radius: 6px; cursor: pointer; font-size: 0.7rem; text-align: left;">' +
                _getIconSafe('PERSON') + ' <span id="crimeVictimDisplay">Select victim...</span>' +
                '</button>' +
                '<input type="hidden" id="crimeVictimId" value="">' +
                '</div>' +
                '<div>' +
                '<label style="display: block; font-size: 0.65rem; color: var(--accent); margin-bottom: 4px;">Killer</label>' +
                '<button id="crimeSelectKiller" class="btn" style="width: 100%; padding: 8px; background: var(--bg3); border: 1px solid var(--border); border-radius: 6px; cursor: pointer; font-size: 0.7rem; text-align: left;">' +
                _getIconSafe('PERSON') + ' <span id="crimeKillerDisplay">Select killer...</span>' +
                '</button>' +
                '<input type="hidden" id="crimeKillerId" value="">' +
                '</div>' +
                '</div>' +
                '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px;">' +
                '<div>' +
                '<label style="display: block; font-size: 0.65rem; color: var(--accent); margin-bottom: 4px;">Year</label>' +
                '<input type="number" id="crimeYear" value="' + year + '" style="width: 100%; padding: 6px 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.7rem;">' +
                '</div>' +
                '<div>' +
                '<label style="display: block; font-size: 0.65rem; color: var(--accent); margin-bottom: 4px;">Location</label>' +
                '<select id="crimeLocation" style="width: 100%; padding: 6px 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.65rem;">' +
                locationSelectHtml +
                '</select>' +
                '</div>' +
                '</div>' +
                '<div style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.65rem; color: var(--accent); margin-bottom: 4px;">Reason</label>' +
                '<input type="text" id="crimeReason" placeholder="e.g., Political rivalry, Jealousy, Revenge..." style="width: 100%; padding: 6px 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.7rem;">' +
                '<div style="margin-top: 4px; font-size: 0.5rem; color: var(--dim);">Leave blank for random reason</div>' +
                '</div>' +
                '<div style="margin-bottom: 12px;">' +
                '<label style="display: flex; align-items: center; gap: 8px; font-size: 0.65rem; cursor: pointer;">' +
                '<input type="checkbox" id="crimeStartVendetta" checked>' +
                'Start vendetta' +
                '</label>' +
                '</div>' +
                '<div style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.65rem; color: var(--accent); margin-bottom: 4px;">Notes</label>' +
                '<textarea id="crimeNotes" rows="2" style="width: 100%; padding: 6px 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.65rem; resize: vertical;"></textarea>' +
                '</div>' +
                '</div>';

            var modal = _openModal({
                title: title,
                content: modalContent,
                confirmText: 'Record Murder',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var victimId = document.getElementById('crimeVictimId').value;
                    var killerId = document.getElementById('crimeKillerId').value;
                    var yearVal = parseInt(document.getElementById('crimeYear').value) || _getCurrentYear();
                    var locationId = document.getElementById('crimeLocation').value || null;
                    var reason = document.getElementById('crimeReason').value || null;
                    var startVendetta = document.getElementById('crimeStartVendetta').checked;
                    var notes = document.getElementById('crimeNotes').value || null;

                    if (!victimId) {
                        _showToast('Please select a victim', 'error');
                        return;
                    }
                    if (!killerId) {
                        _showToast('Please select a killer', 'error');
                        return;
                    }
                    if (victimId === killerId) {
                        _showToast('Victim and killer cannot be the same', 'error');
                        return;
                    }

                    var result = window.CrimeCommands.triggerMurder(victimId, killerId, {
                        year: yearVal,
                        reason: reason,
                        locationId: locationId,
                        startVendetta: startVendetta,
                        notes: notes
                    });

                    if (result.success) {
                        _showToast('Murder recorded successfully', 'success');
                        if (options.onComplete) {
                            options.onComplete(result.data);
                        }
                    } else {
                        _showToast('Failed to record murder: ' + result.error, 'error');
                    }
                },
                onOpen: function() {
                    _attachMurderModalEvents(options);
                }
            });

            return modal;

        } finally {
            _processingModal = false;
        }
    }

    function _attachMurderModalEvents(options) {
        // Victim selection
        var victimBtn = document.getElementById('crimeSelectVictim');
        var victimDisplay = document.getElementById('crimeVictimDisplay');
        var victimHidden = document.getElementById('crimeVictimId');

        if (victimBtn) {
            victimBtn.addEventListener('click', function() {
                _openCharacterSelector({
                    title: 'Select Victim',
                    filters: { showDeceased: false },
                    onSelect: function(char) {
                        victimDisplay.textContent = char.name + (char.surname ? ' ' + char.surname : '');
                        victimHidden.value = char.id;
                    }
                });
            });
        }

        // Killer selection
        var killerBtn = document.getElementById('crimeSelectKiller');
        var killerDisplay = document.getElementById('crimeKillerDisplay');
        var killerHidden = document.getElementById('crimeKillerId');

        if (killerBtn) {
            killerBtn.addEventListener('click', function() {
                _openCharacterSelector({
                    title: 'Select Killer',
                    filters: { showDeceased: false },
                    onSelect: function(char) {
                        killerDisplay.textContent = char.name + (char.surname ? ' ' + char.surname : '');
                        killerHidden.value = char.id;
                    }
                });
            });
        }

        // Pre-select if provided
        if (options.victimId) {
            var victim = _getCharacterById(options.victimId);
            if (victim) {
                victimDisplay.textContent = victim.name + (victim.surname ? ' ' + victim.surname : '');
                victimHidden.value = victim.id;
            }
        }

        if (options.killerId) {
            var killer = _getCharacterById(options.killerId);
            if (killer) {
                killerDisplay.textContent = killer.name + (killer.surname ? ' ' + killer.surname : '');
                killerHidden.value = killer.id;
            }
        }
    }

    // =========================================================================
    // 4. EXECUTION MODAL
    // =========================================================================

    /**
     * Opens the execution modal
     * @param {Object} options
     * @param {string} options.title - Modal title (default: 'Record Execution')
     * @param {string} options.condemnedId - Pre-selected condemned ID
     * @param {number} options.year - Year (default: current)
     * @param {function} options.onComplete - Callback after execution
     * @returns {Object|null} Modal reference
     */
    function openExecutionModal(options) {
        if (_processingModal) {
            _showToast('Modal is already processing', 'warning');
            return null;
        }
        _processingModal = true;

        try {
            options = options || {};
            var title = options.title || 'Record Execution';
            var currentYear = _getCurrentYear();
            var year = options.year || currentYear;

            var locationSelectHtml = _getFilteredLocationOptions(null);

            var modalContent =
                '<div style="margin-bottom: 12px;">' +
                '<div style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.65rem; color: var(--accent); margin-bottom: 4px;">Condemned</label>' +
                '<button id="crimeSelectCondemned" class="btn" style="width: 100%; padding: 8px; background: var(--bg3); border: 1px solid var(--border); border-radius: 6px; cursor: pointer; font-size: 0.7rem; text-align: left;">' +
                _getIconSafe('PERSON') + ' <span id="crimeCondemnedDisplay">Select condemned...</span>' +
                '</button>' +
                '<input type="hidden" id="crimeCondemnedId" value="">' +
                '</div>' +
                '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px;">' +
                '<div>' +
                '<label style="display: block; font-size: 0.65rem; color: var(--accent); margin-bottom: 4px;">Year</label>' +
                '<input type="number" id="crimeExecYear" value="' + year + '" style="width: 100%; padding: 6px 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.7rem;">' +
                '</div>' +
                '<div>' +
                '<label style="display: block; font-size: 0.65rem; color: var(--accent); margin-bottom: 4px;">Location</label>' +
                '<select id="crimeExecLocation" style="width: 100%; padding: 6px 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.65rem;">' +
                locationSelectHtml +
                '</select>' +
                '</div>' +
                '</div>' +
                '<div style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.65rem; color: var(--accent); margin-bottom: 4px;">Reason</label>' +
                '<input type="text" id="crimeExecReason" placeholder="e.g., Treason, Murder, Adultery..." style="width: 100%; padding: 6px 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.7rem;">' +
                '<div style="margin-top: 4px; font-size: 0.5rem; color: var(--dim);">Leave blank for random reason</div>' +
                '</div>' +
                '<div style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.65rem; color: var(--accent); margin-bottom: 4px;">Method</label>' +
                '<input type="text" id="crimeExecMethod" placeholder="e.g., Beheading, Hanging, Burning..." style="width: 100%; padding: 6px 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.7rem;">' +
                '<div style="margin-top: 4px; font-size: 0.5rem; color: var(--dim);">Leave blank for random method</div>' +
                '</div>' +
                '<div style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.65rem; color: var(--accent); margin-bottom: 4px;">Notes</label>' +
                '<textarea id="crimeExecNotes" rows="2" style="width: 100%; padding: 6px 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.65rem; resize: vertical;"></textarea>' +
                '</div>' +
                '</div>';

            var modal = _openModal({
                title: title,
                content: modalContent,
                confirmText: 'Record Execution',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var condemnedId = document.getElementById('crimeCondemnedId').value;
                    var yearVal = parseInt(document.getElementById('crimeExecYear').value) || _getCurrentYear();
                    var locationId = document.getElementById('crimeExecLocation').value || null;
                    var reason = document.getElementById('crimeExecReason').value || null;
                    var method = document.getElementById('crimeExecMethod').value || null;
                    var notes = document.getElementById('crimeExecNotes').value || null;

                    if (!condemnedId) {
                        _showToast('Please select a condemned character', 'error');
                        return;
                    }

                    var result = window.CrimeCommands.triggerExecution(condemnedId, {
                        year: yearVal,
                        reason: reason,
                        method: method,
                        locationId: locationId,
                        notes: notes
                    });

                    if (result.success) {
                        _showToast('Execution recorded successfully', 'success');
                        if (options.onComplete) {
                            options.onComplete(result.data);
                        }
                    } else {
                        _showToast('Failed to record execution: ' + result.error, 'error');
                    }
                },
                onOpen: function() {
                    _attachExecutionModalEvents(options);
                }
            });

            return modal;

        } finally {
            _processingModal = false;
        }
    }

    function _attachExecutionModalEvents(options) {
        var condemnedBtn = document.getElementById('crimeSelectCondemned');
        var condemnedDisplay = document.getElementById('crimeCondemnedDisplay');
        var condemnedHidden = document.getElementById('crimeCondemnedId');

        if (condemnedBtn) {
            condemnedBtn.addEventListener('click', function() {
                _openCharacterSelector({
                    title: 'Select Condemned',
                    filters: { showDeceased: false },
                    onSelect: function(char) {
                        condemnedDisplay.textContent = char.name + (char.surname ? ' ' + char.surname : '');
                        condemnedHidden.value = char.id;
                    }
                });
            });
        }

        if (options.condemnedId) {
            var condemned = _getCharacterById(options.condemnedId);
            if (condemned) {
                condemnedDisplay.textContent = condemned.name + (condemned.surname ? ' ' + condemned.surname : '');
                condemnedHidden.value = condemned.id;
            }
        }
    }

    // =========================================================================
    // 5. VENDETTA MODAL
    // =========================================================================

    /**
     * Opens the vendetta modal
     * @param {Object} options
     * @param {string} options.title - Modal title (default: 'Create Vendetta')
     * @param {string} options.householdAId - Pre-selected household A ID
     * @param {string} options.householdBId - Pre-selected household B ID
     * @param {number} options.year - Year (default: current)
     * @param {function} options.onComplete - Callback after vendetta creation
     * @returns {Object|null} Modal reference
     */
    function openVendettaModal(options) {
        if (_processingModal) {
            _showToast('Modal is already processing', 'warning');
            return null;
        }
        _processingModal = true;

        try {
            options = options || {};
            var title = options.title || 'Create Vendetta';
            var currentYear = _getCurrentYear();
            var year = options.year || currentYear;

            var modalContent =
                '<div style="margin-bottom: 12px;">' +
                '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px;">' +
                '<div>' +
                '<label style="display: block; font-size: 0.65rem; color: var(--accent); margin-bottom: 4px;">Household A</label>' +
                '<button id="crimeSelectHouseholdA" class="btn" style="width: 100%; padding: 8px; background: var(--bg3); border: 1px solid var(--border); border-radius: 6px; cursor: pointer; font-size: 0.7rem; text-align: left;">' +
                _getIconSafe('HOUSEHOLD') + ' <span id="crimeHouseholdADisplay">Select household...</span>' +
                '</button>' +
                '<input type="hidden" id="crimeHouseholdAId" value="">' +
                '</div>' +
                '<div>' +
                '<label style="display: block; font-size: 0.65rem; color: var(--accent); margin-bottom: 4px;">Household B</label>' +
                '<button id="crimeSelectHouseholdB" class="btn" style="width: 100%; padding: 8px; background: var(--bg3); border: 1px solid var(--border); border-radius: 6px; cursor: pointer; font-size: 0.7rem; text-align: left;">' +
                _getIconSafe('HOUSEHOLD') + ' <span id="crimeHouseholdBDisplay">Select household...</span>' +
                '</button>' +
                '<input type="hidden" id="crimeHouseholdBId" value="">' +
                '</div>' +
                '</div>' +
                '<div style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.65rem; color: var(--accent); margin-bottom: 4px;">Year</label>' +
                '<input type="number" id="crimeVendettaYear" value="' + year + '" style="width: 100%; padding: 6px 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.7rem;">' +
                '</div>' +
                '<div style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.65rem; color: var(--accent); margin-bottom: 4px;">Cause</label>' +
                '<input type="text" id="crimeVendettaCause" placeholder="e.g., Blood feud, Land dispute, Honor..." style="width: 100%; padding: 6px 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.7rem;">' +
                '</div>' +
                '<div style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.65rem; color: var(--accent); margin-bottom: 4px;">Notes</label>' +
                '<textarea id="crimeVendettaNotes" rows="2" style="width: 100%; padding: 6px 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.65rem; resize: vertical;"></textarea>' +
                '</div>' +
                '</div>';

            var modal = _openModal({
                title: title,
                content: modalContent,
                confirmText: 'Create Vendetta',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var householdAId = document.getElementById('crimeHouseholdAId').value;
                    var householdBId = document.getElementById('crimeHouseholdBId').value;
                    var yearVal = parseInt(document.getElementById('crimeVendettaYear').value) || _getCurrentYear();
                    var cause = document.getElementById('crimeVendettaCause').value || 'Unknown cause';
                    var notes = document.getElementById('crimeVendettaNotes').value || null;

                    if (!householdAId || !householdBId) {
                        _showToast('Please select both households', 'error');
                        return;
                    }
                    if (householdAId === householdBId) {
                        _showToast('Households cannot be the same', 'error');
                        return;
                    }

                    var result = window.CrimeCommands.createVendetta({
                        householdAId: householdAId,
                        householdBId: householdBId,
                        cause: cause,
                        year: yearVal,
                        notes: notes
                    });

                    if (result.success) {
                        _showToast('Vendetta created successfully', 'success');
                        if (options.onComplete) {
                            options.onComplete(result.data);
                        }
                    } else {
                        _showToast('Failed to create vendetta: ' + result.error, 'error');
                    }
                },
                onOpen: function() {
                    _attachVendettaModalEvents(options);
                }
            });

            return modal;

        } finally {
            _processingModal = false;
        }
    }

    function _attachVendettaModalEvents(options) {
        var householdABtn = document.getElementById('crimeSelectHouseholdA');
        var householdADisplay = document.getElementById('crimeHouseholdADisplay');
        var householdAHidden = document.getElementById('crimeHouseholdAId');

        var householdBBtn = document.getElementById('crimeSelectHouseholdB');
        var householdBDisplay = document.getElementById('crimeHouseholdBDisplay');
        var householdBHidden = document.getElementById('crimeHouseholdBId');

        if (householdABtn) {
            householdABtn.addEventListener('click', function() {
                _openHouseholdSelector({
                    title: 'Select Household A',
                    onSelect: function(household) {
                        householdADisplay.textContent = household.name;
                        householdAHidden.value = household.id;
                    }
                });
            });
        }

        if (householdBBtn) {
            householdBBtn.addEventListener('click', function() {
                _openHouseholdSelector({
                    title: 'Select Household B',
                    onSelect: function(household) {
                        householdBDisplay.textContent = household.name;
                        householdBHidden.value = household.id;
                    }
                });
            });
        }

        if (options.householdAId) {
            var householdA = typeof window.getHouseholdById === 'function' ? window.getHouseholdById(options.householdAId) : null;
            if (householdA) {
                householdADisplay.textContent = householdA.name;
                householdAHidden.value = householdA.id;
            }
        }

        if (options.householdBId) {
            var householdB = typeof window.getHouseholdById === 'function' ? window.getHouseholdById(options.householdBId) : null;
            if (householdB) {
                householdBDisplay.textContent = householdB.name;
                householdBHidden.value = householdB.id;
            }
        }
    }

    // =========================================================================
    // 6. CRIME DETAILS MODAL
    // =========================================================================

    /**
     * Opens the crime details modal
     * @param {string} crimeId - Crime ID
     * @returns {Object|null} Modal reference
     */
    function openCrimeDetailsModal(crimeId) {
        var crime = window.CrimeQueries.getCrime(crimeId);
        if (!crime) {
            _showToast('Crime not found', 'error');
            return null;
        }

        var perpetrator = crime.perpetratorId ? _getCharacterById(crime.perpetratorId) : null;
        var victim = crime.victimId ? _getCharacterById(crime.victimId) : null;
        var location = crime.locationId ? _getPlaceById(crime.locationId) : null;

        var content =
            '<div style="padding: 4px 0;">' +
            '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;">' +
            '<div style="padding: 8px; background: var(--bg3); border-radius: 6px;">' +
            '<div style="font-size: 0.5rem; color: var(--dim);">Type</div>' +
            '<div style="font-size: 0.75rem;">' + _escapeHtml(crime.type) + '</div>' +
            '</div>' +
            '<div style="padding: 8px; background: var(--bg3); border-radius: 6px;">' +
            '<div style="font-size: 0.5rem; color: var(--dim);">Year</div>' +
            '<div style="font-size: 0.75rem;">' + _escapeHtml(crime.year) + '</div>' +
            '</div>' +
            '</div>' +
            '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;">' +
            '<div style="padding: 8px; background: var(--bg3); border-radius: 6px;">' +
            '<div style="font-size: 0.5rem; color: var(--dim);">Perpetrator</div>' +
            '<div style="font-size: 0.75rem;">' + (perpetrator ? _escapeHtml(perpetrator.name + (perpetrator.surname ? ' ' + perpetrator.surname : '')) : 'Unknown') + '</div>' +
            '</div>' +
            '<div style="padding: 8px; background: var(--bg3); border-radius: 6px;">' +
            '<div style="font-size: 0.5rem; color: var(--dim);">Victim</div>' +
            '<div style="font-size: 0.75rem;">' + (victim ? _escapeHtml(victim.name + (victim.surname ? ' ' + victim.surname : '')) : 'None') + '</div>' +
            '</div>' +
            '</div>' +
            '<div style="margin-bottom: 12px;">' +
            '<div style="padding: 8px; background: var(--bg3); border-radius: 6px;">' +
            '<div style="font-size: 0.5rem; color: var(--dim);">Location</div>' +
            '<div style="font-size: 0.75rem;">' + (location ? _escapeHtml(location.displayName) : 'Unknown') + '</div>' +
            '</div>' +
            '</div>' +
            '<div style="margin-bottom: 12px;">' +
            '<div style="padding: 8px; background: var(--bg3); border-radius: 6px;">' +
            '<div style="font-size: 0.5rem; color: var(--dim);">Reason</div>' +
            '<div style="font-size: 0.75rem;">' + _escapeHtml(crime.reason || 'Unknown') + '</div>' +
            '</div>' +
            '</div>' +
            '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;">' +
            '<div style="padding: 8px; background: var(--bg3); border-radius: 6px;">' +
            '<div style="font-size: 0.5rem; color: var(--dim);">Status</div>' +
            '<div style="font-size: 0.75rem;">' + (crime.solved ? 'Solved' : 'Unsolved') + '</div>' +
            '</div>' +
            '<div style="padding: 8px; background: var(--bg3); border-radius: 6px;">' +
            '<div style="font-size: 0.5rem; color: var(--dim);">Severity</div>' +
            '<div style="font-size: 0.75rem;">' + (crime.severity || 5) + '/10</div>' +
            '</div>' +
            '</div>';

        if (crime.solved && crime.solution) {
            content +=
                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; margin-bottom: 12px;">' +
                '<div style="font-size: 0.5rem; color: var(--dim);">Solution</div>' +
                '<div style="font-size: 0.75rem;">' + _escapeHtml(crime.solution) + '</div>' +
                '</div>';
        }

        if (crime.notes) {
            content +=
                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px;">' +
                '<div style="font-size: 0.5rem; color: var(--dim);">Notes</div>' +
                '<div style="font-size: 0.7rem;">' + _escapeHtml(crime.notes) + '</div>' +
                '</div>';
        }

        content += '</div>';

        return _openModal({
            title: 'Crime Details',
            content: content,
            confirmText: 'Close',
            cancelText: ''
        });
    }

    // =========================================================================
    // 7. VENDETTA DETAILS MODAL
    // =========================================================================

    /**
     * Opens the vendetta details modal
     * @param {string} vendettaId - Vendetta ID
     * @returns {Object|null} Modal reference
     */
    function openVendettaDetailsModal(vendettaId) {
        var vendetta = window.CrimeQueries.getVendetta(vendettaId);
        if (!vendetta) {
            _showToast('Vendetta not found', 'error');
            return null;
        }

        var statusDisplay = vendetta.status === 'resolved' ? 'Resolved' :
                           vendetta.status === 'escalated' ? 'Escalated' : 'Active';

        var deathsHtml = '';
        if (vendetta.deaths && vendetta.deaths.length > 0) {
            deathsHtml = '<div style="margin-top: 8px;">' +
                '<div style="font-size: 0.55rem; color: var(--dim); margin-bottom: 4px;">Deaths (' + vendetta.deaths.length + ')</div>';
            for (var i = 0; i < vendetta.deaths.length; i++) {
                var d = vendetta.deaths[i];
                deathsHtml += '<div style="padding: 4px 8px; background: var(--bg3); border-radius: 4px; margin-bottom: 4px; font-size: 0.65rem;">' +
                    (d.victimName || 'Unknown') + ' killed by ' + (d.killerName || 'Unknown') + ' (' + d.year + ')' +
                    (d.reason ? ' - ' + _escapeHtml(d.reason) : '') +
                    '</div>';
            }
            deathsHtml += '</div>';
        }

        var content =
            '<div style="padding: 4px 0;">' +
            '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;">' +
            '<div style="padding: 8px; background: var(--bg3); border-radius: 6px;">' +
            '<div style="font-size: 0.5rem; color: var(--dim);">Household A</div>' +
            '<div style="font-size: 0.75rem;">' + _escapeHtml(vendetta.householdAName || 'Unknown') + '</div>' +
            '</div>' +
            '<div style="padding: 8px; background: var(--bg3); border-radius: 6px;">' +
            '<div style="font-size: 0.5rem; color: var(--dim);">Household B</div>' +
            '<div style="font-size: 0.75rem;">' + _escapeHtml(vendetta.householdBName || 'Unknown') + '</div>' +
            '</div>' +
            '</div>' +
            '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 12px;">' +
            '<div style="padding: 8px; background: var(--bg3); border-radius: 6px;">' +
            '<div style="font-size: 0.5rem; color: var(--dim);">Started</div>' +
            '<div style="font-size: 0.75rem;">' + _escapeHtml(vendetta.startedYear || 'Unknown') + '</div>' +
            '</div>' +
            '<div style="padding: 8px; background: var(--bg3); border-radius: 6px;">' +
            '<div style="font-size: 0.5rem; color: var(--dim);">Status</div>' +
            '<div style="font-size: 0.75rem;">' + statusDisplay + '</div>' +
            '</div>' +
            '<div style="padding: 8px; background: var(--bg3); border-radius: 6px;">' +
            '<div style="font-size: 0.5rem; color: var(--dim);">Body Count</div>' +
            '<div style="font-size: 0.75rem;">' + (vendetta.bodyCount || 0) + '</div>' +
            '</div>' +
            '</div>';

        if (vendetta.cause) {
            content +=
                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; margin-bottom: 12px;">' +
                '<div style="font-size: 0.5rem; color: var(--dim);">Cause</div>' +
                '<div style="font-size: 0.75rem;">' + _escapeHtml(vendetta.cause) + '</div>' +
                '</div>';
        }

        if (deathsHtml) {
            content += deathsHtml;
        }

        if (vendetta.resolution) {
            content +=
                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; margin-top: 12px;">' +
                '<div style="font-size: 0.5rem; color: var(--dim);">Resolution</div>' +
                '<div style="font-size: 0.75rem;">' + _escapeHtml(vendetta.resolution) + '</div>' +
                '</div>';
        }

        if (vendetta.notes) {
            content +=
                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; margin-top: 12px;">' +
                '<div style="font-size: 0.5rem; color: var(--dim);">Notes</div>' +
                '<div style="font-size: 0.7rem;">' + _escapeHtml(vendetta.notes) + '</div>' +
                '</div>';
        }

        content += '</div>';

        return _openModal({
            title: 'Vendetta Details',
            content: content,
            confirmText: 'Close',
            cancelText: ''
        });
    }

    // =========================================================================
    // 8. CRIME STATS MODAL
    // =========================================================================

    /**
     * Opens the crime statistics modal
     * @param {string} locationId - Location ID (optional)
     * @returns {Object|null} Modal reference
     */
    function openCrimeStatsModal(locationId) {
        var stats;

        if (locationId) {
            stats = window.CrimeQueries.getLocationCrimeStats(locationId);
        } else {
            stats = window.CrimeQueries.getOverallCrimeStats();
        }

        var locationName = locationId ? _getPlaceName(locationId) : 'Global';

        var content =
            '<div style="padding: 4px 0;">' +
            '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 12px;">' +
            '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; text-align: center;">' +
            '<div style="font-size: 0.5rem; color: var(--dim);">Total Crimes</div>' +
            '<div style="font-size: 1rem; font-weight: bold;">' + (stats.totalCrimes || 0) + '</div>' +
            '</div>' +
            '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; text-align: center;">' +
            '<div style="font-size: 0.5rem; color: var(--dim);">Solve Rate</div>' +
            '<div style="font-size: 1rem; font-weight: bold;">' + Math.round(stats.solvedRate || 0) + '%</div>' +
            '</div>' +
            '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; text-align: center;">' +
            '<div style="font-size: 0.5rem; color: var(--dim);">Unsolved</div>' +
            '<div style="font-size: 1rem; font-weight: bold;">' + (stats.unsolvedCrimes || 0) + '</div>' +
            '</div>' +
            '</div>';

        if (stats.typeDistribution) {
            content +=
                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; margin-bottom: 12px;">' +
                '<div style="font-size: 0.55rem; color: var(--dim); margin-bottom: 4px;">Crime Types</div>';
            var typeEntries = Object.entries(stats.typeDistribution).sort(function(a, b) { return b[1] - a[1]; });
            for (var i = 0; i < Math.min(typeEntries.length, 5); i++) {
                content += '<div style="display: flex; justify-content: space-between; font-size: 0.7rem; padding: 2px 0;">' +
                    '<span>' + _escapeHtml(typeEntries[i][0]) + '</span>' +
                    '<span>' + typeEntries[i][1] + '</span>' +
                    '</div>';
            }
            content += '</div>';
        }

        if (stats.severityBreakdown) {
            content +=
                '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 4px; margin-bottom: 12px;">' +
                '<div style="padding: 6px; background: var(--bg3); border-radius: 4px; text-align: center; font-size: 0.65rem;">' +
                'Low: ' + (stats.severityBreakdown.low || 0) +
                '</div>' +
                '<div style="padding: 6px; background: var(--bg3); border-radius: 4px; text-align: center; font-size: 0.65rem;">' +
                'Medium: ' + (stats.severityBreakdown.medium || 0) +
                '</div>' +
                '<div style="padding: 6px; background: var(--bg3); border-radius: 4px; text-align: center; font-size: 0.65rem;">' +
                'High: ' + (stats.severityBreakdown.high || 0) +
                '</div>' +
                '<div style="padding: 6px; background: var(--bg3); border-radius: 4px; text-align: center; font-size: 0.65rem;">' +
                'Critical: ' + (stats.severityBreakdown.critical || 0) +
                '</div>' +
                '</div>';
        }

        if (stats.averageCrimeSeverity !== undefined) {
            content +=
                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; margin-bottom: 12px; font-size: 0.7rem;">' +
                'Average Severity: ' + stats.averageCrimeSeverity.toFixed(1) + '/10' +
                '</div>';
        }

        if (stats.mostCommonCrime) {
            content +=
                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.7rem;">' +
                'Most Common Crime: ' + _escapeHtml(stats.mostCommonCrime) +
                '</div>';
        }

        content += '</div>';

        return _openModal({
            title: 'Crime Statistics - ' + _escapeHtml(locationName),
            content: content,
            confirmText: 'Close',
            cancelText: ''
        });
    }

    // =========================================================================
    // 9. EXPORTS
    // =========================================================================

    window.CrimeModals = {
        openMurderModal: openMurderModal,
        openExecutionModal: openExecutionModal,
        openVendettaModal: openVendettaModal,
        openCrimeDetailsModal: openCrimeDetailsModal,
        openVendettaDetailsModal: openVendettaDetailsModal,
        openCrimeStatsModal: openCrimeStatsModal
    };

    // Legacy aliases
    window._crimeModals = window.CrimeModals;

})();