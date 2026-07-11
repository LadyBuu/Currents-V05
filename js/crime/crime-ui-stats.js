/**
 * =============================================================================
 * STILL WATERS - CRIME STATISTICS UI (crime-ui-stats.js)
 * =============================================================================
 * 
 * LOCATION: js/core/crime/crime-ui-stats.js
 * 
 * This file contains the crime statistics dashboard UI components.
 * 
 * EXPORTED FUNCTIONS:
 *   - CrimeStatsUI.renderStatsPanel(containerId, locationId)
 *   - CrimeStatsUI.renderCrimeList(containerId, crimes, options)
 *   - CrimeStatsUI.renderVendettaList(containerId, vendettas, options)
 *   - CrimeStatsUI.renderCrimeChart(containerId, data, type)
 *   - CrimeStatsUI.refreshAll()
 * 
 * DEPENDENCIES:
 *   - crime-queries.js: CrimeQueries
 *   - crime-commands.js: CrimeCommands
 *   - formatting.js: escapeHtml, formatYear
 *   - accessors.js: getCharacterById, getPlaceById, getPlaceName
 *   - modals-crime.js: CrimeModals
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

    function _getCharacterById(id) {
        if (typeof window.getCharacterById === 'function') {
            return window.getCharacterById(id);
        }
        return null;
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

    function _formatYear(year) {
        if (typeof window.formatYear === 'function') {
            return window.formatYear(year);
        }
        if (year === null || year === undefined) return '?';
        if (year < 0) return Math.abs(year) + ' BC';
        return String(year);
    }

    function _openCrimeDetailsModal(crimeId) {
        if (typeof window.CrimeModals !== 'undefined' && 
            typeof window.CrimeModals.openCrimeDetailsModal === 'function') {
            return window.CrimeModals.openCrimeDetailsModal(crimeId);
        }
        return null;
    }

    function _openVendettaDetailsModal(vendettaId) {
        if (typeof window.CrimeModals !== 'undefined' && 
            typeof window.CrimeModals.openVendettaDetailsModal === 'function') {
            return window.CrimeModals.openVendettaDetailsModal(vendettaId);
        }
        return null;
    }

    // =========================================================================
    // 2. RENDER STATS PANEL
    // =========================================================================

    /**
     * Renders a crime statistics panel
     * @param {string} containerId - Container element ID
     * @param {string} locationId - Optional location ID filter
     * @returns {boolean} Success
     */
    function renderStatsPanel(containerId, locationId) {
        if (_processingRender) return false;
        _processingRender = true;

        try {
            var container = document.getElementById(containerId);
            if (!container) return false;

            var stats;
            if (locationId) {
                stats = window.CrimeQueries.getLocationCrimeStats(locationId);
            } else {
                stats = window.CrimeQueries.getOverallCrimeStats();
            }

            var locationName = locationId ? _getPlaceName(locationId) : 'Global';

            var html = 
                '<div class="crime-stats-panel">' +
                '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; margin-bottom: 16px;">' +
                '<div style="padding: 12px; background: var(--bg3); border-radius: 6px; text-align: center;">' +
                '<div style="font-size: 0.5rem; color: var(--dim);">Total Crimes</div>' +
                '<div style="font-size: 1.2rem; font-weight: bold;">' + (stats.totalCrimes || 0) + '</div>' +
                '</div>' +
                '<div style="padding: 12px; background: var(--bg3); border-radius: 6px; text-align: center;">' +
                '<div style="font-size: 0.5rem; color: var(--dim);">Solve Rate</div>' +
                '<div style="font-size: 1.2rem; font-weight: bold;">' + Math.round(stats.solvedRate || 0) + '%</div>' +
                '</div>' +
                '<div style="padding: 12px; background: var(--bg3); border-radius: 6px; text-align: center;">' +
                '<div style="font-size: 0.5rem; color: var(--dim);">Unsolved</div>' +
                '<div style="font-size: 1.2rem; font-weight: bold;">' + (stats.unsolvedCrimes || 0) + '</div>' +
                '</div>' +
                '<div style="padding: 12px; background: var(--bg3); border-radius: 6px; text-align: center;">' +
                '<div style="font-size: 0.5rem; color: var(--dim);">Recent (5y)</div>' +
                '<div style="font-size: 1.2rem; font-weight: bold;">' + (stats.recentCrimes || 0) + '</div>' +
                '</div>' +
                '</div>';

            // Type distribution
            if (stats.typeDistribution && Object.keys(stats.typeDistribution).length > 0) {
                html +=
                    '<div style="padding: 12px; background: var(--bg3); border-radius: 6px; margin-bottom: 12px;">' +
                    '<div style="font-size: 0.55rem; color: var(--dim); margin-bottom: 8px;">Crime Types</div>';
                var typeEntries = Object.entries(stats.typeDistribution).sort(function(a, b) { return b[1] - a[1]; });
                var maxCount = typeEntries.length > 0 ? typeEntries[0][1] : 1;
                for (var i = 0; i < typeEntries.length; i++) {
                    var percent = Math.round((typeEntries[i][1] / maxCount) * 100);
                    html +=
                        '<div style="display: flex; align-items: center; gap: 8px; font-size: 0.7rem; padding: 2px 0;">' +
                        '<span style="min-width: 60px;">' + _escapeHtml(typeEntries[i][0]) + '</span>' +
                        '<div style="flex: 1; height: 6px; background: var(--bg2); border-radius: 3px; overflow: hidden;">' +
                        '<div style="width: ' + percent + '%; height: 100%; background: var(--accent); border-radius: 3px;"></div>' +
                        '</div>' +
                        '<span style="min-width: 30px; text-align: right;">' + typeEntries[i][1] + '</span>' +
                        '</div>';
                }
                html += '</div>';
            }

            // Severity breakdown
            if (stats.severityBreakdown) {
                html +=
                    '<div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; margin-bottom: 12px;">' +
                    '<div style="padding: 6px; background: var(--bg3); border-radius: 4px; text-align: center; font-size: 0.6rem;">' +
                    'Low: ' + (stats.severityBreakdown.low || 0) +
                    '</div>' +
                    '<div style="padding: 6px; background: var(--bg3); border-radius: 4px; text-align: center; font-size: 0.6rem;">' +
                    'Medium: ' + (stats.severityBreakdown.medium || 0) +
                    '</div>' +
                    '<div style="padding: 6px; background: var(--bg3); border-radius: 4px; text-align: center; font-size: 0.6rem;">' +
                    'High: ' + (stats.severityBreakdown.high || 0) +
                    '</div>' +
                    '<div style="padding: 6px; background: var(--bg3); border-radius: 4px; text-align: center; font-size: 0.6rem;">' +
                    'Critical: ' + (stats.severityBreakdown.critical || 0) +
                    '</div>' +
                    '</div>';
            }

            // Most common
            if (stats.mostCommonCrime) {
                html +=
                    '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.65rem;">' +
                    'Most Common Crime: ' + _escapeHtml(stats.mostCommonCrime) +
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
    // 3. RENDER CRIME LIST
    // =========================================================================

    /**
     * Renders a list of crimes
     * @param {string} containerId - Container element ID
     * @param {Array} crimes - Array of crime objects
     * @param {Object} options - Options
     * @param {boolean} options.showActions - Show action buttons (default: true)
     * @param {string} options.emptyMessage - Message when empty
     * @returns {boolean} Success
     */
    function renderCrimeList(containerId, crimes, options) {
        if (_processingRender) return false;
        _processingRender = true;

        try {
            var container = document.getElementById(containerId);
            if (!container) return false;

            options = options || {};
            var showActions = options.showActions !== undefined ? options.showActions : true;
            var emptyMessage = options.emptyMessage || 'No crimes recorded';

            if (!crimes || crimes.length === 0) {
                container.innerHTML = 
                    '<div style="text-align: center; padding: 40px; color: var(--dim); font-size: 0.7rem;">' + 
                    _escapeHtml(emptyMessage) + 
                    '</div>';
                return true;
            }

            var html = '<div class="crime-list">';

            for (var i = 0; i < crimes.length; i++) {
                var crime = crimes[i];
                var perpetrator = crime.perpetratorId ? _getCharacterById(crime.perpetratorId) : null;
                var victim = crime.victimId ? _getCharacterById(crime.victimId) : null;
                var location = crime.locationId ? _getPlaceById(crime.locationId) : null;

                var statusIcon = crime.solved ? 
                    _getIconSafe('CHECK_SIMPLE') : 
                    _getIconSafe('X_HEAVY');
                var statusColor = crime.solved ? '#4a9060' : '#c84444';
                var statusText = crime.solved ? 'Solved' : 'Unsolved';

                var typeIcon = _getIconSafe('WARNING');

                html +=
                    '<div class="crime-item" style="' +
                    'padding: 10px 12px;' +
                    'margin-bottom: 6px;' +
                    'background: var(--bg3);' +
                    'border-radius: 6px;' +
                    'border-left: 3px solid ' + statusColor + ';' +
                    'cursor: pointer;' +
                    'transition: background 0.2s;' +
                    '" data-crime-id="' + _escapeHtml(crime.id) + '">' +
                    '<div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 4px;">' +
                    '<div style="flex: 1; min-width: 0;">' +
                    '<div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">' +
                    '<span style="font-size: 0.6rem;">' + typeIcon + '</span>' +
                    '<span style="font-size: 0.7rem; font-weight: bold;">' + _escapeHtml(crime.type || 'Unknown') + '</span>' +
                    '<span style="font-size: 0.5rem; color: var(--dim);">' + _formatYear(crime.year) + '</span>' +
                    '<span style="font-size: 0.5rem; color: ' + statusColor + ';">' + statusIcon + ' ' + statusText + '</span>' +
                    '</div>' +
                    '<div style="font-size: 0.6rem; color: var(--dim);">' +
                    (perpetrator ? _escapeHtml(perpetrator.name + (perpetrator.surname ? ' ' + perpetrator.surname : '')) : 'Unknown') +
                    (victim ? ' → ' + _escapeHtml(victim.name + (victim.surname ? ' ' + victim.surname : '')) : '') +
                    (location ? ' @ ' + _escapeHtml(location.displayName) : '') +
                    '</div>' +
                    (crime.reason ? '<div style="font-size: 0.55rem; color: var(--dim);">' + _escapeHtml(crime.reason) + '</div>' : '') +
                    '</div>' +
                    (showActions ? '<div style="display: flex; gap: 4px; flex-shrink: 0;">' +
                        '<button class="crime-detail-btn" style="padding: 2px 8px; font-size: 0.5rem; background: var(--bg2); border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">Details</button>' +
                        '</div>' : '') +
                    '</div>' +
                    '</div>';
            }

            html += '</div>';
            container.innerHTML = html;

            // Attach click handlers
            var items = container.querySelectorAll('.crime-item');
            for (var i = 0; i < items.length; i++) {
                (function(item) {
                    var crimeId = item.dataset.crimeId;
                    var detailBtn = item.querySelector('.crime-detail-btn');
                    if (detailBtn) {
                        detailBtn.addEventListener('click', function(e) {
                            e.stopPropagation();
                            _openCrimeDetailsModal(crimeId);
                        });
                    }
                    item.addEventListener('click', function() {
                        _openCrimeDetailsModal(crimeId);
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
    // 4. RENDER VENDETTA LIST
    // =========================================================================

    /**
     * Renders a list of vendettas
     * @param {string} containerId - Container element ID
     * @param {Array} vendettas - Array of vendetta objects
     * @param {Object} options - Options
     * @param {boolean} options.showActions - Show action buttons (default: true)
     * @param {string} options.emptyMessage - Message when empty
     * @returns {boolean} Success
     */
    function renderVendettaList(containerId, vendettas, options) {
        if (_processingRender) return false;
        _processingRender = true;

        try {
            var container = document.getElementById(containerId);
            if (!container) return false;

            options = options || {};
            var showActions = options.showActions !== undefined ? options.showActions : true;
            var emptyMessage = options.emptyMessage || 'No vendettas recorded';

            if (!vendettas || vendettas.length === 0) {
                container.innerHTML = 
                    '<div style="text-align: center; padding: 40px; color: var(--dim); font-size: 0.7rem;">' + 
                    _escapeHtml(emptyMessage) + 
                    '</div>';
                return true;
            }

            var html = '<div class="vendetta-list">';

            for (var i = 0; i < vendettas.length; i++) {
                var v = vendettas[i];
                
                var statusColors = {
                    'active': '#6a9ecf',
                    'escalated': '#c87040',
                    'resolved': '#4a9060'
                };
                var color = statusColors[v.status] || '#6a9ecf';

                var statusLabels = {
                    'active': 'Active',
                    'escalated': 'Escalated',
                    'resolved': 'Resolved'
                };
                var statusLabel = statusLabels[v.status] || v.status;

                var icon = v.status === 'resolved' ? 
                    _getIconSafe('CHECK_SIMPLE') : 
                    _getIconSafe('FLAG');

                html +=
                    '<div class="vendetta-item" style="' +
                    'padding: 10px 12px;' +
                    'margin-bottom: 6px;' +
                    'background: var(--bg3);' +
                    'border-radius: 6px;' +
                    'border-left: 3px solid ' + color + ';' +
                    'cursor: pointer;' +
                    'transition: background 0.2s;' +
                    '" data-vendetta-id="' + _escapeHtml(v.id) + '">' +
                    '<div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 4px;">' +
                    '<div style="flex: 1; min-width: 0;">' +
                    '<div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">' +
                    '<span style="font-size: 0.6rem;">' + icon + '</span>' +
                    '<span style="font-size: 0.7rem; font-weight: bold;">' + _escapeHtml(v.householdAName || 'Unknown') + ' vs ' + _escapeHtml(v.householdBName || 'Unknown') + '</span>' +
                    '<span style="font-size: 0.5rem; color: ' + color + ';">' + statusLabel + '</span>' +
                    '<span style="font-size: 0.5rem; color: var(--dim);">' + _formatYear(v.startedYear) + '</span>' +
                    '</div>' +
                    '<div style="font-size: 0.6rem; color: var(--dim);">' +
                    'Body count: ' + (v.bodyCount || 0) +
                    (v.cause ? ' | ' + _escapeHtml(v.cause) : '') +
                    '</div>' +
                    '</div>' +
                    (showActions ? '<div style="display: flex; gap: 4px; flex-shrink: 0;">' +
                        '<button class="vendetta-detail-btn" style="padding: 2px 8px; font-size: 0.5rem; background: var(--bg2); border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">Details</button>' +
                        '</div>' : '') +
                    '</div>' +
                    '</div>';
            }

            html += '</div>';
            container.innerHTML = html;

            // Attach click handlers
            var items = container.querySelectorAll('.vendetta-item');
            for (var i = 0; i < items.length; i++) {
                (function(item) {
                    var vendettaId = item.dataset.vendettaId;
                    var detailBtn = item.querySelector('.vendetta-detail-btn');
                    if (detailBtn) {
                        detailBtn.addEventListener('click', function(e) {
                            e.stopPropagation();
                            _openVendettaDetailsModal(vendettaId);
                        });
                    }
                    item.addEventListener('click', function() {
                        _openVendettaDetailsModal(vendettaId);
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
    // 5. RENDER CRIME CHART (Simple Bar Chart)
    // =========================================================================

    /**
     * Renders a simple crime chart
     * @param {string} containerId - Container element ID
     * @param {Object} data - Chart data
     * @param {string} type - 'type' or 'yearly'
     * @returns {boolean} Success
     */
    function renderCrimeChart(containerId, data, type) {
        if (_processingRender) return false;
        _processingRender = true;

        try {
            var container = document.getElementById(containerId);
            if (!container) return false;

            type = type || 'type';

            var html = '<div class="crime-chart" style="padding: 8px 0;">';

            if (type === 'type') {
                var entries = Object.entries(data).sort(function(a, b) { return b[1] - a[1]; });
                var maxVal = entries.length > 0 ? entries[0][1] : 1;

                for (var i = 0; i < entries.length; i++) {
                    var percent = Math.round((entries[i][1] / maxVal) * 100);
                    var barColor = percent > 70 ? '#c84444' : 
                                   percent > 40 ? '#c87040' : '#4a9060';
                    html +=
                        '<div style="display: flex; align-items: center; gap: 8px; font-size: 0.65rem; padding: 3px 0;">' +
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
                    if (data[years[i]].total > maxVal) maxVal = data[years[i]].total;
                }
                maxVal = Math.max(1, maxVal);

                for (var i = 0; i < years.length; i++) {
                    var year = years[i];
                    var total = data[year].total || 0;
                    var solved = data[year].solved || 0;
                    var solvedPercent = total > 0 ? Math.round((solved / total) * 100) : 0;
                    var barPercent = Math.round((total / maxVal) * 100);

                    html +=
                        '<div style="margin-bottom: 4px;">' +
                        '<div style="display: flex; justify-content: space-between; font-size: 0.55rem; color: var(--dim);">' +
                        '<span>' + _escapeHtml(year) + '</span>' +
                        '<span>' + total + ' crimes (' + solvedPercent + '% solved)</span>' +
                        '</div>' +
                        '<div style="display: flex; height: 6px; background: var(--bg2); border-radius: 3px; overflow: hidden;">' +
                        '<div style="width: ' + barPercent + '%; height: 100%; background: var(--accent); border-radius: 3px;"></div>' +
                        '<div style="width: ' + Math.round((solved / maxVal) * 100) + '%; height: 100%; background: #4a9060; border-radius: 3px; margin-left: -2px;"></div>' +
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
    // 6. REFRESH ALL
    // =========================================================================

    /**
     * Refreshes all crime UI components
     * @param {string} locationId - Optional location filter
     */
    function refreshAll(locationId) {
        // Find all crime stats panels
        var panels = document.querySelectorAll('.crime-stats-panel');
        for (var i = 0; i < panels.length; i++) {
            var container = panels[i].parentElement;
            if (container && container.id) {
                renderStatsPanel(container.id, locationId);
            }
        }

        // Find all crime lists
        var lists = document.querySelectorAll('.crime-list');
        for (var i = 0; i < lists.length; i++) {
            var container = lists[i].parentElement;
            if (container && container.id) {
                var crimes = window.CrimeQueries.getAllCrimes();
                if (locationId) {
                    crimes = crimes.filter(function(c) { return c.locationId === locationId; });
                }
                renderCrimeList(container.id, crimes);
            }
        }

        // Find all vendetta lists
        var vLists = document.querySelectorAll('.vendetta-list');
        for (var i = 0; i < vLists.length; i++) {
            var container = vLists[i].parentElement;
            if (container && container.id) {
                var vendettas = window.CrimeQueries.getAllVendettas();
                if (locationId) {
                    vendettas = vendettas.filter(function(v) { 
                        return v.householdAId === locationId || v.householdBId === locationId; 
                    });
                }
                renderVendettaList(container.id, vendettas);
            }
        }
    }

    // =========================================================================
    // 7. EXPORTS
    // =========================================================================

    window.CrimeStatsUI = {
        renderStatsPanel: renderStatsPanel,
        renderCrimeList: renderCrimeList,
        renderVendettaList: renderVendettaList,
        renderCrimeChart: renderCrimeChart,
        refreshAll: refreshAll
    };

    // Legacy aliases
    window._crimeStatsUI = window.CrimeStatsUI;

})();