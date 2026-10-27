/**
 * =============================================================================
 * STILL WATERS - CRIME STATISTICS UI (crime-ui-stats.js)
 * =============================================================================
 *
 * LOCATION: js/crime/crime-ui-stats.js
 *
 * PURPOSE:
 *   Rendering for crime statistics panels, crime lists, vendetta lists, and
 *   simple charts. This module reads from CrimeQueries and delegates to
 *   CrimeModals for detail views. It does not mutate records, does not
 *   calculate statistics, and does not carry its own vocabulary.
 *
 * OWNERSHIP:
 *   - DOM construction for stats panels, lists, and charts
 *   - event wiring (click-to-details)
 *   - render-configuration retention so refresh() rebuilds the same view
 *   - presentation via shared formatters from CrimeModals
 *
 * WHAT THIS MODULE DOES NOT DO:
 *   - It does not re-derive severity bands or crime categories.
 *   - It does not hardcode vendetta status strings.
 *   - It does not carry a fallback crime taxonomy.
 *   - It does not silently swallow render errors.
 *   - It does not compare location identifiers against household identifiers.
 *   - It does not use a module-wide "processing" guard. Rendering is
 *     synchronous; there is no re-entrancy to protect against.
 *
 * CONTRACTS:
 *
 *   Render options are remembered per container. When refresh() is called,
 *   each registered container is re-rendered with the options it was
 *   originally given. showActions, emptyMessage, and other presentation
 *   options are preserved across refresh.
 *
 *   Location filters apply only where a location actually exists on the
 *   underlying record. Crimes have locationId. Vendettas do not. The
 *   vendetta list does not accept a location filter; it accepts a
 *   household filter, which is what actually identifies a vendetta's
 *   participants.
 *
 * DEPENDENCIES (required):
 *   - crime-queries.js: CrimeQueries
 *   - crime-constants.js: CrimeConstants
 *   - modals-crime.js: CrimeModals (for formatters and detail modals)
 *   - formatting.js: escapeHtml, formatYear
 *   - icons.js: getIcon
 *   - accessors.js: getCharacterById, getPlaceById, getPlaceName
 *
 * Missing required dependencies fail loudly.
 *
 * ICON POLICY: No emojis. Icons come from icons.js via CrimeModals.iconForCrimeType
 * and getIcon. Icons are not duplicated in this file.
 *
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. DEPENDENCY RESOLUTION
    // =========================================================================

    function _require(name, obj) {
        if (typeof obj === 'undefined' || obj === null) {
            throw new Error('[CrimeStatsUI] Required dependency ' + name + ' is not available.');
        }
        return obj;
    }

    function _escapeHtml(str) {
        return _require('escapeHtml', window.escapeHtml)(str);
    }

    function _getIcon(name) {
        if (typeof window.getIcon !== 'function') {
            throw new Error('[CrimeStatsUI] Required dependency getIcon is not available.');
        }
        return window.getIcon(name);
    }

    function _formatYear(year) {
        if (typeof window.formatYear === 'function') return window.formatYear(year);
        if (year == null) return '?';
        if (year < 0) return Math.abs(year) + ' BC';
        return String(year);
    }

    function _getCharacterById(id) {
        if (typeof window.getCharacterById !== 'function') return null;
        return window.getCharacterById(id);
    }

    function _getPlaceById(id) {
        if (typeof window.getPlaceById !== 'function') return null;
        return window.getPlaceById(id);
    }

    function _getPlaceName(id) {
        if (typeof window.getPlaceName === 'function') return window.getPlaceName(id);
        var place = _getPlaceById(id);
        return place ? place.displayName : null;
    }

    function _getQueries() {
        return _require('CrimeQueries', window.CrimeQueries);
    }

    function _getConstants() {
        return _require('CrimeConstants', window.CrimeConstants);
    }

    function _getModals() {
        return _require('CrimeModals', window.CrimeModals);
    }

    // Presentation helpers come from CrimeModals. If they are missing, this
    // file falls back to CrimeConstants-derived defaults only.
    function _formatCrimeType(type) {
        var modals = window.CrimeModals;
        if (modals && typeof modals.formatCrimeType === 'function') {
            return modals.formatCrimeType(type);
        }
        return type || 'Unknown';
    }

    function _formatVendettaStatus(status) {
        var modals = window.CrimeModals;
        if (modals && typeof modals.formatVendettaStatus === 'function') {
            return modals.formatVendettaStatus(status);
        }
        return status || 'Unknown';
    }

    function _formatPersonName(character) {
        var modals = window.CrimeModals;
        if (modals && typeof modals.formatPersonName === 'function') {
            return modals.formatPersonName(character);
        }
        if (!character) return 'Unknown';
        var name = character.name || 'Unknown';
        if (character.surname) name += ' ' + character.surname;
        return name;
    }

    function _iconForCrimeType(type) {
        var modals = window.CrimeModals;
        if (modals && typeof modals.iconForCrimeType === 'function') {
            return modals.iconForCrimeType(type);
        }
        return _getIcon('CIRCLE_DOT');
    }

    // =========================================================================
    // 1. RENDER REGISTRY
    // =========================================================================
    //
    // Every render call registers its container, kind, and options here.
    // refresh() iterates the registry and re-renders each container with
    // its original options. This prevents the loss-of-configuration bug
    // that arises from DOM-discovery plus default-argument rendering.

    var _renderRegistry = new Map(); // containerId -> { kind, getData, options }

    function _register(containerId, kind, getData, options) {
        _renderRegistry.set(containerId, {
            kind: kind,
            getData: getData,
            options: options || {}
        });
    }

    function _unregister(containerId) {
        _renderRegistry.delete(containerId);
    }

    // =========================================================================
    // 2. STATS PANEL
    // =========================================================================

    /**
     * Renders a crime statistics panel into the given container.
     *
     * @param {string} containerId
     * @param {Object} [options]
     * @param {string} [options.locationId]  If provided, location-scoped stats.
     * @param {number} [options.year]        Analysis reference year.
     * @param {number} [options.windowYears] Recent-window span. Defaults to 5.
     */
    function renderStatsPanel(containerId, options) {
        options = options || {};

        try {
            var container = document.getElementById(containerId);
            if (!container) {
                console.error('[CrimeStatsUI] renderStatsPanel: container not found:', containerId);
                return false;
            }

            var queries = _getQueries();
            var locationId = options.locationId || null;
            var year = (typeof options.year === 'number') ? options.year : undefined;
            var windowYears = (typeof options.windowYears === 'number') ? options.windowYears : undefined;

            var stats = locationId
                ? queries.getLocationCrimeStats(locationId, year, windowYears)
                : queries.getOverallCrimeStats(year, windowYears);

            var period = stats.period || null;

            var html = '<div class="crime-stats-panel">';

            // Period label so users know what window "recent" refers to.
            if (period) {
                html +=
                    '<div style="font-size: 0.5rem; color: var(--dim); ' +
                    'margin-bottom: 8px;">' +
                    'Window: ' + period.startYear + '–' + period.endYear +
                    ' (' + period.windowYears + 'y)' +
                    '</div>';
            }

            html += _statGrid([
                ['Total Crimes', stats.totalCrimes || 0],
                ['Solve Rate', Math.round(stats.solvedRate || 0) + '%'],
                ['Unsolved', stats.unsolvedCrimes || 0],
                ['Recent', stats.recentCrimes || 0]
            ]);

            if (stats.typeDistribution) {
                html += _typeDistributionBlock(stats.typeDistribution);
            }

            if (stats.severityBreakdown) {
                html += _severityBlock(stats.severityBreakdown);
            }

            if (stats.mostCommonCrime) {
                html += _singleLineBlock('Most Common Crime',
                    _escapeHtml(_formatCrimeType(stats.mostCommonCrime)));
            }

            html += '</div>';
            container.innerHTML = html;

            _register(
                containerId,
                'stats-panel',
                function() { return { locationId: locationId, year: year, windowYears: windowYears }; },
                options
            );

            return true;

        } catch (e) {
            console.error('[CrimeStatsUI] renderStatsPanel failed:', e);
            return false;
        }
    }

    function _statGrid(pairs) {
        var html = '<div style="display: grid; ' +
            'grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); ' +
            'gap: 8px; margin-bottom: 16px;">';
        for (var i = 0; i < pairs.length; i++) {
            html += _statCard(pairs[i][0], pairs[i][1]);
        }
        html += '</div>';
        return html;
    }

    function _statCard(label, value) {
        return '<div style="padding: 12px; background: var(--bg3); ' +
            'border-radius: 6px; text-align: center;">' +
            '<div style="font-size: 0.5rem; color: var(--dim);">' +
            _escapeHtml(label) +
            '</div>' +
            '<div style="font-size: 1.2rem; font-weight: bold;">' +
            _escapeHtml(String(value)) +
            '</div>' +
            '</div>';
    }

    function _typeDistributionBlock(distribution) {
        var entries = Object.keys(distribution)
            .map(function(k) { return [k, distribution[k]]; })
            .sort(function(a, b) { return b[1] - a[1]; });
        if (entries.length === 0) return '';

        var maxVal = entries[0][1] || 1;

        var html = '<div style="padding: 12px; background: var(--bg3); ' +
            'border-radius: 6px; margin-bottom: 12px;">' +
            '<div style="font-size: 0.55rem; color: var(--dim); margin-bottom: 8px;">' +
            'Crime Types' +
            '</div>';

        for (var i = 0; i < entries.length; i++) {
            var percent = Math.round((entries[i][1] / maxVal) * 100);
            html += '<div style="display: flex; align-items: center; gap: 8px; ' +
                'font-size: 0.7rem; padding: 2px 0;">' +
                '<span style="min-width: 80px;">' +
                _escapeHtml(_formatCrimeType(entries[i][0])) +
                '</span>' +
                '<div style="flex: 1; height: 6px; background: var(--bg2); ' +
                'border-radius: 3px; overflow: hidden;">' +
                '<div style="width: ' + percent + '%; height: 100%; ' +
                'background: var(--accent); border-radius: 3px;"></div>' +
                '</div>' +
                '<span style="min-width: 30px; text-align: right;">' +
                entries[i][1] +
                '</span>' +
                '</div>';
        }
        html += '</div>';
        return html;
    }

    function _severityBlock(breakdown) {
        return '<div style="display: grid; grid-template-columns: repeat(4, 1fr); ' +
            'gap: 4px; margin-bottom: 12px;">' +
            _severityCell('Low', breakdown.low || 0) +
            _severityCell('Medium', breakdown.medium || 0) +
            _severityCell('High', breakdown.high || 0) +
            _severityCell('Critical', breakdown.critical || 0) +
            '</div>';
    }

    function _severityCell(label, value) {
        return '<div style="padding: 6px; background: var(--bg3); ' +
            'border-radius: 4px; text-align: center; font-size: 0.6rem;">' +
            _escapeHtml(label) + ': ' + value +
            '</div>';
    }

    function _singleLineBlock(label, value) {
        return '<div style="padding: 8px; background: var(--bg3); ' +
            'border-radius: 6px; font-size: 0.65rem;">' +
            _escapeHtml(label) + ': ' + value +
            '</div>';
    }

    // =========================================================================
    // 3. CRIME LIST
    // =========================================================================

    /**
     * Renders a list of crimes.
     *
     * @param {string} containerId
     * @param {Array} crimes
     * @param {Object} [options]
     * @param {boolean} [options.showActions=true]
     * @param {string} [options.emptyMessage='No crimes recorded']
     */
    function renderCrimeList(containerId, crimes, options) {
        options = options || {};
        var showActions = options.showActions !== false;
        var emptyMessage = options.emptyMessage || 'No crimes recorded';
        var crimesArray = Array.isArray(crimes) ? crimes : [];

        try {
            var container = document.getElementById(containerId);
            if (!container) {
                console.error('[CrimeStatsUI] renderCrimeList: container not found:', containerId);
                return false;
            }

            if (crimesArray.length === 0) {
                container.innerHTML = _emptyState(emptyMessage);
                _register(containerId, 'crime-list',
                    function() { return crimesArray.slice(); },
                    options);
                return true;
            }

            var html = '<div class="crime-list">';
            for (var i = 0; i < crimesArray.length; i++) {
                html += _renderCrimeItem(crimesArray[i], showActions);
            }
            html += '</div>';
            container.innerHTML = html;

            _attachCrimeListHandlers(container);

            _register(containerId, 'crime-list',
                function() { return crimesArray.slice(); },
                options);

            return true;

        } catch (e) {
            console.error('[CrimeStatsUI] renderCrimeList failed:', e);
            return false;
        }
    }

    function _renderCrimeItem(crime, showActions) {
        var perpetrator = crime.perpetratorId ? _getCharacterById(crime.perpetratorId) : null;
        var victim = crime.victimId ? _getCharacterById(crime.victimId) : null;
        var locationName = crime.locationId ? _getPlaceName(crime.locationId) : null;

        var statusIcon = crime.solved ? _getIcon('CHECK_SIMPLE') : _getIcon('X_HEAVY');
        var statusColor = crime.solved ? '#4a9060' : '#c84444';
        var statusText = crime.solved ? 'Solved' : 'Unsolved';

        var typeIcon = _iconForCrimeType(crime.type);

        var perpetratorName = crime.perpetratorName ||
            (perpetrator ? _formatPersonName(perpetrator) : 'Unknown');
        var victimName = crime.victimName ||
            (victim ? _formatPersonName(victim) : null);

        return '<div class="crime-item" ' +
            'style="padding: 10px 12px; margin-bottom: 6px; background: var(--bg3); ' +
            'border-radius: 6px; border-left: 3px solid ' + statusColor + '; ' +
            'cursor: pointer; transition: background 0.2s;" ' +
            'data-crime-id="' + _escapeHtml(crime.id) + '">' +
            '<div style="display: flex; justify-content: space-between; ' +
            'align-items: flex-start; flex-wrap: wrap; gap: 4px;">' +
            '<div style="flex: 1; min-width: 0;">' +
            '<div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">' +
            '<span style="font-size: 0.6rem;">' + typeIcon + '</span>' +
            '<span style="font-size: 0.7rem; font-weight: bold;">' +
            _escapeHtml(_formatCrimeType(crime.type)) +
            '</span>' +
            '<span style="font-size: 0.5rem; color: var(--dim);">' +
            _escapeHtml(_formatYear(crime.year)) +
            '</span>' +
            '<span style="font-size: 0.5rem; color: ' + statusColor + ';">' +
            statusIcon + ' ' + _escapeHtml(statusText) +
            '</span>' +
            '</div>' +
            '<div style="font-size: 0.6rem; color: var(--dim);">' +
            _escapeHtml(perpetratorName) +
            (victimName ? ' → ' + _escapeHtml(victimName) : '') +
            (locationName ? ' @ ' + _escapeHtml(locationName) : '') +
            '</div>' +
            (crime.reason
                ? '<div style="font-size: 0.55rem; color: var(--dim);">' +
                  _escapeHtml(crime.reason) + '</div>'
                : '') +
            '</div>' +
            (showActions
                ? '<div style="display: flex; gap: 4px; flex-shrink: 0;">' +
                  '<button class="crime-detail-btn" style="padding: 2px 8px; ' +
                  'font-size: 0.5rem; background: var(--bg2); ' +
                  'border: 1px solid var(--border); border-radius: 4px; ' +
                  'cursor: pointer;">Details</button>' +
                  '</div>'
                : '') +
            '</div>' +
            '</div>';
    }

    function _attachCrimeListHandlers(container) {
        var items = container.querySelectorAll('.crime-item');
        for (var i = 0; i < items.length; i++) {
            (function(item) {
                var crimeId = item.dataset.crimeId;
                var detailBtn = item.querySelector('.crime-detail-btn');
                if (detailBtn) {
                    detailBtn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        _getModals().openCrimeDetailsModal(crimeId);
                    });
                }
                item.addEventListener('click', function() {
                    _getModals().openCrimeDetailsModal(crimeId);
                });
            })(items[i]);
        }
    }

    // =========================================================================
    // 4. VENDETTA LIST
    // =========================================================================
    //
    // Vendettas do not have a location. They have participants. Any filter
    // on this renderer must therefore be by household, not by location.

    var _VENDETTA_STATUS_COLORS = {
        active: '#6a9ecf',
        escalated: '#c87040',
        resolved: '#4a9060'
    };

    /**
     * Renders a list of vendettas.
     *
     * @param {string} containerId
     * @param {Array} vendettas
     * @param {Object} [options]
     * @param {boolean} [options.showActions=true]
     * @param {string} [options.emptyMessage='No vendettas recorded']
     */
    function renderVendettaList(containerId, vendettas, options) {
        options = options || {};
        var showActions = options.showActions !== false;
        var emptyMessage = options.emptyMessage || 'No vendettas recorded';
        var vendettasArray = Array.isArray(vendettas) ? vendettas : [];

        try {
            var container = document.getElementById(containerId);
            if (!container) {
                console.error('[CrimeStatsUI] renderVendettaList: container not found:', containerId);
                return false;
            }

            if (vendettasArray.length === 0) {
                container.innerHTML = _emptyState(emptyMessage);
                _register(containerId, 'vendetta-list',
                    function() { return vendettasArray.slice(); },
                    options);
                return true;
            }

            var html = '<div class="vendetta-list">';
            for (var i = 0; i < vendettasArray.length; i++) {
                html += _renderVendettaItem(vendettasArray[i], showActions);
            }
            html += '</div>';
            container.innerHTML = html;

            _attachVendettaListHandlers(container);

            _register(containerId, 'vendetta-list',
                function() { return vendettasArray.slice(); },
                options);

            return true;

        } catch (e) {
            console.error('[CrimeStatsUI] renderVendettaList failed:', e);
            return false;
        }
    }

    function _renderVendettaItem(vendetta, showActions) {
        var constants = _getConstants();
        var statusKey = vendetta.status;
        var color = _VENDETTA_STATUS_COLORS[statusKey] || '#6a9ecf';
        var statusLabel = _formatVendettaStatus(statusKey);

        var icon = (statusKey === constants.VENDETTA_STATUS.RESOLVED)
            ? _getIcon('CHECK_SIMPLE')
            : _getIcon('FLAG');

        var deathCount = Array.isArray(vendetta.deaths)
            ? vendetta.deaths.length
            : 0;

        return '<div class="vendetta-item" ' +
            'style="padding: 10px 12px; margin-bottom: 6px; background: var(--bg3); ' +
            'border-radius: 6px; border-left: 3px solid ' + color + '; ' +
            'cursor: pointer; transition: background 0.2s;" ' +
            'data-vendetta-id="' + _escapeHtml(vendetta.id) + '">' +
            '<div style="display: flex; justify-content: space-between; ' +
            'align-items: flex-start; flex-wrap: wrap; gap: 4px;">' +
            '<div style="flex: 1; min-width: 0;">' +
            '<div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">' +
            '<span style="font-size: 0.6rem;">' + icon + '</span>' +
            '<span style="font-size: 0.7rem; font-weight: bold;">' +
            _escapeHtml(vendetta.householdAName || 'Unknown') +
            ' vs ' +
            _escapeHtml(vendetta.householdBName || 'Unknown') +
            '</span>' +
            '<span style="font-size: 0.5rem; color: ' + color + ';">' +
            _escapeHtml(statusLabel) +
            '</span>' +
            '<span style="font-size: 0.5rem; color: var(--dim);">' +
            _escapeHtml(_formatYear(vendetta.startedYear)) +
            '</span>' +
            '</div>' +
            '<div style="font-size: 0.6rem; color: var(--dim);">' +
            'Deaths: ' + deathCount +
            (vendetta.cause ? ' | ' + _escapeHtml(vendetta.cause) : '') +
            '</div>' +
            '</div>' +
            (showActions
                ? '<div style="display: flex; gap: 4px; flex-shrink: 0;">' +
                  '<button class="vendetta-detail-btn" style="padding: 2px 8px; ' +
                  'font-size: 0.5rem; background: var(--bg2); ' +
                  'border: 1px solid var(--border); border-radius: 4px; ' +
                  'cursor: pointer;">Details</button>' +
                  '</div>'
                : '') +
            '</div>' +
            '</div>';
    }

    function _attachVendettaListHandlers(container) {
        var items = container.querySelectorAll('.vendetta-item');
        for (var i = 0; i < items.length; i++) {
            (function(item) {
                var vendettaId = item.dataset.vendettaId;
                var detailBtn = item.querySelector('.vendetta-detail-btn');
                if (detailBtn) {
                    detailBtn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        _getModals().openVendettaDetailsModal(vendettaId);
                    });
                }
                item.addEventListener('click', function() {
                    _getModals().openVendettaDetailsModal(vendettaId);
                });
            })(items[i]);
        }
    }

    // =========================================================================
    // 5. CHART
    // =========================================================================

    /**
     * Renders a simple bar chart.
     *
     * @param {string} containerId
     * @param {Object} data
     * @param {string} [type='type']  'type' for crime-type distribution,
     *                                'yearly' for year-bucketed counts.
     */
    function renderCrimeChart(containerId, data, type) {
        type = type || 'type';
        var payload = data || {};

        try {
            var container = document.getElementById(containerId);
            if (!container) {
                console.error('[CrimeStatsUI] renderCrimeChart: container not found:', containerId);
                return false;
            }

            var html = '<div class="crime-chart" style="padding: 8px 0;">';

            if (type === 'type') {
                html += _chartTypeBars(payload);
            } else if (type === 'yearly') {
                html += _chartYearlyBars(payload);
            }

            html += '</div>';
            container.innerHTML = html;

            _register(containerId, 'chart',
                function() { return { data: payload, type: type }; },
                {});

            return true;

        } catch (e) {
            console.error('[CrimeStatsUI] renderCrimeChart failed:', e);
            return false;
        }
    }

    function _chartTypeBars(distribution) {
        var entries = Object.keys(distribution)
            .map(function(k) { return [k, distribution[k]]; })
            .sort(function(a, b) { return b[1] - a[1]; });
        if (entries.length === 0) return _emptyState('No data');

        var maxVal = entries[0][1] || 1;
        var html = '';

        for (var i = 0; i < entries.length; i++) {
            var percent = Math.round((entries[i][1] / maxVal) * 100);
            var barColor = percent > 70 ? '#c84444'
                : percent > 40 ? '#c87040'
                : '#4a9060';
            html += '<div style="display: flex; align-items: center; gap: 8px; ' +
                'font-size: 0.65rem; padding: 3px 0;">' +
                '<span style="min-width: 80px;">' +
                _escapeHtml(_formatCrimeType(entries[i][0])) +
                '</span>' +
                '<div style="flex: 1; height: 8px; background: var(--bg2); ' +
                'border-radius: 4px; overflow: hidden;">' +
                '<div style="width: ' + percent + '%; height: 100%; ' +
                'background: ' + barColor + '; border-radius: 4px;"></div>' +
                '</div>' +
                '<span style="min-width: 30px; text-align: right;">' +
                entries[i][1] +
                '</span>' +
                '</div>';
        }
        return html;
    }

    function _chartYearlyBars(yearlyData) {
        var years = Object.keys(yearlyData).sort();
        if (years.length === 0) return _emptyState('No data');

        var maxVal = 0;
        for (var i = 0; i < years.length; i++) {
            var bucket = yearlyData[years[i]] || {};
            if ((bucket.total || 0) > maxVal) maxVal = bucket.total || 0;
        }
        maxVal = Math.max(1, maxVal);

        var html = '';
        for (var j = 0; j < years.length; j++) {
            var y = years[j];
            var b = yearlyData[y] || {};
            var total = b.total || 0;
            var solved = b.solved || 0;

            var totalPercent = Math.round((total / maxVal) * 100);
            var solvedPercentOfTotal = total > 0
                ? Math.round((solved / total) * 100)
                : 0;

            html += '<div style="margin-bottom: 4px;">' +
                '<div style="display: flex; justify-content: space-between; ' +
                'font-size: 0.55rem; color: var(--dim);">' +
                '<span>' + _escapeHtml(y) + '</span>' +
                '<span>' + total + ' crimes (' + solvedPercentOfTotal + '% solved)</span>' +
                '</div>' +
                '<div style="display: flex; height: 6px; background: var(--bg2); ' +
                'border-radius: 3px; overflow: hidden; width: ' + totalPercent + '%;">' +
                '<div style="flex: ' + (solved || 0) + '; background: #4a9060;"></div>' +
                '<div style="flex: ' + Math.max(0, total - solved) +
                '; background: var(--accent);"></div>' +
                '</div>' +
                '</div>';
        }
        return html;
    }

    // =========================================================================
    // 6. EMPTY STATE
    // =========================================================================

    function _emptyState(message) {
        return '<div style="text-align: center; padding: 40px; ' +
            'color: var(--dim); font-size: 0.7rem;">' +
            _escapeHtml(message) +
            '</div>';
    }

    // =========================================================================
    // 7. REFRESH
    // =========================================================================

    /**
     * Re-renders every registered component with the options it was
     * originally rendered with. This preserves showActions, emptyMessage,
     * location filters, and any other presentation configuration.
     *
     * If no components are registered (e.g. fresh page), this is a no-op.
     */
    function refreshAll() {
        var entries = Array.from(_renderRegistry.entries());
        for (var i = 0; i < entries.length; i++) {
            var containerId = entries[i][0];
            var registration = entries[i][1];
            try {
                _refreshOne(containerId, registration);
            } catch (e) {
                console.error('[CrimeStatsUI] refresh failed for container ' +
                    containerId + ':', e);
            }
        }
    }

    function _refreshOne(containerId, registration) {
        switch (registration.kind) {
            case 'stats-panel':
                renderStatsPanel(containerId, registration.options);
                return;
            case 'crime-list': {
                var crimes = registration.getData ? registration.getData() : [];
                renderCrimeList(containerId, crimes, registration.options);
                return;
            }
            case 'vendetta-list': {
                var vendettas = registration.getData ? registration.getData() : [];
                renderVendettaList(containerId, vendettas, registration.options);
                return;
            }
            case 'chart': {
                var payload = registration.getData ? registration.getData() : {};
                renderCrimeChart(containerId, payload.data, payload.type);
                return;
            }
            default:
                return;
        }
    }

    /**
     * Removes a container from the render registry. Call this when a
     * component is being unmounted so refresh() does not attempt to
     * render into a container that is no longer in the DOM.
     */
    function unmount(containerId) {
        _unregister(containerId);
    }

    // =========================================================================
    // 8. EXPORTS
    // =========================================================================

    window.CrimeStatsUI = {
        renderStatsPanel: renderStatsPanel,
        renderCrimeList: renderCrimeList,
        renderVendettaList: renderVendettaList,
        renderCrimeChart: renderCrimeChart,
        refreshAll: refreshAll,
        unmount: unmount
    };

    window._crimeStatsUI = window.CrimeStatsUI;

})();
