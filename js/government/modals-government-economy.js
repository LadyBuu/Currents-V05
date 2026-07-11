/**
 * =============================================================================
 * STILL WATERS - GOVERNMENT ECONOMY MODALS
 * =============================================================================
 * 
 * This file contains economy-specific UI modals:
 * - Budget viewer modal
 * - Salary management modal
 * - Tax revenue modal
 * - Financial report modal
 * - Efficiency score modal
 * 
 * DEPENDENCIES:
 *   - modals-core.js (openModal, closeTopModal, _escapeHtml, _showToast, _getIcon)
 *   - government-state.js (GovernmentState)
 *   - government-economy.js (GovernmentEconomy)
 *   - government-queries.js (GovernmentQueries)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARD
    // =========================================================================

    var _openingModal = false;

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    function _escapeHtml(str) {
        if (typeof window._escapeHtml === 'function') return window._escapeHtml(str);
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function _showToast(msg, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(msg, type);
        } else if (typeof window.showToast === 'function') {
            window.showToast(msg, type);
        } else if (typeof window.showToastMessage === 'function') {
            window.showToastMessage(msg, type);
        }
    }

    function _openModal(options) {
        if (typeof window.openModal === 'function') {
            return window.openModal(options);
        }
        return null;
    }

    function _closeTopModal() {
        if (typeof window.closeTopModal === 'function') {
            window.closeTopModal();
        }
    }

    function _getCurrentYear() {
        if (typeof window._getCurrentYear === 'function') return window._getCurrentYear();
        if (typeof window.getCurrentYearSafe === 'function') return window.getCurrentYearSafe();
        if (typeof window.getCurrentYear === 'function') return window.getCurrentYear();
        return 1250;
    }

    function _getPlaceById(id) {
        return typeof window.getPlaceById === 'function' ? window.getPlaceById(id) : null;
    }

    function _getIcon(name) {
        if (window.Icons && window.Icons[name]) {
            return window.Icons[name];
        }
        return '';
    }

    // =========================================================================
    // 3. BUDGET VIEWER MODAL
    // =========================================================================

    function openGovernmentBudgetModal(locationId) {
        if (_openingModal) {
            _showToast('Modal is already opening', 'warning');
            return;
        }
        _openingModal = true;

        try {
            var place = _getPlaceById(locationId);
            var budget = GovernmentEconomy.calculateLocationGovernmentBudget(locationId);
            var tax = GovernmentEconomy.calculateGovernmentTaxRevenue(locationId);

            if (!budget) {
                _showToast('Budget data not available', 'error');
                return;
            }

            var infoIcon = _getIcon('CIRCLE_DOT');
            var coinIcon = _getIcon('COIN');
            var personIcon = _getIcon('PERSON');

            var modalContent =
                '<div style="max-height: 500px; overflow-y: auto; padding: 4px;">' +
                '<div style="margin-bottom: 16px; padding: 12px; background: var(--bg2); border-radius: 8px;">' +
                '<strong>' + coinIcon + ' Government Budget</strong>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">' + (place ? _escapeHtml(place.displayName) : 'Unknown') + '</div>' +
                '</div>' +

                '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 16px;">' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Total Budget</div>' +
                '<div style="font-size: 1.2rem; font-weight: bold; color: var(--accent);">' + budget.totalBudget + ' gold</div>' +
                '</div>' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Salaries</div>' +
                '<div style="font-size: 1.2rem; font-weight: bold;">' + budget.totalSalaries + ' gold</div>' +
                '</div>' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Departments</div>' +
                '<div style="font-size: 1.2rem; font-weight: bold;">' + budget.totalDepartments + '</div>' +
                '</div>' +
                '</div>' +

                (tax ? '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 16px;">' +
                    '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">' +
                    '<div style="font-size: 0.55rem; color: var(--dim);">Tax Revenue</div>' +
                    '<div style="font-size: 1rem; font-weight: bold; color: var(--success);">' + tax.totalRevenue + ' gold</div>' +
                    '</div>' +
                    '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">' +
                    '<div style="font-size: 0.55rem; color: var(--dim);">Surplus</div>' +
                    '<div style="font-size: 1rem; font-weight: bold; color: ' + (tax.surplus >= 0 ? 'var(--success)' : 'var(--danger)') + ';">' + tax.surplus + ' gold</div>' +
                    '</div>' +
                    '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">' +
                    '<div style="font-size: 0.55rem; color: var(--dim);">Efficiency</div>' +
                    '<div style="font-size: 1rem; font-weight: bold;">' + (budget.totalDepartments > 0 ? Math.round((tax.totalRevenue / budget.totalDepartments)) : 0) + ' gold/dept</div>' +
                    '</div>' +
                    '</div>' : '') +

                '<div style="margin-bottom: 12px;">' +
                '<div style="font-size: 0.65rem; color: var(--accent); margin-bottom: 8px;">Department Breakdown</div>' +
                '<div style="max-height: 200px; overflow-y: auto; background: var(--bg3); padding: 8px; border-radius: 4px;">';

            if (budget.departments.length === 0) {
                modalContent += '<div style="text-align: center; padding: 12px; color: var(--dim); font-size: 0.6rem;">No departments found</div>';
            } else {
                for (var i = 0; i < budget.departments.length; i++) {
                    var d = budget.departments[i];
                    modalContent +=
                        '<div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid var(--border-light); font-size: 0.55rem;">' +
                        '<span>' + _escapeHtml(d.departmentName) + '</span>' +
                        '<span>' + d.filledPositions + '/' + d.totalPositions + ' filled · ' + d.totalSalaries + ' gold</span>' +
                        '</div>';
                }
            }

            modalContent +=
                '</div>' +
                '</div>' +
                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim);">' +
                infoIcon + ' Budget includes salaries and 20% overhead for departmental operations.' +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Government Budget' + (place ? ': ' + place.displayName : ''),
                content: modalContent,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {}
            });

        } finally {
            _openingModal = false;
        }
    }

    // =========================================================================
    // 4. SALARY MANAGEMENT MODAL
    // =========================================================================

    function openSalaryManagementModal(departmentId, positionId, onSuccess) {
        if (_openingModal) {
            _showToast('Modal is already opening', 'warning');
            return;
        }
        _openingModal = true;

        try {
            var dept = GovernmentState.getDepartment(departmentId);
            if (!dept) {
                _showToast('Department not found', 'error');
                return;
            }

            var position = GovernmentState.getPositionById(departmentId, positionId);
            if (!position) {
                _showToast('Position not found', 'error');
                return;
            }

            var currentSalary = GovernmentEconomy.calculatePositionSalary(positionId, dept);
            var history = GovernmentEconomy.getPositionSalaryHistory(departmentId, positionId);
            var infoIcon = _getIcon('CIRCLE_DOT');
            var coinIcon = _getIcon('COIN');

            var historyHtml = '';
            if (history && history.length > 0) {
                for (var i = history.length - 1; i >= 0; i--) {
                    var h = history[i];
                    var isCurrent = (i === history.length - 1);
                    var color = isCurrent ? 'var(--accent)' : 'var(--dim)';
                    historyHtml +=
                        '<div style="display: flex; justify-content: space-between; padding: 2px 0; font-size: 0.55rem; border-bottom: 1px solid var(--border-light);">' +
                        '<span style="color: ' + color + ';">' + h.year + (h.source === 'override' ? ' (override)' : '') + '</span>' +
                        '<span style="color: ' + color + ';">' + h.salary + ' gold</span>' +
                        '</div>';
                }
            }

            var modalContent =
                '<div style="margin-bottom: 12px; padding: 8px; background: var(--bg2); border-radius: 6px;">' +
                '<strong>Department:</strong> ' + _escapeHtml(dept.name) + '<br>' +
                '<strong>Position:</strong> ' + _escapeHtml(position.name) +
                '</div>' +
                '<div style="background: var(--bg3); padding: 12px; border-radius: 6px; margin-bottom: 12px;">' +
                '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">' +
                '<div>' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Current Salary</div>' +
                '<div style="font-size: 1.2rem; font-weight: bold; color: var(--accent);">' + currentSalary + ' gold/year</div>' +
                '</div>' +
                '<div style="text-align: right;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Tier</div>' +
                '<div style="font-size: 0.8rem;">' + (position.priority <= 3 ? 'Minister' : position.priority <= 5 ? 'Director' : position.priority <= 8 ? 'Officer' : position.priority <= 12 ? 'Clerk' : 'Staff') + '</div>' +
                '</div>' +
                '</div>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Override Salary</label>' +
                '<div style="display: flex; gap: 8px; align-items: center;">' +
                '<input type="number" id="salaryOverride" value="' + currentSalary + '" min="0" style="width:150px; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                '<span style="font-size: 0.55rem; color: var(--dim);">gold/year</span>' +
                '<button id="applySalaryOverrideBtn" class="btn primary" style="padding: 4px 12px; font-size: 0.6rem; background: var(--accent); border: 1px solid var(--accent); color: white; border-radius: 4px; cursor: pointer;">Apply</button>' +
                '</div>' +
                '<small style="font-size:0.5rem; color:var(--dim);">Leave blank to use calculated salary. Override will be recorded in history.</small>' +
                '</div>' +
                (historyHtml ? '<div style="margin-bottom: 12px;">' +
                    '<div style="font-size: 0.6rem; color: var(--dim); margin-bottom: 4px;">Salary History</div>' +
                    '<div style="max-height: 120px; overflow-y: auto; background: var(--bg3); padding: 8px; border-radius: 4px;">' +
                    historyHtml +
                    '</div>' +
                    '</div>' : '') +
                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim);">' +
                infoIcon + ' Salary is calculated based on position priority, location prosperity, and experience.' +
                '</div>';

            _openModal({
                title: 'Salary Management: ' + position.name,
                content: modalContent,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {}
            });

            setTimeout(function() {
                var applyBtn = document.getElementById('applySalaryOverrideBtn');
                var input = document.getElementById('salaryOverride');

                if (applyBtn && input) {
                    applyBtn.addEventListener('click', function() {
                        var newSalary = parseInt(input.value);
                        if (isNaN(newSalary) || newSalary < 0) {
                            _showToast('Please enter a valid salary amount', 'error');
                            return;
                        }

                        var result = GovernmentEconomy.updatePositionSalary(departmentId, positionId, newSalary);
                        if (result) {
                            _closeTopModal();
                            if (onSuccess) onSuccess();
                            openSalaryManagementModal(departmentId, positionId, onSuccess);
                        }
                    });
                }
            }, 100);

        } finally {
            _openingModal = false;
        }
    }

    // =========================================================================
    // 5. TAX REVENUE MODAL
    // =========================================================================

    function openTaxRevenueModal(locationId) {
        if (_openingModal) {
            _showToast('Modal is already opening', 'warning');
            return;
        }
        _openingModal = true;

        try {
            var tax = GovernmentEconomy.calculateGovernmentTaxRevenue(locationId);
            if (!tax) {
                _showToast('Tax data not available', 'error');
                return;
            }

            var place = _getPlaceById(locationId);
            var infoIcon = _getIcon('CIRCLE_DOT');
            var coinIcon = _getIcon('COIN');

            var modalContent =
                '<div style="max-height: 500px; overflow-y: auto; padding: 4px;">' +
                '<div style="margin-bottom: 16px; padding: 12px; background: var(--bg2); border-radius: 8px;">' +
                '<strong>' + coinIcon + ' Tax Revenue</strong>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">' + (place ? _escapeHtml(place.displayName) : 'Unknown') + ' - ' + tax.year + '</div>' +
                '</div>' +

                '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 16px;">' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Total Revenue</div>' +
                '<div style="font-size: 1.2rem; font-weight: bold; color: var(--success);">' + tax.totalRevenue + ' gold</div>' +
                '</div>' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Government Expenses</div>' +
                '<div style="font-size: 1.2rem; font-weight: bold; color: var(--danger);">' + tax.governmentExpenses + ' gold</div>' +
                '</div>' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Surplus</div>' +
                '<div style="font-size: 1.2rem; font-weight: bold; color: ' + (tax.surplus >= 0 ? 'var(--success)' : 'var(--danger)') + ';">' + tax.surplus + ' gold</div>' +
                '</div>' +
                '</div>' +

                '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">' +
                '<div style="background: var(--bg3); padding: 12px; border-radius: 6px;">' +
                '<div style="font-size: 0.6rem; color: var(--accent); margin-bottom: 4px;">Revenue Sources</div>' +
                '<div style="font-size: 0.55rem;">' +
                '<div style="display: flex; justify-content: space-between; padding: 2px 0;">' +
                '<span style="color: var(--dim);">Taxes</span><span>' + tax.taxRevenue + ' gold</span></div>' +
                '<div style="display: flex; justify-content: space-between; padding: 2px 0;">' +
                '<span style="color: var(--dim);">Trade Tariffs</span><span>' + tax.tradeRevenue + ' gold</span></div>' +
                '<div style="display: flex; justify-content: space-between; padding: 2px 0;">' +
                '<span style="color: var(--dim);">Industry Tax</span><span>' + tax.industryRevenue + ' gold</span></div>' +
                '</div>' +
                '</div>' +
                '<div style="background: var(--bg3); padding: 12px; border-radius: 6px;">' +
                '<div style="font-size: 0.6rem; color: var(--accent); margin-bottom: 4px;">Rates</div>' +
                '<div style="font-size: 0.55rem;">' +
                '<div style="display: flex; justify-content: space-between; padding: 2px 0;">' +
                '<span style="color: var(--dim);">Tax Rate</span><span>' + (tax.taxRate * 100) + '%</span></div>' +
                '<div style="display: flex; justify-content: space-between; padding: 2px 0;">' +
                '<span style="color: var(--dim);">Trade Tariff</span><span>' + (tax.tradeTariff * 100) + '%</span></div>' +
                '<div style="display: flex; justify-content: space-between; padding: 2px 0;">' +
                '<span style="color: var(--dim);">Industry Tax</span><span>' + (tax.industryTaxRate * 100) + '%</span></div>' +
                '</div>' +
                '</div>' +
                '</div>' +

                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim);">' +
                infoIcon + ' Population: ' + tax.population + ' · Departments: ' + tax.departmentCount +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Tax Revenue' + (place ? ': ' + place.displayName : ''),
                content: modalContent,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {}
            });

        } finally {
            _openingModal = false;
        }
    }

    // =========================================================================
    // 6. FINANCIAL REPORT MODAL
    // =========================================================================

    function openFinancialReportModal(locationId) {
        if (_openingModal) {
            _showToast('Modal is already opening', 'warning');
            return;
        }
        _openingModal = true;

        try {
            var report = GovernmentEconomy.getGovernmentFinancialReport(locationId, 5);
            if (!report) {
                _showToast('Financial report not available', 'error');
                return;
            }

            var place = _getPlaceById(locationId);
            var infoIcon = _getIcon('CIRCLE_DOT');
            var coinIcon = _getIcon('COIN');

            var summary = report.summary;
            var reports = report.reports;

            var modalContent =
                '<div style="max-height: 500px; overflow-y: auto; padding: 4px;">' +
                '<div style="margin-bottom: 16px; padding: 12px; background: var(--bg2); border-radius: 8px;">' +
                '<strong>' + coinIcon + ' Financial Report</strong>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">' + (place ? _escapeHtml(place.displayName) : 'Unknown') + ' - 5 Year Summary</div>' +
                '</div>' +

                '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 16px;">' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Avg Revenue</div>' +
                '<div style="font-size: 1rem; font-weight: bold; color: var(--success);">' + summary.averageRevenue + ' gold</div>' +
                '<div style="font-size: 0.5rem; color: ' + (summary.revenueTrend >= 0 ? 'var(--success)' : 'var(--danger)') + ';">' + (summary.revenueTrend >= 0 ? '+' : '') + summary.revenueTrend + '% trend</div>' +
                '</div>' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Avg Expenses</div>' +
                '<div style="font-size: 1rem; font-weight: bold; color: var(--danger);">' + summary.averageExpenses + ' gold</div>' +
                '<div style="font-size: 0.5rem; color: ' + (summary.expenseTrend <= 0 ? 'var(--success)' : 'var(--danger)') + ';">' + (summary.expenseTrend >= 0 ? '+' : '') + summary.expenseTrend + '% trend</div>' +
                '</div>' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Avg Surplus</div>' +
                '<div style="font-size: 1rem; font-weight: bold; color: ' + (summary.averageSurplus >= 0 ? 'var(--success)' : 'var(--danger)') + ';">' + summary.averageSurplus + ' gold</div>' +
                '<div style="font-size: 0.5rem; color: ' + (summary.surplusTrend >= 0 ? 'var(--success)' : 'var(--danger)') + ';">' + (summary.surplusTrend >= 0 ? '+' : '') + summary.surplusTrend + '% trend</div>' +
                '</div>' +
                '</div>' +

                '<div style="margin-bottom: 12px;">' +
                '<div style="font-size: 0.6rem; color: var(--accent); margin-bottom: 4px;">Yearly Breakdown</div>' +
                '<div style="background: var(--bg3); padding: 8px; border-radius: 4px;">';

            for (var i = 0; i < reports.length; i++) {
                var r = reports[i];
                var isSurplus = r.surplus >= 0;
                modalContent +=
                    '<div style="display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px solid var(--border-light); font-size: 0.55rem;">' +
                    '<span style="color: var(--dim);">' + r.year + '</span>' +
                    '<span>Rev: ' + r.totalRevenue + '</span>' +
                    '<span>Exp: ' + r.governmentExpenses + '</span>' +
                    '<span style="color: ' + (isSurplus ? 'var(--success)' : 'var(--danger)') + ';">Surplus: ' + (isSurplus ? '+' : '') + r.surplus + '</span>' +
                    '</div>';
            }

            modalContent +=
                '</div>' +
                '</div>' +
                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim);">' +
                infoIcon + ' Trends show year-over-year percentage change.' +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Financial Report' + (place ? ': ' + place.displayName : ''),
                content: modalContent,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {}
            });

        } finally {
            _openingModal = false;
        }
    }

    // =========================================================================
    // 7. EFFICIENCY SCORE MODAL
    // =========================================================================

    function openEfficiencyScoreModal(locationId) {
        if (_openingModal) {
            _showToast('Modal is already opening', 'warning');
            return;
        }
        _openingModal = true;

        try {
            var score = GovernmentEconomy.getGovernmentEfficiencyScore(locationId);
            if (!score) {
                _showToast('Efficiency score not available', 'error');
                return;
            }

            var place = _getPlaceById(locationId);
            var infoIcon = _getIcon('CIRCLE_DOT');
            var starIcon = _getIcon('STAR_4');

            var ratingColor = score.efficiency >= 80 ? 'var(--success)' :
                             score.efficiency >= 60 ? 'var(--accent)' :
                             score.efficiency >= 40 ? 'var(--warn)' :
                             score.efficiency >= 20 ? 'var(--danger)' : 'var(--danger-dark)';

            var modalContent =
                '<div style="max-height: 500px; overflow-y: auto; padding: 4px;">' +
                '<div style="margin-bottom: 16px; padding: 12px; background: var(--bg2); border-radius: 8px;">' +
                '<strong>' + starIcon + ' Government Efficiency</strong>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">' + (place ? _escapeHtml(place.displayName) : 'Unknown') + '</div>' +
                '</div>' +

                '<div style="text-align: center; padding: 20px; background: var(--bg3); border-radius: 8px; margin-bottom: 16px;">' +
                '<div style="font-size: 3rem; font-weight: bold; color: ' + ratingColor + ';">' + score.efficiency + '</div>' +
                '<div style="font-size: 1rem; font-weight: bold; color: ' + ratingColor + ';">' + score.rating + '</div>' +
                '</div>' +

                '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 6px;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Revenue per Department</div>' +
                '<div style="font-size: 1rem; font-weight: bold;">' + score.revenuePerDepartment + ' gold</div>' +
                '</div>' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 6px;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Average Salary</div>' +
                '<div style="font-size: 1rem; font-weight: bold;">' + score.averageSalary + ' gold</div>' +
                '</div>' +
                '</div>' +

                '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 6px;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Total Departments</div>' +
                '<div style="font-size: 1rem; font-weight: bold;">' + score.departments + '</div>' +
                '</div>' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 6px;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Surplus</div>' +
                '<div style="font-size: 1rem; font-weight: bold; color: ' + (score.surplus >= 0 ? 'var(--success)' : 'var(--danger)') + ';">' + score.surplus + ' gold</div>' +
                '</div>' +
                '</div>' +

                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim);">' +
                infoIcon + ' Efficiency score measures revenue generated per department relative to average salary.' +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Efficiency Score' + (place ? ': ' + place.displayName : ''),
                content: modalContent,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {}
            });

        } finally {
            _openingModal = false;
        }
    }

    // =========================================================================
    // 8. EXPORTS
    // =========================================================================

    window.openGovernmentBudgetModal = openGovernmentBudgetModal;
    window.openSalaryManagementModal = openSalaryManagementModal;
    window.openTaxRevenueModal = openTaxRevenueModal;
    window.openFinancialReportModal = openFinancialReportModal;
    window.openEfficiencyScoreModal = openEfficiencyScoreModal;

})();