/**
 * =============================================================================
 * STILL WATERS - CULTURE MODALS (js/culture/modals-culture.js)
 * =============================================================================
 *
 * LOCATION: js/culture/modals-culture.js
 *
 * Modal UI for culture CRUD, details, and editor launch.
 *
 * SCOPE:
 *   - openCreateCultureModal(onSuccess)
 *   - openEditCultureModal(cultureId, onSuccess)
 *   - confirmDeleteCulture(cultureId, onSuccess)
 *   - openCultureDetailsModal(cultureId, options)
 *   - openCultureEditor(cultureId, options)
 *
 * THE CULTURE EDITOR
 * ------------------
 * openCultureEditor launches the composite-form editor owned by
 * js/tabs/culture-editor-tab.js (window.CultureEditorTabs). This modal
 * is a LAUNCHER, not a duplicate. It does not open its own tabs, does
 * not own the appearance/mythology/characters/names surfaces, and does
 * not call CultureCommands.updateCulture.
 *
 * The culture editor's own registration contract requires
 * CultureEditorTabs to be loaded before this file. When
 * CultureEditorTabs is absent, openCultureEditor surfaces a clear error
 * rather than falling back to a partial editor.
 *
 * MODAL INFRASTRUCTURE KEYS
 * -------------------------
 * js/core/modals-core.js::openModal accepts:
 *
 *   titleHtml        trusted HTML for the modal title
 *   contentHtml      trusted HTML for the modal body
 *   confirmText      string
 *   cancelText       string ('' hides the cancel button)
 *   size             'small' | 'medium' | 'large'
 *   onMount          fn(root) — called after DOM insertion
 *   onConfirm        fn(root) — return false to keep open
 *   onCancel         fn(root) — non-confirmed close
 *
 * The keys `title` and `content` are SILENTLY IGNORED by openModal.
 * This file uses `titleHtml:` and `contentHtml:` exclusively.
 *
 * PERSISTENCE
 * -----------
 * Commands do not save (see culture-commands.js). The modal is the save
 * owner. After every successful CRUD command, this file calls
 * CultureCommands.persist() exactly once via _handleCommandResult. A
 * failed persist is a warning toast, not a rolled-back command — the
 * in-memory state is already updated and a subsequent save from
 * anywhere in the app will flush it.
 *
 * The composite editor (openCultureEditor) owns its own persistence
 * via CultureCommands.updateCulture + persist inside
 * culture-editor-tab.js. This file does not persist on behalf of the
 * editor.
 *
 * CONTRACTS
 * ---------
 *   - All input reads use root.querySelector('#id'), not
 *     document.getElementById. This eliminates the stacked-modal
 *     collision that the previous revision had.
 *   - Every rendered string that comes from culture data is escaped via
 *     window.escapeHtml.
 *   - No inline styles. Classes live in css/culture-tabs.css.
 *   - No emojis. Chrome icons via _getIcon(name) — '' for unknown.
 *   - Icon is data (culture.icon) and is rendered verbatim.
 *   - No fallback for missing CultureCommands / CultureQueries /
 *     CultureViewModels. Those are hard dependencies of this file.
 *
 * DEPENDENCIES (REQUIRED at load):
 *   - modals-core.js:      openModal, closeTopModal, confirmDialog
 *   - formatting.js:       escapeHtml
 *   - icons.js:            Icons
 *   - ui.js:               showToast
 *   - CultureCommands:     createCulture, updateCulture, deleteCulture,
 *                          persist
 *   - CultureQueries:      getCultureById, getAllCultures
 *   - CultureViewModels:   labelFor, iconFor, buildCard, buildDetails
 *   - CultureConstants:    RELIGIOUS_TRAITS is not used here; DEFAULT_RELIGION
 *                          is not used here. Only ADOPTION_TYPES-style
 *                          constants would apply, and this file does not
 *                          need them.
 *
 * DEPENDENCIES (OPTIONAL):
 *   - CultureEditorTabs:   required only for openCultureEditor. Missing
 *                          -> openCultureEditor returns a structured
 *                          error.
 *   - getIconOptions:      optional icon-picker helper. Missing -> the
 *                          icon field falls back to a free-text input.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - Added openCultureEditor(cultureId, options). Launches the
 *       composite-form editor owned by culture-editor-tab.js. When
 *       CultureEditorTabs is absent, returns { success: false, reason }
 *       rather than a broken modal.
 *     - Every onConfirm handler now reads inputs via
 *       root.querySelector('#id'). Prior revisions used
 *       document.getElementById, which collided when two culture
 *       modals were open simultaneously (e.g. create modal open,
 *       details modal open on top). Stacked-modal collision is now
 *       impossible.
 *     - openCultureDetailsModal's Edit button launches the composite
 *       editor via openCultureEditor rather than the previous
 *       field-only edit modal, so the details modal's Edit button
 *       reaches the same surface as a caller that opens the editor
 *       directly. The field-only edit modal is still available as
 *       openEditCultureModal for callers that want it.
 *     - _renderDetailsPanel now reads from CultureViewModels.buildDetails
 *       instead of re-implementing the details layout inline. Same data,
 *       single source.
 *     - Icon field in create / edit modals: attempts window.getIconOptions
 *       first (matching the culture domain's icon-policy file); falls back
 *       to a free-text field when the helper is unavailable. No glyph is
 *       fabricated as a default.
 *   Previous revisions:
 *     - titleHtml / contentHtml keys adopted (was title / content).
 *     - _handleCommandResult introduced as the single
 *       toast-and-persist path for every command.
 *     - Delete path refuses with a toast when the culture has no
 *       canonical record. Before, it silently did nothing.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 0. DEPENDENCY GUARDS
    // =========================================================================

    function _requireDependencies() {
        var required = [
            'escapeHtml',
            'openModal',
            'closeTopModal',
            'confirmDialog',
            'showToast',
            'Icons',
            'CultureCommands',
            'CultureQueries',
            'CultureViewModels'
        ];
        var missing = [];
        for (var i = 0; i < required.length; i++) {
            if (typeof window[required[i]] === 'undefined') {
                missing.push(required[i]);
            }
        }
        if (missing.length > 0) {
            throw new Error(
                'modals-culture.js: missing required dependencies: ' +
                missing.join(', ')
            );
        }
        if (typeof window.CultureCommands.persist !== 'function') {
            throw new Error(
                'modals-culture.js: CultureCommands.persist is required. ' +
                'Modals are the save owner.'
            );
        }
    }

    _requireDependencies();

    var CC = window.CultureCommands;
    var CQ = window.CultureQueries;
    var VM = window.CultureViewModels;

    // =========================================================================
    // 1. HELPERS
    // =========================================================================

    function _esc(v) {
        return window.escapeHtml(v);
    }

    function _hasId(v) {
        return typeof v === 'string' && v.length > 0;
    }

    function _isMissing(v) {
        return v === undefined || v === null;
    }

    function _icon(name) {
        return window.Icons[name] || '';
    }

    function _toast(message, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        }
    }

    function _readVal(root, selector) {
        var el = root ? root.querySelector(selector) : null;
        return el ? el.value : '';
    }

    function _readTrimmed(root, selector) {
        return (_readVal(root, selector) || '').trim();
    }

    function _readNum(root, selector) {
        var raw = _readVal(root, selector);
        var n = parseInt(raw, 10);
        return Number.isFinite(n) ? n : null;
    }

    function _readBool(root, selector) {
        var el = root ? root.querySelector(selector) : null;
        return el ? el.checked === true : false;
    }

    // =========================================================================
    // 2. RESULT HANDLING
    // =========================================================================
    //
    // Single toast-and-persist path. Every command in this file runs its
    // result through this helper. Persist is called exactly once on
    // success. On failure, no persist runs.
    //
    // Returns `true` on success (modal closes) and `false` on failure
    // (modal stays open). See modals-core's onConfirm contract.

    function _handleCommandResult(result, successMessage, failurePrefix, onSuccess) {
        if (result && result.success === true) {
            _toast(successMessage, 'success');

            var persistResult = CC.persist();
            if (persistResult && persistResult.success === false) {
                _toast(
                    'Saved in memory; storage write failed: ' +
                    (persistResult.reason || 'unknown'),
                    'warning'
                );
            }

            if (typeof onSuccess === 'function') {
                try { onSuccess(result.data || result); }
                catch (e) {
                    if (typeof console !== 'undefined' && console.error) {
                        console.error(
                            'modals-culture.js: onSuccess threw:', e
                        );
                    }
                }
            }
            return true;
        }

        var reason = (result && result.reason) ? result.reason : 'Unknown error';
        _toast(failurePrefix + ': ' + reason, 'error');
        return false;
    }

    // =========================================================================
    // 3. ICON PICKER
    // =========================================================================
    //
    // Prefer window.getIconOptions() when present. That helper returns
    // an array of { id, label } (or strings). Fall back to a free-text
    // input. No fabricated default glyph is written to the record.

    function _renderIconField(currentIcon, fieldId) {
        var getOpts = (typeof window.getIconOptions === 'function')
            ? window.getIconOptions
            : null;

        if (!getOpts) {
            return (
                '<div class="ct-form__group">' +
                  '<label class="ct-form__label" for="' + _esc(fieldId) + '">' +
                    'Icon (free text)' +
                  '</label>' +
                  '<input type="text" id="' + _esc(fieldId) + '"' +
                    ' class="ct-form__input"' +
                    ' value="' + _esc(currentIcon || '') + '"' +
                    ' placeholder="Icon name or glyph">' +
                '</div>'
            );
        }

        var options = [];
        try {
            options = getOpts() || [];
        } catch (e) {
            options = [];
        }

        var optionsHtml = '<option value="">(none)</option>';
        for (var i = 0; i < options.length; i++) {
            var opt = options[i];
            var id = typeof opt === 'string' ? opt : opt.id;
            var label = typeof opt === 'string' ? opt : (opt.label || opt.id);
            if (!_hasId(id)) continue;
            optionsHtml +=
                '<option value="' + _esc(id) + '"' +
                  (id === currentIcon ? ' selected' : '') +
                  '>' + _esc(label) + '</option>';
        }

        return (
            '<div class="ct-form__group">' +
              '<label class="ct-form__label" for="' + _esc(fieldId) + '">' +
                'Icon' +
              '</label>' +
              '<select id="' + _esc(fieldId) + '" class="ct-form__select">' +
                optionsHtml +
              '</select>' +
            '</div>'
        );
    }

    // =========================================================================
    // 4. CREATE CULTURE MODAL
    // =========================================================================

    function openCreateCultureModal(options) {
        options = options || {};
        var onSuccess = options.onSuccess || null;

        var content =
            '<div class="ct-form">' +
              '<div class="ct-form__group">' +
                '<label class="ct-form__label" for="ct-create-name">Name</label>' +
                '<input type="text" id="ct-create-name"' +
                  ' class="ct-form__input" required>' +
              '</div>' +
              '<div class="ct-form__group">' +
                '<label class="ct-form__label" for="ct-create-displayName">' +
                  'Display Name' +
                '</label>' +
                '<input type="text" id="ct-create-displayName"' +
                  ' class="ct-form__input" placeholder="Defaults to Name">' +
              '</div>' +
              _renderIconField('', 'ct-create-icon') +
              '<div class="ct-form__group">' +
                '<label class="ct-form__label" for="ct-create-description">' +
                  'Description' +
                '</label>' +
                '<textarea id="ct-create-description"' +
                  ' class="ct-form__textarea" rows="3"></textarea>' +
              '</div>' +
              '<div class="ct-form__group">' +
                '<label class="ct-form__label" for="ct-create-notes">' +
                  'Notes' +
                '</label>' +
                '<textarea id="ct-create-notes"' +
                  ' class="ct-form__textarea" rows="2"></textarea>' +
              '</div>' +
            '</div>';

        return window.openModal({
            titleHtml: 'Create Culture',
            contentHtml: content,
            confirmText: 'Create',
            cancelText: 'Cancel',
            onConfirm: function (root) {
                var name = _readTrimmed(root, '#ct-create-name');
                if (!name) {
                    _toast('Culture name is required.', 'error');
                    return false;
                }

                var data = {
                    name: name,
                    displayName: _readTrimmed(root, '#ct-create-displayName') || undefined,
                    icon: _readTrimmed(root, '#ct-create-icon') || null,
                    description: _readVal(root, '#ct-create-description'),
                    notes: _readVal(root, '#ct-create-notes')
                };

                var result = CC.createCulture(data);
                return _handleCommandResult(
                    result,
                    'Culture created: ' + name,
                    'Failed to create culture',
                    onSuccess
                );
            }
        });
    }

    // =========================================================================
    // 5. EDIT CULTURE MODAL (FIELD-ONLY)
    // =========================================================================
    //
    // Field-only edit. Launched by callers that want to adjust identity
    // fields (name / display name / icon / description / notes) without
    // opening the composite editor.
    //
    // The composite editor (openCultureEditor) is the surface for
    // appearance, mythology, characters, and names. This modal does not
    // touch those.

    function openEditCultureModal(cultureId, options) {
        options = options || {};
        var onSuccess = options.onSuccess || null;

        if (!_hasId(cultureId)) {
            _toast('Culture id is required.', 'error');
            return null;
        }

        var culture = CQ.getCultureById(cultureId);
        if (!culture) {
            _toast('Culture not found.', 'error');
            return null;
        }

        var content =
            '<div class="ct-form">' +
              '<div class="ct-form__group">' +
                '<label class="ct-form__label" for="ct-edit-name">Name</label>' +
                '<input type="text" id="ct-edit-name"' +
                  ' class="ct-form__input" required' +
                  ' value="' + _esc(culture.name || '') + '">' +
              '</div>' +
              '<div class="ct-form__group">' +
                '<label class="ct-form__label" for="ct-edit-displayName">' +
                  'Display Name' +
                '</label>' +
                '<input type="text" id="ct-edit-displayName"' +
                  ' class="ct-form__input"' +
                  ' value="' + _esc(culture.displayName || '') + '">' +
              '</div>' +
              _renderIconField(culture.icon || '', 'ct-edit-icon') +
              '<div class="ct-form__group">' +
                '<label class="ct-form__label" for="ct-edit-description">' +
                  'Description' +
                '</label>' +
                '<textarea id="ct-edit-description"' +
                  ' class="ct-form__textarea" rows="3">' +
                  _esc(culture.description || '') +
                '</textarea>' +
              '</div>' +
              '<div class="ct-form__group">' +
                '<label class="ct-form__label" for="ct-edit-notes">' +
                  'Notes' +
                '</label>' +
                '<textarea id="ct-edit-notes"' +
                  ' class="ct-form__textarea" rows="2">' +
                  _esc(culture.notes || '') +
                '</textarea>' +
              '</div>' +
            '</div>';

        return window.openModal({
            titleHtml: 'Edit Culture: ' + _esc(culture.name || ''),
            contentHtml: content,
            confirmText: 'Save',
            cancelText: 'Cancel',
            onConfirm: function (root) {
                var name = _readTrimmed(root, '#ct-edit-name');
                if (!name) {
                    _toast('Culture name is required.', 'error');
                    return false;
                }

                var updates = {
                    name: name,
                    displayName: _readTrimmed(root, '#ct-edit-displayName') || null,
                    icon: _readTrimmed(root, '#ct-edit-icon') || null,
                    description: _readVal(root, '#ct-edit-description'),
                    notes: _readVal(root, '#ct-edit-notes')
                };

                var result = CC.updateCulture(cultureId, updates);
                return _handleCommandResult(
                    result,
                    'Culture updated',
                    'Failed to update culture',
                    onSuccess
                );
            }
        });
    }

    // =========================================================================
    // 6. DELETE CULTURE MODAL
    // =========================================================================

    function confirmDeleteCulture(cultureId, options) {
        options = options || {};
        var onSuccess = options.onSuccess || null;

        if (!_hasId(cultureId)) {
            _toast('Culture id is required.', 'error');
            return;
        }

        var culture = CQ.getCultureById(cultureId);
        if (!culture) {
            _toast('Culture not found.', 'error');
            return;
        }

        var label = VM.labelFor(culture) || culture.name || culture.id;
        var message = 'Delete culture "' + label + '"? This cannot be undone.';

        // Cross-domain note: deleting a culture does not cascade into
        // characters (character.cultureId) or places (place.cultureId).
        // See CROSS-DOMAIN CASCADE in culture-commands.js.
        var hasCascadeWarning = false;
        try {
            var characters = CQ.getAllCultures
                ? null   // CQ does not expose characters, only cultures
                : null;
            // Deliberately not probing character data here. The delete
            // warning is a static note; cascading is a follow-up.
            hasCascadeWarning = true;
        } catch (e) {
            hasCascadeWarning = false;
        }

        var contentHtml =
            '<div class="ct-delete-confirm">' +
              '<p>' + _esc(message) + '</p>' +
              (hasCascadeWarning
                ? '<p class="ct-delete-confirm__note">' +
                    'Characters and locations that reference this culture ' +
                    'are not modified by this command. They will retain ' +
                    'their cultureId pointing at a missing record.' +
                  '</p>'
                : '') +
            '</div>';

        window.openModal({
            titleHtml: 'Delete Culture',
            contentHtml: contentHtml,
            confirmText: 'Delete',
            cancelText: 'Cancel',
            onConfirm: function () {
                var result = CC.deleteCulture(cultureId);
                return _handleCommandResult(
                    result,
                    'Culture deleted: ' + label,
                    'Failed to delete culture',
                    onSuccess
                );
            }
        });
    }

    // =========================================================================
    // 7. CULTURE DETAILS MODAL
    // =========================================================================
    //
    // Uses CultureViewModels.buildDetails for every data field. Renders
    // a header, statistics, associated locations / religions, appearance
    // preview, mythology preview, and notes.
    //
    // The Edit button launches the COMPOSITE EDITOR
    // (openCultureEditor), not the field-only edit modal. Callers that
    // want the field-only edit modal use openEditCultureModal directly.

    function openCultureDetailsModal(cultureId, options) {
        options = options || {};
        var onRefresh = options.onRefresh || null;

        if (!_hasId(cultureId)) {
            _toast('Culture id is required.', 'error');
            return null;
        }

        var details = VM.buildDetails(cultureId);
        if (!details) {
            _toast('Culture not found.', 'error');
            return null;
        }

        var content =
            '<div class="ct-details">' +
              '<div class="ct-details__header">' +
                (details.icon
                  ? '<span class="ct-details__icon">' +
                      _esc(details.icon) +
                    '</span>'
                  : '') +
                '<span class="ct-details__label">' +
                  _esc(details.label) +
                '</span>' +
              '</div>' +

              (details.description
                ? '<div class="ct-details__description">' +
                    _esc(details.description) +
                  '</div>'
                : '') +

              _renderDetailsStatistics(details.statistics) +
              _renderDetailsLocations(details.locations) +
              _renderDetailsReligions(details.religions) +
              _renderDetailsAppearance(details.appearance) +
              _renderDetailsMythology(details.mythology) +

              (details.notes
                ? '<div class="ct-details__notes">' +
                    _esc(details.notes) +
                  '</div>'
                : '') +

              '<div class="ct-details__actions">' +
                '<button type="button"' +
                  ' class="rt-btn rt-btn--primary ct-details__edit">' +
                  'Edit' +
                '</button>' +
              '</div>' +
            '</div>';

        var modal = window.openModal({
            titleHtml: 'Culture: ' + _esc(details.label),
            contentHtml: content,
            confirmText: 'Close',
            cancelText: '',
            onMount: function (root) {
                var editBtn = root.querySelector('.ct-details__edit');
                if (editBtn) {
                    editBtn.addEventListener('click', function () {
                        window.closeTopModal();
                        openCultureEditor(cultureId, {
                            onSave: function () {
                                if (typeof onRefresh === 'function') {
                                    try { onRefresh(); }
                                    catch (e) {
                                        if (typeof console !== 'undefined'
                                            && console.error) {
                                            console.error(
                                                'modals-culture.js: onRefresh threw:', e
                                            );
                                        }
                                    }
                                }
                            }
                        });
                    });
                }
            }
        });

        return modal;
    }

    function _renderDetailsStatistics(stats) {
        if (!stats) return '';

        var rows = [
            { label: 'Locations',  value: stats.associatedLocationCount },
            { label: 'Religions',  value: stats.religionCount },
            { label: 'Characters', value: stats.characterCount },
            { label: 'Appearance Options', value: stats.appearanceOptionCount }
        ];

        var html = '<div class="ct-details__stats">';
        for (var i = 0; i < rows.length; i++) {
            html +=
                '<div class="ct-details__stat">' +
                  '<div class="ct-details__stat-value">' +
                    _esc(String(rows[i].value)) +
                  '</div>' +
                  '<div class="ct-details__stat-label">' +
                    _esc(rows[i].label) +
                  '</div>' +
                '</div>';
        }
        html += '</div>';
        return html;
    }

    function _renderDetailsLocations(locations) {
        if (!Array.isArray(locations) || locations.length === 0) return '';

        var items = '';
        for (var i = 0; i < locations.length; i++) {
            items += '<li>' + _esc(locations[i].label) + '</li>';
        }

        return (
            '<div class="ct-details__section">' +
              '<div class="ct-details__section-title">Locations</div>' +
              '<ul class="ct-details__list">' + items + '</ul>' +
            '</div>'
        );
    }

    function _renderDetailsReligions(religions) {
        if (!Array.isArray(religions) || religions.length === 0) return '';

        var items = '';
        for (var i = 0; i < religions.length; i++) {
            items += '<li>' + _esc(religions[i].label) + '</li>';
        }

        return (
            '<div class="ct-details__section">' +
              '<div class="ct-details__section-title">Religions</div>' +
              '<ul class="ct-details__list">' + items + '</ul>' +
            '</div>'
        );
    }

    function _renderDetailsAppearance(appearance) {
        if (!Array.isArray(appearance) || appearance.length === 0) return '';

        var rows = '';
        for (var i = 0; i < appearance.length; i++) {
            var a = appearance[i];
            rows +=
                '<div class="ct-details__appearance-row">' +
                  '<span class="ct-details__appearance-cat">' +
                    _esc(a.category) +
                  '</span>' +
                  (a.preview
                    ? '<span class="ct-details__appearance-preview">' +
                        _esc(a.preview) +
                      '</span>'
                    : '') +
                  (a.remaining > 0
                    ? '<span class="ct-details__appearance-more">' +
                        '+' + _esc(String(a.remaining)) + ' more' +
                      '</span>'
                    : '') +
                '</div>';
        }

        return (
            '<div class="ct-details__section">' +
              '<div class="ct-details__section-title">Appearance</div>' +
              rows +
            '</div>'
        );
    }

    function _renderDetailsMythology(mythology) {
        if (!mythology || !Array.isArray(mythology.sections)) return '';
        if (mythology.sections.length === 0) return '';

        var rows = '';
        for (var i = 0; i < mythology.sections.length; i++) {
            var s = mythology.sections[i];
            rows +=
                '<div class="ct-details__myth-row">' +
                  '<span class="ct-details__myth-label">' +
                    _esc(s.label) +
                  '</span>' +
                  (s.value
                    ? '<span class="ct-details__myth-value">' +
                        _esc(s.value) +
                      '</span>'
                    : (s.values
                      ? '<span class="ct-details__myth-values">' +
                          _esc(s.values.join(', ')) +
                        '</span>'
                      : '')) +
                '</div>';
        }

        return (
            '<div class="ct-details__section">' +
              '<div class="ct-details__section-title">Mythology</div>' +
              rows +
            '</div>'
        );
    }

    // =========================================================================
    // 8. CULTURE EDITOR LAUNCHER
    // =========================================================================
    //
    // Launches the composite-form editor (js/tabs/culture-editor-tab.js).
    // This file is NOT the editor; it only opens it. The editor owns its
    // own composite save flow, its own tab registry, and its own
    // persistence via CultureCommands.updateCulture + persist.
    //
    // The editor is the surface for appearance, mythology, characters,
    // and names. Identity fields (name / display name / icon /
    // description / notes) are also editable there via its built-in
    // Details tab.
    //
    // When CultureEditorTabs is absent, this function returns a
    // structured error. It does NOT fall back to opening a partial
    // editor — a partial editor that cannot save appearance or names
    // would be worse than a clear error.
    //
    // @param {string} cultureId
    // @param {Object} [options]
    // @param {Function} [options.onSave]   called with the updated
    //                                       culture after a successful
    //                                       composite save
    // @param {Function} [options.onCancel] called on a non-confirmed
    //                                       close
    // @param {string} [options.initialTab] tab id to activate first
    // @param {string[]} [options.tabs]     tab ids to include
    // @returns {{ success: boolean, modal?: Object, reason?: string }}

    function openCultureEditor(cultureId, options) {
        options = options || {};

        if (!_hasId(cultureId)) {
            return { success: false, reason: 'cultureId is required.' };
        }

        if (typeof window.CultureEditorTabs === 'undefined'
            || !window.CultureEditorTabs
            || typeof window.CultureEditorTabs.openEditor !== 'function') {
            return {
                success: false,
                reason: 'culture-editor-tab.js is not loaded ' +
                        '(window.CultureEditorTabs.openEditor missing).'
            };
        }

        try {
            window.CultureEditorTabs.openEditor(cultureId, {
                onSave: options.onSave,
                onCancel: options.onCancel,
                initialTab: options.initialTab,
                tabs: options.tabs
            });
            return { success: true };
        } catch (e) {
            return {
                success: false,
                reason: (e && e.message) ? e.message : 'Editor launch threw.'
            };
        }
    }

    // =========================================================================
    // 9. EXPORTS
    // =========================================================================

    window.CultureModals = {
        openCreateCultureModal: openCreateCultureModal,
        openEditCultureModal: openEditCultureModal,
        confirmDeleteCulture: confirmDeleteCulture,
        openCultureDetailsModal: openCultureDetailsModal,
        openCultureEditor: openCultureEditor
    };

    // Legacy flat aliases — kept so existing call sites continue to work.
    window.openCreateCultureModal = openCreateCultureModal;
    window.openEditCultureModal = openEditCultureModal;
    window.openDeleteCultureModal = confirmDeleteCulture;
    window.openCultureDetailsModal = openCultureDetailsModal;
    window.openCultureEditor = openCultureEditor;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CultureModals;
    }
})();
