/**
 * =============================================================================
 * STILL WATERS - DISASTER STATISTICS UI (disaster-ui-stats.js)
 * =============================================================================
 *
 * LOCATION: js/core/disaster/disaster-ui-stats.js
 *
 * PURPOSE:
 *   Rendering for disaster statistics panels, disaster lists, damage
 *   summaries, and risk indicators. Consumes DisasterViewModels only.
 *   Does not call DisasterQueries directly for presentation-shape data;
 *   it calls queries for raw domain reads and passes the results through
 *   view models before rendering.
 *
 * CONTRACT:
 *   - Every renderer takes a container (id or element) and view-model
 *     input. Callers fetch, shape via DisasterViewModels, then render.
 *   - Icons via _getIcon(CrimeViewModels.disasterIconName(...)).
 *   - No inline severity thresholds, no inline band labels, no inline
 *     damage category labels — all from DisasterViewModels.
 *   - No _processingRender guard. Rendering is synchronous; there is no
 *     re-entrancy to protect against.
 *   - Every render function catches its own exceptions, logs them, and
 *     returns false. Silent failure is prohibited.
 *
 * DEPENDENCIES (required, verified at load):
 *   - DisasterViewModels
 *   - DisasterQueries
 *   - DisasterModals (for details / destruction detail modals)
 *   - _escapeHtml
 *   - _getIcon
 *   - getPlaceById (optional; missing → location labels degrade to id)
 *
 * ICON POLICY: No emojis. Icons via _getIcon + VM.disasterIconName.
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. LOAD-TIME DEPENDENCY RESOLUTION
    // =========================================================================

    var VM = window.DisasterViewModels;
    var Queries = window.DisasterQueries;
    var Modals = window.DisasterModals;

    if (!VM)      throw new Error('disaster-ui-stats.js requires DisasterViewModels');
    if (!Queries) throw new Error('disaster-ui-stats.js requires DisasterQueries');
    if (!Modals)  throw new Error('disaster-ui-stats.js requires DisasterModals');

    if (typeof window._escapeHtml !== 'function') {
        throw new Error('disaster-ui-stats.js requires _escapeHtml');
    }
    if (typeof window._getIcon !== 'function') {
        throw new Error('disaster-ui-stats.js requires _getIcon');
    }

    // =========================================================================
    // 1. INTERNAL HELPERS
    // =========================================================================

    function _escape(str) {
        return window._escapeHtml(str);
    }

    function _icon(name) {
        return window._getIcon(name);
    }

    function _resolveContainer(containerOrId) {
        if (!containerOrId) return null;
        if (typeof containerOrId === 'string') {
            return document.getElementById(containerOrId);
        }
        return containerOrId;
    }

    function _placeName(locationId) {
        if (!locationId) return null;
        if (typeof window.getPlaceName === 'function') {
            var name = window.getPlaceName(locationId);
            if (name) return name;
        }
        if (typeof window.getPlaceById === 'function') {
            var p = window.getPlaceById(locationId);
            if (p && p.displayName) return p.displayName;
        }
        return null;
    }

    function _color(token, fallback) {
        if (!token) return fallback || 'var(--accent)';
        return 'var(--' + token + ', ' + (fallback || 'var(--accent)') + ')';
    }

    // =========================================================================
    // 2. STATS PANEL
    // =========================================================================
    //
    // Inputs:
    //   containerOrId — DOM element or id string
    //   locationId    — location id, or null for global stats

    function renderStatsPanel(containerOrId, locationId) {
        var container = _resolveContainer(containerOrId);
        if (!container) return false;

        try {
            var stats = Queries.getDisasterStats(locationId);
            var severity = Queries.getDisasterSeverityStats();
            var locationName = locationId ? _placeName(locationId) : 'Global';

            var vm = VM.toDisasterStatsViewModel(stats, locationName);
            if (!vm) {
                container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--dim);font-size:0.7rem;">' +
                    _escape('Statistics unavailable.') + '</div>';
                return true;
            }
            var severityVm = VM.toSeverityStatsViewModel(severity);

            var html = '<div class="disaster-stats-panel">';

            // Summary cells
            html +=
                '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));' +
                'gap:8px;margin-bottom:16px;">' +
                _statCell('Total Disasters', vm.total, null) +
                _statCell('Total Deaths', vm.totalDeaths, 'warn') +
                _statCell('Prosperity Lost', vm.totalProsperityLoss, 'accent') +
                _statCell('Avg Severity', vm.averageSeverityLabel, null) +
                '</div>';

            // Type distribution
            if (vm.byTypeRows.length > 0) {
                html +=
                    '<div style="padding:12px;background:var(--bg3);border-radius:6px;margin-bottom:12px;">' +
                    '<div style="font-size:0.55rem;color:var(--dim);margin-bottom:8px;">Disaster Types</div>';
                var maxCount = vm.byTypeRows[0].count || 1;
                for (var i = 0; i < vm.byTypeRows.length; i++) {
                    var row = vm.byTypeRows[i];
                    var pct = Math.round((row.count / maxCount) * 100);
                    html +=
                        '<div style="display:flex;align-items:center;gap:8px;font-size:0.65rem;padding:2px 0;">' +
                        '<span style="display:inline-flex;align-items:center;">' +
                        _icon(row.iconName) + '</span>' +
                        '<span style="min-width:80px;">' + _escape(row.typeLabel) + '</span>' +
                        '<div style="flex:1;height:6px;background:var(--bg2);border-radius:3px;overflow:hidden;">' +
                        '<div style="width:' + pct + '%;height:100%;background:var(--accent);border-radius:3px;"></div>' +
                        '</div>' +
                        '<span style="min-width:30px;text-align:right;">' + row.count + '</span>' +
                        '</div>';
                }
                html += '</div>';
            }

            // Severity distribution
            if (severityVm && severityVm.total > 0) {
                html +=
                    '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-bottom:12px;">';
                for (var s = 0; s < severityVm.distribution.length; s++) {
                    var cell = severityVm.distribution[s];
                    html +=
                        '<div style="padding:6px;background:var(--bg3);border-radius:4px;' +
                        'text-align:center;font-size:0.55rem;">' +
                        _escape(cell.label) + ': ' + cell.percent + '%' +
                        '</div>';
                }
                html += '</div>';
            }

            // Deadliest
            if (vm.deadliest) {
                var d = vm.deadliest;
                html +=
                    '<div style="padding:8px;background:var(--bg3);border-radius:6px;' +
                    'margin-bottom:8px;font-size:0.6rem;">' +
                    '<span style="color:var(--dim);">Deadliest: </span>' +
                    _escape(d.type) + ' (' + _escape(d.yearLabel) + ') — ' +
                    d.deaths + ' deaths' +
                    (d.locationName ? ' at ' + _escape(d.locationName) : '') +
                    '</div>';
            }

            // Most recent
            if (vm.mostRecent) {
                var r = vm.mostRecent;
                html +=
                    '<div style="padding:8px;background:var(--bg3);border-radius:6px;font-size:0.6rem;">' +
                    '<span style="color:var(--dim);">Most Recent: </span>' +
                    _escape(r.type) + ' (' + _escape(r.yearLabel) + ')' +
                    (r.locationName ? ' at ' + _escape(r.locationName) : '') +
                    '</div>';
            }

            html += '</div>';
            container.innerHTML = html;
            return true;

        } catch (e) {
            if (typeof console !== 'undefined' && console.error) {
                console.error('disaster-ui-stats.js: renderStatsPanel failed', e);
            }
            container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--dim);font-size:0.7rem;">' +
                _escape('Could not load disaster statistics.') + '</div>';
            return false;
        }
    }

    function _statCell(label, value, colorToken) {
        var style = colorToken ? 'color:var(--' + colorToken + ');' : '';
        return '<div style="padding:12px;background:var(--bg3);border-radius:6px;text-align:center;">' +
            '<div style="font-size:0.5rem;color:var(--dim);">' + _escape(label) + '</div>' +
            '<div style="font-size:1.2rem;font-weight:bold;' + style + '">' + _escape(String(value)) + '</div>' +
            '</div>';
    }

    // =========================================================================
    // 3. DISASTER LIST
    // =========================================================================

    function renderDisasterList(containerOrId, disasters, options) {
        var container = _resolveContainer(containerOrId);
        if (!container) return false;

        try {
            options = options || {};
            var showActions = options.showActions !== false;
            var emptyMessage = options.emptyMessage || 'No disasters recorded';
            var limit = (typeof options.limit === 'number' && options.limit > 0)
                ? options.limit
                : 0;

            if (!Array.isArray(disasters)) {
                disasters = Queries.getAllDisasters();
            }

            // Sort by year desc before shaping (view models preserve order).
            var sorted = disasters.slice().sort(function(a, b) {
                return (b.year || 0) - (a.year || 0);
            });
            if (limit > 0) sorted = sorted.slice(0, limit);

            if (sorted.length === 0) {
                container.innerHTML =
                    '<div style="text-align:center;padding:40px;color:var(--dim);font-size:0.7rem;">' +
                    _escape(emptyMessage) +
                    '</div>';
                return true;
            }

            var vms = VM.toDisasterListItems(sorted);

            var html = '<div class="disaster-list">';
            for (var i = 0; i < vms.length; i++) {
                html += _renderDisasterItem(vms[i], showActions);
            }
            html += '</div>';
            container.innerHTML = html;

            _attachDisasterListHandlers(container);
            return true;

        } catch (e) {
            if (typeof console !== 'undefined' && console.error) {
                console.error('disaster-ui-stats.js: renderDisasterList failed', e);
            }
            container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--dim);font-size:0.7rem;">' +
                _escape('Could not load disasters.') + '</div>';
            return false;
        }
    }

    function _renderDisasterItem(vm, showActions) {
        var color = _color(vm.severityColorToken);
        var icon = _icon(vm.iconName);

        var actionHtml = '';
        if (showActions) {
            actionHtml =
                '<div style="display:flex;gap:4px;flex-shrink:0;">' +
                '<button type="button" class="disaster-detail-btn" ' +
                'data-disaster-id="' + _escape(vm.id) + '" ' +
                'style="padding:2px 8px;font-size:0.5rem;background:var(--bg2);' +
                'border:1px solid var(--border);border-radius:4px;cursor:pointer;">Details</button>';
            if (vm.hasDestruction) {
                actionHtml +=
                    '<button type="button" class="disaster-destruction-btn" ' +
                    'data-disaster-id="' + _escape(vm.id) + '" ' +
                    'style="padding:2px 8px;font-size:0.5rem;background:var(--bg2);' +
                    'border:1px solid var(--warn);border-radius:4px;cursor:pointer;">Destruction</button>';
            }
            actionHtml += '</div>';
        }

        var metaHtml =
            '<div style="font-size:0.6rem;color:var(--dim);">' +
            _escape(vm.locationName) +
            (vm.deaths ? ' · ' + vm.deaths + ' deaths' : '') +
            (vm.prosperityLoss ? ' · -' + vm.prosperityLoss + ' prosperity' : '') +
            (vm.totalLoss ? ' · ' + vm.totalLoss + ' gold lost' : '') +
            '</div>';

        var descHtml = vm.descriptionPreview
            ? '<div style="font-size:0.55rem;color:var(--dim);">' +
              _escape(vm.descriptionPreview) + '</div>'
            : '';

        return '<div class="disaster-item" ' +
            'data-disaster-id="' + _escape(vm.id) + '" ' +
            'style="padding:10px 12px;margin-bottom:6px;background:var(--bg3);' +
            'border-radius:6px;border-left:4px solid ' + color + ';' +
            'cursor:pointer;transition:background 0.2s;">' +
            '<div style="display:flex;justify-content:space-between;align-items:flex-start;' +
            'flex-wrap:wrap;gap:4px;">' +
            '<div style="flex:1;min-width:0;">' +
            '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">' +
            '<span style="display:inline-flex;align-items:center;">' + icon + '</span>' +
            '<span style="font-size:0.7rem;font-weight:bold;">' + _escape(vm.type) + '</span>' +
            '<span style="font-size:0.5rem;color:var(--dim);">' + _escape(vm.yearLabel) + '</span>' +
            '<span style="font-size:0.5rem;color:' + color + ';">' +
            _escape(vm.severityLabel) + '</span>' +
            '</div>' +
            metaHtml + descHtml +
            '</div>' +
            actionHtml +
            '</div>' +
            '</div>';
    }

    function _attachDisasterListHandlers(container) {
        var items = container.querySelectorAll('.disaster-item');
        for (var i = 0; i < items.length; i++) {
            (function(item) {
                var id = item.dataset.disasterId;
                item.addEventListener('click', function(e) {
                    if (e.target.closest('button')) return;
                    if (Modals && typeof Modals.openDisasterDetailsModal === 'function') {
                        Modals.openDisasterDetailsModal(id);
                    }
                });
                var detailBtn = item.querySelector('.disaster-detail-btn');
                if (detailBtn) {
                    detailBtn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        Modals.openDisasterDetailsModal(id);
                    });
                }
                var destBtn = item.querySelector('.disaster-destruction-btn');
                if (destBtn) {
                    destBtn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        _openDestructionModal(id);
                    });
                }
            })(items[i]);
        }
    }

    // =========================================================================
    // 4. DESTRUCTION STATS PANEL
    // =========================================================================

    function renderDestructionStats(containerOrId, locationId) {
        var container = _resolveContainer(containerOrId);
        if (!container) return false;

        try {
            var raw = Queries.getDestructionStatistics(locationId);
            var locationName = locationId ? _placeName(locationId) : 'Global';
            var vm = VM.toDestructionStatsViewModel(raw, locationName);

            if (!vm || vm.totalDisasters === 0) {
                container.innerHTML =
                    '<div style="text-align:center;padding:20px;color:var(--dim);font-size:0.65rem;">' +
                    _escape('No destruction records found.') +
                    '</div>';
                return true;
            }

            var html = '<div class="destruction-stats-panel">';

            // Header
            html += '<div style="margin-bottom:12px;font-size:0.7rem;color:var(--accent);">' +
                'Destruction Statistics: ' + _escape(vm.locationName) +
                '</div>';

            // Summary
            html +=
                '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px;">' +
                _summaryCell('Total Disasters', String(vm.totalDisasters), null) +
                _summaryCell('Total Loss', vm.totalLoss + ' gold', 'warn') +
                _summaryCell('Items Destroyed', String(vm.totalItems), null) +
                '</div>';

            // Category breakdown
            html +=
                '<div style="padding:8px;background:var(--bg3);border-radius:6px;margin-bottom:12px;">' +
                '<div style="font-size:0.55rem;color:var(--dim);margin-bottom:4px;">Structures Destroyed</div>' +
                '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:4px;">';
            for (var b = 0; b < vm.breakdownRows.length; b++) {
                var br = vm.breakdownRows[b];
                html +=
                    '<div style="text-align:center;font-size:0.55rem;">' +
                    '<span style="color:var(--dim);">' + _escape(br.label) + '</span><br>' +
                    '<strong>' + br.count + '</strong>' +
                    '</div>';
            }
            html += '</div></div>';

            // Worst disaster
            if (vm.worstDisaster) {
                var w = vm.worstDisaster;
                html +=
                    '<div style="padding:8px;background:var(--bg3);border-radius:6px;' +
                    'margin-bottom:8px;font-size:0.6rem;">' +
                    '<span style="color:var(--dim);">Worst Disaster: </span>' +
                    _escape(w.type) + ' (' + _escape(w.yearLabel) + ') — ' + w.totalLoss + ' gold lost' +
                    (w.featuresDestroyed ? ' · ' + w.featuresDestroyed + ' features' : '') +
                    (w.schoolsDestroyed ? ' · ' + w.schoolsDestroyed + ' schools' : '') +
                    (w.enterprisesDestroyed ? ' · ' + w.enterprisesDestroyed + ' enterprises' : '') +
                    '</div>';
            }

            // By type
            if (vm.byTypeRows.length > 0) {
                html +=
                    '<div style="padding:8px;background:var(--bg3);border-radius:6px;margin-bottom:8px;">' +
                    '<div style="font-size:0.5rem;color:var(--dim);margin-bottom:4px;">By Disaster Type</div>';
                var shownTypes = Math.min(vm.byTypeRows.length, 5);
                for (var t = 0; t < shownTypes; t++) {
                    var row = vm.byTypeRows[t];
                    html +=
                        '<div style="display:flex;justify-content:space-between;' +
                        'font-size:0.55rem;padding:2px 0;border-bottom:1px solid var(--border);">' +
                        '<span>' + _escape(row.type) + ' (' + row.count + ')</span>' +
                        '<span style="color:var(--warn);">' + row.totalLoss + ' gold</span>' +
                        '</div>';
                }
                html += '</div>';
            }

            html += '</div>';
            container.innerHTML = html;
            return true;

        } catch (e) {
            if (typeof console !== 'undefined' && console.error) {
                console.error('disaster-ui-stats.js: renderDestructionStats failed', e);
            }
            container.innerHTML =
                '<div style="text-align:center;padding:20px;color:var(--dim);font-size:0.65rem;">' +
                _escape('Could not load destruction statistics.') +
                '</div>';
            return false;
        }
    }

    function _summaryCell(label, valueText, colorToken) {
        var style = colorToken ? 'color:var(--' + colorToken + ');' : '';
        return '<div style="padding:8px;background:var(--bg3);border-radius:6px;text-align:center;">' +
            '<div style="font-size:0.5rem;color:var(--dim);">' + _escape(label) + '</div>' +
            '<div style="font-size:1rem;font-weight:bold;' + style + '">' + _escape(valueText) + '</div>' +
            '</div>';
    }

    // =========================================================================
    // 5. DESTROYED ITEMS LIST
    // =========================================================================

    function renderDestroyedItems(containerOrId, disasterId, category) {
        var container = _resolveContainer(containerOrId);
        if (!container) return false;

        try {
            var items = Queries.getDestroyedItems(disasterId, category || null);
            var vms = VM.toDestructionRows(items);

            if (vms.length === 0) {
                container.innerHTML =
                    '<div style="text-align:center;padding:20px;color:var(--dim);font-size:0.65rem;">' +
                    _escape('No destroyed items found.') +
                    '</div>';
                return true;
            }

            var html = '<div class="destroyed-items-list" style="max-height:300px;overflow-y:auto;">';
            for (var i = 0; i < vms.length; i++) {
                var vm = vms[i];
                var color = _color(vm.colorToken);
                html +=
                    '<div style="display:flex;justify-content:space-between;padding:4px 8px;' +
                    'background:var(--bg2);border-radius:4px;margin-bottom:2px;' +
                    'font-size:0.6rem;border-left:2px solid ' + color + ';">' +
                    '<span>' + _escape(vm.name) + '</span>' +
                    '<span style="color:var(--dim);font-size:0.5rem;">' +
                    _escape(vm.categoryLabel) +
                    (vm.yearLabel !== '?' ? ' · ' + _escape(vm.yearLabel) : '') +
                    '</span>' +
                    '</div>';
            }
            html += '</div>';
            container.innerHTML = html;
            return true;

        } catch (e) {
            if (typeof console !== 'undefined' && console.error) {
                console.error('disaster-ui-stats.js: renderDestroyedItems failed', e);
            }
            container.innerHTML =
                '<div style="text-align:center;padding:20px;color:var(--dim);font-size:0.65rem;">' +
                _escape('Could not load destroyed items.') +
                '</div>';
            return false;
        }
    }

    // =========================================================================
    // 6. DISASTER CHART
    // =========================================================================

    function renderDisasterChart(containerOrId, data, type) {
        var container = _resolveContainer(containerOrId);
        if (!container) return false;

        try {
            type = type || 'type';
            var html = '<div class="disaster-chart" style="padding:8px 0;">';

            if (type === 'type') {
                html += _chartTypeBars(data);
            } else if (type === 'yearly') {
                html += _chartYearlyBars(data);
            }

            html += '</div>';
            container.innerHTML = html;
            return true;

        } catch (e) {
            if (typeof console !== 'undefined' && console.error) {
                console.error('disaster-ui-stats.js: renderDisasterChart failed', e);
            }
            return false;
        }
    }

    function _chartTypeBars(distribution) {
        if (!distribution || typeof distribution !== 'object') return '';

        var entries = [];
        for (var key in distribution) {
            if (Object.prototype.hasOwnProperty.call(distribution, key)) {
                entries.push({ type: key, count: distribution[key] });
            }
        }
        entries.sort(function(a, b) { return b.count - a.count; });

        if (entries.length === 0) return '';

        var maxCount = entries[0].count || 1;
        var html = '';
        for (var i = 0; i < entries.length; i++) {
            var e = entries[i];
            var pct = Math.round((e.count / maxCount) * 100);
            var iconName = VM.disasterIconName(e.type);
            html +=
                '<div style="display:flex;align-items:center;gap:8px;font-size:0.65rem;padding:3px 0;">' +
                '<span style="display:inline-flex;align-items:center;">' + _icon(iconName) + '</span>' +
                '<span style="min-width:80px;">' + _escape(e.type) + '</span>' +
                '<div style="flex:1;height:8px;background:var(--bg2);border-radius:4px;overflow:hidden;">' +
                '<div style="width:' + pct + '%;height:100%;background:var(--accent);border-radius:4px;"></div>' +
                '</div>' +
                '<span style="min-width:30px;text-align:right;">' + e.count + '</span>' +
                '</div>';
        }
        return html;
    }

    function _chartYearlyBars(yearlyData) {
        if (!yearlyData || typeof yearlyData !== 'object') return '';

        var years = Object.keys(yearlyData).sort();
        if (years.length === 0) return '';

        var maxVal = 0;
        for (var i = 0; i < years.length; i++) {
            var v = yearlyData[years[i]];
            if (typeof v === 'number' && v > maxVal) maxVal = v;
        }
        maxVal = Math.max(1, maxVal);

        var html = '';
        for (var j = 0; j < years.length; j++) {
            var year = years[j];
            var total = yearlyData[year] || 0;
            var pct = Math.round((total / maxVal) * 100);
            html +=
                '<div style="margin-bottom:4px;">' +
                '<div style="display:flex;justify-content:space-between;' +
                'font-size:0.55rem;color:var(--dim);">' +
                '<span>' + _escape(year) + '</span>' +
                '<span>' + total + ' disasters</span>' +
                '</div>' +
                '<div style="height:6px;background:var(--bg2);border-radius:3px;overflow:hidden;">' +
                '<div style="width:' + pct + '%;height:100%;background:var(--accent);border-radius:3px;"></div>' +
                '</div>' +
                '</div>';
        }
        return html;
    }

    // =========================================================================
    // 7. RISK INDICATOR
    // =========================================================================

    function renderRiskIndicator(containerOrId, locationId) {
        var container = _resolveContainer(containerOrId);
        if (!container) return false;

        try {
            var risk = Queries.getLocationDisasterRisk(locationId);
            var locationName = locationId ? _placeName(locationId) : 'Unknown';
            var vm = VM.toRiskViewModel(risk, locationName);
            if (!vm) {
                container.innerHTML = '';
                return true;
            }

            var color = _color(vm.colorToken);
            var pct = Math.min(100, Math.max(0, vm.score));

            var html =
                '<div class="disaster-risk-indicator" style="padding:12px;' +
                'background:var(--bg3);border-radius:6px;border-left:4px solid ' + color + ';">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;">' +
                '<div>' +
                '<div style="font-size:0.5rem;color:var(--dim);">Disaster Risk</div>' +
                '<div style="font-size:0.8rem;font-weight:bold;">' + _escape(vm.locationName) + '</div>' +
                '</div>' +
                '<div style="text-align:right;">' +
                '<div style="font-size:0.8rem;font-weight:bold;color:' + color + ';">' +
                _escape(vm.levelLabel) + '</div>' +
                '<div style="font-size:0.5rem;color:var(--dim);">Score: ' + _escape(vm.scoreLabel) + '</div>' +
                '</div>' +
                '</div>' +
                '<div style="margin-top:8px;height:4px;background:var(--bg2);border-radius:2px;overflow:hidden;">' +
                '<div style="width:' + pct + '%;height:100%;background:' + color + ';border-radius:2px;"></div>' +
                '</div>' +
                '<div style="display:flex;justify-content:space-between;margin-top:4px;' +
                'font-size:0.45rem;color:var(--dim);">' +
                '<span>History: ' + vm.history + ' disaster(s)</span>' +
                '<span>Deaths: ' + vm.totalDeaths + '</span>' +
                '</div>' +
                (vm.mostCommon
                    ? '<div style="font-size:0.5rem;color:var(--dim);margin-top:4px;">' +
                      'Most common: ' + _escape(vm.mostCommon) + '</div>'
                    : '') +
                '</div>';

            container.innerHTML = html;
            return true;

        } catch (e) {
            if (typeof console !== 'undefined' && console.error) {
                console.error('disaster-ui-stats.js: renderRiskIndicator failed', e);
            }
            return false;
        }
    }

    // =========================================================================
    // 8. DESTRUCTION MODAL HOOK
    // =========================================================================

    function _openDestructionModal(disasterId) {
        if (Modals && typeof Modals.openDestroyedItemsModal === 'function') {
            Modals.openDestroyedItemsModal(disasterId);
        }
    }

    // =========================================================================
    // 9. REFRESH ALL
    // =========================================================================
    //
    // Kept for callers that want to force a re-render of every mounted
    // disaster panel. Uses DOM discovery — the render-registry pattern
    // from crime-ui-stats is not used here because the current callers
    // (disaster modals, external UI) already locate their containers by
    // id. If callers become dynamic, migrate to a render registry the
    // same way crime-ui-stats did.

    function refreshAll(locationId) {
        var panels = document.querySelectorAll('.disaster-stats-panel');
        for (var i = 0; i < panels.length; i++) {
            var p = panels[i].parentElement;
            if (p && p.id) renderStatsPanel(p.id, locationId);
        }

        var lists = document.querySelectorAll('.disaster-list');
        for (var j = 0; j < lists.length; j++) {
            var l = lists[j].parentElement;
            if (l && l.id) {
                var ds = locationId
                    ? Queries.getDisastersByLocation(locationId)
                    : Queries.getAllDisasters();
                renderDisasterList(l.id, ds);
            }
        }

        var indicators = document.querySelectorAll('.disaster-risk-indicator');
        for (var k = 0; k < indicators.length; k++) {
            var r = indicators[k].parentElement;
            if (r && r.id) renderRiskIndicator(r.id, locationId);
        }

        var destPanels = document.querySelectorAll('.destruction-stats-panel');
        for (var d = 0; d < destPanels.length; d++) {
            var dp = destPanels[d].parentElement;
            if (dp && dp.id) renderDestructionStats(dp.id, locationId);
        }
    }

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

    window.DisasterStatsUI = {
        renderStatsPanel: renderStatsPanel,
        renderDisasterList: renderDisasterList,
        renderDisasterChart: renderDisasterChart,
        renderRiskIndicator: renderRiskIndicator,
        renderDestructionStats: renderDestructionStats,
        renderDestroyedItems: renderDestroyedItems,
        refreshAll: refreshAll
    };

    window._disasterStatsUI = window.DisasterStatsUI;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.DisasterStatsUI;
    }

})();
