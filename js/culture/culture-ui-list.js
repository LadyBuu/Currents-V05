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
 *   - call CultureQueries
 *   - resolve locations or religions
 *   - inspect appearance or mythology structure
 *   - decide fallback labels or icons
 *   - attach per-row listeners
 *   - do hover styling in JavaScript
 *
 * Dependencies:
 *   - CultureViewModels   (projections)
 *   - CultureQueries      (only for the initial "get all cultures" list)
 *   - escapeHtml          (shared UI utility)
 *
 * The renderer is allowed to look up the culture list once. It is not
 * allowed to reach into the domain for individual field resolution —
 * that is what view models are for.
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
            html.push(_renderRow(rows[i], escapeHtml));
        }
        html.push('</div>');
        container.innerHTML = html.join('');

        // Event delegation: one listener, attached to the container.
        // Rerendering replaces the innerHTML but the listener survives.
        if (typeof options.onSelect === 'function' && !container.__cultureListBound) {
            container.__cultureListBound = true;
            container.addEventListener('click', function(e) {
                var row = e.target.closest('[data-culture-id]');
                if (!row || !container.contains(row)) return;
                var id = row.getAttribute('data-culture-id');
                var culture = queries.getCultureById(id);
                if (culture) options.onSelect(culture);
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
            // The icon is a view-model decision. The renderer does not
            // interpret it — if a culture has an icon, render it verbatim.
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
    // 5. PUBLIC API
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
