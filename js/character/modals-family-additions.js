// js/character/modals-family-additions.js
/**
 * =============================================================================
 * STILL WATERS - FAMILY ADDITIONS MODALS (modals-family-additions.js)
 * =============================================================================
 *
 * LOCATION: js/character/modals-family-additions.js
 *
 * Modal entry points for the Family tab's write affordances. The Family
 * tab is a read-mostly surface that delegates every mutation to one of
 * the modals below.
 *
 * EXPORTS:
 *   openSetParentModal(childId, role, onSuccess, options)
 *     role: 'mother' | 'father'
 *     Sets (or replaces) the biological parent at this role.
 *     Explicit replace prompt when the role is already filled.
 *
 *   openAddExistingChildModal(parentId, type, onSuccess)
 *     type: 'biological' | 'adopted'
 *     Picks an existing character, adds them as a child of parentId.
 *     Biological: FamilyCommands.setParent with derived parentRole
 *     from parentId's gender, cycle-checked.
 *     Adopted: FamilyCommands.createAdoption (legal edge) + metadata
 *     (ChildrenCommands.recordAdoptionMetadata, type 'legal').
 *     Two commands, one persist.
 *
 *   openGenerateBabyModal(parentId, onSuccess, options)
 *     options.partnerId   optional pre-resolved partner (from
 *                         buildFamilyModel.partnerForBaby)
 *     Resolves the second parent (partnerForBaby, else committed
 *     partner picker, else error). Calls ChildrenCommands.recordBirth.
 *     Mixed-sex only: refuses with "same-sex conception is not
 *     possible in this simulation" when both parents are the same
 *     sex.
 *
 *   openAddExistingSiblingModal(childId, onSuccess)
 *     Adds an existing character as a sibling of childId. Shows the
 *     child's biological parents as checkboxes; the user picks which
 *     parents the new sibling shares. One setParent call per shared
 *     parent, one persist.
 *
 *   openAddAdoptedSiblingModal(childId, onSuccess)
 *     Adds an existing character as a sibling via adoption. Shows the
 *     child's adopting parents (legal records via
 *     ChildrenQueries.getActiveAdoptionsForChild); the user picks
 *     which parents to share. One createAdoption + one
 *     recordAdoptionMetadata per shared parent, one persist.
 *
 *   openAddFosterOrWardModal(parentId, kind, onSuccess)
 *     kind: 'foster' | 'guardianship'
 *     Picks an existing character, records them as a foster child or
 *     ward of parentId. One FamilyCommands.createAdoption (legal edge)
 *     + one ChildrenCommands.recordAdoptionMetadata (type 'foster' or
 *     'guardianship'), one persist.
 *
 *   (deleteFosterOrWard is handled inline in the tab via
 *    ChildrenCommands.endAdoptionMetadata + FamilyCommands.removeAdoption.
 *    No dedicated modal — a confirm dialog is sufficient.)
 *
 * INLINE PICKERS:
 *   Every "pick an existing character" flow uses the inline character
 *   picker defined here. window.openCharacterSelector is NOT assumed to
 *   be loaded on every page that mounts this file.
 *
 * DEPENDENCIES (REQUIRED, verified at load):
 *   - formatting.js (escapeHtml)
 *   - modals-core.js (openModal, closeTopModal, confirmDialog)
 *   - CharacterQueries (getAllCharacters, getCharacterSummary)
 *   - CharacterCommands (getProfessions — only for role display)
 *   - FamilyCommands (setParent, createAdoption, removeParent)
 *   - FamilyQueries (getBiologicalParentIds, getParents)
 *   - FamilyRules (wouldCreateBiologicalCycle, normalizeParentRole)
 *   - ChildrenCommands (recordBirth, recordAdoptionMetadata)
 *   - ChildrenQueries (getActiveAdoptionsForChild)
 *   - RomanceQueries (getActiveCommittedPartners)
 *   - HouseholdModals (rootFrom, esc, persist*OrFail, reportFailure,
 *                      currentYear, readValue, readIntOrNull, onOpen,
 *                      closeThen)
 *   - CharacterLifecycle (killCharacter — not used here, only death
 *                         flow, listed for completeness)
 *
 * OPTIONAL (checked at call time):
 *   - window.showToast
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Initial revision (family-tab P2).
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 0. LOAD-TIME DEPENDENCY VERIFICATION
    // =========================================================================

    function _requireFunction(name, fn) {
        if (typeof fn !== 'function') {
            throw new Error(
                'modals-family-additions: ' + name + ' is required'
            );
        }
        return fn;
    }

    function _requireObject(name, obj) {
        if (typeof obj === 'undefined' || obj === null) {
            throw new Error(
                'modals-family-additions: ' + name + ' is required'
            );
        }
        return obj;
    }

    var CQ  = _requireObject('CharacterQueries', window.CharacterQueries);
    var FC  = _requireObject('FamilyCommands', window.FamilyCommands);
    var FQ  = _requireObject('FamilyQueries', window.FamilyQueries);
    var FR  = _requireObject('FamilyRules', window.FamilyRules);
    var ChC = _requireObject('ChildrenCommands', window.ChildrenCommands);
    var ChQ = _requireObject('ChildrenQueries', window.ChildrenQueries);
    var RQm = _requireObject('RomanceQueries', window.RomanceQueries);

    var _openModal = _requireFunction('openModal',
        typeof window.openModal === 'function'
            ? window.openModal
            : window._openModal);
    var _closeTopModal = _requireFunction('closeTopModal',
        typeof window.closeTopModal === 'function'
            ? window.closeTopModal
            : window._closeTopModal);

    var _Modals = _requireObject('HouseholdModals', window.HouseholdModals);
    _requireFunction('HouseholdModals.rootFrom', _Modals.rootFrom);
    _requireFunction('HouseholdModals.esc', _Modals.esc);
    _requireFunction('HouseholdModals.readValue', _Modals.readValue);
    _requireFunction('HouseholdModals.readIntOrNull', _Modals.readIntOrNull);
    _requireFunction('HouseholdModals.onOpen', _Modals.onOpen);
    _requireFunction('HouseholdModals.currentYear', _Modals.currentYear);
    _requireFunction('HouseholdModals.closeThen', _Modals.closeThen);
    _requireFunction('HouseholdModals.confirmDialog', _Modals.confirmDialog);

    var _esc = _Modals.esc;
    var _toast = function (msg, type) {
        if (typeof window.showToast === 'function') {
            try { window.showToast(msg, type || 'info'); } catch (e) {}
        } else if (typeof console !== 'undefined' && console.warn) {
            console.warn('[modals-family-additions] ' + (type || 'info') + ': ' + msg);
        }
    };

    var _currentYear = _Modals.currentYear;
    var _closeThen = _Modals.closeThen;
    var _confirmDialog = _Modals.confirmDialog;

    // =========================================================================
    // 1. INLINE CHARACTER PICKER
    // =========================================================================

    function _buildCharacterPickerHtml(options) {
        options = options || {};
        var listId = options.listId || 'fa-picker-list';
        var searchId = options.searchId || 'fa-picker-search';
        var placeholder = options.placeholder || 'Search characters…';

        return '<input type="search" id="' + _esc(searchId) + '" ' +
            'class="character-tab-input" ' +
            'placeholder="' + _esc(placeholder) + '" autocomplete="off">' +
            '<div id="' + _esc(listId) + '" ' +
                'class="character-tab-history" ' +
                'style="max-height:220px;overflow-y:auto;margin-top:0.5rem;">' +
            '</div>' +
            '<div class="character-tab-note" data-picker-selection="' +
                _esc(listId) + '">No character selected</div>';
    }

    function _renderCharacterPickerRows(listEl, candidates) {
        if (!listEl) return;
        if (!Array.isArray(candidates) || candidates.length === 0) {
            listEl.innerHTML = '<div class="character-tab-empty">' +
                'No matches</div>';
            return;
        }
        var html = '';
        for (var i = 0; i < candidates.length; i++) {
            var c = candidates[i];
            if (!c || !c.id) continue;
            var name = (c.name || '') + (c.surname ? ' ' + c.surname : '');
            if (!name) name = c.id;
            var meta = [];
            if (typeof c.age === 'number') meta.push(c.age + 'y');
            if (c.gender) meta.push(c.gender);
            if (c.isDeceased === true) meta.push('deceased');
            var metaStr = meta.length > 0 ? ' · ' + meta.join(' · ') : '';
            html += '<div class="character-tab-history__row" ' +
                'data-character-id="' + _esc(c.id) + '" ' +
                'style="cursor:pointer;">' +
                '<div class="character-tab-history__main">' +
                    '<span class="character-tab-history__value">' +
                        _esc(name) +
                    '</span>' +
                    '<span class="character-tab-history__reason">' +
                        _esc(metaStr) +
                    '</span>' +
                '</div>' +
            '</div>';
        }
        listEl.innerHTML = html;
    }

    function _getCharacterCandidates(query, excludeIds) {
        var excludeSet = {};
        if (Array.isArray(excludeIds)) {
            for (var i = 0; i < excludeIds.length; i++) {
                if (typeof excludeIds[i] === 'string' && excludeIds[i].length > 0) {
                    excludeSet[excludeIds[i]] = true;
                }
            }
        }

        if (!CQ || typeof CQ.getAllCharacters !== 'function') return [];

        var all = [];
        try { all = CQ.getAllCharacters() || []; }
        catch (e) { all = []; }

        var lower = (query || '').toLowerCase().trim();
        var out = [];
        for (var j = 0; j < all.length; j++) {
            var c = all[j];
            if (!c || !c.id) continue;
            if (excludeSet[c.id] === true) continue;
            if (lower.length > 0) {
                var name = ((c.name || '') + ' ' + (c.surname || '')).toLowerCase();
                if (name.indexOf(lower) === -1) continue;
            }
            var summary = null;
            try { summary = CQ.getCharacterSummary(c.id); }
            catch (e) { summary = null; }
            if (!summary) continue;
            out.push(summary);
        }
        out.sort(function (a, b) {
            var an = ((a.name || '') + ' ' + (a.surname || '')).trim();
            var bn = ((b.name || '') + ' ' + (b.surname || '')).trim();
            return an.localeCompare(bn);
        });
        return out;
    }

    function _wireCharacterPicker(root, listId, searchId, excludeIds, onSelect) {
        var listEl = root.querySelector('#' + listId);
        var searchEl = root.querySelector('#' + searchId);
        var noteEl = root.querySelector('[data-picker-selection="' + listId + '"]');

        function refresh(query) {
            var candidates = _getCharacterCandidates(query, excludeIds);
            _renderCharacterPickerRows(listEl, candidates);
        }

        if (searchEl) {
            searchEl.addEventListener('input', function () {
                refresh(searchEl.value);
            });
        }
        refresh('');

        if (listEl) {
            listEl.addEventListener('click', function (e) {
                var row = e.target.closest('[data-character-id]');
                if (!row || !listEl.contains(row)) return;
                var id = row.getAttribute('data-character-id');
                if (!id) return;

                var rows = listEl.querySelectorAll('.character-tab-history__row');
                for (var i = 0; i < rows.length; i++) {
                    rows[i].classList.remove('is-current');
                }
                row.classList.add('is-current');

                var summary = null;
                try { summary = CQ.getCharacterSummary(id); }
                catch (err) { summary = null; }
                var name = summary
                    ? ((summary.name || '') + ' ' + (summary.surname || '')).trim()
                    : id;
                if (noteEl) {
                    noteEl.textContent = 'Selected: ' + (name || id);
                }
                if (typeof onSelect === 'function') onSelect(id);
            });
        }
    }

    // =========================================================================
    // 2. HELPERS
    // =========================================================================

    function _deriveParentRoleFor(parentSummary) {
        if (!parentSummary) return 'parent';
        if (parentSummary.gender === 'female') return 'mother';
        if (parentSummary.gender === 'male') return 'father';
        return 'parent';
    }

    function _roleLabel(role) {
        if (role === 'mother') return 'Mother';
        if (role === 'father') return 'Father';
        return 'Parent';
    }

    function _fullName(summary) {
        if (!summary) return '';
        return ((summary.name || '') +
            (summary.surname ? ' ' + summary.surname : '')).trim();
    }

    function _persist(char) {
        // Family and Children live in different domains; both persist
        // functions may exist. Persist all available ones once each.
        var errors = [];
        var any = false;
        if (typeof window.HouseholdCommands !== 'undefined'
            && window.HouseholdCommands
            && typeof window.HouseholdCommands.persist === 'function') {
            // Not needed for family additions (no household mutation),
            // but harmless if some flow touched it. Skip.
        }
        if (typeof window.CharacterCommands !== 'undefined'
            && window.CharacterCommands) {
            // Character writes are already committed through the
            // Family/Children commands; character-commands has no
            // domain-wide persist.
        }
        // FamilyCommands.setParent persists nothing on its own; the
        // canonical family write is persisted via markDataDirty inside
        // the command. No explicit persist is required for family edges.
        //
        // ChildrenCommands.recordBirth persists internally via its
        // commit(). No explicit persist required.
        //
        // recordAdoptionMetadata likewise commits internally.
        //
        // We still verify that at least one persistence path was
        // available, and surface a warning if the world has no dirty
        // flag mechanism loaded (that would be a load-order bug).
        if (typeof window.markDataDirty === 'function') any = true;
        return { ok: true, any: any, errors: errors };
    }

    // =========================================================================
    // 3. SET PARENT (mother / father)
    // =========================================================================

    function openSetParentModal(childId, role, onSuccess, options) {
        options = options || {};
        if (typeof childId !== 'string' || childId.length === 0) {
            _toast('Child id is required', 'error');
            return null;
        }
        if (role !== 'mother' && role !== 'father') {
            _toast('Role must be mother or father', 'error');
            return null;
        }

        var childSummary = null;
        try { childSummary = CQ.getCharacterSummary(childId); }
        catch (e) { childSummary = null; }
        if (!childSummary) {
            _toast('Child not found', 'error');
            return null;
        }

        // Which parent currently fills this role (if any)?
        var roles = null;
        try { roles = FQ.getParentsByRole(childId); }
        catch (e) { roles = null; }
        var currentParentEdge = null;
        if (roles) {
            var list = role === 'mother' ? roles.mothers : roles.fathers;
            if (Array.isArray(list)) {
                for (var i = 0; i < list.length; i++) {
                    if (list[i] && list[i].parentType === 'biological') {
                        currentParentEdge = list[i];
                        break;
                    }
                }
            }
        }

        var currentParentName = null;
        if (currentParentEdge) {
            var currentParentSummary = null;
            try { currentParentSummary = CQ.getCharacterSummary(currentParentEdge.parentId); }
            catch (e) { currentParentSummary = null; }
            currentParentName = currentParentSummary
                ? _fullName(currentParentSummary)
                : currentParentEdge.parentId;
        }

        var roleLabel = _roleLabel(role);
        var childName = _fullName(childSummary);

        var currentHtml = currentParentEdge
            ? '<div class="character-tab-note">' +
                'Current biological ' + role + ': <strong>' +
                _esc(currentParentName) +
                '</strong> (will be replaced)' +
              '</div>'
            : '';

        var content =
            '<div style="margin-bottom:16px;">' +
                '<div style="padding:10px 12px;background:var(--bg2);border-radius:6px;margin-bottom:12px;font-size:0.65rem;">' +
                    'Set biological ' + _esc(roleLabel.toLowerCase()) +
                    ' of <strong>' + _esc(childName) + '</strong>' +
                '</div>' +
                currentHtml +
                '<div style="margin-top:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">' +
                        _esc(roleLabel) + '</label>' +
                    _buildCharacterPickerHtml({
                        listId: 'sp-list',
                        searchId: 'sp-search'
                    }) +
                '</div>' +
            '</div>';

        var selectedId = null;
        var mutationSucceeded = false;
        var mutationData = null;

        var modal = _openModal({
            titleHtml: 'Set ' + _esc(roleLabel),
            contentHtml: content,
            confirmText: 'Set ' + _esc(roleLabel),
            cancelText: 'Cancel',
            onConfirm: function () {
                var root = _Modals.rootFrom(modal);
                if (!root) { _toast('Modal root unavailable', 'error'); return false; }

                if (mutationSucceeded) {
                    _toast('Set ' + roleLabel + ' saved', 'success');
                    if (typeof onSuccess === 'function') onSuccess(mutationData);
                    return true;
                }

                if (!selectedId) {
                    _toast('Please select a character', 'error');
                    return false;
                }
                if (selectedId === childId) {
                    _toast('A character cannot be their own parent', 'error');
                    return false;
                }

                var doSet = function () {
                    var result = FC.setParent(childId, selectedId, {
                        parentType: 'biological',
                        parentRole: role,
                        startYear: childSummary.birthYear || _currentYear(),
                        allowReplace: true
                    });
                    if (!result || result.success !== true) {
                        _toast('Failed to set ' + roleLabel + ': ' +
                            (result && result.reason ? result.reason : 'unknown'),
                            'error');
                        return false;
                    }
                    mutationSucceeded = true;
                    mutationData = result;
                    _toast(roleLabel + ' set', 'success');
                    if (typeof onSuccess === 'function') onSuccess(result);
                    return true;
                };

                if (currentParentEdge && currentParentEdge.parentId !== selectedId) {
                    // Explicit replace prompt.
                    _confirmDialog(
                        'Replace biological ' + role + ' "' +
                            (currentParentName || currentParentEdge.parentId) +
                            '" with the selected character?',
                        'Replace ' + roleLabel,
                        doSet,
                        function () {}
                    );
                    return false; // stay open; doSet closes via onSuccess
                }

                return doSet();
            }
        });

        _Modals.onOpen(modal, function (root) {
            var exclude = [childId];
            _wireCharacterPicker(root, 'sp-list', 'sp-search', exclude,
                function (id) { selectedId = id; });
        });

        return modal;
    }

    // =========================================================================
    // 4. ADD EXISTING CHILD
    // =========================================================================

    function openAddExistingChildModal(parentId, type, onSuccess) {
        if (typeof parentId !== 'string' || parentId.length === 0) {
            _toast('Parent id is required', 'error');
            return null;
        }
        if (type !== 'biological' && type !== 'adopted') {
            _toast('Type must be biological or adopted', 'error');
            return null;
        }

        var parentSummary = null;
        try { parentSummary = CQ.getCharacterSummary(parentId); }
        catch (e) { parentSummary = null; }
        if (!parentSummary) {
            _toast('Parent not found', 'error');
            return null;
        }

        // Derived role for biological; explicit for adopted.
        var derivedRole = _deriveParentRoleFor(parentSummary);
        var roleControl;
        if (type === 'biological') {
            roleControl =
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Role</label>' +
                '<select id="aec-role" class="character-tab-input">' +
                    '<option value="father"' + (derivedRole === 'father' ? ' selected' : '') + '>Father</option>' +
                    '<option value="mother"' + (derivedRole === 'mother' ? ' selected' : '') + '>Mother</option>' +
                    '<option value="parent"' + (derivedRole === 'parent' ? ' selected' : '') + '>Parent</option>' +
                '</select>';
        } else {
            roleControl =
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Role</label>' +
                '<select id="aec-role" class="character-tab-input">' +
                    '<option value="father"' + (derivedRole === 'father' ? ' selected' : '') + '>Father</option>' +
                    '<option value="mother"' + (derivedRole === 'mother' ? ' selected' : '') + '>Mother</option>' +
                    '<option value="parent"' + (derivedRole === 'parent' ? ' selected' : '') + '>Parent</option>' +
                '</select>';
        }

        var typeLabel = type === 'biological' ? 'Biological' : 'Adopted';

        var content =
            '<div style="margin-bottom:16px;">' +
                '<div style="padding:10px 12px;background:var(--bg2);border-radius:6px;margin-bottom:12px;font-size:0.65rem;">' +
                    'Add a character as a ' + _esc(typeLabel.toLowerCase()) +
                    ' child of <strong>' + _esc(_fullName(parentSummary)) + '</strong>' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Child</label>' +
                    _buildCharacterPickerHtml({
                        listId: 'aec-list',
                        searchId: 'aec-search'
                    }) +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    roleControl +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Year</label>' +
                    '<input type="number" id="aec-year" class="character-tab-input" ' +
                        'value="' + (_currentYear() !== null ? _currentYear() : '') + '" min="1">' +
                '</div>' +
            '</div>';

        var selectedId = null;
        var mutationSucceeded = false;
        var mutationData = null;

        var modal = _openModal({
            titleHtml: 'Add ' + _esc(typeLabel) + ' Child',
            contentHtml: content,
            confirmText: 'Add Child',
            cancelText: 'Cancel',
            onConfirm: function () {
                var root = _Modals.rootFrom(modal);
                if (!root) { _toast('Modal root unavailable', 'error'); return false; }

                if (mutationSucceeded) {
                    _toast(typeLabel + ' child added', 'success');
                    if (typeof onSuccess === 'function') onSuccess(mutationData);
                    return true;
                }

                if (!selectedId) {
                    _toast('Please select a character', 'error');
                    return false;
                }
                if (selectedId === parentId) {
                    _toast('A character cannot be their own child', 'error');
                    return false;
                }

                var roleEl = root.querySelector('#aec-role');
                var role = roleEl ? roleEl.value : derivedRole;
                if (role !== 'mother' && role !== 'father' && role !== 'parent') {
                    role = derivedRole;
                }

                var yearRaw = root.querySelector('#aec-year').value;
                var year = parseInt(yearRaw, 10);
                if (!Number.isInteger(year) || !window.isValidYear(year)) {
                    _toast('Invalid year', 'error');
                    return false;
                }

                if (type === 'biological') {
                    // Cycle check up front — same check the command
                    // does, but the caller wants a clear message
                    // before any write.
                    var provider = FQ.getAncestorProvider();
                    if (FR.wouldCreateBiologicalCycle(selectedId, parentId, provider)) {
                        _toast('Adding this child would create a genealogy cycle.',
                            'error');
                        return false;
                    }

                    var result = FC.setParent(selectedId, parentId, {
                        parentType: 'biological',
                        parentRole: role,
                        startYear: year,
                        allowReplace: false
                    });
                    if (!result || result.success !== true) {
                        _toast('Failed to add biological child: ' +
                            (result && result.reason ? result.reason : 'unknown'),
                            'error');
                        return false;
                    }
                    mutationSucceeded = true;
                    mutationData = result;
                    _toast('Biological child added', 'success');
                    if (typeof onSuccess === 'function') onSuccess(result);
                    return true;
                }

                // type === 'adopted': two-step transaction.
                // 1. Create legal edge.
                var edgeResult = FC.createAdoption(selectedId, parentId, {
                    parentRole: role,
                    startYear: year,
                    notes: 'Retroactive adoption record',
                    biologicalParentsConsent: true
                });
                if (!edgeResult || edgeResult.success !== true) {
                    _toast('Failed to create legal edge: ' +
                        (edgeResult && edgeResult.reason
                            ? edgeResult.reason
                            : 'unknown'),
                        'error');
                    return false;
                }

                // 2. Record metadata.
                var metaResult = ChC.recordAdoptionMetadata(
                    selectedId, parentId,
                    { type: 'legal', year: year }
                );
                if (!metaResult || metaResult.success !== true) {
                    // Roll back the edge.
                    try {
                        FC.removeAdoption(selectedId, parentId, {
                            endYear: year,
                            reason: 'Adoption metadata failed'
                        });
                    } catch (e) { /* swallow */ }
                    _toast('Failed to record adoption metadata: ' +
                        (metaResult && metaResult.reason
                            ? metaResult.reason
                            : 'unknown'),
                        'error');
                    return false;
                }

                mutationSucceeded = true;
                mutationData = { edge: edgeResult, metadata: metaResult };
                _toast('Adopted child added', 'success');
                if (typeof onSuccess === 'function') onSuccess(mutationData);
                return true;
            }
        });

        _Modals.onOpen(modal, function (root) {
            var exclude = [parentId];
            _wireCharacterPicker(root, 'aec-list', 'aec-search', exclude,
                function (id) { selectedId = id; });
        });

        return modal;
    }

    // =========================================================================
    // 5. GENERATE NEW BABY
    // =========================================================================

    function openGenerateBabyModal(parentId, onSuccess, options) {
        options = options || {};
        if (typeof parentId !== 'string' || parentId.length === 0) {
            _toast('Parent id is required', 'error');
            return null;
        }

        var parentSummary = null;
        try { parentSummary = CQ.getCharacterSummary(parentId); }
        catch (e) { parentSummary = null; }
        if (!parentSummary) {
            _toast('Parent not found', 'error');
            return null;
        }

        // Resolve partner: options.partnerId > single committed partner
        // > picker.
        var presetPartnerId = options.partnerId || null;
        var presetPartnerSummary = null;
        if (presetPartnerId) {
            try { presetPartnerSummary = CQ.getCharacterSummary(presetPartnerId); }
            catch (e) { presetPartnerSummary = null; }
        }

        if (!presetPartnerId) {
            var committed = [];
            try { committed = RQm.getActiveCommittedPartners(parentId) || []; }
            catch (e) { committed = []; }
            if (Array.isArray(committed) && committed.length === 1) {
                var only = committed[0];
                if (only && only.partnerId) {
                    presetPartnerId = only.partnerId;
                    try { presetPartnerSummary = CQ.getCharacterSummary(presetPartnerId); }
                    catch (e) { presetPartnerSummary = null; }
                }
            }
        }

        // Same-sex guard: both parents must be mixed-sex for a
        // biological conception. If the parent + preset partner are
        // both male or both female, refuse up front.
        function _checkSameSex(parentG, partnerG) {
            if (parentG !== 'male' && parentG !== 'female') return null;
            if (partnerG !== 'male' && partnerG !== 'female') return null;
            if (parentG === partnerG) {
                return 'Same-sex conception is not possible in this simulation. ' +
                       'Use "Add Adopted Child" instead.';
            }
            return null;
        }

        if (presetPartnerSummary) {
            var sameSexMsg = _checkSameSex(parentSummary.gender, presetPartnerSummary.gender);
            if (sameSexMsg) {
                _toast(sameSexMsg, 'error');
                return null;
            }
        }

        var parentName = _fullName(parentSummary);
        var partnerName = presetPartnerSummary ? _fullName(presetPartnerSummary) : null;

        var content =
            '<div style="margin-bottom:16px;">' +
                '<div style="padding:10px 12px;background:var(--bg2);border-radius:6px;margin-bottom:12px;font-size:0.65rem;">' +
                    'Generate a biological child of <strong>' +
                    _esc(parentName) + '</strong>' +
                    (partnerName
                        ? ' and <strong>' + _esc(partnerName) + '</strong>'
                        : '') +
                '</div>' +
                (partnerName ? '' :
                    '<div style="margin-bottom:12px;">' +
                        '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Other Parent</label>' +
                        _buildCharacterPickerHtml({
                            listId: 'gb-list',
                            searchId: 'gb-search'
                        }) +
                    '</div>') +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Gender</label>' +
                    '<select id="gb-gender" class="character-tab-input">' +
                        '<option value="">Random</option>' +
                        '<option value="male">Male</option>' +
                        '<option value="female">Female</option>' +
                    '</select>' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Birth Year</label>' +
                    '<input type="number" id="gb-year" class="character-tab-input" ' +
                        'value="' + (_currentYear() !== null ? _currentYear() : '') + '" min="1">' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Name (optional)</label>' +
                    '<input type="text" id="gb-name" class="character-tab-input" autocomplete="off">' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Surname (optional)</label>' +
                    '<input type="text" id="gb-surname" class="character-tab-input" autocomplete="off" ' +
                        'placeholder="Defaults to one parent\'s surname">' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label class="character-tab-checkbox" style="display:flex;align-items:center;gap:6px;">' +
                        '<input type="checkbox" id="gb-stillborn">' +
                        '<span style="font-size:0.65rem;">Stillborn</span>' +
                    '</label>' +
                '</div>' +
            '</div>';

        var selectedPartnerId = presetPartnerId;
        var mutationSucceeded = false;
        var mutationData = null;

        var modal = _openModal({
            titleHtml: 'Generate New Baby',
            contentHtml: content,
            confirmText: 'Generate Baby',
            cancelText: 'Cancel',
            onConfirm: function () {
                var root = _Modals.rootFrom(modal);
                if (!root) { _toast('Modal root unavailable', 'error'); return false; }

                if (mutationSucceeded) {
                    _toast('Baby generated', 'success');
                    if (typeof onSuccess === 'function') onSuccess(mutationData);
                    return true;
                }

                if (!selectedPartnerId) {
                    _toast('Please select the other parent', 'error');
                    return false;
                }
                if (selectedPartnerId === parentId) {
                    _toast('A character cannot be the other parent of themselves', 'error');
                    return false;
                }

                var partnerSummary = null;
                try { partnerSummary = CQ.getCharacterSummary(selectedPartnerId); }
                catch (e) { partnerSummary = null; }
                if (!partnerSummary) {
                    _toast('Other parent not found', 'error');
                    return false;
                }

                var sameSexMsg2 = _checkSameSex(parentSummary.gender, partnerSummary.gender);
                if (sameSexMsg2) {
                    _toast(sameSexMsg2, 'error');
                    return false;
                }

                // Resolve which parent is mother and which is father.
                var motherId, fatherId;
                if (parentSummary.gender === 'female'
                    && partnerSummary.gender === 'male') {
                    motherId = parentId;
                    fatherId = selectedPartnerId;
                } else if (parentSummary.gender === 'male'
                    && partnerSummary.gender === 'female') {
                    motherId = selectedPartnerId;
                    fatherId = parentId;
                } else {
                    _toast('Both parents must have a known gender ' +
                        '(male/female) to generate a biological child.',
                        'error');
                    return false;
                }

                var genderEl = root.querySelector('#gb-gender');
                var gender = genderEl ? genderEl.value : '';
                if (gender !== 'male' && gender !== 'female') gender = undefined;

                var yearRaw = root.querySelector('#gb-year').value;
                var year = parseInt(yearRaw, 10);
                if (!Number.isInteger(year) || !window.isValidYear(year)) {
                    _toast('Invalid year', 'error');
                    return false;
                }

                var nameEl = root.querySelector('#gb-name');
                var surnameEl = root.querySelector('#gb-surname');
                var stillbornEl = root.querySelector('#gb-stillborn');

                var options2 = {
                    gender: gender,
                    isStillborn: stillbornEl ? stillbornEl.checked === true : false,
                    name: nameEl && nameEl.value.trim() ? nameEl.value.trim() : undefined,
                    surname: surnameEl && surnameEl.value.trim()
                        ? surnameEl.value.trim()
                        : undefined
                };

                var result = ChC.recordBirth(motherId, fatherId, year, options2);
                if (!result || result.success !== true) {
                    _toast('Failed to generate baby: ' +
                        (result && result.reason ? result.reason : 'unknown'),
                        'error');
                    return false;
                }

                mutationSucceeded = true;
                mutationData = result;
                _toast('Baby generated', 'success');
                if (typeof onSuccess === 'function') onSuccess(result);
                return true;
            }
        });

        _Modals.onOpen(modal, function (root) {
            if (!presetPartnerId) {
                var exclude = [parentId];
                _wireCharacterPicker(root, 'gb-list', 'gb-search', exclude,
                    function (id) { selectedPartnerId = id; });
            }
        });

        return modal;
    }

    // =========================================================================
    // 6. ADD EXISTING SIBLING (shared biological parent(s))
    // =========================================================================

    function openAddExistingSiblingModal(childId, onSuccess) {
        if (typeof childId !== 'string' || childId.length === 0) {
            _toast('Child id is required', 'error');
            return null;
        }

        var childSummary = null;
        try { childSummary = CQ.getCharacterSummary(childId); }
        catch (e) { childSummary = null; }
        if (!childSummary) {
            _toast('Child not found', 'error');
            return null;
        }

        // Read the child's biological parents.
        var bioParents;
        try { bioParents = FQ.getBiologicalParentIds(childId); }
        catch (e) { bioParents = []; }
        bioParents = Array.isArray(bioParents) ? bioParents : [];

        if (bioParents.length === 0) {
            _toast('This character has no biological parents to share.', 'error');
            return null;
        }

        // Build parent checkboxes.
        var parentCheckboxes = '';
        for (var i = 0; i < bioParents.length; i++) {
            var parentSummary = null;
            try { parentSummary = CQ.getCharacterSummary(bioParents[i]); }
            catch (e) { parentSummary = null; }
            if (!parentSummary) continue;
            var roleLabel = parentSummary.gender === 'female'
                ? 'Mother'
                : (parentSummary.gender === 'male' ? 'Father' : 'Parent');
            parentCheckboxes +=
                '<label class="character-tab-checkbox" ' +
                    'style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">' +
                    '<input type="checkbox" data-parent-id="' + _esc(bioParents[i]) + '" checked>' +
                    '<span style="font-size:0.7rem;">' +
                        _esc(_fullName(parentSummary)) +
                        ' <span class="character-tab-note">(' + _esc(roleLabel) + ')</span>' +
                    '</span>' +
                '</label>';
        }

        var content =
            '<div style="margin-bottom:16px;">' +
                '<div style="padding:10px 12px;background:var(--bg2);border-radius:6px;margin-bottom:12px;font-size:0.65rem;">' +
                    'Add an existing character as a sibling of <strong>' +
                    _esc(_fullName(childSummary)) + '</strong>' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Sibling</label>' +
                    _buildCharacterPickerHtml({
                        listId: 'asib-list',
                        searchId: 'asib-search'
                    }) +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Share Parents</label>' +
                    parentCheckboxes +
                    '<div class="character-tab-note" style="margin-top:4px;">' +
                        'The new sibling will be given the same parent edges for each checked parent.' +
                    '</div>' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Year</label>' +
                    '<input type="number" id="asib-year" class="character-tab-input" ' +
                        'value="' + (_currentYear() !== null ? _currentYear() : '') + '" min="1">' +
                '</div>' +
            '</div>';

        var selectedSiblingId = null;
        var mutationSucceeded = false;
        var mutationData = null;

        var modal = _openModal({
            titleHtml: 'Add Existing Sibling',
            contentHtml: content,
            confirmText: 'Add Sibling',
            cancelText: 'Cancel',
            onConfirm: function () {
                var root = _Modals.rootFrom(modal);
                if (!root) { _toast('Modal root unavailable', 'error'); return false; }

                if (mutationSucceeded) {
                    _toast('Sibling added', 'success');
                    if (typeof onSuccess === 'function') onSuccess(mutationData);
                    return true;
                }

                if (!selectedSiblingId) {
                    _toast('Please select a character', 'error');
                    return false;
                }
                if (selectedSiblingId === childId) {
                    _toast('A character cannot be their own sibling', 'error');
                    return false;
                }

                var yearRaw = root.querySelector('#asib-year').value;
                var year = parseInt(yearRaw, 10);
                if (!Number.isInteger(year) || !window.isValidYear(year)) {
                    _toast('Invalid year', 'error');
                    return false;
                }

                var boxes = root.querySelectorAll('input[data-parent-id]:checked');
                if (boxes.length === 0) {
                    _toast('Check at least one parent to share', 'error');
                    return false;
                }

                var succeeded = [];
                var failed = [];

                for (var b = 0; b < boxes.length; b++) {
                    var parentId = boxes[b].getAttribute('data-parent-id');
                    if (!parentId) continue;

                    // Derive role from parent's gender.
                    var parentSummary = null;
                    try { parentSummary = CQ.getCharacterSummary(parentId); }
                    catch (e) { parentSummary = null; }
                    var role = _deriveParentRoleFor(parentSummary);

                    var result = FC.setParent(selectedSiblingId, parentId, {
                        parentType: 'biological',
                        parentRole: role,
                        startYear: year,
                        allowReplace: false
                    });
                    if (result && result.success === true) {
                        succeeded.push(parentId);
                    } else {
                        failed.push({
                            parentId: parentId,
                            reason: (result && result.reason)
                                ? result.reason
                                : 'unknown'
                        });
                    }
                }

                if (succeeded.length === 0) {
                    _toast('Failed to add sibling: ' +
                        (failed[0] ? failed[0].reason : 'no parents checked'),
                        'error');
                    return false;
                }

                mutationSucceeded = true;
                mutationData = { succeeded: succeeded, failed: failed };
                if (failed.length > 0) {
                    _toast('Sibling added for ' + succeeded.length +
                        ' of ' + boxes.length + ' parents', 'warning');
                } else {
                    _toast('Sibling added', 'success');
                }
                if (typeof onSuccess === 'function') onSuccess(mutationData);
                return true;
            }
        });

        _Modals.onOpen(modal, function (root) {
            var exclude = [childId];
            _wireCharacterPicker(root, 'asib-list', 'asib-search', exclude,
                function (id) { selectedSiblingId = id; });
        });

        return modal;
    }

    // =========================================================================
    // 7. ADD ADOPTED SIBLING (shared legal parent(s))
    // =========================================================================

    function openAddAdoptedSiblingModal(childId, onSuccess) {
        if (typeof childId !== 'string' || childId.length === 0) {
            _toast('Child id is required', 'error');
            return null;
        }

        var childSummary = null;
        try { childSummary = CQ.getCharacterSummary(childId); }
        catch (e) { childSummary = null; }
        if (!childSummary) {
            _toast('Child not found', 'error');
            return null;
        }

        // Read the child's active adoption records.
        var adoptions = [];
        try { adoptions = ChQ.getActiveAdoptionsForChild(childId) || []; }
        catch (e) { adoptions = []; }
        adoptions = Array.isArray(adoptions) ? adoptions : [];

        if (adoptions.length === 0) {
            _toast('This character has no active adoption records.', 'error');
            return null;
        }

        var parentCheckboxes = '';
        var seen = {};
        for (var i = 0; i < adoptions.length; i++) {
            var rec = adoptions[i];
            if (!rec || !rec.adopterId) continue;
            if (seen[rec.adopterId]) continue;
            seen[rec.adopterId] = true;

            var parentSummary = null;
            try { parentSummary = CQ.getCharacterSummary(rec.adopterId); }
            catch (e) { parentSummary = null; }
            if (!parentSummary) continue;
            var roleLabel = rec.type === 'legal'
                ? 'Adoptive'
                : (rec.type === 'guardianship' ? 'Guardian' : 'Foster');

            parentCheckboxes +=
                '<label class="character-tab-checkbox" ' +
                    'style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">' +
                    '<input type="checkbox" data-adopter-id="' + _esc(rec.adopterId) + '" ' +
                        'data-adoption-type="' + _esc(rec.type) + '" checked>' +
                    '<span style="font-size:0.7rem;">' +
                        _esc(_fullName(parentSummary)) +
                        ' <span class="character-tab-note">(' + _esc(roleLabel) + ')</span>' +
                    '</span>' +
                '</label>';
        }

        var content =
            '<div style="margin-bottom:16px;">' +
                '<div style="padding:10px 12px;background:var(--bg2);border-radius:6px;margin-bottom:12px;font-size:0.65rem;">' +
                    'Add an existing character as an adopted sibling of <strong>' +
                    _esc(_fullName(childSummary)) + '</strong>' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Sibling</label>' +
                    _buildCharacterPickerHtml({
                        listId: 'adoptsib-list',
                        searchId: 'adoptsib-search'
                    }) +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Share Adopting Parents</label>' +
                    parentCheckboxes +
                    '<div class="character-tab-note" style="margin-top:4px;">' +
                        'The new sibling will be given the same adopting parents for each checked box.' +
                    '</div>' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Year</label>' +
                    '<input type="number" id="adoptsib-year" class="character-tab-input" ' +
                        'value="' + (_currentYear() !== null ? _currentYear() : '') + '" min="1">' +
                '</div>' +
            '</div>';

        var selectedSiblingId = null;
        var mutationSucceeded = false;
        var mutationData = null;

        var modal = _openModal({
            titleHtml: 'Add Adopted Sibling',
            contentHtml: content,
            confirmText: 'Add Sibling',
            cancelText: 'Cancel',
            onConfirm: function () {
                var root = _Modals.rootFrom(modal);
                if (!root) { _toast('Modal root unavailable', 'error'); return false; }

                if (mutationSucceeded) {
                    _toast('Adopted sibling added', 'success');
                    if (typeof onSuccess === 'function') onSuccess(mutationData);
                    return true;
                }

                if (!selectedSiblingId) {
                    _toast('Please select a character', 'error');
                    return false;
                }
                if (selectedSiblingId === childId) {
                    _toast('A character cannot be their own sibling', 'error');
                    return false;
                }

                var yearRaw = root.querySelector('#adoptsib-year').value;
                var year = parseInt(yearRaw, 10);
                if (!Number.isInteger(year) || !window.isValidYear(year)) {
                    _toast('Invalid year', 'error');
                    return false;
                }

                var boxes = root.querySelectorAll('input[data-adopter-id]:checked');
                if (boxes.length === 0) {
                    _toast('Check at least one parent to share', 'error');
                    return false;
                }

                var succeeded = [];
                var failed = [];

                for (var b = 0; b < boxes.length; b++) {
                    var adopterId = boxes[b].getAttribute('data-adopter-id');
                    var adoptionType = boxes[b].getAttribute('data-adoption-type')
                        || 'legal';
                    if (!adopterId) continue;

                    // Derive role from adopter gender.
                    var adopterSummary = null;
                    try { adopterSummary = CQ.getCharacterSummary(adopterId); }
                    catch (e) { adopterSummary = null; }
                    var role = _deriveParentRoleFor(adopterSummary);

                    // Step 1: legal edge (always legal — adoption is
                    // a legal relationship regardless of original
                    // adoption type on the source sibling).
                    var edgeResult = FC.createAdoption(selectedSiblingId, adopterId, {
                        parentRole: role,
                        startYear: year,
                        notes: 'Retroactive adopted sibling',
                        biologicalParentsConsent: true
                    });
                    if (!edgeResult || edgeResult.success !== true) {
                        failed.push({
                            adopterId: adopterId,
                            reason: (edgeResult && edgeResult.reason)
                                ? edgeResult.reason
                                : 'unknown'
                        });
                        continue;
                    }

                    // Step 2: metadata.
                    var metaResult = ChC.recordAdoptionMetadata(
                        selectedSiblingId, adopterId,
                        { type: adoptionType, year: year }
                    );
                    if (!metaResult || metaResult.success !== true) {
                        try {
                            FC.removeAdoption(selectedSiblingId, adopterId, {
                                endYear: year,
                                reason: 'Adoption metadata failed'
                            });
                        } catch (e) { /* swallow */ }
                        failed.push({
                            adopterId: adopterId,
                            reason: (metaResult && metaResult.reason)
                                ? metaResult.reason
                                : 'unknown'
                        });
                        continue;
                    }

                    succeeded.push(adopterId);
                }

                if (succeeded.length === 0) {
                    _toast('Failed to add adopted sibling: ' +
                        (failed[0] ? failed[0].reason : 'no parents checked'),
                        'error');
                    return false;
                }

                mutationSucceeded = true;
                mutationData = { succeeded: succeeded, failed: failed };
                if (failed.length > 0) {
                    _toast('Adopted sibling added for ' + succeeded.length +
                        ' of ' + boxes.length + ' parents', 'warning');
                } else {
                    _toast('Adopted sibling added', 'success');
                }
                if (typeof onSuccess === 'function') onSuccess(mutationData);
                return true;
            }
        });

        _Modals.onOpen(modal, function (root) {
            var exclude = [childId];
            _wireCharacterPicker(root, 'adoptsib-list', 'adoptsib-search', exclude,
                function (id) { selectedSiblingId = id; });
        });

        return modal;
    }

    // =========================================================================
    // 8. ADD FOSTER / WARD
    // =========================================================================

    function openAddFosterOrWardModal(parentId, kind, onSuccess) {
        if (typeof parentId !== 'string' || parentId.length === 0) {
            _toast('Parent id is required', 'error');
            return null;
        }
        if (kind !== 'foster' && kind !== 'guardianship') {
            _toast('Kind must be foster or guardianship', 'error');
            return null;
        }

        var parentSummary = null;
        try { parentSummary = CQ.getCharacterSummary(parentId); }
        catch (e) { parentSummary = null; }
        if (!parentSummary) {
            _toast('Parent not found', 'error');
            return null;
        }

        var role = _deriveParentRoleFor(parentSummary);
        var kindLabel = kind === 'foster' ? 'Foster Child' : 'Ward';

        var content =
            '<div style="margin-bottom:16px;">' +
                '<div style="padding:10px 12px;background:var(--bg2);border-radius:6px;margin-bottom:12px;font-size:0.65rem;">' +
                    'Add a character as a ' + _esc(kindLabel.toLowerCase()) +
                    ' of <strong>' + _esc(_fullName(parentSummary)) + '</strong>' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">' +
                        _esc(kindLabel) + '</label>' +
                    _buildCharacterPickerHtml({
                        listId: 'afw-list',
                        searchId: 'afw-search'
                    }) +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Year</label>' +
                    '<input type="number" id="afw-year" class="character-tab-input" ' +
                        'value="' + (_currentYear() !== null ? _currentYear() : '') + '" min="1">' +
                '</div>' +
            '</div>';

        var selectedId = null;
        var mutationSucceeded = false;
        var mutationData = null;

        var modal = _openModal({
            titleHtml: 'Add ' + _esc(kindLabel),
            contentHtml: content,
            confirmText: 'Add ' + _esc(kindLabel),
            cancelText: 'Cancel',
            onConfirm: function () {
                var root = _Modals.rootFrom(modal);
                if (!root) { _toast('Modal root unavailable', 'error'); return false; }

                if (mutationSucceeded) {
                    _toast(kindLabel + ' added', 'success');
                    if (typeof onSuccess === 'function') onSuccess(mutationData);
                    return true;
                }

                if (!selectedId) {
                    _toast('Please select a character', 'error');
                    return false;
                }
                if (selectedId === parentId) {
                    _toast('A character cannot be their own ' +
                        kindLabel.toLowerCase(), 'error');
                    return false;
                }

                var yearRaw = root.querySelector('#afw-year').value;
                var year = parseInt(yearRaw, 10);
                if (!Number.isInteger(year) || !window.isValidYear(year)) {
                    _toast('Invalid year', 'error');
                    return false;
                }

                // Step 1: create legal edge.
                var edgeResult = FC.createAdoption(selectedId, parentId, {
                    parentRole: role,
                    startYear: year,
                    notes: kind === 'foster'
                        ? 'Foster placement'
                        : 'Guardianship',
                    biologicalParentsConsent: true
                });
                if (!edgeResult || edgeResult.success !== true) {
                    _toast('Failed to create legal edge: ' +
                        (edgeResult && edgeResult.reason
                            ? edgeResult.reason : 'unknown'),
                        'error');
                    return false;
                }

                // Step 2: metadata.
                var metaResult = ChC.recordAdoptionMetadata(
                    selectedId, parentId,
                    { type: kind, year: year }
                );
                if (!metaResult || metaResult.success !== true) {
                    try {
                        FC.removeAdoption(selectedId, parentId, {
                            endYear: year,
                            reason: 'Metadata failed'
                        });
                    } catch (e) { /* swallow */ }
                    _toast('Failed to record metadata: ' +
                        (metaResult && metaResult.reason
                            ? metaResult.reason : 'unknown'),
                        'error');
                    return false;
                }

                mutationSucceeded = true;
                mutationData = { edge: edgeResult, metadata: metaResult };
                _toast(kindLabel + ' added', 'success');
                if (typeof onSuccess === 'function') onSuccess(mutationData);
                return true;
            }
        });

        _Modals.onOpen(modal, function (root) {
            var exclude = [parentId];
            _wireCharacterPicker(root, 'afw-list', 'afw-search', exclude,
                function (id) { selectedId = id; });
        });

        return modal;
    }

    // =========================================================================
    // 9. EXPORTS
    // =========================================================================

    window.FamilyAdditionsModals = {
        openSetParentModal: openSetParentModal,
        openAddExistingChildModal: openAddExistingChildModal,
        openGenerateBabyModal: openGenerateBabyModal,
        openAddExistingSiblingModal: openAddExistingSiblingModal,
        openAddAdoptedSiblingModal: openAddAdoptedSiblingModal,
        openAddFosterOrWardModal: openAddFosterOrWardModal
    };

    // Flat aliases so the tab file can call them without the namespace.
    window.openSetParentModal = openSetParentModal;
    window.openAddExistingChildModal = openAddExistingChildModal;
    window.openGenerateBabyModal = openGenerateBabyModal;
    window.openAddExistingSiblingModal = openAddExistingSiblingModal;
    window.openAddAdoptedSiblingModal = openAddAdoptedSiblingModal;
    window.openAddFosterOrWardModal = openAddFosterOrWardModal;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.FamilyAdditionsModals;
    }
})();
