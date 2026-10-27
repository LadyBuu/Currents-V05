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
 * MODAL CALLBACK API (from modals-core.js):
 *   openModal(options) returns { element, close }.
 *
 *   The CALLBACKS receive the modal DOM element, NOT the handle:
 *
 *     onMount(root)      // root is the modal DOM element
 *     onOpen(root)       // alias for onMount
 *     onConfirm(root)    // root is the modal DOM element
 *     onCancel(root)     // root is the modal DOM element
 *
 *   Inside the callbacks, use `root.querySelector('#id')` for scoped
 *   input reads. Do NOT use `root.element.querySelector(...)` — the
 *   argument is already the DOM element, not a `{ element }` wrapper.
 *
 *   This file was previously written against the handle shape:
 *
 *     onOpen: function (modal) {
 *         var root = modal.element;       // WRONG — modal is the DOM element
 *     }
 *
 *   The `modal.element` access threw on every modal open, silently
 *   caught by modals-core.js for onOpen and propagated to the browser
 *   console for onConfirm. The net effect was that every rank modal
 *   opened but no confirm button worked. Fixed in this revision: every
 *   onOpen and onConfirm handler now uses the parameter directly.
 *
 *   If you need the handle's `close()` inside a callback, do NOT reach
 *   for it on the parameter. Instead:
 *
 *     var modalHandle = window.openModal({ ... });
 *     // inside onConfirm:
 *     modalHandle.close();     // explicit programmatic close
 *
 *   or call `window.closeTopModal()`. Both are documented in
 *   modals-core.js's CALLBACK CONTRACT section.
 *
 * MODAL INPUT READS:
 *   Every modal reads its inputs via root.querySelector('#id'), NOT
 *   document.getElementById('#id'). The modal-scoped read is required
 *   because:
 *
 *     1. Multiple rank modals can be open simultaneously (the modal stack
 *        allows it). Two open create-rank modals would otherwise both
 *        read the first modal's inputs via getElementById.
 *
 *     2. A completely unrelated modal could define an element with an id
 *        collision (unlikely but possible). Scoped reads are immune.
 *
 *     3. The modal element is the correct scope for the input values;
 *        document is the entire page.
 *
 *   The helpers _readValue, _readChecked, _readNumber all take a root
 *   element (the modal) as their first argument. Every call site passes
 *   the callback parameter directly.
 *
 * DEPENDENCIES (REQUIRED, must load first):
 *   - modals-core.js        (openModal, closeTopModal)
 *   - icons.js              (Icons)
 *   - formatting.js         (escapeHtml)
 *   - ui.js                 (showToast)
 *   - rank-constants.js     (RANK_LEVELS, AVAILABLE_SYMBOLS, DEFAULT_RANK,
 *                            NUMBERING_TYPE, NUMBERING_GROUP,
 *                            INHERITANCE_SOURCE)
 *   - rank-rules.js         (RankRules)
 *   - rank-state.js         (RankState)
 *   - rank-queries.js       (RankQueries)
 *   - rank-commands.js      (RankCommands)
 *   - character-state.js    (CharacterState)
 *   - time.js               (getCurrentYear, calculateAge)
 *
 * DEPENDENCIES (OPTIONAL, used only if present):
 *   - _showToast — deprecated alias; ui.js still exports it, but
 *                  showToast is the primary name. _toast prefers
 *                  _showToast (for backward compatibility) but falls
 *                  back to showToast. ui.js is required, so at least
 *                  one must be present.
 *
 * INLINE STYLES (KNOWN DEFERRAL):
 *   This file uses inline style attributes for layout. The general
 *   policy across the tree is classes-only; the exceptions here are a
 *   known deferral documented in the rank-doc's Known Deferrals section.
 *
 *   The correctness fixes in this revision (modal callback API,
 *   options shadowing, escapeHtml requirement, DEFAULT_SYMBOL,
 *   RANK_LEVELS requirement, enum reference in dropdown builders) are
 *   independent of the inline-style extraction. Extracting ~200 lines
 *   of layout to a new rank-modals.css is a follow-up PR that touches
 *   only this file and the new CSS file.
 *
 * ICON POLICY: No emojis. Icons come from icons.js via Icons.NAME. No
 * inline Unicode glyphs in buttons, badges, or select options. Level
 * glyphs are not shown in the priority dropdown; the level name alone is
 * the option label.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Previous revision:
 *     - _escapeHtml given a three-tier fallback. Now hard-requires
 *       formatting.js (see Phase 8).
 *   Phase 8:
 *     - #22 (correctness): openAssignRankModal::onConfirm no longer
 *       shadows the outer `options` parameter with a local `var options`.
 *     - #2, #21 (correctness): _readValue, _readChecked, _readNumber now
 *       take a root element as their first argument.
 *     - _escapeHtml deleted. formatting.js is now REQUIRED.
 *     - ui.js promoted to REQUIRED.
 *     - DEFAULT_SYMBOL derived from window.DEFAULT_RANK.symbol at load.
 *     - _buildPriorityOptions no longer falls back to [1, 2, 3, 4, 5].
 *     - Enum dropdowns read from window.NUMBERING_TYPE etc.
 *   Current revision (Phase 8.1):
 *     - CRITICAL (compatibility with modals-core.js): every onOpen and
 *       onConfirm callback now uses the parameter directly as the root
 *       element. Previously every callback declared `var root =
 *       modal.element;` which was always undefined because
 *       modals-core.js passes the DOM element, not a `{ element }`
 *       handle. The `try/catch` in modals-core.js swallowed the onOpen
 *       throw, but onConfirm's throw propagated and left the modal open
 *       with no way to save. This made the entire rank UI unusable.
 *       See MODAL CALLBACK API in the header.
 *     - Header MODAL CALLBACK API section added.
 *     - No public signature change.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. HARD DEPENDENCY CHECK
    // =========================================================================

    var REQUIRED = [
        ['openModal',       'modals-core.js'],
        ['closeTopModal',   'modals-core.js'],
        ['Icons',           'icons.js'],
        ['escapeHtml',      'formatting.js'],
        ['showToast',       'ui.js'],
        ['RankState',       'rank-state.js'],
        ['RankRules',       'rank-rules.js'],
        ['RankQueries',     'rank-queries.js'],
        ['RankCommands',    'rank-commands.js'],
        ['CharacterState',  'character-state.js'],
        ['getCurrentYear',  'time.js'],
        ['RANK_LEVELS',     'rank-constants.js'],
        ['AVAILABLE_SYMBOLS', 'rank-constants.js'],
        ['DEFAULT_RANK',    'rank-constants.js'],
        ['NUMBERING_TYPE',  'rank-constants.js'],
        ['NUMBERING_GROUP', 'rank-constants.js'],
        ['INHERITANCE_SOURCE', 'rank-constants.js']
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

    function _esc(v) {
        return window.escapeHtml(_isMissing(v) ? '' : String(v));
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

    /**
     * Shows a toast. Prefers _showToast (deprecated alias) for backward
     * compatibility, falls back to showToast (primary export).
     */
    function _toast(message, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(message, type || 'info');
            return;
        }
        if (typeof window.showToast === 'function') {
            window.showToast(message, type || 'info');
            return;
        }
        throw new Error(
            'modals-rank.js: _toast called without a toast helper. ' +
            'ui.js must be loaded before modals-rank.js. Message: ' + message
        );
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
    // 2b. MODAL-SCOPED INPUT READERS
    // =========================================================================
    //
    // Every reader takes the modal element (or any root element) as its
    // first argument and uses querySelector. This is required for
    // correctness when two modals are open simultaneously.
    //
    // The root is the CALLBACK PARAMETER from modals-core.js (the DOM
    // element). It is NOT `modal.element` — see MODAL CALLBACK API in the
    // header.

    function _readValue(root, id) {
        if (!root) return '';
        var el = root.querySelector('#' + id);
        return el ? el.value : '';
    }

    function _readChecked(root, id) {
        if (!root) return false;
        var el = root.querySelector('#' + id);
        return el ? el.checked === true : false;
    }

    function _readNumber(root, id, fallback) {
        var raw = _readValue(root, id);
        if (raw === '') return fallback;
        var n = Number(raw);
        return Number.isFinite(n) ? n : fallback;
    }

    // =========================================================================
    // 3. SHARED OPTION BUILDERS
    // =========================================================================

    /**
     * Default symbol derived from rank-constants.js.
     */
    var DEFAULT_SYMBOL = (window.DEFAULT_RANK && window.DEFAULT_RANK.symbol) || '⟡';

    function _getSymbols() {
        var s = window.AVAILABLE_SYMBOLS;
        if (Array.isArray(s) && s.length > 0) return s;
        return [DEFAULT_SYMBOL];
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
     * Reads priority keys directly from window.RANK_LEVELS. No fallback
     * list: RANK_LEVELS is required at load.
     *
     * The option label is the level name alone. No glyph is rendered in
     * the dropdown.
     */
    function _buildPriorityOptions(selected) {
        var levels = window.RANK_LEVELS;
        var keys = Object.keys(levels).map(function (k) { return parseInt(k, 10); })
            .filter(function (n) { return Number.isFinite(n); })
            .sort(function (a, b) { return a - b; });
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

    /**
     * Gender restriction options.
     *
     * The literals ('either' / 'male' / 'female') match
     * RankRules._isValidGenderRestriction.
     */
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
        var types = window.NUMBERING_TYPE
            || { REIGN: 'reign', ORDINAL: 'ordinal', ROMAN: 'roman' };
        var opts = [
            { id: types.REIGN,   label: 'Reign (I, II, III...)' },
            { id: types.ORDINAL, label: 'Ordinal (1st, 2nd, 3rd...)' },
            { id: types.ROMAN,   label: 'Roman (I, II, III...)' }
        ];
        var html = '';
        for (var i = 0; i < opts.length; i++) {
            var sel = opts[i].id === selected ? ' selected' : '';
            html += '<option value="' + _esc(opts[i].id) + '"' + sel + '>' +
                _esc(opts[i].label) + '</option>';
        }
        return html;
    }

    function _buildNumberingGroupOptions(selected) {
        var groups = window.NUMBERING_GROUP
            || { GLOBAL: 'global', PARENT: 'parent', SPOUSE: 'spouse', SOURCE: 'source' };
        var opts = [
            { id: groups.GLOBAL, label: 'Global (all holders share one sequence)' },
            { id: groups.PARENT, label: 'By parent' },
            { id: groups.SPOUSE, label: 'By spouse' },
            { id: groups.SOURCE, label: 'By inheritance source' }
        ];
        var html = '';
        for (var i = 0; i < opts.length; i++) {
            var sel = opts[i].id === selected ? ' selected' : '';
            html += '<option value="' + _esc(opts[i].id) + '"' + sel + '>' +
                _esc(opts[i].label) + '</option>';
        }
        return html;
    }

    function _buildInheritanceSourceOptions(selected) {
        var sources = window.INHERITANCE_SOURCE
            || { NONE: 'none', PARENT: 'parent', SPOUSE: 'spouse' };
        var opts = [
            { id: sources.NONE,   label: 'None' },
            { id: sources.PARENT, label: 'Parent' },
            { id: sources.SPOUSE, label: 'Spouse' }
        ];
        var html = '';
        for (var i = 0; i < opts.length; i++) {
            var sel = opts[i].id === selected ? ' selected' : '';
            html += '<option value="' + _esc(opts[i].id) + '"' + sel + '>' +
                _esc(opts[i].label) + '</option>';
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
                _esc((r.symbol || DEFAULT_SYMBOL) + ' ' + (r.name || '')) +
                '</option>';
        }
        return html;
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
                        _buildSymbolOptions(DEFAULT_SYMBOL) +
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
            onOpen: function (root) {
                // root is the modal DOM element (see MODAL CALLBACK API).
                var numbered = root.querySelector('#rankNumbered');
                var numberingFields = root.querySelector('#rankNumberingFields');
                if (numbered && numberingFields) {
                    numbered.addEventListener('change', function () {
                        numberingFields.style.display = this.checked ? 'block' : 'none';
                    });
                }

                var surname = root.querySelector('#rankCustomSurname');
                var surnameFields = root.querySelector('#rankSurnameFields');
                if (surname && surnameFields) {
                    surname.addEventListener('change', function () {
                        surnameFields.style.display = this.checked ? 'block' : 'none';
                    });
                }

                var inher = root.querySelector('#rankInheritanceSource');
                var sourceRankField = root.querySelector('#rankSourceRankField');
                if (inher && sourceRankField) {
                    inher.addEventListener('change', function () {
                        sourceRankField.style.display =
                            this.value === 'none' ? 'none' : 'block';
                    });
                }

                var nameInput = root.querySelector('#rankName');
                if (nameInput) {
                    nameInput.focus();
                    nameInput.select();
                }
            },
            onConfirm: function (root) {
                // root is the modal DOM element. Scoped reads via
                // root.querySelector are the ONLY valid reads here.
                var numbered = _readChecked(root, 'rankNumbered');
                var inheritanceSource = _readValue(root, 'rankInheritanceSource') || 'none';
                var sourceRankId = inheritanceSource === 'none'
                    ? null
                    : (_readValue(root, 'rankSourceRankId') || null);
                var customSurname = _readChecked(root, 'rankCustomSurname');

                var rankData = {
                    name: _readValue(root, 'rankName'),
                    priority: _readNumber(root, 'rankPriority', 4),
                    symbol: _readValue(root, 'rankSymbol') || DEFAULT_SYMBOL,
                    genderRestriction: _readValue(root, 'rankGender') || 'either',
                    parentRankId: _readValue(root, 'rankParent') || null,
                    numbered: numbered,
                    numberingType: numbered
                        ? (_readValue(root, 'rankNumberingType') || 'reign')
                        : 'reign',
                    numberingGroup: numbered
                        ? (_readValue(root, 'rankNumberingGroup') || 'global')
                        : 'global',
                    numberingPrefix: numbered
                        ? _readValue(root, 'rankNumberingPrefix')
                        : '',
                    numberingSuffix: numbered
                        ? _readValue(root, 'rankNumberingSuffix')
                        : '',
                    deprecateOnDeath: _readChecked(root, 'rankDeprecateOnDeath'),
                    allowsMultipleSpouses: _readChecked(root, 'rankAllowsMultipleSpouses'),
                    inheritanceSource: inheritanceSource,
                    sourceRankId: sourceRankId,
                    customSurnameRule: customSurname,
                    surnameConnector: customSurname
                        ? _readValue(root, 'rankSurnameConnector')
                        : 'of',
                    surnamePrefix: customSurname
                        ? _readValue(root, 'rankSurnamePrefix')
                        : '',
                    surnameSuffix: customSurname
                        ? _readValue(root, 'rankSurnameSuffix')
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
            onOpen: function (root) {
                // root is the modal DOM element.
                var numbered = root.querySelector('#rankEditNumbered');
                var numberingFields = root.querySelector('#rankEditNumberingFields');
                if (numbered && numberingFields) {
                    numbered.addEventListener('change', function () {
                        numberingFields.style.display = this.checked ? 'block' : 'none';
                    });
                }

                var surname = root.querySelector('#rankEditCustomSurname');
                var surnameFields = root.querySelector('#rankEditSurnameFields');
                if (surname && surnameFields) {
                    surname.addEventListener('change', function () {
                        surnameFields.style.display = this.checked ? 'block' : 'none';
                    });
                }

                var inher = root.querySelector('#rankEditInheritanceSource');
                var sourceRankField = root.querySelector('#rankEditSourceRankField');
                if (inher && sourceRankField) {
                    inher.addEventListener('change', function () {
                        sourceRankField.style.display =
                            this.value === 'none' ? 'none' : 'block';
                    });
                }
            },
            onConfirm: function (root) {
                // root is the modal DOM element.
                var numbered = _readChecked(root, 'rankEditNumbered');
                var inheritanceSource = _readValue(root, 'rankEditInheritanceSource') || 'none';
                var sourceRankId = inheritanceSource === 'none'
                    ? null
                    : (_readValue(root, 'rankEditSourceRankId') || null);
                var customSurname = _readChecked(root, 'rankEditCustomSurname');

                var updates = {
                    name: _readValue(root, 'rankEditName'),
                    priority: _readNumber(root, 'rankEditPriority', rank.priority),
                    symbol: _readValue(root, 'rankEditSymbol') || DEFAULT_SYMBOL,
                    genderRestriction: _readValue(root, 'rankEditGender') || 'either',
                    parentRankId: _readValue(root, 'rankEditParent') || null,
                    numbered: numbered,
                    numberingType: numbered
                        ? (_readValue(root, 'rankEditNumberingType') || 'reign')
                        : 'reign',
                    numberingGroup: numbered
                        ? (_readValue(root, 'rankEditNumberingGroup') || 'global')
                        : 'global',
                    numberingPrefix: numbered
                        ? _readValue(root, 'rankEditNumberingPrefix')
                        : '',
                    numberingSuffix: numbered
                        ? _readValue(root, 'rankEditNumberingSuffix')
                        : '',
                    deprecateOnDeath: _readChecked(root, 'rankEditDeprecateOnDeath'),
                    allowsMultipleSpouses: _readChecked(root, 'rankEditAllowsMultipleSpouses'),
                    inheritanceSource: inheritanceSource,
                    sourceRankId: sourceRankId,
                    customSurnameRule: customSurname,
                    surnameConnector: customSurname
                        ? _readValue(root, 'rankEditSurnameConnector')
                        : 'of',
                    surnamePrefix: customSurname
                        ? _readValue(root, 'rankEditSurnamePrefix')
                        : '',
                    surnameSuffix: customSurname
                        ? _readValue(root, 'rankEditSurnameSuffix')
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

        // modalRootRef is captured once in onOpen and used by every
        // render helper. Two open assign-rank modals would otherwise
        // both query document.getElementById('#assignRankList') and get
        // the first modal's list.
        var modalRootRef = null;

        function _q(id) {
            return modalRootRef ? modalRootRef.querySelector('#' + id) : null;
        }

        function updateCounter() {
            var el = _q('assignRankSelectedCount');
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
            var container = _q('assignRankList');
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
            onOpen: function (root) {
                // root is the modal DOM element.
                modalRootRef = root;

                function refreshInfo() {
                    var info = _q('assignRankInfo');
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

                var rankSelect = _q('assignRankSelect');
                if (rankSelect) {
                    rankSelect.addEventListener('change', function () {
                        selectedRankId = this.value;
                        renderList();
                        refreshInfo();
                    });
                }

                var searchInput = _q('assignRankSearch');
                if (searchInput) {
                    searchInput.addEventListener('input', function () {
                        filters.search = this.value;
                        renderList();
                    });
                }

                var genderSelect = _q('assignRankGender');
                if (genderSelect) {
                    genderSelect.addEventListener('change', function () {
                        filters.gender = this.value;
                        renderList();
                    });
                }

                if (mode === 'bulk') {
                    var selectAll = _q('assignRankSelectAll');
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
                    var selectNone = _q('assignRankSelectNone');
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
            onConfirm: function (root) {
                // root is the modal DOM element.
                if (!_hasId(selectedRankId)) {
                    _toast('Please select a rank.', 'error');
                    return false;
                }
                if (selectedCharacterIds.length === 0) {
                    _toast('Select at least one character.', 'error');
                    return false;
                }

                var notes = _readValue(root, 'assignRankNotes');
                var assignedYear = _readNumber(root, 'assignRankYear', _currentYear());

                // Renamed from `options` to `assignOptions`. The old name
                // shadowed the function parameter, causing
                // `options.onComplete` below to check the inner object.
                var assignOptions = {
                    notes: notes,
                    assignedYear: assignedYear
                };

                var result;
                if (mode === 'bulk') {
                    result = RC.bulkAssignRank(selectedCharacterIds, selectedRankId, assignOptions);
                    if (!result.success) {
                        _toast(result.reason || 'Bulk assign failed.', 'error');
                        return false;
                    }
                } else {
                    result = RC.assignRankToCharacter(
                        selectedCharacterIds[0], selectedRankId, assignOptions
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
                    _esc(rank.symbol || DEFAULT_SYMBOL) +
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
