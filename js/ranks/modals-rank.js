/**
 * =============================================================================
 * STILL WATERS - RANK MODALS (modals-rank.js)
 * =============================================================================
 *
 * LOCATION: js/core/rank/modals-rank.js
 *
 * All modals for the rank domain. Presentation only.
 *
 * EXPORTED FUNCTIONS:
 *   - RankModals.openCreateRankModal(options)
 *   - RankModals.openEditRankModal(rankId, options)
 *   - RankModals.openAssignRankModal(options)
 *   - RankModals.openRankDetailsModal(rankId, options)
 *
 * This file:
 *   - renders create / edit / assign / details modals for ranks
 *   - reads via RankQueries, RankState, CharacterState
 *   - writes via RankCommands only
 *   - calls RankCommands.persist() exactly once per successful write
 *
 * This file does NOT:
 *   - touch rank or character state directly
 *   - re-derive policy (validation, salary, numbering) — those live in
 *     RankRules and the command layer
 *   - read character.relationships, character.professions, or any other
 *     embedded domain container directly — those come off the projection
 *
 * DEPENDENCIES (REQUIRED, must load first):
 *   - modals-core.js        (openModal, closeTopModal)
 *   - icons.js              (Icons)
 *   - rank-constants.js     (RANK_LEVELS, AVAILABLE_SYMBOLS)
 *   - rank-rules.js         (RankRules)
 *   - rank-state.js         (RankState)
 *   - rank-queries.js       (RankQueries)
 *   - rank-commands.js      (RankCommands)
 *   - character-state.js    (CharacterState)
 *   - time.js               (getCurrentYear, calculateAge)
 *
 * DEPENDENCIES (OPTIONAL, used only if present):
 *   - getCharacterById — falls back to CharacterState.getCharacter
 *   - _showToast / showToast — toast helper, at window scope
 *
 * ICON POLICY: No emojis. Icons come from icons.js via Icons.NAME. No
 * inline Unicode glyphs in buttons, badges, or select options. Level
 * glyphs are not shown in the priority dropdown; the level name alone is
 * the option label.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. HARD DEPENDENCY CHECK
    // =========================================================================

    var REQUIRED = [
        ['openModal',        'modals-core.js'],
        ['closeTopModal',    'modals-core.js'],
        ['Icons',            'icons.js'],
        ['RankState',        'rank-state.js'],
        ['RankRules',        'rank-rules.js'],
        ['RankQueries',      'rank-queries.js'],
        ['RankCommands',     'rank-commands.js'],
        ['CharacterState',   'character-state.js'],
        ['getCurrentYear',   'time.js']
    ];
    for (var _i = 0; _i < REQUIRED.length; _i++) {
        if (typeof window[REQUIRED[_i][0]] === 'undefined') {
            throw new Error(
                'modals-rank.js requires ' + REQUIRED[_i][1] +
                ' (' + REQUIRED[_i][0] + ').'
            );
        }
    }

    var RS = window.RankState;
    var RR = window.RankRules;
    var RQ = window.RankQueries;
    var RC = window.RankCommands;
    var CS = window.CharacterState;

    // =========================================================================
    // 2. PRESENTATION HELPERS
    // =========================================================================

    function _hasId(v) {
        return typeof v === 'string' && v.length > 0;
    }

    function _isMissing(v) {
        return v === undefined || v === null;
    }

    function _escapeHtml(str) {
        if (typeof window.escapeHtml === 'function') {
            return window.escapeHtml(str);
        }
        if (typeof window._escapeHtml === 'function') {
            return window._escapeHtml(str);
        }
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _esc(v) {
        return _escapeHtml(_isMissing(v) ? '' : String(v));
    }

    function _icon(name) {
        if (!window.Icons || typeof window.Icons[name] !== 'string') {
            throw new Error('modals-rank.js: unknown icon "' + name + '".');
        }
        return window.Icons[name];
    }

    function _iconSpan(name) {
        return '<span class="icon-inline">' + _icon(name) + '</span>';
    }

    function _toast(message, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(message, type || 'info');
        } else if (typeof window.showToast === 'function') {
            window.showToast(message, type || 'info');
        }
    }

    function _displayName(character) {
        if (!character) return '';
        var name = typeof character.name === 'string' ? character.name : '';
        var surname = typeof character.surname === 'string' ? character.surname : '';
        return (name + ' ' + surname).trim();
    }

    function _currentYear() {
        return window.getCurrentYear();
    }

    function _ageOf(character) {
        if (!character) return null;
        if (typeof window.calculateAge !== 'function') return null;
        return window.calculateAge(
            character.birthYear,
            character.isDeceased === true,
            character.deathYear
        );
    }

    // =========================================================================
    // 3. SHARED OPTION BUILDERS
    // =========================================================================

    var SYMBOL_FALLBACK = ['⟡'];

    function _getSymbols() {
        var s = window.AVAILABLE_SYMBOLS;
        if (Array.isArray(s) && s.length > 0) return s;
        return SYMBOL_FALLBACK;
    }

    function _buildSymbolOptions(selected) {
        var symbols = _getSymbols();
        var html = '';
        for (var i = 0; i < symbols.length; i++) {
            var sym = symbols[i];
            var sel = sym === selected ? ' selected' : '';
            html += '<option value="' + _esc(sym) + '"' + sel + '>' +
                _esc(sym) + '</option>';
        }
        return html;
    }

    /**
     * Builds the priority select options.
     *
     * The option label is the level name alone. No glyph is rendered in
     * the dropdown; the previous inline Unicode level indicator was removed
     * when RANK_LEVELS[*].icon was stripped. If a glyph is ever wanted here,
     * the correct source is RankQueries.getRankLevelIcon(p), which returns
     * SVG markup — unsuitable for <option> content in some browsers. The
     * level name alone is the deliberate choice.
     */
    function _buildPriorityOptions(selected) {
        var levels = window.RANK_LEVELS || {};
        var keys = Object.keys(levels).map(function (k) { return parseInt(k, 10); })
            .filter(function (n) { return Number.isFinite(n); })
            .sort(function (a, b) { return a - b; });
        if (keys.length === 0) keys = [1, 2, 3, 4, 5];
        var html = '';
        for (var i = 0; i < keys.length; i++) {
            var p = keys[i];
            var lvl = levels[p] || {};
            var sel = p === selected ? ' selected' : '';
            html += '<option value="' + _esc(p) + '"' + sel + '>' +
                _esc(lvl.name || ('Level ' + p)) +
                '</option>';
        }
        return html;
    }

    function _buildGenderOptions(selected) {
        var opts = [
            { id: 'either', label: 'Either' },
            { id: 'male', label: 'Male only' },
            { id: 'female', label: 'Female only' }
        ];
        var html = '';
        for (var i = 0; i < opts.length; i++) {
            var sel = opts[i].id === selected ? ' selected' : '';
            html += '<option value="' + opts[i].id + '"' + sel + '>' +
                opts[i].label + '</option>';
        }
        return html;
    }

    function _buildNumberingTypeOptions(selected) {
        var opts = [
            { id: 'reign', label: 'Reign (I, II, III...)' },
            { id: 'ordinal', label: 'Ordinal (1st, 2nd, 3rd...)' },
            { id: 'roman', label: 'Roman (I, II, III...)' }
        ];
        var html = '';
        for (var i = 0; i < opts.length; i++) {
            var sel = opts[i].id === selected ? ' selected' : '';
            html += '<option value="' + opts[i].id + '"' + sel + '>' +
                opts[i].label + '</option>';
        }
        return html;
    }

    function _buildNumberingGroupOptions(selected) {
        var opts = [
            { id: 'global', label: 'Global (all holders share one sequence)' },
            { id: 'parent', label: 'By parent' },
            { id: 'spouse', label: 'By spouse' },
            { id: 'source', label: 'By inheritance source' }
        ];
        var html = '';
        for (var i = 0; i < opts.length; i++) {
            var sel = opts[i].id === selected ? ' selected' : '';
            html += '<option value="' + opts[i].id + '"' + sel + '>' +
                opts[i].label + '</option>';
        }
        return html;
    }

    function _buildInheritanceSourceOptions(selected) {
        var opts = [
            { id: 'none',   label: 'None' },
            { id: 'parent', label: 'Parent' },
            { id: 'spouse', label: 'Spouse' }
        ];
        var html = '';
        for (var i = 0; i < opts.length; i++) {
            var sel = opts[i].id === selected ? ' selected' : '';
            html += '<option value="' + opts[i].id + '"' + sel + '>' +
                opts[i].label + '</option>';
        }
        return html;
    }

    function _buildRankOptions(selectedId, options) {
        options = options || {};
        var excludeIds = options.excludeIds || {};
        var includeEmpty = options.includeEmpty !== false;
        var ranks = RQ.getAllRanks();
        ranks.sort(function (a, b) {
            var ap = typeof a.priority === 'number' ? a.priority : 999;
            var bp = typeof b.priority === 'number' ? b.priority : 999;
            if (ap !== bp) return ap - bp;
            return String(a.name || '').localeCompare(String(b.name || ''));
        });

        var html = '';
        if (includeEmpty) {
            html += '<option value="">— none —</option>';
        }
        for (var i = 0; i < ranks.length; i++) {
            var r = ranks[i];
            if (excludeIds[r.id]) continue;
            var sel = r.id === selectedId ? ' selected' : '';
            html += '<option value="' + _esc(r.id) + '"' + sel + '>' +
                _esc((r.symbol || '⟡') + ' ' + (r.name || '')) +
                '</option>';
        }
        return html;
    }

    function _readValue(id) {
        var el = document.getElementById(id);
        return el ? el.value : '';
    }

    function _readChecked(id) {
        var el = document.getElementById(id);
        return el ? el.checked === true : false;
    }

    function _readNumber(id, fallback) {
        var raw = _readValue(id);
        if (raw === '') return fallback;
        var n = Number(raw);
        return Number.isFinite(n) ? n : fallback;
    }

    // =========================================================================
    // 4. CREATE RANK MODAL
    // =========================================================================

    function openCreateRankModal(options) {
        options = options || {};

        var content =
            '<div class="form-group" style="margin-bottom:12px;">' +
                '<label class="form-label">Rank name *</label>' +
                '<input type="text" id="rankName" value="New Rank" ' +
                'class="form-input" style="width:100%;">' +
            '</div>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">' +
                '<div>' +
                    '<label class="form-label">Level</label>' +
                    '<select id="rankPriority" class="form-input" style="width:100%;">' +
                        _buildPriorityOptions(4) +
                    '</select>' +
                '</div>' +
                '<div>' +
                    '<label class="form-label">Symbol</label>' +
                    '<select id="rankSymbol" class="form-input" style="width:100%;">' +
                        _buildSymbolOptions('⟡') +
                    '</select>' +
                '</div>' +
            '</div>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">' +
                '<div>' +
                    '<label class="form-label">Gender restriction</label>' +
                    '<select id="rankGender" class="form-input" style="width:100%;">' +
                        _buildGenderOptions('either') +
                    '</select>' +
                '</div>' +
                '<div>' +
                    '<label class="form-label">Parent rank</label>' +
                    '<select id="rankParent" class="form-input" style="width:100%;">' +
                        _buildRankOptions(null, { includeEmpty: true }) +
                    '</select>' +
                '</div>' +
            '</div>' +

            '<div class="form-checkbox-row" style="margin-bottom:8px;">' +
                '<label class="form-checkbox">' +
                    '<input type="checkbox" id="rankNumbered">' +
                    '<span>Numbered</span>' +
                '</label>' +
            '</div>' +

            '<div id="rankNumberingFields" style="display:none;padding:10px;background:var(--bg3);border-radius:6px;margin-bottom:12px;">' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">' +
                    '<div>' +
                        '<label class="form-label">Numbering style</label>' +
                        '<select id="rankNumberingType" class="form-input" style="width:100%;">' +
                            _buildNumberingTypeOptions('reign') +
                        '</select>' +
                    '</div>' +
                    '<div>' +
                        '<label class="form-label">Numbering group</label>' +
                        '<select id="rankNumberingGroup" class="form-input" style="width:100%;">' +
                            _buildNumberingGroupOptions('global') +
                        '</select>' +
                    '</div>' +
                '</div>' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +
                    '<div>' +
                        '<label class="form-label">Prefix</label>' +
                        '<input type="text" id="rankNumberingPrefix" value="" ' +
                        'class="form-input" style="width:100%;">' +
                    '</div>' +
                    '<div>' +
                        '<label class="form-label">Suffix</label>' +
                        '<input type="text" id="rankNumberingSuffix" value="" ' +
                        'class="form-input" style="width:100%;">' +
                    '</div>' +
                '</div>' +
            '</div>' +

            '<div class="form-checkbox-row" style="margin-bottom:8px;">' +
                '<label class="form-checkbox">' +
                    '<input type="checkbox" id="rankDeprecateOnDeath">' +
                    '<span>Deprecate on death</span>' +
                '</label>' +
            '</div>' +

            '<div class="form-checkbox-row" style="margin-bottom:8px;">' +
                '<label class="form-checkbox">' +
                    '<input type="checkbox" id="rankAllowsMultipleSpouses">' +
                    '<span>Allows multiple spouses</span>' +
                '</label>' +
            '</div>' +

            '<div class="form-group" style="margin-bottom:8px;">' +
                '<label class="form-label">Inheritance</label>' +
                '<select id="rankInheritanceSource" class="form-input" style="width:100%;">' +
                    _buildInheritanceSourceOptions('none') +
                '</select>' +
            '</div>' +

            '<div id="rankSourceRankField" style="display:none;margin-bottom:12px;">' +
                '<label class="form-label">Source rank</label>' +
                '<select id="rankSourceRankId" class="form-input" style="width:100%;">' +
                    _buildRankOptions(null, { includeEmpty: true }) +
                '</select>' +
            '</div>' +

            '<div class="form-checkbox-row" style="margin-bottom:8px;">' +
                '<label class="form-checkbox">' +
                    '<input type="checkbox" id="rankCustomSurname">' +
                    '<span>Custom surname rule</span>' +
                '</label>' +
            '</div>' +

            '<div id="rankSurnameFields" style="display:none;padding:10px;background:var(--bg3);border-radius:6px;margin-bottom:12px;">' +
                '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">' +
                    '<div>' +
                        '<label class="form-label">Connector</label>' +
                        '<input type="text" id="rankSurnameConnector" value="of" ' +
                        'class="form-input" style="width:100%;">' +
                    '</div>' +
                    '<div>' +
                        '<label class="form-label">Prefix</label>' +
                        '<input type="text" id="rankSurnamePrefix" value="" ' +
                        'class="form-input" style="width:100%;">' +
                    '</div>' +
                    '<div>' +
                        '<label class="form-label">Suffix</label>' +
                        '<input type="text" id="rankSurnameSuffix" value="" ' +
                        'class="form-input" style="width:100%;">' +
                    '</div>' +
                '</div>' +
            '</div>';

        return window.openModal({
            titleHtml: _esc(options.title || 'Create Rank'),
            contentHtml: content,
            confirmText: 'Create',
            cancelText: 'Cancel',
            onOpen: function (modal) {
                var numbered = modal.querySelector('#rankNumbered');
                var numberingFields = modal.querySelector('#rankNumberingFields');
                if (numbered && numberingFields) {
                    numbered.addEventListener('change', function () {
                        numberingFields.style.display = this.checked ? 'block' : 'none';
                    });
                }

                var surname = modal.querySelector('#rankCustomSurname');
                var surnameFields = modal.querySelector('#rankSurnameFields');
                if (surname && surnameFields) {
                    surname.addEventListener('change', function () {
                        surnameFields.style.display = this.checked ? 'block' : 'none';
                    });
                }

                var inher = modal.querySelector('#rankInheritanceSource');
                var sourceRankField = modal.querySelector('#rankSourceRankField');
                if (inher && sourceRankField) {
                    inher.addEventListener('change', function () {
                        sourceRankField.style.display =
                            this.value === 'none' ? 'none' : 'block';
                    });
                }

                var nameInput = modal.querySelector('#rankName');
                if (nameInput) {
                    nameInput.focus();
                    nameInput.select();
                }
            },
            onConfirm: function (modal) {
                var numbered = _readChecked('rankNumbered');
                var inheritanceSource = _readValue('rankInheritanceSource') || 'none';
                var sourceRankId = inheritanceSource === 'none'
                    ? null
                    : (_readValue('rankSourceRankId') || null);
                var customSurname = _readChecked('rankCustomSurname');

                var rankData = {
                    name: _readValue('rankName'),
                    priority: _readNumber('rankPriority', 4),
                    symbol: _readValue('rankSymbol') || '⟡',
                    genderRestriction: _readValue('rankGender') || 'either',
                    parentRankId: _readValue('rankParent') || null,
                    numbered: numbered,
                    numberingType: numbered
                        ? (_readValue('rankNumberingType') || 'reign')
                        : 'reign',
                    numberingGroup: numbered
                        ? (_readValue('rankNumberingGroup') || 'global')
                        : 'global',
                    numberingPrefix: numbered
                        ? _readValue('rankNumberingPrefix')
                        : '',
                    numberingSuffix: numbered
                        ? _readValue('rankNumberingSuffix')
                        : '',
                    deprecateOnDeath: _readChecked('rankDeprecateOnDeath'),
                    allowsMultipleSpouses: _readChecked('rankAllowsMultipleSpouses'),
                    inheritanceSource: inheritanceSource,
                    sourceRankId: sourceRankId,
                    customSurnameRule: customSurname,
                    surnameConnector: customSurname
                        ? _readValue('rankSurnameConnector')
                        : 'of',
                    surnamePrefix: customSurname
                        ? _readValue('rankSurnamePrefix')
                        : '',
                    surnameSuffix: customSurname
                        ? _readValue('rankSurnameSuffix')
                        : ''
                };

                var result = RC.createRank(rankData);
                if (!result.success) {
                    _toast(result.reason || 'Failed to create rank.', 'error');
                    return false;
                }

                var persistResult = RC.persist();
                if (!persistResult.success) {
                    _toast('Rank created, but save failed: ' +
                        (persistResult.reason || 'unknown'), 'warning');
                } else {
                    _toast('Rank "' + result.rank.name + '" created.', 'success');
                }

                if (typeof options.onComplete === 'function') {
                    options.onComplete(result.rank);
                }
                window.closeTopModal();
                return true;
            }
        });
    }

    // =========================================================================
    // 5. EDIT RANK MODAL
    // =========================================================================

    function openEditRankModal(rankId, options) {
        options = options || {};
        if (!_hasId(rankId)) {
            _toast('Rank id is required.', 'error');
            return null;
        }

        var rank = RQ.getRank(rankId);
        if (!rank) {
            _toast('Rank not found.', 'error');
            return null;
        }

        var content =
            '<div class="form-group" style="margin-bottom:12px;">' +
                '<label class="form-label">Rank name</label>' +
                '<input type="text" id="rankEditName" value="' + _esc(rank.name) + '" ' +
                'class="form-input" style="width:100%;">' +
            '</div>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">' +
                '<div>' +
                    '<label class="form-label">Level</label>' +
                    '<select id="rankEditPriority" class="form-input" style="width:100%;">' +
                        _buildPriorityOptions(rank.priority) +
                    '</select>' +
                '</div>' +
                '<div>' +
                    '<label class="form-label">Symbol</label>' +
                    '<select id="rankEditSymbol" class="form-input" style="width:100%;">' +
                        _buildSymbolOptions(rank.symbol) +
                    '</select>' +
                '</div>' +
            '</div>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">' +
                '<div>' +
                    '<label class="form-label">Gender restriction</label>' +
                    '<select id="rankEditGender" class="form-input" style="width:100%;">' +
                        _buildGenderOptions(rank.genderRestriction) +
                    '</select>' +
                '</div>' +
                '<div>' +
                    '<label class="form-label">Parent rank</label>' +
                    '<select id="rankEditParent" class="form-input" style="width:100%;">' +
                        _buildRankOptions(rank.parentRankId, {
                            excludeIds: (function () {
                                var ex = {};
                                ex[rankId] = true;
                                return ex;
                            })()
                        }) +
                    '</select>' +
                '</div>' +
            '</div>' +

            '<div class="form-checkbox-row" style="margin-bottom:8px;">' +
                '<label class="form-checkbox">' +
                    '<input type="checkbox" id="rankEditNumbered"' +
                    (rank.numbered === true ? ' checked' : '') + '>' +
                    '<span>Numbered</span>' +
                '</label>' +
            '</div>' +

            '<div id="rankEditNumberingFields" style="display:' +
                (rank.numbered === true ? 'block' : 'none') +
                ';padding:10px;background:var(--bg3);border-radius:6px;margin-bottom:12px;">' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">' +
                    '<div>' +
                        '<label class="form-label">Numbering style</label>' +
                        '<select id="rankEditNumberingType" class="form-input" style="width:100%;">' +
                            _buildNumberingTypeOptions(rank.numberingType) +
                        '</select>' +
                    '</div>' +
                    '<div>' +
                        '<label class="form-label">Numbering group</label>' +
                        '<select id="rankEditNumberingGroup" class="form-input" style="width:100%;">' +
                            _buildNumberingGroupOptions(rank.numberingGroup) +
                        '</select>' +
                    '</div>' +
                '</div>' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +
                    '<div>' +
                        '<label class="form-label">Prefix</label>' +
                        '<input type="text" id="rankEditNumberingPrefix" value="' +
                        _esc(rank.numberingPrefix || '') + '" ' +
                        'class="form-input" style="width:100%;">' +
                    '</div>' +
                    '<div>' +
                        '<label class="form-label">Suffix</label>' +
                        '<input type="text" id="rankEditNumberingSuffix" value="' +
                        _esc(rank.numberingSuffix || '') + '" ' +
                        'class="form-input" style="width:100%;">' +
                    '</div>' +
                '</div>' +
            '</div>' +

            '<div class="form-checkbox-row" style="margin-bottom:8px;">' +
                '<label class="form-checkbox">' +
                    '<input type="checkbox" id="rankEditDeprecateOnDeath"' +
                    (rank.deprecateOnDeath === true ? ' checked' : '') + '>' +
                    '<span>Deprecate on death</span>' +
                '</label>' +
            '</div>' +

            '<div class="form-checkbox-row" style="margin-bottom:8px;">' +
                '<label class="form-checkbox">' +
                    '<input type="checkbox" id="rankEditAllowsMultipleSpouses"' +
                    (rank.allowsMultipleSpouses === true ? ' checked' : '') + '>' +
                    '<span>Allows multiple spouses</span>' +
                '</label>' +
            '</div>' +

            '<div class="form-group" style="margin-bottom:8px;">' +
                '<label class="form-label">Inheritance</label>' +
                '<select id="rankEditInheritanceSource" class="form-input" style="width:100%;">' +
                    _buildInheritanceSourceOptions(rank.inheritanceSource) +
                '</select>' +
            '</div>' +

            '<div id="rankEditSourceRankField" style="display:' +
                (rank.inheritanceSource && rank.inheritanceSource !== 'none'
                    ? 'block'
                    : 'none') +
                ';margin-bottom:12px;">' +
                '<label class="form-label">Source rank</label>' +
                '<select id="rankEditSourceRankId" class="form-input" style="width:100%;">' +
                    _buildRankOptions(rank.sourceRankId, {
                        excludeIds: (function () {
                            var ex = {};
                            ex[rankId] = true;
                            return ex;
                        })()
                    }) +
                '</select>' +
            '</div>' +

            '<div class="form-checkbox-row" style="margin-bottom:8px;">' +
                '<label class="form-checkbox">' +
                    '<input type="checkbox" id="rankEditCustomSurname"' +
                    (rank.customSurnameRule === true ? ' checked' : '') + '>' +
                    '<span>Custom surname rule</span>' +
                '</label>' +
            '</div>' +

            '<div id="rankEditSurnameFields" style="display:' +
                (rank.customSurnameRule === true ? 'block' : 'none') +
                ';padding:10px;background:var(--bg3);border-radius:6px;margin-bottom:12px;">' +
                '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">' +
                    '<div>' +
                        '<label class="form-label">Connector</label>' +
                        '<input type="text" id="rankEditSurnameConnector" value="' +
                        _esc(rank.surnameConnector || 'of') + '" ' +
                        'class="form-input" style="width:100%;">' +
                    '</div>' +
                    '<div>' +
                        '<label class="form-label">Prefix</label>' +
                        '<input type="text" id="rankEditSurnamePrefix" value="' +
                        _esc(rank.surnamePrefix || '') + '" ' +
                        'class="form-input" style="width:100%;">' +
                    '</div>' +
                    '<div>' +
                        '<label class="form-label">Suffix</label>' +
                        '<input type="text" id="rankEditSurnameSuffix" value="' +
                        _esc(rank.surnameSuffix || '') + '" ' +
                        'class="form-input" style="width:100%;">' +
                    '</div>' +
                '</div>' +
            '</div>';

        return window.openModal({
            titleHtml: _esc(options.title || ('Edit rank: ' + rank.name)),
            contentHtml: content,
            confirmText: 'Save',
            cancelText: 'Cancel',
            onOpen: function (modal) {
                var numbered = modal.querySelector('#rankEditNumbered');
                var numberingFields = modal.querySelector('#rankEditNumberingFields');
                if (numbered && numberingFields) {
                    numbered.addEventListener('change', function () {
                        numberingFields.style.display = this.checked ? 'block' : 'none';
                    });
                }

                var surname = modal.querySelector('#rankEditCustomSurname');
                var surnameFields = modal.querySelector('#rankEditSurnameFields');
                if (surname && surnameFields) {
                    surname.addEventListener('change', function () {
                        surnameFields.style.display = this.checked ? 'block' : 'none';
                    });
                }

                var inher = modal.querySelector('#rankEditInheritanceSource');
                var sourceRankField = modal.querySelector('#rankEditSourceRankField');
                if (inher && sourceRankField) {
                    inher.addEventListener('change', function () {
                        sourceRankField.style.display =
                            this.value === 'none' ? 'none' : 'block';
                    });
                }
            },
            onConfirm: function (modal) {
                var numbered = _readChecked('rankEditNumbered');
                var inheritanceSource = _readValue('rankEditInheritanceSource') || 'none';
                var sourceRankId = inheritanceSource === 'none'
                    ? null
                    : (_readValue('rankEditSourceRankId') || null);
                var customSurname = _readChecked('rankEditCustomSurname');

                var updates = {
                    name: _readValue('rankEditName'),
                    priority: _readNumber('rankEditPriority', rank.priority),
                    symbol: _readValue('rankEditSymbol') || '⟡',
                    genderRestriction: _readValue('rankEditGender') || 'either',
                    parentRankId: _readValue('rankEditParent') || null,
                    numbered: numbered,
                    numberingType: numbered
                        ? (_readValue('rankEditNumberingType') || 'reign')
                        : 'reign',
                    numberingGroup: numbered
                        ? (_readValue('rankEditNumberingGroup') || 'global')
                        : 'global',
                    numberingPrefix: numbered
                        ? _readValue('rankEditNumberingPrefix')
                        : '',
                    numberingSuffix: numbered
                        ? _readValue('rankEditNumberingSuffix')
                        : '',
                    deprecateOnDeath: _readChecked('rankEditDeprecateOnDeath'),
                    allowsMultipleSpouses: _readChecked('rankEditAllowsMultipleSpouses'),
                    inheritanceSource: inheritanceSource,
                    sourceRankId: sourceRankId,
                    customSurnameRule: customSurname,
                    surnameConnector: customSurname
                        ? _readValue('rankEditSurnameConnector')
                        : 'of',
                    surnamePrefix: customSurname
                        ? _readValue('rankEditSurnamePrefix')
                        : '',
                    surnameSuffix: customSurname
                        ? _readValue('rankEditSurnameSuffix')
                        : ''
                };

                var result = RC.updateRank(rankId, updates);
                if (!result.success) {
                    _toast(result.reason || 'Failed to update rank.', 'error');
                    return false;
                }

                var persistResult = RC.persist();
                if (!persistResult.success) {
                    _toast('Rank updated, but save failed: ' +
                        (persistResult.reason || 'unknown'), 'warning');
                } else {
                    _toast('Rank "' + result.rank.name + '" updated.', 'success');
                }

                if (typeof options.onComplete === 'function') {
                    options.onComplete(result.rank);
                }
                window.closeTopModal();
                return true;
            }
        });
    }

    // =========================================================================
    // 6. ASSIGN RANK MODAL
    // =========================================================================
    //
    // Inline character picker. No dependency on a separate selector modal.
    // Two modes are supported through options.mode:
    //   'single'  — one character is selected; the list is single-select
    //   'bulk'    — many characters are selected via checkboxes
    //
    // Default mode is 'single'.

    function openAssignRankModal(options) {
        options = options || {};
        var mode = options.mode === 'bulk' ? 'bulk' : 'single';
        var preselectedRankId = options.rankId || null;
        var preselectedCharacterId = options.characterId || null;

        var ranks = RQ.getAllRanks();
        if (ranks.length === 0) {
            _toast('No ranks available. Create a rank first.', 'warning');
            return null;
        }

        var selectedRankId = preselectedRankId;
        if (!selectedRankId && ranks.length > 0) {
            selectedRankId = ranks[0].id;
        }

        var selectedCharacterIds = [];
        if (preselectedCharacterId) {
            selectedCharacterIds = [preselectedCharacterId];
        }

        var filters = {
            search: '',
            gender: 'all',
            excludeCurrentRank: true
        };

        function currentRank() {
            return RQ.getRank(selectedRankId);
        }

        function eligibleCharacters() {
            var rank = currentRank();
            if (!rank) return [];
            var all = CS.getAllCharacters();
            var needle = filters.search.trim().toLowerCase();
            var out = [];
            for (var i = 0; i < all.length; i++) {
                var c = all[i];
                if (!c) continue;
                if (c.isDeceased === true) continue;
                if (c.isDeleted === true) continue;

                if (rank.genderRestriction !== 'either'
                    && c.gender !== rank.genderRestriction) continue;

                if (filters.gender !== 'all' && c.gender !== filters.gender) continue;

                if (filters.excludeCurrentRank) {
                    if (Array.isArray(c.rankAssignments)) {
                        var has = false;
                        for (var j = 0; j < c.rankAssignments.length; j++) {
                            var a = c.rankAssignments[j];
                            if (a && a.rankId === rank.id && a.isDeprecated !== true) {
                                has = true;
                                break;
                            }
                        }
                        if (has) continue;
                    }
                }

                if (needle) {
                    var name = (c.name || '').toLowerCase();
                    var surname = (c.surname || '').toLowerCase();
                    if (name.indexOf(needle) === -1 && surname.indexOf(needle) === -1) {
                        continue;
                    }
                }

                out.push(c);
            }
            out.sort(function (a, b) {
                var ay = typeof a.birthYear === 'number' ? a.birthYear : 9999;
                var by = typeof b.birthYear === 'number' ? b.birthYear : 9999;
                if (ay !== by) return ay - by;
                return String(a.name || '').localeCompare(String(b.name || ''));
            });
            return out;
        }

        function isSelected(id) {
            return selectedCharacterIds.indexOf(id) !== -1;
        }

        function updateCounter() {
            var el = document.getElementById('assignRankSelectedCount');
            if (el) el.textContent = String(selectedCharacterIds.length);
        }

        function renderRow(character) {
            var selected = isSelected(character.id);
            var age = _ageOf(character);
            var ageText = (age === null) ? '?' : String(age);
            var checkboxHtml = '';
            if (mode === 'bulk') {
                checkboxHtml = '<input type="checkbox" class="assign-rank-checkbox"' +
                    (selected ? ' checked' : '') + '>';
            }
            return '<div class="assign-rank-row" data-character-id="' +
                    _esc(character.id) + '"' +
                    ' style="display:flex;justify-content:space-between;' +
                    'align-items:center;padding:8px 10px;margin-bottom:4px;' +
                    'background:' + (selected ? 'var(--accent-dim)' : 'var(--bg2)') + ';' +
                    'border:1px solid ' + (selected ? 'var(--accent)' : 'var(--border)') + ';' +
                    'border-radius:6px;cursor:pointer;">' +
                '<div style="display:flex;align-items:center;gap:10px;">' +
                    checkboxHtml +
                    '<span>' + _esc(_displayName(character)) + '</span>' +
                '</div>' +
                '<div style="font-size:0.6rem;color:var(--dim);">' +
                    _esc(character.gender || '?') + ' · ' + _esc(ageText) +
                '</div>' +
            '</div>';
        }

        function renderList() {
            var container = document.getElementById('assignRankList');
            if (!container) return;
            var chars = eligibleCharacters();
            if (chars.length === 0) {
                container.innerHTML =
                    '<div style="padding:24px;text-align:center;color:var(--dim);">' +
                    'No eligible characters.</div>';
                return;
            }
            var html = '';
            for (var i = 0; i < chars.length; i++) {
                html += renderRow(chars[i]);
            }
            container.innerHTML = html;

            var rows = container.querySelectorAll('.assign-rank-row');
            for (var j = 0; j < rows.length; j++) {
                (function (row) {
                    row.addEventListener('click', function (e) {
                        var cid = row.dataset.characterId;
                        if (!cid) return;
                        if (mode === 'single') {
                            selectedCharacterIds = [cid];
                        } else {
                            var idx = selectedCharacterIds.indexOf(cid);
                            var target = e.target;
                            var clickedCheckbox = target
                                && target.classList
                                && target.classList.contains('assign-rank-checkbox');
                            if (clickedCheckbox) {
                                if (target.checked && idx === -1) {
                                    selectedCharacterIds.push(cid);
                                } else if (!target.checked && idx !== -1) {
                                    selectedCharacterIds.splice(idx, 1);
                                }
                            } else {
                                if (idx === -1) selectedCharacterIds.push(cid);
                                else selectedCharacterIds.splice(idx, 1);
                            }
                        }
                        renderList();
                        updateCounter();
                    });
                })(rows[j]);
            }
            updateCounter();
        }

        var assignModalContent =
            '<div class="form-group" style="margin-bottom:10px;">' +
                '<label class="form-label">Rank</label>' +
                '<select id="assignRankSelect" class="form-input" style="width:100%;">' +
                    _buildRankOptions(selectedRankId, { includeEmpty: false }) +
                '</select>' +
            '</div>' +

            '<div id="assignRankInfo" style="padding:8px 10px;background:var(--bg2);' +
            'border-radius:6px;margin-bottom:12px;font-size:0.65rem;color:var(--dim);">' +
            '</div>' +

            '<div style="display:flex;gap:8px;margin-bottom:10px;">' +
                '<input type="text" id="assignRankSearch" placeholder="Search by name..." ' +
                'class="form-input" style="flex:1;">' +
                '<select id="assignRankGender" class="form-input">' +
                    '<option value="all">Any gender</option>' +
                    '<option value="male">Male</option>' +
                    '<option value="female">Female</option>' +
                '</select>' +
            '</div>' +

            (mode === 'bulk'
                ? '<div style="display:flex;gap:8px;margin-bottom:10px;' +
                    'align-items:center;font-size:0.6rem;">' +
                    '<button type="button" id="assignRankSelectAll"' +
                    ' class="btn small">Select all</button>' +
                    '<button type="button" id="assignRankSelectNone"' +
                    ' class="btn small">Clear</button>' +
                    '<span style="margin-left:auto;">' +
                    '<span id="assignRankSelectedCount">0</span> selected' +
                    '</span>' +
                  '</div>'
                : '') +

            '<div id="assignRankList" style="max-height:280px;overflow-y:auto;' +
            'border:1px solid var(--border);border-radius:6px;padding:6px;">' +
            '</div>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;' +
            'margin-top:12px;">' +
                '<div>' +
                    '<label class="form-label">Skill level</label>' +
                    '<input type="number" id="assignRankSkill" value="10" min="0" max="100" ' +
                    'class="form-input" style="width:100%;">' +
                '</div>' +
                '<div>' +
                    '<label class="form-label">Assigned year</label>' +
                    '<input type="number" id="assignRankYear" value="' +
                    _esc(_currentYear()) + '" class="form-input" style="width:100%;">' +
                '</div>' +
            '</div>' +

            '<div class="form-group" style="margin-top:10px;">' +
                '<label class="form-label">Notes</label>' +
                '<input type="text" id="assignRankNotes" class="form-input" ' +
                'placeholder="Optional notes..." style="width:100%;">' +
            '</div>';

        return window.openModal({
            titleHtml: _esc(options.title ||
                (mode === 'bulk' ? 'Assign Rank (Bulk)' : 'Assign Rank')),
            contentHtml: assignModalContent,
            confirmText: mode === 'bulk' ? 'Assign to Selected' : 'Assign',
            cancelText: 'Cancel',
            onOpen: function (modal) {
                function refreshInfo() {
                    var info = modal.querySelector('#assignRankInfo');
                    var rank = currentRank();
                    if (!info || !rank) return;
                    var parts = [];
                    parts.push(_esc(rank.name));
                    if (rank.genderRestriction !== 'either') {
                        parts.push('restricted: ' + _esc(rank.genderRestriction));
                    }
                    if (rank.numbered === true) {
                        parts.push('numbered');
                    }
                    if (rank.deprecateOnDeath === true) {
                        parts.push('deprecates on death');
                    }
                    info.innerHTML = parts.join(' · ');
                }

                var rankSelect = modal.querySelector('#assignRankSelect');
                if (rankSelect) {
                    rankSelect.addEventListener('change', function () {
                        selectedRankId = this.value;
                        renderList();
                        refreshInfo();
                    });
                }

                var searchInput = modal.querySelector('#assignRankSearch');
                if (searchInput) {
                    searchInput.addEventListener('input', function () {
                        filters.search = this.value;
                        renderList();
                    });
                }

                var genderSelect = modal.querySelector('#assignRankGender');
                if (genderSelect) {
                    genderSelect.addEventListener('change', function () {
                        filters.gender = this.value;
                        renderList();
                    });
                }

                if (mode === 'bulk') {
                    var selectAll = modal.querySelector('#assignRankSelectAll');
                    if (selectAll) {
                        selectAll.addEventListener('click', function () {
                            var chars = eligibleCharacters();
                            selectedCharacterIds = [];
                            for (var i = 0; i < chars.length; i++) {
                                selectedCharacterIds.push(chars[i].id);
                            }
                            renderList();
                        });
                    }
                    var selectNone = modal.querySelector('#assignRankSelectNone');
                    if (selectNone) {
                        selectNone.addEventListener('click', function () {
                            selectedCharacterIds = [];
                            renderList();
                        });
                    }
                }

                refreshInfo();
                renderList();
            },
            onConfirm: function (modal) {
                if (!_hasId(selectedRankId)) {
                    _toast('Please select a rank.', 'error');
                    return false;
                }
                if (selectedCharacterIds.length === 0) {
                    _toast('Select at least one character.', 'error');
                    return false;
                }

                var notes = _readValue('assignRankNotes');
                var assignedYear = _readNumber('assignRankYear', _currentYear());

                var options = {
                    notes: notes,
                    assignedYear: assignedYear
                };

                var result;
                if (mode === 'bulk') {
                    result = RC.bulkAssignRank(selectedCharacterIds, selectedRankId, options);
                    if (!result.success) {
                        _toast(result.reason || 'Bulk assign failed.', 'error');
                        return false;
                    }
                } else {
                    result = RC.assignRankToCharacter(
                        selectedCharacterIds[0], selectedRankId, options
                    );
                    if (!result.success) {
                        _toast(result.reason || 'Assign failed.', 'error');
                        return false;
                    }
                }

                var persistResult = RC.persist();
                if (!persistResult.success) {
                    _toast('Assigned, but save failed: ' +
                        (persistResult.reason || 'unknown'), 'warning');
                } else {
                    if (mode === 'bulk') {
                        var okCount = result.successful !== undefined
                            ? result.successful
                            : (result.results ? result.results.length : 0);
                        var failCount = result.failed !== undefined
                            ? result.failed
                            : (result.errors ? result.errors.length : 0);
                        _toast('Assigned to ' + okCount + ' character(s)' +
                            (failCount > 0 ? '; ' + failCount + ' failed' : '') + '.',
                            failCount > 0 ? 'warning' : 'success');
                    } else {
                        var c = CS.getCharacter(selectedCharacterIds[0]);
                        _toast('Assigned ' + (currentRank() || {}).name +
                            ' to ' + _displayName(c) + '.', 'success');
                    }
                }

                if (typeof options.onComplete === 'function') {
                    options.onComplete(result);
                }
                window.closeTopModal();
                return true;
            }
        });
    }

    // =========================================================================
    // 7. RANK DETAILS MODAL
    // =========================================================================

    function openRankDetailsModal(rankId, options) {
        options = options || {};
        if (!_hasId(rankId)) {
            _toast('Rank id is required.', 'error');
            return null;
        }

        var rank = RQ.getRank(rankId);
        if (!rank) {
            _toast('Rank not found.', 'error');
            return null;
        }

        var stats = RQ.getRankHolderStats(rankId);
        var levelName = RQ.getRankLevelName(rank.priority);
        var levelIcon = RQ.getRankLevelIcon(rank.priority);
        var rules = RQ.getInheritanceRulesForRank(rankId);

        var parentRank = null;
        if (_hasId(rank.parentRankId)) {
            parentRank = RQ.getRank(rank.parentRankId);
        }
        var sourceRank = null;
        if (_hasId(rank.sourceRankId)) {
            sourceRank = RQ.getRank(rank.sourceRankId);
        }

        function statBlock(label, value) {
            return '<div style="padding:8px;background:var(--bg3);border-radius:6px;">' +
                '<div style="font-size:0.5rem;color:var(--dim);text-transform:uppercase;">' +
                    _esc(label) + '</div>' +
                '<div style="font-size:0.85rem;">' + _esc(value) + '</div>' +
            '</div>';
        }

        function row(label, value) {
            return '<div style="display:grid;grid-template-columns:1fr 1fr;' +
                'gap:8px;padding:4px 0;">' +
                '<div style="color:var(--dim);font-size:0.65rem;">' + _esc(label) + '</div>' +
                '<div style="font-size:0.7rem;">' + _esc(value) + '</div>' +
            '</div>';
        }

        var content =
            '<div style="display:grid;grid-template-columns:auto 1fr;gap:12px;' +
            'align-items:center;margin-bottom:14px;">' +
                '<div style="font-size:2rem;line-height:1;">' +
                    _esc(rank.symbol || '⟡') +
                '</div>' +
                '<div>' +
                    '<div style="font-size:1rem;font-weight:600;">' +
                        _esc(rank.name) + '</div>' +
                    '<div style="font-size:0.65rem;color:var(--dim);' +
                    'display:flex;align-items:center;gap:6px;">' +
                        levelIcon + ' ' + _esc(levelName) +
                    '</div>' +
                '</div>' +
            '</div>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;' +
            'margin-bottom:14px;">' +
                statBlock('Holders', stats.total) +
                statBlock('Living', stats.living) +
                statBlock('Deceased', stats.deceased) +
            '</div>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;' +
            'margin-bottom:14px;">' +
                statBlock('Minors', stats.minors) +
                statBlock('Adults', stats.adults) +
                statBlock('Elders', stats.elders) +
            '</div>' +

            '<div style="padding:10px;background:var(--bg2);border-radius:6px;' +
            'margin-bottom:12px;">' +
                row('Gender restriction', rank.genderRestriction || 'either') +
                row('Numbered', rank.numbered === true
                    ? ('Yes (' + (rank.numberingType || 'reign') +
                        ', group: ' + (rank.numberingGroup || 'global') + ')')
                    : 'No') +
                row('Deprecates on death',
                    rank.deprecateOnDeath === true ? 'Yes' : 'No') +
                row('Allows multiple spouses',
                    rank.allowsMultipleSpouses === true ? 'Yes' : 'No') +
                row('Inheritance source',
                    rank.inheritanceSource && rank.inheritanceSource !== 'none'
                        ? rank.inheritanceSource
                        : 'None') +
                (parentRank
                    ? row('Parent rank', parentRank.name)
                    : '') +
                (sourceRank
                    ? row('Source rank', sourceRank.name)
                    : '') +
                row('Custom surname rule',
                    rank.customSurnameRule === true ? 'Yes' : 'No') +
                (rank.customSurnameRule === true
                    ? row('Surname pattern',
                        (rank.surnameConnector || 'of') + ' ' +
                        (rank.surnamePrefix || '') + 'Location' +
                        (rank.surnameSuffix || ''))
                    : '') +
            '</div>' +

            (rules.length > 0
                ? '<div style="margin-bottom:12px;">' +
                    '<div class="form-label">Inheritance rules</div>' +
                    rules.map(function (rule, idx) {
                        var childName = rule.childRankId
                            ? (RQ.getRank(rule.childRankId) || {}).name
                            : '—';
                        var femaleName = rule.childRankIdFemale
                            ? (RQ.getRank(rule.childRankIdFemale) || {}).name
                            : null;
                        var line = childName;
                        if (femaleName && femaleName !== childName) {
                            line += ' (male) / ' + femaleName + ' (female)';
                        }
                        var extra = [];
                        if (rule.minChildAge) extra.push('min age ' + rule.minChildAge);
                        if (rule.maxChildren !== null && rule.maxChildren !== undefined) {
                            extra.push('max ' + rule.maxChildren + ' children');
                        }
                        return '<div style="padding:6px 10px;background:var(--bg2);' +
                            'border-radius:4px;margin-bottom:4px;font-size:0.65rem;">' +
                            '<span style="color:var(--dim);">' + (idx + 1) + '. </span>' +
                            _esc(line) +
                            (extra.length > 0
                                ? ' <span style="color:var(--dim);">— ' +
                                    _esc(extra.join(', ')) + '</span>'
                                : '') +
                            '</div>';
                    }).join('') +
                  '</div>'
                : '') +

            '<div style="padding:8px;background:var(--bg3);border-radius:6px;' +
            'font-size:0.55rem;color:var(--dim);">' +
                'Rank ID: ' + _esc(rank.id) +
            '</div>';

        return window.openModal({
            titleHtml: _esc(options.title || 'Rank details'),
            contentHtml: content,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function () {
                return true;
            }
        });
    }

    // =========================================================================
    // 8. EXPORTS
    // =========================================================================

    window.RankModals = {
        openCreateRankModal: openCreateRankModal,
        openEditRankModal: openEditRankModal,
        openAssignRankModal: openAssignRankModal,
        openRankDetailsModal: openRankDetailsModal
    };

    // Legacy alias.
    window._rankModals = window.RankModals;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.RankModals;
    }
})();
