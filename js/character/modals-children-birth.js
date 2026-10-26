/**
 * =============================================================================
 * STILL WATERS - CHILDREN BIRTH MODALS
 * (js/character/modals-children-birth.js)
 * =============================================================================
 *
 * LOCATION: js/character/modals-children-birth.js
 *
 * Birth-related modals.
 *
 * SCOPE:
 *   - openBirthModal(motherId, fatherId, onSuccess)
 *   - openSurpriseBirthModal(motherId, fatherId, onSuccess)
 *   - openBatchBirthModal(motherId, fatherId, onSuccess)
 *   - openPregnancyAttemptModal(motherId, fatherId, options, onSuccess)
 *       Full pregnancy attempt with random mode and specify-outcome
 *       mode. Handles maternal death through the command layer.
 *
 * DEATH-FLOW HINTS:
 *   When opened from the death modal (options.deathFlow === true),
 *   the modal starts in specify mode with defaultOutcome and
 *   defaultMaternalDeath preselected. The user can still change
 *   either before confirming. The modal does not enforce them; the
 *   caller's intent is reflected, not imposed.
 *
 * RANDOMNESS:
 *   Where this module makes a random decision (surprise-birth count,
 *   pregnancy gender assignment), it routes through window.random()
 *   from randomness.js. Math.random is forbidden. The reason is the
 *   same as everywhere else in the codebase: seeded simulations must
 *   be reproducible, and the only way to guarantee that is for every
 *   random draw to come from the shared stream.
 *
 * OUT OF SCOPE:
 *   - Mortality policy                -> mortality-rules.js
 *   - Persistence                     -> CharacterState / ChildrenState
 *   - Presentation CSS                -> stylesheet
 *   - Modal stack                     -> modals-core.js
 *
 * CONTRACT:
 *   - UI only. Reads via CharacterQueries and ChildrenQueries.
 *     Mutates only via ChildrenCommands.
 *   - Does not read character.relationships. Does not compute fertility
 *     policy. Does not save.
 *   - No fallback for missing dependencies.
 *
 * DEPENDENCIES (REQUIRED):
 *   - formatting.js:        escapeHtml
 *   - icons.js:             Icons
 *   - modals-core.js:       openModal, closeTopModal
 *   - time.js:              getCurrentYear, isValidYear, calculateAge
 *   - randomness.js:        random
 *   - CharacterQueries:     getCharacterSummary
 *   - ChildrenCommands:     recordBirth, recordPregnancyAttempt
 *   - ChildrenQueries:      getPregnanciesForMother
 *   - ChildrenGenerator:    generateBatchBirthData
 *   - ChildrenRules:        FERTILITY_CONSTANTS, PREGNANCY_OUTCOME
 *
 * ICON POLICY: SVG from icons.js. No emojis.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    function _requireDependencies() {
        var required = [
            'escapeHtml',
            'openModal',
            'closeTopModal',
            'getCurrentYear',
            'isValidYear',
            'calculateAge',
            'random'
        ];
        var missing = [];
        for (var i = 0; i < required.length; i++) {
            if (typeof window[required[i]] === 'undefined') {
                missing.push(required[i]);
            }
        }
        if (missing.length > 0) {
            throw new Error(
                'modals-children-birth.js: missing required dependencies: ' +
                missing.join(', ')
            );
        }
        if (typeof window.Icons === 'undefined') {
            throw new Error('modals-children-birth.js: icons.js must load first.');
        }
        if (typeof window.CharacterQueries === 'undefined') {
            throw new Error('modals-children-birth.js: character-queries.js must load first.');
        }
        if (typeof window.ChildrenCommands === 'undefined') {
            throw new Error('modals-children-birth.js: children-commands.js must load first.');
        }
        if (typeof window.ChildrenQueries === 'undefined') {
            throw new Error('modals-children-birth.js: children-queries.js must load first.');
        }
        if (typeof window.ChildrenGenerator === 'undefined') {
            throw new Error('modals-children-birth.js: children-generator.js must load first.');
        }
        if (typeof window.ChildrenRules === 'undefined') {
            throw new Error('modals-children-birth.js: children-rules.js must load first.');
        }
    }

    _requireDependencies();

    var CQ = window.CharacterQueries;
    var ChC = window.ChildrenCommands;
    var ChQ = window.ChildrenQueries;
    var ChG = window.ChildrenGenerator;
    var ChR = window.ChildrenRules;

    // =========================================================================
    // 1. HELPERS
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

    function _readMother(motherId) {
        if (!_hasId(motherId)) return null;
        return CQ.getCharacterSummary(motherId);
    }

    function _readFather(fatherId) {
        if (!_hasId(fatherId)) return null;
        return CQ.getCharacterSummary(fatherId);
    }

    function _fullName(summary) {
        if (!summary) return '';
        return (summary.fullName || summary.name || '').trim();
    }

    function _fertileWindow(motherSummary) {
        if (!motherSummary || typeof motherSummary.birthYear !== 'number') {
            return null;
        }
        var c = ChR.FERTILITY_CONSTANTS || {};
        var minAge = typeof c.MIN_FERTILE_AGE === 'number' ? c.MIN_FERTILE_AGE : 14;
        var maxAge = typeof c.MAX_FERTILE_AGE === 'number' ? c.MAX_FERTILE_AGE : 47;
        var currentYear = window.getCurrentYear();
        var earliest = motherSummary.birthYear + minAge;
        var latest = Math.min(currentYear, motherSummary.birthYear + maxAge);
        if (earliest > latest) return null;
        return { minYear: earliest, maxYear: latest };
    }

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
    // 2. BIRTH MODAL
    // =========================================================================

    function openBirthModal(motherId, fatherId, onSuccess) {
        var mother = _readMother(motherId);
        if (!mother) {
            return { success: false, reason: 'Mother not found.' };
        }
        if (mother.isDeceased === true) {
            return { success: false, reason: 'Mother is deceased.' };
        }

        var father = _readFather(fatherId);
        var window_ = _fertileWindow(mother);
        if (!window_) {
            return {
                success: false,
                reason: 'Mother has no fertile window.'
            };
        }

        var currentYear = window.getCurrentYear();
        var defaultYear = Math.min(currentYear, window_.maxYear);
        var defaultAge = defaultYear - mother.birthYear;

        var content = '<div class="character-modal">';

        content += '<div class="character-modal__section">'
                 + '<strong>Mother: ' + _esc(_fullName(mother)) + '</strong>'
                 + '<br>' + _esc(mother.age === null ? 'Unknown age' : mother.age + ' years')
                 + (father ? '<br>Father: ' + _esc(_fullName(father)) : '')
                 + '</div>';

        content += '<div class="character-modal__grid">';
        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="birth-age">Age at Birth</label>'
                 + '<input type="number" id="birth-age" class="character-modal__form-input" '
                 + 'value="' + _esc(defaultAge) + '" '
                 + 'min="' + (window_.minYear - mother.birthYear) + '" '
                 + 'max="' + (window_.maxYear - mother.birthYear) + '">'
                 + '</div>';
        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="birth-year">Year of Birth</label>'
                 + '<input type="number" id="birth-year" class="character-modal__form-input" '
                 + 'value="' + _esc(defaultYear) + '" '
                 + 'min="' + window_.minYear + '" '
                 + 'max="' + window_.maxYear + '">'
                 + '</div>';
        content += '</div>';

        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="birth-gender">Gender</label>'
                 + '<select id="birth-gender" class="character-modal__form-input">'
                 + '<option value="random">Random</option>'
                 + '<option value="male">Male</option>'
                 + '<option value="female">Female</option>'
                 + '</select>'
                 + '</div>';

        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="birth-name">Name (optional)</label>'
                 + '<input type="text" id="birth-name" class="character-modal__form-input" autocomplete="off">'
                 + '</div>';

        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="birth-surname">Surname (optional)</label>'
                 + '<input type="text" id="birth-surname" class="character-modal__form-input" '
                 + 'placeholder="Defaults to mother\'s surname" autocomplete="off">'
                 + '</div>';

        content += '<div class="character-modal__form-field">'
                 + '<label style="display:flex; align-items:center; gap:8px;">'
                 + '<input type="checkbox" id="birth-stillborn">'
                 + '<span>Stillborn</span>'
                 + '</label>'
                 + '</div>';

        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="birth-notes">Notes</label>'
                 + '<textarea id="birth-notes" class="character-modal__form-input" rows="2"></textarea>'
                 + '</div>';

        content += '</div>';

        var modal = window.openModal({
            titleHtml: 'Record Birth: ' + _esc(mother.name || ''),
            contentHtml: content,
            confirmText: 'Record Birth',
            cancelText: 'Cancel',
            onOpen: function (modalElement) {
                _wireAgeYearSync('birth-age', 'birth-year', mother.birthYear);
            },
            onConfirm: function () {
                var yearInput = modal.element.querySelector('#birth-year');
                var genderInput = modal.element.querySelector('#birth-gender');
                var nameInput = modal.element.querySelector('#birth-name');
                var surnameInput = modal.element.querySelector('#birth-surname');
                var stillbornInput = modal.element.querySelector('#birth-stillborn');
                var notesInput = modal.element.querySelector('#birth-notes');

                var birthYear = parseInt(yearInput.value, 10);
                if (!Number.isInteger(birthYear) || !window.isValidYear(birthYear)) {
                    throw new Error('Please enter a valid birth year.');
                }

                var gender = genderInput.value;
                if (gender !== 'male' && gender !== 'female') gender = null;

                var birthResult = ChC.recordBirth(motherId, father ? father.id : null, birthYear, {
                    gender: gender || undefined,
                    name: nameInput.value.trim() || undefined,
                    surname: surnameInput.value.trim() || undefined,
                    isStillborn: stillbornInput.checked === true,
                    notes: notesInput.value || ''
                });

                if (!birthResult || birthResult.success !== true) {
                    throw new Error(birthResult && birthResult.reason
                        ? birthResult.reason
                        : 'Failed to record birth.');
                }

                if (typeof onSuccess === 'function') {
                    onSuccess(birthResult.childId);
                }
            }
        });

        return { success: true, modal: modal };
    }

    // =========================================================================
    // 3. SURPRISE BIRTH MODAL
    // =========================================================================

    function openSurpriseBirthModal(motherId, fatherId, onSuccess) {
        var mother = _readMother(motherId);
        if (!mother) {
            return { success: false, reason: 'Mother not found.' };
        }
        if (mother.isDeceased === true) {
            return { success: false, reason: 'Mother is deceased.' };
        }

        var father = _readFather(fatherId);
        var window_ = _fertileWindow(mother);
        if (!window_) {
            return { success: false, reason: 'Mother has no fertile window.' };
        }

        // Surprise-birth count comes from the seeded RNG stream so the
        // same seed produces the same surprise.
        var countRoll = window.random();
        var childCount;
        if (countRoll < 0.05) childCount = 4;
        else if (countRoll < 0.15) childCount = 3;
        else if (countRoll < 0.40) childCount = 2;
        else childCount = 1;

        var batchResult = ChG.generateBatchBirthData(
            motherId,
            father ? father.id : null,
            childCount,
            {
                startYear: window_.minYear,
                endYear: window_.maxYear
            }
        );
        if (!batchResult.success) {
            return { success: false, reason: batchResult.reason };
        }

        var proposals = batchResult.proposals;

        var rows = '';
        for (var i = 0; i < proposals.length; i++) {
            var p = proposals[i];
            rows += '<tr>'
                  + '<td>' + _esc(i + 1) + '</td>'
                  + '<td>' + _esc(p.birthYear) + '</td>'
                  + '<td>' + _esc(p.gender) + '</td>'
                  + '<td>' + (p.isStillborn ? 'Stillborn' : 'Live') + '</td>'
                  + '</tr>';
        }

        var content = '<div class="character-modal">';

        content += '<div class="character-modal__section">'
                 + '<strong>Mother: ' + _esc(_fullName(mother)) + '</strong>'
                 + (father ? '<br>Father: ' + _esc(_fullName(father)) : '')
                 + '</div>';

        content += '<div class="character-modal__section">'
                 + 'The simulation proposes <strong>' + _esc(childCount) + '</strong> '
                 + (childCount === 1 ? 'child' : 'children') + '.'
                 + '</div>';

        content += '<table class="character-modal__table" '
                 + 'style="width:100%; font-size:0.75rem; border-collapse:collapse;">'
                 + '<thead><tr>'
                 + '<th style="text-align:left;">#</th>'
                 + '<th style="text-align:left;">Year</th>'
                 + '<th style="text-align:left;">Gender</th>'
                 + '<th style="text-align:left;">Outcome</th>'
                 + '</tr></thead>'
                 + '<tbody>' + rows + '</tbody>'
                 + '</table>';

        content += '</div>';

        var modal = window.openModal({
            titleHtml: 'Surprise Birth: ' + _esc(mother.name || ''),
            contentHtml: content,
            confirmText: 'Confirm Births',
            cancelText: 'Cancel',
            onConfirm: function () {
                var created = [];
                var errors = [];

                for (var i = 0; i < proposals.length; i++) {
                    var p = proposals[i];
                    var result = ChC.recordBirth(
                        p.motherId,
                        p.fatherId,
                        p.birthYear,
                        {
                            gender: p.gender,
                            isStillborn: p.isStillborn,
                            notes: p.notes
                        }
                    );
                    if (result && result.success === true) {
                        created.push(result.childId);
                    } else {
                        errors.push({
                            index: i,
                            reason: result && result.reason ? result.reason : 'unknown'
                        });
                    }
                }

                if (created.length === 0) {
                    throw new Error('Failed to record any births.');
                }

                if (typeof onSuccess === 'function') {
                    onSuccess(created, errors);
                }
            }
        });

        return { success: true, modal: modal, childCount: childCount };
    }

    // =========================================================================
    // 4. BATCH BIRTH MODAL
    // =========================================================================

    function openBatchBirthModal(motherId, fatherId, onSuccess) {
        var mother = _readMother(motherId);
        if (!mother) {
            return { success: false, reason: 'Mother not found.' };
        }
        if (mother.isDeceased === true) {
            return { success: false, reason: 'Mother is deceased.' };
        }

        var father = _readFather(fatherId);
        var window_ = _fertileWindow(mother);
        if (!window_) {
            return { success: false, reason: 'Mother has no fertile window.' };
        }

        var content = '<div class="character-modal">';

        content += '<div class="character-modal__section">'
                 + '<strong>Mother: ' + _esc(_fullName(mother)) + '</strong>'
                 + (father ? '<br>Father: ' + _esc(_fullName(father)) : '')
                 + '</div>';

        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="batch-count">Number of Children</label>'
                 + '<input type="number" id="batch-count" class="character-modal__form-input" '
                 + 'value="2" min="1" max="10">'
                 + '</div>';

        content += '<div class="character-modal__grid">';
        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="batch-start">Start Year</label>'
                 + '<input type="number" id="batch-start" class="character-modal__form-input" '
                 + 'value="' + _esc(window_.minYear) + '" '
                 + 'min="' + window_.minYear + '" max="' + window_.maxYear + '">'
                 + '</div>';
        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="batch-end">End Year</label>'
                 + '<input type="number" id="batch-end" class="character-modal__form-input" '
                 + 'value="' + _esc(window_.maxYear) + '" '
                 + 'min="' + window_.minYear + '" max="' + window_.maxYear + '">'
                 + '</div>';
        content += '</div>';

        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="batch-notes">Notes (optional)</label>'
                 + '<input type="text" id="batch-notes" class="character-modal__form-input" autocomplete="off">'
                 + '</div>';

        content += '</div>';

        var modal = window.openModal({
            titleHtml: 'Add Children: ' + _esc(mother.name || ''),
            contentHtml: content,
            confirmText: 'Generate and Record',
            cancelText: 'Cancel',
            onConfirm: function () {
                var countInput = modal.element.querySelector('#batch-count');
                var startInput = modal.element.querySelector('#batch-start');
                var endInput = modal.element.querySelector('#batch-end');
                var notesInput = modal.element.querySelector('#batch-notes');

                var count = parseInt(countInput.value, 10);
                if (!Number.isInteger(count) || count < 1) {
                    throw new Error('Number of children must be a positive integer.');
                }

                var startYear = parseInt(startInput.value, 10);
                var endYear = parseInt(endInput.value, 10);
                if (!Number.isInteger(startYear) || !window.isValidYear(startYear)) {
                    throw new Error('Please enter a valid start year.');
                }
                if (!Number.isInteger(endYear) || !window.isValidYear(endYear)) {
                    throw new Error('Please enter a valid end year.');
                }
                if (endYear < startYear) {
                    throw new Error('End year must not be before start year.');
                }

                var batchResult = ChG.generateBatchBirthData(
                    motherId,
                    father ? father.id : null,
                    count,
                    {
                        startYear: startYear,
                        endYear: endYear,
                        notes: notesInput.value || ''
                    }
                );
                if (!batchResult.success) {
                    throw new Error(batchResult.reason || 'Failed to generate births.');
                }

                var created = [];
                var errors = [];
                var proposals = batchResult.proposals;

                for (var i = 0; i < proposals.length; i++) {
                    var p = proposals[i];
                    var result = ChC.recordBirth(
                        p.motherId,
                        p.fatherId,
                        p.birthYear,
                        {
                            gender: p.gender,
                            isStillborn: p.isStillborn,
                            notes: p.notes
                        }
                    );
                    if (result && result.success === true) {
                        created.push(result.childId);
                    } else {
                        errors.push({
                            index: i,
                            reason: result && result.reason ? result.reason : 'unknown'
                        });
                    }
                }

                if (created.length === 0) {
                    throw new Error('Failed to record any births.');
                }

                if (typeof onSuccess === 'function') {
                    onSuccess(created, errors);
                }
            }
        });

        return { success: true, modal: modal };
    }

    // =========================================================================
    // 5. PREGNANCY ATTEMPT MODAL
    // =========================================================================

    /**
     * Full pregnancy attempt modal with random and specify-outcome modes.
     *
     * options:
     *   year                  default simulation year
     *   allowMaternalDeath    default true
     *   deathFlow             true when opened from the death modal
     *   defaultOutcome        'live_birth' | 'stillbirth' | 'miscarriage' |
     *                         'no_conception'  (used only when deathFlow)
     *   defaultMaternalDeath  boolean (used only when deathFlow)
     *
     * @param {string} motherId
     * @param {string|null} fatherId
     * @param {Object} [options]
     * @param {Function} [onSuccess]
     */
    function openPregnancyAttemptModal(motherId, fatherId, options, onSuccess) {
        var mother = _readMother(motherId);
        if (!mother) {
            return { success: false, reason: 'Mother not found.' };
        }
        if (mother.isDeceased === true) {
            return { success: false, reason: 'Mother is deceased.' };
        }

        var father = _readFather(fatherId);
        if (_hasId(fatherId) && !father) {
            return { success: false, reason: 'Father not found.' };
        }
        if (father && father.isDeceased === true) {
            return { success: false, reason: 'Father is deceased.' };
        }

        var window_ = _fertileWindow(mother);
        if (!window_) {
            return { success: false, reason: 'Mother has no fertile window.' };
        }

        if (_isMissing(options)) options = {};
        var allowMaternalDeath = options.allowMaternalDeath !== false;
        var defaultYear = typeof options.year === 'number'
            ? options.year
            : Math.min(window.getCurrentYear(), window_.maxYear);

        // Death-flow hints.
        var deathFlow = options.deathFlow === true;
        var defaultOutcome = typeof options.defaultOutcome === 'string'
            && ['live_birth', 'stillbirth', 'miscarriage', 'no_conception'].indexOf(options.defaultOutcome) !== -1
            ? options.defaultOutcome
            : 'live_birth';
        var defaultMaternalDeath = options.defaultMaternalDeath === true;

        // Mode: 'random' or 'specify'. Death flow starts in specify.
        var mode = deathFlow ? 'specify' : 'random';

        var content = '<div class="character-modal">';

        content += '<div class="character-modal__section">'
                 + '<strong>Mother: ' + _esc(_fullName(mother)) + '</strong>'
                 + '<br>' + _esc(mother.age === null ? 'Unknown age' : mother.age + ' years')
                 + (father ? '<br>Father: ' + _esc(_fullName(father)) : '')
                 + '</div>';

        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="preg-year">Year</label>'
                 + '<input type="number" id="preg-year" class="character-modal__form-input" '
                 + 'value="' + _esc(defaultYear) + '" '
                 + 'min="' + window_.minYear + '" '
                 + 'max="' + window_.maxYear + '">'
                 + '</div>';

        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label">Mode</label>'
                 + '<label style="display:flex; align-items:center; gap:8px;">'
                 + '<input type="radio" name="preg-mode" value="random"' + (mode === 'random' ? ' checked' : '') + '>'
                 + '<span>Simulate (roll the dice)</span>'
                 + '</label>'
                 + '<label style="display:flex; align-items:center; gap:8px;">'
                 + '<input type="radio" name="preg-mode" value="specify"' + (mode === 'specify' ? ' checked' : '') + '>'
                 + '<span>Specify outcome</span>'
                 + '</label>'
                 + '</div>';

        var randomDisplay = mode === 'random' ? '' : 'display:none;';
        var specifyDisplay = mode === 'specify' ? '' : 'display:none;';

        content += '<div id="preg-random-section" style="' + randomDisplay + '">';

        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="preg-attempt">'
                 + 'Attempt Number (for spacing context)</label>'
                 + '<input type="number" id="preg-attempt" class="character-modal__form-input" '
                 + 'value="0" min="0">'
                 + '</div>';

        content += '<div class="character-modal__form-field">'
                 + '<label style="display:flex; align-items:center; gap:8px;">'
                 + '<input type="checkbox" id="preg-force-conception">'
                 + '<span>Force conception</span>'
                 + '</label>'
                 + '</div>';

        content += '<div class="character-modal__form-field">'
                 + '<label style="display:flex; align-items:center; gap:8px;">'
                 + '<input type="checkbox" id="preg-force-single">'
                 + '<span>Force single birth (no twins/triplets)</span>'
                 + '</label>'
                 + '</div>';

        content += '</div>';

        content += '<div id="preg-specify-section" style="' + specifyDisplay + '">';

        // Outcome select, with defaultOutcome preselected.
        var outcomeOptions = [
            { id: 'live_birth', label: 'Live Birth' },
            { id: 'stillbirth', label: 'Stillbirth' },
            { id: 'miscarriage', label: 'Miscarriage' },
            { id: 'no_conception', label: 'No Conception' }
        ];
        var outcomeSelectHtml = '';
        for (var i = 0; i < outcomeOptions.length; i++) {
            var sel = outcomeOptions[i].id === defaultOutcome ? ' selected' : '';
            outcomeSelectHtml += '<option value="' + _esc(outcomeOptions[i].id) + '"'
                               + sel + '>'
                               + _esc(outcomeOptions[i].label)
                               + '</option>';
        }

        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="preg-outcome">Outcome</label>'
                 + '<select id="preg-outcome" class="character-modal__form-input">'
                 + outcomeSelectHtml
                 + '</select>'
                 + '</div>';

        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="preg-fetus-count">'
                 + 'Number of Children</label>'
                 + '<input type="number" id="preg-fetus-count" class="character-modal__form-input" '
                 + 'value="1" min="1" max="3">'
                 + '</div>';

        content += '<div class="character-modal__form-field">'
                 + '<label style="display:flex; align-items:center; gap:8px;">'
                 + '<input type="checkbox" id="preg-complications">'
                 + '<span>Pregnancy had complications</span>'
                 + '</label>'
                 + '</div>';

        if (allowMaternalDeath) {
            var maternalDeathChecked = defaultMaternalDeath ? ' checked' : '';
            content += '<div class="character-modal__form-field">'
                     + '<label style="display:flex; align-items:center; gap:8px;">'
                     + '<input type="checkbox" id="preg-maternal-death"' + maternalDeathChecked + '>'
                     + '<span>Mother died in childbirth (childbed fever)</span>'
                     + '</label>'
                     + '</div>';
        }

        content += '</div>';

        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="preg-notes">Notes</label>'
                 + '<textarea id="preg-notes" class="character-modal__form-input" rows="2"></textarea>'
                 + '</div>';

        content += '</div>';

        var modal = window.openModal({
            titleHtml: (deathFlow ? 'Childbed Fever: ' : 'Pregnancy Attempt: ')
                     + _esc(mother.name || ''),
            contentHtml: content,
            confirmText: 'Attempt',
            cancelText: 'Cancel',
            onOpen: function (modalElement) {
                var randomSection = modalElement.querySelector('#preg-random-section');
                var specifySection = modalElement.querySelector('#preg-specify-section');
                var radios = modalElement.querySelectorAll('input[name="preg-mode"]');

                function applyMode() {
                    if (mode === 'random') {
                        randomSection.style.display = '';
                        specifySection.style.display = 'none';
                    } else {
                        randomSection.style.display = 'none';
                        specifySection.style.display = '';
                    }
                }

                for (var i = 0; i < radios.length; i++) {
                    (function (radio) {
                        radio.addEventListener('change', function () {
                            if (radio.checked) {
                                mode = radio.value;
                                applyMode();
                            }
                        });
                    })(radios[i]);
                }

                applyMode();
            },
            onConfirm: function () {
                var yearInput = modal.element.querySelector('#preg-year');
                var notesInput = modal.element.querySelector('#preg-notes');
                var year = parseInt(yearInput.value, 10);

                if (!Number.isInteger(year) || !window.isValidYear(year)) {
                    throw new Error('Please enter a valid year.');
                }

                var commandOptions = {
                    year: year,
                    notes: notesInput.value || ''
                };

                if (mode === 'random') {
                    var attemptInput = modal.element.querySelector('#preg-attempt');
                    var forceConception = modal.element.querySelector('#preg-force-conception');
                    var forceSingle = modal.element.querySelector('#preg-force-single');

                    commandOptions.attemptNumber = parseInt(attemptInput.value, 10) || 0;
                    if (forceConception.checked) commandOptions.forceConception = true;
                    if (forceSingle.checked) commandOptions.forceSingle = true;
                } else {
                    var outcomeSelect = modal.element.querySelector('#preg-outcome');
                    var fetusInput = modal.element.querySelector('#preg-fetus-count');
                    var complicationsInput = modal.element.querySelector('#preg-complications');
                    var maternalDeathInput = modal.element.querySelector('#preg-maternal-death');

                    commandOptions.outcome = outcomeSelect.value;
                    commandOptions.fetusCount = parseInt(fetusInput.value, 10) || 1;
                    commandOptions.isMultiple = commandOptions.fetusCount > 1;
                    commandOptions.hasComplications = complicationsInput.checked === true;
                    commandOptions.maternalDeath = maternalDeathInput
                        && maternalDeathInput.checked === true;
                }

                var result = ChC.recordPregnancyAttempt(
                    motherId,
                    father ? father.id : null,
                    commandOptions
                );

                if (!result || result.success !== true) {
                    throw new Error(result && result.reason
                        ? result.reason
                        : 'Failed to record pregnancy attempt.');
                }

                if (typeof onSuccess === 'function') {
                    onSuccess(result);
                }
            }
        });

        return { success: true, modal: modal };
    }

    // =========================================================================
    // 6. EXPORTS
    // =========================================================================

    window.openBirthModal = openBirthModal;
    window.openSurpriseBirthModal = openSurpriseBirthModal;
    window.openBatchBirthModal = openBatchBirthModal;
    window.openPregnancyAttemptModal = openPregnancyAttemptModal;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            openBirthModal: openBirthModal,
            openSurpriseBirthModal: openSurpriseBirthModal,
            openBatchBirthModal: openBatchBirthModal,
            openPregnancyAttemptModal: openPregnancyAttemptModal
        };
    }
})();
