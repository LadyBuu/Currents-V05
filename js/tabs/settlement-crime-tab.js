/**
 * =============================================================================
 * SETTLEMENT CRIME TAB
 * js/tabs/settlement-crime-tab.js
 * =============================================================================
 *
 * Renders the settlement's crime landscape and hosts the actions to:
 *   - Justice Settings        (SettlementEconomyModals.openJusticeModal)
 *   - Create Crime            (CrimeModals.openCreateCrimeModal)
 *   - Create Vendetta         (CrimeModals.openVendettaModal, settlement-scoped)
 *   - Crime Statistics        (CrimeModals.openCrimeStatsModal)
 *
 * RENDERER CONTRACT:
 *   fn(container, context) with context = { locationId, data, viewModel }
 *
 * DATA SOURCES:
 *   - SettlementCrimeQueries.getCrimeRate(locationId)
 *   - SettlementViewModels.buildCrimeView(locationId)  (soft)
 *   - CrimeQueries.getCrimesByLocation(locationId)
 *   - CrimeQueries.getVendettasByHousehold(householdId) — one call per
 *     settlement household, de-duped by vendetta id
 *   - HouseholdQueries.getHouseholdsByLocation
 *   - LocationQueries.getAllSubLocationIds
 *   - CrimeStatsUI.renderCrimeList / renderVendettaList (delegated DOM
 *     writers, same hidden-host pattern as education)
 *
 * SCOPE OF THE INCIDENT LIST:
 *   Own location only (CrimeQueries.getCrimesByLocation), not the subtree.
 *   See the header of the current crime tab for the rationale — this is
 *   a deliberate choice, not a bug.
 *
 * SCOPE OF THE VENDETTA LIST:
 *   Union of every settlement household's vendettas, de-duped. Shows
 *   internal feuds AND feuds between a settlement household and an
 *   outside household. The create path is restricted to internal feuds.
 *
 * AUTO-REFRESH ON SETTLEMENT MUTATION:
 *   The prior implementation subscribed to SettlementState at module
 *   load and re-rendered the crime tab on every settlement event. That
 *   subscription was page-lifetime and never torn down. The TabManager
 *   paradigm doesn't need it — the modals that mutate settlement state
 *   call SettlementTabs.requestRender-equivalent (TabManager.requestRender)
 *   themselves. If a command publishes a settlement event outside a
 *   modal path, the user clicks Refresh.
 *
 * NO CSS. Class-only rendering.
 * =============================================================================
 */

(function () {
    'use strict';

    var TAB_ID = 'crime';
    var SCOPE  = 'settlement';

    function H() { return window.SettlementTabHelpers; }
    function esc(v)        { return H().esc(v); }
    function icon(n)       { return H().icon(n); }
    function fmtNum(v)     { return H().fmtNumber(v); }
    function fmtPercent(v) { return H().fmtPercent(v); }
    function unknown()     { return H().unknown(); }
    function refresh()     { H().requestRefresh(SCOPE, TAB_ID); }

    // -------------------------------------------------------------------
    // Dependency access
    // -------------------------------------------------------------------

    function _getSettlementCrimeQueries() {
        var Q = window.SettlementCrimeQueries;
        if (!Q || typeof Q.getCrimeRate !== 'function') return null;
        return Q;
    }

    function _getSettlementViewModels() {
        var VMs = window.SettlementViewModels;
        if (!VMs || typeof VMs.buildCrimeView !== 'function') return null;
        return VMs;
    }

    function _getCrimeQueries() {
        var Q = window.CrimeQueries;
        if (!Q || typeof Q.getCrimesByLocation !== 'function'
            || typeof Q.getVendettasByHousehold !== 'function') {
            return null;
        }
        return Q;
    }

    function _getCrimeStatsUI() {
        var UI = window.CrimeStatsUI;
        if (!UI || typeof UI.renderCrimeList !== 'function'
            || typeof UI.renderVendettaList !== 'function') {
            return null;
        }
        return UI;
    }

    function _getCrimeModals() {
        var M = window.CrimeModals;
        if (!M) return null;
        return M;
    }

    function _getEconomyModals() {
        var M = window.SettlementEconomyModals;
        if (!M || typeof M.openJusticeModal !== 'function') return null;
        return M;
    }

    function _getLocationQueries() {
        var Q = window.LocationQueries;
        if (!Q || typeof Q.getAllSubLocationIds !== 'function') return null;
        return Q;
    }

    function _getHouseholdQueries() {
        var Q = window.HouseholdQueries;
        if (!Q || typeof Q.getHouseholdsByLocation !== 'function') return null;
        return Q;
    }

    function _placeName(locationId) {
        var pq = window.PlaceQueries;
        if (!pq || typeof pq.getPlaceById !== 'function') return null;
        var place = pq.getPlaceById(locationId);
        return place ? (place.displayName || place.name || null) : null;
    }

    // -------------------------------------------------------------------
    // Household enumeration + vendetta reads
    // -------------------------------------------------------------------

    function _getSettlementHouseholds(locationId) {
        var LQ = _getLocationQueries();
        var HQ = _getHouseholdQueries();
        if (!LQ || !HQ) return [];

        var subtreeIds;
        try { subtreeIds = LQ.getAllSubLocationIds(locationId); }
        catch (e) { subtreeIds = null; }
        if (!Array.isArray(subtreeIds) || subtreeIds.length === 0) {
            subtreeIds = [locationId];
        } else if (subtreeIds.indexOf(locationId) === -1) {
            subtreeIds = subtreeIds.slice();
            subtreeIds.push(locationId);
        }

        var seen = Object.create(null);
        var out = [];
        for (var i = 0; i < subtreeIds.length; i++) {
            var households;
            try { households = HQ.getHouseholdsByLocation(subtreeIds[i]); }
            catch (e) { households = null; }
            if (!Array.isArray(households)) continue;
            for (var j = 0; j < households.length; j++) {
                var h = households[j];
                if (!h || !h.id) continue;
                if (seen[h.id]) continue;
                seen[h.id] = true;
                out.push(h);
            }
        }
        out.sort(function (a, b) {
            var an = (a.name || '').toLowerCase();
            var bn = (b.name || '').toLowerCase();
            return an.localeCompare(bn);
        });
        return out;
    }

    function _getSettlementVendettas(locationId) {
        var CQ = _getCrimeQueries();
        if (!CQ) return [];
        var households = _getSettlementHouseholds(locationId);
        if (households.length === 0) return [];

        var seen = Object.create(null);
        var out = [];
        for (var i = 0; i < households.length; i++) {
            var list;
            try {
                list = CQ.getVendettasByHousehold(households[i].id, {
                    includeResolved: false
                });
            } catch (e) { list = null; }
            if (!Array.isArray(list)) continue;
            for (var j = 0; j < list.length; j++) {
                var v = list[j];
                if (!v || !v.id) continue;
                if (seen[v.id]) continue;
                seen[v.id] = true;
                out.push(v);
            }
        }
        return out;
    }

    function _getSettlementHouseholdIds(locationId) {
        var households = _getSettlementHouseholds(locationId);
        var out = [];
        for (var i = 0; i < households.length; i++) {
            if (households[i] && households[i].id) out.push(households[i].id);
        }
        return out;
    }

    // -------------------------------------------------------------------
    // Modal delegates
    // -------------------------------------------------------------------

    function _openJusticeModal(locationId) {
        var M = _getEconomyModals();
        if (!M) {
            H().toast('Justice modal is not available.', 'error');
            return;
        }
        try { M.openJusticeModal(locationId); }
        catch (err) {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    'settlement-crime-tab: openJusticeModal threw:', err);
            }
            H().toast('Could not open justice modal.', 'error');
        }
    }

    function _openCreateCrimeModal(locationId) {
        var M = _getCrimeModals();
        if (!M || typeof M.openCreateCrimeModal !== 'function') {
            H().toast(
                'Create Crime modal is not available. Load modals-crime.js ' +
                'with the openCreateCrimeModal entry point.', 'error');
            return;
        }
        try {
            M.openCreateCrimeModal({
                locationId: locationId,
                onComplete: function () { refresh(); }
            });
        } catch (err) {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    'settlement-crime-tab: openCreateCrimeModal threw:', err);
            }
            H().toast('Could not open create-crime modal.', 'error');
        }
    }

    function _openCreateVendettaModal(locationId) {
        var M = _getCrimeModals();
        if (!M || typeof M.openVendettaModal !== 'function') {
            H().toast('Vendetta modal is not available.', 'error');
            return;
        }
        if (M.openVendettaModal.supportsSettlementScope !== true) {
            H().toast(
                'Creating a settlement-scoped vendetta requires the ' +
                'settlement-scoped vendetta modal. Update modals-crime.js ' +
                'to set openVendettaModal.supportsSettlementScope = true.',
                'error');
            return;
        }
        var householdIds = _getSettlementHouseholdIds(locationId);
        if (householdIds.length < 2) {
            H().toast(
                'A vendetta requires at least two households in the ' +
                'settlement. This settlement has ' + householdIds.length + '.',
                'warning');
            return;
        }
        try {
            M.openVendettaModal({
                locationId: locationId,
                settlementHouseholdIds: householdIds,
                onComplete: function () { refresh(); }
            });
        } catch (err) {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    'settlement-crime-tab: openVendettaModal threw:', err);
            }
            H().toast('Could not open vendetta modal.', 'error');
        }
    }

    function _openCrimeStatsModal(locationId) {
        var M = _getCrimeModals();
        if (!M || typeof M.openCrimeStatsModal !== 'function') {
            H().toast('Crime statistics modal is not available.', 'error');
            return;
        }
        try { M.openCrimeStatsModal(locationId); }
        catch (err) {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    'settlement-crime-tab: openCrimeStatsModal threw:', err);
            }
            H().toast('Could not open crime statistics modal.', 'error');
        }
    }

    // -------------------------------------------------------------------
    // CrimeStatsUI host adoption (same pattern as education tab)
    // -------------------------------------------------------------------

    var _hostCounter = 0;

    function _adoptHost(renderFn) {
        var hostId = '__stCrimeHost_' + (++_hostCounter) + '_' + Date.now();
        var host = document.createElement('div');
        host.id = hostId;
        host.style.display = 'none';
        document.body.appendChild(host);
        try {
            renderFn(hostId, host);
            return host.innerHTML;
        } finally {
            if (host.parentNode) host.parentNode.removeChild(host);
        }
    }

    // -------------------------------------------------------------------
    // Sections
    // -------------------------------------------------------------------

    function _buildHeader(context, crimeView, summary, crimeRateView) {
        var name = summary && summary.name
            ? summary.name
            : (_placeName(context.locationId) || '(unnamed location)');

        var justiceName = crimeView && crimeView.justiceSeverityName
            ? crimeView.justiceSeverityName
            : (summary && summary.justiceSeverityName
                ? summary.justiceSeverityName : null);
        var hasWatch = summary && summary.hasWatch === true;
        var watchSize = summary && typeof summary.watchSize === 'number'
            ? summary.watchSize : null;
        var watchLabel = hasWatch
            ? (watchSize !== null ? watchSize + ' watch' : 'Active watch')
            : 'No watch';

        var rateValue = crimeRateView && typeof crimeRateView.value === 'number'
            ? crimeRateView.value : null;
        var ratePercent = rateValue !== null
            ? Math.round(rateValue * 1000) / 10
            : null;

        var rateClass = 'st-stat__value';
        if (ratePercent !== null) {
            if (ratePercent >= 40) rateClass += ' st-stat__value--neg';
            else if (ratePercent >= 20) rateClass += ' st-stat__value--warn';
            else rateClass += ' st-stat__value--pos';
        }

        var refreshBtn = '<button type="button" class="st-btn" ' +
            'data-action="refresh">' +
            icon('REFRESH') + ' Refresh</button>';

        return '<div class="st-header">' +
            '<div>' +
            '<div class="st-header__title">' +
            icon('WARNING') + ' Crime &amp; Justice in ' +
            esc(name) + '</div>' +
            '<div class="st-header__subtitle">' +
            'Justice: ' + esc(justiceName || '\u2014') +
            ' \u00b7 Watch: ' + esc(watchLabel) +
            '</div>' +
            '</div>' +
            '<div>' +
            '<div class="st-inline">' +
            '<span class="st-inline__label">Crime Rate</span>' +
            '<span class="' + rateClass + '">' +
            (ratePercent === null ? unknown() : fmtPercent(ratePercent)) +
            '</span>' +
            '</div>' +
            refreshBtn +
            '</div>' +
            '</div>';
    }

    function _buildActionButtons(locationId, canCreateVendetta) {
        function btn(action, label, iconName, accent, disabled, title) {
            return '<button type="button" class="st-btn' +
                (accent ? ' st-btn--accent' : '') + '" ' +
                'data-action="' + esc(action) + '"' +
                (disabled ? ' disabled' : '') +
                (title ? ' title="' + esc(title) + '"' : '') + '>' +
                (iconName ? icon(iconName) + ' ' : '') +
                esc(label) + '</button>';
        }
        return '<div class="st-header__actions">' +
            btn('justice', 'Justice Settings', 'SHIELD', true) +
            btn('create-crime', 'Create Crime', 'WARNING') +
            btn('create-vendetta', 'Create Vendetta', 'FLAG', false,
                !canCreateVendetta,
                canCreateVendetta
                    ? 'Create a vendetta between two households in this settlement'
                    : 'No households in this settlement to feud') +
            btn('crime-stats', 'Crime Statistics', 'CIRCLE_DOT') +
            '</div>';
    }

    function _buildCrimeRateSection(crimeRateView) {
        if (!crimeRateView) {
            return '<div class="st-section">' +
                '<div class="st-section__title">' +
                icon('WARNING') + ' Crime Rate</div>' +
                '<div class="st-section__empty">' +
                'Crime rate unavailable.</div></div>';
        }

        var value = typeof crimeRateView.value === 'number'
            ? Math.round(crimeRateView.value * 1000) / 10 : null;
        var base = typeof crimeRateView.base === 'number'
            ? Math.round(crimeRateView.base * 1000) / 10 : null;
        var modifiers = crimeRateView.modifiers || {};

        function modRow(label, v) {
            if (typeof v !== 'number') return '';
            var display = (v > 0 ? '+' : '') +
                _roundOneDecimal(v * 1000 / 1000 * 100) / 100;
            // Simpler: value is a fraction; display as percent with sign.
            var pct = Math.round(v * 1000) / 10;
            var sign = pct > 0 ? '+' : '';
            var cls = pct > 0
                ? 'st-inline__value'
                : (pct < 0 ? 'st-inline__value' : 'st-inline__value');
            var colorCls = pct > 0
                ? 'st-stat__value--neg'
                : (pct < 0 ? 'st-stat__value--pos' : '');
            return '<div class="st-inline">' +
                '<span class="st-inline__label">' + esc(label) + '</span>' +
                '<span class="' + colorCls + '">' +
                sign + pct + '%</span>' +
                '</div>';
        }

        var modsHtml = '';
        modsHtml += modRow('Prosperity', modifiers.prosperity);
        modsHtml += modRow('Tax Rate', modifiers.taxRate);
        modsHtml += modRow('Watch', modifiers.watch);
        modsHtml += modRow('Features', modifiers.features);
        modsHtml += modRow('Unemployment', modifiers.unemployment);
        modsHtml += modRow('Military Spending', modifiers.militarySpending);
        modsHtml += modRow('Justice Severity', modifiers.justiceSeverity);
        modsHtml += modRow('Religious Unity', modifiers.religiousUnity);
        modsHtml += modRow('Places of Worship', modifiers.placesOfWorship);

        var valueClass = 'st-stat__value';
        if (value !== null) {
            if (value >= 40) valueClass += ' st-stat__value--neg';
            else if (value >= 20) valueClass += ' st-stat__value--warn';
            else valueClass += ' st-stat__value--pos';
        }

        return '<div class="st-section">' +
            '<div class="st-section__title">' +
            icon('WARNING') + ' Crime Rate</div>' +
            '<div class="st-stats st-stats--2">' +
            '<div class="st-stat">' +
            '<div class="st-stat__label">Current</div>' +
            '<div class="' + valueClass + '">' +
            (value === null ? unknown() : fmtPercent(value)) +
            '</div></div>' +
            '<div class="st-stat">' +
            '<div class="st-stat__label">Base</div>' +
            '<div class="st-stat__value">' +
            (base === null ? unknown() : fmtPercent(base)) +
            '</div></div>' +
            '</div>' +
            '<div class="st-section__body">' + modsHtml + '</div>' +
            '</div>';
    }

    function _buildOverviewCard(stats) {
        var unsolved = typeof stats.unsolvedCrimes === 'number'
            ? stats.unsolvedCrimes : null;
        var total = typeof stats.totalCrimes === 'number'
            ? stats.totalCrimes : null;
        var solvedRate = typeof stats.solvedRate === 'number'
            ? Math.round(stats.solvedRate) : null;

        function cell(label, valueHtml, cls) {
            return '<div class="st-stat">' +
                '<div class="st-stat__label">' + esc(label) + '</div>' +
                '<div class="' + (cls || 'st-stat__value') + '">' +
                valueHtml + '</div>' +
                '</div>';
        }

        return '<div class="st-section">' +
            '<div class="st-section__title">' +
            icon('CIRCLE_DOT') + ' Crime Overview</div>' +
            '<div class="st-stats st-stats--3">' +
            cell('Total Crimes', fmtNum(total)) +
            cell('Unsolved', fmtNum(unsolved),
                (typeof unsolved === 'number' && unsolved > 0)
                    ? 'st-stat__value st-stat__value--neg'
                    : 'st-stat__value st-stat__value--pos') +
            cell('Solve Rate',
                solvedRate === null ? unknown() : fmtPercent(solvedRate),
                (typeof solvedRate === 'number' && solvedRate >= 50)
                    ? 'st-stat__value st-stat__value--pos'
                    : 'st-stat__value st-stat__value--warn') +
            '</div></div>';
    }

    function _buildListsSections(crimes, vendettas) {
        var crimeListHtml = '';
        var vendettaListHtml = '';
        var UI = _getCrimeStatsUI();

        if (UI) {
            try {
                crimeListHtml = _adoptHost(function (hostId) {
                    UI.renderCrimeList(hostId, crimes, {
                        showActions: true,
                        emptyMessage: 'No crimes recorded in this settlement.'
                    });
                });
            } catch (err) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error(
                        'settlement-crime-tab: renderCrimeList threw:', err);
                }
                crimeListHtml = '<div class="st-section__empty">' +
                    'Crime list unavailable.</div>';
            }

            try {
                vendettaListHtml = _adoptHost(function (hostId) {
                    UI.renderVendettaList(hostId, vendettas, {
                        showActions: true,
                        emptyMessage: 'No active vendettas in this settlement.'
                    });
                });
            } catch (err) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error(
                        'settlement-crime-tab: renderVendettaList threw:', err);
                }
                vendettaListHtml = '<div class="st-section__empty">' +
                    'Vendetta list unavailable.</div>';
            }
        } else {
            crimeListHtml = '<div class="st-section__empty">' +
                'CrimeStatsUI is not available.</div>';
            vendettaListHtml = '<div class="st-section__empty">' +
                'CrimeStatsUI is not available.</div>';
        }

        return '<div class="st-section">' +
            '<div class="st-section__title">' +
            icon('WARNING') + ' Recorded Crimes</div>' +
            '<div class="st-section__body">' + crimeListHtml + '</div>' +
            '</div>' +
            '<div class="st-section">' +
            '<div class="st-section__title">' +
            icon('FLAG') + ' Active Vendettas</div>' +
            '<div class="st-section__body">' + vendettaListHtml + '</div>' +
            '</div>';
    }

    function _buildFooter() {
        return '<div class="st-footer">' + icon('CIRCLE_DOT') +
            ' <span>Crime rate is derived from prosperity, taxation, watch, ' +
            'features, unemployment, military spending, justice severity, ' +
            'religious unity, and places of worship. Justice and watch are ' +
            'settlement fields, edited through the Justice Settings modal. ' +
            'Incidents and vendettas are recorded through the crime ' +
            'domain\'s own modals, scoped to this settlement.</span></div>';
    }

    // -------------------------------------------------------------------
    // Wiring
    // -------------------------------------------------------------------

    function _handleAction(action, locationId) {
        if (action === 'refresh') {
            refresh();
            return;
        }
        if (action === 'justice') {
            _openJusticeModal(locationId);
            return;
        }
        if (action === 'create-crime') {
            _openCreateCrimeModal(locationId);
            return;
        }
        if (action === 'create-vendetta') {
            _openCreateVendettaModal(locationId);
            return;
        }
        if (action === 'crime-stats') {
            _openCrimeStatsModal(locationId);
            return;
        }
    }

    function _wireActions(container, locationId) {
        if (container.__stCrimeWired) return;
        container.__stCrimeWired = true;
        container.addEventListener('click', function (event) {
            var btn = event.target.closest('[data-action]');
            if (!btn || !container.contains(btn)) return;
            if (btn.disabled) return;
            event.preventDefault();
            _handleAction(btn.dataset.action, locationId);
        });
    }

    // -------------------------------------------------------------------
    // Renderer
    // -------------------------------------------------------------------

    function renderSettlementCrime(container, context) {
        if (!container) return;
        if (!context || !context.locationId) {
            container.innerHTML = H().emptyState('no-context');
            return;
        }

        var locationId = context.locationId;
        var summary = context.viewModel || null;

        var crimeView = null;
        var VMs = _getSettlementViewModels();
        if (VMs) {
            try { crimeView = VMs.buildCrimeView(locationId); }
            catch (err) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error(
                        'settlement-crime-tab: buildCrimeView threw:', err);
                }
                crimeView = null;
            }
        }

        var crimeRateView = null;
        var SCQ = _getSettlementCrimeQueries();
        if (SCQ) {
            try { crimeRateView = SCQ.getCrimeRate(locationId); }
            catch (err) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error(
                        'settlement-crime-tab: getCrimeRate threw:', err);
                }
                crimeRateView = null;
            }
        }

        var crimes = [];
        var CQ = _getCrimeQueries();
        if (CQ) {
            try { crimes = CQ.getCrimesByLocation(locationId) || []; }
            catch (e) { crimes = []; }
        }

        var vendettas = [];
        try { vendettas = _getSettlementVendettas(locationId); }
        catch (e) { vendettas = []; }

        var solved = 0;
        for (var i = 0; i < crimes.length; i++) {
            if (crimes[i] && crimes[i].solved === true) solved++;
        }
        var total = crimes.length;
        var unsolved = total - solved;
        var solvedRate = total > 0 ? (solved / total) * 100 : 0;
        var overviewStats = {
            totalCrimes: total,
            unsolvedCrimes: unsolved,
            solvedRate: solvedRate
        };

        var canCreateVendetta = _getSettlementHouseholdIds(locationId).length >= 2;

        var html = '<div class="st-tab">' +
            _buildHeader(context, crimeView, summary, crimeRateView) +
            _buildActionButtons(locationId, canCreateVendetta) +
            _buildCrimeRateSection(crimeRateView) +
            _buildOverviewCard(overviewStats) +
            _buildListsSections(crimes, vendettas) +
            _buildFooter() +
            '</div>';

        container.innerHTML = html;
        _wireActions(container, locationId);
    }

    // -------------------------------------------------------------------
    // Registration
    // -------------------------------------------------------------------

    if (window.TabManager && typeof window.TabManager.register === 'function') {
        window.TabManager.register(SCOPE, TAB_ID, renderSettlementCrime);
    } else if (typeof console !== 'undefined' && console.warn) {
        console.warn(
            'settlement-crime-tab: TabManager is not available at load ' +
            'time; the tab was not registered.'
        );
    }

    window.renderSettlementCrime = renderSettlementCrime;

})();
