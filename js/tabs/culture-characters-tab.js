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
 * LOCATION RESOLUTION
 * -------------------
 * Current location is resolved via
 * CultureQueries.getCurrentLocationIdForCharacter(character), which
 * applies the documented precedence (LocationQueries semantic resolver
 * → CharacterQueries raw-field fallback → null). This tab used to carry
 * a private copy of the precedence chain; it has been removed because
 * the copy omitted the CharacterQueries fallback and drifted from the
 * query layer's behavior. All location reads in this tab go through
 * the query layer.
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
 *   - escapeHtml is a REQUIRED dependency (formatting.js). The silent
 *     fallback that lived in a previous revision has been removed;
 *     renderers do not implement their own escaping.
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

    // escapeHtml is a REQUIRED dependency of this tab (formatting.js). The
    // silent fallback that lived here in a previous revision diverged from
    // the other culture tabs' contract and from formatting.js's own
    // escaping policy. Renderers do not implement their own escaping.
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

    // Location resolution is owned by CultureQueries. Its public entry
    // point is getCurrentLocationIdForCharacter(character), which applies
    // the documented precedence (LocationQueries semantic resolver →
    // CharacterQueries raw-field fallback → null). This tab used to carry
    // its own copy; that copy omitted the CharacterQueries fallback, so it
    // disagreed with the query layer on bare test harnesses. Delegate.
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
        // Fallback path for a tree where culture-queries.js predates the
        // public resolver (should not happen; left for safe degradation
        // during the rollout).
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
