// js/tabs/character-family-tab.js
/**
 * =============================================================================
 * STILL WATERS - CHARACTER FAMILY TAB
 * (js/tabs/character-family-tab.js)
 * =============================================================================
 *
 * LOCATION: js/tabs/character-family-tab.js
 *
 * REFACTOR HISTORY:
 *   Current revision:
 *     - FIXED: duplicate-modal bug. The tab used to call
 *       container.addEventListener('click', ...) unconditionally in
 *       _wire, so every re-render added another listener. After N
 *       re-renders, one click fired N handlers, and "Set Mother"
 *       opened N picker modals. The handler is now stored on the
 *       container (HANDLER_KEY) and removed before the new one is
 *       installed. Matches the fix already applied to
 *       character-romance-tab.js and character-friendship-tab.js.
 *     - No other behavioural change.
 * =============================================================================
 */

(function () {
    'use strict';

    var TAB_ID = 'family';
    var SCOPE  = 'character';
    var HANDLER_KEY = '__familyTabClickHandler';

    var SECTIONS = [
        { key: 'parents',         label: 'Parents',                       icon: 'FAMILY_TREE' },
        { key: 'children',        label: 'Children',                      icon: 'PERSON' },
        { key: 'surrogacy',       label: 'Surrogacy Children',            icon: 'STORK' },
        { key: 'siblings',        label: 'Siblings',                      icon: 'FAMILY_TREE' },
        { key: 'fosterAsChild',   label: 'Foster Parents',                icon: 'SHIELD' },
        { key: 'wardAsChild',     label: 'Guardians',                     icon: 'SHIELD' },
        { key: 'adoptiveParents', label: 'Adoptive Parents',              icon: 'SHIELD' }
    ];

    function _esc(v) {
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(v);
        if (v === null || v === undefined) return '';
        return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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

    function _bodyParents(model, characterId) {
        if (!model.parents) {
            var err = model.errors && model.errors.parents
                ? model.errors.parents : 'unknown error';
            return _unavailable('Parents could not be loaded: ' + err);
        }
        var p = model.parents;

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

        if (!p.all || p.all.length === 0) {
            html += _empty('No parents recorded.');
        }

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
            'at that role. A parent must be at least 13 years older ' +
            'than the child.' +
        '</div>';

        return html;
    }

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

        var addBioDisabled = !_modalAvailable('openAddExistingBiologicalChildModal');
        var addAdoptedDisabled = !_modalAvailable('openAddAdoptedChildModal');
        var addFosterDisabled = !_modalAvailable('openAddFosterOrWardModal');
        var addWardDisabled = !_modalAvailable('openAddFosterOrWardModal');
        var genBabyDisabled = !_modalAvailable('openGenerateBabyModal');

        html += '<div class="character-tab-actions">' +
            _bigActionBtn('add-biological-child', '+ Add Biological Child', {
                primary: true,
                disabled: addBioDisabled,
                disabledTitle: addBioDisabled ? 'Add biological child modal is not available' : null
            }) +
            _bigActionBtn('add-adopted-child', '+ Add Adopted Child', {
                disabled: addAdoptedDisabled,
                disabledTitle: addAdoptedDisabled ? 'Add adopted child modal is not available' : null
            }) +
            _bigActionBtn('add-foster-child', '+ Add Foster Child', {
                disabled: addFosterDisabled,
                disabledTitle: addFosterDisabled ? 'Add foster/ward modal is not available' : null
            }) +
            _bigActionBtn('add-ward', '+ Add Ward', {
                disabled: addWardDisabled,
                disabledTitle: addWardDisabled ? 'Add foster/ward modal is not available' : null
            }) +
            _bigActionBtn('generate-baby', 'Generate New Baby', {
                disabled: genBabyDisabled,
                disabledTitle: genBabyDisabled ? 'Generate-baby modal is not available' : null
            }) +
        '</div>';

        html += '<div class="character-family-note">' +
            'Add Biological / Adopted / Foster / Ward add an ' +
            'existing character as a child. A child must be at least ' +
            '13 years younger than this character. Generate New Baby ' +
            'creates a brand-new biological child of this character ' +
            'and a chosen partner.' +
        '</div>';

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

        var addBioSibDisabled = !_modalAvailable('openAddExistingBiologicalSiblingModal');
        var addAdoptedSibDisabled = !_modalAvailable('openAddAdoptedSiblingModal');

        html += '<div class="character-tab-actions">' +
            _bigActionBtn('add-biological-sibling', '+ Add Biological Sibling', {
                primary: true,
                disabled: addBioSibDisabled,
                disabledTitle: addBioSibDisabled ? 'Add biological sibling modal is not available' : null
            }) +
            _bigActionBtn('add-adopted-sibling', '+ Add Adopted Sibling', {
                disabled: addAdoptedSibDisabled,
                disabledTitle: addAdoptedSibDisabled ? 'Add adopted sibling modal is not available' : null
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

    function _bodyFosterAsChild(model, characterId) {
        var entries = Array.isArray(model.fosterAsChild) ? model.fosterAsChild : [];
        var html = '';
        if (entries.length === 0) {
            html += _empty('Not currently in foster care.');
        } else {
            for (var i = 0; i < entries.length; i++) {
                var year = entries[i].adoptionYear;
                html += _memberRowHtml(entries[i], {
                    extra: (typeof year === 'number') ? 'since ' + _year(year) : ''
                });
            }
        }
        var addDisabled = !_modalAvailable('openAddFosterParentModal');
        html += '<div class="character-tab-actions">' +
            _bigActionBtn('add-foster-parent', '+ Add Foster Parent', {
                primary: entries.length === 0,
                disabled: addDisabled,
                disabledTitle: addDisabled ? 'Add foster parent modal is not available' : null
            }) +
        '</div>';
        return html;
    }

    function _bodyWardAsChild(model, characterId) {
        var entries = Array.isArray(model.wardAsChild) ? model.wardAsChild : [];
        var html = '';
        if (entries.length === 0) {
            html += _empty('No guardians recorded.');
        } else {
            for (var i = 0; i < entries.length; i++) {
                var year = entries[i].adoptionYear;
                html += _memberRowHtml(entries[i], {
                    extra: (typeof year === 'number') ? 'since ' + _year(year) : ''
                });
            }
        }
        var addDisabled = !_modalAvailable('openAddGuardianModal');
        html += '<div class="character-tab-actions">' +
            _bigActionBtn('add-guardian', '+ Add Guardian', {
                primary: entries.length === 0,
                disabled: addDisabled,
                disabledTitle: addDisabled ? 'Add guardian modal is not available' : null
            }) +
        '</div>';
        return html;
    }

    function _bodyAdoptiveParents(model, characterId) {
        if (!model.adoptedParents) {
            var err = model.errors && model.errors.adoptedParents
                ? model.errors.adoptedParents : 'unknown error';
            return _unavailable('Adoptive parents could not be loaded: ' + err);
        }
        var a = model.adoptedParents;
        var html = '';
        if (!a.all || a.all.length === 0) {
            html += _empty('No adoptive parents recorded.');
        } else {
            for (var i = 0; i < a.all.length; i++) {
                var year = a.all[i].adoptionYear;
                html += _memberRowHtml(a.all[i], {
                    extra: (typeof year === 'number') ? 'since ' + _year(year) : ''
                });
            }
        }
        var addDisabled = !_modalAvailable('openAddAdoptiveParentModal');
        html += '<div class="character-tab-actions">' +
            _bigActionBtn('add-adoptive-parent', '+ Add Adoptive Parent', {
                primary: a.all.length === 0,
                disabled: addDisabled,
                disabledTitle: addDisabled ? 'Add adoptive parent modal is not available' : null
            }) +
        '</div>';
        return html;
    }

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
                    _esc('Family') + orphanBadge +
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

        var surrogacyCount = model.surrogacyChildren
            ? model.surrogacyChildren.length : 0;

        var siblingsCount = model.siblings && model.siblings.all
            ? model.siblings.all.length : 0;

        var fosterAsChildCount = Array.isArray(model.fosterAsChild)
            ? model.fosterAsChild.length : 0;

        var wardAsChildCount = Array.isArray(model.wardAsChild)
            ? model.wardAsChild.length : 0;

        var adoptiveParentsCount = model.adoptedParents && model.adoptedParents.all
            ? model.adoptedParents.all.length : 0;

        var body = '';
        body += headerHtml;
        body += _sectionHtml(SECTIONS[0], _bodyParents(model, context.characterId), parentsCount);
        body += _sectionHtml(SECTIONS[1], _bodyChildren(model, context.characterId), childrenCount);
        body += _sectionHtml(SECTIONS[2], _bodySurrogacy(model), surrogacyCount);
        body += _sectionHtml(SECTIONS[3], _bodySiblings(model, context.characterId), siblingsCount);
        body += _sectionHtml(SECTIONS[4], _bodyFosterAsChild(model, context.characterId), fosterAsChildCount);
        body += _sectionHtml(SECTIONS[5], _bodyWardAsChild(model, context.characterId), wardAsChildCount);
        body += _sectionHtml(SECTIONS[6], _bodyAdoptiveParents(model, context.characterId), adoptiveParentsCount);

        container.innerHTML = body;
        _wire(container, context.characterId, model);
    }

    function _wire(container, characterId, model) {
        var headers = container.querySelectorAll('.character-tab-section__header');
        for (var i = 0; i < headers.length; i++) {
            headers[i].addEventListener('click', _onToggleSection);
        }

        // Remove previous container-level click handler to prevent
        // stale listeners from accumulating across re-renders.
        if (container[HANDLER_KEY]) {
            container.removeEventListener('click', container[HANDLER_KEY]);
            container[HANDLER_KEY] = null;
        }

        var handler = function (e) {
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

            var btn = target.closest ? target.closest('[data-action]') : null;
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
            case 'set-mother': _onSetParent(characterId, 'mother'); return;
            case 'set-father': _onSetParent(characterId, 'father'); return;
            case 'add-biological-child': _onAddExistingBiologicalChild(characterId); return;
            case 'add-adopted-child': _onAddAdoptedChild(characterId); return;
            case 'add-foster-child': _onAddFosterOrWard(characterId, 'foster'); return;
            case 'add-ward': _onAddFosterOrWard(characterId, 'guardianship'); return;
            case 'generate-baby': _onGenerateBaby(characterId, model); return;
            case 'remove-child': _onRemoveChild(characterId, btn); return;
            case 'end-adoption': _onEndAdoption(characterId, btn); return;
            case 'add-biological-sibling': _onAddBiologicalSibling(characterId); return;
            case 'add-adopted-sibling': _onAddAdoptedSibling(characterId); return;
            case 'add-foster-parent': _onAddFosterParent(characterId); return;
            case 'add-guardian': _onAddGuardian(characterId); return;
            case 'add-adoptive-parent': _onAddAdoptiveParent(characterId); return;
            default:
                if (typeof console !== 'undefined' && console.warn) {
                    console.warn('[family-tab] unknown action: ' + action);
                }
        }
    }

    function _onSetParent(characterId, role) {
        if (typeof window.openSetParentModal !== 'function') {
            _toast('Set-parent modal is not available.', 'error'); return;
        }
        window.openSetParentModal(characterId, role, function () { _refresh(); });
    }

    function _onAddExistingBiologicalChild(characterId) {
        if (typeof window.openAddExistingBiologicalChildModal !== 'function') {
            _toast('Add biological child modal is not available.', 'error'); return;
        }
        window.openAddExistingBiologicalChildModal(characterId, function () { _refresh(); });
    }

    function _onAddAdoptedChild(characterId) {
        if (typeof window.openAddAdoptedChildModal !== 'function') {
            _toast('Add adopted child modal is not available.', 'error'); return;
        }
        window.openAddAdoptedChildModal(characterId, function () { _refresh(); });
    }

    function _onAddFosterOrWard(characterId, kind) {
        if (typeof window.openAddFosterOrWardModal !== 'function') {
            _toast('Add-foster/ward modal is not available.', 'error'); return;
        }
        window.openAddFosterOrWardModal(characterId, kind, function () { _refresh(); });
    }

    function _onGenerateBaby(characterId, model) {
        if (typeof window.openGenerateBabyModal !== 'function') {
            _toast('Generate-baby modal is not available.', 'error'); return;
        }
        var opts = {};
        if (model && model.partnerForBaby && _hasId(model.partnerForBaby.partnerId)) {
            opts.partnerId = model.partnerForBaby.partnerId;
        }
        window.openGenerateBabyModal(characterId, function () { _refresh(); }, opts);
    }

    function _onAddBiologicalSibling(characterId) {
        if (typeof window.openAddExistingBiologicalSiblingModal !== 'function') {
            _toast('Add biological sibling modal is not available.', 'error'); return;
        }
        window.openAddExistingBiologicalSiblingModal(characterId, function () { _refresh(); });
    }

    function _onAddAdoptedSibling(characterId) {
        if (typeof window.openAddAdoptedSiblingModal !== 'function') {
            _toast('Add adopted sibling modal is not available.', 'error'); return;
        }
        window.openAddAdoptedSiblingModal(characterId, function () { _refresh(); });
    }

    function _onAddFosterParent(characterId) {
        if (typeof window.openAddFosterParentModal !== 'function') {
            _toast('Add foster parent modal is not available.', 'error'); return;
        }
        window.openAddFosterParentModal(characterId, function () { _refresh(); });
    }

    function _onAddGuardian(characterId) {
        if (typeof window.openAddGuardianModal !== 'function') {
            _toast('Add guardian modal is not available.', 'error'); return;
        }
        window.openAddGuardianModal(characterId, function () { _refresh(); });
    }

    function _onAddAdoptiveParent(characterId) {
        if (typeof window.openAddAdoptiveParentModal !== 'function') {
            _toast('Add adoptive parent modal is not available.', 'error'); return;
        }
        window.openAddAdoptiveParentModal(characterId, function () { _refresh(); });
    }

    function _onRemoveChild(characterId, btn) {
        if (!window.FamilyCommands || typeof window.FamilyCommands.removeParent !== 'function') {
            _toast('FamilyCommands.removeParent is not loaded.', 'error'); return;
        }

        var childId = btn.getAttribute('data-child-id');
        if (!_hasId(childId)) return;

        var edgeId = _findActiveParentEdge(characterId, childId);
        if (!edgeId) {
            _toast('Could not find the parent edge to remove.', 'error'); return;
        }

        var childName = '';
        try {
            var cs = window.CharacterQueries.getCharacterSummary(childId);
            if (cs) childName = (cs.fullName && cs.fullName.length > 0) ? cs.fullName : (cs.name || childId);
        } catch (e) { /* ignore */ }

        var message = childName
            ? 'End the parent relationship with ' + childName + '?'
            : 'End this parent relationship?';

        var doRemove = function () {
            var currentYear = 0;
            try { currentYear = window.getCurrentYear(); }
            catch (e) { currentYear = 0; }

            var res = window.FamilyCommands.removeParent(edgeId, {
                endYear: currentYear, reason: 'removed_from_family_tab'
            });
            if (!res || res.success !== true) {
                _toast('Failed: ' + (res && res.reason ? res.reason : 'unknown'), 'error'); return;
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
        if (!window.FamilyCommands || typeof window.FamilyCommands.removeAdoption !== 'function') {
            _toast('FamilyCommands.removeAdoption is not loaded.', 'error'); return;
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

            var res = window.FamilyCommands.removeAdoption(resolvedChildId, adopterId, {
                endYear: currentYear, reason: 'ended_from_family_tab'
            });
            if (!res || res.success !== true) {
                _toast('Failed: ' + (res && res.reason ? res.reason : 'unknown'), 'error'); return;
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
        if (typeof window.FamilyQueries === 'undefined' || !window.FamilyQueries
            || typeof window.FamilyQueries.getEdgesForChild !== 'function') {
            return null;
        }
        var edges;
        try { edges = window.FamilyQueries.getEdgesForChild(childId, { status: 'ongoing' }); }
        catch (e) { edges = null; }
        if (!Array.isArray(edges)) return null;
        for (var i = 0; i < edges.length; i++) {
            if (edges[i] && edges[i].parentId === parentId) return edges[i].id;
        }
        return null;
    }

    if (window.TabManager && typeof window.TabManager.register === 'function') {
        window.TabManager.register(SCOPE, TAB_ID, renderFamilyTab);
    } else if (typeof console !== 'undefined' && console.warn) {
        console.warn('character-family-tab.js: TabManager is not available; the tab was not registered.');
    }

    window.CharacterFamilyTab = { id: TAB_ID, render: renderFamilyTab };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CharacterFamilyTab;
    }
})();
