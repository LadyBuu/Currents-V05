/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT INDUSTRY TAB
 * js/tabs/settlement-industry-tab.js
 * =============================================================================
 *
 * INDUSTRY TAB RENDERER.
 *
 * Renders the settlement's enterprises — public and private — as a
 * settlement-scoped list, with actions that open the industry modals for
 * create / details / process. The tab is a *view* over the industry
 * domain's own read and write surfaces; it does not own enterprise data.
 *
 * It is a UI module. It:
 *   - reads through IndustryQueries and IndustryViewModels
 *   - opens the industry modals via IndustryModals (modals-industry.js)
 *   - opens the industry list via IndustryModals.openEnterpriseListModal
 *   - processes per-enterprise via IndustryProcessor.processAnnualEnterprise
 *     and persists once per batch
 *   - does not read canonical settlement data directly
 *   - does not read canonical industry data directly (IndustryQueries only)
 *   - does not compute domain values
 *   - does not create settlement records
 *   - does not create enterprise records
 *   - does not mutate canonical settlement data
 *   - does not mutate canonical industry data directly (only through the
 *     processor and the modals)
 *   - does not persist ad hoc — one persist at the end of a batch
 *   - does not fabricate missing domain values
 *   - does not render raw null/undefined as "null" or "undefined"
 *   - does not use a recursion guard
 *   - does not use setTimeout to guess when the DOM is ready
 *
 * Contract reference: Settlement Architecture Contracts §15 (ViewModel
 * Contract), §16 (UI Contract), §13 (Enterprise Ownership Contract),
 * §32 (Completion Standard). Industry: industry-doc.txt §1 (Ownership
 * Contract), §2 (Load Order).
 *
 * RENDERER CONTRACT
 * -----------------
 *   Registered via SettlementTabs.registerTabRenderer('industry', fn).
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
 * ENTERPRISE OWNERSHIP (settlement-docs §13)
 * ------------------------------------------
 *   Enterprises are owned by the Industry domain. Settlement does not
 *   maintain authoritative `stateEnterpriseIds` or `publicEnterpriseIds`
 *   arrays. The Settlement UI reads enterprise data through
 *   IndustryQueries:
 *
 *     getEnterprisesByLocation(locationId)   enterprises at this location
 *     getLocationEnterprisesSummary(locId)   summary projection for a list
 *     getPublicEnterprises(locationId)       ownershipType === 'public'
 *     getPrivateEnterprises(locationId)      ownershipType === 'private'
 *     getStateEnterprises(locationId)        ownerType === 'state'
 *
 *   The tab reads these; it does not maintain a parallel settlement-side
 *   enterprise list. This matches the §13 contract exactly.
 *
 * PUBLIC vs. PRIVATE
 * ------------------
 *   `ownershipType` is the settlement-facing concept. It is set to
 *   'public' when the enterprise's owner is a settlement or state (place
 *   owner type) and 'private' when the owner is a character, a household,
 *   or none. The industry domain enforces this coherence via
 *   IndustryRules.canApplyOwnershipChange.
 *
 *   The tab groups enterprises into two sections:
 *
 *     Public    ownershipType === 'public'
 *     Private   ownershipType === 'private'
 *
 *   The old tab read `enterprise.isPublic` (a derived field that Phase 3
 *   removed from the canonical record), so the value was always
 *   `undefined` on new records. The new tab reads `ownershipType`, which
 *   is the canonical stored field.
 *
 * PER-ENTERPRISE ACTIONS
 * ----------------------
 *   Every mutating action is delegated to a modals-industry.js export:
 *
 *     Details   openEnterpriseDetailsModal(enterpriseId, onSuccess)
 *     Edit      openEditEnterpriseModal(enterpriseId, onSuccess)
 *     Create    openCreateEnterpriseModal(onSuccess, { locationId,
 *                                               ownerType, ownerId })
 *
 *   The tab does not call IndustryCommands directly. The modals own
 *   persistence (IndustryCommands.persist() once per successful batch).
 *
 * AGGREGATE PROCESSING (SETTLEMENT-SCOPED)
 * ----------------------------------------
 *   The old tab's "Process All Enterprises" button called
 *   IndustryProcessor.processAllEnterprises(), which walks EVERY
 *   enterprise in the catalogue — not just this settlement's. The
 *   button's label and confirm dialog said "this settlement"; the
 *   actual scope was the world. This tab now processes only the
 *   enterprises at context.locationId.
 *
 *   Because IndustryProcessor does not yet expose a location-scoped
 *   batch method, the tab composes one from the primitives:
 *
 *     for each eligible enterprise at the settlement:
 *       IndustryProcessor.processAnnualEnterprise(id, { persist: false })
 *     then a single IndustryCommands.persist() at the end
 *
 *   If IndustryProcessor.processEnterprisesForLocation(locationId,
 *   options) exists (a future addition), the tab prefers it — that
 *   method would have the same contract but live in the processor
 *   module where it belongs.
 *
 *   The per-enterprise call inside the loop is what the details
 *   modal's "Process Year" button uses; the tab reuses the same
 *   public entry point rather than re-deriving the calculation. The
 *   only difference from calling `processAnnualEnterprise(id)` is
 *   that the tab passes `persist: false` and persists once at the
 *   end.
 *
 * INDUSTRY HYDRATION GUARD
 * ------------------------
 *   IndustryState must be hydrated before any IndustryQueries call.
 *   IndustryBootstrap.init() runs hydrateFromMasterData once, but the
 *   settlement page can render (and this tab can run) before that
 *   bootstrap has completed — e.g. the user selects a settlement
 *   immediately after the page loads. The tab calls
 *   IndustryState.hydrateFromMasterData(enterprises, types) defensively
 *   when IndustryState.isHydrated() is false. That call is idempotent;
 *   when the bootstrap has already hydrated, this is a no-op check.
 *
 *   The pattern matches government-type-manager-tab.js's defensive
 *   hydrate. It is not a substitute for the bootstrap; it makes the
 *   tab render reliably regardless of page timing.
 *
 * ICON POLICY
 * -----------
 *   No emojis. No inline SVG. Chrome icons come from window.getIcon if it
 *   is loaded; when icons.js is not on the page, the renderer falls back
 *   to plain text labels.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - "Process All" is now settlement-scoped. The prior
 *       implementation called IndustryProcessor.processAllEnterprises(),
 *       which processes every enterprise in the catalogue. The
 *       confirmation dialog said "this settlement" while the actual
 *       scope was the world. The tab now calls
 *       _processSettlementEnterprises(locationId), which filters
 *       IQ.getEnterprisesByLocation to eligible enterprises, calls
 *       processAnnualEnterprise(id, { persist: false }) per enterprise,
 *       and persists once at the end. If
 *       IndustryProcessor.processEnterprisesForLocation exists, it is
 *       used directly.
 *     - The per-enterprise row template now renders row.workersLabel
 *       directly. The prior implementation called
 *       _fmtNumber(row.workersLabel ? null : null), which always
 *       produced '—'. row.workersLabel is a string like '3 / 10', not
 *       a number, so _fmtNumber was the wrong formatter; the value is
 *       now escaped and rendered as-is.
 *     - Defensive IndustryState hydration. The tab calls
 *       _ensureIndustryStateHydrated() before any IndustryQueries
 *       read. If IndustryState.isHydrated() is false, it calls
 *       hydrateFromMasterData(enterprises, types) from masterData.
 *       This matches government-type-manager-tab.js and makes the tab
 *       render reliably when the settlement page loads before
 *       IndustryBootstrap.init() has run.
 *     - Removed the unused `stats = IQ.getEnterpriseStatistics()`
 *       assignment and its misleading comment ("For the stats row,
 *       compute a location-scoped subset"). The tab builds
 *       locationStats from the location-scoped summaries it already
 *       has; the world-wide aggregate was never used.
 *     - No behavioural change to details, edit, or create paths.
 *   Previous revisions:
 *     - Rewritten against the industry module set and the settlement
 *       module set. Signature changed from (containerId, locationId,
 *       summary) to (container, context). Recursion guard and
 *       modal-open flag removed. All per-enterprise actions delegate
 *       to modals-industry.js. Reads go through IndustryQueries only.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY ACCESS
    // =========================================================================

    function _getIndustryQueries() {
        var Q = window.IndustryQueries;
        if (!Q || typeof Q.getEnterprisesByLocation !== 'function') {
            throw new Error(
                'settlement-industry-tab: IndustryQueries is missing. ' +
                'Load industry-queries.js before this tab.'
            );
        }
        return Q;
    }

    function _getIndustryViewModels() {
        var VMs = window.IndustryViewModels;
        if (!VMs || typeof VMs.buildListRow !== 'function') {
            throw new Error(
                'settlement-industry-tab: IndustryViewModels is missing. ' +
                'Load industry-view-models.js before this tab.'
            );
        }
        return VMs;
    }

    function _getIndustryProcessor() {
        var P = window.IndustryProcessor;
        if (!P || typeof P.processAnnualEnterprise !== 'function') {
            throw new Error(
                'settlement-industry-tab: IndustryProcessor is missing. ' +
                'Load industry-processor.js before this tab.'
            );
        }
        return P;
    }

    function _getIndustryCommands() {
        var C = window.IndustryCommands;
        if (!C || typeof C.persist !== 'function') {
            throw new Error(
                'settlement-industry-tab: IndustryCommands is missing. ' +
                'Load industry-commands.js before this tab.'
            );
        }
        return C;
    }

    function _getIndustryState() {
        return window.IndustryState || null;
    }

    function _getIndustryModals() {
        var M = window.IndustryModals;
        if (!M || typeof M.openEnterpriseDetailsModal !== 'function') {
            throw new Error(
                'settlement-industry-tab: IndustryModals is missing. ' +
                'Load modals-industry.js before this tab.'
            );
        }
        return M;
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

    function _fmtGold(value) {
        if (typeof value !== 'number' || !isFinite(value)) return _unknown();
        return _escapeHtml(value.toLocaleString()) + 'g';
    }

    function _fmtText(value) {
        if (value === null || value === undefined || value === '') {
            return _unknown();
        }
        return _escapeHtml(value);
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

    function _confirm(message, title, onConfirm) {
        if (typeof window.confirmDialog === 'function') {
            window.confirmDialog(message, title, onConfirm);
            return;
        }
        if (window.confirm(title + '\n\n' + message)) {
            try { onConfirm(); } catch (e) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error('settlement-industry-tab: onConfirm threw:', e);
                }
            }
        }
    }

    function _requestRefresh() {
        var tabs = _getTabs();
        if (tabs && typeof tabs.requestRender === 'function') {
            tabs.requestRender('industry');
        }
    }

    // =========================================================================
    // 3. INDUSTRY STATE HYDRATION GUARD
    // =========================================================================
    //
    // IndustryState must be hydrated before any IndustryQueries read.
    // IndustryBootstrap.init() hydrates it once, but the settlement
    // page can render (and this tab can run) before that bootstrap has
    // completed — e.g. the user selects a settlement immediately after
    // the page loads. This guard makes the tab render reliably
    // regardless of page timing.
    //
    // The hydrate call is idempotent. When the bootstrap has already
    // hydrated, this is a no-op check.
    //
    // The guard does not replace the bootstrap. If IndustryState is
    // missing entirely (not loaded), the query will throw anyway, and
    // the caller's try/catch turns that into a visible error.

    function _ensureIndustryStateHydrated() {
        var IS = _getIndustryState();
        if (!IS) return;

        if (typeof IS.isHydrated === 'function' && IS.isHydrated()) return;

        if (typeof IS.hydrateFromMasterData !== 'function') return;

        var master = window.masterData && window.masterData.data;
        if (!master) return;

        var enterprises = Array.isArray(master.enterprises) ? master.enterprises : [];
        var types = Array.isArray(master.enterpriseTypes) ? master.enterpriseTypes : [];

        try {
            IS.hydrateFromMasterData(enterprises, types);
        } catch (err) {
            // Hydration can fail on duplicate ids (corrupted save).
            // Report it once so the failure is not silent; the
            // query below will re-throw and the caller's try/catch
            // will render an error state.
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    'settlement-industry-tab: industry state hydrate failed:',
                    err
                );
            }
        }
    }

    // =========================================================================
    // 4. ACTION HANDLERS
    // =========================================================================

    function _handleCreate(locationId) {
        var modals = _getIndustryModals();
        if (typeof modals.openCreateEnterpriseModal !== 'function') {
            _toast(
                'Create Enterprise modal is not available.',
                'error'
            );
            return;
        }

        // Pre-fill the settlement as the location. Leave ownerType
        // unset — the user picks whether this is a public
        // (settlement-owned) or private enterprise. The create
        // modal's owner selector is the place that decides.
        modals.openCreateEnterpriseModal(function () {
            _requestRefresh();
        }, {
            locationId: locationId
        });
    }

    function _handleCreatePublic(locationId) {
        var modals = _getIndustryModals();
        if (typeof modals.openCreateEnterpriseModal !== 'function') {
            _toast('Create Enterprise modal is not available.', 'error');
            return;
        }

        // Pre-fill owner as the settlement. The modal's owner-type
        // select now exposes 'settlement' (see modals-industry.js
        // OWNER TYPE VOCABULARY), so the pre-fill maps to the right
        // option and the industry rules will set ownershipType to
        // 'public' from the ownerType.
        modals.openCreateEnterpriseModal(function () {
            _requestRefresh();
        }, {
            locationId: locationId,
            ownerType: 'settlement',
            ownerId: locationId
        });
    }

    function _handleDetails(enterpriseId) {
        var modals = _getIndustryModals();
        if (typeof modals.openEnterpriseDetailsModal !== 'function') {
            _toast('Enterprise Details modal is not available.', 'error');
            return;
        }
        modals.openEnterpriseDetailsModal(enterpriseId, function () {
            _requestRefresh();
        });
    }

    function _handleEdit(enterpriseId) {
        var modals = _getIndustryModals();
        if (typeof modals.openEditEnterpriseModal !== 'function') {
            _toast('Edit Enterprise modal is not available.', 'error');
            return;
        }
        modals.openEditEnterpriseModal(enterpriseId, function () {
            _requestRefresh();
        });
    }

    function _handleOpenList() {
        var modals = _getIndustryModals();
        if (typeof modals.openEnterpriseListModal !== 'function') {
            _toast('Enterprise list modal is not available.', 'error');
            return;
        }
        modals.openEnterpriseListModal();
    }

    /**
     * Settlement-scoped batch processing.
     *
     * See AGGREGATE PROCESSING in the header. Prefers
     * IndustryProcessor.processEnterprisesForLocation when present;
     * otherwise composes the same semantics from the per-enterprise
     * primitive.
     *
     * @param {string} locationId
     * @returns {Object} structured result
     *   { success, attempted, processed, skipped, failed, results, failures,
     *     persist }
     */
    function _processSettlementEnterprises(locationId) {
        var processor = _getIndustryProcessor();
        var IC = _getIndustryCommands();

        // Preferred path: a processor method with the same contract.
        if (typeof processor.processEnterprisesForLocation === 'function') {
            try {
                return processor.processEnterprisesForLocation(locationId);
            } catch (err) {
                return {
                    success: false,
                    attempted: 0,
                    processed: 0,
                    skipped: 0,
                    failed: 0,
                    results: [],
                    failures: [{
                        reason: err && err.message ? err.message : 'unknown error'
                    }],
                    persist: null
                };
            }
        }

        // Composed path.
        var summaries;
        try {
            summaries = _getIndustryQueries().getLocationEnterprisesSummary(locationId);
        } catch (err) {
            return {
                success: false,
                attempted: 0,
                processed: 0,
                skipped: 0,
                failed: 0,
                results: [],
                failures: [{
                    reason: err && err.message ? err.message : 'unknown error'
                }],
                persist: null
            };
        }

        var results = [];
        var failures = [];
        var skipped = 0;
        var attempted = 0;

        for (var i = 0; i < summaries.length; i++) {
            var s = summaries[i];
            if (!s || !s.id) continue;
            // Only 'active' enterprises process. Matches the
            // processor's own eligibility gate.
            if (s.status !== 'active') continue;

            attempted++;

            var result;
            try {
                result = processor.processAnnualEnterprise(s.id, { persist: false });
            } catch (err) {
                failures.push({
                    enterpriseId: s.id,
                    enterpriseName: s.name || null,
                    reason: err && err.message ? err.message : 'process threw'
                });
                continue;
            }

            if (result && result.success === true) {
                if (result.skipped === true) {
                    skipped++;
                } else {
                    results.push(result);
                }
            } else {
                failures.push({
                    enterpriseId: s.id,
                    enterpriseName: s.name || null,
                    reason: (result && result.reason) || 'process failed'
                });
            }
        }

        // Persist once at the end. If nothing was actually mutated
        // (results.length === 0), skip the save — a batch that
        // produced no state changes has nothing to write.
        var persistResult = null;
        if (results.length > 0) {
            persistResult = IC.persist();
        }

        return {
            success: failures.length === 0 &&
                (!persistResult || persistResult.success === true),
            attempted: attempted,
            processed: results.length,
            skipped: skipped,
            failed: failures.length,
            results: results,
            failures: failures,
            persist: persistResult
        };
    }

    function _handleProcessAll(locationId) {
        _confirm(
            'Process all active enterprises in this settlement for the ' +
            'current year?\n\n' +
            'Each active enterprise will run its annual economics: income, ' +
            'expenses, wages, interest, and (for household-owned ' +
            'enterprises) the transfer to the owning household.\n\n' +
            'This action cannot be undone.',
            'Process Settlement Enterprises',
            function () {
                var result = _processSettlementEnterprises(locationId);

                if (result.success === true) {
                    var parts = [];
                    parts.push(result.processed + ' processed');
                    if (result.skipped > 0) parts.push(result.skipped + ' skipped');
                    _toast('Enterprises processed: ' + parts.join(', '), 'success');
                } else {
                    var msg = 'Processing completed with errors: ' +
                        result.processed + ' processed, ' +
                        result.failed + ' failed';
                    if (result.persist && result.persist.success === false) {
                        msg += ' (save failed: ' +
                            (result.persist.reason || 'unknown') + ')';
                    }
                    _toast(msg, 'error');
                }

                _requestRefresh();
            }
        );
    }

    // =========================================================================
    // 5. SECTION BUILDERS
    // =========================================================================

    function _buildHeader(context, summaryStats) {
        var locationId = context.locationId;
        var name = (context.viewModel && context.viewModel.name)
            ? context.viewModel.name
            : (_placeName(locationId) || '(unnamed location)');

        var total = summaryStats.total;
        var publicCount = summaryStats.publicCount;
        var privateCount = summaryStats.privateCount;

        var refreshBtn = '<button type="button" class="industry-tab-btn" ' +
            'data-action="refresh" ' +
            'style="font-size:0.55rem;padding:3px 10px;background:var(--bg3);' +
            'border:1px solid var(--border);border-radius:4px;cursor:pointer;' +
            'color:var(--text);">' +
            _getIcon('REFRESH') + ' Refresh</button>';

        var processAllBtn = '<button type="button" class="industry-tab-btn" ' +
            'data-action="process-all" ' +
            'style="font-size:0.55rem;padding:3px 10px;background:var(--bg3);' +
            'border:1px solid var(--border);border-radius:4px;cursor:pointer;' +
            'color:var(--text);">' +
            _getIcon('GEAR') + ' Process All</button>';

        return '<div style="background:var(--bg2);padding:12px 16px;' +
            'border-radius:8px;margin-bottom:16px;display:flex;' +
            'justify-content:space-between;align-items:center;flex-wrap:wrap;' +
            'gap:8px;border:1px solid var(--border);">' +
            '<div>' +
            '<div style="font-size:0.8rem;font-weight:bold;color:var(--accent-light);">' +
            _getIcon('GEAR') + ' Industry & Enterprises</div>' +
            '<div style="font-size:0.6rem;color:var(--dim);">' +
            _escapeHtml(name) + ' · ' +
            _fmtNumber(total) + ' total · ' +
            _fmtNumber(publicCount) + ' public · ' +
            _fmtNumber(privateCount) + ' private' +
            '</div>' +
            '</div>' +
            '<div style="display:flex;gap:4px;flex-wrap:wrap;">' +
            refreshBtn + processAllBtn +
            '</div>' +
            '</div>';
    }

    function _buildActionButtons(locationId) {
        function btn(action, label, iconName, opts) {
            opts = opts || {};
            var style = 'font-size:0.6rem;padding:6px 14px;' +
                'background:var(--bg3);border:1px solid ' +
                (opts.accent ? 'var(--accent)' : 'var(--border)') + ';' +
                'border-radius:4px;cursor:pointer;color:' +
                (opts.accent ? 'var(--accent-light)' : 'var(--text)') + ';';
            return '<button type="button" class="industry-tab-btn" ' +
                'data-action="' + _escapeHtml(action) + '" ' +
                'data-location="' + _escapeHtml(locationId) + '" ' +
                'style="' + style + '">' +
                (iconName ? _getIcon(iconName) + ' ' : '') +
                _escapeHtml(label) + '</button>';
        }

        return '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px;">' +
            btn('create-public', 'New Public Enterprise', 'PLUS', { accent: true }) +
            btn('create-private', 'New Private Enterprise', 'PLUS') +
            btn('open-list', 'All Enterprises', 'GEAR') +
            '</div>';
    }

    function _buildStatsRow(stats) {
        function cell(label, valueHtml, color) {
            return '<div style="background:var(--bg2);padding:10px;' +
                'border-radius:6px;text-align:center;' +
                'border:1px solid var(--border);">' +
                '<div style="font-size:0.5rem;color:var(--dim);">' +
                _escapeHtml(label) + '</div>' +
                '<div style="font-size:0.9rem;font-weight:bold;color:' +
                (color || 'var(--text)') + ';">' +
                valueHtml + '</div>' +
                '</div>';
        }

        var wealthColor = stats.totalWealth >= 0 ? 'var(--success)' : 'var(--danger)';
        var debtColor = stats.totalDebt > 0 ? 'var(--danger-lt)' : 'var(--success)';

        return '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;' +
            'gap:12px;margin-bottom:16px;">' +
            cell('Total Wealth', _fmtGold(stats.totalWealth), wealthColor) +
            cell('Total Debt', _fmtGold(stats.totalDebt), debtColor) +
            cell('Workers', _fmtNumber(stats.totalWorkers)) +
            cell('Profitable', _fmtNumber(stats.profitable) + ' / ' +
                _fmtNumber(stats.total), 'var(--success)') +
            '</div>';
    }

    function _buildEnterpriseRow(row) {
        var profitColor = row.profitClass === 'value-pos'
            ? 'var(--success)'
            : (row.profitClass === 'value-neg' ? 'var(--danger)' : 'var(--text)');

        var statusColor = 'var(--text)';
        if (row.statusClass === 'status-active') statusColor = 'var(--success)';
        else if (row.statusClass === 'status-bankrupt') statusColor = 'var(--danger)';
        else if (row.statusClass === 'status-closed') statusColor = 'var(--dim)';
        else if (row.statusClass === 'status-inactive') statusColor = 'var(--warn)';

        // row.workersLabel is a string from IndustryViewModels.buildListRow
        // ('3 / 10'); _fmtNumber requires a number. The prior
        // implementation passed null and always rendered '—'. Render the
        // label directly.
        var workersText = row.workersLabel
            ? _escapeHtml(row.workersLabel)
            : _unknown();

        return '<div class="industry-enterprise-row" ' +
            'data-enterprise-id="' + _escapeHtml(row.id) + '" ' +
            'style="background:var(--bg);border:1px solid var(--border);' +
            'border-left:3px solid ' + statusColor + ';border-radius:6px;' +
            'padding:10px 14px;margin-bottom:6px;cursor:pointer;">' +
            '<div style="display:flex;justify-content:space-between;' +
            'align-items:flex-start;flex-wrap:wrap;gap:6px;">' +
            '<div style="flex:1;min-width:0;">' +
            '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">' +
            '<span style="font-size:0.7rem;font-weight:bold;color:var(--text);">' +
            _escapeHtml(row.name) + '</span>' +
            '<span style="font-size:0.5rem;color:var(--dim);' +
            'padding:1px 6px;border:1px solid var(--border);' +
            'border-radius:8px;">' +
            _fmtText(row.type) + '</span>' +
            '<span style="font-size:0.5rem;color:' + statusColor + ';' +
            'padding:1px 6px;border:1px solid ' + statusColor + ';' +
            'border-radius:8px;">' +
            _escapeHtml(row.statusLabel) + '</span>' +
            '</div>' +
            '<div style="font-size:0.55rem;color:var(--dim);margin-top:2px;">' +
            'Owner: ' + _fmtText(row.ownerLabel) +
            ' · Workers: ' + workersText +
            '</div>' +
            '<div style="font-size:0.55rem;color:var(--dim);margin-top:2px;">' +
            'Wealth: ' + _escapeHtml(row.wealthLabel) +
            ' · ' +
            '<span style="color:' + profitColor + ';">' +
            'Profit: ' + _escapeHtml(row.profitLabel) + 'g' +
            '</span>' +
            '</div>' +
            '</div>' +
            '<div style="display:flex;gap:4px;flex-shrink:0;">' +
            '<button type="button" class="industry-row-btn" ' +
            'data-action="details" ' +
            'data-enterprise-id="' + _escapeHtml(row.id) + '" ' +
            'style="background:none;border:none;color:var(--accent);' +
            'cursor:pointer;font-size:0.55rem;padding:2px 6px;">' +
            'Details</button>' +
            '<button type="button" class="industry-row-btn" ' +
            'data-action="edit" ' +
            'data-enterprise-id="' + _escapeHtml(row.id) + '" ' +
            'style="background:none;border:none;color:var(--text);' +
            'cursor:pointer;font-size:0.55rem;padding:2px 6px;">' +
            'Edit</button>' +
            '</div>' +
            '</div>' +
            '</div>';
    }

    function _buildSection(title, enterprises, summaryMap) {
        var html = '<div style="margin-bottom:20px;">' +
            '<div style="font-size:0.7rem;color:var(--accent-light);' +
            'font-weight:bold;margin-bottom:8px;">' +
            _escapeHtml(title) + ' (' + _fmtNumber(enterprises.length) + ')' +
            '</div>';

        if (enterprises.length === 0) {
            html += '<div style="text-align:center;padding:20px;' +
                'color:var(--dim);font-size:0.6rem;background:var(--bg3);' +
                'border-radius:6px;">' +
                'No ' + _escapeHtml(title.toLowerCase()) + ' in this settlement.</div>';
            return html + '</div>';
        }

        var VMs = _getIndustryViewModels();
        var rows = [];
        for (var i = 0; i < enterprises.length; i++) {
            var summary = summaryMap[enterprises[i].id];
            if (!summary) continue;
            var row = VMs.buildListRow(summary);
            if (row) rows.push(row);
        }

        for (var j = 0; j < rows.length; j++) {
            html += _buildEnterpriseRow(rows[j]);
        }

        return html + '</div>';
    }

    function _buildFooter() {
        return '<div style="padding:8px;background:var(--bg3);' +
            'border-radius:6px;font-size:0.55rem;color:var(--dim);">' +
            _getIcon('CIRCLE_DOT') + ' ' +
            'Enterprises are owned by the Industry domain. This tab shows ' +
            'enterprises located in this settlement. Public enterprises are ' +
            'owned by the settlement; their profits route to the settlement ' +
            'treasury. Private enterprises are owned by characters, ' +
            'households, or no one.</div>';
    }

    // =========================================================================
    // 6. WIRING
    // =========================================================================

    function _wireActions(container, locationId) {
        container.addEventListener('click', function (event) {
            var target = event.target;
            if (!target || typeof target.closest !== 'function') return;

            // Row buttons first — they carry their own data-enterprise-id.
            var rowBtn = target.closest('.industry-row-btn');
            if (rowBtn && container.contains(rowBtn)) {
                event.preventDefault();
                var action = rowBtn.dataset.action;
                var enterpriseId = rowBtn.dataset.enterpriseId;
                if (action === 'details') _handleDetails(enterpriseId);
                else if (action === 'edit') _handleEdit(enterpriseId);
                return;
            }

            // Tab-level buttons.
            var tabBtn = target.closest('.industry-tab-btn');
            if (tabBtn && container.contains(tabBtn)) {
                event.preventDefault();
                var tabAction = tabBtn.dataset.action;
                var loc = tabBtn.dataset.location || locationId;

                if (tabAction === 'refresh') {
                    _requestRefresh();
                } else if (tabAction === 'process-all') {
                    _handleProcessAll(loc);
                } else if (tabAction === 'create-public') {
                    _handleCreatePublic(loc);
                } else if (tabAction === 'create-private') {
                    _handleCreate(loc);
                } else if (tabAction === 'open-list') {
                    _handleOpenList();
                }
                return;
            }

            // Clicking the row body (not a button) opens details.
            var row = target.closest('.industry-enterprise-row');
            if (row && container.contains(row)) {
                event.preventDefault();
                _handleDetails(row.dataset.enterpriseId);
                return;
            }
        });
    }

    // =========================================================================
    // 7. RENDER
    // =========================================================================

    /**
     * Renders the industry tab into the container.
     *
     * @param {HTMLElement} container
     * @param {Object} context  { locationId, data, viewModel }
     */
    function renderSettlementIndustry(container, context) {
        if (!container) {
            throw new Error(
                'settlement-industry-tab: container is required'
            );
        }
        if (!context || !context.locationId) {
            throw new Error(
                'settlement-industry-tab: context.locationId is required'
            );
        }

        var locationId = context.locationId;
        var IQ = _getIndustryQueries();

        // Ensure IndustryState is hydrated before any query.
        // See INDUSTRY HYDRATION GUARD in the header.
        _ensureIndustryStateHydrated();

        // Read the location-scoped enterprise summaries. If the query
        // throws (load-order regression, corrupted state, or an
        // unhydrated state that could not be repaired), render an
        // error state rather than crashing the tab stack.
        var summaries;
        try {
            summaries = IQ.getLocationEnterprisesSummary(locationId);
        } catch (err) {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    'settlement-industry-tab: query failed:', err
                );
            }
            container.innerHTML = '<div style="padding:24px;text-align:center;' +
                'color:var(--danger);font-size:0.65rem;">' +
                'Could not load industry data: ' +
                _escapeHtml(err && err.message ? err.message : 'unknown error') +
                '</div>';
            return;
        }

        // Split into public and private by ownershipType. The summary
        // projection includes ownershipType, so grouping is exact.
        //
        // Enterprises with ownershipType not in ('public', 'private')
        // are an integrity failure (industry-rules enforces this on
        // write). They are grouped with private rather than dropped,
        // so the user can see them and open details to inspect the
        // anomaly.
        var publicEnterprises = [];
        var privateEnterprises = [];
        var summaryMap = {};

        var locationStats = {
            total: summaries.length,
            totalWealth: 0,
            totalDebt: 0,
            totalWorkers: 0,
            publicCount: 0,
            privateCount: 0,
            profitable: 0
        };

        for (var i = 0; i < summaries.length; i++) {
            var s = summaries[i];
            if (!s || !s.id) continue;
            summaryMap[s.id] = s;

            if (s.ownershipType === 'public') {
                publicEnterprises.push({ id: s.id });
                locationStats.publicCount++;
            } else {
                privateEnterprises.push({ id: s.id });
                locationStats.privateCount++;
            }

            if (typeof s.wealth === 'number') locationStats.totalWealth += s.wealth;
            if (typeof s.debt === 'number') locationStats.totalDebt += s.debt;
            if (typeof s.workerCount === 'number') locationStats.totalWorkers += s.workerCount;
            if (typeof s.annualProfit === 'number' && s.annualProfit > 0) {
                locationStats.profitable++;
            }
        }

        var html = '<div style="padding:4px;">' +
            _buildHeader(context, locationStats) +
            _buildStatsRow(locationStats) +
            _buildActionButtons(locationId) +
            _buildSection('Public Enterprises', publicEnterprises, summaryMap) +
            _buildSection('Private Enterprises', privateEnterprises, summaryMap) +
            _buildFooter() +
            '</div>';

        container.innerHTML = html;
        _wireActions(container, locationId);
    }

    // =========================================================================
    // 8. REGISTRATION
    // =========================================================================

    function _register() {
        var tabs = _getTabs();
        if (!tabs || typeof tabs.registerTabRenderer !== 'function') {
            throw new Error(
                'settlement-industry-tab: SettlementTabs is missing. ' +
                'Load settlement-tabs.js before this tab.'
            );
        }
        tabs.registerTabRenderer('industry', renderSettlementIndustry);
    }

    _register();

    // =========================================================================
    // 9. EXPORTS
    // =========================================================================

    window.renderSettlementIndustry = renderSettlementIndustry;
    window._renderSettlementIndustry = renderSettlementIndustry;

})();
