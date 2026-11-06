// js/tabs/government-economy-tab.js
/**
 * =============================================================================
 * GOVERNMENT ECONOMY TAB
 * js/tabs/government-economy-tab.js
 * =============================================================================
 *
 * LOCATION: js/tabs/government-economy-tab.js
 *
 * PURPOSE:
 *   Read and edit the settlement economy facts that are writable through
 *   canonical settlement commands, and display the derived facts that are
 *   not writable through any command.
 *
 * RENDERER CONTRACT (from GovernmentManagerBootstrap):
 *   fn(container, context)
 *   container  HTMLElement  — already emptied by TabManager
 *   context    { locationId, locationName, governmentState }
 *
 * ARCHITECTURE:
 *   Thin shell. No hierarchy walks, no aggregation, no probing for
 *   private write methods. Every read goes through a canonical query
 *   module; every write goes through a canonical settlement command.
 *
 * DATA SOURCES:
 *   - SettlementQueries.getSettlementData(locationId)
 *   - SettlementProsperityQueries.getProsperity(locationId)
 *   - SettlementCrimeQueries.getCrimeRate(locationId)
 *   - SettlementEmploymentQueries.getEmployment(locationId)
 *   - SettlementEducationQueries.getLiteracyStats(locationId)
 *   - SettlementReligionQueries.getReligiousUnity(locationId)
 *   - SettlementReligionQueries.getDominantReligion(locationId)
 *   - LocationQueries.getPopulationCount(locationId, false)
 *   - SettlementGovernmentDefinitions.JUSTICE_SEVERITIES
 *
 * WRITE PATH:
 *   - SettlementGovernmentCommands.setJusticeSeverity(locationId, id)
 *   - SettlementGovernmentCommands.setWatch(locationId, { hasWatch, watchSize })
 *   - SettlementFiscalCommands.setBudgetAllocation(locationId, { governmentSalaryBudget })
 *
 *   Each command commits independently. This tab does NOT call
 *   saveMasterData, does NOT call State._updateSettlementData, and does
 *   NOT roll back a partial success. The partial-save result is
 *   surfaced as a warning, and the tab refreshes into whatever state
 *   the commands actually left.
 *
 * READ-ONLY vs EDITABLE:
 *   Editable (each has a canonical command):
 *     justiceSeverity        → setJusticeSeverity
 *     hasWatch / watchSize   → setWatch
 *     governmentSalaryBudget → setBudgetAllocation
 *
 *   Read-only (derived — no command writes them):
 *     prosperity, crimeRate, religiousUnity, dominantReligion,
 *     literacyRate, employmentRate, population
 *
 * MISSING DATA:
 *   Every read returns null when the underlying data is missing. The
 *   tab renders an em-dash placeholder for null. It never fabricates.
 *   Distinguishing 0 from null matters:
 *     budget = 0     → "0g"
 *     budget = null  → "—" (never allocated)
 *   Same for every derived numeric.
 *
 * DEPENDENCIES (hard — throw at load if missing):
 *   - js/settlement/settlement-queries.js
 *   - js/settlement/settlement-prosperity-queries.js
 *   - js/settlement/settlement-crime-queries.js
 *   - js/settlement/settlement-employment-queries.js
 *   - js/settlement/settlement-education-queries.js
 *   - js/settlement/settlement-religion-queries.js
 *   - js/settlement/settlement-government-commands.js
 *   - js/settlement/settlement-fiscal-commands.js
 *   - js/settlement/settlement-government-definitions.js
 *   - js/location/location-queries.js
 *   - js/core/modals-core.js (openModal)
 *   - js/core/formatting.js  (escapeHtml)
 *   - js/core/icons.js       (Icons)
 *   - js/core/tab-manager.js (TabManager)
 *
 * DEPENDENCIES (soft — toast at click if missing):
 *   - js/core/ui.js          (showToast)
 *   - js/core/modals-core.js (closeTopModal)
 *
 * TIME CONTRACT: uses window.getCurrentYear (no fallback). This tab
 *   does not read the year directly, but the bootstrap's year control
 *   and the settlement annual processor both do.
 * ICON POLICY: glyphs from Icons[name] via _iconSpan; no emojis; no
 *   literal Unicode glyphs in string output. Em-dash placeholders are
 *   the literal "—" character, used as typographic text, not as icons.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   - Migrated from renderEconomyDetailsTab(containerId, locationId) to
 *     the TabManager renderer contract fn(container, context).
 *   - Self-registers with TabManager at load.
 *   - Stale-location bug fixed: the edit modal captures a *snapshot* of
 *     the settlement it opened against (originalSettlement) and uses
 *     that snapshot for change detection, but every command call uses
 *     the locationId passed at open time. The refresh path goes
 *     through TM.requestRender(SCOPE, TAB_ID), which re-derives the
 *     current location from the freshly built context — so if the user
 *     switches location while the modal is open, the modal still
 *     writes to the location it opened against, and the tab
 *     re-renders into the newly-selected location.
 *   - Prosperity-bar width bug fixed: the previous revision applied
 *     data-width → style.width in _applyProsperityBarWidths after
 *     innerHTML assignment, but the loop set `style.width = w + '%'`
 *     and w was a string. `'75' + '%'` is `'75%'` — that works. But if
 *     a future path passed a number, `75 + '%'` would also be `'75%'`.
 *     The bug was that the function ran once, after the first render,
 *     and never again — so a re-render into a different location
 *     re-inserted the bar fill elements with the *new* data-width
 *     attribute but no style, and the bars rendered at 0%. Fixed by
 *     making _applyProsperityBarWidths idempotent and calling it after
 *     every render.
 *   - Modal entry point signature: _openEditEconomyModal(locationId,
 *     onComplete) → _openEditEconomyModal(locationId). The refresh
 *     callback was a bind-time closure; now the modal calls
 *     module-level _refresh() on success/partial and on failure.
 *   - Removed dead refreshEconomyDetailsTab(locationId, containerId)
 *     id-scanning helper; TM.requestRender(SCOPE, TAB_ID) is the only
 *     supported refresh path.
 *   - _loadEconomyView: each query is wrapped individually so a throw
 *     from one derived query does not blank the whole tab. The failing
 *     query's value is left null and the corresponding card renders
 *     "—"; the error is logged.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. CONSTANTS
    // =========================================================================

    var TAB_ID = 'economy';
    var SCOPE  = 'government';

    // =========================================================================
    // 2. LOAD-TIME DEPENDENCY CHECKS
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
    if (!window.SettlementGovernmentCommands
        || typeof window.SettlementGovernmentCommands.setJusticeSeverity !== 'function'
        || typeof window.SettlementGovernmentCommands.setWatch !== 'function') {
        throw new Error(
            'government-economy-tab.js: settlement-government-commands.js must load first ' +
            '(setJusticeSeverity / setWatch).'
        );
    }
    if (!window.SettlementFiscalCommands
        || typeof window.SettlementFiscalCommands.setBudgetAllocation !== 'function') {
        throw new Error(
            'government-economy-tab.js: settlement-fiscal-commands.js must load first ' +
            '(setBudgetAllocation).'
        );
    }
    if (!window.SettlementGovernmentDefinitions
        || !Array.isArray(window.SettlementGovernmentDefinitions.JUSTICE_SEVERITIES)) {
        throw new Error(
            'government-economy-tab.js: settlement-government-definitions.js must load first ' +
            '(JUSTICE_SEVERITIES).'
        );
    }
    if (!window.LocationQueries) {
        throw new Error(
            'government-economy-tab.js: location-queries.js must load first.'
        );
    }
    if (typeof window.escapeHtml !== 'function') {
        throw new Error(
            'government-economy-tab.js: formatting.js (escapeHtml) must load first.'
        );
    }
    if (!window.Icons || typeof window.Icons !== 'object') {
        throw new Error(
            'government-economy-tab.js: icons.js must load first.'
        );
    }
    if (typeof window.openModal !== 'function') {
        throw new Error(
            'government-economy-tab.js: modals-core.js (openModal) must load first.'
        );
    }
    if (!window.TabManager || typeof window.TabManager.register !== 'function') {
        throw new Error(
            'government-economy-tab.js: tab-manager.js must load first.'
        );
    }

    var SQ   = window.SettlementQueries;
    var SPQ  = window.SettlementProsperityQueries;
    var SCQ  = window.SettlementCrimeQueries;
    var SEQ  = window.SettlementEmploymentQueries;
    var SEDQ = window.SettlementEducationQueries;
    var SRQ  = window.SettlementReligionQueries;
    var SGC  = window.SettlementGovernmentCommands;
    var SFC  = window.SettlementFiscalCommands;
    var SGD  = window.SettlementGovernmentDefinitions;
    var LQ   = window.LocationQueries;
    var TM   = window.TabManager;

    // =========================================================================
    // 3. DEPENDENCY WRAPPERS (soft)
    // =========================================================================

    function _esc(v) {
        if (typeof window.escapeHtml === 'function') {
            return window.escapeHtml(v);
        }
        if (v === null || v === undefined) return '';
        return String(v)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _icon(name) {
        if (typeof window.getIcon === 'function') {
            try {
                var s = window.getIcon(name);
                if (typeof s === 'string') return s;
            } catch (e) { /* fall through */ }
        }
        return (window.Icons && typeof window.Icons[name] === 'string')
            ? window.Icons[name]
            : '';
    }

    function _iconSpan(name) {
        var i = _icon(name);
        return i
            ? '<span class="gov-tab-icon" aria-hidden="true">' + i + '</span>'
            : '';
    }

    function _toast(msg, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(msg, type || 'info');
        } else if (typeof window._showToast === 'function') {
            window._showToast(msg, type || 'info');
        }
    }

    function _unknown() {
        return '<span class="value-unknown">—</span>';
    }

    function _fmtNumber(value) {
        if (typeof value !== 'number' || !isFinite(value)) return _unknown();
        return _esc(value.toLocaleString());
    }

    function _fmtPercent(value, digits) {
        if (typeof value !== 'number' || !isFinite(value)) return _unknown();
        var factor = Math.pow(10, digits || 0);
        var rounded = Math.round(value * factor) / factor;
        return _esc(String(rounded) + '%');
    }

    function _placeSummary(locationId) {
        if (!locationId) return null;
        if (typeof LQ.getPlaceSummary === 'function') {
            try { return LQ.getPlaceSummary(locationId); }
            catch (e) { return null; }
        }
        return null;
    }

    // =========================================================================
    // 4. PRESENTATION HELPERS (display-only; not domain rules)
    // =========================================================================

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
    // 5. DATA LOADERS (per-field try/catch — one bad derived query must
    //    not blank the tab)
    // =========================================================================

    function _safe(fn, label) {
        try { return fn(); }
        catch (e) {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn(
                    'government-economy-tab: ' + label + ' query threw',
                    e
                );
            }
            return null;
        }
    }

    function _loadEconomyView(locationId) {
        var settlement = _safe(function () {
            return SQ.getSettlementData(locationId);
        }, 'settlement');
        if (!settlement) return null;

        var population = _safe(function () {
            return LQ.getPopulationCount(locationId, false);
        }, 'population');

        var prosperity = _safe(function () {
            return SPQ.getProsperity(locationId);
        }, 'prosperity');

        var crime = _safe(function () {
            return SCQ.getCrimeRate(locationId);
        }, 'crime');

        var employment = _safe(function () {
            return SEQ.getEmployment(locationId);
        }, 'employment');

        var literacy = _safe(function () {
            return SEDQ.getLiteracyStats(locationId);
        }, 'literacy');

        var religiousUnity = _safe(function () {
            return SRQ.getReligiousUnity(locationId);
        }, 'religiousUnity');

        var dominantReligion = _safe(function () {
            return SRQ.getDominantReligion(locationId);
        }, 'dominantReligion');

        return {
            locationId: locationId,
            settlement: settlement,
            population: typeof population === 'number' ? population : null,
            prosperity: prosperity
                ? {
                    value: prosperity.value,
                    band: prosperity.band,
                    modifiers: prosperity.modifiers
                  }
                : null,
            crime: crime
                ? { value: crime.value, modifiers: crime.modifiers }
                : null,
            employment: employment || null,
            literacy: literacy || null,
            religiousUnity: typeof religiousUnity === 'number'
                ? religiousUnity
                : null,
            dominantReligion: dominantReligion || null
        };
    }

    // =========================================================================
    // 6. HTML BUILDERS
    // =========================================================================

    function _buildHeader(place) {
        var name = place ? (place.displayName || place.name || '') : '';

        return (
            '<div class="eco-details-header">' +
                '<h3>' + _esc(name) + ' - Economy</h3>' +
                '<div class="eco-details-actions">' +
                    '<button type="button" class="eco-btn" ' +
                        'data-action="edit-economy">' +
                        _iconSpan('EDIT') + ' Edit' +
                    '</button>' +
                    '<button type="button" class="eco-btn" ' +
                        'data-action="refresh-economy">' +
                        _iconSpan('REFRESH') + ' Refresh' +
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
        return (
            '<div class="eco-stat-card">' +
                '<div class="eco-stat-icon" aria-hidden="true">' +
                    _iconSpan(iconName) +
                '</div>' +
                '<div class="eco-stat-content">' +
                    '<div class="eco-stat-value">' + value + '</div>' +
                    '<div class="eco-stat-label">' + _esc(label) + '</div>' +
                    (sub
                        ? '<div class="eco-stat-sub">' + _esc(sub) + '</div>'
                        : '') +
                '</div>' +
            '</div>'
        );
    }

    function _buildStatGrid(view) {
        var emp = view.employment;
        var lit = view.literacy;

        var populationLabel = _fmtNumber(view.population);
        var employmentLabel = emp ? _fmtPercent(emp.employmentRate, 0) : _unknown();
        var employmentSub = emp
            ? (emp.totalEmployed.toLocaleString() + ' employed, ' +
               emp.unemployed.toLocaleString() + ' unemployed')
            : 'Employment data unavailable';
        var literacyLabel = lit ? _fmtPercent(lit.literacyRate, 0) : _unknown();
        var literacySub = lit
            ? (lit.literateCount.toLocaleString() + ' literate of ' +
               lit.totalPopulation.toLocaleString())
            : 'Literacy data unavailable';
        var wageLabel = emp ? _fmtNumber(emp.averageWage) : _unknown();

        return (
            '<div class="eco-stats-grid">' +
                _renderStatCard('PERSON', populationLabel, 'Living Population', '') +
                _renderStatCard('PERSON', employmentLabel, 'Employment Rate', employmentSub) +
                _renderStatCard('BOOK', literacyLabel, 'Literacy Rate', literacySub) +
                _renderStatCard('COIN', wageLabel, 'Average Wage', '') +
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
                        ? _esc(String(prosperity.value))
                        : '—') +
                    ' - ' + _esc(bucket.label) +
                    (prosperity.band
                        ? ' (' + _esc(prosperity.band.name) + ')'
                        : '') +
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
                    ' - ' + _esc(bucket.label) +
                '</div>' +
            '</div>'
        );
    }

    function _buildJusticeBlock(view) {
        var severity = view.settlement.justiceSeverity || 'medium';
        return (
            '<div class="eco-justice">' +
                '<div class="eco-justice-label">Justice Severity</div>' +
                '<div class="eco-justice-value">' +
                    _esc(_justiceLabel(severity)) +
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
                        ? 'Active <span class="eco-watch-size">(' +
                          size + ' members)</span>'
                        : 'Inactive') +
                '</div>' +
            '</div>'
        );
    }

    function _buildSalaryBudgetBlock(view) {
        var raw = view.settlement.governmentSalaryBudget;
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
                    ' · Dominant: ' + (dominant ? _esc(dominant.name) : '—') +
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
                'The economy view requires a settlement; it cannot be ' +
                'created from this tab.' +
            '</div>'
        );
    }

    function _buildShell(place, view) {
        if (!place) {
            return '<div class="eco-details-empty">' +
                'Select a government from the sidebar to view economy.' +
                '</div>';
        }
        if (!view) {
            return (
                '<div class="eco-details-container" ' +
                    'data-location-id="' + _esc(place.id || '') + '">' +
                    _buildHeader(place) +
                    _buildNoteBanner() +
                    _buildEmptyState() +
                '</div>'
            );
        }

        return (
            '<div class="eco-details-container" ' +
                'data-location-id="' + _esc(place.id || '') + '">' +
                _buildHeader(place) +
                _buildNoteBanner() +
                _buildStatGrid(view) +
                _buildSettlementDetailsBlock(view) +
            '</div>'
        );
    }

    /**
     * Applies prosperity-bar widths from the data-width attributes set
     * by _buildProsperityBlock. Runtime percentages cannot be expressed
     * in a static CSS class, so the width is set after innerHTML
     * assignment. Idempotent — safe to call on every render (a fresh
     * container needs it every time, and calling it on the same
     * container is a no-op rewrite of the same width).
     */
    function _applyProsperityBarWidths(container) {
        var fills = container.querySelectorAll('.eco-prosperity-fill');
        for (var i = 0; i < fills.length; i++) {
            var w = fills[i].getAttribute('data-width');
            if (w !== null) fills[i].style.width = w + '%';
        }
    }

    // =========================================================================
    // 7. RENDERER (TabManager contract: fn(container, context))
    // =========================================================================

    function renderEconomyDetailsTab(container, context) {
        if (!container) return;

        if (!context || !context.locationId) {
            container.innerHTML =
                '<div class="empty-state">' +
                'Select a government from the sidebar to view economy.' +
                '</div>';
            return;
        }

        var locationId = context.locationId;
        var place = (context.governmentState && context.governmentState.place)
            ? context.governmentState.place
            : _placeSummary(locationId);

        var view = _loadEconomyView(locationId);

        container.innerHTML = _buildShell(place, view);
        container.dataset.locationId = locationId;

        _applyProsperityBarWidths(container);
        _bindActions(container);
    }

    function _refresh() {
        if (TM && typeof TM.requestRender === 'function') {
            TM.requestRender(SCOPE, TAB_ID);
        }
    }

    // =========================================================================
    // 8. ACTION BINDING (delegated, on the tab container)
    // =========================================================================

    function _bindActions(container) {
        if (container._govEcoBound) return;
        container._govEcoBound = true;

        container.addEventListener('click', function (event) {
            var target = event.target.closest('[data-action]');
            if (!target || !container.contains(target)) return;

            var action = target.getAttribute('data-action');
            var locationId = container.dataset.locationId;
            if (!locationId) return;

            if (action === 'edit-economy') {
                event.preventDefault();
                _openEditEconomyModal(locationId);
                return;
            }

            if (action === 'refresh-economy') {
                event.preventDefault();
                _refresh();
                _toast('Economy refreshed', 'info');
                return;
            }
        });
    }

    // =========================================================================
    // 9. EDIT MODAL
    // =========================================================================
    //
    // Only three fields are editable, each with a canonical command:
    //   justiceSeverity        → SettlementGovernmentCommands.setJusticeSeverity
    //   hasWatch / watchSize   → SettlementGovernmentCommands.setWatch
    //   governmentSalaryBudget → SettlementFiscalCommands.setBudgetAllocation
    //
    // Prosperity and crime rate are NOT in the form — they are derived
    // values, and no command writes them. The note banner and the edit
    // modal's warning block both say so.

    function _openEditEconomyModal(locationId) {
        var settlement;
        try { settlement = SQ.getSettlementData(locationId); }
        catch (e) { settlement = null; }

        if (!settlement) {
            _toast('No settlement record for this location', 'error');
            return;
        }

        var place = _placeSummary(locationId);
        var placeName = place ? (place.displayName || place.name || '') : '';

        // Snapshot the settlement at open time. Change detection
        // compares against this snapshot; command calls use the same
        // locationId the modal opened against, even if the user has
        // since switched the sidebar selection.
        var snapshot = settlement;

        var currentJustice = snapshot.justiceSeverity || 'medium';
        var currentHasWatch = snapshot.hasWatch === true;
        var currentWatchSize = typeof snapshot.watchSize === 'number'
            ? snapshot.watchSize
            : 0;
        var currentSalaryBudget = typeof snapshot.governmentSalaryBudget === 'number'
            ? snapshot.governmentSalaryBudget
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
            content += '<option value="' + _esc(s.id) + '"' + selected + '>' +
                _esc(s.name) + '</option>';
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
                _esc(String(currentWatchSize)) + '"' +
                (currentHasWatch ? '' : ' disabled') + '>' +
            '<small class="eco-form-hint">' +
            'Must be at least 1 when watch is active. Set to 0 when inactive.</small>' +
            '</div>';

        // Salary budget
        content += '<div class="form-group">' +
            '<label for="eco-salary-input">Government Salary Budget (gold/year)</label>' +
            '<input type="number" id="eco-salary-input" class="form-control" ' +
                'min="0" step="10" value="' +
                (currentSalaryBudget !== null
                    ? _esc(String(currentSalaryBudget))
                    : '') + '">' +
            '<small class="eco-form-hint">' +
            'Annual gold allocated by the settlement treasury for government salaries.</small>' +
            '</div>';

        content += '</div>';

        window.openModal({
            titleHtml: 'Edit Economy: ' + _esc(placeName),
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
                return _submitEditEconomy(root, locationId, snapshot);
            }
        });
    }

    /**
     * Reads the form, dispatches the three commands (each independently),
     * and reports the combined result. A partial success is reported as
     * such, not rolled back. The tab refreshes into whatever the
     * commands actually left.
     */
    function _submitEditEconomy(root, locationId, originalSettlement) {
        var justiceEl = root.querySelector('#eco-justice-select');
        var watchEl   = root.querySelector('input[name="eco-watch"]:checked');
        var sizeEl    = root.querySelector('#eco-watch-size-input');
        var salaryEl  = root.querySelector('#eco-salary-input');

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

        if (newJustice !== originalSettlement.justiceSeverity) {
            try {
                var jr = SGC.setJusticeSeverity(locationId, newJustice);
                results.push({ field: 'justiceSeverity', result: jr });
            } catch (err) {
                results.push({
                    field: 'justiceSeverity',
                    result: {
                        success: false,
                        code: 'THROWN',
                        message: err && err.message
                    }
                });
            }
        }

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
                    result: {
                        success: false,
                        code: 'THROWN',
                        message: err && err.message
                    }
                });
            }
        }

        var currentSalaryBudget = typeof originalSettlement.governmentSalaryBudget === 'number'
            ? originalSettlement.governmentSalaryBudget
            : null;
        var salaryChanged = (newSalaryBudget !== null)
            && (newSalaryBudget !== currentSalaryBudget);
        if (salaryChanged) {
            try {
                var sr = SFC.setBudgetAllocation(locationId, {
                    governmentSalaryBudget: newSalaryBudget
                });
                results.push({ field: 'governmentSalaryBudget', result: sr });
            } catch (err) {
                results.push({
                    field: 'governmentSalaryBudget',
                    result: {
                        success: false,
                        code: 'THROWN',
                        message: err && err.message
                    }
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
                _toast('Partial save (' + successes.length + '/' +
                    results.length + '): ' + msg, 'warning');
            } else {
                _toast('Save failed: ' + msg, 'error');
            }
            // Refresh anyway — a partial success means state changed.
            _refresh();
            return failures.length === results.length ? false : true;
        }

        _toast('Economy updated', 'success');
        _refresh();
        return true;
    }

    // =========================================================================
    // 10. REGISTRATION (playbook §5)
    // =========================================================================

    TM.register(SCOPE, TAB_ID, renderEconomyDetailsTab);

    // =========================================================================
    // 11. EXPORTS
    // =========================================================================

    window.EconomyDetailsTab = {
        id: TAB_ID,
        render: renderEconomyDetailsTab,

        // Data loader, exposed for tests and for any future caller
        // that wants the same view shape the tab renders.
        _loadEconomyView: _loadEconomyView,

        // Modal entry point, exposed so a topbar or a future deep link
        // can route an "Edit Economy" action through this tab's single
        // modal opener.
        _openEditModal: _openEditEconomyModal,

        // Presentation helpers, exposed for tests.
        _prosperityBucket: _prosperityBucket,
        _crimeBucket: _crimeBucket,
        _justiceLabel: _justiceLabel
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.EconomyDetailsTab;
    }
})();
