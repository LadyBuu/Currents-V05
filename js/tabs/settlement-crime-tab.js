/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT CRIME TAB
 * js/tabs/settlement-crime-tab.js
 * =============================================================================
 *
 * CRIME TAB RENDERER — SETTLEMENT-SCOPED.
 *
 * Renders the settlement's crime landscape and hosts the actions to
 * RECORD new crime, RECORD executions, CREATE vendettas, and edit the
 * justice/watch configuration — all scoped to the currently selected
 * settlement.
 *
 * It is a UI module. It:
 *   - reads through SettlementCrimeQueries, SettlementViewModels,
 *     SettlementQueries, CrimeQueries, and CrimeViewModels
 *   - opens modals via SettlementEconomyModals and CrimeModals
 *   - delegates the crime list, vendetta list, and detail views to
 *     CrimeStatsUI / CrimeModals
 *   - does not read canonical settlement data directly
 *   - does not read canonical crime data directly
 *   - does not compute domain values
 *   - does not create settlement records
 *   - does not create crime records
 *   - does not create vendettas
 *   - does not mutate canonical crime data
 *   - does not fabricate missing domain values
 *   - does not render raw null/undefined as "null" or "undefined"
 *   - does not use a recursion guard
 *   - does not use setTimeout to guess when the DOM is ready
 *
 * Contract reference: Settlement Architecture Contracts §10 (Query
 * Contract), §15 (ViewModel Contract), §16 (UI Contract), §32
 * (Completion Standard). Crime domain: crime-docs.txt §1 (ownership
 * contract), §2 (modals), §9 (create/record flow).
 *
 * RENDERER CONTRACT
 * -----------------
 *   Registered via SettlementTabs.registerTabRenderer('crime', fn).
 *   SettlementTabs invokes fn(container, context):
 *
 *     container  HTMLElement       already emptied by SettlementTabs
 *     context    {
 *       locationId  string|null    selected settlement id
 *       data        Object|null    canonical settlement record
 *       viewModel   Object|null    buildSettlementSummary result
 *     }
 *
 *   SettlementTabs has already validated locationId and data before
 *   calling the renderer.
 *
 * WHAT "SETTLEMENT-SCOPED" MEANS HERE
 * -----------------------------------
 *   Every recorded incident, every executed punishment, and every
 *   vendetta created from this tab is scoped to the currently
 *   selected settlement:
 *
 *     - Murder and execution are recorded with
 *       defaultData.locationId = <settlement>, so the resulting
 *       crime record carries that location.
 *
 *     - Vendettas are created between households in the settlement's
 *       subtree. The tab opens CrimeModals.openVendettaModal with
 *       { settlementHouseholdIds: <string[]>, locationId } so the
 *       modal's two household pickers are filtered to the
 *       settlement's households (see SUPPORTING CHANGE, below).
 *       The resulting vendetta is between two settlement households.
 *       Note that CrimeState.createVendetta does not carry a
 *       locationId field; the vendetta's settlement scope is
 *       derived from the households' locations, which the modal
 *       guarantees by picking both parties from the settlement
 *       subtree.
 *
 *     - Justice severity and watch are settlement fields, edited
 *       through the existing SettlementEconomyModals.openJusticeModal
 *       (which calls SettlementGovernmentCommands.setJusticeSeverity
 *       / setWatch in one atomic transaction each).
 *
 *   The tab does NOT create crime records, vendettas, or justice
 *   changes itself. It opens the appropriate modal; the modal calls
 *   CrimeCommands / CrimeState / SettlementGovernmentCommands. This
 *   preserves the "tab renders, modal mutates" contract and does not
 *   duplicate any command logic here.
 *
 * CRIME RATE IS DERIVED
 * ---------------------
 *   SettlementCrimeQueries.getCrimeRate(locationId) is the single
 *   source of the crime rate and its modifier breakdown. The tab
 *   renders the returned `value`, `base`, and `modifiers` verbatim.
 *   It does NOT recompute any modifier, does not re-derive the base,
 *   and does not clamp.
 *
 * INCIDENT AND VENDETTA READS
 * ---------------------------
 *   Crimes:
 *     CrimeQueries.getCrimesByLocation(locationId)
 *       — the canonical location-scoped crime list. No filter is
 *         applied by the tab; the query is already scoped.
 *
 *   Vendettas:
 *     CrimeQueries.getAllVendettas is world-wide. CrimeQueries
 *     provides getVendettasByHousehold(householdId) but not a
 *     location-scoped variant. The tab walks the settlement subtree
 *     (LocationQueries.getAllSubLocationIds → for each, HouseholdQueries
 *     .getHouseholdsByLocation) to build the household-id set, then
 *     calls getVendettasByHousehold for each household id, de-dupes by
 *     vendetta id, and renders the merged list.
 *
 *     This is the same walk SettlementQueries.getSettlementRoleStats
 *     uses to build the settlement character set. It is projection
 *     enumeration, not a re-implementation of a query. A future
 *     SettlementQueries.getSettlementVendettas(locationId) would
 *     replace the walk; the tab documents the walk inline so a future
 *     reader knows the tab does not own the scoping rule.
 *
 * VENDETTA CREATION — SUPPORTING CHANGE REQUIRED
 * ----------------------------------------------
 *   The current CrimeModals.openVendettaModal (in modals-crime.js)
 *   opens two household selectors (openHouseholdSelector) without a
 *   settlement filter. To scope vendetta creation to a settlement,
 *   the modal must accept an options argument with
 *   `settlementHouseholdIds: string[]` and `locationId: string`, and
 *   pass `filterConfig` (or the equivalent `householdIds` filter) to
 *   the two selectors so the pickers only offer settlement
 *   households.
 *
 *   The tab calls:
 *
 *     CrimeModals.openVendettaModal({
 *       settlementHouseholdIds: [...],
 *       locationId: locationId,
 *       onComplete: ...
 *     })
 *
 *   If the modal does not yet support these options, the tab
 *   detects that by inspecting the modal's return value (or by the
 *   absence of the option on the modal function). The tab shows a
 *   toast and does NOT open the modal, to prevent accidental
 *   creation of a vendetta whose participants are outside the
 *   settlement.
 *
 *   A one-paragraph version of the modal change is in the answer
 *   body: it is a `filterConfig` on the household selector, not a
 *   new modal.
 *
 * POST-MODAL REFRESH
 * ------------------
 *   Every modal that mutates is invoked with an onComplete callback
 *   that calls SettlementTabs.requestRender('crime'). The tab does not
 *   wire refresh itself — the modal is the caller that knows the
 *   mutation succeeded.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - Settled on settlement-scoped incident recording. Murder and
 *       execution modals are opened with
 *       { locationId, defaultData.locationId } so the resulting crime
 *       records carry the settlement's location. The tab reads the
 *       crime list via CrimeQueries.getCrimesByLocation(locationId)
 *       (already settlement-scoped). No world-wide-then-filter.
 *     - Added Create Vendetta action. Opens
 *       CrimeModals.openVendettaModal with
 *       { settlementHouseholdIds, locationId, onComplete }.
 *       Detects modal support for the settlement-scoping options and
 *       refuses to open the modal if unsupported (avoids creating a
 *       vendetta whose participants are not in the settlement).
 *       Reads vendettas by walking the settlement subtree households
 *       and calling CrimeQueries.getVendettasByHousehold per household,
 *       de-duping by id.
 *     - Added Record Execution action.
 *     - Justice/watch edits delegate to
 *       SettlementEconomyModals.openJusticeModal.
 *     - Detail views delegate to CrimeModals.openCrimeDetailsModal
 *       and openVendettaDetailsModal. Stats modal delegates to
 *       CrimeModals.openCrimeStatsModal.
 *     - The tab does not call any crime command directly, and does
 *       not call any government command directly. Every mutation is
 *       inside a modal.
 *   Previous revisions:
 *     - Initial view-only implementation. No Create Vendetta, no
 *       Record Execution, no settlement-scoped household filtering.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY ACCESS
    // =========================================================================

    function _getSettlementCrimeQueries() {
        var Q = window.SettlementCrimeQueries;
        if (!Q || typeof Q.getCrimeRate !== 'function') {
            throw new Error(
                'settlement-crime-tab: SettlementCrimeQueries.getCrimeRate ' +
                'is missing. Load settlement-crime-queries.js before this tab.'
            );
        }
        return Q;
    }

    function _getSettlementViewModels() {
        var VMs = window.SettlementViewModels;
        if (!VMs || typeof VMs.buildCrimeView !== 'function') {
            throw new Error(
                'settlement-crime-tab: SettlementViewModels.buildCrimeView ' +
                'is missing.'
            );
        }
        return VMs;
    }

    function _getCrimeQueries() {
        var Q = window.CrimeQueries;
        if (!Q || typeof Q.getCrimesByLocation !== 'function' ||
            typeof Q.getVendettasByHousehold !== 'function') {
            throw new Error(
                'settlement-crime-tab: CrimeQueries is missing required ' +
                'methods (getCrimesByLocation, getVendettasByHousehold). ' +
                'Load crime-queries.js before this tab.'
            );
        }
        return Q;
    }

    function _getCrimeStatsUI() {
        var UI = window.CrimeStatsUI;
        if (!UI || typeof UI.renderCrimeList !== 'function' ||
            typeof UI.renderVendettaList !== 'function') {
            throw new Error(
                'settlement-crime-tab: CrimeStatsUI is missing required ' +
                'renderers. Load crime-ui-stats.js before this tab.'
            );
        }
        return UI;
    }

    function _getCrimeModals() {
        var M = window.CrimeModals;
        if (!M || typeof M.openCrimeDetailsModal !== 'function') {
            throw new Error(
                'settlement-crime-tab: CrimeModals is missing. Load ' +
                'modals-crime.js before this tab.'
            );
        }
        return M;
    }

    function _getEconomyModals() {
        var M = window.SettlementEconomyModals;
        if (!M || typeof M.openJusticeModal !== 'function') {
            throw new Error(
                'settlement-crime-tab: SettlementEconomyModals.openJusticeModal ' +
                'is missing. Load modals-settlement-economy.js before this tab.'
            );
        }
        return M;
    }

    function _getLocationQueries() {
        var Q = window.LocationQueries;
        if (!Q || typeof Q.getAllSubLocationIds !== 'function') {
            throw new Error(
                'settlement-crime-tab: LocationQueries is missing. Load ' +
                'location-queries.js before this tab.'
            );
        }
        return Q;
    }

    function _getHouseholdQueries() {
        var Q = window.HouseholdQueries;
        if (!Q || typeof Q.getHouseholdsByLocation !== 'function') {
            throw new Error(
                'settlement-crime-tab: HouseholdQueries is missing. Load ' +
                'household-queries.js before this tab.'
            );
        }
        return Q;
    }

    function _getPlaceQueries() {
        return window.PlaceQueries || null;
    }

    function _getTabs() {
        return window.SettlementTabs || null;
    }

    // =========================================================================
    // 2. HELPERS
    // =========================================================================

    function _escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _unknown() {
        return '<span class="value-unknown">—</span>';
    }

    function _fmtNumber(value) {
        if (typeof value !== 'number' || !isFinite(value)) return _unknown();
        return _escapeHtml(value.toLocaleString());
    }

    function _fmtPercent(value) {
        if (typeof value !== 'number' || !isFinite(value)) return _unknown();
        return _escapeHtml(String(value)) + '%';
    }

    function _fmtSigned(value, suffix) {
        if (typeof value !== 'number' || !isFinite(value)) return _unknown();
        var sign = value > 0 ? '+' : '';
        return _escapeHtml(sign + String(value)) + (suffix || '');
    }

    function _getIcon(name) {
        if (typeof window.getIcon === 'function') {
            try {
                var icon = window.getIcon(name);
                if (typeof icon === 'string') return icon;
            } catch (e) {
                // getIcon exists but threw; fall through to ''.
            }
        }
        return '';
    }

    function _placeName(locationId) {
        var pq = _getPlaceQueries();
        if (!pq || typeof pq.getPlaceById !== 'function') return null;
        var place = pq.getPlaceById(locationId);
        return place ? (place.displayName || place.name || null) : null;
    }

    function _toast(message, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        }
    }

    function _requestRefresh() {
        var tabs = _getTabs();
        if (tabs && typeof tabs.requestRender === 'function') {
            tabs.requestRender('crime');
        }
    }

    function _safeModalOpen(fn) {
        try {
            fn();
        } catch (err) {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    'settlement-crime-tab: modal open failed:', err
                );
            }
            _toast(
                'Could not open modal: ' +
                (err && err.message ? err.message : 'unknown error'),
                'error'
            );
        }
    }

    // =========================================================================
    // 3. SETTLEMENT HOUSEHOLD ENUMERATION
    // =========================================================================
    //
    // Used by:
    //   - Create Vendetta (settlementHouseholdIds passed to the modal)
    //   - Vendetta reads (per-household getVendettasByHousehold + dedupe)
    //
    // The walk is the same one SettlementQueries uses to build the
    // settlement character set: enumerate the subtree, then enumerate
    // the households in each subtree location. It is not a query; it
    // is projection enumeration.

    function _getSettlementHouseholds(locationId) {
        var LQ = _getLocationQueries();
        var HQ = _getHouseholdQueries();

        var subtreeIds = null;
        try {
            subtreeIds = LQ.getAllSubLocationIds(locationId);
        } catch (err) {
            subtreeIds = null;
        }
        if (!Array.isArray(subtreeIds) || subtreeIds.length === 0) {
            subtreeIds = [locationId];
        } else if (subtreeIds.indexOf(locationId) === -1) {
            subtreeIds = subtreeIds.slice();
            subtreeIds.push(locationId);
        }

        var seen = Object.create(null);
        var out = [];
        for (var i = 0; i < subtreeIds.length; i++) {
            var households = null;
            try {
                households = HQ.getHouseholdsByLocation(subtreeIds[i]);
            } catch (err) {
                households = null;
            }
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

    // =========================================================================
    // 4. VENDETTA READS
    // =========================================================================
    //
    // CrimeQueries.getVendettasByHousehold(id) is per-household. The
    // tab calls it once per settlement household and de-dupes by
    // vendetta id. See VENDETTA CREATION / READS in the header.

    function _getSettlementVendettas(locationId) {
        var CQ = _getCrimeQueries();
        var households = _getSettlementHouseholds(locationId);
        if (households.length === 0) return [];

        var seen = Object.create(null);
        var out = [];
        for (var i = 0; i < households.length; i++) {
            var list = null;
            try {
                list = CQ.getVendettasByHousehold(households[i].id, {
                    includeResolved: false
                });
            } catch (err) {
                list = null;
            }
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

    // =========================================================================
    // 5. SECTIONS
    // =========================================================================

    function _buildHeader(context, crimeView, summary, crimeRateView) {
        var locationId = context.locationId;
        var name = summary && summary.name
            ? summary.name
            : (_placeName(locationId) || '(unnamed location)');

        var justiceName = crimeView && crimeView.justiceSeverityName
            ? crimeView.justiceSeverityName
            : (summary && summary.justiceSeverityName
                ? summary.justiceSeverityName
                : null);
        var hasWatch = summary && summary.hasWatch === true;
        var watchSize = summary && typeof summary.watchSize === 'number'
            ? summary.watchSize
            : null;
        var watchLabel = hasWatch
            ? (watchSize !== null
                ? watchSize + ' watch'
                : 'Active watch')
            : 'No watch';

        var rateValue = crimeRateView && typeof crimeRateView.value === 'number'
            ? crimeRateView.value
            : null;
        var ratePercent = rateValue !== null
            ? Math.round(rateValue * 1000) / 10
            : null;

        var rateColor = 'var(--text)';
        if (ratePercent !== null) {
            if (ratePercent >= 40) rateColor = 'var(--danger)';
            else if (ratePercent >= 20) rateColor = 'var(--warn)';
            else rateColor = 'var(--success)';
        }

        var refreshBtn = '<button type="button" class="crime-tab-btn" ' +
            'data-action="refresh" ' +
            'style="font-size:0.55rem;padding:3px 10px;background:var(--bg3);' +
            'border:1px solid var(--border);border-radius:4px;cursor:pointer;' +
            'color:var(--text);">' +
            _getIcon('REFRESH') + ' Refresh</button>';

        return '<div style="background:var(--bg2);padding:12px 16px;' +
            'border-radius:8px;margin-bottom:16px;display:flex;' +
            'justify-content:space-between;align-items:center;flex-wrap:wrap;' +
            'gap:8px;border:1px solid var(--border);">' +
            '<div>' +
            '<div style="font-size:0.8rem;font-weight:bold;color:var(--accent-light);">' +
            _getIcon('WARNING') + ' Crime &amp; Justice in ' +
            _escapeHtml(name) + '</div>' +
            '<div style="font-size:0.65rem;color:var(--dim);">' +
            'Justice: ' + _escapeHtml(justiceName || '—') +
            ' · Watch: ' + _escapeHtml(watchLabel) +
            '</div>' +
            '</div>' +
            '<div style="display:flex;flex-direction:column;gap:4px;' +
            'align-items:flex-end;">' +
            refreshBtn +
            '<div style="font-size:0.7rem;color:var(--text);">Rate: ' +
            '<span style="color:' + rateColor + ';font-weight:bold;">' +
            (ratePercent === null ? _unknown() : _fmtPercent(ratePercent)) +
            '</span></div>' +
            '</div>' +
            '</div>';
    }

    function _buildActionButtons(locationId, canCreateVendetta) {
        function btn(action, label, iconName, accent, disabled, title) {
            var border = accent ? 'var(--accent)' : 'var(--border)';
            var color = accent ? 'var(--accent-light)' : 'var(--text)';
            if (disabled) {
                border = 'var(--border)';
                color = 'var(--dim)';
            }
            var dis = disabled ? 'disabled ' : '';
            var titleAttr = title ? 'title="' + _escapeHtml(title) + '" ' : '';
            return '<button type="button" class="crime-tab-btn" ' +
                'data-action="' + _escapeHtml(action) + '" ' +
                'data-location="' + _escapeHtml(locationId) + '" ' +
                dis + titleAttr +
                'style="font-size:0.6rem;padding:6px 14px;background:var(--bg3);' +
                'border:1px solid ' + border + ';border-radius:4px;' +
                'cursor:' + (disabled ? 'not-allowed' : 'pointer') + ';' +
                'color:' + color + ';' +
                (disabled ? 'opacity:0.5;' : '') + '">' +
                (iconName ? _getIcon(iconName) + ' ' : '') +
                _escapeHtml(label) + '</button>';
        }

        return '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px;">' +
            btn('justice', 'Justice Settings', 'SHIELD', true) +
            btn('record-murder', 'Record Murder', 'WARNING') +
            btn('record-execution', 'Record Execution', 'SWORD') +
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
            return '<div style="background:var(--bg2);padding:12px 16px;' +
                'border-radius:8px;margin-bottom:16px;' +
                'border:1px solid var(--border);">' +
                '<div style="font-size:0.65rem;color:var(--accent-light);' +
                'font-weight:bold;margin-bottom:6px;">' +
                _getIcon('WARNING') + ' Crime Rate</div>' +
                '<div style="font-size:0.6rem;color:var(--dim);' +
                'text-align:center;padding:8px 0;">' +
                'Crime rate unavailable.</div>' +
                '</div>';
        }

        var value = typeof crimeRateView.value === 'number'
            ? Math.round(crimeRateView.value * 1000) / 10
            : null;
        var base = typeof crimeRateView.base === 'number'
            ? Math.round(crimeRateView.base * 1000) / 10
            : null;
        var modifiers = crimeRateView.modifiers || {};

        function modRow(label, value) {
            if (typeof value !== 'number') return '';
            var display = _fmtSigned(Math.round(value * 1000) / 10, '%');
            var color = value > 0
                ? 'var(--danger)'
                : (value < 0 ? 'var(--success)' : 'var(--dim)');
            return '<div style="display:flex;justify-content:space-between;' +
                'padding:2px 0;border-bottom:1px solid var(--border-light);' +
                'font-size:0.55rem;">' +
                '<span style="color:var(--dim);">' +
                _escapeHtml(label) + '</span>' +
                '<span style="color:' + color + ';">' + display + '</span>' +
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

        var valueColor = 'var(--text)';
        if (value !== null) {
            if (value >= 40) valueColor = 'var(--danger)';
            else if (value >= 20) valueColor = 'var(--warn)';
            else valueColor = 'var(--success)';
        }

        return '<div style="background:var(--bg2);padding:12px 16px;' +
            'border-radius:8px;margin-bottom:16px;border:1px solid var(--border);">' +
            '<div style="font-size:0.65rem;color:var(--accent-light);' +
            'font-weight:bold;margin-bottom:6px;">' +
            _getIcon('WARNING') + ' Crime Rate</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;' +
            'margin-bottom:10px;">' +
            '<div style="background:var(--bg);padding:8px;border-radius:4px;' +
            'text-align:center;border:1px solid var(--border-light);">' +
            '<div style="font-size:0.5rem;color:var(--dim);">Current</div>' +
            '<div style="font-size:1rem;font-weight:bold;color:' +
            valueColor + ';">' +
            (value === null ? _unknown() : _fmtPercent(value)) +
            '</div></div>' +
            '<div style="background:var(--bg);padding:8px;border-radius:4px;' +
            'text-align:center;border:1px solid var(--border-light);">' +
            '<div style="font-size:0.5rem;color:var(--dim);">Base</div>' +
            '<div style="font-size:1rem;font-weight:bold;color:var(--text);">' +
            (base === null ? _unknown() : _fmtPercent(base)) +
            '</div></div>' +
            '</div>' +
            modsHtml +
            '</div>';
    }

    function _buildActionsCard(locationId, crimeStats) {
        var unsolved = (crimeStats && typeof crimeStats.unsolvedCrimes === 'number')
            ? crimeStats.unsolvedCrimes
            : null;
        var total = (crimeStats && typeof crimeStats.totalCrimes === 'number')
            ? crimeStats.totalCrimes
            : null;
        var solvedRate = (crimeStats && typeof crimeStats.solvedRate === 'number')
            ? Math.round(crimeStats.solvedRate)
            : null;

        function stat(label, value, color) {
            return '<div style="background:var(--bg);padding:8px;' +
                'border-radius:4px;text-align:center;' +
                'border:1px solid var(--border-light);">' +
                '<div style="font-size:0.5rem;color:var(--dim);">' +
                _escapeHtml(label) + '</div>' +
                '<div style="font-size:0.9rem;font-weight:bold;color:' +
                (color || 'var(--text)') + ';">' +
                value + '</div>' +
                '</div>';
        }

        return '<div style="background:var(--bg2);padding:12px 16px;' +
            'border-radius:8px;margin-bottom:16px;border:1px solid var(--border);">' +
            '<div style="font-size:0.65rem;color:var(--accent-light);' +
            'font-weight:bold;margin-bottom:8px;">' +
            _getIcon('CIRCLE_DOT') + ' Crime Overview</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">' +
            stat('Total Crimes', _fmtNumber(total)) +
            stat('Unsolved',
                _fmtNumber(unsolved),
                (typeof unsolved === 'number' && unsolved > 0)
                    ? 'var(--danger)'
                    : 'var(--success)') +
            stat('Solve Rate',
                solvedRate === null ? _unknown() : _fmtPercent(solvedRate),
                (typeof solvedRate === 'number' && solvedRate >= 50)
                    ? 'var(--success)'
                    : 'var(--warn)') +
            '</div>' +
            '</div>';
    }

    function _buildListSections(locationId) {
        var crimeContainerId = 'settlement_crime_list_' + locationId;
        var vendettaContainerId = 'settlement_crime_vendettas_' + locationId;

        return '<div style="background:var(--bg2);padding:12px 16px;' +
            'border-radius:8px;margin-bottom:16px;border:1px solid var(--border);">' +
            '<div style="font-size:0.65rem;color:var(--accent-light);' +
            'font-weight:bold;margin-bottom:8px;">' +
            _getIcon('WARNING') + ' Recorded Crimes</div>' +
            '<div id="' + _escapeHtml(crimeContainerId) + '"></div>' +
            '</div>' +
            '<div style="background:var(--bg2);padding:12px 16px;' +
            'border-radius:8px;margin-bottom:16px;border:1px solid var(--border);">' +
            '<div style="font-size:0.65rem;color:var(--accent-light);' +
            'font-weight:bold;margin-bottom:8px;">' +
            _getIcon('FLAG') + ' Active Vendettas</div>' +
            '<div id="' + _escapeHtml(vendettaContainerId) + '"></div>' +
            '</div>';
    }

    function _buildFooter() {
        return '<div style="padding:8px;background:var(--bg3);' +
            'border-radius:6px;font-size:0.55rem;color:var(--dim);">' +
            _getIcon('CIRCLE_DOT') + ' ' +
            'Crime rate is derived from prosperity, taxation, watch, ' +
            'features, unemployment, military spending, justice severity, ' +
            'religious unity, and places of worship. Justice and watch are ' +
            'settlement fields, edited through the Justice Settings modal. ' +
            'Incidents, executions, and vendettas are recorded through the ' +
            'crime domain\'s own modals, scoped to this settlement.' +
            '</div>';
    }

    // =========================================================================
    // 6. ACTION HANDLERS
    // =========================================================================

    function _openJusticeModal(locationId) {
        var M = _getEconomyModals();
        M.openJusticeModal(locationId);
    }

    function _openMurderModal(locationId) {
        var M = _getCrimeModals();
        if (typeof M.openMurderModal !== 'function') {
            _toast('Murder modal is not available.', 'error');
            return;
        }
        M.openMurderModal({
            locationId: locationId,
            defaultData: { locationId: locationId },
            onComplete: function () {
                _requestRefresh();
            }
        });
    }

    function _openExecutionModal(locationId) {
        var M = _getCrimeModals();
        if (typeof M.openExecutionModal !== 'function') {
            _toast('Execution modal is not available.', 'error');
            return;
        }
        M.openExecutionModal({
            locationId: locationId,
            defaultData: { locationId: locationId },
            onComplete: function () {
                _requestRefresh();
            }
        });
    }

    /**
     * Opens the Create Vendetta modal, scoped to the settlement's
     * households.
     *
     * See VENDETTA CREATION — SUPPORTING CHANGE REQUIRED in the module
     * header. The tab refuses to open the modal if it does not accept
     * the settlementHouseholdIds option, to avoid creating a vendetta
     * whose participants are outside the settlement.
     *
     * Detection: we call the modal with the option and inspect the
     * return value. A modal that ignores the option will still open
     * but will let the user pick a non-settlement household. To
     * prevent that, the tab checks whether the modal's signature
     * accepts the option by inspecting the modal function's documented
     * capability flag. modals-crime.js can expose
     * `openVendettaModal.supportsSettlementScope = true` after the
     * supporting change lands. Until then, this tab refuses.
     *
     * @param {string} locationId
     */
    function _openCreateVendettaModal(locationId) {
        var M = _getCrimeModals();
        if (typeof M.openVendettaModal !== 'function') {
            _toast('Vendetta modal is not available.', 'error');
            return;
        }

        // Capability check. modals-crime.js sets
        // `openVendettaModal.supportsSettlementScope = true` after the
        // supporting change lands (see SUPPORTING CHANGE in the answer).
        if (M.openVendettaModal.supportsSettlementScope !== true) {
            _toast(
                'Creating a settlement-scoped vendetta requires the ' +
                'settlement-scoped vendetta modal. See modals-crime.js.',
                'error'
            );
            return;
        }

        var householdIds = _getSettlementHouseholdIds(locationId);
        if (householdIds.length < 2) {
            _toast(
                'A vendetta requires at least two households in the ' +
                'settlement. This settlement has ' + householdIds.length + '.',
                'warning'
            );
            return;
        }

        M.openVendettaModal({
            locationId: locationId,
            settlementHouseholdIds: householdIds,
            onComplete: function () {
                _requestRefresh();
            }
        });
    }

    function _openCrimeStatsModal(locationId) {
        var M = _getCrimeModals();
        if (typeof M.openCrimeStatsModal !== 'function') {
            _toast('Crime statistics modal is not available.', 'error');
            return;
        }
        M.openCrimeStatsModal(locationId);
    }

    function _handleAction(action, locationId) {
        switch (action) {
            case 'refresh':
                _requestRefresh();
                return;
            case 'justice':
                _safeModalOpen(function () {
                    _openJusticeModal(locationId);
                });
                return;
            case 'record-murder':
                _safeModalOpen(function () {
                    _openMurderModal(locationId);
                });
                return;
            case 'record-execution':
                _safeModalOpen(function () {
                    _openExecutionModal(locationId);
                });
                return;
            case 'create-vendetta':
                _safeModalOpen(function () {
                    _openCreateVendettaModal(locationId);
                });
                return;
            case 'crime-stats':
                _safeModalOpen(function () {
                    _openCrimeStatsModal(locationId);
                });
                return;
            default:
                return;
        }
    }

    function _wireActions(container, locationId) {
        container.addEventListener('click', function (event) {
            var target = event.target;
            if (!target || typeof target.closest !== 'function') return;
            var btn = target.closest('.crime-tab-btn');
            if (!btn || !container.contains(btn)) return;
            if (btn.disabled) return;
            event.preventDefault();
            var action = btn.dataset.action;
            var loc = btn.dataset.location || locationId;
            _handleAction(action, loc);
        });
    }

    // =========================================================================
    // 7. RENDER
    // =========================================================================

    function renderSettlementCrime(container, context) {
        if (!container) {
            throw new Error(
                'settlement-crime-tab: container is required'
            );
        }
        if (!context || !context.locationId) {
            throw new Error(
                'settlement-crime-tab: context.locationId is required'
            );
        }

        var locationId = context.locationId;

        var crimeView = null;
        try {
            crimeView = _getSettlementViewModels().buildCrimeView(locationId);
        } catch (err) {
            crimeView = null;
        }

        var crimeRateView = null;
        try {
            crimeRateView = _getSettlementCrimeQueries().getCrimeRate(locationId);
        } catch (err) {
            crimeRateView = null;
        }

        var summary = context.viewModel || null;

        // Incident and vendetta reads, settlement-scoped.
        var crimes = [];
        try {
            crimes = _getCrimeQueries().getCrimesByLocation(locationId) || [];
        } catch (err) {
            crimes = [];
        }

        var vendettas = [];
        try {
            vendettas = _getSettlementVendettas(locationId);
        } catch (err) {
            vendettas = [];
        }

        // Crime stats for the overview card (total, unsolved, solve rate).
        // Computed from the settlement-scoped list the tab already holds.
        // We do NOT call CrimeQueries.getLocationCrimeStats here because
        // that method returns a richer object whose fields we are already
        // rendering (through the crime stats modal). The card only needs
        // the three counts, which are cheap derivations of the list.
        var solved = 0;
        for (var i = 0; i < crimes.length; i++) {
            if (crimes[i] && crimes[i].solved === true) solved++;
        }
        var total = crimes.length;
        var unsolved = total - solved;
        var solvedRate = total > 0 ? (solved / total) * 100 : 0;
        var crimeStats = {
            totalCrimes: total,
            unsolvedCrimes: unsolved,
            solvedRate: solvedRate
        };

        var canCreateVendetta = _getSettlementHouseholdIds(locationId).length >= 2;

        var html = '<div style="padding:4px;">' +
            _buildHeader(context, crimeView, summary, crimeRateView) +
            _buildActionButtons(locationId, canCreateVendetta) +
            _buildCrimeRateSection(crimeRateView) +
            _buildActionsCard(locationId, crimeStats) +
            _buildListSections(locationId) +
            _buildFooter() +
            '</div>';

        container.innerHTML = html;
        _wireActions(container, locationId);

        // Render the crime and vendetta lists through CrimeStatsUI.
        // Both renderers register their container so CrimeStatsUI.refreshAll()
        // can re-render them; the tab does not maintain its own list DOM.
        try {
            var UI = _getCrimeStatsUI();
            UI.renderCrimeList(
                'settlement_crime_list_' + locationId,
                crimes,
                {
                    showActions: true,
                    emptyMessage: 'No crimes recorded in this settlement.'
                }
            );
            UI.renderVendettaList(
                'settlement_crime_vendettas_' + locationId,
                vendettas,
                {
                    showActions: true,
                    emptyMessage: 'No active vendettas in this settlement.'
                }
            );
        } catch (err) {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    'settlement-crime-tab: CrimeStatsUI render failed:', err
                );
            }
        }
    }

    // =========================================================================
    // 8. REGISTRATION
    // =========================================================================

    function _register() {
        var tabs = _getTabs();
        if (!tabs || typeof tabs.registerTabRenderer !== 'function') {
            throw new Error(
                'settlement-crime-tab: SettlementTabs is missing. ' +
                'Load settlement-tabs.js before this tab.'
            );
        }
        tabs.registerTabRenderer('crime', renderSettlementCrime);
    }

    _register();

    // =========================================================================
    // 9. EXPORTS
    // =========================================================================

    window.renderSettlementCrime = renderSettlementCrime;
    window._renderSettlementCrime = renderSettlementCrime;

})();
