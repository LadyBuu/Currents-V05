// js/tabs/government-economy-tab.js
/**
 * =============================================================================
 * ECONOMY DETAILS TAB (js/tabs/government-economy-tab.js)
 * =============================================================================
 *
 * PURPOSE:
 *   Modular tab for viewing and editing economy details aggregated across
 *   an entire settlement hierarchy.
 *
 * =============================================================================
 * SETTLEMENT INTEGRATION STATUS — READ THIS
 * =============================================================================
 *
 * This tab is a PREVIEW for writes. Reads are fully functional — the tab
 * aggregates population, prosperity, crime, justice, watch, and salary
 * budget across the settlement hierarchy using the data already present
 * in each location's settlement record.
 *
 * Writes (Edit modal) route through SettlementState._updateSettlementData,
 * a PRIVATE method. If that method does not exist on your build, every
 * write fails with a visible toast and the modal stays open.
 *
 * What's missing on the settlement side (all of it user-facing):
 *
 *   1. Canonical write commands.
 *      SettlementGovernmentCommands.setProsperity /
 *      setCrimeRate / setSalaryBudget do not exist in this build.
 *
 *   2. Consumer integration.
 *      prosperity / crimeRate / justiceSeverity / watch / salaryBudget
 *      are written to each location's settlement record and read back by
 *      this tab and by the government departments tab. No other system
 *      consults them.
 *
 *   3. Canonical enum for justice severity.
 *      The tab uses 'lenient' | 'medium' | 'harsh' | 'extreme' locally.
 *      If SettlementGovernmentDefinitions defines a canonical set, this
 *      tab's values are not guaranteed to match it.
 *
 * What IS wired in this revision:
 *
 *   - Modal API uses titleHtml / contentHtml (key translation).
 *   - Every onMount / onConfirm scoped to root.querySelector.
 *   - Aggregated writes check the _updateSettlementData return per
 *     location and report failures.
 *   - saveMasterData() and invalidateAccessorCaches() run once per
 *     successful batch.
 *   - Banner + integration status panel render on every view.
 *   - All inline style="" attributes removed; every visual is a class
 *     from gov-manager.css, driven by themes.css tokens. Colours are
 *     theme-aware; nothing is hardcoded.
 *
 * =============================================================================
 * DEPENDENCIES (checked at load time):
 *   - accessors.js        (getPlaceById)
 *   - formatting.js       (escapeHtml)
 *   - icons.js            (Icons)
 *   - ui.js               (showToast)
 *   - modals-core.js      (openModal)
 *   - time.js             (getCurrentYear, calculateAge)
 *
 * DEPENDENCIES (checked at call time, integration panel reports
 * presence or absence):
 *   - SettlementState
 *   - window.getSettlementData / getOrCreateSettlementData
 *   - SettlementGovernmentCommands (optional; not used by this tab yet)
 *   - LocationQueries.getCurrentLocationId (optional; raw-field fallback
 *     when absent)
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. LOAD-TIME DEPENDENCY CHECKS
    // =========================================================================

    if (typeof window.escapeHtml !== 'function') {
        throw new Error(
            'government-economy-tab.js: formatting.js (escapeHtml) must ' +
            'load first.'
        );
    }
    if (!window.Icons || typeof window.Icons !== 'object') {
        throw new Error(
            'government-economy-tab.js: icons.js must load first.'
        );
    }
    if (typeof window.openModal !== 'function') {
        throw new Error(
            'government-economy-tab.js: modals-core.js must load first ' +
            '(openModal missing).'
        );
    }
    if (typeof window.getCurrentYear !== 'function') {
        throw new Error(
            'government-economy-tab.js: time.js (getCurrentYear) must ' +
            'load first.'
        );
    }
    if (typeof window.calculateAge !== 'function') {
        throw new Error(
            'government-economy-tab.js: time.js (calculateAge) must load ' +
            'first.'
        );
    }

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getPlaceById(id) {
        return typeof window.getPlaceById === 'function'
            ? window.getPlaceById(id)
            : null;
    }

    function _escapeHtml(value) {
        return window.escapeHtml(value);
    }

    function _getIcon(name) {
        var svg = window.Icons[name];
        return typeof svg === 'string' ? svg : '';
    }

    function _showToast(message, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type || 'info');
        }
    }

    function _openModal(opts) {
        var forwarded = {};
        for (var k in opts) {
            if (Object.prototype.hasOwnProperty.call(opts, k)) {
                forwarded[k] = opts[k];
            }
        }
        if (forwarded.titleHtml === undefined && forwarded.title !== undefined) {
            forwarded.titleHtml = forwarded.title;
        }
        if (forwarded.contentHtml === undefined && forwarded.content !== undefined) {
            forwarded.contentHtml = forwarded.content;
        }
        return window.openModal(forwarded);
    }

    function _getCurrentYear() {
        return window.getCurrentYear();
    }

    function _calculateCharacterAge(character, asOfYear) {
        if (!character) return null;
        var birthYear = character.birthYear;
        if (typeof birthYear !== 'number' || !isFinite(birthYear)) return null;
        return window.calculateAge(
            birthYear,
            character.isDeceased === true,
            character.deathYear,
            asOfYear
        );
    }

    function _resolveCharacterLocation(character) {
        if (!character || !character.id) return null;

        if (window.LocationQueries &&
            typeof window.LocationQueries.getCurrentLocationId === 'function') {
            try {
                var semantic = window.LocationQueries.getCurrentLocationId(character.id);
                if (typeof semantic === 'string' && semantic.length > 0) {
                    return semantic;
                }
                return null;
            } catch (e) {
                // fall through to raw field
            }
        }

        if (window.CharacterQueries &&
            typeof window.CharacterQueries.getCurrentLocationId === 'function') {
            try {
                return window.CharacterQueries.getCurrentLocationId(character.id);
            } catch (e) {
                return null;
            }
        }

        return character.currentLocationId || null;
    }

    // =========================================================================
    // 3. SETTLEMENT INTEGRATION DETECTION
    // =========================================================================

    function _detectSettlementState() {
        if (typeof window.SettlementState === 'undefined'
            || window.SettlementState === null) {
            return { ok: false, reason: 'window.SettlementState is not loaded.' };
        }
        if (typeof window.SettlementState._updateSettlementData !== 'function') {
            return {
                ok: false,
                reason: 'SettlementState._updateSettlementData (private) ' +
                    'is not available. Writes will fail.'
            };
        }
        return { ok: true, reason: 'Available.' };
    }

    function _detectSettlementReadAccessor() {
        if (typeof window.getSettlementData === 'function') {
            return { ok: true, reason: 'window.getSettlementData is available.' };
        }
        if (typeof window.getOrCreateSettlementData === 'function') {
            return {
                ok: true,
                reason: 'window.getOrCreateSettlementData is available ' +
                    '(fallback).'
            };
        }
        return {
            ok: false,
            reason: 'Neither window.getSettlementData nor ' +
                'window.getOrCreateSettlementData is loaded. Reads will fail.'
        };
    }

    function _detectCanonicalWriteCommands() {
        if (typeof window.SettlementGovernmentCommands === 'undefined'
            || window.SettlementGovernmentCommands === null) {
            return {
                ok: false,
                reason: 'SettlementGovernmentCommands is not loaded. This ' +
                    'tab falls back to the private settlement write path.'
            };
        }
        return { ok: true, reason: 'Available. (Not yet used by this tab.)' };
    }

    function _detectLocationQueries() {
        if (window.LocationQueries
            && typeof window.LocationQueries.getCurrentLocationId === 'function') {
            return {
                ok: true,
                reason: 'LocationQueries.getCurrentLocationId is available.'
            };
        }
        return {
            ok: false,
            reason: 'LocationQueries.getCurrentLocationId is unavailable. ' +
                'Population counts fall back to the raw currentLocationId field.'
        };
    }

    function _getIntegrationStatus() {
        return {
            settlementState: _detectSettlementState(),
            readAccessor: _detectSettlementReadAccessor(),
            writeCommands: _detectCanonicalWriteCommands(),
            locationQueries: _detectLocationQueries()
        };
    }

    // =========================================================================
    // 4. SETTLEMENT DATA ACCESS
    // =========================================================================

    function _getSettlementData(locationId) {
        if (typeof window.getSettlementData === 'function') {
            return window.getSettlementData(locationId);
        }
        if (typeof window.getOrCreateSettlementData === 'function') {
            return window.getOrCreateSettlementData(locationId);
        }
        if (window.SettlementState
            && typeof window.SettlementState.getSettlementData === 'function') {
            return window.SettlementState.getSettlementData(locationId);
        }
        return null;
    }

    function _writeSettlementData(locationId, updates) {
        if (typeof window.SettlementState === 'undefined'
            || window.SettlementState === null
            || typeof window.SettlementState._updateSettlementData !== 'function') {
            return { ok: false, reason: 'settlement-write-unavailable' };
        }
        try {
            var result = window.SettlementState._updateSettlementData(
                locationId, updates
            );
            if (result === null || result === undefined) {
                return {
                    ok: false,
                    reason: '_updateSettlementData returned ' +
                        (result === null ? 'null' : 'undefined')
                };
            }
            return { ok: true };
        } catch (e) {
            return {
                ok: false,
                reason: (e && e.message) ? e.message : 'update threw'
            };
        }
    }

    // =========================================================================
    // 5. HIERARCHY WALK
    // =========================================================================

    function _getChildPlaces(placeId) {
        if (window.LocationQueries
            && typeof window.LocationQueries.getPlaceChildren === 'function') {
            try {
                var list = window.LocationQueries.getPlaceChildren(placeId, false);
                return Array.isArray(list) ? list : [];
            } catch (e) {
                // fall through
            }
        }
        if (window.LocationState
            && typeof window.LocationState.getPlacesByParentId === 'function') {
            try {
                var list2 = window.LocationState.getPlacesByParentId(placeId);
                return Array.isArray(list2) ? list2 : [];
            } catch (e) {
                // fall through
            }
        }
        return [];
    }

    function _getAllDescendantPlaceIds(placeId) {
        var result = [placeId];
        var seen = {};
        seen[placeId] = true;

        var stack = _getChildPlaces(placeId);
        while (stack.length > 0) {
            var next = stack.shift();
            if (!next || !next.id) continue;
            if (seen[next.id]) continue;
            seen[next.id] = true;
            result.push(next.id);
            var kids = _getChildPlaces(next.id);
            for (var i = 0; i < kids.length; i++) {
                stack.push(kids[i]);
            }
        }
        return result;
    }

    // =========================================================================
    // 6. AGGREGATION
    // =========================================================================

    function _getSettlementPopulationForHierarchy(locationId) {
        var placeIds = _getAllDescendantPlaceIds(locationId);
        var inHierarchy = {};
        for (var i = 0; i < placeIds.length; i++) {
            inHierarchy[placeIds[i]] = true;
        }

        var stats = {
            total: 0,
            living: 0,
            deceased: 0,
            adults: 0,
            children: 0,
            elderly: 0,
            literate: 0,
            totalWealth: 0,
            wealthCount: 0,
            byLocation: {}
        };

        for (var p = 0; p < placeIds.length; p++) {
            stats.byLocation[placeIds[p]] = {
                total: 0, living: 0, deceased: 0,
                adults: 0, children: 0, elderly: 0,
                literate: 0, totalWealth: 0, wealthCount: 0
            };
        }

        var characters = (typeof window.getCharacters === 'function')
            ? window.getCharacters()
            : [];

        for (var c = 0; c < characters.length; c++) {
            var char = characters[c];
            if (!char) continue;

            var charLoc = _resolveCharacterLocation(char);
            if (!charLoc || !inHierarchy[charLoc]) continue;

            var locStats = stats.byLocation[charLoc];
            if (!locStats) continue;

            stats.total++;
            locStats.total++;

            if (!char.isDeceased) {
                stats.living++;
                locStats.living++;

                var age = _calculateCharacterAge(char);
                if (age !== null && age !== undefined) {
                    if (age < 18) {
                        stats.children++;
                        locStats.children++;
                    } else if (age >= 60) {
                        stats.elderly++;
                        locStats.elderly++;
                    } else {
                        stats.adults++;
                        locStats.adults++;
                    }
                }

                if (char.isLiterate === true) {
                    stats.literate++;
                    locStats.literate++;
                }

                if (typeof char.wealth === 'number' && isFinite(char.wealth)) {
                    stats.totalWealth += char.wealth;
                    stats.wealthCount++;
                    locStats.totalWealth += char.wealth;
                    locStats.wealthCount++;
                }
            } else {
                stats.deceased++;
                locStats.deceased++;
            }
        }

        stats.literacyRate = stats.living > 0
            ? Math.round((stats.literate / stats.living) * 100)
            : 0;
        stats.averageWealth = stats.wealthCount > 0
            ? Math.round(stats.totalWealth / stats.wealthCount)
            : 0;

        for (var locId in stats.byLocation) {
            if (!Object.prototype.hasOwnProperty.call(stats.byLocation, locId)) {
                continue;
            }
            var ls = stats.byLocation[locId];
            ls.literacyRate = ls.living > 0
                ? Math.round((ls.literate / ls.living) * 100)
                : 0;
            ls.averageWealth = ls.wealthCount > 0
                ? Math.round(ls.totalWealth / ls.wealthCount)
                : 0;
        }

        return stats;
    }

    function _getAggregatedSettlementData(locationId) {
        var placeIds = _getAllDescendantPlaceIds(locationId);

        var aggregated = {
            prosperity: 0,
            crimeRate: 0,
            justiceSeverity: 'medium',
            hasWatch: false,
            watchSize: 0,
            governmentSalaryBudget: 0,
            locationCount: 0,
            locationsWithData: 0
        };

        var prosperitySum = 0;
        var crimeSum = 0;
        var prosperityCount = 0;
        var crimeCount = 0;
        var justiceCounts = { lenient: 0, medium: 0, harsh: 0, extreme: 0 };
        var justiceCount = 0;

        for (var i = 0; i < placeIds.length; i++) {
            var data = _getSettlementData(placeIds[i]);
            if (!data) continue;

            aggregated.locationCount++;
            aggregated.locationsWithData++;

            if (typeof data.prosperity === 'number' && isFinite(data.prosperity)) {
                prosperitySum += data.prosperity;
                prosperityCount++;
            }

            if (typeof data.crimeRate === 'number' && isFinite(data.crimeRate)) {
                crimeSum += data.crimeRate;
                crimeCount++;
            }

            if (data.justiceSeverity) {
                justiceCounts[data.justiceSeverity] =
                    (justiceCounts[data.justiceSeverity] || 0) + 1;
                justiceCount++;
            }

            if (data.hasWatch) {
                aggregated.hasWatch = true;
                aggregated.watchSize += (data.watchSize || 0);
            }

            if (typeof data.governmentSalaryBudget === 'number' &&
                isFinite(data.governmentSalaryBudget)) {
                aggregated.governmentSalaryBudget += data.governmentSalaryBudget;
            }
        }

        aggregated.prosperity = prosperityCount > 0
            ? Math.round(prosperitySum / prosperityCount)
            : 0;
        aggregated.crimeRate = crimeCount > 0
            ? Math.round((crimeSum / crimeCount) * 100) / 100
            : 0;

        var maxJusticeCount = 0;
        var modeJustice = 'medium';
        for (var j in justiceCounts) {
            if (!Object.prototype.hasOwnProperty.call(justiceCounts, j)) continue;
            if (justiceCounts[j] > maxJusticeCount) {
                maxJusticeCount = justiceCounts[j];
                modeJustice = j;
            }
        }
        aggregated.justiceSeverity = justiceCount > 0 ? modeJustice : 'medium';

        return aggregated;
    }

    // =========================================================================
    // 7. RENDER
    // =========================================================================

    function _renderIntegrationBanner() {
        return (
            '<div class="eco-integration-banner" role="note">' +
                '<strong>Reads are live; writes are a preview.</strong> ' +
                'This tab aggregates population, prosperity, crime, justice, ' +
                'watch, and salary budget from each location\'s settlement ' +
                'record. Edits write through a private settlement method ' +
                '(<code>SettlementState._updateSettlementData</code>) — ' +
                'no canonical command exists yet. Other systems read these ' +
                'fields only if they explicitly touch <code>settlementData</code>. ' +
                'The writes work; the enforcement is not wired.' +
            '</div>'
        );
    }

    function _renderIntegrationStatus(status) {
        function line(label, entry) {
            var glyphClass = entry.ok
                ? 'eco-integration-glyph is-ok'
                : 'eco-integration-glyph is-missing';
            var glyph = entry.ok ? '✓' : '✗';
            return (
                '<div class="eco-integration-line">' +
                    '<span class="' + glyphClass + '">' + glyph + '</span>' +
                    '<span class="eco-integration-label">' +
                        _escapeHtml(label) + '</span>' +
                    '<span class="eco-integration-value">' +
                        _escapeHtml(entry.reason) + '</span>' +
                '</div>'
            );
        }

        return (
            '<div class="eco-integration-status">' +
                '<div class="gov-integration-status-title">' +
                    'Settlement integration status' +
                '</div>' +
                line('Settlement write path', status.settlementState) +
                line('Settlement read path', status.readAccessor) +
                line('Canonical write command', status.writeCommands) +
                line('Location resolver', status.locationQueries) +
            '</div>'
        );
    }

    function _renderStatCard(iconName, value, label, sub) {
        var iconSvg = _getIcon(iconName);
        return (
            '<div class="eco-stat-card">' +
                '<div class="eco-stat-icon">' + iconSvg + '</div>' +
                '<div class="eco-stat-content">' +
                    '<div class="eco-stat-value">' +
                        _escapeHtml(value) + '</div>' +
                    '<div class="eco-stat-label">' +
                        _escapeHtml(label) + '</div>' +
                    (sub
                        ? '<div class="eco-stat-sub">' +
                            _escapeHtml(sub) + '</div>'
                        : '') +
                '</div>' +
            '</div>'
        );
    }

    function _prosperityBucket(prosperity) {
        if (prosperity >= 80) {
            return { label: 'Booming', className: 'is-ok' };
        }
        if (prosperity >= 60) {
            return { label: 'Prosperous', className: 'is-ok' };
        }
        if (prosperity >= 40) {
            return { label: 'Stable', className: 'is-warning' };
        }
        if (prosperity >= 20) {
            return { label: 'Declining', className: 'is-danger' };
        }
        return { label: 'Crisis', className: 'is-danger-strong' };
    }

    function _crimeBucket(crimeRate) {
        if (crimeRate > 0.5) {
            return { label: 'Extreme', className: 'is-danger-strong' };
        }
        if (crimeRate > 0.3) {
            return { label: 'High', className: 'is-danger' };
        }
        if (crimeRate > 0.15) {
            return { label: 'Moderate', className: 'is-warning' };
        }
        if (crimeRate > 0.05) {
            return { label: 'Low', className: 'is-ok' };
        }
        return { label: 'Low', className: 'is-ok' };
    }

    function _justiceLabel(justiceSeverity) {
        if (justiceSeverity === 'lenient') return 'Lenient';
        if (justiceSeverity === 'harsh') return 'Harsh';
        if (justiceSeverity === 'extreme') return 'Extreme';
        return 'Medium';
    }

    function _renderEconomyDetails(place) {
        if (!place) {
            return '<div class="eco-details-empty">' +
                'Select a location to view economy details.</div>';
        }

        var population = _getSettlementPopulationForHierarchy(place.id);
        var settlementData = _getAggregatedSettlementData(place.id);
        var childPlaces = _getChildPlaces(place.id);
        var status = _getIntegrationStatus();

        var html = '<div class="eco-details-container">';

        // Header
        html += '<div class="eco-details-header">';
        html += '<h3>' +
            _escapeHtml(place.displayName || place.name) + ' - Economy' +
            '</h3>';
        html += '<div class="eco-details-actions">';
        html += '<button class="eco-btn" data-action="edit-economy">' +
            _getIcon('EDIT') + ' Edit' +
            '</button>';
        html += '<button class="eco-btn" data-action="refresh-economy">' +
            _getIcon('REFRESH') + ' Refresh' +
            '</button>';
        html += '</div>';
        html += '</div>';

        // Banner + status
        html += _renderIntegrationBanner();
        html += _renderIntegrationStatus(status);

        // Hierarchy summary
        html += '<div class="eco-hierarchy-info">';
        html += '<span class="eco-hierarchy-label">Settlement includes:</span> ';
        html += '<span class="eco-hierarchy-count">' +
            (settlementData.locationCount || 0) + ' locations</span>';
        if (childPlaces.length > 0) {
            html += ' <span class="eco-hierarchy-children">(';
            var names = [];
            for (var c = 0; c < Math.min(childPlaces.length, 3); c++) {
                names.push(_escapeHtml(
                    childPlaces[c].displayName || childPlaces[c].name
                ));
            }
            html += names.join(', ');
            if (childPlaces.length > 3) {
                html += ' +' + (childPlaces.length - 3) + ' more';
            }
            html += ')</span>';
        }
        html += '</div>';

        // Stat grid
        html += '<div class="eco-stats-grid">';
        html += _renderStatCard(
            'PERSON',
            population.living.toLocaleString(),
            'Living Population',
            'Total: ' + population.total.toLocaleString() +
                ' | Deceased: ' + population.deceased.toLocaleString()
        );
        html += _renderStatCard(
            'AGE_GROUPS',
            population.adults.toLocaleString(),
            'Adults (18-59)',
            'Children: ' + population.children.toLocaleString() +
                ' | Elderly: ' + population.elderly.toLocaleString()
        );
        html += _renderStatCard(
            'BOOK',
            population.literacyRate + '%',
            'Literacy Rate',
            population.literate.toLocaleString() + ' literate individuals'
        );
        html += _renderStatCard(
            'COIN',
            population.averageWealth.toLocaleString(),
            'Average Wealth (gold)',
            'Total: ' + population.totalWealth.toLocaleString()
        );
        html += '</div>';

        // Settlement detail block
        html += '<div class="eco-settlement-details">';
        html += '<h4>Settlement Economy (Aggregated)</h4>';

        // Prosperity
        var prosperity = settlementData.prosperity || 0;
        var prosperityBucket = _prosperityBucket(prosperity);

        html += '<div class="eco-prosperity">';
        html += '<div class="eco-prosperity-label">Prosperity (Average)</div>';
        html += '<div class="eco-prosperity-bar">';
        html += '<div class="eco-prosperity-fill ' +
            prosperityBucket.className + '" ' +
            'data-width="' + Math.min(100, Math.round(prosperity)) + '"></div>';
        html += '</div>';
        html += '<div class="eco-prosperity-value">' +
            Math.round(prosperity) + '% - ' +
            _escapeHtml(prosperityBucket.label) +
            '</div>';
        html += '</div>';

        // Crime
        var crimeRate = settlementData.crimeRate || 0;
        var crimeBucket = _crimeBucket(crimeRate);

        html += '<div class="eco-crime">';
        html += '<div class="eco-crime-label">Crime Rate (Average)</div>';
        html += '<div class="eco-crime-value ' + crimeBucket.className + '">' +
            Math.round(crimeRate * 100) + '% - ' +
            _escapeHtml(crimeBucket.label) +
            '</div>';
        html += '</div>';

        // Justice
        var justiceSeverity = settlementData.justiceSeverity || 'medium';

        html += '<div class="eco-justice">';
        html += '<div class="eco-justice-label">Justice Severity (Mode)</div>';
        html += '<div class="eco-justice-value">' +
            _escapeHtml(_justiceLabel(justiceSeverity)) + '</div>';
        html += '</div>';

        // Watch
        var hasWatch = settlementData.hasWatch === true;
        var watchSize = settlementData.watchSize || 0;

        html += '<div class="eco-watch">';
        html += '<div class="eco-watch-label">Watch (Any Location)</div>';
        html += '<div class="eco-watch-value">';
        if (hasWatch) {
            html += 'Active <span class="eco-watch-size">(Total: ' +
                watchSize + ' members)</span>';
        } else {
            html += 'None';
        }
        html += '</div>';
        html += '</div>';

        // Salary budget
        var salaryBudget = settlementData.governmentSalaryBudget || 0;
        html += '<div class="eco-salary-budget">';
        html += '<div class="eco-salary-label">' +
            'Government Salary Budget (Total)</div>';
        html += '<div class="eco-salary-value">' +
            salaryBudget.toLocaleString() + ' gold/year</div>';
        html += '</div>';

        html += '</div>';

        // Location breakdown
        if (settlementData.locationCount > 1) {
            html += '<div class="eco-location-breakdown">';
            html += '<h4>Location Breakdown</h4>';
            html += '<div class="eco-breakdown-grid">';

            var placeIds = _getAllDescendantPlaceIds(place.id);
            for (var i = 0; i < placeIds.length; i++) {
                var locPlace = _getPlaceById(placeIds[i]);
                if (!locPlace) continue;
                var locData = _getSettlementData(placeIds[i]);
                var locPop = population.byLocation[placeIds[i]];
                if (!locPop || locPop.total === 0) continue;

                html += '<div class="eco-breakdown-item">';
                html += '<div class="eco-breakdown-name">' +
                    _escapeHtml(locPlace.displayName || locPlace.name) +
                    '</div>';
                html += '<div class="eco-breakdown-stats">';
                html += '<span class="eco-breakdown-pop">' +
                    locPop.living + ' living</span>';
                if (locData && typeof locData.prosperity === 'number') {
                    html += ' <span class="eco-breakdown-prosperity">' +
                        'Prosperity: ' + Math.round(locData.prosperity) + '%' +
                        '</span>';
                }
                html += '</div>';
                html += '</div>';
            }

            html += '</div>';
            html += '</div>';
        }

        html += '</div>';

        // Apply prosperity bar widths after mount (CSS can't take a
        // runtime width from a data attribute). See render.
        return html;
    }

    /**
     * Applies the prosperity-bar width from the data-width attribute on
     * each .eco-prosperity-fill element inside the container. Called
     * after the container's innerHTML is set.
     */
    function _applyProsperityBarWidths(container) {
        var fills = container.querySelectorAll('.eco-prosperity-fill');
        for (var i = 0; i < fills.length; i++) {
            var w = fills[i].getAttribute('data-width');
            if (w !== null) {
                fills[i].style.width = w + '%';
            }
        }
    }

    // =========================================================================
    // 8. EDIT MODAL
    // =========================================================================

    function _openEditEconomyModal(placeId, onComplete) {
        var place = _getPlaceById(placeId);
        if (!place) {
            _showToast('Location not found', 'error');
            return;
        }

        var status = _detectSettlementState();
        if (!status.ok) {
            _showToast(
                'Settlement write path unavailable. Economy edits cannot ' +
                'be saved on this build.',
                'error'
            );
            return;
        }

        var aggregated = _getAggregatedSettlementData(placeId);
        var currentProsperity = aggregated.prosperity || 0;
        var currentCrimeRate = aggregated.crimeRate || 0;
        var currentJustice = aggregated.justiceSeverity || 'medium';
        var currentWatch = aggregated.hasWatch === true;
        var currentWatchSize = aggregated.watchSize || 0;
        var currentSalaryBudget = aggregated.governmentSalaryBudget || 0;

        var content = '<div class="eco-edit-form">';

        content += '<div class="eco-edit-warning">' +
            '<p><strong>Aggregated edit.</strong> These values apply to ' +
            'every location in the settlement hierarchy (' +
            _escapeHtml(place.displayName || place.name) +
            ' and all descendants).</p>' +
            '<p>Stored via <code>SettlementState._updateSettlementData</code> — ' +
            'a private method. There is no canonical command for these ' +
            'fields yet.</p>' +
            '</div>';

        // Prosperity
        content += '<div class="form-group">';
        content += '<label for="eco-prosperity-input">' +
            'Prosperity (0-100)</label>';
        content += '<input type="range" id="eco-prosperity-input" ' +
            'class="form-range" min="0" max="100" value="' +
            Math.round(currentProsperity) + '">';
        content += '<span id="eco-prosperity-display" ' +
            'class="eco-range-display">' +
            Math.round(currentProsperity) + '%</span>';
        content += '</div>';

        // Crime
        content += '<div class="form-group">';
        content += '<label for="eco-crime-input">Crime Rate (0-100%)</label>';
        content += '<input type="range" id="eco-crime-input" ' +
            'class="form-range" min="0" max="100" value="' +
            Math.round(currentCrimeRate * 100) + '">';
        content += '<span id="eco-crime-display" ' +
            'class="eco-range-display">' +
            Math.round(currentCrimeRate * 100) + '%</span>';
        content += '</div>';

        // Justice
        content += '<div class="form-group">';
        content += '<label for="eco-justice-select">Justice Severity</label>';
        content += '<select id="eco-justice-select" class="form-control">';
        var justiceOptions = ['lenient', 'medium', 'harsh', 'extreme'];
        var justiceLabels = ['Lenient', 'Medium', 'Harsh', 'Extreme'];
        for (var i = 0; i < justiceOptions.length; i++) {
            var sel = (justiceOptions[i] === currentJustice) ? ' selected' : '';
            content += '<option value="' + justiceOptions[i] + '"' +
                sel + '>' + justiceLabels[i] + '</option>';
        }
        content += '</select>';
        content += '</div>';

        // Watch
        content += '<div class="form-group">';
        content += '<label>Watch</label>';
        content += '<div class="eco-watch-toggle">';
        content += '<label><input type="radio" name="eco-watch" ' +
            'value="active"' + (currentWatch ? ' checked' : '') +
            '> Active</label>';
        content += '<label><input type="radio" name="eco-watch" ' +
            'value="inactive"' + (!currentWatch ? ' checked' : '') +
            '> Inactive</label>';
        content += '</div>';
        content += '</div>';

        content += '<div class="form-group">';
        content += '<label for="eco-watch-size-input">Watch Size (Total)</label>';
        content += '<input type="number" id="eco-watch-size-input" ' +
            'class="form-control" min="0" max="1000" value="' +
            currentWatchSize + '">';
        content += '</div>';

        // Salary
        content += '<div class="form-group">';
        content += '<label for="eco-salary-input">' +
            'Government Salary Budget (gold/year)</label>';
        content += '<input type="number" id="eco-salary-input" ' +
            'class="form-control" min="0" step="10" value="' +
            Math.round(currentSalaryBudget) + '">';
        content += '</div>';

        content += '</div>';

        _openModal({
            title: 'Edit Economy for ' +
                (place.displayName || place.name) + ' Hierarchy',
            content: content,
            confirmText: 'Save Changes',
            cancelText: 'Cancel',
            onMount: function(root) {
                var prosperitySlider =
                    root.querySelector('#eco-prosperity-input');
                var prosperityDisplay =
                    root.querySelector('#eco-prosperity-display');
                if (prosperitySlider && prosperityDisplay) {
                    prosperitySlider.addEventListener('input', function() {
                        prosperityDisplay.textContent = this.value + '%';
                    });
                }

                var crimeSlider = root.querySelector('#eco-crime-input');
                var crimeDisplay = root.querySelector('#eco-crime-display');
                if (crimeSlider && crimeDisplay) {
                    crimeSlider.addEventListener('input', function() {
                        crimeDisplay.textContent = this.value + '%';
                    });
                }

                var watchRadios =
                    root.querySelectorAll('input[name="eco-watch"]');
                var watchSizeInput =
                    root.querySelector('#eco-watch-size-input');
                if (watchRadios.length > 0 && watchSizeInput) {
                    var updateWatchSize = function() {
                        var active = root.querySelector(
                            'input[name="eco-watch"]:checked'
                        );
                        if (active && active.value === 'active') {
                            watchSizeInput.disabled = false;
                            if (parseInt(watchSizeInput.value, 10) < 1) {
                                watchSizeInput.value = 1;
                            }
                        } else {
                            watchSizeInput.disabled = true;
                            watchSizeInput.value = 0;
                        }
                    };
                    for (var r = 0; r < watchRadios.length; r++) {
                        watchRadios[r].addEventListener('change', updateWatchSize);
                    }
                    updateWatchSize();
                }
            },
            onConfirm: function(root) {
                var prosperitySlider =
                    root.querySelector('#eco-prosperity-input');
                var crimeSlider = root.querySelector('#eco-crime-input');
                var justiceSelect = root.querySelector('#eco-justice-select');
                var watchActiveEl =
                    root.querySelector('input[name="eco-watch"]:checked');
                var watchSizeEl = root.querySelector('#eco-watch-size-input');
                var salaryEl = root.querySelector('#eco-salary-input');

                if (!prosperitySlider || !crimeSlider || !justiceSelect) {
                    _showToast('Form not found in modal', 'error');
                    return false;
                }

                var prosperity = parseInt(prosperitySlider.value, 10);
                var crimeRate = parseInt(crimeSlider.value, 10) / 100;
                var justice = justiceSelect.value || 'medium';
                var hasWatch = watchActiveEl
                    ? watchActiveEl.value === 'active'
                    : false;
                var watchSize = watchSizeEl
                    ? (parseInt(watchSizeEl.value, 10) || 0)
                    : 0;
                var salaryBudget = salaryEl
                    ? (parseInt(salaryEl.value, 10) || 0)
                    : 0;

                if (hasWatch && watchSize < 1) {
                    _showToast('Watch size must be at least 1', 'error');
                    return false;
                }

                var placeIds = _getAllDescendantPlaceIds(placeId);
                var successCount = 0;
                var failureReasons = [];

                for (var i = 0; i < placeIds.length; i++) {
                    var updates = {
                        prosperity: Math.max(0, Math.min(100, prosperity)),
                        crimeRate: Math.max(0, Math.min(1, crimeRate)),
                        justiceSeverity: justice,
                        hasWatch: hasWatch,
                        watchSize: hasWatch ? watchSize : 0,
                        governmentSalaryBudget: Math.max(0, salaryBudget),
                        lastUpdated: _getCurrentYear()
                    };

                    var write = _writeSettlementData(placeIds[i], updates);
                    if (write.ok) {
                        successCount++;
                    } else {
                        if (failureReasons.length < 3) {
                            failureReasons.push(write.reason);
                        }
                    }
                }

                if (successCount === 0) {
                    _showToast(
                        'Failed to update economy. ' +
                        (failureReasons[0] || 'settlement write unavailable'),
                        'error'
                    );
                    return false;
                }

                if (typeof window.saveMasterData === 'function') {
                    try { window.saveMasterData(); } catch (e) { /* ignore */ }
                }
                if (typeof window.invalidateAccessorCaches === 'function') {
                    try { window.invalidateAccessorCaches(); } catch (e) { /* ignore */ }
                }

                var failedCount = placeIds.length - successCount;
                if (failedCount > 0) {
                    _showToast(
                        'Economy updated for ' + successCount + ' of ' +
                        placeIds.length + ' location(s). ' +
                        failedCount + ' failed. (Local only.)',
                        'warning'
                    );
                } else {
                    _showToast(
                        'Economy updated for ' + successCount +
                        ' location(s) in ' +
                        (place.displayName || place.name) +
                        ' hierarchy. (Local only.)',
                        'warning'
                    );
                }

                if (typeof onComplete === 'function') onComplete();
                return true;
            }
        });
    }

    // =========================================================================
    // 9. MAIN RENDER
    // =========================================================================

    function renderEconomyDetailsTab(containerId, locationId) {
        var container = document.getElementById(containerId);
        if (!container) {
            console.warn('Economy details container not found:', containerId);
            return;
        }

        var place = locationId ? _getPlaceById(locationId) : null;
        container.innerHTML = _renderEconomyDetails(place);
        container.dataset.locationId = locationId || '';

        // Apply the prosperity bar width. The bar's percentage is a
        // runtime value (0-100) so it lives in a data attribute that
        // this function converts to a CSS width.
        _applyProsperityBarWidths(container);

        if (!container._ecoBound) {
            container._ecoBound = true;

            container.addEventListener('click', function(e) {
                var target = e.target.closest('[data-action]');
                if (!target) return;

                var action = target.dataset.action;
                var currentLocationId = container.dataset.locationId;
                var refresh = function() {
                    renderEconomyDetailsTab(containerId, currentLocationId);
                };

                switch (action) {
                    case 'edit-economy':
                        if (currentLocationId) {
                            _openEditEconomyModal(currentLocationId, refresh);
                        } else {
                            _showToast('No location selected', 'warning');
                        }
                        break;

                    case 'refresh-economy':
                        if (currentLocationId) {
                            renderEconomyDetailsTab(containerId, currentLocationId);
                            _showToast('Economy data refreshed', 'info');
                        }
                        break;
                }
            });
        }
    }

    function refreshEconomyDetailsTab(locationId, containerId) {
        var id = containerId || 'economy-details-tab';
        var container = document.getElementById(id);
        if (!container) {
            var candidates = document.querySelectorAll(
                '.eco-details-tab-container, #economy-details-tab'
            );
            if (candidates.length === 0) return;
            container = candidates[0];
            id = container.id || id;
        }
        renderEconomyDetailsTab(id, locationId);
    }

    function getSettlementHierarchy(locationId) {
        return _getAllDescendantPlaceIds(locationId);
    }

    function editEconomyForLocation(locationId) {
        _openEditEconomyModal(locationId, function() {
            refreshEconomyDetailsTab(locationId);
        });
    }

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

    window.EconomyDetailsTab = {
        render: renderEconomyDetailsTab,
        refresh: refreshEconomyDetailsTab,
        edit: editEconomyForLocation,
        getHierarchy: getSettlementHierarchy,
        getIntegrationStatus: _getIntegrationStatus,
        _renderDetails: _renderEconomyDetails,
        _openEditModal: _openEditEconomyModal,
        _getPopulation: _getSettlementPopulationForHierarchy,
        _getAggregatedData: _getAggregatedSettlementData,
        _getChildPlaces: _getChildPlaces,
        _getDescendantIds: _getAllDescendantPlaceIds
    };

    window.renderEconomyDetailsTab = renderEconomyDetailsTab;
    window.refreshEconomyDetailsTab = refreshEconomyDetailsTab;

})();
