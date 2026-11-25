/**
 * =============================================================================
 * STILL WATERS - CHILDREN ADOPTION MODALS
 * (js/character/modals-children-adoption.js)
 * =============================================================================
 *
 * LOCATION: js/character/modals-children-adoption.js
 *
 * SCOPE:
 *   Adoption flow (existing):
 *     - openCreateAdoptionModal(childId, adopterId, onSuccess)
 *     - openEditAdoptionModal(adoptionId, onSuccess)
 *     - openEndAdoptionModal(adoptionId, onSuccess)
 *     - openAdoptionSearchModal(onSelect, options)
 *     - openSetBirthParentsModal(childId, fatherId, motherId, onSuccess)
 *
 *   Adoption-domain family-tab bridges:
 *     - openAddAdoptedChildModal(parentId, onSuccess)
 *     - openAddFosterOrWardModal(parentId, kind, onSuccess)
 *     - openAddAdoptedSiblingModal(childId, onSuccess)
 *     - openAddFosterParentModal(childId, onSuccess)
 *     - openAddGuardianModal(childId, onSuccess)
 *     - openAddAdoptiveParentModal(childId, onSuccess)
 *
 * 13-YEAR MINIMUM AGE DIFFERENCE
 *   Every parent/child picker enforces a hardcoded 13-year minimum
 *   age difference. Candidates who would violate it are filtered out
 *   of the list.
 *
 * PICKER CONTRACT
 *   _openInlineCharacterPicker accepts filterFn, excludeIds, gender,
 *   and referenceYear/referenceFrame for the age indication. Age is
 *   computed from birthYear at the current year. Candidates sorted
 *   by birthYear ascending. Gender rendered as SVG icon.
 *
 * CROSS-DOMAIN EXCLUSION
 *   - Parent pickers exclude existing parents (bio, legal, social).
 *   - Child pickers exclude existing children (bio, legal).
 *   - Sibling pickers exclude existing siblings.
 *   A character can be bio to one parent and adopted to another, but
 *   cannot be two things to the same parent.
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
 *                                getActiveAdoptionsForAdopter
 *   - ChildrenRules:             ADOPTION_TYPE, ADOPTION_STATUS
 *   - FamilyCommands:            createAdoption, removeAdoption, setParent
 *   - FamilyQueries:             getParentsByRole, getAllParentIds,
 *                                getBiologicalChildIds, getLegalChildIds,
 *                                getSiblings
 *
 * DEPENDENCIES (OPTIONAL):
 *   - selectors/modals-char-selector.js (openCharacterSelector)
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - Full self-contained file: all eleven functions in one paste.
 *     - Adoption-domain bridges: 13-year age filter, sorted picker,
 *       gender icons, cross-domain exclusion, age indication.
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
                        if (referenceYear !== null && typeof s.birthYear === 'number' && referenceLabel) {
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
    // CREATE ADOPTION MODAL
    // =========================================================================

    function openCreateAdoptionModal(childId, adopterIds, onSuccess, initialType) {
        if (!Array.isArray(adopterIds)) adopterIds = [adopterIds];
        adopterIds = adopterIds.filter(Boolean);
        if (!adopterIds.length || adopterIds.length > 2) return { success:false, reason:'Select one person or a couple.' };
        if (adopterIds.indexOf(childId)!==-1) return { success:false, reason:'Cannot adopt oneself.' };
        if (adopterIds.length===2 && adopterIds[0]===adopterIds[1]) return { success:false, reason:'Choose two different adopters.' };
        var child = _readSummary(childId);
        if (!child || child.isDeceased===true) return {success:false,reason:'Living adoptee not found.'};
        var adopters = adopterIds.map(_readSummary);
        if (adopters.some(function(p){return !p || p.isDeceased===true;})) return {success:false,reason:'Living adopter not found.'};
        var currentYear = window.getCurrentYear();
        var content = '<div class="character-modal"><div class="character-modal__section"><strong>Adoptee: '+_esc(_fullName(child))+'</strong><br>'+_esc(child.age==null?'Unknown age':child.age+' years');
        adopters.forEach(function(p){content+='<br><strong>Adopter: '+_esc(_fullName(p))+'</strong> · '+_esc(p.age==null?'Unknown age':p.age+' years');});
        content+='</div><div class="character-modal__form-field"><label class="character-modal__form-label" for="adoption-type">Placement type</label><select id="adoption-type" class="character-modal__form-input">'+_typeOptionsHtml(initialType||ChR.ADOPTION_TYPE.LEGAL)+'</select></div>';
        content+='<div class="character-modal__grid"><div class="character-modal__form-field"><label class="character-modal__form-label" for="adoption-role">Parent role</label><select id="adoption-role" class="character-modal__form-input"><option value="father">Father</option><option value="mother">Mother</option><option value="parent">Parent</option></select></div><div class="character-modal__form-field"><label class="character-modal__form-label" for="adoption-year">Year</label><input type="number" id="adoption-year" class="character-modal__form-input" value="'+_esc(currentYear)+'" min="1" max="'+(currentYear+10)+'"></div></div><div class="character-modal__form-field"><label class="character-modal__form-label" for="adoption-notes">Notes</label><textarea id="adoption-notes" class="character-modal__form-input" rows="2"></textarea></div></div>';
        var modal = window.openModal({titleHtml:'Record placement',contentHtml:content,confirmText:'Record placement',cancelText:'Cancel',onConfirm:function(){
            var type=modal.element.querySelector('#adoption-type').value;
            var role=modal.element.querySelector('#adoption-role').value;
            var year=parseInt(modal.element.querySelector('#adoption-year').value,10);
            var notes=modal.element.querySelector('#adoption-notes').value||'';
            if(!Number.isInteger(year)||!window.isValidYear(year)) throw new Error('Please enter a valid year.');
            var created=[];
            for(var i=0;i<adopterIds.length;i++){
                var parentRole=adopterIds.length===2?(i===0?'father':'mother'):role;
                var edge=FC.createAdoption(childId,adopterIds[i],{parentRole:parentRole,startYear:year,notes:notes,biologicalParentsConsent:true});
                if(!edge||edge.success!==true){for(var j=created.length-1;j>=0;j--){FC.removeAdoption(childId,created[j],{endYear:year,reason:'placement creation rolled back'});}throw new Error(edge&&edge.reason?edge.reason:'Failed to create parent edge.');}
                var meta=ChC.recordAdoptionMetadata(childId,adopterIds[i],{type:type,year:year,notes:notes});
                if(!meta||meta.success!==true){FC.removeAdoption(childId,adopterIds[i],{endYear:year,reason:'placement metadata failed'});for(var k=created.length-1;k>=0;k--){FC.removeAdoption(childId,created[k],{endYear:year,reason:'placement creation rolled back'});}throw new Error(meta&&meta.reason?meta.reason:'Failed to record placement metadata.');}
                created.push(adopterIds[i]);
            }
            if(typeof onSuccess==='function') onSuccess(created);
        }});
        return {success:true,modal:modal};
    }

    // =========================================================================
    // EDIT ADOPTION MODAL
    // =========================================================================

    function openEditAdoptionModal(adoptionId, onSuccess) {
        if (!_hasId(adoptionId)) return { success: false, reason: 'adoptionId is required.' };

        var record = ChQ.getAdoptionRecord(adoptionId);
        if (!record) return { success: false, reason: 'Adoption record not found.' };

        var child = _readSummary(record.childId);
        var adopter = _readSummary(record.adopterId);
        var currentYear = window.getCurrentYear();

        var content = '<div class="character-modal">';
        content += '<div class="character-modal__section">'
                 + '<strong>' + _esc(_fullName(child) || record.childId) + '</strong>'
                 + ' &middot; ' + _esc(_fullName(adopter) || record.adopterId)
                 + '<br>' + _esc(_typeLabel(record.type)) + ' since ' + _esc(record.year)
                 + '</div>';
        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="edit-adoption-type">Type</label>'
                 + '<select id="edit-adoption-type" class="character-modal__form-input">'
                 + _typeOptionsHtml(record.type) + '</select></div>';
        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="edit-adoption-status">Status</label>'
                 + '<select id="edit-adoption-status" class="character-modal__form-input">'
                 + _statusOptionsHtml(record.status) + '</select></div>';
        content += '<div class="character-modal__grid">'
                 + '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="edit-adoption-year">Year</label>'
                 + '<input type="number" id="edit-adoption-year" class="character-modal__form-input" '
                 + 'value="' + _esc(record.year) + '" min="1" max="' + currentYear + '"></div>'
                 + '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="edit-adoption-end-year">End Year</label>'
                 + '<input type="number" id="edit-adoption-end-year" class="character-modal__form-input" '
                 + 'value="' + _esc(record.endYear === null ? '' : record.endYear) + '" '
                 + 'min="' + record.year + '" max="' + (currentYear + 10) + '"></div></div>';
        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="edit-adoption-notes">Notes</label>'
                 + '<textarea id="edit-adoption-notes" class="character-modal__form-input" rows="2">'
                 + _esc(record.notes || '') + '</textarea></div>';
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
                if (Number.isInteger(year) && year !== record.year) patch.year = year;

                var endYearRaw = endYearEl.value.trim();
                if (endYearRaw === '') {
                    if (record.endYear !== null) patch.endYear = null;
                } else {
                    var endYear = parseInt(endYearRaw, 10);
                    if (Number.isInteger(endYear) && endYear !== record.endYear) patch.endYear = endYear;
                }

                if (notesEl.value !== (record.notes || '')) patch.notes = notesEl.value;

                if (Object.keys(patch).length === 0) return;

                var result = ChC.updateAdoptionMetadata(adoptionId, patch);
                if (!result || result.success !== true) {
                    throw new Error(result && result.reason
                        ? result.reason : 'Failed to update adoption metadata.');
                }

                if (typeof onSuccess === 'function') onSuccess(adoptionId);
            }
        });

        return { success: true, modal: modal };
    }

    // =========================================================================
    // END ADOPTION MODAL
    // =========================================================================

    function openEndAdoptionModal(adoptionId, onSuccess) {
        if (!_hasId(adoptionId)) return { success: false, reason: 'adoptionId is required.' };

        var record = ChQ.getAdoptionRecord(adoptionId);
        if (!record) return { success: false, reason: 'Adoption record not found.' };
        if (record.status !== 'active') return { success: false, reason: 'Adoption is not active.' };

        var child = _readSummary(record.childId);
        var adopter = _readSummary(record.adopterId);
        var currentYear = window.getCurrentYear();

        var content = '<div class="character-modal">';
        content += '<div class="character-modal__section">'
                 + 'End the adoption between '
                 + _esc(_fullName(child) || record.childId) + ' and '
                 + _esc(_fullName(adopter) || record.adopterId) + '?</div>';
        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="end-adoption-year">End Year</label>'
                 + '<input type="number" id="end-adoption-year" class="character-modal__form-input" '
                 + 'value="' + _esc(currentYear) + '" '
                 + 'min="' + record.year + '" max="' + (currentYear + 10) + '"></div>';
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

                var metaResult = ChC.endAdoptionMetadata(adoptionId, { endYear: endYear });
                if (!metaResult || metaResult.success !== true) {
                    throw new Error(metaResult && metaResult.reason
                        ? metaResult.reason : 'Failed to end adoption metadata.');
                }

                var edgeResult = FC.removeAdoption(record.childId, record.adopterId, {
                    endYear: endYear, reason: 'adoption ended'
                });
                if (!edgeResult || edgeResult.success !== true) {
                    throw new Error(edgeResult && edgeResult.reason
                        ? edgeResult.reason : 'Failed to remove legal parent edge.');
                }

                if (typeof onSuccess === 'function') onSuccess(adoptionId);
            }
        });

        return { success: true, modal: modal };
    }

    // =========================================================================
    // ADOPTION SEARCH MODAL
    // =========================================================================

    function openAdoptionSearchModal(onSelect, options) {
        if (typeof onSelect !== 'function') {
            throw new Error('openAdoptionSearchModal requires an onSelect callback.');
        }
        if (_isMissing(options)) options = {};

        var initialMinAge = typeof options.minAge === 'number' ? options.minAge : 0;
        var initialMaxAge = typeof options.maxAge === 'number' ? options.maxAge : 200;
        var initialGender = options.gender && options.gender !== 'all' ? options.gender : 'all';
        var initialLocationId = options.locationId && options.locationId !== 'all' ? options.locationId : 'all';
        var initialStatus = options.status && options.status !== 'all' ? options.status : 'all';

        var currentFilter = {
            minAge: initialMinAge, maxAge: initialMaxAge,
            gender: initialGender, locationId: initialLocationId, status: initialStatus
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
                + _esc(c.locationId) + '</option>';
        }

        function passesFilters(candidate) {
            if (candidate.isDeceased === true) return false;
            if (candidate.isDeleted === true) return false;
            if (currentFilter.gender !== 'all' && candidate.gender !== currentFilter.gender) return false;
            if (currentFilter.locationId !== 'all' && candidate.locationId !== currentFilter.locationId) return false;
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
                    if (bp && bp.isDeceased !== true) { hasLivingBio = true; break; }
                }
                if (hasLivingBio) return false;
                var hasLivingLegal = false;
                for (var j = 0; j < legalParentIds.length; j++) {
                    var lp = _readSummary(legalParentIds[j]);
                    if (lp && lp.isDeceased !== true) { hasLivingLegal = true; break; }
                }
                if (hasLivingLegal) return false;
            } else if (currentFilter.status === 'has_living_parents') {
                var anyLiving = false;
                for (var k = 0; k < bioParentIds.length; k++) {
                    var bp2 = _readSummary(bioParentIds[k]);
                    if (bp2 && bp2.isDeceased !== true) { anyLiving = true; break; }
                }
                if (!anyLiving) {
                    for (var m = 0; m < legalParentIds.length; m++) {
                        var lp2 = _readSummary(legalParentIds[m]);
                        if (lp2 && lp2.isDeceased !== true) { anyLiving = true; break; }
                    }
                }
                if (!anyLiving) return false;
            } else if (currentFilter.status === 'in_foster') {
                var adoptions = ChQ.getActiveAdoptionsForChild(candidate.id);
                var inFoster = false;
                for (var n = 0; n < adoptions.length; n++) {
                    if (adoptions[n].type === ChR.ADOPTION_TYPE.FOSTER) { inFoster = true; break; }
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
                try { summary = CQ.getCharacterSummary(all[i].id); } catch (e) { summary = null; }
                if (!summary) continue;
                if (passesFilters(summary)) out.push(summary);
            }
            return out;
        }

        function renderRows(matches) {
            if (matches.length === 0) return '<div class="character-tab-empty">No matching characters.</div>';
            var html = '';
            for (var i = 0; i < matches.length; i++) {
                var m = matches[i];
                var name = ((m.name || '') + ' ' + (m.surname || '')).trim();
                var age = _computeAge(m.birthYear, m.isDeceased, m.deathYear);
                var ageText = (age !== null) ? age + 'y' : '?y';
                html += '<div class="character-tab-history__row" '
                    + 'data-character-id="' + _esc(m.id) + '" style="cursor:pointer;">'
                    + '<div class="character-tab-history__main" style="display:flex;align-items:center;gap:8px;">'
                    + '<span class="character-row__gender">' + _genderSvg(m.gender) + '</span>'
                    + '<span class="character-tab-history__value">' + _esc(name || m.id) + '</span>'
                    + '<span class="character-tab-history__reason">' + _esc(ageText) + '</span>'
                    + '</div></div>';
            }
            return html;
        }

        var content = '<div class="character-modal">'
            + '<div class="character-modal__grid">'
            + '<div class="character-modal__form-field">'
            + '<label class="character-modal__form-label" for="search-min-age">Min Age</label>'
            + '<input type="number" id="search-min-age" class="character-modal__form-input" '
            + 'value="' + _esc(initialMinAge) + '" min="0"></div>'
            + '<div class="character-modal__form-field">'
            + '<label class="character-modal__form-label" for="search-max-age">Max Age</label>'
            + '<input type="number" id="search-max-age" class="character-modal__form-input" '
            + 'value="' + _esc(initialMaxAge) + '" min="0"></div></div>'
            + '<div class="character-modal__grid">'
            + '<div class="character-modal__form-field">'
            + '<label class="character-modal__form-label" for="search-gender">Gender</label>'
            + '<select id="search-gender" class="character-modal__form-input">'
            + '<option value="all"' + (initialGender === 'all' ? ' selected' : '') + '>All</option>'
            + '<option value="male"' + (initialGender === 'male' ? ' selected' : '') + '>Male</option>'
            + '<option value="female"' + (initialGender === 'female' ? ' selected' : '') + '>Female</option>'
            + '</select></div>'
            + '<div class="character-modal__form-field">'
            + '<label class="character-modal__form-label" for="search-status">Status</label>'
            + '<select id="search-status" class="character-modal__form-input">'
            + '<option value="all"' + (initialStatus === 'all' ? ' selected' : '') + '>All</option>'
            + '<option value="orphan"' + (initialStatus === 'orphan' ? ' selected' : '') + '>Orphans</option>'
            + '<option value="has_living_parents"' + (initialStatus === 'has_living_parents' ? ' selected' : '') + '>Has Living Parents</option>'
            + '<option value="in_foster"' + (initialStatus === 'in_foster' ? ' selected' : '') + '>In Foster Care</option>'
            + '</select></div></div>'
            + '<div class="character-modal__form-field">'
            + '<label class="character-modal__form-label" for="search-location">Location</label>'
            + '<select id="search-location" class="character-modal__form-input">'
            + locationOptions + '</select></div>'
            + '<div id="search-results" class="character-tab-history" '
            + 'style="max-height:240px;overflow-y:auto;margin-top:8px;"></div>'
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
                    resultsEl.innerHTML = renderRows(findMatches());
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

        return { success: true, modal: modal };
    }

    // =========================================================================
    // SET BIRTH PARENTS MODAL
    // =========================================================================

    function openSetBirthParentsModal(childId, fatherId, motherId, onSuccess) {
        if (!_hasId(childId)) return { success: false, reason: 'childId is required.' };

        var child = _readSummary(childId);
        if (!child) return { success: false, reason: 'Child not found.' };

        var currentYear = window.getCurrentYear();
        var father = fatherId ? _readSummary(fatherId) : null;
        var mother = motherId ? _readSummary(motherId) : null;

        var content = '<div class="character-modal">';
        content += '<div class="character-modal__section"><strong>'
                 + _esc(_fullName(child)) + '</strong></div>';
        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label">Father</label>'
                 + '<div style="display:flex;gap:8px;align-items:center;">'
                 + '<button type="button" class="btn" data-action="select-father">Select</button>'
                 + '<span id="sbp-father-name">' + _esc(father ? _fullName(father) : 'None') + '</span>'
                 + '<button type="button" class="btn" data-action="clear-father">Clear</button>'
                 + '</div></div>';
        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label">Mother</label>'
                 + '<div style="display:flex;gap:8px;align-items:center;">'
                 + '<button type="button" class="btn" data-action="select-mother">Select</button>'
                 + '<span id="sbp-mother-name">' + _esc(mother ? _fullName(mother) : 'None') + '</span>'
                 + '<button type="button" class="btn" data-action="clear-mother">Clear</button>'
                 + '</div></div>';
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
                var existingFatherId = current.fathers.length > 0 ? current.fathers[0].parentId : null;
                var existingMotherId = current.mothers.length > 0 ? current.mothers[0].parentId : null;

                var errors = [];

                if (newFatherId !== existingFatherId) {
                    if (newFatherId) {
                        var r1 = FC.setParent(childId, newFatherId, {
                            parentType: 'biological', parentRole: 'father',
                            startYear: currentYear, allowReplace: true
                        });
                        if (!r1 || r1.success !== true) errors.push('Father: ' + (r1 && r1.reason ? r1.reason : 'unknown'));
                    } else if (existingFatherId) {
                        var r2 = FC.removeBiologicalParentAtRole(childId, 'father', {
                            endYear: currentYear, reason: 'removed via birth parents modal'
                        });
                        if (!r2 || r2.success !== true) errors.push('Father: ' + (r2 && r2.reason ? r2.reason : 'unknown'));
                    }
                }

                if (newMotherId !== existingMotherId) {
                    if (newMotherId) {
                        var r3 = FC.setParent(childId, newMotherId, {
                            parentType: 'biological', parentRole: 'mother',
                            startYear: currentYear, allowReplace: true
                        });
                        if (!r3 || r3.success !== true) errors.push('Mother: ' + (r3 && r3.reason ? r3.reason : 'unknown'));
                    } else if (existingMotherId) {
                        var r4 = FC.removeBiologicalParentAtRole(childId, 'mother', {
                            endYear: currentYear, reason: 'removed via birth parents modal'
                        });
                        if (!r4 || r4.success !== true) errors.push('Mother: ' + (r4 && r4.reason ? r4.reason : 'unknown'));
                    }
                }

                if (errors.length > 0) throw new Error(errors.join('; '));
                if (typeof onSuccess === 'function') onSuccess();
            }
        });

        return { success: true, modal: modal };
    }

    // =========================================================================
    // FAMILY-TAB BRIDGES
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
                excludeIds: excludeIds, filterFn: filterFn,
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
                    _showToast('Failed to add adopted child: '
                        + (edgeResult && edgeResult.reason ? edgeResult.reason : 'unknown'), 'error');
                    return;
                }

                var metaResult = ChC.recordAdoptionMetadata(selected.id, parentId, {
                    type: ChR.ADOPTION_TYPE.LEGAL, year: currentYear, notes: ''
                });
                if (!metaResult || metaResult.success !== true) {
                    FC.removeAdoption(selected.id, parentId, {
                        endYear: currentYear, reason: 'adoption metadata failed'
                    });
                    _showToast('Failed to record adoption metadata: '
                        + (metaResult && metaResult.reason ? metaResult.reason : 'unknown'), 'error');
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
                excludeIds: excludeIds, filterFn: filterFn,
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
                    _showToast('Failed to add ' + kind + ': '
                        + (edgeResult && edgeResult.reason ? edgeResult.reason : 'unknown'), 'error');
                    return;
                }

                var metaResult = ChC.recordAdoptionMetadata(selected.id, parentId, {
                    type: adoptionType, year: currentYear, notes: ''
                });
                if (!metaResult || metaResult.success !== true) {
                    FC.removeAdoption(selected.id, parentId, {
                        endYear: currentYear, reason: 'adoption metadata failed'
                    });
                    _showToast('Failed to record ' + kind + ' metadata: '
                        + (metaResult && metaResult.reason ? metaResult.reason : 'unknown'), 'error');
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
            _showToast('This character has no adopting parents to share. '
                + 'Add an adopted child first, then come back.', 'error');
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
                _showToast('Adopted sibling added'
                    + (errors.length > 0 ? ' (some parent edges failed)' : '.'),
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
                excludeIds: excludeIds, filterFn: filterFn,
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
                    _showToast('Failed to add foster parent: '
                        + (edgeResult && edgeResult.reason ? edgeResult.reason : 'unknown'), 'error');
                    return;
                }

                var metaResult = ChC.recordAdoptionMetadata(childId, selected.id, {
                    type: ChR.ADOPTION_TYPE.FOSTER, year: currentYear, notes: ''
                });
                if (!metaResult || metaResult.success !== true) {
                    FC.removeAdoption(childId, selected.id, {
                        endYear: currentYear, reason: 'adoption metadata failed'
                    });
                    _showToast('Failed to record foster metadata: '
                        + (metaResult && metaResult.reason ? metaResult.reason : 'unknown'), 'error');
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
                excludeIds: excludeIds, filterFn: filterFn,
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
                    _showToast('Failed to add guardian: '
                        + (edgeResult && edgeResult.reason ? edgeResult.reason : 'unknown'), 'error');
                    return;
                }

                var metaResult = ChC.recordAdoptionMetadata(childId, selected.id, {
                    type: ChR.ADOPTION_TYPE.GUARDIANSHIP, year: currentYear, notes: ''
                });
                if (!metaResult || metaResult.success !== true) {
                    FC.removeAdoption(childId, selected.id, {
                        endYear: currentYear, reason: 'adoption metadata failed'
                    });
                    _showToast('Failed to record guardian metadata: '
                        + (metaResult && metaResult.reason ? metaResult.reason : 'unknown'), 'error');
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
                excludeIds: excludeIds, filterFn: filterFn,
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
                    _showToast('Failed to add adoptive parent: '
                        + (edgeResult && edgeResult.reason ? edgeResult.reason : 'unknown'), 'error');
                    return;
                }

                var metaResult = ChC.recordAdoptionMetadata(childId, selected.id, {
                    type: ChR.ADOPTION_TYPE.LEGAL, year: currentYear, notes: ''
                });
                if (!metaResult || metaResult.success !== true) {
                    FC.removeAdoption(childId, selected.id, {
                        endYear: currentYear, reason: 'adoption metadata failed'
                    });
                    _showToast('Failed to record adoptive parent metadata: '
                        + (metaResult && metaResult.reason ? metaResult.reason : 'unknown'), 'error');
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
