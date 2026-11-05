// js/households/household-economy-tab.js
/**
 * =============================================================================
 * HOUSEHOLD ECONOMY TAB
 * js/households/household-economy-tab.js
 * =============================================================================
 *
 * LOCATION: js/households/household-economy-tab.js
 *
 * WHAT THIS TAB SHOWS
 * -------------------
 * The household's economic snapshot plus mutating actions:
 *
 *   - wealth / debt / tier stat strip
 *   - food / livestock / goods stat strip
 *   - annual income / annual expenses / net change
 *   - enterprise profit summary (when the household owns enterprises)
 *   - header action row: Manage Wealth, Manage Resources, Income,
 *     Expenses, Process Year
 *
 * READS
 * -----
 *   HouseholdQueries.getHousehold               — flat projection
 *   HouseholdQueries.getHouseholdEnterpriseSummaries
 *   HouseholdQueries.getHouseholdEnterpriseStats
 *   HouseholdQueries.getHouseholdEnterpriseValue
 *   HouseholdEconomy.getHouseholdWealth
 *   HouseholdEconomy.getHouseholdDebt
 *   HouseholdEconomy.getHouseholdResources
 *   HouseholdEconomy.getEconomicTier
 *   HouseholdEconomy.calculateAnnualIncome
 *   HouseholdEconomy.calculateAnnualExpenses
 *   HouseholdEconomy.getSalaryIncome
 *   HouseholdEconomy.getTuitionExpenses
 *   HouseholdEconomy.calculateRentIncome / calculateRentExpenses
 *       (via calculateAnnualIncome / calculateAnnualExpenses; the tab
 *        does not call them directly)
 *
 * WRITES
 * ------
 *   Every mutation is an inline modal routing through HouseholdEconomy,
 *   which internally routes through HouseholdCommands and persists:
 *
 *     Manage Wealth       → updateHouseholdWealth / modifyHouseholdDebt
 *     Manage Resources    → updateHouseholdResources
 *     Process Year        → processAnnualEconomy
 *
 *   The tab does NOT call HouseholdCommands.persist() or
 *   HouseholdEconomy.persist() (the latter does not exist — economy's
 *   own write primitives call HouseholdCommands.persist internally).
 *
 *   Income and Expenses are read-only projection modals. They do not
 *   write anything.
 *
 * RENDERER CONTRACT (from HouseholdManagerBootstrap)
 *   fn(container, context)
 *   container  HTMLElement  — already emptied by TabManager
 *   context    { householdId, householdName, householdState }
 *
 * FILTERS
 * -------
 *   None. This tab is a fixed snapshot, not a list.
 *
 * DEPENDENCIES (all resolved via HouseholdTabRuntime)
 *   REQUIRED at render:
 *     - HouseholdQueries
 *     - HouseholdEconomy (reports a failure state if missing — see
 *       REFACTOR HISTORY)
 *     - formatting.js (escapeHtml — strict via TabRuntime.esc)
 *     - time.js (getCurrentYear — via TabRuntime.requireCurrentYear)
 *     - TabManager (for registration; warn if absent)
 *   OPTIONAL at render:
 *     - IndustryQueries / IndustryState (enterprise section degrades
 *       to "no enterprises" when the household owns none, which is a
 *       legitimate state, not an error)
 *
 * TIME CONTRACT: uses TabRuntime.requireCurrentYear(). No fallback.
 * ICON POLICY: icons via TabRuntime.icon().
 * THEME CONTRACT: no hardcoded hex/rgba. Classes from household-tabs.css.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   v2 (this revision):
 *     - Rewritten to the Tab/Manager Development Playbook, using
 *       Education Manager as the reference.
 *     - All shared helpers come from HouseholdTabRuntime.
 *     - HOUSEHOLDECONOMY IS NOW A REQUIRED DEPENDENCY. The prior
 *       revision carried a set of inline fallbacks for every economy
 *       operation, all of which diverged from the canonical modules:
 *
 *         _calculateAnnualIncome      computed 50 + (members-1)*10,
 *                                     which shadows the canonical
 *                                     calculation (which reads member
 *                                     professions, enterprise profit,
 *                                     rent income, and tracked salaries
 *                                     for the year).
 *         _calculateAnnualExpenses    computed 20 + members*5 + staff*3,
 *                                     which shadows the canonical
 *                                     calculation (which reads explicit
 *                                     expenses, staff wages, private
 *                                     enterprise loss, rent expenses,
 *                                     tuition, and debt interest).
 *         _getEconomicTier            used thresholds >1000 / >500 /
 *                                     >200 / >120 / >70 / >30 / >10,
 *                                     which DIVERGE from
 *                                     HouseholdConstants.ECONOMIC_TIERS
 *                                     (VERY_NOBLE: 501-1000,
 *                                     ROYAL: 1001+; the tab's >1000
 *                                     boundary disagreed with the
 *                                     canonical 1001 boundary, so a
 *                                     household at exactly 1000 was
 *                                     ROYAL by the tab and VERY_NOBLE
 *                                     by the canonical rules).
 *         _processAnnualEconomy       mutated household.wealth directly,
 *                                     bypassing HouseholdCommands,
 *                                     the field allowlist, accessor
 *                                     cache invalidation, and
 *                                     persistence. The mutation was
 *                                     visible in memory but did not
 *                                     survive a reload, and the accessor
 *                                     cache returned the stale wealth
 *                                     until a full reload.
 *         _getSalaryIncome,
 *         _getTuitionExpenses         returned 0 when the economy
 *                                     module was missing, silently
 *                                     showing wrong numbers.
 *
 *       The new tab treats HouseholdEconomy as required. When it is
 *       missing, the tab renders a failure state naming the missing
 *       file. No divergent calculations. No silent zero.
 *
 *     - The local cache (_cachedData / _cacheHouseholdId /
 *       _invalidateEconomyCache) is gone. The tab re-reads from the
 *       canonical modules on every render. A mutation triggers a
 *       re-render through the success callback; TabRuntime.runExclusive
 *       guards re-entry. Sidebar refresh is explicit in each success
 *       callback (window.refreshHouseholdList).
 *
 *     - Reads go through HouseholdQueries (via TabRuntime sugar). The
 *       prior revision called non-existent HouseholdState methods
 *       (HS.getHousehold, HS.getHouseholdWealth,
 *       HS.getHouseholdMembersWithCharacters) and threw at render.
 *
 *     - Registration via TabRuntime.register('economy', render). The
 *       prior revision called the non-existent
 *       window.registerTabRenderer three-arg form.
 *
 *     - Zero document.* calls. Zero hardcoded colors. Zero setTimeout.
 *       Zero 1250 fallback.
 * =============================================================================
 */

(function () {
    'use strict';

    var T = window.HouseholdTabRuntime;
    if (!T) {
        throw new Error(
            'household-economy-tab: HouseholdTabRuntime must load first. ' +
            'Load js/households/household-tab-runtime.js before this tab.'
        );
    }

    // =========================================================================
    // 1. CONSTANTS
    // =========================================================================

    var TAB_ID = 'economy';
    var SCOPE  = T.SCOPE; // 'households'

    var _renderGuard = { busy: false };

    // =========================================================================
    // 2. DATA
    // =========================================================================
    //
    // ONE read pass. Every downstream renderer reads from this flat
    // shape. The `error` field carries structured failure (missing
    // HouseholdEconomy, missing time.js, household not found) so the
    // entry point can render a single failure state instead of a
    // half-rendered tab.

    function _collect(householdId) {
        var summary = T.getHousehold(householdId);
        if (!summary) return { error: 'Household not found.' };

        var year;
        try { year = T.requireCurrentYear(); }
        catch (e) {
            return {
                error: 'Current year unavailable: ' +
                    (e && e.message ? e.message : 'time.js missing')
            };
        }

        var HE = T.economy();
        if (!HE) {
            return {
                error:
                    'HouseholdEconomy is not loaded. The economy tab has ' +
                    'no canonical calculation source without it. ' +
                    'Load js/households/household-economy.js.'
            };
        }

        // Core numbers. Every one is a canonical read; none are computed
        // inline.
        var wealth, debt, resources, tier;
        var income, expenses;
        var salaryIncome = 0;
        var tuition = 0;
        try {
            wealth = HE.getHouseholdWealth(householdId);
            debt = HE.getHouseholdDebt(householdId);
            resources = HE.getHouseholdResources(householdId);
            tier = HE.getEconomicTier(wealth);
            income = HE.calculateAnnualIncome(householdId, { year: year });
            expenses = HE.calculateAnnualExpenses(householdId, { year: year });
            if (typeof HE.getSalaryIncome === 'function') {
                salaryIncome = HE.getSalaryIncome(householdId, year) || 0;
            }
            if (typeof HE.getTuitionExpenses === 'function') {
                tuition = HE.getTuitionExpenses(householdId, year) || 0;
            }
        } catch (e) {
            return {
                error: 'Could not read economy figures: ' +
                    (e && e.message ? e.message : 'unknown error')
            };
        }

        if (!resources) resources = { food: 0, livestock: 0, goods: 0 };
        var net = income - expenses;

        // Enterprise section — reads are soft. HouseholdQueries throws
        // when the household has enterprises but Industry is not
        // loaded. The section degrades to "no enterprises" in that
        // case, which is visible as an empty section rather than a
        // failure of the whole tab.
        var enterpriseSummaries = [];
        var enterpriseStats = null;
        var enterpriseValue = 0;
        try {
            enterpriseSummaries = T.queries().getHouseholdEnterpriseSummaries(householdId) || [];
        } catch (e) { enterpriseSummaries = []; }
        try {
            enterpriseStats = T.queries().getHouseholdEnterpriseStats(householdId);
        } catch (e) { enterpriseStats = null; }
        try {
            enterpriseValue = T.queries().getHouseholdEnterpriseValue(householdId) || 0;
        } catch (e) { enterpriseValue = 0; }

        return {
            household: summary,
            wealth: wealth,
            debt: debt,
            resources: resources,
            tier: tier,
            income: income,
            expenses: expenses,
            net: net,
            salaryIncome: salaryIncome,
            tuition: tuition,
            enterpriseSummaries: enterpriseSummaries,
            enterpriseStats: enterpriseStats,
            enterpriseValue: enterpriseValue,
            year: year
        };
    }

    // =========================================================================
    // 3. RENDER
    // =========================================================================

    function _renderBody(d) {
        return '' +
            '<div class="hh-tab">' +
                _renderHeader(d) +
                _renderWealthRow(d) +
                _renderResourcesRow(d) +
                _renderIncomeExpenseRow(d) +
                _renderEnterpriseSection(d) +
                _renderActions() +
                '<div class="hh-tab-footer">Data for year ' +
                    T.esc(String(d.year)) +
                '</div>' +
            '</div>';
    }

    function _renderHeader(d) {
        return '' +
            '<div class="hh-tab-header">' +
                '<div>' +
                    '<h3 class="hh-tab-title">' +
                        T.iconSpan('COIN', 'Economy') + ' Economic Summary' +
                    '</h3>' +
                    '<div class="hh-overview-subtitle">' +
                        T.esc(d.household.name) +
                    '</div>' +
                '</div>' +
            '</div>';
    }

    function _renderWealthRow(d) {
        var wealthColor = d.wealth >= 0 ? 'var(--success)' : 'var(--danger)';
        var debtColor = d.debt > 0 ? 'var(--warn)' : null;
        var tierLabel = d.tier ? d.tier.label : '—';

        return '' +
            '<div class="hh-econ-grid hh-econ-grid-3">' +
                T.statCell('Wealth', d.wealth + 'g', wealthColor) +
                T.statCell('Debt', d.debt + 'g', debtColor) +
                T.statCell('Tier', tierLabel) +
            '</div>';
    }

    function _renderResourcesRow(d) {
        return '' +
            '<div class="hh-econ-grid hh-econ-grid-3">' +
                T.statCell('Food', d.resources.food || 0) +
                T.statCell('Livestock', d.resources.livestock || 0) +
                T.statCell('Goods', d.resources.goods || 0) +
            '</div>';
    }

    function _renderIncomeExpenseRow(d) {
        var netColor = d.net >= 0 ? 'var(--success)' : 'var(--warn)';

        return '' +
            '<div class="hh-econ-grid hh-econ-grid-2">' +
                T.statCell('Annual Income', '+' + d.income + 'g', 'var(--success)') +
                T.statCell('Annual Expenses', '−' + d.expenses + 'g', 'var(--warn)') +
            '</div>' +
            '<div class="hh-econ-net" style="color:' + netColor + ';">' +
                'Net Change: ' + (d.net >= 0 ? '+' : '') + d.net + 'g' +
            '</div>';
    }

    function _renderEnterpriseSection(d) {
        if (d.enterpriseSummaries.length === 0) {
            return '' +
                '<div class="hh-econ-enterprise-empty">' +
                    'No enterprises owned.' +
                '</div>';
        }

        var totalProfit = d.enterpriseStats
            ? (d.enterpriseStats.totalProfit || 0) : 0;
        var profitColor = totalProfit >= 0 ? 'var(--success)' : 'var(--warn)';
        var visibleCount = Math.min(d.enterpriseSummaries.length, 5);

        var rows = d.enterpriseSummaries.slice(0, visibleCount).map(function (s) {
            var p = s.annualProfit || 0;
            var pColor = p >= 0 ? 'var(--success)' : 'var(--warn)';
            return '' +
                '<div class="hh-econ-enterprise-row">' +
                    '<span class="hh-econ-enterprise-name">' + T.esc(s.name) + '</span>' +
                    '<span style="color:' + pColor + ';">' +
                        (p >= 0 ? '+' : '') + p + 'g' +
                    '</span>' +
                '</div>';
        }).join('');

        var more = d.enterpriseSummaries.length > visibleCount
            ? '<div class="hh-econ-enterprise-more">+' +
                (d.enterpriseSummaries.length - visibleCount) + ' more</div>'
            : '';

        return '' +
            '<div class="hh-econ-enterprise">' +
                '<div class="hh-econ-enterprise-header">' +
                    '<div class="hh-econ-enterprise-title">' +
                        T.iconSpan('INDUSTRY', 'Enterprises') + ' Enterprises (' +
                        d.enterpriseSummaries.length + ')' +
                    '</div>' +
                    '<div class="hh-econ-enterprise-meta">' +
                        'Value: <strong>' + d.enterpriseValue + 'g</strong>' +
                        (d.enterpriseStats
                            ? ' · Workers: ' + (d.enterpriseStats.totalWorkers || 0)
                            : '') +
                    '</div>' +
                '</div>' +
                '<div class="hh-econ-enterprise-total">' +
                    'Total profit: <strong style="color:' + profitColor + ';">' +
                        (totalProfit >= 0 ? '+' : '') + totalProfit + 'g' +
                    '</strong>' +
                '</div>' +
                '<div class="hh-econ-enterprise-list">' + rows + '</div>' +
                more +
            '</div>';
    }

    function _renderActions() {
        return '' +
            '<div class="hh-econ-actions">' +
                '<button type="button" class="hh-btn hh-btn-primary" ' +
                    'data-action="manage-wealth">' +
                    T.iconSpan('COIN', 'Wealth') + ' Manage Wealth' +
                '</button>' +
                '<button type="button" class="hh-btn hh-btn-primary" ' +
                    'data-action="manage-resources">' +
                    'Manage Resources' +
                '</button>' +
                '<button type="button" class="hh-btn" ' +
                    'data-action="income">' +
                    T.iconSpan('ARROW_UP', 'Income') + ' Income' +
                '</button>' +
                '<button type="button" class="hh-btn" ' +
                    'data-action="expenses">' +
                    T.iconSpan('ARROW_DOWN', 'Expenses') + ' Expenses' +
                '</button>' +
                '<button type="button" class="hh-btn hh-btn-accent" ' +
                    'data-action="process-year">' +
                    T.iconSpan('REFRESH', 'Process') + ' Process Year' +
                '</button>' +
            '</div>';
    }

    // =========================================================================
    // 4. ENTRY POINT
    // =========================================================================

    function renderHouseholdEconomyTab(container, context) {
        if (!container) return;

        T.runExclusive(_renderGuard, function () {
            if (!context || !context.householdId) {
                container.innerHTML = T.emptyState('Select a household from the sidebar.');
                return;
            }

            if (!T.queries()) {
                container.innerHTML = T.failureState(
                    'HouseholdQueries is not loaded. ' +
                    'Load js/households/household-queries.js.'
                );
                return;
            }

            var data;
            try {
                data = _collect(context.householdId);
            } catch (e) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error('[HouseholdEconomyTab] collect failed', e);
                }
                container.innerHTML = T.failureState(
                    'Could not load economy data: ' +
                    (e && e.message ? e.message : 'unknown error')
                );
                return;
            }

            if (data.error) {
                container.innerHTML = T.failureState(data.error);
                return;
            }

            container.innerHTML = _renderBody(data);
            _wire(container, context.householdId);
        }, { onBusy: function () { /* skip re-entrant render */ } });
    }

    // =========================================================================
    // 5. WIRING
    // =========================================================================

    function _wire(container, householdId) {
        T.attachDelegated(container, {
            '[data-action="manage-wealth"]':    function () { _openWealthModal(householdId); },
            '[data-action="manage-resources"]': function () { _openResourcesModal(householdId); },
            '[data-action="income"]':           function () { _openIncomeModal(householdId); },
            '[data-action="expenses"]':         function () { _openExpensesModal(householdId); },
            '[data-action="process-year"]':     function () { _openProcessModal(householdId); }
        });
    }

    function _rerender(householdId) {
        T.requestRender(TAB_ID);
        if (typeof window.refreshHouseholdList === 'function') {
            window.refreshHouseholdList();
        }
    }

    // =========================================================================
    // 6. MANAGE WEALTH MODAL
    // =========================================================================
    //
    // One modal, four actions:
    //   Add wealth       → HE.updateHouseholdWealth(+, delta)
    //   Subtract wealth  → HE.updateHouseholdWealth(-, delta)
    //   Set wealth       → HE.updateHouseholdWealth(diff, "Set to N")
    //   Add debt         → HE.modifyHouseholdDebt(+, delta)
    //   Pay debt         → HE.modifyHouseholdDebt(-min(delta, current))
    //
    // HE.updateHouseholdWealth and HE.modifyHouseholdDebt are the
    // documented mutation primitives. Each:
    //   - reads the canonical record
    //   - runs a pure projection to produce a patch
    //   - applies the patch via HouseholdCommands.updateHousehold
    //   - persists once via HouseholdCommands.persist
    //
    // The tab must NOT call persist separately. See household-economy.js
    // §4 (_applyMutation).

    function _openWealthModal(householdId) {
        var HE = T.economy();
        if (!HE) {
            T.toastError('HouseholdEconomy is not loaded.');
            return;
        }

        var wealth, debt, tier;
        try {
            wealth = HE.getHouseholdWealth(householdId);
            debt = HE.getHouseholdDebt(householdId);
            tier = HE.getEconomicTier(wealth);
        } catch (e) {
            T.toastError('Could not read wealth: ' + (e && e.message));
            return;
        }

        var content =
            '<div class="hh-modal-form">' +
                '<div class="hh-econ-grid hh-econ-grid-3" style="margin-bottom:12px;">' +
                    T.statCell('Wealth', wealth + 'g',
                        wealth >= 0 ? 'var(--success)' : 'var(--danger)') +
                    T.statCell('Debt', debt + 'g',
                        debt > 0 ? 'var(--warn)' : null) +
                    T.statCell('Tier', tier ? tier.label : '—') +
                '</div>' +
                '<div class="hh-form-group">' +
                    '<label>Modify Wealth</label>' +
                    '<div class="hh-inline-actions">' +
                        '<input type="number" data-field="wealthDelta" value="0">' +
                        '<input type="text" data-field="wealthReason" placeholder="Reason">' +
                    '</div>' +
                    '<div class="hh-inline-actions">' +
                        '<button type="button" class="hh-btn hh-btn-primary" ' +
                            'data-action="wealth-add">Add</button>' +
                        '<button type="button" class="hh-btn hh-btn-danger" ' +
                            'data-action="wealth-subtract">Subtract</button>' +
                        '<button type="button" class="hh-btn" ' +
                            'data-action="wealth-set">Set</button>' +
                    '</div>' +
                '</div>' +
                '<div class="hh-form-group">' +
                    '<label>Modify Debt</label>' +
                    '<div class="hh-inline-actions">' +
                        '<input type="number" data-field="debtDelta" value="0">' +
                    '</div>' +
                    '<div class="hh-inline-actions">' +
                        '<button type="button" class="hh-btn hh-btn-danger" ' +
                            'data-action="debt-add">Add Debt</button>' +
                        '<button type="button" class="hh-btn hh-btn-primary" ' +
                            'data-action="debt-pay">Pay Debt</button>' +
                    '</div>' +
                '</div>' +
            '</div>';

        var modal = T.openModal({
            title: 'Manage Wealth',
            content: content,
            confirmText: 'Close',
            cancelText: '',
            onOpen: function () {
                var root = modal && modal.element;
                if (!root) return;

                function readDelta(field) {
                    var n = parseInt(root.querySelector('[data-field="' + field + '"]').value, 10);
                    return isFinite(n) ? n : 0;
                }
                function readWealthReason() {
                    return (root.querySelector('[data-field="wealthReason"]').value || '').trim() || 'Modified';
                }
                function applyAndClose(applyFn) {
                    var result;
                    try {
                        result = applyFn();
                    } catch (e) {
                        T.toastError('Failed: ' + (e && e.message ? e.message : 'unknown'));
                        return;
                    }
                    if (!result || result.success === false) {
                        T.toastError(result ? result.reason : 'Failed');
                        return;
                    }
                    T.closeTopModal();
                    _rerender(householdId);
                }

                var addBtn = root.querySelector('[data-action="wealth-add"]');
                if (addBtn) addBtn.addEventListener('click', function (e) {
                    e.preventDefault();
                    var delta = Math.abs(readDelta('wealthDelta'));
                    if (delta === 0) { T.toastWarning('Enter a value.'); return; }
                    applyAndClose(function () {
                        return HE.updateHouseholdWealth(householdId, delta,
                            'Added: ' + readWealthReason());
                    });
                });

                var subBtn = root.querySelector('[data-action="wealth-subtract"]');
                if (subBtn) subBtn.addEventListener('click', function (e) {
                    e.preventDefault();
                    var delta = Math.abs(readDelta('wealthDelta'));
                    if (delta === 0) { T.toastWarning('Enter a value.'); return; }
                    applyAndClose(function () {
                        return HE.updateHouseholdWealth(householdId, -delta,
                            'Subtracted: ' + readWealthReason());
                    });
                });

                var setBtn = root.querySelector('[data-action="wealth-set"]');
                if (setBtn) setBtn.addEventListener('click', function (e) {
                    e.preventDefault();
                    var target = readDelta('wealthDelta');
                    if (target < 0) { T.toastError('Target must be non-negative.'); return; }
                    var current = HE.getHouseholdWealth(householdId);
                    applyAndClose(function () {
                        return HE.updateHouseholdWealth(householdId, target - current,
                            'Set to ' + target + ': ' + readWealthReason());
                    });
                });

                var debtAddBtn = root.querySelector('[data-action="debt-add"]');
                if (debtAddBtn) debtAddBtn.addEventListener('click', function (e) {
                    e.preventDefault();
                    var delta = readDelta('debtDelta');
                    if (delta <= 0) { T.toastWarning('Enter a positive value.'); return; }
                    applyAndClose(function () {
                        return HE.modifyHouseholdDebt(householdId, delta);
                    });
                });

                var debtPayBtn = root.querySelector('[data-action="debt-pay"]');
                if (debtPayBtn) debtPayBtn.addEventListener('click', function (e) {
                    e.preventDefault();
                    var delta = readDelta('debtDelta');
                    if (delta <= 0) { T.toastWarning('Enter a positive value.'); return; }
                    var current = HE.getHouseholdDebt(householdId);
                    var paid = Math.min(delta, current);
                    applyAndClose(function () {
                        return HE.modifyHouseholdDebt(householdId, -paid);
                    });
                });
            },
            onConfirm: function () {
                T.closeTopModal();
                _rerender(householdId);
            }
        });
    }

    // =========================================================================
    // 7. MANAGE RESOURCES MODAL
    // =========================================================================
    //
    // Four actions:
    //   +/− per resource      → HE.updateHouseholdResources(id, type, ±delta)
    //   Add to all            → HE.updateHouseholdResources(id, type, delta)
    //                           for each of food / livestock / goods
    //
    // The Add to All path is deliberately per-mutation (three calls),
    // not a single atomic bulk mutation, because
    // HouseholdEconomy.updateHouseholdResources does not currently
    // support a bulk shape. Each call commits and persists once. If
    // a future revision adds a bulk shape, this file can switch to it
    // without changing the modal structure.

    function _openResourcesModal(householdId) {
        var HE = T.economy();
        if (!HE) {
            T.toastError('HouseholdEconomy is not loaded.');
            return;
        }

        var resources;
        try { resources = HE.getHouseholdResources(householdId) || { food: 0, livestock: 0, goods: 0 }; }
        catch (e) { T.toastError('Could not read resources: ' + (e && e.message)); return; }

        var types = [
            { id: 'food',      label: 'Food' },
            { id: 'livestock', label: 'Livestock' },
            { id: 'goods',     label: 'Goods' }
        ];

        var rows = types.map(function (ty) {
            var value = resources[ty.id] || 0;
            return '' +
                '<div class="hh-resource-row">' +
                    '<span class="hh-resource-label">' + T.esc(ty.label) + '</span>' +
                    '<div class="hh-resource-controls">' +
                        '<span class="hh-resource-value">' + value + '</span>' +
                        '<button type="button" class="hh-icon-btn hh-icon-btn-success" ' +
                            'data-action="resource-add" ' +
                            'data-type="' + ty.id + '" ' +
                            'title="Add">' + T.icon('PLUS') + '</button>' +
                        '<button type="button" class="hh-icon-btn hh-icon-btn-danger" ' +
                            'data-action="resource-subtract" ' +
                            'data-type="' + ty.id + '" ' +
                            'title="Subtract">−</button>' +
                    '</div>' +
                '</div>';
        }).join('');

        var content =
            '<div class="hh-modal-form">' +
                '<div class="hh-form-group">' +
                    '<label>Delta per action</label>' +
                    '<input type="number" data-field="resourceDelta" value="1" min="1">' +
                '</div>' +
                '<div class="hh-resource-list">' + rows + '</div>' +
                '<div class="hh-inline-actions">' +
                    '<button type="button" class="hh-btn hh-btn-primary" ' +
                        'data-action="resource-add-all">Add to All</button>' +
                '</div>' +
            '</div>';

        var modal = T.openModal({
            title: 'Manage Resources',
            content: content,
            confirmText: 'Close',
            cancelText: '',
            onOpen: function () {
                var root = modal && modal.element;
                if (!root) return;

                function readDelta() {
                    var n = parseInt(root.querySelector('[data-field="resourceDelta"]').value, 10);
                    return (isFinite(n) && n > 0) ? n : 1;
                }

                T.attachDelegated(root, {
                    '[data-action="resource-add"]': function (e, btn) {
                        var type = btn.getAttribute('data-type');
                        var delta = readDelta();
                        var result = HE.updateHouseholdResources(householdId, type, delta);
                        if (!result || result.success === false) {
                            T.toastError('Failed: ' + (result ? result.reason : 'unknown'));
                            return;
                        }
                        T.closeTopModal();
                        _rerender(householdId);
                    },
                    '[data-action="resource-subtract"]': function (e, btn) {
                        var type = btn.getAttribute('data-type');
                        var delta = readDelta();
                        var result = HE.updateHouseholdResources(householdId, type, -delta);
                        if (!result || result.success === false) {
                            T.toastError('Failed: ' + (result ? result.reason : 'unknown'));
                            return;
                        }
                        T.closeTopModal();
                        _rerender(householdId);
                    },
                    '[data-action="resource-add-all"]': function () {
                        var delta = readDelta();
                        var ids = ['food', 'livestock', 'goods'];
                        var ok = 0;
                        var failed = 0;
                        for (var i = 0; i < ids.length; i++) {
                            var r = HE.updateHouseholdResources(householdId, ids[i], delta);
                            if (r && r.success === true) ok++;
                            else failed++;
                        }
                        if (failed === 0) {
                            T.toastSuccess('All resources increased by ' + delta + '.');
                        } else if (ok > 0) {
                            T.toastWarning(ok + ' resource(s) updated, ' + failed + ' failed.');
                        } else {
                            T.toastError('All resource updates failed.');
                        }
                        T.closeTopModal();
                        _rerender(householdId);
                    }
                });
            },
            onConfirm: function () {
                T.closeTopModal();
                _rerender(householdId);
            }
        });
    }

    // =========================================================================
    // 8. INCOME MODAL (read-only projection)
    // =========================================================================
    //
    // The prior revision tried to build a per-source breakdown from a
    // set of inline fallbacks. This revision shows the canonical
    // totals only, plus the tracked salary and rent/enterprise
    // components that HouseholdEconomy exposes. The detailed breakdown
    // belongs in a modal owned by household-economy.js if the domain
    // ever adds one; the tab does not invent one.

    function _openIncomeModal(householdId) {
        var d;
        try { d = _collect(householdId); }
        catch (e) { T.toastError('Could not read income: ' + (e && e.message)); return; }
        if (d.error) { T.toastError(d.error); return; }

        var HE = T.economy();
        var rentIncome = 0;
        if (HE && typeof HE.calculateRentIncome === 'function') {
            try { rentIncome = HE.calculateRentIncome(householdId) || 0; }
            catch (e) { rentIncome = 0; }
        }
        var enterpriseIncome = 0;
        if (HE && typeof HE.calculateEnterpriseNet === 'function') {
            try {
                var ent = HE.calculateEnterpriseNet(householdId);
                enterpriseIncome = (ent && typeof ent.income === 'number') ? ent.income : 0;
            } catch (e) { enterpriseIncome = 0; }
        }

        var content =
            '<div class="hh-modal-form">' +
                '<div class="hh-econ-grid hh-econ-grid-2" style="margin-bottom:12px;">' +
                    T.statCell('Annual Income', d.income + 'g', 'var(--success)') +
                    T.statCell('Year', d.year) +
                '</div>' +
                '<div class="hh-kv-list">' +
                    T.kvRow('Rent income from owned properties', rentIncome + 'g') +
                    T.kvRow('Enterprise profit (private)', enterpriseIncome + 'g') +
                    T.kvRow('Member salaries (tracked)', d.salaryIncome + 'g') +
                '</div>' +
                '<div class="hh-form-hint">' +
                    'Total annual income also includes explicit income ' +
                    'sources on the household and member professions. ' +
                    'The three rows above are the tracked components.' +
                '</div>' +
            '</div>';

        T.openModal({
            title: 'Income Breakdown',
            content: content,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function () { T.closeTopModal(); }
        });
    }

    // =========================================================================
    // 9. EXPENSES MODAL (read-only projection)
    // =========================================================================

    function _openExpensesModal(householdId) {
        var d;
        try { d = _collect(householdId); }
        catch (e) { T.toastError('Could not read expenses: ' + (e && e.message)); return; }
        if (d.error) { T.toastError(d.error); return; }

        var HE = T.economy();
        var rentExpense = 0;
        if (HE && typeof HE.calculateRentExpenses === 'function') {
            try { rentExpense = HE.calculateRentExpenses(householdId) || 0; }
            catch (e) { rentExpense = 0; }
        }
        var enterpriseLoss = 0;
        if (HE && typeof HE.calculateEnterpriseNet === 'function') {
            try {
                var ent = HE.calculateEnterpriseNet(householdId);
                enterpriseLoss = (ent && typeof ent.expense === 'number') ? ent.expense : 0;
            } catch (e) { enterpriseLoss = 0; }
        }

        var content =
            '<div class="hh-modal-form">' +
                '<div class="hh-econ-grid hh-econ-grid-2" style="margin-bottom:12px;">' +
                    T.statCell('Annual Expenses', d.expenses + 'g', 'var(--warn)') +
                    T.statCell('Year', d.year) +
                '</div>' +
                '<div class="hh-kv-list">' +
                    T.kvRow('Rent expenses for rented properties', rentExpense + 'g') +
                    T.kvRow('Enterprise losses (private)', enterpriseLoss + 'g') +
                    T.kvRow('Tuition (tracked)', d.tuition + 'g') +
                '</div>' +
                '<div class="hh-form-hint">' +
                    'Total annual expenses also include explicit expense ' +
                    'entries, staff wages, and debt interest. The three ' +
                    'rows above are the tracked components.' +
                '</div>' +
            '</div>';

        T.openModal({
            title: 'Expense Breakdown',
            content: content,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function () { T.closeTopModal(); }
        });
    }

    // =========================================================================
    // 10. PROCESS YEAR MODAL
    // =========================================================================
    //
    // Delegates to HouseholdEconomy.processAnnualEconomy, which:
    //   - reads the canonical record
    //   - computes income and expenses via the canonical calculations
    //   - applies a single patch (wealth, economy.transactions, eventLog,
    //     status if crossing bankruptcy threshold)
    //   - commits once via HouseholdCommands.updateHousehold
    //   - persists once via HouseholdCommands.persist
    //
    // The tab must NOT call persist after processAnnualEconomy returns.
    // The prior revision's _processAnnualEconomy fallback mutated the
    // record directly; this revision has no fallback.

    function _openProcessModal(householdId) {
        var HE = T.economy();
        if (!HE) {
            T.toastError('HouseholdEconomy is not loaded.');
            return;
        }

        var d;
        try { d = _collect(householdId); }
        catch (e) { T.toastError('Could not read economy: ' + (e && e.message)); return; }
        if (d.error) { T.toastError(d.error); return; }

        var netColor = d.net >= 0 ? 'var(--success)' : 'var(--warn)';

        var content =
            '<div class="hh-modal-form">' +
                '<div class="hh-econ-grid hh-econ-grid-3" style="margin-bottom:12px;">' +
                    T.statCell('Current Wealth', d.wealth + 'g') +
                    T.statCell('Income', '+' + d.income + 'g', 'var(--success)') +
                    T.statCell('Expenses', '−' + d.expenses + 'g', 'var(--warn)') +
                '</div>' +
                '<div class="hh-econ-net" style="color:' + netColor + ';">' +
                    'Net Change: ' + (d.net >= 0 ? '+' : '') + d.net + 'g' +
                '</div>' +
                '<div class="hh-form-hint">' +
                    'New wealth will be <strong>' + (d.wealth + d.net) + 'g</strong>. ' +
                    'Processing also consumes food based on member count ' +
                    'and may trigger the bankruptcy status check.' +
                '</div>' +
            '</div>';

        T.openModal({
            title: 'Process Annual Economy',
            content: content,
            confirmText: 'Process Year',
            cancelText: 'Cancel',
            onConfirm: function () {
                var result;
                try {
                    result = HE.processAnnualEconomy(householdId, { year: d.year });
                } catch (e) {
                    T.toastError('Process failed: ' + (e && e.message ? e.message : 'unknown'));
                    return false;
                }
                if (!result || result.success === false) {
                    T.toastError('Process failed: ' + (result ? result.reason : 'unknown'));
                    return false;
                }

                var data = result.data || {};
                var msg = 'Processed. Wealth: ' +
                    data.oldWealth + ' → ' + data.newWealth + 'g';
                if (data.bankrupt) {
                    T.toastWarning(msg + ' · BANKRUPTCY');
                } else {
                    T.toastSuccess(msg);
                }

                T.closeTopModal();
                _rerender(householdId);
                return true;
            }
        });
    }

    // =========================================================================
    // 11. REGISTRATION
    // =========================================================================

    T.register(TAB_ID, renderHouseholdEconomyTab);

    // =========================================================================
    // 12. EXPORTS
    // =========================================================================

    window.HouseholdEconomyTab = {
        id: TAB_ID,
        render: renderHouseholdEconomyTab
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.HouseholdEconomyTab;
    }
})();
