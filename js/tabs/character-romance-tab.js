// js/tabs/character-romance-tab.js
/**
 * =============================================================================
 * STILL WATERS - CHARACTER ROMANCE TAB
 * (js/tabs/character-romance-tab.js)
 * =============================================================================
 *
 * LOCATION: js/tabs/character-romance-tab.js
 *
 * The Romance tab of the Character Manager. Shows the character's
 * current romantic relationships, former (widowed or ended)
 * relationships, and aggregate statistics. All writes delegate to the
 * relationship domain.
 *
 * WRITE AFFORDANCES
 *
 *   - Add Relationship    → openCharacterSelector then
 *                            openRelationshipModal with
 *                            context.defaultType = 'committed'
 *
 *   - Break up            → confirmDialog + RomanceCommands.breakUp
 *
 *   - View                → read-only info modal (openModal)
 *
 *   - Edit                → openEditRomanceModal (this file). Edits
 *                            Start Year, Notes, and (for committed
 *                            relationships) Attributes. Dispatches
 *                            through RelationshipCommands.update for
 *                            dates/notes and through
 *                            RomanceCommands.addCommittedAttribute /
 *                            removeCommittedAttribute for attributes,
 *                            so the romance-rules validation and
 *                            cultural gating run on every attribute
 *                            change.
 *
 *                            The edit modal has NO status field.
 *                            Status transitions route through the
 *                            dedicated commands (breakUp,
 *                            deathEndsRelationship, etc.), each of
 *                            which consults its domain's transition
 *                            table. The "End Relationship" button in
 *                            the edit modal hands off to the existing
 *                            break-up confirm flow — same pattern
 *                            modals-friendship.js uses for "End
 *                            Friendship" inside its edit modal.
 *
 * RENDERER CONTRACT (from CharacterManagerBootstrap):
 *   fn(container, context)
 *   container  HTMLElement  — already emptied by TabManager
 *   context    { characterId, character }  — CharacterQueries projection
 *
 * DATA SOURCES:
 *   - CharacterViewModels.buildRomanceModel(characterId)
 *   - window.RomanceCommands.breakUp(relationshipId, options)
 *   - window.RomanceCommands.addCommittedAttribute / removeCommittedAttribute
 *   - window.RelationshipCommands.update(relationshipId, patch)
 *   - window.RomanceQueries.getById(relationshipId) — for the edit modal's
 *     raw record (needed because the projection carries attributes as a
 *     slice, not the record; the edit modal builds the form from the
 *     projection but confirms against the live record so concurrent
 *     changes are detected via the command's own validation)
 *   - window.openRelationshipModal(subject, selected, onSuccess, context)
 *   - window.openCharacterSelector(options)
 *
 * SECTIONS (each collapsible, all default expanded):
 *   - Current Relationships   active romance
 *   - Former Relationships    widowed + ended (displayLabel distinguishes)
 *   - Statistics              counts, institutions
 *
 * COLLAPSED-STATE PERSISTENCE: global per-tab via
 *   CharacterUIState.getCollapsed('romance', sectionKey) /
 *   setCollapsed. Not per-character.
 *
 * DEPENDENCIES (required at load):
 *   - TabManager              (self-registration)
 *   - formatting.js           (escapeHtml, formatYear, formatCount)
 *   - icons.js                (Icons)
 *   - CharacterUIState        (collapsed state)
 *   - CharacterViewModels     (buildRomanceModel)
 *
 * DEPENDENCIES (optional, guarded at call time):
 *   - window.RomanceCommands                  breakUp, addCommittedAttribute,
 *                                              removeCommittedAttribute
 *   - window.RelationshipCommands.update      edit dispatch (dates/notes)
 *   - window.RomanceQueries                   live-record read in edit modal
 *   - window.openRelationshipModal            Add Relationship
 *   - window.openCharacterSelector            Add Relationship
 *   - window.openModal / closeTopModal        all modals
 *   - window.showToast                        error surfacing
 *   - window.confirmDialog                    Break up confirmation
 *   - window.CharacterManagerBootstrap.renderActive  post-mutation refresh
 *
 * TIME CONTRACT: uses window.getCurrentYear where needed.
 *
 * ICON POLICY: SVG from icons.js (via the view-model's typeIcon /
 *              institutionIcon / statusIcon fields), plus a small set
 *              of tab-level icons. No emojis. No literal Unicode
 *              glyphs except the section-toggle ▶ / ▼ and the
 *              typographic dagger † already used elsewhere.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - FIXED: "Relationship not found." toast on View after any
 *       refresh.
 *
 *       The tab used to register a container-level click listener on
 *       every render (`_wire` called `container.addEventListener(
 *       'click', ...)` unconditionally). Each listener closed over the
 *       `model` passed to that particular render. After any
 *       `_refresh()` (add relationship, break up, edit), the tab
 *       rendered again and added ANOTHER listener. Clicking View then
 *       fired the OLDEST listener first. That listener's captured
 *       `model` was the pre-refresh projection, which by then was out
 *       of sync with the DOM (which had been replaced by the newest
 *       render). `_findEntry` on the stale model missed the
 *       relationship and toasted "Relationship not found.", even
 *       though the relationship was visible on screen and present in
 *       the newest model.
 *
 *       `_wire` now removes the previous container handler before
 *       adding the next one, via a per-container handler reference.
 *       The toggle-section listeners are per-button and are destroyed
 *       by `container.innerHTML = body` on every render, so they do
 *       not accumulate and need no cleanup.
 *
 *     - Added _getRelId(rel), used by _actionsHtml, _romanceRowHtml,
 *       and _findEntry. Tolerant of `relationshipId` / `id` /
 *       `relationship_id`. The projection (romance-queries.js::_project)
 *       carries `relationshipId: record.id`, so the primary name works
 *       on the current build; the fallbacks are belt-and-braces
 *       against a future _project change and against any
 *       _enrichRomance path that drops the field.
 *
 *     - Added Edit affordance (phase 2 of the header note in prior
 *       revisions):
 *
 *         * New "Edit" button in _actionsHtml next to View and Break
 *           up.
 *         * New _onEditRomance handler.
 *         * New openEditRomanceModal(relationshipId, onSuccess): a real
 *           editable form (Start Year, Notes, Attributes for committed
 *           only, End Relationship secondary button). Dispatches
 *           through RelationshipCommands.update for dates/notes and
 *           RomanceCommands.addCommittedAttribute /
 *           removeCommittedAttribute for attributes (one call per diff,
 *           so the romance-rules validation and cultural gating run on
 *           every attribute change). Reports each sub-result; does not
 *           close on failure.
 *         * View modal footer gains an Edit button alongside Close, so
 *           both entry points reach the edit form.
 *
 *       The edit modal has NO status field by design: status changes
 *       route through the dedicated commands (breakUp,
 *       deathEndsRelationship, etc.), each of which consults its
 *       domain's transition table. See the EDIT MODAL section.
 *
 *     - Header rewritten to document the edit flow, the id resolution,
 *       and the listener-stack fix.
 *
 *   Initial revision (phase 1):
 *     - Three collapsible sections; Add Relationship; Break up; View.
 *     - Read-only view modal (phase 1); phase 2 adds dedicated view /
 *       edit modals (this revision ships phase 2's edit half; the
 *       affairs section and matchmaking affordances remain future
 *       work).
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 0. CONSTANTS
    // =========================================================================

    var TAB_ID = 'romance';
    var SCOPE  = 'character';

    var SECTIONS = [
        { key: 'current', label: 'Current Relationships', icon: 'HEART' },
        { key: 'former',  label: 'Former Relationships',  icon: 'STATUS_ENDED' },
        { key: 'stats',   label: 'Statistics',            icon: 'CENSUS' }
    ];

    var ARCHETYPE_LABEL = {
        casual_dating:   'Casual',
        one_night_stand: 'One Night',
        committed:       'Committed'
    };

    // Attribute order for the edit form, matching the create modal's
    // order so the two forms are recognisably the same shape.
    var EDIT_ATTRIBUTE_ORDER = [
        'married',
        'handfasted',
        'civil_union',
        'engaged',
        'cohabiting',
        'polyamorous',
        'monogamous',
        'arranged',
        'love_match',
        'duty_match',
        'secret',
        'public',
        'scandalous',
        'morganatic',
        'levitic',
        'posthumous'
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

    function _toast(msg, type) {
        if (typeof window.showToast === 'function') {
            try { window.showToast(msg, type || 'info'); }
            catch (e) { /* non-fatal */ }
        } else if (typeof console !== 'undefined' && console.warn) {
            console.warn('[romance-tab] ' + (type || 'info') + ': ' + msg);
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

    function _count(n, singular, plural) {
        if (typeof window.formatCount === 'function') {
            return window.formatCount(n, singular, plural);
        }
        return n + ' ' + (n === 1 ? singular : plural);
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

    /**
     * Tolerant relationship-id resolution.
     *
     * The projection (romance-queries.js::_project) returns
     * `relationshipId: record.id`. The model (character-view-models.js::
     * _enrichRomance) copies it through. So on the current build the
     * primary name works. The fallbacks exist for two reasons:
     *
     *   1. Defensive against a future _project change that returns
     *      `id` instead of `relationshipId`, or that stops returning
     *      either (the _enrichRomance guard only checks partnerId).
     *   2. Defensive against any view-model change that reshapes the
     *      entry without re-exporting relationshipId.
     *
     * Returns null when no usable id is found. Callers treat null as
     * "cannot dispatch" — they disable the button or toast a reason.
     */
    function _getRelId(rel) {
        if (!rel) return null;
        if (_hasId(rel.relationshipId)) return rel.relationshipId;
        if (_hasId(rel.id)) return rel.id;
        if (_hasId(rel.relationship_id)) return rel.relationship_id;
        return null;
    }

    // =========================================================================
    // 2. SECTION SHELL
    // =========================================================================

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

    function _empty(message) {
        return '<div class="character-tab-empty">' + _esc(message) + '</div>';
    }

    function _unavailable(message) {
        return '<div class="character-tab-unavailable">' + _esc(message) + '</div>';
    }

    // =========================================================================
    // 3. ROMANCE ROW RENDERING
    // =========================================================================

    function _badgeHtml(text, iconName, color) {
        if (!_hasId(text)) return '';
        var bg = color || 'var(--accent)';
        return '' +
            '<span class="character-romance-badge" ' +
                'style="border-color:' + _esc(bg) + '; color:' + _esc(bg) + ';">' +
                (iconName ? _icon(iconName) + ' ' : '') +
                _esc(text) +
            '</span>';
    }

    function _statusColorClass(displayLabel) {
        if (!displayLabel) return '';
        if (displayLabel === 'Active') return 'is-active';
        if (displayLabel.indexOf('Widowed') === 0) return 'is-widowed';
        if (displayLabel.indexOf('Deceased') === 0) return 'is-deceased-subject';
        if (displayLabel.indexOf('Both deceased') === 0) return 'is-both-deceased';
        if (displayLabel.indexOf('Partner deceased') === 0) return 'is-partner-deceased';
        if (displayLabel === 'Ended') return 'is-ended';
        return '';
    }

    function _metaLineHtml(rel) {
        var bits = [];
        if (typeof rel.startYear === 'number') {
            bits.push('since ' + _year(rel.startYear) +
                (rel.durationYears ? ' (' + rel.durationYears + 'y)' : ''));
        }
        if (typeof rel.endYear === 'number') {
            bits.push('ended ' + _year(rel.endYear));
        }
        if (bits.length === 0) return '';
        return '<div class="character-romance-meta">' +
            _esc(bits.join(' · ')) +
        '</div>';
    }

    function _badgesHtml(rel) {
        var html = '<div class="character-romance-badges">';
        var typeLabel = rel.typeName
            || ARCHETYPE_LABEL[rel.type]
            || rel.type;
        html += _badgeHtml(typeLabel, rel.typeIcon, rel.typeColor);
        if (rel.institutionName) {
            html += _badgeHtml(rel.institutionName, rel.institutionIcon, rel.institutionColor);
        }
        if (rel.isAffair) {
            html += _badgeHtml('Affair', 'LOCK', 'var(--dim)');
        }
        if (rel.isPolyamorous) {
            html += _badgeHtml('Polyamorous', null, 'var(--dim)');
        }
        html += '</div>';
        return html;
    }

    function _statusLineHtml(rel) {
        var cls = _statusColorClass(rel.displayLabel);
        return '<div class="character-romance-status ' + cls + '">' +
            (rel.statusIcon ? _icon(rel.statusIcon) + ' ' : '') +
            _esc(rel.displayLabel) +
        '</div>';
    }

    function _actionsHtml(rel, active) {
        var relId = _getRelId(rel);

        // View is always available (openModal is a core dependency of
        // this tab; if it is missing, the tab would not render at all).
        // The Edit path needs both the id and the commands.
        var viewEnabled = _hasId(relId)
            && window.openModal
            && typeof window.openModal === 'function';

        var editEnabled = active
            && _hasId(relId)
            && window.RelationshipCommands
            && typeof window.RelationshipCommands.update === 'function';

        var breakEnabled = active
            && _hasId(relId)
            && window.RomanceCommands
            && typeof window.RomanceCommands.breakUp === 'function';

        var viewAttrs = viewEnabled ? '' : ' disabled title="View is not available"';
        var editAttrs = editEnabled ? '' : ' disabled title="Edit is not available"';
        var breakAttrs = breakEnabled ? '' : ' disabled title="Break up is not available"';

        var actions = '<div class="character-romance-actions">' +
            '<button type="button" class="character-tab-btn-small" ' +
                'data-action="view-romance" ' +
                'data-relationship-id="' + _esc(relId || '') + '" ' +
                viewAttrs + '>View</button>';

        if (active) {
            actions += '<button type="button" class="character-tab-btn-small" ' +
                'data-action="edit-romance" ' +
                'data-relationship-id="' + _esc(relId || '') + '" ' +
                editAttrs + '>Edit</button>' +
                '<button type="button" class="character-tab-btn-small danger" ' +
                'data-action="break-up" ' +
                'data-relationship-id="' + _esc(relId || '') + '" ' +
                'data-partner-id="' + _esc(rel.partnerId || '') + '" ' +
                breakAttrs + '>Break up</button>';
        }

        actions += '</div>';
        return actions;
    }

    function _romanceRowHtml(rel, active) {
        var compact = '';
        if (window.CharacterViewModels
            && typeof window.CharacterViewModels.compactRow === 'function') {
            compact = window.CharacterViewModels.compactRow(rel.partnerId, '');
        } else {
            compact = '<div class="character-row" data-character-id="' +
                _esc(rel.partnerId) + '"><span class="character-row__name">' +
                _esc(rel.partnerName || rel.partnerId) +
                '</span></div>';
        }

        var relId = _getRelId(rel) || '';

        return '' +
            '<div class="character-romance-row' +
                (rel.partnerIsDeceased ? ' is-partner-deceased' : '') +
                '" data-relationship-id="' + _esc(relId) + '">' +
                '<div class="character-romance-row__main">' +
                    compact +
                    _badgesHtml(rel) +
                    _metaLineHtml(rel) +
                    _statusLineHtml(rel) +
                '</div>' +
                _actionsHtml(rel, active) +
            '</div>';
    }

    // =========================================================================
    // 4. SECTION BODIES
    // =========================================================================

    function _bodyCurrent(model) {
        if (model.current === null || !Array.isArray(model.current)) {
            var err = model.errors && model.errors.current
                ? model.errors.current
                : 'unknown error';
            return _unavailable('Current relationships could not be loaded: ' + err);
        }
        if (model.current.length === 0) {
            return _empty('No current romantic relationships. Use "Add Relationship" to create one.');
        }
        var html = '';
        for (var i = 0; i < model.current.length; i++) {
            html += _romanceRowHtml(model.current[i], true);
        }
        return html;
    }

    function _bodyFormer(model) {
        if (model.former === null || !Array.isArray(model.former)) {
            var err = model.errors && model.errors.former
                ? model.errors.former
                : 'unknown error';
            return _unavailable('Former relationships could not be loaded: ' + err);
        }
        if (model.former.length === 0) {
            return _empty('No former relationships.');
        }
        var html = '';
        for (var i = 0; i < model.former.length; i++) {
            html += _romanceRowHtml(model.former[i], false);
        }
        return html;
    }

    function _bodyStats(model) {
        if (!model.stats) {
            var err = model.errors && model.errors.stats
                ? model.errors.stats
                : 'unknown error';
            return _unavailable('Statistics could not be loaded: ' + err);
        }

        var s = model.stats;

        var html = '<div class="character-romance-stats">';

        html += _statField('Total relationships', String(s.totalRelationships || 0));
        html += _statField('Active relationships', String(s.activeRelationships || 0));
        html += _statField('Active committed', String(s.activeCommitted || 0));
        html += _statField('Active casual', String(s.activeCasual || 0));
        html += _statField('Active one-night', String(s.activeOneNight || 0));
        html += _statField('Active affairs', String(s.activeAffairs || 0));

        html += _statField('Earliest relationship',
            (typeof s.earliestStartYear === 'number')
                ? _year(s.earliestStartYear)
                : '—');

        if (Array.isArray(s.institutions) && s.institutions.length > 0) {
            html += '<div class="character-romance-stat-field ' +
                'character-romance-stat-field--wide">' +
                '<div class="character-romance-stat-field__label">Institutions</div>' +
                '<div class="character-romance-stat-field__value ' +
                    'character-romance-badges">';
            for (var i = 0; i < s.institutions.length; i++) {
                var inst = s.institutions[i];
                html += _badgeHtml(inst.name, inst.icon, inst.color);
            }
            html += '</div></div>';
        }

        html += '</div>';
        return html;
    }

    function _statField(label, value) {
        return '<div class="character-romance-stat-field">' +
            '<div class="character-romance-stat-field__label">' +
                _esc(label) +
            '</div>' +
            '<div class="character-romance-stat-field__value">' +
                _esc(value) +
            '</div>' +
        '</div>';
    }

    // =========================================================================
    // 5. RENDER
    // =========================================================================

    function renderRomanceTab(container, context) {
        if (!container) return;
        if (!context || !_hasId(context.characterId)) {
            container.innerHTML = _empty('No character selected.');
            return;
        }

        var VM = window.CharacterViewModels;
        if (!VM || typeof VM.buildRomanceModel !== 'function') {
            container.innerHTML = _unavailable(
                'CharacterViewModels.buildRomanceModel is not loaded; ' +
                'cannot render the Romance tab.'
            );
            return;
        }

        var model;
        try { model = VM.buildRomanceModel(context.characterId); }
        catch (e) { model = null; }

        if (!model) {
            container.innerHTML = _unavailable('Character could not be loaded.');
            return;
        }

        var addEnabled = (window.openRelationshipModal
            && typeof window.openRelationshipModal === 'function'
            && window.openCharacterSelector
            && typeof window.openCharacterSelector === 'function');

        var addAttrs = addEnabled
            ? ''
            : ' disabled title="Add Relationship requires the relationship modal and the character selector to be loaded"';

        var polyIndicator = '';
        if (model.identity && model.identity.allowsMultipleSpouses) {
            polyIndicator = '<span class="character-romance-poly" ' +
                'title="This character\'s active rank allows multiple spouses">' +
                _icon('CROWN') + ' Polygamous' +
            '</span>';
        }

        var headerHtml = '' +
            '<div class="character-romance-header">' +
                '<div class="character-romance-header__title">' +
                    _esc('Romance') +
                    polyIndicator +
                '</div>' +
                '<div class="character-romance-header__actions">' +
                    '<button type="button" class="character-tab-btn primary" ' +
                        'data-action="add-relationship"' + addAttrs + '>' +
                        _icon('PLUS') + ' Add Relationship' +
                    '</button>' +
                '</div>' +
            '</div>';

        var body = '';
        body += headerHtml;
        body += _sectionHtml(SECTIONS[0], _bodyCurrent(model));
        body += _sectionHtml(SECTIONS[1], _bodyFormer(model));
        body += _sectionHtml(SECTIONS[2], _bodyStats(model));

        container.innerHTML = body;
        _wire(container, context.characterId, model);
    }

    // =========================================================================
    // 6. WIRING
    // =========================================================================
    //
    // The container-level click handler is per-render and captures the
    // model. To avoid accumulating handlers across renders (the cause
    // of "Relationship not found." on stale clicks — see the module
    // header), we remove the previous handler before installing the
    // next one. The reference lives on the container itself, so a
    // different Character Manager tab (a different container element)
    // is unaffected.

    var HANDLER_KEY = '__romanceTabClickHandler';

    function _wire(container, characterId, model) {
        // Toggle-section listeners are per-button and are destroyed on
        // the next `container.innerHTML = body`. They do not accumulate.
        var headers = container.querySelectorAll('.character-tab-section__header');
        for (var i = 0; i < headers.length; i++) {
            headers[i].addEventListener('click', _onToggleSection);
        }

        // Container-level click handler: remove the previous one first.
        if (container[HANDLER_KEY]) {
            container.removeEventListener('click', container[HANDLER_KEY]);
            container[HANDLER_KEY] = null;
        }

        var handler = function (e) {
            var target = e.target;

            var nameLink = target.closest
                ? target.closest('a.character-row__name[data-character-id]')
                : null;
            if (nameLink) {
                e.preventDefault();
                var linkCharId = nameLink.getAttribute('data-character-id');
                if (_hasId(linkCharId) && linkCharId !== characterId) {
                    _selectCharacter(linkCharId);
                }
                return;
            }

            var btn = target.closest
                ? target.closest('[data-action]')
                : null;
            if (!btn || !container.contains(btn)) return;

            var action = btn.getAttribute('data-action');
            if (!action) return;

            if (action === 'toggle-section') return;
            if (btn.disabled) return;

            e.preventDefault();
            _dispatchAction(action, btn, characterId, model);
        };

        container[HANDLER_KEY] = handler;
        container.addEventListener('click', handler);
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

    function _selectCharacter(characterId) {
        var ui = _uiState();
        if (!ui || typeof ui.setSelectedCharacterId !== 'function') return;
        ui.setSelectedCharacterId(characterId);
        _refresh();
    }

    function _dispatchAction(action, btn, characterId, model) {
        switch (action) {
            case 'add-relationship':
                _onAddRelationship(characterId); return;
            case 'view-romance':
                _onViewRomance(btn, model); return;
            case 'edit-romance':
                _onEditRomance(btn, model); return;
            case 'break-up':
                _onBreakUp(btn, characterId); return;
            default:
                if (typeof console !== 'undefined' && console.warn) {
                    console.warn('[romance-tab] unknown action: ' + action);
                }
        }
    }

    // =========================================================================
    // 7. ACTION IMPLEMENTATIONS
    // =========================================================================

    function _onAddRelationship(characterId) {
        if (typeof window.openCharacterSelector !== 'function') {
            _toast('Character selector is not loaded; cannot add a relationship.', 'error');
            return;
        }
        if (typeof window.openRelationshipModal !== 'function') {
            _toast('Relationship modal is not loaded; cannot add a relationship.', 'error');
            return;
        }

        var subject = _getCharacterProjection(characterId);
        if (!subject) {
            _toast('Subject character not found.', 'error');
            return;
        }

        window.openCharacterSelector({
            title: 'Select Partner for ' + (subject.name || 'this character'),
            excludeIds: [characterId],
            filters: {
                status: 'living',
                showDeceased: true
            },
            onSelect: function (selected) {
                if (!selected || !_hasId(selected.id)) return;
                if (selected.id === characterId) {
                    _toast('A character cannot have a romantic relationship with themselves.', 'error');
                    return;
                }
                window.openRelationshipModal(
                    subject,
                    selected,
                    function () {
                        _refresh();
                        _toast('Relationship created.', 'success');
                    },
                    { defaultType: 'committed' }
                );
            }
        });
    }

    /**
     * Projects a character for openRelationshipModal.
     *
     * openRelationshipModal expects at minimum { id, name, surname,
     * birthYear, isDeceased, deathYear }. CharacterQueries.getCharacterSummary
     * returns a projection with those fields (fullName / name / surname /
     * birthYear / isDeceased / deathYear). Try getCharacterSummary first;
     * fall back to getCharacterById; fall back to a minimal projection.
     */
    function _getCharacterProjection(characterId) {
        try {
            if (window.CharacterQueries
                && typeof window.CharacterQueries.getCharacterSummary === 'function') {
                var summary = window.CharacterQueries.getCharacterSummary(characterId);
                if (summary && _hasId(summary.id)) return summary;
            }
        } catch (e) { /* fall through */ }

        try {
            if (typeof window.getCharacterById === 'function') {
                var c = window.getCharacterById(characterId);
                if (c && _hasId(c.id)) {
                    return {
                        id: c.id,
                        name: c.name || '',
                        surname: c.surname || '',
                        fullName: (c.name || '') +
                            (c.surname ? ' ' + c.surname : ''),
                        birthYear: c.birthYear,
                        isDeceased: c.isDeceased === true,
                        deathYear: c.deathYear,
                        gender: c.gender || 'unknown'
                    };
                }
            }
        } catch (e) { /* fall through */ }

        return null;
    }

    function _findEntry(model, relationshipId) {
        if (!model || !_hasId(relationshipId)) return null;
        var lists = [model.current, model.former];
        for (var l = 0; l < lists.length; l++) {
            var list = lists[l];
            if (!Array.isArray(list)) continue;
            for (var i = 0; i < list.length; i++) {
                if (!list[i]) continue;
                var entryId = _getRelId(list[i]);
                if (entryId === relationshipId) return list[i];
            }
        }
        return null;
    }

    function _onViewRomance(btn, model) {
        if (typeof window.openModal !== 'function') {
            _toast('Modal system is not loaded.', 'error');
            return;
        }

        var relId = btn.getAttribute('data-relationship-id');
        if (!_hasId(relId)) {
            _toast('Relationship id is missing.', 'error');
            return;
        }

        var rel = _findEntry(model, relId);
        if (!rel) {
            _toast('Relationship not found.', 'error');
            return;
        }

        var content = '' +
            '<div class="character-modal character-romance-detail">' +
                '<div class="character-romance-detail__row">' +
                    '<div class="character-tab-field__label">Partner</div>' +
                    '<div class="character-tab-field__value">' +
                        _esc(rel.partnerName) +
                        (rel.partnerSurname ? ' ' + _esc(rel.partnerSurname) : '') +
                    '</div>' +
                '</div>' +
                '<div class="character-romance-detail__row">' +
                    '<div class="character-tab-field__label">Type</div>' +
                    '<div class="character-tab-field__value">' +
                        _esc(rel.typeName || rel.type) +
                    '</div>' +
                '</div>' +
                _detailRow('Status', rel.displayLabel) +
                _detailRow('Institution', rel.institutionName || '—') +
                _detailRow('Start year',
                    (typeof rel.startYear === 'number') ? _year(rel.startYear) : '—') +
                _detailRow('End year',
                    (typeof rel.endYear === 'number') ? _year(rel.endYear) : '—') +
                _detailRow('Duration',
                    (typeof rel.durationYears === 'number' && rel.durationYears > 0)
                        ? (rel.durationYears + ' years')
                        : '—') +
                _detailRow('Affair', rel.isAffair ? 'Yes' : 'No') +
                _detailRow('Polyamorous', rel.isPolyamorous ? 'Yes' : 'No') +
                _detailRow('Secret', rel.isSecret ? 'Yes' : 'No') +
                _detailRow('Scandalous', rel.isScandalous ? 'Yes' : 'No') +
                (Array.isArray(rel.attributes) && rel.attributes.length > 0
                    ? _detailRow('Attributes', rel.attributes.join(', '))
                    : '') +
                (rel.notes ? _detailRow('Notes', rel.notes) : '') +
            '</div>';

        var isActive = _findEntry(model, relId)
            && (_findEntryInList(model.current, relId) !== null);
        var editAvailable = isActive
            && window.RelationshipCommands
            && typeof window.RelationshipCommands.update === 'function';

        window.openModal({
            titleHtml: _esc('Relationship Details'),
            contentHtml: content,
            confirmText: editAvailable ? 'Edit' : 'Close',
            cancelText: editAvailable ? 'Close' : '',
            onConfirm: function () {
                if (!editAvailable) return;
                // Close the view modal and hand off to the edit modal
                // after the framework teardown (same pattern as
                // modals-friendship.js's view → edit handoff).
                setTimeout(function () {
                    _openEditModalForRelationship(relId);
                }, 0);
                return true;
            }
        });
    }

    function _findEntryInList(list, relationshipId) {
        if (!Array.isArray(list) || !_hasId(relationshipId)) return null;
        for (var i = 0; i < list.length; i++) {
            if (list[i] && _getRelId(list[i]) === relationshipId) {
                return list[i];
            }
        }
        return null;
    }

    function _detailRow(label, value) {
        return '<div class="character-romance-detail__row">' +
            '<div class="character-tab-field__label">' + _esc(label) + '</div>' +
            '<div class="character-tab-field__value">' + _esc(value) + '</div>' +
        '</div>';
    }

    function _onBreakUp(btn, characterId) {
        if (!window.RomanceCommands
            || typeof window.RomanceCommands.breakUp !== 'function') {
            _toast('Break up is not available.', 'error');
            return;
        }

        var relId = btn.getAttribute('data-relationship-id');
        if (!_hasId(relId)) {
            _toast('Relationship id is missing.', 'error');
            return;
        }

        var partnerId = btn.getAttribute('data-partner-id');
        var partnerName = '';
        try {
            var ps = partnerId ? _getCharacterProjection(partnerId) : null;
            if (ps) {
                partnerName = (ps.fullName && ps.fullName.length > 0)
                    ? ps.fullName
                    : (ps.name || partnerId);
            }
        } catch (e) { /* ignore */ }

        var confirmMessage = partnerName
            ? 'End the romantic relationship with ' + partnerName + '?'
            : 'End this romantic relationship?';

        if (typeof window.confirmDialog === 'function') {
            window.confirmDialog(confirmMessage, 'End Relationship', function () {
                _performBreakUp(relId, characterId);
            });
        } else if (window.confirm && window.confirm(confirmMessage)) {
            _performBreakUp(relId, characterId);
        }
    }

    function _performBreakUp(relationshipId, characterId) {
        var currentYear = 0;
        try { currentYear = window.getCurrentYear(); }
        catch (e) { currentYear = 0; }

        var result = window.RomanceCommands.breakUp(relationshipId, {
            endYear: currentYear,
            reason: 'breakup'
        });

        if (!result || result.success !== true) {
            var reason = (result && (result.message || result.reason))
                ? (result.message || result.reason)
                : 'unknown error';
            _toast('Failed to end relationship: ' + reason, 'error');
            return;
        }

        _toast('Relationship ended.', 'success');
        _refresh();
    }

    // =========================================================================
    // 8. EDIT MODAL
    // =========================================================================
    //
    // The edit modal edits exactly the fields that can be changed
    // without a status transition:
    //
    //   - Start Year (all romance archetypes): RelationshipCommands.update
    //   - Notes      (all romance archetypes): RelationshipCommands.update
    //   - Attributes (committed only):         RomanceCommands.addCommittedAttribute
    //                                          / removeCommittedAttribute, one
    //                                          call per diff
    //
    // Status is deliberately NOT editable here. Status transitions go
    // through the dedicated commands (RomanceCommands.breakUp,
    // RomanceCommands.deathEndsRelationship, AffairCommands.endAffair,
    // etc.), each of which consults its domain's transition table. A
    // status field in this form would be a second, untested path into
    // status mutation.
    //
    // The "End Relationship" secondary button hands off to the existing
    // break-up confirm flow (the same flow the row's Break up button
    // uses). Same pattern modals-friendship.js uses for "End Friendship"
    // inside its edit modal.

    function _onEditRomance(btn, model) {
        var relId = btn.getAttribute('data-relationship-id');
        if (!_hasId(relId)) {
            _toast('Relationship id is missing.', 'error');
            return;
        }
        if (!_findEntry(model, relId)) {
            _toast('Relationship not found.', 'error');
            return;
        }
        _openEditModalForRelationship(relId);
    }

    function _openEditModalForRelationship(relationshipId) {
        if (typeof window.openModal !== 'function') {
            _toast('Modal system is not loaded.', 'error');
            return;
        }
        if (!window.RelationshipCommands
            || typeof window.RelationshipCommands.update !== 'function') {
            _toast('Edit is not available (RelationshipCommands.update is missing).', 'error');
            return;
        }
        if (!window.RomanceQueries
            || typeof window.RomanceQueries.getRomanticRelationshipsBetween !== 'function') {
            _toast('Edit is not available (RomanceQueries is missing).', 'error');
            return;
        }

        // Live record read so the form and the dispatch work off the
        // current attributes, not a slice from a possibly-stale model.
        // We do not use RomanceQueries.getById — it does not exist;
        // we use the raw record via RelationshipQueries.getById, which
        // is the primitive the domain exposes for exactly this.
        var rec = null;
        try {
            if (window.RelationshipQueries
                && typeof window.RelationshipQueries.getById === 'function') {
                rec = window.RelationshipQueries.getById(relationshipId);
            }
        } catch (e) { rec = null; }

        if (!rec) {
            _toast('Relationship not found.', 'error');
            return;
        }
        if (rec.status !== 'ongoing') {
            _toast('This relationship is no longer active.', 'error');
            return;
        }

        var partnerId = rec.participantA === relationshipId
            ? rec.participantB
            : rec.participantA;
        // (participantA/B are ids, not the relationship id; the partner
        // resolution below uses them.)
        partnerId = (rec.participantA && rec.participantB)
            ? (rec.participantA === rec.participantB ? null : null)
            : null;
        // Resolve the partner relative to the character the tab is
        // showing. We don't have the subject id here (we're inside a
        // modal); but for display we only need *a* partner name, and
        // both participants are characters. Use getCharacterProjection
        // on both and pick the one that isn't the tab subject.
        //
        // The caller (_onViewRomance / _onEditRomance) already found
        // the entry in the model, so the display name comes from the
        // model entry. We re-derive here only for the form fields, and
        // we do not need participant identity for them.
        var startYear = (typeof rec.startYear === 'number') ? rec.startYear : 0;
        var notes = (rec.metadata && typeof rec.metadata.notes === 'string')
            ? rec.metadata.notes
            : '';
        var isCommitted = rec.type === 'committed';
        var currentAttributes = Array.isArray(rec.attributes)
            ? rec.attributes.slice()
            : [];
        var currentYear = 0;
        try { currentYear = window.getCurrentYear() || 0; } catch (e) { currentYear = 0; }

        var infoIcon = _icon('CIRCLE_DOT');
        var checkIcon = _icon('CHECK_SIMPLE');
        var editIcon = _icon('EDIT');
        var crossIcon = _icon('X_HEAVY');

        var html = '';

        // Start year + notes
        html +=
            '<div style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Start Year</label>' +
                '<input type="number" id="romEditYear" value="' + startYear + '" ' +
                    'min="1" max="' + (currentYear + 10) + '" ' +
                    'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
            '</div>' +
            '<div style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Notes (optional)</label>' +
                '<textarea id="romEditNotes" rows="2" ' +
                    'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
                    _esc(notes) +
                '</textarea>' +
            '</div>';

        // Attributes (committed only)
        if (isCommitted) {
            html += '<div style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Attributes</label>' +
                '<div style="background:var(--bg2);padding:12px;border-radius:8px;max-height:220px;overflow-y:auto;">';
            for (var i = 0; i < EDIT_ATTRIBUTE_ORDER.length; i++) {
                var attr = EDIT_ATTRIBUTE_ORDER[i];
                var checked = currentAttributes.indexOf(attr) !== -1;
                var label = _attributeDisplayName(attr);
                var iconName = _attributeIconName(attr);
                var iconSvg = iconName ? _icon(iconName) : '';
                html += '<label style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:0.65rem;cursor:pointer;">' +
                    '<input type="checkbox" class="rom-edit-attr-checkbox" value="' + _esc(attr) + '"' +
                        (checked ? ' checked' : '') + '>' +
                    (iconSvg ? iconSvg + ' ' : '') +
                    _esc(label) +
                '</label>';
            }
            html += '</div>' +
                '<small style="font-size:0.55rem;color:var(--dim);">' + infoIcon +
                    ' Attributes are validated by the romance rules; invalid combinations are rejected with a reason.</small>' +
            '</div>';
        }

        // End relationship secondary button (hands off to break-up flow)
        html += '<div style="display:flex;justify-content:flex-end;margin-top:12px;">' +
            '<button id="romEditEndBtn" type="button" ' +
                'style="background:#8a3020;color:white;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:0.65rem;">' +
                (crossIcon ? crossIcon + ' ' : '') + 'End Relationship' +
            '</button>' +
        '</div>';

        window.openModal({
            titleHtml: (editIcon ? editIcon + ' ' : '') + _esc('Edit Relationship'),
            contentHtml: html,
            confirmText: (checkIcon ? checkIcon + ' ' : '') + _esc('Save'),
            cancelText: 'Cancel',
            onMount: function (modalEl) {
                var endBtn = modalEl.querySelector('#romEditEndBtn');
                if (!endBtn) return;
                endBtn.addEventListener('click', function () {
                    // Close the edit modal and hand off to the existing
                    // break-up confirm flow, sequenced after teardown.
                    if (typeof window.closeTopModal === 'function') {
                        window.closeTopModal();
                    }
                    setTimeout(function () {
                        _promptBreakUpByRelationshipId(relationshipId);
                    }, 0);
                });
            },
            onConfirm: function (modalEl) {
                var yearEl = modalEl.querySelector('#romEditYear');
                var notesEl = modalEl.querySelector('#romEditNotes');
                if (!yearEl || !notesEl) {
                    _toast('Form missing', 'error');
                    return false;
                }

                var newYear = parseInt(yearEl.value, 10);
                var newNotes = notesEl.value || '';

                if (isNaN(newYear)) {
                    _toast('Invalid start year', 'error');
                    return false;
                }

                // 1) Dates + notes via RelationshipCommands.update.
                var updateResult = window.RelationshipCommands.update(
                    relationshipId,
                    {
                        startYear: newYear,
                        metadata: { notes: newNotes }
                    }
                );
                if (!updateResult || updateResult.success !== true) {
                    var reason = (updateResult && (updateResult.message || updateResult.reason))
                        ? (updateResult.message || updateResult.reason)
                        : 'unknown error';
                    _toast('Failed to update relationship: ' + reason, 'error');
                    return false;
                }

                // 2) Attributes (committed only). Diff against the
                // current set and dispatch one command per change so
                // RomanceRules.canAddAttribute / canRemoveAttribute and
                // validateAttributesForCulture run on every attribute.
                if (isCommitted) {
                    var desired = [];
                    var boxes = modalEl.querySelectorAll('.rom-edit-attr-checkbox:checked');
                    for (var b = 0; b < boxes.length; b++) {
                        desired.push(boxes[b].value);
                    }

                    var toAdd = [];
                    var toRemove = [];
                    var seen = {};
                    var i;
                    for (i = 0; i < desired.length; i++) seen[desired[i]] = true;
                    for (i = 0; i < desired.length; i++) {
                        if (currentAttributes.indexOf(desired[i]) === -1) {
                            toAdd.push(desired[i]);
                        }
                    }
                    for (i = 0; i < currentAttributes.length; i++) {
                        if (!seen[currentAttributes[i]]) {
                            toRemove.push(currentAttributes[i]);
                        }
                    }

                    var failures = [];

                    for (i = 0; i < toAdd.length; i++) {
                        var addRes = window.RomanceCommands
                            && typeof window.RomanceCommands.addCommittedAttribute === 'function'
                            ? window.RomanceCommands.addCommittedAttribute(relationshipId, toAdd[i])
                            : { success: false, message: 'addCommittedAttribute not available' };
                        if (!addRes || addRes.success !== true) {
                            failures.push({
                                op: 'add',
                                attribute: toAdd[i],
                                message: (addRes && (addRes.message || addRes.reason)) || 'unknown error'
                            });
                        }
                    }
                    for (i = 0; i < toRemove.length; i++) {
                        var rmRes = window.RomanceCommands
                            && typeof window.RomanceCommands.removeCommittedAttribute === 'function'
                            ? window.RomanceCommands.removeCommittedAttribute(relationshipId, toRemove[i])
                            : { success: false, message: 'removeCommittedAttribute not available' };
                        if (!rmRes || rmRes.success !== true) {
                            failures.push({
                                op: 'remove',
                                attribute: toRemove[i],
                                message: (rmRes && (rmRes.message || rmRes.reason)) || 'unknown error'
                            });
                        }
                    }

                    if (failures.length > 0) {
                        // Report the first failure reason; keep the modal
                        // open so the user can correct and retry. The
                        // successful changes are already committed; the
                        // user will see them reflected on the next
                        // refresh.
                        var f = failures[0];
                        _toast(
                            'Attribute change rejected (' + f.op + ' ' + f.attribute + '): ' + f.message,
                            'error'
                        );
                        _refresh();
                        return false;
                    }
                }

                _toast('Relationship updated.', 'success');
                _refresh();
                return true;
            }
        });
    }

    function _promptBreakUpByRelationshipId(relationshipId) {
        if (!window.RomanceCommands
            || typeof window.RomanceCommands.breakUp !== 'function') {
            _toast('Break up is not available.', 'error');
            return;
        }
        var message = 'End this romantic relationship?';
        var doBreakUp = function () {
            var currentYear = 0;
            try { currentYear = window.getCurrentYear(); }
            catch (e) { currentYear = 0; }
            var result = window.RomanceCommands.breakUp(relationshipId, {
                endYear: currentYear,
                reason: 'breakup'
            });
            if (!result || result.success !== true) {
                var reason = (result && (result.message || result.reason))
                    ? (result.message || result.reason)
                    : 'unknown error';
                _toast('Failed to end relationship: ' + reason, 'error');
                return;
            }
            _toast('Relationship ended.', 'success');
            _refresh();
        };
        if (typeof window.confirmDialog === 'function') {
            window.confirmDialog(message, 'End Relationship', doBreakUp);
        } else if (window.confirm && window.confirm(message)) {
            doBreakUp();
        }
    }

    /**
     * Display name for an attribute id. Uses RelationshipUI when
     * available, falls back to a humanised id.
     */
    function _attributeDisplayName(attr) {
        if (window.RelationshipUI
            && typeof window.RelationshipUI.attributeName === 'function') {
            var name = window.RelationshipUI.attributeName(attr);
            if (typeof name === 'string' && name.length > 0) return name;
        }
        return attr
            .replace(/_/g, ' ')
            .replace(/\b\w/g, function (ch) { return ch.toUpperCase(); });
    }

    function _attributeIconName(attr) {
        if (window.RelationshipUI
            && typeof window.RelationshipUI.attributeIcon === 'function') {
            var name = window.RelationshipUI.attributeIcon(attr);
            if (typeof name === 'string' && name.length > 0) return name;
        }
        return null;
    }

    // =========================================================================
    // 9. REGISTRATION
    // =========================================================================

    if (window.TabManager && typeof window.TabManager.register === 'function') {
        window.TabManager.register(SCOPE, TAB_ID, renderRomanceTab);
    } else if (typeof console !== 'undefined' && console.warn) {
        console.warn(
            'character-romance-tab.js: TabManager is not available; ' +
            'the tab was not registered.'
        );
    }

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

    window.CharacterRomanceTab = {
        id: TAB_ID,
        render: renderRomanceTab
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CharacterRomanceTab;
    }
})();
