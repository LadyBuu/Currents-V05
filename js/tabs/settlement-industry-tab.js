/**
 * =============================================================================
 * SETTLEMENT INDUSTRY TAB
 * js/tabs/settlement-industry-tab.js
 * =============================================================================
 *
 * Renders the settlement's enterprises (public and private) with
 * aggregate stats and per-enterprise actions. Every mutation delegates
 * to the industry modals. Every read goes through IndustryQueries.
 *
 * RENDERER CONTRACT:
 *   fn(container, context) with context = { locationId, data, viewModel }
 *
 * DATA SOURCES:
 *   - IndustryQueries.getLocationEnterprisesSummary(locationId)
 *   - IndustryViewModels.buildListRow(summary)
 *
 * DELEGATED MODALS (IndustryModals):
 *   - openCreateEnterpriseModal(onSuccess, defaultData)
 *   - openEnterpriseDetailsModal(enterpriseId, onSuccess)
 *   - openEditEnterpriseModal(enterpriseId, onSuccess)
 *   - openEnterpriseListModal()
 *
 * DELEGATED PROCESSOR (IndustryProcessor):
 *   - processEnterprisesForLocation(locationId) — batch processing for
 *     the settlement's OWN location (not the subtree). The processor
 *     owns the eligibility gate (status === 'active') and the single
 *     persist at the end of the batch.
 *
 * INDUSTRY HYDRATION GUARD:
 *   IndustryState must be hydrated before any IndustryQueries read.
 *   IndustryBootstrap.init() hydrates it, but the settlement page can
 *   render before that bootstrap completes. _ensureIndustryStateHydrated
 *   makes the tab render reliably regardless of page timing. The
 *   hydrate call is idempotent.
 *
 * PUBLIC vs. PRIVATE:
 *   Grouped by `ownershipType` ('public' | 'private'). Enterprises with
 *   ownershipType not in that set are grouped with private so the user
 *   can see the anomaly. IndustryRules enforces the invariant on write.
 *
 * NO CSS. Class-only rendering.
 * =============================================================================
 */

(function () {
    'use strict';

    var TAB_ID = 'industry';
    var SCOPE  = 'settlement';

    function H() { return window.SettlementTabHelpers; }
    function esc(v)     { return H().esc(v); }
    function icon(n)    { return H().icon(n); }
    function fmtNum(v)  { return H().fmtNumber(v); }
    function fmtGold(v) { return H().fmtGold(v); }
    function fmtText(v) { return H().fmtText(v); }
    function unknown()  { return H().unknown(); }
    function refresh()  { H().requestRefresh(SCOPE, TAB_ID); }

    // -------------------------------------------------------------------
    // Dependency access (soft; each call guards)
    // -------------------------------------------------------------------

    function _getIndustryQueries() {
        var Q = window.IndustryQueries;
        if (!Q || typeof Q.getLocationEnterprisesSummary !== 'function'
            || typeof Q.getEnterprisesByLocation !== 'function') {
            return null;
        }
        return Q;
    }

    function _getIndustryViewModels() {
        var VMs = window.IndustryViewModels;
        if (!VMs || typeof VMs.buildListRow !== 'function') {
            return null;
        }
        return VMs;
    }

    function _getIndustryProcessor() {
        var P = window.IndustryProcessor;
        if (!P || typeof P.processEnterprisesForLocation !== 'function') {
            return null;
        }
        return P;
    }

    function _getIndustryState() { return window.IndustryState || null; }

    function _getIndustryModals() {
        var M = window.IndustryModals;
        if (!M || typeof M.openEnterpriseDetailsModal !== 'function') {
            return null;
        }
        return M;
    }

    function _getPlaceQueries() { return window.PlaceQueries; }

    function _placeName(locationId) {
        var pq = _getPlaceQueries();
        if (!pq || typeof pq.getPlaceById !== 'function') return null;
        var place = pq.getPlaceById(locationId);
        return place ? (place.displayName || place.name || null) : null;
    }

    // -------------------------------------------------------------------
    // IndustryState hydration guard
    // -------------------------------------------------------------------

    function _ensureIndustryStateHydrated() {
        var IS = _getIndustryState();
        if (!IS) return;

        if (typeof IS.isHydrated === 'function' && IS.isHydrated()) return;

        if (typeof IS.hydrateFromMasterData !== 'function') return;

        var master = window.masterData && window.masterData.data;
        if (!master) return;

        var enterprises = Array.isArray(master.enterprises)
            ? master.enterprises : [];
        var types = Array.isArray(master.enterpriseTypes)
            ? master.enterpriseTypes : [];

        try { IS.hydrateFromMasterData(enterprises, types); }
        catch (err) {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    'settlement-industry-tab: industry state hydrate ' +
                    'failed:', err);
            }
        }
    }

    // -------------------------------------------------------------------
    // Confirmation
    // -------------------------------------------------------------------

    function _confirm(message, title, onConfirm) {
        if (typeof window.confirmDialog === 'function') {
            window.confirmDialog(message, title, onConfirm);
            return;
        }
        if (window.confirm(title + '\n\n' + message)) {
            try { onConfirm(); }
            catch (e) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error(
                        'settlement-industry-tab: onConfirm threw:', e);
                }
            }
        }
    }

    // -------------------------------------------------------------------
    // Modal delegates
    // -------------------------------------------------------------------

    function _delegateDetails(enterpriseId) {
        var M = _getIndustryModals();
        if (!M || typeof M.openEnterpriseDetailsModal !== 'function') {
            H().toast('Enterprise Details modal is not available.', 'error');
            return;
        }
        try { M.openEnterpriseDetailsModal(enterpriseId, refresh); }
        catch (err) {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    'settlement-industry-tab: openEnterpriseDetailsModal ' +
                    'threw:', err);
            }
            H().toast('Could not open enterprise details.', 'error');
        }
    }

    function _delegateEdit(enterpriseId) {
        var M = _getIndustryModals();
        if (!M || typeof M.openEditEnterpriseModal !== 'function') {
            H().toast('Edit Enterprise modal is not available.', 'error');
            return;
        }
        try { M.openEditEnterpriseModal(enterpriseId, refresh); }
        catch (err) {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    'settlement-industry-tab: openEditEnterpriseModal threw:',
                    err);
            }
            H().toast('Could not open edit modal.', 'error');
        }
    }

    function _delegateCreate(locationId, prefill) {
        var M = _getIndustryModals();
        if (!M || typeof M.openCreateEnterpriseModal !== 'function') {
            H().toast('Create Enterprise modal is not available.', 'error');
            return;
        }
        try { M.openCreateEnterpriseModal(refresh, prefill); }
        catch (err) {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    'settlement-industry-tab: openCreateEnterpriseModal ' +
                    'threw:', err);
            }
            H().toast('Could not open create modal.', 'error');
        }
    }

    function _delegateOpenList() {
        var M = _getIndustryModals();
        if (!M || typeof M.openEnterpriseListModal !== 'function') {
            H().toast('Enterprise list modal is not available.', 'error');
            return;
        }
        try { M.openEnterpriseListModal(); }
        catch (err) {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    'settlement-industry-tab: openEnterpriseListModal threw:',
                    err);
            }
            H().toast('Could not open enterprise list.', 'error');
        }
    }

    // -------------------------------------------------------------------
    // Batch processing
    // -------------------------------------------------------------------

    function _processSettlementEnterprises(locationId) {
        var processor = _getIndustryProcessor();
        if (!processor) {
            return {
                success: false,
                attempted: 0,
                processed: 0,
                skipped: 0,
                failed: 0,
                results: [],
                failures: [{
                    reason: 'IndustryProcessor.processEnterprisesForLocation ' +
                        'is not available.'
                }],
                persist: null,
                locationId: locationId
            };
        }
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
                persist: null,
                locationId: locationId
            };
        }
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
                    H().toast(
                        'Enterprises processed: ' + parts.join(', '), 'success');
                } else {
                    var msg = 'Processing completed with errors: ' +
                        result.processed + ' processed, ' +
                        result.failed + ' failed';
                    if (result.persist && result.persist.success === false) {
                        msg += ' (save failed: ' +
                            (result.persist.reason || 'unknown') + ')';
                    }
                    H().toast(msg, 'error');
                }
                refresh();
            });
    }

    // -------------------------------------------------------------------
    // Sections
    // -------------------------------------------------------------------

    function _buildHeader(context, stats) {
        var name = context.viewModel && context.viewModel.name
            ? context.viewModel.name
            : (_placeName(context.locationId) || '(unnamed location)');

        var processBtn = '<button type="button" class="st-btn" ' +
            'data-action="process-all">' +
            icon('GEAR') + ' Process All</button>';
        var refreshBtn = '<button type="button" class="st-btn" ' +
            'data-action="refresh">' +
            icon('REFRESH') + ' Refresh</button>';

        return '<div class="st-header">' +
            '<div>' +
            '<div class="st-header__title">' +
            icon('GEAR') + ' Industry &amp; Enterprises</div>' +
            '<div class="st-header__subtitle">' +
            esc(name) + ' \u00b7 ' +
            fmtNum(stats.total) + ' total \u00b7 ' +
            fmtNum(stats.publicCount) + ' public \u00b7 ' +
            fmtNum(stats.privateCount) + ' private' +
            '</div>' +
            '</div>' +
            '<div class="st-header__actions">' +
            refreshBtn + processBtn +
            '</div>' +
            '</div>';
    }

    function _buildStatsRow(stats) {
        var wealthClass = 'st-stat__value' +
            (stats.totalWealth >= 0
                ? ' st-stat__value--pos'
                : ' st-stat__value--neg');
        var debtClass = 'st-stat__value' +
            (stats.totalDebt > 0
                ? ' st-stat__value--neg'
                : ' st-stat__value--pos');

        function cell(label, valueHtml, cls) {
            return '<div class="st-stat">' +
                '<div class="st-stat__label">' + esc(label) + '</div>' +
                '<div class="' + cls + '">' + valueHtml + '</div>' +
                '</div>';
        }

        return '<div class="st-stats">' +
            cell('Total Wealth', fmtGold(stats.totalWealth), wealthClass) +
            cell('Total Debt', fmtGold(stats.totalDebt), debtClass) +
            cell('Workers', fmtNum(stats.totalWorkers), 'st-stat__value') +
            cell('Profitable',
                fmtNum(stats.profitable) + ' / ' + fmtNum(stats.total),
                'st-stat__value st-stat__value--pos') +
            '</div>';
    }

    function _buildActionButtons(locationId) {
        function btn(action, label, iconName, accent) {
            return '<button type="button" class="st-btn' +
                (accent ? ' st-btn--accent' : '') +
                '" data-action="' + esc(action) + '">' +
                (iconName ? icon(iconName) + ' ' : '') +
                esc(label) + '</button>';
        }
        return '<div class="st-header__actions">' +
            btn('create-public', 'New Public Enterprise', 'PLUS', true) +
            btn('create-private', 'New Private Enterprise', 'PLUS') +
            btn('open-list', 'All Enterprises', 'GEAR') +
            '</div>';
    }

    function _buildEnterpriseRow(row) {
        var profitClass = 'st-row__meta';
        if (row.profitClass === 'value-pos') profitClass += ' st-stat__value--pos';
        else if (row.profitClass === 'value-neg') profitClass += ' st-stat__value--neg';

        var statusCls = 'st-row';
        if (row.statusClass === 'status-active') statusCls += ' st-row--success';
        else if (row.statusClass === 'status-bankrupt') statusCls += ' st-row--danger';
        else if (row.statusClass === 'status-closed') statusCls += ' st-row--dim';
        else if (row.statusClass === 'status-inactive') statusCls += ' st-row--warn';

        var workersText = row.workersLabel
            ? esc(row.workersLabel)
            : unknown();

        return '<div class="' + statusCls + '" ' +
            'data-action="details" ' +
            'data-enterprise-id="' + esc(row.id) + '">' +
            '<div class="st-row__body">' +
            '<div class="st-row__title">' +
            esc(row.name) +
            ' <span class="st-badge st-badge--dim">' +
            fmtText(row.type) + '</span>' +
            ' <span class="st-badge">' +
            esc(row.statusLabel) + '</span>' +
            '</div>' +
            '<div class="st-row__meta">' +
            'Owner: ' + fmtText(row.ownerLabel) +
            ' \u00b7 Workers: ' + workersText +
            '</div>' +
            '<div class="st-row__meta">' +
            'Wealth: ' + esc(row.wealthLabel) +
            ' \u00b7 <span class="' + profitClass + '">' +
            'Profit: ' + esc(row.profitLabel) + 'g</span>' +
            '</div>' +
            '</div>' +
            '<div class="st-row__actions">' +
            '<button type="button" class="st-btn st-btn--small" ' +
            'data-action="details" ' +
            'data-enterprise-id="' + esc(row.id) + '">Details</button>' +
            '<button type="button" class="st-btn st-btn--small" ' +
            'data-action="edit" ' +
            'data-enterprise-id="' + esc(row.id) + '">Edit</button>' +
            '</div>' +
            '</div>';
    }

    function _buildSection(title, enterprises, summaryMap) {
        var html = '<div class="st-section">' +
            '<div class="st-section__title">' +
            esc(title) + ' (' + fmtNum(enterprises.length) + ')</div>';

        if (enterprises.length === 0) {
            html += '<div class="st-section__empty">' +
                'No ' + esc(title.toLowerCase()) +
                ' in this settlement.</div>';
            return html + '</div>';
        }

        var VMs = _getIndustryViewModels();
        if (!VMs) {
            html += '<div class="st-section__empty">' +
                'IndustryViewModels is not available.</div>';
            return html + '</div>';
        }

        var rows = [];
        for (var i = 0; i < enterprises.length; i++) {
            var summary = summaryMap[enterprises[i].id];
            if (!summary) continue;
            var row;
            try { row = VMs.buildListRow(summary); }
            catch (e) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error(
                        'settlement-industry-tab: buildListRow threw:', e);
                }
                continue;
            }
            if (row) rows.push(row);
        }

        html += '<div class="st-rows">';
        for (var j = 0; j < rows.length; j++) {
            html += _buildEnterpriseRow(rows[j]);
        }
        html += '</div></div>';
        return html;
    }

    function _buildFooter() {
        return '<div class="st-footer">' + icon('CIRCLE_DOT') +
            ' <span>Enterprises are owned by the Industry domain. This tab ' +
            'shows enterprises located in this settlement. Public enterprises ' +
            'are owned by the settlement; their profits route to the ' +
            'settlement treasury. Private enterprises are owned by characters, ' +
            'households, or no one.</span></div>';
    }

    // -------------------------------------------------------------------
    // Wiring
    // -------------------------------------------------------------------

    function _handleAction(action, btn, locationId) {
        if (action === 'refresh') { refresh(); return; }
        if (action === 'process-all') { _handleProcessAll(locationId); return; }
        if (action === 'create-public') {
            _delegateCreate(locationId, {
                locationId: locationId,
                ownerType: 'settlement',
                ownerId: locationId
            });
            return;
        }
        if (action === 'create-private') {
            _delegateCreate(locationId, { locationId: locationId });
            return;
        }
        if (action === 'open-list') { _delegateOpenList(); return; }
        if (action === 'details') {
            var detailsId = btn.dataset.enterpriseId;
            if (detailsId) _delegateDetails(detailsId);
            return;
        }
        if (action === 'edit') {
            var editId = btn.dataset.enterpriseId;
            if (editId) _delegateEdit(editId);
            return;
        }
    }

    function _wireActions(container, locationId) {
        if (container.__stIndustryWired) return;
        container.__stIndustryWired = true;
        container.addEventListener('click', function (event) {
            var btn = event.target.closest('[data-action]');
            if (!btn || !container.contains(btn)) return;
            event.preventDefault();
            _handleAction(btn.dataset.action, btn, locationId);
        });
    }

    // -------------------------------------------------------------------
    // Renderer
    // -------------------------------------------------------------------

    function renderSettlementIndustry(container, context) {
        if (!container) return;
        if (!context || !context.locationId) {
            container.innerHTML = H().emptyState('no-context');
            return;
        }

        var locationId = context.locationId;

        // Hydrate industry state if the bootstrap hasn't yet. See
        // INDUSTRY HYDRATION GUARD in the header.
        _ensureIndustryStateHydrated();

        var IQ = _getIndustryQueries();
        if (!IQ) {
            container.innerHTML = '<div class="st-error">' +
                'IndustryQueries is not available. Load industry-queries.js ' +
                'before the settlement industry tab.</div>';
            return;
        }

        var summaries;
        try { summaries = IQ.getLocationEnterprisesSummary(locationId) || []; }
        catch (err) {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    'settlement-industry-tab: query failed:', err);
            }
            container.innerHTML = '<div class="st-error">' +
                'Could not load industry data: ' +
                esc(err && err.message ? err.message : 'unknown error') +
                '</div>';
            return;
        }

        var publicEnterprises = [];
        var privateEnterprises = [];
        var summaryMap = {};

        var stats = {
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
                stats.publicCount++;
            } else {
                privateEnterprises.push({ id: s.id });
                stats.privateCount++;
            }

            if (typeof s.wealth === 'number') stats.totalWealth += s.wealth;
            if (typeof s.debt === 'number') stats.totalDebt += s.debt;
            if (typeof s.workerCount === 'number') stats.totalWorkers += s.workerCount;
            if (typeof s.annualProfit === 'number' && s.annualProfit > 0) {
                stats.profitable++;
            }
        }

        var html = '<div class="st-tab">' +
            _buildHeader(context, stats) +
            _buildStatsRow(stats) +
            _buildActionButtons(locationId) +
            _buildSection('Public Enterprises', publicEnterprises, summaryMap) +
            _buildSection('Private Enterprises', privateEnterprises, summaryMap) +
            _buildFooter() +
            '</div>';

        container.innerHTML = html;
        _wireActions(container, locationId);
    }

    // -------------------------------------------------------------------
    // Registration
    // -------------------------------------------------------------------

    if (window.TabManager && typeof window.TabManager.register === 'function') {
        window.TabManager.register(SCOPE, TAB_ID, renderSettlementIndustry);
    } else if (typeof console !== 'undefined' && console.warn) {
        console.warn(
            'settlement-industry-tab: TabManager is not available at load ' +
            'time; the tab was not registered.'
        );
    }

    window.renderSettlementIndustry = renderSettlementIndustry;

})();
