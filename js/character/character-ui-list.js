/**
 * =============================================================================
 * STILL WATERS - CHARACTER UI LIST (js/character/character-ui-list.js)
 * =============================================================================
 *
 * Rendering for character lists and character cards.
 *
 * SCOPE:
 *   - Rendering a list of characters into a container
 *   - Rendering a single character as a card (HTML string)
 *   - Delegated click handling for list rows
 *
 * OUT OF SCOPE:
 *   - Family semantics → FamilyAccessors / FamilyStatistics
 *   - Age calculation → time.js (via CharacterQueries)
 *   - Culture display → CultureQueries
 *   - Presentation CSS → the stylesheet (see character-ui.css)
 *   - Modal workflows → modals-character.js
 *   - Mutation → CharacterCommands
 *   - Persistence → storage.js
 *
 * SEMANTIC RULES:
 *   - This module does NOT compute domain values. It calls
 *     CharacterQueries for projections and renders them.
 *   - Presentation is owned by CSS. This module produces semantic markup
 *     with classes. It does NOT emit inline style attributes.
 *   - All strings interpolated into HTML are escaped, including
 *     appearance fields and any values returned by query projections.
 *   - Row interaction is delegated: one listener on the container, not
 *     one per row.
 *   - Rows are native buttons. They are keyboard-accessible by default.
 *   - The row-class option is additive. It never replaces the base class
 *     that event delegation depends on.
 *   - Optional lookups (culture badge) are gated on the caller's options
 *     BEFORE they run. A disabled feature does not execute its resolver.
 *
 * REQUIRED CSS:
 *   This module emits the following classes. The stylesheet must define
 *   them. See character-ui.css.
 *     .character-list
 *     .character-row
 *     .character-row__name
 *     .character-row__details
 *     .character-row__status
 *     .character-row--deceased
 *     .character-row__death-marker
 *     .character-row__culture-badge
 *     .character-empty-message
 *     .character-card
 *     .character-card__header
 *     .character-card__name
 *     .character-card__badges
 *     .character-card__status
 *     .character-card__culture-badge
 *     .character-card__grid
 *     .character-card__field
 *     .character-card__field-label
 *     .character-card__field-value
 *     .character-card__appearance
 *     .character-card__notes
 *
 * DEPENDENCIES (REQUIRED):
 *   - formatting.js (escapeHtml)
 *   - CharacterQueries (getCharacterSummary, searchCharacters)
 *   - character-system.js OR accessors.js (getCharacters)
 *
 * DEPENDENCIES (OPTIONAL):
 *   - CultureQueries.getCultureDisplay(cultureId) — for culture badges
 *     If absent, culture badges are omitted.
 *
 * ICON POLICY: Uses SVG from icons.js if available. No emojis. No Unicode
 * gender symbols.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision (Phase 1.7):
 *     - _requireDependencies accepts character-system.js or accessors.js
 *       as the provider of window.getCharacters. The previous message
 *       named only accessors.js, which was misleading after
 *       character-system.js became the canonical override.
 *     - _renderRow and renderCharacterCard check options.showCulture
 *       BEFORE calling _cultureBadgeText. Previously the culture
 *       display was resolved for every row even when the badge was
 *       disabled, which forced CultureQueries.getCultureDisplay to run
 *       unconditionally.
 *     - Header DEPENDENCIES updated: character-system.js is listed
 *       alongside accessors.js as the provider of getCharacters.
 *     - Header SEMANTIC RULES adds the "optional lookups are gated"
 *       clause.
 *     - No other behavioural change.
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. DEPENDENCY GUARDS
    // =========================================================================

    function _requireDependencies() {
        if (typeof window.escapeHtml !== 'function') {
            throw new Error(
                'character-ui-list.js: formatting.js must load first (escapeHtml missing).'
            );
        }
        if (typeof window.getCharacters !== 'function') {
            throw new Error(
                'character-ui-list.js: character-system.js (or accessors.js) ' +
                'must load first (getCharacters missing).'
            );
        }
        if (typeof window.CharacterQueries === 'undefined') {
            throw new Error(
                'character-ui-list.js: character-queries.js must load first.'
            );
        }
    }

    _requireDependencies();

    // =========================================================================
    // 1. INTERNAL HELPERS
    // =========================================================================

    function _esc(v) {
        return window.escapeHtml(v);
    }

    function _isMissing(v) {
        return v === undefined || v === null;
    }

    function _hasId(v) {
        return typeof v === 'string' && v.length > 0;
    }

    /**
     * Returns a display string for age, or the fallback string when null.
     */
    function _formatAge(age) {
        if (age === null || age === undefined) return 'Unknown age';
        if (typeof age !== 'number' || !Number.isFinite(age) || age < 0) return 'Unknown age';
        if (age === 0) return '<1y';
        return age + 'y';
    }

    /**
     * Resolves the culture badge text for a character, or ''.
     *
     * If CultureQueries is not loaded, returns ''. If the culture cannot
     * be resolved, returns ''. No fallback character or emoji.
     *
     * Callers MUST gate this on options.showCulture. The badge should
     * only be resolved when the badge will be rendered.
     */
    function _cultureBadgeText(cultureId) {
        if (!_hasId(cultureId)) return '';
        if (typeof window.CultureQueries === 'undefined') return '';
        if (typeof window.CultureQueries.getCultureDisplay !== 'function') return '';

        var display = window.CultureQueries.getCultureDisplay(cultureId);
        if (!display) return '';

        // Accept either a string or { name, icon }.
        if (typeof display === 'string') return display;
        if (typeof display === 'object') {
            var name = typeof display.name === 'string' ? display.name : '';
            return name;
        }
        return '';
    }

    // =========================================================================
    // 2. ROW RENDERING
    // =========================================================================

    /**
     * Builds one row's HTML.
     *
     * @param {Object} character
     * @param {Object} options - { showStatus, showLocation, showAge, showCulture }
     * @returns {string}
     */
    function _renderRow(character, options) {
        var summary = window.CharacterQueries.getCharacterSummary(character.id);
        if (!summary) return '';

        var rowClasses = ['character-row'];
        if (summary.isDeceased) rowClasses.push('character-row--deceased');
        if (!_isMissing(options.rowClass) && typeof options.rowClass === 'string') {
            rowClasses.push(options.rowClass);
        }

        var html = '';
        html += '<button type="button" class="' + rowClasses.join(' ') + '"'
             + ' data-action="select-character"'
             + ' data-character-id="' + _esc(character.id) + '"'
             + '>';

        // Name line
        html += '<span class="character-row__name">';
        html += _esc(summary.fullName || summary.name || 'Unnamed');
        if (summary.isDeceased) {
            html += '<span class="character-row__death-marker" aria-label="Deceased">';
            html += '<span aria-hidden="true">&dagger;</span>';
            html += '</span>';
        }

        // Culture badge — gated on options.showCulture BEFORE resolving.
        if (options.showCulture) {
            var cultureText = _cultureBadgeText(character.cultureId);
            if (cultureText) {
                html += '<span class="character-row__culture-badge">'
                     + _esc(cultureText)
                     + '</span>';
            }
        }
        html += '</span>';

        // Details line
        var details = [];
        if (options.showAge) details.push(_formatAge(summary.age));
        if (options.showLocation && summary.location) details.push(summary.location);
        if (_hasId(character.household)) details.push(character.household);

        if (details.length > 0) {
            html += '<span class="character-row__details">';
            for (var i = 0; i < details.length; i++) {
                if (i > 0) html += ' &middot; ';
                html += _esc(details[i]);
            }
            html += '</span>';
        }

        // Status
        if (options.showStatus) {
            html += '<span class="character-row__status">'
                 + (summary.isDeceased ? 'Deceased' : 'Living')
                 + '</span>';
        }

        html += '</button>';
        return html;
    }

    // =========================================================================
    // 3. PUBLIC — RENDER LIST
    // =========================================================================

    /**
     * Renders a character list into the given container.
     *
     * @param {string|HTMLElement} containerOrId
     * @param {Object} [options]
     * @param {Array} [options.filteredCharacters] - supply a pre-filtered
     *   list. When omitted, all characters are rendered.
     * @param {Function} [options.onSelect] - called with the character
     *   object on click.
     * @param {string} [options.emptyMessage] - default 'No characters found'
     * @param {boolean} [options.showStatus] - default true
     * @param {boolean} [options.showLocation] - default true
     * @param {boolean} [options.showAge] - default true
     * @param {boolean} [options.showCulture] - default true
     * @param {string} [options.rowClass] - additional class for rows
     * @returns {boolean} - true if rendering succeeded
     */
    function renderCharacterList(containerOrId, options) {
        if (_isMissing(options)) options = {};
        if (typeof options !== 'object' || Array.isArray(options)) {
            throw new Error('renderCharacterList: options must be an object');
        }

        var container = typeof containerOrId === 'string'
            ? document.getElementById(containerOrId)
            : containerOrId;

        if (!container) return false;

        var showStatus = options.showStatus !== false;
        var showLocation = options.showLocation !== false;
        var showAge = options.showAge !== false;
        var showCulture = options.showCulture !== false;

        var emptyMessage = _isMissing(options.emptyMessage)
            ? 'No characters found'
            : options.emptyMessage;

        var characters;
        if (Array.isArray(options.filteredCharacters)) {
            characters = options.filteredCharacters;
        } else {
            characters = window.getCharacters();
        }

        if (characters.length === 0) {
            container.innerHTML =
                '<div class="character-empty-message">'
                + _esc(emptyMessage)
                + '</div>';
            return true;
        }

        // Sort by full name for stable presentation.
        var sorted = characters.slice().sort(function(a, b) {
            var aName = (typeof a.name === 'string' ? a.name : '') + ' '
                      + (typeof a.surname === 'string' ? a.surname : '');
            var bName = (typeof b.name === 'string' ? b.name : '') + ' '
                      + (typeof b.surname === 'string' ? b.surname : '');
            return aName.localeCompare(bName);
        });

        var rowOptions = {
            showStatus: showStatus,
            showLocation: showLocation,
            showAge: showAge,
            showCulture: showCulture,
            rowClass: options.rowClass
        };

        var html = '<div class="character-list">';
        for (var i = 0; i < sorted.length; i++) {
            html += _renderRow(sorted[i], rowOptions);
        }
        html += '</div>';

        container.innerHTML = html;

        // Delegated click handling. One listener on the container; the
        // listener is replaced on each render by removing a previously
        // installed one.
        _installDelegatedClickHandler(container, options.onSelect);

        return true;
    }

    // =========================================================================
    // 4. DELEGATED CLICK HANDLING
    // =========================================================================

    // Track the active click handler per container so re-rendering does
    // not stack listeners.
    var _containerHandlers = new WeakMap();

    function _installDelegatedClickHandler(container, onSelect) {
        // Remove any previously installed handler.
        var previous = _containerHandlers.get(container);
        if (previous) {
            container.removeEventListener('click', previous);
            _containerHandlers.delete(container);
        }

        if (typeof onSelect !== 'function') return;

        function handleClick(event) {
            var target = event.target;
            if (!target || !target.closest) return;

            var row = target.closest('[data-action="select-character"]');
            if (!row || !container.contains(row)) return;

            var id = row.getAttribute('data-character-id');
            if (!_hasId(id)) return;

            var character = window.getCharacterById(id);
            if (character) {
                onSelect(character);
            }
        }

        container.addEventListener('click', handleClick);
        _containerHandlers.set(container, handleClick);
    }

    // =========================================================================
    // 5. PUBLIC — RENDER CARD
    // =========================================================================

    /**
     * Returns an HTML string for a single character card.
     *
     * @param {Object} character
     * @param {Object} [options]
     * @param {boolean} [options.showCulture] - default true
     * @returns {string}
     */
    function renderCharacterCard(character, options) {
        if (!character || !_hasId(character.id)) {
            return '<div class="character-card character-card--missing">'
                 + 'Character not found'
                 + '</div>';
        }

        if (_isMissing(options)) options = {};
        var showCulture = options.showCulture !== false;

        var summary = window.CharacterQueries.getCharacterSummary(character.id);
        if (!summary) {
            return '<div class="character-card character-card--missing">'
                 + 'Character summary unavailable'
                 + '</div>';
        }

        var html = '';
        html += '<div class="character-card">';

        // Header
        html += '<div class="character-card__header">';
        html += '<h4 class="character-card__name">'
             + _esc(summary.fullName || summary.name || 'Unnamed')
             + '</h4>';
        html += '<div class="character-card__badges">';

        // Culture badge — gated on options.showCulture BEFORE resolving.
        if (showCulture) {
            var cultureText = _cultureBadgeText(character.cultureId);
            if (cultureText) {
                html += '<span class="character-card__culture-badge">'
                     + _esc(cultureText)
                     + '</span>';
            }
        }

        var statusClass = summary.isDeceased
            ? 'character-card__status character-card__status--deceased'
            : 'character-card__status character-card__status--living';
        html += '<span class="' + statusClass + '">'
             + (summary.isDeceased ? 'Deceased' : 'Living')
             + '</span>';

        html += '</div>'; // badges
        html += '</div>'; // header

        // Grid: age / gender / location
        html += '<div class="character-card__grid">';

        html += '<div class="character-card__field">'
             + '<div class="character-card__field-label">Age</div>'
             + '<div class="character-card__field-value">'
             + _esc(_formatAge(summary.age))
             + '</div></div>';

        html += '<div class="character-card__field">'
             + '<div class="character-card__field-label">Gender</div>'
             + '<div class="character-card__field-value">'
             + _esc(summary.gender || 'Unknown')
             + '</div></div>';

        html += '<div class="character-card__field">'
             + '<div class="character-card__field-label">Location</div>'
             + '<div class="character-card__field-value">'
             + _esc(summary.location || 'Unknown')
             + '</div></div>';

        html += '</div>'; // grid

        // Appearance preview
        var appearanceHtml = _renderAppearancePreview(character.appearance);
        if (appearanceHtml) {
            html += appearanceHtml;
        }

        // Notes
        if (typeof summary.notes === 'string' && summary.notes.length > 0) {
            html += '<div class="character-card__notes">'
                 + _esc(summary.notes)
                 + '</div>';
        }

        html += '</div>'; // card
        return html;
    }

    /**
     * Renders an appearance preview from the character's appearance object.
     *
     * Escapes every field. Returns '' when there is nothing to render.
     */
    function _renderAppearancePreview(appearance) {
        if (!appearance || typeof appearance !== 'object' || Array.isArray(appearance)) {
            return '';
        }

        var parts = [];
        if (typeof appearance.skinTone === 'string' && appearance.skinTone) {
            parts.push(appearance.skinTone);
        }
        if (typeof appearance.eyeColor === 'string' && appearance.eyeColor) {
            parts.push(appearance.eyeColor + ' eyes');
        }
        if (typeof appearance.hairColor === 'string' && appearance.hairColor) {
            parts.push(appearance.hairColor + ' hair');
        }
        if (typeof appearance.build === 'string' && appearance.build) {
            parts.push(appearance.build);
        }
        if (typeof appearance.height === 'number' && Number.isFinite(appearance.height)
            && appearance.height > 0) {
            parts.push(appearance.height + 'cm');
        }

        if (parts.length === 0) return '';

        // Escape the whole joined string once. Each individual part has
        // already been validated as a string or a finite number, so this
        // is safe.
        var text = parts.join(' \u00b7 ');
        return '<div class="character-card__appearance">'
             + _esc(text)
             + '</div>';
    }

    // =========================================================================
    // 6. EXPORTS
    // =========================================================================

    window.CharacterUI = {
        renderCharacterList: renderCharacterList,
        renderCharacterCard: renderCharacterCard
    };

})();
