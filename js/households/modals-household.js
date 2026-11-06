/**
 * =============================================================================
 * STILL WATERS - HOUSEHOLD MODALS (modals-household.js)
 * =============================================================================
 *
 * LOCATION: js/households/modals-household.js
 *
 * PURPOSE
 * -------
 * Modal entry points for household CRUD, member management, and detail
 * viewing.
 *
 *   - openCreateHouseholdModal(onSuccess, options)
 *   - openEditHouseholdModal(householdId, onSuccess)
 *   - openDeleteHouseholdModal(householdId, onSuccess)
 *   - openHouseholdDetailsModal(householdId, onSuccess)
 *
 *   - openAddHouseholdMemberModal(householdId, onSuccess, options)
 *   - openRemoveHouseholdMemberModal(householdId, characterId, onSuccess, options)
 *   - openRenameHouseholdModal(householdId, onSuccess, options)
 *   - openEditHouseholdDetailsModal(householdId, onSuccess)
 *   - openTransferCharacterToHouseholdModal(characterId, onSuccess)
 *
 * OWNERSHIP
 * ---------
 *   Reads:  HouseholdQueries, HouseholdEconomy (pure calcs)
 *   Writes: HouseholdCommands + one persist() call per batch
 *   UI:     modals-core, icons, HouseholdModals, HouseholdViewModels
 *
 * CONVERGED PATTERN NOTES
 * -----------------------
 *   - Every mutation invokes HouseholdCommands.* then a single
 *     HouseholdCommands.persist() at the end of the batch (via
 *     HouseholdModals.persistOrFail).
 *   - No HouseholdState access.
 *   - No _saveMasterData call here.
 *   - No _processingModal guard.
 *   - Command return shapes are read via { success, data } / { success,
 *     code, reason } — no raw boolean checks.
 *   - processAnnualEconomy reads .data.* (economy already returns
 *     structured results).
 *
 * PERSIST-FAILURE BEHAVIOR
 * ------------------------
 *   Every mutating modal here returns `false` from onConfirm when
 *   persist fails, keeping the modal open so the user can retry. A
 *   mutation-succeeded flag in the closure prevents the command layer
 *   from running twice on a retry — the retry only re-runs the flush.
 *
 *   This applies to:
 *     openCreateHouseholdModal
 *     openEditHouseholdModal
 *     openAddHouseholdMemberModal
 *     openRemoveHouseholdMemberModal
 *     openRenameHouseholdModal
 *     openEditHouseholdDetailsModal
 *     openTransferCharacterToHouseholdModal
 *
 *   The delete modal uses confirmDialog, which cannot keep itself open
 *   after the confirm click. Its behaviour on persist failure is
 *   documented as a known limitation of the confirm-dialog shape.
 *
 * SHARED HELPERS
 * --------------
 *   Every shared helper used by this file — rootFrom, persistOrFail,
 *   reportFailure, esc, readValue, readIntOrNull, onOpen, currentYear,
 *   closeThen, confirmDialog — lives in HouseholdModals. This file keeps
 *   only its local aliases and its domain-specific builders.
 *
 * DOM-SCOPE
 * ---------
 *   Every DOM lookup is scoped to the modal's own `handle.element` via
 *   HouseholdModals.rootFrom(modal). See modals-helper.js for the full
 *   rationale on why the prior _resolveModalRoot() fallback (which
 *   ended at document.body) was wrong.
 *
 * INLINE PICKERS
 * --------------
 *   The Location tab's modals need to pick a character or household
 *   without assuming window.openCharacterSelector or
 *   window.openHouseholdSelector is loaded. This file defines its own
 *   inline pickers (search input + scrollable row list) for both, so
 *   these modals work with zero external selector dependencies.
 *
 * DEPENDENCIES (REQUIRED, verified at load):
 *   - formatting.js (escapeHtml)
 *   - icons.js (Icons)
 *   - modals-core.js (openModal, closeTopModal, confirmDialog)
 *   - ui.js (showToast) — used by HouseholdModals
 *   - household-queries.js (HouseholdQueries)
 *   - household-commands.js (HouseholdCommands)
 *   - household-modals-helper.js (HouseholdModals)
 *   - household-view-models.js (HouseholdViewModels)
 *
 * DEPENDENCIES (OPTIONAL, checked at call time):
 *   - household-economy.js (processAnnualEconomy)
 *   - industry-* (enterprise list/detail modals — reached via window
 *     function checks)
 *
 * ICON POLICY: SVG from icons.js. No emojis.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision (household-tab P4):
 *     - Added five modals for the Location tab:
 *         openAddHouseholdMemberModal
 *         openRemoveHouseholdMemberModal
 *         openRenameHouseholdModal
 *         openEditHouseholdDetailsModal
 *         openTransferCharacterToHouseholdModal
 *
 *       Each calls HouseholdCommands once, persists once via
 *       HouseholdModals.persistOrFail, and carries the same retry-
 *       idempotency discipline as the existing create / edit modals.
 *
 *     - Added inline character picker and inline household picker
 *       helpers. Neither window.openCharacterSelector nor
 *       window.openHouseholdSelector is assumed to be loaded.
 *
 *     - Added openAddHouseholdMemberModal, which uses the inline
 *       character picker, supports preselectedCharacterId, calls
 *       HouseholdCommands.addMember.
 *
 *     - Added openRemoveHouseholdMemberModal with a withHistory flag:
 *       true (default) → HouseholdCommands.removeMember (closes entry);
 *       false         → HouseholdCommands.removeMemberSilent (splices
 *                       entry — "fix a mistake" path).
 *
 *     - Added openRenameHouseholdModal with a withHistory flag:
 *       true (default) → HouseholdCommands.updateHousehold (appends
 *                       to nameHistory);
 *       false         → HouseholdCommands.updateHouseholdNameSilent
 *                       (does not append).
 *
 *     - Added openEditHouseholdDetailsModal for foundedYear, reputation,
 *       wealth, locationId, notes.
 *
 *     - Added openTransferCharacterToHouseholdModal using the inline
 *       household picker. Calls HouseholdCommands.transferMember.
 *
 *     - No behavioural change to any existing modal.
 *   Previous revisions:
 *     - The create and edit modals return false from onConfirm when
 *       persist fails; the mutation-succeeded flag makes retry
 *       idempotent.
 *     - Removed the local copies of _persistOrFail, _confirmDialog,
 *       _currentYear, and _closeThen. All delegate to HouseholdModals.
 *     - Every DOM lookup is scoped to handle.element via rootFrom.
 *     - _buildLocationOptions falls back to getPlaces when
 *       buildLocationDropdown is unavailable.
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. LOAD-TIME DEPENDENCY VERIFICATION
    // =========================================================================

    function _requireFunction(name, fn) {
        if (typeof fn !== 'function') {
            throw new Error('modals-household: ' + name + ' is required');
        }
        return fn;
    }

    function _requireObject(name, obj) {
        if (typeof obj === 'undefined' || obj === null) {
            throw new Error('modals-household: ' + name + ' is required');
        }
        return obj;
    }

    var _queries = _requireObject('HouseholdQueries', window.HouseholdQueries);
    _requireFunction('HouseholdQueries.getHousehold', _queries.getHousehold);
    _requireFunction('HouseholdQueries.getHouseholdDetails',
        _queries.getHouseholdDetails);
    _requireFunction('HouseholdQueries.getHouseholdEnterprises',
        _queries.getHouseholdEnterprises);
    _requireFunction('HouseholdQueries.getHouseholdMembers',
        _queries.getHouseholdMembers);

    var _commands = _requireObject('HouseholdCommands', window.HouseholdCommands);
    _requireFunction('HouseholdCommands.createHousehold',
        _commands.createHousehold);
    _requireFunction('HouseholdCommands.updateHousehold',
        _commands.updateHousehold);
    _requireFunction('HouseholdCommands.setStatus', _commands.setStatus);
    _requireFunction('HouseholdCommands.deleteHousehold',
        _commands.deleteHousehold);
    _requireFunction('HouseholdCommands.addMember', _commands.addMember);
    _requireFunction('HouseholdCommands.removeMember', _commands.removeMember);
    _requireFunction('HouseholdCommands.updateHouseholdNameSilent',
        _commands.updateHouseholdNameSilent);
    _requireFunction('HouseholdCommands.removeMemberSilent',
        _commands.removeMemberSilent);
    _requireFunction('HouseholdCommands.transferMember',
        _commands.transferMember);

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
    _requireFunction('HouseholdModals.persistOrFail', _Modals.persistOrFail);
    _requireFunction('HouseholdModals.reportFailure', _Modals.reportFailure);
    _requireFunction('HouseholdModals.esc', _Modals.esc);
    _requireFunction('HouseholdModals.readValue', _Modals.readValue);
    _requireFunction('HouseholdModals.readIntOrNull', _Modals.readIntOrNull);
    _requireFunction('HouseholdModals.onOpen', _Modals.onOpen);
    _requireFunction('HouseholdModals.currentYear', _Modals.currentYear);
    _requireFunction('HouseholdModals.closeThen', _Modals.closeThen);
    _requireFunction('HouseholdModals.confirmDialog', _Modals.confirmDialog);

    var _VM = _requireObject('HouseholdViewModels', window.HouseholdViewModels);

    // Local aliases. Keep the call sites short and unchanged.
    var _esc = _Modals.esc;
    var _showSuccess = _Modals.showSuccess;
    var _showWarning = _Modals.showWarning;
    var _showInfo = _Modals.showInfo;
    var _showError = _Modals.showError;

    // Per-modal delegates to the shared helpers.
    var _persistOrFail = _Modals.persistOrFail;
    var _confirmDialog = _Modals.confirmDialog;
    var _currentYear = _Modals.currentYear;
    var _closeThen = _Modals.closeThen;

    // =========================================================================
    // 1. LOCATION OPTIONS
    // =========================================================================

    function _buildLocationOptions(selectedId, placeholder) {
        if (typeof window.buildLocationDropdown === 'function') {
            return window.buildLocationDropdown(selectedId, placeholder, false);
        }
        if (typeof window.getPlaces !== 'function') {
            return '<option value="">' + _esc(placeholder || '') + '</option>';
        }
        var places = window.getPlaces() || [];
        var html = '<option value="">' + _esc(placeholder || '') + '</option>';
        var sorted = places.slice().sort(function(a, b) {
            return (a.displayName || '').localeCompare(b.displayName || '');
        });
        for (var i = 0; i < sorted.length; i++) {
            var p = sorted[i];
            var label = p.displayName || p.name || 'Unknown';
            var selected = (selectedId === p.id) ? ' selected' : '';
            html += '<option value="' + _esc(p.id) + '"' + selected + '>' +
                _esc(label) + '</option>';
        }
        return html;
    }

    // =========================================================================
    // 1b. INLINE CHARACTER PICKER
    // =========================================================================
    //
    // The Location tab's "Add Member" and "Transfer" modals need a way
    // to pick a character without assuming window.openCharacterSelector
    // is loaded. We render the picker inside the modal: search input +
    // scrollable row list.

    function _buildCharacterPickerHtml(options) {
        options = options || {};
        var listId = options.listId || 'hh-picker-list';
        var searchId = options.searchId || 'hh-picker-search';
        var placeholder = options.placeholder || 'Search characters…';

        var html = '';
        html += '<input type="search" id="' + _esc(searchId) + '" ' +
            'class="character-tab-input" ' +
            'placeholder="' + _esc(placeholder) + '" autocomplete="off">';
        html += '<div id="' + _esc(listId) + '" ' +
            'class="character-tab-history" ' +
            'style="max-height:200px;overflow-y:auto;margin-top:0.5rem;">';
        html += '</div>';
        html += '<div class="character-tab-note" data-picker-selection="' +
            _esc(listId) + '">No character selected</div>';
        return html;
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

        var CQ = window.CharacterQueries;
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
            if (c.isDeceased === true) continue;
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
                try {
                    summary = window.CharacterQueries.getCharacterSummary(id);
                } catch (err) { summary = null; }
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
    // 1c. INLINE HOUSEHOLD PICKER
    // =========================================================================
    //
    // The Transfer modal needs to pick a target household without
    // assuming window.openHouseholdSelector is loaded.

    function _buildHouseholdPickerHtml(options) {
        options = options || {};
        var listId = options.listId || 'hh-hpick-list';
        var searchId = options.searchId || 'hh-hpick-search';
        var placeholder = options.placeholder || 'Search households…';

        var html = '';
        html += '<input type="search" id="' + _esc(searchId) + '" ' +
            'class="character-tab-input" ' +
            'placeholder="' + _esc(placeholder) + '" autocomplete="off">';
        html += '<div id="' + _esc(listId) + '" ' +
            'class="character-tab-history" ' +
            'style="max-height:200px;overflow-y:auto;margin-top:0.5rem;">';
        html += '</div>';
        html += '<div class="character-tab-note" data-picker-selection="' +
            _esc(listId) + '">No household selected</div>';
        return html;
    }

    function _renderHouseholdPickerRows(listEl, candidates) {
        if (!listEl) return;
        if (!Array.isArray(candidates) || candidates.length === 0) {
            listEl.innerHTML = '<div class="character-tab-empty">' +
                'No matches</div>';
            return;
        }
        var html = '';
        for (var i = 0; i < candidates.length; i++) {
            var h = candidates[i];
            if (!h || !h.id) continue;
            var name = h.name || h.id;
            var meta = [];
            if (typeof h.memberCount === 'number') {
                meta.push(h.memberCount + ' member' +
                    (h.memberCount === 1 ? '' : 's'));
            }
            if (h.locationName) meta.push(h.locationName);
            var metaStr = meta.length > 0 ? ' · ' + meta.join(' · ') : '';
            html += '<div class="character-tab-history__row" ' +
                'data-household-id="' + _esc(h.id) + '" ' +
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

    function _getHouseholdCandidates(query, excludeIds) {
        var excludeSet = {};
        if (Array.isArray(excludeIds)) {
            for (var i = 0; i < excludeIds.length; i++) {
                if (typeof excludeIds[i] === 'string' && excludeIds[i].length > 0) {
                    excludeSet[excludeIds[i]] = true;
                }
            }
        }

        var all = [];
        try { all = _queries.getAllHouseholds() || []; }
        catch (e) { all = []; }

        var lower = (query || '').toLowerCase().trim();
        var out = [];
        for (var j = 0; j < all.length; j++) {
            var h = all[j];
            if (!h || !h.id) continue;
            if (excludeSet[h.id] === true) continue;
            if (h.status === 'deprecated' || h.status === 'destroyed') continue;
            if (lower.length > 0) {
                var name = (h.name || '').toLowerCase();
                if (name.indexOf(lower) === -1) continue;
            }
            out.push(h);
        }
        out.sort(function (a, b) {
            return (a.name || '').localeCompare(b.name || '');
        });
        return out;
    }

    function _wireHouseholdPicker(root, listId, searchId, excludeIds, onSelect) {
        var listEl = root.querySelector('#' + listId);
        var searchEl = root.querySelector('#' + searchId);
        var noteEl = root.querySelector('[data-picker-selection="' + listId + '"]');

        function refresh(query) {
            var candidates = _getHouseholdCandidates(query, excludeIds);
            _renderHouseholdPickerRows(listEl, candidates);
        }

        if (searchEl) {
            searchEl.addEventListener('input', function () {
                refresh(searchEl.value);
            });
        }
        refresh('');

        if (listEl) {
            listEl.addEventListener('click', function (e) {
                var row = e.target.closest('[data-household-id]');
                if (!row || !listEl.contains(row)) return;
                var id = row.getAttribute('data-household-id');
                if (!id) return;

                var rows = listEl.querySelectorAll('.character-tab-history__row');
                for (var i = 0; i < rows.length; i++) {
                    rows[i].classList.remove('is-current');
                }
                row.classList.add('is-current');

                var summary = null;
                try { summary = _queries.getHousehold(id); }
                catch (err) { summary = null; }
                var name = summary ? (summary.name || id) : id;
                if (noteEl) {
                    noteEl.textContent = 'Selected: ' + name;
                }
                if (typeof onSelect === 'function') onSelect(id);
            });
        }
    }

    function _currentHouseholdMemberIds(householdId) {
        var members = [];
        try { members = _queries.getHouseholdMembers(householdId) || []; }
        catch (e) { members = []; }
        var out = [];
        for (var i = 0; i < members.length; i++) {
            if (members[i] && members[i].characterId) {
                out.push(members[i].characterId);
            }
        }
        return out;
    }

    // =========================================================================
    // 2. CREATE HOUSEHOLD MODAL
    // =========================================================================

    function openCreateHouseholdModal(onSuccess, options) {
        options = options || {};

        var locationOptions = _buildLocationOptions(null, '-- Select location --');
        var currentYear = _currentYear();

        var content =
            '<div style="max-height:500px;overflow-y:auto;padding:4px;">' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Household Name *</label>' +
                    '<input type="text" data-field="name" placeholder="Enter household name" ' +
                        'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;">' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Location</label>' +
                    '<select data-field="locationId" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;">' +
                        locationOptions +
                    '</select>' +
                '</div>' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">' +
                    '<div>' +
                        '<label style="display:block;font-size:0.6rem;color:var(--dim);margin-bottom:4px;">Initial Wealth</label>' +
                        '<input type="number" data-field="wealth" value="' +
                            _VM.DEFAULT_INITIAL_WEALTH +
                            '" style="width:100%;padding:6px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.7rem;">' +
                    '</div>' +
                    '<div>' +
                        '<label style="display:block;font-size:0.6rem;color:var(--dim);margin-bottom:4px;">Initial Reputation</label>' +
                        '<input type="number" data-field="reputation" value="' +
                            _VM.DEFAULT_INITIAL_REPUTATION +
                            '" min="0" max="100" style="width:100%;padding:6px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.7rem;">' +
                    '</div>' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Head of Household</label>' +
                    '<div style="display:flex;gap:6px;">' +
                        '<input type="text" data-field="headDisplay" placeholder="Select head..." readonly ' +
                            'style="flex:1;padding:6px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;font-size:0.7rem;cursor:pointer;">' +
                        '<input type="hidden" data-field="headId">' +
                        '<button data-action="select-head" class="btn" style="font-size:0.6rem;padding:4px 10px;">Select</button>' +
                        '<button data-action="clear-head" class="btn" style="font-size:0.6rem;padding:4px 8px;">Clear</button>' +
                    '</div>' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Notes</label>' +
                    '<textarea data-field="notes" rows="2" placeholder="Additional notes..." ' +
                        'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;"></textarea>' +
                '</div>' +
            '</div>';

        var createdHouseholdId = null;
        var createdHouseholdData = null;

        var modal = _openModal({
            title: 'Create Household',
            content: content,
            confirmText: 'Create',
            cancelText: 'Cancel',
            onConfirm: function () {
                var root = _Modals.rootFrom(modal);
                if (!root) {
                    _showError('Modal root unavailable');
                    return false;
                }

                if (createdHouseholdId !== null) {
                    var retryPersist = _persistOrFail('Household created');
                    if (!retryPersist.ok) return false;
                    _showSuccess('Household created: ' +
                        (createdHouseholdData ? createdHouseholdData.name : ''));
                    if (typeof onSuccess === 'function') {
                        onSuccess(createdHouseholdData);
                    }
                    return true;
                }

                var name = _Modals.readValue(root, '[data-field="name"]');
                if (!name || name.trim() === '') {
                    _showError('Household name is required');
                    return false;
                }

                var wealth = _Modals.readIntOrNull(root, '[data-field="wealth"]');
                if (wealth === null) wealth = _VM.DEFAULT_INITIAL_WEALTH;

                var reputation = _Modals.readIntOrNull(
                    root, '[data-field="reputation"]');
                if (reputation === null) reputation = _VM.DEFAULT_INITIAL_REPUTATION;

                var data = {
                    name: name.trim(),
                    locationId: _Modals.readValue(root, '[data-field="locationId"]') || null,
                    wealth: wealth,
                    reputation: reputation,
                    foundedYear: currentYear,
                    notes: _Modals.readValue(root, '[data-field="notes"]')
                };
                var headId = _Modals.readValue(root, '[data-field="headId"]');
                if (headId) data.headId = headId;

                var result = _commands.createHousehold(data);
                if (!result.success) {
                    _Modals.reportFailure(result, 'Failed to create household');
                    return false;
                }

                createdHouseholdId = result.data.householdId;
                createdHouseholdData = result.data;

                var persisted = _persistOrFail('Household created');
                if (!persisted.ok) return false;

                _showSuccess('Household created: ' + data.name);
                if (typeof onSuccess === 'function') onSuccess(result.data);
                return true;
            }
        });

        _Modals.onOpen(modal, function (root) {
            var selectBtn = root.querySelector('[data-action="select-head"]');
            var clearBtn = root.querySelector('[data-action="clear-head"]');
            var display = root.querySelector('[data-field="headDisplay"]');
            var hidden = root.querySelector('[data-field="headId"]');

            if (selectBtn) {
                selectBtn.onclick = function () {
                    // Inline character picker path — render a small
                    // selector modal on top of this one.
                    _openInlineCharacterPickModal(function (character) {
                        if (!character) return;
                        if (display) {
                            display.value = (character.name || '') +
                                (character.surname ? ' ' + character.surname : '');
                        }
                        if (hidden) hidden.value = character.id;
                    });
                };
            }
            if (clearBtn) {
                clearBtn.onclick = function () {
                    if (display) display.value = '';
                    if (hidden) hidden.value = '';
                };
            }
        });

        return modal;
    }

    /**
     * Inline character picker modal. Used by the create-household modal
     * when window.openCharacterSelector is not available. The caller
     * supplies onSelect(characterSummary).
     */
    function _openInlineCharacterPickModal(onSelect) {
        var content = _buildCharacterPickerHtml({
            listId: 'icp-list',
            searchId: 'icp-search'
        });

        var selectedId = null;

        var modal = _openModal({
            title: 'Select Character',
            content: content,
            confirmText: 'Select',
            cancelText: 'Cancel',
            onConfirm: function () {
                if (!selectedId) {
                    _showError('Please select a character');
                    return false;
                }
                var summary = null;
                try {
                    summary = window.CharacterQueries.getCharacterSummary(selectedId);
                } catch (e) { summary = null; }
                if (!summary) {
                    _showError('Character not found');
                    return false;
                }
                if (typeof onSelect === 'function') onSelect(summary);
                return true;
            }
        });

        _Modals.onOpen(modal, function (root) {
            _wireCharacterPicker(root, 'icp-list', 'icp-search', [],
                function (id) { selectedId = id; });
        });

        return modal;
    }

    // =========================================================================
    // 3. EDIT HOUSEHOLD MODAL
    // =========================================================================

    function openEditHouseholdModal(householdId, onSuccess) {
        var household = _queries.getHousehold(householdId);
        if (!household) {
            _showError('Household not found');
            return null;
        }

        var locationOptions = _buildLocationOptions(
            household.locationId, '-- Select location --');

        var content =
            '<div style="max-height:500px;overflow-y:auto;padding:4px;">' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Household Name *</label>' +
                    '<input type="text" data-field="name" value="' +
                        _esc(household.name) +
                        '" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;">' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Location</label>' +
                    '<select data-field="locationId" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;">' +
                        locationOptions +
                    '</select>' +
                '</div>' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">' +
                    '<div>' +
                        '<label style="display:block;font-size:0.6rem;color:var(--dim);margin-bottom:4px;">Wealth</label>' +
                        '<input type="number" data-field="wealth" value="' +
                            (household.wealth !== null ? household.wealth : 0) +
                            '" style="width:100%;padding:6px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.7rem;">' +
                    '</div>' +
                    '<div>' +
                        '<label style="display:block;font-size:0.6rem;color:var(--dim);margin-bottom:4px;">Reputation</label>' +
                        '<input type="number" data-field="reputation" value="' +
                            (household.reputation !== null ? household.reputation : 10) +
                            '" min="0" max="100" style="width:100%;padding:6px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.7rem;">' +
                    '</div>' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Status</label>' +
                    '<select data-field="status" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;">' +
                        _VM.getHouseholdStatusOptions(household.status) +
                    '</select>' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Notes</label>' +
                    '<textarea data-field="notes" rows="2" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;">' +
                        _esc(household.notes || '') +
                    '</textarea>' +
                '</div>' +
                '<div style="margin-bottom:12px;padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;color:var(--dim);">' +
                    'Wealth edits here are direct corrections. For economic transactions, use the Household Economy panel.' +
                '</div>' +
            '</div>';

        var mutationSucceeded = false;
        var mutationData = null;
        var statusChangeFailedReason = null;

        var modal = _openModal({
            title: 'Edit Household: ' + household.name,
            content: content,
            confirmText: 'Save',
            cancelText: 'Cancel',
            onConfirm: function () {
                var root = _Modals.rootFrom(modal);
                if (!root) {
                    _showError('Modal root unavailable');
                    return false;
                }

                if (mutationSucceeded) {
                    var retryPersist = _persistOrFail('Household updated');
                    if (!retryPersist.ok) return false;
                    if (statusChangeFailedReason) {
                        _showWarning(
                            'Household updated but status change failed: ' +
                            statusChangeFailedReason);
                    } else {
                        _showSuccess('Household updated');
                    }
                    if (typeof onSuccess === 'function') {
                        onSuccess(mutationData);
                    }
                    return true;
                }

                var name = _Modals.readValue(root, '[data-field="name"]');
                if (!name || name.trim() === '') {
                    _showError('Household name is required');
                    return false;
                }

                var updates = {
                    name: name.trim(),
                    locationId: _Modals.readValue(root, '[data-field="locationId"]') || null
                };

                var wealth = _Modals.readIntOrNull(root, '[data-field="wealth"]');
                if (wealth !== null) updates.wealth = wealth;

                var reputation = _Modals.readIntOrNull(root, '[data-field="reputation"]');
                if (reputation !== null) updates.reputation = reputation;

                var notes = _Modals.readValue(root, '[data-field="notes"]');
                if (notes !== undefined) updates.notes = notes;

                var status = _Modals.readValue(root, '[data-field="status"]');

                var result = _commands.updateHousehold(householdId, updates);
                if (!result.success) {
                    _Modals.reportFailure(result, 'Failed to update household');
                    return false;
                }

                var statusChangeFailed = null;
                if (status && status !== household.status) {
                    var statusResult = _commands.setStatus(householdId, status, {
                        year: _currentYear(),
                        reason: 'Edited via modal',
                        recordEvent: true
                    });
                    if (statusResult.success !== true) {
                        statusChangeFailed = statusResult.reason;
                    }
                }

                mutationSucceeded = true;
                mutationData = result.data;
                statusChangeFailedReason = statusChangeFailed;

                var persisted = _persistOrFail('Household updated');
                if (!persisted.ok) return false;

                if (statusChangeFailed) {
                    _showWarning(
                        'Household updated but status change failed: ' +
                        statusChangeFailed);
                } else {
                    _showSuccess('Household updated');
                }

                if (typeof onSuccess === 'function') onSuccess(result.data);
                return true;
            }
        });

        return modal;
    }

    // =========================================================================
    // 4. DELETE HOUSEHOLD MODAL
    // =========================================================================

    function openDeleteHouseholdModal(householdId, onSuccess) {
        var household = _queries.getHousehold(householdId);
        if (!household) {
            _showError('Household not found');
            return null;
        }

        var memberCount = household.memberCount || 0;
        var enterprises = [];
        try { enterprises = _queries.getHouseholdEnterprises(householdId); }
        catch (e) { enterprises = []; }

        var message =
            'Delete household "' + household.name + '"?\n\n' +
            'This will:\n' +
            '- Remove all ' + memberCount + ' members from this household\n' +
            '- Mark the household as deprecated\n' +
            '- Remove any residence associations\n' +
            (enterprises.length > 0
                ? '- Transfer ' + enterprises.length + ' owned enterprise(s) to the Crown\n'
                : '') +
            '\nThis action can be undone by restoring the household.';

        _confirmDialog(message, 'Delete Household', function () {
            var result = _commands.deleteHousehold(householdId, {
                removeFromCharacters: true
            });
            if (!result.success) {
                _Modals.reportFailure(result, 'Failed to delete household');
                return;
            }

            _persistOrFail('Household deleted');
            _showInfo('Household deleted: ' + household.name);

            if (typeof onSuccess === 'function') {
                onSuccess(result.data);
            }
        });

        return null;
    }

    // =========================================================================
    // 4a. ADD HOUSEHOLD MEMBER MODAL
    // =========================================================================

    function openAddHouseholdMemberModal(householdId, onSuccess, options) {
        options = options || {};

        var household = _queries.getHousehold(householdId);
        if (!household) {
            _showError('Household not found');
            return null;
        }

        var currentYear = _currentYear();
        var preselectedId = options.preselectedCharacterId || null;
        var excludeIds = _currentHouseholdMemberIds(householdId);

        var content =
            '<div style="max-height:500px;overflow-y:auto;padding:4px;">' +
                '<div style="padding:8px 10px;background:var(--bg2);border-radius:6px;margin-bottom:12px;font-size:0.65rem;color:var(--dim);">' +
                    'Adding to <strong>' + _esc(household.name) + '</strong>' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Character</label>' +
                    _buildCharacterPickerHtml({
                        listId: 'ahm-list',
                        searchId: 'ahm-search'
                    }) +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Role</label>' +
                    '<input type="text" data-field="role" value="Member" ' +
                        'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;" autocomplete="off">' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Joined Year</label>' +
                    '<input type="number" data-field="joinedYear" value="' +
                        (currentYear !== null ? currentYear : '') + '" ' +
                        'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;" min="1">' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Notes</label>' +
                    '<textarea data-field="notes" rows="2" ' +
                        'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;"></textarea>' +
                '</div>' +
            '</div>';

        var selectedId = preselectedId;
        var mutationSucceeded = false;
        var mutationData = null;

        var modal = _openModal({
            title: 'Add Member to ' + household.name,
            content: content,
            confirmText: 'Add Member',
            cancelText: 'Cancel',
            onConfirm: function () {
                var root = _Modals.rootFrom(modal);
                if (!root) { _showError('Modal root unavailable'); return false; }

                if (mutationSucceeded) {
                    var retryPersist = _persistOrFail('Member added');
                    if (!retryPersist.ok) return false;
                    _showSuccess('Member added');
                    if (typeof onSuccess === 'function') onSuccess(mutationData);
                    return true;
                }

                if (!selectedId) {
                    _showError('Please select a character');
                    return false;
                }

                var role = _Modals.readValue(root, '[data-field="role"]').trim() || 'Member';

                var joinedYearRaw = _Modals.readValue(root, '[data-field="joinedYear"]');
                var joinedYear = joinedYearRaw === ''
                    ? currentYear
                    : parseInt(joinedYearRaw, 10);
                if (!Number.isInteger(joinedYear)
                    || !window.isValidYear(joinedYear)) {
                    _showError('Please enter a valid joined year');
                    return false;
                }

                var notes = _Modals.readValue(root, '[data-field="notes"]');

                var result = _commands.addMember(householdId, selectedId, 'family', {
                    role: role,
                    joinedYear: joinedYear,
                    isHead: false,
                    notes: notes,
                    recordHistory: true
                });
                if (!result || result.success !== true) {
                    _Modals.reportFailure(result, 'Failed to add member');
                    return false;
                }

                mutationSucceeded = true;
                mutationData = result.data;

                var persisted = _persistOrFail('Member added');
                if (!persisted.ok) return false;

                _showSuccess('Member added');
                if (typeof onSuccess === 'function') onSuccess(mutationData);
                return true;
            }
        });

        _Modals.onOpen(modal, function (root) {
            _wireCharacterPicker(root, 'ahm-list', 'ahm-search', excludeIds,
                function (id) { selectedId = id; });

            if (preselectedId) {
                var noteEl = root.querySelector(
                    '[data-picker-selection="ahm-list"]');
                if (noteEl) {
                    var s = null;
                    try {
                        s = window.CharacterQueries.getCharacterSummary(preselectedId);
                    } catch (e) { s = null; }
                    if (s) {
                        noteEl.textContent = 'Selected: ' +
                            ((s.name || '') + ' ' + (s.surname || '')).trim();
                    }
                }
            }
        });

        return modal;
    }

    // =========================================================================
    // 4b. REMOVE HOUSEHOLD MEMBER MODAL
    // =========================================================================

    function openRemoveHouseholdMemberModal(householdId, characterId, onSuccess, options) {
        options = options || {};

        var household = _queries.getHousehold(householdId);
        if (!household) {
            _showError('Household not found');
            return null;
        }

        var character = null;
        try {
            character = window.CharacterQueries.getCharacterSummary(characterId);
        } catch (e) { character = null; }
        if (!character) {
            _showError('Character not found');
            return null;
        }

        var currentYear = _currentYear();
        var defaultWithHistory = options.withHistory !== false;

        var displayName = ((character.name || '') +
            (character.surname ? ' ' + character.surname : '')).trim()
            || characterId;

        var content =
            '<div style="max-height:500px;overflow-y:auto;padding:4px;">' +
                '<div style="padding:10px 12px;background:var(--bg2);border-radius:6px;margin-bottom:12px;font-size:0.65rem;">' +
                    'Remove <strong>' + _esc(displayName) + '</strong> from ' +
                    '<strong>' + _esc(household.name) + '</strong>?' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label class="character-tab-checkbox" style="display:flex;align-items:center;gap:6px;">' +
                        '<input type="checkbox" data-field="withHistory" ' +
                            (defaultWithHistory ? 'checked' : '') + '>' +
                        '<span style="font-size:0.7rem;">Record this removal in the character\'s history</span>' +
                    '</label>' +
                    '<div style="font-size:0.55rem;color:var(--dim);margin-top:4px;">' +
                        'Unchecked = the removal will not appear in ' +
                        'household history. Use for correcting a mistaken add.' +
                    '</div>' +
                '</div>' +
                '<div data-role="with-history-group">' +
                    '<div style="margin-bottom:12px;">' +
                        '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Left Year</label>' +
                        '<input type="number" data-field="leftYear" value="' +
                            (currentYear !== null ? currentYear : '') + '" ' +
                            'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;" min="1">' +
                    '</div>' +
                    '<div style="margin-bottom:12px;">' +
                        '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Reason</label>' +
                        '<input type="text" data-field="reason" value="Removed" ' +
                            'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;" autocomplete="off">' +
                    '</div>' +
                '</div>' +
            '</div>';

        var mutationSucceeded = false;
        var mutationData = null;

        var modal = _openModal({
            title: 'Remove Member',
            content: content,
            confirmText: 'Remove',
            cancelText: 'Cancel',
            confirmStyle: 'danger',
            onConfirm: function () {
                var root = _Modals.rootFrom(modal);
                if (!root) { _showError('Modal root unavailable'); return false; }

                if (mutationSucceeded) {
                    var retryPersist = _persistOrFail('Member removed');
                    if (!retryPersist.ok) return false;
                    _showSuccess('Member removed');
                    if (typeof onSuccess === 'function') onSuccess(mutationData);
                    return true;
                }

                var withHistory = false;
                var checkbox = root.querySelector('[data-field="withHistory"]');
                if (checkbox) withHistory = checkbox.checked === true;

                var result;
                if (withHistory) {
                    var leftYearRaw = _Modals.readValue(root, '[data-field="leftYear"]');
                    var leftYear = leftYearRaw === ''
                        ? currentYear
                        : parseInt(leftYearRaw, 10);
                    if (!Number.isInteger(leftYear)
                        || !window.isValidYear(leftYear)) {
                        _showError('Please enter a valid left year');
                        return false;
                    }
                    var reason = _Modals.readValue(root, '[data-field="reason"]')
                        || 'Removed';

                    result = _commands.removeMember(householdId, characterId, {
                        leftYear: leftYear,
                        reason: reason,
                        recordHistory: true
                    });
                } else {
                    result = _commands.removeMemberSilent(householdId, characterId, {
                        leftYear: currentYear,
                        reason: 'removed_silently_from_modal'
                    });
                }

                if (!result || result.success !== true) {
                    _Modals.reportFailure(result, 'Failed to remove member');
                    return false;
                }

                mutationSucceeded = true;
                mutationData = result.data;

                var persisted = _persistOrFail('Member removed');
                if (!persisted.ok) return false;

                _showSuccess(withHistory
                    ? 'Member removed (recorded in history)'
                    : 'Member removed (no history entry)');
                if (typeof onSuccess === 'function') onSuccess(mutationData);
                return true;
            }
        });

        _Modals.onOpen(modal, function (root) {
            var checkbox = root.querySelector('[data-field="withHistory"]');
            var group = root.querySelector('[data-role="with-history-group"]');
            if (checkbox && group) {
                var apply = function () {
                    group.style.display = checkbox.checked ? '' : 'none';
                };
                checkbox.addEventListener('change', apply);
                apply();
            }
        });

        return modal;
    }

    // =========================================================================
    // 4c. RENAME HOUSEHOLD MODAL
    // =========================================================================

    function openRenameHouseholdModal(householdId, onSuccess, options) {
        options = options || {};

        var household = _queries.getHousehold(householdId);
        if (!household) {
            _showError('Household not found');
            return null;
        }

        var currentYear = _currentYear();
        var defaultWithHistory = options.withHistory !== false;

        var content =
            '<div style="max-height:500px;overflow-y:auto;padding:4px;">' +
                '<div style="padding:8px 12px;background:var(--bg2);border-radius:6px;margin-bottom:12px;font-size:0.65rem;color:var(--dim);">' +
                    'Current name: <strong>' + _esc(household.name) + '</strong>' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">New Name *</label>' +
                    '<input type="text" data-field="newName" value="' +
                        _esc(household.name) +
                        '" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;" autocomplete="off">' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label class="character-tab-checkbox" style="display:flex;align-items:center;gap:6px;">' +
                        '<input type="checkbox" data-field="withHistory" ' +
                            (defaultWithHistory ? 'checked' : '') + '>' +
                        '<span style="font-size:0.7rem;">Record in name history</span>' +
                    '</label>' +
                    '<div style="font-size:0.55rem;color:var(--dim);margin-top:4px;">' +
                        'Unchecked = silent rename. The household name changes ' +
                        'but no name-history entry is created. Use for correcting ' +
                        'a typo.' +
                    '</div>' +
                '</div>' +
                '<div data-role="with-history-group">' +
                    '<div style="margin-bottom:12px;">' +
                        '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Year</label>' +
                        '<input type="number" data-field="renameYear" value="' +
                            (currentYear !== null ? currentYear : '') + '" ' +
                            'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;" min="1">' +
                    '</div>' +
                    '<div style="margin-bottom:12px;">' +
                        '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Reason</label>' +
                        '<input type="text" data-field="renameReason" value="Renamed" ' +
                            'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;" autocomplete="off">' +
                    '</div>' +
                '</div>' +
                '<div data-role="silent-group" style="display:none;">' +
                    '<div style="margin-bottom:12px;">' +
                        '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Year of Silent Rename</label>' +
                        '<input type="number" data-field="silentYear" value="' +
                            (currentYear !== null ? currentYear : '') + '" ' +
                            'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;" min="1">' +
                    '</div>' +
                '</div>' +
            '</div>';

        var mutationSucceeded = false;
        var mutationData = null;

        var modal = _openModal({
            title: 'Rename Household: ' + household.name,
            content: content,
            confirmText: 'Rename',
            cancelText: 'Cancel',
            onConfirm: function () {
                var root = _Modals.rootFrom(modal);
                if (!root) { _showError('Modal root unavailable'); return false; }

                if (mutationSucceeded) {
                    var retryPersist = _persistOrFail('Household renamed');
                    if (!retryPersist.ok) return false;
                    _showSuccess('Household renamed');
                    if (typeof onSuccess === 'function') onSuccess(mutationData);
                    return true;
                }

                var newName = _Modals.readValue(root, '[data-field="newName"]').trim();
                if (!newName) {
                    _showError('Please enter a new name');
                    return false;
                }

                var withHistory = false;
                var checkbox = root.querySelector('[data-field="withHistory"]');
                if (checkbox) withHistory = checkbox.checked === true;

                var result;
                if (withHistory) {
                    var renameYearRaw = _Modals.readValue(root, '[data-field="renameYear"]');
                    var renameYear = renameYearRaw === ''
                        ? currentYear
                        : parseInt(renameYearRaw, 10);
                    if (!Number.isInteger(renameYear)
                        || !window.isValidYear(renameYear)) {
                        _showError('Please enter a valid year');
                        return false;
                    }
                    var reason = _Modals.readValue(root, '[data-field="renameReason"]')
                        || 'Renamed';

                    result = _commands.updateHousehold(householdId, {
                        name: newName,
                        renameYear: renameYear,
                        renameReason: reason
                    });
                } else {
                    var silentYearRaw = _Modals.readValue(root, '[data-field="silentYear"]');
                    var silentYear = silentYearRaw === ''
                        ? currentYear
                        : parseInt(silentYearRaw, 10);
                    if (!Number.isInteger(silentYear)
                        || !window.isValidYear(silentYear)) {
                        _showError('Please enter a valid year');
                        return false;
                    }
                    result = _commands.updateHouseholdNameSilent(
                        householdId, newName, { year: silentYear }
                    );
                }

                if (!result || result.success !== true) {
                    _Modals.reportFailure(result, 'Failed to rename household');
                    return false;
                }

                mutationSucceeded = true;
                mutationData = result.data;

                var persisted = _persistOrFail('Household renamed');
                if (!persisted.ok) return false;

                _showSuccess(withHistory
                    ? 'Household renamed (recorded in history)'
                    : 'Household renamed (silent)');
                if (typeof onSuccess === 'function') onSuccess(mutationData);
                return true;
            }
        });

        _Modals.onOpen(modal, function (root) {
            var checkbox = root.querySelector('[data-field="withHistory"]');
            var historyGroup = root.querySelector('[data-role="with-history-group"]');
            var silentGroup = root.querySelector('[data-role="silent-group"]');
            if (checkbox) {
                var apply = function () {
                    if (historyGroup) {
                        historyGroup.style.display = checkbox.checked ? '' : 'none';
                    }
                    if (silentGroup) {
                        silentGroup.style.display = checkbox.checked ? 'none' : '';
                    }
                };
                checkbox.addEventListener('change', apply);
                apply();
            }
        });

        return modal;
    }

    // =========================================================================
    // 4d. EDIT HOUSEHOLD DETAILS MODAL
    // =========================================================================
    //
    // Focused modal for the numeric / categorical fields the Identity-tab
    // style edit modal does not surface as their own dialog. Exists so
    // the Location tab can offer a quick "edit details" button.

    function openEditHouseholdDetailsModal(householdId, onSuccess) {
        var household = _queries.getHousehold(householdId);
        if (!household) {
            _showError('Household not found');
            return null;
        }

        var locationOptions = _buildLocationOptions(
            household.locationId, '-- Select location --');

        var content =
            '<div style="max-height:500px;overflow-y:auto;padding:4px;">' +
                '<div style="padding:8px 12px;background:var(--bg2);border-radius:6px;margin-bottom:12px;font-size:0.65rem;color:var(--dim);">' +
                    'Editing details for <strong>' + _esc(household.name) + '</strong>' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Founded Year</label>' +
                    '<input type="number" data-field="foundedYear" value="' +
                        (household.foundedYear !== null
                            ? household.foundedYear : '') + '" ' +
                        'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;" min="1">' +
                '</div>' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">' +
                    '<div>' +
                        '<label style="display:block;font-size:0.6rem;color:var(--dim);margin-bottom:4px;">Reputation</label>' +
                        '<input type="number" data-field="reputation" value="' +
                            (household.reputation !== null ? household.reputation : 10) +
                            '" min="0" max="100" ' +
                            'style="width:100%;padding:6px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.7rem;">' +
                    '</div>' +
                    '<div>' +
                        '<label style="display:block;font-size:0.6rem;color:var(--dim);margin-bottom:4px;">Wealth</label>' +
                        '<input type="number" data-field="wealth" value="' +
                            (household.wealth !== null ? household.wealth : 0) +
                            '" style="width:100%;padding:6px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.7rem;">' +
                    '</div>' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Location</label>' +
                    '<select data-field="locationId" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                        locationOptions +
                    '</select>' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Notes</label>' +
                    '<textarea data-field="notes" rows="3" ' +
                        'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;">' +
                        _esc(household.notes || '') +
                    '</textarea>' +
                '</div>' +
            '</div>';

        var mutationSucceeded = false;
        var mutationData = null;

        var modal = _openModal({
            title: 'Edit Details: ' + household.name,
            content: content,
            confirmText: 'Save',
            cancelText: 'Cancel',
            onConfirm: function () {
                var root = _Modals.rootFrom(modal);
                if (!root) { _showError('Modal root unavailable'); return false; }

                if (mutationSucceeded) {
                    var retryPersist = _persistOrFail('Household details updated');
                    if (!retryPersist.ok) return false;
                    _showSuccess('Household details updated');
                    if (typeof onSuccess === 'function') onSuccess(mutationData);
                    return true;
                }

                var updates = {};

                var foundedYear = _Modals.readIntOrNull(root, '[data-field="foundedYear"]');
                if (foundedYear !== null
                    && foundedYear !== household.foundedYear) {
                    if (!window.isValidYear(foundedYear)) {
                        _showError('Invalid founded year');
                        return false;
                    }
                    updates.foundedYear = foundedYear;
                }

                var reputation = _Modals.readIntOrNull(root, '[data-field="reputation"]');
                if (reputation !== null && reputation !== household.reputation) {
                    updates.reputation = reputation;
                }

                var wealth = _Modals.readIntOrNull(root, '[data-field="wealth"]');
                if (wealth !== null && wealth !== household.wealth) {
                    updates.wealth = wealth;
                }

                var locationId = _Modals.readValue(root, '[data-field="locationId"]');
                if (locationId !== (household.locationId || '')) {
                    updates.locationId = locationId || null;
                }

                var notes = _Modals.readValue(root, '[data-field="notes"]');
                if (notes !== (household.notes || '')) {
                    updates.notes = notes;
                }

                if (Object.keys(updates).length === 0) {
                    _showInfo('No changes');
                    return true;
                }

                var result = _commands.updateHousehold(householdId, updates);
                if (!result || result.success !== true) {
                    _Modals.reportFailure(result, 'Failed to update household details');
                    return false;
                }

                mutationSucceeded = true;
                mutationData = result.data;

                var persisted = _persistOrFail('Household details updated');
                if (!persisted.ok) return false;

                _showSuccess('Household details updated');
                if (typeof onSuccess === 'function') onSuccess(mutationData);
                return true;
            }
        });

        return modal;
    }

    // =========================================================================
    // 4e. TRANSFER CHARACTER TO HOUSEHOLD MODAL
    // =========================================================================

    function openTransferCharacterToHouseholdModal(characterId, onSuccess) {
        var character = null;
        try {
            character = window.CharacterQueries.getCharacterSummary(characterId);
        } catch (e) { character = null; }
        if (!character) {
            _showError('Character not found');
            return null;
        }

        var currentHousehold = null;
        try {
            currentHousehold = _queries.getCharacterHousehold(characterId);
        } catch (e) { currentHousehold = null; }

        var currentYear = _currentYear();
        var displayName = ((character.name || '') +
            (character.surname ? ' ' + character.surname : '')).trim()
            || characterId;

        var currentLine = currentHousehold
            ? 'Currently in <strong>' + _esc(currentHousehold.name) + '</strong>'
            : 'Currently not in any household';

        var excludeIds = currentHousehold ? [currentHousehold.id] : [];

        var content =
            '<div style="max-height:500px;overflow-y:auto;padding:4px;">' +
                '<div style="padding:10px 12px;background:var(--bg2);border-radius:6px;margin-bottom:12px;font-size:0.65rem;">' +
                    'Transfer <strong>' + _esc(displayName) + '</strong>' +
                    '<div style="font-size:0.55rem;color:var(--dim);margin-top:2px;">' +
                        currentLine +
                    '</div>' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Target Household</label>' +
                    _buildHouseholdPickerHtml({
                        listId: 'tch-list',
                        searchId: 'tch-search'
                    }) +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Role</label>' +
                    '<input type="text" data-field="role" value="Member" ' +
                        'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;" autocomplete="off">' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Transfer Year</label>' +
                    '<input type="number" data-field="year" value="' +
                        (currentYear !== null ? currentYear : '') + '" ' +
                        'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;" min="1">' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Reason</label>' +
                    '<input type="text" data-field="reason" value="Transferred" ' +
                        'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;" autocomplete="off">' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Notes</label>' +
                    '<textarea data-field="notes" rows="2" ' +
                        'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;"></textarea>' +
                '</div>' +
            '</div>';

        var selectedHouseholdId = null;
        var mutationSucceeded = false;
        var mutationData = null;

        var modal = _openModal({
            title: 'Transfer ' + (character.name || 'Character'),
            content: content,
            confirmText: 'Transfer',
            cancelText: 'Cancel',
            onConfirm: function () {
                var root = _Modals.rootFrom(modal);
                if (!root) { _showError('Modal root unavailable'); return false; }

                if (mutationSucceeded) {
                    var retryPersist = _persistOrFail('Transfer complete');
                    if (!retryPersist.ok) return false;
                    _showSuccess('Transfer complete');
                    if (typeof onSuccess === 'function') onSuccess(mutationData);
                    return true;
                }

                if (!selectedHouseholdId) {
                    _showError('Please select a target household');
                    return false;
                }

                var role = _Modals.readValue(root, '[data-field="role"]').trim() || 'Member';

                var yearRaw = _Modals.readValue(root, '[data-field="year"]');
                var year = yearRaw === ''
                    ? currentYear
                    : parseInt(yearRaw, 10);
                if (!Number.isInteger(year) || !window.isValidYear(year)) {
                    _showError('Please enter a valid year');
                    return false;
                }

                var reason = _Modals.readValue(root, '[data-field="reason"]')
                    || 'Transferred';
                var notes = _Modals.readValue(root, '[data-field="notes"]');

                var result = _commands.transferMember(characterId, selectedHouseholdId, {
                    year: year,
                    role: role,
                    reason: reason,
                    notes: notes,
                    recordHistory: true
                });
                if (!result || result.success !== true) {
                    _Modals.reportFailure(result, 'Failed to transfer character');
                    return false;
                }

                mutationSucceeded = true;
                mutationData = result.data;

                var persisted = _persistOrFail('Transfer complete');
                if (!persisted.ok) return false;

                _showSuccess('Transferred to target household');
                if (typeof onSuccess === 'function') onSuccess(mutationData);
                return true;
            }
        });

        _Modals.onOpen(modal, function (root) {
            _wireHouseholdPicker(root, 'tch-list', 'tch-search', excludeIds,
                function (id) { selectedHouseholdId = id; });
        });

        return modal;
    }

    // =========================================================================
    // 5. HOUSEHOLD DETAILS MODAL
    // =========================================================================

    function openHouseholdDetailsModal(householdId, onSuccess) {
        var details;
        try {
            details = _queries.getHouseholdDetails(householdId);
        } catch (e) {
            details = null;
        }
        if (!details) {
            _showError('Household not found');
            return null;
        }

        var content = _buildDetailsContent(details);

        var modal = _openModal({
            title: 'Household Details',
            content: content,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function () { /* close only */ }
        });

        _Modals.onOpen(modal, function (root) {
            _wireDetailsActions(root, householdId, details, onSuccess);
        });

        return modal;
    }

    function _buildDetailsContent(details) {
        var household = details.household;
        var status = details.status;
        var members = details.members;
        var head = details.head;
        var demographics = details.demographics;
        var residence = details.residence;
        var enterprises = details.enterprises || [];
        var enterpriseStats = details.enterpriseStats || null;

        var html = '<div style="max-height:500px;overflow-y:auto;padding:4px;">';

        html += _buildHeader(household, status);
        html += _buildStatsGrid(household, members, head);

        if (demographics) {
            html += _buildDemographics(demographics);
        }

        if (residence) {
            html += _buildResidenceRow(residence);
        }

        html += _buildMembersList(members);
        html += _buildEnterprisesSection(enterprises, enterpriseStats, householdId);

        if (household.notes) {
            html += '<div style="background:var(--bg2);padding:8px;border-radius:6px;margin-top:12px;font-size:0.6rem;color:var(--dim);">' +
                _esc(household.notes) + '</div>';
        }

        html += _buildActionsRow();
        html += '</div>';
        return html;
    }

    function _buildHeader(household, status) {
        var badge = _VM.getStatusBadge(status.status);
        var statusIcon = '';
        if (window.Icons && window.Icons[badge.icon]) {
            statusIcon = window.Icons[badge.icon];
        }
        var statusColor = badge.color;

        return '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
            '<div>' +
                '<h3 style="margin:0;font-size:1rem;">' +
                    _esc(household.name) + '</h3>' +
                '<div style="font-size:0.6rem;color:var(--dim);">' +
                    'Founded ' + (household.foundedYear !== null
                        ? household.foundedYear : 'Unknown') +
                    (household.locationName
                        ? ' · ' + _esc(household.locationName) : '') +
                '</div>' +
            '</div>' +
            '<div style="text-align:right;">' +
                '<div style="font-size:0.65rem;color:' + statusColor +
                    ';display:flex;align-items:center;gap:4px;justify-content:flex-end;">' +
                    statusIcon + ' ' + _esc(badge.label) +
                '</div>' +
                '<div style="font-size:0.55rem;color:var(--dim);">' +
                    status.livingCount + ' living · ' +
                    status.deceasedCount + ' deceased' +
                    (status.missingCount > 0
                        ? ' · ' + status.missingCount + ' missing' : '') +
                '</div>' +
            '</div>' +
        '</div>';
    }

    function _buildStatsGrid(household, members, head) {
        var wealthDisplay = household.wealth !== null ? household.wealth : '—';
        var repDisplay = household.reputation !== null ? household.reputation : '—';
        var wealthColor = _VM.getWealthColor(household.wealth);

        return '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;margin-bottom:12px;">' +
            _statCell('Members', members.length) +
            _statCell('Wealth', wealthDisplay, wealthColor) +
            _statCell('Reputation', repDisplay) +
            _statCell('Head', head ? head.characterName : 'None') +
        '</div>';
    }

    function _statCell(label, value, color) {
        return '<div style="background:var(--bg2);padding:8px;border-radius:6px;text-align:center;">' +
            '<div style="font-size:0.5rem;color:var(--dim);">' +
                _esc(label) + '</div>' +
            '<div style="font-size:0.9rem;font-weight:bold;' +
                (color ? 'color:' + color + ';' : '') + '">' +
                _esc(String(value)) +
            '</div>' +
        '</div>';
    }

    function _buildDemographics(d) {
        return '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;margin-bottom:12px;">' +
            _demoCell('Male', d.male) +
            _demoCell('Female', d.female) +
            _demoCell('Children', d.children) +
            _demoCell('Elders', d.elders) +
        '</div>';
    }

    function _demoCell(label, value) {
        return '<div style="background:var(--bg2);padding:6px 8px;border-radius:4px;text-align:center;font-size:0.55rem;">' +
            '<span style="color:var(--dim);">' + _esc(label) + '</span> ' +
            (value !== undefined ? value : 0) +
        '</div>';
    }

    function _buildResidenceRow(residence) {
        return '<div style="background:var(--bg2);padding:8px;border-radius:6px;margin-bottom:12px;font-size:0.65rem;">' +
            '<span style="color:var(--dim);">Residence:</span> ' +
            _esc(residence.residenceName || 'Unknown') +
            (residence.unitNumber
                ? ' (Unit ' + residence.unitNumber + ')' : '') +
            (residence.associatedYear
                ? ' · since ' + residence.associatedYear : '') +
        '</div>';
    }

    function _buildMembersList(members) {
        var html = '<div style="margin-bottom:12px;">' +
            '<div style="font-size:0.7rem;color:var(--accent);margin-bottom:4px;">' +
                'Members (' + members.length + ')' +
            '</div>' +
            '<div style="max-height:150px;overflow-y:auto;">';

        if (members.length === 0) {
            html += '<div style="text-align:center;padding:8px;color:var(--dim);font-size:0.6rem;">No members</div>';
        } else {
            for (var i = 0; i < members.length; i++) {
                var m = members[i];
                var headIcon = m.isHead && window.Icons
                    ? (window.Icons.CROWN || '') : '';
                var personIcon = window.Icons
                    ? (window.Icons.PERSON || '') : '';
                var deceasedSuffix = m.isDeceased ? ' (deceased)' : '';
                var ageStr = (m.age !== null && m.age !== undefined)
                    ? m.age + ' years' : '—';

                html += '<div style="display:flex;justify-content:space-between;padding:3px 8px;background:var(--bg2);border-radius:4px;margin-bottom:2px;font-size:0.65rem;">' +
                    '<span>' + headIcon + ' ' + personIcon + ' ' +
                        _esc(m.characterName) + deceasedSuffix +
                    '</span>' +
                    '<span style="color:var(--dim);">' +
                        _esc(m.role || m.type || 'Member') +
                        ' · ' + ageStr +
                    '</span>' +
                '</div>';
            }
        }

        html += '</div></div>';
        return html;
    }

    function _buildEnterprisesSection(enterprises, stats, householdId) {
        if (!enterprises || enterprises.length === 0) {
            return '<div style="margin-top:12px;border-top:1px solid var(--border);padding-top:12px;">' +
                '<div style="font-size:0.7rem;color:var(--dim);">No enterprises owned</div>' +
                '<div style="margin-top:6px;">' +
                    '<button data-action="create-enterprise" data-household-id="' +
                        _esc(householdId) +
                        '" class="btn primary" style="font-size:0.55rem;padding:2px 10px;">Create Enterprise</button>' +
                '</div>' +
            '</div>';
        }

        var totalProfit = stats ? (stats.totalProfit || 0) : 0;
        var profitColor = _VM.getProfitColor(totalProfit);

        var summary = '';
        if (stats) {
            if (stats.publicCount > 0 || stats.privateCount > 0) {
                summary = ' (' +
                    (stats.publicCount > 0
                        ? stats.publicCount + ' Public' : '') +
                    (stats.publicCount > 0 && stats.privateCount > 0
                        ? ', ' : '') +
                    (stats.privateCount > 0
                        ? stats.privateCount + ' Private' : '') +
                    ')';
            }
        }

        var html = '<div style="margin-top:12px;border-top:1px solid var(--border);padding-top:12px;">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">';
        html += '<div style="font-size:0.7rem;color:var(--accent);">' +
            'Owned Enterprises (' + enterprises.length + ')' +
            _esc(summary) + '</div>';
        html += '<div style="font-size:0.6rem;color:var(--dim);">';
        html += 'Total Profit: <span style="color:' + profitColor +
            ';font-weight:bold;">' +
            (totalProfit >= 0 ? '+' : '') + totalProfit + '</span>';
        if (stats) {
            html += ' <span style="margin-left:8px;">Workers: ' +
                (stats.totalWorkers || 0) + '</span>';
        }
        html += '</div></div>';

        html += '<div style="max-height:120px;overflow-y:auto;">';
        var limit = Math.min(enterprises.length, 5);
        for (var i = 0; i < limit; i++) {
            var e = enterprises[i];
            var profit = e.annualProfit || 0;
            var pc = _VM.getProfitColor(profit);
            var ownership = e.ownershipType === 'public'
                ? ' <span style="font-size:0.45rem;color:var(--accent);">(Public)</span>'
                : ' <span style="font-size:0.45rem;color:var(--dim);">(Private)</span>';
            var statusText = e.status && e.status !== 'active'
                ? ' <span style="font-size:0.5rem;color:var(--warn);">(' +
                    _esc(e.status) + ')</span>'
                : '';

            html += '<div class="enterprise-item" data-enterprise-id="' +
                _esc(e.id) +
                '" style="display:flex;justify-content:space-between;align-items:center;padding:4px 8px;background:var(--bg);border-radius:4px;margin-bottom:2px;font-size:0.65rem;cursor:pointer;">' +
                '<span>' + _esc(e.name) + ownership + statusText + '</span>' +
                '<span style="color:' + pc + ';">' +
                    (profit >= 0 ? '+' : '') + profit + '</span>' +
            '</div>';
        }
        html += '</div>';

        if (enterprises.length > 5) {
            html += '<div style="text-align:center;font-size:0.55rem;color:var(--dim);padding-top:4px;">+' +
                (enterprises.length - 5) + ' more</div>';
        }

        html += '<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;">';
        html += '<button data-action="view-enterprises" class="btn" style="font-size:0.55rem;padding:2px 10px;">View All</button>';
        html += '<button data-action="create-enterprise" data-household-id="' +
            _esc(householdId) +
            '" class="btn primary" style="font-size:0.55rem;padding:2px 10px;">Create Enterprise</button>';
        html += '</div>';

        html += '</div>';
        return html;
    }

    function _buildActionsRow() {
        return '<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;border-top:1px solid var(--border);padding-top:12px;">' +
            '<button data-action="edit" class="btn primary" style="font-size:0.65rem;padding:4px 12px;">Edit</button>' +
            '<button data-action="manage-members" class="btn" style="font-size:0.65rem;padding:4px 12px;">Manage Members</button>' +
            '<button data-action="manage-departments" class="btn" style="font-size:0.65rem;padding:4px 12px;">Departments</button>' +
            '<button data-action="process-economy" class="btn" style="font-size:0.65rem;padding:4px 12px;">Process Year</button>' +
            '<button data-action="delete" class="btn danger" style="font-size:0.65rem;padding:4px 12px;">Delete</button>' +
        '</div>';
    }

    function _wireDetailsActions(root, householdId, details, onSuccess) {
        var editBtn = root.querySelector('[data-action="edit"]');
        if (editBtn) {
            editBtn.onclick = function () {
                _closeThen(function () {
                    openEditHouseholdModal(householdId, onSuccess);
                });
            };
        }

        var deleteBtn = root.querySelector('[data-action="delete"]');
        if (deleteBtn) {
            deleteBtn.onclick = function () {
                _closeThen(function () {
                    openDeleteHouseholdModal(householdId, onSuccess);
                });
            };
        }

        var membersBtn = root.querySelector('[data-action="manage-members"]');
        if (membersBtn) {
            membersBtn.onclick = function () {
                _closeThen(function () {
                    if (typeof window.openHouseholdMemberManagerModal === 'function') {
                        window.openHouseholdMemberManagerModal(householdId, onSuccess);
                    } else {
                        _showWarning('Member manager not available');
                    }
                });
            };
        }

        var deptBtn = root.querySelector('[data-action="manage-departments"]');
        if (deptBtn) {
            deptBtn.onclick = function () {
                _closeThen(function () {
                    if (typeof window.openHouseholdDepartmentManagerModal === 'function') {
                        window.openHouseholdDepartmentManagerModal(householdId, onSuccess);
                    } else {
                        _showWarning('Department manager not available');
                    }
                });
            };
        }

        var processBtn = root.querySelector('[data-action="process-economy"]');
        if (processBtn) {
            processBtn.onclick = function () {
                if (typeof window.HouseholdEconomy === 'undefined' ||
                    typeof window.HouseholdEconomy.processAnnualEconomy !== 'function') {
                    _showError('Household economy not available');
                    return;
                }

                var result = window.HouseholdEconomy.processAnnualEconomy(householdId);
                if (!result || result.success === false) {
                    _Modals.reportFailure(result, 'Failed to process year');
                    return;
                }
                var data = result.data || {};
                var net = data.netChange;
                var netStr = (typeof net === 'number')
                    ? ((net >= 0 ? '+' : '') + net)
                    : '?';
                _showSuccess(
                    'Processed year for ' +
                    (data.householdName || details.household.name) + ': ' +
                    netStr);

                _closeThen(function () {
                    if (typeof onSuccess === 'function') onSuccess();
                });
            };
        }

        var eItems = root.querySelectorAll('.enterprise-item');
        for (var i = 0; i < eItems.length; i++) {
            (function (item) {
                item.onclick = function () {
                    var id = item.dataset.enterpriseId;
                    _closeThen(function () {
                        if (typeof window.openEnterpriseDetailsModal === 'function') {
                            window.openEnterpriseDetailsModal(id, function () {
                                openHouseholdDetailsModal(householdId, onSuccess);
                            });
                        }
                    });
                };
            })(eItems[i]);
        }

        var viewEntBtn = root.querySelector('[data-action="view-enterprises"]');
        if (viewEntBtn) {
            viewEntBtn.onclick = function () {
                _closeThen(function () {
                    if (typeof window.openEnterpriseListModal === 'function') {
                        window.openEnterpriseListModal(function (enterprise) {
                            if (enterprise &&
                                typeof window.openEnterpriseDetailsModal === 'function') {
                                window.openEnterpriseDetailsModal(enterprise.id);
                            }
                        });
                    }
                });
            };
        }

        var createEntBtn = root.querySelector('[data-action="create-enterprise"]');
        if (createEntBtn) {
            createEntBtn.onclick = function () {
                var hid = createEntBtn.dataset.householdId || householdId;
                _closeThen(function () {
                    if (typeof window.openCreateEnterpriseModal === 'function') {
                        window.openCreateEnterpriseModal(function (enterprise) {
                            if (enterprise) {
                                _showSuccess('Enterprise created: ' + enterprise.name);
                                if (typeof onSuccess === 'function') onSuccess();
                            }
                        }, {
                            ownerType: 'household',
                            ownerId: hid,
                            ownerName: details.household.name,
                            locationId: details.household.locationId || null
                        });
                    } else {
                        _showWarning('Enterprise creation not available');
                    }
                });
            };
        }
    }

    // =========================================================================
    // 6. EXPORTS
    // =========================================================================

    window.openCreateHouseholdModal = openCreateHouseholdModal;
    window.openEditHouseholdModal = openEditHouseholdModal;
    window.openDeleteHouseholdModal = openDeleteHouseholdModal;
    window.openHouseholdDetailsModal = openHouseholdDetailsModal;

    window.openAddHouseholdMemberModal = openAddHouseholdMemberModal;
    window.openRemoveHouseholdMemberModal = openRemoveHouseholdMemberModal;
    window.openRenameHouseholdModal = openRenameHouseholdModal;
    window.openEditHouseholdDetailsModal = openEditHouseholdDetailsModal;
    window.openTransferCharacterToHouseholdModal = openTransferCharacterToHouseholdModal;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            openCreateHouseholdModal: openCreateHouseholdModal,
            openEditHouseholdModal: openEditHouseholdModal,
            openDeleteHouseholdModal: openDeleteHouseholdModal,
            openHouseholdDetailsModal: openHouseholdDetailsModal,
            openAddHouseholdMemberModal: openAddHouseholdMemberModal,
            openRemoveHouseholdMemberModal: openRemoveHouseholdMemberModal,
            openRenameHouseholdModal: openRenameHouseholdModal,
            openEditHouseholdDetailsModal: openEditHouseholdDetailsModal,
            openTransferCharacterToHouseholdModal: openTransferCharacterToHouseholdModal
        };
    }

})();
