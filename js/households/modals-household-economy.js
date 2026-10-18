/**
 * =============================================================================
 * STILL WATERS - HOUSEHOLD ECONOMY MODALS (modals-household-economy.js)
 * =============================================================================
 *
 * LOCATION: js/systems/household/modals-household-economy.js
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
 *           HouseholdCommands internally) + one persist() call per batch
 *   UI:     modals-core, icons
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
 * PERSIST CONTRACT
 * ----------------
 * Unlike the CRUD modals (modals-household.js), economy mutations persist
 * themselves via HouseholdEconomy → HouseholdCommands.persist(). The
 * modal just displays the result. Calling persist() again in the modal
 * would be redundant.
 *
 * EXCEPTION: batch operations in this modal that call MULTIPLE economy
 * mutations in one user action (e.g. "Add to All" in resources) still
 * persist per mutation because economy owns its save boundary. If the
 * user wants batch semantics, they must call HouseholdEconomy once with
 * a bulk shape — which economy does not currently support. That's
 * deferred.
 *
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. LOAD-TIME DEPENDENCY VERIFICATION
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

    var _economy = _requireObject('HouseholdEconomy', window.HouseholdEconomy);
    _requireFunction('HouseholdEconomy.getHouseholdWealth',
        _economy.getHouseholdWealth);
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

    var _openModal = _requireFunction('openModal',
        typeof window.openModal === 'function'
            ? window.openModal
            : window._openModal);
    var _closeTopModal = _requireFunction('closeTopModal',
        typeof window.closeTopModal === 'function'
            ? window.closeTopModal
            : window._closeTopModal);

    // =========================================================================
    // 2. HELPERS
    // =========================================================================

    function _escapeHtml(str) {
        if (typeof window._escapeHtml === 'function') return window._escapeHtml(str);
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
        if (str === undefined || str === null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _showToast(message, type) {
        if (typeof window._showToast === 'function') {
            return window._showToast(message, type);
        }
        if (typeof window.showToast === 'function') {
            return window.showToast(message, type);
        }
    }

    function _currentYear() {
        if (typeof window.getCurrentYearSafe === 'function') {
            return window.getCurrentYearSafe();
        }
        return null;
    }

    function _resolveModalRoot() {
        if (typeof document === 'undefined') return null;
        return document.querySelector('[data-modal-root="top"]') ||
               document.querySelector('.modal-root:last-of-type') ||
               document.body;
    }

    function _attachOnOpen(handler) {
        return function() {
            var root = _resolveModalRoot();
            if (root) handler(root);
        };
    }

    function _parseIntOrNull(value) {
        if (value === undefined || value === null) return null;
        var s = String(value).trim();
        if (s === '') return null;
        var n = Number(s);
        if (!isFinite(n)) return null;
        return Math.floor(n);
    }

    /**
     * Display the failure reason from an economy mutation result. Does
     * not persist — economy already did.
     */
    function _reportFailure(result, fallbackPrefix) {
        var reason = (result && result.reason) || 'Unknown error';
        _showToast((fallbackPrefix || 'Operation failed') + ': ' + reason, 'error');
    }

    // =========================================================================
    // 3. ECONOMIC SUMMARY MODAL (pure projection)
    // =========================================================================

    function openHouseholdEconomicSummaryModal(householdId) {
        var household = _queries.getHousehold(householdId);
        if (!household) {
            _showToast('Household not found', 'error');
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

        // Enterprise data — may throw if Industry is missing but enterprises exist
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
                _escapeHtml(d.household.name) + '</strong></div>' +
            '<div style="font-size:0.55rem;color:var(--dim);">Economic Summary' +
                (d.year !== null ? ' · Year ' + d.year : '') +
            '</div>' +
        '</div>';

        html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px;">' +
            _metricCell('Wealth', d.wealth + 'g',
                d.wealth >= 0 ? 'var(--success)' : 'var(--danger)') +
            _metricCell('Debt', d.debt + 'g',
                d.debt > 0 ? 'var(--warn)' : null) +
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

        var netColor = d.netChange >= 0 ? 'var(--success)' : 'var(--danger)';
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
                _escapeHtml(label) + '</div>' +
            '<div style="font-size:0.9rem;font-weight:bold;' +
                (color ? 'color:' + color + ';' : '') + '">' +
                _escapeHtml(String(value)) +
            '</div>' +
        '</div>';
    }

    function _buildRentSection(rentIncome, rentExpenses) {
        var net = rentIncome - rentExpenses;
        var netColor = net >= 0 ? 'var(--success)' : 'var(--danger)';

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
        var profitColor = totalProfit >= 0 ? 'var(--success)' : 'var(--danger)';

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
            _escapeHtml(ownershipBreakdown) + '</div>';

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
                var pc = profit >= 0 ? 'var(--success)' : 'var(--danger)';
                var ownership = s.ownershipType === 'public'
                    ? ' <span style="font-size:0.4rem;color:var(--accent);">(Public)</span>'
                    : '';
                html += '<div style="display:flex;justify-content:space-between;padding:2px 0;border-bottom:1px solid var(--border-light);font-size:0.5rem;">' +
                    '<span>' + _escapeHtml(s.name) + ownership + '</span>' +
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
    // 4. WEALTH MODAL
    // =========================================================================

    function openHouseholdWealthModal(householdId, onSuccess) {
        var household = _queries.getHousehold(householdId);
        if (!household) {
            _showToast('Household not found', 'error');
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
                        _escapeHtml(household.name) + '</strong></div>' +
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
                                _escapeHtml(tier.label) + '</span></div>' +
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

        var handle = _openModal({
            title: 'Wealth: ' + household.name,
            content: content,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function() { /* close only */ }
        });

        setTimeout(_attachOnOpen(function(root) {
            _wireWealthActions(root, householdId, onSuccess);
        }), 0);

        return handle;
    }

    function _wireWealthActions(root, householdId, onSuccess) {
        function _readDelta(fieldName) {
            var el = root.querySelector('[data-field="' + fieldName + '"]');
            return _parseIntOrNull(el ? el.value : null);
        }

        function _readReason() {
            var el = root.querySelector('[data-field="wealthReason"]');
            return el && el.value ? el.value.trim() : 'Modified';
        }

        function _closeAndRefresh() {
            _closeTopModal();
            if (typeof onSuccess === 'function') onSuccess();
        }

        var addBtn = root.querySelector('[data-action="wealth-add"]');
        if (addBtn) {
            addBtn.onclick = function() {
                var delta = Math.abs(_readDelta('wealthDelta') || 0);
                if (delta === 0) {
                    _showToast('Enter a value', 'warning');
                    return;
                }
                var result = _economy.updateHouseholdWealth(
                    householdId, delta, 'Added: ' + _readReason());
                if (!result.success) {
                    _reportFailure(result, 'Failed to update wealth');
                    return;
                }
                _showToast(
                    'Wealth increased by ' + delta +
                    ' (now ' + result.data.newWealth + 'g)',
                    'success');
                _closeAndRefresh();
            };
        }

        var subBtn = root.querySelector('[data-action="wealth-subtract"]');
        if (subBtn) {
            subBtn.onclick = function() {
                var delta = Math.abs(_readDelta('wealthDelta') || 0);
                if (delta === 0) {
                    _showToast('Enter a value', 'warning');
                    return;
                }
                var result = _economy.updateHouseholdWealth(
                    householdId, -delta, 'Subtracted: ' + _readReason());
                if (!result.success) {
                    _reportFailure(result, 'Failed to update wealth');
                    return;
                }
                _showToast(
                    'Wealth decreased by ' + delta +
                    ' (now ' + result.data.newWealth + 'g)',
                    'info');
                _closeAndRefresh();
            };
        }

        var setBtn = root.querySelector('[data-action="wealth-set"]');
        if (setBtn) {
            setBtn.onclick = function() {
                var target = _readDelta('wealthDelta');
                if (target === null || target < 0) {
                    _showToast('Enter a non-negative value', 'error');
                    return;
                }
                var current = _economy.getHouseholdWealth(householdId);
                var diff = target - current;
                var result = _economy.updateHouseholdWealth(
                    householdId, diff,
                    'Set to ' + target + ': ' + _readReason());
                if (!result.success) {
                    _reportFailure(result, 'Failed to update wealth');
                    return;
                }
                _showToast('Wealth set to ' + result.data.newWealth + 'g',
                    'success');
                _closeAndRefresh();
            };
        }

        var debtAddBtn = root.querySelector('[data-action="debt-add"]');
        if (debtAddBtn) {
            debtAddBtn.onclick = function() {
                var delta = _readDelta('debtDelta') || 0;
                if (delta <= 0) {
                    _showToast('Enter a positive value', 'warning');
                    return;
                }
                var result = _economy.modifyHouseholdDebt(householdId, delta);
                if (!result.success) {
                    _reportFailure(result, 'Failed to update debt');
                    return;
                }
                _showToast(
                    'Debt increased by ' + delta +
                    ' (now ' + result.data.newDebt + 'g)',
                    'info');
                _closeAndRefresh();
            };
        }

        var debtPayBtn = root.querySelector('[data-action="debt-pay"]');
        if (debtPayBtn) {
            debtPayBtn.onclick = function() {
                var delta = _readDelta('debtDelta') || 0;
                if (delta <= 0) {
                    _showToast('Enter a positive value', 'warning');
                    return;
                }
                var current = _economy.getHouseholdDebt(householdId);
                var paid = Math.min(delta, current);
                var result = _economy.modifyHouseholdDebt(householdId, -paid);
                if (!result.success) {
                    _reportFailure(result, 'Failed to update debt');
                    return;
                }
                _showToast(
                    'Paid ' + paid + 'g debt (now ' +
                    result.data.newDebt + 'g)',
                    'success');
                _closeAndRefresh();
            };
        }
    }

    // =========================================================================
    // 5. RESOURCES MODAL
    // =========================================================================

    function openHouseholdResourcesModal(householdId, onSuccess) {
        var household = _queries.getHousehold(householdId);
        if (!household) {
            _showToast('Household not found', 'error');
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
                        _escapeHtml(household.name) + '</strong></div>' +
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

        var handle = _openModal({
            title: 'Resources: ' + household.name,
            content: content,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function() { /* close only */ }
        });

        setTimeout(_attachOnOpen(function(root) {
            _wireResourcesActions(root, householdId, onSuccess);
        }), 0);

        return handle;
    }

    function _wireResourcesActions(root, householdId, onSuccess) {
        function _getDelta() {
            var el = root.querySelector('[data-field="resourceDelta"]');
            var n = _parseIntOrNull(el ? el.value : null);
            if (n === null || n <= 0) return null;
            return n;
        }

        function _closeAndRefresh() {
            _closeTopModal();
            if (typeof onSuccess === 'function') onSuccess();
        }

        var addBtns = root.querySelectorAll('[data-action="resource-add"]');
        for (var i = 0; i < addBtns.length; i++) {
            (function(btn) {
                btn.onclick = function() {
                    var delta = _getDelta();
                    if (delta === null) {
                        _showToast('Enter a positive value', 'warning');
                        return;
                    }
                    var type = btn.dataset.type;
                    var result = _economy.updateHouseholdResources(
                        householdId, type, delta);
                    if (!result.success) {
                        _reportFailure(result, 'Failed to update resources');
                        return;
                    }
                    _showToast(
                        type + ' increased by ' + delta +
                        ' (now ' + result.data.newValue + ')',
                        'success');
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
                        _showToast('Enter a positive value', 'warning');
                        return;
                    }
                    var type = btn.dataset.type;
                    var result = _economy.updateHouseholdResources(
                        householdId, type, -delta);
                    if (!result.success) {
                        _reportFailure(result, 'Failed to update resources');
                        return;
                    }
                    _showToast(
                        type + ' decreased by ' + delta +
                        ' (now ' + result.data.newValue + ')',
                        'info');
                    _closeAndRefresh();
                };
            })(subBtns[j]);
        }

        var addAllBtn = root.querySelector('[data-action="resource-add-all"]');
        if (addAllBtn) {
            addAllBtn.onclick = function() {
                var delta = _getDelta();
                if (delta === null) {
                    _showToast('Enter a positive value', 'warning');
                    return;
                }
                // Batch: economy persists per mutation. Three mutations
                // = three saves. Deferred: bulk resource mutation.
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
                    _showToast(
                        'All resources increased by ' + delta,
                        'success');
                } else if (succeeded > 0) {
                    _showToast(
                        succeeded + ' resource(s) updated, ' +
                        failed + ' failed',
                        'warning');
                } else {
                    _showToast('Failed to update resources', 'error');
                }
                _closeAndRefresh();
            };
        }
    }

    // =========================================================================
    // 6. INCOME MODAL (pure projection)
    // =========================================================================

    function openHouseholdIncomeModal(householdId) {
        var household = _queries.getHousehold(householdId);
        if (!household) {
            _showToast('Household not found', 'error');
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
                        _escapeHtml(household.name) + '</strong></div>' +
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
            '<span>' + _escapeHtml(label) + '</span>' +
            '<span>' + amount + 'g</span>' +
        '</div>';
    }

    // =========================================================================
    // 7. EXPENSES MODAL (pure projection)
    // =========================================================================

    function openHouseholdExpensesModal(householdId) {
        var household = _queries.getHousehold(householdId);
        if (!household) {
            _showToast('Household not found', 'error');
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
                        _escapeHtml(household.name) + '</strong></div>' +
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
            '<span>' + _escapeHtml(label) + '</span>' +
            '<span>' + amount + 'g</span>' +
        '</div>';
    }

    // =========================================================================
    // 8. ANNUAL PROCESSING MODAL
    // =========================================================================
    //
    // processAnnualEconomy now returns { success, data }. The old code
    // read .oldWealth / .newWealth / .bankrupt directly. This was broken
    // by the economy refactor.
    // =========================================================================

    function openHouseholdAnnualProcessingModal(householdId, onSuccess) {
        var household = _queries.getHousehold(householdId);
        if (!household) {
            _showToast('Household not found', 'error');
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

        var netColor = netChange >= 0 ? 'var(--success)' : 'var(--warn)';

        var content =
            '<div style="margin-bottom:16px;">' +
                '<div style="background:var(--bg3);border-radius:6px;padding:12px;margin-bottom:12px;">' +
                    '<div style="font-size:0.7rem;"><strong>' +
                        _escapeHtml(household.name) + '</strong></div>' +
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

        return _openModal({
            title: 'Process Annual Economy: ' + household.name,
            content: content,
            confirmText: 'Process Year',
            cancelText: 'Cancel',
            onConfirm: function() {
                var result = _economy.processAnnualEconomy(householdId);
                if (!result || result.success === false) {
                    _reportFailure(result, 'Failed to process annual economy');
                    return false;
                }

                var data = result.data || {};
                var msg = 'Annual processing complete. Wealth: ' +
                    data.oldWealth + ' → ' + data.newWealth + 'g';
                if (data.bankrupt) msg += ' · BANKRUPTCY!';

                _showToast(msg, data.bankrupt ? 'error' : 'success');

                if (typeof onSuccess === 'function') onSuccess(data);
                return true;
            }
        });
    }

    // =========================================================================
    // 9. ECONOMIC EVENTS MODAL
    // =========================================================================
    //
    // triggerEconomicEvent now returns { success, data }. The old code
    // read .event.name / .delta directly off the result. Broken.
    // =========================================================================

    function openHouseholdEconomicEventsModal(householdId, onSuccess) {
        var household = _queries.getHousehold(householdId);
        if (!household) {
            _showToast('Household not found', 'error');
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
                        _escapeHtml(e.name) + '</div>' +
                    '<div style="font-size:0.5rem;color:var(--dim);">' +
                        _escapeHtml(e.description || '') +
                        (e.chance !== undefined
                            ? ' · chance ' +
                                Math.round(e.chance * 100) + '%'
                            : '') +
                    '</div>' +
                '</div>' +
                '<button data-action="trigger-event" data-event-id="' +
                    _escapeHtml(e.id) +
                    '" style="padding:2px 8px;font-size:0.45rem;background:var(--accent-dim);border:1px solid var(--accent);border-radius:3px;cursor:pointer;">Trigger</button>' +
            '</div>';
        }

        var content =
            '<div style="margin-bottom:16px;">' +
                '<div style="background:var(--bg3);border-radius:6px;padding:12px;margin-bottom:12px;">' +
                    '<div style="font-size:0.7rem;"><strong>' +
                        _escapeHtml(household.name) + '</strong></div>' +
                    '<div style="font-size:0.55rem;color:var(--dim);margin-top:4px;">' +
                        'Trigger an economic event manually' +
                    '</div>' +
                '</div>' +
                '<div style="max-height:300px;overflow-y:auto;">' +
                    rows + '</div>' +
            '</div>';

        var handle = _openModal({
            title: 'Economic Events: ' + household.name,
            content: content,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function() { /* close only */ }
        });

        setTimeout(_attachOnOpen(function(root) {
            var btns = root.querySelectorAll('[data-action="trigger-event"]');
            for (var i = 0; i < btns.length; i++) {
                (function(btn) {
                    btn.onclick = function() {
                        var eventId = btn.dataset.eventId;
                        var result = _economy.triggerEconomicEvent(
                            householdId, eventId);
                        if (!result || result.success === false) {
                            _reportFailure(result, 'Failed to trigger event');
                            return;
                        }

                        var data = result.data || {};
                        var eventName = (data.event && data.event.name) ||
                            'Event';
                        var delta = typeof data.delta === 'number'
                            ? data.delta : 0;
                        _showToast(
                            'Event triggered: ' + eventName +
                            ' (' + (delta > 0 ? '+' : '') + delta +
                            ' wealth)',
                            'info');
                        _closeTopModal();
                        if (typeof onSuccess === 'function') onSuccess(data);
                    };
                })(btns[i]);
            }
        }), 0);

        return handle;
    }

    // =========================================================================
    // 10. TRADE MODAL
    // =========================================================================
    //
    // executeTrade already returned { success, data }. No change needed
    // for shape, but persist is now internal to economy per household
    // (via _applyTradeSide → _applyMutation → _commands.persist).
    // =========================================================================

    function openHouseholdTradeModal(householdId, onSuccess) {
        var household = _queries.getHousehold(householdId);
        if (!household) {
            _showToast('Household not found', 'error');
            return null;
        }

        var partners = _economy.getTradePartners(householdId);
        if (partners.length === 0) {
            _showToast('No trade partners available in this location', 'info');
            return null;
        }

        var wealth = _economy.getHouseholdWealth(householdId);
        var resources = _economy.getHouseholdResources(householdId);

        var partnerOptions = '';
        for (var i = 0; i < partners.length; i++) {
            partnerOptions += '<option value="' + _escapeHtml(partners[i].id) + '">' +
                _escapeHtml(partners[i].name) + ' (' +
                (partners[i].memberCount || 0) + ' members)</option>';
        }

        var content =
            '<div style="margin-bottom:16px;">' +
                '<div style="background:var(--bg3);border-radius:6px;padding:12px;margin-bottom:12px;">' +
                    '<div style="font-size:0.7rem;"><strong>' +
                        _escapeHtml(household.name) + '</strong></div>' +
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

        return _openModal({
            title: 'Trade: ' + household.name,
            content: content,
            confirmText: 'Execute Trade',
            cancelText: 'Cancel',
            onConfirm: function() {
                var root = _resolveModalRoot();
                if (!root) return false;

                var partnerId = (root.querySelector('[data-field="partnerId"]') || {}).value;
                if (!partnerId) {
                    _showToast('Please select a trade partner', 'error');
                    return false;
                }

                var giveWealth = _parseIntOrNull(
                    (root.querySelector('[data-field="giveWealth"]') || {}).value) || 0;
                var giveGoods = _parseIntOrNull(
                    (root.querySelector('[data-field="giveGoods"]') || {}).value) || 0;
                var receiveWealth = _parseIntOrNull(
                    (root.querySelector('[data-field="receiveWealth"]') || {}).value) || 0;
                var receiveGoods = _parseIntOrNull(
                    (root.querySelector('[data-field="receiveGoods"]') || {}).value) || 0;

                if (giveWealth === 0 && giveGoods === 0 &&
                    receiveWealth === 0 && receiveGoods === 0) {
                    _showToast('Specify at least one item to trade', 'error');
                    return false;
                }

                var trade = {
                    sourceGives: { wealth: giveWealth, goods: giveGoods },
                    targetGives: { wealth: receiveWealth, goods: receiveGoods }
                };

                var result = _economy.executeTrade(
                    householdId, partnerId, trade);
                if (!result || result.success === false) {
                    _reportFailure(result, 'Trade failed');
                    return false;
                }

                _showToast('Trade executed successfully', 'success');
                if (typeof onSuccess === 'function') onSuccess(result.data);
                return true;
            }
        });
    }

    // =========================================================================
    // 11. EXPORTS
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
