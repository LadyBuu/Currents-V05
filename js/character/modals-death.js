/**
 * =============================================================================
 * STILL WATERS - DEATH MODALS (js/character/modals-death.js)
 * =============================================================================
 *
 * Death, murder, and execution modals.
 *
 * SCOPE:
 *   - openDeathModal(characterId, onSuccess)
 *   - openMurderModal(victimId, onSuccess)
 *   - openExecutionModal(condemnedId, onSuccess)
 *
 * OUT OF SCOPE:
 *   - Mortality policy           -> mortality-rules.js
 *   - Death transition           -> CharacterCommands.markDeceased via
 *                                   CharacterLifecycle.killCharacter
 *   - Childbirth                 -> not implemented; see note below
 *   - Presentation CSS           -> stylesheet
 *   - Modal stack                -> modals-core.js
 *
 * CONTRACT:
 *   - This module is UI only. It reads projections, collects user input,
 *     and calls commands. It does not save, does not mutate characters,
 *     does not fallback-write to character fields, does not compute
 *     mortality policy, and does not inspect character.relationships.
 *   - Every modal opens with a character ID, not a character object.
 *   - Every command call goes through CharacterLifecycle.killCharacter.
 *   - Death causes are stable ids. Detail text is passed separately.
 *   - No fallback for missing dependencies.
 *
 * CHILDBIRTH:
 *   The old modal handled childbirth by searching character.relationships
 *   and generating a newborn inline. Both of those dependencies no longer
 *   exist. Childbirth is not implemented in this module. It needs:
 *     - a co-parent selection contract from the future relationship domain
 *     - a transaction boundary between birth and maternal death
 *   When those exist, a childbirth modal can be added alongside the ones
 *   here. Death-by-childbed-fever is still selectable as a cause.
 *
 * DEPENDENCIES (REQUIRED):
 *   - formatting.js:        escapeHtml
 *   - icons.js:             Icons
 *   - modals-core.js:       openModal, closeTopModal
 *   - time.js:              getCurrentYear, isValidYear, calculateAge
 *   - CharacterQueries:     getCharacterSummary
 *   - MortalityRules:       DEATH_CAUSE, isValidDeathCause
 *   - CharacterLifecycle:   killCharacter
 *
 * DEPENDENCIES (OPTIONAL):
 *   - selectors/modals-char-selector.js (openCharacterSelector)
 *
 * ICON POLICY: SVG from icons.js. No emojis.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 0. DEPENDENCY GUARDS
    // =========================================================================

    function _requireDependencies() {
        var required = [
            'escapeHtml',
            'openModal',
            'closeTopModal',
            'getCurrentYear',
            'isValidYear',
            'calculateAge'
        ];
        var missing = [];
        for (var i = 0; i < required.length; i++) {
            if (typeof window[required[i]] === 'undefined') {
                missing.push(required[i]);
            }
        }
        if (missing.length > 0) {
            throw new Error(
                'modals-death.js: missing required dependencies: ' +
                missing.join(', ')
            );
        }
        if (typeof window.Icons === 'undefined') {
            throw new Error('modals-death.js: icons.js must load first.');
        }
        if (typeof window.CharacterQueries === 'undefined') {
            throw new Error('modals-death.js: character-queries.js must load first.');
        }
        if (typeof window.MortalityRules === 'undefined') {
            throw new Error('modals-death.js: mortality-rules.js must load first.');
        }
        if (typeof window.CharacterLifecycle === 'undefined') {
            throw new Error('modals-death.js: character-lifecycle.js must load first.');
        }
    }

    _requireDependencies();

    var MR = window.MortalityRules;
    var CL = window.CharacterLifecycle;
    var CQ = window.CharacterQueries;

    // =========================================================================
    // 1. VOCABULARY (UI presentation only)
    // =========================================================================
    //
    // These catalogues are UI suggestions. They do not define the domain
    // vocabulary; they offer free-text detail options that the user may
    // pick or replace.

    var DEATH_CAUSE_CATEGORIES = [
        {
            key: MR.DEATH_CAUSE.NATURAL,
            label: 'Natural Causes',
            suggestions: [
                'Old age', 'Natural causes', 'Peaceful death',
                'Wasting illness', 'Organ failure', 'Heart failure',
                'Stroke', 'Senility'
            ]
        },
        {
            key: MR.DEATH_CAUSE.DISEASE,
            label: 'Disease',
            suggestions: [
                'Fever', 'Consumption', 'Pneumonia', 'Infection', 'Plague',
                'Dysentery', 'Malaria', 'Smallpox', 'Measles', 'Cholera',
                'Typhoid', 'Typhus', 'Influenza', 'Gout', 'Cancer'
            ]
        },
        {
            key: MR.DEATH_CAUSE.ACCIDENT,
            label: 'Accident or Misadventure',
            suggestions: [
                'Drowning', 'Fell from height', 'Hunting accident', 'Fire',
                'Crushed', 'Cart accident', 'Building collapse',
                'Tools accident', 'Fell down stairs', 'Slipped on ice',
                'Lightning strike', 'Boating accident', 'Animal attack',
                'Killed in battle', 'War wound', 'Siege'
            ]
        },
        {
            key: MR.DEATH_CAUSE.CHILDBED_FEVER,
            label: 'Childbed Fever',
            suggestions: [
                'Childbed fever', 'Childbirth complications', 'Hemorrhage',
                'Puerperal fever', 'Birth trauma', 'Eclampsia',
                'Placental abruption'
            ],
            requiresFemale: true
        },
        {
            key: MR.DEATH_CAUSE.UNKNOWN,
            label: 'Unknown',
            suggestions: ['Unknown', 'Cause not recorded']
        }
    ];

    var MURDER_MOTIVE_SUGGESTIONS = [
        'Jealousy', 'Revenge', 'Personal vendetta', 'Crime of passion',
        'Honor killing', 'Blood feud', 'Love triangle', 'Family dispute',
        'Betrayal', 'Insult',
        'Political rivalry', 'Treason', 'Succession dispute',
        'Coup attempt', 'Court intrigue', 'Religious conflict',
        'Assassination', 'Power struggle',
        'Robbery', 'Contract killing', 'Land dispute',
        'Inheritance dispute', 'Debt collection',
        'Mistaken identity', 'Self-defense gone wrong',
        'Madness', 'Fear of exposure', 'Unknown motive'
    ];

    var MURDER_METHODS = [
        { id: 'stabbing', label: 'Stabbing' },
        { id: 'poison', label: 'Poison' },
        { id: 'strangulation', label: 'Strangulation' },
        { id: 'bludgeoning', label: 'Bludgeoning' },
        { id: 'shooting', label: 'Shooting' },
        { id: 'drowning', label: 'Drowning' },
        { id: 'burning', label: 'Burning' },
        { id: 'falling', label: 'Pushed from height' },
        { id: 'exsanguination', label: 'Exsanguination' },
        { id: 'starvation', label: 'Starvation' }
    ];

    var EXECUTION_REASON_SUGGESTIONS = [
        'Murder of a noble', 'Murder of a child', 'Multiple murders',
        'Brutal murder', 'Premeditated murder', 'Assassination',
        'Murder of a royal',
        'Treason against the Crown', 'Regicide', 'Rebellion',
        'Revolutionary activity', 'Coup attempt', 'Conspiracy',
        'Espionage', 'Sedition',
        'Desertion', 'Cowardice in battle', 'Insubordination', 'Mutiny',
        'Blasphemy', 'Sacrilege', 'Witchcraft', 'Heresy', 'Apostasy',
        'Adultery', 'Incest', 'Breaking sacred taboos', 'Dueling',
        'Highway robbery', 'Counterfeiting', 'Arson', 'Piracy',
        'Smuggling', 'Forgery'
    ];

    var EXECUTION_METHODS = [
        { id: 'beheading', label: 'Beheading' },
        { id: 'hanging', label: 'Hanging' },
        { id: 'burning', label: 'Burning at the Stake' },
        { id: 'guillotine', label: 'Guillotine' },
        { id: 'firing_squad', label: 'Firing Squad' },
        { id: 'drowning', label: 'Drowning' },
        { id: 'stoning', label: 'Stoning' },
        { id: 'breaking_wheel', label: 'Breaking Wheel' },
        { id: 'quartering', label: 'Drawing and Quartering' },
        { id: 'crucifixion', label: 'Crucifixion' },
        { id: 'garrote', label: 'Garrote' },
        { id: 'boiling', label: 'Boiling Alive' }
    ];

    // =========================================================================
    // 2. HELPERS
    // =========================================================================

    function _esc(v) {
        return window.escapeHtml(v);
    }

    function _hasId(v) {
        return typeof v === 'string' && v.length > 0;
    }

    function _isMissing(v) {
        return v === undefined || v === null;
    }

    function _icon(name) {
        return window.Icons[name] || '';
    }

    function _age(character) {
        if (!character || typeof character.birthYear !== 'number') return null;
        return window.calculateAge(
            character.birthYear,
            character.isDeceased === true,
            character.deathYear
        );
    }

    function _pickRandom(arr) {
        if (!Array.isArray(arr) || arr.length === 0) return null;
        return arr[Math.floor(Math.random() * arr.length)];
    }

    /**
     * Reads the character projection used by all three modals.
     * Returns null when the character is missing or already deceased.
     */
    function _readSubject(characterId) {
        if (!_hasId(characterId)) return null;
        var summary = CQ.getCharacterSummary(characterId);
        if (!summary) return null;
        if (summary.isDeceased === true) return null;
        return summary;
    }

    /**
     * Builds suggestion buttons markup and wires them once the modal DOM
     * exists. Used by all three modals.
     */
    function _renderSuggestions(containerId, suggestions, targetInputId) {
        var container = document.getElementById(containerId);
        var target = document.getElementById(targetInputId);
        if (!container || !target) return;

        if (!Array.isArray(suggestions) || suggestions.length === 0) {
            container.innerHTML = '';
            return;
        }

        var html = '';
        for (var i = 0; i < suggestions.length; i++) {
            var s = suggestions[i];
            html += '<button type="button" class="suggestion-btn" '
                 + 'data-suggestion="' + _esc(s) + '" '
                 + 'style="padding: 4px 8px; font-size: 0.6rem; '
                 + 'background: var(--bg3); border: 1px solid var(--border); '
                 + 'border-radius: 4px; cursor: pointer;">'
                 + _esc(s)
                 + '</button>';
        }
        container.innerHTML = html;

        var buttons = container.querySelectorAll('.suggestion-btn');
        for (var j = 0; j < buttons.length; j++) {
            buttons[j].addEventListener('click', function () {
                target.value = this.getAttribute('data-suggestion') || '';
            });
        }
    }

    /**
     * Wires age <-> year synchronisation on two inputs.
     */
    function _wireAgeYearSync(ageInputId, yearInputId, birthYear) {
        if (typeof birthYear !== 'number') return;
        var ageEl = document.getElementById(ageInputId);
        var yearEl = document.getElementById(yearInputId);
        if (!ageEl || !yearEl) return;

        var syncing = false;

        ageEl.addEventListener('input', function () {
            if (syncing) return;
            syncing = true;
            var age = parseInt(ageEl.value, 10);
            if (Number.isInteger(age) && age >= 0) {
                yearEl.value = String(birthYear + age);
            }
            syncing = false;
        });

        yearEl.addEventListener('input', function () {
            if (syncing) return;
            syncing = true;
            var year = parseInt(yearEl.value, 10);
            if (Number.isInteger(year)) {
                var a = year - birthYear;
                if (a >= 0) ageEl.value = String(a);
            }
            syncing = false;
        });
    }

    // =========================================================================
    // 3. DEATH MODAL
    // =========================================================================

    /**
     * @param {string} characterId
     * @param {Function} [onSuccess]
     */
    function openDeathModal(characterId, onSuccess) {
        var summary = _readSubject(characterId);
        if (!summary) {
            return { success: false, reason: 'Character not found or already deceased.' };
        }

        var currentYear = window.getCurrentYear();
        var age = summary.age === null ? 0 : summary.age;
        var isFemale = summary.gender === 'female';

        var categoryOptions = '';
        var causeCategories = DEATH_CAUSE_CATEGORIES.filter(function (cat) {
            if (cat.requiresFemale === true && !isFemale) return false;
            return true;
        });

        for (var i = 0; i < causeCategories.length; i++) {
            var cat = causeCategories[i];
            categoryOptions += '<option value="' + _esc(cat.key) + '">'
                             + _esc(cat.label)
                             + '</option>';
        }

        var firstCategory = causeCategories[0];
        var randomDetail = _pickRandom(firstCategory.suggestions) || '';

        var content = '<div class="character-modal">';

        content += '<div class="character-modal__section">'
                 + '<strong>' + _esc(summary.fullName || summary.name || 'Unnamed') + '</strong>'
                 + '<br>' + _esc(age) + ' years &middot; '
                 + _esc(summary.gender || 'Unknown')
                 + (summary.locationId ? ' &middot; ' + _esc(summary.locationId) : '')
                 + '</div>';

        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="death-category">Cause Category</label>'
                 + '<select id="death-category" class="character-modal__form-input">'
                 + categoryOptions
                 + '</select>'
                 + '</div>';

        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="death-detail">Specific Cause</label>'
                 + '<input type="text" id="death-detail" class="character-modal__form-input" '
                 + 'value="' + _esc(randomDetail) + '" autocomplete="off">'
                 + '<div id="death-detail-suggestions" '
                 + 'style="display:flex; flex-wrap:wrap; gap:6px; margin-top:8px;"></div>'
                 + '</div>';

        content += '<div class="character-modal__grid">';
        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="death-age">Age at Death</label>'
                 + '<input type="number" id="death-age" class="character-modal__form-input" '
                 + 'value="' + _esc(age) + '" min="0" max="150">'
                 + '</div>';
        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="death-year">Year of Death</label>'
                 + '<input type="number" id="death-year" class="character-modal__form-input" '
                 + 'value="' + _esc(currentYear) + '" '
                 + 'min="' + (summary.birthYear !== null ? summary.birthYear : 1) + '" '
                 + 'max="' + (currentYear + 10) + '">'
                 + '</div>';
        content += '</div>';

        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="death-notes">Notes</label>'
                 + '<textarea id="death-notes" class="character-modal__form-input" rows="2"></textarea>'
                 + '</div>';

        content += '</div>';

        var modal = window.openModal({
            titleHtml: 'Character Death: ' + _esc(summary.name || ''),
            contentHtml: content,
            confirmText: 'Confirm Death',
            cancelText: 'Cancel',
            onOpen: function (modalElement) {
                var categorySelect = modalElement.querySelector('#death-category');
                var detailInput = modalElement.querySelector('#death-detail');

                function refreshSuggestions() {
                    var selectedKey = categorySelect.value;
                    var selectedCat = null;
                    for (var k = 0; k < causeCategories.length; k++) {
                        if (causeCategories[k].key === selectedKey) {
                            selectedCat = causeCategories[k];
                            break;
                        }
                    }
                    var suggestions = selectedCat ? selectedCat.suggestions : [];
                    _renderSuggestions(
                        'death-detail-suggestions',
                        suggestions,
                        'death-detail'
                    );
                    var first = _pickRandom(suggestions);
                    if (first) detailInput.value = first;
                }

                categorySelect.addEventListener('change', refreshSuggestions);
                refreshSuggestions();

                _wireAgeYearSync('death-age', 'death-year', summary.birthYear);
            },
            onConfirm: function () {
                var categorySelect = modal.element.querySelector('#death-category');
                var detailInput = modal.element.querySelector('#death-detail');
                var yearInput = modal.element.querySelector('#death-year');
                var notesInput = modal.element.querySelector('#death-notes');

                var cause = categorySelect.value;
                if (!MR.isValidDeathCause(cause)) {
                    throw new Error('Invalid death cause.');
                }

                var detail = detailInput.value.trim();
                var deathYear = parseInt(yearInput.value, 10);
                if (!Number.isInteger(deathYear) || !window.isValidYear(deathYear)) {
                    throw new Error('Please enter a valid death year.');
                }

                var deathData = {
                    deathYear: deathYear,
                    deathCause: cause,
                    deathCauseDetail: detail,
                    deathNotes: notesInput.value || ''
                };

                var result = CL.killCharacter(characterId, deathData);
                if (!result || result.success !== true) {
                    throw new Error(result && result.reason
                        ? result.reason
                        : 'Failed to record death.');
                }

                if (typeof onSuccess === 'function') {
                    onSuccess(summary.id);
                }
            }
        });

        return { success: true, modal: modal };
    }

    // =========================================================================
    // 4. MURDER MODAL
    // =========================================================================

    /**
     * @param {string} victimId
     * @param {Function} [onSuccess]
     */
    function openMurderModal(victimId, onSuccess) {
        var victim = _readSubject(victimId);
        if (!victim) {
            return { success: false, reason: 'Victim not found or already deceased.' };
        }

        var currentYear = window.getCurrentYear();
        var victimAge = victim.age === null ? 0 : victim.age;

        var content = '<div class="character-modal">';

        content += '<div class="character-modal__section">'
                 + '<strong>Victim: ' + _esc(victim.fullName || victim.name || 'Unnamed') + '</strong>'
                 + '<br>' + _esc(victimAge) + ' years'
                 + (victim.locationId ? ' &middot; ' + _esc(victim.locationId) : '')
                 + '</div>';

        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="murder-killer">Killer</label>'
                 + '<button type="button" class="btn" id="murder-select-killer">'
                 + 'Select Killer</button>'
                 + '<span class="character-modal__parent-name" id="murder-killer-name">None</span>'
                 + '</div>';

        content += '<div class="character-modal__grid">';
        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="murder-age">Age at Murder</label>'
                 + '<input type="number" id="murder-age" class="character-modal__form-input" '
                 + 'value="' + _esc(victimAge) + '" min="0" max="150">'
                 + '</div>';
        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="murder-year">Year of Murder</label>'
                 + '<input type="number" id="murder-year" class="character-modal__form-input" '
                 + 'value="' + _esc(currentYear) + '" '
                 + 'min="' + (victim.birthYear !== null ? victim.birthYear : 1) + '" '
                 + 'max="' + (currentYear + 10) + '">'
                 + '</div>';
        content += '</div>';

        var methodOptions = '';
        for (var m = 0; m < MURDER_METHODS.length; m++) {
            methodOptions += '<option value="' + _esc(MURDER_METHODS[m].id) + '">'
                           + _esc(MURDER_METHODS[m].label)
                           + '</option>';
        }
        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="murder-method">Method</label>'
                 + '<select id="murder-method" class="character-modal__form-input">'
                 + methodOptions
                 + '</select>'
                 + '</div>';

        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="murder-motive">Motive</label>'
                 + '<input type="text" id="murder-motive" class="character-modal__form-input" '
                 + 'value="' + _esc(_pickRandom(MURDER_MOTIVE_SUGGESTIONS) || '') + '" '
                 + 'autocomplete="off">'
                 + '<div id="murder-motive-suggestions" '
                 + 'style="display:flex; flex-wrap:wrap; gap:6px; margin-top:8px;"></div>'
                 + '</div>';

        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="murder-notes">Notes</label>'
                 + '<textarea id="murder-notes" class="character-modal__form-input" rows="2"></textarea>'
                 + '</div>';

        content += '</div>';

        var selectedKillerId = null;
        var selectedKillerName = '';

        var modal = window.openModal({
            titleHtml: 'Murder: ' + _esc(victim.name || ''),
            contentHtml: content,
            confirmText: 'Commit Murder',
            cancelText: 'Cancel',
            onOpen: function (modalElement) {
                _renderSuggestions(
                    'murder-motive-suggestions',
                    MURDER_MOTIVE_SUGGESTIONS,
                    'murder-motive'
                );

                var selectBtn = modalElement.querySelector('#murder-select-killer');
                selectBtn.addEventListener('click', function () {
                    if (typeof window.openCharacterSelector !== 'function') {
                        throw new Error('modals-death.js: character selector not available.');
                    }
                    window.openCharacterSelector({
                        title: 'Select Killer',
                        filters: {
                            status: 'living',
                            showDeceased: false
                        },
                        excludeIds: [victim.id],
                        onSelect: function (selected) {
                            if (!selected || !_hasId(selected.id)) return;
                            selectedKillerId = selected.id;
                            selectedKillerName = selected.name || selected.id;
                            var el = modalElement.querySelector('#murder-killer-name');
                            if (el) el.textContent = selectedKillerName;
                        }
                    });
                });

                _wireAgeYearSync('murder-age', 'murder-year', victim.birthYear);
            },
            onConfirm: function () {
                if (!_hasId(selectedKillerId)) {
                    throw new Error('Please select a killer.');
                }

                var yearInput = modal.element.querySelector('#murder-year');
                var methodSelect = modal.element.querySelector('#murder-method');
                var motiveInput = modal.element.querySelector('#murder-motive');
                var notesInput = modal.element.querySelector('#murder-notes');

                var deathYear = parseInt(yearInput.value, 10);
                if (!Number.isInteger(deathYear) || !window.isValidYear(deathYear)) {
                    throw new Error('Please enter a valid murder year.');
                }

                var method = methodSelect.value;
                var motive = motiveInput.value.trim();

                var deathData = {
                    deathYear: deathYear,
                    deathCause: MR.DEATH_CAUSE.MURDER,
                    deathCauseDetail: method,
                    deathNotes: notesInput.value || '',
                    isMurder: true,
                    killerId: selectedKillerId,
                    murderMotive: motive,
                    murderMethod: method
                };

                var result = CL.killCharacter(victimId, deathData);
                if (!result || result.success !== true) {
                    throw new Error(result && result.reason
                        ? result.reason
                        : 'Failed to record murder.');
                }

                if (typeof onSuccess === 'function') {
                    onSuccess(victim.id);
                }
            }
        });

        return { success: true, modal: modal };
    }

    // =========================================================================
    // 5. EXECUTION MODAL
    // =========================================================================

    /**
     * @param {string} condemnedId
     * @param {Function} [onSuccess]
     */
    function openExecutionModal(condemnedId, onSuccess) {
        var condemned = _readSubject(condemnedId);
        if (!condemned) {
            return { success: false, reason: 'Condemned not found or already deceased.' };
        }

        var currentYear = window.getCurrentYear();
        var condemnedAge = condemned.age === null ? 0 : condemned.age;

        var content = '<div class="character-modal">';

        content += '<div class="character-modal__section">'
                 + '<strong>Condemned: ' + _esc(condemned.fullName || condemned.name || 'Unnamed') + '</strong>'
                 + '<br>' + _esc(condemnedAge) + ' years'
                 + (condemned.locationId ? ' &middot; ' + _esc(condemned.locationId) : '')
                 + '</div>';

        content += '<div class="character-modal__grid">';
        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="execution-age">Age at Execution</label>'
                 + '<input type="number" id="execution-age" class="character-modal__form-input" '
                 + 'value="' + _esc(condemnedAge) + '" min="0" max="150">'
                 + '</div>';
        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="execution-year">Year of Execution</label>'
                 + '<input type="number" id="execution-year" class="character-modal__form-input" '
                 + 'value="' + _esc(currentYear) + '" '
                 + 'min="' + (condemned.birthYear !== null ? condemned.birthYear : 1) + '" '
                 + 'max="' + (currentYear + 10) + '">'
                 + '</div>';
        content += '</div>';

        var methodOptions = '';
        for (var m = 0; m < EXECUTION_METHODS.length; m++) {
            methodOptions += '<option value="' + _esc(EXECUTION_METHODS[m].id) + '">'
                           + _esc(EXECUTION_METHODS[m].label)
                           + '</option>';
        }
        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="execution-method">Method</label>'
                 + '<select id="execution-method" class="character-modal__form-input">'
                 + methodOptions
                 + '</select>'
                 + '</div>';

        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="execution-reason">Reason</label>'
                 + '<input type="text" id="execution-reason" class="character-modal__form-input" '
                 + 'value="' + _esc(_pickRandom(EXECUTION_REASON_SUGGESTIONS) || '') + '" '
                 + 'autocomplete="off">'
                 + '<div id="execution-reason-suggestions" '
                 + 'style="display:flex; flex-wrap:wrap; gap:6px; margin-top:8px;"></div>'
                 + '</div>';

        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="execution-location">Location</label>'
                 + '<input type="text" id="execution-location" class="character-modal__form-input" '
                 + 'placeholder="Town square, Castle courtyard..." autocomplete="off">'
                 + '</div>';

        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="execution-notes">Notes</label>'
                 + '<textarea id="execution-notes" class="character-modal__form-input" rows="2"></textarea>'
                 + '</div>';

        content += '</div>';

        var modal = window.openModal({
            titleHtml: 'Execute: ' + _esc(condemned.name || ''),
            contentHtml: content,
            confirmText: 'Confirm Execution',
            cancelText: 'Grant Mercy',
            onOpen: function (modalElement) {
                _renderSuggestions(
                    'execution-reason-suggestions',
                    EXECUTION_REASON_SUGGESTIONS,
                    'execution-reason'
                );
                _wireAgeYearSync('execution-age', 'execution-year', condemned.birthYear);
            },
            onConfirm: function () {
                var yearInput = modal.element.querySelector('#execution-year');
                var methodSelect = modal.element.querySelector('#execution-method');
                var reasonInput = modal.element.querySelector('#execution-reason');
                var locationInput = modal.element.querySelector('#execution-location');
                var notesInput = modal.element.querySelector('#execution-notes');

                var deathYear = parseInt(yearInput.value, 10);
                if (!Number.isInteger(deathYear) || !window.isValidYear(deathYear)) {
                    throw new Error('Please enter a valid execution year.');
                }

                var reason = reasonInput.value.trim();
                if (!reason) {
                    throw new Error('Please enter a reason for the execution.');
                }

                var deathData = {
                    deathYear: deathYear,
                    deathCause: MR.DEATH_CAUSE.EXECUTION,
                    deathCauseDetail: methodSelect.value,
                    deathNotes: notesInput.value || '',
                    isExecution: true,
                    executionReason: reason,
                    executionMethod: methodSelect.value,
                    executionLocation: locationInput.value.trim()
                };

                var result = CL.killCharacter(condemnedId, deathData);
                if (!result || result.success !== true) {
                    throw new Error(result && result.reason
                        ? result.reason
                        : 'Failed to record execution.');
                }

                if (typeof onSuccess === 'function') {
                    onSuccess(condemned.id);
                }
            }
        });

        return { success: true, modal: modal };
    }

    // =========================================================================
    // 6. EXPORTS
    // =========================================================================

    window.openDeathModal = openDeathModal;
    window.openMurderModal = openMurderModal;
    window.openExecutionModal = openExecutionModal;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            openDeathModal: openDeathModal,
            openMurderModal: openMurderModal,
            openExecutionModal: openExecutionModal
        };
    }
})();
