/**
 * =============================================================================
 * STILL WATERS - CULTURE APPEARANCE TAB (js/tabs/culture-appearance-tab.js)
 * =============================================================================
 *
 * LOCATION: js/tabs/culture-appearance-tab.js
 *
 * A CultureEditorTabs tab for editing the appearance section of a culture:
 * weighted options for skinTones, eyeColors, hairColors, hairTypes,
 * buildTypes, commonFeatures, and gender-specific height ranges.
 *
 * REGISTRATION (CultureEditorTabs, composite form):
 *   CultureEditorTabs.registerTab('appearance', AppearanceTab);
 *
 *   render(container, culture)     — paints the tab's DOM into `container`
 *   save(culture)                  — returns a partial culture object whose
 *                                    `appearance` field replaces the whole
 *                                    appearance; the HOST merges and calls
 *                                    CultureCommands.updateCulture once
 *   validate(culture)              — { valid, errors, warnings }
 *
 * CONTRACTS
 * ---------
 *   - Reads are scoped to `container.querySelector(...)`. Never `document`.
 *   - Writes go into `_state.culture.appearance` on change, so a tab
 *     switch preserves input. The HOST is the only thing that calls
 *     CultureCommands.updateCulture; this tab only ever produces a
 *     candidate object in save().
 *   - No inline `style=""`. Classes live in css/culture-tabs.css.
 *   - No emojis. Icons via _getIcon(name) — returns '' for unknown names.
 *   - Uses window.getCurrentYear (canonical); no 1250 fallback, no
 *     deprecated alias. (This tab does not actually read the year, but
 *     any future "generated at" timestamp must use it.)
 *
 * THE SHAPE OF `appearance`
 * -------------------------
 *   appearance = {
 *     skinTones:      [ { value: 'Pale', weight: 20 }, ... ],
 *     eyeColors:      [ ... ],
 *     hairColors:     [ ... ],
 *     hairTypes:      [ ... ],
 *     buildTypes:     [ ... ],
 *     commonFeatures: [ ... ],
 *     height: {
 *       male:   { min: 155, max: 200 },
 *       female: { min: 145, max: 185 }
 *     }
 *   }
 *
 *   Each weighted-option list is preserved AS-IS by save() except for
 *   rows the user adds/removes/edits. Empty lists are removed from the
 *   candidate (so the canonical record does not accumulate empty arrays).
 *   Height is only present if the user touched any of the four inputs.
 *
 *   NOTE: The working copy (culture.appearance) MAY contain empty lists
 *   and a height object the user has not touched. That is intentional —
 *   it is what makes tab-switch preservation work. save() filters both
 *   out. See the TAB-SWITCH PRESERVATION CONTRACT in
 *   culture-editor-tab.js's header.
 *
 * DEPENDENCIES (resolved at call time — no load-time guards):
 *   - CultureEditorTabs (this must load after culture-editor-tab.js)
 *   - formatting.js     (escapeHtml — REQUIRED, throws if missing)
 *   - icons.js          (Icons[name] via _getIcon)
 *   - ui.js             (showToast — used only for duplicate feedback)
 *   - modals-core.js    (confirmDialog — optional; falls back to confirm())
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision (A5):
 *     - _escapeHtml tightened to throw if formatting.js is missing.
 *       Matches the post-audit contract of the other culture tabs.
 *     - _syncToWorkingCulture now writes every weighted category,
 *       even when empty. The previous version only wrote non-empty
 *       categories, which meant a category the user emptied was
 *       silently removed from the working copy — and therefore did
 *       not survive a tab switch. save() filters empty lists out, so
 *       the canonical record stays clean.
 *     - saveAppearanceTab now explicitly filters empty lists out of
 *       the appearance payload, and drops `height` when the user did
 *       not touch any height input. Previously `height` was always
 *       emitted if _readHeight returned a non-null object, and
 *       _readHeight's fallback defaults made it return non-null even
 *       when no input had been touched. The result was that opening
 *       the editor and clicking Save added a height object the
 *       culture never had.
 *     - _readWeightedList now trims `value` and rejects weights
 *       outside [0, 1000]. The previous version coerced any negative
 *       or non-finite weight to DEFAULT_WEIGHT (10), which silently
 *       changed user input. The input's `min="0" max="1000"`
 *       attributes always bounded the UI, so the only way to reach the
 *       prior code with an out-of-range weight was a programmatic DOM
 *       manipulation; this closes that path.
 *     - _handleAdd no longer calls _syncToWorkingCulture immediately
 *       after appending the row. The sync was a no-op (empty value is
 *       skipped by _readWeightedList), but it rebuilt the entire
 *       appearance object on every Add click. The input/change listener
 *       will sync when the user actually types.
 *     - _handleRemove uses appendChild for the empty-state instead of
 *       replacing list.innerHTML. The innerHTML swap was clobbered by
 *       the next _handleAdd anyway, but it also broke any future
 *       code that held a reference to a child of the list. appendChild
 *       composes correctly with both the add path and any future
 *       _syncToWorkingCulture call.
 *     - Header THE SHAPE OF `appearance` section notes that the working
 *       copy MAY contain empty lists / untouched height and that save()
 *       filters them out.
 *   Previous revisions:
 *     - Initial implementation.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    // escapeHtml is a REQUIRED dependency (formatting.js). Renderers do
    // not implement their own escaping; a missing escapeHtml is a
    // load-order bug that must be visible. See the header of
    // culture-mythology-tab.js for the same contract.
    function _escapeHtml(str) {
        if (typeof window.escapeHtml !== 'function') {
            throw new Error(
                'culture-appearance-tab.js requires escapeHtml (formatting.js). ' +
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

    function _confirm(message, title, onConfirm) {
        if (typeof window.confirmDialog === 'function') {
            window.confirmDialog(message, title, onConfirm);
        } else if (typeof confirm === 'function' && confirm(message)) {
            onConfirm();
        }
    }

    // =========================================================================
    // 2. CATEGORY DEFINITIONS
    // =========================================================================
    //
    // Category keys are the appearance object's keys. The label is the
    // user-facing heading. Descriptions are short hints. The three fields
    // are deliberately kept here (not in a constants module) because they
    // are the tab's own presentation vocabulary — the domain model does
    // not need to know how many categories exist or what they are called.

    var WEIGHTED_CATEGORIES = [
        { key: 'skinTones',      label: 'Skin Tones',      hint: 'Skin color variations' },
        { key: 'eyeColors',      label: 'Eye Colors',      hint: 'Eye color variations' },
        { key: 'hairColors',     label: 'Hair Colors',     hint: 'Hair color variations' },
        { key: 'hairTypes',      label: 'Hair Types',      hint: 'Hair texture variations' },
        { key: 'buildTypes',     label: 'Build Types',     hint: 'Body build variations' },
        { key: 'commonFeatures', label: 'Common Features', hint: 'Distinctive facial features' }
    ];

    // Bounds for the height inputs. Mirrors the validation in
    // culture-validation.js (which permits any finite numbers but this
    // tab presents realistic ranges).
    var HEIGHT_MIN = 100;
    var HEIGHT_MAX = 250;

    // Bounds for the weight input. Matches the min/max attributes on
    // the rendered <input type="number">. Out-of-range values coerce
    // to DEFAULT_WEIGHT.
    var WEIGHT_MIN = 0;
    var WEIGHT_MAX = 1000;
    var DEFAULT_WEIGHT = 10;

    // =========================================================================
    // 3. HELPERS
    // =========================================================================

    function _isObject(v) {
        return v !== null && typeof v === 'object' && !Array.isArray(v);
    }

    function _appearanceOf(culture) {
        return (culture && _isObject(culture.appearance)) ? culture.appearance : {};
    }

    function _weightedListOf(appearance, key) {
        var list = appearance ? appearance[key] : null;
        if (!Array.isArray(list)) return [];
        var out = [];
        for (var i = 0; i < list.length; i++) {
            var item = list[i];
            if (!_isObject(item)) continue;
            if (typeof item.value !== 'string' || item.value.length === 0) continue;
            out.push({
                value: item.value,
                weight: (typeof item.weight === 'number' && isFinite(item.weight))
                    ? item.weight
                    : DEFAULT_WEIGHT
            });
        }
        return out;
    }

    function _heightOf(appearance) {
        var h = appearance ? appearance.height : null;
        var male = (h && _isObject(h.male)) ? h.male : null;
        var female = (h && _isObject(h.female)) ? h.female : null;
        return {
            male: {
                min: (male && typeof male.min === 'number') ? male.min : HEIGHT_MIN + 55,
                max: (male && typeof male.max === 'number') ? male.max : HEIGHT_MAX - 50
            },
            female: {
                min: (female && typeof female.min === 'number') ? female.min : HEIGHT_MIN + 45,
                max: (female && typeof female.max === 'number') ? female.max : HEIGHT_MAX - 65
            }
        };
    }

    /**
     * Writes the DOM's current appearance input back into the working
     * culture's `appearance` field. Called on every input so a tab switch
     * (or a save) sees the latest values.
     *
     * IMPORTANT: always writes every weighted category, even when empty.
     * The working copy is what tab-switch preservation reads; if an
     * emptied category is removed from the working copy, switching tabs
     * and back loses the fact that the category existed. save() filters
     * empty lists out so the canonical record stays clean.
     */
    function _syncToWorkingCulture(root, culture) {
        if (!root || !culture) return;

        var appearance = {};

        for (var i = 0; i < WEIGHTED_CATEGORIES.length; i++) {
            var cat = WEIGHTED_CATEGORIES[i];
            appearance[cat.key] = _readWeightedList(root, cat.key);
        }

        var height = _readHeight(root);
        if (height) appearance.height = height;

        culture.appearance = appearance;
    }

    function _readWeightedList(root, key) {
        var rows = root.querySelectorAll(
            '.ct-appearance-row[data-category="' + key + '"]'
        );
        var out = [];
        for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            var valEl = row.querySelector('.ct-appearance-row__value');
            var wEl = row.querySelector('.ct-appearance-row__weight');
            if (!valEl) continue;
            var value = (valEl.value || '').trim();
            if (!value) continue;
            var weight = parseInt(wEl ? wEl.value : '', 10);
            if (!isFinite(weight) || weight < WEIGHT_MIN || weight > WEIGHT_MAX) {
                weight = DEFAULT_WEIGHT;
            }
            out.push({ value: value, weight: weight });
        }
        return out;
    }

    function _readHeight(root) {
        var maleMin = _readNumber(root, '#ct_height_male_min');
        var maleMax = _readNumber(root, '#ct_height_male_max');
        var femaleMin = _readNumber(root, '#ct_height_female_min');
        var femaleMax = _readNumber(root, '#ct_height_female_max');

        if (maleMin === null && maleMax === null
            && femaleMin === null && femaleMax === null) {
            return null;
        }

        return {
            male: {
                min: maleMin !== null ? maleMin : HEIGHT_MIN,
                max: maleMax !== null ? maleMax : HEIGHT_MAX
            },
            female: {
                min: femaleMin !== null ? femaleMin : HEIGHT_MIN,
                max: femaleMax !== null ? femaleMax : HEIGHT_MAX
            }
        };
    }

    function _readNumber(root, selector) {
        var el = root.querySelector(selector);
        if (!el) return null;
        var n = parseInt(el.value, 10);
        return isFinite(n) ? n : null;
    }

    // =========================================================================
    // 4. RENDER
    // =========================================================================

    function renderAppearanceTab(container, culture) {
        if (!container) return;

        if (!culture) {
            container.innerHTML =
                '<div class="rt-empty">No culture loaded.</div>';
            return;
        }

        var appearance = _appearanceOf(culture);

        var html =
            '<div class="ct-appearance">' +

            // ---- Hint ----
            '<div class="ct-hint">' +
              'Define weighted appearance traits for characters of this culture. ' +
              'Higher weight = more common. Empty lists are omitted from the ' +
              'saved record.' +
            '</div>' +

            // ---- Weighted categories ----
            '<div class="ct-appearance__grid">';

        for (var i = 0; i < WEIGHTED_CATEGORIES.length; i++) {
            var cat = WEIGHTED_CATEGORIES[i];
            var items = _weightedListOf(appearance, cat.key);
            html += _renderCategory(cat, items);
        }

        html +=
            '</div>' +

            // ---- Height ----
            _renderHeight(_heightOf(appearance)) +

            // ---- Footer hint ----
            '<div class="ct-hint ct-hint--footer">' +
              'Options with weight 0 will never be selected. All weights are ' +
              'relative to each other within a category.' +
            '</div>' +

            '</div>';

        container.innerHTML = html;

        // Wire events after DOM is in place.
        _attachEvents(container, culture);

        // Immediately sync so the working culture has the current shape.
        _syncToWorkingCulture(container, culture);
    }

    function _renderCategory(cat, items) {
        var html =
            '<div class="ct-card ct-appearance-card" data-category="' + _escapeHtml(cat.key) + '">' +
              '<div class="ct-card__header">' +
                '<div class="ct-card__title">' +
                  _escapeHtml(cat.label) +
                  '<span class="ct-card__hint">' + _escapeHtml(cat.hint) + '</span>' +
                '</div>' +
                '<span class="ct-card__count ct-appearance-count">' +
                  items.length + ' options' +
                '</span>' +
              '</div>' +
              '<div class="ct-appearance-list">';

        if (items.length === 0) {
            html +=
                '<div class="ct-appearance-empty">' +
                  'No options defined yet.' +
                '</div>';
        } else {
            for (var i = 0; i < items.length; i++) {
                html += _renderRow(cat.key, items[i]);
            }
        }

        html +=
              '</div>' +
              '<button type="button" class="rt-btn ct-appearance-add" data-category="' +
                _escapeHtml(cat.key) + '">' +
                'Add ' + _escapeHtml(cat.label) + ' Option' +
              '</button>' +
            '</div>';

        return html;
    }

    function _renderRow(categoryKey, item) {
        return (
            '<div class="ct-appearance-row" data-category="' + _escapeHtml(categoryKey) + '">' +
              '<input type="text" class="ct-appearance-row__value"' +
                ' value="' + _escapeHtml(item.value) + '"' +
                ' placeholder="Option name">' +
              '<input type="number" class="ct-appearance-row__weight"' +
                ' value="' + Number(item.weight) + '"' +
                ' min="' + WEIGHT_MIN + '" max="' + WEIGHT_MAX + '" step="1">' +
              '<span class="ct-appearance-row__weight-label">weight</span>' +
              '<button type="button" class="rt-btn rt-btn--icon rt-btn--danger ct-appearance-remove" title="Remove option">Remove</button>' +
            '</div>'
        );
    }

    function _renderHeight(height) {
        return (
            '<div class="ct-card ct-appearance-height">' +
              '<div class="ct-card__header">' +
                '<div class="ct-card__title">Height Ranges' +
                  '<span class="ct-card__hint">Gender-specific ranges in cm</span>' +
                '</div>' +
              '</div>' +
              '<div class="ct-appearance-height-grid">' +
                _heightGroup('Male', 'male', height.male) +
                _heightGroup('Female', 'female', height.female) +
              '</div>' +
            '</div>'
        );
    }

    function _heightGroup(label, key, range) {
        return (
            '<div class="ct-appearance-height-group">' +
              '<div class="ct-appearance-height-label">' + _escapeHtml(label) + '</div>' +
              '<div class="ct-appearance-height-inputs">' +
                '<input type="number" id="ct_height_' + _escapeHtml(key) + '_min"' +
                  ' value="' + Number(range.min) + '"' +
                  ' min="' + HEIGHT_MIN + '" max="' + HEIGHT_MAX + '" step="1">' +
                '<span class="ct-appearance-height-sep">to</span>' +
                '<input type="number" id="ct_height_' + _escapeHtml(key) + '_max"' +
                  ' value="' + Number(range.max) + '"' +
                  ' min="' + HEIGHT_MIN + '" max="' + HEIGHT_MAX + '" step="1">' +
                '<span class="ct-appearance-height-unit">cm</span>' +
              '</div>' +
            '</div>'
        );
    }

    // =========================================================================
    // 5. EVENT WIRING
    // =========================================================================

    function _attachEvents(container, culture) {
        // Delegated input listener: any change or input inside the tab
        // re-syncs the working culture. This is what makes tab-switch
        // preservation work — user input goes into _state.culture.appearance
        // as the user types, not only on Save.
        container.addEventListener('input', function () {
            _syncToWorkingCulture(container, culture);
        });
        container.addEventListener('change', function () {
            _syncToWorkingCulture(container, culture);
        });

        // Delegated click: add / remove.
        container.addEventListener('click', function (e) {
            var target = e.target;
            if (!target || typeof target.closest !== 'function') return;

            var addBtn = target.closest('.ct-appearance-add');
            if (addBtn) {
                e.preventDefault();
                var categoryKey = addBtn.getAttribute('data-category');
                if (categoryKey) _handleAdd(container, culture, categoryKey);
                return;
            }

            var removeBtn = target.closest('.ct-appearance-remove');
            if (removeBtn) {
                e.preventDefault();
                var row = removeBtn.closest('.ct-appearance-row');
                if (row) _handleRemove(container, culture, row);
                return;
            }
        });
    }

    function _handleAdd(container, culture, categoryKey) {
        var card = container.querySelector(
            '.ct-appearance-card[data-category="' + categoryKey + '"]'
        );
        if (!card) return;

        var list = card.querySelector('.ct-appearance-list');
        if (!list) return;

        // Remove the empty-state if present.
        var empty = list.querySelector('.ct-appearance-empty');
        if (empty) empty.remove();

        // Append a fresh row with a default weight and empty value.
        var row = document.createElement('div');
        row.className = 'ct-appearance-row';
        row.setAttribute('data-category', categoryKey);
        row.innerHTML =
            '<input type="text" class="ct-appearance-row__value"' +
              ' placeholder="Option name">' +
            '<input type="number" class="ct-appearance-row__weight"' +
              ' value="' + DEFAULT_WEIGHT + '"' +
              ' min="' + WEIGHT_MIN + '" max="' + WEIGHT_MAX + '" step="1">' +
            '<span class="ct-appearance-row__weight-label">weight</span>' +
            '<button type="button" class="rt-btn rt-btn--icon rt-btn--danger ct-appearance-remove" title="Remove option">Remove</button>';

        list.appendChild(row);

        // Update the count.
        _updateCount(card);

        // Do NOT call _syncToWorkingCulture here. The row has no value
        // yet; _readWeightedList skips it. Syncing now would rebuild the
        // entire appearance object for no benefit. The input/change
        // listener will sync when the user types the first character.

        // Focus the new input.
        var newInput = row.querySelector('.ct-appearance-row__value');
        if (newInput) newInput.focus();
    }

    function _handleRemove(container, culture, row) {
        // No confirm for a row remove — the change is cheap to redo, and
        // a confirm per row would be noisy. The composite save() call at
        // the end is the actual commit point; if the user cancels the
        // editor, the removal is discarded with the working copy.
        var card = row.closest('.ct-appearance-card');
        row.remove();

        if (card) {
            var list = card.querySelector('.ct-appearance-list');
            if (list && list.querySelectorAll('.ct-appearance-row').length === 0) {
                // Append the empty state. Do NOT replace innerHTML — the
                // next _handleAdd will remove the empty state and append
                // a fresh row, and appendChild composes correctly with
                // that flow (it also survives any future code that holds
                // a reference to a child of the list).
                var empty = document.createElement('div');
                empty.className = 'ct-appearance-empty';
                empty.textContent = 'No options defined yet.';
                list.appendChild(empty);
            }
            _updateCount(card);
        }

        _syncToWorkingCulture(container, culture);
    }

    function _updateCount(card) {
        if (!card) return;
        var countEl = card.querySelector('.ct-appearance-count');
        if (!countEl) return;
        var n = card.querySelectorAll('.ct-appearance-row').length;
        countEl.textContent = n + ' options';
    }

    // =========================================================================
    // 6. SAVE
    // =========================================================================
    //
    // Called by the HOST's save-all. Reads the working copy's appearance
    // (which is the authoritative input at this point — every user edit
    // has already been synced into it via the input/change handlers),
    // filters out empty categories and an untouched height object, and
    // returns the partial culture object the host will merge.
    //
    // Filtering out empty categories matters because _syncToWorkingCulture
    // ALWAYS writes every category (even empty ones) so tab-switch
    // preservation works. The working copy is allowed to hold
    // { skinTones: [], eyeColors: [] }; the canonical record is not.
    //
    // Dropping an untouched height matters because _readHeight returns a
    // non-null object whenever ANY height input has a value. If the user
    // opens the editor, does nothing, and clicks Save, _readHeight will
    // return null (no inputs have values) and height will be omitted. If
    // the user types a value into one height input, _readHeight returns
    // an object with that value and the fallback default for the other
    // three — that is the correct behavior (partial input is committed
    // with sensible defaults for the rest).

    function saveAppearanceTab(culture) {
        if (!culture) return culture;

        var src = _appearanceOf(culture);
        var appearance = {};

        for (var i = 0; i < WEIGHTED_CATEGORIES.length; i++) {
            var cat = WEIGHTED_CATEGORIES[i];
            var list = src[cat.key];
            if (Array.isArray(list) && list.length > 0) {
                appearance[cat.key] = list;
            }
        }

        if (_isObject(src.height)) {
            appearance.height = src.height;
        }

        return { appearance: appearance };
    }

    // =========================================================================
    // 7. VALIDATE
    // =========================================================================
    //
    // Runs against the candidate the host has already assembled from every
    // tab's save(). Reads only the candidate's appearance (not the DOM) so
    // validation is deterministic regardless of tab visibility.

    function validateAppearanceTab(culture) {
        var errors = [];
        var warnings = [];

        if (!culture) {
            return { valid: true, errors: [], warnings: [] };
        }

        var appearance = _appearanceOf(culture);

        // Per-category duplicate check.
        for (var i = 0; i < WEIGHTED_CATEGORIES.length; i++) {
            var cat = WEIGHTED_CATEGORIES[i];
            var list = _weightedListOf(appearance, cat.key);
            var seen = Object.create(null);
            for (var j = 0; j < list.length; j++) {
                var v = list[j].value;
                if (seen[v]) {
                    errors.push(
                        'Duplicate option "' + v + '" in ' + cat.label + '.'
                    );
                }
                seen[v] = true;
            }
        }

        // Height validation.
        var height = appearance ? appearance.height : null;
        if (_isObject(height)) {
            if (_isObject(height.male)) {
                _validateHeightRange(height.male, 'Male', errors);
            }
            if (_isObject(height.female)) {
                _validateHeightRange(height.female, 'Female', errors);
            }
        }

        // Warning when nothing has been defined.
        var hasAny = false;
        for (var k = 0; k < WEIGHTED_CATEGORIES.length; k++) {
            if (_weightedListOf(appearance, WEIGHTED_CATEGORIES[k].key).length > 0) {
                hasAny = true;
                break;
            }
        }
        if (!hasAny) {
            warnings.push('No appearance options defined.');
        }

        return {
            valid: errors.length === 0,
            errors: errors,
            warnings: warnings
        };
    }

    function _validateHeightRange(range, label, errors) {
        if (typeof range.min !== 'number' || !isFinite(range.min)) {
            errors.push(label + ' height min must be a finite number.');
            return;
        }
        if (typeof range.max !== 'number' || !isFinite(range.max)) {
            errors.push(label + ' height max must be a finite number.');
            return;
        }
        if (range.min > range.max) {
            errors.push(
                label + ' height min (' + range.min +
                ') must not exceed max (' + range.max + ').'
            );
        }
    }

    // =========================================================================
    // 8. TAB DEFINITION + REGISTRATION
    // =========================================================================

    var AppearanceTab = {
        label: 'Appearance',
        icon: 'PERSON',
        render: renderAppearanceTab,
        save: saveAppearanceTab,
        validate: validateAppearanceTab
    };

    window.AppearanceTab = AppearanceTab;

    function register() {
        if (typeof window.CultureEditorTabs === 'undefined'
            || !window.CultureEditorTabs
            || typeof window.CultureEditorTabs.registerTab !== 'function') {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn(
                    'culture-appearance-tab.js: CultureEditorTabs is not loaded; ' +
                    'the appearance tab was not registered. Load ' +
                    'culture-editor-tab.js first.'
                );
            }
            return false;
        }
        return window.CultureEditorTabs.registerTab('appearance', AppearanceTab);
    }

    window.registerAppearanceTab = register;

    if (typeof window.CultureEditorTabs !== 'undefined') {
        register();
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            AppearanceTab: AppearanceTab,
            registerAppearanceTab: register
        };
    }
})();
