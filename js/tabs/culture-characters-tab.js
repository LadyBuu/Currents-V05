/**
 * =============================================================================
 * STILL WATERS - CULTURE CHARACTERS TAB (js/tabs/culture-characters-tab.js)
 * =============================================================================
 *
 * LOCATION: js/tabs/culture-characters-tab.js
 *
 * A CultureEditorTabs tab for managing the characters assigned to a culture:
 * list, filter, sort, assign, remove, and apply culture-generated appearance.
 *
 * REGISTRATION (CultureEditorTabs, composite form):
 *   CultureEditorTabs.registerTab('characters', CharactersTab);
 *
 *   render(container, culture)     — paints the tab's DOM into `container`
 *   save(culture)                  — returns {} — this tab never modifies
 *                                    the culture record
 *   validate(culture)              — { valid: true }
 *
 * THIS TAB DOES NOT PARTICIPATE IN THE COMPOSITE SAVE
 * ---------------------------------------------------
 * Assigning a character to a culture writes character.cultureId on the
 * CHARACTER domain. Removing an appearance writes character.appearance.
 * Both go through CharacterCommands and are committed immediately; the
 * editor's Cancel does not undo them. The tab's UI hint says so.
 *
 * PERSISTENCE OWNERSHIP
 * ---------------------
 * This tab owns persistence for every write it initiates. Each write
 * handler (assign, remove, apply-one, apply-all) calls
 * CharacterCommands.updateCharacter(...) exactly once and then calls
 * CharacterCommands.persist() exactly once on success. This is the
 * playbook §6 Rule 8 contract for a tab with an inline write path:
 * "the tab owns persist() and calls it exactly once after the batch."
 * There is no modal in the write path; the next reader should not
 * look for one.
 *
 * PARTIAL-APPLY SEMANTICS (apply-all only)
 * ----------------------------------------
 * "Apply Appearance to All" iterates every character assigned to the
 * culture and applies a fresh appearance to each. If some updates
 * fail and others succeed, the successes are kept and persisted; the
 * failure count is reported in a warning toast. This is deliberate:
 * a partial apply is more useful than a no-op when the user asked to
 * apply to 10 characters and 3 have a data problem. The warning says
 * "N character(s) failed to update" so the user knows to retry those
 * three. persist() is skipped entirely when every update failed —
 * there is nothing to write.
 *
 * CONTRACTS
 * ---------
 *   - Reads are scoped to `container.querySelector(...)`. Never `document`.
 *   - No inline `style=""`. Classes live in css/culture-tabs.css.
 *   - No emojis. Icons via _getIcon(name); returns '' for unknown names.
 *   - escapeHtml is a REQUIRED dependency (formatting.js — throws if
 *     missing, matching the other culture tabs).
 *   - Location resolution delegates to
 *     CultureQueries.getCurrentLocationIdForCharacter.
 *
 * DEPENDENCIES (resolved at call time):
 *   - CultureEditorTabs      (js/tabs/culture-editor-tab.js)   — REQUIRED
 *   - CultureQueries         (js/culture/culture-queries.js)   — REQUIRED
 *   - CultureGeneration      (js/culture/culture-generation.js) — soft; used
 *                              by apply-appearance
 *   - CharacterCommands      (js/character/character-commands.js) — REQUIRED
 *   - formatting.js          (escapeHtml)                       — REQUIRED
 *   - ui.js                  (showToast)                        — soft
 *   - modals-core.js         (openModal, closeTopModal, confirmDialog) — soft
 *   - accessors.js           (getCharacters, getCharacterById)  — REQUIRED
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision (A7):
 *     - _escapeHtml tightened to throw if formatting.js is missing.
 *       Closes the last soft-escape path in the culture tab suite.
 *     - Removed unused `culture` parameters from _renderList, _renderRow,
 *       and _applyFilters. The prior version accepted them and never
 *       used them, which made the call sites read as if they mattered.
 *     - Removed stale [RECONSTRUCTED] tags from _renderRow and
 *       _appearancePreview. The reconstruction was completed in A6;
 *       the tags are now history, recorded once in this block.
 *     - Header documents persistence ownership (the tab calls persist()
 *       from each write handler — there is no modal in the write path)
 *       and partial-apply semantics for _handleApplyAppearanceAll.
 *     - _handleApplyAppearanceAll skips persist() when every update
 *       failed. The prior version persisted unconditionally, which
 *       would write a stale in-memory state if all CC.updateCharacter
 *       calls failed (no changes to persist = no-op, but the persist
 *       call itself could fail for unrelated reasons and produce a
 *       misleading "Applied in memory" warning).
 *     - _handleApplyAppearanceAll's failure toast now clarifies that
 *       successful updates were saved. The prior message only said
 *       "N character(s) failed to update" without indicating whether
 *       the other successes were persisted.
 *   Previous revisions (A6):
 *     - Reconstructed the truncated region of _renderRow, _renderList,
 *       _applyFilters, _renderEmpty, _handleAssignCharacter,
 *       _handleRemoveCharacter, _handleApplyAppearance,
 *       _handleApplyAppearanceAll, and _openAssignSelector.
 *     - The paste of this file cut off mid-attribute in _renderRow. The
 *       functions below were inferred from: (a) the visible prefix of
 *       each function, (b) the dependency set declared in the header,
 *       (c) the pattern already used by _renderRow's visible portion.
 *     - No changes to any function that was visible in full in the
 *       paste.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    // escapeHtml is a REQUIRED dependency (formatting.js). Renderers do
    // not implement their own escaping; a missing escapeHtml is a
    // load-order bug that must be visible. See the header of
    // culture-mythology-tab.js for the same contract.
    function _escapeHtml(str) {
        if (typeof window.escapeHtml !== 'function') {
            throw new Error(
                'culture-characters-tab.js requires escapeHtml (formatting.js). ' +
                'Check script tag order.'
            );
        }
        return window.escapeHtml(str);
    }

    function _getIcon(name) {
        if (window.Icons && window.Icons[name]) return window.Icons[name];
        return '';
    }

    function _showToast(msg, type) {
        if (typeof window.showToast === 'function') window.showToast(msg, type);
    }

    function _openModal(options) {
        return typeof window.openModal === 'function'
            ? window.openModal(options)
            : null;
    }

    function _closeTopModal() {
        if (typeof window.closeTopModal === 'function') window.closeTopModal();
    }

    function _confirm(message, title, onConfirm) {
        if (typeof window.confirmDialog === 'function') {
            window.confirmDialog(message, title, onConfirm);
        } else if (typeof confirm === 'function' && confirm(message)) {
            onConfirm();
        }
    }

    function _getCultureQueries() {
        return typeof window.CultureQueries !== 'undefined' ? window.CultureQueries : null;
    }

    function _getCultureGeneration() {
        return typeof window.CultureGeneration !== 'undefined' ? window.CultureGeneration : null;
    }

    function _getCharacterCommands() {
        return typeof window.CharacterCommands !== 'undefined' ? window.CharacterCommands : null;
    }

    function _getCharacters() {
        if (typeof window.getCharacters === 'function') return window.getCharacters();
        return [];
    }

    function _getCharacterById(id) {
        return typeof window.getCharacterById === 'function'
            ? window.getCharacterById(id)
            : null;
    }

    function _getPlaceName(id) {
        if (typeof window.getPlaceName === 'function') return window.getPlaceName(id);
        if (typeof window.getPlaceById === 'function') {
            var p = window.getPlaceById(id);
            if (p) return p.displayName || p.name || id;
        }
        return '\u2014';
    }

    function _getCurrentYear() {
        if (typeof window.getCurrentYear !== 'function') {
            throw new Error(
                'culture-characters-tab.js requires time.js (getCurrentYear).'
            );
        }
        return window.getCurrentYear();
    }

    function _ageOf(character) {
        if (!character) return null;
        if (typeof window.calculateAge !== 'function') {
            if (typeof character.birthYear !== 'number') return null;
            if (character.isDeceased === true && typeof character.deathYear === 'number') {
                var dAge = character.deathYear - character.birthYear;
                return dAge >= 0 ? dAge : null;
            }
            var y = _getCurrentYear();
            var age = y - character.birthYear;
            return age >= 0 ? age : null;
        }
        return window.calculateAge(
            character.birthYear,
            character.isDeceased === true,
            character.deathYear
        );
    }

    function _genderLabel(gender) {
        switch (gender) {
            case 'male': return 'Male';
            case 'female': return 'Female';
            default: return 'Unknown';
        }
    }

    function _currentLocationIdOf(character) {
        if (!character) return null;
        var queries = _getCultureQueries();
        if (queries && typeof queries.getCurrentLocationIdForCharacter === 'function') {
            try {
                return queries.getCurrentLocationIdForCharacter(character);
            } catch (e) {
                return null;
            }
        }
        if (typeof character.currentLocationId === 'string'
            && character.currentLocationId.length > 0) {
            return character.currentLocationId;
        }
        if (typeof character.birthplaceId === 'string'
            && character.birthplaceId.length > 0) {
            return character.birthplaceId;
        }
        return null;
    }

    // =========================================================================
    // 2. LOCAL FILTER STATE
    // =========================================================================

    var _localState = {
        search: '',
        gender: 'all',
        status: 'all',
        sortBy: 'name'
    };

    function _resetState() {
        _localState.search = '';
        _localState.gender = 'all';
        _localState.status = 'all';
        _localState.sortBy = 'name';
    }

    // =========================================================================
    // 3. RENDER
    // =========================================================================

    function renderCharactersTab(container, culture) {
        if (!container) return;

        if (!culture || !culture.id) {
            container.innerHTML =
                '<div class="rt-empty">No culture loaded.</div>';
            return;
        }

        _resetState();

        var all = _getCharacters();
        var inCulture = [];
        for (var i = 0; i < all.length; i++) {
            if (all[i] && all[i].cultureId === culture.id) {
                inCulture.push(all[i]);
            }
        }

        var filtered = _applyFilters(inCulture);

        var html =
            '<div class="ct-characters">' +

            '<div class="ct-hint">' +
              'Assign characters to this culture and apply its generated ' +
              'appearance. Character changes commit immediately; closing ' +
              'the editor does not undo them.' +
            '</div>' +

            '<div class="ct-characters__header">' +
              '<div class="ct-characters__stats">' +
                '<span class="ct-badge">' + inCulture.length + ' in this culture</span>' +
                '<span class="ct-badge ct-badge--muted">' + all.length + ' total</span>' +
              '</div>' +
              '<div class="ct-characters__actions">' +
                '<button type="button" class="rt-btn rt-btn--primary ct-characters-assign">Assign Character</button>' +
                '<button type="button" class="rt-btn ct-characters-apply-all">Apply Appearance to All</button>' +
              '</div>' +
            '</div>' +

            '<div class="ct-characters__filters">' +
              '<div class="ct-search">' +
                '<input type="text" class="ct-characters-search"' +
                  ' placeholder="Search characters..."' +
                  ' value="' + _escapeHtml(_localState.search) + '">' +
              '</div>' +
              '<select class="ct-characters-gender-filter">' +
                '<option value="all">All Genders</option>' +
                '<option value="male">Male</option>' +
                '<option value="female">Female</option>' +
              '</select>' +
              '<select class="ct-characters-status-filter">' +
                '<option value="all">All Statuses</option>' +
                '<option value="living">Living</option>' +
                '<option value="deceased">Deceased</option>' +
              '</select>' +
              '<select class="ct-characters-sort-by">' +
                '<option value="name">Sort: Name</option>' +
                '<option value="age_desc">Sort: Age \u2193</option>' +
                '<option value="age_asc">Sort: Age \u2191</option>' +
              '</select>' +
              '<button type="button" class="rt-btn ct-characters-clear">Clear</button>' +
            '</div>' +

            (filtered.length > 0
              ? _renderList(filtered)
              : _renderEmpty(inCulture.length > 0)) +

            '</div>';

        container.innerHTML = html;

        _syncFilterSelects(container);
        _attachEvents(container, culture);
    }

    function _syncFilterSelects(container) {
        var g = container.querySelector('.ct-characters-gender-filter');
        if (g) g.value = _localState.gender;
        var s = container.querySelector('.ct-characters-status-filter');
        if (s) s.value = _localState.status;
        var sort = container.querySelector('.ct-characters-sort-by');
        if (sort) sort.value = _localState.sortBy;
    }

    function _renderEmpty(hadCharacters) {
        var msg = hadCharacters
            ? 'No characters match your filters.'
            : 'No characters are assigned to this culture yet.';
        var hint = hadCharacters
            ? '<span class="rt-empty__sub">Adjust the filters above.</span>'
            : '<span class="rt-empty__sub">Use "Assign Character" to add one.</span>';
        return '<div class="rt-empty">' + msg + hint + '</div>';
    }

    // =========================================================================
    // 4. FILTER / SORT
    // =========================================================================

    function _applyFilters(characters) {
        var search = _localState.search ? _localState.search.toLowerCase() : '';
        var gender = _localState.gender;
        var status = _localState.status;
        var sortBy = _localState.sortBy;

        var out = [];
        for (var i = 0; i < characters.length; i++) {
            var c = characters[i];
            if (!c) continue;

            if (search) {
                var full = String((c.name || '') + ' ' + (c.surname || '')).toLowerCase();
                if (full.indexOf(search) === -1) continue;
            }

            if (gender !== 'all' && c.gender !== gender) continue;

            if (status === 'living' && c.isDeceased === true) continue;
            if (status === 'deceased' && c.isDeceased !== true) continue;

            out.push(c);
        }

        if (sortBy === 'name') {
            out.sort(function (a, b) {
                return String(a.name || '').localeCompare(String(b.name || ''));
            });
        } else if (sortBy === 'age_desc') {
            out.sort(function (a, b) {
                var aa = _ageOf(a);
                var ba = _ageOf(b);
                var av = (aa === null) ? -1 : aa;
                var bv = (ba === null) ? -1 : ba;
                return bv - av;
            });
        } else if (sortBy === 'age_asc') {
            out.sort(function (a, b) {
                var aa = _ageOf(a);
                var ba = _ageOf(b);
                var av = (aa === null) ? Infinity : aa;
                var bv = (ba === null) ? Infinity : ba;
                return av - bv;
            });
        } else {
            out.sort(function (a, b) {
                return String(a.name || '').localeCompare(String(b.name || ''));
            });
        }

        return out;
    }

    // =========================================================================
    // 5. LIST
    // =========================================================================

    function _renderList(characters) {
        var html = '<div class="ct-characters__list">';
        for (var i = 0; i < characters.length; i++) {
            html += _renderRow(characters[i]);
        }
        html += '</div>';
        return html;
    }

    function _renderRow(c) {
        var age = _ageOf(c);
        var ageText = (age === null) ? 'age ?' : (age + 'y');
        var gender = _genderLabel(c.gender);
        var locationId = _currentLocationIdOf(c);
        var locationName = locationId ? _getPlaceName(locationId) : '\u2014';
        var isDeceased = c.isDeceased === true;

        var hasCultureAppearance = !!(c.appearance
            && c.appearance._fromCulture === true
            && c.appearance._cultureId);

        var appearancePreview = hasCultureAppearance
            ? _appearancePreview(c.appearance)
            : null;

        var rowClass = 'ct-character-row';
        if (isDeceased) rowClass += ' ct-character-row--deceased';

        return (
            '<div class="' + rowClass + '" data-character-id="' + _escapeHtml(c.id) + '">' +
              '<div class="ct-character-row__body">' +
                '<div class="ct-character-row__top">' +
                  '<span class="ct-character-row__name">' +
                    _escapeHtml(c.name || '') + ' ' + _escapeHtml(c.surname || '') +
                  '</span>' +
                  '<span class="ct-character-row__meta">' +
                    _escapeHtml(gender) + ' \u00b7 ' + _escapeHtml(ageText) +
                  '</span>' +
                  (isDeceased
                    ? '<span class="ct-badge ct-badge--muted">Deceased</span>'
                    : '') +
                  (hasCultureAppearance
                    ? '<span class="ct-badge ct-badge--accent">Culture</span>'
                    : '') +
                '</div>' +
                '<div class="ct-character-row__sub">' +
                  '<span>' + _escapeHtml(locationName) + '</span>' +
                  (appearancePreview
                    ? '<span class="ct-character-row__appearance">' +
                      _escapeHtml(appearancePreview) +
                      '</span>'
                    : '<span class="ct-character-row__appearance ct-character-row__appearance--none">' +
                      'No culture appearance' +
                      '</span>') +
                '</div>' +
              '</div>' +
              '<div class="ct-character-row__actions">' +
                '<button type="button" class="rt-btn rt-btn--icon ct-character-apply" data-character-id="' +
                  _escapeHtml(c.id) + '" title="Apply culture appearance">Apply</button>' +
                '<button type="button" class="rt-btn rt-btn--icon rt-btn--danger ct-character-remove" data-character-id="' +
                  _escapeHtml(c.id) + '" title="Remove from culture">Remove</button>' +
              '</div>' +
            '</div>'
        );
    }

    /**
     * Summarizes a character's culture-generated appearance in one line.
     * Reads the character.appearance projection written by
     * CharacterCommands.updateCharacter (see culture-generation.js for
     * the shape produced by CultureGeneration.generateAppearance).
     *
     * Returns null when the appearance object has no skinTone,
     * hairColor, or eyeColor field — the row falls back to a "No
     * culture appearance" label.
     */
    function _appearancePreview(appearance) {
        if (!appearance) return null;
        var parts = [];
        if (typeof appearance.skinTone === 'string' && appearance.skinTone) {
            parts.push(appearance.skinTone);
        }
        if (typeof appearance.hairColor === 'string' && appearance.hairColor) {
            parts.push(appearance.hairColor + ' hair');
        }
        if (typeof appearance.eyeColor === 'string' && appearance.eyeColor) {
            parts.push(appearance.eyeColor + ' eyes');
        }
        if (parts.length === 0) return null;
        return parts.join(', ');
    }

    // =========================================================================
    // 6. EVENT WIRING
    // =========================================================================

    function _attachEvents(container, culture) {
        var searchInput = container.querySelector('.ct-characters-search');
        if (searchInput) {
            var timer = null;
            searchInput.addEventListener('input', function () {
                if (timer) clearTimeout(timer);
                timer = setTimeout(function () {
                    timer = null;
                    _localState.search = searchInput.value || '';
                    renderCharactersTab(container, culture);
                }, 200);
            });
        }

        var genderFilter = container.querySelector('.ct-characters-gender-filter');
        if (genderFilter) {
            genderFilter.addEventListener('change', function () {
                _localState.gender = genderFilter.value || 'all';
                renderCharactersTab(container, culture);
            });
        }

        var statusFilter = container.querySelector('.ct-characters-status-filter');
        if (statusFilter) {
            statusFilter.addEventListener('change', function () {
                _localState.status = statusFilter.value || 'all';
                renderCharactersTab(container, culture);
            });
        }

        var sortSelect = container.querySelector('.ct-characters-sort-by');
        if (sortSelect) {
            sortSelect.addEventListener('change', function () {
                _localState.sortBy = sortSelect.value || 'name';
                renderCharactersTab(container, culture);
            });
        }

        var clearBtn = container.querySelector('.ct-characters-clear');
        if (clearBtn) {
            clearBtn.addEventListener('click', function () {
                _resetState();
                renderCharactersTab(container, culture);
            });
        }

        var assignBtn = container.querySelector('.ct-characters-assign');
        if (assignBtn) {
            assignBtn.addEventListener('click', function () {
                _handleAssignCharacter(container, culture);
            });
        }

        var applyAllBtn = container.querySelector('.ct-characters-apply-all');
        if (applyAllBtn) {
            applyAllBtn.addEventListener('click', function () {
                _handleApplyAppearanceAll(container, culture);
            });
        }

        // Delegated per-row action handlers. The listener lives on the
        // tab container, not on the list, so a re-render (which replaces
        // the entire subtree via innerHTML) does not orphan it. See
        // playbook §6 Rule 2.
        if (!container.__ctCharactersWired) {
            container.__ctCharactersWired = true;
            container.addEventListener('click', function (e) {
                var target = e.target;
                if (!target || typeof target.closest !== 'function') return;

                var applyBtn = target.closest('.ct-character-apply');
                if (applyBtn) {
                    e.preventDefault();
                    var applyId = applyBtn.getAttribute('data-character-id');
                    if (applyId) _handleApplyAppearance(container, culture, applyId);
                    return;
                }

                var removeBtn = target.closest('.ct-character-remove');
                if (removeBtn) {
                    e.preventDefault();
                    var removeId = removeBtn.getAttribute('data-character-id');
                    if (removeId) _handleRemoveCharacter(container, culture, removeId);
                    return;
                }
            });
        }
    }

    // =========================================================================
    // 7. HANDLERS
    // =========================================================================

    function _handleAssignCharacter(container, culture) {
        if (typeof window.openModal !== 'function') {
            _showToast('Modal system is not available.', 'error');
            return;
        }

        var all = _getCharacters();
        var candidates = [];
        for (var i = 0; i < all.length; i++) {
            var c = all[i];
            if (!c || !c.id) continue;
            if (c.cultureId === culture.id) continue;
            if (c.isDeleted === true) continue;
            candidates.push(c);
        }

        if (candidates.length === 0) {
            _showToast('No unassigned characters available.', 'info');
            return;
        }

        candidates.sort(function (a, b) {
            return String(a.name || '').localeCompare(String(b.name || ''));
        });

        var optionsHtml = '';
        for (var j = 0; j < candidates.length; j++) {
            var cand = candidates[j];
            var label = (cand.name || '') + ' ' + (cand.surname || '');
            label = label.trim() || cand.id;
            var age = _ageOf(cand);
            var meta = _genderLabel(cand.gender) +
                (age === null ? '' : ', ' + age + 'y');
            optionsHtml +=
                '<option value="' + _escapeHtml(cand.id) + '">' +
                  _escapeHtml(label) + ' \u2014 ' + _escapeHtml(meta) +
                '</option>';
        }

        var content =
            '<div class="ct-form">' +
              '<div class="ct-form__group">' +
                '<label class="ct-form__label" for="ct-assign-char">Character</label>' +
                '<select id="ct-assign-char" class="ct-form__select">' +
                  optionsHtml +
                '</select>' +
              '</div>' +
              '<div class="ct-hint">' +
                'Assigning a character to this culture writes ' +
                'character.cultureId. This commits immediately and is not ' +
                'undone by the editor\u2019s Cancel.' +
              '</div>' +
            '</div>';

        _openModal({
            titleHtml: 'Assign Character to ' +
                _escapeHtml(culture.displayName || culture.name || 'Culture'),
            contentHtml: content,
            confirmText: 'Assign',
            cancelText: 'Cancel',
            onConfirm: function (root) {
                var sel = root ? root.querySelector('#ct-assign-char') : null;
                var charId = sel ? sel.value : '';
                if (!charId) {
                    _showToast('Pick a character first.', 'warning');
                    return false;
                }
                _assignCharacterToCulture(charId, culture, container);
                return true;
            }
        });
    }

    function _assignCharacterToCulture(characterId, culture, container) {
        var CC = _getCharacterCommands();
        if (!CC || typeof CC.updateCharacter !== 'function') {
            _showToast('Character commands are not available.', 'error');
            return;
        }
        var result = CC.updateCharacter(characterId, { cultureId: culture.id });
        if (!result || result.success !== true) {
            _showToast(
                'Assign failed: ' + (result && result.reason ? result.reason : 'unknown'),
                'error'
            );
            return;
        }
        if (typeof CC.persist === 'function') {
            var pr = CC.persist();
            if (pr && pr.success === false) {
                _showToast(
                    'Assigned in memory; storage write failed: ' +
                    (pr.reason || 'unknown'),
                    'warning'
                );
            } else {
                _showToast('Character assigned.', 'success');
            }
        } else {
            _showToast('Character assigned.', 'success');
        }
        renderCharactersTab(container, culture);
    }

    function _handleRemoveCharacter(container, culture, characterId) {
        var CC = _getCharacterCommands();
        if (!CC || typeof CC.updateCharacter !== 'function') {
            _showToast('Character commands are not available.', 'error');
            return;
        }
        var character = _getCharacterById(characterId);
        var label = character
            ? ((character.name || '') + ' ' + (character.surname || '')).trim()
            : characterId;

        _confirm(
            'Remove "' + label + '" from this culture? ' +
            'The character is not deleted.',
            'Remove from Culture',
            function () {
                var result = CC.updateCharacter(characterId, { cultureId: null });
                if (!result || result.success !== true) {
                    _showToast(
                        'Remove failed: ' + (result && result.reason ? result.reason : 'unknown'),
                        'error'
                    );
                    return;
                }
                if (typeof CC.persist === 'function') {
                    var pr = CC.persist();
                    if (pr && pr.success === false) {
                        _showToast(
                            'Removed in memory; storage write failed: ' +
                            (pr.reason || 'unknown'),
                            'warning'
                        );
                    } else {
                        _showToast('Removed from culture.', 'info');
                    }
                } else {
                    _showToast('Removed from culture.', 'info');
                }
                renderCharactersTab(container, culture);
            }
        );
    }

    function _handleApplyAppearance(container, culture, characterId) {
        var CG = _getCultureGeneration();
        var CC = _getCharacterCommands();
        if (!CG || typeof CG.generateAppearance !== 'function') {
            _showToast('Appearance generation is not available.', 'error');
            return;
        }
        if (!CC || typeof CC.updateCharacter !== 'function') {
            _showToast('Character commands are not available.', 'error');
            return;
        }

        var character = _getCharacterById(characterId);
        if (!character) {
            _showToast('Character not found.', 'error');
            return;
        }
        var gender = character.gender === 'male' || character.gender === 'female'
            ? character.gender
            : 'male';

        var appearance = null;
        try {
            appearance = CG.generateAppearance(culture.id, gender);
        } catch (e) {
            _showToast(
                'Generation failed: ' + (e && e.message ? e.message : 'unknown'),
                'error'
            );
            return;
        }
        if (!appearance) {
            _showToast('No appearance generated.', 'warning');
            return;
        }

        var patch = {
            appearance: Object.assign({}, appearance, {
                _fromCulture: true,
                _cultureId: culture.id
            })
        };
        var result = CC.updateCharacter(characterId, patch);
        if (!result || result.success !== true) {
            _showToast(
                'Apply failed: ' + (result && result.reason ? result.reason : 'unknown'),
                'error'
            );
            return;
        }
        if (typeof CC.persist === 'function') {
            var pr = CC.persist();
            if (pr && pr.success === false) {
                _showToast(
                    'Applied in memory; storage write failed: ' +
                    (pr.reason || 'unknown'),
                    'warning'
                );
            } else {
                _showToast('Appearance applied.', 'success');
            }
        } else {
            _showToast('Appearance applied.', 'success');
        }
        renderCharactersTab(container, culture);
    }

    function _handleApplyAppearanceAll(container, culture) {
        var CG = _getCultureGeneration();
        var CC = _getCharacterCommands();
        if (!CG || typeof CG.generateAppearance !== 'function') {
            _showToast('Appearance generation is not available.', 'error');
            return;
        }
        if (!CC || typeof CC.updateCharacter !== 'function') {
            _showToast('Character commands are not available.', 'error');
            return;
        }

        var all = _getCharacters();
        var assigned = [];
        for (var i = 0; i < all.length; i++) {
            if (all[i] && all[i].cultureId === culture.id && all[i].isDeleted !== true) {
                assigned.push(all[i]);
            }
        }
        if (assigned.length === 0) {
            _showToast('No characters are assigned to this culture.', 'info');
            return;
        }

        _confirm(
            'Apply a fresh culture-generated appearance to all ' +
            assigned.length + ' assigned character(s)? Existing appearances ' +
            'will be overwritten.',
            'Apply Appearance to All',
            function () {
                var succeeded = 0;
                var failed = 0;
                for (var j = 0; j < assigned.length; j++) {
                    var c = assigned[j];
                    var gender = c.gender === 'male' || c.gender === 'female'
                        ? c.gender
                        : 'male';
                    var appearance = null;
                    try { appearance = CG.generateAppearance(culture.id, gender); }
                    catch (e) { appearance = null; }
                    if (!appearance) { failed++; continue; }
                    var patch = {
                        appearance: Object.assign({}, appearance, {
                            _fromCulture: true,
                            _cultureId: culture.id
                        })
                    };
                    var result = CC.updateCharacter(c.id, patch);
                    if (!result || result.success !== true) failed++;
                    else succeeded++;
                }

                // Only persist if at least one update succeeded. Persisting
                // an unchanged in-memory state is a no-op for the data but
                // can fail for unrelated reasons and produce a misleading
                // "Applied in memory" warning. See PARTIAL-APPLY SEMANTICS
                // in the header.
                var persistFailed = false;
                if (succeeded > 0 && typeof CC.persist === 'function') {
                    var pr = CC.persist();
                    if (pr && pr.success === false) {
                        persistFailed = true;
                    }
                }

                if (succeeded === 0) {
                    _showToast(
                        'No appearances were applied. ' + failed + ' character(s) failed.',
                        'error'
                    );
                } else if (failed > 0) {
                    _showToast(
                        'Applied to ' + succeeded + ' character(s); ' +
                        failed + ' failed. ' +
                        (persistFailed
                            ? 'Storage write also failed.'
                            : 'Successful updates were saved.'),
                        'warning'
                    );
                } else if (persistFailed) {
                    _showToast(
                        'Applied to ' + succeeded + ' character(s) in memory; ' +
                        'storage write failed.',
                        'warning'
                    );
                } else {
                    _showToast(
                        'Appearance applied to all ' + succeeded + ' character(s).',
                        'success'
                    );
                }

                renderCharactersTab(container, culture);
            }
        );
    }

    // =========================================================================
    // 8. TAB DEFINITION + REGISTRATION
    // =========================================================================

    var CharactersTab = {
        label: 'Characters',
        icon: 'PERSON',
        render: renderCharactersTab,
        save: function () { return {}; },
        validate: function () { return { valid: true }; }
    };

    window.CharactersTab = CharactersTab;

    function register() {
        if (typeof window.CultureEditorTabs === 'undefined'
            || !window.CultureEditorTabs
            || typeof window.CultureEditorTabs.registerTab !== 'function') {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn(
                    'culture-characters-tab.js: CultureEditorTabs is not loaded; ' +
                    'the characters tab was not registered.'
                );
            }
            return false;
        }
        return window.CultureEditorTabs.registerTab('characters', CharactersTab);
    }

    window.registerCultureCharactersTab = register;

    if (typeof window.CultureEditorTabs !== 'undefined') {
        register();
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            CharactersTab: CharactersTab,
            registerCultureCharactersTab: register
        };
    }
})();
