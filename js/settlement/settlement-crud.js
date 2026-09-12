/**
 * =============================================================================
 * SETTLEMENT CRUD - Create, read, update settlement data js/settlement/settlements-crud.js
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
        if (typeof window.getSettlementData === 'function') {
            return window.getSettlementData(locationId);
        }
        return null;
    }

    function _updateSettlementData(locationId, updates) {
        if (typeof window.SettlementState !== 'undefined' &&
            typeof window.SettlementState._updateSettlementData === 'function') {
            return window.SettlementState._updateSettlementData(locationId, updates);
        }
        if (typeof window.updateSettlementData === 'function') {
            return window.updateSettlementData(locationId, updates);
        }
        return null;
    }

    function _getPlaceById(id) {
        return typeof window.getPlaceById === 'function' ? window.getPlaceById(id) : null;
    }

    function _getCurrentYear() {
    // Delegates to time.js — do not add fallback logic here.
    return typeof window.getCurrentYearSafe === 'function'
        ? window.getCurrentYearSafe()
        : 1250;
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

    function createSettlementData(locationId, initialData) {
        if (_processing) return null;
        _processing = true;

        try {
            var existing = _getSettlementData(locationId);
            if (existing) {
                _showToast('Settlement data already exists', 'warning');
                return existing;
            }

            var place = _getPlaceById(locationId);
            var placeName = place ? place.displayName : 'Unknown';

            var data = {
                locationId: locationId,
                locationName: placeName,
                rankId: 'hamlet',
                specializationRoleId: null,
                featureIds: [],
                prosperity: 50,
                wealth: 0,
                totalDebt: 0,
                foundedYear: _getCurrentYear(),
                lastUpgraded: _getCurrentYear(),
                budgetAllocationYear: _getCurrentYear(),
                educationBudget: 0,
                educationSpending: 0,
                governmentSalaryBudget: 0,
                infrastructureBudget: 0,
                militaryBudget: 0,
                publicEnterpriseIds: [],
                publicEnterpriseHistory: [],
                placesOfWorship: [],
                dominantReligionId: null,
                religiousUnity: 50,
                civilLaws: [],
                budget: {
                    income: { taxes: 0, trade: 0, industry: 0, stateEnterprises: 0, other: 0 },
                    expenses: { maintenance: 0, wages: 0, construction: 0, military: 0, education: 0, infrastructure: 0, governmentSalaries: 0, other: 0 },
                    annualSurplus: 0,
                    totalIncome: 0,
                    totalExpenses: 0
                },
                employment: {
                    totalWorkers: 0,
                    stateEmployed: 0,
                    privateEmployed: 0,
                    unemployed: 0,
                    averageWage: 0,
                    employmentRate: 0
                },
                stateEnterpriseIds: [],
                taxRate: 10,
                tradeTariff: 5,
                industryTaxRate: 8,
                militarySpending: 0,
                infrastructureSpending: 0,
                educationSpending: 0,
                justiceSeverity: 'medium',
                crimeRate: 0.05,
                hasWatch: false,
                watchSize: 0,
                history: [],
                notes: ''
            };

            if (initialData) {
                for (var key in initialData) {
                    if (initialData.hasOwnProperty(key)) data[key] = initialData[key];
                }
            }

            var result = _updateSettlementData(locationId, data);
            if (result) {
                _showToast('Settlement created for ' + placeName, 'success');
                _logEvent('settlement', 'created', 'Settlement created for ' + placeName, []);
                return result;
            }
            return null;

        } finally {
            _processing = false;
        }
    }

    function updateSettlementData(locationId, updates) {
        if (_processing) return null;
        _processing = true;

        try {
            var data = _getSettlementData(locationId);
            if (!data) {
                _showToast('Settlement not found', 'error');
                return null;
            }

            var result = _updateSettlementData(locationId, updates);
            if (result) {
                var place = _getPlaceById(locationId);
                _showToast('Settlement updated for ' + (place ? place.displayName : 'Unknown'), 'success');
                return result;
            }
            return null;

        } finally {
            _processing = false;
        }
    }

    function initializeAllSettlements() {
        if (_processing) return { success: false, count: 0, locations: [] };
        _processing = true;

        try {
            var places = typeof window.getPlaces === 'function' ? window.getPlaces() : [];
            var initialized = [];

            for (var i = 0; i < places.length; i++) {
                var existing = _getSettlementData(places[i].id);
                if (!existing) {
                    var result = createSettlementData(places[i].id);
                    if (result) initialized.push(places[i].id);
                }
            }

            return { success: true, count: initialized.length, locations: initialized };

        } finally {
            _processing = false;
        }
    }

    window.SettlementCrud = {
        createSettlementData: createSettlementData,
        updateSettlementData: updateSettlementData,
        initializeAllSettlements: initializeAllSettlements
    };

})();