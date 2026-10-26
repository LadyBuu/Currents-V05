/**
 * =============================================================================
 * STILL WATERS - HOUSEHOLD ECONOMY MODALS (modals-household-economy.js)
 * =============================================================================
 *
 * LOCATION: js/households/modals-household-economy.js
 *
 * PURPOSE
 * -------
 * Modal entry points for household economic operations:
 *
 *   - openHouseholdEconomicSummaryModal(householdId)
 *   - openHouseholdWealthModal(householdId, onSuccess)
 *   - openHouseholdResourcesModal(householdId, onSuccess)
 *   - openHouseholdIncomeModal(householdId)
 *   - openHouseholdExpensesModal(householdId)
 *   - openHouseholdAnnualProcessingModal(householdId, onSuccess)
 *   - openHouseholdEconomicEventsModal(householdId, onSuccess)
 *   - openHouseholdTradeModal(householdId, onSuccess)
 *
 * OWNERSHIP
 * ---------
 *   Reads:  HouseholdQueries.getHousehold, HouseholdEconomy pure calcs
 *   Writes: HouseholdEconomy mutations (which route through
 *           HouseholdCommands internally) + economy owns its persist()
 *   UI:     modals-core, icons, HouseholdModals, HouseholdViewModels
 *
 * CONVERGED PATTERN NOTES
 * -----------------------
 *   - HouseholdEconomy mutations return { success, data } | { success,
 *     code, reason }. Every caller reads .data.* on success.
 *   - HouseholdEconomy mutations already call HouseholdCommands.persist()
 *     internally (one save per mutation). This modal does NOT call
 *     persist() again — that would be a double save.
 *   - No HouseholdState access.
 *   - No _processingEconomyModal guard.
 *   - No 1250 fallback.
 *   - Command result shapes fully honored.
 *
 * DOM-SCOPE
 * ---------
 *   Every DOM lookup is scoped to the modal's own `handle.element` via
 *   HouseholdModals.rootFrom(modal). See modals-helper.js for why the
 *   prior _resolveModalRoot() fallback (which ended at document.body)
 *   was wrong.
 *
 * PERSIST CONTRACT
 * ----------------
 * Unlike the CRUD modals (modals-household.js), economy mutations persist
 * themselves via HouseholdEconomy → HouseholdCommands.persist(). The
 * modal just displays the result. Calling persist() again here would be
 * redundant.
 *
 * EXCEPTION: batch operations that call MULTIPLE economy mutations in
 * one user action (e.g. "Add to All" in resources) still persist per
 * mutation because economy owns its save boundary. If a caller needs
 * batch semantics, they must call HouseholdEconomy once with a bulk
 * shape — which economy does not currently support. That's deferred.
 *
 * DEPENDENCIES (REQUIRED, verified at load):
 *   - modals-core.js (openModal, closeTopModal)
 *   - household-queries.js (HouseholdQueries)
 *   - household-economy.js (HouseholdEconomy)
 *   - household-modals-helper.js (HouseholdModals)
 *   - household-view-models.js (HouseholdViewModels)
 *
 * DEPENDENCIES (OPTIONAL, checked at call time):
 *   - HouseholdCommands (for the shared persistOrFail helper — not used
 *     directly by this modal but required by HouseholdModals)
 *
 * ICON POLICY: SVG from icons.js. No emojis.
 *
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. LOAD-TIME DEPENDENCY VERIFICATION
    // =========================================================================

    function _requireFunction(name, fn) {
        if (typeof fn !== 'function') {
            throw new Error('modals-household-economy: ' + name + ' is required');
        }
        return fn;
    }

    function _requireObject(name, obj) {
        if (typeof obj === 'undefined' || obj === null) {
            throw new Error('modals-household-economy: ' + name + ' is required');
        }
        return obj;
    }

    var _queries = _requireObject('HouseholdQueries', window.HouseholdQueries);
    _requireFunction('HouseholdQueries.getHousehold', _queries.getHousehold);
    _requireFunction('HouseholdQueries.getHouseholdEnterpriseSummaries',
        _queries.getHouseholdEnterpriseSummaries);
    _requireFunction('HouseholdQueries.getHouseholdEnterpriseStats',
        _queries.getHouseholdEnterpriseStats);

    var _economy = _requireObject('HouseholdEconomy', window.HouseholdEconomy);
    _requireFunction('HouseholdEconomy.getHouseholdWealth',
        _economy.getHouseholdWealth);
    _requireFunction('HouseholdEconomy.getHouseholdDebt',
        _economy.getHouseholdDebt);
    _requireFunction('HouseholdEconomy.getHouseholdResources',
        _economy.getHouseholdResources);
    _requireFunction('HouseholdEconomy.getEconomicTier',
        _economy.getEconomicTier);
    _requireFunction('HouseholdEconomy.calculateAnnualIncome',
        _economy.calculateAnnualIncome);
    _requireFunction('HouseholdEconomy.calculateAnnualExpenses',
        _economy.calculateAnnualExpenses);
    _requireFunction('HouseholdEconomy.calculateRentIncome',
        _economy.calculateRentIncome);
    _requireFunction('HouseholdEconomy.calculateRentExpenses',
        _economy.calculateRentExpenses);
    _requireFunction('HouseholdEconomy.calculateEnterpriseNet',
        _economy.calculateEnterpriseNet);
    _requireFunction('HouseholdEconomy.getSalaryIncome',
        _economy.getSalaryIncome);
    _requireFunction('HouseholdEconomy.getTotalSalariesReceived',
        _economy.getTotalSalariesReceived);
    _requireFunction('HouseholdEconomy.getTuitionExpenses',
        _economy.getTuitionExpenses);
    _requireFunction('HouseholdEconomy.updateHouseholdWealth',
        _economy.updateHouseholdWealth);
    _requireFunction('HouseholdEconomy.modifyHouseholdDebt',
        _economy.modifyHouseholdDebt);
    _requireFunction('HouseholdEconomy.updateHouseholdResources',
        _economy.updateHouseholdResources);
    _requireFunction('HouseholdEconomy.processAnnualEconomy',
        _economy.processAnnualEconomy);
    _requireFunction('HouseholdEconomy.triggerEconomicEvent',
        _economy.triggerEconomicEvent);
    _requireFunction('HouseholdEconomy.executeTrade',
        _economy.executeTrade);
    _requireFunction('HouseholdEconomy.getTradePartners',
        _economy.getTradePartners);

    var _openModal = _requireFunction('openModal',
        typeof window.openModal === 'function'
            ? window.openModal
            : window._openModal);
    var _closeTopModal = _requireFunction('closeTopModal',
        typeof window.closeTopModal === 'function'
            ? window.closeTopModal
            : window._closeTopModal);

    var _Modals = _requireObject('HouseholdModals', window.HouseholdModals);
    _requireFunction('HouseholdModals.rootFrom', _Modals.rootFrom);
    _requireFunction('HouseholdModals.reportFailure', _Modals.reportFailure);
    _requireFunction('HouseholdModals.esc', _Modals.esc);
    _requireFunction('HouseholdModals.readValue', _Modals.readValue);
    _requireFunction('HouseholdModals.readIntOrNull', _Modals.readIntOrNull);
    _requireFunction('HouseholdModals.onOpen', _Modals.onOpen);

    var _VM = _requireObject('HouseholdViewModels', window.HouseholdViewModels);

    // Local aliases.
    var _esc = _Modals.esc;
    var _showSuccess = _Modals.showSuccess;
    var _showWarning = _Modals.showWarning;
    var _showInfo = _Modals.showInfo;
    var _showError = _Modals.showError;

    function _currentYear() {
        return (typeof window.getCurrentYearSafe === 'function')
            ? window.getCurrentYearSafe()
            : null;
    }

    // =========================================================================
    // 1. ECONOMIC SUMMARY MODAL (pure projection)
    // =========================================================================

    function openHouseholdEconomicSummaryModal(householdId) {
        var household = _queries.getHousehold(householdId);
        if (!household) {
            _showError('Household not found');
            return null;
        }

        var year = _currentYear();

        var wealth = _economy.getHouseholdWealth(householdId);
        var debt = _economy.getHouseholdDebt(householdId);
        var tier = _economy.getEconomicTier(wealth);
        var resources = _economy.getHouseholdResources(householdId);

        var annualIncome = _economy.calculateAnnualIncome(householdId);
        var annualExpenses = _economy.calculateAnnualExpenses(householdId);
        var netChange = annualIncome - annualExpenses;
        var rentIncome = _economy.calculateRentIncome(householdId);
        var rentExpenses = _economy.calculateRentExpenses(householdId);
        var enterpriseNet = _economy.calculateEnterpriseNet(householdId);

        var salaryIncome = year !== null
            ? _economy.getSalaryIncome(householdId, year) : 0;
        var totalSalaries = _economy.getTotalSalariesReceived(householdId);
        var tuitionExpenses = year !== null
            ? _economy.getTuitionExpenses(householdId, year) : 0;

        // Enterprise data — may throw if Industry is missing but
        // enterprises exist. Swallow: the summary should still render.
        var enterpriseSummaries = [];
        var enterpriseStats = null;
        try {
            enterpriseSummaries = _queries.getHouseholdEnterpriseSummaries(householdId);
            enterpriseStats = _queries.getHouseholdEnterpriseStats(householdId);
        } catch (e) {
            enterpriseSummaries = [];
            enterpriseStats = null;
        }

        var content = _buildEconomicSummaryContent({
            household: household,
            wealth: wealth,
            debt: debt,
            tier: tier,
            resources: resources,
            annualIncome: annualIncome,
            annualExpenses: annualExpenses,
            netChange: netChange,
            rentIncome: rentIncome,
            rentExpenses: rentExpenses,
            enterpriseNet: enterpriseNet,
            salaryIncome: salaryIncome,
            totalSalaries: totalSalaries,
            tuitionExpenses: tuitionExpenses,
            enterpriseSummaries: enterpriseSummaries,
            enterpriseStats: enterpriseStats,
            year: year
        });

        return _openModal({
            title: 'Economic Summary: ' + household.name,
            content: content,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function() { /* close only */ }
        });
    }

    function _buildEconomicSummaryContent(d) {
        var html = '<div style="margin-bottom:16px;">';

        html += '<div style="background:var(--bg3);border-radius:6px;padding:12px;margin-bottom:12px;">' +
            '<div style="font-size:0.7rem;"><strong>' +
                _esc(d.household.name) + '</strong></div>' +
            '<div style="font-size:0.55rem;color:var(--dim);">Economic Summary' +
                (d.year !== null ? ' · Year ' + d.year : '') +
            '</div>' +
        '</div>';

        html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px;">' +
            _metricCell('Wealth', d.wealth + 'g',
                _VM.getWealthColor(d.wealth)) +
            _metricCell('Debt', d.debt + 'g',
                _VM.getDebtColor(d.debt)) +
            _metricCell('Tier', d.tier.label) +
        '</div>';

        html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px;">' +
            _metricCell('Food', d.resources.food) +
            _metricCell('Livestock', d.resources.livestock) +
            _metricCell('Goods', d.resources.goods) +
        '</div>';

        html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">' +
            _metricCell('Annual Income', '+' + d.annualIncome + 'g',
                'var(--success)') +
            _metricCell('Annual Expenses', '-' + d.annualExpenses + 'g',
                'var(--warn)') +
        '</div>';

        var netColor = _VM.getNetChangeColor(d.netChange);
        html += '<div style="text-align:center;padding:8px;background:var(--bg);border-radius:4px;margin-bottom:12px;">' +
            '<span style="font-size:0.8rem;font-weight:bold;color:' + netColor + ';">' +
                'Net Annual Change: ' +
                (d.netChange >= 0 ? '+' : '') + d.netChange + 'g' +
            '</span>' +
        '</div>';

        if (d.rentIncome > 0 || d.rentExpenses > 0) {
            html += _buildRentSection(d.rentIncome, d.rentExpenses);
        }

        if (d.enterpriseSummaries && d.enterpriseSummaries.length > 0) {
            html += _buildEnterpriseSection(
                d.enterpriseSummaries, d.enterpriseStats);
        }

        if (d.salaryIncome > 0 || d.totalSalaries > 0) {
            html += _buildSalarySection(d.salaryIncome, d.totalSalaries);
        }

        if (d.tuitionExpenses > 0) {
            html += _buildTuitionSection(d.tuitionExpenses);
        }

        html += '</div>';
        return html;
    }

    function _metricCell(label, value, color) {
        return '<div style="background:var(--bg2);padding:8px;border-radius:6px;text-align:center;">' +
            '<div style="font-size:0.55rem;color:var(--dim);">' +
                _esc(label) + '</div>' +
            '<div style="font-size:0.9rem;font-weight:bold;' +
                (color ? 'color:' + color + ';' : '') + '">' +
                _esc(String(value)) +
            '</div>' +
        '</div>';
    }

    function _buildRentSection(rentIncome, rentExpenses) {
        var net = rentIncome - rentExpenses;
        var netColor = _VM.getNetChangeColor(net);

        return '<div style="background:var(--bg2);padding:8px;border-radius:6px;margin-bottom:12px;">' +
            '<div style="font-size:0.6rem;color:var(--accent);margin-bottom:4px;">Rental Income &amp; Expenses</div>' +
            '<div style="display:flex;justify-content:space-between;font-size:0.6rem;">' +
                '<span>Income from owned properties: <strong style="color:var(--success);">+' +
                    rentIncome + 'g</strong></span>' +
                '<span>Expenses for rented properties: <strong style="color:var(--warn);">-' +
                    rentExpenses + 'g</strong></span>' +
                '<span>Net: <strong style="color:' + netColor + ';">' +
                    (net >= 0 ? '+' : '') + net + 'g</strong></span>' +
            '</div>' +
        '</div>';
    }

    function _buildEnterpriseSection(summaries, stats) {
        var totalProfit = stats ? (stats.totalProfit || 0) : 0;
        var profitColor = _VM.getProfitColor(totalProfit);

        var ownershipBreakdown = '';
        if (stats) {
            if (stats.publicCount > 0 || stats.privateCount > 0) {
                ownershipBreakdown = ' · ' +
                    (stats.publicCount > 0
                        ? stats.publicCount + ' Public' : '') +
                    (stats.publicCount > 0 && stats.privateCount > 0
                        ? ', ' : '') +
                    (stats.privateCount > 0
                        ? stats.privateCount + ' Private' : '');
            }
        }

        var html = '<div style="background:var(--bg2);padding:8px;border-radius:6px;margin-bottom:12px;">';
        html += '<div style="font-size:0.6rem;color:var(--accent);margin-bottom:4px;">' +
            'Enterprises (' + summaries.length + ')' +
            _esc(ownershipBreakdown) + '</div>';

        html += '<div style="display:flex;justify-content:space-between;font-size:0.55rem;flex-wrap:wrap;gap:4px;margin-bottom:4px;">';
        html += '<span>Total Profit: <strong style="color:' + profitColor + ';">' +
            (totalProfit >= 0 ? '+' : '') + totalProfit + 'g</strong></span>';
        if (stats) {
            html += '<span>Profitable: <strong style="color:var(--success);">' +
                (stats.profitable || 0) + '</strong></span>';
            html += '<span>Unprofitable: <strong style="color:var(--warn);">' +
                (stats.unprofitable || 0) + '</strong></span>';
            html += '<span>Workers: <strong>' +
                (stats.totalWorkers || 0) + '</strong></span>';
        }
        html += '</div>';

        var limit = Math.min(summaries.length, 5);
        if (limit > 0) {
            html += '<div style="max-height:80px;overflow-y:auto;">';
            for (var i = 0; i < limit; i++) {
                var s = summaries[i];
                var profit = s.annualProfit || 0;
                var pc = _VM.getProfitColor(profit);
                var ownership = s.ownershipType === 'public'
                    ? ' <span style="font-size:0.4rem;color:var(--accent);">(Public)</span>'
                    : '';
                html += '<div style="display:flex;justify-content:space-between;padding:2px 0;border-bottom:1px solid var(--border-light);font-size:0.5rem;">' +
                    '<span>' + _esc(s.name) + ownership + '</span>' +
                    '<span style="color:' + pc + ';">' +
                        (profit >= 0 ? '+' : '') + profit + 'g</span>' +
                '</div>';
            }
            html += '</div>';
        }

        html += '</div>';
        return html;
    }

    function _buildSalarySection(salaryIncome, totalSalaries) {
        return '<div style="background:var(--bg2);padding:8px;border-radius:6px;margin-bottom:12px;">' +
            '<div style="font-size:0.6rem;color:var(--accent);margin-bottom:4px;">Salary Income</div>' +
            '<div style="display:flex;justify-content:space-between;font-size:0.65rem;">' +
                '<span>This year: <strong style="color:var(--success);">+' +
                    salaryIncome + 'g</strong></span>' +
                '<span>Total received: <strong>' + totalSalaries +
                    'g</strong></span>' +
            '</div>' +
        '</div>';
    }

    function _buildTuitionSection(tuitionExpenses) {
        return '<div style="background:var(--bg2);padding:8px;border-radius:6px;margin-bottom:12px;">' +
            '<div style="font-size:0.6rem;color:var(--warn);margin-bottom:4px;">Tuition Expenses</div>' +
            '<div style="display:flex;justify-content:space-between;font-size:0.65rem;">' +
                '<span>This year: <strong style="color:var(--warn);">-' +
                    tuitionExpenses + 'g</strong></span>' +
            '</div>' +
        '</div>';
    }

    // =========================================================================
    // 2. WEALTH MODAL
    // =========================================================================

    function openHouseholdWealthModal(householdId, onSuccess) {
        var household = _queries.getHousehold(householdId);
        if (!household) {
            _showError('Household not found');
            return null;
        }

        var wealth = _economy.getHouseholdWealth(householdId);
        var debt = _economy.getHouseholdDebt(householdId);
        var tier = _economy.getEconomicTier(wealth);
        var year = _currentYear();
        var salaryIncome = year !== null
            ? _economy.getSalaryIncome(householdId, year) : 0;
        var tuitionExpenses = year !== null
            ? _economy.getTuitionExpenses(householdId, year) : 0;

        var content =
            '<div style="margin-bottom:16px;">' +
                '<div style="background:var(--bg3);border-radius:6px;padding:12px;margin-bottom:12px;">' +
                    '<div style="font-size:0.7rem;"><strong>' +
                        _esc(household.name) + '</strong></div>' +
                    '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:8px;">' +
                        '<div><span style="color:var(--dim);font-size:0.6rem;">Wealth</span><br>' +
                            '<span style="font-size:1.1rem;font-weight:bold;">' +
                                wealth + 'g</span></div>' +
                        '<div><span style="color:var(--dim);font-size:0.6rem;">Debt</span><br>' +
                            '<span style="font-size:1.1rem;font-weight:bold;' +
                                (debt > 0 ? 'color:var(--warn);' : '') + '">' +
                                debt + 'g</span></div>' +
                        '<div><span style="color:var(--dim);font-size:0.6rem;">Tier</span><br>' +
                            '<span style="font-size:0.9rem;">' +
                                _esc(tier.label) + '</span></div>' +
                    '</div>' +
                    (salaryIncome > 0 || tuitionExpenses > 0
                        ? '<div style="display:flex;justify-content:space-between;font-size:0.55rem;color:var(--dim);margin-top:6px;padding-top:6px;border-top:1px solid var(--border-light);">' +
                            (salaryIncome > 0
                                ? '<span>Salary: <strong style="color:var(--success);">+' +
                                    salaryIncome + 'g</strong></span>' : '') +
                            (tuitionExpenses > 0
                                ? '<span>Tuition: <strong style="color:var(--warn);">-' +
                                    tuitionExpenses + 'g</strong></span>' : '') +
                          '</div>'
                        : '') +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Modify Wealth</label>' +
                    '<div style="display:flex;gap:8px;">' +
                        '<input type="number" data-field="wealthDelta" value="0" ' +
                            'style="flex:1;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;">' +
                        '<input type="text" data-field="wealthReason" placeholder="Reason" ' +
                            'style="flex:2;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;">' +
                    '</div>' +
                    '<div style="display:flex;gap:4px;margin-top:4px;">' +
                        '<button data-action="wealth-add" style="padding:2px 8px;font-size:0.5rem;background:var(--accent-dim);border:1px solid var(--accent);border-radius:3px;cursor:pointer;">Add</button>' +
                        '<button data-action="wealth-subtract" style="padding:2px 8px;font-size:0.5rem;background:#8a3020;border:none;color:white;border-radius:3px;cursor:pointer;">Subtract</button>' +
                        '<button data-action="wealth-set" style="padding:2px 8px;font-size:0.5rem;background:var(--bg3);border:1px solid var(--border);border-radius:3px;cursor:pointer;">Set</button>' +
                    '</div>' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Modify Debt</label>' +
                    '<div style="display:flex;gap:8px;">' +
                        '<input type="number" data-field="debtDelta" value="0" ' +
                            'style="flex:1;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;">' +
                    '</div>' +
                    '<div style="display:flex;gap:4px;margin-top:4px;">' +
                        '<button data-action="debt-add" style="padding:2px 8px;font-size:0.5rem;background:#8a3020;border:none;color:white;border-radius:3px;cursor:pointer;">Add Debt</button>' +
                        '<button data-action="debt-pay" style="padding:2px 8px;font-size:0.5rem;background:var(--accent-dim);border:1px solid var(--accent);border-radius:3px;cursor:pointer;">Pay Debt</button>' +
                    '</div>' +
                '</div>' +
            '</div>';

        var modal = _openModal({
            title: 'Wealth: ' + household.name,
            content: content,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function() { /* close only */ }
        });

        _Modals.onOpen(modal, function(root) {
            _wireWealthActions(root, householdId, onSuccess);
        });

        return modal;
    }

    function _wireWealthActions(root, householdId, onSuccess) {
        function _readDelta(fieldName) {
            return _Modals.readIntOrNull(root, '[data-field="' + fieldName + '"]');
        }

        function _readReason() {
            return _Modals.readValue(root, '[data-field="wealthReason"]').trim() ||
                'Modified';
        }

        function _closeAndRefresh() {
            _closeTopModal();
            setTimeout(function() {
                if (typeof onSuccess === 'function') onSuccess();
            }, 0);
        }

        var addBtn = root.querySelector('[data-action="wealth-add"]');
        if (addBtn) {
            addBtn.onclick = function() {
                var delta = Math.abs(_readDelta('wealthDelta') || 0);
                if (delta === 0) {
                    _showWarning('Enter a value');
                    return;
                }
                var result = _economy.updateHouseholdWealth(
                    householdId, delta, 'Added: ' + _readReason());
                if (!result.success) {
                    _Modals.reportFailure(result, 'Failed to update wealth');
                    return;
                }
                _showSuccess(
                    'Wealth increased by ' + delta +
                    ' (now ' + result.data.newWealth + 'g)');
                _closeAndRefresh();
            };
        }

        var subBtn = root.querySelector('[data-action="wealth-subtract"]');
        if (subBtn) {
            subBtn.onclick = function() {
                var delta = Math.abs(_readDelta('wealthDelta') || 0);
                if (delta === 0) {
                    _showWarning('Enter a value');
                    return;
                }
                var result = _economy.updateHouseholdWealth(
                    householdId, -delta, 'Subtracted: ' + _readReason());
                if (!result.success) {
                    _Modals.reportFailure(result, 'Failed to update wealth');
                    return;
                }
                _showInfo(
                    'Wealth decreased by ' + delta +
                    ' (now ' + result.data.newWealth + 'g)');
                _closeAndRefresh();
            };
        }

        var setBtn = root.querySelector('[data-action="wealth-set"]');
        if (setBtn) {
            setBtn.onclick = function() {
                var target = _readDelta('wealthDelta');
                if (target === null || target < 0) {
                    _showError('Enter a non-negative value');
                    return;
                }
                var current = _economy.getHouseholdWealth(householdId);
                var diff = target - current;
                var result = _economy.updateHouseholdWealth(
                    householdId, diff,
                    'Set to ' + target + ': ' + _readReason());
                if (!result.success) {
                    _Modals.reportFailure(result, 'Failed to update wealth');
                    return;
                }
                _showSuccess('Wealth set to ' + result.data.newWealth + 'g');
                _closeAndRefresh();
            };
        }

        var debtAddBtn = root.querySelector('[data-action="debt-add"]');
        if (debtAddBtn) {
            debtAddBtn.onclick = function() {
                var delta = _readDelta('debtDelta') || 0;
                if (delta <= 0) {
                    _showWarning('Enter a positive value');
                    return;
                }
                var result = _economy.modifyHouseholdDebt(householdId, delta);
                if (!result.success) {
                    _Modals.reportFailure(result, 'Failed to update debt');
                    return;
                }
                _showInfo(
                    'Debt increased by ' + delta +
                    ' (now ' + result.data.newDebt + 'g)');
                _closeAndRefresh();
            };
        }

        var debtPayBtn = root.querySelector('[data-action="debt-pay"]');
        if (debtPayBtn) {
            debtPayBtn.onclick = function() {
                var delta = _readDelta('debtDelta') || 0;
                if (delta <= 0) {
                    _showWarning('Enter a positive value');
                    return;
                }
                var current = _economy.getHouseholdDebt(householdId);
                var paid = Math.min(delta, current);
                var result = _economy.modifyHouseholdDebt(householdId, -paid);
                if (!result.success) {
                    _Modals.reportFailure(result, 'Failed to update debt');
                    return;
                }
                _showSuccess(
                    'Paid ' + paid + 'g debt (now ' +
                    result.data.newDebt + 'g)');
                _closeAndRefresh();
            };
        }
    }

    // =========================================================================
    // 3. RESOURCES MODAL
    // =========================================================================

    function openHouseholdResourcesModal(householdId, onSuccess) {
        var household = _queries.getHousehold(householdId);
        if (!household) {
            _showError('Household not found');
            return null;
        }

        var resources = _economy.getHouseholdResources(householdId);
        var labels = { food: 'Food', livestock: 'Livestock', goods: 'Goods' };
        var types = ['food', 'livestock', 'goods'];

        var resourceRows = '';
        for (var i = 0; i < types.length; i++) {
            var type = types[i];
            var value = resources[type] || 0;
            resourceRows +=
                '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--bg2);border-radius:6px;margin-bottom:4px;">' +
                    '<span style="font-size:0.7rem;">' + labels[type] + '</span>' +
                    '<div style="display:flex;align-items:center;gap:8px;">' +
                        '<span style="font-size:1rem;font-weight:bold;" data-resource-value="' + type + '">' + value + '</span>' +
                        '<div style="display:flex;gap:2px;">' +
                            '<button data-action="resource-add" data-type="' + type + '" style="padding:1px 6px;font-size:0.5rem;background:var(--accent-dim);border:1px solid var(--accent);border-radius:3px;cursor:pointer;">+</button>' +
                            '<button data-action="resource-subtract" data-type="' + type + '" style="padding:1px 6px;font-size:0.5rem;background:#8a3020;border:none;color:white;border-radius:3px;cursor:pointer;">-</button>' +
                        '</div>' +
                    '</div>' +
                '</div>';
        }

        var content =
            '<div style="margin-bottom:16px;">' +
                '<div style="background:var(--bg3);border-radius:6px;padding:12px;margin-bottom:12px;">' +
                    '<div style="font-size:0.7rem;"><strong>' +
                        _esc(household.name) + '</strong></div>' +
                    '<div style="font-size:0.55rem;color:var(--dim);margin-top:4px;">Resources</div>' +
                '</div>' +
                resourceRows +
                '<div style="margin-top:8px;">' +
                    '<div style="display:flex;gap:4px;flex-wrap:wrap;">' +
                        '<input type="number" data-field="resourceDelta" value="1" min="1" ' +
                            'style="width:60px;padding:4px 6px;background:var(--bg);border:1px solid var(--border);border-radius:4px;font-size:0.65rem;">' +
                        '<button data-action="resource-add-all" style="padding:2px 8px;font-size:0.5rem;background:var(--accent-dim);border:1px solid var(--accent);border-radius:3px;cursor:pointer;">Add to All</button>' +
                    '</div>' +
                '</div>' +
            '</div>';

        var modal = _openModal({
            title: 'Resources: ' + household.name,
            content: content,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function() { /* close only */ }
        });

        _Modals.onOpen(modal, function(root) {
            _wireResourcesActions(root, householdId, onSuccess);
        });

        return modal;
    }

    function _wireResourcesActions(root, householdId, onSuccess) {
        function _getDelta() {
            var n = _Modals.readIntOrNull(root, '[data-field="resourceDelta"]');
            if (n === null || n <= 0) return null;
            return n;
        }

        function _closeAndRefresh() {
            _closeTopModal();
            setTimeout(function() {
                if (typeof onSuccess === 'function') onSuccess();
            }, 0);
        }

        var addBtns = root.querySelectorAll('[data-action="resource-add"]');
        for (var i = 0; i < addBtns.length; i++) {
            (function(btn) {
                btn.onclick = function() {
                    var delta = _getDelta();
                    if (delta === null) {
                        _showWarning('Enter a positive value');
                        return;
                    }
                    var type = btn.dataset.type;
                    var result = _economy.updateHouseholdResources(
                        householdId, type, delta);
                    if (!result.success) {
                        _Modals.reportFailure(result, 'Failed to update resources');
                        return;
                    }
                    _showSuccess(
                        type + ' increased by ' + delta +
                        ' (now ' + result.data.newValue + ')');
                    _closeAndRefresh();
                };
            })(addBtns[i]);
        }

        var subBtns = root.querySelectorAll('[data-action="resource-subtract"]');
        for (var j = 0; j < subBtns.length; j++) {
            (function(btn) {
                btn.onclick = function() {
                    var delta = _getDelta();
                    if (delta === null) {
                        _showWarning('Enter a positive value');
                        return;
                    }
                    var type = btn.dataset.type;
                    var result = _economy.updateHouseholdResources(
                        householdId, type, -delta);
                    if (!result.success) {
                        _Modals.reportFailure(result, 'Failed to update resources');
                        return;
                    }
                    _showInfo(
                        type + ' decreased by ' + delta +
                        ' (now ' + result.data.newValue + ')');
                    _closeAndRefresh();
                };
            })(subBtns[j]);
        }

        var addAllBtn = root.querySelector('[data-action="resource-add-all"]');
        if (addAllBtn) {
            addAllBtn.onclick = function() {
                var delta = _getDelta();
                if (delta === null) {
                    _showWarning('Enter a positive value');
                    return;
                }
                // Batch: economy persists per mutation. Three mutations =
                // three saves. Deferred: bulk resource mutation.
                var types = ['food', 'livestock', 'goods'];
                var succeeded = 0;
                var failed = 0;
                for (var k = 0; k < types.length; k++) {
                    var result = _economy.updateHouseholdResources(
                        householdId, types[k], delta);
                    if (result.success) succeeded++;
                    else failed++;
                }
                if (failed === 0) {
                    _showSuccess('All resources increased by ' + delta);
                } else if (succeeded > 0) {
                    _showWarning(
                        succeeded + ' resource(s) updated, ' +
                        failed + ' failed');
                } else {
                    _showError('Failed to update resources');
                }
                _closeAndRefresh();
            };
        }
    }

    // =========================================================================
    // 4. INCOME MODAL (pure projection)
    // =========================================================================

    function openHouseholdIncomeModal(householdId) {
        var household = _queries.getHousehold(householdId);
        if (!household) {
            _showError('Household not found');
            return null;
        }

        var annualIncome = _economy.calculateAnnualIncome(householdId);
        var rentIncome = _economy.calculateRentIncome(householdId);
        var enterpriseNet = _economy.calculateEnterpriseNet(householdId);
        var year = _currentYear();
        var salaryIncome = year !== null
            ? _economy.getSalaryIncome(householdId, year) : 0;

        var content =
            '<div style="margin-bottom:16px;">' +
                '<div style="background:var(--bg3);border-radius:6px;padding:12px;margin-bottom:12px;">' +
                    '<div style="font-size:0.7rem;"><strong>' +
                        _esc(household.name) + '</strong></div>' +
                    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;">' +
                        '<div><span style="color:var(--dim);font-size:0.6rem;">Annual Income</span><br>' +
                            '<span style="font-size:1.1rem;font-weight:bold;color:var(--success);">' +
                                annualIncome + 'g</span></div>' +
                        '<div><span style="color:var(--dim);font-size:0.6rem;">Year</span><br>' +
                            '<span style="font-size:0.9rem;">' +
                                (year !== null ? year : 'Unknown') + '</span></div>' +
                    '</div>' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                    '<div style="font-size:0.6rem;color:var(--accent);margin-bottom:4px;">Income Sources</div>' +
                    '<div style="background:var(--bg2);border-radius:6px;padding:8px;">' +
                        _incomeRow('Rent income from owned properties', rentIncome) +
                        _incomeRow('Enterprise profits (private only)', enterpriseNet.income) +
                        _incomeRow('Member salaries', salaryIncome) +
                    '</div>' +
                '</div>' +

                '<div style="font-size:0.55rem;color:var(--dim);">' +
                    'Income is calculated from explicit sources on the household, member professions, private enterprise profits, and rent from owned properties.' +
                '</div>' +
            '</div>';

        return _openModal({
            title: 'Income: ' + household.name,
            content: content,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function() { /* close only */ }
        });
    }

    function _incomeRow(label, amount) {
        return '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border-light);font-size:0.6rem;">' +
            '<span>' + _esc(label) + '</span>' +
            '<span>' + amount + 'g</span>' +
        '</div>';
    }

    // =========================================================================
    // 5. EXPENSES MODAL (pure projection)
    // =========================================================================

    function openHouseholdExpensesModal(householdId) {
        var household = _queries.getHousehold(householdId);
        if (!household) {
            _showError('Household not found');
            return null;
        }

        var annualExpenses = _economy.calculateAnnualExpenses(householdId);
        var rentExpenses = _economy.calculateRentExpenses(householdId);
        var enterpriseNet = _economy.calculateEnterpriseNet(householdId);
        var year = _currentYear();
        var tuitionExpenses = year !== null
            ? _economy.getTuitionExpenses(householdId, year) : 0;
        var debt = _economy.getHouseholdDebt(householdId);

        var content =
            '<div style="margin-bottom:16px;">' +
                '<div style="background:var(--bg3);border-radius:6px;padding:12px;margin-bottom:12px;">' +
                    '<div style="font-size:0.7rem;"><strong>' +
                        _esc(household.name) + '</strong></div>' +
                    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;">' +
                        '<div><span style="color:var(--dim);font-size:0.6rem;">Annual Expenses</span><br>' +
                            '<span style="font-size:1.1rem;font-weight:bold;color:var(--warn);">' +
                                annualExpenses + 'g</span></div>' +
                        '<div><span style="color:var(--dim);font-size:0.6rem;">Year</span><br>' +
                            '<span style="font-size:0.9rem;">' +
                                (year !== null ? year : 'Unknown') + '</span></div>' +
                    '</div>' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                    '<div style="font-size:0.6rem;color:var(--accent);margin-bottom:4px;">Expense Categories</div>' +
                    '<div style="background:var(--bg2);border-radius:6px;padding:8px;">' +
                        _expenseRow('Rent expenses for rented properties', rentExpenses) +
                        _expenseRow('Enterprise losses (private only)', enterpriseNet.expense) +
                        _expenseRow('Tuition', tuitionExpenses) +
                        _expenseRow('Debt interest (5%)',
                            debt > 0 ? Math.round(debt * 0.05) : 0) +
                    '</div>' +
                '</div>' +

                '<div style="font-size:0.55rem;color:var(--dim);">' +
                    'Expenses include debt interest, staff wages (per member), private enterprise losses, rent paid, and tuition.' +
                '</div>' +
            '</div>';

        return _openModal({
            title: 'Expenses: ' + household.name,
            content: content,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function() { /* close only */ }
        });
    }

    function _expenseRow(label, amount) {
        return '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border-light);font-size:0.6rem;">' +
            '<span>' + _esc(label) + '</span>' +
            '<span>' + amount + 'g</span>' +
        '</div>';
    }

    // =========================================================================
    // 6. ANNUAL PROCESSING MODAL
    // =========================================================================

    function openHouseholdAnnualProcessingModal(householdId, onSuccess) {
        var household = _queries.getHousehold(householdId);
        if (!household) {
            _showError('Household not found');
            return null;
        }

        var income = _economy.calculateAnnualIncome(householdId);
        var expenses = _economy.calculateAnnualExpenses(householdId);
        var netChange = income - expenses;
        var wealth = _economy.getHouseholdWealth(householdId);
        var debt = _economy.getHouseholdDebt(householdId);
        var year = _currentYear();
        var salaryIncome = year !== null
            ? _economy.getSalaryIncome(householdId, year) : 0;
        var tuitionExpenses = year !== null
            ? _economy.getTuitionExpenses(householdId, year) : 0;
        var rentIncome = _economy.calculateRentIncome(householdId);
        var rentExpense = _economy.calculateRentExpenses(householdId);

        var netColor = _VM.getNetChangeColor(netChange);

        var content =
            '<div style="margin-bottom:16px;">' +
                '<div style="background:var(--bg3);border-radius:6px;padding:12px;margin-bottom:12px;">' +
                    '<div style="font-size:0.7rem;"><strong>' +
                        _esc(household.name) + '</strong></div>' +
                    '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:8px;">' +
                        '<div><span style="color:var(--dim);font-size:0.55rem;">Current Wealth</span><br>' +
                            '<span style="font-size:0.9rem;">' + wealth + 'g</span></div>' +
                        '<div><span style="color:var(--dim);font-size:0.55rem;">Income</span><br>' +
                            '<span style="font-size:0.9rem;color:var(--success);">+' +
                                income + 'g</span></div>' +
                        '<div><span style="color:var(--dim);font-size:0.55rem;">Expenses</span><br>' +
                            '<span style="font-size:0.9rem;color:var(--warn);">-' +
                                expenses + 'g</span></div>' +
                    '</div>' +
                    (salaryIncome > 0
                        ? '<div style="font-size:0.5rem;color:var(--accent);margin-top:4px;">Salary income: +' +
                            salaryIncome + 'g</div>' : '') +
                    (tuitionExpenses > 0
                        ? '<div style="font-size:0.5rem;color:var(--warn);">Tuition: -' +
                            tuitionExpenses + 'g</div>' : '') +
                    (rentIncome > 0 || rentExpense > 0
                        ? '<div style="font-size:0.5rem;color:var(--dim);">Rent income: +' +
                            rentIncome + 'g · Rent expenses: -' +
                            rentExpense + 'g</div>' : '') +
                    '<div style="text-align:center;margin-top:8px;padding:6px;background:var(--bg);border-radius:4px;">' +
                        '<span style="font-size:0.8rem;font-weight:bold;color:' +
                            netColor + ';">' +
                            'Net Change: ' + (netChange >= 0 ? '+' : '') +
                            netChange + 'g' +
                        '</span>' +
                    '</div>' +
                    '<div style="font-size:0.55rem;color:var(--dim);margin-top:4px;">' +
                        'New Wealth: ' + (wealth + netChange) + 'g' +
                        (debt > 0 ? ' · Debt: ' + debt + 'g' : '') +
                    '</div>' +
                '</div>' +
                '<div style="font-size:0.6rem;color:var(--warn);">' +
                    'Processing will apply annual income and expenses to the household. ' +
                    'It also consumes food based on member count and may trigger bankruptcy checks.' +
                '</div>' +
            '</div>';

        var modal = _openModal({
            title: 'Process Annual Economy: ' + household.name,
            content: content,
            confirmText: 'Process Year',
            cancelText: 'Cancel',
            onConfirm: function() {
                var root = _Modals.rootFrom(modal);
                if (!root) {
                    _showError('Modal root unavailable');
                    return false;
                }

                // processAnnualEconomy returns { success, data }.
                var result = _economy.processAnnualEconomy(householdId);
                if (!result || result.success === false) {
                    _Modals.reportFailure(result, 'Failed to process annual economy');
                    return false;
                }

                var data = result.data || {};
                var msg = 'Annual processing complete. Wealth: ' +
                    data.oldWealth + ' → ' + data.newWealth + 'g';
                if (data.bankrupt) msg += ' · BANKRUPTCY!';

                if (data.bankrupt) {
                    _showError(msg);
                } else {
                    _showSuccess(msg);
                }

                if (typeof onSuccess === 'function') onSuccess(data);
                return true;
            }
        });

        return modal;
    }

    // =========================================================================
    // 7. ECONOMIC EVENTS MODAL
    // =========================================================================

    function openHouseholdEconomicEventsModal(householdId, onSuccess) {
        var household = _queries.getHousehold(householdId);
        if (!household) {
            _showError('Household not found');
            return null;
        }

        var events = _economy.ECONOMIC_EVENTS || {};
        var eventKeys = Object.keys(events);

        var rows = '';
        for (var i = 0; i < eventKeys.length; i++) {
            var e = events[eventKeys[i]];
            rows += '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:var(--bg2);border-radius:4px;margin-bottom:4px;">' +
                '<div>' +
                    '<div style="font-size:0.65rem;">' +
                        _esc(e.name) + '</div>' +
                    '<div style="font-size:0.5rem;color:var(--dim);">' +
                        _esc(e.description || '') +
                        (e.chance !== undefined
                            ? ' · chance ' +
                                Math.round(e.chance * 100) + '%'
                            : '') +
                    '</div>' +
                '</div>' +
                '<button data-action="trigger-event" data-event-id="' +
                    _esc(e.id) +
                    '" style="padding:2px 8px;font-size:0.45rem;background:var(--accent-dim);border:1px solid var(--accent);border-radius:3px;cursor:pointer;">Trigger</button>' +
            '</div>';
        }

        var content =
            '<div style="margin-bottom:16px;">' +
                '<div style="background:var(--bg3);border-radius:6px;padding:12px;margin-bottom:12px;">' +
                    '<div style="font-size:0.7rem;"><strong>' +
                        _esc(household.name) + '</strong></div>' +
                    '<div style="font-size:0.55rem;color:var(--dim);margin-top:4px;">' +
                        'Trigger an economic event manually' +
                    '</div>' +
                '</div>' +
                '<div style="max-height:300px;overflow-y:auto;">' +
                    rows + '</div>' +
            '</div>';

        var modal = _openModal({
            title: 'Economic Events: ' + household.name,
            content: content,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function() { /* close only */ }
        });

        _Modals.onOpen(modal, function(root) {
            var btns = root.querySelectorAll('[data-action="trigger-event"]');
            for (var j = 0; j < btns.length; j++) {
                (function(btn) {
                    btn.onclick = function() {
                        var eventId = btn.dataset.eventId;
                        // triggerEconomicEvent returns { success, data }.
                        var result = _economy.triggerEconomicEvent(
                            householdId, eventId);
                        if (!result || result.success === false) {
                            _Modals.reportFailure(result, 'Failed to trigger event');
                            return;
                        }

                        var data = result.data || {};
                        var eventName = (data.event && data.event.name) ||
                            'Event';
                        var delta = typeof data.delta === 'number'
                            ? data.delta : 0;

                        if (delta === 0) {
                            _showInfo('Event triggered: ' + eventName +
                                ' (no change)');
                        } else {
                            _showInfo(
                                'Event triggered: ' + eventName +
                                ' (' + (delta > 0 ? '+' : '') + delta +
                                ' wealth)');
                        }

                        _closeTopModal();
                        setTimeout(function() {
                            if (typeof onSuccess === 'function') onSuccess(data);
                        }, 0);
                    };
                })(btns[j]);
            }
        });

        return modal;
    }

    // =========================================================================
    // 8. TRADE MODAL
    // =========================================================================

    function openHouseholdTradeModal(householdId, onSuccess) {
        var household = _queries.getHousehold(householdId);
        if (!household) {
            _showError('Household not found');
            return null;
        }

        var partners = _economy.getTradePartners(householdId);
        if (partners.length === 0) {
            _showInfo('No trade partners available in this location');
            return null;
        }

        var wealth = _economy.getHouseholdWealth(householdId);
        var resources = _economy.getHouseholdResources(householdId);

        var partnerOptions = '';
        for (var i = 0; i < partners.length; i++) {
            partnerOptions += '<option value="' + _esc(partners[i].id) + '">' +
                _esc(partners[i].name) + ' (' +
                (partners[i].memberCount || 0) + ' members)</option>';
        }

        var content =
            '<div style="margin-bottom:16px;">' +
                '<div style="background:var(--bg3);border-radius:6px;padding:12px;margin-bottom:12px;">' +
                    '<div style="font-size:0.7rem;"><strong>' +
                        _esc(household.name) + '</strong></div>' +
                    '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:8px;font-size:0.6rem;">' +
                        '<div><span style="color:var(--dim);">Wealth</span><br>' +
                            wealth + 'g</div>' +
                        '<div><span style="color:var(--dim);">Food</span><br>' +
                            resources.food + '</div>' +
                        '<div><span style="color:var(--dim);">Goods</span><br>' +
                            resources.goods + '</div>' +
                    '</div>' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Trade Partner</label>' +
                    '<select data-field="partnerId" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                        '<option value="">Select a partner</option>' +
                        partnerOptions +
                    '</select>' +
                '</div>' +

                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
                    '<div>' +
                        '<label style="display:block;font-size:0.6rem;color:var(--accent);margin-bottom:4px;">Give</label>' +
                        '<input type="number" data-field="giveWealth" placeholder="Wealth" value="0" min="0" ' +
                            'style="width:100%;padding:4px 6px;background:var(--bg);border:1px solid var(--border);border-radius:4px;font-size:0.65rem;margin-bottom:4px;">' +
                        '<input type="number" data-field="giveGoods" placeholder="Goods" value="0" min="0" ' +
                            'style="width:100%;padding:4px 6px;background:var(--bg);border:1px solid var(--border);border-radius:4px;font-size:0.65rem;">' +
                    '</div>' +
                    '<div>' +
                        '<label style="display:block;font-size:0.6rem;color:var(--accent);margin-bottom:4px;">Receive</label>' +
                        '<input type="number" data-field="receiveWealth" placeholder="Wealth" value="0" min="0" ' +
                            'style="width:100%;padding:4px 6px;background:var(--bg);border:1px solid var(--border);border-radius:4px;font-size:0.65rem;margin-bottom:4px;">' +
                        '<input type="number" data-field="receiveGoods" placeholder="Goods" value="0" min="0" ' +
                            'style="width:100%;padding:4px 6px;background:var(--bg);border:1px solid var(--border);border-radius:4px;font-size:0.65rem;">' +
                    '</div>' +
                '</div>' +

                '<div style="font-size:0.55rem;color:var(--dim);margin-top:8px;">' +
                    'Trade will be executed only if both parties have sufficient resources.' +
                '</div>' +
            '</div>';

        var modal = _openModal({
            title: 'Trade: ' + household.name,
            content: content,
            confirmText: 'Execute Trade',
            cancelText: 'Cancel',
            onConfirm: function() {
                var root = _Modals.rootFrom(modal);
                if (!root) {
                    _showError('Modal root unavailable');
                    return false;
                }

                var partnerId = _Modals.readValue(root, '[data-field="partnerId"]');
                if (!partnerId) {
                    _showError('Please select a trade partner');
                    return false;
                }

                var giveWealth = _Modals.readIntOrNull(
                    root, '[data-field="giveWealth"]') || 0;
                var giveGoods = _Modals.readIntOrNull(
                    root, '[data-field="giveGoods"]') || 0;
                var receiveWealth = _Modals.readIntOrNull(
                    root, '[data-field="receiveWealth"]') || 0;
                var receiveGoods = _Modals.readIntOrNull(
                    root, '[data-field="receiveGoods"]') || 0;

                if (giveWealth === 0 && giveGoods === 0 &&
                    receiveWealth === 0 && receiveGoods === 0) {
                    _showError('Specify at least one item to trade');
                    return false;
                }

                var trade = {
                    sourceGives: { wealth: giveWealth, goods: giveGoods },
                    targetGives: { wealth: receiveWealth, goods: receiveGoods }
                };

                // executeTrade returns { success, data }.
                var result = _economy.executeTrade(
                    householdId, partnerId, trade);
                if (!result || result.success === false) {
                    _Modals.reportFailure(result, 'Trade failed');
                    return false;
                }

                _showSuccess('Trade executed successfully');
                if (typeof onSuccess === 'function') onSuccess(result.data);
                return true;
            }
        });

        return modal;
    }

    // =========================================================================
    // 9. EXPORTS
    // =========================================================================

    window.openHouseholdWealthModal = openHouseholdWealthModal;
    window.openHouseholdResourcesModal = openHouseholdResourcesModal;
    window.openHouseholdIncomeModal = openHouseholdIncomeModal;
    window.openHouseholdExpensesModal = openHouseholdExpensesModal;
    window.openHouseholdEconomicEventsModal = openHouseholdEconomicEventsModal;
    window.openHouseholdTradeModal = openHouseholdTradeModal;
    window.openHouseholdAnnualProcessingModal = openHouseholdAnnualProcessingModal;
    window.openHouseholdEconomicSummaryModal = openHouseholdEconomicSummaryModal;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            openHouseholdWealthModal: openHouseholdWealthModal,
            openHouseholdResourcesModal: openHouseholdResourcesModal,
            openHouseholdIncomeModal: openHouseholdIncomeModal,
            openHouseholdExpensesModal: openHouseholdExpensesModal,
            openHouseholdEconomicEventsModal: openHouseholdEconomicEventsModal,
            openHouseholdTradeModal: openHouseholdTradeModal,
            openHouseholdAnnualProcessingModal: openHouseholdAnnualProcessingModal,
            openHouseholdEconomicSummaryModal: openHouseholdEconomicSummaryModal
        };
    }

})();
