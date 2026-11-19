/**
 * =============================================================================
 * STILL WATERS - CHILDREN ADOPTION MODALS
 * (js/character/modals-children-adoption.js)
 * =============================================================================
 *
 * LOCATION: js/character/modals-children-adoption.js
 *
 * Adoption modals + family-tab bridge modals.
 *
 * SCOPE:
 *   Adoption flow:
 *     - openCreateAdoptionModal(childId, adopterId, onSuccess)
 *     - openEditAdoptionModal(adoptionId, onSuccess)
 *     - openEndAdoptionModal(adoptionId, onSuccess)
 *     - openAdoptionSearchModal(onSelect, options)
 *     - openSetBirthParentsModal(childId, fatherId, motherId, onSuccess)
 *
 *   Family-tab bridge (the six functions character-family-tab.js
 *   calls by name):
 *     - openSetParentModal(childId, role, onSuccess)
 *     - openAddExistingChildModal(parentId, childType, onSuccess)
 *     - openAddFosterOrWardModal(parentId, kind, onSuccess)
 *     - openAddExistingSiblingModal(childId, onSuccess)
 *     - openAddAdoptedSiblingModal(childId, onSuccess)
 *     - openGenerateBabyModal(parentId, onSuccess, options)
 *
 *   The bridge functions live here rather than in a separate file
 *   because every one of them delegates to FamilyCommands.setParent,
 *   ChildrenCommands.recordAdoptionMetadata, or openBirthModal — all
 *   primitives this file already imports. Adding them here keeps the
 *   mutation surface co-located with the modals that own it.
 *
 * ADOPTION FLOW:
 *   An adoption has two canonical parts:
 *     1. The legal parent edge        -> FamilyState
 *     2. The adoption metadata record -> ChildrenState
 *
 *   The create modal performs both, in order, with rollback on metadata
 *   failure. The edit modal updates metadata in place via
 *   ChildrenCommands.updateAdoptionMetadata. It does not touch the
 *   legal edge; changing the edge is the caller's responsibility. The
 *   end modal reverses both, in reverse order.
 *
 * OUT OF SCOPE:
 *   - Legal parent edge               -> FamilyCommands
 *   - Adoption metadata storage       -> ChildrenCommands
 *   - Surrogacy                       -> modals-children-surrogacy.js
 *   - Birth                           -> modals-children-birth.js
 *   - Legitimization                  -> deliberately not implemented
 *   - Presentation CSS                -> stylesheet (character-modals.css)
 *
 * CONTRACT:
 *   - UI only. Reads via CharacterQueries, ChildrenQueries, FamilyQueries.
 *     Mutates via FamilyCommands (edges) and ChildrenCommands (metadata).
 *   - No fallback for missing dependencies.
 *   - openSetBirthParentsModal passes ids to FamilyCommands.setParent
 *     with allowReplace: true when a biological parent already exists
 *     at the same role.
 *
 * SEARCH FILTER CONTRACT:
 *   The adoption-search modal filters candidates using
 *   CharacterQueries.getCharacterSummary projection fields. The
 *   canonical location field on the summary is `locationId`, NOT
 *   `currentLocationId`.
 *
 * INLINE STYLES:
 *   This file uses a small number of inline style attributes for
 *   one-off layout inside the search results list. The general policy
 *   is classes-only; the exceptions here are pragmatic and localized.
 *   Long-term these should move into character-modals.css; they do
 *   not affect correctness.
 *
 * DEPENDENCIES (REQUIRED):
 *   - formatting.js:             escapeHtml
 *   - icons.js:                  Icons
 *   - modals-core.js:            openModal, closeTopModal
 *   - time.js:                   getCurrentYear, isValidYear, calculateAge
 *   - CharacterQueries:          getCharacterSummary, getAllCharacters
 *   - ChildrenCommands:          recordAdoptionMetadata,
 *                                updateAdoptionMetadata,
 *                                endAdoptionMetadata
 *   - ChildrenQueries:           getAdoptionRecord,
 *                                getAdoptionsForChild,
 *                                getAdoptionRecordForPair
 *   - ChildrenRules:             ADOPTION_TYPE
 *   - FamilyCommands:            createAdoption, removeAdoption,
 *                                setParent
 *   - FamilyQueries:             getParentsByRole, getAllParentIds,
 *                                getBiologicalParentIds, getLegalParentIds
 *
 * DEPENDENCIES (OPTIONAL, required for specific routes):
 *   - selectors/modals-char-selector.js (openCharacterSelector)
 *   - modals-children-birth.js (openBirthModal) — for openGenerateBabyModal
 *
 * ICON POLICY: SVG from icons.js. No emojis.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision (family-tab bridge, full):
 *     - Added the six family-tab bridge functions that were advertised
 *       in the previous revision's header but never actually defined.
 *       The previous revision's export block was missing all six
 *       assignments, so character-family-tab.js's every add/set
 *       button rendered disabled with a "modal not loaded" tooltip.
 *
 *     - Added _openInlineCharacterPicker, a local helper used by all
 *       six bridge functions. It renders a search input and a
 *       scrollable list of characters, filtered by the caller's
 *       excludeIds and gender, and passes the selected summary to the
 *       caller's onSelect. This is a local picker, not a delegation to
 *       window.openCharacterSelector, because the picker needs
 *       per-function filtering (e.g. only living males, only females,
 *       excluding the current character).
 *
 *     - openGenerateBabyModal resolves mother/father from the parent
 *       character's gender, prompts for the missing partner if absent,
 *       and then delegates to window.openBirthModal (from
 *       modals-children-birth.js). It does NOT duplicate the birth
 *       flow.
 *
 *     - openAddExistingSiblingModal finds the child's biological
 *       parents and adds the picked character as their biological
 *       child for each parent. openAddAdoptedSiblingModal does the
 *       same for legal parents.
 *
 *     - No existing export changed shape. Every prior function is
 *       byte-for-byte identical.
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
                'modals-children-adoption.js: missing required dependencies: ' +
                missing.join(', ')
            );
        }
        if (typeof window.Icons === 'undefined') {
            throw new Error('modals-children-adoption.js: icons.js must load first.');
        }
        if (typeof window.CharacterQueries === 'undefined') {
            throw new Error('modals-children-adoption.js: character-queries.js must load first.');
        }
        if (typeof window.ChildrenCommands === 'undefined') {
            throw new Error('modals-children-adoption.js: children-commands.js must load first.');
        }
        if (typeof window.ChildrenQueries === 'undefined') {
            throw new Error('modals-children-adoption.js: children-queries.js must load first.');
        }
        if (typeof window.ChildrenRules === 'undefined') {
            throw new Error('modals-children-adoption.js: children-rules.js must load first.');
        }
        if (typeof window.FamilyCommands === 'undefined') {
            throw new Error('modals-children-adoption.js: family-commands.js must load first.');
        }
        if (typeof window.FamilyQueries === 'undefined') {
            throw new Error('modals-children-adoption.js: family-queries.js must load first.');
        }
    }

    _requireDependencies();

    var CQ = window.CharacterQueries;
    var ChC = window.ChildrenCommands;
    var ChQ = window.ChildrenQueries;
    var ChR = window.ChildrenRules;
    var FC = window.FamilyCommands;
    var FQ = window.FamilyQueries;

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

    function _readSummary(id) {
        if (!_hasId(id)) return null;
        return CQ.getCharacterSummary(id);
    }

    function _fullName(summary) {
        if (!summary) return '';
        return (summary.fullName || summary.name || '').trim();
    }

    function _requireSelector() {
        if (typeof window.openCharacterSelector !== 'function') {
            throw new Error(
                'modals-children-adoption.js: character selector ' +
                '(openCharacterSelector) is required.'
            );
        }
        return window.openCharacterSelector;
    }

    function _showToast(msg, type) {
        if (typeof window.showToast === 'function') {
            try { window.showToast(msg, type || 'info'); } catch (e) { /* non-fatal */ }
        } else if (typeof console !== 'undefined' && console.warn) {
            console.warn('[adoption-modal] ' + (type || 'info') + ': ' + msg);
        }
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
            html += '<option value="' + _esc(options[i].id) + '"' + sel + '>'
                  + _esc(options[i].label)
                  + '</option>';
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
            html += '<option value="' + _esc(options[i].id) + '"' + sel + '>'
                  + _esc(options[i].label)
                  + '</option>';
        }
        return html;
    }

    // =========================================================================
    // 1b. INLINE CHARACTER PICKER (shared by the six bridge modals)
    // =========================================================================
    //
    // A self-contained picker used by the family-tab bridge functions.
    // Renders a search box and a scrollable list of living characters,
    // filtered by excludeIds and (optionally) gender. Does not depend on
    // window.openCharacterSelector, so it works in isolation.

    function _openInlineCharacterPicker(title, pickerOpts, onSelect) {
        pickerOpts = pickerOpts || {};
        var excludeIds = Array.isArray(pickerOpts.excludeIds)
            ? pickerOpts.excludeIds
            : [];
        var genderFilter = pickerOpts.gender || null;

        var listId = 'inline-pick-list';
        var searchId = 'inline-pick-search';

        var content = '<div class="character-modal">'
            + '<input type="search" id="' + searchId + '" '
            + 'class="character-modal__form-input" '
            + 'placeholder="Search characters…" autocomplete="off">'
            + '<div id="' + listId + '" class="character-tab-history" '
            + 'style="max-height:240px;overflow-y:auto;margin-top:8px;">'
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
                    var html = '';
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

                        var name = ((summary.name || '') + ' ' +
                                    (summary.surname || '')).trim();
                        if (lower.length > 0
                            && name.toLowerCase().indexOf(lower) === -1) {
                            continue;
                        }
                        var meta = [];
                        if (typeof summary.age === 'number') {
                            meta.push(summary.age + 'y');
                        }
                        if (summary.gender) meta.push(summary.gender);
                        var metaStr = meta.length > 0 ? ' · ' + meta.join(' · ') : '';

                        html += '<div class="character-tab-history__row" '
                            + 'data-character-id="' + _esc(c.id) + '" '
                            + 'style="cursor:pointer;">'
                            + '<div class="character-tab-history__main">'
                            + '<span class="character-tab-history__value">'
                            + _esc(name || c.id)
                            + '</span>'
                            + '<span class="character-tab-history__reason">'
                            + _esc(metaStr)
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
    // 2. CREATE ADOPTION MODAL
    // =========================================================================

    function openCreateAdoptionModal(childId, adopterId, onSuccess) {
        var child = _readSummary(childId);
        if (!child) {
            return { success: false, reason: 'Child not found.' };
        }
        if (child.isDeceased === true) {
            return { success: false, reason: 'Child is deceased.' };
        }

        var adopter = _readSummary(adopterId);
        if (!adopter) {
            return { success: false, reason: 'Adopter not found.' };
        }
        if (adopter.isDeceased === true) {
            return { success: false, reason: 'Adopter is deceased.' };
        }
        if (adopterId === childId) {
            return { success: false, reason: 'Cannot adopt oneself.' };
        }

        var currentYear = window.getCurrentYear();
        var existing = ChQ.getAdoptionRecordForPair(adopterId, childId);
        if (existing && existing.status === 'active') {
            return {
                success: false,
                reason: 'An active adoption already exists for this pair.'
            };
        }

        var content = '<div class="character-modal">';

        content += '<div class="character-modal__section">'
                 + '<strong>Child: ' + _esc(_fullName(child)) + '</strong>'
                 + '<br>' + _esc(child.age === null ? 'Unknown age' : child.age + ' years')
                 + '<br><strong>Adopter: ' + _esc(_fullName(adopter)) + '</strong>'
                 + '<br>' + _esc(adopter.age === null ? 'Unknown age' : adopter.age + ' years')
                 + ' &middot; ' + _esc(adopter.gender || 'Unknown')
                 + '</div>';

        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="adoption-type">Type</label>'
                 + '<select id="adoption-type" class="character-modal__form-input">'
                 + _typeOptionsHtml(ChR.ADOPTION_TYPE.LEGAL)
                 + '</select>'
                 + '</div>';

        content += '<div class="character-modal__grid">';
        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="adoption-role">Role</label>'
                 + '<select id="adoption-role" class="character-modal__form-input">'
                 + '<option value="father">Father</option>'
                 + '<option value="mother">Mother</option>'
                 + '<option value="parent">Parent</option>'
                 + '</select>'
                 + '</div>';
        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="adoption-year">Year</label>'
                 + '<input type="number" id="adoption-year" class="character-modal__form-input" '
                 + 'value="' + _esc(currentYear) + '" '
                 + 'min="1" max="' + (currentYear + 10) + '">'
                 + '</div>';
        content += '</div>';

        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="adoption-notes">Notes</label>'
                 + '<textarea id="adoption-notes" class="character-modal__form-input" rows="2"></textarea>'
                 + '</div>';

        content += '</div>';

        var modal = window.openModal({
            titleHtml: 'Adoption: ' + _esc(child.name || ''),
            contentHtml: content,
            confirmText: 'Record Adoption',
            cancelText: 'Cancel',
            onConfirm: function () {
                var typeEl = modal.element.querySelector('#adoption-type');
                var roleEl = modal.element.querySelector('#adoption-role');
                var yearEl = modal.element.querySelector('#adoption-year');
                var notesEl = modal.element.querySelector('#adoption-notes');

                var type = typeEl.value;
                var role = roleEl.value;
                var year = parseInt(yearEl.value, 10);
                if (!Number.isInteger(year) || !window.isValidYear(year)) {
                    throw new Error('Please enter a valid year.');
                }

                var edgeResult = FC.createAdoption(childId, adopterId, {
                    parentRole: role,
                    startYear: year,
                    notes: notesEl.value || '',
                    biologicalParentsConsent: true
                });
                if (!edgeResult || edgeResult.success !== true) {
                    throw new Error(edgeResult && edgeResult.reason
                        ? edgeResult.reason
                        : 'Failed to create legal parent edge.');
                }

                var metaResult = ChC.recordAdoptionMetadata(childId, adopterId, {
                    type: type,
                    year: year,
                    notes: notesEl.value || ''
                });
                if (!metaResult || metaResult.success !== true) {
                    FC.removeAdoption(childId, adopterId, {
                        endYear: year,
                        reason: 'adoption metadata failed'
                    });
                    throw new Error(metaResult && metaResult.reason
                        ? metaResult.reason
                        : 'Failed to record adoption metadata.');
                }

                if (typeof onSuccess === 'function') {
                    onSuccess(metaResult.adoptionId);
                }
            }
        });

        return { success: true, modal: modal };
    }

    // =========================================================================
    // 3. EDIT ADOPTION MODAL
    // =========================================================================

    function openEditAdoptionModal(adoptionId, onSuccess) {
        if (!_hasId(adoptionId)) {
            return { success: false, reason: 'adoptionId is required.' };
        }

        var record = ChQ.getAdoptionRecord(adoptionId);
        if (!record) {
            return { success: false, reason: 'Adoption record not found.' };
        }

        var child = _readSummary(record.childId);
        var adopter = _readSummary(record.adopterId);

        var currentYear = window.getCurrentYear();

        var content = '<div class="character-modal">';

        content += '<div class="character-modal__section">'
                 + '<strong>' + _esc(_fullName(child) || record.childId) + '</strong>'
                 + ' &middot; '
                 + _esc(_fullName(adopter) || record.adopterId)
                 + '<br>'
                 + _esc(_typeLabel(record.type))
                 + ' since ' + _esc(record.year)
                 + '</div>';

        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="edit-adoption-type">Type</label>'
                 + '<select id="edit-adoption-type" class="character-modal__form-input">'
                 + _typeOptionsHtml(record.type)
                 + '</select>'
                 + '</div>';

        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="edit-adoption-status">Status</label>'
                 + '<select id="edit-adoption-status" class="character-modal__form-input">'
                 + _statusOptionsHtml(record.status)
                 + '</select>'
                 + '</div>';

        content += '<div class="character-modal__grid">';
        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="edit-adoption-year">Year</label>'
                 + '<input type="number" id="edit-adoption-year" class="character-modal__form-input" '
                 + 'value="' + _esc(record.year) + '" '
                 + 'min="1" max="' + currentYear + '">'
                 + '</div>';
        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="edit-adoption-end-year">End Year</label>'
                 + '<input type="number" id="edit-adoption-end-year" class="character-modal__form-input" '
                 + 'value="' + _esc(record.endYear === null ? '' : record.endYear) + '" '
                 + 'min="' + record.year + '" max="' + (currentYear + 10) + '">'
                 + '</div>';
        content += '</div>';

        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="edit-adoption-notes">Notes</label>'
                 + '<textarea id="edit-adoption-notes" class="character-modal__form-input" rows="2">'
                 + _esc(record.notes || '')
                 + '</textarea>'
                 + '</div>';

        content += '</div>';

        var modal = window.openModal({
            titleHtml: 'Edit Adoption',
            contentHtml: content,
            confirmText: 'Save',
            cancelText: 'Cancel',
            onConfirm: function () {
                var typeEl = modal.element.querySelector('#edit-adoption-type');
                var statusEl = modal.element.querySelector('#edit-adoption-status');
                var yearEl = modal.element.querySelector('#edit-adoption-year');
                var endYearEl = modal.element.querySelector('#edit-adoption-end-year');
                var notesEl = modal.element.querySelector('#edit-adoption-notes');

                var patch = {};

                if (typeEl.value !== record.type) patch.type = typeEl.value;
                if (statusEl.value !== record.status) patch.status = statusEl.value;

                var year = parseInt(yearEl.value, 10);
                if (Number.isInteger(year) && year !== record.year) {
                    patch.year = year;
                }

                var endYearRaw = endYearEl.value.trim();
                if (endYearRaw === '') {
                    if (record.endYear !== null) patch.endYear = null;
                } else {
                    var endYear = parseInt(endYearRaw, 10);
                    if (Number.isInteger(endYear) && endYear !== record.endYear) {
                        patch.endYear = endYear;
                    }
                }

                if (notesEl.value !== (record.notes || '')) {
                    patch.notes = notesEl.value;
                }

                if (Object.keys(patch).length === 0) {
                    return; // No changes.
                }

                var result = ChC.updateAdoptionMetadata(adoptionId, patch);
                if (!result || result.success !== true) {
                    throw new Error(result && result.reason
                        ? result.reason
                        : 'Failed to update adoption metadata.');
                }

                if (typeof onSuccess === 'function') {
                    onSuccess(adoptionId);
                }
            }
        });

        return { success: true, modal: modal };
    }

    // =========================================================================
    // 4. END ADOPTION MODAL
    // =========================================================================

    function openEndAdoptionModal(adoptionId, onSuccess) {
        if (!_hasId(adoptionId)) {
            return { success: false, reason: 'adoptionId is required.' };
        }

        var record = ChQ.getAdoptionRecord(adoptionId);
        if (!record) {
            return { success: false, reason: 'Adoption record not found.' };
        }
        if (record.status !== 'active') {
            return { success: false, reason: 'Adoption is not active.' };
        }

        var child = _readSummary(record.childId);
        var adopter = _readSummary(record.adopterId);
        var currentYear = window.getCurrentYear();

        var content = '<div class="character-modal">';

        content += '<div class="character-modal__section">'
                 + 'End the adoption between '
                 + _esc(_fullName(child) || record.childId)
                 + ' and '
                 + _esc(_fullName(adopter) || record.adopterId)
                 + '?</div>';

        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="end-adoption-year">'
                 + 'End Year</label>'
                 + '<input type="number" id="end-adoption-year" class="character-modal__form-input" '
                 + 'value="' + _esc(currentYear) + '" '
                 + 'min="' + record.year + '" '
                 + 'max="' + (currentYear + 10) + '">'
                 + '</div>';

        content += '</div>';

        var modal = window.openModal({
            titleHtml: 'End Adoption',
            contentHtml: content,
            confirmText: 'End Adoption',
            cancelText: 'Cancel',
            onConfirm: function () {
                var yearEl = modal.element.querySelector('#end-adoption-year');
                var endYear = parseInt(yearEl.value, 10);
                if (!Number.isInteger(endYear) || !window.isValidYear(endYear)) {
                    throw new Error('Please enter a valid end year.');
                }

                var metaResult = ChC.endAdoptionMetadata(adoptionId, {
                    endYear: endYear
                });
                if (!metaResult || metaResult.success !== true) {
                    throw new Error(metaResult && metaResult.reason
                        ? metaResult.reason
                        : 'Failed to end adoption metadata.');
                }

                var edgeResult = FC.removeAdoption(record.childId, record.adopterId, {
                    endYear: endYear,
                    reason: 'adoption ended'
                });
                if (!edgeResult || edgeResult.success !== true) {
                    throw new Error(edgeResult && edgeResult.reason
                        ? edgeResult.reason
                        : 'Failed to remove legal parent edge.');
                }

                if (typeof onSuccess === 'function') {
                    onSuccess(adoptionId);
                }
            }
        });

        return { success: true, modal: modal };
    }

    // =========================================================================
    // 5. ADOPTION SEARCH MODAL
    // =========================================================================

    function openAdoptionSearchModal(onSelect, options) {
        if (typeof onSelect !== 'function') {
            throw new Error('openAdoptionSearchModal requires an onSelect callback.');
        }
        if (_isMissing(options)) options = {};

        var initialMinAge = typeof options.minAge === 'number' ? options.minAge : 0;
        var initialMaxAge = typeof options.maxAge === 'number' ? options.maxAge : 200;
        var initialGender = options.gender && options.gender !== 'all'
            ? options.gender
            : 'all';
        var initialLocationId = options.locationId && options.locationId !== 'all'
            ? options.locationId
            : 'all';
        var initialStatus = options.status && options.status !== 'all'
            ? options.status
            : 'all';

        var currentFilter = {
            minAge: initialMinAge,
            maxAge: initialMaxAge,
            gender: initialGender,
            locationId: initialLocationId,
            status: initialStatus
        };

        var locationOptions = '<option value="all">All Locations</option>';
        var seenLocations = {};
        var allForLocations = CQ.getAllCharacters();
        for (var li = 0; li < allForLocations.length; li++) {
            var c = allForLocations[li];
            if (!_hasId(c.locationId)) continue;
            if (seenLocations[c.locationId]) continue;
            seenLocations[c.locationId] = true;
            locationOptions += '<option value="' + _esc(c.locationId) + '">'
                            + _esc(c.locationId)
                            + '</option>';
        }

        function passesFilters(candidate) {
            if (candidate.isDeceased === true) return false;
            if (candidate.isDeleted === true) return false;

            if (currentFilter.gender !== 'all'
                && candidate.gender !== currentFilter.gender) {
                return false;
            }

            if (currentFilter.locationId !== 'all'
                && candidate.locationId !== currentFilter.locationId) {
                return false;
            }

            if (typeof candidate.age === 'number') {
                if (candidate.age < currentFilter.minAge) return false;
                if (candidate.age > currentFilter.maxAge) return false;
            }

            var bioParentIds = FQ.getBiologicalParentIds(candidate.id);
            var legalParentIds = FQ.getLegalParentIds(candidate.id);

            if (currentFilter.status === 'orphan') {
                var hasLivingBio = false;
                for (var i = 0; i < bioParentIds.length; i++) {
                    var bp = _readSummary(bioParentIds[i]);
                    if (bp && bp.isDeceased !== true) {
                        hasLivingBio = true;
                        break;
                    }
                }
                if (hasLivingBio) return false;

                var hasLivingLegal = false;
                for (var j = 0; j < legalParentIds.length; j++) {
                    var lp = _readSummary(legalParentIds[j]);
                    if (lp && lp.isDeceased !== true) {
                        hasLivingLegal = true;
                        break;
                    }
                }
                if (hasLivingLegal) return false;
            } else if (currentFilter.status === 'has_living_parents') {
                var anyLiving = false;
                for (var k = 0; k < bioParentIds.length; k++) {
                    var bp2 = _readSummary(bioParentIds[k]);
                    if (bp2 && bp2.isDeceased !== true) {
                        anyLiving = true;
                        break;
                    }
                }
                if (!anyLiving) {
                    for (var m = 0; m < legalParentIds.length; m++) {
                        var lp2 = _readSummary(legalParentIds[m]);
                        if (lp2 && lp2.isDeceased !== true) {
                            anyLiving = true;
                            break;
                        }
                    }
                }
                if (!anyLiving) return false;
            } else if (currentFilter.status === 'in_foster') {
                var adoptions = ChQ.getActiveAdoptionsForChild(candidate.id);
                var inFoster = false;
                for (var n = 0; n < adoptions.length; n++) {
                    if (adoptions[n].type === ChR.ADOPTION_TYPE.FOSTER) {
                        inFoster = true;
                        break;
                    }
                }
                if (!inFoster) return false;
            }

            return true;
        }

        function findMatches() {
            var all = CQ.getAllCharacters() || [];
            var out = [];
            for (var i = 0; i < all.length; i++) {
                var summary = null;
                try { summary = CQ.getCharacterSummary(all[i].id); }
                catch (e) { summary = null; }
                if (!summary) continue;
                if (passesFilters(summary)) out.push(summary);
            }
            return out;
        }

        function renderRows(matches) {
            if (matches.length === 0) {
                return '<div class="character-tab-empty">No matching characters.</div>';
            }
            var html = '';
            for (var i = 0; i < matches.length; i++) {
                var m = matches[i];
                var name = ((m.name || '') + ' ' + (m.surname || '')).trim();
                var meta = [];
                if (typeof m.age === 'number') meta.push(m.age + 'y');
                if (m.gender) meta.push(m.gender);
                var metaStr = meta.length > 0 ? ' · ' + meta.join(' · ') : '';
                html += '<div class="character-tab-history__row" '
                    + 'data-character-id="' + _esc(m.id) + '" '
                    + 'style="cursor:pointer;">'
                    + '<div class="character-tab-history__main">'
                    + '<span class="character-tab-history__value">'
                    + _esc(name || m.id)
                    + '</span>'
                    + '<span class="character-tab-history__reason">'
                    + _esc(metaStr)
                    + '</span>'
                    + '</div>'
                    + '</div>';
            }
            return html;
        }

        var content = '<div class="character-modal">'
            + '<div class="character-modal__grid">'
            + '<div class="character-modal__form-field">'
            + '<label class="character-modal__form-label" for="search-min-age">Min Age</label>'
            + '<input type="number" id="search-min-age" class="character-modal__form-input" '
            + 'value="' + _esc(initialMinAge) + '" min="0">'
            + '</div>'
            + '<div class="character-modal__form-field">'
            + '<label class="character-modal__form-label" for="search-max-age">Max Age</label>'
            + '<input type="number" id="search-max-age" class="character-modal__form-input" '
            + 'value="' + _esc(initialMaxAge) + '" min="0">'
            + '</div>'
            + '</div>'
            + '<div class="character-modal__grid">'
            + '<div class="character-modal__form-field">'
            + '<label class="character-modal__form-label" for="search-gender">Gender</label>'
            + '<select id="search-gender" class="character-modal__form-input">'
            + '<option value="all"' + (initialGender === 'all' ? ' selected' : '') + '>All</option>'
            + '<option value="male"' + (initialGender === 'male' ? ' selected' : '') + '>Male</option>'
            + '<option value="female"' + (initialGender === 'female' ? ' selected' : '') + '>Female</option>'
            + '</select>'
            + '</div>'
            + '<div class="character-modal__form-field">'
            + '<label class="character-modal__form-label" for="search-status">Status</label>'
            + '<select id="search-status" class="character-modal__form-input">'
            + '<option value="all"' + (initialStatus === 'all' ? ' selected' : '') + '>All</option>'
            + '<option value="orphan"' + (initialStatus === 'orphan' ? ' selected' : '') + '>Orphans</option>'
            + '<option value="has_living_parents"' + (initialStatus === 'has_living_parents' ? ' selected' : '') + '>Has Living Parents</option>'
            + '<option value="in_foster"' + (initialStatus === 'in_foster' ? ' selected' : '') + '>In Foster Care</option>'
            + '</select>'
            + '</div>'
            + '</div>'
            + '<div class="character-modal__form-field">'
            + '<label class="character-modal__form-label" for="search-location">Location</label>'
            + '<select id="search-location" class="character-modal__form-input">'
            + locationOptions
            + '</select>'
            + '</div>'
            + '<div id="search-results" class="character-tab-history" '
            + 'style="max-height:240px;overflow-y:auto;margin-top:8px;">'
            + '</div>'
            + '</div>';

        var selectedId = null;

        var modal = window.openModal({
            titleHtml: 'Search Adoption Candidates',
            contentHtml: content,
            confirmText: 'Select',
            cancelText: 'Cancel',
            onOpen: function (modalElement) {
                var resultsEl = modalElement.querySelector('#search-results');
                var minAgeEl = modalElement.querySelector('#search-min-age');
                var maxAgeEl = modalElement.querySelector('#search-max-age');
                var genderEl = modalElement.querySelector('#search-gender');
                var statusEl = modalElement.querySelector('#search-status');
                var locationEl = modalElement.querySelector('#search-location');

                function refresh() {
                    currentFilter.minAge = parseInt(minAgeEl.value, 10) || 0;
                    currentFilter.maxAge = parseInt(maxAgeEl.value, 10) || 200;
                    currentFilter.gender = genderEl.value;
                    currentFilter.status = statusEl.value;
                    currentFilter.locationId = locationEl.value;
                    var matches = findMatches();
                    resultsEl.innerHTML = renderRows(matches);
                }

                minAgeEl.addEventListener('input', refresh);
                maxAgeEl.addEventListener('input', refresh);
                genderEl.addEventListener('change', refresh);
                statusEl.addEventListener('change', refresh);
                locationEl.addEventListener('change', refresh);

                refresh();

                resultsEl.addEventListener('click', function (e) {
                    var row = e.target.closest('[data-character-id]');
                    if (!row) return;
                    var rows = resultsEl.querySelectorAll('.character-tab-history__row');
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

        return { success: true, modal: modal };
    }

    // =========================================================================
    // 6. SET BIRTH PARENTS MODAL
    // =========================================================================

    function openSetBirthParentsModal(childId, fatherId, motherId, onSuccess) {
        if (!_hasId(childId)) {
            return { success: false, reason: 'childId is required.' };
        }

        var child = _readSummary(childId);
        if (!child) {
            return { success: false, reason: 'Child not found.' };
        }

        var currentYear = window.getCurrentYear();

        var father = fatherId ? _readSummary(fatherId) : null;
        var mother = motherId ? _readSummary(motherId) : null;

        var fatherName = father ? _fullName(father) : 'None';
        var motherName = mother ? _fullName(mother) : 'None';

        var content = '<div class="character-modal">';

        content += '<div class="character-modal__section">'
                 + '<strong>' + _esc(_fullName(child)) + '</strong>'
                 + '</div>';

        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label">Father</label>'
                 + '<div style="display:flex;gap:8px;align-items:center;">'
                 + '<button type="button" class="btn" data-action="select-father">Select</button>'
                 + '<span id="sbp-father-name">' + _esc(fatherName) + '</span>'
                 + '<button type="button" class="btn" data-action="clear-father">Clear</button>'
                 + '</div>'
                 + '</div>';

        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label">Mother</label>'
                 + '<div style="display:flex;gap:8px;align-items:center;">'
                 + '<button type="button" class="btn" data-action="select-mother">Select</button>'
                 + '<span id="sbp-mother-name">' + _esc(motherName) + '</span>'
                 + '<button type="button" class="btn" data-action="clear-mother">Clear</button>'
                 + '</div>'
                 + '</div>';

        content += '</div>';

        var newFatherId = fatherId || null;
        var newMotherId = motherId || null;

        var modal = window.openModal({
            titleHtml: 'Set Birth Parents',
            contentHtml: content,
            confirmText: 'Save',
            cancelText: 'Cancel',
            onOpen: function (modalElement) {
                modalElement.addEventListener('click', function (e) {
                    var btn = e.target.closest('[data-action]');
                    if (!btn) return;
                    var action = btn.getAttribute('data-action');
                    var openSelector = _requireSelector();

                    if (action === 'select-father') {
                        openSelector({
                            title: 'Select Father',
                            filters: { gender: 'male' },
                            excludeIds: [childId],
                            onSelect: function (selected) {
                                if (!selected || !_hasId(selected.id)) return;
                                newFatherId = selected.id;
                                var el = modalElement.querySelector('#sbp-father-name');
                                if (el) el.textContent = _fullName(selected);
                            }
                        });
                    } else if (action === 'clear-father') {
                        newFatherId = null;
                        var el2 = modalElement.querySelector('#sbp-father-name');
                        if (el2) el2.textContent = 'None';
                    } else if (action === 'select-mother') {
                        openSelector({
                            title: 'Select Mother',
                            filters: { gender: 'female' },
                            excludeIds: [childId],
                            onSelect: function (selected) {
                                if (!selected || !_hasId(selected.id)) return;
                                newMotherId = selected.id;
                                var el = modalElement.querySelector('#sbp-mother-name');
                                if (el) el.textContent = _fullName(selected);
                            }
                        });
                    } else if (action === 'clear-mother') {
                        newMotherId = null;
                        var el2 = modalElement.querySelector('#sbp-mother-name');
                        if (el2) el2.textContent = 'None';
                    }
                });
            },
            onConfirm: function () {
                var current = FQ.getParentsByRole(childId);
                var existingFatherId = current.fathers.length > 0
                    ? current.fathers[0].parentId : null;
                var existingMotherId = current.mothers.length > 0
                    ? current.mothers[0].parentId : null;

                var errors = [];

                if (newFatherId !== existingFatherId) {
                    if (newFatherId) {
                        var r1 = FC.setParent(childId, newFatherId, {
                            parentType: 'biological',
                            parentRole: 'father',
                            startYear: currentYear,
                            allowReplace: true
                        });
                        if (!r1 || r1.success !== true) {
                            errors.push('Father: ' + (r1 && r1.reason ? r1.reason : 'unknown'));
                        }
                    } else if (existingFatherId) {
                        var r2 = FC.removeBiologicalParentAtRole(childId, 'father', {
                            endYear: currentYear,
                            reason: 'removed via birth parents modal'
                        });
                        if (!r2 || r2.success !== true) {
                            errors.push('Father: ' + (r2 && r2.reason ? r2.reason : 'unknown'));
                        }
                    }
                }

                if (newMotherId !== existingMotherId) {
                    if (newMotherId) {
                        var r3 = FC.setParent(childId, newMotherId, {
                            parentType: 'biological',
                            parentRole: 'mother',
                            startYear: currentYear,
                            allowReplace: true
                        });
                        if (!r3 || r3.success !== true) {
                            errors.push('Mother: ' + (r3 && r3.reason ? r3.reason : 'unknown'));
                        }
                    } else if (existingMotherId) {
                        var r4 = FC.removeBiologicalParentAtRole(childId, 'mother', {
                            endYear: currentYear,
                            reason: 'removed via birth parents modal'
                        });
                        if (!r4 || r4.success !== true) {
                            errors.push('Mother: ' + (r4 && r4.reason ? r4.reason : 'unknown'));
                        }
                    }
                }

                if (errors.length > 0) {
                    throw new Error(errors.join('; '));
                }

                if (typeof onSuccess === 'function') {
                    onSuccess();
                }
            }
        });

        return { success: true, modal: modal };
    }

    // =========================================================================
    // 7. FAMILY-TAB BRIDGE — openSetParentModal
    // =========================================================================

    function openSetParentModal(childId, role, onSuccess) {
        if (!_hasId(childId)) {
            return { success: false, reason: 'childId is required.' };
        }
        if (role !== 'father' && role !== 'mother' && role !== 'parent') {
            return { success: false, reason: 'role must be father, mother, or parent.' };
        }

        var genderFilter = role === 'father' ? 'male'
            : role === 'mother' ? 'female'
            : null;

        return _openInlineCharacterPicker(
            'Set ' + role.charAt(0).toUpperCase() + role.slice(1),
            { excludeIds: [childId], gender: genderFilter },
            function (selected) {
                if (!selected || !_hasId(selected.id)) return;

                var currentYear = window.getCurrentYear();
                var existing = FQ.getParentsByRole(childId);
                var roleHasParent = false;
                if (role === 'father') roleHasParent = existing.fathers.length > 0;
                else if (role === 'mother') roleHasParent = existing.mothers.length > 0;
                else roleHasParent = existing.others.length > 0;

                var result = FC.setParent(childId, selected.id, {
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
    // 8. FAMILY-TAB BRIDGE — openAddExistingChildModal
    // =========================================================================

    function openAddExistingChildModal(parentId, childType, onSuccess) {
        if (!_hasId(parentId)) {
            return { success: false, reason: 'parentId is required.' };
        }
        var validTypes = ['biological', 'adopted', 'foster', 'guardianship'];
        if (validTypes.indexOf(childType) === -1) {
            return { success: false, reason: 'Invalid childType: ' + childType };
        }

        var parentSummary = _readSummary(parentId);
        if (!parentSummary) {
            return { success: false, reason: 'Parent not found.' };
        }

        var role = parentSummary.gender === 'male' ? 'father'
            : parentSummary.gender === 'female' ? 'mother'
            : 'parent';

        var parentType = childType === 'biological' ? 'biological' : 'legal';

        return _openInlineCharacterPicker(
            'Add ' + childType + ' child',
            { excludeIds: [parentId] },
            function (selected) {
                if (!selected || !_hasId(selected.id)) return;

                var currentYear = window.getCurrentYear();

                var result = FC.setParent(selected.id, parentId, {
                    parentType: parentType,
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

                if (childType === 'adopted'
                    || childType === 'foster'
                    || childType === 'guardianship') {
                    var adoptionType = childType === 'adopted'
                        ? ChR.ADOPTION_TYPE.LEGAL
                        : childType === 'foster'
                            ? ChR.ADOPTION_TYPE.FOSTER
                            : ChR.ADOPTION_TYPE.GUARDIANSHIP;

                    var metaResult = ChC.recordAdoptionMetadata(
                        selected.id, parentId,
                        {
                            type: adoptionType,
                            year: currentYear,
                            notes: ''
                        }
                    );
                    if (!metaResult || metaResult.success !== true) {
                        _showToast(
                            'Parent edge added but adoption metadata failed: ' +
                            (metaResult && metaResult.reason
                                ? metaResult.reason
                                : 'unknown'),
                            'warning'
                        );
                    }
                }

                _showToast(
                    childType.charAt(0).toUpperCase()
                    + childType.slice(1) + ' child added.',
                    'success'
                );
                if (typeof onSuccess === 'function') onSuccess(result.data);
            }
        );
    }

    // =========================================================================
    // 9. FAMILY-TAB BRIDGE — openAddFosterOrWardModal
    // =========================================================================

    function openAddFosterOrWardModal(parentId, kind, onSuccess) {
        if (kind !== 'foster' && kind !== 'guardianship') {
            return { success: false, reason: 'kind must be foster or guardianship.' };
        }
        return openAddExistingChildModal(parentId, kind, onSuccess);
    }

    // =========================================================================
    // 10. FAMILY-TAB BRIDGE — openAddExistingSiblingModal
    // =========================================================================

    function openAddExistingSiblingModal(childId, onSuccess) {
        if (!_hasId(childId)) {
            return { success: false, reason: 'childId is required.' };
        }

        var child = _readSummary(childId);
        if (!child) {
            return { success: false, reason: 'Character not found.' };
        }

        var bioParents = FQ.getBiologicalParentIds(childId);
        if (bioParents.length === 0) {
            return {
                success: false,
                reason: 'This character has no biological parents to share. ' +
                        'Add the parents first, then come back.'
            };
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
                    var parentSummary = _readSummary(parentId);
                    if (!parentSummary) continue;

                    var role = parentSummary.gender === 'male' ? 'father'
                        : parentSummary.gender === 'female' ? 'mother'
                        : 'parent';

                    var result = FC.setParent(selected.id, parentId, {
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
    // 11. FAMILY-TAB BRIDGE — openAddAdoptedSiblingModal
    // =========================================================================

    function openAddAdoptedSiblingModal(childId, onSuccess) {
        if (!_hasId(childId)) {
            return { success: false, reason: 'childId is required.' };
        }

        var child = _readSummary(childId);
        if (!child) {
            return { success: false, reason: 'Character not found.' };
        }

        var legalParents = FQ.getLegalParentIds(childId);
        if (legalParents.length === 0) {
            return {
                success: false,
                reason: 'This character has no adopting parents to share. ' +
                        'Add an adopted child first, then come back.'
            };
        }

        return _openInlineCharacterPicker(
            'Add Adopted Sibling',
            { excludeIds: [childId] },
            function (selected) {
                if (!selected || !_hasId(selected.id)) return;

                var currentYear = window.getCurrentYear();
                var added = 0;
                var errors = [];

                for (var i = 0; i < legalParents.length; i++) {
                    var parentId = legalParents[i];
                    var parentSummary = _readSummary(parentId);
                    if (!parentSummary) continue;

                    var role = parentSummary.gender === 'male' ? 'father'
                        : parentSummary.gender === 'female' ? 'mother'
                        : 'parent';

                    var result = FC.setParent(selected.id, parentId, {
                        parentType: 'legal',
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
                    _showToast('Failed to add adopted sibling.', 'error');
                    return;
                }

                _showToast('Adopted sibling added.', 'success');
                if (typeof onSuccess === 'function') onSuccess();
            }
        );
    }

    // =========================================================================
    // 12. FAMILY-TAB BRIDGE — openGenerateBabyModal
    // =========================================================================

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

        var parentSummary = _readSummary(parentId);
        if (!parentSummary) {
            return { success: false, reason: 'Character not found.' };
        }

        var motherId, fatherId;

        if (parentSummary.gender === 'female') {
            motherId = parentId;
            fatherId = options.partnerId || null;
        } else if (parentSummary.gender === 'male') {
            fatherId = parentId;
            motherId = options.partnerId || null;
        } else {
            return {
                success: false,
                reason: 'Character gender must be male or female to generate a baby.'
            };
        }

        if (!motherId || !fatherId) {
            var targetGender = !motherId ? 'female' : 'male';
            var targetRole = !motherId ? 'Mother' : 'Father';

            return _openInlineCharacterPicker(
                'Select ' + targetRole,
                { excludeIds: [parentId], gender: targetGender },
                function (selected) {
                    if (!selected || !_hasId(selected.id)) return;
                    if (!motherId) motherId = selected.id;
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
    // 13. EXPORTS
    // =========================================================================

    // Adoption flow
    window.openCreateAdoptionModal = openCreateAdoptionModal;
    window.openEditAdoptionModal = openEditAdoptionModal;
    window.openEndAdoptionModal = openEndAdoptionModal;
    window.openAdoptionSearchModal = openAdoptionSearchModal;
    window.openSetBirthParentsModal = openSetBirthParentsModal;

    // Family-tab bridge (the six functions character-family-tab.js calls)
    window.openSetParentModal = openSetParentModal;
    window.openAddExistingChildModal = openAddExistingChildModal;
    window.openAddFosterOrWardModal = openAddFosterOrWardModal;
    window.openAddExistingSiblingModal = openAddExistingSiblingModal;
    window.openAddAdoptedSiblingModal = openAddAdoptedSiblingModal;
    window.openGenerateBabyModal = openGenerateBabyModal;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            openCreateAdoptionModal: openCreateAdoptionModal,
            openEditAdoptionModal: openEditAdoptionModal,
            openEndAdoptionModal: openEndAdoptionModal,
            openAdoptionSearchModal: openAdoptionSearchModal,
            openSetBirthParentsModal: openSetBirthParentsModal,
            openSetParentModal: openSetParentModal,
            openAddExistingChildModal: openAddExistingChildModal,
            openAddFosterOrWardModal: openAddFosterOrWardModal,
            openAddExistingSiblingModal: openAddExistingSiblingModal,
            openAddAdoptedSiblingModal: openAddAdoptedSiblingModal,
            openGenerateBabyModal: openGenerateBabyModal
        };
    }
})();
