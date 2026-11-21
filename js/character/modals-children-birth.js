/**
 * =============================================================================
 * STILL WATERS - CHILDREN BIRTH MODALS
 * (js/character/modals-children-birth.js)
 * =============================================================================
 *
 * LOCATION: js/character/modals-children-birth.js
 *
 * SCOPE:
 *   Birth flow (existing, unchanged):
 *     - openBirthModal(motherId, fatherId, onSuccess)
 *     - openSurpriseBirthModal(motherId, fatherId, onSuccess)
 *     - openBatchBirthModal(motherId, fatherId, onSuccess)
 *     - openPregnancyAttemptModal(motherId, fatherId, options, onSuccess)
 *
 *   Biological parentage (family-tab bridges):
 *     - openSetParentModal(childId, role, onSuccess)
 *     - openAddExistingBiologicalChildModal(parentId, onSuccess)
 *     - openAddExistingBiologicalSiblingModal(childId, onSuccess)
 *     - openGenerateBabyModal(parentId, onSuccess, options)
 *
 * 13-YEAR MINIMUM AGE DIFFERENCE
 *   Every parent/child picker enforces a hardcoded 13-year minimum
 *   age difference. Candidates who would violate it are filtered out
 *   of the list. The rule is enforced at the picker layer.
 *
 * PICKER CONTRACT
 *   _openInlineCharacterPicker accepts filterFn, excludeIds, gender,
 *   and referenceYear/referenceFrame for the age indication. Age is
 *   computed from birthYear at the current year. Candidates sorted
 *   by birthYear ascending. Gender rendered as SVG icon.
 *
 * RANDOM NAME BUTTON (openBirthModal only)
 *   Two "Random" buttons in the birth modal — one next to Name, one
 *   next to Surname. Both resolve the culture from the mother (or
 *   father if no mother), filter by the selected gender, and call
 *   NameQueries.getRandomName / getRandomSurname. Buttons render
 *   disabled with explanatory tooltips when NameQueries is not
 *   loaded or when no culture can be resolved.
 *
 * RANDOMNESS
 *   Surprise-birth count and gender assignment route through
 *   window.random() from randomness.js. Random name selection routes
 *   through NameQueries, which itself uses pickRandom from
 *   randomness.js.
 *
 * DEPENDENCIES (REQUIRED):
 *   - formatting.js:        escapeHtml
 *   - icons.js:             Icons
 *   - modals-core.js:       openModal, closeTopModal
 *   - time.js:              getCurrentYear, isValidYear, calculateAge
 *   - randomness.js:        random
 *   - CharacterQueries:     getCharacterSummary, getAllCharacters
 *   - ChildrenCommands:     recordBirth, recordPregnancyAttempt
 *   - ChildrenQueries:      getPregnanciesForMother
 *   - ChildrenGenerator:    generateBatchBirthData
 *   - ChildrenRules:        FERTILITY_CONSTANTS, PREGNANCY_OUTCOME
 *
 * DEPENDENCIES (OPTIONAL):
 *   - FamilyCommands, FamilyQueries (for the bridge functions)
 *   - NameQueries (for the Random buttons; guarded at call time)
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - Consolidated file: all birth-flow and bridge functions in one
 *       place, no "copy from existing" omissions.
 *     - Added Random buttons to openBirthModal (Name and Surname
 *       fields). Buttons resolve culture from the mother (falling
 *       back to father), filter by the selected gender, and call
 *       NameQueries. Disabled with tooltip when NameQueries is
 *       missing or no culture can be resolved.
 *     - Family-tab bridges: 13-year age filter, sorted picker,
 *       gender icons, cross-domain exclusion, age indication.
 * =============================================================================
 */

(function () {
    'use strict';

    function _requireDependencies() {
        var required = [
            'escapeHtml', 'openModal', 'closeTopModal',
            'getCurrentYear', 'isValidYear', 'calculateAge', 'random'
        ];
        var missing = [];
        for (var i = 0; i < required.length; i++) {
            if (typeof window[required[i]] === 'undefined') missing.push(required[i]);
        }
        if (missing.length > 0) {
            throw new Error('modals-children-birth.js: missing required dependencies: ' + missing.join(', '));
        }
        if (typeof window.Icons === 'undefined') throw new Error('modals-children-birth.js: icons.js must load first.');
        if (typeof window.CharacterQueries === 'undefined') throw new Error('modals-children-birth.js: character-queries.js must load first.');
        if (typeof window.ChildrenCommands === 'undefined') throw new Error('modals-children-birth.js: children-commands.js must load first.');
        if (typeof window.ChildrenQueries === 'undefined') throw new Error('modals-children-birth.js: children-queries.js must load first.');
        if (typeof window.ChildrenGenerator === 'undefined') throw new Error('modals-children-birth.js: children-generator.js must load first.');
        if (typeof window.ChildrenRules === 'undefined') throw new Error('modals-children-birth.js: children-rules.js must load first.');
    }

    _requireDependencies();

    var CQ = window.CharacterQueries;
    var ChC = window.ChildrenCommands;
    var ChQ = window.ChildrenQueries;
    var ChG = window.ChildrenGenerator;
    var ChR = window.ChildrenRules;

    function _esc(v) { return window.escapeHtml(v); }
    function _hasId(v) { return typeof v === 'string' && v.length > 0; }
    function _isMissing(v) { return v === undefined || v === null; }
    function _icon(name) { return window.Icons[name] || ''; }

    function _showToast(msg, type) {
        if (typeof window.showToast === 'function') {
            try { window.showToast(msg, type || 'info'); } catch (e) { /* non-fatal */ }
        } else if (typeof console !== 'undefined' && console.warn) {
            console.warn('[birth-modal] ' + (type || 'info') + ': ' + msg);
        }
    }

    function _readMother(id) { return _hasId(id) ? CQ.getCharacterSummary(id) : null; }
    function _readFather(id) { return _hasId(id) ? CQ.getCharacterSummary(id) : null; }
    function _fullName(s) { return s ? (s.fullName || s.name || '').trim() : ''; }

    function _computeAge(birthYear, isDeceased, deathYear) {
        if (typeof birthYear !== 'number') return null;
        var now = window.getCurrentYear();
        var endYear = (isDeceased === true && typeof deathYear === 'number') ? deathYear : now;
        var age = endYear - birthYear;
        return age < 0 ? 0 : age;
    }

    function _genderSvg(gender) {
        if (gender === 'male') return _icon('MALE');
        if (gender === 'female') return _icon('FEMALE');
        return _icon('GENDER_NEUTRAL');
    }

    var MIN_PARENT_CHILD_AGE_GAP = 13;

    function _fertileWindow(m) {
        if (!m || typeof m.birthYear !== 'number') return null;
        var c = ChR.FERTILITY_CONSTANTS || {};
        var minAge = typeof c.MIN_FERTILE_AGE === 'number' ? c.MIN_FERTILE_AGE : 14;
        var maxAge = typeof c.MAX_FERTILE_AGE === 'number' ? c.MAX_FERTILE_AGE : 47;
        var currentYear = window.getCurrentYear();
        var earliest = m.birthYear + minAge;
        var latest = Math.min(currentYear, m.birthYear + maxAge);
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
            if (Number.isInteger(age) && age >= 0) yearEl.value = String(birthYear + age);
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
    // RANDOM NAME HELPERS
    // =========================================================================

    function _resolveCultureForBirth(motherSummary, fatherSummary) {
        if (!window.NameQueries
            || typeof window.NameQueries.getCharacterCultureId !== 'function') {
            return null;
        }
        if (motherSummary && _hasId(motherSummary.id)) {
            var c = window.NameQueries.getCharacterCultureId(motherSummary.id);
            if (c) return c;
        }
        if (fatherSummary && _hasId(fatherSummary.id)) {
            var f = window.NameQueries.getCharacterCultureId(fatherSummary.id);
            if (f) return f;
        }
        return null;
    }

    // =========================================================================
    // INLINE CHARACTER PICKER
    // =========================================================================

    function _openInlineCharacterPicker(title, pickerOpts, onSelect) {
        pickerOpts = pickerOpts || {};
        var excludeIds = Array.isArray(pickerOpts.excludeIds) ? pickerOpts.excludeIds : [];
        var genderFilter = pickerOpts.gender || null;
        var filterFn = pickerOpts.filterFn || null;
        var referenceYear = (typeof pickerOpts.referenceYear === 'number') ? pickerOpts.referenceYear : null;
        var referenceLabel = pickerOpts.referenceLabel || null;
        var referenceFrame = pickerOpts.referenceFrame || null;

        var listId = 'birth-pick-list';
        var searchId = 'birth-pick-search';

        var content = '<div class="character-modal">'
            + '<input type="search" id="' + searchId + '" '
            + 'class="character-modal__form-input" '
            + 'placeholder="Search characters…" autocomplete="off">'
            + '<div id="' + listId + '" class="character-tab-history" '
            + 'style="max-height:300px;overflow-y:auto;margin-top:8px;"></div>'
            + '</div>';

        var selectedId = null;

        var modal = window.openModal({
            titleHtml: title,
            contentHtml: content,
            confirmText: 'Select',
            cancelText: 'Cancel',
            onOpen: function (modalElement) {
                var listEl = modalElement.querySelector('#' + listId);
                var searchEl = modalElement.querySelector('#' + searchId);

                function render(query) {
                    var all = CQ.getAllCharacters() || [];
                    var lower = (query || '').toLowerCase().trim();

                    var candidates = [];
                    for (var i = 0; i < all.length; i++) {
                        var c = all[i];
                        if (!c || !_hasId(c.id)) continue;
                        if (c.isDeceased === true) continue;
                        if (excludeIds.indexOf(c.id) !== -1) continue;
                        if (genderFilter && c.gender !== genderFilter) continue;

                        var summary = null;
                        try { summary = CQ.getCharacterSummary(c.id); } catch (e) { summary = null; }
                        if (!summary) continue;

                        if (typeof filterFn === 'function') {
                            try { if (filterFn(summary) !== true) continue; } catch (e) { continue; }
                        }
                        candidates.push(summary);
                    }

                    candidates.sort(function (a, b) {
                        var ay = (typeof a.birthYear === 'number') ? a.birthYear : Infinity;
                        var by = (typeof b.birthYear === 'number') ? b.birthYear : Infinity;
                        if (ay !== by) return ay - by;
                        var an = ((a.name || '') + ' ' + (a.surname || '')).trim();
                        var bn = ((b.name || '') + ' ' + (b.surname || '')).trim();
                        return an.localeCompare(bn);
                    });

                    var html = '';
                    for (var j = 0; j < candidates.length; j++) {
                        var s = candidates[j];
                        var name = ((s.name || '') + ' ' + (s.surname || '')).trim();
                        if (lower.length > 0 && name.toLowerCase().indexOf(lower) === -1) continue;

                        var age = _computeAge(s.birthYear, s.isDeceased, s.deathYear);
                        var ageText = (age !== null) ? age + 'y' : '?y';

                        var ageHint = '';
                        if (referenceYear !== null && typeof s.birthYear === 'number' && referenceLabel) {
                            var hypo;
                            if (referenceFrame === 'parent') hypo = referenceYear - s.birthYear;
                            else if (referenceFrame === 'child') hypo = s.birthYear - referenceYear;
                            if (typeof hypo === 'number' && hypo >= 0) {
                                ageHint = ' · ' + referenceLabel + ' ' + hypo + 'y';
                            }
                        }

                        var genderIcon = _genderSvg(s.gender);

                        html += '<div class="character-tab-history__row" '
                            + 'data-character-id="' + _esc(s.id) + '" '
                            + 'style="cursor:pointer;">'
                            + '<div class="character-tab-history__main" style="display:flex;align-items:center;gap:8px;">'
                            + '<span class="character-row__gender">' + genderIcon + '</span>'
                            + '<span class="character-tab-history__value">' + _esc(name || s.id) + '</span>'
                            + '<span class="character-tab-history__reason">' + _esc(ageText + ageHint) + '</span>'
                            + '</div>'
                            + '</div>';
                    }

                    if (html === '') html = '<div class="character-tab-empty">No matches</div>';
                    listEl.innerHTML = html;
                }

                if (searchEl) searchEl.addEventListener('input', function () { render(searchEl.value); });
                render('');

                listEl.addEventListener('click', function (e) {
                    var row = e.target.closest('[data-character-id]');
                    if (!row) return;
                    var rows = listEl.querySelectorAll('.character-tab-history__row');
                    for (var i = 0; i < rows.length; i++) rows[i].classList.remove('is-current');
                    row.classList.add('is-current');
                    selectedId = row.getAttribute('data-character-id');
                });
            },
            onConfirm: function () {
                if (!selectedId) throw new Error('Please select a character.');
                var summary = CQ.getCharacterSummary(selectedId);
                if (typeof onSelect === 'function') onSelect(summary);
            }
        });

        return modal;
    }

    // =========================================================================
    // BIRTH MODAL (with Random buttons)
    // =========================================================================

    function openBirthModal(motherId, fatherId, onSuccess) {
        var mother = _readMother(motherId);
        if (!mother) return { success: false, reason: 'Mother not found.' };
        if (mother.isDeceased === true) return { success: false, reason: 'Mother is deceased.' };

        var father = _readFather(fatherId);
        var win_ = _fertileWindow(mother);
        if (!win_) return { success: false, reason: 'Mother has no fertile window.' };

        var currentYear = window.getCurrentYear();
        var defaultYear = Math.min(currentYear, win_.maxYear);
        var defaultAge = defaultYear - mother.birthYear;

        // Random-name availability
        var nameQueriesReady = !!(window.NameQueries
            && typeof window.NameQueries.getRandomName === 'function'
            && typeof window.NameQueries.getRandomSurname === 'function');
        var cultureId = nameQueriesReady ? _resolveCultureForBirth(mother, father) : null;
        var nameBtnDisabled = !nameQueriesReady || !cultureId;
        var nameBtnDisabledTitle = !nameQueriesReady
            ? 'Name subsystem is not loaded'
            : (!cultureId ? 'No culture could be resolved for the mother or father' : null);

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
                 + 'min="' + (win_.minYear - mother.birthYear) + '" '
                 + 'max="' + (win_.maxYear - mother.birthYear) + '">'
                 + '</div>';
        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="birth-year">Year of Birth</label>'
                 + '<input type="number" id="birth-year" class="character-modal__form-input" '
                 + 'value="' + _esc(defaultYear) + '" '
                 + 'min="' + win_.minYear + '" max="' + win_.maxYear + '">'
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

        // Name field with Random button
        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="birth-name">Name (optional)</label>'
                 + '<div style="display:flex;gap:6px;align-items:center;">'
                 + '<input type="text" id="birth-name" class="character-modal__form-input" '
                 + 'style="flex:1;" autocomplete="off">'
                 + '<button type="button" id="birth-name-random" class="btn" '
                 + 'style="white-space:nowrap;"'
                 + (nameBtnDisabled ? ' disabled title="' + _esc(nameBtnDisabledTitle) + '"' : '')
                 + '>Random</button>'
                 + '</div>'
                 + '</div>';

        // Surname field with Random button
        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="birth-surname">Surname (optional)</label>'
                 + '<div style="display:flex;gap:6px;align-items:center;">'
                 + '<input type="text" id="birth-surname" class="character-modal__form-input" '
                 + 'style="flex:1;" placeholder="Defaults to mother\'s surname" autocomplete="off">'
                 + '<button type="button" id="birth-surname-random" class="btn" '
                 + 'style="white-space:nowrap;"'
                 + (nameBtnDisabled ? ' disabled title="' + _esc(nameBtnDisabledTitle) + '"' : '')
                 + '>Random</button>'
                 + '</div>'
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

                var nameInput = modalElement.querySelector('#birth-name');
                var surnameInput = modalElement.querySelector('#birth-surname');
                var genderSelect = modalElement.querySelector('#birth-gender');
                var nameRandomBtn = modalElement.querySelector('#birth-name-random');
                var surnameRandomBtn = modalElement.querySelector('#birth-surname-random');

                if (nameRandomBtn && !nameRandomBtn.disabled) {
                    nameRandomBtn.addEventListener('click', function () {
                        if (!cultureId) return;
                        var g = genderSelect.value;
                        var genderArg = (g === 'male' || g === 'female') ? g : 'all';
                        var chosen;
                        try {
                            chosen = window.NameQueries.getRandomName(cultureId, genderArg);
                        } catch (e) {
                            _showToast('Failed to pick a random name: ' + (e.message || 'unknown'), 'error');
                            return;
                        }
                        if (!chosen) {
                            _showToast('No names configured for this culture.', 'info');
                            return;
                        }
                        if (nameInput) nameInput.value = chosen;
                    });
                }

                if (surnameRandomBtn && !surnameRandomBtn.disabled) {
                    surnameRandomBtn.addEventListener('click', function () {
                        if (!cultureId) return;
                        var chosen;
                        try {
                            chosen = window.NameQueries.getRandomSurname(cultureId);
                        } catch (e) {
                            _showToast('Failed to pick a random surname: ' + (e.message || 'unknown'), 'error');
                            return;
                        }
                        if (!chosen) {
                            _showToast('No surnames configured for this culture.', 'info');
                            return;
                        }
                        if (surnameInput) surnameInput.value = chosen;
                    });
                }
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
                        ? birthResult.reason : 'Failed to record birth.');
                }

                if (typeof onSuccess === 'function') onSuccess(birthResult.childId);
            }
        });

        return { success: true, modal: modal };
    }

    // =========================================================================
    // SURPRISE BIRTH MODAL
    // =========================================================================

    function openSurpriseBirthModal(motherId, fatherId, onSuccess) {
        var mother = _readMother(motherId);
        if (!mother) return { success: false, reason: 'Mother not found.' };
        if (mother.isDeceased === true) return { success: false, reason: 'Mother is deceased.' };

        var father = _readFather(fatherId);
        var win_ = _fertileWindow(mother);
        if (!win_) return { success: false, reason: 'Mother has no fertile window.' };

        var countRoll = window.random();
        var childCount;
        if (countRoll < 0.05) childCount = 4;
        else if (countRoll < 0.15) childCount = 3;
        else if (countRoll < 0.40) childCount = 2;
        else childCount = 1;

        var batchResult = ChG.generateBatchBirthData(
            motherId, father ? father.id : null, childCount,
            { startYear: win_.minYear, endYear: win_.maxYear });
        if (!batchResult.success) return { success: false, reason: batchResult.reason };

        var proposals = batchResult.proposals;
        var rows = '';
        for (var i = 0; i < proposals.length; i++) {
            var p = proposals[i];
            rows += '<tr><td>' + _esc(i + 1) + '</td><td>' + _esc(p.birthYear) + '</td>'
                  + '<td>' + _esc(p.gender) + '</td>'
                  + '<td>' + (p.isStillborn ? 'Stillborn' : 'Live') + '</td></tr>';
        }

        var content = '<div class="character-modal">';
        content += '<div class="character-modal__section">'
                 + '<strong>Mother: ' + _esc(_fullName(mother)) + '</strong>'
                 + (father ? '<br>Father: ' + _esc(_fullName(father)) : '')
                 + '</div>';
        content += '<div class="character-modal__section">'
                 + 'The simulation proposes <strong>' + _esc(childCount) + '</strong> '
                 + (childCount === 1 ? 'child' : 'children') + '.</div>';
        content += '<table class="character-modal__table" '
                 + 'style="width:100%; font-size:0.75rem; border-collapse:collapse;">'
                 + '<thead><tr><th style="text-align:left;">#</th>'
                 + '<th style="text-align:left;">Year</th>'
                 + '<th style="text-align:left;">Gender</th>'
                 + '<th style="text-align:left;">Outcome</th></tr></thead>'
                 + '<tbody>' + rows + '</tbody></table>';
        content += '</div>';

        var modal = window.openModal({
            titleHtml: 'Surprise Birth: ' + _esc(mother.name || ''),
            contentHtml: content,
            confirmText: 'Confirm Births',
            cancelText: 'Cancel',
            onConfirm: function () {
                var created = [], errors = [];
                for (var i = 0; i < proposals.length; i++) {
                    var p = proposals[i];
                    var result = ChC.recordBirth(p.motherId, p.fatherId, p.birthYear, {
                        gender: p.gender, isStillborn: p.isStillborn, notes: p.notes
                    });
                    if (result && result.success === true) created.push(result.childId);
                    else errors.push({ index: i, reason: result && result.reason ? result.reason : 'unknown' });
                }
                if (created.length === 0) throw new Error('Failed to record any births.');
                if (typeof onSuccess === 'function') onSuccess(created, errors);
            }
        });

        return { success: true, modal: modal, childCount: childCount };
    }

    // =========================================================================
    // BATCH BIRTH MODAL
    // =========================================================================

    function openBatchBirthModal(motherId, fatherId, onSuccess) {
        var mother = _readMother(motherId);
        if (!mother) return { success: false, reason: 'Mother not found.' };
        if (mother.isDeceased === true) return { success: false, reason: 'Mother is deceased.' };

        var father = _readFather(fatherId);
        var win_ = _fertileWindow(mother);
        if (!win_) return { success: false, reason: 'Mother has no fertile window.' };

        var content = '<div class="character-modal">';
        content += '<div class="character-modal__section">'
                 + '<strong>Mother: ' + _esc(_fullName(mother)) + '</strong>'
                 + (father ? '<br>Father: ' + _esc(_fullName(father)) : '') + '</div>';
        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="batch-count">Number of Children</label>'
                 + '<input type="number" id="batch-count" class="character-modal__form-input" '
                 + 'value="2" min="1" max="10"></div>';
        content += '<div class="character-modal__grid">'
                 + '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="batch-start">Start Year</label>'
                 + '<input type="number" id="batch-start" class="character-modal__form-input" '
                 + 'value="' + _esc(win_.minYear) + '" '
                 + 'min="' + win_.minYear + '" max="' + win_.maxYear + '"></div>'
                 + '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="batch-end">End Year</label>'
                 + '<input type="number" id="batch-end" class="character-modal__form-input" '
                 + 'value="' + _esc(win_.maxYear) + '" '
                 + 'min="' + win_.minYear + '" max="' + win_.maxYear + '"></div></div>';
        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="batch-notes">Notes (optional)</label>'
                 + '<input type="text" id="batch-notes" class="character-modal__form-input" autocomplete="off"></div>';
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
                if (!Number.isInteger(count) || count < 1) throw new Error('Number of children must be a positive integer.');

                var startYear = parseInt(startInput.value, 10);
                var endYear = parseInt(endInput.value, 10);
                if (!Number.isInteger(startYear) || !window.isValidYear(startYear)) throw new Error('Please enter a valid start year.');
                if (!Number.isInteger(endYear) || !window.isValidYear(endYear)) throw new Error('Please enter a valid end year.');
                if (endYear < startYear) throw new Error('End year must not be before start year.');

                var batchResult = ChG.generateBatchBirthData(
                    motherId, father ? father.id : null, count,
                    { startYear: startYear, endYear: endYear, notes: notesInput.value || '' });
                if (!batchResult.success) throw new Error(batchResult.reason || 'Failed to generate births.');

                var created = [], errors = [];
                var proposals = batchResult.proposals;
                for (var i = 0; i < proposals.length; i++) {
                    var p = proposals[i];
                    var result = ChC.recordBirth(p.motherId, p.fatherId, p.birthYear, {
                        gender: p.gender, isStillborn: p.isStillborn, notes: p.notes
                    });
                    if (result && result.success === true) created.push(result.childId);
                    else errors.push({ index: i, reason: result && result.reason ? result.reason : 'unknown' });
                }
                if (created.length === 0) throw new Error('Failed to record any births.');
                if (typeof onSuccess === 'function') onSuccess(created, errors);
            }
        });

        return { success: true, modal: modal };
    }

    // =========================================================================
    // PREGNANCY ATTEMPT MODAL
    // =========================================================================

    function openPregnancyAttemptModal(motherId, fatherId, options, onSuccess) {
        var mother = _readMother(motherId);
        if (!mother) return { success: false, reason: 'Mother not found.' };
        if (mother.isDeceased === true) return { success: false, reason: 'Mother is deceased.' };

        var father = _readFather(fatherId);
        if (_hasId(fatherId) && !father) return { success: false, reason: 'Father not found.' };
        if (father && father.isDeceased === true) return { success: false, reason: 'Father is deceased.' };

        var win_ = _fertileWindow(mother);
        if (!win_) return { success: false, reason: 'Mother has no fertile window.' };

        if (_isMissing(options)) options = {};
        var allowMaternalDeath = options.allowMaternalDeath !== false;
        var defaultYear = typeof options.year === 'number' ? options.year
            : Math.min(window.getCurrentYear(), win_.maxYear);

        var deathFlow = options.deathFlow === true;
        var defaultOutcome = typeof options.defaultOutcome === 'string'
            && ['live_birth', 'stillbirth', 'miscarriage', 'no_conception'].indexOf(options.defaultOutcome) !== -1
            ? options.defaultOutcome : 'live_birth';
        var defaultMaternalDeath = options.defaultMaternalDeath === true;
        var mode = deathFlow ? 'specify' : 'random';

        var content = '<div class="character-modal">';
        content += '<div class="character-modal__section">'
                 + '<strong>Mother: ' + _esc(_fullName(mother)) + '</strong>'
                 + '<br>' + _esc(mother.age === null ? 'Unknown age' : mother.age + ' years')
                 + (father ? '<br>Father: ' + _esc(_fullName(father)) : '') + '</div>';
        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="preg-year">Year</label>'
                 + '<input type="number" id="preg-year" class="character-modal__form-input" '
                 + 'value="' + _esc(defaultYear) + '" '
                 + 'min="' + win_.minYear + '" max="' + win_.maxYear + '"></div>';
        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label">Mode</label>'
                 + '<label style="display:flex; align-items:center; gap:8px;">'
                 + '<input type="radio" name="preg-mode" value="random"' + (mode === 'random' ? ' checked' : '') + '>'
                 + '<span>Simulate (roll the dice)</span></label>'
                 + '<label style="display:flex; align-items:center; gap:8px;">'
                 + '<input type="radio" name="preg-mode" value="specify"' + (mode === 'specify' ? ' checked' : '') + '>'
                 + '<span>Specify outcome</span></label></div>';

        var randomDisplay = mode === 'random' ? '' : 'display:none;';
        var specifyDisplay = mode === 'specify' ? '' : 'display:none;';

        content += '<div id="preg-random-section" style="' + randomDisplay + '">';
        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="preg-attempt">Attempt Number (for spacing context)</label>'
                 + '<input type="number" id="preg-attempt" class="character-modal__form-input" value="0" min="0"></div>';
        content += '<div class="character-modal__form-field">'
                 + '<label style="display:flex; align-items:center; gap:8px;">'
                 + '<input type="checkbox" id="preg-force-conception">'
                 + '<span>Force conception</span></label></div>';
        content += '<div class="character-modal__form-field">'
                 + '<label style="display:flex; align-items:center; gap:8px;">'
                 + '<input type="checkbox" id="preg-force-single">'
                 + '<span>Force single birth (no twins/triplets)</span></label></div>';
        content += '</div>';

        content += '<div id="preg-specify-section" style="' + specifyDisplay + '">';
        var outcomeOptions = [
            { id: 'live_birth', label: 'Live Birth' },
            { id: 'stillbirth', label: 'Stillbirth' },
            { id: 'miscarriage', label: 'Miscarriage' },
            { id: 'no_conception', label: 'No Conception' }
        ];
        var outcomeSelectHtml = '';
        for (var i = 0; i < outcomeOptions.length; i++) {
            var sel = outcomeOptions[i].id === defaultOutcome ? ' selected' : '';
            outcomeSelectHtml += '<option value="' + _esc(outcomeOptions[i].id) + '"' + sel + '>'
                + _esc(outcomeOptions[i].label) + '</option>';
        }
        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="preg-outcome">Outcome</label>'
                 + '<select id="preg-outcome" class="character-modal__form-input">'
                 + outcomeSelectHtml + '</select></div>';
        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="preg-fetus-count">Number of Children</label>'
                 + '<input type="number" id="preg-fetus-count" class="character-modal__form-input" value="1" min="1" max="3"></div>';
        content += '<div class="character-modal__form-field">'
                 + '<label style="display:flex; align-items:center; gap:8px;">'
                 + '<input type="checkbox" id="preg-complications">'
                 + '<span>Pregnancy had complications</span></label></div>';
        if (allowMaternalDeath) {
            var maternalDeathChecked = defaultMaternalDeath ? ' checked' : '';
            content += '<div class="character-modal__form-field">'
                     + '<label style="display:flex; align-items:center; gap:8px;">'
                     + '<input type="checkbox" id="preg-maternal-death"' + maternalDeathChecked + '>'
                     + '<span>Mother died in childbirth (childbed fever)</span></label></div>';
        }
        content += '</div>';

        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="preg-notes">Notes</label>'
                 + '<textarea id="preg-notes" class="character-modal__form-input" rows="2"></textarea></div>';
        content += '</div>';

        var modal = window.openModal({
            titleHtml: (deathFlow ? 'Childbed Fever: ' : 'Pregnancy Attempt: ') + _esc(mother.name || ''),
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
                            if (radio.checked) { mode = radio.value; applyMode(); }
                        });
                    })(radios[i]);
                }
                applyMode();
            },
            onConfirm: function () {
                var yearInput = modal.element.querySelector('#preg-year');
                var notesInput = modal.element.querySelector('#preg-notes');
                var year = parseInt(yearInput.value, 10);
                if (!Number.isInteger(year) || !window.isValidYear(year)) throw new Error('Please enter a valid year.');

                var commandOptions = { year: year, notes: notesInput.value || '' };

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
                    commandOptions.maternalDeath = maternalDeathInput && maternalDeathInput.checked === true;
                }

                var result = ChC.recordPregnancyAttempt(motherId, father ? father.id : null, commandOptions);
                if (!result || result.success !== true) {
                    throw new Error(result && result.reason ? result.reason : 'Failed to record pregnancy attempt.');
                }
                if (typeof onSuccess === 'function') onSuccess(result);
            }
        });

        return { success: true, modal: modal };
    }

    // =========================================================================
    // FAMILY-TAB BRIDGES
    // =========================================================================

    function openSetParentModal(childId, role, onSuccess) {
        if (!_hasId(childId)) return { success: false, reason: 'childId is required.' };
        if (role !== 'father' && role !== 'mother' && role !== 'parent') {
            return { success: false, reason: 'role must be father, mother, or parent.' };
        }

        var childSummary = CQ.getCharacterSummary(childId);
        if (!childSummary) return { success: false, reason: 'Child not found.' };
        if (typeof childSummary.birthYear !== 'number') {
            _showToast('Child has no birth year; cannot filter by age.', 'error');
            return { success: false, reason: 'Child has no birth year.' };
        }

        var childBirthYear = childSummary.birthYear;
        var genderFilter = role === 'father' ? 'male' : role === 'mother' ? 'female' : null;
        var maxParentBirthYear = childBirthYear - MIN_PARENT_CHILD_AGE_GAP;

        var existingParents = (window.FamilyQueries && typeof window.FamilyQueries.getAllParentIds === 'function')
            ? (window.FamilyQueries.getAllParentIds(childId) || [])
            : [];
        var excludeIds = [childId].concat(existingParents);

        var filterFn = function (c) {
            if (typeof c.birthYear !== 'number') return false;
            return c.birthYear <= maxParentBirthYear;
        };

        return _openInlineCharacterPicker(
            'Set ' + role.charAt(0).toUpperCase() + role.slice(1),
            {
                excludeIds: excludeIds,
                gender: genderFilter,
                filterFn: filterFn,
                referenceYear: childBirthYear,
                referenceLabel: 'at birth',
                referenceFrame: 'parent'
            },
            function (selected) {
                if (!selected || !_hasId(selected.id)) return;
                if (!window.FamilyCommands || typeof window.FamilyCommands.setParent !== 'function') {
                    _showToast('FamilyCommands.setParent is not loaded.', 'error'); return;
                }
                var currentYear = window.getCurrentYear();
                var existing = window.FamilyQueries.getParentsByRole(childId);
                var roleHasParent = false;
                if (role === 'father') roleHasParent = existing.fathers.length > 0;
                else if (role === 'mother') roleHasParent = existing.mothers.length > 0;
                else roleHasParent = existing.others.length > 0;

                var result = window.FamilyCommands.setParent(childId, selected.id, {
                    parentType: 'biological', parentRole: role,
                    startYear: currentYear, allowReplace: roleHasParent
                });
                if (!result || result.success !== true) {
                    _showToast('Failed to set ' + role + ': '
                        + (result && result.reason ? result.reason : 'unknown'), 'error');
                    return;
                }
                _showToast(role.charAt(0).toUpperCase() + role.slice(1) + ' set.', 'success');
                if (typeof onSuccess === 'function') onSuccess(result.data);
            }
        );
    }

    function openAddExistingBiologicalChildModal(parentId, onSuccess) {
        if (!_hasId(parentId)) return { success: false, reason: 'parentId is required.' };

        var parentSummary = CQ.getCharacterSummary(parentId);
        if (!parentSummary) return { success: false, reason: 'Parent not found.' };
        if (typeof parentSummary.birthYear !== 'number') {
            _showToast('Parent has no birth year; cannot filter by age.', 'error');
            return { success: false, reason: 'Parent has no birth year.' };
        }

        var parentBirthYear = parentSummary.birthYear;
        var role = parentSummary.gender === 'male' ? 'father'
            : parentSummary.gender === 'female' ? 'mother' : 'parent';
        var minChildBirthYear = parentBirthYear + MIN_PARENT_CHILD_AGE_GAP;

        var existingChildren = [];
        if (window.FamilyQueries) {
            if (typeof window.FamilyQueries.getBiologicalChildIds === 'function') {
                existingChildren = existingChildren.concat(window.FamilyQueries.getBiologicalChildIds(parentId) || []);
            }
            if (typeof window.FamilyQueries.getLegalChildIds === 'function') {
                existingChildren = existingChildren.concat(window.FamilyQueries.getLegalChildIds(parentId) || []);
            }
        }
        var excludeIds = [parentId].concat(existingChildren);

        var filterFn = function (c) {
            if (typeof c.birthYear !== 'number') return false;
            return c.birthYear >= minChildBirthYear;
        };

        return _openInlineCharacterPicker(
            'Add Biological Child',
            {
                excludeIds: excludeIds,
                filterFn: filterFn,
                referenceYear: parentBirthYear,
                referenceLabel: 'parent was',
                referenceFrame: 'child'
            },
            function (selected) {
                if (!selected || !_hasId(selected.id)) return;
                if (!window.FamilyCommands || typeof window.FamilyCommands.setParent !== 'function') {
                    _showToast('FamilyCommands.setParent is not loaded.', 'error'); return;
                }
                var currentYear = window.getCurrentYear();
                var result = window.FamilyCommands.setParent(selected.id, parentId, {
                    parentType: 'biological', parentRole: role,
                    startYear: currentYear, allowReplace: false
                });
                if (!result || result.success !== true) {
                    _showToast('Failed to add child: '
                        + (result && result.reason ? result.reason : 'unknown'), 'error');
                    return;
                }
                _showToast('Biological child added.', 'success');
                if (typeof onSuccess === 'function') onSuccess(result.data);
            }
        );
    }

    function openAddExistingBiologicalSiblingModal(childId, onSuccess) {
        if (!_hasId(childId)) return { success: false, reason: 'childId is required.' };

        var childSummary = CQ.getCharacterSummary(childId);
        if (!childSummary) return { success: false, reason: 'Character not found.' };

        var bioParents = window.FamilyQueries && typeof window.FamilyQueries.getBiologicalParentIds === 'function'
            ? (window.FamilyQueries.getBiologicalParentIds(childId) || [])
            : [];
        if (bioParents.length === 0) {
            _showToast('This character has no biological parents to share. '
                + 'Add the parents first, then come back.', 'error');
            return { success: false, reason: 'No biological parents.' };
        }

        var siblings = window.FamilyQueries && typeof window.FamilyQueries.getSiblings === 'function'
            ? (window.FamilyQueries.getSiblings(childId) || []).map(function (s) { return s.siblingId; })
            : [];
        var excludeIds = [childId].concat(siblings);

        return _openInlineCharacterPicker(
            'Add Biological Sibling',
            { excludeIds: excludeIds },
            function (selected) {
                if (!selected || !_hasId(selected.id)) return;
                if (!window.FamilyCommands || typeof window.FamilyCommands.setParent !== 'function') {
                    _showToast('FamilyCommands.setParent is not loaded.', 'error'); return;
                }
                var currentYear = window.getCurrentYear();
                var added = 0, errors = [];

                for (var i = 0; i < bioParents.length; i++) {
                    var pid = bioParents[i];
                    var ps = CQ.getCharacterSummary(pid);
                    if (!ps) continue;
                    var r = ps.gender === 'male' ? 'father'
                        : ps.gender === 'female' ? 'mother' : 'parent';
                    var res = window.FamilyCommands.setParent(selected.id, pid, {
                        parentType: 'biological', parentRole: r,
                        startYear: currentYear, allowReplace: false
                    });
                    if (res && res.success === true) added++;
                    else errors.push(pid);
                }

                if (added === 0) {
                    _showToast('Failed to add sibling: no parent edges created.', 'error');
                    return;
                }
                _showToast('Biological sibling added'
                    + (errors.length > 0 ? ' (some parent edges failed)' : '.'),
                    errors.length > 0 ? 'warning' : 'success');
                if (typeof onSuccess === 'function') onSuccess();
            }
        );
    }

    function openGenerateBabyModal(parentId, onSuccess, options) {
        if (!_hasId(parentId)) return { success: false, reason: 'parentId is required.' };
        options = options || {};

        if (typeof window.openBirthModal !== 'function') {
            return { success: false, reason: 'openBirthModal is not available.' };
        }

        var parentSummary = CQ.getCharacterSummary(parentId);
        if (!parentSummary) return { success: false, reason: 'Character not found.' };

        var motherId = null, fatherId = null;
        var partnerId = options.partnerId || null;

        if (parentSummary.gender === 'female') {
            motherId = parentId;
            if (partnerId) fatherId = partnerId;
        } else if (parentSummary.gender === 'male') {
            fatherId = parentId;
            if (partnerId) motherId = partnerId;
        } else {
            _showToast('This character\'s gender is unknown. Set their gender first, '
                + 'or use the Birth modal directly.', 'error');
            return { success: false, reason: 'Parent gender unknown.' };
        }

        if (!motherId || !fatherId) {
            var targetGender = !motherId ? 'female' : 'male';
            var targetRole = !motherId ? 'Mother' : 'Father';

            return _openInlineCharacterPicker(
                'Select ' + targetRole,
                { excludeIds: [parentId], gender: targetGender },
                function (selected) {
                    if (!selected || !_hasId(selected.id)) return;
                    if (targetGender === 'female') motherId = selected.id;
                    else fatherId = selected.id;
                    window.openBirthModal(motherId, fatherId, function (cid) {
                        if (typeof onSuccess === 'function') onSuccess(cid);
                    });
                }
            );
        }

        return window.openBirthModal(motherId, fatherId, function (cid) {
            if (typeof onSuccess === 'function') onSuccess(cid);
        });
    }

    // =========================================================================
    // EXPORTS
    // =========================================================================

    window.openBirthModal = openBirthModal;
    window.openSurpriseBirthModal = openSurpriseBirthModal;
    window.openBatchBirthModal = openBatchBirthModal;
    window.openPregnancyAttemptModal = openPregnancyAttemptModal;
    window.openSetParentModal = openSetParentModal;
    window.openAddExistingBiologicalChildModal = openAddExistingBiologicalChildModal;
    window.openAddExistingBiologicalSiblingModal = openAddExistingBiologicalSiblingModal;
    window.openGenerateBabyModal = openGenerateBabyModal;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            openBirthModal: openBirthModal,
            openSurpriseBirthModal: openSurpriseBirthModal,
            openBatchBirthModal: openBatchBirthModal,
            openPregnancyAttemptModal: openPregnancyAttemptModal,
            openSetParentModal: openSetParentModal,
            openAddExistingBiologicalChildModal: openAddExistingBiologicalChildModal,
            openAddExistingBiologicalSiblingModal: openAddExistingBiologicalSiblingModal,
            openGenerateBabyModal: openGenerateBabyModal
        };
    }
})();
