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
 *   save(culture)                  — returns a partial culture object; this
 *                                    tab never modifies the culture record
 *                                    itself (all character changes are
 *                                    committed immediately via
 *                                    CharacterCommands, outside the composite
 *                                    form). Returns { }.
 *   validate(culture)              — { valid: true } — this tab has no
 *                                    culture-shape validation.
 *
 * IMPORTANT: THIS TAB DOES NOT PARTICIPATE IN THE COMPOSITE SAVE
 * --------------------------------------------------------------
 * Unlike appearance/mythology/names, character assignment is not a field
 * on the culture record. Assigning a character to a culture writes
 * `character.cultureId` on the CHARACTER domain, not on the culture.
 * Removing an appearance writes `character.appearance`. These writes go
 * through CharacterCommands.updateCharacter / updateCharacterFields and
 * persist via CharacterCommands.persist (or the character-state batch
 * path the character domain already uses), which is where the character
 * domain's save contract lives.
 *
 * Consequence: assign/remove/apply actions are IMMEDIATE (not deferred to
 * the editor's Save button), and the editor's Cancel does not undo them.
 * This is documented in the tab's UI as "changes are immediate" so the
 * user is not surprised.
 *
 * CONTRACTS
 * ---------
 *   - Reads are scoped to `container.querySelector(...)`. Never `document`.
 *   - No inline `style=""`. Classes live in css/culture-tabs.css.
 *   - No emojis. Icons via _getIcon(name); returns '' for unknown names.
 *     Gender is rendered as text ("Male" / "Female" / "Unknown"), not
 *     as a glyph.
 *   - Uses window.getCurrentYear (canonical). No 1250 fallback, no
 *     getCurrentYearSafe.
 *   - The tab is stateless across renders except for the local filter
 *     state below, which is reset on every render (matching the religion
 *     tabs' behavior — filters are session UI, not persisted).
 *
 * DEPENDENCIES (resolved at call time — no load-time guards):
 *   - CultureEditorTabs (this must load after culture-editor-tab.js)
 *   - CultureQueries
 *   - CultureGeneration
 *   - CharacterCommands
 *   - CharacterQueries (via window.CharacterQueries)
 *   - accessors (via window.getCharacters / window.getCharacterById)
 *   - time.js (getCurrentYear, calculateAge)
 *   - formatting.js (escapeHtml)
 *   - icons.js (Icons[name] via _getIcon)
 *   - ui.js (showToast)
 *   - modals-core.js (openModal, closeTopModal, confirmDialog)
 *   - modals-char-selector.js (openCharacterSelector — OPTIONAL; the
 *     "Assign" flow falls back to a simple list if absent)
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _escapeHtml(str) {
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
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
        return '—';
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
            // Fallback with the same scalar contract.
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
        if (typeof window.getCurrentLocationId === 'function') {
            try {
                var resolved = window.getCurrentLocationId(character);
                if (typeof resolved === 'string' && resolved.length > 0) return resolved;
            } catch (e) { /* fall through */ }
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
    //
    // Filters reset on every render. They are session UI, not persisted.
    // This matches the religion tab files' behavior.

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

        var filtered = _applyFilters(inCulture, all);

        var html =
            '<div class="ct-characters">' +

            // ---- Hint ----
            '<div class="ct-hint">' +
              'Assign characters to this culture and apply its generated ' +
              'appearance. Character changes commit immediately; closing ' +
              'the editor does not undo them.' +
            '</div>' +

            // ---- Header ----
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

            // ---- Filters ----
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
                '<option value="age_desc">Sort: Age ↓</option>' +
                '<option value="age_asc">Sort: Age ↑</option>' +
              '</select>' +
              '<button type="button" class="rt-clear ct-characters-clear">Clear</button>' +
            '</div>' +

            // ---- List / empty ----
            (filtered.length > 0
              ? _renderList(filtered, culture)
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

    function _applyFilters(characters, allCharacters) {
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

    function _renderList(characters, culture) {
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
        var locationName = locationId ? _getPlaceName(locationId) : '—';
        var isDeceased = c.isDeceased === true;

        var hasCultureAppearance = !!(c.appearance
            && c.appearance._fromCulture === true
            && c.appearance._cultureId);

        var appearancePreview = hasCultureAppearance
            ? _appearancePreview(c.appearance)
            : null;

        var rowClass = 'ct-character-row';
        if (isDeceased) rowClass += ' ct-character-row--deceased';

        var html =
            '<div class="' + rowClass + '" data-character-id="' + _escapeHtml(c.id) + '">' +
              '<div class="ct-character-row__body">' +
                '<div class="ct-character-row__top">' +
                  '<span class="ct-character-row__name">' +
                    _escapeHtml(c.name || '') + ' ' + _escapeHtml(c.surname || '') +
                  '</span>' +
                  '<span class="ct-character-row__meta">' +
                    _escapeHtml(gender) + ' · ' + _escapeHtml(ageText) +
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
                  _escapeHtml(c.id
