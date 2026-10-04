/**
 * =============================================================================
 * STILL WATERS - CHILDREN BIRTH MODALS (js/character/modals-children-birth.js)
 * =============================================================================
 *
 * Birth-related modals.
 *
 * SCOPE:
 *   - openBirthModal(motherId, fatherId, onSuccess)
 *       Record a single live birth or stillbirth.
 *   - openSurpriseBirthModal(motherId, fatherId, onSuccess)
 *       Roll a random birth event (1–4 children) and commit it.
 *   - openBatchBirthModal(motherId, fatherId, onSuccess)
 *       Add several children within the mother's fertile window.
 *
 * OUT OF SCOPE:
 *   - Childbirth death                -> CharacterLifecycle
 *   - Pregnancy attempt simulation    -> ChildrenCommands.recordPregnancyAttempt
 *                                        (this module uses recordBirth directly;
 *                                         pregnancy simulation is not exposed
 *                                         through a modal at this stage)
 *   - Mortality policy                -> MortalityRules
 *   - Persistence                     -> CharacterState / ChildrenState
 *   - Presentation CSS                -> stylesheet
 *   - Modal stack                     -> modals-core.js
 *
 * CONTRACT:
 *   - UI only. Reads via CharacterQueries and ChildrenQueries. Mutates
 *     only via ChildrenCommands (recordBirth).
 *   - Does not read character.relationships. Does not compute fertility
 *     policy. Does not save. Does not invalidate caches.
 *   - No fallback for missing dependencies. Missing openModal,
 *     CharacterQueries, ChildrenCommands, ChildrenGenerator, or
 *     ChildrenRules throws at load.
 *   - Character ids, not character objects, are the modal arguments.
 *
 * DEPENDENCIES (REQUIRED):
 *   - formatting.js:             escapeHtml
 *   - icons.js:                  Icons
 *   - modals-core.js:            openModal, closeTopModal
 *   - time.js:                   getCurrentYear, isValidYear, calculateAge
 *   - CharacterQueries:          getCharacterSummary
 *   - ChildrenCommands:          recordBirth
 *   - ChildrenQueries:           getPregnanciesForMother
 *   - ChildrenGenerator:         generateBatchBirthData
 *   - ChildrenRules:             FERTILITY_CONSTANTS
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

    /**
     * @param {string} motherId
     * @param {string|null} fatherId
     * @param {Function} [onSuccess]
     */
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

    /**
     * Rolls a random number of children (1–4) within the mother's
     * fertile window and commits them all in one submission.
     *
     * @param {string} motherId
     * @param {string|null} fatherId
     * @param {Function} [onSuccess]
     */
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

        // Roll the count now, so it can be displayed in the modal.
        var countRoll = Math.random();
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

    /**
     * Adds several children within a specified window.
     *
     * @param {string} motherId
     * @param {string|null} fatherId
     * @param {Function} [onSuccess]
     */
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
    // 5. EXPORTS
    // =========================================================================

    window.openBirthModal = openBirthModal;
    window.openSurpriseBirthModal = openSurpriseBirthModal;
    window.openBatchBirthModal = openBatchBirthModal;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            openBirthModal: openBirthModal,
            openSurpriseBirthModal: openSurpriseBirthModal,
            openBatchBirthModal: openBatchBirthModal
        };
    }
})();
