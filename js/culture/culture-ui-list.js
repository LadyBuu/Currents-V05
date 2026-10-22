/**
 * =============================================================================
 * STILL WATERS - CULTURE UI LIST
 * js/culture/culture-ui-list.js
 * =============================================================================
 *
 * DOM rendering for culture lists, cards, and dropdown controls.
 *
 * This module is deliberately stupid.
 *
 * It receives view models from CultureViewModels, escapes strings, and
 * writes HTML. It does not:
 *   - read CultureState
 *   - read masterData
 *   - call CultureQueries for individual field resolution
 *   - resolve locations or religions (view models do)
 *   - inspect appearance or mythology structure (view models do)
 *   - decide fallback labels or icons (view models do)
 *   - attach per-row listeners (one delegated listener per container)
 *   - do hover styling in JavaScript (CSS does)
 *   - use inline styles
 *
 * ICON POLICY
 * -----------
 * Any chrome icon (chevrons, expand indicators, close markers, etc.) must
 * route through window._getIcon(name). This file currently renders no
 * chrome icons — the list uses text tags and relationship labels only. If
 * that changes, use _getIcon. Do not paste glyphs or emoji into this file.
 *
 * Culture-record icons (culture.icon) are data, not chrome. They arrive
 * already resolved via the view model's `icon` field and are rendered
 * verbatim. _getIcon is not involved for those.
 *
 * EVENT DELEGATION
 * ----------------
 * One click listener per container, attached once. The listener reads the
 * current `onSelect` from a per-container property so re-rendering with a
 * different callback takes effect without re-binding.
 *
 * Row activation is click-only. tabindex="0" is present so keyboard focus
 * is possible (and screen readers announce the row), but there is no
 * keydown handler. If keyboard activation (Enter/Space) is wanted, that
 * is a separate addition and must be coordinated with the design.
 *
 * DEPENDENCIES
 * ------------
 *   - CultureViewModels   (required — projections)
 *   - CultureQueries      (required — the initial culture list and
 *                          the click-handler's getCultureById)
 *   - escapeHtml          (required — shared UI utility)
 *
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCIES
    // =========================================================================

    function _requireViewModels() {
        if (!window.CultureViewModels) {
            throw new Error('CultureUI requires CultureViewModels.');
        }
        return window.CultureViewModels;
    }

    function _requireQueries() {
        if (!window.CultureQueries) {
            throw new Error('CultureUI requires CultureQueries.');
        }
        return window.CultureQueries;
    }

    function _requireEscapeHtml() {
        if (typeof window.escapeHtml === 'function') return window.escapeHtml;
        if (typeof window._escapeHtml === 'function') return window._escapeHtml;
        throw new Error(
            'CultureUI requires escapeHtml. ' +
            'Renderers do not implement their own escaping.'
        );
    }

    function _resolveContainer(containerId) {
        if (typeof containerId === 'string') {
            var el = document.getElementById(containerId);
            if (!el) throw new Error('CultureUI: container not found: ' + containerId);
            return el;
        }
        if (containerId && containerId.nodeType === 1) return containerId;
        throw new Error('CultureUI: invalid container');
    }

    // =========================================================================
    // 2. LIST
    // =========================================================================

    /**
     * Renders a list of cultures into a container.
     *
     * @param {string|Element} containerId
     * @param {Object} [options]
     * @param {string} [options.selectedId]       highlight a specific culture
     * @param {Function} [options.onSelect]       called with the full culture object
     * @param {string} [options.emptyMessage]     shown when the list is empty
     * @param {boolean} [options.showLocations]   default true
     * @param {boolean} [options.showReligions]   default true
     * @param {boolean} [options.showMythology]   default true
     * @param {Array} [options.cultures]          pre-supplied list; otherwise all cultures
     */
    function renderCultureList(containerId, options) {
        options = options || {};
        var container = _resolveContainer(containerId);
        var viewModels = _requireViewModels();
        var queries = _requireQueries();
        var escapeHtml = _requireEscapeHtml();

        var cultures = Array.isArray(options.cultures)
            ? options.cultures
            : queries.getAllCultures();

        var emptyMessage = typeof options.emptyMessage === 'string'
            ? options.emptyMessage
            : 'No cultures found';

        if (!cultures || cultures.length === 0) {
            container.innerHTML =
                '<div class="culture-list culture-list--empty">' +
                escapeHtml(emptyMessage) +
                '</div>';
            return;
        }

        var rows = viewModels.buildListRows(cultures, {
            selected: options.selectedId || null,
            showLocations: options.showLocations,
            showReligions: options.showReligions,
            showMythology: options.showMythology
        });

        var html = ['<div class="culture-list" role="list">'];
        for (var i = 0; i < rows.length; i++) {
            // buildListRows already filters nulls; this is defensive against
            // a future contract drift where a row could be null.
            if (!rows[i]) continue;
            html.push(_renderRow(rows[i], escapeHtml));
        }
        html.push('</div>');
        container.innerHTML = html.join('');

        // Update the callback for the delegated listener. One listener per
        // container, always pointing at the most recent onSelect.
        container.__cultureOnSelect =
            typeof options.onSelect === 'function' ? options.onSelect : null;

        // Attach the delegated listener once.
        if (!container.__cultureListBound) {
            container.__cultureListBound = true;
            container.addEventListener('click', function(e) {
                var target = e.target;
                if (!target || typeof target.closest !== 'function') return;
                var row = target.closest('[data-culture-id]');
                if (!row || !container.contains(row)) return;
                var id = row.getAttribute('data-culture-id');
                if (!id) return;
                var cb = container.__cultureOnSelect;
                if (typeof cb !== 'function') return;
                var culture = queries.getCultureById(id);
                if (culture) cb(culture);
            });
        }
    }

    function _renderRow(row, escapeHtml) {
        var classes = ['culture-row'];
        if (row.selected) classes.push('is-selected');

        var parts = [
            '<div class="' + classes.join(' ') + '"',
            ' role="listitem"',
            ' data-culture-id="' + escapeHtml(row.id) + '"',
            ' tabindex="0"',
            '>'
        ];

        parts.push('<div class="culture-row__main">');

        parts.push('<div class="culture-row__title">');
        if (row.icon) {
            // Culture-record icon. View-model decision; rendered verbatim.
            // Do not route this through _getIcon.
            parts.push('<span class="culture-row__icon">');
            parts.push(escapeHtml(row.icon));
            parts.push('</span>');
        }
        parts.push('<span class="culture-row__label">');
        parts.push(escapeHtml(row.label));
        parts.push('</span>');
        parts.push('</div>');

        if (row.description) {
            parts.push('<div class="culture-row__desc">');
            parts.push(escapeHtml(row.description));
            parts.push('</div>');
        }

        parts.push('</div>');

        // Metadata line: locations, religions, mythology indicator.
        // Composed here from view-model fields. The view model provides
        // labels; the renderer provides typography.
        var metaParts = [];

        if (row.locations && row.locations.length > 0) {
            metaParts.push(_renderRelationGroup(
                'culture-row__locations',
                row.locations,
                escapeHtml
            ));
        }
        if (row.religions && row.religions.length > 0) {
            metaParts.push(_renderRelationGroup(
                'culture-row__religions',
                row.religions,
                escapeHtml
            ));
        }
        if (row.hasMythology) {
            metaParts.push(
                '<span class="culture-row__tag">Mythology</span>'
            );
        }

        if (metaParts.length > 0) {
            parts.push('<div class="culture-row__meta">');
            parts.push(metaParts.join('<span class="culture-row__sep">·</span>'));
            parts.push('</div>');
        }

        if (row.associatedLocationCount > 0) {
            parts.push('<div class="culture-row__badge">');
            parts.push(escapeHtml(String(row.associatedLocationCount)));
            parts.push('</div>');
        }

        parts.push('</div>');
        return parts.join('');
    }

    function _renderRelationGroup(className, items, escapeHtml) {
        var labels = [];
        var max = Math.min(items.length, 3);
        for (var i = 0; i < max; i++) {
            labels.push(escapeHtml(items[i].label));
        }
        if (items.length > max) {
            labels.push('+' + (items.length - max));
        }
        return '<span class="' + className + '">' + labels.join(', ') + '</span>';
    }

    // =========================================================================
    // 3. CARD
    // =========================================================================

    /**
     * Renders a culture card into a container.
     *
     * @param {string|Element} containerId
     * @param {string|Object} cultureOrId
     */
    function renderCultureCard(containerId, cultureOrId) {
        var container = _resolveContainer(containerId);
        var viewModels = _requireViewModels();
        var queries = _requireQueries();
        var escapeHtml = _requireEscapeHtml();

        var culture = typeof cultureOrId === 'string'
            ? queries.getCultureById(cultureOrId)
            : cultureOrId;

        if (!culture) {
            container.innerHTML =
                '<div class="culture-card culture-card--empty">Culture not found</div>';
            return;
        }

        var vm = viewModels.buildCard(culture);

        var parts = ['<div class="culture-card">'];

        parts.push('<div class="culture-card__header">');
        if (vm.icon) {
            parts.push('<span class="culture-card__icon">' + escapeHtml(vm.icon) + '</span>');
        }
        parts.push('<span class="culture-card__label">' + escapeHtml(vm.label) + '</span>');
        parts.push('<span class="culture-card__stats">');
        parts.push(escapeHtml(String(vm.associatedLocationCount)) + ' locations · ');
        parts.push(escapeHtml(String(vm.religionCount)) + ' religions');
        parts.push('</span>');
        parts.push('</div>');

        if (vm.description) {
            parts.push('<div class="culture-card__desc">' + escapeHtml(vm.description) + '</div>');
        }

        if (vm.locations.length > 0 || vm.religions.length > 0) {
            parts.push('<div class="culture-card__relations">');
            if (vm.locations.length > 0) {
                parts.push('<div class="culture-card__relation">');
                parts.push('<span class="culture-card__relation-label">Locations</span>');
                parts.push('<span class="culture-card__relation-values">');
                parts.push(vm.locations.map(function(loc) {
                    return escapeHtml(loc.label);
                }).join(', '));
                parts.push('</span>');
                parts.push('</div>');
            }
            if (vm.religions.length > 0) {
                parts.push('<div class="culture-card__relation">');
                parts.push('<span class="culture-card__relation-label">Religions</span>');
                parts.push('<span class="culture-card__relation-values">');
                parts.push(vm.religions.map(function(rel) {
                    return escapeHtml(rel.label);
                }).join(', '));
                parts.push('</span>');
                parts.push('</div>');
            }
            parts.push('</div>');
        }

        if (vm.appearance.length > 0) {
            parts.push('<div class="culture-card__appearance">');
            for (var i = 0; i < vm.appearance.length; i++) {
                var a = vm.appearance[i];
                parts.push('<div class="culture-card__appearance-row">');
                parts.push('<span class="culture-card__appearance-cat">' + escapeHtml(a.category) + '</span>');
                if (a.preview) {
                    parts.push('<span class="culture-card__appearance-preview">' + escapeHtml(a.preview) + '</span>');
                }
                if (a.remaining > 0) {
                    parts.push('<span class="culture-card__appearance-more">+' + a.remaining + ' more</span>');
                }
                parts.push('</div>');
            }
            parts.push('</div>');
        }

        if (vm.mythology) {
            parts.push('<div class="culture-card__mythology">');
            for (var j = 0; j < vm.mythology.sections.length; j++) {
                var section = vm.mythology.sections[j];
                parts.push('<div class="culture-card__myth-section">');
                parts.push('<span class="culture-card__myth-label">' + escapeHtml(section.label) + '</span>');
                if (section.value) {
                    parts.push('<span class="culture-card__myth-value">' + escapeHtml(section.value) + '</span>');
                } else if (section.values) {
                    parts.push('<span class="culture-card__myth-values">' + escapeHtml(section.values.join(', ')) + '</span>');
                }
                parts.push('</div>');
            }
            parts.push('</div>');
        }

        if (vm.notes) {
            parts.push('<div class="culture-card__notes">' + escapeHtml(vm.notes) + '</div>');
        }

        parts.push('</div>');
        container.innerHTML = parts.join('');
    }

    // =========================================================================
    // 4. DROPDOWN
    // =========================================================================

    /**
     * Renders a <select> element for culture selection.
     *
     * Native <option> elements do not render arbitrary HTML reliably, so
     * icons are omitted from the options. If a caller needs icons in a
     * selector, they should build a custom control on top of the view
     * model's dropdown options.
     *
     * @param {string|Element} containerId
     * @param {Object} [options]
     * @param {string} [options.selectedId]
     * @param {string} [options.placeholder]
     * @param {string} [options.id]            id attribute for the select element
     * @param {Array}  [options.cultures]      override the culture list
     */
    function renderCultureDropdown(containerId, options) {
        options = options || {};
        var container = _resolveContainer(containerId);
        var viewModels = _requireViewModels();
        var queries = _requireQueries();
        var escapeHtml = _requireEscapeHtml();

        var cultures = Array.isArray(options.cultures)
            ? options.cultures
            : queries.getAllCultures();

        var items = viewModels.buildDropdownOptions(cultures, {
            selectedId: options.selectedId || null
        });

        var selectId = options.id || 'cultureSelect';

        var parts = ['<select id="' + escapeHtml(selectId) + '" class="culture-select">'];

        if (options.placeholder) {
            parts.push(
                '<option value="">' + escapeHtml(options.placeholder) + '</option>'
            );
        }

        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            parts.push(
                '<option value="' + escapeHtml(item.id) + '"' +
                (item.selected ? ' selected' : '') +
                '>' +
                escapeHtml(item.label) +
                '</option>'
            );
        }

        parts.push('</select>');
        container.innerHTML = parts.join('');
    }

    // =========================================================================
    // 5. LOAD-TIME VERIFICATION
    // =========================================================================

    (function _verifyLoadTimeDependencies() {
        if (!window.CultureViewModels) {
            throw new Error(
                'culture-ui-list.js loaded but window.CultureViewModels is missing. ' +
                'Check script tag order (culture-view-models.js must load first).'
            );
        }
        if (!window.CultureQueries) {
            throw new Error(
                'culture-ui-list.js loaded but window.CultureQueries is missing. ' +
                'Check script tag order (culture-queries.js must load first).'
            );
        }
        var hasEscape =
            (typeof window.escapeHtml === 'function') ||
            (typeof window._escapeHtml === 'function');
        if (!hasEscape) {
            throw new Error(
                'culture-ui-list.js loaded but no escapeHtml/_escapeHtml is available. ' +
                'Check script tag order (formatting.js must load first).'
            );
        }
    })();

    // =========================================================================
    // 6. PUBLIC API
    // =========================================================================

    window.CultureUI = {
        renderCultureList: renderCultureList,
        renderCultureCard: renderCultureCard,
        renderCultureDropdown: renderCultureDropdown
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CultureUI;
    }

})();
