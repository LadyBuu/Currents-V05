/**
 * =============================================================================
 * STILL WATERS - CULTURE NAMES TAB (js/tabs/culture-names-tab.js)
 * =============================================================================
 *
 * LOCATION: js/tabs/culture-names-tab.js
 *
 * A CultureEditorTabs tab for editing the name lists and surname rules
 * of a culture. The tab is fully editable inline: three name-list
 * cards, each with a bulk-edit textarea plus chip-level Add and Remove,
 * and an inline surname-rules editor.
 *
 * This is the hub where names are edited. There is no country, no
 * location walk, no separate modal. The culture is the key.
 *
 * REGISTRATION (CultureEditorTabs, composite form):
 *   CultureEditorTabs.registerTab('names', NamesTab);
 *
 *   render(container, culture)     — paints the tab's DOM into `container`
 *   save(culture)                  — returns {} — this tab writes to the
 *                                    name subsystem's own storage
 *                                    (masterData.data.nameLists, keyed by
 *                                    cultureId), not to the culture record
 *   validate(culture)              — { valid: true } — no culture-shape
 *                                    validation from this tab
 *
 * THIS TAB DOES NOT PARTICIPATE IN THE COMPOSITE SAVE
 * ---------------------------------------------------
 * Name lists and surname rules live under
 * masterData.data.nameLists[cultureId]. They are not fields on the
 * culture record. Every write here goes through NameCommands and is
 * committed immediately; the editor's Cancel does not undo it. The
 * tab's UI hint says so.
 *
 * THE NAME LIST IS CREATED ON FIRST RENDER
 * ----------------------------------------
 * NameCommands.addNameToList refuses if no name list exists for the
 * culture. Rather than surface that refusal as an error every time the
 * tab opens on a fresh culture, the tab ensures the entry exists before
 * rendering the editors. The created entry is:
 *
 *   { male: [], female: [], surnames: [], rules: null }
 *
 * It is created through the same masterData write path every other
 * writer uses, and it marks data dirty. It is the only place the tab
 * touches masterData directly. (A future NameCommands.ensureNameList
 * would move this into the command layer; until then, the direct write
 * is documented and non-destructive — it only creates an empty
 * structure, never overwrites user data.)
 *
 * EDITING MODEL
 * -------------
 * Each list is a card containing:
 *   - A textarea: one name per line. This is the bulk-edit surface.
 *   - An Apply button: parses the textarea and reconciles the delta
 *     against the canonical list. Added names go through addNameToList;
 *     removed names go through removeNameFromList. A single persist
 *     runs after the batch.
 *   - A live chip list below the textarea: the current canonical list.
 *     Each chip has an × button for a one-name removal.
 *   - A one-line add input under the chips: type a name, press Enter or
 *     click Add, one-name append.
 *
 * The rules editor is a card below the lists. It lets the user pick a
 * rule type, edit the type-specific fields, and save the rules object
 * through NameCommands.setCultureSurnameRules. The rules are validated
 * through NameRules.validateRules before the command is called. A Clear
 * button calls NameCommands.clearCultureSurnameRules (which sets the
 * rules to null) and persists. Clearing does NOT go through
 * setCultureSurnameRules because a null rules object intentionally
 * fails that command's validation; clearCultureSurnameRules is the
 * dedicated command for the "no rules configured" state.
 *
 * CONTRACTS
 * ---------
 *   - Reads are scoped to `container.querySelector(...)`. Never `document`.
 *   - No inline `style=""`. Classes live in css/culture-tabs.css.
 *   - No emojis. Icons via _getIcon(name) — '' for unknown.
 *   - escapeHtml is a REQUIRED dependency (formatting.js).
 *   - Uses window.getCurrentYear only for display if ever needed;
 *     currently unused.
 *
 * DEPENDENCIES:
 *   - CultureEditorTabs
 *   - NameQueries
 *   - NameCommands (incl. persist, clearCultureSurnameRules)
 *   - NameRules
 *   - formatting.js (escapeHtml — REQUIRED)
 *   - ui.js (showToast)
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision (A3):
 *     - _handleClearRules now calls NameCommands.clearCultureSurnameRules
 *       instead of writing masterData.data.nameLists[culture.id].rules
 *       directly. The direct write bypassed the command layer's
 *       markDataDirty / publish contract and was the only destructive
 *       masterData write in the tab. This matches the playbook's
 *       "only commands.js writes" rule.
 *     - _handleClearRules now only calls NC.persist() on command
 *       success. The prior version called persist() unconditionally;
 *       with the direct write, persist could never be reached on
 *       failure, but with a command that can return { success: false }
 *       the unconditional persist would have written a stale in-memory
 *       state. Fixed.
 *     - _maybeSubscribeToNameState DELETED. The prior version
 *       subscribed to NamesState but did nothing in the handler ("this
 *       is a no-op for the tab's own writes"). The subscription was a
 *       dead listener that leaked on every render. External writers
 *       that want the tab to refresh should fire masterDataUpdated,
 *       which the bootstrap already handles by re-rendering the
 *       active tab.
 *     - _handleApplyBulk failure toast capped at 3 messages plus
 *       "(+N more)". An unbounded join('; ') on a large bulk edit
 *       produced a wall of text.
 *     - _renderRulesCard signature tightened: removed the unused
 *       `culture` parameter.
 *     - _escapeHtml error message tightened to match the other culture
 *       tabs (already strict; no behavior change).
 *     - Header EDITEDING MODEL section documents the
 *       clearCultureSurnameRules dependency and why clearing does not
 *       go through setCultureSurnameRules.
 *     - Header DEPENDENCIES corrected: NamesState subscription is
 *       removed.
 *   Previous revisions:
 *     - Initial implementation.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _escapeHtml(str) {
        if (typeof window.escapeHtml !== 'function') {
            throw new Error(
                'culture-names-tab.js requires escapeHtml (formatting.js). ' +
                'Check script tag order.'
            );
        }
        return window.escapeHtml(str);
    }

    function _showToast(msg, type) {
        if (typeof window.showToast === 'function') window.showToast(msg, type);
    }

    function _getNameQueries() {
        return typeof window.NameQueries !== 'undefined' ? window.NameQueries : null;
    }

    function _getNameCommands() {
        return typeof window.NameCommands !== 'undefined' ? window.NameCommands : null;
    }

    function _getNameRules() {
        return typeof window.NameRules !== 'undefined' ? window.NameRules : null;
    }

    // =========================================================================
    // 2. STATE
    // =========================================================================

    var _state = {
        rulesExpanded: false
    };

    // =========================================================================
    // 3. NAME-LIST TYPES
    // =========================================================================

    var NAME_TYPES = [
        { key: 'male',     label: 'Male Names',   hint: 'Given names for male characters.' },
        { key: 'female',   label: 'Female Names', hint: 'Given names for female characters.' },
        { key: 'surnames', label: 'Surnames',     hint: 'Family names for this culture.' }
    ];

    // =========================================================================
    // 4. ENSURE NAME LIST
    // =========================================================================
    //
    // See THE NAME LIST IS CREATED ON FIRST RENDER in the module header.
    // This is the only place in the tab that touches masterData directly
    // (and it only creates an empty structure — never overwrites user
    // data). A future NameCommands.ensureNameList would move this into
    // the command layer.

    function _ensureNameList(cultureId) {
        if (typeof cultureId !== 'string' || cultureId.length === 0) return false;
        if (!window.masterData || !window.masterData.data) return false;

        var data = window.masterData.data;
        if (!data.nameLists || typeof data.nameLists !== 'object') {
            data.nameLists = {};
        }
        if (data.nameLists[cultureId]) return false;

        data.nameLists[cultureId] = {
            male: [],
            female: [],
            surnames: [],
            rules: null
        };

        _markNameDataDirty();
        return true;
    }

    /**
     * Shared side-effect set for name-list mutations that happen outside
     * NameCommands (currently only _ensureNameList). Marks masterData
     * dirty and publishes a nameListChanged event through NamesState
     * when available.
     */
    function _markNameDataDirty() {
        if (typeof window.markDataDirty === 'function') {
            try { window.markDataDirty(); }
            catch (e) { /* non-fatal */ }
        }
        var NS = (typeof window.NamesState !== 'undefined')
            ? window.NamesState
            : (typeof window.NameState !== 'undefined' ? window.NameState : null);
        if (NS && typeof NS.publish === 'function') {
            try { NS.publish('nameListChanged', { action: 'created' }); }
            catch (e) { /* non-fatal */ }
        }
    }

    // =========================================================================
    // 5. RENDER
    // =========================================================================

    function renderNamesTab(container, culture) {
        if (!container) return;

        if (!culture || !culture.id) {
            container.innerHTML =
                '<div class="rt-empty">No culture loaded.</div>';
            return;
        }

        var NQ = _getNameQueries();
        var NC = _getNameCommands();
        if (!NQ || !NC) {
            container.innerHTML =
                '<div class="rt-unavailable">Name subsystem is not available.</div>';
            return;
        }

        _ensureNameList(culture.id);

        var list = null;
        try { list = NQ.getNameList(culture.id); }
        catch (e) { list = null; }

        var rules = null;
        try { rules = NQ.getCultureSurnameRules(culture.id); }
        catch (e) { rules = null; }

        var html =
            '<div class="ct-names">' +
              '<div class="ct-hint">' +
                'Names and surname rules are stored on this culture. Every ' +
                'change commits immediately; closing the editor does not undo it.' +
              '</div>' +
              '<div class="ct-names__cards">' +
                _renderNameListCard(culture, 'male',   list) +
                _renderNameListCard(culture, 'female', list) +
                _renderNameListCard(culture, 'surnames', list) +
              '</div>' +
              _renderRulesCard(rules) +
            '</div>';

        container.innerHTML = html;

        _attachNameListEvents(container, culture);
        _attachRulesEvents(container, culture);
    }

    function _renderNameListCard(culture, typeKey, list) {
        var typeInfo = _nameTypeInfo(typeKey);
        var items = (list && Array.isArray(list[typeKey])) ? list[typeKey].slice() : [];
        items.sort(function (a, b) { return String(a).localeCompare(String(b)); });

        var textareaValue = items.join('\n');

        var chipsHtml = '';
        if (items.length === 0) {
            chipsHtml = '<div class="ct-names__empty">No ' + _escapeHtml(typeInfo.label.toLowerCase()) + ' yet.</div>';
        } else {
            for (var i = 0; i < items.length; i++) {
                chipsHtml += _renderChip(typeKey, items[i]);
            }
        }

        return (
            '<div class="ct-names__card" data-type="' + _escapeHtml(typeKey) + '">' +
              '<div class="ct-names__card-header">' +
                '<div class="ct-names__card-title">' +
                  _escapeHtml(typeInfo.label) +
                  '<span class="ct-names__card-hint">' + _escapeHtml(typeInfo.hint) + '</span>' +
                '</div>' +
                '<span class="ct-names__card-count">' + items.length + ' names</span>' +
              '</div>' +
              '<div class="ct-names__field-label">Bulk edit \u2014 one name per line</div>' +
              '<textarea class="ct-names__textarea"' +
                ' data-role="textarea"' +
                ' data-type="' + _escapeHtml(typeKey) + '"' +
                ' rows="6"' +
                ' spellcheck="false"' +
                ' placeholder="Type or paste names, one per line.">' +
                _escapeHtml(textareaValue) +
              '</textarea>' +
              '<div class="ct-names__bulk-actions">' +
                '<button type="button"' +
                  ' class="rt-btn rt-btn--primary ct-names__apply"' +
                  ' data-type="' + _escapeHtml(typeKey) + '">' +
                  'Apply changes' +
                '</button>' +
              '</div>' +
              '<div class="ct-names__field-label">Current list</div>' +
              '<div class="ct-names__chips" data-role="chips">' +
                chipsHtml +
              '</div>' +
              '<div class="ct-names__add-row">' +
                '<input type="text"' +
                  ' class="ct-names__add-input"' +
                  ' data-role="add-input"' +
                  ' data-type="' + _escapeHtml(typeKey) + '"' +
                  ' placeholder="Add ' + _escapeHtml(typeInfo.label.toLowerCase()) + '...">' +
                '<button type="button"' +
                  ' class="rt-btn ct-names__add-btn"' +
                  ' data-type="' + _escapeHtml(typeKey) + '">Add</button>' +
              '</div>' +
            '</div>'
        );
    }

    function _renderChip(typeKey, value) {
        return (
            '<span class="ct-names__chip" data-name="' + _escapeHtml(value) + '">' +
              '<span class="ct-names__chip-label">' + _escapeHtml(value) + '</span>' +
              '<button type="button"' +
                ' class="ct-names__chip-remove"' +
                ' data-type="' + _escapeHtml(typeKey) + '"' +
                ' data-name="' + _escapeHtml(value) + '"' +
                ' title="Remove">&times;</button>' +
            '</span>'
        );
    }

    function _nameTypeInfo(typeKey) {
        for (var i = 0; i < NAME_TYPES.length; i++) {
            if (NAME_TYPES[i].key === typeKey) return NAME_TYPES[i];
        }
        return { key: typeKey, label: typeKey, hint: '' };
    }

    // =========================================================================
    // 6. RULES CARD
    // =========================================================================

    function _renderRulesCard(rules) {
        var NR = _getNameRules();
        if (!NR) {
            return (
                '<div class="ct-names__card ct-names__card--rules">' +
                  '<div class="ct-names__card-header">' +
                    '<div class="ct-names__card-title">Surname Rules</div>' +
                  '</div>' +
                  '<div class="ct-names__empty">Name rules subsystem is not available.</div>' +
                '</div>'
            );
        }

        var ruleType = (rules && typeof rules.type === 'string') ? rules.type : 'family';

        var typeOptions = [
            { key: 'family',     label: 'Family surname (inherited)' },
            { key: 'patronymic', label: 'Patronymic / Matronymic' },
            { key: 'chain',      label: 'Chain (multiple ancestors)' },
            { key: 'random',     label: 'Random surname from pool' }
        ];
        var typeOptionsHtml = '';
        for (var i = 0; i < typeOptions.length; i++) {
            var opt = typeOptions[i];
            typeOptionsHtml +=
                '<option value="' + _escapeHtml(opt.key) + '"' +
                  (opt.key === ruleType ? ' selected' : '') +
                  '>' + _escapeHtml(opt.label) + '</option>';
        }

        var family = (rules && rules.family) ? rules.family : {};
        var patronymic = (rules && rules.patronymic) ? rules.patronymic : {};
        var chain = (rules && rules.chain) ? rules.chain : { order: ['father'] };

        var familySection =
            '<div class="ct-names__rules-section" data-rule-section="family">' +
              '<div class="ct-names__form-row">' +
                '<label class="ct-names__form-label">Surname Source</label>' +
                '<select class="ct-names__form-select" data-role="family-source">' +
                  '<option value="father"' + (family.source === 'father' || !family.source ? ' selected' : '') + '>Father</option>' +
                  '<option value="mother"' + (family.source === 'mother' ? ' selected' : '') + '>Mother</option>' +
                  '<option value="both"'   + (family.source === 'both'   ? ' selected' : '') + '>Both parents</option>' +
                '</select>' +
              '</div>' +
              '<div class="ct-names__form-row">' +
                '<label class="ct-names__form-label">Surname Count</label>' +
                '<input type="number" class="ct-names__form-input" data-role="family-count"' +
                  ' min="1" max="4" value="' + _escapeHtml(String(family.count || 1)) + '">' +
              '</div>' +
              '<div class="ct-names__form-row">' +
                '<label class="ct-names__form-label">Position (multi-part surnames)</label>' +
                '<select class="ct-names__form-select" data-role="family-position">' +
                  '<option value="first"' + (family.position === 'first' || !family.position ? ' selected' : '') + '>First</option>' +
                  '<option value="last"'  + (family.position === 'last' ? ' selected' : '') + '>Last</option>' +
                '</select>' +
              '</div>' +
            '</div>';

        var patronymicSection =
            '<div class="ct-names__rules-section" data-rule-section="patronymic">' +
              '<div class="ct-names__form-row">' +
                '<label class="ct-names__form-label">Source Parent</label>' +
                '<select class="ct-names__form-select" data-role="patronymic-source">' +
                  '<option value="father"' + (patronymic.source === 'father' || !patronymic.source ? ' selected' : '') + '>Father</option>' +
                  '<option value="mother"' + (patronymic.source === 'mother' ? ' selected' : '') + '>Mother</option>' +
                '</select>' +
              '</div>' +
              '<div class="ct-names__form-row">' +
                '<label class="ct-names__form-label">Male Suffix</label>' +
                '<input type="text" class="ct-names__form-input" data-role="patronymic-male-suffix"' +
                  ' placeholder="e.g. son"' +
                  ' value="' + _escapeHtml(patronymic.maleSuffix || '') + '">' +
              '</div>' +
              '<div class="ct-names__form-row">' +
                '<label class="ct-names__form-label">Female Suffix</label>' +
                '<input type="text" class="ct-names__form-input" data-role="patronymic-female-suffix"' +
                  ' placeholder="e.g. dottir"' +
                  ' value="' + _escapeHtml(patronymic.femaleSuffix || '') + '">' +
              '</div>' +
              '<div class="ct-names__form-row">' +
                '<label class="ct-names__form-label">Male Prefix (optional)</label>' +
                '<input type="text" class="ct-names__form-input" data-role="patronymic-male-prefix"' +
                  ' value="' + _escapeHtml(patronymic.malePrefix || '') + '">' +
              '</div>' +
              '<div class="ct-names__form-row">' +
                '<label class="ct-names__form-label">Female Prefix (optional)</label>' +
                '<input type="text" class="ct-names__form-input" data-role="patronymic-female-prefix"' +
                  ' value="' + _escapeHtml(patronymic.femalePrefix || '') + '">' +
              '</div>' +
            '</div>';

        var chainOrderStr = Array.isArray(chain.order) ? chain.order.join(', ') : 'father';

        var chainSection =
            '<div class="ct-names__rules-section" data-rule-section="chain">' +
              '<div class="ct-names__form-row">' +
                '<label class="ct-names__form-label">Ancestor order (comma-separated)</label>' +
                '<input type="text" class="ct-names__form-input" data-role="chain-order"' +
                  ' placeholder="father, paternal_grandfather"' +
                  ' value="' + _escapeHtml(chainOrderStr) + '">' +
              '</div>' +
              '<div class="ct-names__form-hint">' +
                'Valid slots: father, mother, paternal_grandfather, ' +
                'paternal_grandmother, maternal_grandfather, maternal_grandmother, ' +
                'paternal_great_grandfather, maternal_great_grandfather.' +
              '</div>' +
              '<div class="ct-names__form-row">' +
                '<label class="ct-names__form-label">Source</label>' +
                '<select class="ct-names__form-select" data-role="chain-source">' +
                  '<option value="firstname"' + (chain.source === 'firstname' || !chain.source ? ' selected' : '') + '>First names</option>' +
                  '<option value="surname"'   + (chain.source === 'surname'   ? ' selected' : '') + '>Surnames</option>' +
                '</select>' +
              '</div>' +
            '</div>';

        var randomSection =
            '<div class="ct-names__rules-section" data-rule-section="random">' +
              '<div class="ct-names__form-hint">' +
                'A random surname will be chosen from this culture\u2019s surnames list.' +
              '</div>' +
            '</div>';

        return (
            '<div class="ct-names__card ct-names__card--rules">' +
              '<div class="ct-names__card-header">' +
                '<div class="ct-names__card-title">Surname Rules' +
                  '<span class="ct-names__card-hint">' +
                    'How newborns and married partners get a surname from this culture.' +
                  '</span>' +
                '</div>' +
              '</div>' +
              '<div class="ct-names__form-row">' +
                '<label class="ct-names__form-label">Rule Type</label>' +
                '<select class="ct-names__form-select" data-role="rule-type">' +
                  typeOptionsHtml +
                '</select>' +
              '</div>' +
              familySection +
              patronymicSection +
              chainSection +
              randomSection +
              '<div class="ct-names__bulk-actions">' +
                '<button type="button" class="rt-btn rt-btn--primary ct-names__rules-save">' +
                  'Save Rules' +
                '</button>' +
                '<button type="button" class="rt-btn ct-names__rules-clear">' +
                  'Clear Rules' +
                '</button>' +
              '</div>' +
            '</div>'
        );
    }

    // =========================================================================
    // 7. EVENT WIRING — NAME LISTS
    // =========================================================================

    function _attachNameListEvents(container, culture) {
        // Bulk-edit Apply.
        var applyBtns = container.querySelectorAll('.ct-names__apply');
        for (var i = 0; i < applyBtns.length; i++) {
            (function (btn) {
                btn.addEventListener('click', function () {
                    var type = btn.getAttribute('data-type');
                    if (!type) return;
                    var textarea = container.querySelector(
                        '.ct-names__textarea[data-type="' + type + '"]'
                    );
                    if (!textarea) return;
                    _handleApplyBulk(container, culture, type, textarea.value);
                });
            })(applyBtns[i]);
        }

        // One-name Add button.
        var addBtns = container.querySelectorAll('.ct-names__add-btn');
        for (var j = 0; j < addBtns.length; j++) {
            (function (btn) {
                btn.addEventListener('click', function () {
                    var type = btn.getAttribute('data-type');
                    if (!type) return;
                    var input = container.querySelector(
                        '.ct-names__add-input[data-type="' + type + '"]'
                    );
                    if (!input) return;
                    _handleAddOne(container, culture, type, input.value);
                });
            })(addBtns[j]);
        }

        // Enter in the add input.
        var addInputs = container.querySelectorAll('.ct-names__add-input');
        for (var k = 0; k < addInputs.length; k++) {
            (function (input) {
                input.addEventListener('keydown', function (e) {
                    if (e.key !== 'Enter') return;
                    e.preventDefault();
                    var type = input.getAttribute('data-type');
                    if (!type) return;
                    _handleAddOne(container, culture, type, input.value);
                });
            })(addInputs[k]);
        }

        // Chip remove — delegated.
        container.addEventListener('click', function (e) {
            var target = e.target;
            if (!target || typeof target.closest !== 'function') return;
            var removeBtn = target.closest('.ct-names__chip-remove');
            if (!removeBtn) return;
            e.preventDefault();
            var type = removeBtn.getAttribute('data-type');
            var name = removeBtn.getAttribute('data-name');
            if (!type || !name) return;
            _handleRemoveOne(container, culture, type, name);
        });
    }

    function _handleApplyBulk(container, culture, type, rawText) {
        var NC = _getNameCommands();
        if (!NC) {
            _showToast('Name commands are not available.', 'error');
            return;
        }

        var wanted = _parseLines(rawText);
        var NQ = _getNameQueries();
        var current = [];
        try {
            var list = NQ.getNameList(culture.id);
            if (list && Array.isArray(list[type])) current = list[type].slice();
        } catch (e) { current = []; }

        var currentSet = new Set(current);
        var wantedSet = new Set(wanted);

        var toAdd = wanted.filter(function (n) { return !currentSet.has(n); });
        var toRemove = current.filter(function (n) { return !wantedSet.has(n); });

        if (toAdd.length === 0 && toRemove.length === 0) {
            _showToast('No changes to apply.', 'info');
            return;
        }

        var failures = [];
        for (var i = 0; i < toRemove.length; i++) {
            var r = NC.removeNameFromList(culture.id, type, toRemove[i]);
            if (!r || r.success !== true) {
                failures.push('remove "' + toRemove[i] + '": ' +
                    (r && r.reason ? r.reason : 'unknown'));
            }
        }
        for (var j = 0; j < toAdd.length; j++) {
            var a = NC.addNameToList(culture.id, type, toAdd[j]);
            if (!a || a.success !== true) {
                failures.push('add "' + toAdd[j] + '": ' +
                    (a && a.reason ? a.reason : 'unknown'));
            }
        }

        var persistResult = NC.persist();
        if (failures.length > 0) {
            // Cap the failure message. A large bulk edit with many
            // failures used to produce an unbounded "a; b; c; d; e; ..."
            // toast that was unreadable and pushed the useful counts
            // off-screen. Show the first three and count the rest.
            var shown = failures.slice(0, 3).join('; ');
            var more = failures.length > 3
                ? ' (+' + (failures.length - 3) + ' more)'
                : '';
            _showToast('Some changes failed: ' + shown + more, 'error');
        } else if (persistResult && persistResult.success === false) {
            _showToast(
                'Applied in memory; storage write failed: ' +
                (persistResult.reason || 'unknown'),
                'warning'
            );
        } else {
            _showToast(
                'Applied ' + toAdd.length + ' add(s), ' +
                toRemove.length + ' removal(s).',
                'success'
            );
        }

        renderNamesTab(container, culture);
    }

    function _parseLines(raw) {
        if (typeof raw !== 'string') return [];
        var lines = raw.split(/\r?\n/);
        var out = [];
        var seen = new Set();
        for (var i = 0; i < lines.length; i++) {
            var v = lines[i].trim();
            if (v.length === 0) continue;
            if (seen.has(v)) continue;
            seen.add(v);
            out.push(v);
        }
        return out;
    }

    function _handleAddOne(container, culture, type, rawName) {
        var NC = _getNameCommands();
        if (!NC) {
            _showToast('Name commands are not available.', 'error');
            return;
        }
        var name = (rawName || '').trim();
        if (!name) {
            _showToast('Enter a name first.', 'warning');
            return;
        }
        var result = NC.addNameToList(culture.id, type, name);
        if (!result || result.success !== true) {
            _showToast(
                'Add failed: ' + (result && result.reason ? result.reason : 'unknown'),
                'error'
            );
            return;
        }
        var persistResult = NC.persist();
        if (persistResult && persistResult.success === false) {
            _showToast(
                'Added in memory; storage write failed: ' +
                (persistResult.reason || 'unknown'),
                'warning'
            );
        }
        renderNamesTab(container, culture);
    }

    function _handleRemoveOne(container, culture, type, name) {
        var NC = _getNameCommands();
        if (!NC) {
            _showToast('Name commands are not available.', 'error');
            return;
        }
        var result = NC.removeNameFromList(culture.id, type, name);
        if (!result || result.success !== true) {
            _showToast(
                'Remove failed: ' + (result && result.reason ? result.reason : 'unknown'),
                'error'
            );
            return;
        }
        var persistResult = NC.persist();
        if (persistResult && persistResult.success === false) {
            _showToast(
                'Removed in memory; storage write failed: ' +
                (persistResult.reason || 'unknown'),
                'warning'
            );
        }
        renderNamesTab(container, culture);
    }

    // =========================================================================
    // 8. EVENT WIRING — RULES
    // =========================================================================

    function _attachRulesEvents(container, culture) {
        var typeSel = container.querySelector('[data-role="rule-type"]');
        if (!typeSel) return;

        function _updateVisibleSection() {
            var t = typeSel.value;
            var sections = container.querySelectorAll('[data-rule-section]');
            for (var i = 0; i < sections.length; i++) {
                sections[i].hidden =
                    sections[i].getAttribute('data-rule-section') !== t;
            }
        }
        typeSel.addEventListener('change', _updateVisibleSection);
        _updateVisibleSection();

        var saveBtn = container.querySelector('.ct-names__rules-save');
        if (saveBtn) {
            saveBtn.addEventListener('click', function () {
                _handleSaveRules(container, culture);
            });
        }

        var clearBtn = container.querySelector('.ct-names__rules-clear');
        if (clearBtn) {
            clearBtn.addEventListener('click', function () {
                _handleClearRules(container, culture);
            });
        }
    }

    function _collectRules(container) {
        var typeSel = container.querySelector('[data-role="rule-type"]');
        if (!typeSel) return null;
        var type = typeSel.value;

        var rules = { type: type };

        if (type === 'family') {
            var famSource = container.querySelector('[data-role="family-source"]');
            var famCount  = container.querySelector('[data-role="family-count"]');
            var famPos    = container.querySelector('[data-role="family-position"]');
            rules.family = {
                source: famSource ? famSource.value : 'father',
                count: famCount ? (parseInt(famCount.value, 10) || 1) : 1,
                position: famPos ? famPos.value : 'first'
            };
        } else if (type === 'patronymic') {
            var pSource  = container.querySelector('[data-role="patronymic-source"]');
            var pMaleSuf = container.querySelector('[data-role="patronymic-male-suffix"]');
            var pFemSuf  = container.querySelector('[data-role="patronymic-female-suffix"]');
            var pMalePre = container.querySelector('[data-role="patronymic-male-prefix"]');
            var pFemPre  = container.querySelector('[data-role="patronymic-female-prefix"]');
            rules.patronymic = {
                source: pSource ? pSource.value : 'father',
                maleSuffix: pMaleSuf ? pMaleSuf.value : '',
                femaleSuffix: pFemSuf ? pFemSuf.value : '',
                malePrefix: pMalePre ? pMalePre.value : '',
                femalePrefix: pFemPre ? pFemPre.value : ''
            };
        } else if (type === 'chain') {
            var cOrder  = container.querySelector('[data-role="chain-order"]');
            var cSource = container.querySelector('[data-role="chain-source"]');
            var orderStr = cOrder ? cOrder.value : '';
            var order = orderStr.split(',').map(function (s) { return s.trim(); })
                                 .filter(function (s) { return s.length > 0; });
            rules.chain = {
                order: order,
                source: cSource ? cSource.value : 'firstname'
            };
        }

        return rules;
    }

    function _handleSaveRules(container, culture) {
        var NC = _getNameCommands();
        var NR = _getNameRules();
        if (!NC || !NR) {
            _showToast('Name subsystem is not available.', 'error');
            return;
        }

        var rules = _collectRules(container);
        if (!rules) {
            _showToast('Could not read rules from the form.', 'error');
            return;
        }

        var validation;
        try { validation = NR.validateRules(rules); }
        catch (e) {
            _showToast('Validation threw: ' + (e.message || 'unknown'), 'error');
            return;
        }
        if (!validation || validation.valid !== true) {
            var errs = (validation && Array.isArray(validation.errors))
                ? validation.errors
                : ['Unknown validation failure.'];
            _showToast('Rules invalid: ' + errs.join('; '), 'error');
            return;
        }

        var result = NC.setCultureSurnameRules(culture.id, rules);
        if (!result || result.success !== true) {
            _showToast(
                'Save rules failed: ' + (result && result.reason ? result.reason : 'unknown'),
                'error'
            );
            return;
        }

        var persistResult = NC.persist();
        if (persistResult && persistResult.success === false) {
            _showToast(
                'Rules saved in memory; storage write failed: ' +
                (persistResult.reason || 'unknown'),
                'warning'
            );
        } else {
            _showToast('Surname rules saved', 'success');
        }

        renderNamesTab(container, culture);
    }

    function _handleClearRules(container, culture) {
        var NC = _getNameCommands();
        if (!NC) {
            _showToast('Name commands are not available.', 'error');
            return;
        }

        // Clearing rules means setting them to null. The previous
        // revision wrote masterData.data.nameLists[culture.id].rules
        // directly. That bypassed the command layer's markDataDirty /
        // publish contract and was the only destructive masterData
        // write in the tab. It now goes through
        // NameCommands.clearCultureSurnameRules, which is the dedicated
        // command for the "no rules configured" state.
        //
        // The clear does NOT go through setCultureSurnameRules because a
        // null rules object intentionally fails that command's
        // validation; setCultureSurnameRules is for setting a
        // configured rules object, clearCultureSurnameRules is for
        // removing one.
        if (typeof NC.clearCultureSurnameRules !== 'function') {
            _showToast(
                'Clear rules is not available. name-commands.js needs ' +
                'clearCultureSurnameRules.',
                'error'
            );
            return;
        }

        var result = NC.clearCultureSurnameRules(culture.id);
        if (!result || result.success !== true) {
            _showToast(
                'Clear failed: ' + (result && result.reason ? result.reason : 'unknown'),
                'error'
            );
            return;
        }

        // Only persist on command success. The prior version persisted
        // unconditionally after the direct write; with a command that
        // can fail, unconditional persist would write a stale in-memory
        // state.
        var persistResult = NC.persist();
        if (persistResult && persistResult.success === false) {
            _showToast(
                'Cleared in memory; storage write failed: ' +
                (persistResult.reason || 'unknown'),
                'warning'
            );
        } else {
            _showToast('Surname rules cleared', 'info');
        }

        renderNamesTab(container, culture);
    }

    // =========================================================================
    // 9. TAB DEFINITION + REGISTRATION
    // =========================================================================

    var NamesTab = {
        label: 'Names',
        icon: 'BOOK',
        render: renderNamesTab,
        save: function () { return {}; },
        validate: function () { return { valid: true }; }
    };

    window.CultureNamesTab = NamesTab;

    function register() {
        if (typeof window.CultureEditorTabs === 'undefined'
            || !window.CultureEditorTabs
            || typeof window.CultureEditorTabs.registerTab !== 'function') {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn(
                    'culture-names-tab.js: CultureEditorTabs is not loaded; ' +
                    'the names tab was not registered.'
                );
            }
            return false;
        }
        return window.CultureEditorTabs.registerTab('names', NamesTab);
    }

    window.registerCultureNamesTab = register;

    if (typeof window.CultureEditorTabs !== 'undefined') {
        register();
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            NamesTab: NamesTab,
            registerCultureNamesTab: register
        };
    }
})();
