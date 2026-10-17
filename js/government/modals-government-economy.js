/**
 * modals-government-economy.js
 * Salary management, salary budget, industry tax, and government summary modals.
 * Reads via GovernmentQueries + GovernmentEconomy + GovernmentViewModels.
 * Writes via GovernmentCommands. One persist per successful mutation.
 *
 * Removed dependencies: GovernmentRules (via Economy.getSalaryTier now),
 * all inline domain numbers (via GovernmentConstants).
 */
(function() {
    'use strict';

    var C = window.GovernmentConstants;
    var Queries = window.GovernmentQueries;
    var Commands = window.GovernmentCommands;
    var Economy = window.GovernmentEconomy;
    var VM = window.GovernmentViewModels;
    var _LocationQueries = window.LocationQueries;

    if (!C) throw new Error('modals-government-economy.js requires GovernmentConstants');
    if (!Queries) throw new Error('modals-government-economy.js requires GovernmentQueries');
    if (!Commands) throw new Error('modals-government-economy.js requires GovernmentCommands');
    if (!Economy) throw new Error('modals-government-economy.js requires GovernmentEconomy');
    if (!VM) throw new Error('modals-government-economy.js requires GovernmentViewModels');
    if (!_LocationQueries) throw new Error('modals-government-economy.js requires LocationQueries');

    function _escapeHtml(str) {
        if (typeof window._escapeHtml === 'function') return window._escapeHtml(str);
        if (!str && str !== 0) return '';
        return String(str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function _attr(s) { return _escapeHtml(s); }

    function _toast(msg, type) {
        var plain = typeof msg === 'string' ? msg.replace(/<[^>]*>/g, '') : msg;
        if (typeof window._showToast === 'function') window._showToast(plain, type);
        else if (typeof window.showToast === 'function') window.showToast(plain, type);
        else if (typeof window.showToastMessage === 'function') window.showToastMessage(plain, type);
    }
    function _openModal(opts) {
        if (typeof window.openModal !== 'function') throw new Error('openModal not available');
        return window.openModal(opts);
    }
    function _closeTopModal() {
        if (typeof window.closeTopModal === 'function') window.closeTopModal();
    }
    function _getIcon(name) {
        if (typeof window._getIcon === 'function') return window._getIcon(name);
        return window.Icons && window.Icons[name] ? window.Icons[name] : '';
    }
    function _iconSpan(name) {
        var i = _getIcon(name);
        return i ? '<span style="display:inline-flex;align-items:center;vertical-align:middle;">' + i + '</span>' : '';
    }

    function _commitAndPersist() {
        var p = Commands.persist();
        if (!p.success) {
            _toast('Saved in memory, but persisting failed: ' + (p.reason || 'unknown'), 'warning');
        }
    }

    function _parseSalary(value) {
        var n = Number(value);
        return (Number.isFinite(n) && n >= C.MIN_SALARY && n <= C.MAX_SALARY) ? Math.round(n) : null;
    }

    // ---- Salary management ---------------------------------------------------

    function openSalaryManagementModal(departmentId, positionId, onSuccess) {
        var dept = Queries.getDepartment(departmentId);
        if (!dept) { _toast('Department not found', 'error'); return; }

        var position = Queries.getPosition(departmentId, positionId);
        if (!position) { _toast('Position not found', 'error'); return; }

        var currentSalary = Economy.calculatePositionSalary(departmentId, positionId);
        if (currentSalary == null) currentSalary = 0;

        var tier = Economy.getSalaryTier(position.priority);
        var history = Economy.getPositionSalaryHistory(departmentId, positionId) || [];
        var vm = VM.toSalaryViewModel(position, currentSalary, tier, history);
        if (!vm) { _toast('Salary data unavailable', 'error'); return; }

        var infoIcon = _iconSpan('CIRCLE_DOT');

        var historyHtml = '';
        if (vm.history.length === 0) {
            historyHtml = '<div style="font-size:0.55rem;color:var(--dim);text-align:center;">No history</div>';
        } else {
            for (var i = 0; i < vm.history.length; i++) {
                var h = vm.history[i];
                var color = h.isCurrent ? 'var(--accent)' : 'var(--dim)';
                historyHtml +=
                    '<div style="display:flex;justify-content:space-between;padding:2px 0;font-size:0.55rem;border-bottom:1px solid var(--border);">' +
                    '<span style="color:' + color + ';">' + _escapeHtml(h.yearLabel) +
                    (h.source === 'override' ? ' (override)' : '') +
                    (h.reason ? ' — ' + _escapeHtml(h.reason) : '') +
                    '</span>' +
                    '<span style="color:' + color + ';">' + h.salary + ' gold</span>' +
                    '</div>';
            }
        }

        var html =
            '<div style="margin-bottom:12px;padding:8px;background:var(--bg2);border-radius:6px;">' +
            '<strong>Department:</strong> ' + _escapeHtml(dept.name) + '<br>' +
            '<strong>Position:</strong> ' + _escapeHtml(position.name) +
            '</div>' +
            '<div style="background:var(--bg3);padding:12px;border-radius:6px;margin-bottom:12px;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">' +
            '<div>' +
            '<div style="font-size:0.55rem;color:var(--dim);">Current Salary</div>' +
            '<div style="font-size:1.2rem;font-weight:bold;color:var(--accent);">' + vm.currentSalary + ' gold/year</div>' +
            '</div>' +
            '<div style="text-align:right;">' +
            '<div style="font-size:0.55rem;color:var(--dim);">Tier</div>' +
            '<div style="font-size:0.8rem;">' + _escapeHtml(vm.tierName || '') + '</div>' +
            '</div>' +
            '</div>' +
            '</div>' +
            '<div class="form-group" style="margin-bottom:12px;">' +
            '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Override Salary</label>' +
            '<div style="display:flex;gap:8px;align-items:center;">' +
            '<input type="number" id="salaryOverride" value="' + vm.currentSalary + '" min="' + C.MIN_SALARY + '" max="' + C.MAX_SALARY + '" style="width:150px;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
            '<span style="font-size:0.55rem;color:var(--dim);">gold/year</span>' +
            '<button type="button" id="applySalaryOverrideBtn" class="btn primary" style="padding:4px 12px;font-size:0.6rem;background:var(--accent);border:1px solid var(--accent);color:white;border-radius:4px;cursor:pointer;">Apply Override</button>' +
            '</div>' +
            '<small style="font-size:0.5rem;color:var(--dim);">Override appends to history. Calculated salary is used until an override exists.</small>' +
            '</div>' +
            (historyHtml ? '<div style="margin-bottom:12px;">' +
                '<div style="font-size:0.6rem;color:var(--dim);margin-bottom:4px;">Salary History</div>' +
                '<div style="max-height:120px;overflow-y:auto;background:var(--bg3);padding:8px;border-radius:4px;">' +
                historyHtml +
                '</div>' +
                '</div>' : '') +
            '<div style="padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;color:var(--dim);">' +
            infoIcon + ' Salary is calculated from tier, location prosperity, and current holder experience. Overrides take precedence.' +
            '</div>';

        _openModal({
            title: 'Salary Management: ' + position.name,
            content: html,
            confirmText: 'Close',
            cancelText: '',
            onMount: function(root) {
                var applyBtn = root.querySelector('#applySalaryOverrideBtn');
                var input = root.querySelector('#salaryOverride');
                if (applyBtn && input) {
                    applyBtn.addEventListener('click', function() {
                        var newSalary = _parseSalary(input.value);
                        if (newSalary == null) {
                            _toast('Enter a valid non-negative salary', 'error');
                            return;
                        }
                        var result = Commands.updatePositionSalary(departmentId, positionId, newSalary, {
                            reason: 'Manual override'
                        });
                        if (!result.success) {
                            _toast(result.reason || 'Failed to update salary', 'error');
                            return;
                        }
                        _commitAndPersist();
                        _toast('Salary override applied: ' + newSalary + ' gold/year', 'success');
                        _closeTopModal();
                        if (onSuccess) onSuccess(result.data);
                        // Reopen with fresh data.
                        openSalaryManagementModal(departmentId, positionId, onSuccess);
                    });
                }
            },
            onConfirm: function() { _closeTopModal(); }
        });
    }

    // ---- Salary budget viewer ------------------------------------------------

    function openGovernmentBudgetModal(locationId) {
        var location = _LocationQueries.getPlaceSummary(locationId);
        if (!location) { _toast('Location not found', 'error'); return; }

        var departments = Queries.getDepartmentsByLocation(locationId, {});
        var reqs = [];
        for (var i = 0; i < departments.length; i++) {
            var req = Economy.calculateDepartmentSalaryRequirements(departments[i].id);
            if (req) reqs.push(req);
        }

        var vm = VM.toLocationBudgetViewModel(location, reqs);
        if (!vm) { _toast('Budget data unavailable', 'error'); return; }

        var infoIcon = _iconSpan('CIRCLE_DOT');
        var coinIcon = _iconSpan('COIN');

        var rowsHtml = '';
        if (vm.departments.length === 0) {
            rowsHtml = '<div style="text-align:center;padding:12px;color:var(--dim);font-size:0.6rem;">No departments found</div>';
        } else {
            for (var j = 0; j < vm.departments.length; j++) {
                var r = vm.departments[j];
                rowsHtml +=
                    '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border);font-size:0.55rem;">' +
                    '<span>' + _escapeHtml(r.departmentName) + '</span>' +
                    '<span>' + r.filledPositions + '/' + r.totalPositions + ' filled · ' + r.totalSalaryRequirement + ' gold</span>' +
                    '</div>';
            }
        }

        var html =
            '<div style="max-height:500px;overflow-y:auto;padding:4px;">' +
            '<div style="margin-bottom:16px;padding:12px;background:var(--bg2);border-radius:8px;">' +
            '<strong>' + coinIcon + ' Salary Budget</strong>' +
            '<div style="font-size:0.65rem;color:var(--dim);">' + _escapeHtml(vm.locationName) + '</div>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px;">' +
            '<div style="background:var(--bg2);padding:12px;border-radius:8px;text-align:center;">' +
            '<div style="font-size:0.55rem;color:var(--dim);">Total Salary Requirement</div>' +
            '<div style="font-size:1.2rem;font-weight:bold;color:var(--accent);">' + vm.summary.totalSalaryRequirement + ' gold</div>' +
            '</div>' +
            '<div style="background:var(--bg2);padding:12px;border-radius:8px;text-align:center;">' +
            '<div style="font-size:0.55rem;color:var(--dim);">Filled Positions</div>' +
            '<div style="font-size:1.2rem;font-weight:bold;">' + vm.summary.filledPositions + '</div>' +
            '</div>' +
            '<div style="background:var(--bg2);padding:12px;border-radius:8px;text-align:center;">' +
            '<div style="font-size:0.55rem;color:var(--dim);">Departments</div>' +
            '<div style="font-size:1.2rem;font-weight:bold;">' + vm.summary.departmentCount + '</div>' +
            '</div>' +
            '</div>' +
            '<div style="margin-bottom:12px;">' +
            '<div style="font-size:0.65rem;color:var(--accent);margin-bottom:8px;">Department Breakdown</div>' +
            '<div style="max-height:200px;overflow-y:auto;background:var(--bg3);padding:8px;border-radius:4px;">' +
            rowsHtml +
            '</div>' +
            '</div>' +
            '<div style="padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;color:var(--dim);">' +
            infoIcon + ' Total salary requirement is what Settlement needs to allocate to cover all filled positions.' +
            '</div>' +
            '</div>';

        _openModal({
            title: 'Salary Budget: ' + vm.locationName,
            content: html,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function() { _closeTopModal(); }
        });
    }

    // ---- Industry tax revenue ------------------------------------------------

    function openTaxRevenueModal(locationId) {
        var location = _LocationQueries.getPlaceSummary(locationId);
        if (!location) { _toast('Location not found', 'error'); return; }

        var stats = Queries.getIndustryEnterpriseStats(locationId);
        if (!stats) { _toast('Industry data not available', 'error'); return; }

        var taxRevenue = Queries.getIndustryTaxRevenue(locationId);
        var taxRate = Queries.getIndustryTaxRate(locationId);

        var vm = VM.toTaxRevenueViewModel(location, taxRevenue, taxRate, stats);
        if (!vm) { _toast('Tax data unavailable', 'error'); return; }

        var infoIcon = _iconSpan('CIRCLE_DOT');
        var coinIcon = _iconSpan('COIN');

        var html =
            '<div style="max-height:500px;overflow-y:auto;padding:4px;">' +
            '<div style="margin-bottom:16px;padding:12px;background:var(--bg2);border-radius:8px;">' +
            '<strong>' + coinIcon + ' Industry Tax Revenue</strong>' +
            '<div style="font-size:0.65rem;color:var(--dim);">' + _escapeHtml(vm.locationName) + '</div>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px;">' +
            '<div style="background:var(--bg2);padding:12px;border-radius:8px;text-align:center;">' +
            '<div style="font-size:0.55rem;color:var(--dim);">Tax Revenue</div>' +
            '<div style="font-size:1.2rem;font-weight:bold;color:var(--success);">' + vm.taxRevenue + ' gold</div>' +
            '</div>' +
            '<div style="background:var(--bg2);padding:12px;border-radius:8px;text-align:center;">' +
            '<div style="font-size:0.55rem;color:var(--dim);">Enterprises</div>' +
            '<div style="font-size:1.2rem;font-weight:bold;">' + (vm.enterpriseStats ? vm.enterpriseStats.totalEnterprises : 0) + '</div>' +
            '</div>' +
            '<div style="background:var(--bg2);padding:12px;border-radius:8px;text-align:center;">' +
            '<div style="font-size:0.55rem;color:var(--dim);">Health Score</div>' +
            '<div style="font-size:1.2rem;font-weight:bold;">' + (vm.enterpriseStats ? vm.enterpriseStats.healthScore : '—') + '</div>' +
            '</div>' +
            '</div>' +
            (vm.enterpriseStats ? (
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">' +
                '<div style="background:var(--bg3);padding:12px;border-radius:6px;">' +
                '<div style="font-size:0.6rem;color:var(--accent);margin-bottom:4px;">Profitability</div>' +
                '<div style="font-size:0.55rem;">' +
                '<div style="display:flex;justify-content:space-between;padding:2px 0;">' +
                '<span style="color:var(--dim);">Profitable</span><span>' + vm.enterpriseStats.profitable + '</span></div>' +
                '<div style="display:flex;justify-content:space-between;padding:2px 0;">' +
                '<span style="color:var(--dim);">Unprofitable</span><span>' + vm.enterpriseStats.unprofitable + '</span></div>' +
                '<div style="display:flex;justify-content:space-between;padding:2px 0;">' +
                '<span style="color:var(--dim);">Avg Profit</span><span>' + vm.enterpriseStats.averageProfit + '</span></div>' +
                '</div>' +
                '</div>' +
                '<div style="background:var(--bg3);padding:12px;border-radius:6px;">' +
                '<div style="font-size:0.6rem;color:var(--accent);margin-bottom:4px;">Rates</div>' +
                '<div style="font-size:0.55rem;">' +
                '<div style="display:flex;justify-content:space-between;padding:2px 0;">' +
                '<span style="color:var(--dim);">Industry Tax</span><span>' + _escapeHtml(vm.taxRateLabel) + '</span></div>' +
                '<div style="display:flex;justify-content:space-between;padding:2px 0;">' +
                '<span style="color:var(--dim);">Total Workers</span><span>' + vm.enterpriseStats.totalWorkers + '</span></div>' +
                '</div>' +
                '</div>' +
                '</div>'
            ) : '') +
            '<div style="padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;color:var(--dim);">' +
            infoIcon + ' Tax revenue is calculated from profitable enterprise profits and the configured industry tax rate.' +
            '</div>' +
            '</div>';

        _openModal({
            title: 'Industry Tax Revenue: ' + vm.locationName,
            content: html,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function() { _closeTopModal(); }
        });
    }

    // ---- Government summary (was: financial report + efficiency) -------------

    function openGovernmentSummaryModal(locationId) {
        var location = _LocationQueries.getPlaceSummary(locationId);
        if (!location) { _toast('Location not found', 'error'); return; }

        var budgetSufficiency = Queries.getSalaryBudgetSufficiency(locationId);
        var allocatedBudget = budgetSufficiency ? budgetSufficiency.allocatedBudget : null;

        var departments = Queries.getDepartmentsByLocation(locationId, {});
        var totalSalaryRequirement = 0;
        for (var i = 0; i < departments.length; i++) {
            var req = Economy.calculateDepartmentSalaryRequirements(departments[i].id);
            if (req) totalSalaryRequirement += req.totalSalaryRequirement;
        }

        var taxRevenue = Queries.getIndustryTaxRevenue(locationId);
        var stats = Queries.getIndustryEnterpriseStats(locationId);

        var vm = VM.toGovernmentSummaryViewModel(
            location,
            allocatedBudget,
            totalSalaryRequirement,
            taxRevenue,
            stats
        );
        if (!vm) { _toast('Government summary unavailable', 'error'); return; }

        var infoIcon = _iconSpan('CIRCLE_DOT');

        var sufficiencyHtml = '';
        if (vm.sufficiency) {
            var pct = Math.round(vm.sufficiency.ratio * 100);
            var color = vm.sufficiency.isSufficient ? 'var(--success)' : 'var(--warn)';
            sufficiencyHtml =
                '<div style="background:var(--bg3);padding:8px;border-radius:6px;margin-bottom:12px;font-size:0.6rem;">' +
                '<div style="display:flex;justify-content:space-between;">' +
                '<span style="color:var(--dim);">Budget sufficiency</span>' +
                '<span style="color:' + color + ';">' + pct + '%</span>' +
                '</div>' +
                '<div style="font-size:0.5rem;color:var(--dim);margin-top:2px;">' +
                vm.sufficiency.allocated + ' allocated vs ' + vm.sufficiency.required + ' required' +
                '</div>' +
                '</div>';
        }

        var html =
            '<div style="padding:12px;">' +
            '<div style="margin-bottom:12px;padding:8px;background:var(--bg2);border-radius:6px;">' +
            '<strong>Government Summary:</strong> ' + _escapeHtml(vm.locationName) +
            '</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">' +
            '<div style="background:var(--bg2);padding:12px;border-radius:6px;text-align:center;">' +
            '<div style="font-size:0.55rem;color:var(--dim);">Total Salary Requirement</div>' +
            '<div style="font-size:1rem;font-weight:bold;">' + (vm.totalSalaryRequirement != null ? vm.totalSalaryRequirement : 0) + ' gold</div>' +
            '</div>' +
            '<div style="background:var(--bg2);padding:12px;border-radius:6px;text-align:center;">' +
            '<div style="font-size:0.55rem;color:var(--dim);">Industry Tax Revenue</div>' +
            '<div style="font-size:1rem;font-weight:bold;color:var(--success);">' + vm.taxRevenue + ' gold</div>' +
            '</div>' +
            '</div>' +
            sufficiencyHtml +
            (vm.enterpriseStats ? (
                '<div style="background:var(--bg3);padding:8px;border-radius:4px;font-size:0.55rem;margin-bottom:12px;">' +
                '<div style="display:flex;justify-content:space-between;padding:2px 0;">' +
                '<span style="color:var(--dim);">Enterprises</span><span>' + vm.enterpriseStats.totalEnterprises + '</span></div>' +
                '<div style="display:flex;justify-content:space-between;padding:2px 0;">' +
                '<span style="color:var(--dim);">Total annual profit</span><span>' + vm.enterpriseStats.totalAnnualProfit + '</span></div>' +
                '<div style="display:flex;justify-content:space-between;padding:2px 0;">' +
                '<span style="color:var(--dim);">Health score</span><span>' + vm.enterpriseStats.healthScore + '</span></div>' +
                '</div>'
            ) : '') +
            '<div style="padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;color:var(--dim);">' +
            infoIcon + ' A formal efficiency score is not available in this build. The above shows current totals and budget sufficiency.' +
            '</div>' +
            '</div>';

        _openModal({
            title: 'Government Summary: ' + vm.locationName,
            content: html,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function() { _closeTopModal(); }
        });
    }

    // ---- Deprecated aliases (kept for old callers) ---------------------------
    // openFinancialReportModal and openEfficiencyScoreModal both now route to
    // openGovernmentSummaryModal. Neither shows stale projections.

    function openFinancialReportModal(locationId) {
        openGovernmentSummaryModal(locationId);
    }

    function openEfficiencyScoreModal(locationId) {
        openGovernmentSummaryModal(locationId);
    }

    // ---- Export --------------------------------------------------------------

    window.openSalaryManagementModal = openSalaryManagementModal;
    window.openGovernmentBudgetModal = openGovernmentBudgetModal;
    window.openTaxRevenueModal = openTaxRevenueModal;
    window.openGovernmentSummaryModal = openGovernmentSummaryModal;
    window.openFinancialReportModal = openFinancialReportModal;
    window.openEfficiencyScoreModal = openEfficiencyScoreModal;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            openSalaryManagementModal: openSalaryManagementModal,
            openGovernmentBudgetModal: openGovernmentBudgetModal,
            openTaxRevenueModal: openTaxRevenueModal,
            openGovernmentSummaryModal: openGovernmentSummaryModal,
            openFinancialReportModal: openFinancialReportModal,
            openEfficiencyScoreModal: openEfficiencyScoreModal
        };
    }
})();
