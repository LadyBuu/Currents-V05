/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT CRIME TAB
 * js/tabs/settlement-crime-tab.js
 * =============================================================================
 *
 * CRIME TAB RENDERER — SETTLEMENT-SCOPED.
 *
 * Renders the settlement's crime landscape and hosts the actions to:
 *
 *     - Record Crime        (CrimeModals.openCreateCrimeModal → recordCrime
 *                            or triggerMurder, per selected type)
 *     - Create Vendetta     (CrimeModals.openVendettaModal, settlement-scoped)
 *     - Edit Justice Settings (SettlementEconomyModals.openJusticeModal)
 *     - View Crime Statistics (CrimeModals.openCrimeStatsModal)
 *
 * All four actions are scoped to the currently selected settlement.
 *
 * "Record Execution" is NOT a tab action. Execution is a consequence
 * emitted by the law layer inside triggerMurder (via _executeConsequence
 * → triggerExecution). It is not a user-initiated action under the
 * current settlement UI. The openExecutionModal entry point on
 * CrimeModals remains for legacy callers that still open it directly;
 * this tab does not expose it.
 *
 * It is a UI module. It:
 *   - reads through SettlementCrimeQueries, SettlementViewModels,
 *     SettlementQueries, CrimeQueries, and CrimeViewModels
 *   - opens modals via SettlementEconomyModals and CrimeModals
 *   - delegates the crime list and vendetta list to CrimeStatsUI
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
 *     container  HTMLElement       render target
 *     context    {
 *       locationId  string|null    selected settlement id
 *       data        Object|null    canonical settlement record
 *       viewModel   Object|null    buildSettlementSummary result
 *     }
 *
 *   SettlementTabs has already validated locationId and data before
 *   calling the renderer.
 *
 *   The renderer replaces container.innerHTML on every call. The
 *   container's click listener (see _wireActions) is attached at most
 *   once per container element, guarded by container.dataset.crimeTabWired,
 *   so repeated renders do not stack handlers. Handlers read the
 *   current location from btn.dataset.location on each click, not from
 *   a closure, so a settlement switch does not stale-bind the handler.
 *
 * SCOPE OF THE INCIDENT LIST
 * --------------------------
 *   The tab's "Recorded Crimes" list is scoped to the settlement's
 *   OWN location (CrimeQueries.getCrimesByLocation(locationId)), not
 *   the whole subtree. This is a deliberate choice:
 *
 *     - The crime rate shown in the header is a settlement SCALAR
 *       (SettlementCrimeQueries.getCrimeRate derives it from the
 *       settlement record's own fields plus its subtree's aggregated
 *       modifiers — prosperity, taxation, watch, features, employment,
 *       military spending, justice, religious unity, places of worship —
 *       but the value itself is one number for one settlement).
 *
 *     - The list is the raw record set for the settlement's own
 *       location, so a ruler sees the crimes recorded in the capital
 *       (or the settlement's own town) without having to distinguish
 *       them from subtree crimes.
 *
 *     - Subtree crime can be surfaced later by adding a
 *       SettlementQueries.getSettlementCrimes(locationId) aggregate
 *       that walks the subtree. Until that exists, this tab does not
 *       re-implement the walk; see the "No subtree walk for crimes"
 *       note in _getSettlementVendettas for the parallel decision on
 *       vendettas.
 *
 *   If you later want subtree-wide crime in the list, add
 *   SettlementQueries.getSettlementCrimes(locationId) (walking
 *   LocationQueries.getAllSubLocationIds and de-duping by crime id)
 *   and swap the tab's one call. Do not duplicate the walk here.
 *
 * SCOPE OF THE VENDETTA LIST
 * --------------------------
 *   The tab's "Active Vendettas" list is the union of
 *   CrimeQueries.getVendettasByHousehold(householdId) for every
 *   household in the settlement's subtree, de-duped by vendetta id.
 *
 *   This shows:
 *     - feuds between two settlement households, and
 *     - feuds between a settlement household and an outside household.
 *
 *   The create path (Create Vendetta) restricts BOTH parties to
 *   settlement households. The read path is broader because a ruler
 *   wants to know about any feud their households are involved in.
 *   If you want the read path to show only internal feuds, filter
 *   out entries where both household ids are not in the settlement's
 *   household id set. Not done here because it hides information a
 *   ruler plausibly wants.
 *
 * CRIME RATE IS DERIVED
 * ---------------------
 *   SettlementCrimeQueries.getCrimeRate(locationId) is the single
 *   source of the crime rate and its modifier breakdown. The tab
 *   renders the returned `value`, `base`, and `modifiers` verbatim.
 *   It does NOT recompute any modifier, does not re-derive the base,
 *   and does not clamp.
 *
 *   If SettlementCrimeQueries throws (e.g. IndustryQueries is not
 *   loaded and the settlement has enterprises), the tab catches and
 *   renders the "Crime rate unavailable" empty state. The tab does
 *   not fabricate a value.
 *
 *   If SettlementViewModels.buildCrimeView throws for the same
 *   reason, the tab's justiceSeverityName lookup falls back to
 *   summary.justiceSeverityName from buildSettlementSummary, which
 *   reads the settlement's own justice field directly and does not
 *   touch the industry domain. Same defensive pattern used by
 *   modals-household-economy.js.
 *
 * INCIDENT AND VENDETTA READS
 * ---------------------------
 *   Crimes:
 *     CrimeQueries.getCrimesByLocation(locationId)
 *       the canonical location-scoped crime list. No filter is
 *       applied by the tab; the query is already scoped.
 *
 *   Vendettas:
 *     CrimeQueries.getAllVendettas is world-wide. CrimeQueries
 *     provides getVendettasByHousehold(householdId) but not a
 *     location-scoped variant. The tab walks the settlement subtree
 *     (LocationQueries.getAllSubLocationIds → for each, HouseholdQueries
 *     .getHouseholdsByLocation) to build the household-id set, then
 *     calls getVendettasByHousehold for each household id, de-dupes by
 *     vendetta id, and renders the merged list. See SCOPE OF THE
 *     VENDETTA LIST.
 *
 * CREATION FLOWS
 * --------------
 *   Record Crime:
 *     CrimeModals.openCreateCrimeModal({
 *         locationId: locationId,
 *         onComplete: function() { requestRefresh('crime'); }
 *     })
 *   The modal exposes the full creatable crime type select (excludes
 *   execution, includes murder). Murder routes to
 *   CrimeCommands.triggerMurder; every other type routes to
 *   CrimeCommands.recordCrime(locationId, data).
 *
 *   Create Vendetta:
 *     CrimeModals.openVendettaModal({
 *         locationId: locationId,
 *         settlementHouseholdIds: [...],
 *         onComplete: function() { requestRefresh('crime'); }
 *     })
 *   The modal feature-detects settlement scope via
 *   openVendettaModal.supportsSettlementScope === true. If the
 *   capability flag is not set, the tab refuses to open the modal
 *   with a toast — otherwise the user could create a vendetta whose
 *   participants are outside the settlement.
 *
 *   Justice Settings:
 *     SettlementEconomyModals.openJusticeModal(locationId)
 *   The modal calls SettlementGovernmentCommands.setJusticeSeverity
 *   and setWatch in one atomic transaction each. Those commands call
 *   SettlementState.publish; the tab's SettlementState subscription
 *   (see below) catches the change and re-renders the crime rate
 *   without the user having to click Refresh.
 *
 * AUTO-REFRESH ON SETTLEMENT MUTATION
 * -----------------------------------
 *   The crime rate modifier "justice severity" is a settlement field
 *   edited through the Justice Settings modal. When the user saves,
 *   SettlementGovernmentCommands.setJusticeSeverity calls
 *   SettlementState.publish, and the crime rate changes. Without an
 *   auto-refresh, the user would see stale numbers until manually
 *   hitting Refresh.
 *
 *   The tab subscribes to SettlementState once at module load. The
 *   subscription calls SettlementTabs.requestRender('crime') on every
 *   settlement event, which is cheap (a single re-render) and keeps
 *   the visible crime rate in sync with the canonical settlement
 *   record. The subscription lives for the page session; it is not
 *   torn down on modal close or tab switch. If you add a subscription
 *   teardown later, tie it to the same lifecycle as SettlementTabs
 *   (which has no teardown today).
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - Action set reduced to four buttons per the settlement UI brief:
 *       Justice Settings, Create Crime, Create Vendetta, Crime Statistics.
 *       Removed Record Murder and Record Execution.
 *         Record Murder is subsumed by Create Crime → type=murder.
 *         Record Execution is not a user action; execution is emitted by
 *         the law layer inside triggerMurder.
 *     - Added _openCreateCrimeModal and its action handler. It calls
 *       CrimeModals.openCreateCrimeModal({ locationId, onComplete }).
 *     - _wireActions now guards against stacked click listeners. The
 *       prior version called container.addEventListener on every
 *       render, so a tab that rendered N times ran the handler N times
 *       per click. Guarded by container.dataset.crimeTabWired.
 *     - Added SettlementState subscription so the crime rate updates
 *       after a Justice Settings save. Prior version required a
 *       manual Refresh click.
 *     - Header SCOPE OF THE INCIDENT LIST and SCOPE OF THE VENDETTA
 *       LIST sections added, documenting the two scope choices the
 *       tab makes and why. These are design choices, not bugs:
 *       the tab does not walk the subtree for crime, and does not
 *       restrict the vendetta list to internal feuds only.
 *     - Header AUTO-REFRESH ON SETTLEMENT MUTATION section added.
 *     - Removed options.defaultData from openCreateCrimeModal /
 *       (deprecated) openMurderModal / openExecutionModal calls;
 *       options.locationId is the supported way to seed the location
 *       field, and defaultData was dead code against the current
 *       modals-crime.js surface.
 *   Previous revisions:
 *     - Initial settlement-scoped implementation with Record Murder,
 *       Record Execution, Create Vendetta, and Crime Statistics.
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
        if (!M || typeof M.openCreateCrimeModal !== 'function' ||
            typeof M.openCrimeStatsModal !== 'function' ||
            typeof M.openVendettaModal !== 'function') {
            throw new Error(
                'settlement-crime-tab: CrimeModals is missing required ' +
                'entry points (openCreateCrimeModal, openVendettaModal, ' +
                'openCrimeStatsModal). Load modals-crime.js before this tab.'
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

    function _getSettlementState() {
        return window.SettlementState || null;
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
    // vendetta id. See SCOPE OF THE VENDETTA LIST in the header.
    //
    // includeResolved: false → active + escalated, excludes resolved.
    // The tab label "Active Vendettas" matches.

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

    /**
     * Action buttons. Four actions per the settlement UI brief:
     * Justice Settings, Create Crime, Create Vendetta, Crime Statistics.
     * Record Murder and Record Execution are NOT tab actions:
     *   - Record Murder is subsumed by Create Crime → type=murder.
     *   - Record Execution is emitted by the law layer inside
     *     triggerMurder, not a user action.
     */
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

    function _buildActionsCard(crimeStats) {
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
            'Incidents and vendettas are recorded through the crime ' +
            "domain's own modals, scoped to this settlement." +
            '</div>';
    }

    // =========================================================================
    // 6. ACTION HANDLERS
    // =========================================================================

    function _openJusticeModal(locationId) {
        var M = _getEconomyModals();
        M.openJusticeModal(locationId);
        // The modal calls SettlementGovernmentCommands.setJusticeSeverity
        // / setWatch. Those commands publish on SettlementState; the
        // tab's SettlementState subscription auto-refreshes.
    }

    /**
     * Opens the Create Crime modal, scoped to the settlement.
     *
     * The modal exposes the full creatable crime type select (excludes
     * execution, includes murder). Murder routes to
     * CrimeCommands.triggerMurder; every other type routes to
     * CrimeCommands.recordCrime(locationId, data). See
     * modals-crime.js::openCreateCrimeModal for the full contract.
     *
     * @param {string} locationId
     */
    function _openCreateCrimeModal(locationId) {
        var M = _getCrimeModals();
        if (typeof M.openCreateCrimeModal !== 'function') {
            _toast(
                'Create Crime modal is not available. Load modals-crime.js ' +
                'with the openCreateCrimeModal entry point.',
                'error'
            );
            return;
        }

        M.openCreateCrimeModal({
            locationId: locationId,
            onComplete: function () {
                _requestRefresh();
            }
        });
    }

    /**
     * Opens the Create Vendetta modal, scoped to the settlement's
     * households.
     *
     * See SCOPE OF THE VENDETTA LIST in the header for what the read
     * path shows; the create path restricts BOTH parties to settlement
     * households, guaranteeing the recorded vendetta's participants are
     * local.
     *
     * The modal feature-detects settlement scope via
     * openVendettaModal.supportsSettlementScope === true. If the
     * capability flag is not set, this tab refuses to open the modal —
     * otherwise the user could create a vendetta whose participants
     * are outside the settlement.
     *
     * @param {string} locationId
     */
    function _openCreateVendettaModal(locationId) {
        var M = _getCrimeModals();
        if (typeof M.openVendettaModal !== 'function') {
            _toast('Vendetta modal is not available.', 'error');
            return;
        }

        if (M.openVendettaModal.supportsSettlementScope !== true) {
            _toast(
                'Creating a settlement-scoped vendetta requires the ' +
                'settlement-scoped vendetta modal. Update modals-crime.js ' +
                'to set openVendettaModal.supportsSettlementScope = true.',
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
            case 'create-crime':
                _safeModalOpen(function () {
                    _openCreateCrimeModal(locationId);
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

    /**
     * Wires the click handler for the tab's action buttons.
     *
     * GUARDED: a container is wired at most once, tracked by
     * container.dataset.crimeTabWired. This prevents the stacking
     * bug where re-rendering the tab (via requestRender('crime')) added
     * another listener per render, so N renders ran N handlers per
     * click.
     *
     * The handler reads locationId from btn.dataset.location on each
     * click, NOT from a closure, so switching settlements does not
     * stale-bind the handler to the previous location.
     */
    function _wireActions(container, locationId) {
        if (container.dataset.crimeTabWired === '1') return;
        container.dataset.crimeTabWired = '1';

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
            // buildCrimeView composes SettlementCrimeQueries, which
            // reads SettlementEmploymentQueries, which reads
            // IndustryQueries. If IndustryQueries is not loaded and the
            // settlement has enterprises, buildCrimeView throws. The
            // header explains the fallback (summary.justiceSeverityName
            // from buildSettlementSummary, which does not touch
            // industry). Do not fabricate a crime rate here.
            crimeView = null;
        }

        var crimeRateView = null;
        try {
            crimeRateView = _getSettlementCrimeQueries().getCrimeRate(locationId);
        } catch (err) {
            crimeRateView = null;
        }

        var summary = context.viewModel || null;

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

        // Overview stats. Computed from the settlement-scoped list the
        // tab already holds. We deliberately do not call
        // CrimeQueries.getLocationCrimeStats here — that method returns
        // a richer object whose fields are already surfaced in the crime
        // stats modal, and the card only needs the three counts.
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
            _buildActionsCard(crimeStats) +
            _buildListSections(locationId) +
            _buildFooter() +
            '</div>';

        container.innerHTML = html;
        _wireActions(container, locationId);

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
    // 8. AUTO-REFRESH ON SETTLEMENT MUTATION
    // =========================================================================
    //
    // Subscribe once at module load. Every settlement event triggers a
    // re-render of the crime tab. This is what closes the "save Justice
    // Settings → see the crime rate update" gap without requiring the
    // user to click Refresh.
    //
    // The subscription is NOT torn down on modal close or tab switch.
    // It lives for the page session. If you later add teardown, tie it
    // to the same lifecycle as SettlementTabs (which has none today).

    (function _subscribeToSettlementEvents() {
        var state = _getSettlementState();
        if (!state || typeof state.subscribe !== 'function') {
            // SettlementState not loaded yet. That is a legitimate
            // load-order state during early bootstrap; skip the
            // subscription. If the module loads later, subscribers must
            // re-subscribe manually (the module has no re-subscription
            // hook today).
            if (typeof console !== 'undefined' && console.warn) {
                console.warn(
                    'settlement-crime-tab: SettlementState.subscribe is ' +
                    'not available; the crime tab will not auto-refresh ' +
                    'after justice/watch changes. Load settlement-state.js ' +
                    'before this tab if auto-refresh is required.'
                );
            }
            return;
        }

        try {
            state.subscribe(function (event) {
                if (!event || typeof event !== 'object') return;
                _requestRefresh();
            });
        } catch (err) {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    'settlement-crime-tab: SettlementState.subscribe threw:',
                    err
                );
            }
        }
    })();

    // =========================================================================
    // 9. REGISTRATION
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
    // 10. EXPORTS
    // =========================================================================

    window.renderSettlementCrime = renderSettlementCrime;
    window._renderSettlementCrime = renderSettlementCrime;

})();
