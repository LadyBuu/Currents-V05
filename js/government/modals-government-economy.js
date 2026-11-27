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
        return i ? '<span class="gov-inline-1">' + i + '</span>' : '';
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
            historyHtml = '<div class="gov-inline-31">No history</div>';
        } else {
            for (var i = 0; i < vm.history.length; i++) {
                var h = vm.history[i];
                var color = h.isCurrent ? 'var(--accent)' : 'var(--dim)';
                historyHtml +=
                    '<div class="gov-inline-32">' +
                    '<span class="gov-dynamic-color ' + (h.isCurrent ? 'gov-status-current' : 'gov-status-muted') + '">' + _escapeHtml(h.yearLabel) +
                    (h.source === 'override' ? ' (override)' : '') +
                    (h.reason ? ' — ' + _escapeHtml(h.reason) : '') +
                    '</span>' +
                    '<span class="gov-dynamic-color ' + (h.isCurrent ? 'gov-status-current' : 'gov-status-muted') + '">' + h.salary + ' gold</span>' +
                    '</div>';
            }
        }

        var html =
            '<div class="gov-inline-11">' +
            '<strong>Department:</strong> ' + _escapeHtml(dept.name) + '<br>' +
            '<strong>Position:</strong> ' + _escapeHtml(position.name) +
            '</div>' +
            '<div class="gov-inline-56">' +
            '<div class="gov-inline-57">' +
            '<div>' +
            '<div class="gov-inline-6">Current Salary</div>' +
            '<div class="gov-inline-58">' + vm.currentSalary + ' gold/year</div>' +
            '</div>' +
            '<div class="gov-inline-59">' +
            '<div class="gov-inline-6">Tier</div>' +
            '<div class="gov-inline-60">' + _escapeHtml(vm.tierName || '') + '</div>' +
            '</div>' +
            '</div>' +
            '</div>' +
            '<div class="form-group" class="gov-inline-3">' +
            '<label class="gov-inline-4">Override Salary</label>' +
            '<div class="gov-inline-61">' +
            '<input type="number" id="salaryOverride" value="' + vm.currentSalary + '" min="' + C.MIN_SALARY + '" max="' + C.MAX_SALARY + '" class="gov-inline-62">' +
            '<span class="gov-inline-6">gold/year</span>' +
            '<button type="button" id="applySalaryOverrideBtn" class="btn primary" class="gov-inline-63">Apply Override</button>' +
            '</div>' +
            '<small class="gov-inline-20">Override appends to history. Calculated salary is used until an override exists.</small>' +
            '</div>' +
            (historyHtml ? '<div class="gov-inline-3">' +
                '<div class="gov-inline-64">Salary History</div>' +
                '<div class="gov-inline-65">' +
                historyHtml +
                '</div>' +
                '</div>' : '') +
            '<div class="gov-inline-8">' +
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
            rowsHtml = '<div class="gov-inline-25">No departments found</div>';
        } else {
            for (var j = 0; j < vm.departments.length; j++) {
                var r = vm.departments[j];
                rowsHtml +=
                    '<div class="gov-inline-66">' +
                    '<span>' + _escapeHtml(r.departmentName) + '</span>' +
                    '<span>' + r.filledPositions + '/' + r.totalPositions + ' filled · ' + r.totalSalaryRequirement + ' gold</span>' +
                    '</div>';
            }
        }

        var html =
            '<div class="gov-inline-2">' +
            '<div class="gov-inline-44">' +
            '<strong>' + coinIcon + ' Salary Budget</strong>' +
            '<div class="gov-inline-10">' + _escapeHtml(vm.locationName) + '</div>' +
            '</div>' +
            '<div class="gov-inline-33">' +
            '<div class="gov-inline-34">' +
            '<div class="gov-inline-6">Total Salary Requirement</div>' +
            '<div class="gov-inline-58">' + vm.summary.totalSalaryRequirement + ' gold</div>' +
            '</div>' +
            '<div class="gov-inline-34">' +
            '<div class="gov-inline-6">Filled Positions</div>' +
            '<div class="gov-inline-35">' + vm.summary.filledPositions + '</div>' +
            '</div>' +
            '<div class="gov-inline-34">' +
            '<div class="gov-inline-6">Departments</div>' +
            '<div class="gov-inline-35">' + vm.summary.departmentCount + '</div>' +
            '</div>' +
            '</div>' +
            '<div class="gov-inline-3">' +
            '<div class="gov-inline-12">Department Breakdown</div>' +
            '<div class="gov-inline-67">' +
            rowsHtml +
            '</div>' +
            '</div>' +
            '<div class="gov-inline-8">' +
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
            '<div class="gov-inline-2">' +
            '<div class="gov-inline-44">' +
            '<strong>' + coinIcon + ' Industry Tax Revenue</strong>' +
            '<div class="gov-inline-10">' + _escapeHtml(vm.locationName) + '</div>' +
            '</div>' +
            '<div class="gov-inline-33">' +
            '<div class="gov-inline-34">' +
            '<div class="gov-inline-6">Tax Revenue</div>' +
            '<div class="gov-inline-36">' + vm.taxRevenue + ' gold</div>' +
            '</div>' +
            '<div class="gov-inline-34">' +
            '<div class="gov-inline-6">Enterprises</div>' +
            '<div class="gov-inline-35">' + (vm.enterpriseStats ? vm.enterpriseStats.totalEnterprises : 0) + '</div>' +
            '</div>' +
            '<div class="gov-inline-34">' +
            '<div class="gov-inline-6">Health Score</div>' +
            '<div class="gov-inline-35">' + (vm.enterpriseStats ? vm.enterpriseStats.healthScore : '—') + '</div>' +
            '</div>' +
            '</div>' +
            (vm.enterpriseStats ? (
                '<div class="gov-inline-68">' +
                '<div class="gov-inline-38">' +
                '<div class="gov-inline-39">Profitability</div>' +
                '<div class="gov-inline-69">' +
                '<div class="gov-inline-70">' +
                '<span class="gov-inline-27">Profitable</span><span>' + vm.enterpriseStats.profitable + '</span></div>' +
                '<div class="gov-inline-70">' +
                '<span class="gov-inline-27">Unprofitable</span><span>' + vm.enterpriseStats.unprofitable + '</span></div>' +
                '<div class="gov-inline-70">' +
                '<span class="gov-inline-27">Avg Profit</span><span>' + vm.enterpriseStats.averageProfit + '</span></div>' +
                '</div>' +
                '</div>' +
                '<div class="gov-inline-38">' +
                '<div class="gov-inline-39">Rates</div>' +
                '<div class="gov-inline-69">' +
                '<div class="gov-inline-70">' +
                '<span class="gov-inline-27">Industry Tax</span><span>' + _escapeHtml(vm.taxRateLabel) + '</span></div>' +
                '<div class="gov-inline-70">' +
                '<span class="gov-inline-27">Total Workers</span><span>' + vm.enterpriseStats.totalWorkers + '</span></div>' +
                '</div>' +
                '</div>' +
                '</div>'
            ) : '') +
            '<div class="gov-inline-8">' +
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
                '<div class="gov-inline-30">' +
                '<div class="gov-inline-71">' +
                '<span class="gov-inline-27">Budget sufficiency</span>' +
                '<span class="gov-dynamic-color ' + (vm.sufficiency.isSufficient ? 'gov-status-sufficient' : 'gov-status-warning') + '">' + pct + '%</span>' +
                '</div>' +
                '<div class="gov-inline-72">' +
                vm.sufficiency.allocated + ' allocated vs ' + vm.sufficiency.required + ' required' +
                '</div>' +
                '</div>';
        }

        var html =
            '<div class="gov-inline-73">' +
            '<div class="gov-inline-11">' +
            '<strong>Government Summary:</strong> ' + _escapeHtml(vm.locationName) +
            '</div>' +
            '<div class="gov-inline-68">' +
            '<div class="gov-inline-74">' +
            '<div class="gov-inline-6">Total Salary Requirement</div>' +
            '<div class="gov-inline-75">' + (vm.totalSalaryRequirement != null ? vm.totalSalaryRequirement : 0) + ' gold</div>' +
            '</div>' +
            '<div class="gov-inline-74">' +
            '<div class="gov-inline-6">Industry Tax Revenue</div>' +
            '<div class="gov-inline-76">' + vm.taxRevenue + ' gold</div>' +
            '</div>' +
            '</div>' +
            sufficiencyHtml +
            (vm.enterpriseStats ? (
                '<div class="gov-inline-77">' +
                '<div class="gov-inline-70">' +
                '<span class="gov-inline-27">Enterprises</span><span>' + vm.enterpriseStats.totalEnterprises + '</span></div>' +
                '<div class="gov-inline-70">' +
                '<span class="gov-inline-27">Total annual profit</span><span>' + vm.enterpriseStats.totalAnnualProfit + '</span></div>' +
                '<div class="gov-inline-70">' +
                '<span class="gov-inline-27">Health score</span><span>' + vm.enterpriseStats.healthScore + '</span></div>' +
                '</div>'
            ) : '') +
            '<div class="gov-inline-8">' +
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
