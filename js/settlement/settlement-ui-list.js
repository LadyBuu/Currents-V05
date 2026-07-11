/**
 * =============================================================================
 * SETTLEMENT UI LIST - UI list rendering for settlements
 * =============================================================================
 * 
 * Responsibilities:
 * - Render settlement lists with filters
 * - Render settlement cards
 * - Render settlement tables
 * - Render feature lists
 * - Handle selection and sorting
 * 
 * DEPENDENCIES:
 *   - settlement-state.js (SettlementState)
 *   - settlement-queries.js (SettlementQueries)
 *   - modals-core.js (_escapeHtml, _getIcon, _showToast)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARD
    // =========================================================================

    var _rendering = false;

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    function _escapeHtml(str) {
        if (typeof window._escapeHtml === 'function') return window._escapeHtml(str);
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function _getIcon(name) {
        if (window.Icons && window.Icons[name]) {
            return window.Icons[name];
        }
        return '';
    }

    function _getPlaceById(id) {
        return typeof window.getPlaceById === 'function' ? window.getPlaceById(id) : null;
    }

    function _getLocationPopulationCount(locationId) {
        if (typeof window.getLocationPopulationCount === 'function') {
            return window.getLocationPopulationCount(locationId);
        }
        return 0;
    }

    function _getSettlementData(locationId) {
        return SettlementState.getSettlementData(locationId);
    }

    function _getSettlementFeatures(locationId) {
        return SettlementState.getSettlementFeatures(locationId);
    }

    function _getSettlementRanks() {
        return SettlementState._getAllRanks();
    }

    // =========================================================================
    // 3. RENDER SETTLEMENT LIST
    // =========================================================================

    function renderSettlementList(containerId, options) {
        if (_rendering) {
            return;
        }
        _rendering = true;

        try {
            options = options || {};
            var container = document.getElementById(containerId);
            if (!container) return;

            var searchTerm = options.searchTerm || '';
            var onSelect = options.onSelect || null;
            var selectedId = options.selectedId || null;
            var rankFilter = options.rankFilter || 'all';
            var prosperityFilter = options.prosperityFilter || 'all';
            var sortBy = options.sortBy || 'name';
            var sortOrder = options.sortOrder || 'asc';
            var limit = options.limit || 0;

            var settlements = SettlementState.getAllSettlements({
                sortBy: sortBy,
                sortOrder: sortOrder,
                limit: 0
            });

            if (searchTerm) {
                var lower = searchTerm.toLowerCase();
                settlements = settlements.filter(function(s) {
                    return s.locationName.toLowerCase().indexOf(lower) !== -1 ||
                        (s.data.notes && s.data.notes.toLowerCase().indexOf(lower) !== -1);
                });
            }

            if (rankFilter !== 'all') {
                settlements = settlements.filter(function(s) {
                    return s.data.rankId === rankFilter;
                });
            }

            if (prosperityFilter !== 'all') {
                settlements = settlements.filter(function(s) {
                    var prosperity = s.data.prosperity || 50;
                    if (prosperityFilter === 'thriving') return prosperity >= 70;
                    if (prosperityFilter === 'stable') return prosperity >= 40 && prosperity < 70;
                    if (prosperityFilter === 'struggling') return prosperity < 40;
                    return true;
                });
            }

            if (limit > 0) {
                settlements = settlements.slice(0, limit);
            }

            var locationIcon = _getIcon('LOCATION');
            var homeIcon = _getIcon('HOME');

            var html = '<div class="settlement-list">';

            if (settlements.length === 0) {
                html += '<div style="text-align: center; padding: 40px; color: var(--dim);">No settlements found</div>';
            } else {
                for (var i = 0; i < settlements.length; i++) {
                    var s = settlements[i];
                    var isSelected = (selectedId === s.locationId);
                    var population = _getLocationPopulationCount(s.locationId);
                    var prosperity = s.data.prosperity || 50;
                    var wealth = s.data.wealth || 0;
                    var debt = s.data.totalDebt || 0;
                    var ranks = _getSettlementRanks();
                    var rank = ranks.find(function(r) { return r.id === s.data.rankId; });
                    var rankName = rank ? rank.name : 'Unknown';

                    var prosperityColor = prosperity >= 70 ? 'var(--success)' :
                                         prosperity >= 40 ? 'var(--accent)' :
                                         'var(--danger)';

                    var prosperityLabel = prosperity >= 70 ? 'Thriving' :
                                         prosperity >= 40 ? 'Stable' :
                                         'Struggling';

                    html +=
                        '<div class="settlement-item" data-loc-id="' + s.locationId + '" style="' +
                        'background: ' + (isSelected ? 'var(--accent-dim)' : 'var(--bg3)') + ';' +
                        'border: 1px solid ' + (isSelected ? 'var(--accent)' : 'var(--border)') + ';' +
                        'border-radius: 6px;' +
                        'padding: 12px 16px;' +
                        'margin-bottom: 8px;' +
                        'cursor: pointer;' +
                        'transition: all 0.1s;' +
                        '">' +
                        '<div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 6px;">' +
                        '<div style="flex: 1; min-width: 0;">' +
                        '<div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">' +
                        '<strong style="font-size: 0.85rem;">' + locationIcon + ' ' + _escapeHtml(s.locationName) + '</strong>' +
                        '<span style="font-size: 0.55rem; background: var(--bg2); padding: 2px 8px; border-radius: 10px;">' + _escapeHtml(rankName) + '</span>' +
                        '<span style="font-size: 0.55rem; color: ' + prosperityColor + '; padding: 2px 8px; border-radius: 10px; border: 1px solid ' + prosperityColor + ';">' + prosperityLabel + '</span>' +
                        (isSelected ? '<span style="font-size: 0.55rem; background: var(--accent); padding: 2px 8px; border-radius: 12px; color: white;">Selected</span>' : '') +
                        '</div>' +
                        '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 4px; display: flex; gap: 12px; flex-wrap: wrap;">' +
                        '<span>' + homeIcon + ' ' + population + ' pop</span>' +
                        '<span>💰 ' + wealth + ' gold' +
                        (debt > 0 ? ' <span style="color: var(--danger);">(Debt: ' + debt + ')</span>' : '') +
                        '</span>' +
                        '<span>☀ ' + prosperity + '%</span>' +
                        '</div>' +
                        '</div>' +
                        '<div style="text-align: right; flex-shrink: 0;">' +
                        '<span style="font-size: 0.55rem; color: var(--accent);">View</span>' +
                        '</div>' +
                        '</div>' +
                        '</div>';
                }
            }

            html += '</div>';
            container.innerHTML = html;

            if (onSelect) {
                var items = container.querySelectorAll('.settlement-item');
                for (var i = 0; i < items.length; i++) {
                    (function(item) {
                        item.addEventListener('click', function() {
                            var locId = this.dataset.locId;
                            var place = _getPlaceById(locId);
                            if (place) {
                                onSelect(place);
                            }
                        });
                        item.addEventListener('mouseenter', function() {
                            if (this.dataset.locId !== selectedId) {
                                this.style.background = 'var(--bg2)';
                            }
                        });
                        item.addEventListener('mouseleave', function() {
                            if (this.dataset.locId !== selectedId) {
                                this.style.background = 'var(--bg3)';
                            }
                        });
                    })(items[i]);
                }
            }

        } finally {
            _rendering = false;
        }
    }

    // =========================================================================
    // 4. RENDER SETTLEMENT CARD
    // =========================================================================

    function renderSettlementCard(locationId, options) {
        if (_rendering) {
            return '';
        }
        _rendering = true;

        try {
            options = options || {};
            var summary = SettlementQueries.getSettlementSummary(locationId);
            if (!summary) {
                return '<div style="text-align:center;padding:20px;color:var(--dim);">Settlement not found</div>';
            }

            var population = _getLocationPopulationCount(locationId);
            var prosperityColor = summary.prosperity.value >= 70 ? 'var(--success)' :
                                 summary.prosperity.value >= 40 ? 'var(--accent)' :
                                 'var(--danger)';

            var locationIcon = _getIcon('LOCATION');
            var homeIcon = _getIcon('HOME');

            var html =
                '<div class="settlement-card" style="' +
                'background: var(--bg2);' +
                'border-radius: 8px;' +
                'padding: 16px;' +
                'border: 1px solid var(--border);' +
                '">' +
                '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">' +
                '<h4 style="margin: 0; font-size: 0.9rem;">' + locationIcon + ' ' + _escapeHtml(summary.name) + '</h4>' +
                '<span style="font-size: 0.6rem; color: ' + prosperityColor + '; padding: 2px 10px; border-radius: 12px; border: 1px solid ' + prosperityColor + ';">' + _escapeHtml(summary.prosperity.description) + '</span>' +
                '</div>' +
                '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; font-size: 0.65rem;">' +
                '<div><span style="color: var(--dim);">Rank</span><br><strong>' + _escapeHtml(summary.rank.name) + '</strong></div>' +
                '<div><span style="color: var(--dim);">Population</span><br><strong>' + population + '</strong></div>' +
                '<div><span style="color: var(--dim);">Prosperity</span><br><strong style="color:' + prosperityColor + ';">' + summary.prosperity.value + '%</strong></div>' +
                '</div>' +
                '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border-light); font-size: 0.65rem;">' +
                '<div><span style="color: var(--dim);">Wealth</span><br><strong>' + summary.wealth + '</strong></div>' +
                '<div><span style="color: var(--dim);">Debt</span><br><strong style="color:' + (summary.totalDebt > 0 ? 'var(--danger)' : 'var(--dim)') + ';">' + summary.totalDebt + '</strong></div>' +
                '<div><span style="color: var(--dim);">Features</span><br><strong>' + (summary.features ? summary.features.length : 0) + '</strong></div>' +
                '</div>' +
                (summary.features && summary.features.length > 0 ?
                    '<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border-light); font-size: 0.55rem; color: var(--dim);">' +
                    summary.features.slice(0, 3).map(function(f) { return _escapeHtml(f.name); }).join(' · ') +
                    (summary.features.length > 3 ? ' · +' + (summary.features.length - 3) + ' more' : '') +
                    '</div>' : '') +
                '</div>';

            return html;

        } finally {
            _rendering = false;
        }
    }

    // =========================================================================
    // 5. RENDER SETTLEMENT TABLE
    // =========================================================================

    function renderSettlementTable(settlements, options) {
        if (_rendering) {
            return '';
        }
        _rendering = true;

        try {
            options = options || {};
            var items = settlements || SettlementState.getAllSettlements();
            var columns = options.columns || ['name', 'rank', 'population', 'prosperity', 'wealth', 'features'];

            var columnLabels = {
                name: 'Name',
                rank: 'Rank',
                population: 'Population',
                prosperity: 'Prosperity',
                wealth: 'Wealth',
                debt: 'Debt',
                features: 'Features',
                taxRate: 'Tax Rate'
            };

            var html = '<table style="width:100%;border-collapse:collapse;font-size:0.7rem;">';
            html += '<thead><tr style="border-bottom:1px solid var(--border);">';

            for (var i = 0; i < columns.length; i++) {
                var col = columns[i];
                html += '<th style="text-align:left;padding:6px 8px;color:var(--dim);font-weight:normal;">' + _escapeHtml(columnLabels[col] || col) + '</th>';
            }
            html += '</tr></thead><tbody>';

            for (var j = 0; j < items.length; j++) {
                var s = items[j];
                var summary = SettlementQueries.getSettlementSummary(s.locationId);
                if (!summary) continue;

                var population = _getLocationPopulationCount(s.locationId);

                html += '<tr style="border-bottom:1px solid var(--border-light);">';

                for (var k = 0; k < columns.length; k++) {
                    var col = columns[k];
                    var value = '';

                    switch (col) {
                        case 'name':
                            value = _escapeHtml(summary.name);
                            break;
                        case 'rank':
                            value = _escapeHtml(summary.rank.name);
                            break;
                        case 'population':
                            value = population;
                            break;
                        case 'prosperity':
                            var color = summary.prosperity.value >= 70 ? 'var(--success)' :
                                       summary.prosperity.value >= 40 ? 'var(--accent)' :
                                       'var(--danger)';
                            value = '<span style="color:' + color + ';">' + summary.prosperity.value + '%</span>';
                            break;
                        case 'wealth':
                            value = summary.wealth;
                            break;
                        case 'debt':
                            var debtColor = summary.totalDebt > 0 ? 'var(--danger)' : 'var(--dim)';
                            value = '<span style="color:' + debtColor + ';">' + summary.totalDebt + '</span>';
                            break;
                        case 'features':
                            value = summary.features ? summary.features.length : 0;
                            break;
                        case 'taxRate':
                            value = summary.taxRate + '%';
                            break;
                        default:
                            value = summary[col] || '';
                    }

                    html += '<td style="padding:6px 8px;">' + value + '</td>';
                }

                html += '</tr>';
            }

            html += '</tbody></table>';
            return html;

        } finally {
            _rendering = false;
        }
    }

    // =========================================================================
    // 6. RENDER FEATURE LIST
    // =========================================================================

    function renderFeatureList(containerId, locationId, options) {
        if (_rendering) {
            return;
        }
        _rendering = true;

        try {
            options = options || {};
            var container = document.getElementById(containerId);
            if (!container) return;

            var features = _getSettlementFeatures(locationId);
            var onSelect = options.onSelect || null;
            var selectedId = options.selectedId || null;

            var gearIcon = _getIcon('GEAR');

            var html = '<div class="feature-list">';

            if (features.length === 0) {
                html += '<div style="text-align:center;padding:20px;color:var(--dim);">No features built</div>';
            } else {
                for (var i = 0; i < features.length; i++) {
                    var f = features[i];
                    var isSelected = (selectedId === f.id);
                    var categoryLabel = f.category ? f.category.charAt(0).toUpperCase() + f.category.slice(1) : 'Other';

                    html +=
                        '<div class="feature-item" data-feature-id="' + f.id + '" style="' +
                        'background: ' + (isSelected ? 'var(--accent-dim)' : 'var(--bg3)') + ';' +
                        'border: 1px solid ' + (isSelected ? 'var(--accent)' : 'var(--border)') + ';' +
                        'border-radius: 4px;' +
                        'padding: 8px 12px;' +
                        'margin-bottom: 4px;' +
                        'cursor: pointer;' +
                        'transition: all 0.1s;' +
                        '">' +
                        '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 4px;">' +
                        '<div>' +
                        '<span style="font-size: 0.7rem;">' + gearIcon + ' ' + _escapeHtml(f.name) + '</span>' +
                        '<span style="font-size: 0.5rem; color: var(--dim); margin-left: 6px;">' + _escapeHtml(categoryLabel) + '</span>' +
                        '</div>' +
                        '<div style="font-size: 0.55rem; color: var(--dim); display: flex; gap: 8px; align-items: center;">' +
                        (f.maintenance ? '<span>🔧 ' + f.maintenance + 'g/yr</span>' : '') +
                        (f.cost ? '<span>💰 ' + f.cost + 'g</span>' : '') +
                        (f.prosperityBonus ? '<span style="color:var(--success);">+ ' + f.prosperityBonus + '%</span>' : '') +
                        (isSelected ? '<span style="color: var(--success);">✓ Selected</span>' : '') +
                        '</div>' +
                        '</div>' +
                        (f.description ? '<div style="font-size: 0.5rem; color: var(--dim); margin-top: 2px;">' + _escapeHtml(f.description) + '</div>' : '') +
                        '</div>';
                }
            }

            html += '</div>';
            container.innerHTML = html;

            if (onSelect) {
                var items = container.querySelectorAll('.feature-item');
                for (var i = 0; i < items.length; i++) {
                    (function(item) {
                        item.addEventListener('click', function() {
                            var featureId = this.dataset.featureId;
                            var feature = SettlementQueries.getFeatureById(featureId);
                            if (feature) {
                                onSelect(feature);
                            }
                        });
                        item.addEventListener('mouseenter', function() {
                            this.style.background = 'var(--bg2)';
                        });
                        item.addEventListener('mouseleave', function() {
                            this.style.background = 'var(--bg3)';
                        });
                    })(items[i]);
                }
            }

        } finally {
            _rendering = false;
        }
    }

    // =========================================================================
    // 7. EXPORTS
    // =========================================================================

    window.SettlementUI = {
        renderSettlementList: renderSettlementList,
        renderSettlementCard: renderSettlementCard,
        renderSettlementTable: renderSettlementTable,
        renderFeatureList: renderFeatureList
    };

})();