/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT ECONOMY TAB
 * js/tabs/settlement-economy-tab.js
 * =============================================================================
 *
 * ECONOMY TAB RENDERER.
 *
 * Renders the settlement's fiscal snapshot (wealth, debt, tax rates,
 * budgets, income, expenses, surplus, employment) and hosts the actions
 * that open the economy modals for detailed editing.
 *
 * It is a UI module. It:
 *   - reads through SettlementViewModels and SettlementQueries
 *   - mutates through SettlementFiscalCommands and
 *     SettlementGovernmentCommands
 *   - opens the economy modals via SettlementEconomyModals and core
 *     modals via SettlementModals
 *   - does not read canonical settlement data directly
 *   - does not compute domain values
 *   - does not create settlement records
 *   - does not persist
 *   - does not fabricate missing domain values
 *   - does not render raw null/undefined as "null" or "undefined"
 *   - does not use a recursion guard
 *   - does not use setTimeout to guess when the DOM is ready
 *
 * Contract reference: Settlement Architecture Contracts §12 (Command
 * Contract), §15 (ViewModel Contract), §16 (UI Contract), §21 (Fiscal
 * Contract), §32 (Completion Standard).
 *
 * RENDERER CONTRACT
 * -----------------
 *   Registered via SettlementTabs.registerTabRenderer('economy', fn).
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
 * FISCAL SEMANTICS
 * ----------------
 *   Tax rate, trade tariff, and industry tax rate are canonical policy
 *   fields owned by the settlement record. They are edited through
 *   SettlementFiscalCommands.updateFiscalPolicy, which validates every
 *   field in one transaction via SettlementFiscalRules.

 *   Budget allocations (educationBudget, governmentSalaryBudget,
 *   infrastructureBudget, militaryBudget) are policy fields distinct
 *   from actual spending. They are edited through
 *   SettlementFiscalCommands.setBudgetAllocation.

 *   Actual spending (militarySpending, infrastructureSpending,
 *   educationSpending) is written by the annual budget-decision flow
 *   and is NOT editable from this tab. It is displayed read-only.

 *   Debt and wealth are independent canonical balances (§18). Repayment
 *   and borrowing go through SettlementDebtCommands, reached via the
 *   debt management modal. The tab does not call debt commands
 *   directly — the modal is the only entry point.
 *
 *   Fiscal limits (TAX_RATE.max = 50 etc.) come from
 *   SettlementFiscalDefinitions, read via SettlementFiscalRules'
 *   validator return. The tab does not hardcode 0–50 / 0–30 / 0–30.
 *
 *   The old economy tab had its own <input type="number" min="0" max="50">
 *   bounds hardcoded in the markup, and its save path called
 *   SettlementCommands.updateTaxRate / updateTradeTariff / etc. (none
 *   of which exist on the new surface). The tab also tried to edit
 *   spending through SettlementCommands.updateMilitarySpending (also
 *   gone). All three paths are gone; the tab now delegates every
 *   mutation to the appropriate modal, which calls the correct
 *   command, and only renders read-only values itself.
 *
 * WHY THE TAB DELEGATES EDITING TO MODALS
 * ---------------------------------------
 *   Inline number inputs with "save" buttons next to them invite a
 *   class of problems the modals solve cleanly:

 *     - partial-commit on save (one field updates, another fails
 *       validation, the UI shows "saved" anyway)
 *     - stale reads (the tab captures a summary at render time, the
 *       user edits two fields, the second save is computed against
 *       the first save's pre-state)
 *     - validation divergence (the tab hardcodes max=50, the rules
 *       layer says the limit is 50 today but could change)
 *     - no atomic multi-field transaction (the user is editing tax,
 *       tariff, and industry tax in one visual block; a save that
 *       succeeds for tax but fails for tariff leaves the UI in a
 *       state that does not match the world)

 *   SettlementEconomyModals.openTaxRateModal uses
 *   SettlementFiscalCommands.updateFiscalPolicy — one call, one
 *   validation pass, one commit, one re-render. The tab's job is to
 *   show the current state and route the user to the modal.

 * ACTION DELEGATION
 * -----------------
 *   Every mutating button on the economy tab opens a modal:

 *     Tax Rates    → SettlementEconomyModals.openTaxRateModal
 *     Spending     → SettlementEconomyModals.openSpendingModal (read-only)
 *     Budget       → SettlementModals.openBudgetModal
 *     Justice      → SettlementEconomyModals.openJusticeModal
 *     Debt         → SettlementEconomyModals.openDebtManagementModal
 *     Report       → SettlementEconomyModals.openFinancialReportModal
 *     Efficiency   → SettlementEconomyModals.openEfficiencyModal
 *     Employment   → SettlementModals.openEmploymentModal
 *     State Ent.   → SettlementModals.openStateEnterpriseModal

 *   No action on this tab calls a command directly. Every mutation
 *   runs through a modal that owns the confirmation, the validation,
 *   and the post-command refresh. This matches the §16 UI Contract:
 *   the tab renders, the modal mutates.

 * POST-COMMAND REFRESH
 * --------------------
 *   The modals call SettlementTabs.requestRender('economy') on success.
 *   The tab itself does not wire that refresh — the modal does — because
 *   the modal is the caller that knows the command succeeded. A tab-side
 *   re-render after closing the modal would be a second render of the
 *   same state.

 *   The Refresh button on the tab calls requestRender('economy')
 *   directly, which is a user-initiated re-read of the current world.

 * ICON POLICY
 * -----------
 *   No emojis. No inline SVG. Chrome icons come from window.getIcon if
 *   it is loaded; when icons.js is not on the page, the renderer falls
 *   back to plain text labels.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - Rewritten against the new settlement module set.
 *     - Signature changed from (containerId, locationId, summary) to
 *       (container, context), matching settlement-tabs.js.
 *     - Recursion guard (_rendering) and the modal-open flag removed
 *       (§20 prohibits recursion guards; §16 prohibits modal-locking
 *       flags on a read-only renderer).
 *     - All inline number inputs and save buttons removed. Editing is
 *       delegated to the economy modals, which call
 *       SettlementFiscalCommands / SettlementGovernmentCommands /
 *       SettlementDebtCommands with the correct contracts.
 *     - SettlementState.getSettlementBudget / getSettlementSummary /
 *       getSettlementEmployment reads replaced by
 *       SettlementEconomyQueries.getBudgetSummary /
 *       SettlementEmploymentQueries.getEmployment / buildSettlementSummary.
 *     - SettlementEconomy.* reads (calculateSurplus, getDebtRatio,
 *       getEfficiencyScore, getFinancialReport) replaced by their
 *       SettlementEconomyQueries equivalents. getFinancialReport had
 *       no direct equivalent — the tab opens the financial report
 *       modal, which builds the report from buildFinancialReportView.
 *     - Spending inputs removed. The tab displays the three spending
 *       fields read-only; the spending modal is opened for detail.
 *     - The debt repayment mini-form (repay-all button, then manual
 *       onclick hijack on the modal's confirm button) is gone. Debt
 *       repayment goes through
 *       SettlementEconomyModals.openDebtManagementModal, which uses
 *       SettlementDebtCommands.repayDebt (atomic, one candidate, one
 *       commit). The prior implementation called updateWealth and
 *       updateDebt as two separate commands — a §18 violation that
 *       could leave wealth debited but debt unreduced if the second
 *       command failed.
 *     - window.getCurrentYearSafe is not referenced. window.getCurrentYear
 *       is not called — the tab does not display a year.
 *   Previous revisions:
 *     - Pre-refactor implementation against SettlementState /
 *       SettlementCommands / SettlementCrud / SettlementEconomy, all
 *       of which no longer exist.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY ACCESS
    // =========================================================================

    function _getSummaryModel() {
        var VMs = window.SettlementViewModels;
        if (!VMs || typeof VMs.buildSettlementSummary !== 'function') {
            throw new Error(
                'settlement-economy-tab: SettlementViewModels.' +
                'buildSettlementSummary is missing.'
            );
        }
        return VMs;
    }

    function _getEconomyQueries() {
        var Q = window.SettlementEconomyQueries;
        if (!Q || typeof Q.getBudgetSummary !== 'function') {
            throw new Error(
                'settlement-economy-tab: SettlementEconomyQueries is ' +
                'missing. Load settlement-economy-queries.js before this tab.'
            );
        }
        return Q;
    }

    function _getEmploymentQueries() {
        return window.SettlementEmploymentQueries || null;
    }

    function _getPlaceQueries() {
        return window.PlaceQueries || null;
    }

    function _getTabs() {
        return window.SettlementTabs || null;
    }

    function _openCoreModal(name, args) {
        var bundle = window.SettlementModals;
        if (!bundle || typeof bundle[name] !== 'function') {
            throw new Error(
                'settlement-economy-tab: SettlementModals.' + name + ' is missing.'
            );
        }
        return bundle[name].apply(bundle, args || []);
    }

    function _openEconomyModal(name, args) {
        var bundle = window.SettlementEconomyModals;
        if (!bundle || typeof bundle[name] !== 'function') {
            throw new Error(
                'settlement-economy-tab: SettlementEconomyModals.' + name +
                ' is missing. Load modals-settlement-economy.js before this tab.'
            );
        }
        return bundle[name].apply(bundle, args || []);
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

    function _fmtPercent(value, opts) {
        if (typeof value !== 'number' || !isFinite(value)) return _unknown();
        var s = _escapeHtml(value.toLocaleString());
        return s + '%';
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
            tabs.requestRender('economy');
        }
    }

    function _safeModalOpen(fn) {
        // Wrap the modal call so a missing dependency produces a toast,
        // not an uncaught exception in an event handler (which would
        // abort other listeners on the same click).
        try {
            fn();
        } catch (err) {
            if (typeof console !== 'undefined' && console.error) {
                console.error('settlement-economy-tab: modal open failed:', err);
            }
            _toast(
                'Could not open modal: ' +
                (err && err.message ? err.message : 'unknown error'),
                'error'
            );
        }
    }

    // =========================================================================
    // 3. ACTION HANDLERS
    // =========================================================================

    function _handleAction(action, locationId) {
        switch (action) {
            case 'tax-rates':
                _safeModalOpen(function () {
                    _openEconomyModal('openTaxRateModal', [locationId]);
                });
                return;
            case 'spending':
                _safeModalOpen(function () {
                    _openEconomyModal('openSpendingModal', [locationId]);
                });
                return;
            case 'budget':
                _safeModalOpen(function () {
                    _openCoreModal('openBudgetModal', [locationId]);
                });
                return;
            case 'justice':
                _safeModalOpen(function () {
                    _openEconomyModal('openJusticeModal', [locationId]);
                });
                return;
            case 'debt':
                _safeModalOpen(function () {
                    _openEconomyModal('openDebtManagementModal', [locationId]);
                });
                return;
            case 'report':
                _safeModalOpen(function () {
                    _openEconomyModal('openFinancialReportModal', [locationId]);
                });
                return;
            case 'efficiency':
                _safeModalOpen(function () {
                    _openEconomyModal('openEfficiencyModal', [locationId]);
                });
                return;
            case 'employment':
                _safeModalOpen(function () {
                    _openCoreModal('openEmploymentModal', [locationId]);
                });
                return;
            case 'state-enterprises':
                _safeModalOpen(function () {
                    _openCoreModal('openStateEnterpriseModal', [locationId]);
                });
                return;
            case 'refresh':
                _requestRefresh();
                return;
            default:
                // Unknown action: no-op, do not throw. A stale button
                // in cached HTML should not break the tab.
                return;
        }
    }

    function _wireActions(container, locationId) {
        container.addEventListener('click', function (event) {
            var target = event.target;
            if (!target || typeof target.closest !== 'function') return;
            var btn = target.closest('[data-action]');
            if (!btn) return;
            if (!container.contains(btn)) return;
            event.preventDefault();
            var action = btn.dataset.action;
            var loc = btn.dataset.location || locationId;
            _handleAction(action, loc);
        });
    }

    // =========================================================================
    // 4. SECTION BUILDERS
    // =========================================================================

    function _buildHeader(context) {
        var locationId = context.locationId;
        var summary = context.viewModel || {};
        var name = summary.name
            ? summary.name
            : (_placeName(locationId) || '(unnamed location)');

        var rankName = summary.rank ? summary.rank.name : null;
        var prosperity = summary.prosperity;
        var prosperityValue = (prosperity && typeof prosperity.value === 'number')
            ? prosperity.value
            : null;
        var prosperityBand = prosperity ? prosperity.band : null;
        var prosperityBandName = prosperityBand ? prosperityBand.name : null;

        var prosperityColor = 'var(--dim)';
        if (prosperityBand && prosperityBand.id) {
            switch (prosperityBand.id) {
                case 'thriving':   prosperityColor = 'var(--success)'; break;
                case 'stable':     prosperityColor = 'var(--accent)'; break;
                case 'struggling': prosperityColor = 'var(--danger)'; break;
            }
        }

        var refreshBtn = '<button type="button" data-action="refresh" ' +
            'data-location="' + _escapeHtml(locationId) + '" ' +
            'style="font-size:0.6rem;padding:4px 12px;background:var(--bg3);' +
            'border:1px solid var(--accent);border-radius:4px;cursor:pointer;' +
            'color:var(--accent-light);">' +
            _getIcon('REFRESH') + ' Refresh</button>';

        return '<div style="background:var(--bg2);padding:12px 16px;' +
            'border-radius:8px;margin-bottom:16px;display:flex;' +
            'justify-content:space-between;align-items:center;flex-wrap:wrap;' +
            'gap:8px;border:1px solid var(--border);">' +
            '<div>' +
            '<div style="font-size:0.8rem;font-weight:bold;color:var(--accent-light);">' +
            _getIcon('LOCATION') + ' ' + _escapeHtml(name) + '</div>' +
            '<div style="font-size:0.6rem;color:var(--dim);">' +
            'Rank: ' + (rankName ? _escapeHtml(rankName) : _unknown()) +
            '</div>' +
            '</div>' +
            '<div style="text-align:right;">' +
            '<div style="font-size:0.7rem;color:var(--text);">Prosperity: ' +
            '<span style="color:' + prosperityColor + ';font-weight:bold;">' +
            (prosperityValue === null
                ? _unknown()
                : _escapeHtml(String(prosperityValue)) + '%') +
            '</span></div>' +
            '<div style="font-size:0.55rem;color:var(--dim);">' +
            (prosperityBandName ? _escapeHtml(prosperityBandName) : '') +
            '</div>' +
            '</div>' +
            '</div>' +
            '<div style="display:flex;justify-content:flex-end;' +
            'margin-bottom:16px;">' + refreshBtn + '</div>';
    }

    function _buildWealthDebtRow(context, debtRatio) {
        var summary = context.viewModel || {};
        var wealth = typeof summary.wealth === 'number' ? summary.wealth : null;
        var debt = typeof summary.totalDebt === 'number' ? summary.totalDebt : null;
        var netWorth = (wealth !== null && debt !== null)
            ? wealth - debt
            : null;

        function cell(label, valueHtml, color, iconName) {
            return '<div style="background:var(--bg2);padding:12px;' +
                'border-radius:8px;text-align:center;border:1px solid var(--border);">' +
                '<div style="font-size:0.55rem;color:var(--dim);">' +
                (iconName ? _getIcon(iconName) + ' ' : '') +
                _escapeHtml(label) + '</div>' +
                '<div style="font-size:1.1rem;font-weight:bold;color:' + color + ';">' +
                valueHtml + '</div>' +
                '</div>';
        }

        var wealthColor = (wealth !== null && wealth >= 0)
            ? 'var(--success)' : 'var(--danger)';
        var debtColor = (debt !== null && debt > 0)
            ? 'var(--danger-lt)' : 'var(--success)';
        var netColor = (netWorth !== null && netWorth >= 0)
            ? 'var(--success)' : 'var(--danger)';

        var ratioColor = 'var(--text)';
        if (typeof debtRatio === 'number') {
            if (debtRatio > 50) ratioColor = 'var(--danger)';
            else if (debtRatio > 25) ratioColor = 'var(--warn)';
            else ratioColor = 'var(--success)';
        }

        return '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;' +
            'gap:12px;margin-bottom:16px;">' +
            cell('Wealth', _fmtGold(wealth), wealthColor, 'COIN') +
            cell('Debt', _fmtGold(debt), debtColor, null) +
            cell('Debt Ratio', _fmtPercent(debtRatio), ratioColor, null) +
            cell('Net Worth', _fmtGold(netWorth), netColor, null) +
            '</div>';
    }

    function _buildFiscalPolicySection(context) {
        var summary = context.viewModel || {};
        var locationId = context.locationId;

        function row(label, valueHtml, hint) {
            return '<div style="display:flex;justify-content:space-between;' +
                'padding:6px 0;border-bottom:1px solid var(--border-light);' +
                'align-items:center;">' +
                '<div>' +
                '<div style="font-size:0.65rem;color:var(--text);">' +
                _escapeHtml(label) + '</div>' +
                (hint
                    ? '<div style="font-size:0.5rem;color:var(--dim);">' +
                      _escapeHtml(hint) + '</div>'
                    : '') +
                '</div>' +
                '<div style="font-size:0.75rem;font-weight:bold;color:var(--text);">' +
                valueHtml + '</div>' +
                '</div>';
        }

        var editBtn = '<button type="button" data-action="tax-rates" ' +
            'data-location="' + _escapeHtml(locationId) + '" ' +
            'style="font-size:0.55rem;padding:3px 10px;background:var(--bg3);' +
            'border:1px solid var(--accent);border-radius:4px;cursor:pointer;' +
            'color:var(--accent-light);">' +
            _getIcon('EDIT') + ' Edit</button>';

        return '<div style="background:var(--bg2);padding:12px 16px;' +
            'border-radius:8px;margin-bottom:16px;border:1px solid var(--border);">' +
            '<div style="display:flex;justify-content:space-between;' +
            'align-items:center;margin-bottom:8px;">' +
            '<div style="font-size:0.65rem;color:var(--accent-light);' +
            'font-weight:bold;">' +
            _getIcon('GEAR') + ' Fiscal Policy</div>' +
            editBtn +
            '</div>' +
            row('Tax Rate', _fmtPercent(summary.taxRate),
                'Percent of base tax collected from residents') +
            row('Trade Tariff', _fmtPercent(summary.tradeTariff),
                'Percent added to trade income') +
            row('Industry Tax', _fmtPercent(summary.industryTaxRate),
                'Percent of enterprise profit collected') +
            '</div>';
    }

    function _buildBudgetSection(context) {
        var locationId = context.locationId;

        var budget;
        try {
            budget = _getEconomyQueries().getBudgetSummary(locationId);
        } catch (err) {
            budget = null;
        }

        if (!budget) {
            return '<div style="background:var(--bg2);padding:12px 16px;' +
                'border-radius:8px;margin-bottom:16px;border:1px solid var(--border);">' +
                '<div style="font-size:0.65rem;color:var(--accent-light);' +
                'font-weight:bold;margin-bottom:6px;">' +
                _getIcon('COIN') + ' Annual Budget</div>' +
                '<div style="font-size:0.6rem;color:var(--dim);text-align:center;' +
                'padding:8px 0;">Budget data unavailable.</div>' +
                '</div>';
        }

        var totalIncome = budget.income && typeof budget.income.total === 'number'
            ? budget.income.total : null;
        var totalExpenses = budget.expenses && typeof budget.expenses.total === 'number'
            ? budget.expenses.total : null;
        var surplus = typeof budget.surplus === 'number' ? budget.surplus : null;
        var surplusColor = (surplus !== null && surplus >= 0)
            ? 'var(--success)' : 'var(--danger)';
        var surplusSign = (surplus !== null && surplus > 0) ? '+' : '';

        var openBtn = '<button type="button" data-action="budget" ' +
            'data-location="' + _escapeHtml(locationId) + '" ' +
            'style="font-size:0.55rem;padding:3px 10px;background:var(--bg3);' +
            'border:1px solid var(--border);border-radius:4px;cursor:pointer;' +
            'color:var(--text);">' +
            _getIcon('COIN') + ' Open</button>';

        function stat(label, valueHtml, color) {
            return '<div style="background:var(--bg);padding:8px;' +
                'border-radius:6px;text-align:center;' +
                'border:1px solid var(--border-light);">' +
                '<div style="font-size:0.5rem;color:var(--dim);">' +
                _escapeHtml(label) + '</div>' +
                '<div style="font-size:0.9rem;font-weight:bold;color:' +
                (color || 'var(--text)') + ';">' +
                valueHtml + '</div>' +
                '</div>';
        }

        return '<div style="background:var(--bg2);padding:12px 16px;' +
            'border-radius:8px;margin-bottom:16px;border:1px solid var(--border);">' +
            '<div style="display:flex;justify-content:space-between;' +
            'align-items:center;margin-bottom:8px;">' +
            '<div style="font-size:0.65rem;color:var(--accent-light);' +
            'font-weight:bold;">' +
            _getIcon('COIN') + ' Annual Budget</div>' +
            openBtn +
            '</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;' +
            'gap:12px;margin-bottom:10px;">' +
            stat('Total Income', _fmtGold(totalIncome), 'var(--success)') +
            stat('Total Expenses', _fmtGold(totalExpenses), 'var(--danger)') +
            stat('Surplus', surplusSign + _fmtGold(surplus), surplusColor) +
            '</div>' +
            _buildBudgetBreakdown(budget) +
            '</div>';
    }

    function _buildBudgetBreakdown(budget) {
        if (!budget || !budget.income || !budget.expenses) return '';

        var incomeItems = [
            { key: 'taxes',             label: 'Taxes' },
            { key: 'trade',             label: 'Trade Tariffs' },
            { key: 'industry',          label: 'Industry Tax' },
            { key: 'stateEnterprises',  label: 'State Enterprises' },
            { key: 'publicEnterprises', label: 'Public Enterprises' }
        ];
        var expenseItems = [
            { key: 'maintenance',         label: 'Maintenance' },
            { key: 'wages',               label: 'Wages' },
            { key: 'military',            label: 'Military' },
            { key: 'infrastructure',      label: 'Infrastructure' },
            { key: 'education',           label: 'Education' },
            { key: 'governmentSalaries',  label: 'Gov Salaries' }
        ];

        function list(items, source, accent) {
            var html = '<div style="background:var(--bg);padding:8px;' +
                'border-radius:4px;border:1px solid var(--border-light);">' +
                '<div style="color:' + accent + ';font-weight:bold;' +
                'margin-bottom:4px;font-size:0.55rem;">' +
                _escapeHtml(source === 'income' ? 'Income' : 'Expenses') +
                '</div>';

            for (var i = 0; i < items.length; i++) {
                var item = items[i];
                var value = source === 'income'
                    ? budget.income[item.key]
                    : budget.expenses[item.key];
                html += '<div style="display:flex;justify-content:space-between;' +
                    'padding:2px 0;border-bottom:1px solid var(--border-light);' +
                    'font-size:0.55rem;">' +
                    '<span style="color:var(--dim);">' +
                    _escapeHtml(item.label) + '</span>' +
                    '<span style="color:var(--text);">' +
                    _fmtGold(value) + '</span>' +
                    '</div>';
            }

            html += '</div>';
            return html;
        }

        return '<div style="display:grid;grid-template-columns:1fr 1fr;' +
            'gap:12px;font-size:0.55rem;">' +
            list(incomeItems, 'income', 'var(--success)') +
            list(expenseItems, 'expenses', 'var(--danger)') +
            '</div>';
    }

    function _buildEmploymentSection(context) {
        var locationId = context.locationId;
        var EQ = _getEmploymentQueries();
        if (!EQ || typeof EQ.getEmployment !== 'function') return '';

        var employment;
        try {
            employment = EQ.getEmployment(locationId);
        } catch (err) {
            return '';
        }
        if (!employment) return '';

        var openBtn = '<button type="button" data-action="employment" ' +
            'data-location="' + _escapeHtml(locationId) + '" ' +
            'style="font-size:0.55rem;padding:3px 10px;background:var(--bg3);' +
            'border:1px solid var(--border);border-radius:4px;cursor:pointer;' +
            'color:var(--text);">' +
            _getIcon('PERSON') + ' Details</button>';

        var rateColor = 'var(--danger)';
        if (typeof employment.employmentRate === 'number') {
            if (employment.employmentRate >= 70) rateColor = 'var(--success)';
            else if (employment.employmentRate >= 40) rateColor = 'var(--warn)';
        }

        function stat(label, valueHtml, color) {
            return '<div style="background:var(--bg);padding:6px;' +
                'border-radius:4px;text-align:center;' +
                'border:1px solid var(--border-light);">' +
                '<div style="font-size:0.45rem;color:var(--dim);">' +
                _escapeHtml(label) + '</div>' +
                '<div style="font-size:0.8rem;font-weight:bold;color:' +
                (color || 'var(--text)') + ';">' +
                valueHtml + '</div>' +
                '</div>';
        }

        return '<div style="background:var(--bg2);padding:12px 16px;' +
            'border-radius:8px;margin-bottom:16px;border:1px solid var(--border);">' +
            '<div style="display:flex;justify-content:space-between;' +
            'align-items:center;margin-bottom:6px;">' +
            '<div style="font-size:0.65rem;color:var(--accent-light);' +
            'font-weight:bold;">' +
            _getIcon('PERSON') + ' Employment</div>' +
            openBtn +
            '</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;' +
            'gap:8px;">' +
            stat('Workers', _fmtNumber(employment.totalEmployed)) +
            stat('Unemployed', _fmtNumber(employment.unemployed),
                employment.unemployed > 0 ? 'var(--danger-lt)' : 'var(--success)') +
            stat('Rate', _fmtPercent(employment.employmentRate), rateColor) +
            stat('Avg Wage', _fmtGold(employment.averageWage)) +
            '</div>' +
            '</div>';
    }

    function _buildActionButtons(locationId) {
        function btn(action, label, iconName, opts) {
            opts = opts || {};
            var style = 'font-size:0.6rem;padding:4px 12px;' +
                'background:var(--bg3);border:1px solid ' +
                (opts.accent ? 'var(--accent)' : 'var(--border)') + ';' +
                'border-radius:4px;cursor:pointer;color:' +
                (opts.accent ? 'var(--accent-light)' : 'var(--text)') + ';';
            return '<button type="button" data-action="' + _escapeHtml(action) + '" ' +
                'data-location="' + _escapeHtml(locationId) + '" ' +
                'style="' + style + '">' +
                (iconName ? _getIcon(iconName) + ' ' : '') +
                _escapeHtml(label) + '</button>';
        }

        return '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px;">' +
            btn('tax-rates', 'Fiscal Policy', 'GEAR') +
            btn('spending', 'Spending', 'COIN') +
            btn('budget', 'Budget', 'COIN') +
            btn('justice', 'Justice', 'SHIELD') +
            btn('debt', 'Debt', 'COIN') +
            btn('report', 'Report', 'CIRCLE_DOT') +
            btn('efficiency', 'Efficiency', 'STAR_4') +
            btn('employment', 'Employment', 'PERSON') +
            btn('state-enterprises', 'State Enterprises', 'GEAR') +
            '</div>';
    }

    function _buildFooter() {
        return '<div style="padding:8px;background:var(--bg3);border-radius:6px;' +
            'font-size:0.55rem;color:var(--dim);">' +
            _getIcon('CIRCLE_DOT') + ' ' +
            'Fiscal policy and budgets are edited through the modals. ' +
            'Spending is set by the annual budget flow and is not editable here. ' +
            'Debt repayment goes through the debt modal, which uses one atomic ' +
            'transaction for wealth and debt.</div>';
    }

    // =========================================================================
    // 5. RENDER
    // =========================================================================

    /**
     * Renders the economy tab into the container.
     *
     * @param {HTMLElement} container
     * @param {Object} context  { locationId, data, viewModel }
     */
    function renderSettlementEconomy(container, context) {
        if (!container) {
            throw new Error(
                'settlement-economy-tab: container is required'
            );
        }
        if (!context || !context.locationId) {
            throw new Error(
                'settlement-economy-tab: context.locationId is required'
            );
        }

        var locationId = context.locationId;

        // debtRatio is derived from the two canonical balances via
        // the economy query. It may be null (settlement missing, or one
        // of the two balances non-finite); the renderer treats null as
        // "unknown" and does not guess.
        var debtRatio;
        try {
            debtRatio = _getEconomyQueries().getDebtRatio(locationId);
        } catch (err) {
            debtRatio = null;
        }

        var html = '<div style="padding:4px;">' +
            _buildHeader(context) +
            _buildWealthDebtRow(context, debtRatio) +
            _buildFiscalPolicySection(context) +
            _buildBudgetSection(context) +
            _buildEmploymentSection(context) +
            _buildActionButtons(locationId) +
            _buildFooter() +
            '</div>';

        container.innerHTML = html;
        _wireActions(container, locationId);
    }

    // =========================================================================
    // 6. REGISTRATION
    // =========================================================================

    function _register() {
        var tabs = _getTabs();
        if (!tabs || typeof tabs.registerTabRenderer !== 'function') {
            throw new Error(
                'settlement-economy-tab: SettlementTabs is missing. ' +
                'Load settlement-tabs.js before this tab.'
            );
        }
        tabs.registerTabRenderer('economy', renderSettlementEconomy);
    }

    _register();

    // =========================================================================
    // 7. EXPORTS
    // =========================================================================

    window.renderSettlementEconomy = renderSettlementEconomy;
    window._renderSettlementEconomy = renderSettlementEconomy;

})();
