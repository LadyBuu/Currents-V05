/**
 * =============================================================================
 * STILL WATERS - CHILDREN BIRTH MODALS
 * (js/character/modals-children-birth.js)
 * =============================================================================
 *
 * REFACTOR HISTORY:
 *   Current revision:
 *     - Cross-domain exclusion in every picker. Parent pickers exclude
 *       characters already recorded as parents of the child (bio or
 *       legal). Child pickers exclude characters already recorded as
 *       children of the parent (bio or legal). Sibling pickers
 *       exclude characters already recorded as siblings.
 *     - Age indication in every picker. Every candidate row shows
 *       both the current age AND the hypothetical age the other party
 *       would have been at the relevant event (parent's age at child's
 *       birth for parent pickers; parent's age at candidate's birth
 *       for child pickers).
 *     - The picker computes age from birthYear at the current year.
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
    // PICKER
    // =========================================================================

    /**
     * pickerOpts supports:
     *   excludeIds      array of ids not to show
     *   gender          'male' | 'female' | null
     *   filterFn        (summary) => boolean
     *   referenceYear   number — used for the age hint
     *   referenceLabel  string — e.g. "at child's birth" or "at their birth"
     *   referenceFrame  'parent' | 'child' — how to interpret referenceYear
     *                   'parent': candidate is a parent, show age candidate
     *                             would have been at referenceYear
     *                   'child':  candidate is a child, show age the OTHER
     *                             parent (referenceYear) would have been at
     *                             candidate's birth
     */
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

                        // Age hint
                        var ageHint = '';
                        if (referenceYear !== null
                            && typeof s.birthYear === 'number'
                            && referenceLabel) {
                            var hypothetical;
                            if (referenceFrame === 'parent') {
                                // candidate is a parent; how old were they at referenceYear?
                                hypothetical = referenceYear - s.birthYear;
                            } else if (referenceFrame === 'child') {
                                // candidate is a child; how old was the parent at candidate's birth?
                                hypothetical = s.birthYear - referenceYear;
                            }
                            if (typeof hypothetical === 'number' && hypothetical >= 0) {
                                ageHint = ' · ' + referenceLabel + ' ' + hypothetical + 'y';
                            }
                        }

                        var genderIcon = _genderSvg(s.gender);

                        html += '<div class="character-tab-history__row" '
                            + 'data-character-id="' + _esc(s.id) + '" '
                            + 'style="cursor:pointer;">'
                            + '<div class="character-tab-history__main" style="display:flex;align-items:center;gap:8px;">'
                            + '<span class="character-row__gender">' + genderIcon + '</span>'
                            + '<span class="character-tab-history__value">' + _esc(name || s.id) + '</span>'
                            + '<span class="character-tab-history__reason">'
                            + _esc(ageText + ageHint)
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

    // (openBirthModal, openSurpriseBirthModal, openBatchBirthModal,
    // openPregnancyAttemptModal — unchanged from Round 3. Copy them
    // verbatim from the file you already have.)

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

        // Exclude existing parents (bio, legal, social) of this child.
        // A character cannot be two roles of parent to the same child.
        var existingParents = (window.FamilyQueries.getAllParentIds(childId) || []);
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
                    _showToast('Failed to set ' + role + ': ' +
                        (result && result.reason ? result.reason : 'unknown'), 'error');
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

        // Exclude existing children of this parent (bio or legal).
        // A character cannot be both biological and adopted child of
        // the same parent.
        var existingChildren = (window.FamilyQueries.getBiologicalChildIds(parentId) || [])
            .concat(window.FamilyQueries.getLegalChildIds(parentId) || []);
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
                var currentYear = window.getCurrentYear();
                var result = window.FamilyCommands.setParent(selected.id, parentId, {
                    parentType: 'biological',
                    parentRole: role,
                    startYear: currentYear,
                    allowReplace: false
                });
                if (!result || result.success !== true) {
                    _showToast('Failed to add child: ' +
                        (result && result.reason ? result.reason : 'unknown'), 'error');
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

        var bioParents = window.FamilyQueries.getBiologicalParentIds(childId);
        if (!Array.isArray(bioParents) || bioParents.length === 0) {
            _showToast('This character has no biological parents to share. ' +
                'Add the parents first, then come back.', 'error');
            return { success: false, reason: 'No biological parents.' };
        }

        // Exclude existing siblings.
        var siblings = (window.FamilyQueries.getSiblings(childId) || [])
            .map(function (s) { return s.siblingId; });
        var excludeIds = [childId].concat(siblings);

        return _openInlineCharacterPicker(
            'Add Biological Sibling',
            { excludeIds: excludeIds },
            function (selected) {
                if (!selected || !_hasId(selected.id)) return;
                var currentYear = window.getCurrentYear();
                var added = 0, errors = [];

                for (var i = 0; i < bioParents.length; i++) {
                    var pid = bioParents[i];
                    var ps = CQ.getCharacterSummary(pid);
                    if (!ps) continue;
                    var r = ps.gender === 'male' ? 'father'
                        : ps.gender === 'female' ? 'mother' : 'parent';
                    var res = window.FamilyCommands.setParent(selected.id, pid, {
                        parentType: 'biological',
                        parentRole: r,
                        startYear: currentYear,
                        allowReplace: false
                    });
                    if (res && res.success === true) added++;
                    else errors.push(pid);
                }

                if (added === 0) {
                    _showToast('Failed to add sibling: no parent edges created.', 'error');
                    return;
                }
                _showToast('Biological sibling added' +
                    (errors.length > 0 ? ' (some parent edges failed)' : '.'),
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
            _showToast('This character\'s gender is unknown. Set their gender first, ' +
                'or use the Birth modal directly.', 'error');
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
