/**
 * =============================================================================
 * SETTLEMENT COMMANDS ANNUAL - Annual processing for settlements
 * =============================================================================
 * 
 * This file contains annual processing logic:
 * - processAnnualSettlementUpdate
 * - processAllSettlements
 * 
 * DEPENDENCIES:
 *   - settlement-commands-core.js (infrastructure)
 *   - settlement-state.js (SettlementState)
 *   - settlement-economy.js (SettlementEconomy)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. GET CORE DEPENDENCIES
    // =========================================================================

    var core = window._SettlementCommandsCore || {};

    var _getPlaceById = core.getPlaceById || function(id) { return typeof window.getPlaceById === 'function' ? window.getPlaceById(id) : null; };
    var _getPlaces = core.getPlaces || function() { return typeof window.getPlaces === 'function' ? window.getPlaces() : []; };
    var _getCurrentYear = core.getCurrentYear || function() { return typeof window.getCurrentYearSafe === 'function' ? window.getCurrentYearSafe() : 1250; };
    var _getLocationPopulationCount = core.getLocationPopulationCount || function(locationId) { return typeof window.getLocationPopulationCount === 'function' ? window.getLocationPopulationCount(locationId) : 0; };
    var _logEvent = core.logEvent || function() {};
    var _showToast = core.showToast || function(msg, type) { alert(msg); };
    var _getSettlementRanks = core.getSettlementRanks || function() { return SettlementState._getAllRanks(); };
    var _getSettlementData = core.getSettlementData || function(locationId) { return SettlementState.getSettlementData(locationId); };
    var _getStateEnterpriseIds = core.getStateEnterpriseIds || function(locationId) { return SettlementState.getStateEnterpriseIds(locationId); };
    var _getReligion = core.getReligion || function(religionId) {
        if (typeof window.ReligionState !== 'undefined' &&
            typeof window.ReligionState.getReligion === 'function') {
            return window.ReligionState.getReligion(religionId);
        }
        return null;
    };

    function _getProcessingCommand() { return core.getProcessingCommand ? core.getProcessingCommand() : false; }
    function _setProcessingCommand(val) { if (core.setProcessingCommand) core.setProcessingCommand(val); }

    // =========================================================================
    // 2. ANNUAL PROCESSING HELPERS
    // =========================================================================

    function _updateDominantReligion(locationId) {
        try {
            var settlement = _getSettlementData(locationId);
            if (!settlement) return;

            var religionQueries = typeof window.ReligionQueries !== 'undefined' ? window.ReligionQueries : null;
            if (!religionQueries) return;

            var dominant = religionQueries.getDominantReligion(locationId);
            if (dominant) {
                settlement.dominantReligionId = dominant.id;
                SettlementState._setDominantReligion(locationId, dominant.id);
            } else {
                settlement.dominantReligionId = null;
                SettlementState._setDominantReligion(locationId, null);
            }

            // Calculate religious unity
            var religiousUnity = 50;
            if (typeof window.SettlementCommands !== 'undefined' && 
                window.SettlementCommands.calculateReligiousUnity) {
                religiousUnity = window.SettlementCommands.calculateReligiousUnity(locationId);
            }
            settlement.religiousUnity = religiousUnity;
            SettlementState._setReligiousUnity(locationId, religiousUnity);

        } catch(e) {
            // Silent fail
        }
    }

    function _collectPublicEnterpriseProfits(locationId) {
        try {
            var data = _getSettlementData(locationId);
            if (!data) return { totalProfit: 0 };

            var publicEnterprises = SettlementState.getPublicEnterprises(locationId);
            var totalProfit = 0;
            var details = [];

            for (var i = 0; i < publicEnterprises.length; i++) {
                var enterprise = publicEnterprises[i];
                var summary = null;

                if (typeof window.IndustryQueries !== 'undefined') {
                    summary = window.IndustryQueries.getEnterpriseSummary(enterprise.id);
                }

                if (summary) {
                    var profit = summary.annualProfit || 0;
                    if (profit > 0) {
                        totalProfit += profit;
                        details.push({
                            enterpriseId: enterprise.id,
                            enterpriseName: enterprise.name,
                            profit: profit
                        });
                    }
                }
            }

            if (totalProfit > 0) {
                data.wealth = (data.wealth || 0) + totalProfit;
                SettlementState._updateSettlementData(locationId, {
                    wealth: data.wealth
                });

                SettlementState._addHistoryEntry(locationId, {
                    year: _getCurrentYear(),
                    type: 'public_enterprise_profit',
                    totalProfit: totalProfit,
                    details: details,
                    newWealth: data.wealth
                });

                _logEvent('settlement', 'public_enterprise_profit_collected',
                    'Collected ' + totalProfit + ' gold from public enterprises at ' + 
                    (_getPlaceById(locationId)?.displayName || 'Unknown'),
                    []);
            }

            return { totalProfit: totalProfit, details: details };

        } catch(e) {
            return { totalProfit: 0 };
        }
    }

    // =========================================================================
    // 3. PROCESS ANNUAL SETTLEMENT UPDATE
    // =========================================================================

    function processAnnualSettlementUpdate(locationId) {
        if (_getProcessingCommand()) {
            return { success: false, reason: 'Command already processing' };
        }
        _setProcessingCommand(true);

        try {
            var place = _getPlaceById(locationId);
            if (!place) {
                return { success: false, reason: 'Location not found' };
            }

            var data = _getSettlementData(locationId);
            if (!data) {
                return { success: false, reason: 'Settlement data not found' };
            }

            // 1. Process state enterprises
            var stateEnterpriseIds = _getStateEnterpriseIds(locationId);
            if (typeof window.IndustryProcessor !== 'undefined') {
                for (var i = 0; i < stateEnterpriseIds.length; i++) {
                    window.IndustryProcessor.processAnnualEnterprise(stateEnterpriseIds[i]);
                }
            }

            // 2. Calculate income
            var taxIncome = 0;
            var tradeIncome = 0;
            var industryIncome = 0;
            var stateIncome = 0;
            var publicIncome = 0;

            if (typeof window.SettlementEconomy !== 'undefined') {
                taxIncome = window.SettlementEconomy.calculateTaxIncome(locationId);
                tradeIncome = window.SettlementEconomy.calculateTradeIncome(locationId);
                industryIncome = window.SettlementEconomy.calculateIndustryIncome(locationId);
                stateIncome = window.SettlementEconomy.calculateStateEnterpriseIncome(locationId);
                publicIncome = window.SettlementEconomy.calculatePublicEnterpriseIncome(locationId);
            }
            var totalIncome = taxIncome + tradeIncome + industryIncome + stateIncome + publicIncome;

            // 3. Calculate expenses
            var maintenance = 0;
            var wages = 0;
            var spending = 0;
            var govSalaries = 0;

            if (typeof window.SettlementEconomy !== 'undefined') {
                maintenance = window.SettlementEconomy.calculateMaintenanceCosts(locationId);
                wages = window.SettlementEconomy.calculateWageCosts(locationId);
                spending = window.SettlementEconomy.calculateSpendingCosts(locationId);
                govSalaries = window.SettlementEconomy.calculateGovernmentSalaryExpenses(locationId);
            }
            var totalExpenses = maintenance + wages + spending + govSalaries;

            // 4. Calculate surplus
            var surplus = totalIncome - totalExpenses;

            // 5. Update wealth
            data.wealth = (data.wealth || 0) + surplus;
            if (data.wealth < 0) {
                data.totalDebt = Math.abs(data.wealth);
            } else {
                data.totalDebt = 0;
            }

            // 6. Apply debt interest (5% annually)
            if (data.totalDebt > 0) {
                var interest = Math.floor(data.totalDebt * 0.05);
                data.wealth -= interest;
                data.totalDebt += interest;

                SettlementState._addHistoryEntry(locationId, {
                    year: _getCurrentYear(),
                    type: 'debt_interest',
                    interest: interest,
                    newDebt: data.totalDebt,
                    newWealth: data.wealth
                });

                if (data.totalDebt > Math.abs(data.wealth) * 2 && data.wealth < 0) {
                    data.prosperity = Math.max(0, data.prosperity - 5);
                }
            }

            // 7. Update budget
            data.budget = {
                income: {
                    taxes: Math.floor(taxIncome),
                    trade: Math.floor(tradeIncome),
                    industry: Math.floor(industryIncome),
                    stateEnterprises: Math.floor(stateIncome),
                    publicEnterprises: Math.floor(publicIncome),
                    other: 0
                },
                expenses: {
                    maintenance: Math.floor(maintenance),
                    wages: Math.floor(wages),
                    construction: 0,
                    military: data.militarySpending || 0,
                    education: data.educationSpending || 0,
                    infrastructure: data.infrastructureSpending || 0,
                    governmentSalaries: data.governmentSalaryBudget || 0,
                    other: 0
                },
                annualSurplus: Math.floor(surplus),
                totalIncome: Math.floor(totalIncome),
                totalExpenses: Math.floor(totalExpenses)
            };

            // 8. Update prosperity
            if (typeof window.SettlementEconomy !== 'undefined' && 
                window.SettlementEconomy.calculateProsperity) {
                var prosperity = window.SettlementEconomy.calculateProsperity(locationId);
                data.prosperity = prosperity;
            }

            // 9. Update employment
            if (typeof window.SettlementEconomy !== 'undefined' && 
                window.SettlementEconomy.calculateEmployment) {
                var employment = window.SettlementEconomy.calculateEmployment(locationId);
                data.employment = employment;
            }

            // 10. Update crime rate
            if (typeof window.SettlementEconomy !== 'undefined' && 
                window.SettlementEconomy.calculateCrimeRate) {
                var crimeRate = window.SettlementEconomy.calculateCrimeRate(locationId);
                data.crimeRate = crimeRate;
            }

            // 11. Update rank
            var ranks = _getSettlementRanks();
            var currentRank = ranks.find(function(r) { return r.id === data.rankId; });
            var newRank = null;
            var population = _getLocationPopulationCount(locationId);

            for (var i = 0; i < ranks.length; i++) {
                var r = ranks[i];
                if (population >= r.minPopulation && population <= r.maxPopulation) {
                    newRank = r;
                    break;
                }
            }

            if (newRank && newRank.id !== data.rankId) {
                var oldRankId = data.rankId;
                data.rankId = newRank.id;
                data.lastUpgraded = _getCurrentYear();

                SettlementState._addHistoryEntry(locationId, {
                    year: _getCurrentYear(),
                    type: 'auto_upgraded',
                    fromRank: oldRankId,
                    toRank: newRank.id,
                    population: population
                });
            }

            // 12. Update dominant religion
            _updateDominantReligion(locationId);

            // 13. Collect public enterprise profits
            var profitResult = _collectPublicEnterpriseProfits(locationId);

            // 14. Save all changes
            SettlementState._updateSettlementData(locationId, {
                wealth: data.wealth,
                totalDebt: data.totalDebt,
                budget: data.budget,
                prosperity: data.prosperity,
                employment: data.employment,
                crimeRate: data.crimeRate,
                rankId: data.rankId,
                lastUpgraded: data.lastUpgraded,
                dominantReligionId: data.dominantReligionId,
                religiousUnity: data.religiousUnity
            });

            // 15. Log event
            var dominantName = data.dominantReligionId ? 
                (_getReligion(data.dominantReligionId)?.name || 'Unknown') : 'None';

            _logEvent('settlement', 'annual_processed',
                place.displayName + ' processed: ' + Math.floor(totalIncome) + ' income, ' +
                Math.floor(totalExpenses) + ' expenses, ' +
                (surplus >= 0 ? '+' : '') + Math.floor(surplus) + ' surplus' +
                ' (Prosperity: ' + (data.prosperity || 50) + '%, Education Spend: ' + (data.educationSpending || 0) + ')' +
                (data.dominantReligionId ? ', Dominant Religion: ' + dominantName : '') +
                (data.religiousUnity ? ', Unity: ' + data.religiousUnity + '%' : '') +
                (profitResult.totalProfit > 0 ? ', Public enterprise profit: ' + profitResult.totalProfit : ''),
                []);

            return {
                success: true,
                locationId: locationId,
                year: _getCurrentYear(),
                rank: data.rankId,
                prosperity: data.prosperity || 50,
                surplus: Math.floor(surplus),
                wealth: data.wealth,
                debt: data.totalDebt,
                employment: data.employment,
                crimeRate: data.crimeRate,
                educationSpending: data.educationSpending || 0,
                publicEnterpriseProfit: profitResult.totalProfit || 0,
                dominantReligionId: data.dominantReligionId,
                dominantReligionName: dominantName,
                religiousUnity: data.religiousUnity || 50,
                summary: 'Settlement processed: Prosperity ' + (data.prosperity || 50) + '%, Surplus ' +
                    Math.floor(surplus) + ' gold' +
                    (data.totalDebt > 0 ? ' (Debt: ' + data.totalDebt + ' gold)' : '') +
                    (data.educationSpending > 0 ? ' (Education: ' + data.educationSpending + ' gold)' : '') +
                    (profitResult.totalProfit > 0 ? ' (Public Enterprise Profit: ' + profitResult.totalProfit + ')' : '') +
                    (data.dominantReligionId ? ' (Dominant: ' + dominantName + ')' : '') +
                    (data.religiousUnity ? ' (Unity: ' + data.religiousUnity + '%)' : '')
            };

        } finally {
            _setProcessingCommand(false);
        }
    }

    // =========================================================================
    // 4. PROCESS ALL SETTLEMENTS
    // =========================================================================

    function processAllSettlements() {
        if (_getProcessingCommand()) {
            return { success: false, reason: 'Command already processing' };
        }
        _setProcessingCommand(true);

        try {
            var places = _getPlaces();
            var results = [];

            for (var i = 0; i < places.length; i++) {
                var result = processAnnualSettlementUpdate(places[i].id);
                if (result && result.success) {
                    results.push(result);
                }
            }

            _showToast('Processed ' + results.length + ' settlements', 'success');
            return { success: true, processed: results.length, results: results };

        } finally {
            _setProcessingCommand(false);
        }
    }

    // =========================================================================
    // 5. EXPORTS
    // =========================================================================

    window.SettlementCommands = window.SettlementCommands || {};

    window.SettlementCommands.processAnnualSettlementUpdate = processAnnualSettlementUpdate;
    window.SettlementCommands.processAllSettlements = processAllSettlements;

    // Legacy aliases
    window._processAnnualSettlementUpdate = processAnnualSettlementUpdate;
    window._processAllSettlements = processAllSettlements;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.SettlementCommands;
    }

})();