/**
 * =============================================================================
 * STILL WATERS - DISASTER STATISTICS UI (disaster-ui-stats.js)
 * =============================================================================
 * 
 * LOCATION: js/core/disaster/disaster-ui-stats.js
 * 
 * This file contains the disaster statistics dashboard UI components.
 * 
 * EXPORTED FUNCTIONS:
 *   - DisasterStatsUI.renderStatsPanel(containerId, locationId)
 *   - DisasterStatsUI.renderDisasterList(containerId, disasters, options)
 *   - DisasterStatsUI.renderDisasterChart(containerId, data, type)
 *   - DisasterStatsUI.renderRiskIndicator(containerId, locationId)
 *   - DisasterStatsUI.refreshAll()
 * 
 * DEPENDENCIES:
 *   - disaster-queries.js: DisasterQueries
 *   - disaster-commands.js: DisasterCommands
 *   - modals-disaster.js: DisasterModals
 *   - formatting.js: escapeHtml
 *   - accessors.js: getPlaceById
 * 
 * ICON POLICY: No emojis. Uses icons.js via _getIcon.
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. RECURSION GUARD
    // =========================================================================

    var _processingRender = false;

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _escapeHtml(str) {
        if (typeof window._escapeHtml === 'function') {
            return window._escapeHtml(str);
        }
        if (typeof window.escapeHtml === 'function') {
            return window.escapeHtml(str);
        }
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _getIcon(name) {
        if (typeof window._getIcon === 'function') {
            return window._getIcon(name);
        }
        if (window.Icons && window.Icons[name]) {
            return window.Icons[name];
        }
        return '';
    }

    function _getIconSafe(name) {
        var icon = _getIcon(name);
        return icon || '';
    }

    function _getPlaceById(id) {
        if (typeof window.getPlaceById === 'function') {
            return window.getPlaceById(id);
        }
        return null;
    }

    function _getPlaceName(id) {
        if (typeof window.getPlaceName === 'function') {
            return window.getPlaceName(id);
        }
        var place = _getPlaceById(id);
        return place ? place.displayName : 'Unknown';
    }

    function _openDisasterDetailsModal(disasterId) {
        if (typeof window.DisasterModals !== 'undefined' && 
            typeof window.DisasterModals.openDisasterDetailsModal === 'function') {
            return window.DisasterModals.openDisasterDetailsModal(disasterId);
        }
        return null;
    }

    function _openDisasterStatsModal(locationId) {
        if (typeof window.DisasterModals !== 'undefined' && 
            typeof window.DisasterModals.openDisasterStatsModal === 'function') {
            return window.DisasterModals.openDisasterStatsModal(locationId);
        }
        return null;
    }

    function _getDisasterTypes() {
        return window.DISASTER_TYPES || [];
    }

    // =========================================================================
    // 2. RENDER STATS PANEL
    // =========================================================================

    function renderStatsPanel(containerId, locationId) {
        if (_processingRender) return false;
        _processingRender = true;

        try {
            var container = document.getElementById(containerId);
            if (!container) return false;

            var stats = window.DisasterQueries.getDisasterStats(locationId);
            var locationName = locationId ? _getPlaceName(locationId) : 'Global';
            var severityStats = window.DisasterQueries.getDisasterSeverityStats();

            var html = 
                '<div class="disaster-stats-panel">' +
                '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 8px; margin-bottom: 16px;">' +
                '<div style="padding: 12px; background: var(--bg3); border-radius: 6px; text-align: center;">' +
                '<div style="font-size: 0.5rem; color: var(--dim);">Total Disasters</div>' +
                '<div style="font-size: 1.2rem; font-weight: bold;">' + (stats.total || 0) + '</div>' +
                '</div>' +
                '<div style="padding: 12px; background: var(--bg3); border-radius: 6px; text-align: center;">' +
                '<div style="font-size: 0.5rem; color: var(--dim);">Total Deaths</div>' +
                '<div style="font-size: 1.2rem; font-weight: bold; color: var(--warn);">' + (stats.totalDeaths || 0) + '</div>' +
                '</div>' +
                '<div style="padding: 12px; background: var(--bg3); border-radius: 6px; text-align: center;">' +
                '<div style="font-size: 0.5rem; color: var(--dim);">Prosperity Lost</div>' +
                '<div style="font-size: 1.2rem; font-weight: bold; color: var(--accent);">' + (stats.totalProsperityLoss || 0) + '</div>' +
                '</div>' +
                '<div style="padding: 12px; background: var(--bg3); border-radius: 6px; text-align: center;">' +
                '<div style="font-size: 0.5rem; color: var(--dim);">Avg Severity</div>' +
                '<div style="font-size: 1.2rem; font-weight: bold;">' + (stats.averageSeverity ? Math.round(stats.averageSeverity) : 0) + '</div>' +
                '</div>' +
                '</div>';

            // Type distribution
            if (stats.byType && Object.keys(stats.byType).length > 0) {
                html +=
                    '<div style="padding: 12px; background: var(--bg3); border-radius: 6px; margin-bottom: 12px;">' +
                    '<div style="font-size: 0.55rem; color: var(--dim); margin-bottom: 8px;">Disaster Types</div>';
                var typeEntries = Object.entries(stats.byType).sort(function(a, b) { return b[1] - a[1]; });
                var maxCount = typeEntries.length > 0 ? typeEntries[0][1] : 1;
                for (var i = 0; i < typeEntries.length; i++) {
                    var percent = Math.round((typeEntries[i][1] / maxCount) * 100);
                    var disasterType = _getDisasterTypes().find(function(dt) { return dt.name === typeEntries[i][0] || dt.id === typeEntries[i][0]; });
                    var icon = disasterType ? (disasterType.icon || '⌇') : '⌇';
                    html +=
                        '<div style="display: flex; align-items: center; gap: 8px; font-size: 0.65rem; padding: 2px 0;">' +
                        '<span style="font-size: 0.7rem;">' + icon + '</span>' +
                        '<span style="min-width: 60px;">' + _escapeHtml(typeEntries[i][0]) + '</span>' +
                        '<div style="flex: 1; height: 6px; background: var(--bg2); border-radius: 3px; overflow: hidden;">' +
                        '<div style="width: ' + percent + '%; height: 100%; background: var(--accent); border-radius: 3px;"></div>' +
                        '</div>' +
                        '<span style="min-width: 30px; text-align: right;">' + typeEntries[i][1] + '</span>' +
                        '</div>';
                }
                html += '</div>';
            }

            // Severity distribution
            if (severityStats.distribution) {
                var dist = severityStats.distribution;
                var total = dist.low + dist.medium + dist.high + dist.critical;
                if (total > 0) {
                    html +=
                        '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 4px; margin-bottom: 12px;">' +
                        '<div style="padding: 6px; background: var(--bg3); border-radius: 4px; text-align: center; font-size: 0.55rem;">' +
                        'Low: ' + Math.round((dist.low / total) * 100) + '%' +
                        '</div>' +
                        '<div style="padding: 6px; background: var(--bg3); border-radius: 4px; text-align: center; font-size: 0.55rem;">' +
                        'Medium: ' + Math.round((dist.medium / total) * 100) + '%' +
                        '</div>' +
                        '<div style="padding: 6px; background: var(--bg3); border-radius: 4px; text-align: center; font-size: 0.55rem;">' +
                        'High: ' + Math.round((dist.high / total) * 100) + '%' +
                        '</div>' +
                        '<div style="padding: 6px; background: var(--bg3); border-radius: 4px; text-align: center; font-size: 0.55rem;">' +
                        'Critical: ' + Math.round((dist.critical / total) * 100) + '%' +
                        '</div>' +
                        '</div>';
                }
            }

            // Deadliest
            if (stats.deadliest) {
                var d = stats.deadliest;
                html +=
                    '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; margin-bottom: 8px; font-size: 0.6rem;">' +
                    '<span style="color: var(--dim);">Deadliest: </span>' +
                    _escapeHtml(d.disasterType || 'Unknown') + ' (' + (d.year || 'Unknown') + ') - ' +
                    (d.deaths || 0) + ' deaths' +
                    (d.locationName ? ' at ' + _escapeHtml(d.locationName) : '') +
                    '</div>';
            }

            // Most recent
            if (stats.mostRecent) {
                var r = stats.mostRecent;
                html +=
                    '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.6rem;">' +
                    '<span style="color: var(--dim);">Most Recent: </span>' +
                    _escapeHtml(r.disasterType || 'Unknown') + ' (' + (r.year || 'Unknown') + ')' +
                    (r.locationName ? ' at ' + _escapeHtml(r.locationName) : '') +
                    '</div>';
            }

            html += '</div>';

            container.innerHTML = html;
            return true;

        } catch (e) {
            return false;
        } finally {
            _processingRender = false;
        }
    }

    // =========================================================================
    // 3. RENDER DISASTER LIST
    // =========================================================================

    function renderDisasterList(containerId, disasters, options) {
        if (_processingRender) return false;
        _processingRender = true;

        try {
            var container = document.getElementById(containerId);
            if (!container) return false;

            options = options || {};
            var showActions = options.showActions !== undefined ? options.showActions : true;
            var emptyMessage = options.emptyMessage || 'No disasters recorded';
            var limit = options.limit || 0;

            if (!disasters) {
                disasters = window.DisasterQueries.getAllDisasters();
            }

            // Sort by year (most recent first)
            disasters = disasters.slice().sort(function(a, b) {
                return (b.year || 0) - (a.year || 0);
            });

            if (limit > 0 && disasters.length > limit) {
                disasters = disasters.slice(0, limit);
            }

            if (disasters.length === 0) {
                container.innerHTML = 
                    '<div style="text-align: center; padding: 40px; color: var(--dim); font-size: 0.7rem;">' + 
                    _escapeHtml(emptyMessage) + 
                    '</div>';
                return true;
            }

            var disasterTypes = _getDisasterTypes();

            var html = '<div class="disaster-list">';

            for (var i = 0; i < disasters.length; i++) {
                var d = disasters[i];
                var disasterType = disasterTypes.find(function(dt) { 
                    return dt.id === d.disasterId || dt.name === d.disasterType; 
                });
                var icon = disasterType ? (disasterType.icon || '⌇') : '⌇';

                var severityColor = d.severity >= 70 ? '#c84444' :
                                   d.severity >= 50 ? '#c87040' :
                                   d.severity >= 30 ? '#c8a040' : '#4a9060';

                var location = d.locationId ? _getPlaceById(d.locationId) : null;
                var locationName = location ? location.displayName : (d.locationName || 'Unknown');

                html +=
                    '<div class="disaster-item" style="' +
                    'padding: 10px 12px;' +
                    'margin-bottom: 6px;' +
                    'background: var(--bg3);' +
                    'border-radius: 6px;' +
                    'border-left: 4px solid ' + severityColor + ';' +
                    'cursor: pointer;' +
                    'transition: background 0.2s;' +
                    '" data-disaster-id="' + _escapeHtml(d.id) + '">' +
                    '<div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 4px;">' +
                    '<div style="flex: 1; min-width: 0;">' +
                    '<div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">' +
                    '<span style="font-size: 0.6rem;">' + icon + '</span>' +
                    '<span style="font-size: 0.7rem; font-weight: bold;">' + _escapeHtml(d.disasterType || 'Unknown') + '</span>' +
                    '<span style="font-size: 0.5rem; color: var(--dim);">' + (d.year || 'Unknown') + '</span>' +
                    '<span style="font-size: 0.5rem; color: ' + severityColor + ';">Severity: ' + (d.severity || 0) + '</span>' +
                    '</div>' +
                    '<div style="font-size: 0.6rem; color: var(--dim);">' +
                    _escapeHtml(locationName) +
                    (d.deaths ? ' · ' + d.deaths + ' deaths' : '') +
                    (d.prosperityLoss ? ' · -' + d.prosperityLoss + ' prosperity' : '') +
                    '</div>' +
                    (d.description ? '<div style="font-size: 0.55rem; color: var(--dim);">' + _escapeHtml(d.description.substring(0, 80)) + (d.description.length > 80 ? '...' : '') + '</div>' : '') +
                    '</div>' +
                    (showActions ? '<div style="display: flex; gap: 4px; flex-shrink: 0;">' +
                        '<button class="disaster-detail-btn" style="padding: 2px 8px; font-size: 0.5rem; background: var(--bg2); border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">Details</button>' +
                        '</div>' : '') +
                    '</div>' +
                    '</div>';
            }

            html += '</div>';
            container.innerHTML = html;

            // Attach click handlers
            var items = container.querySelectorAll('.disaster-item');
            for (var i = 0; i < items.length; i++) {
                (function(item) {
                    var disasterId = item.dataset.disasterId;
                    var detailBtn = item.querySelector('.disaster-detail-btn');

                    if (detailBtn) {
                        detailBtn.addEventListener('click', function(e) {
                            e.stopPropagation();
                            _openDisasterDetailsModal(disasterId);
                        });
                    }

                    item.addEventListener('click', function() {
                        _openDisasterDetailsModal(disasterId);
                    });
                })(items[i]);
            }

            return true;

        } catch (e) {
            return false;
        } finally {
            _processingRender = false;
        }
    }

    // =========================================================================
    // 4. RENDER DISASTER CHART
    // =========================================================================

    function renderDisasterChart(containerId, data, type) {
        if (_processingRender) return false;
        _processingRender = true;

        try {
            var container = document.getElementById(containerId);
            if (!container) return false;

            type = type || 'type';

            var html = '<div class="disaster-chart" style="padding: 8px 0;">';

            if (type === 'type') {
                var entries = Object.entries(data).sort(function(a, b) { return b[1] - a[1]; });
                var maxVal = entries.length > 0 ? entries[0][1] : 1;
                var disasterTypes = _getDisasterTypes();

                for (var i = 0; i < entries.length; i++) {
                    var percent = Math.round((entries[i][1] / maxVal) * 100);
                    var dt = disasterTypes.find(function(d) { return d.name === entries[i][0] || d.id === entries[i][0]; });
                    var icon = dt ? (dt.icon || '⌇') : '⌇';
                    var barColor = percent > 70 ? '#c84444' : 
                                   percent > 40 ? '#c87040' : '#4a9060';

                    html +=
                        '<div style="display: flex; align-items: center; gap: 8px; font-size: 0.65rem; padding: 3px 0;">' +
                        '<span style="font-size: 0.7rem;">' + icon + '</span>' +
                        '<span style="min-width: 80px;">' + _escapeHtml(entries[i][0]) + '</span>' +
                        '<div style="flex: 1; height: 8px; background: var(--bg2); border-radius: 4px; overflow: hidden;">' +
                        '<div style="width: ' + percent + '%; height: 100%; background: ' + barColor + '; border-radius: 4px; transition: width 0.5s;"></div>' +
                        '</div>' +
                        '<span style="min-width: 30px; text-align: right;">' + entries[i][1] + '</span>' +
                        '</div>';
                }
            } else if (type === 'yearly') {
                var years = Object.keys(data).sort();
                var maxVal = 0;
                for (var i = 0; i < years.length; i++) {
                    if (data[years[i]] > maxVal) maxVal = data[years[i]];
                }
                maxVal = Math.max(1, maxVal);

                for (var i = 0; i < years.length; i++) {
                    var year = years[i];
                    var total = data[year] || 0;
                    var barPercent = Math.round((total / maxVal) * 100);

                    html +=
                        '<div style="margin-bottom: 4px;">' +
                        '<div style="display: flex; justify-content: space-between; font-size: 0.55rem; color: var(--dim);">' +
                        '<span>' + _escapeHtml(year) + '</span>' +
                        '<span>' + total + ' disasters</span>' +
                        '</div>' +
                        '<div style="display: flex; height: 6px; background: var(--bg2); border-radius: 3px; overflow: hidden;">' +
                        '<div style="width: ' + barPercent + '%; height: 100%; background: var(--accent); border-radius: 3px;"></div>' +
                        '</div>' +
                        '</div>';
                }
            }

            html += '</div>';
            container.innerHTML = html;
            return true;

        } catch (e) {
            return false;
        } finally {
            _processingRender = false;
        }
    }

    // =========================================================================
    // 5. RENDER RISK INDICATOR
    // =========================================================================

    function renderRiskIndicator(containerId, locationId) {
        if (_processingRender) return false;
        _processingRender = true;

        try {
            var container = document.getElementById(containerId);
            if (!container) return false;

            var risk = window.DisasterQueries.getLocationDisasterRisk(locationId);
            var locationName = locationId ? _getPlaceName(locationId) : 'Unknown';

            var riskColors = {
                low: '#4a9060',
                moderate: '#c8a040',
                high: '#c87040',
                critical: '#c84444'
            };

            var riskLevels = {
                low: 'Low',
                moderate: 'Moderate',
                high: 'High',
                critical: 'Critical'
            };

            var color = riskColors[risk.level] || '#4a9060';

            var html =
                '<div class="disaster-risk-indicator" style="' +
                'padding: 12px;' +
                'background: var(--bg3);' +
                'border-radius: 6px;' +
                'border-left: 4px solid ' + color + ';' +
                '">' +
                '<div style="display: flex; justify-content: space-between; align-items: center;">' +
                '<div>' +
                '<div style="font-size: 0.5rem; color: var(--dim);">Disaster Risk</div>' +
                '<div style="font-size: 0.8rem; font-weight: bold;">' + _escapeHtml(locationName) + '</div>' +
                '</div>' +
                '<div style="text-align: right;">' +
                '<div style="font-size: 0.8rem; font-weight: bold; color: ' + color + ';">' + riskLevels[risk.level] + '</div>' +
                '<div style="font-size: 0.5rem; color: var(--dim);">Score: ' + Math.round(risk.score) + '/100</div>' +
                '</div>' +
                '</div>' +
                '<div style="margin-top: 8px; height: 4px; background: var(--bg2); border-radius: 2px; overflow: hidden;">' +
                '<div style="width: ' + Math.min(100, risk.score) + '%; height: 100%; background: ' + color + '; border-radius: 2px;"></div>' +
                '</div>' +
                '<div style="display: flex; justify-content: space-between; margin-top: 4px; font-size: 0.45rem; color: var(--dim);">' +
                '<span>History: ' + risk.history + ' disaster(s)</span>' +
                '<span>Deaths: ' + risk.totalDeaths + '</span>' +
                '</div>' +
                (risk.mostCommon ? '<div style="font-size: 0.5rem; color: var(--dim); margin-top: 4px;">Most common: ' + _escapeHtml(risk.mostCommon) + '</div>' : '') +
                '</div>';

            container.innerHTML = html;
            return true;

        } catch (e) {
            return false;
        } finally {
            _processingRender = false;
        }
    }

    // =========================================================================
    // 6. REFRESH ALL
    // =========================================================================

    function refreshAll(locationId) {
        // Find all disaster stats panels
        var panels = document.querySelectorAll('.disaster-stats-panel');
        for (var i = 0; i < panels.length; i++) {
            var container = panels[i].parentElement;
            if (container && container.id) {
                renderStatsPanel(container.id, locationId);
            }
        }

        // Find all disaster lists
        var lists = document.querySelectorAll('.disaster-list');
        for (var i = 0; i < lists.length; i++) {
            var container = lists[i].parentElement;
            if (container && container.id) {
                var disasters = locationId ? 
                    window.DisasterQueries.getDisastersByLocation(locationId) :
                    window.DisasterQueries.getAllDisasters();
                renderDisasterList(container.id, disasters);
            }
        }

        // Find all risk indicators
        var indicators = document.querySelectorAll('.disaster-risk-indicator');
        for (var i = 0; i < indicators.length; i++) {
            var container = indicators[i].parentElement;
            if (container && container.id) {
                renderRiskIndicator(container.id, locationId);
            }
        }
    }

    // =========================================================================
    // 7. EXPORTS
    // =========================================================================

    window.DisasterStatsUI = {
        renderStatsPanel: renderStatsPanel,
        renderDisasterList: renderDisasterList,
        renderDisasterChart: renderDisasterChart,
        renderRiskIndicator: renderRiskIndicator,
        refreshAll: refreshAll
    };

    // Legacy aliases
    window._disasterStatsUI = window.DisasterStatsUI;

})();