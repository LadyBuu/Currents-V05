/**
 * =============================================================================
 * STILL WATERS - CHILDREN ADOPTION MODALS
 * (js/character/modals-children-adoption.js)
 * =============================================================================
 *
 * REFACTOR HISTORY:
 *   Current revision:
 *     - Cross-domain exclusion in every adoption-domain bridge:
 *       - openAddAdoptedChildModal / openAddFosterOrWardModal exclude
 *         children already bio or legal of the parent.
 *       - openAddAdoptedSiblingModal excludes existing siblings.
 *       - openAddFosterParentModal / openAddGuardianModal /
 *         openAddAdoptiveParentModal exclude parents already bio,
 *         legal, or social of the child.
 *     - Age indication on every picker (parent-at-birth for parent
 *       pickers; parent-at-candidate's-birth for child pickers).
 * =============================================================================
 */

(function () {
    'use strict';

    function _requireDependencies() {
        var required = ['escapeHtml', 'openModal', 'closeTopModal',
            'getCurrentYear', 'isValidYear', 'calculateAge'];
        var missing = [];
        for (var i = 0; i < required.length; i++) {
            if (typeof window[required[i]] === 'undefined') missing.push(required[i]);
        }
        if (missing.length > 0) {
            throw new Error('modals-children-adoption.js: missing required dependencies: ' + missing.join(', '));
        }
        if (typeof window.Icons === 'undefined') throw new Error('modals-children-adoption.js: icons.js must load first.');
        if (typeof window.CharacterQueries === 'undefined') throw new Error('modals-children-adoption.js: character-queries.js must load first.');
        if (typeof window.ChildrenCommands === 'undefined') throw new Error('modals-children-adoption.js: children-commands.js must load first.');
        if (typeof window.ChildrenQueries === 'undefined') throw new Error('modals-children-adoption.js: children-queries.js must load first.');
        if (typeof window.ChildrenRules === 'undefined') throw new Error('modals-children-adoption.js: children-rules.js must load first.');
        if (typeof window.FamilyCommands === 'undefined') throw new Error('modals-children-adoption.js: family-commands.js must load first.');
        if (typeof window.FamilyQueries === 'undefined') throw new Error('modals-children-adoption.js: family-queries.js must load first.');
    }

    _requireDependencies();

    var CQ = window.CharacterQueries;
    var ChC = window.ChildrenCommands;
    var ChQ = window.ChildrenQueries;
    var ChR = window.ChildrenRules;
    var FC = window.FamilyCommands;
    var FQ = window.FamilyQueries;

    var MIN_PARENT_CHILD_AGE_GAP = 13;

    function _esc(v) { return window.escapeHtml(v); }
    function _hasId(v) { return typeof v === 'string' && v.length > 0; }
    function _isMissing(v) { return v === undefined || v === null; }
    function _icon(name) { return window.Icons[name] || ''; }

    function _showToast(msg, type) {
        if (typeof window.showToast === 'function') {
            try { window.showToast(msg, type || 'info'); } catch (e) { /* non-fatal */ }
        } else if (typeof console !== 'undefined' && console.warn) {
            console.warn('[adoption-modal] ' + (type || 'info') + ': ' + msg);
        }
    }

    function _readSummary(id) { return _hasId(id) ? CQ.getCharacterSummary(id) : null; }
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

    function _typeLabel(type) {
        if (type === ChR.ADOPTION_TYPE.LEGAL) return 'Legal Adoption';
        if (type === ChR.ADOPTION_TYPE.GUARDIANSHIP) return 'Guardianship';
        if (type === ChR.ADOPTION_TYPE.FOSTER) return 'Foster Care';
        return type;
    }

    function _typeOptionsHtml(selectedType) {
        var options = [
            { id: ChR.ADOPTION_TYPE.LEGAL, label: 'Legal Adoption' },
            { id: ChR.ADOPTION_TYPE.GUARDIANSHIP, label: 'Guardianship' },
            { id: ChR.ADOPTION_TYPE.FOSTER, label: 'Foster Care' }
        ];
        var html = '';
        for (var i = 0; i < options.length; i++) {
            var sel = options[i].id === selectedType ? ' selected' : '';
            html += '<option value="' + _esc(options[i].id) + '"' + sel + '>' + _esc(options[i].label) + '</option>';
        }
        return html;
    }

    function _statusOptionsHtml(selectedStatus) {
        var options = [
            { id: ChR.ADOPTION_STATUS.ACTIVE, label: 'Active' },
            { id: ChR.ADOPTION_STATUS.ENDED, label: 'Ended' },
            { id: ChR.ADOPTION_STATUS.DISSOLVED, label: 'Dissolved' }
        ];
        var html = '';
        for (var i = 0; i < options.length; i++) {
            var sel = options[i].id === selectedStatus ? ' selected' : '';
            html += '<option value="' + _esc(options[i].id) + '"' + sel + '>' + _esc(options[i].label) + '</option>';
        }
        return html;
    }

    function _requireSelector() {
        if (typeof window.openCharacterSelector !== 'function') {
            throw new Error('modals-children-adoption.js: character selector (openCharacterSelector) is required.');
        }
        return window.openCharacterSelector;
    }

    // =========================================================================
    // PICKER (same contract as modals-children-birth.js)
    // =========================================================================

    function _openInlineCharacterPicker(title, pickerOpts, onSelect) {
        pickerOpts = pickerOpts || {};
        var excludeIds = Array.isArray(pickerOpts.excludeIds) ? pickerOpts.excludeIds : [];
        var genderFilter = pickerOpts.gender || null;
        var filterFn = pickerOpts.filterFn || null;
        var referenceYear = (typeof pickerOpts.referenceYear === 'number') ? pickerOpts.referenceYear : null;
        var referenceLabel = pickerOpts.referenceLabel || null;
        var referenceFrame = pickerOpts.referenceFrame || null;

        var listId = 'adoption-pick-list';
        var searchId = 'adoption-pick-search';

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
                        if (referenceYear !== null
                            && typeof s.birthYear === 'number'
                            && referenceLabel) {
                            var hypo;
                            if (referenceFrame === 'parent') hypo = referenceYear - s.birthYear;
                            else if (referenceFrame === 'child') hypo = s.birthYear - referenceYear;
                            if (typeof hypo === 'number' && hypo >= 0) {
                                ageHint = ' · ' + referenceLabel + ' ' + hypo + 'y';
                            }
                        }

                        html += '<div class="character-tab-history__row" '
                            + 'data-character-id="' + _esc(s.id) + '" '
                            + 'style="cursor:pointer;">'
                            + '<div class="character-tab-history__main" style="display:flex;align-items:center;gap:8px;">'
                            + '<span class="character-row__gender">' + _genderSvg(s.gender) + '</span>'
                            + '<span class="character-tab-history__value">' + _esc(name || s.id) + '</span>'
                            + '<span class="character-tab-history__reason">' + _esc(ageText + ageHint) + '</span>'
                            + '</div>'
                            + '</div>';
                    }

                    if (html === '') html = '<div class="character-tab-empty">No matches</div>';
                    listEl.innerHTML = html;
                }

                if (searchEl) {
                    searchEl.addEventListener('input', function () { render(searchEl.value); });
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

    // (openCreateAdoptionModal, openEditAdoptionModal, openEndAdoptionModal,
    // openAdoptionSearchModal, openSetBirthParentsModal — unchanged from
    // the file you already have.)

    // =========================================================================
    // BRIDGES
    // =========================================================================

    function openAddAdoptedChildModal(parentId, onSuccess) {
        if (!_hasId(parentId)) return { success: false, reason: 'parentId is required.' };

        var ps = CQ.getCharacterSummary(parentId);
        if (!ps) return { success: false, reason: 'Parent not found.' };
        if (typeof ps.birthYear !== 'number') {
            _showToast('Parent has no birth year; cannot filter by age.', 'error');
            return { success: false, reason: 'Parent has no birth year.' };
        }

        var parentBirthYear = ps.birthYear;
        var role = ps.gender === 'male' ? 'father' : ps.gender === 'female' ? 'mother' : 'parent';
        var minChildBirthYear = parentBirthYear + MIN_PARENT_CHILD_AGE_GAP;

        var existingChildren = (FQ.getBiologicalChildIds(parentId) || [])
            .concat(FQ.getLegalChildIds(parentId) || []);
        var excludeIds = [parentId].concat(existingChildren);

        var filterFn = function (c) {
            if (typeof c.birthYear !== 'number') return false;
            return c.birthYear >= minChildBirthYear;
        };

        return _openInlineCharacterPicker(
            'Add Adopted Child',
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

                var edgeResult = FC.createAdoption(selected.id, parentId, {
                    parentRole: role, startYear: currentYear, notes: '',
                    biologicalParentsConsent: true
                });
                if (!edgeResult || edgeResult.success !== true) {
                    _showToast('Failed to add adopted child: ' +
                        (edgeResult && edgeResult.reason ? edgeResult.reason : 'unknown'), 'error');
                    return;
                }

                var metaResult = ChC.recordAdoptionMetadata(selected.id, parentId, {
                    type: ChR.ADOPTION_TYPE.LEGAL, year: currentYear, notes: ''
                });
                if (!metaResult || metaResult.success !== true) {
                    FC.removeAdoption(selected.id, parentId, {
                        endYear: currentYear, reason: 'adoption metadata failed'
                    });
                    _showToast('Failed to record adoption metadata: ' +
                        (metaResult && metaResult.reason ? metaResult.reason : 'unknown'), 'error');
                    return;
                }

                _showToast('Adopted child added.', 'success');
                if (typeof onSuccess === 'function') onSuccess(metaResult.adoptionId);
            }
        );
    }

    function openAddFosterOrWardModal(parentId, kind, onSuccess) {
        if (kind !== 'foster' && kind !== 'guardianship') {
            return { success: false, reason: 'kind must be foster or guardianship.' };
        }
        if (!_hasId(parentId)) return { success: false, reason: 'parentId is required.' };

        var ps = CQ.getCharacterSummary(parentId);
        if (!ps) return { success: false, reason: 'Parent not found.' };
        if (typeof ps.birthYear !== 'number') {
            _showToast('Parent has no birth year; cannot filter by age.', 'error');
            return { success: false, reason: 'Parent has no birth year.' };
        }

        var parentBirthYear = ps.birthYear;
        var role = ps.gender === 'male' ? 'father' : ps.gender === 'female' ? 'mother' : 'parent';
        var minChildBirthYear = parentBirthYear + MIN_PARENT_CHILD_AGE_GAP;

        var existingChildren = (FQ.getBiologicalChildIds(parentId) || [])
            .concat(FQ.getLegalChildIds(parentId) || []);
        var excludeIds = [parentId].concat(existingChildren);

        var filterFn = function (c) {
            if (typeof c.birthYear !== 'number') return false;
            return c.birthYear >= minChildBirthYear;
        };

        var adoptionType = kind === 'foster' ? ChR.ADOPTION_TYPE.FOSTER : ChR.ADOPTION_TYPE.GUARDIANSHIP;
        var label = kind === 'foster' ? 'Foster Child' : 'Ward';

        return _openInlineCharacterPicker(
            'Add ' + label,
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

                var edgeResult = FC.createAdoption(selected.id, parentId, {
                    parentRole: role, startYear: currentYear, notes: '',
                    biologicalParentsConsent: true
                });
                if (!edgeResult || edgeResult.success !== true) {
                    _showToast('Failed to add ' + kind + ': ' +
                        (edgeResult && edgeResult.reason ? edgeResult.reason : 'unknown'), 'error');
                    return;
                }

                var metaResult = ChC.recordAdoptionMetadata(selected.id, parentId, {
                    type: adoptionType, year: currentYear, notes: ''
                });
                if (!metaResult || metaResult.success !== true) {
                    FC.removeAdoption(selected.id, parentId, {
                        endYear: currentYear, reason: 'adoption metadata failed'
                    });
                    _showToast('Failed to record ' + kind + ' metadata: ' +
                        (metaResult && metaResult.reason ? metaResult.reason : 'unknown'), 'error');
                    return;
                }

                _showToast(label + ' added.', 'success');
                if (typeof onSuccess === 'function') onSuccess(metaResult.adoptionId);
            }
        );
    }

    function openAddAdoptedSiblingModal(childId, onSuccess) {
        if (!_hasId(childId)) return { success: false, reason: 'childId is required.' };

        var child = CQ.getCharacterSummary(childId);
        if (!child) return { success: false, reason: 'Character not found.' };

        var legalParents = FQ.getLegalParentIds(childId);
        if (!Array.isArray(legalParents) || legalParents.length === 0) {
            _showToast('This character has no adopting parents to share. ' +
                'Add an adopted child first, then come back.', 'error');
            return { success: false, reason: 'No legal parents.' };
        }

        var siblings = (FQ.getSiblings(childId) || []).map(function (s) { return s.siblingId; });
        var excludeIds = [childId].concat(siblings);

        return _openInlineCharacterPicker(
            'Add Adopted Sibling',
            { excludeIds: excludeIds },
            function (selected) {
                if (!selected || !_hasId(selected.id)) return;
                var currentYear = window.getCurrentYear();
                var added = 0, errors = [];

                for (var i = 0; i < legalParents.length; i++) {
                    var pid = legalParents[i];
                    var pps = CQ.getCharacterSummary(pid);
                    if (!pps) continue;
                    var role = pps.gender === 'male' ? 'father'
                        : pps.gender === 'female' ? 'mother' : 'parent';
                    var res = FC.setParent(selected.id, pid, {
                        parentType: 'legal', parentRole: role,
                        startYear: currentYear, allowReplace: false
                    });
                    if (res && res.success === true) added++;
                    else errors.push(pid);
                }

                if (added === 0) {
                    _showToast('Failed to add adopted sibling.', 'error');
                    return;
                }
                _showToast('Adopted sibling added' +
                    (errors.length > 0 ? ' (some parent edges failed)' : '.'),
                    errors.length > 0 ? 'warning' : 'success');
                if (typeof onSuccess === 'function') onSuccess();
            }
        );
    }

    function openAddFosterParentModal(childId, onSuccess) {
        if (!_hasId(childId)) return { success: false, reason: 'childId is required.' };

        var cs = CQ.getCharacterSummary(childId);
        if (!cs) return { success: false, reason: 'Character not found.' };
        if (typeof cs.birthYear !== 'number') {
            _showToast('Character has no birth year; cannot filter by age.', 'error');
            return { success: false, reason: 'No birth year.' };
        }

        var childBirthYear = cs.birthYear;
        var maxParentBirthYear = childBirthYear - MIN_PARENT_CHILD_AGE_GAP;

        var existingParents = FQ.getAllParentIds(childId) || [];
        var excludeIds = [childId].concat(existingParents);

        var filterFn = function (c) {
            if (typeof c.birthYear !== 'number') return false;
            return c.birthYear <= maxParentBirthYear;
        };

        return _openInlineCharacterPicker(
            'Add Foster Parent',
            {
                excludeIds: excludeIds,
                filterFn: filterFn,
                referenceYear: childBirthYear,
                referenceLabel: 'at birth',
                referenceFrame: 'parent'
            },
            function (selected) {
                if (!selected || !_hasId(selected.id)) return;
                var currentYear = window.getCurrentYear();
                var role = selected.gender === 'male' ? 'father'
                    : selected.gender === 'female' ? 'mother' : 'parent';

                var edgeResult = FC.createAdoption(childId, selected.id, {
                    parentRole: role, startYear: currentYear, notes: '',
                    biologicalParentsConsent: true
                });
                if (!edgeResult || edgeResult.success !== true) {
                    _showToast('Failed to add foster parent: ' +
                        (edgeResult && edgeResult.reason ? edgeResult.reason : 'unknown'), 'error');
                    return;
                }

                var metaResult = ChC.recordAdoptionMetadata(childId, selected.id, {
                    type: ChR.ADOPTION_TYPE.FOSTER, year: currentYear, notes: ''
                });
                if (!metaResult || metaResult.success !== true) {
                    FC.removeAdoption(childId, selected.id, {
                        endYear: currentYear, reason: 'adoption metadata failed'
                    });
                    _showToast('Failed to record foster metadata: ' +
                        (metaResult && metaResult.reason ? metaResult.reason : 'unknown'), 'error');
                    return;
                }

                _showToast('Foster parent added.', 'success');
                if (typeof onSuccess === 'function') onSuccess(metaResult.adoptionId);
            }
        );
    }

    function openAddGuardianModal(childId, onSuccess) {
        if (!_hasId(childId)) return { success: false, reason: 'childId is required.' };

        var cs = CQ.getCharacterSummary(childId);
        if (!cs) return { success: false, reason: 'Character not found.' };
        if (typeof cs.birthYear !== 'number') {
            _showToast('Character has no birth year; cannot filter by age.', 'error');
            return { success: false, reason: 'No birth year.' };
        }

        var childBirthYear = cs.birthYear;
        var maxParentBirthYear = childBirthYear - MIN_PARENT_CHILD_AGE_GAP;

        var existingParents = FQ.getAllParentIds(childId) || [];
        var excludeIds = [childId].concat(existingParents);

        var filterFn = function (c) {
            if (typeof c.birthYear !== 'number') return false;
            return c.birthYear <= maxParentBirthYear;
        };

        return _openInlineCharacterPicker(
            'Add Guardian',
            {
                excludeIds: excludeIds,
                filterFn: filterFn,
                referenceYear: childBirthYear,
                referenceLabel: 'at birth',
                referenceFrame: 'parent'
            },
            function (selected) {
                if (!selected || !_hasId(selected.id)) return;
                var currentYear = window.getCurrentYear();
                var role = selected.gender === 'male' ? 'father'
                    : selected.gender === 'female' ? 'mother' : 'parent';

                var edgeResult = FC.createAdoption(childId, selected.id, {
                    parentRole: role, startYear: currentYear, notes: '',
                    biologicalParentsConsent: true
                });
                if (!edgeResult || edgeResult.success !== true) {
                    _showToast('Failed to add guardian: ' +
                        (edgeResult && edgeResult.reason ? edgeResult.reason : 'unknown'), 'error');
                    return;
                }

                var metaResult = ChC.recordAdoptionMetadata(childId, selected.id, {
                    type: ChR.ADOPTION_TYPE.GUARDIANSHIP, year: currentYear, notes: ''
                });
                if (!metaResult || metaResult.success !== true) {
                    FC.removeAdoption(childId, selected.id, {
                        endYear: currentYear, reason: 'adoption metadata failed'
                    });
                    _showToast('Failed to record guardian metadata: ' +
                        (metaResult && metaResult.reason ? metaResult.reason : 'unknown'), 'error');
                    return;
                }

                _showToast('Guardian added.', 'success');
                if (typeof onSuccess === 'function') onSuccess(metaResult.adoptionId);
            }
        );
    }

    function openAddAdoptiveParentModal(childId, onSuccess) {
        if (!_hasId(childId)) return { success: false, reason: 'childId is required.' };

        var cs = CQ.getCharacterSummary(childId);
        if (!cs) return { success: false, reason: 'Character not found.' };
        if (typeof cs.birthYear !== 'number') {
            _showToast('Character has no birth year; cannot filter by age.', 'error');
            return { success: false, reason: 'No birth year.' };
        }

        var childBirthYear = cs.birthYear;
        var maxParentBirthYear = childBirthYear - MIN_PARENT_CHILD_AGE_GAP;

        var existingParents = FQ.getAllParentIds(childId) || [];
        var excludeIds = [childId].concat(existingParents);

        var filterFn = function (c) {
            if (typeof c.birthYear !== 'number') return false;
            return c.birthYear <= maxParentBirthYear;
        };

        return _openInlineCharacterPicker(
            'Add Adoptive Parent',
            {
                excludeIds: excludeIds,
                filterFn: filterFn,
                referenceYear: childBirthYear,
                referenceLabel: 'at birth',
                referenceFrame: 'parent'
            },
            function (selected) {
                if (!selected || !_hasId(selected.id)) return;
                var currentYear = window.getCurrentYear();
                var role = selected.gender === 'male' ? 'father'
                    : selected.gender === 'female' ? 'mother' : 'parent';

                var edgeResult = FC.createAdoption(childId, selected.id, {
                    parentRole: role, startYear: currentYear, notes: '',
                    biologicalParentsConsent: true
                });
                if (!edgeResult || edgeResult.success !== true) {
                    _showToast('Failed to add adoptive parent: ' +
                        (edgeResult && edgeResult.reason ? edgeResult.reason : 'unknown'), 'error');
                    return;
                }

                var metaResult = ChC.recordAdoptionMetadata(childId, selected.id, {
                    type: ChR.ADOPTION_TYPE.LEGAL, year: currentYear, notes: ''
                });
                if (!metaResult || metaResult.success !== true) {
                    FC.removeAdoption(childId, selected.id, {
                        endYear: currentYear, reason: 'adoption metadata failed'
                    });
                    _showToast('Failed to record adoptive parent metadata: ' +
                        (metaResult && metaResult.reason ? metaResult.reason : 'unknown'), 'error');
                    return;
                }

                _showToast('Adoptive parent added.', 'success');
                if (typeof onSuccess === 'function') onSuccess(metaResult.adoptionId);
            }
        );
    }

    // =========================================================================
    // EXPORTS
    // =========================================================================

    window.openCreateAdoptionModal = openCreateAdoptionModal;
    window.openEditAdoptionModal = openEditAdoptionModal;
    window.openEndAdoptionModal = openEndAdoptionModal;
    window.openAdoptionSearchModal = openAdoptionSearchModal;
    window.openSetBirthParentsModal = openSetBirthParentsModal;

    window.openAddAdoptedChildModal = openAddAdoptedChildModal;
    window.openAddFosterOrWardModal = openAddFosterOrWardModal;
    window.openAddAdoptedSiblingModal = openAddAdoptedSiblingModal;
    window.openAddFosterParentModal = openAddFosterParentModal;
    window.openAddGuardianModal = openAddGuardianModal;
    window.openAddAdoptiveParentModal = openAddAdoptiveParentModal;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            openCreateAdoptionModal: openCreateAdoptionModal,
            openEditAdoptionModal: openEditAdoptionModal,
            openEndAdoptionModal: openEndAdoptionModal,
            openAdoptionSearchModal: openAdoptionSearchModal,
            openSetBirthParentsModal: openSetBirthParentsModal,
            openAddAdoptedChildModal: openAddAdoptedChildModal,
            openAddFosterOrWardModal: openAddFosterOrWardModal,
            openAddAdoptedSiblingModal: openAddAdoptedSiblingModal,
            openAddFosterParentModal: openAddFosterParentModal,
            openAddGuardianModal: openAddGuardianModal,
            openAddAdoptiveParentModal: openAddAdoptiveParentModal
        };
    }
})();
