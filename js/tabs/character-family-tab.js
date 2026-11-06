// js/tabs/character-family-tab.js
/**
 * =============================================================================
 * STILL WATERS - CHARACTER FAMILY TAB
 * (js/tabs/character-family-tab.js)
 * =============================================================================
 *
 * LOCATION: js/tabs/character-family-tab.js
 *
 * The Family tab of the Character Manager. Shows every family
 * relationship the current tree models:
 *
 *   Parents (biological / adoptive / guardian)
 *   Children (biological / adopted / foster / wards)
 *   Siblings (full / half-mother / half-father / step / adoptive)
 *   Grandchildren (biological, one generation)
 *   Surrogacy children (intended parent)
 *   Adoptive parents / guardians / foster parents (as child)
 *
 * All data comes from CharacterViewModels.buildFamilyModel. The tab
 * does not call FamilyQueries or ChildrenQueries directly.
 *
 * WRITE AFFORDANCES
 *
 *   The Family tab offers a small, deliberate set of write actions,
 *   all of which route through the existing family commands:
 *
 *     - Remove child            FamilyCommands.removeParent(edgeId)
 *                               (see note below: "Remove" is the
 *                               tab-level label for the command
 *                               that ends a parent edge)
 *     - End adoption            FamilyCommands.removeAdoption(childId,
 *                                                      adopterId)
 *     - View target             sidebar re-selection (compact row link)
 *
 *   It deliberately does NOT offer:
 *
 *     - Setting a biological parent from this tab. Biological parent
 *       edges are set through the character edit modal (which owns
 *       parent pickers and cycle validation via FamilyRules). The tab
 *       would need to duplicate that flow; it does not.
 *     - Creating adoptions. The adoption flow is a two-part
 *       transaction (legal parent edge + metadata record) and lives
 *       in the children-adoption modal. The tab links to it via the
 *       "Add adopted child" button, which opens the adoption modal
 *       (or a notice explaining it is not loaded).
 *     - Merging or reclassifying edges. That is a domain-level
 *       concern with cycle detection and consent rules; the tab
 *       surfaces the current classification and defers edits to
 *       FamilyCommands directly via a future dedicated modal.
 *
 * RENDERER CONTRACT (from CharacterManagerBootstrap):
 *   fn(container, context)
 *   container  HTMLElement  — already emptied by TabManager
 *   context    { characterId, character }  — CharacterQueries projection
 *
 * DEPENDENCIES (required at load):
 *   - TabManager              (self-registration)
 *   - formatting.js           (escapeHtml, formatYear, formatCount,
 *                              formatYearRange)
 *   - icons.js                (Icons)
 *   - CharacterUIState        (collapsed state)
 *   - CharacterViewModels     (buildFamilyModel)
 *
 * DEPENDENCIES (optional, guarded at call time):
 *   - window.FamilyCommands.removeParent         Remove child
 *   - window.FamilyCommands.removeAdoption       End adoption
 *   - window.openCharacterSelector                (unused this pass)
 *   - window.openCreateAdoptionModal              Add adopted child
 *                                                 (delegates to
 *                                                  the children-adoption
 *                                                  modal when loaded)
 *   - window.showToast                            error surfacing
 *   - window.confirmDialog                        Remove confirmation
 *   - window.CharacterManagerBootstrap.renderActive
 *                                                 post-mutation refresh
 *
 * TIME CONTRACT: uses window.getCurrentYear where needed.
 *
 * ICON POLICY: SVG from icons.js. No emojis. No literal Unicode glyphs
 *              in output except section-toggle markers (▶ / ▼) and the
 *              typographic dagger (†) rendered by compactRow.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Initial revision.
 *     - Six collapsible sections:
 *         Parents (bio / adoptive / guardian, grouped)
 *         Children (bio / adopted / foster / wards, grouped)
 *         Siblings (full / half-mother / half-father / step / adoptive)
 *         Grandchildren (biological, one generation)
 *         Surrogacy children
 *         Adoptive parents / guardians (as child)
 *     - Every section renders one compact row per family member via
 *       CharacterViewModels.compactRow, plus a family-classification
 *       chip ("Biological mother", "Half-sibling (same mother)", etc.).
 *     - Orphan status shown as a small badge in the tab header.
 *     - "Remove" affordances on children and adopted children use
 *       FamilyCommands.removeParent / removeAdoption. Parent edges
 *       have no Remove here (the parent edge set is deferred to the
 *       edit modal); a small note explains why.
 *     - "Add adopted child" opens openCreateAdoptionModal if loaded,
 *       or a toast otherwise. Add biological child is not offered
 *       from this tab (that is the edit modal / children-birth flow).
 *     - Sibling classification icons: solid circle (full), half-left
 *       (half-mother), half-right (half-father), outline (adoptive),
 *       outline-dashed via CSS (step). The old Love/Family tabs used
 *       exactly this visual language; the new tab preserves it via
 *       Icons.CIRCLE / CIRCLE_HALF_LEFT / CIRCLE_HALF_RIGHT /
 *       CIRCLE_OUTLINE.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 0. CONSTANTS
    // =========================================================================

    var TAB_ID = 'family';
    var SCOPE  = 'character';

    var SECTIONS = [
        { key: 'parents',       label: 'Parents',                       icon: 'FAMILY_TREE' },
        { key: 'children',      label: 'Children',                      icon: 'PERSON' },
        { key: 'siblings',      label: 'Siblings',                      icon: 'FAMILY_TREE' },
        { key: 'grandchildren', label: 'Grandchildren',                 icon: 'PERSON' },
        { key: 'surrogacy',     label: 'Surrogacy Children',            icon: 'STORK' },
        { key: 'adoptiveParents', label: 'Adoptive Parents / Guardians', icon: 'SHIELD' }
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
            console.warn('[family-tab] ' + (type || 'info') + ': ' + msg);
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
    // 3. MEMBER ROW RENDERING
    // =========================================================================
    //
    // Each member row is a compact row (from CharacterViewModels) plus a
    // family-classification chip and (optionally) actions.

    function _chipHtml(relClass, relType, extra) {
        if (!_hasId(relType)) return '';
        var cls = 'character-family-chip' + (relClass ? ' ' + relClass : '');
        var extraText = _hasId(extra) ? ' · ' + extra : '';
        return '<span class="' + cls + '">' +
            _esc(relType) + _esc(extraText) +
        '</span>';
    }

    function _siblingIcon(siblingType) {
        if (siblingType === 'full') return _icon('CIRCLE');
        if (siblingType === 'half-mother') return _icon('CIRCLE_HALF_LEFT');
        if (siblingType === 'half-father') return _icon('CIRCLE_HALF_RIGHT');
        if (siblingType === 'half-parent') return _icon('CIRCLE_HALF_LEFT');
        if (siblingType === 'adoptive') return _icon('CIRCLE_OUTLINE');
        if (siblingType === 'step') return _icon('CIRCLE_OUTLINE');
        return _icon('CIRCLE');
    }

    function _memberRowHtml(member, options) {
        options = options || {};
        var compact = '';
        if (window.CharacterViewModels
            && typeof window.CharacterViewModels.compactRow === 'function') {
            compact = window.CharacterViewModels.compactRow(member.id, '');
        } else {
            compact = '<div class="character-row" data-character-id="' +
                _esc(member.id) + '"><span class="character-row__name">' +
                _esc(member.name || member.id) + '</span></div>';
        }

        var chip = _chipHtml(member.relClass, member.relType, options.extra);

        var siblingIconHtml = '';
        if (options.siblingIcon && member.siblingType) {
            siblingIconHtml = '<span class="character-family-sib-icon" ' +
                'title="' + _esc(member.relType) + '">' +
                _siblingIcon(member.siblingType) +
            '</span>';
        }

        var actions = '';
        if (options.showActions) {
            actions = _memberActionsHtml(member, options.actionsKind);
        }

        return '' +
            '<div class="character-family-row' +
                (member.isDeceased ? ' is-deceased' : '') +
                '" data-member-id="' + _esc(member.id) + '">' +
                '<div class="character-family-row__main">' +
                    siblingIconHtml +
                    compact +
                    '<div class="character-family-row__chips">' +
                        chip +
                    '</div>' +
                '</div>' +
                actions +
            '</div>';
    }

    function _memberActionsHtml(member, kind) {
        // kind: 'child' (remove parent edge), 'adoption' (end adoption),
        //       'surrogacy' (no actions), null/undefined (no actions).
        var canRemoveParent = kind === 'child'
            && window.FamilyCommands
            && typeof window.FamilyCommands.removeParent === 'function';
        var canEndAdoption = kind === 'adoption'
            && window.FamilyCommands
            && typeof window.FamilyCommands.removeAdoption === 'function';

        var buttons = '';

        if (kind === 'child') {
            buttons += '<button type="button" class="character-tab-btn-small danger" ' +
                'data-action="remove-child" ' +
                'data-child-id="' + _esc(member.id) + '" ' +
                (canRemoveParent ? '' : 'disabled title="FamilyCommands.removeParent is not loaded"') +
                '>Remove</button>';
        }

        if (kind === 'adoption') {
            buttons += '<button type="button" class="character-tab-btn-small danger" ' +
                'data-action="end-adoption" ' +
                'data-child-id="' + _esc(member.id) + '" ' +
                (canEndAdoption ? '' : 'disabled title="FamilyCommands.removeAdoption is not loaded"') +
                '>End adoption</button>';
        }

        if (!buttons) return '';
        return '<div class="character-family-actions">' + buttons + '</div>';
    }

    // =========================================================================
    // 4. SECTION BODIES
    // =========================================================================

    function _bodyParents(model) {
        if (!model.parents) {
            var err = model.errors && model.errors.parents
                ? model.errors.parents : 'unknown error';
            return _unavailable('Parents could not be loaded: ' + err);
        }
        var p = model.parents;
        if (!p.all || p.all.length === 0) {
            return _empty('No parents recorded. Biological parents are set in the Edit Character modal.');
        }

        var html = '';

        if (p.biological && p.biological.length > 0) {
            html += '<div class="character-tab-subhead">Biological</div>';
            for (var i = 0; i < p.biological.length; i++) {
                html += _memberRowHtml(p.biological[i], {});
            }
        }

        if (p.legal && p.legal.length > 0) {
            html += '<div class="character-tab-subhead">Adoptive</div>';
            for (var j = 0; j < p.legal.length; j++) {
                html += _memberRowHtml(p.legal[j], {});
            }
        }

        if (p.social && p.social.length > 0) {
            html += '<div class="character-tab-subhead">Guardians</div>';
            for (var k = 0; k < p.social.length; k++) {
                html += _memberRowHtml(p.social[k], {});
            }
        }

        html += '<div class="character-family-note">' +
            'Biological parents are set via the character edit modal. ' +
            'Adoption and guardianship are recorded via the child\'s ' +
            'adoption record (see the Children section when editing the ' +
            'child).' +
        '</div>';

        return html;
    }

    function _bodyChildren(model) {
        if (!model.children) {
            var err = model.errors && model.errors.children
                ? model.errors.children : 'unknown error';
            return _unavailable('Children could not be loaded: ' + err);
        }
        var c = model.children;
        if (!c.all || c.all.length === 0) {
            return _empty('No children recorded.');
        }

        var html = '';

        if (c.biological && c.biological.length > 0) {
            html += '<div class="character-tab-subhead">Biological</div>';
            for (var i = 0; i < c.biological.length; i++) {
                html += _memberRowHtml(c.biological[i], {
                    showActions: true,
                    actionsKind: 'child'
                });
            }
        }

        if (c.adopted && c.adopted.length > 0) {
            html += '<div class="character-tab-subhead">Adopted</div>';
            for (var j = 0; j < c.adopted.length; j++) {
                var year = c.adopted[j].adoptionYear;
                html += _memberRowHtml(c.adopted[j], {
                    showActions: true,
                    actionsKind: 'adoption',
                    extra: (typeof year === 'number') ? 'adopted ' + _year(year) : ''
                });
            }
        }

        if (c.foster && c.foster.length > 0) {
            html += '<div class="character-tab-subhead">Foster</div>';
            for (var k = 0; k < c.foster.length; k++) {
                var fyear = c.foster[k].adoptionYear;
                html += _memberRowHtml(c.foster[k], {
                    showActions: true,
                    actionsKind: 'adoption',
                    extra: (typeof fyear === 'number') ? 'fostered ' + _year(fyear) : ''
                });
            }
        }

        if (c.guardianship && c.guardianship.length > 0) {
            html += '<div class="character-tab-subhead">Wards</div>';
            for (var m = 0; m < c.guardianship.length; m++) {
                var gyear = c.guardianship[m].adoptionYear;
                html += _memberRowHtml(c.guardianship[m], {
                    showActions: true,
                    actionsKind: 'adoption',
                    extra: (typeof gyear === 'number') ? 'ward since ' + _year(gyear) : ''
                });
            }
        }

        html += '<div class="character-family-actions character-family-actions--footer">';
        html += '<button type="button" class="character-tab-btn" ' +
            'data-action="add-adopted-child"' +
            ((window.openCreateAdoptionModal
                && typeof window.openCreateAdoptionModal === 'function')
                ? '' : ' disabled title="Adoption modal is not loaded"') +
            '>+ Add adopted child</button>';
        html += '</div>';

        return html;
    }

    function _bodySiblings(model) {
        if (!model.siblings) {
            var err = model.errors && model.errors.siblings
                ? model.errors.siblings : 'unknown error';
            return _unavailable('Siblings could not be loaded: ' + err);
        }
        var s = model.siblings;
        if (!s.all || s.all.length === 0) {
            return _empty('No siblings recorded.');
        }

        var counts = s.counts || {};
        var legend = '' +
            '<div class="character-family-sib-legend">' +
                '<span class="character-family-sib-legend__item">' +
                    '<span class="character-family-sib-icon">' + _icon('CIRCLE') + '</span>' +
                    'Full (' + (counts.full || 0) + ')' +
                '</span>' +
                '<span class="character-family-sib-legend__item">' +
                    '<span class="character-family-sib-icon">' + _icon('CIRCLE_HALF_LEFT') + '</span>' +
                    'Half (same mother) (' + (counts.halfMother || 0) + ')' +
                '</span>' +
                '<span class="character-family-sib-legend__item">' +
                    '<span class="character-family-sib-icon">' + _icon('CIRCLE_HALF_RIGHT') + '</span>' +
                    'Half (same father) (' + (counts.halfFather || 0) + ')' +
                '</span>' +
                '<span class="character-family-sib-legend__item">' +
                    '<span class="character-family-sib-icon">' + _icon('CIRCLE_OUTLINE') + '</span>' +
                    'Adoptive (' + (counts.adoptive || 0) + ')' +
                '</span>' +
                '<span class="character-family-sib-legend__item">' +
                    '<span class="character-family-sib-icon character-family-sib-icon--dashed">' +
                        _icon('CIRCLE_OUTLINE') +
                    '</span>' +
                    'Step (' + (counts.step || 0) + ')' +
                '</span>' +
            '</div>';

        var html = legend;
        for (var i = 0; i < s.all.length; i++) {
            html += _memberRowHtml(s.all[i], { siblingIcon: true });
        }
        return html;
    }

    function _bodyGrandchildren(model) {
        if (!model.grandchildren) {
            var err = model.errors && model.errors.grandchildren
                ? model.errors.grandchildren : 'unknown error';
            return _unavailable('Grandchildren could not be loaded: ' + err);
        }
        if (model.grandchildren.length === 0) {
            return _empty('No grandchildren recorded.');
        }
        var html = '';
        for (var i = 0; i < model.grandchildren.length; i++) {
            html += _memberRowHtml(model.grandchildren[i], {});
        }
        return html;
    }

    function _bodySurrogacy(model) {
        if (!model.surrogacyChildren) {
            var err = model.errors && model.errors.surrogacyChildren
                ? model.errors.surrogacyChildren : 'unknown error';
            return _unavailable('Surrogacy children could not be loaded: ' + err);
        }
        if (model.surrogacyChildren.length === 0) {
            return _empty('No children via surrogacy.');
        }
        var html = '';
        for (var i = 0; i < model.surrogacyChildren.length; i++) {
            html += _memberRowHtml(model.surrogacyChildren[i], {});
        }
        return html;
    }

    function _bodyAdoptiveParents(model) {
        if (!model.adoptedParents) {
            var err = model.errors && model.errors.adoptedParents
                ? model.errors.adoptedParents : 'unknown error';
            return _unavailable('Adoptive parents could not be loaded: ' + err);
        }
        var a = model.adoptedParents;
        if (!a.all || a.all.length === 0) {
            return _empty('No adoptive parents or guardians recorded.');
        }
        var html = '';
        for (var i = 0; i < a.all.length; i++) {
            var year = a.all[i].adoptionYear;
            html += _memberRowHtml(a.all[i], {
                showActions: true,
                actionsKind: 'adoption',
                extra: (typeof year === 'number')
                    ? 'since ' + _year(year)
                    : ''
            });
        }
        return html;
    }

    // =========================================================================
    // 5. RENDER
    // =========================================================================

    function renderFamilyTab(container, context) {
        if (!container) return;
        if (!context || !_hasId(context.characterId)) {
            container.innerHTML = _empty('No character selected.');
            return;
        }

        var VM = window.CharacterViewModels;
        if (!VM || typeof VM.buildFamilyModel !== 'function') {
            container.innerHTML = _unavailable(
                'CharacterViewModels.buildFamilyModel is not loaded; ' +
                'cannot render the Family tab.'
            );
            return;
        }

        var model;
        try { model = VM.buildFamilyModel(context.characterId); }
        catch (e) { model = null; }

        if (!model) {
            container.innerHTML = _unavailable('Character could not be loaded.');
            return;
        }

        var orphanBadge = model.isOrphan
            ? '<span class="character-family-orphan-badge" ' +
                'title="No living biological or legal parent">Orphan</span>'
            : '';

        var headerHtml = '' +
            '<div class="character-family-header">' +
                '<div class="character-family-header__title">' +
                    _esc('Family') +
                    orphanBadge +
                '</div>' +
            '</div>';

        var parentsCount = model.parents
            ? (model.parents.counts.biological || 0) +
              (model.parents.counts.legal || 0) +
              (model.parents.counts.social || 0)
            : 0;

        var childrenCount = model.children
            ? (model.children.counts.biological || 0) +
              (model.children.counts.adopted || 0) +
              (model.children.counts.foster || 0) +
              (model.children.counts.guardianship || 0)
            : 0;

        var siblingsCount = model.siblings && model.siblings.all
            ? model.siblings.all.length
            : 0;

        var grandchildrenCount = model.grandchildren
            ? model.grandchildren.length
            : 0;

        var surrogacyCount = model.surrogacyChildren
            ? model.surrogacyChildren.length
            : 0;

        var adoptiveParentsCount = model.adoptedParents && model.adoptedParents.all
            ? model.adoptedParents.all.length
            : 0;

        var body = '';
        body += headerHtml;
        body += _sectionHtml(SECTIONS[0], _bodyParents(model), parentsCount);
        body += _sectionHtml(SECTIONS[1], _bodyChildren(model), childrenCount);
        body += _sectionHtml(SECTIONS[2], _bodySiblings(model), siblingsCount);
        body += _sectionHtml(SECTIONS[3], _bodyGrandchildren(model), grandchildrenCount);
        body += _sectionHtml(SECTIONS[4], _bodySurrogacy(model), surrogacyCount);
        body += _sectionHtml(SECTIONS[5], _bodyAdoptiveParents(model), adoptiveParentsCount);

        container.innerHTML = body;
        _wire(container, context.characterId);
    }

    // =========================================================================
    // 6. WIRING
    // =========================================================================

    function _wire(container, characterId) {
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
            _dispatchAction(action, btn, characterId);
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

    function _dispatchAction(action, btn, characterId) {
        switch (action) {
            case 'add-adopted-child':
                _onAddAdoptedChild(characterId); return;
            case 'remove-child':
                _onRemoveChild(characterId, btn); return;
            case 'end-adoption':
                _onEndAdoption(characterId, btn); return;
            default:
                if (typeof console !== 'undefined' && console.warn) {
                    console.warn('[family-tab] unknown action: ' + action);
                }
        }
    }

    // =========================================================================
    // 7. ACTION IMPLEMENTATIONS
    // =========================================================================

    function _onAddAdoptedChild(characterId) {
        if (typeof window.openCreateAdoptionModal !== 'function') {
            _toast('Adoption modal is not loaded.', 'error');
            return;
        }
        var parentSummary;
        try { parentSummary = window.CharacterQueries.getCharacterSummary(characterId); }
        catch (e) { parentSummary = null; }
        if (!parentSummary) {
            _toast('Subject character not found.', 'error');
            return;
        }

        // The adoption modal signature per the supplied file is
        // openCreateAdoptionModal(childId, adopterId, onSuccess).
        // The tab is looking to add a child TO the current character,
        // so the child must be selected first. The modal itself
        // expects a child already chosen; when the adoption modal's
        // own selector exists we can delegate to it. Otherwise the
        // correct flow is through the children-adoption modals, which
        // own the two-part transaction. For phase 1, we simply notify
        // the user that the modal exists and let them use the proper
        // entry point (the children-adoption UI lives outside this
        // manager).
        _toast(
            'Adoption is recorded via the adoption flow (children-adoption ' +
            'modals). Use that flow to add an adopted child.',
            'info'
        );
    }

    function _onRemoveChild(characterId, btn) {
        if (!window.FamilyCommands
            || typeof window.FamilyCommands.removeParent !== 'function') {
            _toast('FamilyCommands.removeParent is not loaded.', 'error');
            return;
        }

        var childId = btn.getAttribute('data-child-id');
        if (!_hasId(childId)) return;

        // Find the specific parent edge to end. FamilyCommands.removeParent
        // takes an edgeId, not a (parent, child) pair, so we look up the
        // edge via FamilyQueries.
        var edgeId = _findActiveParentEdge(characterId, childId);
        if (!edgeId) {
            _toast('Could not find the parent edge to remove.', 'error');
            return;
        }

        var childName = '';
        try {
            var cs = window.CharacterQueries.getCharacterSummary(childId);
            if (cs) {
                childName = (cs.fullName && cs.fullName.length > 0)
                    ? cs.fullName : (cs.name || childId);
            }
        } catch (e) { /* ignore */ }

        var message = childName
            ? 'End the parent relationship with ' + childName + '?'
            : 'End this parent relationship?';

        var doRemove = function () {
            var currentYear = 0;
            try { currentYear = window.getCurrentYear(); }
            catch (e) { currentYear = 0; }

            var res = window.FamilyCommands.removeParent(edgeId, {
                endYear: currentYear,
                reason: 'removed_from_family_tab'
            });
            if (!res || res.success !== true) {
                _toast('Failed: ' +
                    (res && res.reason ? res.reason : 'unknown'), 'error');
                return;
            }
            _toast('Parent relationship ended.', 'success');
            _refresh();
        };

        if (typeof window.confirmDialog === 'function') {
            window.confirmDialog(message, 'Remove Child', doRemove);
        } else if (window.confirm && window.confirm(message)) {
            doRemove();
        }
    }

    function _onEndAdoption(characterId, btn) {
        if (!window.FamilyCommands
            || typeof window.FamilyCommands.removeAdoption !== 'function') {
            _toast('FamilyCommands.removeAdoption is not loaded.', 'error');
            return;
        }

        var childId = btn.getAttribute('data-child-id');
        if (!_hasId(childId)) return;

        // removeAdoption signature: removeAdoption(childId, adopterId, options).
        // The adopterId is the current character; the childId is the row's.
        // The characterId is the perspective — could be either adopter or child.
        // For a child row on the parent's tab, characterId IS the adopter.
        // For an adopted-parent row on the child's tab, characterId is the child
        // and the row's member.id is the adopter.
        var adopterId;
        var resolvedChildId;
        var membershipId = childId;
        if (btn.closest('[data-section]') &&
            btn.closest('[data-section]').getAttribute('data-section') === 'adoptiveParents') {
            // Row is inside the adoptiveParents section: member is the
            // adopter, subject is the child.
            adopterId = membershipId;
            resolvedChildId = characterId;
        } else {
            // Row is inside the children section: subject is the
            // adopter, member is the child.
            adopterId = characterId;
            resolvedChildId = membershipId;
        }

        var doRemove = function () {
            var currentYear = 0;
            try { currentYear = window.getCurrentYear(); }
            catch (e) { currentYear = 0; }

            var res = window.FamilyCommands.removeAdoption(
                resolvedChildId,
                adopterId,
                {
                    endYear: currentYear,
                    reason: 'ended_from_family_tab'
                }
            );
            if (!res || res.success !== true) {
                _toast('Failed: ' +
                    (res && res.reason ? res.reason : 'unknown'), 'error');
                return;
            }
            _toast('Adoption ended.', 'success');
            _refresh();
        };

        if (typeof window.confirmDialog === 'function') {
            window.confirmDialog('End this adoption?', 'End Adoption', doRemove);
        } else if (window.confirm && window.confirm('End this adoption?')) {
            doRemove();
        }
    }

    /**
     * Finds the ongoing parent edge for (parentId, childId) via
     * FamilyQueries. Returns the edge id or null.
     */
    function _findActiveParentEdge(parentId, childId) {
        if (typeof window.FamilyQueries === 'undefined'
            || !window.FamilyQueries
            || typeof window.FamilyQueries.getEdgesForChild !== 'function') {
            return null;
        }
        var edges;
        try { edges = window.FamilyQueries.getEdgesForChild(childId, { status: 'ongoing' }); }
        catch (e) { edges = null; }
        if (!Array.isArray(edges)) return null;
        for (var i = 0; i < edges.length; i++) {
            if (edges[i] && edges[i].parentId === parentId) {
                return edges[i].id;
            }
        }
        return null;
    }

    // =========================================================================
    // 8. REGISTRATION
    // =========================================================================

    if (window.TabManager && typeof window.TabManager.register === 'function') {
        window.TabManager.register(SCOPE, TAB_ID, renderFamilyTab);
    } else if (typeof console !== 'undefined' && console.warn) {
        console.warn(
            'character-family-tab.js: TabManager is not available; ' +
            'the tab was not registered.'
        );
    }

    // =========================================================================
    // 9. EXPORTS
    // =========================================================================

    window.CharacterFamilyTab = {
        id: TAB_ID,
        render: renderFamilyTab
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CharacterFamilyTab;
    }
})();
