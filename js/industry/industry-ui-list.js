/**
 * =============================================================================
 * STILL WATERS - INDUSTRY UI LIST (industry-ui-list.js)
 * =============================================================================
 * 
 * LOCATION: js/core/industry/industry-ui-list.js
 * 
 * Enterprise list rendering utilities.
 * 
 * DEPENDENCIES:
 *   - industry-queries.js (IndustryQueries)
 *   - formatting.js (escapeHtml)
 *   - icons.js (Icons)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getQueries() {
        return typeof window.IndustryQueries !== 'undefined' ? window.IndustryQueries : null;
    }

    function _escapeHtml(str) {
        if (typeof window.escapeHtml === 'function') {
            return window.escapeHtml(str);
        }
        if (typeof window._escapeHtml === 'function') {
            return window._escapeHtml(str);
        }
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function _getIcon(name) {
        if (window.Icons && window.Icons[name]) {
            return window.Icons[name];
        }
        return '';
    }

    function _getCurrentYear() {
        if (typeof window.getCurrentYearSafe === 'function') {
            return window.getCurrentYearSafe();
        }
        if (typeof window.getCurrentYear === 'function') {
            return window.getCurrentYear();
        }
        return 1250;
    }

    // =========================================================================
    // 2. RENDER ENTERPRISE LIST
    // =========================================================================

    function renderEnterpriseList(containerId, options) {
        options = options || {};

        var container = typeof containerId === 'string' ?
            document.getElementById(containerId) :
            containerId;

        if (!container) {
            return false;
        }

        var queries = _getQueries();
        if (!queries) {
            container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--dim);">Industry system not available</div>';
            return false;
        }

        var enterprises = options.filteredEnterprises || queries.getAllEnterprises();
        var onSelect = options.onSelect || null;
        var emptyMessage = options.emptyMessage || 'No enterprises found';
        var showStatus = options.showStatus !== undefined ? options.showStatus : true;
        var showOwner = options.showOwner !== undefined ? options.showOwner : true;

        if (!enterprises || enterprises.length === 0) {
            container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--dim);">' + _escapeHtml(emptyMessage) + '</div>';
            return true;
        }

        // Sort by name
        var sorted = enterprises.slice().sort(function(a, b) {
            return (a.name || '').localeCompare(b.name || '');
        });

        var html = '<div class="enterprise-list" style="display:flex;flex-direction:column;gap:4px;">';

        for (var i = 0; i < sorted.length; i++) {
            var e = sorted[i];
            var summary = queries.getEnterpriseSummary(e.id);
            if (!summary) continue;

            var statusColor = summary.status === 'active' ? 'var(--success)' :
                             summary.status === 'bankrupt' ? 'var(--danger)' :
                             summary.status === 'inactive' ? 'var(--warn)' :
                             'var(--dim)';

            var profitColor = summary.annualProfit >= 0 ? 'var(--success)' : 'var(--danger)';
            var profitPrefix = summary.annualProfit >= 0 ? '+' : '';

            var rowClass = options.rowClass || 'enterprise-row';
            var clickable = onSelect ? 'cursor:pointer;' : '';

            html += '<div class="' + _escapeHtml(rowClass) + '" data-enterprise-id="' + _escapeHtml(e.id) + '" style="' +
                'display:flex;justify-content:space-between;align-items:center;' +
                'padding:8px 12px;background:var(--bg3);border-radius:6px;' +
                'border-left:3px solid ' + statusColor + ';' +
                clickable +
                '">';

            html += '<div style="flex:1;min-width:0;">';
            html += '<div style="font-weight:bold;font-size:0.8rem;">' + _escapeHtml(summary.name) + '</div>';
            html += '<div style="font-size:0.6rem;color:var(--dim);">' + _escapeHtml(summary.type);

            if (showOwner && summary.ownerName) {
                html += ' · Owner: ' + _escapeHtml(summary.ownerName);
            }
            html += '</div>';

            // Worker info
            html += '<div style="font-size:0.55rem;color:var(--dim);">' +
                summary.workerCount + ' workers · Wealth: ' + summary.wealth +
                (summary.debt > 0 ? ' · Debt: ' + summary.debt : '') +
                '</div>';

            html += '</div>';

            html += '<div style="text-align:right;flex-shrink:0;margin-left:12px;">';
            if (showStatus) {
                html += '<div style="font-size:0.6rem;color:' + statusColor + ';">' + _escapeHtml(summary.status) + '</div>';
            }
            html += '<div style="font-size:0.7rem;color:' + profitColor + ';">' + profitPrefix + summary.annualProfit + ' profit</div>';
            html += '</div>';

            html += '</div>';
        }

        html += '</div>';

        container.innerHTML = html;

        // Attach click handlers
        if (onSelect) {
            var rows = container.querySelectorAll('.enterprise-row');
            for (var i = 0; i < rows.length; i++) {
                (function(row) {
                    row.addEventListener('click', function() {
                        var id = this.dataset.enterpriseId;
                        var enterprise = queries.getEnterprise(id);
                        if (enterprise && onSelect) {
                            onSelect(enterprise);
                        }
                    });
                    row.addEventListener('mouseenter', function() {
                        this.style.background = 'var(--bg2)';
                    });
                    row.addEventListener('mouseleave', function() {
                        this.style.background = 'var(--bg3)';
                    });
                })(rows[i]);
            }
        }

        return true;
    }

    function renderEnterpriseCard(enterprise, options) {
        options = options || {};

        var queries = _getQueries();
        if (!queries || !enterprise) {
            return '<div style="text-align:center;padding:20px;color:var(--dim);">Enterprise not available</div>';
        }

        var summary = typeof enterprise === 'string' ? queries.getEnterpriseSummary(enterprise) : queries.getEnterpriseSummary(enterprise.id);
        if (!summary) {
            return '<div style="text-align:center;padding:20px;color:var(--dim);">Enterprise not found</div>';
        }

        var statusColor = summary.status === 'active' ? 'var(--success)' :
                         summary.status === 'bankrupt' ? 'var(--danger)' :
                         summary.status === 'inactive' ? 'var(--warn)' :
                         'var(--dim)';

        var profitColor = summary.annualProfit >= 0 ? 'var(--success)' : 'var(--danger)';

        return '<div class="enterprise-card" style="' +
            'background:var(--bg2);border-radius:8px;padding:16px;' +
            'border:1px solid var(--border);' +
            '">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
            '<h4 style="margin:0;font-size:0.9rem;">' + _escapeHtml(summary.name) + '</h4>' +
            '<span style="font-size:0.6rem;color:' + statusColor + ';padding:2px 10px;border-radius:12px;border:1px solid ' + statusColor + ';">' + _escapeHtml(summary.status) + '</span>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;font-size:0.65rem;">' +
            '<div><span style="color:var(--dim);">Type</span><br><strong>' + _escapeHtml(summary.type) + '</strong></div>' +
            '<div><span style="color:var(--dim);">Owner</span><br><strong>' + _escapeHtml(summary.ownerName || 'None') + '</strong></div>' +
            '<div><span style="color:var(--dim);">Location</span><br><strong>' + _escapeHtml(summary.locationName || 'Unknown') + '</strong></div>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;margin-top:8px;font-size:0.65rem;padding-top:8px;border-top:1px solid var(--border-light);">' +
            '<div><span style="color:var(--dim);">Wealth</span><br><strong>' + summary.wealth + '</strong></div>' +
            '<div><span style="color:var(--dim);">Debt</span><br><strong>' + (summary.debt || 0) + '</strong></div>' +
            '<div><span style="color:var(--dim);">Workers</span><br><strong>' + summary.workerCount + '/' + summary.maxWorkers + '</strong></div>' +
            '<div><span style="color:var(--dim);">Annual Profit</span><br><strong style="color:' + profitColor + ';">' + (summary.annualProfit >= 0 ? '+' : '') + summary.annualProfit + '</strong></div>' +
            '</div>' +
            (summary.notes ? '<div style="margin-top:8px;font-size:0.55rem;color:var(--dim);padding-top:8px;border-top:1px solid var(--border-light);">' + _escapeHtml(summary.notes) + '</div>' : '') +
            '</div>';
    }

    function renderEnterpriseTable(enterprises, options) {
        options = options || {};

        var queries = _getQueries();
        if (!queries) return '<div>Industry system not available</div>';

        var items = enterprises || queries.getAllEnterprises();
        if (!items || items.length === 0) {
            return '<div style="text-align:center;padding:20px;color:var(--dim);">No enterprises found</div>';
        }

        var columns = options.columns || ['name', 'type', 'owner', 'workers', 'wealth', 'profit', 'status'];
        var columnLabels = {
            name: 'Name',
            type: 'Type',
            owner: 'Owner',
            workers: 'Workers',
            wealth: 'Wealth',
            debt: 'Debt',
            profit: 'Profit',
            status: 'Status'
        };

        var html = '<table style="width:100%;border-collapse:collapse;font-size:0.7rem;">';
        html += '<thead><tr style="border-bottom:1px solid var(--border);">';

        for (var i = 0; i < columns.length; i++) {
            var col = columns[i];
            html += '<th style="text-align:left;padding:6px 8px;color:var(--dim);font-weight:normal;">' + _escapeHtml(columnLabels[col] || col) + '</th>';
        }
        html += '</tr></thead><tbody>';

        for (var j = 0; j < items.length; j++) {
            var summary = queries.getEnterpriseSummary(items[j].id);
            if (!summary) continue;

            html += '<tr style="border-bottom:1px solid var(--border-light);">';

            for (var k = 0; k < columns.length; k++) {
                var col = columns[k];
                var value = '';

                switch (col) {
                    case 'name': value = summary.name; break;
                    case 'type': value = summary.type; break;
                    case 'owner': value = summary.ownerName || 'None'; break;
                    case 'workers': value = summary.workerCount + '/' + summary.maxWorkers; break;
                    case 'wealth': value = summary.wealth; break;
                    case 'debt': value = summary.debt || 0; break;
                    case 'profit':
                        var profitColor = summary.annualProfit >= 0 ? 'var(--success)' : 'var(--danger)';
                        value = '<span style="color:' + profitColor + ';">' + (summary.annualProfit >= 0 ? '+' : '') + summary.annualProfit + '</span>';
                        break;
                    case 'status':
                        var statusColors = {
                            active: 'var(--success)',
                            inactive: 'var(--warn)',
                            bankrupt: 'var(--danger)',
                            closed: 'var(--dim)'
                        };
                        value = '<span style="color:' + (statusColors[summary.status] || 'var(--dim)') + ';">' + _escapeHtml(summary.status) + '</span>';
                        break;
                    default: value = summary[col] || '';
                }

                html += '<td style="padding:6px 8px;">' + value + '</td>';
            }

            html += '</tr>';
        }

        html += '</tbody></table>';
        return html;
    }

    // =========================================================================
    // 3. EXPORTS
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