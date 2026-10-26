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
 *   CrimeQueries + CrimeViewModels. It does not decide domain rules, does
 *   not mutate records directly, and does not carry its own vocabulary of
 *   crime types, vendetta statuses, or punishments.
 *
 * OWNERSHIP:
 *   - modal construction and lifecycle
 *   - input collection and obvious UI-level validation
 *   - delegating actions to CrimeCommands
 *   - delegating reads to CrimeQueries
 *   - delegating presentation to CrimeViewModels
 *   - calling CrimeCommands.persist() once per successful modal action
 *
 * WHAT THIS MODULE DOES NOT DO:
 *   - It does not mutate crime records, characters, households, or
 *     vendettas directly.
 *   - It does not carry a fallback crime taxonomy.
 *   - It does not hardcode vendetta status identifiers.
 *   - It does not fabricate years, causes, or punishment text.
 *   - It does not read canonical state directly.
 *   - It does not call saveMasterData directly; persist() is the one
 *     save boundary and this modal calls it exactly once per batch.
 *   - It does not use a module-wide "processing" guard.
 *
 * DEPENDENCIES (required, verified at load):
 *   - CrimeConstants, CrimeCommands, CrimeQueries, CrimeViewModels
 *   - openModal / closeTopModal / _escapeHtml / _getIcon / _showToast
 *   - openCharacterSelector
 *   - openHouseholdSelector
 *   - getFilteredLocationOptions
 *   - getCharacterById, getHouseholdById, getPlaceById
 *   - getCurrentYearSafe
 *
 * Missing required dependencies fail loudly at load.
 *
 * ICON POLICY: No emojis. Icons come from icons.js via _getIcon, and the
 * icon NAME for a crime type comes from CrimeViewModels.crimeIconName.
 *
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. LOAD-TIME DEPENDENCY RESOLUTION
    // =========================================================================

    var C = window.CrimeConstants;
    var Commands = window.CrimeCommands;
    var Queries = window.CrimeQueries;
    var VM = window.CrimeViewModels;

    if (!C)         throw new Error('modals-crime.js requires CrimeConstants');
    if (!Commands)  throw new Error('modals-crime.js requires CrimeCommands');
    if (!Queries)   throw new Error('modals-crime.js requires CrimeQueries');
    if (!VM)        throw new Error('modals-crime.js requires CrimeViewModels');

    if (typeof window.openModal !== 'function') {
        throw new Error('modals-crime.js requires openModal');
    }
    if (typeof window.closeTopModal !== 'function') {
        throw new Error('modals-crime.js requires closeTopModal');
    }
    if (typeof window._escapeHtml !== 'function') {
        throw new Error('modals-crime.js requires _escapeHtml');
    }
    if (typeof window._getIcon !== 'function') {
        throw new Error('modals-crime.js requires _getIcon');
    }
    if (typeof window._showToast !== 'function') {
        throw new Error('modals-crime.js requires _showToast');
    }
    if (typeof window.openCharacterSelector !== 'function') {
        throw new Error('modals-crime.js requires openCharacterSelector');
    }
    if (typeof window.openHouseholdSelector !== 'function') {
        throw new Error('modals-crime.js requires openHouseholdSelector');
    }
    if (typeof window.getFilteredLocationOptions !== 'function') {
        throw new Error('modals-crime.js requires getFilteredLocationOptions');
    }
    if (typeof window.getCurrentYearSafe !== 'function') {
        throw new Error('modals-crime.js requires getCurrentYearSafe');
    }
    if (typeof window.getCharacterById !== 'function') {
        throw new Error('modals-crime.js requires getCharacterById');
    }
    if (typeof window.getHouseholdById !== 'function') {
        throw new Error('modals-crime.js requires getHouseholdById');
    }
    if (typeof window.getPlaceById !== 'function') {
        throw new Error('modals-crime.js requires getPlaceById');
    }

    // =========================================================================
    // 1. HELPERS
    // =========================================================================

    function _icon(name) { return window._getIcon(name); }

    function _commitAndPersist() {
        var p = Commands.persist();
        if (!p.success) {
            window._showToast(
                'Saved in memory, but persisting failed: ' + (p.reason || 'unknown'),
                'warning'
            );
        }
    }

    function _detail(label, valueHtml) {
        return '' +
            '<div style="padding: 8px; background: var(--bg3); border-radius: 6px;">' +
            '<div style="font-size: 0.5rem; color: var(--dim);">' +
            window._escapeHtml(label) +
            '</div>' +
            '<div style="font-size: 0.75rem;">' + valueHtml + '</div>' +
            '</div>';
    }

    function _detailGrid(cells) {
        return '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); ' +
            'gap: 8px; margin-bottom: 12px;">' + cells.join('') + '</div>';
    }

    function _fieldLabel(label, innerHtml) {
        return '' +
            '<div>' +
            '<label style="display:block;font-size:0.65rem;color:var(--accent);margin-bottom:4px;">' +
            window._escapeHtml(label) +
            '</label>' +
            innerHtml +
            '</div>';
    }

    function _textInput(id, value, placeholder) {
        return '<input type="text" id="' + id + '" value="' +
            window._escapeHtml(value == null ? '' : value) +
            '" placeholder="' + window._escapeHtml(placeholder || '') +
            '" style="width:100%;padding:6px 8px;background:var(--bg);' +
            'border:1px solid var(--border);border-radius:6px;font-size:0.7rem;">';
    }

    function _numberInput(id, value) {
        return '<input type="number" id="' + id + '" value="' +
            window._escapeHtml(value == null ? '' : String(value)) +
            '" style="width:100%;padding:6px 8px;background:var(--bg);' +
            'border:1px solid var(--border);border-radius:6px;font-size:0.7rem;">';
    }

    function _textarea(id, value, rows) {
        return '<textarea id="' + id + '" rows="' + (rows || 2) + '" ' +
            'style="width:100%;padding:6px 8px;background:var(--bg);' +
            'border:1px solid var(--border);border-radius:6px;font-size:0.65rem;resize:vertical;">' +
            window._escapeHtml(value == null ? '' : value) + '</textarea>';
    }

    function _selectButton(id, displayId, placeholder, iconName) {
        return '<button id="' + id + '" class="btn" style="width:100%;' +
            'padding:8px;background:var(--bg3);border:1px solid var(--border);' +
            'border-radius:6px;cursor:pointer;font-size:0.7rem;text-align:left;">' +
            _icon(iconName) + ' <span id="' + displayId + '">' +
            window._escapeHtml(placeholder) + '</span></button>';
    }

    function _buildLocationOptions(selectedId) {
        return window.getFilteredLocationOptions(selectedId || null);
    }

    function _buildExecutionMethodOptions(selectedName) {
        var opts = '<option value="">Default (state selection)</option>';
        var methods = C.EXECUTION_METHODS || {};
        for (var key in methods) {
            if (!Object.prototype.hasOwnProperty.call(methods, key)) continue;
            var m = methods[key];
            var sel = selectedName === m.name ? ' selected' : '';
            opts += '<option value="' + window._escapeHtml(m.name) + '"' + sel + '>' +
                window._escapeHtml(m.name) + '</option>';
        }
        return opts;
    }

    // =========================================================================
    // 2. MURDER MODAL
    // =========================================================================

    function openMurderModal(options) {
        var vm = VM.toMurderModalViewModel(options || {}, window.getCurrentYearSafe());

        var content =
            '<div style="margin-bottom:12px;">' +
            _detailGrid([
                _fieldLabel('Victim',
                    _selectButton('crimeSelectVictim', 'crimeVictimDisplay', 'Select victim...', 'PERSON') +
                    '<input type="hidden" id="crimeVictimId" value="">'
                ),
                _fieldLabel('Killer',
                    _selectButton('crimeSelectKiller', 'crimeKillerDisplay', 'Select killer...', 'PERSON') +
                    '<input type="hidden" id="crimeKillerId" value="">'
                )
            ]) +
            _detailGrid([
                _fieldLabel('Year', _numberInput('crimeYear', vm.defaultYear)),
                _fieldLabel('Location',
                    '<select id="crimeLocation" style="width:100%;padding:6px 8px;' +
                    'background:var(--bg);border:1px solid var(--border);' +
                    'border-radius:6px;font-size:0.65rem;">' +
                    _buildLocationOptions(vm.locationId) +
                    '</select>'
                )
            ]) +
            '<div style="margin-bottom:12px;">' +
            _fieldLabel('Reason',
                _textInput('crimeReason', vm.reason, 'e.g., Political rivalry, Jealousy...') +
                '<div style="margin-top:4px;font-size:0.5rem;color:var(--dim);">' +
                'Leave blank for a random reason from the vocabulary.' +
                '</div>'
            ) +
            '</div>' +
            '<div style="margin-bottom:12px;">' +
            '<label style="display:flex;align-items:center;gap:8px;' +
            'font-size:0.65rem;cursor:pointer;">' +
            '<input type="checkbox" id="crimeStartVendetta"' + (vm.startVendetta ? ' checked' : '') + '>' +
            'Start vendetta' +
            '</label>' +
            '</div>' +
            '<div style="margin-bottom:12px;">' +
            _fieldLabel('Notes', _textarea('crimeNotes', vm.notes, 2)) +
            '</div>';

        return window.openModal({
            title: vm.title,
            content: content,
            confirmText: 'Record Murder',
            cancelText: 'Cancel',
            onMount: function(root) {
                _wireMurderSelectors(root, options, vm);
            },
            onConfirm: function(root) {
                return _submitMurder(root, options, vm);
            }
        });
    }

    function _wireMurderSelectors(root, options, vm) {
        var victimBtn = root.querySelector('#crimeSelectVictim');
        var victimDisplay = root.querySelector('#crimeVictimDisplay');
        var victimHidden = root.querySelector('#crimeVictimId');

        var killerBtn = root.querySelector('#crimeSelectKiller');
        var killerDisplay = root.querySelector('#crimeKillerDisplay');
        var killerHidden = root.querySelector('#crimeKillerId');

        if (victimBtn) {
            victimBtn.addEventListener('click', function() {
                window.openCharacterSelector({
                    title: 'Select Victim',
                    filters: { showDeceased: false },
                    onSelect: function(c) {
                        victimDisplay.textContent = VM.formatPersonName(c);
                        victimHidden.value = c.id;
                    }
                });
            });
        }
        if (killerBtn) {
            killerBtn.addEventListener('click', function() {
                window.openCharacterSelector({
                    title: 'Select Killer',
                    filters: { showDeceased: false },
                    onSelect: function(c) {
                        killerDisplay.textContent = VM.formatPersonName(c);
                        killerHidden.value = c.id;
                    }
                });
            });
        }

        if (vm.victimId) {
            var v = window.getCharacterById(vm.victimId);
            if (v) {
                victimDisplay.textContent = VM.formatPersonName(v);
                victimHidden.value = v.id;
            }
        }
        if (vm.killerId) {
            var k = window.getCharacterById(vm.killerId);
            if (k) {
                killerDisplay.textContent = VM.formatPersonName(k);
                killerHidden.value = k.id;
            }
        }
    }

    function _submitMurder(root, options, vm) {
        var victimId = root.querySelector('#crimeVictimId').value;
        var killerId = root.querySelector('#crimeKillerId').value;
        var yearRaw = root.querySelector('#crimeYear').value;
        var year = yearRaw === '' ? window.getCurrentYearSafe() : parseInt(yearRaw, 10);
        var locationId = root.querySelector('#crimeLocation').value || null;
        var reasonRaw = root.querySelector('#crimeReason').value;
        var reason = reasonRaw === '' ? null : reasonRaw;
        var startVendetta = root.querySelector('#crimeStartVendetta').checked;
        var notesRaw = root.querySelector('#crimeNotes').value;
        var notes = notesRaw === '' ? null : notesRaw;

        if (!victimId) { window._showToast('Please select a victim', 'error'); return false; }
        if (!killerId) { window._showToast('Please select a killer', 'error'); return false; }
        if (victimId === killerId) {
            window._showToast('Victim and killer cannot be the same', 'error');
            return false;
        }
        if (isNaN(year)) { window._showToast('Year must be a number', 'error'); return false; }

        var result = Commands.triggerMurder(victimId, killerId, {
            year: year,
            locationId: locationId,
            reason: reason,
            startVendetta: startVendetta,
            notes: notes
        });

        if (!result.success) {
            window._showToast('Failed to record murder: ' + result.reason, 'error');
            return false;
        }

        _commitAndPersist();
        window._showToast('Murder recorded', 'success');
        window.closeTopModal();
        if (typeof options.onComplete === 'function') options.onComplete(result.data);
        return true;
    }

    // =========================================================================
    // 3. EXECUTION MODAL
    // =========================================================================

    function openExecutionModal(options) {
        var vm = VM.toExecutionModalViewModel(options || {}, window.getCurrentYearSafe());

        var content =
            '<div style="margin-bottom:12px;">' +
            _fieldLabel('Condemned',
                _selectButton('crimeSelectCondemned', 'crimeCondemnedDisplay', 'Select condemned...', 'PERSON') +
                '<input type="hidden" id="crimeCondemnedId" value="">'
            ) +
            '</div>' +
            _detailGrid([
                _fieldLabel('Year', _numberInput('crimeExecYear', vm.defaultYear)),
                _fieldLabel('Location',
                    '<select id="crimeExecLocation" style="width:100%;padding:6px 8px;' +
                    'background:var(--bg);border:1px solid var(--border);' +
                    'border-radius:6px;font-size:0.65rem;">' +
                    _buildLocationOptions(vm.locationId) +
                    '</select>'
                )
            ]) +
            '<div style="margin-bottom:12px;">' +
            _fieldLabel('Reason',
                _textInput('crimeExecReason', vm.reason, 'e.g., Treason, Murder, Adultery...')
            ) +
            '</div>' +
            '<div style="margin-bottom:12px;">' +
            _fieldLabel('Method',
                '<select id="crimeExecMethod" style="width:100%;padding:6px 8px;' +
                'background:var(--bg);border:1px solid var(--border);' +
                'border-radius:6px;font-size:0.7rem;">' +
                _buildExecutionMethodOptions(vm.method) +
                '</select>'
            ) +
            '</div>' +
            '<div style="margin-bottom:12px;">' +
            _fieldLabel('Notes', _textarea('crimeExecNotes', vm.notes, 2)) +
            '</div>';

        return window.openModal({
            title: vm.title,
            content: content,
            confirmText: 'Record Execution',
            cancelText: 'Cancel',
            onMount: function(root) {
                _wireExecutionSelectors(root, options, vm);
            },
            onConfirm: function(root) {
                return _submitExecution(root, options, vm);
            }
        });
    }

    function _wireExecutionSelectors(root, options, vm) {
        var btn = root.querySelector('#crimeSelectCondemned');
        var display = root.querySelector('#crimeCondemnedDisplay');
        var hidden = root.querySelector('#crimeCondemnedId');

        if (btn) {
            btn.addEventListener('click', function() {
                window.openCharacterSelector({
                    title: 'Select Condemned',
                    filters: { showDeceased: false },
                    onSelect: function(c) {
                        display.textContent = VM.formatPersonName(c);
                        hidden.value = c.id;
                    }
                });
            });
        }

        if (vm.condemnedId) {
            var condemned = window.getCharacterById(vm.condemnedId);
            if (condemned) {
                display.textContent = VM.formatPersonName(condemned);
                hidden.value = condemned.id;
            }
        }
    }

    function _submitExecution(root, options, vm) {
        var condemnedId = root.querySelector('#crimeCondemnedId').value;
        var yearRaw = root.querySelector('#crimeExecYear').value;
        var year = yearRaw === '' ? window.getCurrentYearSafe() : parseInt(yearRaw, 10);
        var locationId = root.querySelector('#crimeExecLocation').value || null;
        var reasonRaw = root.querySelector('#crimeExecReason').value;
        var reason = reasonRaw === '' ? null : reasonRaw;
        var methodRaw = root.querySelector('#crimeExecMethod').value;
        var method = methodRaw === '' ? null : methodRaw;
        var notesRaw = root.querySelector('#crimeExecNotes').value;
        var notes = notesRaw === '' ? null : notesRaw;

        if (!condemnedId) {
            window._showToast('Please select a condemned character', 'error');
            return false;
        }
        if (isNaN(year)) { window._showToast('Year must be a number', 'error'); return false; }

        var result = Commands.triggerExecution(condemnedId, {
            year: year,
            locationId: locationId,
            reason: reason,
            method: method,
            notes: notes
        });

        if (!result.success) {
            window._showToast('Failed to record execution: ' + result.reason, 'error');
            return false;
        }

        _commitAndPersist();
        window._showToast('Execution recorded', 'success');
        window.closeTopModal();
        if (typeof options.onComplete === 'function') options.onComplete(result.data);
        return true;
    }

    // =========================================================================
    // 4. VENDETTA MODAL
    // =========================================================================

    function openVendettaModal(options) {
        var vm = VM.toVendettaModalViewModel(options || {}, window.getCurrentYearSafe());

        var content =
            _detailGrid([
                _fieldLabel('Household A',
                    _selectButton('crimeSelectHouseholdA', 'crimeHouseholdADisplay', 'Select household...', 'HOUSEHOLD') +
                    '<input type="hidden" id="crimeHouseholdAId" value="">'
                ),
                _fieldLabel('Household B',
                    _selectButton('crimeSelectHouseholdB', 'crimeHouseholdBDisplay', 'Select household...', 'HOUSEHOLD') +
                    '<input type="hidden" id="crimeHouseholdBId" value="">'
                )
            ]) +
            '<div style="margin-bottom:12px;">' +
            _fieldLabel('Year', _numberInput('crimeVendettaYear', vm.defaultYear)) +
            '</div>' +
            '<div style="margin-bottom:12px;">' +
            _fieldLabel('Cause',
                _textInput('crimeVendettaCause', vm.cause, 'e.g., Blood feud, Land dispute, Honor...') +
                '<div style="margin-top:4px;font-size:0.5rem;color:var(--dim);">' +
                'Leave blank to record the cause as unspecified.' +
                '</div>'
            ) +
            '</div>' +
            '<div style="margin-bottom:12px;">' +
            _fieldLabel('Notes', _textarea('crimeVendettaNotes', vm.notes, 2)) +
            '</div>';

        return window.openModal({
            title: vm.title,
            content: content,
            confirmText: 'Create Vendetta',
            cancelText: 'Cancel',
            onMount: function(root) {
                _wireVendettaSelectors(root, options, vm);
            },
            onConfirm: function(root) {
                return _submitVendetta(root, options, vm);
            }
        });
    }

    function _wireVendettaSelectors(root, options, vm) {
        var btnA = root.querySelector('#crimeSelectHouseholdA');
        var displayA = root.querySelector('#crimeHouseholdADisplay');
        var hiddenA = root.querySelector('#crimeHouseholdAId');

        var btnB = root.querySelector('#crimeSelectHouseholdB');
        var displayB = root.querySelector('#crimeHouseholdBDisplay');
        var hiddenB = root.querySelector('#crimeHouseholdBId');

        if (btnA) {
            btnA.addEventListener('click', function() {
                window.openHouseholdSelector({
                    title: 'Select Household A',
                    onSelect: function(h) {
                        displayA.textContent = h.name || 'Unknown';
                        hiddenA.value = h.id;
                    }
                });
            });
        }
        if (btnB) {
            btnB.addEventListener('click', function() {
                window.openHouseholdSelector({
                    title: 'Select Household B',
                    onSelect: function(h) {
                        displayB.textContent = h.name || 'Unknown';
                        hiddenB.value = h.id;
                    }
                });
            });
        }

        if (vm.householdAId) {
            var hA = window.getHouseholdById(vm.householdAId);
            if (hA) {
                displayA.textContent = hA.name || 'Unknown';
                hiddenA.value = hA.id;
            }
        }
        if (vm.householdBId) {
            var hB = window.getHouseholdById(vm.householdBId);
            if (hB) {
                displayB.textContent = hB.name || 'Unknown';
                hiddenB.value = hB.id;
            }
        }
    }

    function _submitVendetta(root, options, vm) {
        var householdAId = root.querySelector('#crimeHouseholdAId').value;
        var householdBId = root.querySelector('#crimeHouseholdBId').value;
        var yearRaw = root.querySelector('#crimeVendettaYear').value;
        var year = yearRaw === '' ? window.getCurrentYearSafe() : parseInt(yearRaw, 10);
        var causeRaw = root.querySelector('#crimeVendettaCause').value;
        var cause = causeRaw === '' ? null : causeRaw;
        var notesRaw = root.querySelector('#crimeVendettaNotes').value;
        var notes = notesRaw === '' ? null : notesRaw;

        if (!householdAId || !householdBId) {
            window._showToast('Please select both households', 'error');
            return false;
        }
        if (householdAId === householdBId) {
            window._showToast('Households cannot be the same', 'error');
            return false;
        }
        if (isNaN(year)) { window._showToast('Year must be a number', 'error'); return false; }

        // createBloodFeud takes character ids and derives households.
        // For a manual vendetta the modal calls the state-level command
        // via createBloodFeud only when characters are involved; here we
        // need household-level creation. Use CrimeState directly through
        // the canonical command.
        //
        // The command surface for household-level vendetta creation lives
        // on CrimeState.createVendetta. CrimeCommands.createBloodFeud is
        // the character-level entry point. The vendetta modal collects
        // households, so it uses CrimeState directly — but the command
        // and its commit are wired here so persistence still fires once.
        //
        // NOTE: This is the one place in the file where a modal calls
        // CrimeState directly. It is intentional: CrimeCommands has no
        // household-level vendetta creation command, and inventing one
        // here would be the wrong layer. If CrimeCommands later gains
        // createVendettaForHouseholds, this modal calls that instead.

        var result = window.CrimeState.createVendetta({
            householdAId: householdAId,
            householdBId: householdBId,
            year: year,
            cause: cause,
            notes: notes
        });

        if (!result.success) {
            window._showToast('Failed to create vendetta: ' + result.reason, 'error');
            return false;
        }

        _commitAndPersist();
        window._showToast('Vendetta created', 'success');
        window.closeTopModal();
        if (typeof options.onComplete === 'function') options.onComplete(result.data);
        return true;
    }

    // =========================================================================
    // 5. CRIME DETAILS MODAL
    // =========================================================================

    function openCrimeDetailsModal(crimeId) {
        var crime = Queries.getCrime(crimeId);
        if (!crime) {
            window._showToast('Crime not found', 'error');
            return null;
        }

        var perpetrator = crime.perpetratorId
            ? window.getCharacterById(crime.perpetratorId)
            : null;
        var victim = crime.victimId
            ? window.getCharacterById(crime.victimId)
            : null;
        var locationName = crime.locationId
            ? (window.getPlaceById(crime.locationId) || {}).displayName || null
            : null;

        var vm = VM.toCrimeDetailsViewModel(crime, {
            perpetrator: perpetrator,
            victim: victim,
            locationName: locationName
        });
        if (!vm) {
            window._showToast('Crime details unavailable', 'error');
            return null;
        }

        var cells = [
            _detail('Type', window._escapeHtml(vm.typeLabel)),
            _detail('Year', window._escapeHtml(vm.yearLabel)),
            _detail('Perpetrator', window._escapeHtml(vm.perpetratorName)),
            _detail('Victim', window._escapeHtml(vm.victimName || 'None')),
            _detail('Location', window._escapeHtml(vm.locationName || 'Unknown')),
            _detail('Reason', window._escapeHtml(vm.reason || 'Unknown')),
            _detail('Status', window._escapeHtml(vm.statusLabel)),
            _detail('Severity', window._escapeHtml(vm.severityLabel))
        ];

        var content = '<div style="padding:4px 0;">' + _detailGrid(cells);

        if (vm.solved && vm.solution) {
            content += _detail('Solution', window._escapeHtml(vm.solution));
        }
        if (vm.method) {
            content += _detail('Method', window._escapeHtml(vm.method));
        }
        if (vm.civilViolation) {
            content += _detail(
                'Civil Violation',
                window._escapeHtml(vm.civilViolation.lawName || 'Law unspecified') +
                (vm.civilViolation.punishment
                    ? ' — ' + window._escapeHtml(vm.civilViolation.punishment)
                    : '')
            );
        }
        if (vm.religiousViolation) {
            content += _detail(
                'Religious Violation',
                window._escapeHtml(vm.religiousViolation.lawName || 'Law unspecified') +
                (vm.religiousViolation.punishment
                    ? ' — ' + window._escapeHtml(vm.religiousViolation.punishment)
                    : '')
            );
        }
        if (vm.notes) {
            content += _detail('Notes', window._escapeHtml(vm.notes));
        }

        content += '</div>';

        return window.openModal({
            title: 'Crime Details',
            content: content,
            confirmText: 'Close',
            cancelText: ''
        });
    }

    // =========================================================================
    // 6. VENDETTA DETAILS MODAL
    // =========================================================================

    function openVendettaDetailsModal(vendettaId) {
        var vendetta = Queries.getVendetta(vendettaId);
        if (!vendetta) {
            window._showToast('Vendetta not found', 'error');
            return null;
        }

        var vm = VM.toVendettaDetailsViewModel(vendetta);
        if (!vm) {
            window._showToast('Vendetta details unavailable', 'error');
            return null;
        }

        var cells = [
            _detail('Household A', window._escapeHtml(vm.householdAName)),
            _detail('Household B', window._escapeHtml(vm.householdBName)),
            _detail('Started', window._escapeHtml(vm.startedYearLabel)),
            _detail('Status', window._escapeHtml(vm.statusLabel)),
            _detail('Body Count', window._escapeHtml(String(vm.deathCount)))
        ];

        var content = '<div style="padding:4px 0;">' + _detailGrid(cells);

        if (vm.cause) {
            content += _detail('Cause', window._escapeHtml(vm.cause));
        }

        if (vm.deaths.length > 0) {
            content += '<div style="margin-top:8px;">' +
                '<div style="font-size:0.55rem;color:var(--dim);margin-bottom:4px;">' +
                'Deaths (' + vm.deaths.length + ')' +
                '</div>';
            for (var i = 0; i < vm.deaths.length; i++) {
                var d = vm.deaths[i];
                content += '<div style="padding:4px 8px;background:var(--bg3);' +
                    'border-radius:4px;margin-bottom:4px;font-size:0.65rem;">' +
                    window._escapeHtml(d.victimName) + ' killed by ' +
                    window._escapeHtml(d.killerName) +
                    ' (' + window._escapeHtml(d.yearLabel) + ')' +
                    (d.reason ? ' — ' + window._escapeHtml(d.reason) : '') +
                    '</div>';
            }
            content += '</div>';
        }

        if (vm.isResolved && vm.resolution) {
            content += _detail('Resolution', window._escapeHtml(vm.resolution));
        }
        if (vm.notes) {
            content += _detail('Notes', window._escapeHtml(vm.notes));
        }

        content += '</div>';

        return window.openModal({
            title: 'Vendetta Details',
            content: content,
            confirmText: 'Close',
            cancelText: ''
        });
    }

    // =========================================================================
    // 7. CRIME STATS MODAL
    // =========================================================================

    function openCrimeStatsModal(locationId, year) {
        var stats = locationId
            ? Queries.getLocationCrimeStats(locationId, year)
            : Queries.getOverallCrimeStats(year);

        var locationName = locationId
            ? ((window.getPlaceById(locationId) || {}).displayName || null)
            : 'Global';

        var vm = VM.toCrimeStatsViewModel(stats, locationName);
        if (!vm) {
            window._showToast('Crime statistics unavailable', 'error');
            return null;
        }

        var content = '<div style="padding:4px 0;">';

        if (vm.periodLabel) {
            content += '<div style="font-size:0.55rem;color:var(--dim);margin-bottom:8px;">' +
                window._escapeHtml(vm.periodLabel) +
                '</div>';
        }

        content += _detailGrid([
            _detail('Total Crimes', String(vm.totalCrimes)),
            _detail('Solve Rate', window._escapeHtml(vm.solvedRateLabel)),
            _detail('Unsolved', String(vm.unsolvedCrimes)),
            _detail('Recent', String(vm.recentCrimes))
        ]);

        if (vm.typeDistributionRows.length > 0) {
            content += '<div style="padding:8px;background:var(--bg3);' +
                'border-radius:6px;margin-bottom:12px;">' +
                '<div style="font-size:0.55rem;color:var(--dim);margin-bottom:4px;">Crime Types</div>';
            var shown = Math.min(vm.typeDistributionRows.length, 5);
            for (var i = 0; i < shown; i++) {
                var row = vm.typeDistributionRows[i];
                content += '<div style="display:flex;justify-content:space-between;' +
                    'font-size:0.7rem;padding:2px 0;">' +
                    '<span>' + window._escapeHtml(row.typeLabel) + '</span>' +
                    '<span>' + row.count + '</span>' +
                    '</div>';
            }
            content += '</div>';
        }

        if (vm.severityBreakdownRows) {
            var cells = [];
            for (var s = 0; s < vm.severityBreakdownRows.length; s++) {
                var b = vm.severityBreakdownRows[s];
                cells.push(_detail(b.label, String(b.count)));
            }
            content += _detailGrid(cells);
        }

        if (vm.avgSeverityLabel) {
            content += _detail('Average Severity', window._escapeHtml(vm.avgSeverityLabel));
        }
        if (vm.mostCommonCrimeLabel) {
            content += _detail('Most Common Crime', window._escapeHtml(vm.mostCommonCrimeLabel));
        }

        content += '</div>';

        return window.openModal({
            title: 'Crime Statistics — ' + window._escapeHtml(locationName || 'Global'),
            content: content,
            confirmText: 'Close',
            cancelText: ''
        });
    }

    // =========================================================================
    // 8. EXPORTS
    // =========================================================================

    window.CrimeModals = {
        openMurderModal: openMurderModal,
        openExecutionModal: openExecutionModal,
        openVendettaModal: openVendettaModal,
        openCrimeDetailsModal: openCrimeDetailsModal,
        openVendettaDetailsModal: openVendettaDetailsModal,
        openCrimeStatsModal: openCrimeStatsModal,

        // Presentation helpers re-exported from CrimeViewModels. These
        // remain here for backward compatibility with any caller that
        // was using CrimeModals.formatCrimeType etc. New code should use
        // CrimeViewModels directly.
        formatCrimeType: VM.formatCrimeType,
        formatVendettaStatus: VM.formatVendettaStatus,
        formatSeverity: VM.formatSeverity,
        formatPersonName: VM.formatPersonName,
        iconForCrimeType: function(type) { return _icon(VM.crimeIconName(type)); }
    };

    window._crimeModals = window.CrimeModals;

})();
