/**
 * =============================================================================
 * STILL WATERS - INDUSTRY PROCESSOR (industry-processor.js)
 * =============================================================================
 * 
 * LOCATION: js/core/industry/industry-processor.js
 * 
 * Annual processing for enterprises.
 * 
 * DEPENDENCIES:
 *   - industry-state.js (IndustryState)
 *   - industry-commands.js (IndustryCommands)
 *   - industry-queries.js (IndustryQueries)
 *   - time.js (getCurrentYearSafe)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getState() {
        return typeof window.IndustryState !== 'undefined' ? window.IndustryState : null;
    }

    function _getCommands() {
        return typeof window.IndustryCommands !== 'undefined' ? window.IndustryCommands : null;
    }

    function _getQueries() {
        return typeof window.IndustryQueries !== 'undefined' ? window.IndustryQueries : null;
    }

    function _getCurrentYear() {
        if (typeof window.getCurrentYearSafe === 'function') {
            return window.getCurrentYearSafe();
        }
        if (typeof window.getCurrentYear === 'function') {
            return window.getCurrentYear();
        }
        return 1250;
    }

    function _modifyHouseholdWealth(householdId, amount, reason) {
        if (typeof window.modifyHouseholdWealth === 'function') {
            return window.modifyHouseholdWealth(householdId, amount, reason);
        }
        return null;
    }

    // =========================================================================
    // 2. RECURSION GUARD
    // =========================================================================

    var _processing = false;

    // =========================================================================
    // 3. ANNUAL PROCESSING
    // =========================================================================

    function processAnnualEnterprise(enterpriseId) {
        if (_processing) {
            return { success: false, reason: 'Already processing' };
        }
        _processing = true;

        try {
            var state = _getState();
            var commands = _getCommands();
            var queries = _getQueries();

            if (!state || !commands || !queries) {
                return { success: false, reason: 'Industry system not available' };
            }

            var enterprise = queries.getEnterprise(enterpriseId);
            if (!enterprise) {
                return { success: false, reason: 'Enterprise not found' };
            }

            if (enterprise.status === 'inactive' || enterprise.status === 'bankrupt') {
                return { success: false, reason: 'Enterprise is ' + enterprise.status };
            }

            var currentYear = _getCurrentYear();
            var yearDiff = Math.max(1, currentYear - (enterprise.lastProcessedYear || enterprise.foundedYear));

            var annualIncome = enterprise.income || 10;

            var totalWages = 0;
            if (enterprise.workerWages) {
                for (var workerId in enterprise.workerWages) {
                    if (enterprise.workerWages.hasOwnProperty(workerId)) {
                        totalWages += enterprise.workerWages[workerId] || 0;
                    }
                }
            } else {
                totalWages = (enterprise.workerCount || 0) * (enterprise.wages || 8);
            }

            var annualExpenses = (enterprise.expenses || 5) + totalWages;
            var netProfit = annualIncome - annualExpenses;
            var totalProfit = netProfit * yearDiff;

            var newWealth = (enterprise.wealth || 0) + totalProfit;

            // Apply debt interest
            var newDebt = enterprise.debt || 0;
            if (newDebt > 0) {
                var interest = Math.floor(newDebt * 0.05 * yearDiff);
                newWealth -= interest;
                newDebt += interest;
            }

            // Update wealth and debt
            commands.updateEnterpriseWealth(enterpriseId, totalProfit - (newDebt - (enterprise.debt || 0)), 'Annual processing');

            // Update debt
            if (newDebt !== (enterprise.debt || 0)) {
                commands.updateEnterpriseDebt(enterpriseId, newDebt - (enterprise.debt || 0), 'Annual interest');
            }

            // Update status if bankrupt
            if (newWealth < -100) {
                commands.updateEnterprise(enterpriseId, { status: 'bankrupt' });
            }

            // Update last processed year
            commands.updateEnterprise(enterpriseId, { lastProcessedYear: currentYear });

            // Transfer profit/loss to household
            if (enterprise.ownerType === 'household' && enterprise.ownerId && totalProfit !== 0) {
                _modifyHouseholdWealth(enterprise.ownerId, totalProfit,
                    'Enterprise profit/loss: ' + enterprise.name);
            }

            return {
                success: true,
                enterpriseId: enterprise.id,
                enterpriseName: enterprise.name,
                year: currentYear,
                yearsProcessed: yearDiff,
                annualIncome: annualIncome,
                annualExpenses: annualExpenses,
                totalWages: totalWages,
                netProfit: netProfit,
                totalProfit: totalProfit,
                newWealth: newWealth,
                debt: newDebt,
                status: newWealth < -100 ? 'bankrupt' : enterprise.status
            };

        } finally {
            _processing = false;
        }
    }

    function processAllEnterprises() {
        if (_processing) {
            return { success: false, reason: 'Already processing' };
        }
        _processing = true;

        try {
            var queries = _getQueries();
            if (!queries) {
                return { success: false, reason: 'Industry queries not available' };
            }

            var all = queries.getAllEnterprises();
            var results = [];

            for (var i = 0; i < all.length; i++) {
                if (all[i].status === 'active' || all[i].status === 'inactive') {
                    var result = processAnnualEnterprise(all[i].id);
                    if (result && result.success) {
                        results.push(result);
                    }
                }
            }

            return {
                success: true,
                processed: results.length,
                results: results
            };

        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 4. EXPORTS
    // =========================================================================

    window.IndustryProcessor = {
        processAnnualEnterprise: processAnnualEnterprise,
        processAllEnterprises: processAllEnterprises
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.IndustryProcessor;
    }

})();