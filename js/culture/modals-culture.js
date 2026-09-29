/**
 * =============================================================================
 * STILL WATERS - CULTURE MODALS
 * js/culture/culture-modals.js
 * =============================================================================
 *
 * Modal UI for culture management.
 *
 * Four entry points, one file:
 *
 *     openCreateCultureModal(onSuccess)
 *     openEditCultureModal(cultureId, onSuccess)
 *     confirmDeleteCulture(cultureId, onSuccess)
 *     openCultureDetailsModal(cultureId)
 *
 * Every one of these follows the same shape:
 *
 *     obtain data (Queries / ViewModels)
 *         ↓
 *     render form or view
 *         ↓
 *     collect user input
 *         ↓
 *     call a Command
 *         ↓
 *     react to the command result (toast + onSuccess + close)
 *
 * The modal layer does NOT:
 *   - validate domain rules              (CultureValidation)
 *   - apply domain defaults              (CultureCommands + Constants)
 *   - resolve locations or religions     (CultureViewModels)
 *   - decide fallback labels or icons    (CultureViewModels)
 *   - read canonical data                (CultureQueries)
 *   - inspect appearance or mythology    (CultureViewModels)
 *   - mutate anything                    (CultureCommands)
 *   - detect recursion                   (nothing here recurses)
 *
 * It DOES:
 *   - build forms
 *   - read DOM inputs
 *   - call commands
 *   - show toasts
 *   - call onSuccess
 *
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCIES
    // =========================================================================

    function _requireModals() {
        if (typeof window.openModal !== 'function') {
            throw new Error('CultureModals requires openModal.');
        }
        if (typeof window.closeTopModal !== 'function') {
            throw new Error('CultureModals requires closeTopModal.');
        }
        return {
            open: window.openModal,
            close: window.closeTopModal
        };
    }

    function _requireEscapeHtml() {
        if (typeof window.escapeHtml === 'function') return window.escapeHtml;
        if (typeof window._escapeHtml === 'function') return window._escapeHtml;
        throw new Error('CultureModals requires escapeHtml.');
    }

    function _requireToast() {
        if (typeof window.showToast === 'function') return window.showToast;
        if (typeof window._showToast === 'function') return window._showToast;
        throw new Error('CultureModals requires showToast.');
    }

    function _requireCommands() {
        if (!window.CultureCommands) {
            throw new Error('CultureModals requires CultureCommands.');
        }
        return window.CultureCommands;
    }

    function _requireQueries() {
        if (!window.CultureQueries) {
            throw new Error('CultureModals requires CultureQueries.');
        }
        return window.CultureQueries;
    }

    function _requireViewModels() {
        if (!window.CultureViewModels) {
            throw new Error('CultureModals requires CultureViewModels.');
        }
        return window.CultureViewModels;
    }

    function _requirePlaceQueries() {
        if (!window.PlaceQueries) {
            throw new Error('CultureModals requires PlaceQueries.');
        }
        return window.PlaceQueries;
    }

    function _requireReligionQueries() {
        if (!window.ReligionQueries) {
            throw new Error('CultureModals requires ReligionQueries.');
        }
        return window.ReligionQueries;
    }

    function _requireIconOptions() {
        // The icon list is provided by the shared icon infrastructure.
        // If it is not available, the form simply offers a free-text
        // icon field. This is a UI capability decision, not a domain
        // default — no placeholder icon is invented.
        if (typeof window.getIconOptions === 'function') {
            return window.getIconOptions();
        }
        return null;
    }

    // =========================================================================
    // 2. FORM HELPERS
    // =========================================================================

    function _formGroup(label, inputHtml, hintHtml) {
        var escapeHtml = _requireEscapeHtml();
        return (
            '<div class="form-group">' +
                '<label class="form-group__label">' + escapeHtml(label) + '</label>' +
                inputHtml +
                (hintHtml
                    ? '<div class="form-group__hint">' + hintHtml + '</div>'
                    : '') +
            '</div>'
        );
    }

    function _textInput(id, value, placeholder) {
        var escapeHtml = _requireEscapeHtml();
        return (
            '<input type="text" id="' + escapeHtml(id) + '"' +
            ' class="form-input"' +
            ' value="' + escapeHtml(value || '') + '"' +
            ' placeholder="' + escapeHtml(placeholder || '') + '">'
        );
    }

    function _textarea(id, value, rows) {
        var escapeHtml = _requireEscapeHtml();
        return (
            '<textarea id="' + escapeHtml(id) + '"' +
            ' class="form-input form-input--textarea"' +
            ' rows="' + (rows || 3) + '">' +
            escapeHtml(value || '') +
            '</textarea>'
        );
    }

    function _iconSelect(id, currentValue) {
        var escapeHtml = _requireEscapeHtml();
        var options = _requireIconOptions();

        if (!options) {
            // Fallback: a free-text field. Do NOT default to a glyph.
            return _textInput(id, currentValue || '', 'Icon name');
        }

        var parts = ['<select id="' + escapeHtml(id) + '" class="form-input">'];
        parts.push('<option value="">(none)</option>');

        for (var i = 0; i < options.length; i++) {
            var opt = options[i];
            var value = typeof opt === 'string' ? opt : opt.value;
            var label = typeof opt === 'string' ? opt : (opt.label || opt.value);
            parts.push(
                '<option value="' + escapeHtml(value) + '"' +
                (value === currentValue ? ' selected' : '') +
                '>' + escapeHtml(label) + '</option>'
            );
        }

        parts.push('</select>');
        return parts.join('');
    }

    function _multiSelect(id, items, selectedIds, emptyLabel) {
        var escapeHtml = _requireEscapeHtml();
        var selected = {};
        if (Array.isArray(selectedIds)) {
            for (var i = 0; i < selectedIds.length; i++) {
                selected[selectedIds[i]] = true;
            }
        }

        var parts = [
            '<select id="' + escapeHtml(id) + '" class="form-input form-input--multi" multiple>'
        ];

        if (!items || items.length === 0) {
            parts.push('<option disabled>' + escapeHtml(emptyLabel || 'None available') + '</option>');
        } else {
            for (var j = 0; j < items.length; j++) {
                var item = items[j];
                parts.push(
                    '<option value="' + escapeHtml(item.id) + '"' +
                    (selected[item.id] ? ' selected' : '') +
                    '>' + escapeHtml(item.label) + '</option>'
                );
            }
        }

        parts.push('</select>');
        return parts.join('');
    }

    function _readText(id) {
        var el = document.getElementById(id);
        return el ? el.value.trim() : '';
    }

    function _readRawText(id) {
        var el = document.getElementById(id);
        return el ? el.value : '';
    }

    function _readMultiSelect(id) {
        var el = document.getElementById(id);
        if (!el) return [];
        var out = [];
        for (var i = 0; i < el.options.length; i++) {
            if (el.options[i].selected && el.options[i].value) {
                out.push(el.options[i].value);
            }
        }
        return out;
    }

    // =========================================================================
    // 3. LOCATION / RELIGION OPTIONS
    // =========================================================================
    //
    // These are options for the association multi-selects. They are NOT
    // resolution of culture.locations — that already happened in the view
    // model. Here we just need the full pool of things the user can pick.
    //

    function _placeOptions() {
        var placeQueries = _requirePlaceQueries();
        var places = placeQueries.getAllPlaces();
        var out = [];
        for (var i = 0; i < places.length; i++) {
            out.push({
                id: places[i].id,
                label: places[i].displayName || places[i].name || places[i].id
            });
        }
        out.sort(function(a, b) { return a.label.localeCompare(b.label); });
        return out;
    }

    function _religionOptions() {
        var religionQueries = _requireReligionQueries();
        var religions = religionQueries.getAllReligions();
        var out = [];
        for (var i = 0; i < religions.length; i++) {
            out.push({
                id: religions[i].id,
                label: religions[i].displayName || religions[i].name || religions[i].id
            });
        }
        out.sort(function(a, b) { return a.label.localeCompare(b.label); });
        return out;
    }

    // =========================================================================
    // 4. RESULT HANDLING
    // =========================================================================

    function _handleCommandResult(result, successMessage, failurePrefix, onSuccess) {
        var toast = _requireToast();
        var modals = _requireModals();

        if (result && result.success) {
            toast(successMessage, 'success');
            modals.close();
            if (typeof onSuccess === 'function') onSuccess(result.data);
            return true;
        }

        var reason = (result && result.reason) ? result.reason : 'Unknown error';
        toast(failurePrefix + ': ' + reason, 'error');
        return false;
    }

    // =========================================================================
    // 5. CREATE
    // =========================================================================

    function openCreateCultureModal(onSuccess) {
        var modals = _requireModals();
        var commands = _requireCommands();

        var content = [
            '<div class="modal-form">',

            _formGroup('Name *',
                _textInput('cultureName', '', 'e.g. Nordic, Mediterranean')),

            _formGroup('Display Name',
                _textInput('cultureDisplayName', '', 'Optional — defaults to name')),

            _formGroup('Icon',
                _iconSelect('cultureIcon', '')),

            _formGroup('Description',
                _textarea('cultureDescription', '', 3)),

            _formGroup('Notes',
                _textarea('cultureNotes', '', 2)),

            '</div>'
        ].join('');

        modals.open({
            title: 'Create Culture',
            content: content,
            confirmText: 'Create',
            cancelText: 'Cancel',
            onConfirm: function() {
                var name = _readText('cultureName');
                if (!name) {
                    _requireToast()('Name is required', 'error');
                    return false;
                }

                var displayName = _readText('cultureDisplayName');
                var icon = _readText('cultureIcon');
                var description = _readRawText('cultureDescription');
                var notes = _readRawText('cultureNotes');

                var result = commands.createCulture({
                    name: name,
                    displayName: displayName || undefined,
                    icon: icon || null,
                    description: description,
                    notes: notes
                });

                return _handleCommandResult(
                    result,
                    'Created culture: ' + name,
                    'Create failed',
                    onSuccess
                );
            }
        });
    }

    // =========================================================================
    // 6. EDIT
    // =========================================================================

    function openEditCultureModal(cultureId, onSuccess) {
        var modals = _requireModals();
        var commands = _requireCommands();
        var queries = _requireQueries();

        var culture = queries.getCultureById(cultureId);
        if (!culture) {
            _requireToast()('Culture not found', 'error');
            return;
        }

        // Association pools for the multi-selects.
        var placeOptions = _placeOptions();
        var religionOptions = _religionOptions();

        var content = [
            '<div class="modal-form">',

            _formGroup('Name *',
                _textInput('editCultureName', culture.name, '')),

            _formGroup('Display Name',
                _textInput('editCultureDisplayName', culture.displayName || '', '')),

            _formGroup('Icon',
                _iconSelect('editCultureIcon', culture.icon || '')),

            _formGroup('Description',
                _textarea('editCultureDescription', culture.description || '', 3)),

            _formGroup('Associated Locations',
                _multiSelect(
                    'editCultureLocations',
                    placeOptions,
                    culture.locations,
                    'No locations available'
                ),
                'Hold Ctrl/Cmd to select multiple'),

            _formGroup('Associated Religions',
                _multiSelect(
                    'editCultureReligions',
                    religionOptions,
                    culture.religions,
                    'No religions available'
                ),
                'Hold Ctrl/Cmd to select multiple'),

            _formGroup('Notes',
                _textarea('editCultureNotes', culture.notes || '', 2)),

            '</div>'
        ].join('');

        modals.open({
            title: 'Edit Culture: ' + (culture.displayName || culture.name),
            content: content,
            confirmText: 'Save',
            cancelText: 'Cancel',
            onConfirm: function() {
                var name = _readText('editCultureName');
                if (!name) {
                    _requireToast()('Name is required', 'error');
                    return false;
                }

                var displayName = _readText('editCultureDisplayName');
                var icon = _readText('editCultureIcon');
                var description = _readRawText('editCultureDescription');
                var notes = _readRawText('editCultureNotes');
                var locations = _readMultiSelect('editCultureLocations');
                var religions = _readMultiSelect('editCultureReligions');

                var result = commands.updateCulture(cultureId, {
                    name: name,
                    displayName: displayName || null,
                    icon: icon || null,
                    description: description,
                    locations: locations,
                    religions: religions,
                    notes: notes
                });

                return _handleCommandResult(
                    result,
                    'Culture updated',
                    'Update failed',
                    onSuccess
                );
            }
        });
    }

    // =========================================================================
    // 7. DELETE
    // =========================================================================

    function confirmDeleteCulture(cultureId, onSuccess) {
        var commands = _requireCommands();
        var queries = _requireQueries();
        var toast = _requireToast();

        var culture = queries.getCultureById(cultureId);
        if (!culture) {
            toast('Culture not found', 'error');
            return;
        }

        var label = culture.displayName || culture.name;

        if (typeof window.confirmDialog !== 'function') {
            // No confirmation infrastructure available. Refuse rather than
            // fall back to a browser confirm(), which would leak an
            // uncontrolled UI pattern into the domain.
            throw new Error(
                'CultureModals.confirmDeleteCulture requires confirmDialog.'
            );
        }

        window.confirmDialog(
            'Delete "' + label + '" permanently?',
            'Delete Culture',
            function() {
                var result = commands.deleteCulture(cultureId);
                if (result && result.success) {
                    toast('Deleted: ' + label, 'info');
                    if (typeof onSuccess === 'function') onSuccess(result.data);
                } else {
                    var reason = (result && result.reason) ? result.reason : 'Unknown error';
                    toast('Delete failed: ' + reason, 'error');
                }
            }
        );
    }

    // =========================================================================
    // 8. DETAILS
    // =========================================================================

    function openCultureDetailsModal(cultureId) {
        var modals = _requireModals();
        var viewModels = _requireViewModels();
        var escapeHtml = _requireEscapeHtml();

        var vm = viewModels.buildDetails(cultureId);
        if (!vm) {
            _requireToast()('Culture not found', 'error');
            return;
        }

        var parts = ['<div class="culture-details">'];

        // Header
        parts.push('<div class="culture-details__header">');
        if (vm.icon) {
            parts.push('<span class="culture-details__icon">' + escapeHtml(vm.icon) + '</span>');
        }
        parts.push('<span class="culture-details__label">' + escapeHtml(vm.label) + '</span>');
        parts.push('</div>');

        if (vm.description) {
            parts.push('<div class="culture-details__desc">' + escapeHtml(vm.description) + '</div>');
        }

        // Statistics
        parts.push('<div class="culture-details__stats">');
        parts.push(_stat('Locations', vm.statistics.associatedLocationCount));
        parts.push(_stat('Religions', vm.statistics.religionCount));
        parts.push(_stat('Characters', vm.statistics.characterCount));
        parts.push(_stat('Appearance options', vm.statistics.appearanceOptionCount));
        parts.push('</div>');

        // Locations
        if (vm.locations.length > 0) {
            parts.push('<div class="culture-details__section">');
            parts.push('<div class="culture-details__section-title">Locations</div>');
            parts.push('<ul class="culture-details__list">');
            for (var i = 0; i < vm.locations.length; i++) {
                parts.push('<li>' + escapeHtml(vm.locations[i].label) + '</li>');
            }
            parts.push('</ul>');
            parts.push('</div>');
        }

        // Religions
        if (vm.religions.length > 0) {
            parts.push('<div class="culture-details__section">');
            parts.push('<div class="culture-details__section-title">Religions</div>');
            parts.push('<ul class="culture-details__list">');
            for (var j = 0; j < vm.religions.length; j++) {
                parts.push('<li>' + escapeHtml(vm.religions[j].label) + '</li>');
            }
            parts.push('</ul>');
            parts.push('</div>');
        }

        // Appearance
        if (vm.appearance.length > 0) {
            parts.push('<div class="culture-details__section">');
            parts.push('<div class="culture-details__section-title">Appearance</div>');
            for (var k = 0; k < vm.appearance.length; k++) {
                var a = vm.appearance[k];
                parts.push('<div class="culture-details__appearance-row">');
                parts.push('<span class="culture-details__appearance-cat">' + escapeHtml(a.category) + '</span>');
                if (a.preview) {
                    parts.push('<span class="culture-details__appearance-preview">' + escapeHtml(a.preview) + '</span>');
                }
                if (a.remaining > 0) {
                    parts.push('<span class="culture-details__appearance-more">+' + a.remaining + ' more</span>');
                }
                parts.push('</div>');
            }
            parts.push('</div>');
        }

        // Mythology
        if (vm.mythology) {
            parts.push('<div class="culture-details__section">');
            parts.push('<div class="culture-details__section-title">Mythology</div>');
            for (var m = 0; m < vm.mythology.sections.length; m++) {
                var section = vm.mythology.sections[m];
                parts.push('<div class="culture-details__myth-row">');
                parts.push('<span class="culture-details__myth-label">' + escapeHtml(section.label) + '</span>');
                if (section.value) {
                    parts.push('<span class="culture-details__myth-value">' + escapeHtml(section.value) + '</span>');
                } else if (section.values) {
                    parts.push('<span class="culture-details__myth-values">' + escapeHtml(section.values.join(', ')) + '</span>');
                }
                parts.push('</div>');
            }
            parts.push('</div>');
        }

        if (vm.notes) {
            parts.push('<div class="culture-details__notes">' + escapeHtml(vm.notes) + '</div>');
        }

        parts.push('</div>');

        modals.open({
            title: 'Culture: ' + vm.label,
            content: parts.join(''),
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function() { /* nothing */ }
        });
    }

    function _stat(label, value) {
        var escapeHtml = _requireEscapeHtml();
        return (
            '<div class="culture-details__stat">' +
                '<span class="culture-details__stat-label">' + escapeHtml(label) + '</span>' +
                '<span class="culture-details__stat-value">' + escapeHtml(String(value)) + '</span>' +
            '</div>'
        );
    }

    // =========================================================================
    // 9. PUBLIC API
    // =========================================================================

    window.CultureModals = {
        openCreateCultureModal: openCreateCultureModal,
        openEditCultureModal: openEditCultureModal,
        confirmDeleteCulture: confirmDeleteCulture,
        openCultureDetailsModal: openCultureDetailsModal
    };

    // Legacy compatibility aliases. Keep for one release, then remove
    // once all consumers point at window.CultureModals.
    window.openCreateCultureModal = openCreateCultureModal;
    window.openEditCultureModal = openEditCultureModal;
    window.openDeleteCultureModal = confirmDeleteCulture;
    window.openCultureDetailsModal = openCultureDetailsModal;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CultureModals;
    }

})();
