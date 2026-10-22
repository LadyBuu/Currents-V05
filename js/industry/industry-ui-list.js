/**
 * =============================================================================
 * STILL WATERS - INDUSTRY UI LIST (industry-ui-list.js)
 * =============================================================================
 *
 * LOCATION: js/core/industry/industry-ui-list.js
 *
 * Renderers over IndustryViewModels.
 *
 * ARCHITECTURAL RULES:
 *   - No domain queries. No interpretation. No defaults.
 *   - Accepts prepared ViewModel rows.
 *   - Emits HTML and wires DOM events. Nothing else.
 *   - Event handlers are wired exactly once per container. Re-rendering
 *     replaces innerHTML but does not stack listeners.
 *   - No inline styles. No emojis. Icons only via window.Icons if used.
 *
 * DEPENDENCIES (REQUIRED at load):
 *   - industry-view-models.js (IndustryViewModels) — only for the ABSENT
 *                               glyph, if a renderer needs to distinguish
 *                               an absent value from an empty string.
 *   - formatting.js           (escapeHtml)
 *
 * ICON POLICY: No emojis. No icons in this file. If a renderer ever needs
 * an icon, it must go through window.Icons via the modals-core `_getIcon`
 * contract, not an inline SVG and not an emoji. None of the renderers
 * below require an icon today.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. LOAD-TIME DEPENDENCY VERIFICATION
    // =========================================================================

    if (typeof window.IndustryViewModels === 'undefined') {
        throw new Error(
            'industry-ui-list.js requires industry-view-models.js to load first.'
        );
    }

    function _requireEscapeHtml() {
        var fn = window.escapeHtml || window._escapeHtml;
        if (typeof fn !== 'function') {
            throw new Error(
                'industry-ui-list.js requires formatting.js (escapeHtml).'
            );
        }
        return fn;
    }

    function _resolveContainer(containerId) {
        var container = typeof containerId === 'string'
            ? document.getElementById(containerId)
            : containerId;
        if (!container) {
            throw new Error(
                'IndustryUI: container not found: ' + containerId
            );
        }
        return container;
    }

    // =========================================================================
    // 2. EVENT DELEGATION — WIRE ONCE PER CONTAINER
    // =========================================================================
    //
    // The previous implementation called container.addEventListener inside
    // every renderEnterpriseList invocation. Rendering the same container
    // twice stacked two click handlers, and clicking a row fired onSelect
    // twice. This file fixes that by wiring delegation exactly once per
    // container, keyed by a data attribute, and reading the current
    // onSelect callback from a WeakMap so re-renders can swap the callback
    // without re-wiring the listener.
    //
    // A WeakMap is used (not a plain object) so containers that get
    // destroyed are collected; there is no leak and no need for a teardown
    // API.

    var _containerState = new WeakMap(); // container -> { onSelect: fn|null }

    function _wireContainerOnce(container) {
        if (_containerState.has(container)) {
            return _containerState.get(container);
        }

        var state = { onSelect: null };
        _containerState.set(container, state);

        container.addEventListener('click', function (event) {
            var row = event.target.closest('[data-enterprise-id]');
            if (!row) return;
            if (typeof state.onSelect !== 'function') return;
            state.onSelect(row.dataset.enterpriseId);
        });

        return state;
    }

    // =========================================================================
    // 3. LIST RENDERER
    // =========================================================================

    /**
     * Renders a list of enterprise rows into a container.
     *
     * @param {string|Element} containerId
     * @param {Array} rows             — from IndustryViewModels.buildListRows
     * @param {Object} [options]
     * @param {Function}[options.onSelect]      — receives enterprise id
     * @param {string}  [options.emptyMessage]
     * @param {boolean} [options.showOwner=true]
     * @param {boolean} [options.showStatus=true]
     * @returns {boolean}
     */
    function renderEnterpriseList(containerId, rows, options) {
        options = options || {};
        var container = _resolveContainer(containerId);
        var esc = _requireEscapeHtml();

        var emptyMessage = options.emptyMessage || 'No enterprises found';
        var showOwner = options.showOwner !== undefined
            ? options.showOwner
            : true;
        var showStatus = options.showStatus !== undefined
            ? options.showStatus
            : true;

        // Wire delegation and swap the callback (if any). Wiring happens
        // exactly once per container; subsequent calls only update the
        // callback reference.
        var state = _wireContainerOnce(container);
        state.onSelect = typeof options.onSelect === 'function'
            ? options.onSelect
            : null;

        if (!rows || rows.length === 0) {
            container.innerHTML =
                '<div class="industry-empty">' + esc(emptyMessage) + '</div>';
            return true;
        }

        var html = '<div class="enterprise-list">';
        for (var i = 0; i < rows.length; i++) {
            var r = rows[i];

            var metaParts = [esc(r.type)];
            if (showOwner) {
                metaParts.push('Owner: ' + esc(r.ownerLabel));
            }

            var statusBlock = showStatus
                ? '<div class="enterprise-row-status">' +
                    esc(r.statusLabel) + '</div>'
                : '';

            html += '<div class="enterprise-row ' + esc(r.statusClass) +
                '" data-enterprise-id="' + esc(r.id) + '">' +
                '<div class="enterprise-row-main">' +
                    '<div class="enterprise-row-name">' + esc(r.name) + '</div>' +
                    '<div class="enterprise-row-meta">' +
                        metaParts.join(' \u00b7 ') +
                    '</div>' +
                    '<div class="enterprise-row-metrics">' +
                        esc(r.workersLabel) + ' \u00b7 Wealth: ' +
                        esc(r.wealthLabel) +
                    '</div>' +
                '</div>' +
                '<div class="enterprise-row-side">' +
                    statusBlock +
                    '<div class="enterprise-row-profit ' +
                        esc(r.profitClass) + '">' +
                        esc(r.profitLabel) + ' profit' +
                    '</div>' +
                '</div>' +
            '</div>';
        }
        html += '</div>';

        container.innerHTML = html;
        return true;
    }

    // =========================================================================
    // 4. CARD RENDERER
    // =========================================================================

    /**
     * @param {Object} viewModel — from IndustryViewModels.buildCard
     * @returns {string} HTML
     */
    function renderEnterpriseCard(viewModel) {
        var esc = _requireEscapeHtml();

        if (!viewModel) {
            return '<div class="industry-empty">Enterprise not found</div>';
        }

        var v = viewModel;
        var notesBlock = (v.notesLabel && v.notesLabel !== '\u2014')
            ? '<div class="enterprise-card-notes">' +
                esc(v.notesLabel) + '</div>'
            : '';

        return '<div class="enterprise-card ' + esc(v.statusClass) + '">' +
            '<div class="enterprise-card-header">' +
                '<h4>' + esc(v.name) + '</h4>' +
                '<span class="enterprise-card-status">' +
                    esc(v.statusLabel) + '</span>' +
            '</div>' +
            '<div class="enterprise-card-grid-3">' +
                '<div><span class="label">Type</span><strong>' +
                    esc(v.type) + '</strong></div>' +
                '<div><span class="label">Owner</span><strong>' +
                    esc(v.ownerLabel) + '</strong></div>' +
                '<div><span class="label">Location</span><strong>' +
                    esc(v.locationLabel) + '</strong></div>' +
            '</div>' +
            '<div class="enterprise-card-grid-4">' +
                '<div><span class="label">Wealth</span>' +
                    '<strong class="' + esc(v.wealthClass) + '">' +
                    esc(v.wealthLabel) + '</strong></div>' +
                '<div><span class="label">Debt</span><strong>' +
                    esc(v.debtLabel) + '</strong></div>' +
                '<div><span class="label">Workers</span><strong>' +
                    esc(v.workersLabel) + '</strong></div>' +
                '<div><span class="label">Annual Profit</span>' +
                    '<strong class="' + esc(v.profitClass) + '">' +
                    esc(v.profitLabel) + '</strong></div>' +
            '</div>' +
            notesBlock +
        '</div>';
    }

    // =========================================================================
    // 5. TABLE RENDERER
    // =========================================================================

    /**
     * @param {Array} rows       — from IndustryViewModels.buildTableRow()
     * @param {Object} options
     * @param {Array}  options.columns      — e.g. ['name','type','profit']
     * @param {Object} options.columnLabels — optional: { name: 'Name', ... }
     * @returns {string} HTML
     */
    function renderEnterpriseTable(rows, options) {
        options = options || {};
        var esc = _requireEscapeHtml();

        if (!rows || rows.length === 0) {
            return '<div class="industry-empty">No enterprises found</div>';
        }

        var columns = options.columns
            || ['name', 'type', 'owner', 'workers', 'wealth', 'profit', 'status'];
        var labels = options.columnLabels || {};

        var html = '<table class="enterprise-table"><thead><tr>';
        for (var hi = 0; hi < columns.length; hi++) {
            var col = columns[hi];
            var label = labels[col]
                || (col.charAt(0).toUpperCase() + col.slice(1));
            html += '<th>' + esc(label) + '</th>';
        }
        html += '</tr></thead><tbody>';

        for (var i = 0; i < rows.length; i++) {
            html += '<tr>';
            for (var ci = 0; ci < columns.length; ci++) {
                var cell = rows[i].cells[columns[ci]];
                if (!cell) {
                    html += '<td></td>';
                } else {
                    var cls = cell.className
                        ? ' class="' + esc(cell.className) + '"'
                        : '';
                    html += '<td' + cls + '>' + esc(cell.text) + '</td>';
                }
            }
            html += '</tr>';
        }

        html += '</tbody></table>';
        return html;
    }

    // =========================================================================
    // 6. EXPORTS
    // =========================================================================

    window.IndustryUI = Object.freeze({
        renderEnterpriseList: renderEnterpriseList,
        renderEnterpriseCard: renderEnterpriseCard,
        renderEnterpriseTable: renderEnterpriseTable
    });

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.IndustryUI;
    }
})();
