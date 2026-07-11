/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT ECONOMY MODALS (modals-settlement-economy.js)
 * =============================================================================
 * 
 * This file contains economy-specific UI modals:
 * - Tax Rate Management
 * - Spending Management
 * - Justice & Watch Management
 * - Financial Report View
 * - Efficiency Score View
 * - Debt Management
 * 
 * DEPENDENCIES:
 *   - modals-core.js (openModal, closeTopModal, _escapeHtml, _showToast, _getIcon)
 *   - settlement-state.js (SettlementState)
 *   - settlement-commands.js (SettlementCommands)
 *   - settlement-queries.js (SettlementQueries)
 *   - settlement-economy.js (SettlementEconomy)
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
    // 2. ICON HELPERS (using icons.js)
    // =========================================================================

    function _getIcon(name) {
        if (window.Icons && window.Icons[name]) {
            return window.Icons[name];
        }
        if (window.Icons && window.Icons.CIRCLE) {
            return window.Icons.CIRCLE;
        }
        return '';
    }

    // =========================================================================
    // 3. DEPENDENCY WRAPPERS
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

    function _confirmDialog(message, title, onConfirm) {
        if (typeof window.confirmDialog === 'function') {
            return window.confirmDialog(message, title, onConfirm);
        }
        if (confirm(message)) {
            onConfirm();
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

    function _getLocationPopulationCount(locationId) {
        if (typeof window.getLocationPopulationCount === 'function') {
            return window.getLocationPopulationCount(locationId);
        }
        return 0;
    }

    function _getSettlementSummary(locationId) {
        if (typeof SettlementQueries !== 'undefined' && SettlementQueries.getSettlementSummary) {
            return SettlementQueries.getSettlementSummary(locationId);
        }
        return null;
    }

    function _getSettlementBudget(locationId) {
        if (typeof SettlementState !== 'undefined' && SettlementState.getSettlementBudget) {
            return SettlementState.getSettlementBudget(locationId);
        }
        return null;
    }

    function _getSettlementEmployment(locationId) {
        if (typeof SettlementState !== 'undefined' && SettlementState.getSettlementEmployment) {
            return SettlementState.getSettlementEmployment(locationId);
        }
        return null;
    }

    function _getSettlementData(locationId) {
        if (typeof SettlementState !== 'undefined' && SettlementState.getSettlementData) {
            return SettlementState.getSettlementData(locationId);
        }
        return null;
    }

    function _calculateSurplus(locationId) {
        if (typeof SettlementEconomy !== 'undefined' && SettlementEconomy.calculateSurplus) {
            return SettlementEconomy.calculateSurplus(locationId);
        }
        return 0;
    }

    function _getDebtRatio(locationId) {
        if (typeof SettlementEconomy !== 'undefined' && SettlementEconomy.getDebtRatio) {
            return SettlementEconomy.getDebtRatio(locationId);
        }
        return 0;
    }

    function _getEfficiencyScore(locationId) {
        if (typeof SettlementEconomy !== 'undefined' && SettlementEconomy.getEfficiencyScore) {
            return SettlementEconomy.getEfficiencyScore(locationId);
        }
        return null;
    }

    function _getFinancialReport(locationId, years) {
        if (typeof SettlementEconomy !== 'undefined' && SettlementEconomy.getFinancialReport) {
            return SettlementEconomy.getFinancialReport(locationId, years);
        }
        return null;
    }

    function _getSettlementFeatures(locationId) {
        if (typeof SettlementState !== 'undefined' && SettlementState.getSettlementFeatures) {
            return SettlementState.getSettlementFeatures(locationId);
        }
        return [];
    }

    // =========================================================================
    // 4. TAX RATE MANAGEMENT MODAL
    // =========================================================================

    function openTaxRateManagementModal(locationId, onSuccess) {
        if (_openingModal) {
            _showToast('Modal is already opening', 'warning');
            return;
        }
        _openingModal = true;

        try {
            var place = _getPlaceById(locationId);
            if (!place) {
                _showToast('Location not found', 'error');
                return;
            }

            var summary = _getSettlementSummary(locationId);
            if (!summary) {
                _showToast('Settlement data not found', 'error');
                return;
            }

            var infoIcon = _getIcon('CIRCLE_DOT');
            var coinIcon = _getIcon('COIN');

            var content = '<div style="max-height: 500px; overflow-y: auto; padding: 4px;">';

            content += '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; margin-bottom: 16px;">' +
                '<strong>' + coinIcon + ' ' + _escapeHtml(place.displayName) + '</strong>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">Current tax rates and tariffs</div>' +
                '</div>';

            content += '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Tax Rate (%)</label>' +
                '<div style="display: flex; gap: 8px; align-items: center;">' +
                '<input type="number" id="taxRateInput" value="' + (summary.taxRate || 10) + '" min="0" max="50" style="width: 100px; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);">' +
                '<span style="font-size: 0.55rem; color: var(--dim);">Current: ' + (summary.taxRate || 10) + '%</span>' +
                '</div>' +
                '<small style="font-size: 0.5rem; color: var(--dim);">Higher taxes generate more revenue but reduce prosperity</small>' +
                '</div>';

            content += '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Trade Tariff (%)</label>' +
                '<div style="display: flex; gap: 8px; align-items: center;">' +
                '<input type="number" id="tradeTariffInput" value="' + (summary.tradeTariff || 5) + '" min="0" max="30" style="width: 100px; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);">' +
                '<span style="font-size: 0.55rem; color: var(--dim);">Current: ' + (summary.tradeTariff || 5) + '%</span>' +
                '</div>' +
                '<small style="font-size: 0.5rem; color: var(--dim);">Tariffs affect trade income and trade volume</small>' +
                '</div>';

            content += '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Industry Tax Rate (%)</label>' +
                '<div style="display: flex; gap: 8px; align-items: center;">' +
                '<input type="number" id="industryTaxRateInput" value="' + (summary.industryTaxRate || 8) + '" min="0" max="30" style="width: 100px; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);">' +
                '<span style="font-size: 0.55rem; color: var(--dim);">Current: ' + (summary.industryTaxRate || 8) + '%</span>' +
                '</div>' +
                '<small style="font-size: 0.5rem; color: var(--dim);">Tax on enterprise profits</small>' +
                '</div>';

            content += '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim);">' +
                infoIcon + ' Changing rates affects the settlement economy. Higher rates increase revenue but may reduce growth.' +
                '</div>';

            content += '</div>';

            _openModal({
                title: 'Tax Rate Management: ' + _escapeHtml(place.displayName),
                content: content,
                confirmText: 'Save Changes',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var taxRate = parseInt(document.getElementById('taxRateInput').value);
                    var tradeTariff = parseInt(document.getElementById('tradeTariffInput').value);
                    var industryTaxRate = parseInt(document.getElementById('industryTaxRateInput').value);

                    var errors = [];
                    if (isNaN(taxRate) || taxRate < 0 || taxRate > 50) errors.push('Tax rate must be between 0 and 50');
                    if (isNaN(tradeTariff) || tradeTariff < 0 || tradeTariff > 30) errors.push('Trade tariff must be between 0 and 30');
                    if (isNaN(industryTaxRate) || industryTaxRate < 0 || industryTaxRate > 30) errors.push('Industry tax rate must be between 0 and 30');

                    if (errors.length > 0) {
                        _showToast(errors[0], 'error');
                        return false;
                    }

                    var results = [];
                    if (taxRate !== (summary.taxRate || 10)) {
                        results.push(SettlementCommands.updateTaxRate(locationId, taxRate));
                    }
                    if (tradeTariff !== (summary.tradeTariff || 5)) {
                        results.push(SettlementCommands.updateTradeTariff(locationId, tradeTariff));
                    }
                    if (industryTaxRate !== (summary.industryTaxRate || 8)) {
                        results.push(SettlementCommands.updateIndustryTaxRate(locationId, industryTaxRate));
                    }

                    var success = results.every(function(r) { return r && r.success; });
                    if (success) {
                        _showToast('Rates updated successfully', 'success');
                        _closeTopModal();
                        if (onSuccess) onSuccess();
                    } else {
                        _showToast('Failed to update some rates', 'error');
                    }
                    return true;
                }
            });

        } finally {
            _openingModal = false;
        }
    }

    // =========================================================================
    // 5. SPENDING MANAGEMENT MODAL
    // =========================================================================

    function openSpendingManagementModal(locationId, onSuccess) {
        if (_openingModal) {
            _showToast('Modal is already opening', 'warning');
            return;
        }
        _openingModal = true;

        try {
            var place = _getPlaceById(locationId);
            if (!place) {
                _showToast('Location not found', 'error');
                return;
            }

            var summary = _getSettlementSummary(locationId);
            if (!summary) {
                _showToast('Settlement data not found', 'error');
                return;
            }

            var infoIcon = _getIcon('CIRCLE_DOT');

            var content = '<div style="max-height: 500px; overflow-y: auto; padding: 4px;">';

            content += '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; margin-bottom: 16px;">' +
                '<strong>' + _escapeHtml(place.displayName) + '</strong>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">Annual spending allocations</div>' +
                '</div>';

            content += '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Military Spending</label>' +
                '<div style="display: flex; gap: 8px; align-items: center;">' +
                '<input type="number" id="militarySpendingInput" value="' + (summary.spending.military || 0) + '" min="0" step="5" style="width: 120px; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);">' +
                '<span style="font-size: 0.55rem; color: var(--dim);">Current: ' + (summary.spending.military || 0) + ' gold/year</span>' +
                '</div>' +
                '<small style="font-size: 0.5rem; color: var(--dim);">Affects defense, crime rate, and prosperity</small>' +
                '</div>';

            content += '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Infrastructure Spending</label>' +
                '<div style="display: flex; gap: 8px; align-items: center;">' +
                '<input type="number" id="infrastructureSpendingInput" value="' + (summary.spending.infrastructure || 0) + '" min="0" step="5" style="width: 120px; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);">' +
                '<span style="font-size: 0.55rem; color: var(--dim);">Current: ' + (summary.spending.infrastructure || 0) + ' gold/year</span>' +
                '</div>' +
                '<small style="font-size: 0.5rem; color: var(--dim);">Affects growth, prosperity, and feature availability</small>' +
                '</div>';

            content += '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Education Spending</label>' +
                '<div style="display: flex; gap: 8px; align-items: center;">' +
                '<input type="number" id="educationSpendingInput" value="' + (summary.spending.education || 0) + '" min="0" step="5" style="width: 120px; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);">' +
                '<span style="font-size: 0.55rem; color: var(--dim);">Current: ' + (summary.spending.education || 0) + ' gold/year</span>' +
                '</div>' +
                '<small style="font-size: 0.5rem; color: var(--dim);">Affects literacy, prosperity, and workforce quality</small>' +
                '</div>';

            content += '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim);">' +
                infoIcon + ' Spending affects settlement growth and prosperity. Higher spending reduces surplus but improves outcomes.' +
                '</div>';

            content += '</div>';

            _openModal({
                title: 'Spending Management: ' + _escapeHtml(place.displayName),
                content: content,
                confirmText: 'Save Changes',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var military = parseInt(document.getElementById('militarySpendingInput').value) || 0;
                    var infrastructure = parseInt(document.getElementById('infrastructureSpendingInput').value) || 0;
                    var education = parseInt(document.getElementById('educationSpendingInput').value) || 0;

                    var results = [];
                    if (military !== (summary.spending.military || 0)) {
                        results.push(SettlementCommands.updateMilitarySpending(locationId, military));
                    }
                    if (infrastructure !== (summary.spending.infrastructure || 0)) {
                        results.push(SettlementCommands.updateInfrastructureSpending(locationId, infrastructure));
                    }
                    if (education !== (summary.spending.education || 0)) {
                        results.push(SettlementCommands.updateEducationSpending(locationId, education));
                    }

                    var success = results.every(function(r) { return r && r.success; });
                    if (success) {
                        _showToast('Spending updated successfully', 'success');
                        _closeTopModal();
                        if (onSuccess) onSuccess();
                    } else {
                        _showToast('Failed to update spending', 'error');
                    }
                    return true;
                }
            });

        } finally {
            _openingModal = false;
        }
    }

    // =========================================================================
    // 6. JUSTICE & WATCH MANAGEMENT MODAL
    // =========================================================================

    function openJusticeManagementModal(locationId, onSuccess) {
        if (_openingModal) {
            _showToast('Modal is already opening', 'warning');
            return;
        }
        _openingModal = true;

        try {
            var place = _getPlaceById(locationId);
            if (!place) {
                _showToast('Location not found', 'error');
                return;
            }

            var summary = _getSettlementSummary(locationId);
            if (!summary) {
                _showToast('Settlement data not found', 'error');
                return;
            }

            var infoIcon = _getIcon('CIRCLE_DOT');
            var warningIcon = _getIcon('WARNING');

            var content = '<div style="max-height: 500px; overflow-y: auto; padding: 4px;">';

            content += '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; margin-bottom: 16px;">' +
                '<strong>' + _escapeHtml(place.displayName) + '</strong>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">Justice system and crime prevention</div>' +
                '</div>';

            if (summary.crimeRate > 0.2) {
                content += '<div style="background: rgba(200, 68, 68, 0.15); padding: 8px 12px; border-radius: 6px; margin-bottom: 12px; border-left: 3px solid var(--danger);">' +
                    warningIcon + ' Crime rate is high: ' + Math.round(summary.crimeRate * 100) + '%' +
                    '</div>';
            }

            content += '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Justice Severity</label>' +
                '<select id="justiceSeverityInput" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);">' +
                '<option value="lenient" ' + (summary.justice.severity === 'lenient' ? 'selected' : '') + '>Lenient</option>' +
                '<option value="medium" ' + (summary.justice.severity === 'medium' ? 'selected' : '') + '>Medium</option>' +
                '<option value="harsh" ' + (summary.justice.severity === 'harsh' ? 'selected' : '') + '>Harsh</option>' +
                '<option value="extreme" ' + (summary.justice.severity === 'extreme' ? 'selected' : '') + '>Extreme</option>' +
                '</select>' +
                '<small style="font-size: 0.5rem; color: var(--dim);">Harsher justice reduces crime but may affect prosperity</small>' +
                '</div>';

            content += '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">' +
                '<input type="checkbox" id="hasWatchInput" ' + (summary.justice.hasWatch ? 'checked' : '') + '>' +
                '<span style="font-size: 0.7rem;">Has Watch / Guard Force</span>' +
                '</label>' +
                '</div>';

            content += '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Watch Size</label>' +
                '<input type="number" id="watchSizeInput" value="' + (summary.justice.watchSize || 0) + '" min="0" step="5" style="width: 120px; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);">' +
                '<small style="font-size: 0.5rem; color: var(--dim);">Larger watch reduces crime but costs more</small>' +
                '</div>';

            content += '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim);">' +
                infoIcon + ' Current crime rate: ' + Math.round(summary.crimeRate * 100) + '%' +
                '</div>';

            content += '</div>';

            _openModal({
                title: 'Justice & Watch Management: ' + _escapeHtml(place.displayName),
                content: content,
                confirmText: 'Save Changes',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var severity = document.getElementById('justiceSeverityInput').value;
                    var hasWatch = document.getElementById('hasWatchInput').checked;
                    var watchSize = parseInt(document.getElementById('watchSizeInput').value) || 0;

                    var results = [];
                    if (severity !== summary.justice.severity) {
                        results.push(SettlementCommands.updateJusticeSeverity(locationId, severity));
                    }
                    if (hasWatch !== summary.justice.hasWatch || watchSize !== summary.justice.watchSize) {
                        results.push(SettlementCommands.updateWatch(locationId, hasWatch, watchSize));
                    }

                    var success = results.every(function(r) { return r && r.success; });
                    if (success) {
                        _showToast('Justice system updated', 'success');
                        _closeTopModal();
                        if (onSuccess) onSuccess();
                    } else {
                        _showToast('Failed to update justice system', 'error');
                    }
                    return true;
                }
            });

        } finally {
            _openingModal = false;
        }
    }

    // =========================================================================
    // 7. FINANCIAL REPORT MODAL
    // =========================================================================

    function openFinancialReportModal(locationId) {
        if (_openingModal) {
            _showToast('Modal is already opening', 'warning');
            return;
        }
        _openingModal = true;

        try {
            var place = _getPlaceById(locationId);
            if (!place) {
                _showToast('Location not found', 'error');
                return;
            }

            var report = _getFinancialReport(locationId, 5);
            if (!report) {
                _showToast('Financial report not available', 'error');
                return;
            }

            var infoIcon = _getIcon('CIRCLE_DOT');
            var coinIcon = _getIcon('COIN');

            var summary = report.summary;

            var content = '<div style="max-height: 500px; overflow-y: auto; padding: 4px;">';

            content += '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; margin-bottom: 16px;">' +
                '<strong>' + coinIcon + ' Financial Report</strong>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">' + _escapeHtml(place.displayName) + ' - 5 Year Summary</div>' +
                '</div>';

            content += '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 16px;">' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Avg Income</div>' +
                '<div style="font-size: 1rem; font-weight: bold; color: var(--success);">' + summary.averageIncome + ' gold</div>' +
                '</div>' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Avg Expenses</div>' +
                '<div style="font-size: 1rem; font-weight: bold; color: var(--danger);">' + summary.averageExpenses + ' gold</div>' +
                '</div>' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Avg Surplus</div>' +
                '<div style="font-size: 1rem; font-weight: bold; color: ' + (summary.averageSurplus >= 0 ? 'var(--success)' : 'var(--danger)') + ';">' + summary.averageSurplus + ' gold</div>' +
                '</div>' +
                '</div>';

            content += '<div style="background: var(--bg3); padding: 8px; border-radius: 6px;">';
            content += '<div style="font-size: 0.6rem; color: var(--dim); margin-bottom: 4px;">Yearly Breakdown</div>';
            for (var i = 0; i < report.reports.length; i++) {
                var r = report.reports[i];
                var isSurplus = r.surplus >= 0;
                content += '<div style="display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px solid var(--border-light); font-size: 0.55rem;">' +
                    '<span style="color: var(--dim);">' + r.year + '</span>' +
                    '<span>Income: ' + r.income + '</span>' +
                    '<span>Expenses: ' + r.expenses + '</span>' +
                    '<span style="color: ' + (isSurplus ? 'var(--success)' : 'var(--danger)') + ';">Surplus: ' + (isSurplus ? '+' : '') + r.surplus + '</span>' +
                    '</div>';
            }
            content += '</div>';

            content += '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim); margin-top: 12px;">' +
                infoIcon + ' Based on current economic conditions. Historical data is simulated.' +
                '</div>';

            content += '</div>';

            _openModal({
                title: 'Financial Report: ' + _escapeHtml(place.displayName),
                content: content,
                confirmText: 'Close',
                cancelText: '',
                size: 'large',
                onConfirm: function() {}
            });

        } finally {
            _openingModal = false;
        }
    }

    // =========================================================================
    // 8. EFFICIENCY SCORE MODAL
    // =========================================================================

    function openEfficiencyScoreModal(locationId) {
        if (_openingModal) {
            _showToast('Modal is already opening', 'warning');
            return;
        }
        _openingModal = true;

        try {
            var place = _getPlaceById(locationId);
            if (!place) {
                _showToast('Location not found', 'error');
                return;
            }

            var score = _getEfficiencyScore(locationId);
            if (!score) {
                _showToast('Efficiency score not available', 'error');
                return;
            }

            var infoIcon = _getIcon('CIRCLE_DOT');
            var starIcon = _getIcon('STAR_4');

            var ratingColor = score.efficiency >= 80 ? 'var(--success)' :
                             score.efficiency >= 60 ? 'var(--accent)' :
                             score.efficiency >= 40 ? 'var(--warn)' :
                             score.efficiency >= 20 ? 'var(--danger)' : 'var(--danger-dark)';

            var content = '<div style="max-height: 500px; overflow-y: auto; padding: 4px;">';

            content += '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; margin-bottom: 16px;">' +
                '<strong>' + starIcon + ' Government Efficiency</strong>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">' + _escapeHtml(place.displayName) + '</div>' +
                '</div>';

            content += '<div style="text-align: center; padding: 20px; background: var(--bg3); border-radius: 8px; margin-bottom: 16px;">' +
                '<div style="font-size: 3rem; font-weight: bold; color: ' + ratingColor + ';">' + score.efficiency + '</div>' +
                '<div style="font-size: 1rem; font-weight: bold; color: ' + ratingColor + ';">' + score.rating + '</div>' +
                '</div>';

            content += '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 6px;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Income</div>' +
                '<div style="font-size: 1rem; font-weight: bold;">' + score.income + ' gold</div>' +
                '</div>' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 6px;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Expenses</div>' +
                '<div style="font-size: 1rem; font-weight: bold; color: var(--danger);">' + score.expenses + ' gold</div>' +
                '</div>' +
                '</div>';

            content += '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 6px;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Population</div>' +
                '<div style="font-size: 1rem; font-weight: bold;">' + score.population + '</div>' +
                '</div>' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 6px;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Income per Capita</div>' +
                '<div style="font-size: 1rem; font-weight: bold;">' + score.incomePerCapita + ' gold</div>' +
                '</div>' +
                '</div>';

            content += '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim);">' +
                infoIcon + ' Efficiency score measures how effectively the settlement generates income relative to expenses.' +
                '</div>';

            content += '</div>';

            _openModal({
                title: 'Efficiency Score: ' + _escapeHtml(place.displayName),
                content: content,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {}
            });

        } finally {
            _openingModal = false;
        }
    }

    // =========================================================================
    // 9. DEBT MANAGEMENT MODAL
    // =========================================================================

    function openDebtManagementModal(locationId, onSuccess) {
        if (_openingModal) {
            _showToast('Modal is already opening', 'warning');
            return;
        }
        _openingModal = true;

        try {
            var place = _getPlaceById(locationId);
            if (!place) {
                _showToast('Location not found', 'error');
                return;
            }

            var summary = _getSettlementSummary(locationId);
            if (!summary) {
                _showToast('Settlement data not found', 'error');
                return;
            }

            var debtRatio = _getDebtRatio(locationId);
            var infoIcon = _getIcon('CIRCLE_DOT');
            var warningIcon = _getIcon('WARNING');

            var content = '<div style="max-height: 500px; overflow-y: auto; padding: 4px;">';

            content += '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; margin-bottom: 16px;">' +
                '<strong>' + _escapeHtml(place.displayName) + '</strong>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">Debt Management</div>' +
                '</div>';

            content += '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Total Debt</div>' +
                '<div style="font-size: 1.2rem; font-weight: bold; color: ' + (summary.totalDebt > 0 ? 'var(--danger)' : 'var(--success)') + ';">' + summary.totalDebt + ' gold</div>' +
                '</div>' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Debt Ratio</div>' +
                '<div style="font-size: 1.2rem; font-weight: bold; color: ' + (debtRatio > 50 ? 'var(--danger)' : debtRatio > 25 ? 'var(--warn)' : 'var(--success)') + ';">' + debtRatio + '%</div>' +
                '</div>' +
                '</div>';

            if (summary.totalDebt > 0) {
                content += '<div style="background: rgba(200, 68, 68, 0.15); padding: 12px; border-radius: 8px; margin-bottom: 16px; border-left: 3px solid var(--danger);">' +
                    warningIcon + ' Debt incurs 5% annual interest. Currently paying ' + Math.floor(summary.totalDebt * 0.05) + ' gold/year in interest.' +
                    '</div>';

                content += '<div class="form-group" style="margin-bottom: 12px;">' +
                    '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Repay Debt</label>' +
                    '<div style="display: flex; gap: 8px; align-items: center;">' +
                    '<input type="number" id="repayAmount" value="0" min="0" max="' + summary.wealth + '" style="width: 120px; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);">' +
                    '<span style="font-size: 0.55rem; color: var(--dim);">Max: ' + summary.wealth + ' gold</span>' +
                    '<button id="repayAllBtn" class="btn" style="font-size: 0.6rem; padding: 4px 10px;">Repay All</button>' +
                    '</div>' +
                    '<small style="font-size: 0.5rem; color: var(--dim);">Using wealth to repay debt reduces interest payments</small>' +
                    '</div>';
            } else {
                content += '<div style="background: rgba(74, 158, 106, 0.15); padding: 12px; border-radius: 8px; margin-bottom: 16px; border-left: 3px solid var(--success);">' +
                    'Settlement has no debt' +
                    '</div>';
            }

            content += '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim);">' +
                infoIcon + ' Wealth: ' + summary.wealth + ' gold · Net Worth: ' + summary.netWorth + ' gold' +
                '</div>';

            content += '</div>';

            _openModal({
                title: 'Debt Management: ' + _escapeHtml(place.displayName),
                content: content,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {}
            });

            if (summary.totalDebt > 0) {
                setTimeout(function() {
                    var repayAllBtn = document.getElementById('repayAllBtn');
                    if (repayAllBtn) {
                        repayAllBtn.addEventListener('click', function() {
                            var repayAmount = document.getElementById('repayAmount');
                            if (repayAmount) {
                                repayAmount.value = Math.min(summary.totalDebt, summary.wealth);
                            }
                        });
                    }

                    var repayAmountInput = document.getElementById('repayAmount');
                    var form = document.querySelector('.modal-footer');
                    if (repayAmountInput && form) {
                        var confirmBtn = form.querySelector('.confirm-btn');
                        if (confirmBtn) {
                            var originalOnClick = confirmBtn.onclick;
                            confirmBtn.onclick = function() {
                                var amount = parseInt(document.getElementById('repayAmount').value) || 0;
                                if (amount <= 0) {
                                    _showToast('Enter a valid amount to repay', 'error');
                                    return false;
                                }
                                if (amount > summary.wealth) {
                                    _showToast('Not enough wealth to repay ' + amount + ' gold', 'error');
                                    return false;
                                }

                                _confirmDialog(
                                    'Repay ' + amount + ' gold of debt? This will reduce your wealth by ' + amount + ' gold.',
                                    'Confirm Repayment',
                                    function() {
                                        var result = SettlementCommands.updateWealth(locationId, -amount, 'Debt repayment');
                                        if (result && result.success) {
                                            var debtResult = SettlementCommands.updateDebt(locationId, -amount, 'Debt repayment');
                                            if (debtResult && debtResult.success) {
                                                _showToast('Repaid ' + amount + ' gold of debt', 'success');
                                                _closeTopModal();
                                                if (onSuccess) onSuccess();
                                            }
                                        }
                                    }
                                );
                                return false;
                            };
                        }
                    }
                }, 100);
            }

        } finally {
            _openingModal = false;
        }
    }

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

    window.openTaxRateManagementModal = openTaxRateManagementModal;
    window.openSpendingManagementModal = openSpendingManagementModal;
    window.openJusticeManagementModal = openJusticeManagementModal;
    window.openFinancialReportModal = openFinancialReportModal;
    window.openEfficiencyScoreModal = openEfficiencyScoreModal;
    window.openDebtManagementModal = openDebtManagementModal;

})();