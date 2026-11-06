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
 * relationship domain:
 *
 *   - Add Relationship    → openRelationshipModal (with
 *                            context.defaultType = 'committed')
 *   - Break up            → RomanceCommands.breakUp(relationshipId)
 *   - View / Edit         → info modal (phase 1); phase 2 adds
 *                            dedicated view/edit modals
 *
 * PHASE 1 (this revision) covers read + break-up + create. Phase 2 will
 * add the affairs section (active affairs, discovery rolls,
 * legitimization, reconciliation), the matchmaking affordances
 * (candidate discovery via MatchmakingQueries), and committed-attribute
 * editing via addCommittedAttribute / removeCommittedAttribute.
 *
 * PHASE 2 is deliberately not stubbed as an empty section here. When
 * it lands, it adds new collapsible sections to the same tab file.
 * Nothing in this file is designed to be replaced by phase 2; phase 2
 * is additive.
 *
 * RENDERER CONTRACT (from CharacterManagerBootstrap):
 *   fn(container, context)
 *   container  HTMLElement  — already emptied by TabManager
 *   context    { characterId, character }  — CharacterQueries projection
 *
 * DATA SOURCES:
 *   - CharacterViewModels.buildRomanceModel(characterId)
 *     Every section of this tab is rendered from that model. The tab
 *     does NOT call RomanceQueries directly for the list.
 *   - window.RomanceCommands.breakUp(relationshipId, options)
 *   - window.openRelationshipModal(subject, selected, onSuccess, context)
 *   - window.openCharacterSelector(options)   — for Add Relationship
 *
 * SECTIONS (each collapsible, all default expanded):
 *   - Current Relationships   active romance
 *   - Former Relationships    widowed + ended (displayLabel
 *                             distinguishes the two)
 *   - Statistics              counts, institutions
 *
 * FILTERS: none. The Romance list is short enough that a filter bar
 * would be noise. If it becomes needed, add a search field inside the
 * Current section and persist it via
 * CharacterUIState.setFilters('romance', characterId, {...}).
 *
 * COLLAPSED-STATE PERSISTENCE: global per-tab via
 *   CharacterUIState.getCollapsed('romance', sectionKey) /
 *   setCollapsed. Not per-character.
 *
 * DEPENDENCIES (required at load):
 *   - TabManager              (self-registration)
 *   - formatting.js           (escapeHtml, formatYear, formatCount,
 *                              formatDateRange)
 *   - icons.js                (Icons)
 *   - CharacterUIState        (collapsed state)
 *   - CharacterViewModels     (buildRomanceModel)
 *
 * DEPENDENCIES (optional, guarded at call time):
 *   - window.RomanceCommands.breakUp              Break up button
 *   - window.openRelationshipModal                Add Relationship
 *   - window.openCharacterSelector                Add Relationship
 *   - window.openModal / closeTopModal            info modal
 *   - window.showToast                            error surfacing
 *   - window.confirmDialog                        Break up confirmation
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
 *   Initial revision (phase 1).
 *     - Three collapsible sections: Current Relationships, Former
 *       Relationships, Statistics.
 *     - Add Relationship opens openRelationshipModal with
 *       defaultType = 'committed'. Uses openCharacterSelector to pick
 *       the partner first.
 *     - Break up opens a small confirm modal and calls
 *       RomanceCommands.breakUp. Single label for casual / one-night /
 *       committed (per project decision). The command's return status
 *       is respected; failures surface via toast.
 *     - View opens a read-only info modal that lists every field on
 *       the enriched romance entry. Phase 2 replaces this with a
 *       dedicated view modal.
 *     - displayLabel is rendered as a colored status line under the
 *       compact row. The color comes from typeColor; widowed labels
 *       use --dim, active uses --accent-dim, ended uses --dim.
 *     - Institutions are rendered as small badges next to the type
 *       label so a "married" relationship is legible without
 *       consulting attributes.
 *     - Former section shows displayLabel (distinguishes Widowed from
 *       Ended from Deceased). Read-only.
 *     - Rank policy indicator shown in the header when the subject's
 *       active rank allows multiple spouses. Cosmetic; it does not
 *       gate any action on this tab.
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
    //
    // Each row: compact character reference for the partner, a badge
    // row (type + institution + status), a status line ("Active" /
    // "Widowed" / "Ended" etc., from displayLabel), and action buttons.
    // Former rows are read-only (no Break up; View only).

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
        var viewEnabled = (window.openModal && typeof window.openModal === 'function');
        var breakEnabled = active
            && (window.RomanceCommands
                && typeof window.RomanceCommands.breakUp === 'function');

        var viewAttrs = viewEnabled ? '' : ' disabled title="Modal system not loaded"';
        var breakAttrs = breakEnabled ? '' : ' disabled title="Break up is not available"';

        var actions = '<div class="character-romance-actions">' +
            '<button type="button" class="character-tab-btn-small" ' +
                'data-action="view-romance" ' +
                'data-relationship-id="' + _esc(rel.relationshipId) + '" ' +
                viewAttrs + '>View</button>';

        if (active) {
            actions += '<button type="button" class="character-tab-btn-small danger" ' +
                'data-action="break-up" ' +
                'data-relationship-id="' + _esc(rel.relationshipId) + '" ' +
                'data-partner-id="' + _esc(rel.partnerId) + '" ' +
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

        return '' +
            '<div class="character-romance-row' +
                (rel.partnerIsDeceased ? ' is-partner-deceased' : '') +
                '" data-relationship-id="' + _esc(rel.relationshipId) + '">' +
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

    function _wire(container, characterId, model) {
        var headers = container.querySelectorAll('.character-tab-section__header');
        for (var i = 0; i < headers.length; i++) {
            headers[i].addEventListener('click', _onToggleSection);
        }

        container.addEventListener('click', function (e) {
            var target = e.target;

            var nameLink = target.closest
                ? target.closest('[data-character-id].character-row__name')
                : null;
            if (nameLink) {
                e.preventDefault();
                var linkCharId = nameLink.getAttribute('data-character-id');
                if (_hasId(linkCharId)) {
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
        });
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

        var subject;
        try { subject = window.CharacterQueries.getCharacterSummary(characterId); }
        catch (e) { subject = null; }
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

    function _findEntry(model, relationshipId) {
        if (!model || !_hasId(relationshipId)) return null;
        var lists = [model.current, model.former];
        for (var l = 0; l < lists.length; l++) {
            var list = lists[l];
            if (!Array.isArray(list)) continue;
            for (var i = 0; i < list.length; i++) {
                if (list[i] && list[i].relationshipId === relationshipId) {
                    return list[i];
                }
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

        window.openModal({
            titleHtml: _esc('Relationship Details'),
            contentHtml: content,
            confirmText: 'Close',
            cancelText: ''
        });
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
        if (!_hasId(relId)) return;

        var partnerId = btn.getAttribute('data-partner-id');
        var partnerName = '';
        try {
            var ps = partnerId
                ? window.CharacterQueries.getCharacterSummary(partnerId)
                : null;
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
    // 8. REGISTRATION
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
    // 9. EXPORTS
    // =========================================================================

    window.CharacterRomanceTab = {
        id: TAB_ID,
        render: renderRomanceTab
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CharacterRomanceTab;
    }
})();
