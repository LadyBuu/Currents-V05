/**
 * =============================================================================
 * STILL WATERS - CULTURE NAMES TAB (js/tabs/culture-names-tab.js)
 * =============================================================================
 *
 * LOCATION: js/tabs/culture-names-tab.js
 *
 * A CultureEditorTabs tab for managing the names and surname rules that
 * belong to a culture.
 *
 * REGISTRATION (CultureEditorTabs, composite form):
 *   CultureEditorTabs.registerTab('names', NamesTab);
 *
 *   render(container, culture)     — paints the tab's DOM into `container`
 *   save(culture)                  — returns {} — this tab writes to the
 *                                    name subsystem's own storage
 *                                    (masterData.data.nameLists), not to
 *                                    the culture record
 *   validate(culture)              — { valid: true } — no culture-shape
 *                                    validation from this tab
 *
 * THIS TAB DOES NOT PARTICIPATE IN THE COMPOSITE SAVE
 * ---------------------------------------------------
 * Names and surname rules live under masterData.data.nameLists, keyed by
 * countryId. They are not fields on the culture record. Every read and
 * write here goes through the name subsystem:
 *
 *   read:   NameQueries.getNameList, NameQueries.getCountrySurnameRules
 *   write:  NameCommands.addNameToList, NameCommands.removeNameFromList,
 *           NameCommands.setCountrySurnameRules
 *   persist: NameCommands.persist (called once per successful write batch)
 *
 * Consequence: name and rule changes commit immediately, and the editor's
 * Cancel does not undo them. The tab hint surfaces this to the user.
 *
 * COUNTRY RESOLUTION
 * ------------------
 * Name lists are keyed by country. A culture does not carry a country
 * id directly; it carries a `locations` array. The tab resolves the
 * country as follows:
 *
 *   1. Take the first entry of culture.locations.
 *   2. Walk up the parent chain via window.getPlaceById until we reach
 *      a place whose scope is 'country' (via window.getPlaceScope).
 *   3. If no country is found, the tab renders a clear "no country
 *      associated" state and disables every action. No fabrication.
 *
 * The country walk only runs when the culture has at least one
 * location. Otherwise the tab does not query the location subsystem.
 *
 * CONTRACTS
 * ---------
 *   - Reads are scoped to `container.querySelector(...)`. Never `document`.
 *   - No inline `style=""`. Classes live in css/culture-tabs.css.
 *   - No emojis. Chrome icons via _getIcon(name) — returns '' for
 *     unknown names.
 *   - Uses window.getCurrentYear (canonical) only where a year is
 *     needed for display. This tab does not create surname changes,
 *     so it never needs a year input.
 *   - Session UI state (search filter, expanded sections) resets on
 *     render; not persisted.
 *   - Modal input reads are scoped to the modal root passed to
 *     onConfirm(root). No document.getElementById inside callbacks.
 *   - All toasts and error display go through window.showToast. This
 *     tab is a culture tab and follows the culture convention; it
 *     does not use _renderError (that is modals-name.js's pattern).
 *   - Existing text fields and list fields are read from the modal
 *     root with root.querySelector('#id'), not document.
 *   - escapeHtml is a REQUIRED dependency (formatting.js). The silent
 *     fallback that lived in a previous revision has been removed.
 *
 * DEPENDENCIES (resolved at call time — no load-time guards, so a
 * missing optional dependency does not fail the page; the tab degrades):
 *   - CultureEditorTabs   (this must load after culture-editor-tab.js)
 *   - NameQueries         (getNameList, getCountrySurnameRules,
 *                          getRandomName, getRandomSurname)
 *   - NameCommands        (addNameToList, removeNameFromList,
 *                          setCountrySurnameRules, persist)
 *   - NameRules           (validateRules)
 *   - NameState           (subscribe — optional; used to re-render
 *                          when the name subsystem emits a change)
 *   - accessors.js        (getPlaceById)
 *   - world.js            (getPlaceScope)
 *   - formatting.js       (escapeHtml — REQUIRED, throws if missing)
 *   - icons.js            (Icons[name] — chrome only)
 *   - ui.js               (showToast)
 *   - modals-core.js      (openModal, closeTopModal, confirmDialog)
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision (A4):
 *     - _escapeHtml tightened to throw if formatting.js is missing.
 *       Matches the other culture tabs' post-audit contract.
 *     - _ruleTypeLabel dropped its unused `NR` second parameter. The
 *       label map lives locally; NR was forwarded but never read.
 *       Call sites updated; _renderRulesSummary's second parameter
 *       removed for the same reason (its only use of NR was
 *       forwarding it to _ruleTypeLabel).
 *     - Header dependency list trimmed: NameRules now lists only
 *       validateRules (the four other exports the header used to name
 *       were never read); modals-char-selector.js removed (it was
 *       listed as "currently unused" and remains so).
 *   Previous revisions:
 *     - Initial implementation.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    // escapeHtml is a REQUIRED dependency of this tab (formatting.js). The
    // silent fallback that lived here in a previous revision diverged from
    // the other culture tabs' contract and from formatting.js's own
    // escaping policy. Renderers do not implement their own escaping.
    function _escapeHtml(str) {
        if (typeof window.escapeHtml !== 'function') {
            throw new Error(
                'culture-names-tab.js requires escapeHtml (formatting.js). ' +
                'Check script tag order.'
            );
        }
        return window.escapeHtml(str);
    }

    function _getIcon(name) {
        if (window.Icons && window.Icons[name]) return window.Icons[name];
        return '';
    }

    function _showToast(msg, type) {
        if (typeof window.showToast === 'function') window.showToast(msg, type);
    }

    function _openModal(options) {
        return typeof window.openModal === 'function'
            ? window.openModal(options)
            : null;
    }

    function _closeTopModal() {
        if (typeof window.closeTopModal === 'function') window.closeTopModal();
    }

    function _confirm(message, title, onConfirm) {
        if (typeof window.confirmDialog === 'function') {
            window.confirmDialog(message, title, onConfirm);
        } else if (typeof confirm === 'function' && confirm(message)) {
            onConfirm();
        }
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

    function _getNameState() {
        return typeof window.NamesState !== 'undefined'
            ? window.NamesState
            : (typeof window.NameState !== 'undefined' ? window.NameState : null);
    }

    // =========================================================================
    // 2. COUNTRY RESOLUTION
    // =========================================================================
    //
    // See COUNTRY RESOLUTION in the module header. The walk uses
    // world.js's getPlaceScope — the canonical scope accessor — and
    // accessors.js's getPlaceById.
    //
    // Max depth is a defensive cap. A cycle in the parent chain returns
    // null rather than looping forever.

    var MAX_PARENT_WALK = 100;

    function _resolveCountryForCulture(culture) {
        if (!culture) return null;
        if (!Array.isArray(culture.locations) || culture.locations.length === 0) {
            return null;
        }
        if (typeof window.getPlaceById !== 'function') return null;
        if (typeof window.getPlaceScope !== 'function') return null;

        var currentId = culture.locations[0];
        if (typeof currentId !== 'string' || currentId.length === 0) return null;

        var visited = new Set();
        var guard = 0;

        while (currentId && guard < MAX_PARENT_WALK) {
            guard++;
            if (visited.has(currentId)) return null;
            visited.add(currentId);

            var place = window.getPlaceById(currentId);
            if (!place) return null;

            if (window.getPlaceScope(place) === 'country') {
                return place;
            }

            if (typeof place.parentId !== 'string' || place.parentId.length === 0) {
                return null;
            }
            currentId = place.parentId;
        }

        return null;
    }

    function _countryName(country) {
        if (!country) return '';
        if (typeof country.displayName === 'string' && country.displayName) {
            return country.displayName;
        }
        if (typeof country.name === 'string' && country.name) {
            return country.name;
        }
        return country.id || '';
    }

    // =========================================================================
    // 3. LOCAL UI STATE
    // =========================================================================
    //
    // Reset on every render. Session UI, not persisted.

    var _state = {
        nameSearch: '',
        expanded: {
            male: true,
            female: true,
            surnames: true,
            rules: true
        },
        previewGender: 'male',
        previewCount: 5,
        previewResults: []
    };

    function _resetState() {
        _state.nameSearch = '';
        _state.expanded = {
            male: true,
            female: true,
            surnames: true,
            rules: true
        };
        _state.previewGender = 'male';
        _state.previewCount = 5;
        _state.previewResults = [];
    }

    // =========================================================================
    // 4. NAME-LIST TYPES
    // =========================================================================

    var NAME_TYPES = [
        { key: 'male', label: 'Male Names' },
        { key: 'female', label: 'Female Names' },
        { key: 'surnames', label: 'Surnames' }
    ];

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
        if (!NQ) {
            container.innerHTML =
                '<div class="rt-unavailable">Name queries are not available.</div>';
            return;
        }

        _resetState();

        var country = _resolveCountryForCulture(culture);
        var countryLabel = country ? _countryName(country) : null;

        var html =
            '<div class="ct-names">' +

            // ---- Hint ----
            '<div class="ct-hint">' +
              'Names and surname rules are stored per country and shared ' +
              'by every culture whose first location resolves to that ' +
              'country. Name changes commit immediately; closing the ' +
              'editor does not undo them.' +
            '</div>' +

            // ---- Country header ----
            '<div class="ct-names__header">' +
              (country
                ? '<div class="ct-names__country">' +
                    '<span class="ct-names__country-label">Country</span>' +
                    '<span class="ct-names__country-name">' +
                      _escapeHtml(countryLabel) +
                    '</span>' +
                  '</div>'
                : '<div class="ct-names__country ct-names__country--missing">' +
                    '<span class="ct-names__country-label">Country</span>' +
                    '<span class="ct-names__country-name">' +
                      'No country associated with this culture. ' +
                      'Add a location to the culture first.' +
                    '</span>' +
                  '</div>') +
            '</div>' +

            (country ? _renderNamesBody(country) : '') +

            '</div>';

        container.innerHTML = html;

        if (country) {
            _attachEvents(container, culture, country);
        }

        // Optional re-render on name-subsystem change. Guarded so
        // missing NameState does not break the tab.
        _maybeSubscribeToNameState(container, culture);
    }

    function _renderNamesBody(country) {
        return (
            // ---- List columns ----
            '<div class="ct-names__columns">' +
              _renderNameListColumn(country, 'male') +
              _renderNameListColumn(country, 'female') +
              _renderNameListColumn(country, 'surnames') +
            '</div>' +

            // ---- Surname rules ----
            _renderRulesPanel(country) +

            // ---- Preview ----
            _renderPreviewPanel()
        );
    }

    function _renderNameListColumn(country, typeKey) {
        var NQ = _getNameQueries();
        var label = _labelForType(typeKey);
        var names = [];
        try {
            var list = NQ.getNameList(country.id);
            if (list && Array.isArray(list[typeKey])) {
                names = list[typeKey];
            }
        } catch (e) {
            names = [];
        }

        var search = _state.nameSearch.toLowerCase();
        var filtered = names;
        if (search) {
            filtered = [];
            for (var i = 0; i < names.length; i++) {
                if (String(names[i]).toLowerCase().indexOf(search) !== -1) {
                    filtered.push(names[i]);
                }
            }
        }

        var isExpanded = _state.expanded[typeKey] !== false;

        var chipsHtml = '';
        if (filtered.length === 0) {
            chipsHtml =
                '<div class="ct-names__empty">' +
                  (names.length === 0
                    ? 'No ' + label.toLowerCase() + ' yet.'
                    : 'No names match your search.') +
                '</div>';
        } else {
            for (var j = 0; j < filtered.length; j++) {
                chipsHtml +=
                    '<span class="ct-names__chip" data-name="' +
                      _escapeHtml(filtered[j]) + '">' +
                      _escapeHtml(filtered[j]) +
                      '<button type="button"' +
                        ' class="ct-names__chip-remove"' +
                        ' data-type="' + _escapeHtml(typeKey) + '"' +
                        ' data-name="' + _escapeHtml(filtered[j]) + '"' +
                        ' title="Remove">&times;</button>' +
                    '</span>';
            }
        }

        return (
            '<div class="ct-names__column" data-type="' + _escapeHtml(typeKey) + '">' +
              '<button type="button" class="ct-names__column-header"' +
                ' data-toggle="' + _escapeHtml(typeKey) + '">' +
                '<span class="ct-names__column-title">' + _escapeHtml(label) + '</span>' +
                '<span class="ct-names__column-count">' + names.length + '</span>' +
                '<span class="ct-names__column-caret">' +
                  (isExpanded ? '&#9660;' : '&#9654;') +
                '</span>' +
              '</button>' +
              '<div class="ct-names__column-body"' +
                (isExpanded ? '' : ' hidden') + '>' +
                '<div class="ct-names__chips">' + chipsHtml + '</div>' +
                '<div class="ct-names__add-row">' +
                  '<input type="text"' +
                    ' class="ct-names__add-input"' +
                    ' data-type="' + _escapeHtml(typeKey) + '"' +
                    ' placeholder="Add ' + _escapeHtml(label.toLowerCase()) + '...">' +
                  '<button type="button"' +
                    ' class="rt-btn rt-btn--primary ct-names__add-btn"' +
                    ' data-type="' + _escapeHtml(typeKey) + '">Add</button>' +
                '</div>' +
              '</div>' +
            '</div>'
        );
    }

    function _renderRulesPanel(country) {
        var NR = _getNameRules();
        if (!NR) {
            return '';
        }

        var isExpanded = _state.expanded.rules !== false;

        var NQ = _getNameQueries();
        var rules = null;
        try {
            rules = NQ.getCountrySurnameRules(country.id);
        } catch (e) {
            rules = null;
        }

        var summary;
        if (!rules) {
            summary = 'No surname rules defined for this country.';
        } else {
            var ruleType = rules.type || 'family';
            var ruleLabel = _ruleTypeLabel(ruleType);
            summary = ruleLabel;
        }

        return (
            '<div class="ct-names__rules">' +
              '<button type="button" class="ct-names__rules-header"' +
                ' data-toggle="rules">' +
                '<span class="ct-names__column-title">Surname Rules</span>' +
                '<span class="ct-names__rules-summary">' +
                  _escapeHtml(summary) +
                '</span>' +
                '<span class="ct-names__column-caret">' +
                  (isExpanded ? '&#9660;' : '&#9654;') +
                '</span>' +
              '</button>' +
              '<div class="ct-names__rules-body"' +
                (isExpanded ? '' : ' hidden') + '>' +
                (rules
                  ? _renderRulesSummary(rules)
                  : '<div class="ct-names__empty">' +
                    'Surname rules have not been set for this country yet.' +
                    '</div>') +
                '<button type="button"' +
                  ' class="rt-btn rt-btn--primary ct-names__rules-edit">' +
                  (rules ? 'Edit Surname Rules' : 'Set Surname Rules') +
                '</button>' +
              '</div>' +
            '</div>'
        );
    }

    function _renderRulesSummary(rules) {
        var ruleType = rules.type || 'family';
        var typeLabel = _ruleTypeLabel(ruleType);

        var detailLines = [];

        if (ruleType === 'family' && rules.family) {
            var fam = rules.family;
            var source = _familySourceLabel(fam.source);
            if (source) detailLines.push('Source: ' + source);
            if (typeof fam.count === 'number') {
                detailLines.push('Surname count: ' + fam.count);
            }
        } else if (ruleType === 'patronymic' && rules.patronymic) {
            var pat = rules.patronymic;
            if (pat.source) {
                detailLines.push(
                    'Source: ' + (pat.source === 'father' ? 'Father' : 'Mother')
                );
            }
            if (pat.malePrefix || pat.maleSuffix) {
                detailLines.push(
                    'Male form: ' +
                    (pat.malePrefix || '') +
                    '{name}' +
                    (pat.maleSuffix || '')
                );
            }
            if (pat.femalePrefix || pat.femaleSuffix) {
                detailLines.push(
                    'Female form: ' +
                    (pat.femalePrefix || '') +
                    '{name}' +
                    (pat.femaleSuffix || '')
                );
            }
        } else if (ruleType === 'chain' && rules.chain) {
            var chain = rules.chain;
            if (Array.isArray(chain.order)) {
                detailLines.push('Depth: ' + chain.order.length);
                detailLines.push('Order: ' + chain.order.join(' \u2192 '));
            }
        }

        if (detailLines.length === 0) {
            return (
                '<div class="ct-names__rules-type">' +
                  _escapeHtml(typeLabel) +
                '</div>'
            );
        }

        var detailsHtml = '';
        for (var i = 0; i < detailLines.length; i++) {
            detailsHtml +=
                '<div class="ct-names__rules-detail">' +
                  _escapeHtml(detailLines[i]) +
                '</div>';
        }

        return (
            '<div class="ct-names__rules-type">' +
              _escapeHtml(typeLabel) +
            '</div>' +
            detailsHtml
        );
    }

    function _renderPreviewPanel() {
        var NQ = _getNameQueries();
        if (!NQ) return '';

        var genderOptions =
            '<option value="male"' +
              (_state.previewGender === 'male' ? ' selected' : '') +
              '>Male</option>' +
            '<option value="female"' +
              (_state.previewGender === 'female' ? ' selected' : '') +
              '>Female</option>';

        var countOptions = '';
        var counts = [5, 10, 20, 50];
        for (var i = 0; i < counts.length; i++) {
            var n = counts[i];
            countOptions +=
                '<option value="' + n + '"' +
                  (_state.previewCount === n ? ' selected' : '') +
                  '>' + n + '</option>';
        }

        var resultsHtml = '';
        if (_state.previewResults.length === 0) {
            resultsHtml =
                '<div class="ct-names__preview-empty">' +
                  'Click Generate to preview names from this country\u2019s lists.' +
                '</div>';
        } else {
            for (var j = 0; j < _state.previewResults.length; j++) {
                resultsHtml +=
                    '<span class="ct-names__preview-chip">' +
                      _escapeHtml(_state.previewResults[j]) +
                    '</span>';
            }
        }

        return (
            '<div class="ct-names__preview">' +
              '<div class="ct-names__preview-header">' +
                '<span class="ct-names__column-title">Name Preview</span>' +
              '</div>' +
              '<div class="ct-names__preview-controls">' +
                '<select class="ct-names__preview-gender">' +
                  genderOptions +
                '</select>' +
                '<select class="ct-names__preview-count">' +
                  countOptions +
                '</select>' +
                '<button type="button"' +
                  ' class="rt-btn rt-btn--primary ct-names__preview-generate">' +
                  'Generate' +
                '</button>' +
              '</div>' +
              '<div class="ct-names__preview-results">' +
                resultsHtml +
              '</div>' +
            '</div>'
        );
    }

    // =========================================================================
    // 6. LABEL HELPERS
    // =========================================================================

    function _labelForType(typeKey) {
        for (var i = 0; i < NAME_TYPES.length; i++) {
            if (NAME_TYPES[i].key === typeKey) return NAME_TYPES[i].label;
        }
        return typeKey;
    }

    // Rule-type labels are presentation vocabulary for this tab. They
    // are not read from NameRules; NameRules owns the rules themselves,
    // not how a tab labels them. If NameRules ever exports a
    // RULE_TYPES map of { key: { label } } and this tab wants to adopt
    // it as the source of truth, swap the body to read from that map.
    // Until then, the local map below is correct and matches the
    // options rendered in _renderRulesForm.
    function _ruleTypeLabel(ruleType) {
        var map = {
            random: 'Random surname',
            family: 'Family surname (inherited from parents)',
            patronymic: 'Patronymic / Matronymic',
            chain: 'Chain (multiple generations)'
        };
        return map[ruleType] || ruleType;
    }

    function _familySourceLabel(source) {
        var map = {
            father: 'Father',
            mother: 'Mother',
            both: 'Both parents'
        };
        return map[source] || source || '';
    }

    // =========================================================================
    // 7. EVENT WIRING
    // =========================================================================

    function _attachEvents(container, culture, country) {
        // ---- Toggle sections ----
        var toggles = container.querySelectorAll('[data-toggle]');
        for (var i = 0; i < toggles.length; i++) {
            (function (btn) {
                btn.addEventListener('click', function () {
                    var key = btn.getAttribute('data-toggle');
                    if (!key) return;
                    _state.expanded[key] = !_state.expanded[key];
                    renderNamesTab(container, culture);
                });
            })(toggles[i]);
        }

        // ---- Add name ----
        var addBtns = container.querySelectorAll('.ct-names__add-btn');
        for (var j = 0; j < addBtns.length; j++) {
            (function (btn) {
                btn.addEventListener('click', function () {
                    var type = btn.getAttribute('data-type');
                    if (!type) return;
                    var row = btn.closest('.ct-names__add-row');
                    if (!row) return;
                    var input = row.querySelector('.ct-names__add-input');
                    if (!input) return;
                    _handleAddName(container, culture, country, type, input.value);
                });
            })(addBtns[j]);
        }

        // ---- Add on Enter ----
        var addInputs = container.querySelectorAll('.ct-names__add-input');
        for (var k = 0; k < addInputs.length; k++) {
            (function (input) {
                input.addEventListener('keydown', function (e) {
                    if (e.key !== 'Enter') return;
                    e.preventDefault();
                    var type = input.getAttribute('data-type');
                    if (!type) return;
                    _handleAddName(container, culture, country, type, input.value);
                });
            })(addInputs[k]);
        }

        // ---- Remove name (delegated on chips) ----
        container.addEventListener('click', function (e) {
            var target = e.target;
            if (!target || typeof target.closest !== 'function') return;

            var removeBtn = target.closest('.ct-names__chip-remove');
            if (removeBtn) {
                e.preventDefault();
                var type = removeBtn.getAttribute('data-type');
                var name = removeBtn.getAttribute('data-name');
                if (type && name) {
                    _handleRemoveName(container, culture, country, type, name);
                }
                return;
            }
        });

        // ---- Edit surname rules ----
        var editRulesBtn = container.querySelector('.ct-names__rules-edit');
        if (editRulesBtn) {
            editRulesBtn.addEventListener('click', function () {
                _openEditRulesModal(container, culture, country);
            });
        }

        // ---- Generate preview ----
        var previewGender = container.querySelector('.ct-names__preview-gender');
        if (previewGender) {
            previewGender.addEventListener('change', function () {
                _state.previewGender = previewGender.value === 'female'
                    ? 'female'
                    : 'male';
            });
        }
        var previewCount = container.querySelector('.ct-names__preview-count');
        if (previewCount) {
            previewCount.addEventListener('change', function () {
                var n = parseInt(previewCount.value, 10);
                if (Number.isInteger(n) && n > 0) {
                    _state.previewCount = n;
                }
            });
        }
        var previewGenerate = container.querySelector('.ct-names__preview-generate');
        if (previewGenerate) {
            previewGenerate.addEventListener('click', function () {
                _handleGeneratePreview(container, culture, country);
            });
        }

        // ---- Search box ----
        var searchInput = container.querySelector('.ct-names__search');
        if (searchInput) {
            var timer = null;
            searchInput.addEventListener('input', function () {
                if (timer) clearTimeout(timer);
                timer = setTimeout(function () {
                    timer = null;
                    _state.nameSearch = searchInput.value || '';
                    renderNamesTab(container, culture);
                }, 200);
            });
        }
    }

    // =========================================================================
    // 8. NAME ADD / REMOVE / GENERATE
    // =========================================================================

    function _handleAddName(container, culture, country, type, rawValue) {
        var NC = _getNameCommands();
        if (!NC) {
            _showToast('Name commands are not available.', 'error');
            return;
        }
        var value = (rawValue || '').trim();
        if (!value) {
            _showToast('Enter a name first.', 'warning');
            return;
        }

        var result = NC.addNameToList(country.id, type, value);
        if (!result || result.success !== true) {
            _showToast(
                'Failed to add name: ' +
                (result && result.reason ? result.reason : 'unknown'),
                'error'
            );
            return;
        }

        // Persist after the successful write. Command does not save; the
        // tab calls persist once per successful command, exactly like the
        // other culture tabs persist after their commands.
        var persistResult = NC.persist();
        if (persistResult && persistResult.success === false) {
            _showToast(
                'Saved in memory; storage write failed: ' +
                (persistResult.reason || 'unknown'),
                'warning'
            );
        } else {
            _showToast('Added "' + value + '"', 'success');
        }

        renderNamesTab(container, culture);
    }

    function _handleRemoveName(container, culture, country, type, name) {
        var NC = _getNameCommands();
        if (!NC) {
            _showToast('Name commands are not available.', 'error');
            return;
        }

        _confirm(
            'Remove "' + name + '" from ' + _labelForType(type).toLowerCase() + '?',
            'Remove Name',
            function () {
                var result = NC.removeNameFromList(country.id, type, name);
                if (!result || result.success !== true) {
                    _showToast(
                        'Failed to remove name: ' +
                        (result && result.reason ? result.reason : 'unknown'),
                        'error'
                    );
                    return;
                }

                var persistResult = NC.persist();
                if (persistResult && persistResult.success === false) {
                    _showToast(
                        'Saved in memory; storage write failed: ' +
                        (persistResult.reason || 'unknown'),
                        'warning'
                    );
                } else {
                    _showToast('Removed "' + name + '"', 'info');
                }

                renderNamesTab(container, culture);
            }
        );
    }

    function _handleGeneratePreview(container, culture, country) {
        var NQ = _getNameQueries();
        if (!NQ) {
            _showToast('Name queries are not available.', 'error');
            return;
        }

        var gender = _state.previewGender === 'female' ? 'female' : 'male';
        var count = _state.previewCount || 5;
        if (count < 1) count = 1;
        if (count > 200) count = 200;

        var results = [];
        for (var i = 0; i < count; i++) {
            var given = null;
            var surname = null;
            try {
                given = NQ.getRandomName(country.id, gender);
            } catch (e) {
                given = null;
            }
            try {
                surname = NQ.getRandomSurname(country.id);
            } catch (e) {
                surname = null;
            }
            if (!given) continue;
            results.push(surname ? (given + ' ' + surname) : given);
        }

        if (results.length === 0) {
            _showToast(
                'No ' + gender + ' names available for this country.',
                'warning'
            );
        }

        _state.previewResults = results;
        renderNamesTab(container, culture);
    }

    // =========================================================================
    // 9. EDIT SURNAME RULES MODAL
    // =========================================================================
    //
    // Reads the current rules, presents a type chooser and the type-
    // specific fields, validates via NameRules.validateRules, and, on
    // success, calls NameCommands.setCountrySurnameRules once, then
    // persists once.
    //
    // All input reads are scoped to the modal root. No document.getElementById.

    function _openEditRulesModal(container, culture, country) {
        var NQ = _getNameQueries();
        var NC = _getNameCommands();
        var NR = _getNameRules();
        if (!NQ || !NC || !NR) {
            _showToast('Name subsystem is not available.', 'error');
            return;
        }

        var current = null;
        try {
            current = NQ.getCountrySurnameRules(country.id);
        } catch (e) {
            current = null;
        }

        var initialType = (current && typeof current.type === 'string')
            ? current.type
            : 'family';

        var content = _renderRulesForm(country, initialType, current);

        _openModal({
            titleHtml: 'Surname Rules: ' + _escapeHtml(_countryName(country)),
            contentHtml: content,
            confirmText: 'Save Rules',
            cancelText: 'Cancel',
            onMount: function (root) {
                _wireRulesForm(root, initialType);
            },
            onConfirm: function (root) {
                return _collectAndSaveRules(root, container, culture, country);
            }
        });
    }

    function _renderRulesForm(country, initialType, current) {
        var typeOptions = [
            { key: 'family', label: 'Family surname (inherited from parents)' },
            { key: 'patronymic', label: 'Patronymic / Matronymic' },
            { key: 'chain', label: 'Chain (multiple generations)' },
            { key: 'random', label: 'Random surname' }
        ];

        var typeOptionsHtml = '';
        for (var i = 0; i < typeOptions.length; i++) {
            var opt = typeOptions[i];
            typeOptionsHtml +=
                '<option value="' + _escapeHtml(opt.key) + '"' +
                  (opt.key === initialType ? ' selected' : '') +
                  '>' + _escapeHtml(opt.label) + '</option>';
        }

        return (
            '<div class="ct-form">' +
              '<div class="ct-form__group">' +
                '<label class="ct-form__label">Rule Type</label>' +
                '<select id="ct-rules-type" class="ct-form__select">' +
                  typeOptionsHtml +
                '</select>' +
              '</div>' +

              // ---- Family ---- 
              '<div id="ct-rules-family" class="ct-form__section">' +
                '<div class="ct-form__grid-2">' +
                  '<div class="ct-form__group">' +
                    '<label class="ct-form__label">Surname Source</label>' +
                    '<select id="ct-rules-family-source" class="ct-form__select">' +
                      '<option value="father">Father</option>' +
                      '<option value="mother">Mother</option>' +
                      '<option value="both">Both parents</option>' +
                    '</select>' +
                  '</div>' +
                  '<div class="ct-form__group">' +
                    '<label class="ct-form__label">Surname Count</label>' +
                    '<input type="number" id="ct-rules-family-count"' +
                      ' class="ct-form__input" value="1" min="1" max="4">' +
                  '</div>' +
                '</div>' +
              '</div>' +

              // ---- Patronymic ---- 
              '<div id="ct-rules-patronymic" class="ct-form__section">' +
                '<div class="ct-form__group">' +
                  '<label class="ct-form__label">Source Parent</label>' +
                  '<select id="ct-rules-patronymic-source" class="ct-form__select">' +
                    '<option value="father">Father</option>' +
                    '<option value="mother">Mother</option>' +
                  '</select>' +
                '</div>' +
                '<div class="ct-form__grid-2">' +
                  '<div class="ct-form__group">' +
                    '<label class="ct-form__label">Male Prefix</label>' +
                    '<input type="text" id="ct-rules-patronymic-male-prefix"' +
                      ' class="ct-form__input" placeholder="e.g. Mac">' +
                  '</div>' +
                  '<div class="ct-form__group">' +
                    '<label class="ct-form__label">Male Suffix</label>' +
                    '<input type="text" id="ct-rules-patronymic-male-suffix"' +
                      ' class="ct-form__input" placeholder="e.g. son">' +
                  '</div>' +
                '</div>' +
                '<div class="ct-form__grid-2">' +
                  '<div class="ct-form__group">' +
                    '<label class="ct-form__label">Female Prefix</label>' +
                    '<input type="text" id="ct-rules-patronymic-female-prefix"' +
                      ' class="ct-form__input" placeholder="e.g. Nic">' +
                  '</div>' +
                  '<div class="ct-form__group">' +
                    '<label class="ct-form__label">Female Suffix</label>' +
                    '<input type="text" id="ct-rules-patronymic-female-suffix"' +
                      ' class="ct-form__input" placeholder="e.g. dottir">' +
                  '</div>' +
                '</div>' +
              '</div>' +

              // ---- Chain ---- 
              '<div id="ct-rules-chain" class="ct-form__section">' +
                '<div class="ct-form__group">' +
                  '<label class="ct-form__label">Depth</label>' +
                  '<input type="number" id="ct-rules-chain-depth"' +
                    ' class="ct-form__input" value="2" min="1" max="4">' +
                '</div>' +
                '<div class="ct-form__hint">' +
                  'Order: father \u2192 paternal grandfather \u2192 maternal grandfather (auto).' +
                '</div>' +
              '</div>' +

              // ---- Random ---- 
              '<div id="ct-rules-random" class="ct-form__section">' +
                '<div class="ct-form__hint">' +
                  'A random surname will be chosen from the surnames list.' +
                '</div>' +
              '</div>' +

            '</div>'
        );
    }

    function _wireRulesForm(root, initialType) {
        var typeSel = root.querySelector('#ct-rules-type');
        if (!typeSel) return;

        function updateSections() {
            var t = typeSel.value;
            var sections = root.querySelectorAll('.ct-form__section');
            for (var i = 0; i < sections.length; i++) {
                var s = sections[i];
                var id = s.id || '';
                var match = id === ('ct-rules-' + t);
                s.hidden = !match;
            }
        }

        typeSel.addEventListener('change', updateSections);
        updateSections();
    }

    function _collectAndSaveRules(root, container, culture, country) {
        var NR = _getNameRules();
        var NC = _getNameCommands();
        if (!NR || !NC) {
            _showToast('Name subsystem is not available.', 'error');
            return false;
        }

        var typeSel = root.querySelector('#ct-rules-type');
        if (!typeSel) {
            _showToast('Rules form is missing its type field.', 'error');
            return false;
        }

        var rules = { type: typeSel.value };

        if (rules.type === 'family') {
            var famSourceEl = root.querySelector('#ct-rules-family-source');
            var famCountEl = root.querySelector('#ct-rules-family-count');
            rules.family = {
                source: famSourceEl ? famSourceEl.value : 'father',
                count: famCountEl ? (parseInt(famCountEl.value, 10) || 1) : 1
            };
        } else if (rules.type === 'patronymic') {
            rules.patronymic = {
                source: _valueOf(root, '#ct-rules-patronymic-source') || 'father',
                malePrefix: _valueOf(root, '#ct-rules-patronymic-male-prefix'),
                maleSuffix: _valueOf(root, '#ct-rules-patronymic-male-suffix'),
                femalePrefix: _valueOf(root, '#ct-rules-patronymic-female-prefix'),
                femaleSuffix: _valueOf(root, '#ct-rules-patronymic-female-suffix')
            };
        } else if (rules.type === 'chain') {
            var depthEl = root.querySelector('#ct-rules-chain-depth');
            var depth = depthEl ? (parseInt(depthEl.value, 10) || 2) : 2;
            if (depth < 1) depth = 1;
            if (depth > 4) depth = 4;
            var order = ['father', 'paternal_grandfather', 'maternal_grandfather'];
            rules.chain = {
                order: order.slice(0, depth)
            };
        } else if (rules.type === 'random') {
            // No additional fields.
        }

        var validation;
        try {
            validation = NR.validateRules(rules);
        } catch (e) {
            _showToast(
                'Rules validation threw: ' +
                (e && e.message ? e.message : 'unknown'),
                'error'
            );
            return false;
        }

        if (!validation || validation.valid !== true) {
            var errors = (validation && Array.isArray(validation.errors))
                ? validation.errors
                : ['Unknown validation failure.'];
            _showToast(
                'Rules failed validation: ' + errors.join('; '),
                'error'
            );
            return false;
        }

        var result = NC.setCountrySurnameRules(country.id, rules);
        if (!result || result.success !== true) {
            _showToast(
                'Failed to save rules: ' +
                (result && result.reason ? result.reason : 'unknown'),
                'error'
            );
            return false;
        }

        var persistResult = NC.persist();
        if (persistResult && persistResult.success === false) {
            _showToast(
                'Saved in memory; storage write failed: ' +
                (persistResult.reason || 'unknown'),
                'warning'
            );
        } else {
            _showToast('Surname rules saved', 'success');
        }

        renderNamesTab(container, culture);

        // Return true to let modals-core close the modal.
        return true;
    }

    function _valueOf(root, selector) {
        var el = root ? root.querySelector(selector) : null;
        return el ? (el.value || '') : '';
    }

    // =========================================================================
    // 10. OPTIONAL NAMESTATE SUBSCRIPTION
    // =========================================================================
    //
    // If NamesState is present and exposes subscribe, re-render the tab
    // on any name-subsystem change. The subscription is per-render, so
    // each render must be careful to unsubscribe the previous one. To
    // avoid stacking listeners across renders, we track the current
    // subscription on the container.

    function _maybeSubscribeToNameState(container, culture) {
        var NS = _getNameState();
        if (!NS || typeof NS.subscribe !== 'function') return;

        // Remove the previous subscription if it exists.
        if (container.__ctNamesUnsub && typeof container.__ctNamesUnsub === 'function') {
            try { container.__ctNamesUnsub(); }
            catch (e) { /* non-fatal */ }
            container.__ctNamesUnsub = null;
        }

        try {
            var unsub = NS.subscribe(function (event) {
                // Only re-render for name-subsystem events we care
                // about. Re-rendering on every event would defeat the
                // purpose of the culture editor's own render cycle.
                if (!event || !event.type) return;
                var t = event.type;
                if (t === 'nameListChanged' ||
                    t === 'surnameRulesChanged' ||
                    t === 'surnameChange' ||
                    t === 'surnameRevert') {
                    // The container may have been detached; guard.
                    if (!document.body.contains(container)) return;
                    renderNamesTab(container, culture);
                }
            });
            container.__ctNamesUnsub = unsub;
        } catch (e) {
            // Subscribe threw. Non-fatal; the tab still renders from
            // its direct writes.
        }
    }

    // =========================================================================
    // 11. TAB DEFINITION + REGISTRATION
    // =========================================================================

    var NamesTab = {
        label: 'Names',
        icon: 'BOOK',
        render: renderNamesTab,
        save: function (culture) {
            // This tab writes to the name subsystem's own storage
            // (masterData.data.nameLists), not to the culture record.
            // Nothing to merge into the composite candidate.
            return {};
        },
        validate: function (culture) {
            // No culture-shape validation from this tab.
            return { valid: true };
        }
    };

    window.CultureNamesTab = NamesTab;

    function register() {
        if (typeof window.CultureEditorTabs === 'undefined'
            || !window.CultureEditorTabs
            || typeof window.CultureEditorTabs.registerTab !== 'function') {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn(
                    'culture-names-tab.js: CultureEditorTabs is not loaded; ' +
                    'the names tab was not registered. Load ' +
                    'culture-editor-tab.js first.'
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
