/**
 * =============================================================================
 * HOUSEHOLD ECONOMY MODALS (modals-household-economy.js)
 * =============================================================================
 * 
 * PURPOSE: UI modals for household economy management (wealth, resources,
 *          income, expenses, economic events, trade, annual processing).
 * 
 * UPDATED: Added salary and tuition tracking display
 * UPDATED: Added enterprise profit/loss summary section
 * UPDATED: Added enterprise ownership type display
 * 
 * DEPENDS ON:
 *   - modals-core.js (openModal, closeTopModal, _escapeHtml, _showToast, _getIcon)
 *   - household-state.js (HouseholdState)
 *   - household-economy.js (HouseholdEconomy)
 *   - household-queries.js (HouseholdQueries)
 * 
 * ICON POLICY:
 *   - All icons from icons.js via _getIcon()
 *   - NO emojis
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. RECURSION GUARD
    // =========================================================================

    var _processingEconomyModal = false;

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _openModal(options) {
        if (typeof window.openModal === 'function') {
            return window.openModal(options);
        }
        if (typeof window._openModal === 'function') {
            return window._openModal(options);
        }
        return null;
    }

    function _closeTopModal() {
        if (typeof window.closeTopModal === 'function') {
            window.closeTopModal();
        }
        if (typeof window._closeTopModal === 'function') {
            window._closeTopModal();
        }
    }

    function _escapeHtml(str) {
        if (typeof window._escapeHtml === 'function') {
            return window._escapeHtml(str);
        }
        if (typeof window.escapeHtml === 'function') {
            return window.escapeHtml(str);
        }
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function _showToast(message, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(message, type);
        } else if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        } else if (typeof window.showToastMessage === 'function') {
            window.showToastMessage(message, type);
        }
    }

    function _getCurrentYear() {
        if (typeof window._getCurrentYear === 'function') {
            return window._getCurrentYear();
        }
        if (typeof window.getCurrentYearSafe === 'function') {
            return window.getCurrentYearSafe();
        }
        if (typeof window.getCurrentYear === 'function') {
            return window.getCurrentYear();
        }
        return 1250;
    }

    function _getIcon(name) {
        if (typeof window._getIcon === 'function') {
            return window._getIcon(name);
        }
        if (window.Icons && window.Icons[name]) {
            return window.Icons[name];
        }
        return '';
    }

    function _getHousehold(householdId) {
        if (typeof window.HouseholdState !== 'undefined' && window.HouseholdState.getHousehold) {
            return window.HouseholdState.getHousehold(householdId);
        }
        return null;
    }

    function _getAllHouseholds() {
        if (typeof window.HouseholdState !== 'undefined' && window.HouseholdState.getAllHouseholds) {
            return window.HouseholdState.getAllHouseholds();
        }
        return [];
    }

    function _getCharacterById(characterId) {
        if (typeof window.getCharacterById === 'function') {
            return window.getCharacterById(characterId);
        }
        return null;
    }

    function _getPlaceById(placeId) {
        if (typeof window.getPlaceById === 'function') {
            return window.getPlaceById(placeId);
        }
        return null;
    }

    function _getPlaces() {
        if (typeof window.getPlaces === 'function') {
            return window.getPlaces();
        }
        return [];
    }

    function _getCharacters() {
        if (typeof window.getCharacters === 'function') {
            return window.getCharacters();
        }
        return [];
    }

    // Economy wrappers
    function _getHouseholdWealth(householdId) {
        if (typeof window.HouseholdEconomy !== 'undefined' && window.HouseholdEconomy.getHouseholdWealth) {
            return window.HouseholdEconomy.getHouseholdWealth(householdId);
        }
        var household = _getHousehold(householdId);
        return household ? household.wealth || 0 : 0;
    }

    function _getHouseholdDebt(householdId) {
        if (typeof window.HouseholdEconomy !== 'undefined' && window.HouseholdEconomy.getHouseholdDebt) {
            return window.HouseholdEconomy.getHouseholdDebt(householdId);
        }
        var household = _getHousehold(householdId);
        return household ? (household.economy ? household.economy.debt || 0 : 0) : 0;
    }

    function _getHouseholdResources(householdId) {
        if (typeof window.HouseholdEconomy !== 'undefined' && window.HouseholdEconomy.getHouseholdResources) {
            return window.HouseholdEconomy.getHouseholdResources(householdId);
        }
        var household = _getHousehold(householdId);
        return household ? (household.economy ? household.economy.resources || { food: 0, livestock: 0, goods: 0 } : { food: 0, livestock: 0, goods: 0 }) : { food: 0, livestock: 0, goods: 0 };
    }

    function _getHouseholdEconomicTier(householdId) {
        if (typeof window.HouseholdEconomy !== 'undefined' && window.HouseholdEconomy.getHouseholdEconomicTier) {
            return window.HouseholdEconomy.getHouseholdEconomicTier(householdId);
        }
        return { id: 'moderate', name: 'Moderate', icon: '⌂' };
    }

    function _updateHouseholdWealth(householdId, delta, reason) {
        if (typeof window.HouseholdEconomy !== 'undefined' && window.HouseholdEconomy.updateHouseholdWealth) {
            return window.HouseholdEconomy.updateHouseholdWealth(householdId, delta, reason);
        }
        return 0;
    }

    function _modifyHouseholdDebt(householdId, delta) {
        if (typeof window.HouseholdEconomy !== 'undefined' && window.HouseholdEconomy.modifyHouseholdDebt) {
            return window.HouseholdEconomy.modifyHouseholdDebt(householdId, delta);
        }
        return 0;
    }

    function _updateHouseholdResources(householdId, resourceType, delta) {
        if (typeof window.HouseholdEconomy !== 'undefined' && window.HouseholdEconomy.updateHouseholdResources) {
            return window.HouseholdEconomy.updateHouseholdResources(householdId, resourceType, delta);
        }
        return 0;
    }

    function _calculateAnnualIncome(householdId) {
        if (typeof window.HouseholdEconomy !== 'undefined' && window.HouseholdEconomy.calculateAnnualIncome) {
            return window.HouseholdEconomy.calculateAnnualIncome(householdId);
        }
        return 0;
    }

    function _calculateAnnualExpenses(householdId) {
        if (typeof window.HouseholdEconomy !== 'undefined' && window.HouseholdEconomy.calculateAnnualExpenses) {
            return window.HouseholdEconomy.calculateAnnualExpenses(householdId);
        }
        return 0;
    }

    function _computeNetAnnualChange(householdId) {
        if (typeof window.HouseholdEconomy !== 'undefined' && window.HouseholdEconomy.computeNetAnnualChange) {
            return window.HouseholdEconomy.computeNetAnnualChange(householdId);
        }
        return 0;
    }

    function _processAnnualEconomy(householdId) {
        if (typeof window.HouseholdEconomy !== 'undefined' && window.HouseholdEconomy.processAnnualEconomy) {
            return window.HouseholdEconomy.processAnnualEconomy(householdId);
        }
        return { success: false };
    }

    function _triggerEconomicEvent(householdId, eventTypeId) {
        if (typeof window.HouseholdEconomy !== 'undefined' && window.HouseholdEconomy.triggerEconomicEvent) {
            return window.HouseholdEconomy.triggerEconomicEvent(householdId, eventTypeId);
        }
        return null;
    }

    function _getTradePartners(householdId) {
        if (typeof window.HouseholdEconomy !== 'undefined' && window.HouseholdEconomy.getTradePartners) {
            return window.HouseholdEconomy.getTradePartners(householdId);
        }
        return [];
    }

    function _executeTrade(sourceId, targetId, trade) {
        if (typeof window.HouseholdEconomy !== 'undefined' && window.HouseholdEconomy.executeTrade) {
            return window.HouseholdEconomy.executeTrade(sourceId, targetId, trade);
        }
        return false;
    }

    function _getEconomicEventTypes() {
        if (window.ECONOMIC_EVENT_TYPES && Array.isArray(window.ECONOMIC_EVENT_TYPES)) {
            return window.ECONOMIC_EVENT_TYPES;
        }
        return [];
    }

    function _getEconomicTiers() {
        if (window.ECONOMIC_TIERS) {
            return window.ECONOMIC_TIERS;
        }
        return {};
    }

    function _isUrbanLocation(locationId) {
        if (typeof window.HouseholdEconomy !== 'undefined' && window.HouseholdEconomy.isUrbanLocation) {
            return window.HouseholdEconomy.isUrbanLocation(locationId);
        }
        return false;
    }

    // =========================================================================
    // 2. ENTERPRISE WRAPPERS (NEW)
    // =========================================================================

    function _getHouseholdEnterpriseSummaries(householdId) {
        if (typeof window.HouseholdQueries !== 'undefined' && 
            typeof window.HouseholdQueries.getHouseholdEnterpriseSummaries === 'function') {
            return window.HouseholdQueries.getHouseholdEnterpriseSummaries(householdId);
        }
        return [];
    }

    function _getHouseholdEnterpriseStats(householdId) {
        if (typeof window.HouseholdQueries !== 'undefined' && 
            typeof window.HouseholdQueries.getHouseholdEnterpriseStats === 'function') {
            return window.HouseholdQueries.getHouseholdEnterpriseStats(householdId);
        }
        return null;
    }

    function _getHouseholdEnterpriseValue(householdId) {
        if (typeof window.HouseholdQueries !== 'undefined' && 
            typeof window.HouseholdQueries.getHouseholdEnterpriseValue === 'function') {
            return window.HouseholdQueries.getHouseholdEnterpriseValue(householdId);
        }
        return 0;
    }

    // =========================================================================
    // 3. SALARY AND TUITION WRAPPERS
    // =========================================================================

    function _getSalaryIncome(householdId, year) {
        if (typeof window.HouseholdEconomy !== 'undefined' && window.HouseholdEconomy.getSalaryIncome) {
            return window.HouseholdEconomy.getSalaryIncome(householdId, year);
        }
        return 0;
    }

    function _getTotalSalariesReceived(householdId) {
        if (typeof window.HouseholdEconomy !== 'undefined' && window.HouseholdEconomy.getTotalSalariesReceived) {
            return window.HouseholdEconomy.getTotalSalariesReceived(householdId);
        }
        return 0;
    }

    function _getTuitionExpenses(householdId, year) {
        if (typeof window.HouseholdEconomy !== 'undefined' && window.HouseholdEconomy.getTuitionExpenses) {
            return window.HouseholdEconomy.getTuitionExpenses(householdId, year);
        }
        return 0;
    }

    function _getSalaryIncomeHistory(householdId, limit) {
        var household = _getHousehold(householdId);
        if (!household || !household.economy || !household.economy.salaryIncomeHistory) {
            return [];
        }
        var history = household.economy.salaryIncomeHistory.slice();
        history.sort(function(a, b) {
            return (b.year || 0) - (a.year || 0);
        });
        if (limit && limit > 0) {
            history = history.slice(0, limit);
        }
        return history;
    }

    function _getTuitionExpensesHistory(householdId, limit) {
        var household = _getHousehold(householdId);
        if (!household || !household.economy || !household.economy.tuitionExpensesHistory) {
            return [];
        }
        var history = household.economy.tuitionExpensesHistory.slice();
        history.sort(function(a, b) {
            return (b.year || 0) - (a.year || 0);
        });
        if (limit && limit > 0) {
            history = history.slice(0, limit);
        }
        return history;
    }

    // =========================================================================
    // 4. HOUSEHOLD ECONOMIC SUMMARY MODAL (UPDATED with Enterprise Section)
    // =========================================================================

    function openHouseholdEconomicSummaryModal(householdId) {
        if (_processingEconomyModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingEconomyModal = true;

        try {
            var household = _getHousehold(householdId);
            if (!household) {
                _showToast('Household not found', 'error');
                _processingEconomyModal = false;
                return;
            }

            var currentYear = _getCurrentYear();

            var wealth = _getHouseholdWealth(householdId);
            var debt = _getHouseholdDebt(householdId);
            var tier = _getHouseholdEconomicTier(householdId);
            var resources = _getHouseholdResources(householdId);
            var annualIncome = _calculateAnnualIncome(householdId);
            var annualExpenses = _calculateAnnualExpenses(householdId);
            var netChange = annualIncome - annualExpenses;

            // ================================================================
            // Salary and tuition data
            // ================================================================
            var salaryIncome = _getSalaryIncome(householdId, currentYear);
            var totalSalaries = _getTotalSalariesReceived(householdId);
            var tuitionExpenses = _getTuitionExpenses(householdId, currentYear);

            var salaryHistory = _getSalaryIncomeHistory(householdId, 5);
            var tuitionHistory = _getTuitionExpensesHistory(householdId, 5);

            var salaryHistoryHtml = '';
            if (salaryHistory && salaryHistory.length > 0) {
                salaryHistoryHtml = salaryHistory.map(function(h) {
                    var char = _getCharacterById(h.characterId);
                    var charName = char ? char.name + ' ' + (char.surname || '') : 'Unknown';
                    return '<div style="display:flex;justify-content:space-between;padding:2px 0;border-bottom:1px solid var(--border-light);font-size:0.5rem;">' +
                        '<span>' + _escapeHtml(charName) + '</span>' +
                        '<span style="color:var(--success);">+' + h.amount + 'g</span>' +
                        '</div>';
                }).join('');
            }

            var tuitionHistoryHtml = '';
            if (tuitionHistory && tuitionHistory.length > 0) {
                tuitionHistoryHtml = tuitionHistory.map(function(h) {
                    var inst = typeof window.EducationState !== 'undefined' ? window.EducationState.getInstitution(h.institutionId) : null;
                    var instName = inst ? inst.name : 'Unknown';
                    return '<div style="display:flex;justify-content:space-between;padding:2px 0;border-bottom:1px solid var(--border-light);font-size:0.5rem;">' +
                        '<span>' + _escapeHtml(instName) + '</span>' +
                        '<span style="color:var(--warn);">-' + h.amount + 'g</span>' +
                        '</div>';
                }).join('');
            }

            // ================================================================
            // ENTERPRISE SECTION (NEW)
            // ================================================================
            var enterpriseSummaries = _getHouseholdEnterpriseSummaries(householdId);
            var enterpriseStats = _getHouseholdEnterpriseStats(householdId);
            var enterpriseValue = _getHouseholdEnterpriseValue(householdId);

            var enterpriseHtml = '';
            if (enterpriseSummaries && enterpriseSummaries.length > 0) {
                var totalEnterpriseProfit = 0;
                var profitableCount = 0;
                var unprofitableCount = 0;
                var totalWorkers = 0;
                var publicCount = 0;
                var privateCount = 0;

                var enterpriseRows = enterpriseSummaries.slice(0, 5).map(function(s) {
                    var profit = s.annualProfit || 0;
                    totalEnterpriseProfit += profit;
                    if (profit > 0) profitableCount++;
                    else if (profit < 0) unprofitableCount++;
                    totalWorkers += s.workerCount || 0;
                    if (s.ownershipType === 'public') publicCount++;
                    else privateCount++;

                    var profitColor = profit >= 0 ? '#4a9e6a' : '#c87040';
                    var ownershipLabel = s.ownershipType === 'public' ? ' <span style="font-size:0.4rem;color:var(--accent);">(Public)</span>' : '';
                    var statusText = s.status !== 'active' ? ' (' + s.status + ')' : '';
                    return '<div style="display:flex;justify-content:space-between;padding:2px 0;border-bottom:1px solid var(--border-light);font-size:0.5rem;">' +
                        '<span>' + _escapeHtml(s.name) + ownershipLabel + statusText + '</span>' +
                        '<span style="color:' + profitColor + ';">' + (profit >= 0 ? '+' : '') + profit + 'g</span>' +
                        '</div>';
                }).join('');

                var ownershipBreakdown = '';
                if (publicCount > 0 || privateCount > 0) {
                    ownershipBreakdown = ' · ' +
                        (publicCount > 0 ? publicCount + ' Public' : '') +
                        (publicCount > 0 && privateCount > 0 ? ', ' : '') +
                        (privateCount > 0 ? privateCount + ' Private' : '');
                }

                enterpriseHtml = `
                    <div style="background: var(--bg2); padding: 8px; border-radius: 6px; margin-bottom: 12px;">
                        <div style="font-size: 0.6rem; color: var(--accent); margin-bottom: 4px;">Enterprises (${enterpriseSummaries.length})${ownershipBreakdown}</div>
                        <div style="display:flex;justify-content:space-between;font-size:0.55rem;flex-wrap:wrap;gap:4px;">
                            <span>Total Profit: <strong style="color:${totalEnterpriseProfit >= 0 ? '#4a9e6a' : '#c87040'};">${totalEnterpriseProfit >= 0 ? '+' : ''}${totalEnterpriseProfit}g</strong></span>
                            <span>Profitable: <strong style="color:#4a9e6a;">${profitableCount}</strong></span>
                            <span>Unprofitable: <strong style="color:#c87040;">${unprofitableCount}</strong></span>
                            <span>Workers: <strong>${totalWorkers}</strong></span>
                            <span>Value: <strong>${enterpriseValue}g</strong></span>
                        </div>
                        ${enterpriseRows ? '<div style="max-height:80px;overflow-y:auto;margin-top:4px;">' + enterpriseRows + '</div>' : ''}
                    </div>
                `;
            }

            var modalContent = `
                <div style="margin-bottom: 16px;">
                    <div style="background: var(--bg3); border-radius: 6px; padding: 12px; margin-bottom: 12px;">
                        <div style="font-size: 0.7rem;"><strong>${_escapeHtml(household.name)}</strong></div>
                        <div style="font-size: 0.55rem; color: var(--dim);">Economic Summary</div>
                    </div>

                    <!-- Wealth, Debt, Tier -->
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 12px;">
                        <div style="background: var(--bg2); padding: 8px; border-radius: 6px; text-align: center;">
                            <div style="font-size: 0.55rem; color: var(--dim);">Wealth</div>
                            <div style="font-size: 1rem; font-weight: bold;">${wealth}g</div>
                        </div>
                        <div style="background: var(--bg2); padding: 8px; border-radius: 6px; text-align: center;">
                            <div style="font-size: 0.55rem; color: var(--dim);">Debt</div>
                            <div style="font-size: 1rem; font-weight: bold; color: ${debt > 0 ? '#c87040' : 'var(--text)'};">${debt}g</div>
                        </div>
                        <div style="background: var(--bg2); padding: 8px; border-radius: 6px; text-align: center;">
                            <div style="font-size: 0.55rem; color: var(--dim);">Tier</div>
                            <div style="font-size: 0.9rem;">${_escapeHtml(tier.name)}</div>
                        </div>
                    </div>

                    <!-- Resources -->
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 12px;">
                        <div style="background: var(--bg2); padding: 8px; border-radius: 6px; text-align: center;">
                            <div style="font-size: 0.55rem; color: var(--dim);">Food</div>
                            <div style="font-size: 0.9rem;">${resources.food || 0}</div>
                        </div>
                        <div style="background: var(--bg2); padding: 8px; border-radius: 6px; text-align: center;">
                            <div style="font-size: 0.55rem; color: var(--dim);">Livestock</div>
                            <div style="font-size: 0.9rem;">${resources.livestock || 0}</div>
                        </div>
                        <div style="background: var(--bg2); padding: 8px; border-radius: 6px; text-align: center;">
                            <div style="font-size: 0.55rem; color: var(--dim);">Goods</div>
                            <div style="font-size: 0.9rem;">${resources.goods || 0}</div>
                        </div>
                    </div>

                    <!-- Income & Expenses -->
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;">
                        <div style="background: var(--bg2); padding: 8px; border-radius: 6px; text-align: center;">
                            <div style="font-size: 0.55rem; color: var(--dim);">Annual Income</div>
                            <div style="font-size: 0.9rem; color: #4a9e6a;">+${annualIncome}g</div>
                        </div>
                        <div style="background: var(--bg2); padding: 8px; border-radius: 6px; text-align: center;">
                            <div style="font-size: 0.55rem; color: var(--dim);">Annual Expenses</div>
                            <div style="font-size: 0.9rem; color: #c87040;">-${annualExpenses}g</div>
                        </div>
                    </div>

                    <!-- ENTERPRISE SECTION (NEW) -->
                    ${enterpriseHtml}

                    <!-- Salary Income Section -->
                    ${salaryIncome > 0 || totalSalaries > 0 ?
                        '<div style="background: var(--bg2); padding: 8px; border-radius: 6px; margin-bottom: 12px;">' +
                        '<div style="font-size: 0.6rem; color: var(--accent); margin-bottom: 4px;">Salary Income</div>' +
                        '<div style="display:flex;justify-content:space-between;font-size:0.65rem;">' +
                        '<span>This year: <strong style="color:#4a9e6a;">+' + salaryIncome + 'g</strong></span>' +
                        '<span>Total received: <strong>' + totalSalaries + 'g</strong></span>' +
                        '</div>' +
                        (salaryHistoryHtml ? '<div style="max-height:80px;overflow-y:auto;margin-top:4px;">' + salaryHistoryHtml + '</div>' : '') +
                        '</div>' :
                        ''
                    }

                    <!-- Tuition Expenses Section -->
                    ${tuitionExpenses > 0 ?
                        '<div style="background: var(--bg2); padding: 8px; border-radius: 6px; margin-bottom: 12px;">' +
                        '<div style="font-size: 0.6rem; color: var(--warn); margin-bottom: 4px;">Tuition Expenses</div>' +
                        '<div style="display:flex;justify-content:space-between;font-size:0.65rem;">' +
                        '<span>This year: <strong style="color:#c87040;">-' + tuitionExpenses + 'g</strong></span>' +
                        '</div>' +
                        (tuitionHistoryHtml ? '<div style="max-height:80px;overflow-y:auto;margin-top:4px;">' + tuitionHistoryHtml + '</div>' : '') +
                        '</div>' :
                        ''
                    }

                    <!-- Net Change -->
                    <div style="text-align: center; padding: 8px; background: var(--bg); border-radius: 4px;">
                        <span style="font-size: 0.8rem; font-weight: bold; color: ${netChange >= 0 ? '#4a9e6a' : '#c87040'};">
                            Net Annual Change: ${netChange >= 0 ? '+' : ''}${netChange}g
                        </span>
                    </div>

                    <!-- Year -->
                    <div style="font-size:0.5rem;color:var(--dim);text-align:center;margin-top:8px;">
                        Data for year ${currentYear}
                        ${salaryIncome > 0 ? ' · Includes salaries' : ''}
                        ${tuitionExpenses > 0 ? ' · Includes tuition' : ''}
                        ${enterpriseSummaries && enterpriseSummaries.length > 0 ? ' · Includes ' + enterpriseSummaries.length + ' enterprises' : ''}
                    </div>
                </div>
            `;

            _openModal({
                title: 'Economic Summary: ' + household.name,
                content: modalContent,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {
                    _closeTopModal();
                    _processingEconomyModal = false;
                }
            });

        } catch (e) {
            _processingEconomyModal = false;
            _showToast('Error opening economic summary', 'error');
        }
    }

    // =========================================================================
    // 5. HOUSEHOLD WEALTH MODAL
    // =========================================================================

    function openHouseholdWealthModal(householdId, onSuccess) {
        if (_processingEconomyModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingEconomyModal = true;

        try {
            var household = _getHousehold(householdId);
            if (!household) {
                _showToast('Household not found', 'error');
                _processingEconomyModal = false;
                return;
            }

            var wealth = _getHouseholdWealth(householdId);
            var debt = _getHouseholdDebt(householdId);
            var tier = _getHouseholdEconomicTier(householdId);

            var currentYear = _getCurrentYear();
            var salaryIncome = _getSalaryIncome(householdId, currentYear);
            var tuitionExpenses = _getTuitionExpenses(householdId, currentYear);

            var modalContent = `
                <div style="margin-bottom: 16px;">
                    <div style="background: var(--bg3); border-radius: 6px; padding: 12px; margin-bottom: 12px;">
                        <div style="font-size: 0.7rem;"><strong>${_escapeHtml(household.name)}</strong></div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-top: 8px;">
                            <div><span style="color: var(--dim); font-size: 0.6rem;">Wealth</span><br><span style="font-size: 1.1rem; font-weight: bold;">${wealth}g</span></div>
                            <div><span style="color: var(--dim); font-size: 0.6rem;">Debt</span><br><span style="font-size: 1.1rem; font-weight: bold; color: ${debt > 0 ? '#c87040' : 'var(--text)'};">${debt}g</span></div>
                            <div><span style="color: var(--dim); font-size: 0.6rem;">Tier</span><br><span style="font-size: 0.9rem;">${_escapeHtml(tier.name)}</span></div>
                        </div>
                        ${salaryIncome > 0 || tuitionExpenses > 0 ?
                            '<div style="display:flex;justify-content:space-between;font-size:0.55rem;color:var(--dim);margin-top:6px;padding-top:6px;border-top:1px solid var(--border-light);">' +
                            (salaryIncome > 0 ? '<span>Salary: <strong style="color:#4a9e6a;">+' + salaryIncome + 'g</strong></span>' : '') +
                            (tuitionExpenses > 0 ? '<span>Tuition: <strong style="color:#c87040;">-' + tuitionExpenses + 'g</strong></span>' : '') +
                            '</div>' :
                            ''
                        }
                    </div>
                    <div class="form-group" style="margin-bottom: 12px;">
                        <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Modify Wealth</label>
                        <div style="display: flex; gap: 8px;">
                            <input type="number" id="wealthDelta" value="0" style="flex: 1; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">
                            <input type="text" id="wealthReason" placeholder="Reason" style="flex: 2; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">
                        </div>
                        <div style="display: flex; gap: 4px; margin-top: 4px;">
                            <button id="wealthAddBtn" class="btn small" style="padding: 2px 8px; font-size: 0.5rem; background: var(--accent-dim); border: 1px solid var(--accent); border-radius: 3px; cursor: pointer;">Add</button>
                            <button id="wealthSubtractBtn" class="btn small" style="padding: 2px 8px; font-size: 0.5rem; background: #8a3020; border: none; color: white; border-radius: 3px; cursor: pointer;">Subtract</button>
                            <button id="wealthSetBtn" class="btn small" style="padding: 2px 8px; font-size: 0.5rem; background: var(--bg3); border: 1px solid var(--border); border-radius: 3px; cursor: pointer;">Set</button>
                        </div>
                    </div>
                    <div class="form-group" style="margin-bottom: 12px;">
                        <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Modify Debt</label>
                        <div style="display: flex; gap: 8px;">
                            <input type="number" id="debtDelta" value="0" style="flex: 1; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">
                        </div>
                        <div style="display: flex; gap: 4px; margin-top: 4px;">
                            <button id="debtAddBtn" class="btn small" style="padding: 2px 8px; font-size: 0.5rem; background: #8a3020; border: none; color: white; border-radius: 3px; cursor: pointer;">Add Debt</button>
                            <button id="debtSubtractBtn" class="btn small" style="padding: 2px 8px; font-size: 0.5rem; background: var(--accent-dim); border: 1px solid var(--accent); border-radius: 3px; cursor: pointer;">Pay Debt</button>
                        </div>
                    </div>
                </div>
            `;

            _openModal({
                title: 'Wealth: ' + household.name,
                content: modalContent,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {
                    _closeTopModal();
                    _processingEconomyModal = false;
                    if (onSuccess) {
                        onSuccess();
                    }
                }
            });

            // Event handlers
            setTimeout(function() {
                var wealthDelta = document.getElementById('wealthDelta');
                var wealthReason = document.getElementById('wealthReason');

                function getWealthDelta() {
                    return parseInt(wealthDelta ? wealthDelta.value : 0) || 0;
                }

                function getWealthReason() {
                    return wealthReason ? wealthReason.value.trim() : 'Modified';
                }

                var addBtn = document.getElementById('wealthAddBtn');
                if (addBtn) {
                    addBtn.onclick = function() {
                        var delta = Math.abs(getWealthDelta());
                        if (delta === 0) {
                            _showToast('Please enter a value', 'warning');
                            return;
                        }
                        var newWealth = _updateHouseholdWealth(householdId, delta, 'Added: ' + getWealthReason());
                        _showToast('Wealth increased by ' + delta + ' (now ' + newWealth + 'g)', 'success');
                        _closeTopModal();
                        openHouseholdWealthModal(householdId, onSuccess);
                    };
                }

                var subBtn = document.getElementById('wealthSubtractBtn');
                if (subBtn) {
                    subBtn.onclick = function() {
                        var delta = Math.abs(getWealthDelta());
                        if (delta === 0) {
                            _showToast('Please enter a value', 'warning');
                            return;
                        }
                        var newWealth = _updateHouseholdWealth(householdId, -delta, 'Subtracted: ' + getWealthReason());
                        _showToast('Wealth decreased by ' + delta + ' (now ' + newWealth + 'g)', 'info');
                        _closeTopModal();
                        openHouseholdWealthModal(householdId, onSuccess);
                    };
                }

                var setBtn = document.getElementById('wealthSetBtn');
                if (setBtn) {
                    setBtn.onclick = function() {
                        var delta = getWealthDelta();
                        if (delta < 0) {
                            _showToast('Please enter a non-negative value', 'error');
                            return;
                        }
                        var currentWealth = _getHouseholdWealth(householdId);
                        var diff = delta - currentWealth;
                        var newWealth = _updateHouseholdWealth(householdId, diff, 'Set to ' + delta + ': ' + getWealthReason());
                        _showToast('Wealth set to ' + newWealth + 'g', 'success');
                        _closeTopModal();
                        openHouseholdWealthModal(householdId, onSuccess);
                    };
                }

                var debtAddBtn = document.getElementById('debtAddBtn');
                if (debtAddBtn) {
                    debtAddBtn.onclick = function() {
                        var delta = parseInt(document.getElementById('debtDelta').value) || 0;
                        if (delta <= 0) {
                            _showToast('Please enter a positive value', 'warning');
                            return;
                        }
                        var newDebt = _modifyHouseholdDebt(householdId, delta);
                        _showToast('Debt increased by ' + delta + ' (now ' + newDebt + 'g)', 'info');
                        _closeTopModal();
                        openHouseholdWealthModal(householdId, onSuccess);
                    };
                }

                var debtSubBtn = document.getElementById('debtSubtractBtn');
                if (debtSubBtn) {
                    debtSubBtn.onclick = function() {
                        var delta = parseInt(document.getElementById('debtDelta').value) || 0;
                        if (delta <= 0) {
                            _showToast('Please enter a positive value', 'warning');
                            return;
                        }
                        var currentDebt = _getHouseholdDebt(householdId);
                        var newDebt = _modifyHouseholdDebt(householdId, -Math.min(delta, currentDebt));
                        var paid = currentDebt - newDebt;
                        _showToast('Paid ' + paid + 'g debt (now ' + newDebt + 'g)', 'success');
                        _closeTopModal();
                        openHouseholdWealthModal(householdId, onSuccess);
                    };
                }

            }, 100);

        } catch (e) {
            _processingEconomyModal = false;
            _showToast('Error opening wealth modal', 'error');
        }
    }

    // =========================================================================
    // 6. HOUSEHOLD RESOURCES MODAL
    // =========================================================================

    function openHouseholdResourcesModal(householdId, onSuccess) {
        if (_processingEconomyModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingEconomyModal = true;

        try {
            var household = _getHousehold(householdId);
            if (!household) {
                _showToast('Household not found', 'error');
                _processingEconomyModal = false;
                return;
            }

            var resources = _getHouseholdResources(householdId);
            var resourceTypes = ['food', 'livestock', 'goods'];
            var resourceLabels = {
                food: 'Food',
                livestock: 'Livestock',
                goods: 'Goods'
            };

            var resourcesHtml = '';
            for (var i = 0; i < resourceTypes.length; i++) {
                var type = resourceTypes[i];
                var value = resources[type] || 0;
                resourcesHtml +=
                    '<div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: var(--bg2); border-radius: 6px; margin-bottom: 4px;">' +
                    '<span style="font-size: 0.7rem;">' + resourceLabels[type] + '</span>' +
                    '<div style="display: flex; align-items: center; gap: 8px;">' +
                    '<span style="font-size: 1rem; font-weight: bold;">' + value + '</span>' +
                    '<div style="display: flex; gap: 2px;">' +
                    '<button class="resource-add-btn btn small" data-type="' + type + '" style="padding: 1px 6px; font-size: 0.5rem; background: var(--accent-dim); border: 1px solid var(--accent); border-radius: 3px; cursor: pointer;">+</button>' +
                    '<button class="resource-sub-btn btn small" data-type="' + type + '" style="padding: 1px 6px; font-size: 0.5rem; background: #8a3020; border: none; color: white; border-radius: 3px; cursor: pointer;">-</button>' +
                    '</div>' +
                    '</div>' +
                    '</div>';
            }

            resourcesHtml +=
                '<div style="margin-top: 8px;">' +
                '<div style="display: flex; gap: 4px; flex-wrap: wrap;">' +
                '<input type="number" id="resourceDeltaInput" value="1" style="width: 60px; padding: 4px 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; font-size: 0.65rem;">' +
                '<button id="resourceAddAllBtn" class="btn small" style="padding: 2px 8px; font-size: 0.5rem; background: var(--accent-dim); border: 1px solid var(--accent); border-radius: 3px; cursor: pointer;">Add to All</button>' +
                '</div>' +
                '</div>';

            var modalContent = `
                <div style="margin-bottom: 16px;">
                    <div style="background: var(--bg3); border-radius: 6px; padding: 12px; margin-bottom: 12px;">
                        <div style="font-size: 0.7rem;"><strong>${_escapeHtml(household.name)}</strong></div>
                        <div style="font-size: 0.55rem; color: var(--dim); margin-top: 4px;">Resources</div>
                    </div>
                    ${resourcesHtml}
                </div>
            `;

            _openModal({
                title: 'Resources: ' + household.name,
                content: modalContent,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {
                    _closeTopModal();
                    _processingEconomyModal = false;
                    if (onSuccess) {
                        onSuccess();
                    }
                }
            });

            // Event handlers
            setTimeout(function() {
                var resourceDelta = document.getElementById('resourceDeltaInput');

                function getDelta() {
                    return parseInt(resourceDelta ? resourceDelta.value : 1) || 1;
                }

                var addBtns = document.querySelectorAll('.resource-add-btn');
                addBtns.forEach(function(btn) {
                    var newBtn = btn.cloneNode(true);
                    if (btn.parentNode) {
                        btn.parentNode.replaceChild(newBtn, btn);
                    }

                    newBtn.onclick = function() {
                        var type = this.dataset.type;
                        var delta = getDelta();
                        var newValue = _updateHouseholdResources(householdId, type, delta);
                        _showToast(type + ' increased by ' + delta + ' (now ' + newValue + ')', 'success');
                        _closeTopModal();
                        openHouseholdResourcesModal(householdId, onSuccess);
                    };
                });

                var subBtns = document.querySelectorAll('.resource-sub-btn');
                subBtns.forEach(function(btn) {
                    var newBtn = btn.cloneNode(true);
                    if (btn.parentNode) {
                        btn.parentNode.replaceChild(newBtn, btn);
                    }

                    newBtn.onclick = function() {
                        var type = this.dataset.type;
                        var delta = getDelta();
                        var current = resources[type] || 0;
                        var actualDelta = Math.min(delta, current);
                        var newValue = _updateHouseholdResources(householdId, type, -actualDelta);
                        _showToast(type + ' decreased by ' + actualDelta + ' (now ' + newValue + ')', 'info');
                        _closeTopModal();
                        openHouseholdResourcesModal(householdId, onSuccess);
                    };
                });

                var addAllBtn = document.getElementById('resourceAddAllBtn');
                if (addAllBtn) {
                    addAllBtn.onclick = function() {
                        var delta = getDelta();
                        var types = ['food', 'livestock', 'goods'];
                        for (var i = 0; i < types.length; i++) {
                            _updateHouseholdResources(householdId, types[i], delta);
                        }
                        _showToast('All resources increased by ' + delta, 'success');
                        _closeTopModal();
                        openHouseholdResourcesModal(householdId, onSuccess);
                    };
                }

            }, 100);

        } catch (e) {
            _processingEconomyModal = false;
            _showToast('Error opening resources modal', 'error');
        }
    }

    // =========================================================================
    // 7. HOUSEHOLD INCOME MODAL
    // =========================================================================

    function openHouseholdIncomeModal(householdId) {
        if (_processingEconomyModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingEconomyModal = true;

        try {
            var household = _getHousehold(householdId);
            if (!household) {
                _showToast('Household not found', 'error');
                _processingEconomyModal = false;
                return;
            }

            var annualIncome = _calculateAnnualIncome(householdId);
            var incomeSources = window.INCOME_SOURCES || {};

            var currentYear = _getCurrentYear();
            var salaryIncome = _getSalaryIncome(householdId, currentYear);

            var breakdown = [];
            var total = 0;
            var memberCount = household.members ? household.members.length : 1;

            for (var key in incomeSources) {
                var source = incomeSources[key];
                var amount = source.baseIncome || 0;
                if (source.id === 'taxes' || source.id === 'tribute') {
                    amount = Math.floor(amount * (1 + (memberCount - 1) * 0.05));
                }
                if (_isUrbanLocation(household.locationId)) {
                    if (source.id === 'trade' || source.id === 'crafts') {
                        amount = Math.floor(amount * 1.3);
                    }
                }
                total += amount;
                breakdown.push({
                    source: source,
                    amount: amount
                });
            }

            if (salaryIncome > 0) {
                breakdown.push({
                    source: { id: 'salary', name: 'Salary Income', icon: '⌇' },
                    amount: salaryIncome
                });
                total += salaryIncome;
            }

            if (breakdown.length === 0) {
                breakdown.push({
                    source: { id: 'base', name: 'Base Income', icon: '⌇' },
                    amount: 50
                });
                total = 50;
            }

            var breakdownHtml = breakdown.map(function(b) {
                var isSalary = b.source.id === 'salary';
                return '<div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid var(--border-light); font-size: 0.6rem;">' +
                    '<span>' + _escapeHtml(b.source.name) + (isSalary ? ' <span style="color:var(--accent);font-size:0.5rem;">(salaries)</span>' : '') + '</span>' +
                    '<span>' + b.amount + 'g</span>' +
                    '</div>';
            }).join('');

            var modalContent = `
                <div style="margin-bottom: 16px;">
                    <div style="background: var(--bg3); border-radius: 6px; padding: 12px; margin-bottom: 12px;">
                        <div style="font-size: 0.7rem;"><strong>${_escapeHtml(household.name)}</strong></div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px;">
                            <div><span style="color: var(--dim); font-size: 0.6rem;">Annual Income</span><br><span style="font-size: 1.1rem; font-weight: bold; color: #4a9e6a;">${annualIncome}g</span></div>
                            <div><span style="color: var(--dim); font-size: 0.6rem;">Total Sources</span><br><span style="font-size: 0.9rem;">${breakdown.length}</span></div>
                        </div>
                        ${salaryIncome > 0 ? '<div style="font-size:0.55rem;color:var(--accent);margin-top:4px;">Includes ' + salaryIncome + 'g from salaries</div>' : ''}
                    </div>
                    <div style="margin-bottom: 12px;">
                        <div style="font-size: 0.6rem; color: var(--accent); margin-bottom: 4px;">Income Sources</div>
                        <div style="background: var(--bg2); border-radius: 6px; padding: 8px;">
                            ${breakdownHtml}
                        </div>
                    </div>
                    <div style="font-size: 0.55rem; color: var(--dim);">Based on household size, location, member professions, and salaries</div>
                </div>
            `;

            _openModal({
                title: 'Income: ' + household.name,
                content: modalContent,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {
                    _closeTopModal();
                    _processingEconomyModal = false;
                }
            });

        } catch (e) {
            _processingEconomyModal = false;
            _showToast('Error opening income modal', 'error');
        }
    }

    // =========================================================================
    // 8. HOUSEHOLD EXPENSES MODAL
    // =========================================================================

    function openHouseholdExpensesModal(householdId) {
        if (_processingEconomyModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingEconomyModal = true;

        try {
            var household = _getHousehold(householdId);
            if (!household) {
                _showToast('Household not found', 'error');
                _processingEconomyModal = false;
                return;
            }

            var annualExpenses = _calculateAnnualExpenses(householdId);
            var expenseCategories = window.EXPENSE_CATEGORIES || {};
            var wealth = _getHouseholdWealth(householdId);

            var currentYear = _getCurrentYear();
            var tuitionExpenses = _getTuitionExpenses(householdId, currentYear);

            var breakdown = [];
            var total = 0;
            var memberCount = household.members ? household.members.length : 1;

            for (var key in expenseCategories) {
                var category = expenseCategories[key];
                if (category.id === 'tuition') continue;
                var amount = category.baseExpense || 0;
                if (category.id === 'food') {
                    amount = amount * memberCount;
                }
                if (category.id === 'staff') {
                    var staffCount = 0;
                    if (household.members) {
                        for (var i = 0; i < household.members.length; i++) {
                            if (household.members[i].type === 'staff') staffCount++;
                        }
                    }
                    amount = amount * Math.max(1, staffCount);
                }
                if (category.id === 'luxury' && wealth > 100) {
                    amount = amount * (1 + (wealth - 100) / 200);
                }
                total += amount;
                breakdown.push({
                    category: category,
                    amount: Math.floor(amount)
                });
            }

            var debt = _getHouseholdDebt(householdId);
            if (debt > 0) {
                var debtPayment = Math.min(10, debt * 0.1);
                total += debtPayment;
                breakdown.push({
                    category: { id: 'debt', name: 'Debt Payments', icon: '⌇' },
                    amount: Math.floor(debtPayment)
                });
            }

            if (tuitionExpenses > 0) {
                breakdown.push({
                    category: { id: 'tuition', name: 'Tuition', icon: '⌇' },
                    amount: tuitionExpenses
                });
                total += tuitionExpenses;
            }

            var breakdownHtml = breakdown.map(function(b) {
                var isTuition = b.category.id === 'tuition';
                return '<div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid var(--border-light); font-size: 0.6rem;">' +
                    '<span>' + _escapeHtml(b.category.name) + (isTuition ? ' <span style="color:var(--warn);font-size:0.5rem;">(education)</span>' : '') + '</span>' +
                    '<span>' + b.amount + 'g</span>' +
                    '</div>';
            }).join('');

            var modalContent = `
                <div style="margin-bottom: 16px;">
                    <div style="background: var(--bg3); border-radius: 6px; padding: 12px; margin-bottom: 12px;">
                        <div style="font-size: 0.7rem;"><strong>${_escapeHtml(household.name)}</strong></div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px;">
                            <div><span style="color: var(--dim); font-size: 0.6rem;">Annual Expenses</span><br><span style="font-size: 1.1rem; font-weight: bold; color: #c87040;">${annualExpenses}g</span></div>
                            <div><span style="color: var(--dim); font-size: 0.6rem;">Net Change</span><br><span style="font-size: 1.1rem; font-weight: bold; color: ${annualExpenses > 0 ? '#c87040' : '#4a9e6a'};">${annualExpenses > 0 ? '-' : '+'}${Math.abs(annualExpenses)}g</span></div>
                        </div>
                        ${tuitionExpenses > 0 ? '<div style="font-size:0.55rem;color:var(--warn);margin-top:4px;">Includes ' + tuitionExpenses + 'g in tuition</div>' : ''}
                    </div>
                    <div style="margin-bottom: 12px;">
                        <div style="font-size: 0.6rem; color: var(--accent); margin-bottom: 4px;">Expense Categories</div>
                        <div style="background: var(--bg2); border-radius: 6px; padding: 8px;">
                            ${breakdownHtml}
                        </div>
                    </div>
                    <div style="font-size: 0.55rem; color: var(--dim);">Based on household size, staff count, wealth, debt, and tuition</div>
                </div>
            `;

            _openModal({
                title: 'Expenses: ' + household.name,
                content: modalContent,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {
                    _closeTopModal();
                    _processingEconomyModal = false;
                }
            });

        } catch (e) {
            _processingEconomyModal = false;
            _showToast('Error opening expenses modal', 'error');
        }
    }

    // =========================================================================
    // 9. HOUSEHOLD ANNUAL PROCESSING MODAL
    // =========================================================================

    function openHouseholdAnnualProcessingModal(householdId, onSuccess) {
        if (_processingEconomyModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingEconomyModal = true;

        try {
            var household = _getHousehold(householdId);
            if (!household) {
                _showToast('Household not found', 'error');
                _processingEconomyModal = false;
                return;
            }

            var wealth = _getHouseholdWealth(householdId);
            var debt = _getHouseholdDebt(householdId);
            var annualIncome = _calculateAnnualIncome(householdId);
            var annualExpenses = _calculateAnnualExpenses(householdId);
            var netChange = annualIncome - annualExpenses;

            var currentYear = _getCurrentYear();
            var salaryIncome = _getSalaryIncome(householdId, currentYear);
            var tuitionExpenses = _getTuitionExpenses(householdId, currentYear);

            var modalContent = `
                <div style="margin-bottom: 16px;">
                    <div style="background: var(--bg3); border-radius: 6px; padding: 12px; margin-bottom: 12px;">
                        <div style="font-size: 0.7rem;"><strong>${_escapeHtml(household.name)}</strong></div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-top: 8px;">
                            <div><span style="color: var(--dim); font-size: 0.55rem;">Current Wealth</span><br><span style="font-size: 0.9rem;">${wealth}g</span></div>
                            <div><span style="color: var(--dim); font-size: 0.55rem;">Income</span><br><span style="font-size: 0.9rem; color: #4a9e6a;">+${annualIncome}g</span></div>
                            <div><span style="color: var(--dim); font-size: 0.55rem;">Expenses</span><br><span style="font-size: 0.9rem; color: #c87040;">-${annualExpenses}g</span></div>
                        </div>
                        ${salaryIncome > 0 ? '<div style="font-size:0.5rem;color:var(--accent);margin-top:4px;">Salary income: +' + salaryIncome + 'g</div>' : ''}
                        ${tuitionExpenses > 0 ? '<div style="font-size:0.5rem;color:var(--warn);">Tuition expenses: -' + tuitionExpenses + 'g</div>' : ''}
                        <div style="text-align: center; margin-top: 8px; padding: 6px; background: var(--bg); border-radius: 4px;">
                            <span style="font-size: 0.8rem; font-weight: bold; color: ${netChange >= 0 ? '#4a9e6a' : '#c87040'};">
                                Net Change: ${netChange >= 0 ? '+' : ''}${netChange}g
                            </span>
                        </div>
                        <div style="font-size: 0.55rem; color: var(--dim); margin-top: 4px;">
                            New Wealth: ${wealth + netChange}g
                            ${debt > 0 ? ' · Debt: ' + debt + 'g' : ''}
                        </div>
                    </div>
                    <div style="font-size: 0.6rem; color: var(--warn);">Processing will apply annual income and expenses to the household.</div>
                    <div style="font-size: 0.55rem; color: var(--dim); margin-top: 4px;">This also consumes food based on member count.</div>
                </div>
            `;

            _openModal({
                title: 'Process Annual Economy: ' + household.name,
                content: modalContent,
                confirmText: 'Process Year',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var result = _processAnnualEconomy(householdId);

                    if (result && result.success) {
                        var msg = 'Annual processing complete. Wealth: ' + result.oldWealth + ' → ' + result.newWealth + 'g';
                        if (result.event) {
                            msg += ' · Event: ' + result.event.name + ' (' + (result.eventDelta > 0 ? '+' : '') + result.eventDelta + ')';
                        }
                        if (result.bankrupt) {
                            msg += ' · BANKRUPTCY!';
                        }
                        _showToast(msg, result.bankrupt ? 'error' : 'success');
                        _closeTopModal();
                        _processingEconomyModal = false;
                        if (onSuccess) {
                            onSuccess(result);
                        }
                    } else {
                        _showToast(result ? result.reason : 'Failed to process annual economy', 'error');
                    }
                    return true;
                },
                onCancel: function() {
                    _processingEconomyModal = false;
                }
            });

        } catch (e) {
            _processingEconomyModal = false;
            _showToast('Error opening annual processing modal', 'error');
        }
    }

    // =========================================================================
    // 10. HOUSEHOLD ECONOMIC EVENTS MODAL
    // =========================================================================

    function openHouseholdEconomicEventsModal(householdId, onSuccess) {
        if (_processingEconomyModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingEconomyModal = true;

        try {
            var household = _getHousehold(householdId);
            if (!household) {
                _showToast('Household not found', 'error');
                _processingEconomyModal = false;
                return;
            }

            var eventTypes = _getEconomicEventTypes();

            var eventsHtml = eventTypes.map(function(e) {
                return '<div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; background: var(--bg2); border-radius: 4px; margin-bottom: 4px; border-left: 3px solid ' + (e.wealthModifier > 0 ? '#4a9e6a' : '#c87040') + ';">' +
                    '<div>' +
                    '<span style="font-size: 0.65rem;">' + _escapeHtml(e.name) + '</span>' +
                    '<span style="font-size: 0.5rem; color: var(--dim); margin-left: 8px;">' + (e.wealthModifier > 0 ? '+' : '') + (e.wealthModifier * 100) + '% · ' + e.minDelta + ' to ' + e.maxDelta + '</span>' +
                    '</div>' +
                    '<button class="event-trigger-btn btn small" data-event-id="' + e.id + '" style="padding: 2px 8px; font-size: 0.45rem; background: var(--accent-dim); border: 1px solid var(--accent); border-radius: 3px; cursor: pointer;">Trigger</button>' +
                    '</div>';
            }).join('');

            var modalContent = `
                <div style="margin-bottom: 16px;">
                    <div style="background: var(--bg3); border-radius: 6px; padding: 12px; margin-bottom: 12px;">
                        <div style="font-size: 0.7rem;"><strong>${_escapeHtml(household.name)}</strong></div>
                        <div style="font-size: 0.55rem; color: var(--dim); margin-top: 4px;">Trigger an economic event for this household</div>
                    </div>
                    <div style="max-height: 300px; overflow-y: auto;">
                        ${eventsHtml}
                    </div>
                </div>
            `;

            _openModal({
                title: 'Economic Events: ' + household.name,
                content: modalContent,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {
                    _closeTopModal();
                    _processingEconomyModal = false;
                    if (onSuccess) {
                        onSuccess();
                    }
                }
            });

            setTimeout(function() {
                var triggerBtns = document.querySelectorAll('.event-trigger-btn');
                triggerBtns.forEach(function(btn) {
                    var newBtn = btn.cloneNode(true);
                    if (btn.parentNode) {
                        btn.parentNode.replaceChild(newBtn, btn);
                    }

                    newBtn.onclick = function() {
                        var eventId = this.dataset.eventId;
                        var result = _triggerEconomicEvent(householdId, eventId);

                        if (result) {
                            _showToast('Event triggered: ' + result.event.name + ' (' + (result.delta > 0 ? '+' : '') + result.delta + ' wealth)', 'info');
                            _closeTopModal();
                            _processingEconomyModal = false;
                            if (onSuccess) {
                                onSuccess(result);
                            }
                        } else {
                            _showToast('Failed to trigger event', 'error');
                        }
                    };
                });
            }, 100);

        } catch (e) {
            _processingEconomyModal = false;
            _showToast('Error opening economic events modal', 'error');
        }
    }

    // =========================================================================
    // 11. HOUSEHOLD TRADE MODAL
    // =========================================================================

    function openHouseholdTradeModal(householdId, onSuccess) {
        if (_processingEconomyModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingEconomyModal = true;

        try {
            var household = _getHousehold(householdId);
            if (!household) {
                _showToast('Household not found', 'error');
                _processingEconomyModal = false;
                return;
            }

            var partners = _getTradePartners(householdId);
            var wealth = _getHouseholdWealth(householdId);
            var resources = _getHouseholdResources(householdId);

            if (partners.length === 0) {
                _showToast('No trade partners available in this location', 'info');
                _processingEconomyModal = false;
                return;
            }

            var partnerOptions = partners.map(function(p) {
                return '<option value="' + p.id + '">' + _escapeHtml(p.name) + ' (' + (p.members ? p.members.length : 0) + ' members)</option>';
            }).join('');

            var modalContent = `
                <div style="margin-bottom: 16px;">
                    <div style="background: var(--bg3); border-radius: 6px; padding: 12px; margin-bottom: 12px;">
                        <div style="font-size: 0.7rem;"><strong>${_escapeHtml(household.name)}</strong></div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-top: 8px; font-size: 0.6rem;">
                            <div><span style="color: var(--dim);">Wealth</span><br>${wealth}g</div>
                            <div><span style="color: var(--dim);">Food</span><br>${resources.food || 0}</div>
                            <div><span style="color: var(--dim);">Goods</span><br>${resources.goods || 0}</div>
                        </div>
                    </div>
                    <div class="form-group" style="margin-bottom: 12px;">
                        <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Trade Partner</label>
                        <select id="tradePartnerSelect" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;">
                            <option value="">Select a partner</option>
                            ${partnerOptions}
                        </select>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                        <div class="form-group">
                            <label style="display: block; font-size: 0.6rem; color: var(--accent); margin-bottom: 4px;">Give</label>
                            <input type="number" id="tradeGiveWealth" placeholder="Wealth" value="0" style="width: 100%; padding: 4px 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; font-size: 0.65rem;">
                            <input type="number" id="tradeGiveGoods" placeholder="Goods" value="0" style="width: 100%; margin-top: 4px; padding: 4px 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; font-size: 0.65rem;">
                        </div>
                        <div class="form-group">
                            <label style="display: block; font-size: 0.6rem; color: var(--accent); margin-bottom: 4px;">Receive</label>
                            <input type="number" id="tradeReceiveWealth" placeholder="Wealth" value="0" style="width: 100%; padding: 4px 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; font-size: 0.65rem;">
                            <input type="number" id="tradeReceiveGoods" placeholder="Goods" value="0" style="width: 100%; margin-top: 4px; padding: 4px 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; font-size: 0.65rem;">
                        </div>
                    </div>
                    <div style="font-size: 0.55rem; color: var(--dim); margin-top: 8px;">Trade will be executed if both parties have sufficient resources.</div>
                </div>
            `;

            _openModal({
                title: 'Trade: ' + household.name,
                content: modalContent,
                confirmText: 'Execute Trade',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var partnerId = document.getElementById('tradePartnerSelect').value;
                    var giveWealth = parseInt(document.getElementById('tradeGiveWealth').value) || 0;
                    var giveGoods = parseInt(document.getElementById('tradeGiveGoods').value) || 0;
                    var receiveWealth = parseInt(document.getElementById('tradeReceiveWealth').value) || 0;
                    var receiveGoods = parseInt(document.getElementById('tradeReceiveGoods').value) || 0;

                    if (!partnerId) {
                        _showToast('Please select a trade partner', 'error');
                        return false;
                    }

                    if (giveWealth === 0 && giveGoods === 0 && receiveWealth === 0 && receiveGoods === 0) {
                        _showToast('Please specify at least one item to trade', 'error');
                        return false;
                    }

                    var trade = {
                        sourceGives: { wealth: giveWealth, goods: giveGoods },
                        targetGives: { wealth: receiveWealth, goods: receiveGoods },
                        sourceGets: { wealth: receiveWealth, goods: receiveGoods },
                        targetGets: { wealth: giveWealth, goods: giveGoods }
                    };

                    var result = _executeTrade(householdId, partnerId, trade);

                    if (result) {
                        _showToast('Trade executed successfully', 'success');
                        _closeTopModal();
                        _processingEconomyModal = false;
                        if (onSuccess) {
                            onSuccess();
                        }
                    } else {
                        _showToast('Failed to execute trade', 'error');
                    }
                    return true;
                },
                onCancel: function() {
                    _processingEconomyModal = false;
                }
            });

        } catch (e) {
            _processingEconomyModal = false;
            _showToast('Error opening trade modal', 'error');
        }
    }

    // =========================================================================
    // 12. EXPORTS
    // =========================================================================

    window.openHouseholdWealthModal = openHouseholdWealthModal;
    window.openHouseholdResourcesModal = openHouseholdResourcesModal;
    window.openHouseholdIncomeModal = openHouseholdIncomeModal;
    window.openHouseholdExpensesModal = openHouseholdExpensesModal;
    window.openHouseholdEconomicEventsModal = openHouseholdEconomicEventsModal;
    window.openHouseholdTradeModal = openHouseholdTradeModal;
    window.openHouseholdAnnualProcessingModal = openHouseholdAnnualProcessingModal;
    window.openHouseholdEconomicSummaryModal = openHouseholdEconomicSummaryModal;

    // ES Module exports
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            openHouseholdWealthModal: openHouseholdWealthModal,
            openHouseholdResourcesModal: openHouseholdResourcesModal,
            openHouseholdIncomeModal: openHouseholdIncomeModal,
            openHouseholdExpensesModal: openHouseholdExpensesModal,
            openHouseholdEconomicEventsModal: openHouseholdEconomicEventsModal,
            openHouseholdTradeModal: openHouseholdTradeModal,
            openHouseholdAnnualProcessingModal: openHouseholdAnnualProcessingModal,
            openHouseholdEconomicSummaryModal: openHouseholdEconomicSummaryModal
        };
    }

})();