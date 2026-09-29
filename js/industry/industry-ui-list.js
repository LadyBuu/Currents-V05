/**
 * =============================================================================
 * STILL WATERS - INDUSTRY UI LIST (industry-ui-list.js)
 * =============================================================================
 *
 * LOCATION: js/core/industry/industry-ui-list.js
 *
 * Renderers for enterprise lists, cards, and tables.
 *
 * ARCHITECTURAL RULES (Phase 1):
 *   - No dependency fallbacks. Missing deps throw at call time.
 *   - No dead code.
 *   - No JS hover. CSS owns hover.
 *   - Event delegation, not per-row listeners.
 *   - Semantic CSS classes, not inline styles.
 *   - Presentation defaults (like "—" for missing owner) belong here,
 *     not in queries.
 *
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY ACCESS
    // =========================================================================

    function _requireQueries() {
        var q = window.IndustryQueries;
        if (!q) throw new Error('IndustryUI: IndustryQueries dependency missing');
        return q;
    }

    function _requireEscapeHtml() {
        var fn = window.escapeHtml || window._escapeHtml;
        if (typeof fn !== 'function') {
            throw new Error('IndustryUI: escapeHtml dependency missing');
        }
        return fn;
    }

    // =========================================================================
    // 2. PRESENTATION HELPERS
    // =========================================================================

    /**
     * Presentation default for absent values.
     * This is a UI decision, not a domain decision.
     */
    var ABSENT = '—';

    function _displayOrAbsent(value) {
        if (value === undefined || value === null) return ABSENT;
        if (typeof value === 'string' && value === '') return ABSENT;
        return String(value);
    }

    function _resolveStatusClass(status) {
        // Returns a CSS class name. All color/style decisions live in CSS.
        if (!status) return 'status-unknown';
        return 'status-' + status;
    }

    function _resolveProfitClass(profit) {
        if (typeof profit !== 'number') return '';
        return profit >= 0 ? 'value-pos' : 'value-neg';
    }

    function _formatProfit(profit) {
        if (typeof profit !== 'number') return ABSENT;
        return (profit >= 0 ? '+' : '') + profit;
    }

    function _resolveContainer(containerId) {
        var container = typeof containerId === 'string'
            ? document.getElementById(containerId)
            : containerId;
        if (!container) {
            throw new Error('IndustryUI: container not found: ' + containerId);
        }
        return container;
    }

    // =========================================================================
    // 3. ENTERPRISE LIST
    // =========================================================================

    /**
     * Renders a list of enterprises.
     *
     * @param {string|Element} containerId
     * @param {Object} [options]
     * @param {Array}   [options.enterprises]   — pre-filtered list (default: all)
     * @param {Function}[options.onSelect]      — receives enterprise id
     * @param {string}  [options.emptyMessage]  — message when list is empty
     * @param {boolean} [options.showStatus=true]
     * @param {boolean} [options.showOwner=true]
     * @returns {boolean}
     */
    function renderEnterpriseList(containerId, options) {
        options = options || {};
        var container = _resolveContainer(containerId);
        var queries = _requireQueries();
        var esc = _requireEscapeHtml();

        var enterprises = options.enterprises || queries.getAllEnterprises();
        var emptyMessage = options.emptyMessage || 'No enterprises found';
        var showStatus = options.showStatus !== undefined ? options.showStatus : true;
        var showOwner = options.showOwner !== undefined ? options.showOwner : true;

        if (!enterprises || enterprises.length === 0) {
            container.innerHTML = '<div class="industry-empty">' + esc(emptyMessage) + '</div>';
            return true;
        }

        var sorted = enterprises.slice().sort(function(a, b) {
            return (a.name || '').localeCompare(b.name || '');
        });

        var html = '<div class="enterprise-list">';
        for (var i = 0; i < sorted.length; i++) {
            var e = sorted[i];
            var summary = queries.getEnterpriseSummary(e.id);
            if (!summary) continue;

            html += _renderListRow(summary, esc, showStatus, showOwner);
        }
        html += '</div>';

        container.innerHTML = html;

        // Event delegation — one listener for the whole list
        if (options.onSelect) {
            var onSelect = options.onSelect;
            container.addEventListener('click', function(event) {
                var row = event.target.closest('[data-enterprise-id]');
                if (!row) return;
                onSelect(row.dataset.enterpriseId);
            });
        }

        return true;
    }

    function _renderListRow(summary, esc, showStatus, showOwner) {
        var statusClass = _resolveStatusClass(summary.status);
        var profitClass = _resolveProfitClass(summary.annualProfit);
        var profitLabel = _formatProfit(summary.annualProfit);

        var metaParts = [esc(summary.type)];
        if (showOwner && summary.ownerName) {
            metaParts.push('Owner: ' + esc(summary.ownerName));
        }

        var metrics = summary.workerCount + ' workers · Wealth: ' + summary.wealth;
        if (summary.debt > 0) {
            metrics += ' · Debt: ' + summary.debt;
        }

        var statusBlock = '';
        if (showStatus) {
            statusBlock = '<div class="enterprise-row-status">' + esc(summary.status) + '</div>';
        }

        return '<div class="enterprise-row ' + statusClass + '" data-enterprise-id="' + esc(summary.id) + '">' +
            '<div class="enterprise-row-main">' +
                '<div class="enterprise-row-name">' + esc(summary.name) + '</div>' +
                '<div class="enterprise-row-meta">' + metaParts.join(' · ') + '</div>' +
                '<div class="enterprise-row-metrics">' + metrics + '</div>' +
            '</div>' +
            '<div class="enterprise-row-side">' +
                statusBlock +
                '<div class="enterprise-row-profit ' + profitClass + '">' + profitLabel + ' profit</div>' +
            '</div>' +
        '</div>';
    }

    // =========================================================================
    // 4. ENTERPRISE CARD
    // =========================================================================

    /**
     * Renders a single enterprise as a card.
     *
     * @param {string} enterpriseId
     * @returns {string} HTML
     */
    function renderEnterpriseCard(enterpriseId) {
        var queries = _requireQueries();
        var esc = _requireEscapeHtml();

        var summary = queries.getEnterpriseSummary(enterpriseId);
        if (!summary) {
            return '<div class="industry-empty">Enterprise not found</div>';
        }

        var statusClass = _resolveStatusClass(summary.status);
        var profitClass = _resolveProfitClass(summary.annualProfit);

        return '<div class="enterprise-card ' + statusClass + '">' +
            '<div class="enterprise-card-header">' +
                '<h4>' + esc(summary.name) + '</h4>' +
                '<span class="enterprise-card-status">' + esc(summary.status) + '</span>' +
            '</div>' +
            '<div class="enterprise-card-grid-3">' +
                '<div><span class="label">Type</span><strong>' + esc(summary.type) + '</strong></div>' +
                '<div><span class="label">Owner</span><strong>' + _displayOrAbsent(summary.ownerName ? esc(summary.ownerName) : null) + '</strong></div>' +
                '<div><span class="label">Location</span><strong>' + _displayOrAbsent(summary.locationName ? esc(summary.locationName) : null) + '</strong></div>' +
            '</div>' +
            '<div class="enterprise-card-grid-4">' +
                '<div><span class="label">Wealth</span><strong>' + summary.wealth + '</strong></div>' +
                '<div><span class="label">Debt</span><strong>' + summary.debt + '</strong></div>' +
                '<div><span class="label">Workers</span><strong>' + summary.workerCount + '/' + summary.maxWorkers + '</strong></div>' +
                '<div><span class="label">Annual Profit</span><strong class="' + profitClass + '">' + _formatProfit(summary.annualProfit) + '</strong></div>' +
            '</div>' +
            (summary.notes ? '<div class="enterprise-card-notes">' + esc(summary.notes) + '</div>' : '') +
        '</div>';
    }

    // =========================================================================
    // 5. ENTERPRISE TABLE
    // =========================================================================

    var COLUMN_DEFS = {
        name: {
            label: 'Name',
            render: function(summary, esc) { return esc(summary.name); }
        },
        type: {
            label: 'Type',
            render: function(summary, esc) { return esc(summary.type); }
        },
        owner: {
            label: 'Owner',
            render: function(summary, esc) { return _displayOrAbsent(summary.ownerName ? esc(summary.ownerName) : null); }
        },
        workers: {
            label: 'Workers',
            render: function(summary) { return summary.workerCount + '/' + summary.maxWorkers; }
        },
        wealth: {
            label: 'Wealth',
            render: function(summary) { return String(summary.wealth); }
        },
        debt: {
            label: 'Debt',
            render: function(summary) { return String(summary.debt); }
        },
        profit: {
            label: 'Profit',
            render: function(summary) {
                var cls = _resolveProfitClass(summary.annualProfit);
                return '<span class="' + cls + '">' + _formatProfit(summary.annualProfit) + '</span>';
            }
        },
        status: {
            label: 'Status',
            render: function(summary, esc) {
                var cls = _resolveStatusClass(summary.status);
                return '<span class="' + cls + '">' + esc(summary.status) + '</span>';
            }
        }
    };

    /**
     * Renders enterprises as a table.
     *
     * @param {Array} enterprises
     * @param {Object} [options]
     * @param {Array} [options.columns]
     * @returns {string} HTML
     */
    function renderEnterpriseTable(enterprises, options) {
        options = options || {};
        var queries = _requireQueries();
        var esc = _requireEscapeHtml();

        var items = enterprises || queries.getAllEnterprises();
        if (!items || items.length === 0) {
            return '<div class="industry-empty">No enterprises found</div>';
        }

        var columns = options.columns || ['name', 'type', 'owner', 'workers', 'wealth', 'profit', 'status'];
        for (var ci = 0; ci < columns.length; ci++) {
            if (!COLUMN_DEFS[columns[ci]]) {
                throw new Error('IndustryUI: unknown column "' + columns[ci] + '"');
            }
        }

        var html = '<table class="enterprise-table"><thead><tr>';
        for (var hi = 0; hi < columns.length; hi++) {
            html += '<th>' + esc(COLUMN_DEFS[columns[hi]].label) + '</th>';
        }
        html += '</tr></thead><tbody>';

        for (var i = 0; i < items.length; i++) {
            var summary = queries.getEnterpriseSummary(items[i].id);
            if (!summary) continue;

            html += '<tr>';
            for (var cj = 0; cj < columns.length; cj++) {
                var col = COLUMN_DEFS[columns[cj]];
                html += '<td>' + col.render(summary, esc) + '</td>';
            }
            html += '</tr>';
        }

        html += '</tbody></table>';
        return html;
    }

    // =========================================================================
    // 6. EXPORTS
    // =========================================================================

    window.IndustryUI = {
        renderEnterpriseList: renderEnterpriseList,
        renderEnterpriseCard: renderEnterpriseCard,
        renderEnterpriseTable: renderEnterpriseTable
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.IndustryUI;
    }

})();
