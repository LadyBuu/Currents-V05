/**
 * =============================================================================
 * SETTLEMENT ECONOMY TAB
 * js/tabs/settlement-economy-tab.js
 * =============================================================================
 *
 * Renders the settlement fiscal snapshot (wealth, debt, tax rates,
 * budgets, income, expenses, surplus, employment) and hosts actions
 * that open the economy modals for detailed editing.
 *
 * RENDERER CONTRACT:
 *   fn(container, context) with context = { locationId, data, viewModel }
 *
 * DATA SOURCES:
 *   - context.viewModel (SettlementViewModels.buildSettlementSummary)
 *   - SettlementEconomyQueries.getBudgetSummary
 *   - SettlementEconomyQueries.getDebtRatio
 *   - SettlementEmploymentQueries.getEmployment
 *
 * FISCAL SEMANTICS:
 *   Tax rate, trade tariff, and industry tax rate are canonical policy
 *   fields edited via SettlementFiscalCommands.updateFiscalPolicy (called
 *   by the tax modal). Budgets are policy fields edited via
 *   SettlementFiscalCommands.setBudgetAllocation. Spending is written by
 *   the annual budget-decision flow — this tab displays it read-only.
 *   Debt and wealth are independent balances (§18); repayment goes
 *   through the debt modal only.
 *
 * ACTION DELEGATION:
 *   Every mutating button opens a modal. No action on this tab calls a
 *   command directly.
 *
 * NO CSS. Class-only rendering.
 * =============================================================================
 */

(function () {
    'use strict';

    var TAB_ID = 'economy';
    var SCOPE  = 'settlement';

    function H() { return window.SettlementTabHelpers; }
    function esc(v)        { return H().esc(v); }
    function icon(n)       { return H().icon(n); }
    function fmtNum(v)     { return H().fmtNumber(v); }
    function fmtGold(v)    { return H().fmtGold(v); }
    function fmtPercent(v) { return H().fmtPercent(v); }
    function unknown()     { return H().unknown(); }
    function refresh()     { H().requestRefresh(SCOPE, TAB_ID); }

    function _getEconomyQueries()    { return window.SettlementEconomyQueries; }
    function _getEmploymentQueries() { return window.SettlementEmploymentQueries; }
    function _getPlaceQueries()      { return window.PlaceQueries; }

    function _placeName(locationId) {
        var pq = _getPlaceQueries();
        if (!pq || typeof pq.getPlaceById !== 'function') return null;
        var place = pq.getPlaceById(locationId);
        return place ? (place.displayName || place.name || null) : null;
    }

    function _openCoreModal(name, args) {
        var bundle = window.SettlementModals;
        if (!bundle || typeof bundle[name] !== 'function') {
            H().toast('Modal "' + name + '" is not available.', 'error');
            return;
        }
        try { bundle[name].apply(bundle, args || []); }
        catch (e) {
            if (typeof console !== 'undefined' && console.error) {
                console.error('settlement-economy-tab: modal threw:', e);
            }
            H().toast('Could not open modal.', 'error');
        }
    }

    function _openEconomyModal(name, args) {
        var bundle = window.SettlementEconomyModals;
        if (!bundle || typeof bundle[name] !== 'function') {
            H().toast('Modal "' + name + '" is not available.', 'error');
            return;
        }
        try { bundle[name].apply(bundle, args || []); }
        catch (e) {
            if (typeof console !== 'undefined' && console.error) {
                console.error('settlement-economy-tab: modal threw:', e);
            }
            H().toast('Could not open modal.', 'error');
        }
    }

    // -------------------------------------------------------------------
    // Header
    // -------------------------------------------------------------------

    function _buildHeader(context) {
        var s = context.viewModel || {};
        var name = s.name ? s.name : (_placeName(context.locationId) || '(unnamed location)');
        var rankName = s.rank ? s.rank.name : null;
        var prosperity = s.prosperity;
        var prosperityValue = (prosperity && typeof prosperity.value === 'number')
            ? prosperity.value : null;
        var prosperityBand = prosperity ? prosperity.band : null;
        var prosperityBandName = prosperityBand ? prosperityBand.name : null;

        var prosperityClass = 'st-stat__value';
        if (prosperityBand && prosperityBand.id) {
            if (prosperityBand.id === 'thriving') prosperityClass += ' st-stat__value--pos';
            else if (prosperityBand.id === 'struggling') prosperityClass += ' st-stat__value--neg';
            else prosperityClass += ' st-stat__value--accent';
        }

        return '<div class="st-header">' +
            '<div>' +
            '<div class="st-header__title">' + icon('LOCATION') + ' ' + esc(name) + '</div>' +
            '<div class="st-header__subtitle">Rank: ' +
                (rankName ? esc(rankName) : unknown()) + '</div>' +
            '</div>' +
            '<div>' +
            '<div class="st-inline">' +
                '<span class="st-inline__label">Prosperity</span>' +
                '<span class="' + prosperityClass + '">' +
                (prosperityValue === null
                    ? unknown()
                    : esc(String(prosperityValue)) + '%') +
                '</span>' +
            '</div>' +
            (prosperityBandName
                ? '<div class="st-header__subtitle">' +
                  esc(prosperityBandName) + '</div>'
                : '') +
            '</div>' +
            '</div>';
    }

    // -------------------------------------------------------------------
    // Wealth / debt / net worth / debt ratio
    // -------------------------------------------------------------------

    function _buildWealthDebtRow(context, debtRatio) {
        var s = context.viewModel || {};
        var wealth = typeof s.wealth === 'number' ? s.wealth : null;
        var debt = typeof s.totalDebt === 'number' ? s.totalDebt : null;
        var netWorth = (wealth !== null && debt !== null) ? wealth - debt : null;

        var wealthClass = 'st-stat__value';
        if (wealth !== null) {
            wealthClass += wealth >= 0 ? ' st-stat__value--pos' : ' st-stat__value--neg';
        }
        var debtClass = 'st-stat__value';
        if (debt !== null) {
            debtClass += debt > 0 ? ' st-stat__value--neg' : ' st-stat__value--pos';
        }
        var netClass = 'st-stat__value';
        if (netWorth !== null) {
            netClass += netWorth >= 0 ? ' st-stat__value--pos' : ' st-stat__value--neg';
        }
        var ratioClass = 'st-stat__value';
        if (typeof debtRatio === 'number') {
            if (debtRatio > 50) ratioClass += ' st-stat__value--neg';
            else if (debtRatio > 25) ratioClass += ' st-stat__value--warn';
            else ratioClass += ' st-stat__value--pos';
        }

        function cell(label, valueHtml, cls, ic) {
            return '<div class="st-stat">' +
                '<div class="st-stat__label">' +
                (ic ? icon(ic) + ' ' : '') + esc(label) + '</div>' +
                '<div class="' + cls + '">' + valueHtml + '</div>' +
                '</div>';
        }

        return '<div class="st-stats">' +
            cell('Wealth', fmtGold(wealth), wealthClass, 'COIN') +
            cell('Debt', fmtGold(debt), debtClass, null) +
            cell('Debt Ratio', fmtPercent(debtRatio), ratioClass, null) +
            cell('Net Worth', fmtGold(netWorth), netClass, null) +
            '</div>';
    }

    // -------------------------------------------------------------------
    // Fiscal policy (read-only; edit via modal)
    // -------------------------------------------------------------------

    function _buildFiscalPolicySection(context) {
        var s = context.viewModel || {};
        var locationId = context.locationId;

        function row(label, valueHtml, hint) {
            return '<div class="st-inline">' +
                '<div>' +
                '<div class="st-inline__label">' + esc(label) + '</div>' +
                (hint
                    ? '<div class="st-row__meta">' + esc(hint) + '</div>'
                    : '') +
                '</div>' +
                '<div class="st-inline__value">' + valueHtml + '</div>' +
                '</div>';
        }

        var editBtn = '<button type="button" class="st-btn st-btn--accent" ' +
            'data-action="tax-rates">' +
            icon('EDIT') + ' Edit</button>';

        return '<div class="st-section">' +
            '<div class="st-section__title">' +
            icon('GEAR') + ' Fiscal Policy' +
            '<span style="flex:1;"></span>' + editBtn +
            '</div>' +
            '<div class="st-section__body">' +
            row('Tax Rate', fmtPercent(s.taxRate),
                'Percent of base tax collected from residents') +
            row('Trade Tariff', fmtPercent(s.tradeTariff),
                'Percent added to trade income') +
            row('Industry Tax', fmtPercent(s.industryTaxRate),
                'Percent of enterprise profit collected') +
            '</div>' +
            '</div>';
    }

    // -------------------------------------------------------------------
    // Budget summary
    // -------------------------------------------------------------------

    function _buildBudgetSection(context) {
        var locationId = context.locationId;
        var budget;
        try { budget = _getEconomyQueries().getBudgetSummary(locationId); }
        catch (e) { budget = null; }

        if (!budget) {
            return '<div class="st-section">' +
                '<div class="st-section__title">' +
                icon('COIN') + ' Annual Budget</div>' +
                '<div class="st-section__empty">Budget data unavailable.</div>' +
                '</div>';
        }

        var totalIncome = budget.income && typeof budget.income.total === 'number'
            ? budget.income.total : null;
        var totalExpenses = budget.expenses && typeof budget.expenses.total === 'number'
            ? budget.expenses.total : null;
        var surplus = typeof budget.surplus === 'number' ? budget.surplus : null;

        var surplusClass = 'st-stat__value';
        if (surplus !== null) {
            surplusClass += surplus >= 0
                ? ' st-stat__value--pos'
                : ' st-stat__value--neg';
        }
        var surplusSign = (surplus !== null && surplus > 0) ? '+' : '';

        var openBtn = '<button type="button" class="st-btn" ' +
            'data-action="budget">' +
            icon('COIN') + ' Open</button>';

        function stat(label, valueHtml, cls) {
            return '<div class="st-stat">' +
                '<div class="st-stat__label">' + esc(label) + '</div>' +
                '<div class="' + cls + '">' + valueHtml + '</div>' +
                '</div>';
        }

        var breakdown = _buildBudgetBreakdown(budget);

        return '<div class="st-section">' +
            '<div class="st-section__title">' +
            icon('COIN') + ' Annual Budget' +
            '<span style="flex:1;"></span>' + openBtn +
            '</div>' +
            '<div class="st-stats st-stats--3">' +
            stat('Total Income', fmtGold(totalIncome), 'st-stat__value st-stat__value--pos') +
            stat('Total Expenses', fmtGold(totalExpenses), 'st-stat__value st-stat__value--neg') +
            stat('Surplus', surplusSign + fmtGold(surplus), surplusClass) +
            '</div>' +
            '<div class="st-section__body">' + breakdown + '</div>' +
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

        function list(items, source) {
            var html = '<div class="st-row">' +
                '<div class="st-row__body">' +
                '<div class="st-row__title">' +
                esc(source === 'income' ? 'Income' : 'Expenses') +
                '</div>';
            for (var i = 0; i < items.length; i++) {
                var item = items[i];
                var value = source === 'income'
                    ? budget.income[item.key]
                    : budget.expenses[item.key];
                html += '<div class="st-inline">' +
                    '<span class="st-inline__label">' + esc(item.label) + '</span>' +
                    '<span class="st-inline__value">' + fmtGold(value) + '</span>' +
                    '</div>';
            }
            html += '</div></div>';
            return html;
        }

        return '<div class="st-stats st-stats--2">' +
            list(incomeItems, 'income') +
            list(expenseItems, 'expenses') +
            '</div>';
    }

    // -------------------------------------------------------------------
    // Employment
    // -------------------------------------------------------------------

    function _buildEmploymentSection(context) {
        var locationId = context.locationId;
        var EQ = _getEmploymentQueries();
        if (!EQ || typeof EQ.getEmployment !== 'function') return '';

        var employment;
        try { employment = EQ.getEmployment(locationId); }
        catch (e) { return ''; }
        if (!employment) return '';

        var detailsBtn = '<button type="button" class="st-btn" ' +
            'data-action="employment">' +
            icon('PERSON') + ' Details</button>';

        var rateClass = 'st-stat__value';
        if (typeof employment.employmentRate === 'number') {
            if (employment.employmentRate >= 70) rateClass += ' st-stat__value--pos';
            else if (employment.employmentRate >= 40) rateClass += ' st-stat__value--warn';
            else rateClass += ' st-stat__value--neg';
        }

        var unempClass = 'st-stat__value' +
            (employment.unemployed > 0 ? ' st-stat__value--neg' : ' st-stat__value--pos');

        function stat(label, valueHtml, cls) {
            return '<div class="st-stat">' +
                '<div class="st-stat__label">' + esc(label) + '</div>' +
                '<div class="' + cls + '">' + valueHtml + '</div>' +
                '</div>';
        }

        return '<div class="st-section">' +
            '<div class="st-section__title">' +
            icon('PERSON') + ' Employment' +
            '<span style="flex:1;"></span>' + detailsBtn +
            '</div>' +
            '<div class="st-stats">' +
            stat('Workers', fmtNum(employment.totalEmployed), 'st-stat__value') +
            stat('Unemployed', fmtNum(employment.unemployed), unempClass) +
            stat('Rate', fmtPercent(employment.employmentRate), rateClass) +
            stat('Avg Wage', fmtGold(employment.averageWage), 'st-stat__value') +
            '</div>' +
            '</div>';
    }

    // -------------------------------------------------------------------
    // Actions
    // -------------------------------------------------------------------

    function _buildActionButtons() {
        function btn(action, label, iconName, accent) {
            return '<button type="button" class="st-btn' +
                (accent ? ' st-btn--accent' : '') + '" data-action="' +
                esc(action) + '">' +
                (iconName ? icon(iconName) + ' ' : '') +
                esc(label) + '</button>';
        }
        return '<div class="st-header__actions">' +
            btn('tax-rates', 'Fiscal Policy', 'GEAR', true) +
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
        return '<div class="st-footer">' + icon('CIRCLE_DOT') +
            ' <span>Fiscal policy and budgets are edited through the modals. ' +
            'Spending is set by the annual budget flow and is not editable ' +
            'here. Debt repayment goes through the debt modal, which uses ' +
            'one atomic transaction for wealth and debt.</span></div>';
    }

    // -------------------------------------------------------------------
    // Action handlers
    // -------------------------------------------------------------------

    function _handleAction(action, locationId) {
        switch (action) {
            case 'refresh':
                refresh();
                return;
            case 'tax-rates':
                _openEconomyModal('openTaxRateModal', [locationId]);
                return;
            case 'spending':
                _openEconomyModal('openSpendingModal', [locationId]);
                return;
            case 'budget':
                _openCoreModal('openBudgetModal', [locationId]);
                return;
            case 'justice':
                _openEconomyModal('openJusticeModal', [locationId]);
                return;
            case 'debt':
                _openEconomyModal('openDebtManagementModal', [locationId]);
                return;
            case 'report':
                _openEconomyModal('openFinancialReportModal', [locationId]);
                return;
            case 'efficiency':
                _openEconomyModal('openEfficiencyModal', [locationId]);
                return;
            case 'employment':
                _openCoreModal('openEmploymentModal', [locationId]);
                return;
            case 'state-enterprises':
                _openCoreModal('openStateEnterpriseModal', [locationId]);
                return;
            default:
                return;
        }
    }

    function _wireActions(container, locationId) {
        if (container.__stEconomyWired) return;
        container.__stEconomyWired = true;
        container.addEventListener('click', function (event) {
            var btn = event.target.closest('[data-action]');
            if (!btn || !container.contains(btn)) return;
            event.preventDefault();
            _handleAction(btn.dataset.action, locationId);
        });
    }

    // -------------------------------------------------------------------
    // Renderer
    // -------------------------------------------------------------------

    function renderSettlementEconomy(container, context) {
        if (!container) return;
        if (!context || !context.locationId) {
            container.innerHTML = H().emptyState('no-context');
            return;
        }

        var locationId = context.locationId;

        var debtRatio;
        try { debtRatio = _getEconomyQueries().getDebtRatio(locationId); }
        catch (e) { debtRatio = null; }

        var html = '<div class="st-tab">' +
            _buildHeader(context) +
            _buildWealthDebtRow(context, debtRatio) +
            _buildFiscalPolicySection(context) +
            _buildBudgetSection(context) +
            _buildEmploymentSection(context) +
            _buildActionButtons() +
            _buildFooter() +
            '</div>';

        container.innerHTML = html;
        _wireActions(container, locationId);
    }

    // -------------------------------------------------------------------
    // Registration
    // -------------------------------------------------------------------

    if (window.TabManager && typeof window.TabManager.register === 'function') {
        window.TabManager.register(SCOPE, TAB_ID, renderSettlementEconomy);
    } else if (typeof console !== 'undefined' && console.warn) {
        console.warn(
            'settlement-economy-tab: TabManager is not available at load ' +
            'time; the tab was not registered.'
        );
    }

    window.renderSettlementEconomy = renderSettlementEconomy;

})();
