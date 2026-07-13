/**
 * =============================================================================
 * SETTLEMENT BUDGET - Budget allocation and tax management
 * =============================================================================
 * 
 * DEPENDENCIES:
 *   - settlement-state.js (SettlementState)
 *   - accessors.js (getPlaceById, getCurrentYear)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    var _processing = false;

    function _getSettlementData(locationId) {
        if (typeof window.SettlementState !== 'undefined' &&
            typeof window.SettlementState.getSettlementData === 'function') {
            return window.SettlementState.getSettlementData(locationId);
        }
        return null;
    }

    function _updateSettlementData(locationId, updates) {
        if (typeof window.SettlementState !== 'undefined' &&
            typeof window.SettlementState._updateSettlementData === 'function') {
            return window.SettlementState._updateSettlementData(locationId, updates);
        }
        return null;
    }

    function _getPlaceById(id) {
        return typeof window.getPlaceById === 'function' ? window.getPlaceById(id) : null;
    }

    function _getCurrentYear() {
        if (typeof window.getCurrentYearSafe === 'function') return window.getCurrentYearSafe();
        if (typeof window.getCurrentYear === 'function') return window.getCurrentYear();
        return 1250;
    }

    function _showToast(msg, type) {
        if (typeof window._showToast === 'function') window._showToast(msg, type);
        else if (typeof window.showToast === 'function') window.showToast(msg, type);
    }

    function _logEvent(category, type, message, subjects) {
        if (typeof window.logEvent === 'function') {
            window.logEvent(category, type, message, subjects);
        }
    }

    function _recalculateBudget(locationId) {
        if (typeof window.recalculateSettlementBudget === 'function') {
            window.recalculateSettlementBudget(locationId);
        }
    }

    function setBudgetAllocation(locationId, allocation) {
        if (_processing) return null;
        _processing = true;

        try {
            var data = _getSettlementData(locationId);
            if (!data) {
                _showToast('Settlement not found', 'error');
                return null;
            }

            var updates = {
                budgetAllocationYear: _getCurrentYear(),
                updatedAt: _getCurrentYear()
            };

            if (allocation.educationBudget !== undefined) {
                updates.educationBudget = Math.max(0, allocation.educationBudget);
            }
            if (allocation.governmentSalaryBudget !== undefined) {
                updates.governmentSalaryBudget = Math.max(0, allocation.governmentSalaryBudget);
            }
            if (allocation.infrastructureBudget !== undefined) {
                updates.infrastructureBudget = Math.max(0, allocation.infrastructureBudget);
            }
            if (allocation.militaryBudget !== undefined) {
                updates.militaryBudget = Math.max(0, allocation.militaryBudget);
            }

            var result = _updateSettlementData(locationId, updates);
            if (result) {
                var place = _getPlaceById(locationId);
                _showToast('Budget allocation updated for ' + (place ? place.displayName : 'Unknown'), 'success');
                _logEvent('settlement', 'budget_allocated', 'Budget allocated', []);
                _recalculateBudget(locationId);
                return result;
            }
            return null;

        } finally {
            _processing = false;
        }
    }

    function setTaxRate(locationId, rate) {
        if (_processing) return false;
        _processing = true;

        try {
            var data = _getSettlementData(locationId);
            if (!data) {
                _showToast('Settlement not found', 'error');
                return false;
            }

            var newRate = Math.max(0, Math.min(100, rate));
            var result = _updateSettlementData(locationId, {
                taxRate: newRate,
                updatedAt: _getCurrentYear()
            });

            if (result) {
                var place = _getPlaceById(locationId);
                _showToast('Tax rate set to ' + newRate + '% for ' + (place ? place.displayName : 'Unknown'), 'success');
                _recalculateBudget(locationId);
                return true;
            }
            return false;

        } finally {
            _processing = false;
        }
    }

    function setTradeTariff(locationId, tariff) {
        if (_processing) return false;
        _processing = true;

        try {
            var data = _getSettlementData(locationId);
            if (!data) {
                _showToast('Settlement not found', 'error');
                return false;
            }

            var newTariff = Math.max(0, Math.min(100, tariff));
            var result = _updateSettlementData(locationId, {
                tradeTariff: newTariff,
                updatedAt: _getCurrentYear()
            });

            if (result) {
                var place = _getPlaceById(locationId);
                _showToast('Trade tariff set to ' + newTariff + '% for ' + (place ? place.displayName : 'Unknown'), 'success');
                _recalculateBudget(locationId);
                return true;
            }
            return false;

        } finally {
            _processing = false;
        }
    }

    function setIndustryTaxRate(locationId, rate) {
        if (_processing) return false;
        _processing = true;

        try {
            var data = _getSettlementData(locationId);
            if (!data) {
                _showToast('Settlement not found', 'error');
                return false;
            }

            var newRate = Math.max(0, Math.min(100, rate));
            var result = _updateSettlementData(locationId, {
                industryTaxRate: newRate,
                updatedAt: _getCurrentYear()
            });

            if (result) {
                var place = _getPlaceById(locationId);
                _showToast('Industry tax rate set to ' + newRate + '% for ' + (place ? place.displayName : 'Unknown'), 'success');
                _recalculateBudget(locationId);
                return true;
            }
            return false;

        } finally {
            _processing = false;
        }
    }

    window.SettlementBudget = {
        setBudgetAllocation: setBudgetAllocation,
        setTaxRate: setTaxRate,
        setTradeTariff: setTradeTariff,
        setIndustryTaxRate: setIndustryTaxRate
    };

})();