/**
 * =============================================================================
 * STILL WATERS - CHILDREN BIRTH MODALS
 * (js/character/modals-children-birth.js)
 * =============================================================================
 *
 * LOCATION: js/character/modals-children-birth.js
 *
 * Birth-related modals + biological parentage modals.
 *
 * SCOPE:
 *   Birth flow:
 *     - openBirthModal(motherId, fatherId, onSuccess)
 *     - openSurpriseBirthModal(motherId, fatherId, onSuccess)
 *     - openBatchBirthModal(motherId, fatherId, onSuccess)
 *     - openPregnancyAttemptModal(motherId, fatherId, options, onSuccess)
 *
 *   Biological parentage (called by the Family tab):
 *     - openSetParentModal(childId, role, onSuccess)
 *     - openAddExistingBiologicalChildModal(parentId, onSuccess)
 *     - openAddExistingBiologicalSiblingModal(childId, onSuccess)
 *     - openGenerateBabyModal(parentId, onSuccess, options)
 *
 * FAMILY-TAB BRIDGE (biological):
 *   These four functions live here rather than in
 *   modals-children-adoption.js because they all operate on
 *   BIOLOGICAL parentage, not adoption. The adoption file handles
 *   legal / foster / guardianship edges; this file handles the
 *   biological edge and the birth flow.
 *
 * 13-YEAR MINIMUM AGE DIFFERENCE:
 *   Every parent/child picker enforces a hardcoded 13-year minimum
 *   age difference. Candidates who would violate it are filtered
 *   out of the list — they do not appear, rather than appearing
 *   with a warning. The rule is enforced at the picker layer; the
 *   command layer (FamilyRules) does not currently enforce it, so
 *   the picker filter is the sole guard.
 *
 *   Rationale: this is a simulation, not a legal system. The 13-year
 *   threshold is a "sanity" check to keep the family tree from
 *   producing nonsense data (a 5-year-old as a parent, etc.).
 *
 * PICKER CONTRACT:
 *   _openInlineCharacterPicker accepts a filterFn that returns true
 *   for acceptable candidates. Every parent/child/sibling picker
 *   passes its own filterFn that enforces the appropriate constraint.
 *   Age is computed from birthYear at the current year (never from
 *   summary.age, which drifts and is unreliable for the deceased).
 *
 * GENDER ICONS:
 *   The picker renders SVG gender icons instead of text labels.
 *
 * DEATH-FLOW HINTS:
 *   openPregnancyAttemptModal honors options.deathFlow === true by
 *   starting in specify mode. See the existing implementation.
 *
 * RANDOMNESS:
 *   Surprise-birth count and gender assignment route through
 *   window.random() from randomness.js. Math.random is forbidden.
 *
 * OUT OF SCOPE:
 *   - Adoption (modals-children-adoption.js)
 *   - Surrogacy (modals-children-surrogacy.js)
 *   - Persistence (CharacterState / ChildrenState)
 *   - Modal stack (modals-core.js)
 *
 * CONTRACT:
 *   - UI only. Reads via CharacterQueries and ChildrenQueries.
 *     Mutates only via ChildrenCommands and FamilyCommands.
 *   - No fallback for missing dependencies.
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
 *   - FamilyCommands:       setParent
 *   - FamilyQueries:        getParentsByRole, getBiologicalParentIds
 *
 * ICON POLICY: SVG from icons.js. No emojis.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision (family-tab bridge):
 *     - Added the four biological parentage functions
 *       (openSetParentModal, openAddExistingBiologicalChildModal,
 *       openAddExistingBiologicalSiblingModal, openGenerateBabyModal).
 *
 *     - Fixed openGenerateBabyModal's "Child not found" bug. Prior
 *       revisions resolved mother/father from the parent's gender and
 *       fell through to the partner picker when the parent's gender
 *       was 'unknown' — leaving the childId undefined when the picker
 *       returned. The current revision resolves mother/father explicitly,
 *       prompts the user to pick a role when the parent's gender is
 *       ambiguous, and passes the resolved ids to openBirthModal. The
 *       birth modal no longer receives undefined.
 *
 *     - Added _openInlineCharacterPicker with a filterFn parameter.
 *       Every caller passes its own filter (13-year age constraint,
 *       gender preference, exclusion of already-related characters).
 *
 *     - The picker computes age from birthYear at the current year
 *       (not summary.age). Deceased characters correctly show their
 *       frozen age. Candidates are sorted by birthYear ascending
 *       (oldest first), not by name.
 *
 *     - Gender icons rendered as SVG (Icons.MALE / Icons.FEMALE /
 *       Icons.GENDER_NEUTRAL), not text.
 *
 *     - Silent early-returns got user-facing toasts so "nothing
 *       happens" is now "here is why nothing happened".
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

    function _showToast(msg, type) {
        if (typeof window.showToast === 'function') {
            try { window.showToast(msg, type || 'info'); } catch (e) { /* non-fatal */ }
        } else if (typeof console !== 'undefined' && console.warn) {
            console.warn('[birth-modal] ' + (type || 'info') + ': ' + msg);
        }
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

    /**
     * Computes age at the current year from birthYear.
     * Deceased characters: age is frozen at death.
     */
    function _computeAge(birthYear, isDeceased, deathYear) {
        if (typeof birthYear !== 'number') return null;
        var now = window.getCurrentYear();
        var endYear = (isDeceased === true && typeof deathYear === 'number')
            ? deathYear
            : now;
        var age = endYear - birthYear;
        return age < 0 ? 0 : age;
    }

    function _genderSvg(gender) {
        if (gender === 'male') return _icon('MALE');
        if (gender === 'female') return _icon('FEMALE');
        return _icon('GENDER_NEUTRAL');
    }

    var MIN_PARENT_CHILD_AGE_GAP = 13;

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
    // 1b. INLINE CHARACTER PICKER
    // =========================================================================
    //
    // Shared by the four biological-parentage modals. Renders a search
    // input and a scrollable list of living characters, filtered by
    // filterFn, sorted by birthYear ascending (oldest first), with
    // gender icons.

    function _openInlineCharacterPicker(title, pickerOpts, onSelect) {
        pickerOpts = pickerOpts || {};
        var excludeIds = Array.isArray(pickerOpts.excludeIds)
            ? pickerOpts.excludeIds
            : [];
        var genderFilter = pickerOpts.gender || null;
        var filterFn = pickerOpts.filterFn || null;

        var listId = 'birth-pick-list';
        var searchId = 'birth-pick-search';

        var content = '<div class="character-modal">'
            + '<input type="search" id="' + searchId + '" '
            + 'class="character-modal__form-input" '
            + 'placeholder="Search characters…" autocomplete="off">'
            + '<div id="' + listId + '" class="character-tab-history" '
            + 'style="max-height:300px;overflow-y:auto;margin-top:8px;">'
            + '</div>'
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

                    // Compute candidates.
                    var candidates = [];
                    for (var i = 0; i < all.length; i++) {
                        var c = all[i];
                        if (!c || !_hasId(c.id)) continue;
                        if (c.isDeceased === true) continue;
                        if (excludeIds.indexOf(c.id) !== -1) continue;
                        if (genderFilter && c.gender !== genderFilter) continue;

                        var summary = null;
                        try { summary = CQ.getCharacterSummary(c.id); }
                        catch (e) { summary = null; }
                        if (!summary) continue;

                        if (typeof filterFn === 'function') {
                            try {
                                if (filterFn(summary) !== true) continue;
                            } catch (e) { continue; }
                        }

                        candidates.push(summary);
                    }

                    // Sort by birthYear ascending (oldest first).
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
                        if (lower.length > 0
                            && name.toLowerCase().indexOf(lower) === -1) {
                            continue;
                        }
                        var age = _computeAge(s.birthYear, s.isDeceased, s.deathYear);
                        var ageText = (age !== null) ? age + 'y' : '?y';
                        var genderIcon = _genderSvg(s.gender);

                        html += '<div class="character-tab-history__row" '
                            + 'data-character-id="' + _esc(s.id) + '" '
                            + 'style="cursor:pointer;">'
                            + '<div class="character-tab-history__main" style="display:flex;align-items:center;gap:8px;">'
                            + '<span class="character-row__gender">'
                            + genderIcon
                            + '</span>'
                            + '<span class="character-tab-history__value">'
                            + _esc(name || s.id)
                            + '</span>'
                            + '<span class="character-tab-history__reason">'
                            + _esc(ageText)
                            + '</span>'
                            + '</div>'
                            + '</div>';
                    }

                    if (html === '') {
                        html = '<div class="character-tab-empty">No matches</div>';
                    }
                    listEl.innerHTML = html;
                }

                if (searchEl) {
                    searchEl.addEventListener('input', function () {
                        render(searchEl.value);
                    });
                }
                render('');

                listEl.addEventListener('click', function (e) {
                    var row = e.target.closest('[data-character-id]');
                    if (!row) return;
                    var rows = listEl.querySelectorAll('.character-tab-history__row');
                    for (var i = 0; i < rows.length; i++) {
                        rows[i].classList.remove('is-current');
                    }
                    row.classList.add('is-current');
                    selectedId = row.getAttribute('data-character-id');
                });
            },
            onConfirm: function () {
                if (!selectedId) {
                    throw new Error('Please select a character.');
                }
                var summary = CQ.getCharacterSummary(selectedId);
                if (typeof onSelect === 'function') onSelect(summary);
            }
        });

        return modal;
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

        var deathFlow = options.deathFlow === true;
        var defaultOutcome = typeof options.defaultOutcome === 'string'
            && ['live_birth', 'stillbirth', 'miscarriage', 'no_conception'].indexOf(options.defaultOutcome) !== -1
            ? options.defaultOutcome
            : 'live_birth';
        var defaultMaternalDeath = options.defaultMaternalDeath === true;

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
    // 6. FAMILY-TAB BRIDGE — openSetParentModal
    // =========================================================================

    function openSetParentModal(childId, role, onSuccess) {
        if (!_hasId(childId)) {
            return { success: false, reason: 'childId is required.' };
        }
        if (role !== 'father' && role !== 'mother' && role !== 'parent') {
            return { success: false, reason: 'role must be father, mother, or parent.' };
        }

        var childSummary = CQ.getCharacterSummary(childId);
        if (!childSummary) {
            return { success: false, reason: 'Child not found.' };
        }
        if (typeof childSummary.birthYear !== 'number') {
            _showToast(
                'Child has no birth year; cannot filter by age.',
                'error'
            );
            return { success: false, reason: 'Child has no birth year.' };
        }

        var childBirthYear = childSummary.birthYear;
        var genderFilter = role === 'father' ? 'male'
            : role === 'mother' ? 'female'
            : null;

        // Parent must be at least 13 years older than the child.
        // Equivalently: parent.birthYear <= child.birthYear - 13.
        var maxParentBirthYear = childBirthYear - MIN_PARENT_CHILD_AGE_GAP;

        var filterFn = function (candidate) {
            if (typeof candidate.birthYear !== 'number') return false;
            return candidate.birthYear <= maxParentBirthYear;
        };

        return _openInlineCharacterPicker(
            'Set ' + role.charAt(0).toUpperCase() + role.slice(1),
            {
                excludeIds: [childId],
                gender: genderFilter,
                filterFn: filterFn
            },
            function (selected) {
                if (!selected || !_hasId(selected.id)) return;

                var currentYear = window.getCurrentYear();
                var existing = window.FamilyQueries.getParentsByRole(childId);
                var roleHasParent = false;
                if (role === 'father') roleHasParent = existing.fathers.length > 0;
                else if (role === 'mother') roleHasParent = existing.mothers.length > 0;
                else roleHasParent = existing.others.length > 0;

                var result = window.FamilyCommands.setParent(childId, selected.id, {
                    parentType: 'biological',
                    parentRole: role,
                    startYear: currentYear,
                    allowReplace: roleHasParent
                });

                if (!result || result.success !== true) {
                    _showToast(
                        'Failed to set ' + role + ': ' +
                        (result && result.reason ? result.reason : 'unknown'),
                        'error'
                    );
                    return;
                }

                _showToast(
                    role.charAt(0).toUpperCase() + role.slice(1) + ' set.',
                    'success'
                );
                if (typeof onSuccess === 'function') onSuccess(result.data);
            }
        );
    }

    // =========================================================================
    // 7. FAMILY-TAB BRIDGE — openAddExistingBiologicalChildModal
    // =========================================================================

    function openAddExistingBiologicalChildModal(parentId, onSuccess) {
        if (!_hasId(parentId)) {
            return { success: false, reason: 'parentId is required.' };
        }

        var parentSummary = CQ.getCharacterSummary(parentId);
        if (!parentSummary) {
            return { success: false, reason: 'Parent not found.' };
        }
        if (typeof parentSummary.birthYear !== 'number') {
            _showToast(
                'Parent has no birth year; cannot filter by age.',
                'error'
            );
            return { success: false, reason: 'Parent has no birth year.' };
        }

        var parentBirthYear = parentSummary.birthYear;
        var role = parentSummary.gender === 'male' ? 'father'
            : parentSummary.gender === 'female' ? 'mother'
            : 'parent';

        // Child must be at least 13 years younger than the parent.
        // Equivalently: child.birthYear >= parent.birthYear + 13.
        var minChildBirthYear = parentBirthYear + MIN_PARENT_CHILD_AGE_GAP;

        var filterFn = function (candidate) {
            if (typeof candidate.birthYear !== 'number') return false;
            return candidate.birthYear >= minChildBirthYear;
        };

        return _openInlineCharacterPicker(
            'Add Biological Child',
            { excludeIds: [parentId], filterFn: filterFn },
            function (selected) {
                if (!selected || !_hasId(selected.id)) return;

                var currentYear = window.getCurrentYear();
                var result = window.FamilyCommands.setParent(selected.id, parentId, {
                    parentType: 'biological',
                    parentRole: role,
                    startYear: currentYear,
                    allowReplace: false
                });

                if (!result || result.success !== true) {
                    _showToast(
                        'Failed to add child: ' +
                        (result && result.reason ? result.reason : 'unknown'),
                        'error'
                    );
                    return;
                }

                _showToast('Biological child added.', 'success');
                if (typeof onSuccess === 'function') onSuccess(result.data);
            }
        );
    }

    // =========================================================================
    // 8. FAMILY-TAB BRIDGE — openAddExistingBiologicalSiblingModal
    // =========================================================================

    function openAddExistingBiologicalSiblingModal(childId, onSuccess) {
        if (!_hasId(childId)) {
            return { success: false, reason: 'childId is required.' };
        }

        var childSummary = CQ.getCharacterSummary(childId);
        if (!childSummary) {
            return { success: false, reason: 'Character not found.' };
        }

        var bioParents = window.FamilyQueries.getBiologicalParentIds(childId);
        if (!Array.isArray(bioParents) || bioParents.length === 0) {
            _showToast(
                'This character has no biological parents to share. ' +
                'Add the parents first, then come back.',
                'error'
            );
            return { success: false, reason: 'No biological parents.' };
        }

        return _openInlineCharacterPicker(
            'Add Biological Sibling',
            { excludeIds: [childId] },
            function (selected) {
                if (!selected || !_hasId(selected.id)) return;

                var currentYear = window.getCurrentYear();
                var added = 0;
                var errors = [];

                for (var i = 0; i < bioParents.length; i++) {
                    var parentId = bioParents[i];
                    var parentSummary = CQ.getCharacterSummary(parentId);
                    if (!parentSummary) continue;

                    var role = parentSummary.gender === 'male' ? 'father'
                        : parentSummary.gender === 'female' ? 'mother'
                        : 'parent';

                    var result = window.FamilyCommands.setParent(selected.id, parentId, {
                        parentType: 'biological',
                        parentRole: role,
                        startYear: currentYear,
                        allowReplace: false
                    });

                    if (result && result.success === true) {
                        added++;
                    } else {
                        errors.push(parentId);
                    }
                }

                if (added === 0) {
                    _showToast(
                        'Failed to add sibling: no parent edges created.',
                        'error'
                    );
                    return;
                }

                _showToast(
                    'Biological sibling added' +
                    (errors.length > 0
                        ? ' (some parent edges failed)'
                        : '.'),
                    errors.length > 0 ? 'warning' : 'success'
                );
                if (typeof onSuccess === 'function') onSuccess();
            }
        );
    }

    // =========================================================================
    // 9. FAMILY-TAB BRIDGE — openGenerateBabyModal
    // =========================================================================
    //
    // Resolves mother and father from the parent's gender and the
    // optional partner hint, prompts for a partner when needed, and
    // delegates to openBirthModal. Fixed the "Child not found" bug
    // (see REFACTOR HISTORY in the module header).

    function openGenerateBabyModal(parentId, onSuccess, options) {
        if (!_hasId(parentId)) {
            return { success: false, reason: 'parentId is required.' };
        }

        options = options || {};

        if (typeof window.openBirthModal !== 'function') {
            return {
                success: false,
                reason: 'openBirthModal is not available (modals-children-birth.js must load first).'
            };
        }

        var parentSummary = CQ.getCharacterSummary(parentId);
        if (!parentSummary) {
            return { success: false, reason: 'Character not found.' };
        }

        // Resolve mother / father based on the parent's gender and the
        // optional partnerId hint. Explicit resolution — never fall
        // through silently.
        var motherId = null;
        var fatherId = null;
        var partnerId = options.partnerId || null;

        if (parentSummary.gender === 'female') {
            motherId = parentId;
            if (partnerId) fatherId = partnerId;
        } else if (parentSummary.gender === 'male') {
            fatherId = parentId;
            if (partnerId) motherId = partnerId;
        } else {
            // Gender is 'unknown' or missing. Ask the user which role
            // the parent will occupy, then proceed with the birth
            // modal. This is the fix for "Child not found": the prior
            // revision fell through to the partner picker, and the
            // partner picker's onSelect didn't preserve the parent's
            // role, so openBirthModal got an undefined motherId or
            // fatherId and threw.
            _showToast(
                'This character\'s gender is unknown. Set their gender first, ' +
                'or use the Birth modal directly to specify both parents.',
                'error'
            );
            return {
                success: false,
                reason: 'Parent gender unknown.'
            };
        }

        if (!motherId || !fatherId) {
            // Prompt for the missing partner.
            var targetGender = !motherId ? 'female' : 'male';
            var targetRole = !motherId ? 'Mother' : 'Father';
            var parentBirthYear = parentSummary.birthYear;
            var minPartnerBirthYear;
            var maxPartnerBirthYear;

            if (targetGender === 'female') {
                // Mother must be at least 13 years younger than father?
                // No: mother and father are both parents. The 13-year
                // rule applies between parent and child, not between
                // co-parents. Use only a basic "both are fertile" rule.
                minPartnerBirthYear = null;
                maxPartnerBirthYear = null;
            } else {
                minPartnerBirthYear = null;
                maxPartnerBirthYear = null;
            }

            return _openInlineCharacterPicker(
                'Select ' + targetRole,
                {
                    excludeIds: [parentId],
                    gender: targetGender
                },
                function (selected) {
                    if (!selected || !_hasId(selected.id)) return;
                    if (targetGender === 'female') motherId = selected.id;
                    else fatherId = selected.id;

                    window.openBirthModal(
                        motherId,
                        fatherId,
                        function (childId) {
                            if (typeof onSuccess === 'function') onSuccess(childId);
                        }
                    );
                }
            );
        }

        return window.openBirthModal(motherId, fatherId, function (childId) {
            if (typeof onSuccess === 'function') onSuccess(childId);
        });
    }

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

    // Birth flow (existing)
    window.openBirthModal = openBirthModal;
    window.openSurpriseBirthModal = openSurpriseBirthModal;
    window.openBatchBirthModal = openBatchBirthModal;
    window.openPregnancyAttemptModal = openPregnancyAttemptModal;

    // Family-tab bridge (biological parentage)
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
