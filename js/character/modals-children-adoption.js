/**
 * =============================================================================
 * STILL WATERS - CHILDREN ADOPTION MODALS
 * (js/character/modals-children-adoption.js)
 * =============================================================================
 *
 * LOCATION: js/character/modals-children-adoption.js
 *
 * Adoption modals.
 *
 * SCOPE:
 *   - openCreateAdoptionModal(childId, adopterId, onSuccess)
 *   - openEditAdoptionModal(adoptionId, onSuccess)
 *   - openEndAdoptionModal(adoptionId, onSuccess)
 *   - openAdoptionSearchModal(onSelect, options)
 *   - openSetBirthParentsModal(childId, fatherId, motherId, onSuccess)
 *
 * ADOPTION FLOW:
 *   An adoption has two canonical parts:
 *     1. The legal parent edge       -> FamilyState
 *     2. The adoption metadata record -> ChildrenState
 *
 *   The create modal performs both, in order, with rollback on metadata
 *   failure.
 *   The edit modal updates metadata in place via
 *   ChildrenCommands.updateAdoptionMetadata. It does not touch the
 *   legal edge; changing the edge is the caller's responsibility.
 *   The end modal reverses both, in reverse order.
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
 *   `currentLocationId` — the latter is an accessor-level field name
 *   and does not appear on summaries. This file reads `locationId`.
 *
 * INLINE STYLES:
 *   This file uses a small number of inline style attributes for
 *   one-off layout inside the search results list. The general policy
 *   is classes-only; the exceptions here are pragmatic and localized.
 *   See the (small) set of `style=` occurrences at the bottom of this
 *   file. Long-term these should move into character-modals.css; they
 *   do not affect correctness.
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

                // NOTE: FamilyCommands.createAdoption sets parentType
                // to 'legal' internally. The parentType option here is
                // informative only; it is not read.
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

    /**
     * Finds adoption candidates.
     *
     * @param {Function} onSelect
     * @param {Object} [options]
     * @param {number} [options.minAge]          default 0
     * @param {number} [options.maxAge]          default 200
     * @param {string} [options.gender]          'male' | 'female' | 'all'
     * @param {string} [options.locationId]      current location filter
     * @param {string} [options.status]          'all' | 'orphan' |
     *                                           'has_living_parents' |
     *                                           'in_foster'
     */
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

        // Gather locations for the filter dropdown.
        // IMPORTANT: getCharacterSummary exposes `locationId`, NOT
        // `currentLocationId`. Use the summary field name.
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

        /**
         * Determines whether a candidate passes the current filters.
         */
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

            // Status filter.
            var bioParentIds = FQ.getBiologicalParentIds(candidate.id);
            var legalParentIds = FQ.getLegalParentIds(candidate.id);

            if (currentFilter.status === 'orphan') {
                // No living biological parent and no living legal parent.
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
                // Has an active foster adoption record.
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

        /**
         * Computes the current candidate list.
         */
        function findCandidates() {
            var all = CQ.getAllCharacters();
            var out = [];
            for (var i = 0; i < all.length; i++) {
                if (passesFilters(all[i])) out.push(all[i]);
            }
            out.sort(function (a, b) {
                var an = (a.fullName || a.name || '').toLowerCase();
                var bn = (b.fullName || b.name || '').toLowerCase();
                return an.localeCompare(bn);
            });
            return out;
        }

        /**
         * Renders the candidate list into a container.
         */
        function renderList(container) {
            if (!container) return;
            var candidates = findCandidates();

            if (candidates.length === 0) {
                container.innerHTML = '<div style="text-align:center; padding:30px; '
                                    + 'color: var(--dim);">'
                                    + 'No adoption candidates found.</div>';
                return;
            }

            var html = '';
            for (var i = 0; i < candidates.length; i++) {
                var c = candidates[i];
                html += '<div class="adoption-candidate" '
                      + 'data-child-id="' + _esc(c.id) + '" '
                      + 'style="padding:8px; margin-bottom:6px; '
                      + 'background: var(--bg3); border: 1px solid var(--border); '
                      + 'border-radius: 6px; cursor: pointer;">'
                      + '<strong>' + _esc(c.fullName || c.name || '') + '</strong>'
                      + ' <span style="color:var(--dim); font-size:0.65rem;">'
                      + _esc(c.age === null ? 'Unknown' : c.age + 'y')
                      + ' &middot; ' + _esc(c.gender || 'Unknown')
                      + (c.locationId ? ' &middot; ' + _esc(c.locationId) : '')
                      + '</span>'
                      + '</div>';
            }
            container.innerHTML = html;
        }

        var content = '<div class="character-modal">'
            + '<div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px;">'
            + '<select id="adopt-search-gender" style="padding:4px 6px; font-size:0.65rem;">'
            + '<option value="all"' + (initialGender === 'all' ? ' selected' : '') + '>All Genders</option>'
            + '<option value="male"' + (initialGender === 'male' ? ' selected' : '') + '>Male</option>'
            + '<option value="female"' + (initialGender === 'female' ? ' selected' : '') + '>Female</option>'
            + '</select>'
            + '<select id="adopt-search-status" style="padding:4px 6px; font-size:0.65rem;">'
            + '<option value="all"' + (initialStatus === 'all' ? ' selected' : '') + '>All Statuses</option>'
            + '<option value="orphan"' + (initialStatus === 'orphan' ? ' selected' : '') + '>Orphan</option>'
            + '<option value="has_living_parents"' + (initialStatus === 'has_living_parents' ? ' selected' : '') + '>Has Living Parents</option>'
            + '<option value="in_foster"' + (initialStatus === 'in_foster' ? ' selected' : '') + '>In Foster Care</option>'
            + '</select>'
            + '<select id="adopt-search-location" style="padding:4px 6px; font-size:0.65rem;">'
            + locationOptions
            + '</select>'
            + '<input type="number" id="adopt-search-min-age" '
            + 'value="' + _esc(initialMinAge) + '" min="0" max="200" '
            + 'style="width:70px; padding:4px 6px; font-size:0.65rem;" placeholder="Min">'
            + '<input type="number" id="adopt-search-max-age" '
            + 'value="' + _esc(initialMaxAge) + '" min="0" max="200" '
            + 'style="width:70px; padding:4px 6px; font-size:0.65rem;" placeholder="Max">'
            + '</div>'
            + '<div id="adoption-candidate-list" '
            + 'style="max-height: 400px; overflow-y: auto;">'
            + '</div>'
            + '</div>';

        var modal = window.openModal({
            titleHtml: 'Select Adoption Candidate',
            contentHtml: content,
            confirmText: 'Close',
            cancelText: '',
            onOpen: function (modalElement) {
                var listEl = modalElement.querySelector('#adoption-candidate-list');
                var genderEl = modalElement.querySelector('#adopt-search-gender');
                var statusEl = modalElement.querySelector('#adopt-search-status');
                var locationEl = modalElement.querySelector('#adopt-search-location');
                var minAgeEl = modalElement.querySelector('#adopt-search-min-age');
                var maxAgeEl = modalElement.querySelector('#adopt-search-max-age');

                function refresh() {
                    currentFilter.gender = genderEl.value || 'all';
                    currentFilter.status = statusEl.value || 'all';
                    currentFilter.locationId = locationEl.value || 'all';
                    var minAge = parseInt(minAgeEl.value, 10);
                    var maxAge = parseInt(maxAgeEl.value, 10);
                    currentFilter.minAge = Number.isInteger(minAge) && minAge >= 0 ? minAge : 0;
                    currentFilter.maxAge = Number.isInteger(maxAge) && maxAge >= 0 ? maxAge : 200;
                    if (currentFilter.maxAge < currentFilter.minAge) {
                        currentFilter.maxAge = currentFilter.minAge;
                    }
                    renderList(listEl);
                }

                genderEl.addEventListener('change', refresh);
                statusEl.addEventListener('change', refresh);
                locationEl.addEventListener('change', refresh);
                minAgeEl.addEventListener('input', refresh);
                maxAgeEl.addEventListener('input', refresh);

                listEl.addEventListener('click', function (e) {
                    var item = e.target.closest('.adoption-candidate');
                    if (!item) return;
                    var childId = item.getAttribute('data-child-id');
                    var child = _readSummary(childId);
                    if (!child) return;
                    window.closeTopModal();
                    onSelect(child);
                });

                renderList(listEl);
            },
            onConfirm: function () {}
        });

        return { success: true, modal: modal };
    }

    // =========================================================================
    // 6. SET BIRTH PARENTS MODAL
    // =========================================================================

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
