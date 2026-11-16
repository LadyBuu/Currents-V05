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
 * current romantic relationships, active affairs, former (widowed or
 * ended) relationships, and aggregate statistics. All writes delegate
 * to the relationship domain.
 *
 * WRITE AFFORDANCES
 *
 *   Header
 *     Add Relationship   openCharacterSelector then
 *                        openRelationshipModal(defaultType: 'committed')
 *                        — a legitimate (non-affair) relationship
 *     Create Affair      openCharacterSelector then
 *                        AffairCommands.createAffair(...)
 *                        — an illegitimate (affair) relationship; the
 *                        SECRET attribute is what makes it an affair
 *                        (RomanceRules.isAffair is the sole definition)
 *
 *   Current Relationships (committed / casual / one-night, active)
 *     View               read-only info modal
 *     Edit               openEditRomanceModal (this file)
 *     Break up           confirmDialog + RomanceCommands.breakUp
 *
 *   Affairs (active affairs — committed + SECRET)
 *     View               read-only info modal (includes discovery state)
 *     Edit               openEditRomanceModal (affair-aware: discovery
 *                        state is read-only, Affair Type + Public
 *                        Behavior are editable)
 *     Reveal             draw a roll + AffairCommands.rollDiscovery;
 *                        hidden once the affair is discovered
 *     End                confirmDialog + AffairCommands.endAffair
 *
 *   Former Relationships (widowed / ended — includes ended affairs)
 *     View               read-only info modal
 *                        (no Edit / Break up / Reveal / End)
 *
 * EDIT DISPATCH
 *
 *   The edit modal edits exactly the fields that can be changed
 *   without a status transition:
 *
 *     - Start Year    (all romance archetypes): RelationshipCommands.update
 *     - Notes         (all romance archetypes): RelationshipCommands.update
 *     - Attributes    (committed only):         RomanceCommands.addCommittedAttribute
 *                                               / removeCommittedAttribute,
 *                                               one call per diff
 *     - Affair Type   (affair only):            RelationshipCommands.update
 *                                               (metadata.affairType)
 *     - Public Behavior (affair only):          RelationshipCommands.update
 *                                               (metadata.publicBehavior)
 *
 *   Discovery state (discovered / discoveryYear / discoveryCircumstances /
 *   discovererId) is NEVER editable here. It is written only by
 *   AffairCommands.rollDiscovery, so the affair-rules policy is the
 *   single source of truth for "was it discovered".
 *
 *   Status is never editable here. Status transitions route through the
 *   dedicated commands (RomanceCommands.breakUp,
 *   RomanceCommands.deathEndsRelationship, AffairCommands.endAffair,
 *   etc.), each of which consults its domain's transition table.
 *
 * REVEAL DISPATCH
 *
 *   The Reveal button draws one roll from window.Random.next (or the
 *   randomNext fallback) and passes it to AffairCommands.rollDiscovery
 *   as options.roll. This means the tab controls the RNG stream: the
 *   roll is deterministic against a fixed seed for playtest, and the
 *   affair command never implicitly consumes a draw the caller was
 *   relying on being consumed elsewhere.
 *
 *   If window.Random is not loaded, the Reveal button renders disabled
 *   with an explanatory title. The rest of the tab still works.
 *
 * DISCOVERY IN THE UI
 *
 *   An active affair renders with:
 *
 *     - An "Affair" badge (same as the previous round) so it is
 *       visually distinct from a legitimate committed relationship
 *       with the same type label.
 *     - A discovery status line under the meta line:
 *
 *         "Discovery: not yet discovered"        (if !discovered)
 *         "Discovered: Year N — <circumstances>" (if discovered)
 *
 *     - A "Reveal" button when !discovered, an "End" button always.
 *       The Reveal button is disabled if window.Random is missing.
 *
 *   A discovered affair's Reveal button is not rendered; only End is.
 *   Re-rolling a discovered affair is not supported — that is a
 *   domain-level decision, not a UI one, and the affair command itself
 *   returns { alreadyDiscovered: true } if it is reached again.
 *
 * SECTION ORDER
 *
 *   1. Current Relationships   active legitimate romance
 *   2. Affairs                 active affairs (committed + SECRET)
 *   3. Former Relationships    widowed + ended (both legitimate + affairs)
 *   4. Statistics              counts, institutions
 *
 *   The Affairs section is hidden when it would be empty AND the
 *   subject has no active affairs. It is shown when the subject has
 *   active affairs, or when the model's affairs list failed to load
 *   (so the user sees the error, not a silently empty section). An
 *   empty Affairs section with "No active affairs" is shown when the
 *   subject has none — the section header's count is 0.
 *
 * RENDERER CONTRACT (from CharacterManagerBootstrap):
 *   fn(container, context)
 *   container  HTMLElement  — already emptied by TabManager
 *   context    { characterId, character }  — CharacterQueries projection
 *
 * DATA SOURCES:
 *   - CharacterViewModels.buildRomanceModel(characterId)
 *     (the model now also carries `affairs` and `affairsError`; see
 *     the view-models one-liner below for the required additive
 *     change. If the model does not carry affairs, the tab derives
 *     them from model.current by filtering isAffair === true. This
 *     fallback means the tab works with the current view-models
 *     unchanged; the additive view-models change is cosmetic.)
 *   - window.RomanceCommands.breakUp / addCommittedAttribute /
 *     removeCommittedAttribute
 *   - window.AffairCommands.createAffair / rollDiscovery / endAffair
 *   - window.RelationshipCommands.update
 *   - window.RomanceQueries / window.RelationshipQueries (live-record
 *     reads for the edit modal)
 *   - window.openRelationshipModal / window.openCharacterSelector
 *   - window.openModal / closeTopModal
 *   - window.Random.next / window.randomNext (Reveal roll)
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
 *   - window.RomanceCommands                  breakUp,
 *                                              addCommittedAttribute,
 *                                              removeCommittedAttribute
 *   - window.AffairCommands                   createAffair, rollDiscovery,
 *                                              endAffair
 *   - window.RelationshipCommands.update      edit dispatch
 *   - window.RelationshipQueries.getById      live-record read in edit modal
 *   - window.RomanceQueries                   not required (edit modal
 *                                              uses RelationshipQueries)
 *   - window.Random / randomNext              Reveal roll
 *   - window.openRelationshipModal            Add Relationship
 *   - window.openCharacterSelector            Add Relationship / Create Affair
 *   - window.openModal / closeTopModal        all modals
 *   - window.showToast                        error surfacing
 *   - window.confirmDialog                    Break up / End Affair
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
 *     - Affairs are integrated into the tab. New section between
 *       Current and Former. New Create Affair header button. Per-affair
 *       actions: View, Edit, Reveal, End.
 *
 *     - Model affairs list: prefers model.affairs if the view model
 *       exposes it (additive change documented in the view-models
 *       one-liner below); falls back to filtering model.current by
 *       isAffair === true, which works with the current view-models
 *       unchanged. So the tab works in both configurations.
 *
 *     - Affair-aware edit modal: editable Affair Type and Public
 *       Behavior; read-only discovery state (year, circumstances,
 *       discoverer). Discovery state is written only by
 *       AffairCommands.rollDiscovery; editable fields dispatch through
 *       RelationshipCommands.update (metadata) and
 *       RomanceCommands.addCommittedAttribute / removeCommittedAttribute
 *       (attributes), same as the non-affair path.
 *
 *     - Reveal button draws one roll from window.Random.next (or
 *       randomNext) and passes it to AffairCommands.rollDiscovery as
 *       options.roll. This keeps the tab in control of the RNG stream
 *       (deterministic against a fixed seed for playtest) and prevents
 *       the affair command from implicitly consuming a draw the caller
 *       was relying on being consumed elsewhere.
 *
 *     - Every affair command is guarded at call time (see
 *       AFFAIR COMMAND AVAILABILITY). Missing commands render disabled
 *       buttons with explanatory titles, not silent no-ops. Matches
 *       the location tab's disabled-with-title discipline.
 *
 *     - Statistics section gains "Active affairs" (already present in
 *       the stats projection as activeAffairs) and a "Discovered
 *       affairs" count derived from the affair list.
 *
 *   Previous revision (this file):
 *     - FIXED: "Relationship not found." toast on View after any
 *       refresh. The tab used to register a container-level click
 *       listener on every render and never remove it; N listeners
 *       accumulated, each holding a stale model snapshot. Clicking
 *       View fired the oldest one first and missed. _wire now removes
 *       the previous handler before installing the next one.
 *     - Added _getRelId(rel), used by _actionsHtml, _romanceRowHtml,
 *       and _findEntry. Tolerant of relationshipId / id /
 *       relationship_id.
 *     - Added Edit affordance: Edit button, _onEditRomance, and
 *       openEditRomanceModal. Real editable form for Start Year,
 *       Notes, Attributes (committed only). Status not editable.
 *     - View modal footer gained an Edit button.
 *
 *   Initial revision (phase 1):
 *     - Three collapsible sections; Add Relationship; Break up; View.
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
        { key: 'affairs', label: 'Affairs',               icon: 'LOCK' },
        { key: 'former',  label: 'Former Relationships',  icon: 'STATUS_ENDED' },
        { key: 'stats',   label: 'Statistics',            icon: 'CENSUS' }
    ];

    var ARCHETYPE_LABEL = {
        casual_dating:   'Casual',
        one_night_stand: 'One Night',
        committed:       'Committed'
    };

    var AFFAIR_TYPE_LABEL = {
        secret:    'Secret',
        open:      'Open',
        emotional: 'Emotional',
        one_night: 'One Night'
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
     *      `id` instead of `relationshipId`.
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

    /**
     * True when the relationship is an affair.
     *
     * The model's entry carries isAffair (from the projection). We
     * prefer that flag; if it is absent we check for the SECRET
     * attribute, which is the canonical definition per
     * RomanceRules.isAffair. This keeps the tab working even if the
     * model's isAffair field is dropped in a future revision.
     */
    function _isAffair(rel) {
        if (!rel) return false;
        if (rel.isAffair === true) return true;
        return Array.isArray(rel.attributes)
            && rel.attributes.indexOf('secret') !== -1;
    }

    // =========================================================================
    // 2. AFFAIR COMMAND AVAILABILITY
    // =========================================================================
    //
    // Every affair command is optional at load (AffairCommands is not in
    // relationships-bootstrap.js's REQUIRED_MODULES). The tab guards each
    // call at call time and renders disabled buttons with explanatory
    // titles when a command is missing.

    function _affairCommandsAvailable() {
        return window.AffairCommands
            && typeof window.AffairCommands === 'object';
    }

    function _canCreateAffair() {
        return _affairCommandsAvailable()
            && typeof window.AffairCommands.createAffair === 'function'
            && window.openCharacterSelector
            && typeof window.openCharacterSelector === 'function';
    }

    function _canRevealAffair() {
        if (!_affairCommandsAvailable()) return false;
        if (typeof window.AffairCommands.rollDiscovery !== 'function') return false;
        if (window.Random && typeof window.Random.next === 'function') return true;
        if (typeof window.randomNext === 'function') return true;
        return false;
    }

    function _canEndAffair() {
        return _affairCommandsAvailable()
            && typeof window.AffairCommands.endAffair === 'function';
    }

    function _canRollRandom() {
        if (window.Random && typeof window.Random.next === 'function') return true;
        if (typeof window.randomNext === 'function') return true;
        return false;
    }

    function _drawRoll() {
        if (window.Random && typeof window.Random.next === 'function') {
            return window.Random.next();
        }
        if (typeof window.randomNext === 'function') {
            return window.randomNext();
        }
        throw new Error('randomness service required');
    }

    // =========================================================================
    // 3. SECTION SHELL
    // =========================================================================

    function _sectionHtml(section, bodyHtml, count) {
        var collapsed = _isCollapsed(section.key);
        var cls = 'character-tab-section' + (collapsed ? '' : ' is-expanded');
        var ariaExpanded = collapsed ? 'false' : 'true';
        var countHtml = (typeof count === 'number')
            ? '<span class="character-family-section-count">' + count + '</span>'
            : '';
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
                    countHtml +
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
    // 4. ROMANCE ROW RENDERING
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

    function _actionsHtml(rel, active, options) {
        options = options || {};
        var relId = _getRelId(rel);
        var isAffair = _isAffair(rel);

        var viewEnabled = _hasId(relId)
            && window.openModal
            && typeof window.openModal === 'function';

        var editEnabled = active
            && _hasId(relId)
            && window.RelationshipCommands
            && typeof window.RelationshipCommands.update === 'function';

        var breakEnabled = !isAffair
            && active
            && _hasId(relId)
            && window.RomanceCommands
            && typeof window.RomanceCommands.breakUp === 'function';

        var revealEnabled = isAffair
            && active
            && _hasId(relId)
            && _canRevealAffair()
            && (rel.discovered !== true);

        var endAffairEnabled = isAffair
            && active
            && _hasId(relId)
            && _canEndAffair();

        var viewAttrs = viewEnabled ? '' : ' disabled title="View is not available"';
        var editAttrs = editEnabled ? '' : ' disabled title="Edit is not available"';
        var breakAttrs = breakEnabled ? '' : ' disabled title="Break up is not available"';
        var revealAttrs = revealEnabled ? '' : ' disabled title="Reveal is not available"';
        var endAffairAttrs = endAffairEnabled ? '' : ' disabled title="End Affair is not available"';

        var actions = '<div class="character-romance-actions">' +
            '<button type="button" class="character-tab-btn-small" ' +
                'data-action="view-romance" ' +
                'data-relationship-id="' + _esc(relId || '') + '" ' +
                viewAttrs + '>View</button>';

        if (active) {
            actions += '<button type="button" class="character-tab-btn-small" ' +
                'data-action="edit-romance" ' +
                'data-relationship-id="' + _esc(relId || '') + '" ' +
                editAttrs + '>Edit</button>';

            if (isAffair) {
                actions += '<button type="button" class="character-tab-btn-small" ' +
                    'data-action="reveal-affair" ' +
                    'data-relationship-id="' + _esc(relId || '') + '" ' +
                    revealAttrs + '>Reveal</button>' +
                    '<button type="button" class="character-tab-btn-small danger" ' +
                    'data-action="end-affair" ' +
                    'data-relationship-id="' + _esc(relId || '') + '" ' +
                    endAffairAttrs + '>End</button>';
            } else {
                actions += '<button type="button" class="character-tab-btn-small danger" ' +
                    'data-action="break-up" ' +
                    'data-relationship-id="' + _esc(relId || '') + '" ' +
                    'data-partner-id="' + _esc(rel.partnerId || '') + '" ' +
                    breakAttrs + '>Break up</button>';
            }
        }

        actions += '</div>';
        return actions;
    }

    function _discoveryLineHtml(rel) {
        if (!_isAffair(rel)) return '';
        if (rel.discovered === true) {
            var bits = [];
            if (typeof rel.discoveryYear === 'number') {
                bits.push('year ' + _year(rel.discoveryYear));
            }
            if (rel.discoveryCircumstances) {
                bits.push(rel.discoveryCircumstances);
            }
            if (rel.discovererName) {
                bits.push('by ' + rel.discovererName);
            }
            return '<div class="character-romance-status is-widowed" ' +
                'style="margin-top:4px;">' +
                _icon('WARNING') + ' Discovered' +
                (bits.length > 0 ? ' — ' + _esc(bits.join(' · ')) : '') +
            '</div>';
        }
        return '<div class="character-romance-status" style="margin-top:4px;color:var(--dim);">' +
            _icon('CIRCLE_DOT') + ' Not yet discovered' +
        '</div>';
    }

    function _romanceRowHtml(rel, active, options) {
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
                (_isAffair(rel) ? ' is-affair' : '') +
                '" data-relationship-id="' + _esc(relId) + '">' +
                '<div class="character-romance-row__main">' +
                    compact +
                    _badgesHtml(rel) +
                    _metaLineHtml(rel) +
                    _statusLineHtml(rel) +
                    _discoveryLineHtml(rel) +
                '</div>' +
                _actionsHtml(rel, active, options) +
            '</div>';
    }

    // =========================================================================
    // 5. SECTION BODIES
    // =========================================================================

    function _bodyCurrent(model) {
        if (model.current === null || !Array.isArray(model.current)) {
            var err = model.errors && model.errors.current
                ? model.errors.current
                : 'unknown error';
            return _unavailable('Current relationships could not be loaded: ' + err);
        }
        var list = model.current;
        if (list.length === 0) {
            return _empty('No current romantic relationships. Use "Add Relationship" to create one.');
        }
        var html = '';
        for (var i = 0; i < list.length; i++) {
            html += _romanceRowHtml(list[i], true);
        }
        return html;
    }

    /**
     * Active affairs.
     *
     * Prefers model.affairs when the view model exposes it; otherwise
     * derives it by filtering model.current for isAffair === true.
     * The fallback works with the current character-view-models.js
     * unchanged, so the tab is forward- and backward-compatible.
     */
    function _getActiveAffairs(model) {
        if (Array.isArray(model.affairs)) return model.affairs;
        var out = [];
        var list = Array.isArray(model.current) ? model.current : [];
        for (var i = 0; i < list.length; i++) {
            if (_isAffair(list[i])) out.push(list[i]);
        }
        return out;
    }

    function _bodyAffairs(model) {
        var affairs = _getActiveAffairs(model);
        if (affairs.length === 0) {
            return _empty(
                'No active affairs. Use "Create Affair" to start one.'
            );
        }
        var html = '';
        for (var i = 0; i < affairs.length; i++) {
            html += _romanceRowHtml(affairs[i], true);
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
        var affairs = _getActiveAffairs(model);
        var discoveredCount = 0;
        for (var a = 0; a < affairs.length; a++) {
            if (affairs[a].discovered === true) discoveredCount++;
        }

        var html = '<div class="character-romance-stats">';

        html += _statField('Total relationships', String(s.totalRelationships || 0));
        html += _statField('Active relationships', String(s.activeRelationships || 0));
        html += _statField('Active committed', String(s.activeCommitted || 0));
        html += _statField('Active casual', String(s.activeCasual || 0));
        html += _statField('Active one-night', String(s.activeOneNight || 0));
        html += _statField('Active affairs', String(s.activeAffairs || 0));
        html += _statField('Discovered affairs', String(discoveredCount));

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
    // 6. RENDER
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

        var createAffairEnabled = _canCreateAffair();

        var addAttrs = addEnabled
            ? ''
            : ' disabled title="Add Relationship requires the relationship modal and the character selector to be loaded"';
        var createAffairAttrs = createAffairEnabled
            ? ''
            : ' disabled title="Create Affair requires AffairCommands and the character selector to be loaded"';

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
                    '<button type="button" class="character-tab-btn" ' +
                        'data-action="create-affair"' + createAffairAttrs + '>' +
                        _icon('LOCK') + ' Create Affair' +
                    '</button>' +
                '</div>' +
            '</div>';

        var affairs = _getActiveAffairs(model);

        var body = '';
        body += headerHtml;
        body += _sectionHtml(SECTIONS[0], _bodyCurrent(model));
        body += _sectionHtml(SECTIONS[1], _bodyAffairs(model), affairs.length);
        body += _sectionHtml(SECTIONS[2], _bodyFormer(model));
        body += _sectionHtml(SECTIONS[3], _bodyStats(model));

        container.innerHTML = body;
        _wire(container, context.characterId, model);
    }

    // =========================================================================
    // 7. WIRING
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
        var headers = container.querySelectorAll('.character-tab-section__header');
        for (var i = 0; i < headers.length; i++) {
            headers[i].addEventListener('click', _onToggleSection);
        }

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
            case 'create-affair':
                _onCreateAffair(characterId); return;
            case 'view-romance':
                _onViewRomance(btn, model); return;
            case 'edit-romance':
                _onEditRomance(btn, model); return;
            case 'break-up':
                _onBreakUp(btn, characterId); return;
            case 'reveal-affair':
                _onRevealAffair(btn, model); return;
            case 'end-affair':
                _onEndAffair(btn, model); return;
            default:
                if (typeof console !== 'undefined' && console.warn) {
                    console.warn('[romance-tab] unknown action: ' + action);
                }
        }
    }

    // =========================================================================
    // 8. ACTION IMPLEMENTATIONS — ADD / CREATE
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

    function _onCreateAffair(characterId) {
        if (typeof window.openCharacterSelector !== 'function') {
            _toast('Character selector is not loaded; cannot create an affair.', 'error');
            return;
        }
        if (!_affairCommandsAvailable()
            || typeof window.AffairCommands.createAffair !== 'function') {
            _toast('Affair commands are not loaded; cannot create an affair.', 'error');
            return;
        }

        var subject = _getCharacterProjection(characterId);
        if (!subject) {
            _toast('Subject character not found.', 'error');
            return;
        }

        window.openCharacterSelector({
            title: 'Select Affair Partner for ' + (subject.name || 'this character'),
            excludeIds: [characterId],
            filters: {
                status: 'living',
                showDeceased: true
            },
            onSelect: function (selected) {
                if (!selected || !_hasId(selected.id)) return;
                if (selected.id === characterId) {
                    _toast('A character cannot have an affair with themselves.', 'error');
                    return;
                }
                _promptCreateAffair(subject.id, selected.id);
            }
        });
    }

    /**
     * Options form for createAffair. Opens a small modal with:
     *   - Affair Type select (secret | open | emotional | one_night)
     *   - Start Year
     *   - Notes
     *   - "Scandalous if discovered" checkbox (maps to isScandalous)
     *
     * On confirm dispatches AffairCommands.createAffair and refreshes.
     */
    function _promptCreateAffair(idA, idB) {
        if (typeof window.openModal !== 'function') {
            _toast('Modal system is not loaded.', 'error');
            return;
        }

        var currentYear = 0;
        try { currentYear = window.getCurrentYear() || 0; } catch (e) { currentYear = 0; }

        var infoIcon = _icon('CIRCLE_DOT');
        var checkIcon = _icon('CHECK_SIMPLE');
        var lockIcon = _icon('LOCK');

        var typeOptions = '';
        var types = ['secret', 'open', 'emotional', 'one_night'];
        for (var t = 0; t < types.length; t++) {
            var typeId = types[t];
            var typeLabel = AFFAIR_TYPE_LABEL[typeId] || typeId;
            typeOptions += '<option value="' + _esc(typeId) + '"' +
                (typeId === 'secret' ? ' selected' : '') + '>' +
                _esc(typeLabel) +
            '</option>';
        }

        var content = '' +
            '<div style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Affair Type</label>' +
                '<select id="affCreateType" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
                    typeOptions +
                '</select>' +
                '<small style="font-size:0.55rem;color:var(--dim);">' + infoIcon +
                    ' The relationship will be marked SECRET regardless of the label; the type is metadata for UI display.</small>' +
            '</div>' +
            '<div style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Start Year</label>' +
                '<input type="number" id="affCreateYear" value="' + currentYear + '" ' +
                    'min="1" max="' + (currentYear + 10) + '" ' +
                    'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
            '</div>' +
            '<div style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Notes (optional)</label>' +
                '<textarea id="affCreateNotes" rows="2" ' +
                    'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);"></textarea>' +
            '</div>' +
            '<div style="margin-bottom:12px;">' +
                '<label style="display:flex;align-items:center;gap:8px;font-size:0.65rem;cursor:pointer;">' +
                    '<input type="checkbox" id="affCreateScandalous">' +
                    'Scandalous if discovered' +
                '</label>' +
            '</div>';

        window.openModal({
            titleHtml: (lockIcon ? lockIcon + ' ' : '') + _esc('Create Affair'),
            contentHtml: content,
            confirmText: (checkIcon ? checkIcon + ' ' : '') + _esc('Create'),
            cancelText: 'Cancel',
            onConfirm: function (modalEl) {
                var typeEl = modalEl.querySelector('#affCreateType');
                var yearEl = modalEl.querySelector('#affCreateYear');
                var notesEl = modalEl.querySelector('#affCreateNotes');
                var scandalEl = modalEl.querySelector('#affCreateScandalous');

                if (!typeEl || !yearEl) {
                    _toast('Form missing', 'error');
                    return false;
                }

                var startYear = parseInt(yearEl.value, 10);
                if (isNaN(startYear)) {
                    _toast('Invalid start year', 'error');
                    return false;
                }

                var result = window.AffairCommands.createAffair(idA, idB, {
                    affairType: typeEl.value,
                    startYear: startYear,
                    notes: notesEl ? (notesEl.value || '') : '',
                    isScandalous: !!(scandalEl && scandalEl.checked)
                });

                if (!result || result.success !== true) {
                    var reason = (result && (result.message || result.reason))
                        ? (result.message || result.reason)
                        : 'unknown error';
                    _toast('Failed to create affair: ' + reason, 'error');
                    return false;
                }

                _toast('Affair created.', 'success');
                _refresh();
                return true;
            }
        });
    }

    /**
     * Projects a character for openRelationshipModal / openCharacterSelector.
     *
     * CharacterQueries.getCharacterSummary returns the projection the
     * modal needs (id, name, surname, birthYear, isDeceased, deathYear,
     * gender). We try it first; fall back to getCharacterById; fall back
     * to null.
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

    // =========================================================================
    // 9. ACTION IMPLEMENTATIONS — VIEW / EDIT / BREAK UP
    // =========================================================================

    function _findEntry(model, relationshipId) {
        if (!model || !_hasId(relationshipId)) return null;
        var lists = [model.current, model.former, model.affairs];
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

    function _findEntryInList(list, relationshipId) {
        if (!Array.isArray(list) || !_hasId(relationshipId)) return null;
        for (var i = 0; i < list.length; i++) {
            if (list[i] && _getRelId(list[i]) === relationshipId) {
                return list[i];
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

        var isAffair = _isAffair(rel);
        var isActive = _findEntryInList(model.current, relId) !== null
            || _findEntryInList(model.affairs, relId) !== null;

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
                (isAffair
                    ? _detailRow('Affair Type',
                        AFFAIR_TYPE_LABEL[rel.affairType] || rel.affairType || '—')
                    : '') +
                (isAffair
                    ? _detailRow('Discovered',
                        rel.discovered === true ? 'Yes' : 'No')
                    : '') +
                (isAffair && rel.discovered === true && typeof rel.discoveryYear === 'number'
                    ? _detailRow('Discovery year', _year(rel.discoveryYear))
                    : '') +
                (isAffair && rel.discovered === true && rel.discoveryCircumstances
                    ? _detailRow('Discovery circumstances', rel.discoveryCircumstances)
                    : '') +
                (isAffair && rel.discovered === true && rel.discovererName
                    ? _detailRow('Discovered by', rel.discovererName)
                    : '') +
                (isAffair
                    ? _detailRow('Public behavior', rel.publicBehavior === true ? 'Yes' : 'No')
                    : '') +
                _detailRow('Affair', rel.isAffair ? 'Yes' : 'No') +
                _detailRow('Polyamorous', rel.isPolyamorous ? 'Yes' : 'No') +
                _detailRow('Secret', rel.isSecret ? 'Yes' : 'No') +
                _detailRow('Scandalous', rel.isScandalous ? 'Yes' : 'No') +
                (Array.isArray(rel.attributes) && rel.attributes.length > 0
                    ? _detailRow('Attributes', rel.attributes.join(', '))
                    : '') +
                (rel.notes ? _detailRow('Notes', rel.notes) : '') +
            '</div>';

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
                setTimeout(function () {
                    _openEditModalForRelationship(relId);
                }, 0);
                return true;
            }
        });
    }

    function _detailRow(label, value) {
        return '<div class="character-romance-detail__row">' +
            '<div class="character-tab-field__label">' + _esc(label) + '</div>' +
            '<div class="character-tab-field__value">' + _esc(value) + '</div>' +
        '</div>';
    }

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

    // =========================================================================
    // 10. EDIT MODAL
    // =========================================================================
    //
    // The edit modal edits exactly the fields that can be changed
    // without a status transition:
    //
    //   - Start Year        (all archetypes):   RelationshipCommands.update
    //   - Notes             (all archetypes):   RelationshipCommands.update
    //   - Attributes        (committed only):   RomanceCommands.addCommittedAttribute
    //                                           / removeCommittedAttribute
    //   - Affair Type       (affair only):      RelationshipCommands.update
    //                                           (metadata.affairType)
    //   - Public Behavior   (affair only):      RelationshipCommands.update
    //                                           (metadata.publicBehavior)
    //
    // Discovery state (discovered / discoveryYear / discoveryCircumstances
    // / discovererId) is NEVER editable here. It is written only by
    // AffairCommands.rollDiscovery. The edit modal shows the current
    // discovery state as read-only text.
    //
    // Status is never editable here. Status transitions route through the
    // dedicated commands (RomanceCommands.breakUp,
    // RomanceCommands.deathEndsRelationship, AffairCommands.endAffair,
    // etc.), each of which consults its domain's transition table. The
    // "End Relationship" / "End Affair" secondary button hands off to
    // the appropriate command.

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

        var startYear = (typeof rec.startYear === 'number') ? rec.startYear : 0;
        var notes = (rec.metadata && typeof rec.metadata.notes === 'string')
            ? rec.metadata.notes
            : '';
        var isCommitted = rec.type === 'committed';
        var isAffair = Array.isArray(rec.attributes)
            && rec.attributes.indexOf('secret') !== -1;

        var currentAttributes = Array.isArray(rec.attributes)
            ? rec.attributes.slice()
            : [];
        var currentAffairType = (rec.metadata && typeof rec.metadata.affairType === 'string')
            ? rec.metadata.affairType
            : 'secret';
        var currentPublicBehavior = !!(rec.metadata && rec.metadata.publicBehavior === true);
        var discovered = !!(rec.metadata && rec.metadata.discovered === true);
        var discoveryYear = (rec.metadata && typeof rec.metadata.discoveryYear === 'number')
            ? rec.metadata.discoveryYear
            : null;
        var discoveryCircumstances = (rec.metadata && typeof rec.metadata.discoveryCircumstances === 'string')
            ? rec.metadata.discoveryCircumstances
            : '';
        var discovererId = (rec.metadata && typeof rec.metadata.discovererId === 'string')
            ? rec.metadata.discovererId
            : null;

        var currentYear = 0;
        try { currentYear = window.getCurrentYear() || 0; } catch (e) { currentYear = 0; }

        var infoIcon = _icon('CIRCLE_DOT');
        var checkIcon = _icon('CHECK_SIMPLE');
        var editIcon = _icon('EDIT');
        var crossIcon = _icon('X_HEAVY');
        var warningIcon = _icon('WARNING');

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

        // Affair-specific fields
        if (isAffair) {
            var typeOptions = '';
            var types = ['secret', 'open', 'emotional', 'one_night'];
            for (var t = 0; t < types.length; t++) {
                var typeId = types[t];
                var typeLabel = AFFAIR_TYPE_LABEL[typeId] || typeId;
                typeOptions += '<option value="' + _esc(typeId) + '"' +
                    (typeId === currentAffairType ? ' selected' : '') + '>' +
                    _esc(typeLabel) +
                '</option>';
            }

            html += '<div style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Affair Type</label>' +
                '<select id="romEditAffairType" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
                    typeOptions +
                '</select>' +
            '</div>' +
            '<div style="margin-bottom:12px;">' +
                '<label style="display:flex;align-items:center;gap:8px;font-size:0.65rem;cursor:pointer;">' +
                    '<input type="checkbox" id="romEditPublicBehavior"' +
                        (currentPublicBehavior ? ' checked' : '') + '>' +
                    'Public behavior' +
                '</label>' +
            '</div>';

            // Discovery state — read-only
            html += '<div style="background:var(--bg2);padding:8px;border-radius:6px;margin-bottom:12px;font-size:0.65rem;">' +
                '<div style="color:var(--accent);font-weight:600;margin-bottom:4px;">' + infoIcon + ' Discovery State</div>';
            if (discovered) {
                html += '<div>' + warningIcon + ' Discovered' +
                    (discoveryYear !== null ? ' in ' + _year(discoveryYear) : '') +
                    (discoveryCircumstances ? ' — ' + _esc(discoveryCircumstances) : '') +
                    (discovererId ? ' (by ' + _esc(discovererId) + ')' : '') +
                '</div>' +
                '<div style="color:var(--dim);margin-top:4px;">' +
                    'Discovery state cannot be edited. It is written only by the discovery roll.' +
                '</div>';
            } else {
                html += '<div>Not yet discovered.</div>' +
                '<div style="color:var(--dim);margin-top:4px;">' +
                    'Use the Reveal button on the row to attempt discovery.' +
                '</div>';
            }
            html += '</div>';
        }

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

        // End relationship / End affair secondary button
        var endLabel = isAffair ? 'End Affair' : 'End Relationship';
        html += '<div style="display:flex;justify-content:flex-end;margin-top:12px;">' +
            '<button id="romEditEndBtn" type="button" ' +
                'style="background:#8a3020;color:white;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:0.65rem;">' +
                (crossIcon ? crossIcon + ' ' : '') + _esc(endLabel) +
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
                    if (typeof window.closeTopModal === 'function') {
                        window.closeTopModal();
                    }
                    setTimeout(function () {
                        if (isAffair) _promptEndAffairById(relationshipId);
                        else _promptBreakUpById(relationshipId);
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
                var metaPatch = { notes: newNotes };

                if (isAffair) {
                    var typeEl = modalEl.querySelector('#romEditAffairType');
                    var pubEl = modalEl.querySelector('#romEditPublicBehavior');
                    if (typeEl && typeEl.value) metaPatch.affairType = typeEl.value;
                    metaPatch.publicBehavior = !!(pubEl && pubEl.checked);
                }

                var updateResult = window.RelationshipCommands.update(
                    relationshipId,
                    {
                        startYear: newYear,
                        metadata: metaPatch
                    }
                );
                if (!updateResult || updateResult.success !== true) {
                    var reason = (updateResult && (updateResult.message || updateResult.reason))
                        ? (updateResult.message || updateResult.reason)
                        : 'unknown error';
                    _toast('Failed to update relationship: ' + reason, 'error');
                    return false;
                }

                // 2) Attributes (committed only).
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

    // =========================================================================
    // 11. ACTION IMPLEMENTATIONS — BREAK UP / END AFFAIR
    // =========================================================================

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

    function _promptBreakUpById(relationshipId) {
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

    function _onEndAffair(btn, model) {
        if (!_canEndAffair()) {
            _toast('Affair commands are not loaded.', 'error');
            return;
        }
        var relId = btn.getAttribute('data-relationship-id');
        if (!_hasId(relId)) {
            _toast('Relationship id is missing.', 'error');
            return;
        }
        var rel = _findEntry(model, relId);
        var partnerName = rel && rel.partnerName ? rel.partnerName : 'this partner';
        var message = 'End the affair with ' + partnerName + '?';
        if (typeof window.confirmDialog === 'function') {
            window.confirmDialog(message, 'End Affair', function () {
                _performEndAffair(relId);
            });
        } else if (window.confirm && window.confirm(message)) {
            _performEndAffair(relId);
        }
    }

    function _promptEndAffairById(relationshipId) {
        if (!_canEndAffair()) {
            _toast('Affair commands are not loaded.', 'error');
            return;
        }
        var message = 'End this affair?';
        if (typeof window.confirmDialog === 'function') {
            window.confirmDialog(message, 'End Affair', function () {
                _performEndAffair(relationshipId);
            });
        } else if (window.confirm && window.confirm(message)) {
            _performEndAffair(relationshipId);
        }
    }

    function _performEndAffair(relationshipId) {
        var currentYear = 0;
        try { currentYear = window.getCurrentYear(); }
        catch (e) { currentYear = 0; }

        var result = window.AffairCommands.endAffair(relationshipId, {
            endYear: currentYear,
            reason: 'affair ended'
        });

        if (!result || result.success !== true) {
            var reason = (result && (result.message || result.reason))
                ? (result.message || result.reason)
                : 'unknown error';
            _toast('Failed to end affair: ' + reason, 'error');
            return;
        }

        _toast('Affair ended.', 'success');
        _refresh();
    }

    // =========================================================================
    // 12. ACTION IMPLEMENTATIONS — REVEAL
    // =========================================================================
    //
    // The Reveal button draws one roll from window.Random.next (or the
    // randomNext fallback) and passes it to AffairCommands.rollDiscovery
    // as options.roll. The tab controls the RNG stream: the roll is
    // deterministic against a fixed seed for playtest, and the affair
    // command never implicitly consumes a draw the caller was relying on
    // being consumed elsewhere.

    function _onRevealAffair(btn, model) {
        if (!_canRevealAffair()) {
            _toast('Reveal is not available (AffairCommands or randomness is missing).', 'error');
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
        if (rel.discovered === true) {
            _toast('This affair has already been discovered.', 'info');
            _refresh();
            return;
        }

        var roll;
        try { roll = _drawRoll(); }
        catch (e) {
            _toast('Randomness service is not available.', 'error');
            return;
        }

        var currentYear = 0;
        try { currentYear = window.getCurrentYear() || 0; } catch (e) { currentYear = 0; }

        var result = window.AffairCommands.rollDiscovery(relId, {
            roll: roll,
            year: currentYear
        });

        if (!result || result.success !== true) {
            var reason = (result && (result.message || result.reason))
                ? (result.message || result.reason)
                : 'unknown error';
            _toast('Failed to roll discovery: ' + reason, 'error');
            return;
        }

        if (result.discovered === true) {
            var discoveredMsg = 'Affair discovered';
            if (typeof result.year === 'number') discoveredMsg += ' in ' + result.year;
            if (result.circumstances) discoveredMsg += ' — ' + result.circumstances;
            _toast(discoveredMsg, 'warning');
        } else {
            var chanceText = (typeof result.chance === 'number')
                ? ' (chance ' + Math.round(result.chance * 100) + '%)'
                : '';
            _toast('Not discovered' + chanceText + '.', 'info');
        }
        _refresh();
    }

    // =========================================================================
    // 13. ATTRIBUTE HELPERS
    // =========================================================================

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
    // 14. REGISTRATION
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
    // 15. EXPORTS
    // =========================================================================

    window.CharacterRomanceTab = {
        id: TAB_ID,
        render: renderRomanceTab
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CharacterRomanceTab;
    }
})();
