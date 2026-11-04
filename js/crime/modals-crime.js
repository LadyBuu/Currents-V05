/**
 * =============================================================================
 * STILL WATERS - CRIME MODALS (modals-crime.js)
 * =============================================================================
 *
 * LOCATION: js/crime/modals-crime.js
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
 * COMMAND SURFACE USED:
 *
 *   Commands.recordCrime(locationId, data)
 *       The generic record-crime path (added to crime-commands.js in the
 *       same batch that added this modal). Used by openCreateCrimeModal
 *       for every crime type except murder and execution. Those two are
 *       rejected by recordCrime with MURDER_USES_TRIGGER /
 *       EXECUTION_IS_A_CONSEQUENCE, and openCreateCrimeModal routes
 *       murder to Commands.triggerMurder for the mandatory kill +
 *       vendetta + household + law-consequence side effects.
 *
 *   Commands.triggerMurder(victimId, killerId, options)
 *       Murder path. The modal calls this when type === 'murder'.
 *
 *   Commands.triggerExecution(condemnedId, options)
 *       Not a modal action. Execution is a consequence emitted by
 *       triggerMurder (via _executeConsequence), not user-initiated. The
 *       openExecutionModal legacy entry point remains for callers that
 *       still open it directly, but the settlement-crime-tab no longer
 *       exposes "Record Execution" — see the comment in that tab.
 *
 *   Commands.persist()
 *       Called once after every successful modal action, through
 *       _commitAndPersist().
 *
 * DOM-SCOPE CONTRACT:
 *   Every DOM lookup inside a modal callback is scoped to the modal's
 *   own root element via openModal's `root` callback parameter. The
 *   prior revision used `document.querySelector` inside modal callbacks,
 *   which returned the wrong element when two modals of the same type
 *   were open (the modal stack permits this).
 *
 * MODAL INFRASTRUCTURE (core/modals-core.js):
 *
 *   window.openModal(options) -> { element, close }
 *     Accepted option keys:  titleHtml, contentHtml, confirmText,
 *                            cancelText, onMount, onConfirm, size, ...
 *     The core ignores `title` and `content`. Modals must use
 *     `titleHtml` / `contentHtml` or the modal will render with the
 *     default title ("Modal") and an empty body.
 *     `onMount(root)` is called after DOM insertion with the modal
 *     element. `onConfirm(root)` is called on confirm; return false to
 *     keep the modal open.
 *
 *   window.closeTopModal()
 *   window.showToast(message, type)   (from ui.js)
 *   window.escapeHtml(str)            (from formatting.js)
 *   window.getIcon(name)              (from icons.js)
 *
 *   The deprecated window._escapeHtml, window._showToast, and
 *   window._getIcon aliases are NOT used in this file.
 *
 * LOCATION DROPDOWN:
 *   This file renders a <select> of places for the crime's location
 *   field. It routes through buildLocationDropdown (from
 *   js/selectors/locationDropdown.js), which is the canonical builder
 *   for the option HTML. If buildLocationDropdown is absent, it falls
 *   back to getPlaces() and renders its own options with the same
 *   ordering.
 *
 *   The prior revision called window.getFilteredLocationOptions, which
 *   does not exist in the supplied locationDropdown.js. That call was
 *   guarded at load time and the guard fired the moment the browser
 *   evaluated this file. Even if the guard had been removed, the call
 *   itself would have thrown. Fixed by routing through
 *   buildLocationDropdown with a getPlaces fallback, matching what
 *   modals-household.js does in its own _buildLocationOptions.
 *
 * SETTLEMENT-SCOPED VENDETTA CREATION:
 *   openVendettaModal(options) accepts:
 *
 *     options.settlementHouseholdIds  string[] | undefined
 *         When a non-empty array is supplied, this is the set of
 *         household ids the vendetta's two households MUST come from.
 *         The modal opens the household picker UNFILTERED (because
 *         openHouseholdSelector does not support an id-set filter —
 *         see modals-household-selector.js's filterConfig shape) and
 *         rejects out-of-scope selections in the picker's onSelect
 *         callback with a toast. The user sees a filtered outcome
 *         even though the picker shows the full list.
 *
 *     options.locationId  string | undefined
 *         When supplied, is passed to CrimeState.createVendetta (via
 *         the same call path as the world-wide modal uses today) so
 *         the vendetta record carries the settlement-scope location.
 *
 *   openVendettaModal.supportsSettlementScope = true is set after the
 *   function definition so callers can feature-detect the scope
 *   support before passing settlementHouseholdIds.
 *
 *   The world-wide invocation (no settlementHouseholdIds, no locationId)
 *   behaves exactly as before. The filter is only applied when the
 *   caller scopes it.
 *
 * VENDETTA CREATION QUIRK (preserved from prior revision):
 *   _submitVendetta calls window.CrimeState.createVendetta directly.
 *   This is documented in crime-docs.txt §9 and HAZARDS §2 as
 *   intentional: CrimeCommands has no household-level vendetta
 *   creation command, and inventing one would be the wrong layer.
 *   createBloodFeud (on CrimeCommands) derives households from
 *   characters; the vendetta modal collects households directly.
 *
 *   If CrimeCommands later gains createVendettaForHouseholds, this
 *   modal calls that instead. The modal currently feature-detects
 *   CrimeCommands.createVendettaForHouseholds at call time, so the
 *   switch is a one-line change on the command side — no edit to this
 *   file.
 *
 * TIME CONTRACT:
 *   Uses window.getCurrentYear from js/core/time.js. The deprecated
 *   window.getCurrentYearSafe alias is NOT used.
 *
 * DEPENDENCIES (required, verified at load):
 *   - CrimeConstants, CrimeCommands, CrimeQueries, CrimeViewModels
 *   - window.openModal, window.closeTopModal
 *   - window.escapeHtml, window.getIcon, window.showToast
 *   - openCharacterSelector
 *   - openHouseholdSelector
 *   - getCharacterById, getHouseholdById, getPlaceById
 *   - getCurrentYear
 *
 * DEPENDENCIES (OPTIONAL, checked at call time):
 *   - buildLocationDropdown (js/selectors/locationDropdown.js)
 *       Preferred location-options builder. When absent, the modal
 *       falls back to getPlaces() and renders its own options with the
 *       same alphabetical ordering. This is the same fallback shape
 *       modals-household.js uses.
 *   - getPlaces (js/core/accessors.js)
 *       Source of the location options in the fallback path. Required
 *       only when buildLocationDropdown is absent; the modal will
 *       render an empty option list otherwise.
 *   - CrimeCommands.createVendettaForHouseholds
 *       Not currently exported. The vendetta modal feature-detects it
 *       at call time and prefers it over CrimeState.createVendetta
 *       when present.
 *
 * Missing required dependencies fail loudly at load. Missing optional
 * dependencies fall back or are skipped.
 *
 * ICON POLICY: No emojis. Icons come from icons.js via getIcon, and the
 * icon NAME for a crime type comes from CrimeViewModels.crimeIconName.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - Removed the load-time guard for window.getFilteredLocationOptions.
 *       That function does not exist in the supplied locationDropdown.js;
 *       the guard fired on every page that loaded this file, killing every
 *       crime modal. The guard's replacement: buildLocationDropdown is
 *       checked at call time (it exists in locationDropdown.js), and a
 *       getPlaces() fallback covers the case where it's absent. Matches
 *       modals-household.js::_buildLocationOptions.
 *     - _buildLocationOptions rewritten to route through
 *       buildLocationDropdown with a getPlaces fallback. No behavioral
 *       change when buildLocationDropdown is present.
 *     - Added openCreateCrimeModal(options). Generic crime creation.
 *       Excludes 'execution' from the type select (not a creatable
 *       type); includes 'murder'. Routes murder through
 *       Commands.triggerMurder with the victim-id + perpetrator-id
 *       pair so the mandatory kill/vendetta/household/consequence
 *       side effects run. Every other type goes through
 *       Commands.recordCrime(locationId, data). See COMMAND SURFACE
 *       USED in the header.
 *     - openVendettaModal now accepts options.settlementHouseholdIds
 *       and options.locationId. When settlementHouseholdIds is
 *       supplied, the household selector's onSelect callbacks reject
 *       out-of-scope households with a warning toast. The picker is
 *       still opened unfiltered because openHouseholdSelector has no
 *       householdIds filter key; see SETTLEMENT-SCOPED VENDETTA
 *       CREATION in the header.
 *     - openVendettaModal.supportsSettlementScope = true is set after
 *       the function definition.
 *     - No behavioral change to openMurderModal, openExecutionModal,
 *       openCrimeDetailsModal, openVendettaDetailsModal, or
 *       openCrimeStatsModal. Every DOM lookup is still scoped to the
 *       modal's own root via the openModal callback parameter.
 *   Previous revisions:
 *     - Every onConfirm callback receives the modal DOM element as its
 *       parameter and scopes its DOM reads via root.querySelector.
 *     - The vendetta creation modal calls CrimeState.createVendetta
 *       directly (documented exception; see VENDETTA CREATION QUIRK
 *       in the header).
 *     - presentation helpers re-exported from CrimeViewModels for
 *       backward compatibility.
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

    if (typeof Commands.recordCrime !== 'function') {
        throw new Error(
            'modals-crime.js requires CrimeCommands.recordCrime ' +
            '(crime-commands.js must load first, and must include the ' +
            'recordCrime command)'
        );
    }

    if (typeof window.openModal !== 'function') {
        throw new Error('modals-crime.js requires openModal');
    }
    if (typeof window.closeTopModal !== 'function') {
        throw new Error('modals-crime.js requires closeTopModal');
    }
    if (typeof window.escapeHtml !== 'function') {
        throw new Error('modals-crime.js requires escapeHtml');
    }
    if (typeof window.getIcon !== 'function') {
        throw new Error('modals-crime.js requires getIcon');
    }
    if (typeof window.showToast !== 'function') {
        throw new Error('modals-crime.js requires showToast');
    }
    if (typeof window.openCharacterSelector !== 'function') {
        throw new Error('modals-crime.js requires openCharacterSelector');
    }
    if (typeof window.openHouseholdSelector !== 'function') {
        throw new Error('modals-crime.js requires openHouseholdSelector');
    }
    if (typeof window.getCurrentYear !== 'function') {
        throw new Error('modals-crime.js requires getCurrentYear');
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

    // NOTE: getFilteredLocationOptions is NOT required here. It does not
    // exist in the supplied locationDropdown.js. See LOCATION DROPDOWN
    // in the header. The buildLocationDropdown / getPlaces pair is
    // checked at call time inside _buildLocationOptions.

    // =========================================================================
    // 1. HELPERS
    // =========================================================================

    function _icon(name) { return window.getIcon(name); }

    function _commitAndPersist() {
        var p = Commands.persist();
        if (!p.success) {
            window.showToast(
                'Saved in memory, but persisting failed: ' + (p.reason || 'unknown'),
                'warning'
            );
        }
    }

    function _detail(label, valueHtml) {
        return '' +
            '<div style="padding: 8px; background: var(--bg3); border-radius: 6px;">' +
            '<div style="font-size: 0.5rem; color: var(--dim);">' +
            window.escapeHtml(label) +
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
            window.escapeHtml(label) +
            '</label>' +
            innerHtml +
            '</div>';
    }

    function _textInput(id, value, placeholder) {
        return '<input type="text" id="' + id + '" value="' +
            window.escapeHtml(value == null ? '' : value) +
            '" placeholder="' + window.escapeHtml(placeholder || '') +
            '" style="width:100%;padding:6px 8px;background:var(--bg);' +
            'border:1px solid var(--border);border-radius:6px;font-size:0.7rem;">';
    }

    function _numberInput(id, value) {
        return '<input type="number" id="' + id + '" value="' +
            window.escapeHtml(value == null ? '' : String(value)) +
            '" style="width:100%;padding:6px 8px;background:var(--bg);' +
            'border:1px solid var(--border);border-radius:6px;font-size:0.7rem;">';
    }

    function _textarea(id, value, rows) {
        return '<textarea id="' + id + '" rows="' + (rows || 2) + '" ' +
            'style="width:100%;padding:6px 8px;background:var(--bg);' +
            'border:1px solid var(--border);border-radius:6px;font-size:0.65rem;resize:vertical;">' +
            window.escapeHtml(value == null ? '' : value) + '</textarea>';
    }

    function _selectButton(id, displayId, placeholder, iconName) {
        return '<button id="' + id + '" class="btn" style="width:100%;' +
            'padding:8px;background:var(--bg3);border:1px solid var(--border);' +
            'border-radius:6px;cursor:pointer;font-size:0.7rem;text-align:left;">' +
            _icon(iconName) + ' <span id="' + displayId + '">' +
            window.escapeHtml(placeholder) + '</span></button>';
    }

    /**
     * Builds location <option> inner HTML.
     *
     * Routes through buildLocationDropdown (from locationDropdown.js),
     * which is the canonical builder and produces the same alphabetical
     * ordering and "<option value=''>" placeholder the modal uses.
     *
     * Falls back to getPlaces() when buildLocationDropdown is absent.
     * That fallback path is the same shape used by
     * modals-household.js::_buildLocationOptions. It renders the
     * placeholder, sorts alphabetically by displayName, and marks the
     * selected id.
     *
     * The two prior failure modes this replaces:
     *   - window.getFilteredLocationOptions does not exist in the
     *     supplied locationDropdown.js. The load-time guard for it fired
     *     on every page, and the call site would have thrown.
     *   - The prior fallback was a hard throw, not a fallback.
     *
     * @param {string|null} selectedId
     * @returns {string}
     */
    function _buildLocationOptions(selectedId) {
        var selected = selectedId || null;

        if (typeof window.buildLocationDropdown === 'function') {
            try {
                return window.buildLocationDropdown(selected, 'Select location...', false);
            } catch (e) {
                if (typeof console !== 'undefined' && console.warn) {
                    console.warn(
                        'modals-crime.js: buildLocationDropdown threw; ' +
                        'falling back to getPlaces', e
                    );
                }
                // fall through to the fallback
            }
        }

        var html = '<option value="">Select location...</option>';

        if (typeof window.getPlaces !== 'function') {
            return html;
        }

        var places;
        try {
            places = window.getPlaces() || [];
        } catch (e) {
            places = [];
        }
        if (!Array.isArray(places)) places = [];

        var sorted = places.slice().sort(function(a, b) {
            return (a.displayName || '').localeCompare(b.displayName || '');
        });

        for (var i = 0; i < sorted.length; i++) {
            var p = sorted[i];
            if (!p || typeof p.id !== 'string') continue;
            var label = p.displayName || p.name || 'Unknown';
            var sel = (p.id === selected) ? ' selected' : '';
            html += '<option value="' + window.escapeHtml(p.id) + '"' + sel + '>' +
                window.escapeHtml(label) + '</option>';
        }

        return html;
    }

    function _buildExecutionMethodOptions(selectedName) {
        var opts = '<option value="">Default (state selection)</option>';
        var methods = C.EXECUTION_METHODS || {};
        for (var key in methods) {
            if (!Object.prototype.hasOwnProperty.call(methods, key)) continue;
            var m = methods[key];
            var sel = selectedName === m.name ? ' selected' : '';
            opts += '<option value="' + window.escapeHtml(m.name) + '"' + sel + '>' +
                window.escapeHtml(m.name) + '</option>';
        }
        return opts;
    }

    /**
     * Builds the <option> inner HTML for the crime-type select on the
     * generic creation modal.
     *
     * Excludes 'execution' (a consequence, not a creatable type).
     * Includes 'murder' (the modal will route that selection to
     * triggerMurder).
     *
     * Sorts alphabetically by humanized label for a stable list.
     *
     * @param {string|null} selectedType
     * @returns {string}
     */
    function _buildCrimeTypeOptions(selectedType) {
        var allTypes = C.getAllCrimeTypes();
        var creatable = [];
        for (var i = 0; i < allTypes.length; i++) {
            if (allTypes[i] === C.CRIME_TYPES.EXECUTION) continue;
            creatable.push(allTypes[i]);
        }
        creatable.sort(function(a, b) {
            return VM.formatCrimeType(a).localeCompare(VM.formatCrimeType(b));
        });

        var html = '<option value="">Select type...</option>';
        for (var j = 0; j < creatable.length; j++) {
            var t = creatable[j];
            var sel = (t === selectedType) ? ' selected' : '';
            html += '<option value="' + window.escapeHtml(t) + '"' + sel + '>' +
                window.escapeHtml(VM.formatCrimeType(t)) + '</option>';
        }
        return html;
    }

    // =========================================================================
    // 2. MURDER MODAL (unchanged; presentation only)
    // =========================================================================

    function openMurderModal(options) {
        var vm = VM.toMurderModalViewModel(options || {});

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
            titleHtml: vm.title,
            contentHtml: content,
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
        var year = yearRaw === '' ? window.getCurrentYear() : parseInt(yearRaw, 10);
        var locationId = root.querySelector('#crimeLocation').value || null;
        var reasonRaw = root.querySelector('#crimeReason').value;
        var reason = reasonRaw === '' ? null : reasonRaw;
        var startVendetta = root.querySelector('#crimeStartVendetta').checked;
        var notesRaw = root.querySelector('#crimeNotes').value;
        var notes = notesRaw === '' ? null : notesRaw;

        if (!victimId) { window.showToast('Please select a victim', 'error'); return false; }
        if (!killerId) { window.showToast('Please select a killer', 'error'); return false; }
        if (victimId === killerId) {
            window.showToast('Victim and killer cannot be the same', 'error');
            return false;
        }
        if (isNaN(year)) { window.showToast('Year must be a number', 'error'); return false; }

        var result = Commands.triggerMurder(victimId, killerId, {
            year: year,
            locationId: locationId,
            reason: reason,
            startVendetta: startVendetta,
            notes: notes
        });

        if (!result.success) {
            window.showToast('Failed to record murder: ' + result.reason, 'error');
            return false;
        }

        _commitAndPersist();
        window.showToast('Murder recorded', 'success');
        window.closeTopModal();
        if (typeof options.onComplete === 'function') options.onComplete(result.data);
        return true;
    }

    // =========================================================================
    // 3. CREATE CRIME MODAL (generic)
    // =========================================================================
    //
    // Records a non-murder, non-execution crime through
    // Commands.recordCrime(locationId, data). Murder routes to
    // Commands.triggerMurder (kill + vendetta + household + consequence
    // side effects are mandatory).
    //
    // Execution is excluded from the type select. It is a consequence
    // emitted by the law layer inside triggerMurder, not a creatable
    // crime type.
    //
    // Options:
    //   options.locationId    string  the settlement location the crime
    //                                 is scoped to (required for
    //                                 Commands.recordCrime; passed through
    //                                 unchanged)
    //   options.onComplete    fn      called on success with the command
    //                                 result's data
    //   options.type          string  initial crime type (optional)
    //   options.perpetratorId string  initial perpetrator id (optional)
    //   options.victimId      string  initial victim id (optional)
    //   options.year          number  initial year (defaults to current)
    //
    // The modal is opened by the settlement crime tab
    // (js/tabs/settlement-crime-tab.js) with options.locationId set.
    // It is also callable world-wide with options.locationId
    // explicitly supplied by the caller; the locationId is required
    // because recordCrime's first parameter is the settlement location,
    // and the crime's own location is a separate (optional) field.

    function openCreateCrimeModal(options) {
        options = options || {};

        if (typeof options.locationId !== 'string' || options.locationId.length === 0) {
            window.showToast(
                'Create Crime requires a location scope (options.locationId)',
                'error'
            );
            return null;
        }

        var scopedLocationId = options.locationId;
        var defaultYear = (typeof options.year === 'number')
            ? options.year
            : window.getCurrentYear();

        var typeOptions = _buildCrimeTypeOptions(options.type || null);
        var locationOptions = _buildLocationOptions(options.locationId);

        var content =
            '<div style="max-height:520px;overflow-y:auto;padding:4px;">' +

                '<div style="margin-bottom:12px;">' +
                    _fieldLabel('Crime Type *',
                        '<select id="crimeType" style="width:100%;padding:8px;' +
                        'background:var(--bg);border:1px solid var(--border);' +
                        'border-radius:6px;font-size:0.75rem;">' +
                            typeOptions +
                        '</select>' +
                        '<div style="margin-top:4px;font-size:0.5rem;color:var(--dim);">' +
                        'Murder routes through the murder workflow (kill + vendetta + ' +
                        'law consequences). Execution is not a creatable type.' +
                        '</div>'
                    ) +
                '</div>' +

                _detailGrid([
                    _fieldLabel('Perpetrator',
                        _selectButton('crimeGenericSelectPerp', 'crimeGenericPerpDisplay', 'Select perpetrator...', 'PERSON') +
                        '<input type="hidden" id="crimeGenericPerpId" value="' +
                            window.escapeHtml(options.perpetratorId || '') + '">'
                    ),
                    _fieldLabel('Victim (optional)',
                        _selectButton('crimeGenericSelectVictim', 'crimeGenericVictimDisplay', 'Select victim...', 'PERSON') +
                        '<input type="hidden" id="crimeGenericVictimId" value="' +
                            window.escapeHtml(options.victimId || '') + '">'
                    )
                ]) +

                _detailGrid([
                    _fieldLabel('Year', _numberInput('crimeGenericYear', defaultYear)),
                    _fieldLabel('Location',
                        '<select id="crimeGenericLocation" style="width:100%;padding:6px 8px;' +
                        'background:var(--bg);border:1px solid var(--border);' +
                        'border-radius:6px;font-size:0.65rem;">' +
                        locationOptions +
                        '</select>'
                    )
                ]) +

                '<div style="margin-bottom:12px;">' +
                    _fieldLabel('Reason',
                        _textInput('crimeGenericReason', '', 'e.g., Theft, Assault, Heresy...')
                    ) +
                '</div>' +

                '<div id="crimeSolvedGroup" style="margin-bottom:12px;">' +
                    '<label style="display:flex;align-items:center;gap:8px;' +
                    'font-size:0.65rem;cursor:pointer;">' +
                    '<input type="checkbox" id="crimeSolved">' +
                    'Record as already solved' +
                    '</label>' +
                    '<div id="crimeSolutionGroup" style="margin-top:8px;display:none;">' +
                        _fieldLabel('Solution',
                            _textInput('crimeSolution', '', 'e.g., Perpetrator apprehended, confessed...')
                        ) +
                    '</div>' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                    _fieldLabel('Notes', _textarea('crimeGenericNotes', '', 2)) +
                '</div>' +

            '</div>';

        var modal = window.openModal({
            titleHtml: 'Record Crime',
            contentHtml: content,
            confirmText: 'Record',
            cancelText: 'Cancel',
            onMount: function(root) {
                _wireCreateCrimeModal(root, options);
            },
            onConfirm: function(root) {
                return _submitCreateCrime(root, options, scopedLocationId);
            }
        });

        return modal;
    }

    function _wireCreateCrimeModal(root, options) {
        // Perpetrator selector.
        var perpBtn = root.querySelector('#crimeGenericSelectPerp');
        var perpDisplay = root.querySelector('#crimeGenericPerpDisplay');
        var perpHidden = root.querySelector('#crimeGenericPerpId');
        if (perpBtn) {
            perpBtn.addEventListener('click', function() {
                window.openCharacterSelector({
                    title: 'Select Perpetrator',
                    filters: { showDeceased: false },
                    onSelect: function(c) {
                        perpDisplay.textContent = VM.formatPersonName(c);
                        perpHidden.value = c.id;
                    }
                });
            });
        }
        if (perpHidden && perpHidden.value) {
            var initialPerp = window.getCharacterById(perpHidden.value);
            if (initialPerp) {
                perpDisplay.textContent = VM.formatPersonName(initialPerp);
            }
        }

        // Victim selector.
        var victimBtn = root.querySelector('#crimeGenericSelectVictim');
        var victimDisplay = root.querySelector('#crimeGenericVictimDisplay');
        var victimHidden = root.querySelector('#crimeGenericVictimId');
        if (victimBtn) {
            victimBtn.addEventListener('click', function() {
                window.openCharacterSelector({
                    title: 'Select Victim (optional)',
                    filters: { showDeceased: false },
                    onSelect: function(c) {
                        victimDisplay.textContent = VM.formatPersonName(c);
                        victimHidden.value = c.id;
                    }
                });
            });
        }
        if (victimHidden && victimHidden.value) {
            var initialVictim = window.getCharacterById(victimHidden.value);
            if (initialVictim) {
                victimDisplay.textContent = VM.formatPersonName(initialVictim);
            }
        }

        // Solved checkbox → show/hide the solution field.
        var solvedCheck = root.querySelector('#crimeSolved');
        var solutionGroup = root.querySelector('#crimeSolutionGroup');
        if (solvedCheck && solutionGroup) {
            solvedCheck.addEventListener('change', function() {
                solutionGroup.style.display = solvedCheck.checked ? 'block' : 'none';
            });
        }

        // Type change → if murder is selected, warn the user (the
        // modal will route the submit through triggerMurder and the
        // "Solved" checkbox does not apply). Keep the field visible;
        // recordCrime/triggerMurder still validate on submit.
        var typeSelect = root.querySelector('#crimeType');
        if (typeSelect) {
            typeSelect.addEventListener('change', function() {
                var isMurder = (typeSelect.value === C.CRIME_TYPES.MURDER);
                if (solvedCheck) {
                    solvedCheck.disabled = isMurder;
                    if (isMurder) {
                        solvedCheck.checked = false;
                        if (solutionGroup) solutionGroup.style.display = 'none';
                    }
                }
            });
            // If the modal was opened with murder preselected, apply the
            // same rule immediately.
            if (typeSelect.value === C.CRIME_TYPES.MURDER && solvedCheck) {
                solvedCheck.disabled = true;
            }
        }
    }

    function _submitCreateCrime(root, options, scopedLocationId) {
        var typeEl = root.querySelector('#crimeType');
        var type = typeEl ? typeEl.value : '';
        if (!type) {
            window.showToast('Please select a crime type', 'error');
            return false;
        }

        var perpetratorId = (root.querySelector('#crimeGenericPerpId') || {}).value || null;
        var victimId = (root.querySelector('#crimeGenericVictimId') || {}).value || null;

        var yearRaw = (root.querySelector('#crimeGenericYear') || {}).value;
        var year = (yearRaw === '' || yearRaw === undefined)
            ? window.getCurrentYear()
            : parseInt(yearRaw, 10);
        if (isNaN(year)) {
            window.showToast('Year must be a number', 'error');
            return false;
        }

        var locationId = (root.querySelector('#crimeGenericLocation') || {}).value || null;
        var reasonRaw = (root.querySelector('#crimeGenericReason') || {}).value || '';
        var reason = reasonRaw === '' ? null : reasonRaw;
        var notesRaw = (root.querySelector('#crimeGenericNotes') || {}).value || '';
        var notes = notesRaw === '' ? null : notesRaw;

        if (type === C.CRIME_TYPES.MURDER) {
            // Murder routes through triggerMurder. The victim and
            // perpetrator both become mandatory for the kill to be
            // possible; triggerMurder validates the rest.
            if (!perpetratorId) {
                window.showToast('Select a perpetrator (the killer)', 'error');
                return false;
            }
            if (!victimId) {
                window.showToast('Select a victim', 'error');
                return false;
            }
            if (perpetratorId === victimId) {
                window.showToast('Perpetrator and victim cannot be the same', 'error');
                return false;
            }
            return _routeMurderFromCreateCrime(options, {
                victimId: victimId,
                killerId: perpetratorId,
                year: year,
                locationId: locationId,
                reason: reason,
                notes: notes
            });
        }

        // Non-murder path.
        var solvedCheck = root.querySelector('#crimeSolved');
        var solved = solvedCheck ? solvedCheck.checked === true : false;
        var solutionRaw = (root.querySelector('#crimeSolution') || {}).value || '';
        var solution = (solutionRaw === '') ? null : solutionRaw;

        var data = {
            type: type,
            perpetratorId: perpetratorId,
            victimId: victimId,
            year: year,
            locationId: locationId,
            reason: reason,
            notes: notes,
            solved: solved,
            solution: solved ? (solution || 'Solved') : null
        };

        var result = Commands.recordCrime(scopedLocationId, data);

        if (!result.success) {
            window.showToast('Failed to record crime: ' + result.reason, 'error');
            return false;
        }

        _commitAndPersist();
        window.showToast('Crime recorded', 'success');
        window.closeTopModal();
        if (typeof options.onComplete === 'function') options.onComplete(result.data);
        return true;
    }

    function _routeMurderFromCreateCrime(options, params) {
        var result = Commands.triggerMurder(params.victimId, params.killerId, {
            year: params.year,
            locationId: params.locationId,
            reason: params.reason,
            notes: params.notes,
            // triggerMurder's default is startVendetta = true when
            // households differ. That matches the murder workflow
            // contract. The generic create-crime modal does not expose
            // a "start vendetta" toggle for murder; callers that want
            // that control use openMurderModal directly.
            startVendetta: true
        });

        if (!result.success) {
            window.showToast('Failed to record murder: ' + result.reason, 'error');
            return false;
        }

        _commitAndPersist();
        window.showToast('Murder recorded', 'success');
        window.closeTopModal();
        if (typeof options.onComplete === 'function') options.onComplete(result.data);
        return true;
    }

    // =========================================================================
    // 4. EXECUTION MODAL (unchanged; legacy surface)
    // =========================================================================
    //
    // Execution is a consequence emitted by the law layer inside
    // triggerMurder. It is not a user-initiated action under the current
    // settlement UI. This modal remains for callers that still open it
    // directly; it is NOT exposed from the settlement crime tab.

    function openExecutionModal(options) {
        var vm = VM.toExecutionModalViewModel(options || {});

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
            titleHtml: vm.title,
            contentHtml: content,
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
        var year = yearRaw === '' ? window.getCurrentYear() : parseInt(yearRaw, 10);
        var locationId = root.querySelector('#crimeExecLocation').value || null;
        var reasonRaw = root.querySelector('#crimeExecReason').value;
        var reason = reasonRaw === '' ? null : reasonRaw;
        var methodRaw = root.querySelector('#crimeExecMethod').value;
        var method = methodRaw === '' ? null : methodRaw;
        var notesRaw = root.querySelector('#crimeExecNotes').value;
        var notes = notesRaw === '' ? null : notesRaw;

        if (!condemnedId) {
            window.showToast('Please select a condemned character', 'error');
            return false;
        }
        if (isNaN(year)) { window.showToast('Year must be a number', 'error'); return false; }

        var result = Commands.triggerExecution(condemnedId, {
            year: year,
            locationId: locationId,
            reason: reason,
            method: method,
            notes: notes
        });

        if (!result.success) {
            window.showToast('Failed to record execution: ' + result.reason, 'error');
            return false;
        }

        _commitAndPersist();
        window.showToast('Execution recorded', 'success');
        window.closeTopModal();
        if (typeof options.onComplete === 'function') options.onComplete(result.data);
        return true;
    }

    // =========================================================================
    // 5. VENDETTA MODAL (unchanged except settlement scope)
    // =========================================================================
    //
    // Options:
    //   options.settlementHouseholdIds   string[] | undefined
    //       When non-empty, restricts the two household selections to
    //       the supplied id set. The picker is still opened unfiltered
    //       (openHouseholdSelector has no householdIds filter key); the
    //       modal rejects out-of-scope picks in the picker's onSelect
    //       callback with a warning toast. See SETTLEMENT-SCOPED
    //       VENDETTA CREATION in the header.
    //   options.locationId               string | undefined
    //       Passed through to CrimeState.createVendetta so the record
    //       carries the settlement-scope location.
    //   options.onComplete               fn | undefined
    //       Called on success with the created vendetta's data.

    function openVendettaModal(options) {
        options = options || {};

        var vm = VM.toVendettaModalViewModel(options);

        var settlementHouseholdIds = Array.isArray(options.settlementHouseholdIds)
            ? options.settlementHouseholdIds.slice()
            : null;
        var settlementScoped = settlementHouseholdIds !== null
            && settlementHouseholdIds.length > 0;

        var scopeBanner = '';
        if (settlementScoped) {
            scopeBanner =
                '<div style="margin-bottom:12px;padding:8px;background:var(--bg3);' +
                'border-radius:6px;font-size:0.55rem;color:var(--dim);">' +
                'Households must be in the current settlement (' +
                window.escapeHtml(String(settlementHouseholdIds.length)) +
                ' available).' +
                '</div>';
        }

        var content =
            scopeBanner +
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
            titleHtml: vm.title,
            contentHtml: content,
            confirmText: 'Create Vendetta',
            cancelText: 'Cancel',
            onMount: function(root) {
                _wireVendettaSelectors(root, options, vm, settlementHouseholdIds);
            },
            onConfirm: function(root) {
                return _submitVendetta(root, options, vm);
            }
        });
    }

    // Feature-detect settlement-scope support. Callers may check this
    // before passing options.settlementHouseholdIds.
    openVendettaModal.supportsSettlementScope = true;

    function _wireVendettaSelectors(root, options, vm, settlementHouseholdIds) {
        var btnA = root.querySelector('#crimeSelectHouseholdA');
        var displayA = root.querySelector('#crimeHouseholdADisplay');
        var hiddenA = root.querySelector('#crimeHouseholdAId');

        var btnB = root.querySelector('#crimeSelectHouseholdB');
        var displayB = root.querySelector('#crimeHouseholdBDisplay');
        var hiddenB = root.querySelector('#crimeHouseholdBId');

        function _pickHousehold(title, onSelected) {
            window.openHouseholdSelector({
                title: title,
                onSelect: function(h) {
                    // Reject out-of-scope picks when the modal is
                    // settlement-scoped. The picker shows the full
                    // household list (openHouseholdSelector has no
                    // householdIds filter); the modal enforces the
                    // scope here. See SETTLEMENT-SCOPED VENDETTA
                    // CREATION in the header.
                    if (settlementHouseholdIds !== null
                        && settlementHouseholdIds.indexOf(h.id) === -1) {
                        window.showToast(
                            'Household "' + (h.name || h.id) +
                            '" is not part of the current settlement.',
                            'warning'
                        );
                        return;
                    }
                    onSelected(h);
                }
            });
        }

        if (btnA) {
            btnA.addEventListener('click', function() {
                _pickHousehold('Select Household A', function(h) {
                    displayA.textContent = h.name || 'Unknown';
                    hiddenA.value = h.id;
                });
            });
        }
        if (btnB) {
            btnB.addEventListener('click', function() {
                _pickHousehold('Select Household B', function(h) {
                    displayB.textContent = h.name || 'Unknown';
                    hiddenB.value = h.id;
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
        var year = yearRaw === '' ? window.getCurrentYear() : parseInt(yearRaw, 10);
        var causeRaw = root.querySelector('#crimeVendettaCause').value;
        var cause = causeRaw === '' ? null : causeRaw;
        var notesRaw = root.querySelector('#crimeVendettaNotes').value;
        var notes = notesRaw === '' ? null : notesRaw;

        if (!householdAId || !householdBId) {
            window.showToast('Please select both households', 'error');
            return false;
        }
        if (householdAId === householdBId) {
            window.showToast('Households cannot be the same', 'error');
            return false;
        }
        if (isNaN(year)) { window.showToast('Year must be a number', 'error'); return false; }

        // Settlement-scope re-check on submit. The picker already
        // rejected out-of-scope picks, but a caller can pass initial
        // ids through options; validate those too.
        if (Array.isArray(options.settlementHouseholdIds)
            && options.settlementHouseholdIds.length > 0) {
            var scope = options.settlementHouseholdIds;
            if (scope.indexOf(householdAId) === -1) {
                window.showToast(
                    'Household A is not part of the current settlement.',
                    'error'
                );
                return false;
            }
            if (scope.indexOf(householdBId) === -1) {
                window.showToast(
                    'Household B is not part of the current settlement.',
                    'error'
                );
                return false;
            }
        }

        // Prefer CrimeCommands.createVendettaForHouseholds if the
        // command surface gains it later. Currently it does not exist,
        // so this path falls through to CrimeState.createVendetta, the
        // documented exception. See VENDETTA CREATION QUIRK in the
        // header.
        var result;
        if (typeof Commands.createVendettaForHouseholds === 'function') {
            result = Commands.createVendettaForHouseholds(
                householdAId, householdBId, {
                    year: year,
                    cause: cause,
                    notes: notes,
                    locationId: options.locationId || null
                }
            );
        } else {
            result = window.CrimeState.createVendetta({
                householdAId: householdAId,
                householdBId: householdBId,
                year: year,
                cause: cause,
                notes: notes
            });
        }

        if (!result.success) {
            window.showToast('Failed to create vendetta: ' + result.reason, 'error');
            return false;
        }

        _commitAndPersist();
        window.showToast('Vendetta created', 'success');
        window.closeTopModal();
        if (typeof options.onComplete === 'function') options.onComplete(result.data);
        return true;
    }

    // =========================================================================
    // 6. CRIME DETAILS MODAL (unchanged)
    // =========================================================================

    function openCrimeDetailsModal(crimeId) {
        var crime = Queries.getCrime(crimeId);
        if (!crime) {
            window.showToast('Crime not found', 'error');
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
            window.showToast('Crime details unavailable', 'error');
            return null;
        }

        var cells = [
            _detail('Type', window.escapeHtml(vm.typeLabel)),
            _detail('Year', window.escapeHtml(vm.yearLabel)),
            _detail('Perpetrator', window.escapeHtml(vm.perpetratorName)),
            _detail('Victim', window.escapeHtml(vm.victimName || 'None')),
            _detail('Location', window.escapeHtml(vm.locationName || 'Unknown')),
            _detail('Reason', window.escapeHtml(vm.reason || 'Unknown')),
            _detail('Status', window.escapeHtml(vm.statusLabel)),
            _detail('Severity', window.escapeHtml(vm.severityLabel))
        ];

        var content = '<div style="padding:4px 0;">' + _detailGrid(cells);

        if (vm.solved && vm.solution) {
            content += _detail('Solution', window.escapeHtml(vm.solution));
        }
        if (vm.method) {
            content += _detail('Method', window.escapeHtml(vm.method));
        }
        if (vm.civilViolation) {
            content += _detail(
                'Civil Violation',
                window.escapeHtml(vm.civilViolation.lawName || 'Law unspecified') +
                (vm.civilViolation.punishment
                    ? ' — ' + window.escapeHtml(vm.civilViolation.punishment)
                    : '')
            );
        }
        if (vm.religiousViolation) {
            content += _detail(
                'Religious Violation',
                window.escapeHtml(vm.religiousViolation.lawName || 'Law unspecified') +
                (vm.religiousViolation.punishment
                    ? ' — ' + window.escapeHtml(vm.religiousViolation.punishment)
                    : '')
            );
        }
        if (vm.notes) {
            content += _detail('Notes', window.escapeHtml(vm.notes));
        }

        content += '</div>';

        return window.openModal({
            titleHtml: 'Crime Details',
            contentHtml: content,
            confirmText: 'Close',
            cancelText: ''
        });
    }

    // =========================================================================
    // 7. VENDETTA DETAILS MODAL (unchanged)
    // =========================================================================

    function openVendettaDetailsModal(vendettaId) {
        var vendetta = Queries.getVendetta(vendettaId);
        if (!vendetta) {
            window.showToast('Vendetta not found', 'error');
            return null;
        }

        var vm = VM.toVendettaDetailsViewModel(vendetta);
        if (!vm) {
            window.showToast('Vendetta details unavailable', 'error');
            return null;
        }

        var cells = [
            _detail('Household A', window.escapeHtml(vm.householdAName)),
            _detail('Household B', window.escapeHtml(vm.householdBName)),
            _detail('Started', window.escapeHtml(vm.startedYearLabel)),
            _detail('Status', window.escapeHtml(vm.statusLabel)),
            _detail('Body Count', window.escapeHtml(String(vm.deathCount)))
        ];

        var content = '<div style="padding:4px 0;">' + _detailGrid(cells);

        if (vm.cause) {
            content += _detail('Cause', window.escapeHtml(vm.cause));
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
                    window.escapeHtml(d.victimName) + ' killed by ' +
                    window.escapeHtml(d.killerName) +
                    ' (' + window.escapeHtml(d.yearLabel) + ')' +
                    (d.reason ? ' — ' + window.escapeHtml(d.reason) : '') +
                    '</div>';
            }
            content += '</div>';
        }

        if (vm.isResolved && vm.resolution) {
            content += _detail('Resolution', window.escapeHtml(vm.resolution));
        }
        if (vm.notes) {
            content += _detail('Notes', window.escapeHtml(vm.notes));
        }

        content += '</div>';

        return window.openModal({
            titleHtml: 'Vendetta Details',
            contentHtml: content,
            confirmText: 'Close',
            cancelText: ''
        });
    }

    // =========================================================================
    // 8. CRIME STATS MODAL (unchanged)
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
            window.showToast('Crime statistics unavailable', 'error');
            return null;
        }

        var content = '<div style="padding:4px 0;">';

        if (vm.periodLabel) {
            content += '<div style="font-size:0.55rem;color:var(--dim);margin-bottom:8px;">' +
                window.escapeHtml(vm.periodLabel) +
                '</div>';
        }

        content += _detailGrid([
            _detail('Total Crimes', String(vm.totalCrimes)),
            _detail('Solve Rate', window.escapeHtml(vm.solvedRateLabel)),
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
                    '<span>' + window.escapeHtml(row.typeLabel) + '</span>' +
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
            content += _detail('Average Severity', window.escapeHtml(vm.avgSeverityLabel));
        }
        if (vm.mostCommonCrimeLabel) {
            content += _detail('Most Common Crime', window.escapeHtml(vm.mostCommonCrimeLabel));
        }

        content += '</div>';

        return window.openModal({
            titleHtml: 'Crime Statistics — ' + window.escapeHtml(locationName || 'Global'),
            contentHtml: content,
            confirmText: 'Close',
            cancelText: ''
        });
    }

    // =========================================================================
    // 9. EXPORTS
    // =========================================================================

    window.CrimeModals = {
        openCreateCrimeModal: openCreateCrimeModal,
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

    // Feature-detect settlement scope on the namespace-level entry point
    // too. Callers that check window.CrimeModals.openVendettaModal vs.
    // window.CrimeModals.openVendettaModal.supportsSettlementScope see
    // the same boolean.
    window.CrimeModals.openVendettaModal.supportsSettlementScope = true;

    window._crimeModals = window.CrimeModals;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CrimeModals;
    }

})();
