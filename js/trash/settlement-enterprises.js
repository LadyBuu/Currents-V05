/**
 * =============================================================================
 * SETTLEMENT ENTERPRISES - State and public enterprise management js/settlement/settlement-enterprises.js
 * =============================================================================
 * 
 * DEPENDENCIES:
 *   - settlement-state.js (SettlementState)
 *   - industry-state.js (IndustryState)
 *   - accessors.js (getPlaceById)
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

    function _addStateEnterprise(locationId, enterpriseId) {
        if (typeof window.SettlementState !== 'undefined' &&
            typeof window.SettlementState._addStateEnterprise === 'function') {
            return window.SettlementState._addStateEnterprise(locationId, enterpriseId);
        }
        return false;
    }

    function _removeStateEnterprise(locationId, enterpriseId) {
        if (typeof window.SettlementState !== 'undefined' &&
            typeof window.SettlementState._removeStateEnterprise === 'function') {
            return window.SettlementState._removeStateEnterprise(locationId, enterpriseId);
        }
        return false;
    }

    function _addPublicEnterprise(locationId, enterpriseId) {
        if (typeof window.SettlementState !== 'undefined' &&
            typeof window.SettlementState._addPublicEnterprise === 'function') {
            return window.SettlementState._addPublicEnterprise(locationId, enterpriseId);
        }
        return false;
    }

    function _removePublicEnterprise(locationId, enterpriseId) {
        if (typeof window.SettlementState !== 'undefined' &&
            typeof window.SettlementState._removePublicEnterprise === 'function') {
            return window.SettlementState._removePublicEnterprise(locationId, enterpriseId);
        }
        return false;
    }

    function _getPlaceById(id) {
        return typeof window.getPlaceById === 'function' ? window.getPlaceById(id) : null;
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

    function _recalculateEmployment(locationId) {
        if (typeof window.recalculateSettlementEmployment === 'function') {
            window.recalculateSettlementEmployment(locationId);
        }
    }

    function _recalculateBudget(locationId) {
        if (typeof window.recalculateSettlementBudget === 'function') {
            window.recalculateSettlementBudget(locationId);
        }
    }

    function _getIndustryState() {
        return typeof window.IndustryState !== 'undefined' ? window.IndustryState : null;
    }

    function addStateEnterprise(locationId, enterpriseId) {
        if (_processing) return false;
        _processing = true;

        try {
            var data = _getSettlementData(locationId);
            if (!data) {
                _showToast('Settlement not found', 'error');
                return false;
            }

            if (!data.stateEnterpriseIds) data.stateEnterpriseIds = [];
            if (data.stateEnterpriseIds.indexOf(enterpriseId) !== -1) {
                _showToast('State enterprise already exists', 'warning');
                return false;
            }

            var industryState = _getIndustryState();
            var enterprise = null;
            if (industryState && typeof industryState.getEnterprise === 'function') {
                enterprise = industryState.getEnterprise(enterpriseId);
            }
            if (!enterprise) {
                _showToast('Enterprise not found', 'error');
                return false;
            }

            var result = _addStateEnterprise(locationId, enterpriseId);
            if (result) {
                var place = _getPlaceById(locationId);
                _showToast('State enterprise added to ' + (place ? place.displayName : 'Unknown'), 'success');
                _logEvent('settlement', 'state_enterprise_added', 'State enterprise added', []);
                _recalculateEmployment(locationId);
                _recalculateBudget(locationId);
                return true;
            }
            return false;

        } finally {
            _processing = false;
        }
    }

    function removeStateEnterprise(locationId, enterpriseId) {
        if (_processing) return false;
        _processing = true;

        try {
            var data = _getSettlementData(locationId);
            if (!data || !data.stateEnterpriseIds) {
                _showToast('Settlement not found', 'error');
                return false;
            }

            if (data.stateEnterpriseIds.indexOf(enterpriseId) === -1) {
                _showToast('State enterprise not found', 'error');
                return false;
            }

            var result = _removeStateEnterprise(locationId, enterpriseId);
            if (result) {
                var place = _getPlaceById(locationId);
                _showToast('State enterprise removed from ' + (place ? place.displayName : 'Unknown'), 'info');
                _recalculateEmployment(locationId);
                _recalculateBudget(locationId);
                return true;
            }
            return false;

        } finally {
            _processing = false;
        }
    }

    function addPublicEnterprise(locationId, enterpriseId) {
        if (_processing) return false;
        _processing = true;

        try {
            var data = _getSettlementData(locationId);
            if (!data) {
                _showToast('Settlement not found', 'error');
                return false;
            }

            if (!data.publicEnterpriseIds) data.publicEnterpriseIds = [];
            if (data.publicEnterpriseIds.indexOf(enterpriseId) !== -1) {
                _showToast('Public enterprise already exists', 'warning');
                return false;
            }

            var industryState = _getIndustryState();
            var enterprise = null;
            if (industryState && typeof industryState.getEnterprise === 'function') {
                enterprise = industryState.getEnterprise(enterpriseId);
            }
            if (!enterprise) {
                _showToast('Enterprise not found', 'error');
                return false;
            }

            var result = _addPublicEnterprise(locationId, enterpriseId);
            if (result) {
                var place = _getPlaceById(locationId);
                _showToast('Public enterprise added to ' + (place ? place.displayName : 'Unknown'), 'success');
                _logEvent('settlement', 'public_enterprise_added', 'Public enterprise added', []);
                _recalculateEmployment(locationId);
                _recalculateBudget(locationId);
                return true;
            }
            return false;

        } finally {
            _processing = false;
        }
    }

    function removePublicEnterprise(locationId, enterpriseId) {
        if (_processing) return false;
        _processing = true;

        try {
            var data = _getSettlementData(locationId);
            if (!data || !data.publicEnterpriseIds) {
                _showToast('Settlement not found', 'error');
                return false;
            }

            if (data.publicEnterpriseIds.indexOf(enterpriseId) === -1) {
                _showToast('Public enterprise not found', 'error');
                return false;
            }

            var result = _removePublicEnterprise(locationId, enterpriseId);
            if (result) {
                var place = _getPlaceById(locationId);
                _showToast('Public enterprise removed from ' + (place ? place.displayName : 'Unknown'), 'info');
                _recalculateEmployment(locationId);
                _recalculateBudget(locationId);
                return true;
            }
            return false;

        } finally {
            _processing = false;
        }
    }

    window.SettlementEnterprises = {
        addStateEnterprise: addStateEnterprise,
        removeStateEnterprise: removeStateEnterprise,
        addPublicEnterprise: addPublicEnterprise,
        removePublicEnterprise: removePublicEnterprise
    };

})();
