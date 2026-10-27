/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT ECONOMY MODALS
 * js/settlement/modals-settlement-economy.js
 * =============================================================================
 *
 * ECONOMY MODALS.
 *
 * This file contains the settlement economy UI modals:
 *
 *   - openTaxRateModal          : view and change tax rate / tariff / industry tax
 *   - openSpendingModal         : view military / infrastructure / education spending
 *   - openJusticeModal          : view and change justice severity / watch
 *   - openDebtManagementModal   : view and manage debt (borrow / repay)
 *   - openFinancialReportModal  : current financial snapshot
 *   - openEfficiencyModal       : efficiency score and rating
 *
 * It is a UI module. It:
 *   - reads through SettlementViewModels and query modules
 *   - calls commands for mutations
 *   - uses the core modal shell for presentation
 *   - does not read or write canonical settlement state directly
 *   - does not create settlement records
 *   - does not persist
 *   - does not fabricate domain values
 *   - does not hardcode fiscal limits (reads from definitions)
 *   - does not use recursion guards
 *   - does not use setTimeout to guess when the DOM is ready
 *   - does not hijack modal-core's confirm button after the fact
 *
 * Contract reference: Settlement Architecture Contracts §12 (Command
 * Contract), §15 (ViewModel Contract), §16 (UI Contract), §21 (Fiscal
 * Contract), §32 (Completion Standard).
 *
 * Modal infrastructure:
 *
 *   This module uses the CORE modals, not a ModalsCore namespace:
 *     - window.openModal(options) -> { element, close }
 *     - window.closeTopModal()
 *     - window.showToast(message, type)
 *     - window.confirmDialog(message, title, onConfirm)
 *
 *   `titleHtml` and `contentHtml` are the accepted option keys.
 *   `title` and `content` are silently ignored by the core.
 *
 *   The content container for event delegation is `result.element`.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCIES
    // =========================================================================

    function _getViewModels()       { return window.SettlementViewModels; }
    function _getSettlementQueries(){ return window.SettlementQueries; }
    function _getPlaceQueries()     { return window.PlaceQueries; }
    function _getFiscalCommands()   { return window.SettlementFiscalCommands; }
    function _getFiscalRules()      { return window.SettlementFiscalRules; }
    function _getGovernmentCommands(){ return window.SettlementGovernmentCommands; }
    function _getGovernmentRules()  { return window.SettlementGovernmentRules; }
    function _getDebtCommands()     { return window.SettlementDebtCommands; }
    function _getEconomyQueries()   { return window.SettlementEconomyQueries; }
    function _getFiscalDefinitions() { return window.SettlementFiscalDefinitions; }
    function _getGovernmentDefinitions() { return window.SettlementGovernmentDefinitions; }
    function _getFinanceDefinitions() { return window.SettlementFinanceDefinitions; }

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

    function _placeName(locationId) {
        var place = _getPlaceQueries().getPlaceById(locationId);
        return place ? place.displayName : null;
    }

    function _unknown() {
        return '<span class="value-unknown">—</span>';
    }

    function _fmtNumber(value) {
        if (typeof value !== 'number' || !isFinite(value)) return _unknown();
        return _escapeHtml(value.toLocaleString());
    }

    /**
     * Opens a modal via the core modal shell. Returns the modal element,
     * or null if openModal returned an unexpected shape.
     */
    function _openModal(options) {
        var result = window.openModal(options);
        if (!result) return null;
        if (result.element && result.element.nodeType === 1) return result.element;
        return null;
    }

    function _closeTopModal() {
        window.closeTopModal();
    }

    function _toast(message, type) {
        window.showToast(message, type);
    }

    function _confirm(message, title, onConfirm) {
        window.confirmDialog(message, title, onConfirm);
    }

    // =========================================================================
    // 3. TAX RATE MODAL
    // =========================================================================

    function openTaxRateModal(locationId) {
        var summary = _getViewModels().buildSettlementSummary(locationId);
        if (!summary) {
            _toast('Settlement not found.', 'error');
            return;
        }

        var taxLimits = _getFiscalDefinitions().TAX_RATE;
        var tariffLimits = _getFiscalDefinitions().TRADE_TARIFF;
        var industryLimits = _getFiscalDefinitions().INDUSTRY_TAX_RATE;

        var taxRate = summary.taxRate;
        var tradeTariff = summary.tradeTariff;
        var industryTaxRate = summary.industryTaxRate;

        var content = '';
        content += '<div class="fiscal-form">';

        content += _rateField('taxRate', 'Tax Rate',
            taxRate, taxLimits.min, taxLimits.max);
        content += _rateField('tradeTariff', 'Trade Tariff',
            tradeTariff, tariffLimits.min, tariffLimits.max);
        content += _rateField('industryTaxRate', 'Industry Tax Rate',
            industryTaxRate, industryLimits.min, industryLimits.max);

        content += '</div>';

        var container = _openModal({
            titleHtml: 'Fiscal Policy: ' + _escapeHtml(summary.name || ''),
            contentHtml: content,
            confirmText: 'Save',
            cancelText: 'Cancel',
            onConfirm: function () {
                var form = container.querySelector('.fiscal-form');
                if (!form) return false;

                var taxInput = form.querySelector('input[name="taxRate"]');
                var tariffInput = form.querySelector('input[name="tradeTariff"]');
                var industryInput = form.querySelector('input[name="industryTaxRate"]');

                var update = {};
                if (taxInput && taxInput.value !== '') {
                    update.taxRate = Number(taxInput.value);
                }
                if (tariffInput && tariffInput.value !== '') {
                    update.tradeTariff = Number(tariffInput.value);
                }
                if (industryInput && industryInput.value !== '') {
                    update.industryTaxRate = Number(industryInput.value);
                }

                var result = _getFiscalCommands().updateFiscalPolicy(locationId, update);
                if (result.success) {
                    if (result.noop) {
                        _toast('No changes to save.', 'info');
                    } else {
                        _toast('Fiscal policy updated.', 'success');
                    }
                    return true;
                } else {
                    _toast('Update failed: ' + result.code, 'error');
                    return false;
                }
            }
        });

        if (!container) return;
    }

    function _rateField(name, label, current, min, max) {
        var value = typeof current === 'number' ? current : '';
        return '' +
            '<div class="fiscal-form__row">' +
            '<label class="fiscal-form__label" for="fiscal-' + name + '">' + _escapeHtml(label) + '</label>' +
            '<input class="fiscal-form__input" id="fiscal-' + name + '" name="' + name + '"' +
            ' type="number" min="' + min + '" max="' + max + '" step="1" value="' + value + '">' +
            '<span class="fiscal-form__range">' + min + '–' + max + '</span>' +
            '</div>';
    }

    // =========================================================================
    // 4. SPENDING MODAL
    // =========================================================================
    //
    // Spending is a fiscal policy field. It is presented here for
    // convenience because it belongs with the economy UI. The command
    // that owns these fields is SettlementFiscalCommands; spending
    // fields are updated through the budget allocation path, not
    // through a separate setter. If a separate spending command is
    // added later, this modal calls it. For now, spending fields are
    // read-only unless a command exists to change them.
    //

    function openSpendingModal(locationId) {
        var summary = _getViewModels().buildSettlementSummary(locationId);
        if (!summary) {
            _toast('Settlement not found.', 'error');
            return;
        }

        var settlement = _getSettlementQueries().getSettlementData(locationId);

        var military = typeof settlement.militarySpending === 'number' ? settlement.militarySpending : null;
        var infrastructure = typeof settlement.infrastructureSpending === 'number' ? settlement.infrastructureSpending : null;
        var education = typeof settlement.educationSpending === 'number' ? settlement.educationSpending : null;

        var content = '';
        content += '<div class="spending-view">';
        content += _fieldRow('Military Spending', military);
        content += _fieldRow('Infrastructure Spending', infrastructure);
        content += _fieldRow('Education Spending', education);
        content += '</div>';

        content += '<div class="spending-view__note">' +
            'Spending is set through the annual budget. ' +
            'This view is read-only.' +
            '</div>';

        _openModal({
            titleHtml: 'Spending: ' + _escapeHtml(summary.name || ''),
            contentHtml: content,
            confirmText: 'Close',
            cancelText: '',
            size: 'medium',
            onConfirm: function () {}
        });
    }

    // =========================================================================
    // 5. JUSTICE MODAL
    // =========================================================================

    function openJusticeModal(locationId) {
        var summary = _getViewModels().buildSettlementSummary(locationId);
        if (!summary) {
            _toast('Settlement not found.', 'error');
            return;
        }

        var severities = _getGovernmentDefinitions().JUSTICE_SEVERITIES;
        var currentSeverity = summary.justiceSeverity;

        var content = '';
        content += '<div class="justice-form">';

        content += '<div class="justice-form__group">';
        content += '<label class="justice-form__label" for="justice-severity">Justice Severity</label>';
        content += '<select class="justice-form__select" id="justice-severity" name="severity">';
        for (var i = 0; i < severities.length; i++) {
            var s = severities[i];
            var selected = s.id === currentSeverity ? ' selected' : '';
            content += '<option value="' + _escapeHtml(s.id) + '"' + selected + '>' +
                _escapeHtml(s.name) + '</option>';
        }
        content += '</select>';
        content += '</div>';

        content += '<div class="justice-form__group">';
        content += '<label class="justice-form__checkbox">';
        content += '<input type="checkbox" name="hasWatch"' +
            (summary.hasWatch ? ' checked' : '') + '>';
        content += '<span>Maintain a watch</span>';
        content += '</label>';
        content += '</div>';

        content += '<div class="justice-form__group">';
        content += '<label class="justice-form__label" for="justice-watch-size">Watch Size</label>';
        content += '<input class="justice-form__input" type="number" id="justice-watch-size"' +
            ' name="watchSize" min="0" step="1" value="' +
            (typeof summary.watchSize === 'number' ? summary.watchSize : 0) + '">';
        content += '</div>';

        content += '</div>';

        var container = _openModal({
            titleHtml: 'Justice: ' + _escapeHtml(summary.name || ''),
            contentHtml: content,
            confirmText: 'Save',
            cancelText: 'Cancel',
            onConfirm: function () {
                var severitySelect = container.querySelector('select[name="severity"]');
                var watchCheckbox = container.querySelector('input[name="hasWatch"]');
                var watchSizeInput = container.querySelector('input[name="watchSize"]');

                var newSeverity = severitySelect ? severitySelect.value : null;
                var newHasWatch = watchCheckbox ? watchCheckbox.checked : false;
                var newWatchSize = watchSizeInput ? Number(watchSizeInput.value) : 0;

                var severityChanged = newSeverity && newSeverity !== currentSeverity;
                var watchChanged = newHasWatch !== summary.hasWatch ||
                    (newHasWatch && newWatchSize !== summary.watchSize);

                var success = true;

                if (severityChanged) {
                    var sevResult = _getGovernmentCommands().setJusticeSeverity(locationId, newSeverity);
                    if (!sevResult.success) {
                        _toast('Could not update justice severity: ' + sevResult.code, 'error');
                        success = false;
                    }
                }

                if (watchChanged) {
                    var watchResult = _getGovernmentCommands().setWatch(locationId, {
                        hasWatch: newHasWatch,
                        watchSize: newHasWatch ? newWatchSize : 0
                    });
                    if (!watchResult.success) {
                        _toast('Could not update watch: ' + watchResult.code, 'error');
                        success = false;
                    }
                }

                if (success) {
                    _toast('Justice updated.', 'success');
                    return true;
                }
                return false;
            }
        });

        if (!container) return;
    }

    // =========================================================================
    // 6. DEBT MANAGEMENT MODAL
    // =========================================================================

    function openDebtManagementModal(locationId) {
        var view = _getViewModels().buildDebtView(locationId);
        if (!view) {
            _toast('Settlement not found.', 'error');
            return;
        }

        var content = '';
        content += '<div class="debt-view">';

        content += '<div class="debt-view__row">';
        content += '<div class="debt-view__field">';
        content += '<div class="debt-view__label">Total Debt</div>';
        content += '<div class="debt-view__value">' + _fmtNumber(view.totalDebt) + '</div>';
        content += '</div>';
        content += '<div class="debt-view__field">';
        content += '<div class="debt-view__label">Wealth</div>';
        content += '<div class="debt-view__value">' + _fmtNumber(view.wealth) + '</div>';
        content += '</div>';
        content += '<div class="debt-view__field">';
        content += '<div class="debt-view__label">Debt Ratio</div>';
        content += '<div class="debt-view__value">' +
            (typeof view.debtRatio === 'number'
                ? _escapeHtml(view.debtRatio) + '%' +
                    (view.debtRatioBand ? ' — ' + _escapeHtml(view.debtRatioBand.name) : '')
                : _unknown()) + '</div>';
        content += '</div>';
        content += '</div>';

        if (typeof view.projectedAnnualInterest === 'number' && view.projectedAnnualInterest > 0) {
            content += '<div class="debt-view__interest">' +
                'Projected annual interest: ' + _escapeHtml(view.projectedAnnualInterest) + ' gold' +
                '</div>';
        }

        content += '<div class="debt-view__actions">';
        if (typeof view.totalDebt === 'number' && view.totalDebt > 0) {
            content += '<button type="button" data-action="repay-debt">Repay Debt</button>';
        }
        content += '<button type="button" data-action="borrow">Borrow</button>';
        content += '</div>';

        content += '</div>';

        var container = _openModal({
            titleHtml: 'Debt Management: ' + _escapeHtml(view.name || ''),
            contentHtml: content,
            confirmText: 'Close',
            cancelText: '',
            size: 'medium',
            onConfirm: function () {}
        });

        if (!container) return;

        container.addEventListener('click', function (event) {
            var button = event.target.closest('[data-action]');
            if (!button) return;
            var action = button.dataset.action;

            if (action === 'repay-debt') {
                _closeTopModal();
                openRepayDebtModal(locationId);
            } else if (action === 'borrow') {
                _closeTopModal();
                openBorrowModal(locationId);
            }
        });
    }

    function openRepayDebtModal(locationId) {
        var view = _getViewModels().buildDebtView(locationId);
        if (!view) return;

        var maxAmount = typeof view.totalDebt === 'number' ? view.totalDebt : 0;
        var availableWealth = typeof view.wealth === 'number' ? view.wealth : 0;
        var maxRepayable = Math.min(maxAmount, Math.max(0, availableWealth));

        var content = '';
        content += '<div class="debt-repay">';
        content += '<div class="debt-repay__row">';
        content += '<label for="repay-amount">Amount to Repay</label>';
        content += '<input id="repay-amount" name="amount" type="number" min="0" step="1"' +
            ' max="' + maxRepayable + '" value="0">';
        content += '<span class="debt-repay__hint">Max: ' + _escapeHtml(maxRepayable) + ' gold</span>';
        content += '</div>';
        content += '<div class="debt-repay__row">';
        content += '<button type="button" data-action="fill-max">Repay All Available</button>';
        content += '</div>';
        content += '</div>';

        var container = _openModal({
            titleHtml: 'Repay Debt',
            contentHtml: content,
            confirmText: 'Repay',
            cancelText: 'Cancel',
            size: 'small',
            onConfirm: function () {
                var input = container.querySelector('input[name="amount"]');
                if (!input) return false;
                var amount = Number(input.value);
                if (!isFinite(amount) || amount <= 0) {
                    _toast('Enter a positive amount.', 'error');
                    return false;
                }
                _confirm(
                    'Repay ' + amount + ' gold?',
                    'Confirm Repayment',
                    function () {
                        var result = _getDebtCommands().repayDebt(locationId, amount);
                        if (result.success) {
                            _toast('Repaid ' + result.appliedAmount + ' gold.', 'success');
                            _closeTopModal();
                        } else {
                            _toast('Repayment failed: ' + result.code, 'error');
                        }
                    }
                );
                return true;
            }
        });

        if (!container) return;

        container.addEventListener('click', function (event) {
            var button = event.target.closest('[data-action]');
            if (!button) return;
            if (button.dataset.action === 'fill-max') {
                var input = container.querySelector('input[name="amount"]');
                if (input) input.value = String(maxRepayable);
            }
        });
    }

    function openBorrowModal(locationId) {
        var view = _getViewModels().buildDebtView(locationId);
        if (!view) return;

        var content = '';
        content += '<div class="debt-borrow">';
        content += '<div class="debt-borrow__row">';
        content += '<label for="borrow-amount">Amount to Borrow</label>';
        content += '<input id="borrow-amount" name="amount" type="number" min="1" step="1" value="100">';
        content += '</div>';
        content += '<div class="debt-borrow__hint">' +
            'Interest accrues annually. The current annual rate is ' +
            (typeof view.interestRate === 'number'
                ? Math.round(view.interestRate * 100) + '%'
                : 'unknown') +
            '.' +
            '</div>';
        content += '</div>';

        var container = _openModal({
            titleHtml: 'Borrow',
            contentHtml: content,
            confirmText: 'Borrow',
            cancelText: 'Cancel',
            size: 'small',
            onConfirm: function () {
                var input = container.querySelector('input[name="amount"]');
                if (!input) return false;
                var amount = Number(input.value);
                if (!isFinite(amount) || amount <= 0) {
                    _toast('Enter a positive amount.', 'error');
                    return false;
                }
                var result = _getDebtCommands().borrow(locationId, amount);
                if (result.success) {
                    _toast('Borrowed ' + amount + ' gold.', 'success');
                    return true;
                }
                _toast('Borrow failed: ' + result.code, 'error');
                return false;
            }
        });

        if (!container) return;
    }

    // =========================================================================
    // 7. FINANCIAL REPORT MODAL
    // =========================================================================

    function openFinancialReportModal(locationId) {
        var view = _getViewModels().buildFinancialReportView(locationId);
        if (!view) {
            _toast('Financial data not available.', 'error');
            return;
        }

        var content = '';
        content += '<div class="financial-report">';

        content += '<div class="financial-report__notice">' +
            'Current snapshot for year ' + _escapeHtml(view.currentYear) + '.' +
            '</div>';

        content += '<section class="financial-report__section">';
        content += '<h3>Income</h3>';
        content += _fieldRow('Taxes', view.income.taxes);
        content += _fieldRow('Trade', view.income.trade);
        content += _fieldRow('Industry', view.income.industry);
        content += _fieldRow('State Enterprises', view.income.stateEnterprises);
        content += _fieldRow('Public Enterprises', view.income.publicEnterprises);
        content += _fieldRow('Total', view.income.total, true);
        content += '</section>';

        content += '<section class="financial-report__section">';
        content += '<h3>Expenses</h3>';
        content += _fieldRow('Maintenance', view.expenses.maintenance);
        content += _fieldRow('Wages', view.expenses.wages);
        content += _fieldRow('Military', view.expenses.military);
        content += _fieldRow('Infrastructure', view.expenses.infrastructure);
        content += _fieldRow('Education', view.expenses.education);
        content += _fieldRow('Government Salaries', view.expenses.governmentSalaries);
        content += _fieldRow('Total', view.expenses.total, true);
        content += '</section>';

        content += '<section class="financial-report__section">';
        content += '<h3>Surplus</h3>';
        content += _fieldRow('Annual Surplus', view.surplus, true);
        content += '</section>';

        content += '</div>';

        _openModal({
            titleHtml: 'Financial Report: ' + _escapeHtml(view.name || ''),
            contentHtml: content,
            confirmText: 'Close',
            cancelText: '',
            size: 'large',
            onConfirm: function () {}
        });
    }

    // =========================================================================
    // 8. EFFICIENCY MODAL
    // =========================================================================

    function openEfficiencyModal(locationId) {
        var view = _getViewModels().buildEfficiencyView(locationId);
        if (!view) {
            _toast('Efficiency data not available.', 'error');
            return;
        }

        var bandId = view.band ? view.band.id : 'unknown';
        var bandName = view.band ? view.band.name : null;

        var content = '';
        content += '<div class="efficiency-view">';

        content += '<div class="efficiency-view__score efficiency-view__score--' + _escapeHtml(bandId) + '">';
        content += '<div class="efficiency-view__value">' + _escapeHtml(view.efficiency) + '</div>';
        if (bandName) {
            content += '<div class="efficiency-view__band">' + _escapeHtml(bandName) + '</div>';
        }
        content += '</div>';

        content += '<div class="efficiency-view__row">';
        content += _fieldRow('Income', view.income);
        content += _fieldRow('Expenses', view.expenses);
        content += _fieldRow('Surplus', view.surplus, true);
        content += '</div>';

        content += '<div class="efficiency-view__row">';
        content += _fieldRow('Population', view.population);
        content += _fieldRow('Income per Capita', view.incomePerCapita);
        content += '</div>';

        content += '</div>';

        _openModal({
            titleHtml: 'Efficiency: ' + _escapeHtml(view.name || ''),
            contentHtml: content,
            confirmText: 'Close',
            cancelText: '',
            size: 'medium',
            onConfirm: function () {}
        });
    }

    // =========================================================================
    // 9. SHARED FIELD ROW
    // =========================================================================

    function _fieldRow(label, value, emphasized) {
        var cls = 'field-row' + (emphasized ? ' field-row--emphasized' : '');
        var display;
        if (typeof value === 'number') {
            display = _fmtNumber(value);
        } else if (value === null || value === undefined) {
            display = _unknown();
        } else {
            display = _escapeHtml(value);
        }
        return '<div class="' + cls + '">' +
            '<span class="field-row__label">' + _escapeHtml(label) + '</span>' +
            '<span class="field-row__value">' + display + '</span>' +
            '</div>';
    }

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

    window.SettlementEconomyModals = Object.freeze({
        openTaxRateModal: openTaxRateModal,
        openSpendingModal: openSpendingModal,
        openJusticeModal: openJusticeModal,
        openDebtManagementModal: openDebtManagementModal,
        openFinancialReportModal: openFinancialReportModal,
        openEfficiencyModal: openEfficiencyModal
    });

    // Legacy aliases for callers that still use the old names.
    window.openTaxRateManagementModal = openTaxRateModal;
    window.openSpendingManagementModal = openSpendingModal;
    window.openJusticeManagementModal = openJusticeModal;
    window.openDebtManagementModal = openDebtManagementModal;
    window.openFinancialReportModal = openFinancialReportModal;
    window.openEfficiencyScoreModal = openEfficiencyModal;

})();
