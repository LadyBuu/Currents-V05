// js/tabs/character-skills-tab.js
/**
 * =============================================================================
 * STILL WATERS - CHARACTER SKILLS TAB
 * (js/tabs/character-skills-tab.js)
 * =============================================================================
 *
 * LOCATION: js/tabs/character-skills-tab.js
 *
 * The Skills tab of the Character Manager. Shows the character's
 * professions, education history, subject progress, literacy, traits,
 * and (when the apprenticeship domain is loaded) mastership and
 * apprenticeship relationships.
 *
 * WRITE SURFACE:
 *   This tab is the primary edit surface for:
 *     - Professions      (add, remove, set primary, add specialization)
 *     - Literacy         (toggle isLiterate)
 *     - Traits           (add, remove — mirrors the Identity tab)
 *
 *   This tab is READ-ONLY for:
 *     - Education        (enrollments are edited via the Education Manager)
 *     - Education history (recorded by the education domain)
 *     - Subject progress (written by the education / learning pipeline)
 *     - Apprenticeship   (edited via the Apprenticeship Manager)
 *
 *   The read-only sections render an explanatory note pointing the user
 *   at the correct manager. No silent no-ops. No write surface that
 *   bypasses a domain that owns the data.
 *
 * RENDERER CONTRACT (from CharacterManagerBootstrap):
 *   fn(container, context)
 *   container  HTMLElement  — already emptied by TabManager
 *   context    { characterId, character }  — CharacterQueries projection
 *
 * DATA SOURCES:
 *   - CharacterViewModels.buildSkillsModel(characterId)
 *     Every section of this tab is rendered from that model. The tab
 *     does NOT call CharacterCommands directly for reads.
 *
 *   - CharacterCommands.addProfession / removeProfession /
 *     setPrimaryProfession / addProfessionSpecialization / updateProfession
 *     / setLiterate / addTrait / removeTrait / persist   — writes only
 *
 *   - window.getRoles()      — role picker source, guarded
 *   - window.CharacterManagerBootstrap.renderActive()
 *                            — post-write refresh
 *
 * COLLAPSED-STATE PERSISTENCE:
 *   Global per-tab via CharacterUIState.getCollapsed('skills', key) /
 *   setCollapsed. Not per-character. Matches the four shipped tabs.
 *
 * FILTERS: none. The lists are short enough that a filter bar would be
 * noise. If a future revision needs one, add it inside the Professions
 * section and persist via CharacterUIState.setFilters('skills', id, {}).
 *
 * DEPENDENCIES (required at load):
 *   - TabManager              (self-registration)
 *   - formatting.js           (escapeHtml)
 *   - icons.js                (Icons)
 *   - CharacterUIState        (collapsed state)
 *   - CharacterViewModels     (buildSkillsModel)
 *   - CharacterCommands       (all writers)
 *
 * DEPENDENCIES (optional, guarded at call time):
 *   - window.getRoles()                       add-profession picker
 *   - window.CharacterManagerBootstrap.renderActive()  post-write refresh
 *   - window.showToast                        error surfacing
 *
 * TIME CONTRACT: uses window.getCurrentYear for date display only.
 *
 * ICON POLICY: SVG from icons.js. No emojis. No literal Unicode glyphs
 *              except the section toggle ▶ / ▼ used by every tab.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Initial revision.
 *     - Six collapsible sections, all default expanded:
 *         Literacy / Professions / Education / Subject Progress /
 *         Apprenticeship / Traits.
 *     - Professions: full edit — add (inline modal), remove (confirm),
 *       set primary (one click), add specialization (inline modal).
 *     - Literacy: one-click toggle via setLiterate.
 *     - Traits: chip row + add / remove via small inline modals
 *       (mirrors the Identity tab's trait editing; the Skills tab shows
 *       the same data because "what this character can do" spans both
 *       professions and dispositions).
 *     - Education, Education History, Subject Progress: read-only, with
 *       a note pointing at the Education Manager.
 *     - Apprenticeship: read-only when ApprenticeshipQueries is loaded,
 *       otherwise an "unavailable" message pointing at the
 *       Apprenticeship Manager.
 *     - Every write ends with _persistAndWarn(...) (one persist call
 *       per user action, warning toast on failure, in-memory write
 *       stands) and CharacterManagerBootstrap.renderActive() (explicit
 *       refresh; the state subscription would also fire, but calling
 *       renderActive is deterministic and matches the four shipped
 *       tabs).
 *     - Empty states are three-way where applicable: no-context /
 *       no-items / no-apprenticeship-domain. Every section that can be
 *       empty distinguishes "no data yet" from "feature unavailable".
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 0. CONSTANTS
    // =========================================================================

    var TAB_ID = 'skills';
    var SCOPE  = 'character';

    var SECTIONS = [
        { key: 'literacy',      label: 'Literacy',           icon: 'BOOK' },
        { key: 'professions',   label: 'Professions',        icon: 'ROLES' },
        { key: 'education',     label: 'Education',          icon: 'EDUCATION' },
        { key: 'progress',      label: 'Subject Progress',   icon: 'CHART' },
        { key: 'apprenticeship',label: 'Apprenticeship',     icon: 'TEACHER' },
        { key: 'traits',        label: 'Traits',             icon: 'PERSON' }
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
        if (window.Icons && typeof window.Icons[name] === 'string') {
            return window.Icons[name];
        }
        if (window.Icons && typeof window.Icons.CIRCLE === 'string') {
            return window.Icons.CIRCLE;
        }
        return '';
    }

    function _uiState() { return window.CharacterUIState || null; }

    function _commands() { return window.CharacterCommands || null; }

    function _toast(msg, type) {
        if (typeof window.showToast === 'function') {
            try { window.showToast(msg, type || 'info'); }
            catch (e) { /* non-fatal */ }
        } else if (typeof console !== 'undefined' && console.warn) {
            console.warn('[skills-tab] ' + (type || 'info') + ': ' + msg);
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
    // 2. PERSISTENCE HELPER (one persist call per user action)
    // =========================================================================
    //
    // Education / apprenticeship / roles modals all use this pattern:
    // the command mutates canonical state, then we persist once. A
    // persist failure produces a warning toast; the in-memory write
    // stands (the debounced save will retry).
    //
    // Every write in this tab funnels through this helper. Never call
    // CharacterCommands.persist() from a read path.

    function _persistAndWarn(successMessage) {
        var CC = _commands();
        if (!CC || typeof CC.persist !== 'function') {
            return false;
        }
        var ok = false;
        try { ok = CC.persist(); }
        catch (e) { ok = false; }
        if (ok === false) {
            _toast(
                'Change saved in memory, but disk save failed. It will retry.',
                'warning'
            );
            return false;
        }
        if (successMessage) _toast(successMessage, 'success');
        return true;
    }

    // =========================================================================
    // 3. SECTION SHELL
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

    function _note(message) {
        return '<div class="character-tab-note">' + _esc(message) + '</div>';
    }

    function _readonlyNote(message) {
        return '<div class="character-tab-note" style="margin-top:0.75rem;">' +
            _esc(message) +
        '</div>';
    }

    // =========================================================================
    // 4. LITERACY SECTION
    // =========================================================================

    function _bodyLiteracy(model) {
        if (!model.literacy) {
            var err = model.errors && model.errors.literacy
                ? model.errors.literacy : 'unknown error';
            return _unavailable('Literacy could not be loaded: ' + err);
        }

        var lit = model.literacy;
        var status = lit.isLiterate ? 'Literate' : 'Illiterate';
        var tone = lit.isLiterate ? 'var(--ok)' : 'var(--dim)';

        var toggleLabel = lit.isLiterate
            ? 'Mark as Illiterate'
            : 'Mark as Literate';

        return '' +
            '<div class="character-tab-field">' +
                '<div class="character-tab-field__label">Status</div>' +
                '<div class="character-tab-field__value">' +
                    '<span style="color:' + tone + ';font-weight:600;">' +
                        _esc(status) +
                    '</span>' +
                    ' &middot; ' +
                    _esc(lit.literacyLevel + '% literacy') +
                    ' (' + _esc(lit.tierLabel) + ')' +
                    (lit.canTeach
                        ? ' &middot; <span style="color:var(--accent);">can teach</span>'
                        : '') +
                '</div>' +
            '</div>' +
            '<div class="character-tab-actions">' +
                '<button type="button" class="character-tab-btn" ' +
                    'data-action="toggle-literacy">' +
                    _esc(toggleLabel) +
                '</button>' +
            '</div>' +
            _note(
                'The literacy flag is a materialized cache of the ' +
                'literacy subject level. Toggling it here does not change ' +
                'the level; the education pipeline keeps them in sync.'
            );
    }

    // =========================================================================
    // 5. PROFESSIONS SECTION
    // =========================================================================

    function _professionRowHtml(p) {
        var primaryBadge = p.primary
            ? '<span class="character-tab-history__badge">Primary</span>'
            : '';

        var specChips = '';
        if (Array.isArray(p.specs) && p.specs.length > 0) {
            for (var i = 0; i < p.specs.length; i++) {
                specChips += '<span class="character-tab-btn-small" ' +
                    'style="cursor:default;">' +
                    _esc(p.specs[i]) +
                '</span>';
            }
        } else {
            specChips = '<span class="character-tab-note">No specializations</span>';
        }

        return '' +
            '<div class="character-tab-rank-row" ' +
                'data-profession-id="' + _esc(p.id) + '">' +
                '<div class="character-tab-rank-main">' +
                    '<span class="character-tab-rank-name">' +
                        _esc(p.roleName) +
                    '</span>' +
                    primaryBadge +
                    '<span style="font-size:0.65rem;color:var(--accent);">' +
                        _esc(p.skillLevel + '%') +
                    '</span>' +
                    '<span class="character-tab-note">' +
                        _esc(p.tierLabel) +
                    '</span>' +
                '</div>' +
                '<div style="width:100%;display:flex;gap:0.25rem;flex-wrap:wrap;' +
                    'margin-top:0.375rem;">' +
                    specChips +
                '</div>' +
                '<div class="character-tab-rank-actions">' +
                    (p.primary
                        ? ''
                        : '<button type="button" class="character-tab-btn-small" ' +
                              'data-action="set-primary" ' +
                              'data-profession-id="' + _esc(p.id) + '">' +
                              'Make primary' +
                          '</button>') +
                    '<button type="button" class="character-tab-btn-small" ' +
                        'data-action="add-specialization" ' +
                        'data-profession-id="' + _esc(p.id) + '">' +
                        'Add spec' +
                    '</button>' +
                    '<button type="button" class="character-tab-btn-small danger" ' +
                        'data-action="remove-profession" ' +
                        'data-profession-id="' + _esc(p.id) + '">' +
                        'Remove' +
                    '</button>' +
                '</div>' +
            '</div>';
    }

    function _bodyProfessions(model) {
        if (!model.professions) {
            var err = model.errors && model.errors.professions
                ? model.errors.professions : 'unknown error';
            return _unavailable('Professions could not be loaded: ' + err);
        }

        var html = '';
        if (model.professions.length === 0) {
            html += _empty(
                'No professions recorded. Use "Add Profession" to grant one.'
            );
        } else {
            for (var i = 0; i < model.professions.length; i++) {
                html += _professionRowHtml(model.professions[i]);
            }
        }

        var canAddProfession = (typeof window.getRoles === 'function')
            && (typeof (window.CharacterCommands || {}).addProfession === 'function');
        var addAttrs = canAddProfession
            ? ''
            : ' disabled title="Role catalogue and addProfession command are required"';

        html += '<div class="character-tab-actions">' +
            '<button type="button" class="character-tab-btn" ' +
                'data-action="add-profession"' + addAttrs + '>' +
                '+ Add Profession' +
            '</button>' +
        '</div>';

        return html;
    }

    // =========================================================================
    // 6. EDUCATION SECTION
    // =========================================================================

    function _educationRowHtml(e) {
        var status;
        if (e.graduated === true) {
            status = 'Graduated ' + _year(e.graduationYear) +
                (e.grantedRoleName ? ' as ' + e.grantedRoleName : '');
        } else if (e.withdrawn === true) {
            status = 'Withdrew ' + _year(e.withdrawnYear) +
                (e.withdrawnReason ? ' (' + e.withdrawnReason + ')' : '');
        } else {
            status = 'Enrolled ' + _year(e.enrolledYear);
        }

        return '' +
            '<div class="character-tab-rank-row">' +
                '<div class="character-tab-rank-main">' +
                    '<span class="character-tab-rank-name">' +
                        _esc(e.institutionName) +
                    '</span>' +
                    (e.institutionType
                        ? '<span class="character-tab-note">' +
                            _esc(e.institutionType) +
                          '</span>'
                        : '') +
                '</div>' +
                '<div style="font-size:0.65rem;color:var(--dim);">' +
                    _esc(status) +
                '</div>' +
            '</div>';
    }

    function _educationHistoryRowHtml(e) {
        var status;
        if (typeof e.graduationYear === 'number') {
            status = 'Graduated ' + _year(e.graduationYear) +
                (e.grantedRoleName ? ' as ' + e.grantedRoleName : '');
        } else {
            status = 'Attended from ' + _year(e.enrolledYear);
        }

        return '' +
            '<div class="character-tab-rank-row">' +
                '<div class="character-tab-rank-main">' +
                    '<span class="character-tab-rank-name">' +
                        _esc(e.institutionName || e.institutionId || 'Unknown institution') +
                    '</span>' +
                '</div>' +
                '<div style="font-size:0.65rem;color:var(--dim);">' +
                    _esc(status) +
                '</div>' +
            '</div>';
    }

    function _bodyEducation(model) {
        var html = '';

        if (!model.education) {
            var err = model.errors && model.errors.education
                ? model.errors.education : 'unknown error';
            html += _unavailable('Enrollments could not be loaded: ' + err);
        } else if (model.education.length === 0) {
            html += _empty('No education enrollments recorded.');
        } else {
            for (var i = 0; i < model.education.length; i++) {
                html += _educationRowHtml(model.education[i]);
            }
        }

        if (model.educationHistory && model.educationHistory.length > 0) {
            html += '<div class="character-tab-subhead">History</div>';
            for (var j = 0; j < model.educationHistory.length; j++) {
                html += _educationHistoryRowHtml(model.educationHistory[j]);
            }
        }

        html += _readonlyNote(
            'Education enrollments are managed via the Education Manager. ' +
            'Edit enrollments, curriculum, and graduation there.'
        );

        return html;
    }

    // =========================================================================
    // 7. SUBJECT PROGRESS SECTION
    // =========================================================================

    function _subjectProgressRowHtml(p) {
        var lastLine = '';
        if (typeof p.lastStudied === 'number') {
            lastLine = 'Last studied ' + _year(p.lastStudied);
        }

        return '' +
            '<div class="character-tab-rank-row">' +
                '<div class="character-tab-rank-main">' +
                    '<span class="character-tab-rank-name">' +
                        _esc(p.name) +
                    '</span>' +
                    '<span style="font-size:0.65rem;color:var(--accent);">' +
                        _esc(p.level + '%') +
                    '</span>' +
                    '<span class="character-tab-note">' +
                        _esc(p.tierLabel) +
                    '</span>' +
                '</div>' +
                (lastLine
                    ? '<div style="font-size:0.6rem;color:var(--dim);">' +
                        _esc(lastLine) +
                      '</div>'
                    : '') +
            '</div>';
    }

    function _bodySubjectProgress(model) {
        if (!model.subjectProgress) {
            var err = model.errors && model.errors.subjectProgress
                ? model.errors.subjectProgress : 'unknown error';
            return _unavailable('Subject progress could not be loaded: ' + err);
        }
        if (model.subjectProgress.length === 0) {
            return _empty('No subject progress recorded.') +
                _readonlyNote('Subject progress is advanced by the education pipeline.');
        }

        var html = '';
        for (var i = 0; i < model.subjectProgress.length; i++) {
            html += _subjectProgressRowHtml(model.subjectProgress[i]);
        }
        html += _readonlyNote(
            'Subject progress is advanced by the education pipeline. ' +
            'To adjust proficiency, edit the corresponding profession or ' +
            're-enrol the character via the Education Manager.'
        );
        return html;
    }

    // =========================================================================
    // 8. APPRENTICESHIP SECTION
    // =========================================================================

    function _apprenticeRowHtml(a) {
        var stage = a.stage && typeof a.stage === 'object'
            ? a.stage.name : '';
        var since = (typeof a.startYear === 'number')
            ? 'since ' + _year(a.startYear)
            : '';

        return '' +
            '<div class="character-tab-rank-row">' +
                '<div class="character-tab-rank-main">' +
                    '<span class="character-tab-rank-name">' +
                        _esc(a.apprenticeName) +
                    '</span>' +
                    '<span class="character-tab-note">' +
                        _esc(a.roleName || '') +
                    '</span>' +
                    '<span style="font-size:0.65rem;color:var(--accent);">' +
                        _esc(a.skillLevel + '%') +
                    '</span>' +
                    (stage
                        ? '<span class="character-tab-note">' + _esc(stage) + '</span>'
                        : '') +
                '</div>' +
                (since
                    ? '<div style="font-size:0.6rem;color:var(--dim);">' +
                        _esc(since) +
                      '</div>'
                    : '') +
            '</div>';
    }

    function _bodyApprenticeship(model) {
        var a = model.apprenticeship;
        if (!a) {
            var err = model.errors && model.errors.apprenticeship
                ? model.errors.apprenticeship : 'unknown error';
            return _unavailable('Apprenticeship could not be loaded: ' + err);
        }
        if (a.available === false) {
            return _unavailable(
                a.reason
                || 'The apprenticeship domain is not loaded on this page. ' +
                   'Use the Apprenticeship Manager to view or edit training.'
            );
        }

        var html = '';

        if (a.master) {
            html += '<div class="character-tab-subhead">Master</div>';
            html += _apprenticeRowHtml({
                apprenticeName: a.master.masterName,
                roleName: a.master.roleName,
                skillLevel: a.master.skillLevel,
                stage: a.master.stage,
                startYear: a.master.startYear
            });
        }

        if (Array.isArray(a.apprentices) && a.apprentices.length > 0) {
            html += '<div class="character-tab-subhead">Apprentices</div>';
            for (var i = 0; i < a.apprentices.length; i++) {
                html += _apprenticeRowHtml(a.apprentices[i]);
            }
        }

        if (!a.master && (!a.apprentices || a.apprentices.length === 0)) {
            html += _empty('No apprenticeship relationships recorded.');
        }

        html += _readonlyNote(
            'Training relationships are managed via the Apprenticeship Manager.'
        );
        return html;
    }

    // =========================================================================
    // 9. TRAITS SECTION
    // =========================================================================

    function _bodyTraits(model) {
        if (!model.traits) {
            var err = model.errors && model.errors.traits
                ? model.errors.traits : 'unknown error';
            return _unavailable('Traits could not be loaded: ' + err);
        }

        var html = '';

        if (model.traits.length === 0) {
            html += _empty('No traits recorded.');
        } else {
            html += '<div style="display:flex;flex-wrap:wrap;gap:0.375rem;">';
            for (var i = 0; i < model.traits.length; i++) {
                var t = model.traits[i];
                html += '<span class="character-tab-btn-small" ' +
                    'style="cursor:default;">' +
                    _esc(t) +
                    '<button type="button" class="character-tab-btn-small danger" ' +
                        'style="margin-left:0.375rem;padding:0 0.25rem;" ' +
                        'data-action="remove-trait" ' +
                        'data-trait-id="' + _esc(t) + '" ' +
                        'aria-label="Remove trait">' +
                        _esc('\u00D7') +
                    '</button>' +
                '</span>';
            }
            html += '</div>';
        }

        var canAddTrait = (typeof (window.CharacterCommands || {}).addTrait === 'function');
        var addAttrs = canAddTrait
            ? ''
            : ' disabled title="addTrait command is required"';

        html += '<div class="character-tab-actions">' +
            '<button type="button" class="character-tab-btn" ' +
                'data-action="add-trait"' + addAttrs + '>' +
                '+ Add Trait' +
            '</button>' +
        '</div>';

        html += _readonlyNote(
            'Traits can also be edited from the Identity tab. The two ' +
            'surfaces write through the same command.'
        );

        return html;
    }

    // =========================================================================
    // 10. RENDER
    // =========================================================================

    function renderSkillsTab(container, context) {
        if (!container) return;
        if (!context || !_hasId(context.characterId)) {
            container.innerHTML = _empty('No character selected.');
            return;
        }

        var VM = window.CharacterViewModels;
        if (!VM || typeof VM.buildSkillsModel !== 'function') {
            container.innerHTML = _unavailable(
                'CharacterViewModels.buildSkillsModel is not loaded; ' +
                'cannot render the Skills tab.'
            );
            return;
        }

        var model;
        try { model = VM.buildSkillsModel(context.characterId); }
        catch (e) { model = null; }

        if (!model) {
            container.innerHTML = _unavailable('Character could not be loaded.');
            return;
        }

        var body = '';
        body += _sectionHtml(SECTIONS[0], _bodyLiteracy(model));
        body += _sectionHtml(SECTIONS[1], _bodyProfessions(model));
        body += _sectionHtml(SECTIONS[2], _bodyEducation(model));
        body += _sectionHtml(SECTIONS[3], _bodySubjectProgress(model));
        body += _sectionHtml(SECTIONS[4], _bodyApprenticeship(model));
        body += _sectionHtml(SECTIONS[5], _bodyTraits(model));

        container.innerHTML = body;
        _wire(container, context.characterId, model);
    }

    // =========================================================================
    // 11. WIRING
    // =========================================================================

    function _wire(container, characterId, model) {
        var headers = container.querySelectorAll('.character-tab-section__header');
        for (var i = 0; i < headers.length; i++) {
            headers[i].addEventListener('click', _onToggleSection);
        }

        container.addEventListener('click', function (e) {
            var btn = e.target.closest
                ? e.target.closest('[data-action]')
                : null;
            if (!btn || !container.contains(btn)) return;
            var action = btn.getAttribute('data-action');
            if (!action) return;
            if (action === 'toggle-section') return;
            if (btn.disabled) return;
            e.preventDefault();
            _dispatchAction(action, btn, characterId, container, model);
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

    function _dispatchAction(action, btn, characterId, container, model) {
        switch (action) {
            case 'toggle-literacy':
                _onToggleLiteracy(characterId, model); return;
            case 'add-profession':
                _onAddProfession(characterId); return;
            case 'remove-profession':
                _onRemoveProfession(characterId, btn); return;
            case 'set-primary':
                _onSetPrimary(characterId, btn); return;
            case 'add-specialization':
                _onAddSpecialization(characterId, btn, model); return;
            case 'add-trait':
                _onAddTrait(characterId); return;
            case 'remove-trait':
                _onRemoveTrait(characterId, btn); return;
            default:
                if (typeof console !== 'undefined' && console.warn) {
                    console.warn('[skills-tab] unknown action: ' + action);
                }
        }
    }

    // =========================================================================
    // 12. ACTION IMPLEMENTATIONS — LITERACY
    // =========================================================================

    function _onToggleLiteracy(characterId, model) {
        var CC = _commands();
        if (!CC || typeof CC.setLiterate !== 'function') {
            _toast('setLiterate is not available.', 'error'); return;
        }
        var current = !!(model.literacy && model.literacy.isLiterate);
        var next = !current;
        var r = CC.setLiterate(characterId, next);
        if (!r || r.success !== true) {
            _toast('Failed: ' + (r && r.reason ? r.reason : 'unknown'), 'error');
            return;
        }
        _persistAndWarn('Literacy ' + (next ? 'marked' : 'cleared') + '.');
        _refresh();
    }

    // =========================================================================
    // 13. ACTION IMPLEMENTATIONS — PROFESSIONS
    // =========================================================================

    function _roleOptionsHtml(selectedId) {
        if (typeof window.getRoles !== 'function') return '';
        var roles;
        try { roles = window.getRoles(); }
        catch (e) { roles = null; }
        if (!Array.isArray(roles) || roles.length === 0) return '';

        var sorted = roles.slice().sort(function (a, b) {
            return String(a.name || '').localeCompare(String(b.name || ''));
        });

        var html = '';
        for (var i = 0; i < sorted.length; i++) {
            var r = sorted[i];
            if (!r || !_hasId(r.id)) continue;
            var selected = (r.id === selectedId) ? ' selected' : '';
            html += '<option value="' + _esc(r.id) + '"' + selected + '>' +
                _esc(r.name || r.id) + '</option>';
        }
        return html;
    }

    function _onAddProfession(characterId) {
        var CC = _commands();
        if (!CC || typeof CC.addProfession !== 'function') {
            _toast('addProfession is not available.', 'error'); return;
        }
        if (typeof window.openModal !== 'function') {
            _toast('Modal system is not loaded.', 'error'); return;
        }

        var optionsHtml = _roleOptionsHtml(null);
        if (!optionsHtml) {
            _toast('No roles available. The role catalogue may not be loaded.',
                   'error');
            return;
        }

        var currentYear = 0;
        try { currentYear = window.getCurrentYear(); }
        catch (e) { currentYear = 0; }

        var content = '' +
            '<div class="character-tab-field">' +
                '<label class="character-tab-field__label">Role</label>' +
                '<select id="skills-add-role" class="character-tab-input">' +
                    optionsHtml +
                '</select>' +
            '</div>' +
            '<div class="character-tab-field">' +
                '<label class="character-tab-field__label">Skill Level (0–100)</label>' +
                '<input type="number" id="skills-add-skill" class="character-tab-input" ' +
                    'value="10" min="0" max="100">' +
            '</div>' +
            '<div class="character-tab-field">' +
                '<label class="character-tab-field__label">Start Year</label>' +
                '<input type="number" id="skills-add-start" class="character-tab-input" ' +
                    'value="' + currentYear + '" min="1">' +
            '</div>' +
            '<div class="character-tab-field">' +
                '<label class="character-tab-field__label">Primary</label>' +
                '<label class="character-tab-checkbox">' +
                    '<input type="checkbox" id="skills-add-primary">' +
                    '<span>Mark as primary profession</span>' +
                '</label>' +
            '</div>' +
            '<div class="character-tab-field">' +
                '<label class="character-tab-field__label">Notes</label>' +
                '<textarea id="skills-add-notes" class="character-tab-input" rows="2"></textarea>' +
            '</div>';

        window.openModal({
            titleHtml: 'Add Profession',
            contentHtml: content,
            confirmText: 'Add',
            cancelText: 'Cancel',
            onConfirm: function (modalEl) {
                var roleSel = modalEl.querySelector('#skills-add-role');
                var roleId = roleSel ? roleSel.value : '';
                if (!_hasId(roleId)) {
                    _toast('Please select a role.', 'error'); return false;
                }

                var skillRaw = modalEl.querySelector('#skills-add-skill').value;
                var skill = parseInt(skillRaw, 10);
                if (!Number.isFinite(skill) || skill < 0 || skill > 100) {
                    _toast('Skill level must be 0–100.', 'error'); return false;
                }

                var startRaw = modalEl.querySelector('#skills-add-start').value;
                var startYear = parseInt(startRaw, 10);
                if (!Number.isFinite(startYear) || startYear < 1) {
                    _toast('Start year must be a positive integer.', 'error');
                    return false;
                }

                var primary = modalEl.querySelector('#skills-add-primary').checked;
                var notes = modalEl.querySelector('#skills-add-notes').value || '';

                var roleName = roleId;
                try {
                    var roles = window.getRoles();
                    for (var i = 0; i < roles.length; i++) {
                        if (roles[i] && roles[i].id === roleId) {
                            roleName = roles[i].name || roleId;
                            break;
                        }
                    }
                } catch (e) { /* use id */ }

                var r = CC.addProfession(characterId, {
                    id: roleId,
                    name: roleName,
                    skillLevel: skill,
                    startYear: startYear,
                    primary: primary,
                    notes: notes,
                    specs: []
                });
                if (!r || r.success !== true) {
                    _toast('Failed: ' + (r && r.reason ? r.reason : 'unknown'), 'error');
                    return false;
                }
                _persistAndWarn('Profession added.');
                _refresh();
            }
        });
    }

    function _onRemoveProfession(characterId, btn) {
        var CC = _commands();
        if (!CC || typeof CC.removeProfession !== 'function') {
            _toast('removeProfession is not available.', 'error'); return;
        }
        var professionId = btn.getAttribute('data-profession-id');
        if (!_hasId(professionId)) return;

        var doRemove = function () {
            var r = CC.removeProfession(characterId, professionId);
            if (!r || r.success !== true) {
                _toast('Failed: ' + (r && r.reason ? r.reason : 'unknown'), 'error');
                return;
            }
            _persistAndWarn('Profession removed.');
            _refresh();
        };

        var message = 'Remove this profession? This does not affect the ' +
                      'character\'s role history in other managers.';
        if (typeof window.confirmDialog === 'function') {
            window.confirmDialog(message, 'Remove Profession', doRemove);
        } else if (window.confirm && window.confirm(message)) {
            doRemove();
        }
    }

    function _onSetPrimary(characterId, btn) {
        var CC = _commands();
        if (!CC || typeof CC.setPrimaryProfession !== 'function') {
            _toast('setPrimaryProfession is not available.', 'error'); return;
        }
        var professionId = btn.getAttribute('data-profession-id');
        if (!_hasId(professionId)) return;

        var r = CC.setPrimaryProfession(characterId, professionId);
        if (!r || r.success !== true) {
            _toast('Failed: ' + (r && r.reason ? r.reason : 'unknown'), 'error');
            return;
        }
        _persistAndWarn('Primary profession set.');
        _refresh();
    }

    function _onAddSpecialization(characterId, btn, model) {
        var CC = _commands();
        if (!CC || typeof CC.addProfessionSpecialization !== 'function') {
            _toast('addProfessionSpecialization is not available.', 'error');
            return;
        }
        if (typeof window.openModal !== 'function') {
            _toast('Modal system is not loaded.', 'error'); return;
        }
        var professionId = btn.getAttribute('data-profession-id');
        if (!_hasId(professionId)) return;

        // Find the profession entry to show its current specs.
        var existing = null;
        if (model && Array.isArray(model.professions)) {
            for (var i = 0; i < model.professions.length; i++) {
                if (model.professions[i].id === professionId) {
                    existing = model.professions[i];
                    break;
                }
            }
        }

        var existingSpecs = existing && Array.isArray(existing.specs)
            ? existing.specs : [];
        var existingText = existingSpecs.length > 0
            ? existingSpecs.join(', ')
            : '(none)';

        var content = '' +
            '<div class="character-tab-field">' +
                '<label class="character-tab-field__label">Role</label>' +
                '<div class="character-tab-field__value">' +
                    _esc(existing ? existing.roleName : professionId) +
                '</div>' +
            '</div>' +
            '<div class="character-tab-field">' +
                '<label class="character-tab-field__label">Existing</label>' +
                '<div class="character-tab-field__value">' +
                    _esc(existingText) +
                '</div>' +
            '</div>' +
            '<div class="character-tab-field">' +
                '<label class="character-tab-field__label">New specialization</label>' +
                '<input type="text" id="skills-add-spec" class="character-tab-input" autocomplete="off">' +
            '</div>';

        window.openModal({
            titleHtml: 'Add Specialization',
            contentHtml: content,
            confirmText: 'Add',
            cancelText: 'Cancel',
            onConfirm: function (modalEl) {
                var input = modalEl.querySelector('#skills-add-spec');
                var value = input ? input.value.trim() : '';
                if (!value) {
                    _toast('Specialization is required.', 'error');
                    return false;
                }
                if (existingSpecs.indexOf(value) !== -1) {
                    _toast('Specialization already present.', 'warning');
                    return false;
                }
                var r = CC.addProfessionSpecialization(characterId, professionId, value);
                if (!r || r.success !== true) {
                    _toast('Failed: ' + (r && r.reason ? r.reason : 'unknown'), 'error');
                    return false;
                }
                _persistAndWarn('Specialization added.');
                _refresh();
            }
        });
    }

    // =========================================================================
    // 14. ACTION IMPLEMENTATIONS — TRAITS
    // =========================================================================

    function _onAddTrait(characterId) {
        var CC = _commands();
        if (!CC || typeof CC.addTrait !== 'function') {
            _toast('addTrait is not available.', 'error'); return;
        }
        if (typeof window.openModal !== 'function') {
            _toast('Modal system is not loaded.', 'error'); return;
        }

        var vocabulary = Array.isArray(window.CHARACTER_TRAIT_VALUES)
            ? window.CHARACTER_TRAIT_VALUES
            : null;
        if (!vocabulary) {
            _toast('Trait vocabulary is not loaded.', 'error'); return;
        }

        var optionsHtml = '<option value="">— Select —</option>';
        for (var i = 0; i < vocabulary.length; i++) {
            var t = vocabulary[i];
            optionsHtml += '<option value="' + _esc(t) + '">' + _esc(t) + '</option>';
        }

        var content = '' +
            '<div class="character-tab-field">' +
                '<label class="character-tab-field__label">Trait</label>' +
                '<select id="skills-add-trait" class="character-tab-input">' +
                    optionsHtml +
                '</select>' +
            '</div>';

        window.openModal({
            titleHtml: 'Add Trait',
            contentHtml: content,
            confirmText: 'Add',
            cancelText: 'Cancel',
            onConfirm: function (modalEl) {
                var sel = modalEl.querySelector('#skills-add-trait');
                var trait = sel ? sel.value : '';
                if (!trait) {
                    _toast('Please select a trait.', 'error');
                    return false;
                }
                var r = CC.addTrait(characterId, trait);
                if (!r || r.success !== true) {
                    _toast('Failed: ' + (r && r.reason ? r.reason : 'unknown'), 'error');
                    return false;
                }
                _persistAndWarn('Trait added.');
                _refresh();
            }
        });
    }

    function _onRemoveTrait(characterId, btn) {
        var CC = _commands();
        if (!CC || typeof CC.removeTrait !== 'function') {
            _toast('removeTrait is not available.', 'error'); return;
        }
        var traitId = btn.getAttribute('data-trait-id');
        if (!_hasId(traitId)) return;

        var r = CC.removeTrait(characterId, traitId);
        if (!r || r.success !== true) {
            _toast('Failed: ' + (r && r.reason ? r.reason : 'unknown'), 'error');
            return;
        }
        _persistAndWarn('Trait removed.');
        _refresh();
    }

    // =========================================================================
    // 15. REGISTRATION
    // =========================================================================

    if (window.TabManager && typeof window.TabManager.register === 'function') {
        window.TabManager.register(SCOPE, TAB_ID, renderSkillsTab);
    } else if (typeof console !== 'undefined' && console.warn) {
        console.warn(
            'character-skills-tab.js: TabManager is not available; ' +
            'the tab was not registered.'
        );
    }

    // =========================================================================
    // 16. EXPORTS
    // =========================================================================

    window.CharacterSkillsTab = {
        id: TAB_ID,
        render: renderSkillsTab
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CharacterSkillsTab;
    }
})();
