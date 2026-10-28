// js/character/character-ui-list.js
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
 *   - Location display resolution → world.js (see LOCATION RESOLUTION)
 *   - Presentation CSS → the stylesheet (see character-ui.css)
 *   - Modal workflows → modals-character.js
 *   - Mutation → CharacterCommands
 *   - Persistence → storage.js
 *
 * SEMANTIC RULES:
 *   - This module does NOT compute domain values. It calls
 *     CharacterQueries for projections and world.js for location
 *     resolution, then renders what it received.
 *   - Presentation is owned by CSS. This module produces semantic markup
 *     with classes. It does NOT emit inline style attributes.
 *   - All strings interpolated into HTML are escaped, including
 *     appearance fields, location display strings, and any values
 *     returned by query projections.
 *   - Row interaction is delegated: one listener on the container, not
 *     one per row.
 *   - Rows are native buttons. They are keyboard-accessible by default.
 *   - The row-class option is additive. It never replaces the base class
 *     that event delegation depends on.
 *   - Optional lookups (culture badge, location display) are gated on
 *     the caller's options BEFORE they run. A disabled feature does not
 *     execute its resolver.
 *
 * CALLBACK CONTRACT — PROJECTIONS, NOT LIVE ENTITIES:
 *   The `onSelect` callback passed to `renderCharacterList` receives a
 *   PROJECTION (the return value of `window.getCharacterById(id)`),
 *   NOT a live canonical entity. Under the documented load order, that
 *   is `character-queries.js`'s projection-returning version (via
 *   `CharacterState.getCharacter`), not `accessors.js`'s live-entity
 *   cache.
 *
 *   What this means for callers:
 *     - READ freely. Every field on the projection reflects canonical
 *       state at the moment of the call.
 *     - DO NOT MUTATE the object. Mutating a projection does not affect
 *       canonical state. Silent data loss.
 *     - If you need to MUTATE, use `CharacterCommands.*` (the mutation
 *       boundary for character-owned fields). If you are authorized
 *       mutation code (a command or a sanctioned lifecycle module),
 *       use `CharacterState.getLiveCharacterForMutation(id)` for a
 *       live reference.
 *
 *   Prior revisions of this file did not document the callback shape.
 *   Callers reasonably assumed `onSelect(character)` handed them the
 *   live record (the pre-refactor behavior). They do not. This is a
 *   compatibility trap that must be documented at the caller's end.
 *
 *   The same contract applies to `CharacterState.getCharacter(id)` and
 *   `CharacterQueries.getCharacter(id)`: both return projections.
 *   `CharacterState.getLiveCharacterForMutation(id)` is the ONE
 *   sanctioned live-reference accessor, and its name says so.
 *
 *   If you find yourself reaching for a mutation on the callback's
 *   argument, STOP. You need CharacterCommands or
 *   getLiveCharacterForMutation, and probably a domain-specific
 *   command, not a character-list row handler.
 *
 * LOCATION RESOLUTION:
 *   `CharacterQueries.getCharacterSummary().location` is a STABLE SHAPE
 *   PLACEHOLDER that is ALWAYS null. It is not a bug — it is the
 *   contract. Location display resolution belongs to world.js, not to
 *   the character query layer. See character-queries.js's LOCATION
 *   DISPLAY header section for the rationale.
 *
 *   This module therefore resolves location display strings itself,
 *   through world.js:
 *
 *     summary.locationId           raw currentLocationId (may be dangling)
 *     world.getCurrentPlace(char)  canonical resolution (honors the
 *                                  currentLocationId override and the
 *                                  moves-based fallback)
 *     place.displayName            the display string
 *
 *   Three states are distinguished and rendered differently:
 *
 *     no location recorded      summary.locationId === null
 *                               → fallback text ("No location")
 *     recorded but dangling     locationId non-null, resolved place null
 *                               → fallback text ("Unknown location")
 *     resolved                  place non-null
 *                               → place.displayName
 *
 *   The distinction matters: "this character has no recorded location"
 *   and "this character's recorded location no longer exists" are
 *   different data problems, and a UI that collapses them into
 *   "Unknown" hides the second one.
 *
 *   If world.js is not loaded (bare test harness), resolution returns
 *   null and the fallback text is used. This module does not throw for
 *   a missing optional resolver — the character list still renders, and
 *   location fields simply show the fallback. This is different from
 *   the query layer's culture badge, which is also optional but
 *   resolves to '' (empty string) rather than a fallback text, because
 *   the culture badge is a supplementary piece of decoration while
 *   location is a first-class field in the card grid and the row
 *   details line.
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
 *   - world.getCurrentPlace(character) — for location display resolution
 *     If absent, location fields render the fallback text
 *     ("No location"/"Unknown location") based on summary.locationId.
 *
 * ICON POLICY: Uses SVG from icons.js if available. No emojis. No Unicode
 * gender symbols.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision (P2-2):
 *     - Added CALLBACK CONTRACT — PROJECTIONS, NOT LIVE ENTITIES section
 *       to the header. The onSelect callback receives a projection, not
 *       a live canonical entity; mutating it does not affect canonical
 *       state. Prior revisions omitted this contract, and callers
 *       reasonably assumed they received the live record (the
 *       pre-refactor behavior). Same-named getters in CharacterState,
 *       CharacterQueries, and accessors.js return different things
 *       depending on which module last set window.getCharacterById;
 *       this is a documentation-level fix so callers know what to
 *       expect and where to go if they need to mutate.
 *     - No behavioural change. The callback still receives exactly what
 *       it always received; the header now says so.
 *   Previous revision:
 *     - Location display resolution added. The card grid's Location
 *       field previously rendered 'Unknown' unconditionally because
 *       summary.location was always null (it is a stable shape
 *       placeholder, documented in character-queries.js). The list
 *       row's location detail was silently skipped for the same reason.
 *       Both now resolve through world.getCurrentPlace(character),
 *       using summary.locationId as the input. Three states are
 *       distinguished: no location recorded, recorded but dangling,
 *       and resolved. See LOCATION RESOLUTION in the header.
 *     - _resolveLocationDisplay(summary, character, options) helper
 *       added. Returns a string suitable for direct rendering after
 *       escaping, or '' when the caller disabled location display.
 *     - _renderRow now uses the resolver for its location detail line.
 *       Previously checked `if (options.showLocation && summary.location)`
 *       which never fired because summary.location is always null.
 *     - renderCharacterCard now uses the resolver for its Location
 *       field. Previously emitted `_esc(summary.location || 'Unknown')`
 *       which always emitted 'Unknown' for every character.
 *     - Header LOCATION RESOLUTION section added.
 *     - DEPENDENCIES list updated: world.getCurrentPlace added as
 *       OPTIONAL.
 *     - No public signature change, no public return-shape change.
 *   Phase 1.7:
 *     - _requireDependencies accepts character-system.js or accessors.js
 *       as the provider of window.getCharacters.
 *     - _renderRow and renderCharacterCard check options.showCulture
 *       BEFORE calling _cultureBadgeText.
 *     - Header DEPENDENCIES updated: character-system.js listed
 *       alongside accessors.js as the provider of getCharacters.
 *     - Header SEMANTIC RULES adds the "optional lookups are gated"
 *       clause.
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

    /**
     * Resolves a display string for a character's current location, or ''.
     *
     * Inputs:
     *   summary    — CharacterQueries.getCharacterSummary result.
     *                summary.locationId is the raw currentLocationId
     *                (may be dangling). summary.location is always null
     *                and is never read here — see LOCATION RESOLUTION in
     *                the module header.
     *   character  — the raw character object the row/card is rendering.
     *                Passed to world.getCurrentPlace(character) so the
     *                resolver honors the currentLocationId override and
     *                the moves-based fallback (which need more than just
     *                the id).
     *   options    — the caller-supplied options. Used to check
     *                options.showLocation before doing any work.
     *
     * Returns:
     *   ''                 when options.showLocation === false (caller
     *                      disabled the field; do not render it at all)
     *   'No location'      when the character has no recorded location
     *   'Unknown location' when the character's recorded location is a
     *                      dangling reference (id present, resolved
     *                      place missing)
     *   place.displayName  when the location resolves
     *
     * The three non-empty cases are the caller's three distinct UI
     * states. This helper returns the display string only; the caller
     * decides how to render it (separator, styling, etc.).
     */
    function _resolveLocationDisplay(summary, character, options) {
        if (options && options.showLocation === false) return '';
        if (!summary) return '';

        var locationId = summary.locationId;
        if (!_hasId(locationId)) return 'No location';

        // world.js is an optional resolver. If it is absent, the location
        // exists (locationId is non-null) but we cannot resolve the
        // display string. Return the dangling-state text rather than
        // fabricating a name.
        if (typeof window.getCurrentPlace !== 'function') {
            return 'Unknown location';
        }

        var place = window.getCurrentPlace(character);
        if (!place) return 'Unknown location';
        if (typeof place.displayName !== 'string' || place.displayName.length === 0) {
            return 'Unknown location';
        }
        return place.displayName;
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

        if (options.showLocation) {
            var locationText = _resolveLocationDisplay(summary, character, options);
            if (locationText) details.push(locationText);
        }

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
     * The `onSelect` callback receives a PROJECTION, not a live canonical
     * entity. See CALLBACK CONTRACT — PROJECTIONS, NOT LIVE ENTITIES in
     * the module header. Mutating the callback's argument does not affect
     * canonical state.
     *
     * @param {string|HTMLElement} containerOrId
     * @param {Object} [options]
     * @param {Array} [options.filteredCharacters] - supply a pre-filtered
     *   list. When omitted, all characters are rendered.
     * @param {Function} [options.onSelect] - called with the character
     *   projection on click. See CALLBACK CONTRACT in the header.
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

            // Get the character projection. Under the documented load
            // order, window.getCharacterById is character-queries.js's
            // projection-returning version. This is a projection, not a
            // live canonical entity. See CALLBACK CONTRACT in the header.
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
     * @param {boolean} [options.showLocation] - default true
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
        var showLocation = options.showLocation !== false;

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

        // Location field. showLocation === false omits the field entirely
        // (not an empty row); when true, the resolver returns the display
        // string or one of the two fallbacks ('No location' / 'Unknown
        // location') so the field is never silently blank.
        if (showLocation) {
            var locationText = _resolveLocationDisplay(summary, character, options);
            html += '<div class="character-card__field">'
                 + '<div class="character-card__field-label">Location</div>'
                 + '<div class="character-card__field-value">'
                 + _esc(locationText || 'No location')
                 + '</div></div>';
        }

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
