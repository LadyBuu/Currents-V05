/**
 * =============================================================================
 * STILL WATERS - CHILDREN ADOPTION MODALS
 * (js/character/modals-children-adoption.js)
 * =============================================================================
 *
 * Adoption modals.
 *
 * SCOPE:
 *   - openCreateAdoptionModal(childId, adopterId, onSuccess)
 *       Creates a legal parent edge and records the adoption metadata.
 *   - openEditAdoptionModal(adoptionId, onSuccess)
 *       Edits adoption metadata (type, notes).
 *   - openEndAdoptionModal(adoptionId, onSuccess)
 *       Ends the legal parent edge and marks the metadata ended.
 *   - openAdoptionSearchModal(onSelect, options)
 *       Finds adoption candidates (living children without a legal
 *       parent of the same role).
 *   - openSetBirthParentsModal(childId, fatherId, motherId, onSuccess)
 *       Records biological parent edges retroactively.
 *
 * OUT OF SCOPE:
 *   - Legal parent edge               -> FamilyCommands.createAdoption,
 *                                        FamilyCommands.removeAdoption
 *   - Adoption metadata storage       -> ChildrenCommands
 *                                        (recordAdoptionMetadata,
 *                                         endAdoptionMetadata)
 *   - Surrogacy                       -> modals-children-surrogacy.js
 *   - Birth                           -> modals-children-birth.js
 *   - Legitimization                  -> deliberately not implemented
 *   - Presentation CSS                -> stylesheet
 *
 * CONTRACT:
 *   - UI only. Reads via CharacterQueries, ChildrenQueries, FamilyQueries.
 *     Mutates only via FamilyCommands (edges) and ChildrenCommands
 *     (metadata).
 *   - No fallback for missing dependencies.
 *   - openSetBirthParentsModal passes ids to FamilyCommands.setParent
 *     with `allowReplace: true` when a biological parent already exists
 *     at the same role. Replacement is explicit in the modal, not
 *     silent.
 *
 * ADOPTION FLOW:
 *   The adoption has two canonical parts:
 *     1. The legal parent edge       -> FamilyState
 *     2. The adoption metadata record -> ChildrenState
 *
 *   `openCreateAdoptionModal` performs both, in order, with rollback
 *   on metadata failure.
 *   `openEndAdoptionModal` reverses both, in reverse order.
 *
 * DEPENDENCIES (REQUIRED):
 *   - formatting.js:             escapeHtml
 *   - icons.js:                  Icons
 *   - modals-core.js:            openModal, closeTopModal
 *   - time.js:                   getCurrentYear, isValidYear, calculateAge
 *   - CharacterQueries:          getCharacterSummary
 *   - ChildrenCommands:          recordAdoptionMetadata,
 *                                endAdoptionMetadata
 *   - ChildrenQueries:           getAdoptionRecord,
 *                                getAdoptionsForChild,
 *                                getAdoptionRecordForPair
 *   - ChildrenRules:             ADOPTION_TYPE
 *   - FamilyCommands:            createAdoption, removeAdoption,
 *                                setParent
 *   - FamilyQueries:             getParentsByRole, getAllParentIds,
 *                                getBiologicalParentIds
 *
 * DEPENDENCIES (OPTIONAL, required for parent selection):
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

    function _roleForGender(gender) {
        if (gender === 'female') return 'mother';
        if (gender === 'male') return 'father';
        return 'parent';
    }

    // =========================================================================
    // 2. CREATE ADOPTION MODAL
    // =========================================================================

    /**
     * @param {string} childId
     * @param {string} adopterId
     * @param {Function} [onSuccess]
     */
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

        var typeOptions = '';
        var types = [
            { id: ChR.ADOPTION_TYPE.LEGAL, label: 'Legal Adoption' },
            { id: ChR.ADOPTION_TYPE.GUARDIANSHIP, label: 'Guardianship' },
            { id: ChR.ADOPTION_TYPE.FOSTER, label: 'Foster Care' }
        ];
        for (var i = 0; i < types.length; i++) {
            typeOptions += '<option value="' + _esc(types[i].id) + '">'
                         + _esc(types[i].label)
                         + '</option>';
        }

        var roleOptions = '';
        roleOptions += '<option value="father">Father</option>';
        roleOptions += '<option value="mother">Mother</option>';
        roleOptions += '<option value="parent">Parent</option>';

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
                 + typeOptions
                 + '</select>'
                 + '</div>';

        content += '<div class="character-modal__grid">';
        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="adoption-role">Role</label>'
                 + '<select id="adoption-role" class="character-modal__form-input">'
                 + roleOptions
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

                // Step 1 — legal parent edge.
                var edgeResult = FC.createAdoption(childId, adopterId, {
                    parentType: 'legal',
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

                // Step 2 — metadata.
                var metaResult = ChC.recordAdoptionMetadata(childId, adopterId, {
                    type: type,
                    year: year,
                    notes: notesEl.value || ''
                });
                if (!metaResult || metaResult.success !== true) {
                    // Rollback the edge.
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

        var typeOptions = '';
        var types = [
            { id: ChR.ADOPTION_TYPE.LEGAL, label: 'Legal Adoption' },
            { id: ChR.ADOPTION_TYPE.GUARDIANSHIP, label: 'Guardianship' },
            { id: ChR.ADOPTION_TYPE.FOSTER, label: 'Foster Care' }
        ];
        for (var i = 0; i < types.length; i++) {
            var selected = types[i].id === record.type ? ' selected' : '';
            typeOptions += '<option value="' + _esc(types[i].id) + '"'
                         + selected + '>'
                         + _esc(types[i].label)
                         + '</option>';
        }

        var content = '<div class="character-modal">';

        content += '<div class="character-modal__section">'
                 + '<strong>' + _esc(_fullName(child) || record.childId) + '</strong>'
                 + ' &middot; '
                 + _esc(_fullName(adopter) || record.adopterId)
                 + '</div>';

        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="edit-adoption-type">Type</label>'
                 + '<select id="edit-adoption-type" class="character-modal__form-input">'
                 + typeOptions
                 + '</select>'
                 + '</div>';

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
                var notesEl = modal.element.querySelector('#edit-adoption-notes');

                // Metadata-only edit. The legal edge is unchanged.
                // children-commands does not currently expose a
                // metadata-update command; callers who need one should
                // add `updateAdoptionMetadata` to the command surface.
                //
                // For now, this modal is intentionally read-only for
                // everything except notes, because editing the type of
                // an adoption is a semantic change that the command
                // layer does not yet support.
                throw new Error(
                    'Editing adoption metadata is not yet supported. ' +
                    'End the adoption and create a new one to change its type.'
                );
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

                // Step 1 — metadata first, so a failing edge removal
                // leaves a recoverable state.
                var metaResult = ChC.endAdoptionMetadata(adoptionId, {
                    endYear: endYear
                });
                if (!metaResult || metaResult.success !== true) {
                    throw new Error(metaResult && metaResult.reason
                        ? metaResult.reason
                        : 'Failed to end adoption metadata.');
                }

                // Step 2 — legal edge.
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

    /**
     * Finds adoption candidates: living children with no active legal
     * parent at the given role, or with no legal parent at all.
     *
     * @param {Function} onSelect
     * @param {Object} [options]
     * @param {number} [options.minAge]
     * @param {number} [options.maxAge]
     * @param {string} [options.gender]
     * @param {string} [options.locationId]
     */
    function openAdoptionSearchModal(onSelect, options) {
        if (typeof onSelect !== 'function') {
            throw new Error('openAdoptionSearchModal requires an onSelect callback.');
        }
        if (_isMissing(options)) options = {};

        var minAge = typeof options.minAge === 'number' ? options.minAge : 0;
        var maxAge = typeof options.maxAge === 'number' ? options.maxAge : 200;
        var genderFilter = options.gender && options.gender !== 'all'
            ? options.gender
            : null;
        var locationFilter = options.locationId && options.locationId !== 'all'
            ? options.locationId
            : null;

        function findCandidates() {
            var all = CQ.getAllCharacters();
            var out = [];
            for (var i = 0; i < all.length; i++) {
                var c = all[i];
                if (c.isDeceased === true) continue;
                if (c.isDeleted === true) continue;
                if (genderFilter && c.gender !== genderFilter) continue;
                if (locationFilter && c.currentLocationId !== locationFilter) continue;

                var age = c.age;
                if (typeof age === 'number') {
                    if (age < minAge || age > maxAge) continue;
                }

                var legalIds = FQ.getLegalParentIds(c.id);
                var hasLegalAtRole =
                    FQ.getParentsByRole(c.id);
                var roleCount = (hasLegalAtRole.fathers || []).filter(function (e) {
                    return e.parentType === 'legal';
                }).length + (hasLegalAtRole.mothers || []).filter(function (e) {
                    return e.parentType === 'legal';
                }).length;

                // Candidate if the child has no legal parent at either
                // father or mother role.
                if (roleCount > 0) continue;

                out.push(c);
            }
            return out;
        }

        var candidates = findCandidates();

        var rows = '';
        for (var i = 0; i < candidates.length; i++) {
            var c = candidates[i];
            rows += '<div class="adoption-candidate" '
                  + 'data-child-id="' + _esc(c.id) + '" '
                  + 'style="padding:8px; margin-bottom:6px; '
                  + 'background: var(--bg3); border: 1px solid var(--border); '
                  + 'border-radius: 6px; cursor: pointer;">'
                  + '<strong>' + _esc(c.fullName || c.name || '') + '</strong>'
                  + ' <span style="color:var(--dim); font-size:0.65rem;">'
                  + _esc(c.age === null ? 'Unknown' : c.age + 'y')
                  + ' &middot; ' + _esc(c.gender || 'Unknown')
                  + '</span>'
                  + '</div>';
        }

        if (!rows) {
            rows = '<div style="text-align:center; padding:30px; '
                 + 'color: var(--dim);">No adoption candidates found.</div>';
        }

        var content = '<div class="character-modal">'
                    + '<div id="adoption-candidate-list" '
                    + 'style="max-height: 400px; overflow-y: auto;">'
                    + rows
                    + '</div>'
                    + '</div>';

        var modal = window.openModal({
            titleHtml: 'Select Adoption Candidate',
            contentHtml: content,
            confirmText: 'Close',
            cancelText: '',
            onOpen: function (modalElement) {
                var list = modalElement.querySelector('#adoption-candidate-list');
                if (!list) return;
                list.addEventListener('click', function (e) {
                    var item = e.target.closest('.adoption-candidate');
                    if (!item) return;
                    var childId = item.getAttribute('data-child-id');
                    var child = _readSummary(childId);
                    if (!child) return;
                    window.closeTopModal();
                    onSelect(child);
                });
            },
            onConfirm: function () {}
        });

        return { success: true, modal: modal };
    }

    // =========================================================================
    // 6. SET BIRTH PARENTS MODAL
    // =========================================================================

    /**
     * Records biological parent edges retroactively for an existing
     * child.
     *
     * @param {string} childId
     * @param {string|null} fatherId
     * @param {string|null} motherId
     * @param {Function} [onSuccess]
     */
    function openSetBirthParentsModal(childId, fatherId, motherId, onSuccess) {
        var child = _readSummary(childId);
        if (!child) {
            return { success: false, reason: 'Child not found.' };
        }
        if (child.isDeceased === true) {
            return { success: false, reason: 'Child is deceased.' };
        }
        if (!_hasId(fatherId) && !_hasId(motherId)) {
            return { success: false, reason: 'At least one parent is required.' };
        }

        var currentYear = window.getCurrentYear();
        var existing = FQ.getParentsByRole(childId);

        function findBioAtRole(role) {
            var list = role === 'father' ? existing.fathers : existing.mothers;
            for (var i = 0; i < list.length; i++) {
                if (list[i].parentType === 'biological') return list[i];
            }
            return null;
        }

        var existingBioFather = findBioAtRole('father');
        var existingBioMother = findBioAtRole('mother');

        var father = _hasId(fatherId) ? _readSummary(fatherId) : null;
        var mother = _hasId(motherId) ? _readSummary(motherId) : null;

        if (_hasId(fatherId) && !father) {
            return { success: false, reason: 'Father not found.' };
        }
        if (_hasId(motherId) && !mother) {
            return { success: false, reason: 'Mother not found.' };
        }

        var content = '<div class="character-modal">';

        content += '<div class="character-modal__section">'
                 + '<strong>Child: ' + _esc(_fullName(child)) + '</strong>'
                 + '</div>';

        if (father) {
            content += '<div class="character-modal__form-field">'
                     + '<label class="character-modal__form-label">Father</label>'
                     + '<div>' + _esc(_fullName(father)) + '</div>'
                     + (existingBioFather
                         ? '<div style="color:var(--warn); font-size:0.65rem;">'
                           + 'Currently: '
                           + _esc(_fullName(_readSummary(existingBioFather.parentId)))
                           + ' — will be replaced.</div>'
                         : '')
                     + '</div>';
        }

        if (mother) {
            content += '<div class="character-modal__form-field">'
                     + '<label class="character-modal__form-label">Mother</label>'
                     + '<div>' + _esc(_fullName(mother)) + '</div>'
                     + (existingBioMother
                         ? '<div style="color:var(--warn); font-size:0.65rem;">'
                           + 'Currently: '
                           + _esc(_fullName(_readSummary(existingBioMother.parentId)))
                           + ' — will be replaced.</div>'
                         : '')
                     + '</div>';
        }

        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="birth-parents-year">'
                 + 'Year</label>'
                 + '<input type="number" id="birth-parents-year" class="character-modal__form-input" '
                 + 'value="' + _esc(child.birthYear || currentYear) + '" '
                 + 'min="1" max="' + currentYear + '">'
                 + '</div>';

        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="birth-parents-notes">Notes</label>'
                 + '<textarea id="birth-parents-notes" class="character-modal__form-input" rows="2"></textarea>'
                 + '</div>';

        content += '</div>';

        var modal = window.openModal({
            titleHtml: 'Set Birth Parents: ' + _esc(child.name || ''),
            contentHtml: content,
            confirmText: 'Set Parents',
            cancelText: 'Cancel',
            onConfirm: function () {
                var yearEl = modal.element.querySelector('#birth-parents-year');
                var notesEl = modal.element.querySelector('#birth-parents-notes');

                var year = parseInt(yearEl.value, 10);
                if (!Number.isInteger(year) || !window.isValidYear(year)) {
                    throw new Error('Please enter a valid year.');
                }

                var notes = notesEl.value || '';
                var errors = [];

                if (father) {
                    var fatherResult = FC.setParent(childId, father.id, {
                        parentType: 'biological',
                        parentRole: 'father',
                        startYear: year,
                        notes: notes,
                        allowReplace: existingBioFather !== null
                    });
                    if (!fatherResult || fatherResult.success !== true) {
                        errors.push('Father: '
                            + (fatherResult && fatherResult.reason
                                ? fatherResult.reason
                                : 'unknown'));
                    }
                }

                if (mother) {
                    var motherResult = FC.setParent(childId, mother.id, {
                        parentType: 'biological',
                        parentRole: 'mother',
                        startYear: year,
                        notes: notes,
                        allowReplace: existingBioMother !== null
                    });
                    if (!motherResult || motherResult.success !== true) {
                        errors.push('Mother: '
                            + (motherResult && motherResult.reason
                                ? motherResult.reason
                                : 'unknown'));
                    }
                }

                if (errors.length === 2) {
                    throw new Error(errors.join('; '));
                }

                if (typeof onSuccess === 'function') {
                    onSuccess(childId, errors);
                }
            }
        });

        return { success: true, modal: modal };
    }

    // =========================================================================
    // 7. EXPORTS
    // =========================================================================

    window.openCreateAdoptionModal = openCreateAdoptionModal;
    window.openEditAdoptionModal = openEditAdoptionModal;
    window.openEndAdoptionModal = openEndAdoptionModal;
    window.openAdoptionSearchModal = openAdoptionSearchModal;
    window.openSetBirthParentsModal = openSetBirthParentsModal;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            openCreateAdoptionModal: openCreateAdoptionModal,
            openEditAdoptionModal: openEditAdoptionModal,
            openEndAdoptionModal: openEndAdoptionModal,
            openAdoptionSearchModal: openAdoptionSearchModal,
            openSetBirthParentsModal: openSetBirthParentsModal
        };
    }
})();
