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
 * relationship the current tree models, and offers write affordances
 * for editing them. All mutations delegate to FamilyAdditionsModals
 * (defined in modals-family-additions.js) or to FamilyCommands directly
 * for the simple removals.
 *
 * SECTIONS (each collapsible, all default expanded):
 *   1. Parents             Biological / Adoptive / Guardian groups.
 *                          Actions: Set Mother, Set Father (per role,
 *                          with replace-prompt), Remove (per edge).
 *   2. Children            Biological / Adopted / Foster / Wards groups.
 *                          Actions: Add Biological Child, Add Adopted
 *                          Child, Add Foster, Add Ward, Generate New
 *                          Baby (biological, mixed-sex pairs only),
 *                          per-child Remove. Each child row carries a
 *                          coverage circle (solid = both parents,
 *                          half = one parent, outline = adopted).
 *   3. Siblings            Full / half-mother / half-father / step /
 *                          adoptive groups.
 *                          Actions: Add Biological Sibling, Add
 *                          Adopted Sibling.
 *   4. Foster Parents      (this character as the child, fostering)
 *                          Read-only — records are created by the
 *                          foster parent's Family tab or by
 *                          FamilyAdditionsModals.
 *   5. Guardians           (this character as the ward)
 *                          Read-only, same rationale.
 *   6. Grandchildren       (biological, one generation) Read-only.
 *   7. Surrogacy Children  (intended parent) Read-only.
 *   8. Adoptive Parents    (this character as the adopted child)
 *                          Read-only.
 *   9. Orphan status       Shown as a badge in the header.
 *
 * WRITE AFFORDANCES SUMMARY
 *
 *   Set mother               openSetParentModal(characterId, 'mother', cb)
 *   Set father               openSetParentModal(characterId, 'father', cb)
 *   Add biological child     openAddExistingChildModal(characterId,
 *                                                      'biological', cb)
 *   Add adopted child        openAddExistingChildModal(characterId,
 *                                                      'adopted', cb)
 *   Add foster child         openAddFosterOrWardModal(characterId,
 *                                                      'foster', cb)
 *   Add ward                 openAddFosterOrWardModal(characterId,
 *                                                      'guardianship', cb)
 *   Generate new baby        openGenerateBabyModal(characterId, cb)
 *   Add biological sibling   openAddExistingSiblingModal(childId, cb)
 *   Add adopted sibling      openAddAdoptedSiblingModal(childId, cb)
 *   Remove child edge        FamilyCommands.removeParent(edgeId, opts)
 *   End adoption             FamilyCommands.removeAdoption(childId,
 *                                                            adopterId)
 *
 *   All "add" modals are reached via FamilyAdditionsModals (or its flat
 *   aliases). The tab does not call the individual commands for the
 *   "add" flows; those require multi-step transactions and inline
 *   pickers that belong in the modal file.
 *
 *   The two "remove" flows (child edge, adoption) are single-command
 *   writes with no form. The tab calls FamilyCommands directly and
 *   uses window.confirmDialog for confirmation. This matches the
 *   existing pattern in this file and avoids a dedicated remove-modal
 *   for a one-line write.
 *
 * COVERAGE CIRCLE
 *
 *   Biological children carry a small dot before the name indicating
 *   how many of the child's biological parents are recorded:
 *
 *     solid blue      both mother and father present
 *     half-left blue  only a mother present
 *     half-right blue only a father present
 *     outline grey    adopted (no biological coverage expectation)
 *     dashed grey     no parents recorded at all
 *
 *   The classification is computed by the view model
 *   (CharacterViewModels._classifyChildCoverage, exposed via the
 *   `parentCoverage` field on each child entry). The tab renders it;
 *   it does not re-derive.
 *
 * RENDERER CONTRACT (from CharacterManagerBootstrap):
 *   fn(container, context)
 *   container  HTMLElement  — already emptied by TabManager
 *   context    { characterId, character }  — CharacterQueries projection
 *
 * DEPENDENCIES (required at load):
 *   - TabManager              (self-registration)
 *   - formatting.js           (escapeHtml, formatYear, formatCount)
 *   - icons.js                (Icons)
 *   - CharacterUIState        (collapsed state)
 *   - CharacterViewModels     (buildFamilyModel)
 *   - FamilyCommands          (removeParent, removeAdoption —
 *                              the direct-command writes)
 *   - FamilyQueries           (getEdgesForChild — edge lookup
 *                              for removal)
 *
 * DEPENDENCIES (optional, guarded at call time):
 *   - window.openSetParentModal              Set Mother / Set Father
 *   - window.openAddExistingChildModal       Add bio / adopted child
 *   - window.openGenerateBabyModal           Generate new baby
 *   - window.openAddExistingSiblingModal     Add biological sibling
 *   - window.openAddAdoptedSiblingModal      Add adopted sibling
 *   - window.openAddFosterOrWardModal        Add foster / ward
 *   - window.openCreateAdoptionModal         (not used — kept for
 *                                              completeness; the tab's
 *                                              Add Adopted Child goes
 *                                              through
 *                                              openAddExistingChildModal)
 *   - window.showToast                       error surfacing
 *   - window.confirmDialog                   Removal confirmation
 *   - window.CharacterManagerBootstrap.renderActive  post-mutation refresh
 *
 * TIME CONTRACT: uses window.getCurrentYear where needed.
 *
 * ICON POLICY: SVG from icons.js. No emojis. No literal Unicode glyphs
 *              in the output except section-toggle markers (▶ / ▼) and
 *              the typographic dagger (†) rendered by compactRow.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision (family-tab P2):
 *     - Family tab is now WRITEABLE. Added nine write affordances:
 *
 *         Set Mother / Set Father       (per role, with replace prompt)
 *         Add Biological Child          (picks existing character)
 *         Add Adopted Child             (picks existing character)
 *         Add Foster Child              (picks existing character)
 *         Add Ward                      (picks existing character)
 *         Generate New Baby             (mixed-sex pairs only)
 *         Add Biological Sibling        (shares some/all bio parents)
 *         Add Adopted Sibling           (shares some/all adopting
 *                                        parents)
 *
 *       All delegating to modals-family-additions.js. The tab itself
 *       calls FamilyCommands directly only for the two removals
 *       (removeParent, removeAdoption).
 *
 *     - Added Foster Parents and Guardians sections (this character
 *       as the child). Read-only; the creating side is the other
 *       character's Foster/Ward sections in their own Family tab.
 *
 *     - Added coverage circle on biological children (solid = both
 *       parents, half = one parent, outline = adopted, dashed =
 *       unknown). The classification is per-child `parentCoverage`
 *       computed by CharacterViewModels._classifyChildCoverage.
 *
 *     - The "Add adopted child" button previously no-op'd; it is
 *       replaced by the real "Add Adopted Child" affordance going
 *       through openAddExistingChildModal(characterId, 'adopted', cb).
 *
 *     - Header WRITE AFFORDANCES SUMMARY section added.
 *     - Header COVERAGE CIRCLE section added.
 *   Previous revision:
 *     - Initial six-section read-mostly tab.
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
        { key: 'parents',         label: 'Parents',                       icon: 'FAMILY_TREE' },
        { key: 'children',        label: 'Children',                      icon: 'PERSON' },
        { key: 'siblings',        label: 'Siblings',                      icon: 'FAMILY_TREE' },
        { key: 'fosterAsChild',   label: 'Foster Parents',                icon: 'SHIELD' },
        { key: 'wardAsChild',     label: 'Guardians',                     icon: 'SHIELD' },
        { key: 'grandchildren',   label: 'Grandchildren',                 icon: 'PERSON' },
        { key: 'surrogacy',       label: 'Surrogacy Children',            icon: 'STORK' },
        { key: 'adoptiveParents', label: 'Adoptive Parents',              icon: 'SHIELD' }
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

    function _modalAvailable(fnName) {
        return window[fnName] && typeof window[fnName] === 'function';
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

    function _actionBtn(action, label, opts) {
        opts = opts || {};
        var disabledAttr = opts.disabled
            ? ' disabled title="' + _esc(opts.disabledTitle || 'Unavailable') + '"'
            : '';
        var cls = 'character-tab-btn-small' + (opts.danger ? ' danger' : '')
            + (opts.primary ? ' primary' : '');
        var dataAttrs = '';
        if (opts.data) {
            for (var k in opts.data) {
                if (!Object.prototype.hasOwnProperty.call(opts.data, k)) continue;
                dataAttrs += ' data-' + k + '="' + _esc(opts.data[k]) + '"';
            }
        }
        return '<button type="button" class="' + cls + '" ' +
            'data-action="' + _esc(action) + '"' + dataAttrs + disabledAttr + '>' +
            label +
        '</button>';
    }

    function _bigActionBtn(action, label, opts) {
        opts = opts || {};
        var disabledAttr = opts.disabled
            ? ' disabled title="' + _esc(opts.disabledTitle || 'Unavailable') + '"'
            : '';
        var cls = 'character-tab-btn' + (opts.danger ? ' danger' : '')
            + (opts.primary ? ' primary' : '');
        var dataAttrs = '';
        if (opts.data) {
            for (var k in opts.data) {
                if (!Object.prototype.hasOwnProperty.call(opts.data, k)) continue;
                dataAttrs += ' data-' + k + '="' + _esc(opts.data[k]) + '"';
            }
        }
        return '<button type="button" class="' + cls + '" ' +
            'data-action="' + _esc(action) + '"' + dataAttrs + disabledAttr + '>' +
            label +
        '</button>';
    }

    // =========================================================================
    // 3. COVERAGE CIRCLE
    // =========================================================================
    //
    // Renders the parent-coverage indicator for a child entry. The
    // classification lives on the entry as `parentCoverage`; this
    // function only maps it to a CSS class.
    //
    //   both         solid (two-parent coverage)
    //   mother-only  half-left
    //   father-only  half-right
    //   adopted      outline
    //   unknown      dashed outline

    function _coverageCircleClass(coverage) {
        if (coverage === 'both') return 'child-both-parents';
        if (coverage === 'mother-only') return 'child-mother-only';
        if (coverage === 'father-only') return 'child-father-only';
        if (coverage === 'adopted') return 'child-adopted';
        return 'child-unknown';
    }

    function _coverageTitle(coverage) {
        if (coverage === 'both') return 'Both parents recorded';
        if (coverage === 'mother-only') return 'Only mother recorded';
        if (coverage === 'father-only') return 'Only father recorded';
        if (coverage === 'adopted') return 'Adopted';
        return 'Parent coverage unknown';
    }

    function _coverageCircleHtml(coverage) {
        var cls = _coverageCircleClass(coverage);
        return '<span class="character-family-coverage-dot ' + cls + '" ' +
            'title="' + _esc(_coverageTitle(coverage)) + '"></span>';
    }

    // =========================================================================
    // 4. MEMBER ROW RENDERING
    // =========================================================================
    //
    // Each family member row is a compact character reference plus a
    // role chip and (optionally) per-row action buttons.
    //
    // The `parentCoverage` field is present only on children; when
    // present, a coverage circle is rendered before the compact row.

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

        var coverageHtml = '';
        if (options.showCoverage && member.parentCoverage) {
            coverageHtml = _coverageCircleHtml(member.parentCoverage);
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
                    coverageHtml +
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
    // 5. SECTION BODIES
    // =========================================================================

    // ---------- 5a. Parents ----------

    function _bodyParents(model, characterId) {
        if (!model.parents) {
            var err = model.errors && model.errors.parents
                ? model.errors.parents : 'unknown error';
            return _unavailable('Parents could not be loaded: ' + err);
        }
        var p = model.parents;

        var html = '';

        // Grouped parents.
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

        if (!p.all || p.all.length === 0) {
            html += _empty('No parents recorded.');
        }

        // Action buttons: Set Mother / Set Father.
        var motherCurrent = p.mother ? p.mother.name : null;
        var fatherCurrent = p.father ? p.father.name : null;

        var setMotherDisabled = !_modalAvailable('openSetParentModal');
        var setFatherDisabled = !_modalAvailable('openSetParentModal');

        html += '<div class="character-tab-actions">' +
            _bigActionBtn('set-mother',
                motherCurrent ? 'Change Mother' : '+ Set Mother', {
                primary: !motherCurrent,
                disabled: setMotherDisabled,
                disabledTitle: setMotherDisabled
                    ? 'Set-parent modal is not available'
                    : null,
                data: { role: 'mother' }
            }) +
            _bigActionBtn('set-father',
                fatherCurrent ? 'Change Father' : '+ Set Father', {
                primary: !fatherCurrent,
                disabled: setFatherDisabled,
                disabledTitle: setFatherDisabled
                    ? 'Set-parent modal is not available'
                    : null,
                data: { role: 'father' }
            }) +
        '</div>';

        html += '<div class="character-family-note">' +
            'Set Mother and Set Father replace the biological parent ' +
            'at that role. You will be prompted to confirm a ' +
            'replacement. Adoptive and guardian parents are recorded ' +
            'via the adopted-child and foster/ward flows on the ' +
            'other character\'s Family tab.' +
        '</div>';

        return html;
    }

    // ---------- 5b. Children ----------

    function _bodyChildren(model, characterId) {
        if (!model.children) {
            var err = model.errors && model.errors.children
                ? model.errors.children : 'unknown error';
            return _unavailable('Children could not be loaded: ' + err);
        }
        var c = model.children;

        var html = '';

        if (!c.all || c.all.length === 0) {
            html += _empty('No children recorded.');
        }

        if (c.biological && c.biological.length > 0) {
            html += '<div class="character-tab-subhead">Biological</div>';
            for (var i = 0; i < c.biological.length; i++) {
                html += _memberRowHtml(c.biological[i], {
                    showActions: true,
                    actionsKind: 'child',
                    showCoverage: true
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
                    showCoverage: true,
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

        // Action buttons: Add Biological, Add Adopted, Add Foster, Add
        // Ward, Generate Baby.
        var addBioDisabled = !_modalAvailable('openAddExistingChildModal');
        var addAdoptedDisabled = !_modalAvailable('openAddExistingChildModal');
        var addFosterDisabled = !_modalAvailable('openAddFosterOrWardModal');
        var addWardDisabled = !_modalAvailable('openAddFosterOrWardModal');
        var genBabyDisabled = !_modalAvailable('openGenerateBabyModal');

        html += '<div class="character-tab-actions">' +
            _bigActionBtn('add-biological-child', '+ Add Biological Child', {
                primary: true,
                disabled: addBioDisabled,
                disabledTitle: addBioDisabled
                    ? 'Add-child modal is not available'
                    : null
            }) +
            _bigActionBtn('add-adopted-child', '+ Add Adopted Child', {
                disabled: addAdoptedDisabled,
                disabledTitle: addAdoptedDisabled
                    ? 'Add-child modal is not available'
                    : null
            }) +
            _bigActionBtn('add-foster-child', '+ Add Foster Child', {
                disabled: addFosterDisabled,
                disabledTitle: addFosterDisabled
                    ? 'Add-foster/ward modal is not available'
                    : null
            }) +
            _bigActionBtn('add-ward', '+ Add Ward', {
                disabled: addWardDisabled,
                disabledTitle: addWardDisabled
                    ? 'Add-foster/ward modal is not available'
                    : null
            }) +
            _bigActionBtn('generate-baby', 'Generate New Baby', {
                disabled: genBabyDisabled,
                disabledTitle: genBabyDisabled
                    ? 'Generate-baby modal is not available'
                    : null
            }) +
        '</div>';

        html += '<div class="character-family-note">' +
            'Add Biological / Adopted / Foster / Ward add an ' +
            'existing character as a child. Generate New Baby ' +
            'creates a brand-new biological child of this character ' +
            'and a chosen partner. The coverage dot before a child\'s ' +
            'name indicates whether both parents are recorded (solid), ' +
            'one parent (half), or the child is adopted (outline).' +
        '</div>';

        return html;
    }

    // ---------- 5c. Siblings ----------

    function _bodySiblings(model, characterId) {
        if (!model.siblings) {
            var err = model.errors && model.errors.siblings
                ? model.errors.siblings : 'unknown error';
            return _unavailable('Siblings could not be loaded: ' + err);
        }
        var s = model.siblings;
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

        if (!s.all || s.all.length === 0) {
            html += _empty('No siblings recorded.');
        } else {
            for (var i = 0; i < s.all.length; i++) {
                html += _memberRowHtml(s.all[i], { siblingIcon: true });
            }
        }

        // Action buttons: Add Biological Sibling, Add Adopted Sibling.
        var addBioSibDisabled = !_modalAvailable('openAddExistingSiblingModal');
        var addAdoptedSibDisabled = !_modalAvailable('openAddAdoptedSiblingModal');

        html += '<div class="character-tab-actions">' +
            _bigActionBtn('add-biological-sibling', '+ Add Biological Sibling', {
                primary: true,
                disabled: addBioSibDisabled,
                disabledTitle: addBioSibDisabled
                    ? 'Add-sibling modal is not available'
                    : null
            }) +
            _bigActionBtn('add-adopted-sibling', '+ Add Adopted Sibling', {
                disabled: addAdoptedSibDisabled,
                disabledTitle: addAdoptedSibDisabled
                    ? 'Add-sibling modal is not available'
                    : null
            }) +
        '</div>';

        html += '<div class="character-family-note">' +
            'Add Biological Sibling picks an existing character and ' +
            'shares some or all of this character\'s biological ' +
            'parents with them. Add Adopted Sibling does the same ' +
            'for this character\'s adopting parents.' +
        '</div>';

        return html;
    }

    // ---------- 5d. Foster Parents (this character as the child) ----------

    function _bodyFosterAsChild(model) {
        var entries = Array.isArray(model.fosterAsChild)
            ? model.fosterAsChild : [];
        if (entries.length === 0) {
            return _empty('Not currently in foster care.');
        }
        var html = '';
        for (var i = 0; i < entries.length; i++) {
            var year = entries[i].adoptionYear;
            html += _memberRowHtml(entries[i], {
                extra: (typeof year === 'number') ? 'since ' + _year(year) : ''
            });
        }
        return html;
    }

    // ---------- 5e. Guardians (this character as the ward) ----------

    function _bodyWardAsChild(model) {
        var entries = Array.isArray(model.wardAsChild)
            ? model.wardAsChild : [];
        if (entries.length === 0) {
            return _empty('No guardians recorded.');
        }
        var html = '';
        for (var i = 0; i < entries.length; i++) {
            var year = entries[i].adoptionYear;
            html += _memberRowHtml(entries[i], {
                extra: (typeof year === 'number') ? 'since ' + _year(year) : ''
            });
        }
        return html;
    }

    // ---------- 5f. Grandchildren ----------

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

    // ---------- 5g. Surrogacy Children ----------

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

    // ---------- 5h. Adoptive Parents (this character as the adopted child) ----------

    function _bodyAdoptiveParents(model) {
        if (!model.adoptedParents) {
            var err = model.errors && model.errors.adoptedParents
                ? model.errors.adoptedParents : 'unknown error';
            return _unavailable('Adoptive parents could not be loaded: ' + err);
        }
        var a = model.adoptedParents;
        if (!a.all || a.all.length === 0) {
            return _empty('No adoptive parents recorded.');
        }
        var html = '';
        for (var i = 0; i < a.all.length; i++) {
            var year = a.all[i].adoptionYear;
            html += _memberRowHtml(a.all[i], {
                extra: (typeof year === 'number')
                    ? 'since ' + _year(year)
                    : ''
            });
        }
        return html;
    }

    // =========================================================================
    // 6. RENDER
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

        var fosterAsChildCount = Array.isArray(model.fosterAsChild)
            ? model.fosterAsChild.length : 0;

        var wardAsChildCount = Array.isArray(model.wardAsChild)
            ? model.wardAsChild.length : 0;

        var grandchildrenCount = model.grandchildren
            ? model.grandchildren.length : 0;

        var surrogacyCount = model.surrogacyChildren
            ? model.surrogacyChildren.length : 0;

        var adoptiveParentsCount = model.adoptedParents && model.adoptedParents.all
            ? model.adoptedParents.all.length : 0;

        var body = '';
        body += headerHtml;
        body += _sectionHtml(SECTIONS[0],
            _bodyParents(model, context.characterId), parentsCount);
        body += _sectionHtml(SECTIONS[1],
            _bodyChildren(model, context.characterId), childrenCount);
        body += _sectionHtml(SECTIONS[2],
            _bodySiblings(model, context.characterId), siblingsCount);
        body += _sectionHtml(SECTIONS[3],
            _bodyFosterAsChild(model), fosterAsChildCount);
        body += _sectionHtml(SECTIONS[4],
            _bodyWardAsChild(model), wardAsChildCount);
        body += _sectionHtml(SECTIONS[5],
            _bodyGrandchildren(model), grandchildrenCount);
        body += _sectionHtml(SECTIONS[6],
            _bodySurrogacy(model), surrogacyCount);
        body += _sectionHtml(SECTIONS[7],
            _bodyAdoptiveParents(model), adoptiveParentsCount);

        container.innerHTML = body;
        _wire(container, context.characterId, model);
    }

    // =========================================================================
    // 7. WIRING
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
            // Parents
            case 'set-mother':
                _onSetParent(characterId, 'mother'); return;
            case 'set-father':
                _onSetParent(characterId, 'father'); return;

            // Children
            case 'add-biological-child':
                _onAddExistingChild(characterId, 'biological'); return;
            case 'add-adopted-child':
                _onAddExistingChild(characterId, 'adopted'); return;
            case 'add-foster-child':
                _onAddFosterOrWard(characterId, 'foster'); return;
            case 'add-ward':
                _onAddFosterOrWard(characterId, 'guardianship'); return;
            case 'generate-baby':
                _onGenerateBaby(characterId, model); return;
            case 'remove-child':
                _onRemoveChild(characterId, btn); return;
            case 'end-adoption':
                _onEndAdoption(characterId, btn); return;

            // Siblings
            case 'add-biological-sibling':
                _onAddBiologicalSibling(characterId); return;
            case 'add-adopted-sibling':
                _onAddAdoptedSibling(characterId); return;

            default:
                if (typeof console !== 'undefined' && console.warn) {
                    console.warn('[family-tab] unknown action: ' + action);
                }
        }
    }

    // =========================================================================
    // 8. ACTION IMPLEMENTATIONS
    // =========================================================================

    function _onSetParent(characterId, role) {
        if (typeof window.openSetParentModal !== 'function') {
            _toast('Set-parent modal is not available.', 'error');
            return;
        }
        window.openSetParentModal(characterId, role, function () {
            _refresh();
        });
    }

    function _onAddExistingChild(characterId, type) {
        if (typeof window.openAddExistingChildModal !== 'function') {
            _toast('Add-child modal is not available.', 'error');
            return;
        }
        window.openAddExistingChildModal(characterId, type, function () {
            _refresh();
        });
    }

    function _onAddFosterOrWard(characterId, kind) {
        if (typeof window.openAddFosterOrWardModal !== 'function') {
            _toast('Add-foster/ward modal is not available.', 'error');
            return;
        }
        window.openAddFosterOrWardModal(characterId, kind, function () {
            _refresh();
        });
    }

    function _onGenerateBaby(characterId, model) {
        if (typeof window.openGenerateBabyModal !== 'function') {
            _toast('Generate-baby modal is not available.', 'error');
            return;
        }
        // Pass the pre-resolved partner from the model when there is
        // exactly one committed partner (see the "auto-select the
        // committed partner" decision). The modal itself also handles
        // the picker fallback, but passing the resolved partner
        // improves UX.
        var opts = {};
        if (model && model.partnerForBaby
            && _hasId(model.partnerForBaby.partnerId)) {
            opts.partnerId = model.partnerForBaby.partnerId;
        }
        window.openGenerateBabyModal(characterId, function () {
            _refresh();
        }, opts);
    }

    function _onAddBiologicalSibling(characterId) {
        if (typeof window.openAddExistingSiblingModal !== 'function') {
            _toast('Add-sibling modal is not available.', 'error');
            return;
        }
        window.openAddExistingSiblingModal(characterId, function () {
            _refresh();
        });
    }

    function _onAddAdoptedSibling(characterId) {
        if (typeof window.openAddAdoptedSiblingModal !== 'function') {
            _toast('Add-adopted-sibling modal is not available.', 'error');
            return;
        }
        window.openAddAdoptedSiblingModal(characterId, function () {
            _refresh();
        });
    }

    function _onRemoveChild(characterId, btn) {
        if (!window.FamilyCommands
            || typeof window.FamilyCommands.removeParent !== 'function') {
            _toast('FamilyCommands.removeParent is not loaded.', 'error');
            return;
        }

        var childId = btn.getAttribute('data-child-id');
        if (!_hasId(childId)) return;

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

        var adopterId;
        var resolvedChildId;
        var membershipId = childId;
        if (btn.closest('[data-section]')
            && btn.closest('[data-section]').getAttribute('data-section') === 'adoptiveParents') {
            adopterId = membershipId;
            resolvedChildId = characterId;
        } else {
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
    // 9. REGISTRATION
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
    // 10. EXPORTS
    // =========================================================================

    window.CharacterFamilyTab = {
        id: TAB_ID,
        render: renderFamilyTab
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CharacterFamilyTab;
    }
})();
