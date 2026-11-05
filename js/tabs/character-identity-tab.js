// js/tabs/character-identity-tab.js
/**
 * =============================================================================
 * STILL WATERS - CHARACTER IDENTITY TAB
 * (js/tabs/character-identity-tab.js)
 * =============================================================================
 *
 * LOCATION: js/tabs/character-identity-tab.js
 *
 * The Identity tab of the Character Manager. The primary edit surface
 * for a character's name, surname, epithet, gender, culture, religion,
 * traits, birth, death, ranks, appearance, and notes. Read-only surfaces
 * (birth/death facts, rank display) are shown; editable fields are
 * rendered as inputs. All writes go through the command layer.
 *
 * RENDERER CONTRACT (from CharacterManagerBootstrap):
 *   fn(container, context)
 *   container  HTMLElement  — already emptied by TabManager
 *   context    { characterId, character }  — CharacterQueries projection
 *
 * SECTIONS (each collapsible, all default expanded):
 *   1. Name & Title    — first name, surname, surname source, epithet,
 *                        gender, culture, religion, traits.
 *                        Each name field has a Random button.
 *                        Traits have a Randomize button (whole grid).
 *   2. Surname History — birth surname (editable), entries with Edit and
 *                        Delete per row, Add Change, Revert Last.
 *   3. Religion History — entries with Edit and Delete per row.
 *                        No add button here; religion changes come from
 *                        the Religion field in Section 1.
 *   4. Birth & Death   — birth year + birthplace (editable), death
 *                        fields (editable when deceased), Kill button,
 *                        Delete button.
 *   5. Ranks           — active + current + former. Add, Edit, Set
 *                        Active, Deprecate, Remove per row.
 *   6. Appearance      — seven text fields, Randomize Appearance button.
 *   7. Notes           — textarea.
 *
 * SAVE SEMANTICS:
 *   One "Save changes" button at the bottom, dirty-aware. On click:
 *     a. Trait delta (add/remove against the loaded model) is applied
 *        via addTrait / removeTrait.
 *     b. Religion change (if the select differs from the model) is
 *        applied via assignCharacterReligion (which appends history).
 *     c. Character-owned field patch (name, surname, surnameSource,
 *        epithet, gender, birthYear, birthplaceId, deathYear, deathCause,
 *        deathCauseDetail, deathNotes, appearance, notes) is applied via
 *        updateCharacter.
 *   Steps run in fixed order; failures accumulate; if any fail the form
 *   stays dirty so the user can retry the failed portion.
 *
 * ATOMIC-ACTION BUTTONS (outside the bulk Save):
 *   - Add Change           — recordCharacterSurnameChange
 *   - Revert Last          — revertCharacterSurnameChange
 *   - Edit entry (surname) — updateSurnameChangeEntry
 *   - Delete entry (surname) — deleteSurnameChangeEntry
 *   - Edit birth surname   — updateBirthSurname
 *   - Edit entry (religion) — updateReligionHistoryEntry
 *   - Delete entry (religion) — deleteReligionHistoryEntry
 *   - Add Rank             — addRankAssignment
 *   - Edit Rank            — updateRankAssignment
 *   - Set Active Rank      — setActiveRank
 *   - Deprecate Rank       — deprecateRankAssignment
 *   - Remove Rank          — removeRankAssignment
 *   - Kill                 — openDeathModal (delegates)
 *   - Delete               — openDeleteCharacterModal (delegates)
 *
 * RANDOM NAME PULL:
 *   Per-field Random buttons use the character's BIRTH COUNTRY by
 *   default (matching character-generator.js behaviour). A small
 *   "Randomize from culture" checkbox above the buttons switches the
 *   random source to the character's CULTURE's first associated location,
 *   resolved via CultureQueries.getCultureById(cultureId).locations[0],
 *   then walked to its country ancestor. If the culture has no locations
 *   or the culture module is not loaded, the source falls back to the
 *   birth country automatically.
 *
 *   Placeholder rules when the name generator returns nothing:
 *     - Male character  → "John"
 *     - Female character → "Jane"
 *     - Unknown gender   → "Emery"
 *
 *   Surnames have NO placeholder: on failure the field is left blank.
 *
 * CULTURE AND RELIGION PICKERS:
 *   Both are <select> elements populated from existing records:
 *     - Culture: CultureQueries.getAllCultures() (clones)
 *     - Religion: ReligionQueries.getActiveReligions()
 *   Neither offers a "create" affordance. An empty "— None —" option
 *   exists so the user can clear the field.
 *
 *   When the relevant module is not loaded, the field falls back to a
 *   read-only display of the current id with a note.
 *
 * DEPENDENCIES (required at load):
 *   - TabManager              (self-registration)
 *   - formatting.js           (escapeHtml, formatYear, formatDateRange,
 *                              getGenderLabel)
 *   - icons.js                (Icons)
 *   - CharacterUIState        (collapsed state)
 *   - CharacterViewModels     (buildIdentityModel)
 *   - CharacterCommands       (all writers)
 *   - CharacterQueries        (for CharacterUIState selection)
 *
 * DEPENDENCIES (optional, guarded at call time):
 *   - CultureQueries          culture picker + culture-source random
 *   - ReligionQueries         religion picker + religion name resolution
 *   - window.getRandomNameFromCountry / getRandomSurnameFromCountry
 *                             random name pull
 *   - window.getPlaceById     birthplace picker + place name display
 *   - window.getRanks         rank add modal
 *   - window.getRankById      rank display resolution
 *   - window.openDeathModal   kill button
 *   - window.openDeleteCharacterModal   delete button
 *   - window.showToast        error surfacing
 *   - window.openModal / closeTopModal  add-rank / add-surname-change /
 *                                        edit-history-entry / edit-rank
 *                                        modals
 *   - window.getCurrentYear   fallback for edit-history modals
 *
 * TIME CONTRACT: uses window.getCurrentYear where needed.
 *
 * ICON POLICY: SVG from icons.js. No emojis. No literal Unicode glyphs
 *              in the output except typographic markers already used
 *              in the tab's own collapsed-toggle (▶ / ▼), which are
 *              not emoji.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Initial revision.
 *     - Seven collapsible sections, all default expanded.
 *     - All fields editable. Bulk Save commits the field patch in one
 *       updateCharacter call; atomic actions commit individually.
 *     - Per-field Random buttons (first name, surname, epithet).
 *     - Randomize Traits button (clear + pick 3 random).
 *     - Randomize Appearance button.
 *     - Randomize Source toggle (birth country vs culture) above the
 *       name Random buttons.
 *     - Placeholder names: John / Jane / Emery by gender. Surname blank
 *       on failure.
 *     - Culture picker from CultureQueries.getAllCultures().
 *     - Religion picker from ReligionQueries.getActiveReligions().
 *     - Surname history: Edit / Delete per entry, Edit birth surname,
 *       Add Change, Revert Last.
 *     - Religion history: Edit / Delete per entry.
 *     - Ranks: Add, Edit, Set Active, Deprecate, Remove.
 *     - Kill and Delete delegate to the modals; disabled with an
 *       explanatory title when the modals are not loaded.
 *     - Dirty tracking across all editable inputs.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 0. CONSTANTS
    // =========================================================================

    var TAB_ID = 'identity';
    var SCOPE  = 'character';

    var SECTIONS = [
        { key: 'name',            label: 'Name & Title',     icon: 'PERSON' },
        { key: 'surnameHistory',  label: 'Surname History',  icon: 'TIMELINE' },
        { key: 'religionHistory', label: 'Religion History', icon: 'MARRIAGE' },
        { key: 'birthDeath',      label: 'Birth & Death',    icon: 'DEATHSTARS' },
        { key: 'ranks',           label: 'Ranks & Titles',   icon: 'CROWN' },
        { key: 'appearance',      label: 'Appearance',       icon: 'PERSON' },
        { key: 'notes',           label: 'Notes',            icon: 'BOOK' }
    ];

    // Randomize-source preference. Stored per tab. Default: 'country'.
    var RANDOM_SOURCE_KEY = 'identity_random_source';

    var EPITHETS = [
        'the Great', 'the Wise', 'the Brave', 'the Bold', 'the Fair',
        'the Strong', 'the Old', 'the Young', 'the Pious', 'the Cruel',
        'the Just', 'the Quiet', 'the Silent', 'the Learned', 'the Mad',
        'the Terrible', 'the Kind', 'the Unready', 'the Confessor',
        'the Conqueror'
    ];

    // =========================================================================
    // 1. SMALL HELPERS
    // =========================================================================

    function _esc(v) {
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(v);
        if (v === null || v === undefined) return '';
        return String(v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _isMissing(v) { return v === undefined || v === null; }
    function _hasId(v) { return typeof v === 'string' && v.length > 0; }

    function _icon(name) {
        if (window.Icons && window.Icons[name]) return window.Icons[name];
        if (window.Icons && window.Icons.CIRCLE) return window.Icons.CIRCLE;
        return '';
    }

    function _uiState() { return window.CharacterUIState || null; }

    function _commands() { return window.CharacterCommands || null; }

    function _queries() { return window.CharacterQueries || null; }

    function _toast(msg, type) {
        if (typeof window.showToast === 'function') {
            try { window.showToast(msg, type || 'info'); }
            catch (e) { /* non-fatal */ }
        } else if (typeof console !== 'undefined' && console.warn) {
            console.warn('[identity-tab] ' + (type || 'info') + ': ' + msg);
        }
    }

    function _refresh() {
        if (window.CharacterManagerBootstrap
            && typeof window.CharacterManagerBootstrap.renderActive === 'function') {
            try { window.CharacterManagerBootstrap.renderActive(); }
            catch (e) { /* non-fatal */ }
        }
    }

    function _year(v) {
        if (typeof window.formatYear === 'function') return window.formatYear(v);
        if (_isMissing(v)) return '?';
        return String(v);
    }

    function _yearRange(start, end, isCurrent) {
        if (typeof window.formatDateRange === 'function') {
            return window.formatDateRange(start, end, isCurrent);
        }
        if (_isMissing(start) && _isMissing(end)) return 'Unknown';
        if (_isMissing(start)) return 'Until ' + _year(end);
        if (_isMissing(end)) return 'From ' + _year(start);
        return _year(start) + '–' + _year(end);
    }

    function _currentYear() {
        if (typeof window.getCurrentYear === 'function') {
            try { return window.getCurrentYear(); }
            catch (e) { /* fall through */ }
        }
        return 1250;
    }

    function _isCollapsed(key) {
        var ui = _uiState();
        if (!ui || typeof ui.getCollapsed !== 'function') return false;
        return ui.getCollapsed(TAB_ID, key) === true;
    }

    function _setCollapsed(key, collapsed) {
        var ui = _uiState();
        if (!ui || typeof ui.setCollapsed !== 'function') return;
        ui.setCollapsed(TAB_ID, key, collapsed);
    }

    function _getRandomSource() {
        try {
            var v = window.localStorage.getItem(RANDOM_SOURCE_KEY);
            return v === 'culture' ? 'culture' : 'country';
        } catch (e) {
            return 'country';
        }
    }

    function _setRandomSource(src) {
        try {
            window.localStorage.setItem(
                RANDOM_SOURCE_KEY,
                src === 'culture' ? 'culture' : 'country'
            );
        } catch (e) { /* non-fatal */ }
    }

    function _pickRandom(arr) {
        if (!Array.isArray(arr) || arr.length === 0) return null;
        return arr[Math.floor(Math.random() * arr.length)];
    }

    // =========================================================================
    // 2. RANDOM NAME RESOLUTION
    // =========================================================================

    /**
     * Resolve a country id to pull a random name from.
     *
     * Source 'country': the character's birth country, resolved by
     *   walking up from `birthplaceId` via `getPlaceById` until a
     *   country-scope place is found.
     *
     * Source 'culture': the character's declared culture (via
     *   `summary.cultureId`), then the culture's first associated
     *   location (CultureQueries.getCultureById(id).locations[0]), then
     *   walk that location up to a country. Falls back to the birth
     *   country if anything in the chain is missing.
     *
     * Returns a country place id or null.
     */
    function _resolveRandomCountryId(characterId, summary) {
        var source = _getRandomSource();

        // Always resolve the birth country (fallback and default).
        var birthCountryId = _resolveBirthCountryId(summary.birthplaceId);

        if (source !== 'culture') return birthCountryId;

        // Culture source.
        if (!_hasId(summary.cultureId)) return birthCountryId;
        if (typeof window.CultureQueries === 'undefined'
            || !window.CultureQueries
            || typeof window.CultureQueries.getCultureById !== 'function') {
            return birthCountryId;
        }

        var culture = null;
        try { culture = window.CultureQueries.getCultureById(summary.cultureId); }
        catch (e) { culture = null; }
        if (!culture) return birthCountryId;

        var locations = Array.isArray(culture.locations) ? culture.locations : [];
        if (locations.length === 0) return birthCountryId;

        var firstLocId = locations[0];
        var countryId = _resolveBirthCountryId(firstLocId);
        return countryId || birthCountryId;
    }

    function _resolveBirthCountryId(birthplaceId) {
        if (!_hasId(birthplaceId)) return null;
        if (typeof window.getPlaceById !== 'function') return birthplaceId;

        var current = null;
        try { current = window.getPlaceById(birthplaceId); }
        catch (e) { current = null; }
        if (!current) return birthplaceId;

        // Walk up looking for a country. The scope check uses
        // getPlaceScope if available; otherwise this is a heuristic and
        // we return the topmost place we can reach.
        var top = current;
        var guard = 0;
        while (current && current.parentId && guard < 100) {
            guard++;
            var parent = null;
            try { parent = window.getPlaceById(current.parentId); }
            catch (e) { parent = null; }
            if (!parent) break;
            top = parent;
            if (typeof window.getPlaceScope === 'function') {
                try {
                    if (window.getPlaceScope(parent) === 'country') return parent.id;
                } catch (e) { /* fall through */ }
            }
            current = parent;
        }
        // No country scope available; return the topmost place id.
        return top && top.id ? top.id : birthplaceId;
    }

    function _placeholderName(gender) {
        if (gender === 'male') return 'John';
        if (gender === 'female') return 'Jane';
        return 'Emery';
    }

    function _randomFirstName(characterId, summary) {
        var countryId = _resolveRandomCountryId(characterId, summary);
        var gender = summary.gender || 'unknown';

        if (_hasId(countryId)
            && typeof window.getRandomNameFromCountry === 'function') {
            var n = null;
            try { n = window.getRandomNameFromCountry(countryId, gender); }
            catch (e) { n = null; }
            if (typeof n === 'string' && n.length > 0) return n;
        }
        return _placeholderName(gender);
    }

    function _randomSurname(characterId, summary) {
        var countryId = _resolveRandomCountryId(characterId, summary);
        if (!_hasId(countryId)) return '';
        if (typeof window.getRandomSurnameFromCountry !== 'function') return '';

        var s = null;
        try { s = window.getRandomSurnameFromCountry(countryId); }
        catch (e) { s = null; }
        if (typeof s !== 'string') return '';
        if (s === 'Unknown' || s === 'Unnamed') return '';
        return s;
    }

    function _randomEpithet() {
        return _pickRandom(EPITHETS) || '';
    }

    // =========================================================================
    // 3. CULTURE AND RELIGION OPTIONS
    // =========================================================================

    function _cultureOptions(currentId) {
        if (typeof window.CultureQueries === 'undefined'
            || !window.CultureQueries
            || typeof window.CultureQueries.getAllCultures !== 'function') {
            return null;
        }

        var cultures = [];
        try { cultures = window.CultureQueries.getAllCultures() || []; }
        catch (e) { cultures = []; }

        var html = '<option value="">— None —</option>';
        for (var i = 0; i < cultures.length; i++) {
            var c = cultures[i];
            if (!c || !_hasId(c.id)) continue;
            var selected = (c.id === currentId) ? ' selected' : '';
            var name = (typeof c.name === 'string' && c.name.length > 0)
                ? c.name : c.id;
            html += '<option value="' + _esc(c.id) + '"' + selected + '>' +
                _esc(name) + '</option>';
        }
        return html;
    }

    function _religionOptions(currentId) {
        if (typeof window.ReligionQueries === 'undefined'
            || !window.ReligionQueries
            || typeof window.ReligionQueries.getActiveReligions !== 'function') {
            return null;
        }

        var religions = [];
        try { religions = window.ReligionQueries.getActiveReligions() || []; }
        catch (e) { religions = []; }

        var html = '<option value="">— None —</option>';
        for (var i = 0; i < religions.length; i++) {
            var r = religions[i];
            if (!r || !_hasId(r.id)) continue;
            var selected = (r.id === currentId) ? ' selected' : '';
            var name = (typeof r.name === 'string' && r.name.length > 0)
                ? r.name : r.id;
            html += '<option value="' + _esc(r.id) + '"' + selected + '>' +
                _esc(name) + '</option>';
        }
        return html;
    }

    // =========================================================================
    // 4. FIELD AND SECTION SHELLS
    // =========================================================================

    function _field(label, controlHtml) {
        return '<div class="character-tab-field">' +
            '<label class="character-tab-field__label">' + _esc(label) + '</label>' +
            '<div class="character-tab-field__value">' + controlHtml + '</div>' +
        '</div>';
    }

    function _fieldReadonly(label, valueHtml) {
        return '<div class="character-tab-field">' +
            '<div class="character-tab-field__label">' + _esc(label) + '</div>' +
            '<div class="character-tab-field__value">' + valueHtml + '</div>' +
        '</div>';
    }

    function _empty(message) {
        return '<div class="character-tab-empty">' + _esc(message) + '</div>';
    }

    function _unavailable(message) {
        return '<div class="character-tab-unavailable">' + _esc(message) + '</div>';
    }

    function _sectionHtml(section, bodyHtml) {
        var collapsed = _isCollapsed(section.key);
        var cls = 'character-tab-section' + (collapsed ? '' : ' is-expanded');
        var ariaExpanded = collapsed ? 'false' : 'true';
        return '' +
            '<div class="' + cls + '" data-section="' + _esc(section.key) + '">' +
                '<button type="button" class="character-tab-section__header" ' +
                    'aria-expanded="' + ariaExpanded + '" ' +
                    'data-action="toggle-section" ' +
                    'data-section-key="' + _esc(section.key) + '">' +
                    '<span class="character-tab-section__toggle" aria-hidden="true">' +
                        (collapsed ? '\u25B6' : '\u25BC') +
                    '</span>' +
                    '<span class="character-tab-section__icon" aria-hidden="true">' +
                        _icon(section.icon) +
                    '</span>' +
                    '<span class="character-tab-section__title">' +
                        _esc(section.label) +
                    '</span>' +
                '</button>' +
                '<div class="character-tab-section__body">' +
                    bodyHtml +
                '</div>' +
            '</div>';
    }

    // =========================================================================
    // 5. SECTION 1 — NAME & TITLE
    // =========================================================================

    function _bodyNameAndTitle(model, summary) {
        if (model.identity === null) {
            return _unavailable(
                'Name & Title section could not be loaded: ' +
                (model.errors.identity || 'unknown error')
            );
        }

        var id = model.identity;
        var source = _getRandomSource();

        var cultureOptions = _cultureOptions(id.cultureId);
        var religionOptions = _religionOptions(id.religionId);

        var randomControls = '' +
            '<div class="character-tab-random-source">' +
                '<label class="character-tab-checkbox">' +
                    '<input type="checkbox" data-field="random-source-culture"' +
                        (source === 'culture' ? ' checked' : '') + '>' +
                    '<span>Randomize from culture (otherwise birth country)</span>' +
                '</label>' +
            '</div>';

        var nameFields = '' +
            _field('First Name',
                '<div class="character-tab-input-row">' +
                    '<input type="text" data-field="firstName" ' +
                        'value="' + _esc(id.firstName) + '" ' +
                        'class="character-tab-input" autocomplete="off">' +
                    '<button type="button" class="character-tab-btn-small" ' +
                        'data-action="random-first-name">Random</button>' +
                '</div>'
            ) +
            _field('Surname',
                '<div class="character-tab-input-row">' +
                    '<input type="text" data-field="surname" ' +
                        'value="' + _esc(id.surname) + '" ' +
                        'class="character-tab-input" autocomplete="off">' +
                    '<button type="button" class="character-tab-btn-small" ' +
                        'data-action="random-surname">Random</button>' +
                '</div>'
            ) +
            _field('Surname Source',
                '<select data-field="surnameSource" class="character-tab-input">' +
                    '<option value="country"' +
                        (id.surnameSource === 'country' ? ' selected' : '') +
                        '>Country</option>' +
                    '<option value="rank"' +
                        (id.surnameSource === 'rank' ? ' selected' : '') +
                        '>Rank</option>' +
                    '<option value="custom"' +
                        (id.surnameSource === 'custom' ? ' selected' : '') +
                        '>Custom</option>' +
                    '<option value="inherited"' +
                        (id.surnameSource === 'inherited' ? ' selected' : '') +
                        '>Inherited</option>' +
                    '<option value="none"' +
                        (id.surnameSource === 'none' ? ' selected' : '') +
                        '>None</option>' +
                '</select>'
            ) +
            _field('Epithet / Nickname',
                '<div class="character-tab-input-row">' +
                    '<input type="text" data-field="epithet" ' +
                        'value="' + _esc(id.epithet) + '" ' +
                        'class="character-tab-input" autocomplete="off">' +
                    '<button type="button" class="character-tab-btn-small" ' +
                        'data-action="random-epithet">Random</button>' +
                '</div>'
            ) +
            _field('Gender',
                '<select data-field="gender" class="character-tab-input">' +
                    '<option value="male"' +
                        (id.gender === 'male' ? ' selected' : '') +
                        '>Male</option>' +
                    '<option value="female"' +
                        (id.gender === 'female' ? ' selected' : '') +
                        '>Female</option>' +
                    '<option value="unknown"' +
                        (id.gender === 'unknown' ? ' selected' : '') +
                        '>Unknown</option>' +
                '</select>'
            );

        var cultureField;
        if (cultureOptions !== null) {
            cultureField = _field('Culture',
                '<select data-field="cultureId" class="character-tab-input">' +
                    cultureOptions +
                '</select>'
            );
        } else {
            cultureField = _fieldReadonly('Culture',
                _hasId(id.cultureId)
                    ? _esc(id.cultureName || id.cultureId) +
                      ' <span class="character-tab-note">' +
                      '(CultureQueries not loaded; edit disabled)</span>'
                    : '<span class="character-tab-note">None</span>'
            );
        }

        var religionField;
        if (religionOptions !== null) {
            religionField = _field('Religion',
                '<select data-field="religionId" class="character-tab-input">' +
                    religionOptions +
                '</select>'
            );
        } else {
            religionField = _fieldReadonly('Religion',
                _hasId(id.religionId)
                    ? _esc(id.religionName || id.religionId) +
                      ' <span class="character-tab-note">' +
                      '(ReligionQueries not loaded; edit disabled)</span>'
                    : '<span class="character-tab-note">None</span>'
            );
        }

        var traitsHtml = _renderTraitGrid(id.traits);

        return '' +
            randomControls +
            nameFields +
            cultureField +
            religionField +
            _fieldReadonly('Full Name Preview',
                '<span class="character-tab-preview" data-preview="full-name">' +
                    _esc(id.fullName || id.firstName) +
                '</span>'
            ) +
            _field('Traits',
                '<div class="character-tab-traits">' +
                    traitsHtml +
                    '<div class="character-tab-input-row">' +
                        '<button type="button" class="character-tab-btn-small" ' +
                            'data-action="randomize-traits">' +
                            'Randomize</button>' +
                        '<button type="button" class="character-tab-btn-small" ' +
                            'data-action="clear-traits">Clear</button>' +
                    '</div>' +
                '</div>'
            );
    }

    function _renderTraitGrid(selectedTraits) {
        if (!Array.isArray(window.CHARACTER_TRAIT_VALUES)) {
            return '<div class="character-tab-note">' +
                'Trait vocabulary is not loaded; trait editing is disabled.' +
            '</div>';
        }
        var values = window.CHARACTER_TRAIT_VALUES;
        if (values.length === 0) {
            return '<div class="character-tab-note">' +
                'Trait vocabulary is empty.' +
            '</div>';
        }
        var selected = {};
        if (Array.isArray(selectedTraits)) {
            for (var i = 0; i < selectedTraits.length; i++) {
                selected[selectedTraits[i]] = true;
            }
        }
        var html = '';
        for (var j = 0; j < values.length; j++) {
            var t = values[j];
            var checked = selected[t] === true ? ' checked' : '';
            html += '<label class="character-tab-trait">' +
                '<input type="checkbox" data-trait="' + _esc(t) + '"' + checked + '>' +
                '<span>' + _esc(t) + '</span>' +
            '</label>';
        }
        return html;
    }

    // =========================================================================
    // 6. SECTION 2 — SURNAME HISTORY
    // =========================================================================

    function _bodySurnameHistory(model) {
        if (model.surnameHistory === null) {
            return _unavailable(
                'Surname history section could not be loaded: ' +
                (model.errors.surnameHistory || 'unknown error')
            );
        }

        var h = model.surnameHistory;
        var html = '';

        html += _field('Birth Surname',
            '<div class="character-tab-input-row">' +
                '<input type="text" data-field="birthSurname" ' +
                    'value="' + _esc(h.birthSurname || '') + '" ' +
                    'class="character-tab-input" autocomplete="off">' +
                '<button type="button" class="character-tab-btn-small" ' +
                    'data-action="save-birth-surname">Save</button>' +
            '</div>'
        );

        if (h.entries.length === 0) {
            html += _empty('No surname changes recorded.');
        } else {
            html += '<div class="character-tab-history">';
            for (var i = 0; i < h.entries.length; i++) {
                var e = h.entries[i];
                var isCurrent = (i === h.entries.length - 1);
                var reason = e.reason || 'custom';
                html += '<div class="character-tab-history__row' +
                            (isCurrent ? ' is-current' : '') +
                            '" data-history-kind="surname" data-history-index="' + i + '">' +
                    '<div class="character-tab-history__main">' +
                        '<span class="character-tab-history__year">' +
                            _esc(_year(e.year)) +
                        '</span>' +
                        '<span class="character-tab-history__value">' +
                            _esc(e.surname || '—') +
                        '</span>' +
                        '<span class="character-tab-history__reason">' +
                            _esc(reason) +
                        '</span>' +
                        (isCurrent
                            ? '<span class="character-tab-history__badge">Current</span>'
                            : '') +
                    '</div>' +
                    '<div class="character-tab-history__actions">' +
                        '<button type="button" class="character-tab-btn-small" ' +
                            'data-action="edit-surname-entry" ' +
                            'data-history-index="' + i + '">Edit</button>' +
                        '<button type="button" class="character-tab-btn-small danger" ' +
                            'data-action="delete-surname-entry" ' +
                            'data-history-index="' + i + '">Delete</button>' +
                    '</div>' +
                '</div>';
            }
            html += '</div>';
        }

        html += '<div class="character-tab-actions">' +
            '<button type="button" class="character-tab-btn" ' +
                'data-action="add-surname-change">' +
                '+ Add Change' +
            '</button>' +
            '<button type="button" class="character-tab-btn" ' +
                'data-action="revert-surname-change"' +
                (h.entries.length === 0 ? ' disabled' : '') + '>' +
                'Revert Last' +
            '</button>' +
        '</div>';

        return html;
    }

    // =========================================================================
    // 7. SECTION 3 — RELIGION HISTORY
    // =========================================================================

    function _bodyReligionHistory(model) {
        if (model.religionHistory === null) {
            return _unavailable(
                'Religion history section could not be loaded: ' +
                (model.errors.religionHistory || 'unknown error')
            );
        }

        var h = model.religionHistory;
        if (!h.available) {
            return _unavailable(h.reason || 'Religion history is not available.');
        }
        if (h.entries.length === 0) {
            return _empty('No religion history recorded. Change religion in the Name & Title section to record a conversion.');
        }

        var html = '<div class="character-tab-history">';
        for (var i = 0; i < h.entries.length; i++) {
            var e = h.entries[i];
            var fromName = e.fromReligionName || e.fromReligionId || '—';
            var toName = e.toReligionName || e.toReligionId || '—';
            html += '<div class="character-tab-history__row" ' +
                        'data-history-kind="religion" data-history-index="' + i + '">' +
                '<div class="character-tab-history__main">' +
                    '<span class="character-tab-history__year">' +
                        _esc(_year(e.year)) +
                    '</span>' +
                    '<span class="character-tab-history__value">' +
                        _esc(fromName) + ' → ' + _esc(toName) +
                    '</span>' +
                    (e.reason
                        ? '<span class="character-tab-history__reason">' +
                            _esc(e.reason) + '</span>'
                        : '') +
                '</div>' +
                '<div class="character-tab-history__actions">' +
                    '<button type="button" class="character-tab-btn-small" ' +
                        'data-action="edit-religion-entry" ' +
                        'data-history-index="' + i + '">Edit</button>' +
                    '<button type="button" class="character-tab-btn-small danger" ' +
                        'data-action="delete-religion-entry" ' +
                        'data-history-index="' + i + '">Delete</button>' +
                '</div>' +
            '</div>';
        }
        html += '</div>';

        return html;
    }

    // =========================================================================
    // 8. SECTION 4 — BIRTH & DEATH
    // =========================================================================

    function _bodyBirthDeath(model, summary) {
        var birth = model.birth;
        var death = model.death;

        var html = '';

        if (birth === null) {
            html += _unavailable(
                'Birth section could not be loaded: ' +
                (model.errors.birth || 'unknown error')
            );
        } else {
            html += _field('Birth Year',
                '<input type="number" data-field="birthYear" ' +
                    'value="' + (birth.year !== null ? _esc(birth.year) : '') + '" ' +
                    'class="character-tab-input" min="1" ' +
                    'max="' + (_currentYear() + 10) + '">'
            );

            html += _field('Birthplace',
                _birthplaceControlHtml(birth.placeId, birth.placeName)
            );
        }

        if (death === null) {
            html += _unavailable(
                'Death section could not be loaded: ' +
                (model.errors.death || 'unknown error')
            );
        } else if (death.isDeceased === false) {
            html += '<div class="character-tab-note">' +
                'Living. Click "Kill" to record a death.' +
            '</div>';
        } else {
            html += _field('Death Year',
                '<input type="number" data-field="deathYear" ' +
                    'value="' + (death.year !== null ? _esc(death.year) : '') + '" ' +
                    'class="character-tab-input" min="1" ' +
                    'max="' + (_currentYear() + 10) + '">'
            );

            html += _field('Death Cause',
                _deathCauseControlHtml(death.cause)
            );

            html += _field('Death Cause Detail',
                '<input type="text" data-field="deathCauseDetail" ' +
                    'value="' + _esc(death.causeDetail || '') + '" ' +
                    'class="character-tab-input" autocomplete="off">'
            );

            html += _field('Death Notes',
                '<textarea data-field="deathNotes" class="character-tab-input" ' +
                    'rows="2">' + _esc(death.notes || '') + '</textarea>'
            );

            if (death.isMurder) {
                html += _fieldReadonly('Murder',
                    (death.killerName
                        ? 'Killed by ' + _esc(death.killerName)
                        : 'Killed by ' + _esc(death.killerId || 'unknown')) +
                    (death.murderMethod
                        ? ' · Method: ' + _esc(death.murderMethod)
                        : '') +
                    (death.murderMotive
                        ? ' · Motive: ' + _esc(death.murderMotive)
                        : '')
                );
            }
            if (death.isExecution) {
                html += _fieldReadonly('Execution',
                    (death.executionReason
                        ? 'Reason: ' + _esc(death.executionReason)
                        : '') +
                    (death.executionMethod
                        ? ' · Method: ' + _esc(death.executionMethod)
                        : '') +
                    (death.executionLocation
                        ? ' · Location: ' + _esc(death.executionLocation)
                        : '')
                );
            }
        }

        // Action buttons.
        var canKill = (window.openDeathModal
            && typeof window.openDeathModal === 'function'
            && death
            && death.isDeceased === false);
        var canDelete = (window.openDeleteCharacterModal
            && typeof window.openDeleteCharacterModal === 'function');

        var killAttrs = canKill ? '' : ' disabled title="' +
            (death && death.isDeceased
                ? 'Character is already deceased'
                : 'Death modal is not loaded') + '"';
        var deleteAttrs = canDelete ? '' : ' disabled title="Delete modal is not loaded"';

        html += '<div class="character-tab-actions">' +
            '<button type="button" class="character-tab-btn danger" ' +
                'data-action="kill-character"' + killAttrs + '>Kill</button>' +
            '<button type="button" class="character-tab-btn danger" ' +
                'data-action="delete-character"' + deleteAttrs + '>Delete Character</button>' +
        '</div>';

        return html;
    }

    function _birthplaceControlHtml(placeId, placeName) {
        var places = [];
        if (typeof window.getAllPlaces === 'function') {
            try { places = window.getAllPlaces() || []; }
            catch (e) { places = []; }
        } else if (typeof window.getPlaces === 'function') {
            try { places = window.getPlaces() || []; }
            catch (e) { places = []; }
        }

        if (!Array.isArray(places) || places.length === 0) {
            return _esc(placeName || placeId || '—') +
                ' <span class="character-tab-note">' +
                '(World is not loaded; birthplace edit disabled)</span>';
        }

        var html = '<select data-field="birthplaceId" class="character-tab-input">' +
            '<option value=""' + (_hasId(placeId) ? '' : ' selected') +
                '>— None —</option>';
        for (var i = 0; i < places.length; i++) {
            var p = places[i];
            if (!p || !_hasId(p.id)) continue;
            var name = p.displayName || p.name || p.id;
            var selected = (p.id === placeId) ? ' selected' : '';
            html += '<option value="' + _esc(p.id) + '"' + selected + '>' +
                _esc(name) + '</option>';
        }
        return html + '</select>';
    }

    function _deathCauseControlHtml(cause) {
        if (typeof window.MortalityRules === 'undefined'
            || !window.MortalityRules
            || !window.MortalityRules.DEATH_CAUSE) {
            return '<input type="text" data-field="deathCause" ' +
                'value="' + _esc(cause || '') + '" ' +
                'class="character-tab-input" autocomplete="off">';
        }

        var CAUSE = window.MortalityRules.DEATH_CAUSE;
        var causes = [
            { id: CAUSE.NATURAL, label: 'Natural' },
            { id: CAUSE.DISEASE, label: 'Disease' },
            { id: CAUSE.ACCIDENT, label: 'Accident' },
            { id: CAUSE.MURDER, label: 'Murder' },
            { id: CAUSE.EXECUTION, label: 'Execution' },
            { id: CAUSE.CHILDBED_FEVER, label: 'Childbed Fever' },
            { id: CAUSE.UNKNOWN, label: 'Unknown' }
        ];

        var html = '<select data-field="deathCause" class="character-tab-input">';
        html += '<option value=""' + (_hasId(cause) ? '' : ' selected') +
            '>— Select —</option>';
        for (var i = 0; i < causes.length; i++) {
            var c = causes[i];
            var selected = (c.id === cause) ? ' selected' : '';
            html += '<option value="' + _esc(c.id) + '"' + selected + '>' +
                _esc(c.label) + '</option>';
        }
        html += '</select>';
        return html;
    }

    // =========================================================================
    // 9. SECTION 5 — RANKS
    // =========================================================================

    function _bodyRanks(model, characterId) {
        if (model.ranks === null) {
            return _unavailable(
                'Ranks section could not be loaded: ' +
                (model.errors.ranks || 'unknown error')
            );
        }

        var ranks = model.ranks;
        var html = '';

        if (!ranks.active && ranks.current.length === 0 && ranks.former.length === 0) {
            html += _empty('No ranks assigned.');
        } else {
            if (ranks.active) {
                html += _rankRowHtml(ranks.active, 'active');
            }

            if (ranks.current.length > 0) {
                html += '<div class="character-tab-subhead">Current</div>';
                for (var i = 0; i < ranks.current.length; i++) {
                    var a = ranks.current[i];
                    if (ranks.active && a.rankId === ranks.active.rankId) continue;
                    html += _rankRowHtml(a, 'current');
                }
            }

            if (ranks.former.length > 0) {
                html += '<div class="character-tab-subhead">Former</div>';
                for (var j = 0; j < ranks.former.length; j++) {
                    html += _rankRowHtml(ranks.former[j], 'former');
                }
            }
        }

        var canAdd = (typeof window.getRanks === 'function')
            || true; // Add rank is possible even without getRanks, using a free-text rankId.
        var addAttrs = canAdd ? '' : ' disabled';
        html += '<div class="character-tab-actions">' +
            '<button type="button" class="character-tab-btn" ' +
                'data-action="add-rank"' + addAttrs + '>' +
                '+ Add Rank' +
            '</button>' +
        '</div>';

        return html;
    }

    function _rankRowHtml(a, context) {
        var display = a.customTitle || a.rankName || a.rankId;
        var symbol = a.rankSymbol
            ? '<span class="character-tab-rank-symbol">' + _esc(a.rankSymbol) + '</span>'
            : '';
        var number = a.number && a.number.display
            ? ' ' + _esc(a.number.display)
            : '';

        var unavailable = a.rankAvailable === false
            ? ' <span class="character-tab-note">(rank definition not loaded)</span>'
            : '';

        var actions = '';
        if (context === 'active') {
            actions = '<button type="button" class="character-tab-btn-small" ' +
                    'data-action="edit-rank" data-rank-id="' + _esc(a.rankId) + '">Edit</button>' +
                '<button type="button" class="character-tab-btn-small danger" ' +
                    'data-action="remove-rank" data-rank-id="' + _esc(a.rankId) + '">Remove</button>';
        } else if (context === 'current') {
            actions = '<button type="button" class="character-tab-btn-small" ' +
                    'data-action="edit-rank" data-rank-id="' + _esc(a.rankId) + '">Edit</button>' +
                '<button type="button" class="character-tab-btn-small" ' +
                    'data-action="set-active-rank" data-rank-id="' + _esc(a.rankId) + '">Set Active</button>' +
                '<button type="button" class="character-tab-btn-small" ' +
                    'data-action="deprecate-rank" data-rank-id="' + _esc(a.rankId) + '">Deprecate</button>' +
                '<button type="button" class="character-tab-btn-small danger" ' +
                    'data-action="remove-rank" data-rank-id="' + _esc(a.rankId) + '">Remove</button>';
        } else {
            actions = '<button type="button" class="character-tab-btn-small danger" ' +
                'data-action="remove-rank" data-rank-id="' + _esc(a.rankId) + '">Remove</button>';
        }

        var meta = [];
        if (a.address) meta.push('Address: ' + a.address);
        if (a.assignedYear !== null && a.assignedYear !== undefined) {
            meta.push('Since ' + _year(a.assignedYear));
        }
        if (a.notes) meta.push(a.notes);

        return '<div class="character-tab-rank-row character-tab-rank-row--' + context + '" ' +
                    'data-rank-id="' + _esc(a.rankId) + '">' +
            '<div class="character-tab-rank-main">' +
                symbol +
                '<span class="character-tab-rank-name">' +
                    _esc(display) + number +
                '</span>' +
                unavailable +
            '</div>' +
            (meta.length > 0
                ? '<div class="character-tab-rank-meta">' +
                    _esc(meta.join(' · ')) + '</div>'
                : '') +
            '<div class="character-tab-rank-actions">' + actions + '</div>' +
        '</div>';
    }

    // =========================================================================
    // 10. SECTION 6 — APPEARANCE
    // =========================================================================

    function _bodyAppearance(model) {
        if (model.appearance === null) {
            return _unavailable(
                'Appearance section could not be loaded: ' +
                (model.errors.appearance || 'unknown error')
            );
        }

        var a = model.appearance;

        function field(key, label) {
            return _field(label,
                '<input type="text" data-field="appearance.' + key + '" ' +
                    'value="' + _esc(a[key] || '') + '" ' +
                    'class="character-tab-input" autocomplete="off">'
            );
        }

        return field('hairColor', 'Hair Color') +
            field('eyeColor', 'Eye Color') +
            field('skinTone', 'Skin Tone') +
            field('build', 'Build') +
            field('height', 'Height') +
            field('distinguishingFeatures', 'Distinguishing Features') +
            field('tattoos', 'Tattoos / Markings') +
            '<div class="character-tab-actions">' +
                '<button type="button" class="character-tab-btn-small" ' +
                    'data-action="randomize-appearance">' +
                    'Randomize Appearance' +
                '</button>' +
            '</div>';
    }

    // =========================================================================
    // 11. SECTION 7 — NOTES
    // =========================================================================

    function _bodyNotes(model) {
        return '<textarea data-field="notes" class="character-tab-input" rows="6">' +
            _esc(model.notes || '') +
        '</textarea>';
    }

    // =========================================================================
    // 12. RENDER
    // =========================================================================

    function renderIdentityTab(container, context) {
        if (!container) return;
        if (!context || !_hasId(context.characterId)) {
            container.innerHTML = _empty('No character selected.');
            return;
        }

        var VM = window.CharacterViewModels;
        if (!VM || typeof VM.buildIdentityModel !== 'function') {
            container.innerHTML = _unavailable(
                'CharacterViewModels is not loaded; cannot render Identity tab.'
            );
            return;
        }

        var model;
        try { model = VM.buildIdentityModel(context.characterId); }
        catch (e) { model = null; }

        if (!model) {
            container.innerHTML = _unavailable('Character could not be loaded.');
            return;
        }

        var summary = context.character || {};
        var body = '';

        body += _sectionHtml(SECTIONS[0], _bodyNameAndTitle(model, summary));
        body += _sectionHtml(SECTIONS[1], _bodySurnameHistory(model));
        body += _sectionHtml(SECTIONS[2], _bodyReligionHistory(model));
        body += _sectionHtml(SECTIONS[3], _bodyBirthDeath(model, summary));
        body += _sectionHtml(SECTIONS[4], _bodyRanks(model, context.characterId));
        body += _sectionHtml(SECTIONS[5], _bodyAppearance(model));
        body += _sectionHtml(SECTIONS[6], _bodyNotes(model));

        // Save bar (dirty tracking).
        body += '<div class="character-tab-savebar">' +
            '<button type="button" class="character-tab-btn primary" ' +
                'data-action="save-all" disabled>' +
                'Save Changes' +
            '</button>' +
            '<button type="button" class="character-tab-btn" ' +
                'data-action="reset-form" disabled>' +
                'Reset' +
            '</button>' +
            '<span class="character-tab-dirty-note" data-dirty-note></span>' +
        '</div>';

        container.innerHTML = body;
        _wire(container, model, context.characterId, summary);
    }

    // =========================================================================
    // 13. WIRING
    // =========================================================================

    function _wire(container, model, characterId, summary) {
        // Collapsible headers.
        var headers = container.querySelectorAll('.character-tab-section__header');
        for (var i = 0; i < headers.length; i++) {
            headers[i].addEventListener('click', _onToggleSection);
        }

        // Delegated click handler for actions.
        container.addEventListener('click', function (e) {
            var btn = e.target.closest('[data-action]');
            if (!btn || !container.contains(btn)) return;
            var action = btn.getAttribute('data-action');
            if (!action) return;

            if (action === 'toggle-section') return; // handled above
            if (btn.disabled) return;
            e.preventDefault();

            _dispatchAction(action, btn, container, model, characterId, summary);
        });

        // Dirty tracking.
        _wireDirtyTracking(container, model);

        // Full-name preview update.
        _wireFullNamePreview(container);
    }

    function _onToggleSection(e) {
        var btn = e.currentTarget;
        if (!btn) return;
        var key = btn.getAttribute('data-section-key');
        if (!_hasId(key)) return;
        var section = btn.parentNode;
        if (!section) return;
        var isExpanded = section.classList.contains('is-expanded');
        if (isExpanded) {
            section.classList.remove('is-expanded');
            btn.setAttribute('aria-expanded', 'false');
            var icon = btn.querySelector('.character-tab-section__toggle');
            if (icon) icon.textContent = '\u25B6';
            _setCollapsed(key, true);
        } else {
            section.classList.add('is-expanded');
            btn.setAttribute('aria-expanded', 'true');
            var icon2 = btn.querySelector('.character-tab-section__toggle');
            if (icon2) icon2.textContent = '\u25BC';
            _setCollapsed(key, false);
        }
    }

    function _wireDirtyTracking(container, model) {
        var saveBtn = container.querySelector('[data-action="save-all"]');
        var resetBtn = container.querySelector('[data-action="reset-form"]');
        var note = container.querySelector('[data-dirty-note]');

        function setDirty(dirty) {
            if (saveBtn) saveBtn.disabled = !dirty;
            if (resetBtn) resetBtn.disabled = !dirty;
            if (note) note.textContent = dirty ? 'Unsaved changes' : '';
        }

        // Snapshot the values.
        var initial = _captureFormValues(container);
        container.__characterTabInitial = initial;

        function check() {
            var now = _captureFormValues(container);
            var changed = _formValuesChanged(initial, now);
            setDirty(changed);
        }

        container.addEventListener('input', check);
        container.addEventListener('change', check);
    }

    function _captureFormValues(container) {
        var out = {};
        var inputs = container.querySelectorAll('input[data-field], select[data-field], textarea[data-field]');
        for (var i = 0; i < inputs.length; i++) {
            var el = inputs[i];
            var key = el.getAttribute('data-field');
            if (!key) continue;
            if (key === 'random-source-culture') {
                out[key] = el.checked === true;
            } else {
                out[key] = el.value;
            }
        }
        // Traits (checkbox grid).
        var traits = [];
        var checks = container.querySelectorAll('input[data-trait]');
        for (var j = 0; j < checks.length; j++) {
            if (checks[j].checked === true) {
                traits.push(checks[j].getAttribute('data-trait'));
            }
        }
        traits.sort();
        out.__traits = traits.join(',');
        return out;
    }

    function _formValuesChanged(a, b) {
        var ka = Object.keys(a);
        for (var i = 0; i < ka.length; i++) {
            var k = ka[i];
            if (a[k] !== b[k]) return true;
        }
        // Check keys in b that aren't in a (defensive).
        var kb = Object.keys(b);
        for (var j = 0; j < kb.length; j++) {
            if (kb[j] === '__traits') continue;
            if (!Object.prototype.hasOwnProperty.call(a, kb[j])) {
                if (b[kb[j]] !== '' && b[kb[j]] !== false) return true;
            }
        }
        return false;
    }

    function _wireFullNamePreview(container) {
        var first = container.querySelector('input[data-field="firstName"]');
        var surname = container.querySelector('input[data-field="surname"]');
        var preview = container.querySelector('[data-preview="full-name"]');
        if (!first || !preview) return;

        function update() {
            var name = (first.value || '').trim();
            var s = surname ? (surname.value || '').trim() : '';
            preview.textContent = (name + ' ' + s).trim() || name;
        }

        first.addEventListener('input', update);
        if (surname) surname.addEventListener('input', update);
    }

    // =========================================================================
    // 14. ACTION DISPATCH
    // =========================================================================

    function _dispatchAction(action, btn, container, model, characterId, summary) {
        switch (action) {
            case 'random-first-name':
                _onRandomFirstName(container, characterId, summary); return;
            case 'random-surname':
                _onRandomSurname(container, characterId, summary); return;
            case 'random-epithet':
                _onRandomEpithet(container); return;
            case 'randomize-traits':
                _onRandomizeTraits(container); return;
            case 'clear-traits':
                _onClearTraits(container); return;
            case 'randomize-appearance':
                _onRandomizeAppearance(container); return;
            case 'save-all':
                _onSaveAll(container, model, characterId, summary); return;
            case 'reset-form':
                _onResetForm(container); return;

            case 'save-birth-surname':
                _onSaveBirthSurname(container, model, characterId); return;
            case 'add-surname-change':
                _onAddSurnameChange(container, model, characterId); return;
            case 'revert-surname-change':
                _onRevertSurnameChange(container, model, characterId); return;
            case 'edit-surname-entry':
                _onEditSurnameEntry(container, model, characterId, btn); return;
            case 'delete-surname-entry':
                _onDeleteSurnameEntry(container, model, characterId, btn); return;

            case 'edit-religion-entry':
                _onEditReligionEntry(container, model, characterId, btn); return;
            case 'delete-religion-entry':
                _onDeleteReligionEntry(container, model, characterId, btn); return;

            case 'add-rank':
                _onAddRank(container, model, characterId); return;
            case 'edit-rank':
                _onEditRank(container, model, characterId, btn); return;
            case 'set-active-rank':
                _onSetActiveRank(container, model, characterId, btn); return;
            case 'deprecate-rank':
                _onDeprecateRank(container, model, characterId, btn); return;
            case 'remove-rank':
                _onRemoveRank(container, model, characterId, btn); return;

            case 'kill-character':
                _onKill(characterId); return;
            case 'delete-character':
                _onDeleteCharacter(characterId); return;

            default:
                if (typeof console !== 'undefined' && console.warn) {
                    console.warn('[identity-tab] unknown action: ' + action);
                }
        }
    }

    // =========================================================================
    // 15. ACTION IMPLEMENTATIONS — NAME & TITLE RANDOM
    // =========================================================================

    function _onRandomFirstName(container, characterId, summary) {
        var input = container.querySelector('input[data-field="firstName"]');
        if (!input) return;
        input.value = _randomFirstName(characterId, summary);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function _onRandomSurname(container, characterId, summary) {
        var input = container.querySelector('input[data-field="surname"]');
        if (!input) return;
        input.value = _randomSurname(characterId, summary);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function _onRandomEpithet(container) {
        var input = container.querySelector('input[data-field="epithet"]');
        if (!input) return;
        input.value = _randomEpithet();
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function _onRandomizeTraits(container) {
        var values = Array.isArray(window.CHARACTER_TRAIT_VALUES)
            ? window.CHARACTER_TRAIT_VALUES
            : [];
        if (values.length === 0) {
            _toast('Trait vocabulary is not loaded.', 'error');
            return;
        }

        var pool = values.slice();
        var picked = [];
        var count = Math.min(3, pool.length);
        for (var i = 0; i < count; i++) {
            var idx = Math.floor(Math.random() * pool.length);
            picked.push(pool[idx]);
            pool.splice(idx, 1);
        }

        var checks = container.querySelectorAll('input[data-trait]');
        for (var j = 0; j < checks.length; j++) {
            var t = checks[j].getAttribute('data-trait');
            checks[j].checked = picked.indexOf(t) !== -1;
        }
        checks[0] && checks[0].dispatchEvent(new Event('change', { bubbles: true }));
    }

    function _onClearTraits(container) {
        var checks = container.querySelectorAll('input[data-trait]');
        for (var i = 0; i < checks.length; i++) {
            checks[i].checked = false;
        }
        checks[0] && checks[0].dispatchEvent(new Event('change', { bubbles: true }));
    }

    function _onRandomizeAppearance(container) {
        var arrays = {
            hairColor: ['Black', 'Brown', 'Blonde', 'Red', 'Auburn', 'Grey', 'White'],
            eyeColor: ['Brown', 'Blue', 'Green', 'Hazel', 'Grey', 'Amber'],
            skinTone: ['Fair', 'Light', 'Olive', 'Tan', 'Brown', 'Dark'],
            build: ['Slight', 'Average', 'Athletic', 'Sturdy', 'Heavy', 'Willowy'],
            height: ['Short', 'Average', 'Tall', 'Very Tall'],
            distinguishingFeatures: ['None', 'Scar on cheek', 'Birthmark', 'Freckles', 'Missing tooth', 'Pierced ears'],
            tattoos: ['None', 'Tribal tattoo on arm', 'Dragon tattoo on back', 'Anchor tattoo', 'Cross tattoo']
        };
        Object.keys(arrays).forEach(function (key) {
            var input = container.querySelector(
                'input[data-field="appearance.' + key + '"]'
            );
            if (!input) return;
            input.value = _pickRandom(arrays[key]) || '';
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
    }

    // =========================================================================
    // 16. ACTION IMPLEMENTATIONS — SAVE ALL
    // =========================================================================

    function _onSaveAll(container, model, characterId, summary) {
        var CC = _commands();
        if (!CC) {
            _toast('Command layer is not loaded.', 'error');
            return;
        }

        var errors = [];

        // ---- Collect values.
        function val(sel) {
            var el = container.querySelector(sel);
            return el ? el.value : '';
        }
        function checked(sel) {
            var el = container.querySelector(sel);
            return el ? el.checked === true : false;
        }

        var newFirstName = val('input[data-field="firstName"]').trim();
        var newSurname = val('input[data-field="surname"]');
        var newSurnameSource = val('select[data-field="surnameSource"]');
        var newEpithet = val('input[data-field="epithet"]');
        var newGender = val('select[data-field="gender"]');
        var newCultureId = container.querySelector('select[data-field="cultureId"]')
            ? val('select[data-field="cultureId"]')
            : null;
        var newReligionId = container.querySelector('select[data-field="religionId"]')
            ? val('select[data-field="religionId"]')
            : null;
        var newBirthYearRaw = val('input[data-field="birthYear"]');
        var newBirthplaceId = container.querySelector('select[data-field="birthplaceId"]')
            ? val('select[data-field="birthplaceId"]')
            : null;
        var newDeathYearRaw = val('input[data-field="deathYear"]');
        var newDeathCause = val('select[data-field="deathCause"]');
        var newDeathCauseDetail = val('input[data-field="deathCauseDetail"]');
        var newDeathNotes = val('textarea[data-field="deathNotes"]');
        var newNotes = val('textarea[data-field="notes"]');

        var appearance = {
            hairColor: val('input[data-field="appearance.hairColor"]'),
            eyeColor: val('input[data-field="appearance.eyeColor"]'),
            skinTone: val('input[data-field="appearance.skinTone"]'),
            build: val('input[data-field="appearance.build"]'),
            height: val('input[data-field="appearance.height"]'),
            distinguishingFeatures: val('input[data-field="appearance.distinguishingFeatures"]'),
            tattoos: val('input[data-field="appearance.tattoos"]')
        };

        // Traits — delta against the loaded model.
        var loadedTraits = (model.identity && Array.isArray(model.identity.traits))
            ? model.identity.traits.slice() : [];
        var loadedTraitsSet = {};
        for (var lt = 0; lt < loadedTraits.length; lt++) loadedTraitsSet[loadedTraits[lt]] = true;

        var newTraits = [];
        var checks = container.querySelectorAll('input[data-trait]');
        for (var tc = 0; tc < checks.length; tc++) {
            if (checks[tc].checked === true) {
                newTraits.push(checks[tc].getAttribute('data-trait'));
            }
        }
        var newTraitsSet = {};
        for (var nt = 0; nt < newTraits.length; nt++) newTraitsSet[newTraits[nt]] = true;

        var traitsToAdd = newTraits.filter(function (t) { return !loadedTraitsSet[t]; });
        var traitsToRemove = loadedTraits.filter(function (t) { return !newTraitsSet[t]; });

        // Religion — only if changed.
        var loadedReligionId = (model.identity && model.identity.religionId) || null;
        var religionChanged = false;
        if (newReligionId !== null) {
            var resolvedNewReligion = _hasId(newReligionId) ? newReligionId : null;
            if (resolvedNewReligion !== loadedReligionId) religionChanged = true;
        }

        // ---- Step 1: Trait delta.
        for (var ta = 0; ta < traitsToAdd.length; ta++) {
            var r = CC.addTrait(characterId, traitsToAdd[ta]);
            if (!r || r.success !== true) {
                errors.push('Add trait "' + traitsToAdd[ta] + '": ' +
                    (r && r.reason ? r.reason : 'unknown'));
            }
        }
        for (var tr = 0; tr < traitsToRemove.length; tr++) {
            var rr = CC.removeTrait(characterId, traitsToRemove[tr]);
            if (!rr || rr.success !== true) {
                errors.push('Remove trait "' + traitsToRemove[tr] + '": ' +
                    (rr && rr.reason ? rr.reason : 'unknown'));
            }
        }

        // ---- Step 2: Religion change.
        if (religionChanged) {
            if (_hasId(newReligionId)) {
                var relResult = CC.assignCharacterReligion(characterId, newReligionId, {
                    year: _currentYear(),
                    reason: 'personal',
                    notes: ''
                });
                if (!relResult || relResult.success !== true) {
                    errors.push('Change religion: ' +
                        (relResult && relResult.reason ? relResult.reason : 'unknown'));
                }
            } else {
                var remRel = CC.removeCharacterReligion(characterId);
                if (!remRel || remRel.success !== true) {
                    errors.push('Remove religion: ' +
                        (remRel && remRel.reason ? remRel.reason : 'unknown'));
                }
            }
        }

        // ---- Step 3: Character-owned field patch.
        var patch = {};

        if (model.identity) {
            if (newFirstName !== (model.identity.firstName || '')) {
                if (newFirstName === '') {
                    errors.push('First name cannot be empty.');
                } else {
                    patch.name = newFirstName;
                }
            }
            if (newSurname !== (model.identity.surname || '')) {
                patch.surname = newSurname;
            }
            if (newSurnameSource !== (model.identity.surnameSource || 'custom')) {
                patch.surnameSource = newSurnameSource;
            }
            if (newEpithet !== (model.identity.epithet || '')) {
                patch.epithet = newEpithet;
            }
            if (newGender !== (model.identity.gender || 'unknown')) {
                patch.gender = newGender;
            }
        }

        if (newCultureId !== null) {
            var loadedCultureId = (model.identity && model.identity.cultureId) || null;
            var resolvedNewCulture = _hasId(newCultureId) ? newCultureId : null;
            if (resolvedNewCulture !== loadedCultureId) {
                patch.cultureId = resolvedNewCulture;
            }
        }

        if (model.birth) {
            var loadedBirthYear = model.birth.year;
            var resolvedBirthYear = newBirthYearRaw === ''
                ? null
                : parseInt(newBirthYearRaw, 10);
            if (!Number.isInteger(resolvedBirthYear) && resolvedBirthYear !== null) {
                errors.push('Birth year must be a whole number.');
            } else if (resolvedBirthYear !== loadedBirthYear) {
                if (resolvedBirthYear !== null && !window.isValidYear(resolvedBirthYear)) {
                    errors.push('Birth year is not a valid world year.');
                } else {
                    patch.birthYear = resolvedBirthYear;
                }
            }
            if (newBirthplaceId !== null) {
                var resolvedBirthplace = _hasId(newBirthplaceId) ? newBirthplaceId : null;
                if (resolvedBirthplace !== (model.birth.placeId || null)) {
                    patch.birthplaceId = resolvedBirthplace;
                }
            }
        }

        if (model.death && model.death.isDeceased === true) {
            var loadedDeathYear = model.death.year;
            var resolvedDeathYear = newDeathYearRaw === ''
                ? null : parseInt(newDeathYearRaw, 10);
            if (!Number.isInteger(resolvedDeathYear) && resolvedDeathYear !== null) {
                errors.push('Death year must be a whole number.');
            } else if (resolvedDeathYear !== loadedDeathYear) {
                if (resolvedDeathYear !== null && !window.isValidYear(resolvedDeathYear)) {
                    errors.push('Death year is not a valid world year.');
                } else {
                    patch.deathYear = resolvedDeathYear;
                }
            }
            if (newDeathCause !== (model.death.cause || '')) {
                patch.deathCause = newDeathCause;
            }
            if (newDeathCauseDetail !== (model.death.causeDetail || '')) {
                patch.deathCauseDetail = newDeathCauseDetail;
            }
            if (newDeathNotes !== (model.death.notes || '')) {
                patch.deathNotes = newDeathNotes;
            }
        }

        // Appearance — compare as a whole object.
        if (model.appearance) {
            var appearanceChanged = false;
            var keys = ['hairColor', 'eyeColor', 'skinTone', 'build', 'height',
                        'distinguishingFeatures', 'tattoos'];
            for (var ak = 0; ak < keys.length; ak++) {
                var k = keys[ak];
                if ((appearance[k] || '') !== (model.appearance[k] || '')) {
                    appearanceChanged = true;
                    break;
                }
            }
            if (appearanceChanged) patch.appearance = appearance;
        }

        if (newNotes !== (model.notes || '')) {
            patch.notes = newNotes;
        }

        if (Object.keys(patch).length > 0) {
            var upd = CC.updateCharacter(characterId, patch);
            if (!upd || upd.success !== true) {
                errors.push('Field update: ' +
                    (upd && upd.reason ? upd.reason : 'unknown'));
            }
        }

        // ---- Report.
        if (errors.length > 0) {
            _toast('Save failed: ' + errors.join('; '), 'error');
        } else {
            _toast('Saved.', 'success');
            _refresh();
        }
    }

    function _onResetForm(container) {
        var initial = container.__characterTabInitial;
        if (!initial) return;

        var inputs = container.querySelectorAll('input[data-field], select[data-field], textarea[data-field]');
        for (var i = 0; i < inputs.length; i++) {
            var el = inputs[i];
            var key = el.getAttribute('data-field');
            if (!key) continue;
            if (!Object.prototype.hasOwnProperty.call(initial, key)) continue;
            if (key === 'random-source-culture') {
                el.checked = initial[key] === true;
            } else {
                el.value = initial[key];
            }
        }

        var checks = container.querySelectorAll('input[data-trait]');
        var set = {};
        (initial.__traits || '').split(',').forEach(function (t) {
            if (t) set[t] = true;
        });
        for (var j = 0; j < checks.length; j++) {
            checks[j].checked = set[checks[j].getAttribute('data-trait')] === true;
        }

        var saveBtn = container.querySelector('[data-action="save-all"]');
        if (saveBtn) saveBtn.disabled = true;
        var resetBtn = container.querySelector('[data-action="reset-form"]');
        if (resetBtn) resetBtn.disabled = true;
        var note = container.querySelector('[data-dirty-note]');
        if (note) note.textContent = '';

        _toast('Form reset to last-saved state.', 'info');
    }

    // =========================================================================
    // 17. ACTION IMPLEMENTATIONS — SURNAME HISTORY
    // =========================================================================

    function _onSaveBirthSurname(container, model, characterId) {
        var CC = _commands();
        if (!CC) { _toast('Command layer is not loaded.', 'error'); return; }

        var input = container.querySelector('input[data-field="birthSurname"]');
        if (!input) return;

        var newSurname = input.value || '';
        var current = (model.surnameHistory && model.surnameHistory.birthSurname) || '';
        if (newSurname === current) { _toast('No change.', 'info'); return; }

        var r = CC.updateBirthSurname(characterId, newSurname);
        if (!r || r.success !== true) {
            _toast('Failed to update birth surname: ' +
                (r && r.reason ? r.reason : 'unknown'), 'error');
            return;
        }
        _toast('Birth surname updated.', 'success');
        _refresh();
    }

    function _onAddSurnameChange(container, model, characterId) {
        var CC = _commands();
        if (!CC) { _toast('Command layer is not loaded.', 'error'); return; }
        if (typeof window.openModal !== 'function') {
            _toast('Modal system is not loaded.', 'error'); return;
        }

        var currentSurname = (model.identity && model.identity.surname) || '';
        var content = '' +
            '<div class="character-tab-field">' +
                '<label class="character-tab-field__label">New Surname</label>' +
                '<input type="text" id="tab-sc-surname" class="character-tab-input" ' +
                    'value="' + _esc(currentSurname) + '" autocomplete="off">' +
            '</div>' +
            '<div class="character-tab-field">' +
                '<label class="character-tab-field__label">Year</label>' +
                '<input type="number" id="tab-sc-year" class="character-tab-input" ' +
                    'value="' + _currentYear() + '" min="1">' +
            '</div>' +
            '<div class="character-tab-field">' +
                '<label class="character-tab-field__label">Reason</label>' +
                '<select id="tab-sc-reason" class="character-tab-input">' +
                    '<option value="custom">Custom</option>' +
                    '<option value="marriage">Marriage</option>' +
                    '<option value="divorce">Divorce</option>' +
                    '<option value="adoption">Adoption</option>' +
                    '<option value="rank">Rank Change</option>' +
                '</select>' +
            '</div>' +
            '<div class="character-tab-field">' +
                '<label class="character-tab-field__label">Notes</label>' +
                '<textarea id="tab-sc-notes" class="character-tab-input" rows="2"></textarea>' +
            '</div>';

        window.openModal({
            titleHtml: 'Add Surname Change',
            contentHtml: content,
            confirmText: 'Add',
            cancelText: 'Cancel',
            onConfirm: function (modalEl) {
                var s = modalEl.querySelector('#tab-sc-surname').value.trim();
                var y = parseInt(modalEl.querySelector('#tab-sc-year').value, 10);
                var reason = modalEl.querySelector('#tab-sc-reason').value;
                var notes = modalEl.querySelector('#tab-sc-notes').value;

                if (!s) { _toast('New surname is required.', 'error'); return false; }
                if (!Number.isInteger(y) || !window.isValidYear(y)) {
                    _toast('Invalid year.', 'error'); return false;
                }
                var r = CC.recordCharacterSurnameChange(characterId, s, y, reason, { notes: notes });
                if (!r || r.success !== true) {
                    _toast('Failed: ' + (r && r.reason ? r.reason : 'unknown'), 'error');
                    return false;
                }
                _toast('Surname change added.', 'success');
                _refresh();
            }
        });
    }

    function _onRevertSurnameChange(container, model, characterId) {
        var CC = _commands();
        if (!CC) { _toast('Command layer is not loaded.', 'error'); return; }
        if (!window.confirm('Revert the last surname change?')) return;

        var r = CC.revertCharacterSurnameChange(characterId);
        if (!r || r.success !== true) {
            _toast('Failed: ' + (r && r.reason ? r.reason : 'unknown'), 'error');
            return;
        }
        _toast('Surname change reverted.', 'success');
        _refresh();
    }

    function _onEditSurnameEntry(container, model, characterId, btn) {
        var CC = _commands();
        if (!CC) { _toast('Command layer is not loaded.', 'error'); return; }
        if (typeof window.openModal !== 'function') {
            _toast('Modal system is not loaded.', 'error'); return;
        }

        var idx = parseInt(btn.getAttribute('data-history-index'), 10);
        if (!Number.isInteger(idx)) return;

        var entry = model.surnameHistory && model.surnameHistory.entries[idx];
        if (!entry) { _toast('Entry not found.', 'error'); return; }

        var content = '' +
            '<div class="character-tab-field">' +
                '<label class="character-tab-field__label">Surname</label>' +
                '<input type="text" id="tab-se-surname" class="character-tab-input" ' +
                    'value="' + _esc(entry.surname || '') + '" autocomplete="off">' +
            '</div>' +
            '<div class="character-tab-field">' +
                '<label class="character-tab-field__label">Year</label>' +
                '<input type="number" id="tab-se-year" class="character-tab-input" ' +
                    'value="' + (entry.year !== null ? _esc(entry.year) : '') + '" min="1">' +
            '</div>' +
            '<div class="character-tab-field">' +
                '<label class="character-tab-field__label">Reason</label>' +
                '<select id="tab-se-reason" class="character-tab-input">' +
                    ['custom','marriage','divorce','adoption','rank'].map(function (r) {
                        return '<option value="' + r + '"' +
                            (entry.reason === r ? ' selected' : '') + '>' +
                            r.charAt(0).toUpperCase() + r.slice(1) + '</option>';
                    }).join('') +
                '</select>' +
            '</div>' +
            '<div class="character-tab-field">' +
                '<label class="character-tab-field__label">Notes</label>' +
                '<textarea id="tab-se-notes" class="character-tab-input" rows="2">' +
                    _esc(entry.notes || '') +
                '</textarea>' +
            '</div>';

        window.openModal({
            titleHtml: 'Edit Surname Change',
            contentHtml: content,
            confirmText: 'Save',
            cancelText: 'Cancel',
            onConfirm: function (modalEl) {
                var s = modalEl.querySelector('#tab-se-surname').value.trim();
                var yRaw = modalEl.querySelector('#tab-se-year').value;
                var y = yRaw === '' ? null : parseInt(yRaw, 10);
                var reason = modalEl.querySelector('#tab-se-reason').value;
                var notes = modalEl.querySelector('#tab-se-notes').value;

                if (!s) { _toast('Surname is required.', 'error'); return false; }

                var patch = { surname: s, reason: reason, notes: notes };
                if (y !== null) {
                    if (!Number.isInteger(y) || !window.isValidYear(y)) {
                        _toast('Invalid year.', 'error'); return false;
                    }
                    patch.year = y;
                }

                var r = CC.updateSurnameChangeEntry(characterId, idx, patch);
                if (!r || r.success !== true) {
                    _toast('Failed: ' + (r && r.reason ? r.reason : 'unknown'), 'error');
                    return false;
                }
                _toast('Surname change updated.', 'success');
                _refresh();
            }
        });
    }

    function _onDeleteSurnameEntry(container, model, characterId, btn) {
        var CC = _commands();
        if (!CC) { _toast('Command layer is not loaded.', 'error'); return; }

        var idx = parseInt(btn.getAttribute('data-history-index'), 10);
        if (!Number.isInteger(idx)) return;
        if (!window.confirm('Delete this surname-change entry?')) return;

        var r = CC.deleteSurnameChangeEntry(characterId, idx);
        if (!r || r.success !== true) {
            _toast('Failed: ' + (r && r.reason ? r.reason : 'unknown'), 'error');
            return;
        }
        if (r.surnameReverted) {
            _toast('Entry deleted; surname reverted to ' + (r.newSurname || '(empty)') + '.', 'success');
        } else {
            _toast('Entry deleted.', 'success');
        }
        _refresh();
    }

    // =========================================================================
    // 18. ACTION IMPLEMENTATIONS — RELIGION HISTORY
    // =========================================================================

    function _onEditReligionEntry(container, model, characterId, btn) {
        var CC = _commands();
        if (!CC) { _toast('Command layer is not loaded.', 'error'); return; }
        if (typeof window.openModal !== 'function') {
            _toast('Modal system is not loaded.', 'error'); return;
        }

        var idx = parseInt(btn.getAttribute('data-history-index'), 10);
        if (!Number.isInteger(idx)) return;

        var entry = model.religionHistory && model.religionHistory.entries[idx];
        if (!entry) { _toast('Entry not found.', 'error'); return; }

        var content = '' +
            '<div class="character-tab-field">' +
                '<label class="character-tab-field__label">Year</label>' +
                '<input type="number" id="tab-re-year" class="character-tab-input" ' +
                    'value="' + (entry.year !== null ? _esc(entry.year) : '') + '" min="1">' +
            '</div>' +
            '<div class="character-tab-field">' +
                '<label class="character-tab-field__label">Reason</label>' +
                '<input type="text" id="tab-re-reason" class="character-tab-input" ' +
                    'value="' + _esc(entry.reason || '') + '" autocomplete="off">' +
            '</div>' +
            '<div class="character-tab-field">' +
                '<label class="character-tab-field__label">Notes</label>' +
                '<textarea id="tab-re-notes" class="character-tab-input" rows="2">' +
                    _esc(entry.notes || '') +
                '</textarea>' +
            '</div>' +
            '<div class="character-tab-note">' +
                'The from/to religions are not editable. To change the current ' +
                'religion, use the Religion field in Name & Title.' +
            '</div>';

        window.openModal({
            titleHtml: 'Edit Religion History Entry',
            contentHtml: content,
            confirmText: 'Save',
            cancelText: 'Cancel',
            onConfirm: function (modalEl) {
                var yRaw = modalEl.querySelector('#tab-re-year').value;
                var y = yRaw === '' ? null : parseInt(yRaw, 10);
                var reason = modalEl.querySelector('#tab-re-reason').value;
                var notes = modalEl.querySelector('#tab-re-notes').value;

                var patch = { reason: reason, notes: notes };
                if (y !== null) {
                    if (!Number.isInteger(y) || !window.isValidYear(y)) {
                        _toast('Invalid year.', 'error'); return false;
                    }
                    patch.year = y;
                }

                var r = CC.updateReligionHistoryEntry(characterId, idx, patch);
                if (!r || r.success !== true) {
                    _toast('Failed: ' + (r && r.reason ? r.reason : 'unknown'), 'error');
                    return false;
                }
                _toast('Religion history updated.', 'success');
                _refresh();
            }
        });
    }

    function _onDeleteReligionEntry(container, model, characterId, btn) {
        var CC = _commands();
        if (!CC) { _toast('Command layer is not loaded.', 'error'); return; }

        var idx = parseInt(btn.getAttribute('data-history-index'), 10);
        if (!Number.isInteger(idx)) return;
        if (!window.confirm('Delete this religion-history entry?')) return;

        var r = CC.deleteReligionHistoryEntry(characterId, idx);
        if (!r || r.success !== true) {
            _toast('Failed: ' + (r && r.reason ? r.reason : 'unknown'), 'error');
            return;
        }
        _toast('Religion history entry deleted.', 'success');
        _refresh();
    }

    // =========================================================================
    // 19. ACTION IMPLEMENTATIONS — RANKS
    // =========================================================================

    function _onAddRank(container, model, characterId) {
        var CC = _commands();
        if (!CC) { _toast('Command layer is not loaded.', 'error'); return; }
        if (typeof window.openModal !== 'function') {
            _toast('Modal system is not loaded.', 'error'); return;
        }

        var allRanks = [];
        if (typeof window.getRanks === 'function') {
            try { allRanks = window.getRanks() || []; }
            catch (e) { allRanks = []; }
        }

        var assignedIds = {};
        if (model.ranks) {
            var allAssigned = (model.ranks.current || []).concat(model.ranks.former || []);
            for (var i = 0; i < allAssigned.length; i++) {
                assignedIds[allAssigned[i].rankId] = true;
            }
        }

        var available = [];
        for (var j = 0; j < allRanks.length; j++) {
            var r = allRanks[j];
            if (!r || !r.id) continue;
            if (assignedIds[r.id] === true) continue;
            available.push(r);
        }

        var rankControl;
        if (available.length > 0) {
            var opts = '<option value="">— Select —</option>';
            for (var k = 0; k < available.length; k++) {
                var av = available[k];
                opts += '<option value="' + _esc(av.id) + '">' +
                    _esc(av.name || av.id) + '</option>';
            }
            rankControl = '<select id="tab-ar-rank" class="character-tab-input">' +
                opts + '</select>';
        } else {
            rankControl = '<input type="text" id="tab-ar-rank" ' +
                'class="character-tab-input" ' +
                'placeholder="rank id (rank domain not loaded)" autocomplete="off">';
        }

        var content = '' +
            '<div class="character-tab-field">' +
                '<label class="character-tab-field__label">Rank</label>' +
                rankControl +
            '</div>' +
            '<div class="character-tab-field">' +
                '<label class="character-tab-field__label">Custom Title</label>' +
                '<input type="text" id="tab-ar-title" class="character-tab-input" autocomplete="off">' +
            '</div>' +
            '<div class="character-tab-field">' +
                '<label class="character-tab-field__label">Address</label>' +
                '<input type="text" id="tab-ar-address" class="character-tab-input" autocomplete="off">' +
            '</div>' +
            '<div class="character-tab-field">' +
                '<label class="character-tab-field__label">Number Display</label>' +
                '<input type="text" id="tab-ar-number" class="character-tab-input" autocomplete="off">' +
            '</div>' +
            '<div class="character-tab-field">' +
                '<label class="character-tab-field__label">Order (lower = higher priority)</label>' +
                '<input type="number" id="tab-ar-order" class="character-tab-input" value="10" min="1" max="999">' +
            '</div>' +
            '<div class="character-tab-field">' +
                '<label class="character-tab-field__label">Notes</label>' +
                '<textarea id="tab-ar-notes" class="character-tab-input" rows="2"></textarea>' +
            '</div>';

        window.openModal({
            titleHtml: 'Add Rank',
            contentHtml: content,
            confirmText: 'Add',
            cancelText: 'Cancel',
            onConfirm: function (modalEl) {
                var rankId = modalEl.querySelector('#tab-ar-rank').value.trim();
                if (!rankId) { _toast('Rank is required.', 'error'); return false; }

                var title = modalEl.querySelector('#tab-ar-title').value;
                var address = modalEl.querySelector('#tab-ar-address').value;
                var numberStr = modalEl.querySelector('#tab-ar-number').value.trim();
                var order = parseInt(modalEl.querySelector('#tab-ar-order').value, 10);
                var notes = modalEl.querySelector('#tab-ar-notes').value;

                var numberObj = null;
                if (numberStr) {
                    var num = parseInt(numberStr, 10);
                    numberObj = isNaN(num)
                        ? { display: numberStr }
                        : { rawNumber: num, display: numberStr };
                }

                var r = CC.addRankAssignment(characterId, {
                    rankId: rankId,
                    customTitle: title || null,
                    address: address || null,
                    number: numberObj,
                    order: Number.isFinite(order) ? order : 10,
                    notes: notes || ''
                });
                if (!r || r.success !== true) {
                    _toast('Failed: ' + (r && r.reason ? r.reason : 'unknown'), 'error');
                    return false;
                }
                _toast('Rank added.', 'success');
                _refresh();
            }
        });
    }

    function _onEditRank(container, model, characterId, btn) {
        var CC = _commands();
        if (!CC) { _toast('Command layer is not loaded.', 'error'); return; }
        if (typeof window.openModal !== 'function') {
            _toast('Modal system is not loaded.', 'error'); return;
        }

        var rankId = btn.getAttribute('data-rank-id');
        if (!_hasId(rankId)) return;

        var a = null;
        if (model.ranks) {
            var list = [].concat(model.ranks.active ? [model.ranks.active] : [],
                                 model.ranks.current || [],
                                 model.ranks.former || []);
            for (var i = 0; i < list.length; i++) {
                if (list[i] && list[i].rankId === rankId) { a = list[i]; break; }
            }
        }
        if (!a) { _toast('Rank not found.', 'error'); return; }

        var numberDisplay = (a.number && a.number.display) || '';

        var content = '' +
            '<div class="character-tab-field">' +
                '<label class="character-tab-field__label">Rank</label>' +
                '<input type="text" class="character-tab-input" value="' +
                    _esc(a.rankName || a.rankId) + '" disabled>' +
            '</div>' +
            '<div class="character-tab-field">' +
                '<label class="character-tab-field__label">Custom Title</label>' +
                '<input type="text" id="tab-er-title" class="character-tab-input" ' +
                    'value="' + _esc(a.customTitle || '') + '" autocomplete="off">' +
            '</div>' +
            '<div class="character-tab-field">' +
                '<label class="character-tab-field__label">Address</label>' +
                '<input type="text" id="tab-er-address" class="character-tab-input" ' +
                    'value="' + _esc(a.address || '') + '" autocomplete="off">' +
            '</div>' +
            '<div class="character-tab-field">' +
                '<label class="character-tab-field__label">Number Display</label>' +
                '<input type="text" id="tab-er-number" class="character-tab-input" ' +
                    'value="' + _esc(numberDisplay) + '" autocomplete="off">' +
            '</div>' +
            '<div class="character-tab-field">' +
                '<label class="character-tab-field__label">Order</label>' +
                '<input type="number" id="tab-er-order" class="character-tab-input" ' +
                    'value="' + (a.order || 10) + '" min="1" max="999">' +
            '</div>' +
            '<div class="character-tab-field">' +
                '<label class="character-tab-field__label">Notes</label>' +
                '<textarea id="tab-er-notes" class="character-tab-input" rows="2">' +
                    _esc(a.notes || '') +
                '</textarea>' +
            '</div>';

        window.openModal({
            titleHtml: 'Edit Rank: ' + (a.rankName || a.rankId),
            contentHtml: content,
            confirmText: 'Save',
            cancelText: 'Cancel',
            onConfirm: function (modalEl) {
                var title = modalEl.querySelector('#tab-er-title').value;
                var address = modalEl.querySelector('#tab-er-address').value;
                var numberStr = modalEl.querySelector('#tab-er-number').value.trim();
                var order = parseInt(modalEl.querySelector('#tab-er-order').value, 10);
                var notes = modalEl.querySelector('#tab-er-notes').value;

                var numberObj = null;
                if (numberStr) {
                    var num = parseInt(numberStr, 10);
                    numberObj = isNaN(num)
                        ? { display: numberStr }
                        : { rawNumber: num, display: numberStr };
                }

                var patch = {
                    customTitle: title || null,
                    address: address || null,
                    number: numberObj,
                    order: Number.isFinite(order) ? order : 10,
                    notes: notes || ''
                };

                var r = CC.updateRankAssignment(characterId, rankId, patch);
                if (!r || r.success !== true) {
                    _toast('Failed: ' + (r && r.reason ? r.reason : 'unknown'), 'error');
                    return false;
                }
                _toast('Rank updated.', 'success');
                _refresh();
            }
        });
    }

    function _onSetActiveRank(container, model, characterId, btn) {
        var CC = _commands();
        if (!CC) { _toast('Command layer is not loaded.', 'error'); return; }
        var rankId = btn.getAttribute('data-rank-id');
        if (!_hasId(rankId)) return;
        var r = CC.setActiveRank(characterId, rankId);
        if (!r || r.success !== true) {
            _toast('Failed: ' + (r && r.reason ? r.reason : 'unknown'), 'error');
            return;
        }
        _toast('Active rank set.', 'success');
        _refresh();
    }

    function _onDeprecateRank(container, model, characterId, btn) {
        var CC = _commands();
        if (!CC) { _toast('Command layer is not loaded.', 'error'); return; }
        var rankId = btn.getAttribute('data-rank-id');
        if (!_hasId(rankId)) return;
        if (!window.confirm('Deprecate this rank? It will move to Former.')) return;
        var r = CC.deprecateRankAssignment(characterId, rankId);
        if (!r || r.success !== true) {
            _toast('Failed: ' + (r && r.reason ? r.reason : 'unknown'), 'error');
            return;
        }
        _toast('Rank deprecated.', 'success');
        _refresh();
    }

    function _onRemoveRank(container, model, characterId, btn) {
        var CC = _commands();
        if (!CC) { _toast('Command layer is not loaded.', 'error'); return; }
        var rankId = btn.getAttribute('data-rank-id');
        if (!_hasId(rankId)) return;
        if (!window.confirm('Remove this rank from the character?')) return;
        var r = CC.removeRankAssignment(characterId, rankId);
        if (!r || r.success !== true) {
            _toast('Failed: ' + (r && r.reason ? r.reason : 'unknown'), 'error');
            return;
        }
        _toast('Rank removed.', 'success');
        _refresh();
    }

    // =========================================================================
    // 20. ACTION IMPLEMENTATIONS — KILL / DELETE
    // =========================================================================

    function _onKill(characterId) {
        if (typeof window.openDeathModal !== 'function') {
            _toast('Death modal is not loaded.', 'error'); return;
        }
        var r = window.openDeathModal(characterId, function () {
            _refresh();
        });
        if (r && r.success === false) {
            _toast(r.reason || 'Death modal failed to open.', 'error');
        }
    }

    function _onDeleteCharacter(characterId) {
        if (typeof window.openDeleteCharacterModal !== 'function') {
            _toast('Delete modal is not loaded.', 'error'); return;
        }
        window.openDeleteCharacterModal(characterId, function () {
            // After deletion, the manager selection is invalid; the
            // bootstrap's CharacterState subscription will re-render
            // the sidebar and pick a new selection if one remains.
            _refresh();
        });
    }

    // =========================================================================
    // 21. REGISTRATION
    // =========================================================================

    if (window.TabManager && typeof window.TabManager.register === 'function') {
        window.TabManager.register(SCOPE, TAB_ID, renderIdentityTab);
    } else if (typeof console !== 'undefined' && console.warn) {
        console.warn(
            'character-identity-tab.js: TabManager is not available; ' +
            'the tab was not registered.'
        );
    }

    // =========================================================================
    // 22. EXPORTS
    // =========================================================================

    window.CharacterIdentityTab = {
        id: TAB_ID,
        render: renderIdentityTab
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CharacterIdentityTab;
    }
})();
