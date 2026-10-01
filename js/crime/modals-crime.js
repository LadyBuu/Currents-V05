/**
 * =============================================================================
 * STILL WATERS - CRIME MODALS (modals-crime.js)
 * =============================================================================
 *
 * LOCATION: js/core/crime/modals-crime.js
 *
 * PURPOSE:
 *   Modal dialogs for crime and vendetta operations. This layer collects
 *   input and hands it to CrimeCommands; it renders data supplied by
 *   CrimeQueries. It does not decide domain rules, does not mutate records
 *   directly, and does not carry its own vocabulary of crime types,
 *   vendetta statuses, or punishments.
 *
 * OWNERSHIP:
 *   - modal construction and lifecycle
 *   - input collection and obvious UI-level validation
 *   - presentation formatting (human-readable labels from canonical ids)
 *   - delegating actions to CrimeCommands
 *   - delegating reads to CrimeQueries
 *
 * WHAT THIS MODULE DOES NOT DO:
 *   - It does not mutate crime records, characters, households, or vendettas.
 *   - It does not carry a fallback crime taxonomy.
 *   - It does not hardcode vendetta status identifiers.
 *   - It does not fabricate years, causes, or punishment text.
 *   - It does not use a module-wide "processing" guard. Modals do not
 *     recursively construct themselves.
 *
 * DEPENDENCIES (required):
 *   - modals-core.js: openModal, _escapeHtml, _getIcon, _showToast
 *   - modals-char-select.js: openCharacterSelector
 *   - modals-household-selector.js: openHouseholdSelector
 *   - locationDropdown.js: getFilteredLocationOptions
 *   - crime-commands.js: CrimeCommands
 *   - crime-queries.js: CrimeQueries
 *   - crime-constants.js: CrimeConstants
 *   - accessors.js: getCharacterById, getPlaceById, getPlaceName, getHouseholdById
 *   - time.js: getCurrentYearSafe
 *
 * Missing required dependencies fail loudly. UI is the wrong place to hide
 * a broken boot order behind a silent fallback.
 *
 * ICON POLICY: No emojis. Icons come from icons.js via _getIcon.
 *
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. DEPENDENCY RESOLUTION
    // =========================================================================

    function _require(name, obj) {
        if (typeof obj === 'undefined' || obj === null) {
            throw new Error('[CrimeModals] Required dependency ' + name + ' is not available.');
        }
        return obj;
    }

    function _openModal(options) {
        return _require('openModal', window.openModal)(options);
    }

    function _escapeHtml(str) {
        return _require('_escapeHtml', window._escapeHtml)(str);
    }

    function _getIcon(name) {
        if (typeof window._getIcon !== 'function') {
            throw new Error('[CrimeModals] Required dependency _getIcon is not available.');
        }
        return window._getIcon(name);
    }

    function _showToast(message, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(message, type);
            return;
        }
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
            return;
        }
        throw new Error('[CrimeModals] No toast function is available.');
    }

    function _getCurrentYear() {
        return _require('getCurrentYearSafe', window.getCurrentYearSafe)();
    }

    function _getCharacterById(id) {
        if (typeof window.getCharacterById !== 'function') return null;
        return window.getCharacterById(id);
    }

    function _getHouseholdById(id) {
        if (typeof window.getHouseholdById !== 'function') return null;
        return window.getHouseholdById(id);
    }

    function _getPlaceById(id) {
        if (typeof window.getPlaceById !== 'function') return null;
        return window.getPlaceById(id);
    }

    function _getPlaceName(id) {
        if (typeof window.getPlaceName === 'function') return window.getPlaceName(id);
        var place = _getPlaceById(id);
        return place ? place.displayName : null;
    }

    function _getFilteredLocationOptions(selectedId) {
        return _require('getFilteredLocationOptions', window.getFilteredLocationOptions)(selectedId);
    }

    function _openCharacterSelector(options) {
        return _require('openCharacterSelector', window.openCharacterSelector)(options);
    }

    function _openHouseholdSelector(options) {
        return _require('openHouseholdSelector', window.openHouseholdSelector)(options);
    }

    function _getCommands() {
        return _require('CrimeCommands', window.CrimeCommands);
    }

    function _getQueries() {
        return _require('CrimeQueries', window.CrimeQueries);
    }

    function _getConstants() {
        return _require('CrimeConstants', window.CrimeConstants);
    }

    // =========================================================================
    // 1. PRESENTATION HELPERS
    // =========================================================================
    //
    // Canonical identifiers are storage-level values. The UI needs display
    // strings. These formatters are the only place in the crime UI where
    // that translation happens. If a new crime type is added to
    // CrimeConstants, only this file needs updating for the UI.

    var _TYPE_LABELS = {
        murder: 'Murder',
        execution: 'Execution',
        crime_of_passion: 'Crime of Passion',
        adultery: 'Adultery',
        treason: 'Treason',
        theft: 'Theft',
        espionage: 'Espionage',
        assault: 'Assault',
        vendetta: 'Vendetta Violence',
        violence: 'Violence',
        robbery: 'Robbery',
        fraud: 'Fraud',
        forgery: 'Forgery',
        smuggling: 'Smuggling',
        heresy: 'Heresy',
        blasphemy: 'Blasphemy',
        apostasy: 'Apostasy',
        sacrilege: 'Sacrilege',
        witchcraft: 'Witchcraft',
        idolatry: 'Idolatry',
        schism: 'Schism',
        excommunication_violation: 'Violation of Excommunication',
        religious_impersonation: 'Religious Impersonation',
        false_prophecy: 'False Prophecy',
        desecration: 'Desecration'
    };

    function formatCrimeType(type) {
        if (!type) return 'Unknown';
        if (Object.prototype.hasOwnProperty.call(_TYPE_LABELS, type)) {
            return _TYPE_LABELS[type];
        }
        // Fallback: convert snake_case to Title Case so unknown types still
        // render legibly without inventing a taxonomy.
        return String(type)
            .split('_')
            .map(function(word) {
                return word.charAt(0).toUpperCase() + word.slice(1);
            })
            .join(' ');
    }

    function formatVendettaStatus(status) {
        var constants = _getConstants();
        var s = constants.VENDETTA_STATUS;
        switch (status) {
            case s.ACTIVE: return 'Active';
            case s.ESCALATED: return 'Escalated';
            case s.RESOLVED: return 'Resolved';
            default: return status ? String(status) : 'Unknown';
        }
    }

    function formatSeverity(severity) {
        if (typeof severity !== 'number') return 'Unknown';
        return severity + '/10';
    }

    function formatPersonName(character) {
        if (!character) return 'Unknown';
        var name = character.name || 'Unknown';
        if (character.surname) name += ' ' + character.surname;
        return name;
    }

    // Icons: single source. If an icon name changes in icons.js, only this
    // map needs updating.
    function iconForCrimeType(type) {
        switch (type) {
            case 'murder':
            case 'execution':
            case 'crime_of_passion':
                return _getIcon('X_HEAVY');
            case 'treason':
            case 'espionage':
                return _getIcon('SHIELD');
            case 'assault':
            case 'violence':
            case 'vendetta':
                return _getIcon('SWORD');
            case 'theft':
            case 'robbery':
            case 'fraud':
            case 'forgery':
            case 'smuggling':
                return _getIcon('WARNING');
            case 'adultery':
                return _getIcon('HEART_OUTLINE');
            default:
                return _getIcon('CIRCLE_DOT');
        }
    }

    // =========================================================================
    // 2. SMALL RENDER HELPERS (reduce string-concatenation noise)
    // =========================================================================

    function _detail(label, value) {
        return '' +
            '<div style="padding: 8px; background: var(--bg3); border-radius: 6px;">' +
            '<div style="font-size: 0.5rem; color: var(--dim);">' +
            _escapeHtml(label) +
            '</div>' +
            '<div style="font-size: 0.75rem;">' +
            value +
            '</div>' +
            '</div>';
    }

    function _detailGrid(cells) {
        return '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; margin-bottom: 12px;">' +
            cells.join('') +
            '</div>';
    }

    function _selectButton(id, displayId, placeholder, iconName) {
        return '' +
            '<button id="' + id + '" class="btn" style="' +
            'width: 100%; padding: 8px; background: var(--bg3); ' +
            'border: 1px solid var(--border); border-radius: 6px; ' +
            'cursor: pointer; font-size: 0.7rem; text-align: left;">' +
            _getIcon(iconName) + ' ' +
            '<span id="' + displayId + '">' + _escapeHtml(placeholder) + '</span>' +
            '</button>';
    }

    function _labelledField(label, innerHtml) {
        return '' +
            '<div>' +
            '<label style="display: block; font-size: 0.65rem; color: var(--accent); margin-bottom: 4px;">' +
            _escapeHtml(label) +
            '</label>' +
            innerHtml +
            '</div>';
    }

    function _textInput(id, value, placeholder) {
        return '<input type="text" id="' + id + '" value="' +
            _escapeHtml(value == null ? '' : value) +
            '" placeholder="' + _escapeHtml(placeholder || '') +
            '" style="width: 100%; padding: 6px 8px; background: var(--bg); ' +
            'border: 1px solid var(--border); border-radius: 6px; font-size: 0.7rem;">';
    }

    function _numberInput(id, value) {
        return '<input type="number" id="' + id + '" value="' +
            _escapeHtml(value == null ? '' : String(value)) +
            '" style="width: 100%; padding: 6px 8px; background: var(--bg); ' +
            'border: 1px solid var(--border); border-radius: 6px; font-size: 0.7rem;">';
    }

    function _textarea(id, value, rows) {
        return '<textarea id="' + id + '" rows="' + (rows || 2) + '" style="' +
            'width: 100%; padding: 6px 8px; background: var(--bg); ' +
            'border: 1px solid var(--border); border-radius: 6px; ' +
            'font-size: 0.65rem; resize: vertical;">' +
            _escapeHtml(value == null ? '' : value) +
            '</textarea>';
    }

    // =========================================================================
    // 3. MURDER MODAL
    // =========================================================================

    function openMurderModal(options) {
        options = options || {};
        var title = options.title || 'Record Murder';
        var defaultYear = (typeof options.year === 'number') ? options.year : _getCurrentYear();

        var content = '' +
            '<div style="margin-bottom: 12px;">' +
            _detailGrid([
                _labelledField('Victim',
                    _selectButton('crimeSelectVictim', 'crimeVictimDisplay', 'Select victim...', 'PERSON') +
                    '<input type="hidden" id="crimeVictimId" value="">'
                ),
                _labelledField('Killer',
                    _selectButton('crimeSelectKiller', 'crimeKillerDisplay', 'Select killer...', 'PERSON') +
                    '<input type="hidden" id="crimeKillerId" value="">'
                )
            ]) +
            _detailGrid([
                _labelledField('Year', _numberInput('crimeYear', defaultYear)),
                _labelledField('Location',
                    '<select id="crimeLocation" style="width: 100%; padding: 6px 8px; ' +
                    'background: var(--bg); border: 1px solid var(--border); ' +
                    'border-radius: 6px; font-size: 0.65rem;">' +
                    _getFilteredLocationOptions(null) +
                    '</select>'
                )
            ]) +
            '<div style="margin-bottom: 12px;">' +
            _labelledField('Reason',
                _textInput('crimeReason', '', 'e.g., Political rivalry, Jealousy...') +
                '<div style="margin-top: 4px; font-size: 0.5rem; color: var(--dim);">' +
                'Leave blank for a random reason from the vocabulary.' +
                '</div>'
            ) +
            '</div>' +
            '<div style="margin-bottom: 12px;">' +
            '<label style="display: flex; align-items: center; gap: 8px; font-size: 0.65rem; cursor: pointer;">' +
            '<input type="checkbox" id="crimeStartVendetta" checked>' +
            'Start vendetta' +
            '</label>' +
            '</div>' +
            '<div style="margin-bottom: 12px;">' +
            _labelledField('Notes', _textarea('crimeNotes', '', 2)) +
            '</div>' +
            '</div>';

        return _openModal({
            title: title,
            content: content,
            confirmText: 'Record Murder',
            cancelText: 'Cancel',
            onConfirm: function() {
                var victimId = document.getElementById('crimeVictimId').value;
                var killerId = document.getElementById('crimeKillerId').value;
                var yearRaw = document.getElementById('crimeYear').value;
                var yearVal = yearRaw === '' ? _getCurrentYear() : parseInt(yearRaw, 10);
                var locationId = document.getElementById('crimeLocation').value || null;
                var reasonRaw = document.getElementById('crimeReason').value;
                var reason = reasonRaw === '' ? null : reasonRaw;
                var startVendetta = document.getElementById('crimeStartVendetta').checked;
                var notesRaw = document.getElementById('crimeNotes').value;
                var notes = notesRaw === '' ? null : notesRaw;

                if (!victimId) { _showToast('Please select a victim', 'error'); return; }
                if (!killerId) { _showToast('Please select a killer', 'error'); return; }
                if (victimId === killerId) {
                    _showToast('Victim and killer cannot be the same', 'error');
                    return;
                }
                if (isNaN(yearVal)) { _showToast('Year must be a number', 'error'); return; }

                var result = _getCommands().triggerMurder(victimId, killerId, {
                    year: yearVal,
                    locationId: locationId,
                    reason: reason,
                    startVendetta: startVendetta,
                    notes: notes
                });

                if (result.success) {
                    _showToast('Murder recorded', 'success');
                    if (typeof options.onComplete === 'function') options.onComplete(result.data);
                } else {
                    _showToast('Failed to record murder: ' + result.error, 'error');
                }
            },
            onOpen: function() {
                _attachMurderEvents(options);
            }
        });
    }

    function _attachMurderEvents(options) {
        var victimBtn = document.getElementById('crimeSelectVictim');
        var victimDisplay = document.getElementById('crimeVictimDisplay');
        var victimHidden = document.getElementById('crimeVictimId');

        var killerBtn = document.getElementById('crimeSelectKiller');
        var killerDisplay = document.getElementById('crimeKillerDisplay');
        var killerHidden = document.getElementById('crimeKillerId');

        if (victimBtn) {
            victimBtn.addEventListener('click', function() {
                _openCharacterSelector({
                    title: 'Select Victim',
                    filters: { showDeceased: false },
                    onSelect: function(char) {
                        victimDisplay.textContent = formatPersonName(char);
                        victimHidden.value = char.id;
                    }
                });
            });
        }

        if (killerBtn) {
            killerBtn.addEventListener('click', function() {
                _openCharacterSelector({
                    title: 'Select Killer',
                    filters: { showDeceased: false },
                    onSelect: function(char) {
                        killerDisplay.textContent = formatPersonName(char);
                        killerHidden.value = char.id;
                    }
                });
            });
        }

        if (options.victimId) {
            var victim = _getCharacterById(options.victimId);
            if (victim) {
                victimDisplay.textContent = formatPersonName(victim);
                victimHidden.value = victim.id;
            }
        }
        if (options.killerId) {
            var killer = _getCharacterById(options.killerId);
            if (killer) {
                killerDisplay.textContent = formatPersonName(killer);
                killerHidden.value = killer.id;
            }
        }
    }

    // =========================================================================
    // 4. EXECUTION MODAL
    // =========================================================================

    function openExecutionModal(options) {
        options = options || {};
        var title = options.title || 'Record Execution';
        var defaultYear = (typeof options.year === 'number') ? options.year : _getCurrentYear();

        var methods = _getConstants().EXECUTION_METHODS || {};
        var methodOptions = '<option value="">Default (state selection)</option>';
        for (var key in methods) {
            if (!Object.prototype.hasOwnProperty.call(methods, key)) continue;
            var m = methods[key];
            methodOptions += '<option value="' + _escapeHtml(m.name) + '">' +
                _escapeHtml(m.name) + '</option>';
        }

        var content = '' +
            '<div style="margin-bottom: 12px;">' +
            _labelledField('Condemned',
                _selectButton('crimeSelectCondemned', 'crimeCondemnedDisplay', 'Select condemned...', 'PERSON') +
                '<input type="hidden" id="crimeCondemnedId" value="">'
            ) +
            '</div>' +
            _detailGrid([
                _labelledField('Year', _numberInput('crimeExecYear', defaultYear)),
                _labelledField('Location',
                    '<select id="crimeExecLocation" style="width: 100%; padding: 6px 8px; ' +
                    'background: var(--bg); border: 1px solid var(--border); ' +
                    'border-radius: 6px; font-size: 0.65rem;">' +
                    _getFilteredLocationOptions(null) +
                    '</select>'
                )
            ]) +
            '<div style="margin-bottom: 12px;">' +
            _labelledField('Reason',
                _textInput('crimeExecReason', '', 'e.g., Treason, Murder, Adultery...')
            ) +
            '</div>' +
            '<div style="margin-bottom: 12px;">' +
            _labelledField('Method',
                '<select id="crimeExecMethod" style="width: 100%; padding: 6px 8px; ' +
                'background: var(--bg); border: 1px solid var(--border); ' +
                'border-radius: 6px; font-size: 0.7rem;">' +
                methodOptions +
                '</select>'
            ) +
            '</div>' +
            '<div style="margin-bottom: 12px;">' +
            _labelledField('Notes', _textarea('crimeExecNotes', '', 2)) +
            '</div>';

        return _openModal({
            title: title,
            content: content,
            confirmText: 'Record Execution',
            cancelText: 'Cancel',
            onConfirm: function() {
                var condemnedId = document.getElementById('crimeCondemnedId').value;
                var yearRaw = document.getElementById('crimeExecYear').value;
                var yearVal = yearRaw === '' ? _getCurrentYear() : parseInt(yearRaw, 10);
                var locationId = document.getElementById('crimeExecLocation').value || null;
                var reasonRaw = document.getElementById('crimeExecReason').value;
                var reason = reasonRaw === '' ? null : reasonRaw;
                var methodRaw = document.getElementById('crimeExecMethod').value;
                var method = methodRaw === '' ? null : methodRaw;
                var notesRaw = document.getElementById('crimeExecNotes').value;
                var notes = notesRaw === '' ? null : notesRaw;

                if (!condemnedId) {
                    _showToast('Please select a condemned character', 'error');
                    return;
                }
                if (isNaN(yearVal)) { _showToast('Year must be a number', 'error'); return; }

                var result = _getCommands().triggerExecution(condemnedId, {
                    year: yearVal,
                    locationId: locationId,
                    reason: reason,
                    method: method,
                    notes: notes
                });

                if (result.success) {
                    _showToast('Execution recorded', 'success');
                    if (typeof options.onComplete === 'function') options.onComplete(result.data);
                } else {
                    _showToast('Failed to record execution: ' + result.error, 'error');
                }
            },
            onOpen: function() {
                _attachExecutionEvents(options);
            }
        });
    }

    function _attachExecutionEvents(options) {
        var btn = document.getElementById('crimeSelectCondemned');
        var display = document.getElementById('crimeCondemnedDisplay');
        var hidden = document.getElementById('crimeCondemnedId');

        if (btn) {
            btn.addEventListener('click', function() {
                _openCharacterSelector({
                    title: 'Select Condemned',
                    filters: { showDeceased: false },
                    onSelect: function(char) {
                        display.textContent = formatPersonName(char);
                        hidden.value = char.id;
                    }
                });
            });
        }

        if (options.condemnedId) {
            var condemned = _getCharacterById(options.condemnedId);
            if (condemned) {
                display.textContent = formatPersonName(condemned);
                hidden.value = condemned.id;
            }
        }
    }

    // =========================================================================
    // 5. VENDETTA MODAL
    // =========================================================================

    function openVendettaModal(options) {
        options = options || {};
        var title = options.title || 'Create Vendetta';
        var defaultYear = (typeof options.year === 'number') ? options.year : _getCurrentYear();

        var content = '' +
            _detailGrid([
                _labelledField('Household A',
                    _selectButton('crimeSelectHouseholdA', 'crimeHouseholdADisplay', 'Select household...', 'HOUSEHOLD') +
                    '<input type="hidden" id="crimeHouseholdAId" value="">'
                ),
                _labelledField('Household B',
                    _selectButton('crimeSelectHouseholdB', 'crimeHouseholdBDisplay', 'Select household...', 'HOUSEHOLD') +
                    '<input type="hidden" id="crimeHouseholdBId" value="">'
                )
            ]) +
            '<div style="margin-bottom: 12px;">' +
            _labelledField('Year', _numberInput('crimeVendettaYear', defaultYear)) +
            '</div>' +
            '<div style="margin-bottom: 12px;">' +
            _labelledField('Cause',
                _textInput('crimeVendettaCause', '', 'e.g., Blood feud, Land dispute, Honor...') +
                '<div style="margin-top: 4px; font-size: 0.5rem; color: var(--dim);">' +
                'Leave blank to record the cause as unspecified.' +
                '</div>'
            ) +
            '</div>' +
            '<div style="margin-bottom: 12px;">' +
            _labelledField('Notes', _textarea('crimeVendettaNotes', '', 2)) +
            '</div>';

        return _openModal({
            title: title,
            content: content,
            confirmText: 'Create Vendetta',
            cancelText: 'Cancel',
            onConfirm: function() {
                var householdAId = document.getElementById('crimeHouseholdAId').value;
                var householdBId = document.getElementById('crimeHouseholdBId').value;
                var yearRaw = document.getElementById('crimeVendettaYear').value;
                var yearVal = yearRaw === '' ? _getCurrentYear() : parseInt(yearRaw, 10);
                var causeRaw = document.getElementById('crimeVendettaCause').value;
                var cause = causeRaw === '' ? null : causeRaw;
                var notesRaw = document.getElementById('crimeVendettaNotes').value;
                var notes = notesRaw === '' ? null : notesRaw;

                if (!householdAId || !householdBId) {
                    _showToast('Please select both households', 'error');
                    return;
                }
                if (householdAId === householdBId) {
                    _showToast('Households cannot be the same', 'error');
                    return;
                }
                if (isNaN(yearVal)) { _showToast('Year must be a number', 'error'); return; }

                var result = _getCommands().createVendetta({
                    householdAId: householdAId,
                    householdBId: householdBId,
                    year: yearVal,
                    cause: cause,
                    notes: notes
                });

                if (result.success) {
                    _showToast('Vendetta created', 'success');
                    if (typeof options.onComplete === 'function') options.onComplete(result.data);
                } else {
                    _showToast('Failed to create vendetta: ' + result.error, 'error');
                }
            },
            onOpen: function() {
                _attachVendettaEvents(options);
            }
        });
    }

    function _attachVendettaEvents(options) {
        var btnA = document.getElementById('crimeSelectHouseholdA');
        var displayA = document.getElementById('crimeHouseholdADisplay');
        var hiddenA = document.getElementById('crimeHouseholdAId');

        var btnB = document.getElementById('crimeSelectHouseholdB');
        var displayB = document.getElementById('crimeHouseholdBDisplay');
        var hiddenB = document.getElementById('crimeHouseholdBId');

        if (btnA) {
            btnA.addEventListener('click', function() {
                _openHouseholdSelector({
                    title: 'Select Household A',
                    onSelect: function(household) {
                        displayA.textContent = household.name || 'Unknown';
                        hiddenA.value = household.id;
                    }
                });
            });
        }
        if (btnB) {
            btnB.addEventListener('click', function() {
                _openHouseholdSelector({
                    title: 'Select Household B',
                    onSelect: function(household) {
                        displayB.textContent = household.name || 'Unknown';
                        hiddenB.value = household.id;
                    }
                });
            });
        }

        if (options.householdAId) {
            var hA = _getHouseholdById(options.householdAId);
            if (hA) {
                displayA.textContent = hA.name || 'Unknown';
                hiddenA.value = hA.id;
            }
        }
        if (options.householdBId) {
            var hB = _getHouseholdById(options.householdBId);
            if (hB) {
                displayB.textContent = hB.name || 'Unknown';
                hiddenB.value = hB.id;
            }
        }
    }

    // =========================================================================
    // 6. CRIME DETAILS MODAL
    // =========================================================================

    function openCrimeDetailsModal(crimeId) {
        var crime = _getQueries().getCrime(crimeId);
        if (!crime) {
            _showToast('Crime not found', 'error');
            return null;
        }

        var perpetrator = crime.perpetratorId ? _getCharacterById(crime.perpetratorId) : null;
        var victim = crime.victimId ? _getCharacterById(crime.victimId) : null;
        var locationName = crime.locationId ? _getPlaceName(crime.locationId) : null;

        var cells = [
            _detail('Type', _escapeHtml(formatCrimeType(crime.type))),
            _detail('Year', _escapeHtml(String(crime.year != null ? crime.year : '?'))),
            _detail('Perpetrator',
                _escapeHtml(crime.perpetratorName ||
                    (perpetrator ? formatPersonName(perpetrator) : 'Unknown'))),
            _detail('Victim',
                _escapeHtml(crime.victimName ||
                    (victim ? formatPersonName(victim) : 'None'))),
            _detail('Location', _escapeHtml(locationName || 'Unknown')),
            _detail('Reason', _escapeHtml(crime.reason || 'Unknown')),
            _detail('Status', crime.solved ? 'Solved' : 'Unsolved'),
            _detail('Severity', _escapeHtml(formatSeverity(crime.severity)))
        ];

        var content = '<div style="padding: 4px 0;">' +
            _detailGrid(cells);

        if (crime.solved && crime.solution) {
            content += _detail('Solution', _escapeHtml(crime.solution));
        }

        // Law-derived fields
        if (crime.civilViolation) {
            content += _detail(
                'Civil Violation',
                _escapeHtml(crime.civilViolation.lawName || 'Law unspecified') +
                (crime.civilViolation.punishment
                    ? ' — ' + _escapeHtml(crime.civilViolation.punishment)
                    : '')
            );
        }
        if (crime.religiousViolation) {
            content += _detail(
                'Religious Violation',
                _escapeHtml(crime.religiousViolation.lawName || 'Law unspecified') +
                (crime.religiousViolation.punishment
                    ? ' — ' + _escapeHtml(crime.religiousViolation.punishment)
                    : '')
            );
        }

        if (crime.notes) {
            content += _detail('Notes', _escapeHtml(crime.notes));
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

    function openVendettaDetailsModal(vendettaId) {
        var vendetta = _getQueries().getVendetta(vendettaId);
        if (!vendetta) {
            _showToast('Vendetta not found', 'error');
            return null;
        }

        var constants = _getConstants();
        var deaths = Array.isArray(vendetta.deaths) ? vendetta.deaths : [];

        var cells = [
            _detail('Household A', _escapeHtml(vendetta.householdAName || 'Unknown')),
            _detail('Household B', _escapeHtml(vendetta.householdBName || 'Unknown')),
            _detail('Started', _escapeHtml(String(vendetta.startedYear != null ? vendetta.startedYear : '?'))),
            _detail('Status', _escapeHtml(formatVendettaStatus(vendetta.status))),
            _detail('Body Count', _escapeHtml(String(deaths.length)))
        ];

        var content = '<div style="padding: 4px 0;">' +
            _detailGrid(cells);

        if (vendetta.cause) {
            content += _detail('Cause', _escapeHtml(vendetta.cause));
        }

        if (deaths.length > 0) {
            content += '<div style="margin-top: 8px;">' +
                '<div style="font-size: 0.55rem; color: var(--dim); margin-bottom: 4px;">' +
                'Deaths (' + deaths.length + ')' +
                '</div>';
            for (var i = 0; i < deaths.length; i++) {
                var d = deaths[i];
                content += '<div style="padding: 4px 8px; background: var(--bg3); ' +
                    'border-radius: 4px; margin-bottom: 4px; font-size: 0.65rem;">' +
                    _escapeHtml(d.victimName || 'Unknown') +
                    ' killed by ' +
                    _escapeHtml(d.killerName || 'Unknown') +
                    ' (' + _escapeHtml(String(d.year != null ? d.year : '?')) + ')' +
                    (d.reason ? ' — ' + _escapeHtml(d.reason) : '') +
                    '</div>';
            }
            content += '</div>';
        }

        if (vendetta.status === constants.VENDETTA_STATUS.RESOLVED && vendetta.resolution) {
            content += _detail('Resolution', _escapeHtml(vendetta.resolution));
        }

        if (vendetta.notes) {
            content += _detail('Notes', _escapeHtml(vendetta.notes));
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

    function openCrimeStatsModal(locationId, year) {
        var stats = locationId
            ? _getQueries().getLocationCrimeStats(locationId, year)
            : _getQueries().getOverallCrimeStats(year);

        var locationName = locationId ? _getPlaceName(locationId) : 'Global';
        var period = stats.period || null;

        var content = '<div style="padding: 4px 0;">';

        if (period) {
            content += '<div style="font-size: 0.55rem; color: var(--dim); margin-bottom: 8px;">' +
                'Recent window: ' + period.startYear + '–' + period.endYear +
                ' (' + period.windowYears + ' years)' +
                '</div>';
        }

        content += _detailGrid([
            _detail('Total Crimes', String(stats.totalCrimes || 0)),
            _detail('Solve Rate', Math.round(stats.solvedRate || 0) + '%'),
            _detail('Unsolved', String(stats.unsolvedCrimes || 0)),
            _detail('Recent', String(stats.recentCrimes || 0))
        ]);

        if (stats.typeDistribution) {
            content += '<div style="padding: 8px; background: var(--bg3); ' +
                'border-radius: 6px; margin-bottom: 12px;">' +
                '<div style="font-size: 0.55rem; color: var(--dim); margin-bottom: 4px;">Crime Types</div>';
            var entries = Object.keys(stats.typeDistribution)
                .map(function(k) { return [k, stats.typeDistribution[k]]; })
                .sort(function(a, b) { return b[1] - a[1]; });
            for (var i = 0; i < Math.min(entries.length, 5); i++) {
                content += '<div style="display: flex; justify-content: space-between; ' +
                    'font-size: 0.7rem; padding: 2px 0;">' +
                    '<span>' + _escapeHtml(formatCrimeType(entries[i][0])) + '</span>' +
                    '<span>' + entries[i][1] + '</span>' +
                    '</div>';
            }
            content += '</div>';
        }

        if (stats.severityBreakdown) {
            content += _detailGrid([
                _detail('Low', String(stats.severityBreakdown.low || 0)),
                _detail('Medium', String(stats.severityBreakdown.medium || 0)),
                _detail('High', String(stats.severityBreakdown.high || 0)),
                _detail('Critical', String(stats.severityBreakdown.critical || 0))
            ]);
        }

        if (typeof stats.averageCrimeSeverity === 'number') {
            content += _detail('Average Severity',
                stats.averageCrimeSeverity.toFixed(1) + '/10');
        }

        if (stats.mostCommonCrime) {
            content += _detail('Most Common Crime',
                _escapeHtml(formatCrimeType(stats.mostCommonCrime)));
        }

        content += '</div>';

        return _openModal({
            title: 'Crime Statistics — ' + _escapeHtml(locationName || 'Global'),
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
        openCrimeStatsModal: openCrimeStatsModal,

        // Presentation helpers exposed for reuse by crime-ui-stats.js and
        // any other crime UI that needs the same labels.
        formatCrimeType: formatCrimeType,
        formatVendettaStatus: formatVendettaStatus,
        formatSeverity: formatSeverity,
        formatPersonName: formatPersonName,
        iconForCrimeType: iconForCrimeType
    };

    window._crimeModals = window.CrimeModals;

})();
