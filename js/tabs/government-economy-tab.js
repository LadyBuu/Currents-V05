// js/tabs/government-economy-tab.js
/**
 * =============================================================================
 * GOVERNMENT ECONOMY TAB
 * =============================================================================
 *
 * LOCATION: js/tabs/government-economy-tab.js
 *
 * PURPOSE:
 *   Read and edit the settlement economy facts that are writable through
 *   canonical settlement commands, and display the derived facts that are
 *   not writable through any command.
 *
 * ARCHITECTURE:
 *   This tab is a THIN SHELL. It does not walk the location hierarchy, it
 *   does not aggregate settlement data, it does not probe for private
 *   write methods. Every read goes through a canonical query module; every
 *   write goes through a canonical settlement command.
 *
 *   - Reads              → SettlementQueries (raw settlement record)
 *                        → SettlementProsperityQueries (derived prosperity)
 *                        → SettlementCrimeQueries (derived crime rate)
 *                        → SettlementEmploymentQueries (employment stats)
 *                        → SettlementEducationQueries (literacy stats)
 *                        → SettlementReligionQueries (unity, dominant religion)
 *                        → LocationQueries (population)
 *                        → SettlementGovernmentDefinitions (justice severities)
 *
 *   - Writes             → SettlementGovernmentCommands.setJusticeSeverity
 *                        → SettlementGovernmentCommands.setWatch
 *                        → SettlementFiscalCommands.setBudgetAllocation
 *
 *   The tab does not write canonical data directly. It does not call
 *   saveMasterData. It does not call State._updateSettlementData. Every
 *   write goes through a command whose commit tail handles
 *   write + rebuild + persist + publish.
 *
 * READ-ONLY vs EDITABLE:
 *   Editable (each has a canonical command):
 *     - justiceSeverity        → setJusticeSeverity
 *     - hasWatch / watchSize   → setWatch
 *     - governmentSalaryBudget → setBudgetAllocation
 *
 *   Read-only (derived — no command exists to write them):
 *     - prosperity             → SettlementProsperityQueries.getProsperityValue
 *     - crimeRate              → SettlementCrimeQueries.getCrimeRateValue
 *     - religiousUnity         → SettlementReligionQueries.getReligiousUnity
 *     - dominantReligion       → SettlementReligionQueries.getDominantReligion
 *     - literacyRate           → SettlementEducationQueries.getLiteracyStats
 *     - employmentRate         → SettlementEmploymentQueries.getEmployment
 *     - population             → LocationQueries.getPopulationCount
 *
 *   The Edit modal exposes only the three editable fields. Prosperity and
 *   crime rate are not editable — they are computed from the writable
 *   inputs (tax, watch, features, military, religion, employment, justice).
 *
 * MISSING DATA:
 *   Every read returns null when the underlying data is missing. The tab
 *   renders an em-dash placeholder for null. It never fabricates a value.
 *   In particular:
 *
 *     - No settlement record       → the whole tab renders an empty state
 *                                    with an explanatory line and the
 *                                    "cannot edit" path is disabled
 *     - Settlement exists, no
 *       budget allocated           → salaryBudget renders as "—", the
 *                                    edit modal opens with an empty field
 *     - Prosperity null              → prosperity card renders "—"
 *     - Crime null                   → crime card renders "—"
 *
 *   Distinguishing 0 from null matters:
 *     budget = 0     → "0g" (explicitly allocated zero)
 *     budget = null  → "—" (never allocated)
 *
 * LOAD ORDER (must be satisfied when this file loads):
 *   - settlement-queries.js
 *   - settlement-prosperity-queries.js
 *   - settlement-crime-queries.js
 *   - settlement-employment-queries.js
 *   - settlement-education-queries.js
 *   - settlement-religion-queries.js
 *   - settlement-government-commands.js
 *   - settlement-fiscal-commands.js
 *   - settlement-government-definitions.js
 *   - location-queries.js
 *   - modals-core.js   (openModal, closeTopModal)
 *   - ui.js            (showToast)
 *   - formatting.js    (escapeHtml)
 *   - icons.js         (Icons)
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. LOAD-TIME DEPENDENCY CHECKS
    // =========================================================================

    if (!window.SettlementQueries) {
        throw new Error(
            'government-economy-tab.js: settlement-queries.js must load first.'
        );
    }
    if (!window.SettlementProsperityQueries) {
        throw new Error(
            'government-economy-tab.js: settlement-prosperity-queries.js must load first.'
        );
    }
    if (!window.SettlementCrimeQueries) {
        throw new Error(
            'government-economy-tab.js: settlement-crime-queries.js must load first.'
        );
    }
    if (!window.SettlementEmploymentQueries) {
        throw new Error(
            'government-economy-tab.js: settlement-employment-queries.js must load first.'
        );
    }
    if (!window.SettlementEducationQueries) {
        throw new Error(
            'government-economy-tab.js: settlement-education-queries.js must load first.'
        );
    }
    if (!window.SettlementReligionQueries) {
        throw new Error(
            'government-economy-tab.js: settlement-religion-queries.js must load first.'
        );
    }
    if (!window.SettlementGovernmentCommands) {
        throw new Error(
            'government-economy-tab.js: settlement-government-commands.js must load first.'
        );
    }
    if (!window.SettlementFiscalCommands) {
        throw new Error(
            'government-economy-tab.js: settlement-fiscal-commands.js must load first.'
        );
    }
    if (!window.SettlementGovernmentDefinitions) {
        throw new Error(
            'government-economy-tab.js: settlement-government-definitions.js must load first.'
        );
    }
    if (!window.LocationQueries) {
        throw new Error(
            'government-economy-tab.js: location-queries.js must load first.'
        );
    }

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    var SQ = window.SettlementQueries;
    var SPQ = window.SettlementProsperityQueries;
    var SCQ = window.SettlementCrimeQueries;
    var SEQ = window.SettlementEmploymentQueries;
    var SEDQ = window.SettlementEducationQueries;
    var SRQ = window.SettlementReligionQueries;
    var SGC = window.SettlementGovernmentCommands;
    var SFC = window.SettlementFiscalCommands;
    var SGD = window.SettlementGovernmentDefinitions;
    var LQ = window.LocationQueries;

    function _escapeHtml(str) {
        if (typeof window.escapeHtml === 'function') {
            return window.escapeHtml(str);
        }
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _getIcon(name) {
        if (typeof window._getIcon === 'function') return window._getIcon(name);
        return window.Icons && typeof window.Icons[name] === 'string'
            ? window.Icons[name]
            : '';
    }

    function _iconSpan(name) {
        var i = _getIcon(name);
        return i
            ? '<span style="display:inline-flex;align-items:center;vertical-align:middle;">' + i + '</span>'
            : '';
    }

    function _toast(message, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type || 'info');
        } else if (typeof window._showToast === 'function') {
            window._showToast(message, type || 'info');
        }
    }

    function _openModal(opts) {
        if (typeof window.openModal !== 'function') {
            throw new Error('government-economy-tab.js: openModal not available');
        }
        return window.openModal(opts);
    }

    function _closeTopModal() {
        if (typeof window.closeTopModal === 'function') window.closeTopModal();
    }

    function _unknown() {
        return '<span class="value-unknown">—</span>';
    }

    function _fmtNumber(value) {
        if (typeof value !== 'number' || !isFinite(value)) return _unknown();
        return _escapeHtml(value.toLocaleString());
    }

    function _fmtPercent(value, digits) {
        if (typeof value !== 'number' || !isFinite(value)) return _unknown();
        var factor = Math.pow(10, digits || 0);
        var rounded = Math.round(value * factor) / factor;
        return _escapeHtml(rounded + '%');
    }

    function _placeSummary(locationId) {
        if (!locationId) return null;
        return LQ.getPlaceSummary(locationId);
    }

    // =========================================================================
    // 3. PRESENTATION HELPERS
    // =========================================================================
    //
    // These are display-only classifications. They are local to the tab
    // because the settlement domain does not define crime bands and only
    // defines prosperity bands for its own display. The values below are
    // not domain rules — they decide how to label a bar in the UI.

    function _prosperityBucket(value) {
        if (typeof value !== 'number') return { label: '—', className: 'is-unknown' };
        if (value >= 80) return { label: 'Booming', className: 'is-ok' };
        if (value >= 60) return { label: 'Prosperous', className: 'is-ok' };
        if (value >= 40) return { label: 'Stable', className: 'is-warning' };
        if (value >= 20) return { label: 'Declining', className: 'is-danger' };
        return { label: 'Crisis', className: 'is-danger-strong' };
    }

    function _crimeBucket(value) {
        if (typeof value !== 'number') return { label: '—', className: 'is-unknown' };
        if (value > 0.5) return { label: 'Extreme', className: 'is-danger-strong' };
        if (value > 0.3) return { label: 'High', className: 'is-danger' };
        if (value > 0.15) return { label: 'Moderate', className: 'is-warning' };
        return { label: 'Low', className: 'is-ok' };
    }

    function _justiceLabel(severityId) {
        if (!severityId) return '—';
        var severities = SGD.JUSTICE_SEVERITIES;
        for (var i = 0; i < severities.length; i++) {
            if (severities[i].id === severityId) return severities[i].name;
        }
        return severityId;
    }

    // =========================================================================
    // 4. DATA LOADERS
    // =========================================================================

    /**
     * Loads the full economy view for a location. Returns null if the
     * settlement record does not exist — the tab renders an empty state.
     *
     * Every value the view reads is either:
     *   - a raw canonical settlement field (justiceSeverity, hasWatch,
     *     watchSize, governmentSalaryBudget), or
     *   - a derived value read through its owning query module
     *     (prosperity, crime, employment, literacy, religion, population).
     *
     * The tab does not walk the location hierarchy. Every subtree
     * aggregation the display needs is done inside the query module
     * (SettlementProsperityQueries / SettlementCrimeQueries /
     * SettlementEmploymentQueries / SettlementEducationQueries all walk
     * the settlement's location subtree internally).
     */
    function _loadEconomyView(locationId) {
        var settlement = SQ.getSettlementData(locationId);
        if (!settlement) return null;

        var population = LQ.getPopulationCount(locationId, false);
        var prosperity = SPQ.getProsperity(locationId);
        var crime = SCQ.getCrimeRate(locationId);
        var employment = SEQ.getEmployment(locationId);
        var literacy = SEDQ.getLiteracyStats(locationId);
        var religiousUnity = SRQ.getReligiousUnity(locationId);
        var dominantReligion = SRQ.getDominantReligion(locationId);

        return {
            locationId: locationId,
            settlement: settlement,
            population: typeof population === 'number' ? population : null,
            prosperity: prosperity
                ? { value: prosperity.value, band: prosperity.band, modifiers: prosperity.modifiers }
                : null,
            crime: crime
                ? { value: crime.value, modifiers: crime.modifiers }
                : null,
            employment: employment || null,
            literacy: literacy || null,
            religiousUnity: typeof religiousUnity === 'number' ? religiousUnity : null,
            dominantReligion: dominantReligion || null
        };
    }

    // =========================================================================
    // 5. HTML BUILDERS
    // =========================================================================

    function _buildHeader(place) {
        var name = place ? (place.displayName || place.name || '') : '';
        var editIcon = _iconSpan('EDIT');
        var refreshIcon = _iconSpan('REFRESH');

        return (
            '<div class="eco-details-header">' +
                '<h3>' + _escapeHtml(name) + ' - Economy</h3>' +
                '<div class="eco-details-actions">' +
                    '<button type="button" class="eco-btn" data-action="edit-economy">' +
                        editIcon + ' Edit' +
                    '</button>' +
                    '<button type="button" class="eco-btn" data-action="refresh-economy">' +
                        refreshIcon + ' Refresh' +
                    '</button>' +
                '</div>' +
            '</div>'
        );
    }

    function _buildNoteBanner() {
        return (
            '<div class="eco-integration-banner" role="note">' +
                '<strong>Prosperity and crime rate are derived.</strong> ' +
                'They are computed from the writable inputs below (justice ' +
                'severity, watch, salary budget) plus tax rate, features, ' +
                'military spending, employment, religion, and education. ' +
                'Use the Edit action to change justice severity, watch, or ' +
                'salary budget.' +
            '</div>'
        );
    }

    function _renderStatCard(iconName, value, label, sub) {
        var iconSvg = _iconSpan(iconName);
        return (
            '<div class="eco-stat-card">' +
                '<div class="eco-stat-icon">' + iconSvg + '</div>' +
                '<div class="eco-stat-content">' +
                    '<div class="eco-stat-value">' + _escapeHtml(value) + '</div>' +
                    '<div class="eco-stat-label">' + _escapeHtml(label) + '</div>' +
                    (sub
                        ? '<div class="eco-stat-sub">' + _escapeHtml(sub) + '</div>'
                        : '') +
                '</div>' +
            '</div>'
        );
    }

    function _buildStatGrid(view) {
        var emp = view.employment;
        var lit = view.literacy;

        var populationLabel = _fmtNumber(view.population);
        var employmentLabel = emp
            ? _fmtPercent(emp.employmentRate, 0)
            : '—';
        var employmentSub = emp
            ? (emp.totalEmployed.toLocaleString() + ' employed, ' +
               emp.unemployed.toLocaleString() + ' unemployed')
            : 'Employment data unavailable';
        var literacyLabel = lit ? _fmtPercent(lit.literacyRate, 0) : '—';
        var literacySub = lit
            ? (lit.literateCount.toLocaleString() + ' literate of ' +
               lit.totalPopulation.toLocaleString())
            : 'Literacy data unavailable';

        return (
            '<div class="eco-stats-grid">' +
                _renderStatCard('PERSON', populationLabel, 'Living Population', '') +
                _renderStatCard('PERSON', employmentLabel, 'Employment Rate', employmentSub) +
                _renderStatCard('BOOK', literacyLabel, 'Literacy Rate', literacySub) +
                _renderStatCard('COIN', emp ? _fmtNumber(emp.averageWage) : '—', 'Average Wage', '') +
            '</div>'
        );
    }

    function _buildProsperityBlock(view) {
        var prosperity = view.prosperity;
        if (!prosperity) {
            return (
                '<div class="eco-prosperity">' +
                    '<div class="eco-prosperity-label">Prosperity (derived)</div>' +
                    '<div class="eco-prosperity-value">' + _unknown() + '</div>' +
                '</div>'
            );
        }

        var bucket = _prosperityBucket(prosperity.value);
        var pct = typeof prosperity.value === 'number'
            ? Math.min(100, Math.max(0, Math.round(prosperity.value)))
            : 0;

        return (
            '<div class="eco-prosperity">' +
                '<div class="eco-prosperity-label">Prosperity (derived)</div>' +
                '<div class="eco-prosperity-bar">' +
                    '<div class="eco-prosperity-fill ' + bucket.className + '" ' +
                        'data-width="' + pct + '"></div>' +
                '</div>' +
                '<div class="eco-prosperity-value">' +
                    (typeof prosperity.value === 'number'
                        ? _escapeHtml(String(prosperity.value))
                        : '—') +
                    ' - ' + _escapeHtml(bucket.label) +
                    (prosperity.band ? ' (' + _escapeHtml(prosperity.band.name) + ')' : '') +
                '</div>' +
            '</div>'
        );
    }

    function _buildCrimeBlock(view) {
        var crime = view.crime;
        if (!crime) {
            return (
                '<div class="eco-crime">' +
                    '<div class="eco-crime-label">Crime Rate (derived)</div>' +
                    '<div class="eco-crime-value">' + _unknown() + '</div>' +
                '</div>'
            );
        }

        var bucket = _crimeBucket(crime.value);
        var pct = typeof crime.value === 'number'
            ? Math.round(crime.value * 100)
            : null;

        return (
            '<div class="eco-crime">' +
                '<div class="eco-crime-label">Crime Rate (derived)</div>' +
                '<div class="eco-crime-value ' + bucket.className + '">' +
                    (pct !== null ? pct + '%' : '—') +
                    ' - ' + _escapeHtml(bucket.label) +
                '</div>' +
            '</div>'
        );
    }

    function _buildJusticeBlock(view) {
        var s = view.settlement;
        var severity = s.justiceSeverity || 'medium';
        return (
            '<div class="eco-justice">' +
                '<div class="eco-justice-label">Justice Severity</div>' +
                '<div class="eco-justice-value">' +
                    _escapeHtml(_justiceLabel(severity)) +
                '</div>' +
            '</div>'
        );
    }

    function _buildWatchBlock(view) {
        var s = view.settlement;
        var active = s.hasWatch === true;
        var size = typeof s.watchSize === 'number' ? s.watchSize : 0;
        return (
            '<div class="eco-watch">' +
                '<div class="eco-watch-label">Watch</div>' +
                '<div class="eco-watch-value">' +
                    (active
                        ? 'Active <span class="eco-watch-size">(' + size + ' members)</span>'
                        : 'Inactive') +
                '</div>' +
            '</div>'
        );
    }

    function _buildSalaryBudgetBlock(view) {
        var s = view.settlement;
        var raw = s.governmentSalaryBudget;
        var has = typeof raw === 'number';
        return (
            '<div class="eco-salary-budget">' +
                '<div class="eco-salary-label">Government Salary Budget (annual)</div>' +
                '<div class="eco-salary-value">' +
                    (has
                        ? raw.toLocaleString() + ' gold/year'
                        : '— (not allocated)') +
                '</div>' +
            '</div>'
        );
    }

    function _buildReligionBlock(view) {
        var unity = view.religiousUnity;
        var dominant = view.dominantReligion;
        return (
            '<div class="eco-religion">' +
                '<div class="eco-religion-label">Religion (derived)</div>' +
                '<div class="eco-religion-value">' +
                    'Unity: ' + (typeof unity === 'number' ? unity + '%' : '—') +
                    ' · Dominant: ' + (dominant ? _escapeHtml(dominant.name) : '—') +
                '</div>' +
            '</div>'
        );
    }

    function _buildSettlementDetailsBlock(view) {
        return (
            '<div class="eco-settlement-details">' +
                '<h4>Settlement Economy</h4>' +
                _buildProsperityBlock(view) +
                _buildCrimeBlock(view) +
                _buildJusticeBlock(view) +
                _buildWatchBlock(view) +
                _buildSalaryBudgetBlock(view) +
                _buildReligionBlock(view) +
            '</div>'
        );
    }

    function _buildEmptyState() {
        return (
            '<div class="eco-details-empty">' +
                'No settlement record exists for this location. ' +
                'The economy view requires a settlement; it cannot be created ' +
                'from this tab.' +
            '</div>'
        );
    }

    function _buildShell(place, view) {
        if (!place) {
            return '<div class="eco-details-empty">Select a location to view economy details.</div>';
        }
        if (!view) {
            return (
                '<div class="eco-details-container">' +
                    _buildHeader(place) +
                    _buildNoteBanner() +
                    _buildEmptyState() +
                '</div>'
            );
        }

        return (
            '<div class="eco-details-container">' +
                _buildHeader(place) +
                _buildNoteBanner() +
                _buildStatGrid(view) +
                _buildSettlementDetailsBlock(view) +
            '</div>'
        );
    }

    /**
     * Applies prosperity bar widths from the data-width attributes set
     * by _buildProsperityBlock. Called after innerHTML assignment
     * because a runtime percentage cannot be expressed in a static CSS
     * class.
     */
    function _applyProsperityBarWidths(container) {
        var fills = container.querySelectorAll('.eco-prosperity-fill');
        for (var i = 0; i < fills.length; i++) {
            var w = fills[i].getAttribute('data-width');
            if (w !== null) fills[i].style.width = w + '%';
        }
    }

    // =========================================================================
    // 6. RENDER
    // =========================================================================

    function renderEconomyDetailsTab(containerId, locationId) {
        var container = document.getElementById(containerId);
        if (!container) {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn('Economy details container not found:', containerId);
            }
            return;
        }

        var place = locationId ? _placeSummary(locationId) : null;
        var view = locationId ? _loadEconomyView(locationId) : null;

        container.innerHTML = _buildShell(place, view);
        container.dataset.locationId = locationId || '';

        _applyProsperityBarWidths(container);
        _bindActions(container, containerId, locationId);
    }

    // =========================================================================
    // 7. ACTION BINDING
    // =========================================================================

    function _bindActions(container, containerId, locationId) {
        if (container._govEcoBound) return;
        container._govEcoBound = true;

        function refresh() {
            try {
                renderEconomyDetailsTab(containerId, locationId);
            } catch (err) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error('government-economy-tab: refresh failed', err);
                }
                _toast('Economy refresh failed; see console.', 'error');
            }
        }

        container.addEventListener('click', function (event) {
            var target = event.target.closest('[data-action]');
            if (!target) return;
            if (!container.contains(target)) return;

            var action = target.getAttribute('data-action');

            if (action === 'edit-economy') {
                event.preventDefault();
                if (!locationId) {
                    _toast('No location selected', 'warning');
                    return;
                }
                _openEditEconomyModal(locationId, refresh);
                return;
            }

            if (action === 'refresh-economy') {
                event.preventDefault();
                refresh();
                _toast('Economy refreshed', 'info');
                return;
            }
        });
    }

    // =========================================================================
    // 8. EDIT MODAL
    // =========================================================================
    //
    // Only three fields are editable:
    //   - justiceSeverity        → SettlementGovernmentCommands.setJusticeSeverity
    //   - hasWatch / watchSize   → SettlementGovernmentCommands.setWatch
    //   - governmentSalaryBudget → SettlementFiscalCommands.setBudgetAllocation
    //
    // Prosperity and crime rate are NOT in the form. They are derived
    // values and no command writes them.

    function _openEditEconomyModal(locationId, onComplete) {
        var settlement = SQ.getSettlementData(locationId);
        if (!settlement) {
            _toast('No settlement record for this location', 'error');
            return;
        }

        var place = _placeSummary(locationId);
        var placeName = place ? (place.displayName || place.name || '') : '';

        var currentJustice = settlement.justiceSeverity || 'medium';
        var currentHasWatch = settlement.hasWatch === true;
        var currentWatchSize = typeof settlement.watchSize === 'number'
            ? settlement.watchSize
            : 0;
        var currentSalaryBudget = typeof settlement.governmentSalaryBudget === 'number'
            ? settlement.governmentSalaryBudget
            : null;

        var content = '<div class="eco-edit-form">';

        content += '<div class="eco-edit-warning">' +
            '<p><strong>Edits apply to this settlement record only.</strong> ' +
            'Each change commits independently and is persisted immediately. ' +
            'Prosperity and crime rate are not editable — they are derived ' +
            'from the fields below plus tax rate, features, military spending, ' +
            'employment, religion, and education.</p>' +
            '</div>';

        // Justice severity
        content += '<div class="form-group">' +
            '<label for="eco-justice-select">Justice Severity</label>' +
            '<select id="eco-justice-select" class="form-control">';
        var severities = SGD.JUSTICE_SEVERITIES;
        for (var i = 0; i < severities.length; i++) {
            var s = severities[i];
            var selected = s.id === currentJustice ? ' selected' : '';
            content += '<option value="' + _escapeHtml(s.id) + '"' + selected + '>' +
                _escapeHtml(s.name) + '</option>';
        }
        content += '</select></div>';

        // Watch
        content += '<div class="form-group">' +
            '<label>Watch</label>' +
            '<div class="eco-watch-toggle">' +
                '<label><input type="radio" name="eco-watch" value="active"' +
                    (currentHasWatch ? ' checked' : '') + '> Active</label>' +
                '<label><input type="radio" name="eco-watch" value="inactive"' +
                    (!currentHasWatch ? ' checked' : '') + '> Inactive</label>' +
            '</div>' +
            '</div>';

        content += '<div class="form-group">' +
            '<label for="eco-watch-size-input">Watch Size</label>' +
            '<input type="number" id="eco-watch-size-input" class="form-control" ' +
                'min="0" max="1000" step="1" value="' +
                _escapeHtml(String(currentWatchSize)) + '"' +
                (currentHasWatch ? '' : ' disabled') + '>' +
            '<small style="font-size:0.55rem;color:var(--dim);">' +
            'Must be at least 1 when watch is active. Set to 0 when inactive.</small>' +
            '</div>';

        // Salary budget
        content += '<div class="form-group">' +
            '<label for="eco-salary-input">Government Salary Budget (gold/year)</label>' +
            '<input type="number" id="eco-salary-input" class="form-control" ' +
                'min="0" step="10" value="' +
                (currentSalaryBudget !== null
                    ? _escapeHtml(String(currentSalaryBudget))
                    : '') + '">' +
            '<small style="font-size:0.55rem;color:var(--dim);">' +
            'Annual gold allocated by the settlement treasury for government salaries.</small>' +
            '</div>';

        content += '</div>';

        var container = _openModal({
            titleHtml: 'Edit Economy: ' + _escapeHtml(placeName),
            contentHtml: content,
            confirmText: 'Save',
            cancelText: 'Cancel',
            onMount: function (root) {
                var radios = root.querySelectorAll('input[name="eco-watch"]');
                var sizeInput = root.querySelector('#eco-watch-size-input');
                if (!radios.length || !sizeInput) return;

                function syncWatchSizeEnabled() {
                    var checked = root.querySelector('input[name="eco-watch"]:checked');
                    var active = checked && checked.value === 'active';
                    sizeInput.disabled = !active;
                    if (!active) {
                        sizeInput.value = '0';
                    } else if (parseInt(sizeInput.value, 10) < 1) {
                        sizeInput.value = '1';
                    }
                }

                for (var r = 0; r < radios.length; r++) {
                    radios[r].addEventListener('change', syncWatchSizeEnabled);
                }
                syncWatchSizeEnabled();
            },
            onConfirm: function (root) {
                return _submitEditEconomy(root, locationId, settlement, onComplete);
            }
        });

        return container;
    }

    /**
     * Reads the form values, dispatches the three commands, and reports
     * the combined result. Each command commits independently — this is
     * deliberate. A partial failure (one command failed, two succeeded)
     * is reported as such, not rolled back.
     */
    function _submitEditEconomy(root, locationId, originalSettlement, onComplete) {
        var justiceEl = root.querySelector('#eco-justice-select');
        var watchEl = root.querySelector('input[name="eco-watch"]:checked');
        var sizeEl = root.querySelector('#eco-watch-size-input');
        var salaryEl = root.querySelector('#eco-salary-input');

        if (!justiceEl || !watchEl || !sizeEl || !salaryEl) {
            _toast('Form not found in modal', 'error');
            return false;
        }

        var newJustice = justiceEl.value || 'medium';
        var newHasWatch = watchEl.value === 'active';
        var newWatchSize = parseInt(sizeEl.value, 10);
        if (!isFinite(newWatchSize) || newWatchSize < 0) newWatchSize = 0;

        var salaryRaw = salaryEl.value;
        var newSalaryBudget = null;
        if (salaryRaw !== '' && salaryRaw !== null) {
            var parsed = parseInt(salaryRaw, 10);
            if (isFinite(parsed) && parsed >= 0) {
                newSalaryBudget = parsed;
            } else {
                _toast('Salary budget must be a non-negative integer', 'error');
                return false;
            }
        }

        if (newHasWatch && newWatchSize < 1) {
            _toast('Watch size must be at least 1 when watch is active', 'error');
            return false;
        }

        var results = [];

        // --- Justice severity ---
        if (newJustice !== originalSettlement.justiceSeverity) {
            try {
                var jr = SGC.setJusticeSeverity(locationId, newJustice);
                results.push({ field: 'justiceSeverity', result: jr });
            } catch (err) {
                results.push({
                    field: 'justiceSeverity',
                    result: { success: false, code: 'THROWN', message: err && err.message }
                });
            }
        }

        // --- Watch ---
        var currentHasWatch = originalSettlement.hasWatch === true;
        var currentWatchSize = typeof originalSettlement.watchSize === 'number'
            ? originalSettlement.watchSize
            : 0;
        var watchChanged = (newHasWatch !== currentHasWatch) ||
            (newHasWatch && newWatchSize !== currentWatchSize);
        if (watchChanged) {
            try {
                var wr = SGC.setWatch(locationId, {
                    hasWatch: newHasWatch,
                    watchSize: newHasWatch ? newWatchSize : 0
                });
                results.push({ field: 'watch', result: wr });
            } catch (err) {
                results.push({
                    field: 'watch',
                    result: { success: false, code: 'THROWN', message: err && err.message }
                });
            }
        }

        // --- Salary budget ---
        var currentSalaryBudget = typeof originalSettlement.governmentSalaryBudget === 'number'
            ? originalSettlement.governmentSalaryBudget
            : null;
        var salaryChanged = false;
        if (newSalaryBudget !== null && newSalaryBudget !== currentSalaryBudget) {
            salaryChanged = true;
        }
        if (salaryChanged) {
            try {
                var sr = SFC.setBudgetAllocation(locationId, {
                    governmentSalaryBudget: newSalaryBudget
                });
                results.push({ field: 'governmentSalaryBudget', result: sr });
            } catch (err) {
                results.push({
                    field: 'governmentSalaryBudget',
                    result: { success: false, code: 'THROWN', message: err && err.message }
                });
            }
        }

        if (results.length === 0) {
            _toast('No changes to save', 'info');
            return true;
        }

        var failures = results.filter(function (r) { return !r.result.success; });
        var successes = results.filter(function (r) { return r.result.success; });

        if (failures.length > 0) {
            var msg = failures.map(function (f) {
                var code = f.result.code || (f.result.message || 'unknown');
                return f.field + ': ' + code;
            }).join('; ');
            if (successes.length > 0) {
                _toast('Partial save (' + successes.length + '/' + results.length +
                    '): ' + msg, 'warning');
            } else {
                _toast('Save failed: ' + msg, 'error');
            }
            // Refresh anyway — partial success means the state changed.
            if (typeof onComplete === 'function') onComplete();
            return failures.length === results.length ? false : true;
        }

        _toast('Economy updated', 'success');
        if (typeof onComplete === 'function') onComplete();
        return true;
    }

    // =========================================================================
    // 9. REFRESH HELPER (public)
    // =========================================================================

    function refreshEconomyDetailsTab(locationId, containerId) {
        var id = containerId || 'economy-details-tab';
        var container = document.getElementById(id);
        if (!container) {
            var candidates = document.querySelectorAll(
                '.eco-details-tab-container, #economy-details-tab, .eco-details-container'
            );
            if (candidates.length === 0) return;
            container = candidates[0];
            // Prefer the nearest ancestor with an id.
            var cur = container;
            while (cur && !cur.id && cur.parentElement) cur = cur.parentElement;
            id = cur && cur.id ? cur.id : id;
        }
        renderEconomyDetailsTab(id, locationId);
    }

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

    window.EconomyDetailsTab = {
        render: renderEconomyDetailsTab,
        refresh: refreshEconomyDetailsTab,
        _loadEconomyView: _loadEconomyView,
        _openEditModal: _openEditEconomyModal,
        // Presentation helpers exposed for tests.
        _prosperityBucket: _prosperityBucket,
        _crimeBucket: _crimeBucket,
        _justiceLabel: _justiceLabel
    };

    window.renderEconomyDetailsTab = renderEconomyDetailsTab;
    window.refreshEconomyDetailsTab = refreshEconomyDetailsTab;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.EconomyDetailsTab;
    }
})();
