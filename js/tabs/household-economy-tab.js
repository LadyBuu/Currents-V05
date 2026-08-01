/**
 * =============================================================================
 * HOUSEHOLD ECONOMY TAB (household-economy-tab.js) - FIXED
 * =============================================================================
 * 
 * FIXED: Modal state management - ensures _processingEconomyModal is always reset
 * FIXED: Error handling for all modal operations
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARD
    // =========================================================================

    var _rendering = false;
    var _currentHouseholdId = null;
    var _processingEconomyModal = false;

    // =========================================================================
    // 2. GET CURRENT HOUSEHOLD ID
    // =========================================================================

    function _getCurrentHouseholdId() {
        if (window._currentHouseholdId) return window._currentHouseholdId;
        if (window.currentHouseholdId) return window.currentHouseholdId;
        if (window.selectedHouseholdId) return window.selectedHouseholdId;
        return null;
    }

    // =========================================================================
    // 3. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getState() {
        return typeof window.HouseholdState !== 'undefined' ? window.HouseholdState : null;
    }

    function _getEconomy() {
        return typeof window.HouseholdEconomy !== 'undefined' ? window.HouseholdEconomy : null;
    }

    function _getQueries() {
        return typeof window.HouseholdQueries !== 'undefined' ? window.HouseholdQueries : null;
    }

    function _getCharacterById(id) {
        if (typeof window.getCharacterById === 'function') {
            return window.getCharacterById(id);
        }
        return null;
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

    function _getIcon(name) {
        if (window.Icons && window.Icons[name]) {
            return window.Icons[name];
        }
        return '';
    }

    function _getIconSafe(name) {
        var icon = _getIcon(name);
        return icon || '';
    }

    function _openModal(options) {
        if (typeof window.openModal === 'function') {
            return window.openModal(options);
        }
        if (typeof window._openModal === 'function') {
            return window._openModal(options);
        }
        // Fallback modal
        _showToast('Modal system not available', 'error');
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

    // =========================================================================
    // 4. HELPER: Safe modal wrapper
    // =========================================================================

    function _withModalLock(action, onComplete) {
        if (_processingEconomyModal) {
            _showToast('Already processing an action', 'warning');
            return;
        }
        
        _processingEconomyModal = true;
        
        try {
            action();
        } catch (e) {
            console.error('[EconomyTab] Modal error:', e);
            _showToast('Error: ' + (e.message || 'Unknown error'), 'error');
            _processingEconomyModal = false;
            if (onComplete) onComplete();
        }
    }

    function _releaseModalLock() {
        _processingEconomyModal = false;
    }

    // =========================================================================
    // 5. ECONOMY FUNCTIONS - Using HouseholdState directly
    // =========================================================================

    function _getHouseholdWealth(householdId) {
        var HS = _getState();
        var HE = _getEconomy();
        if (HE && typeof HE.getHouseholdWealth === 'function') {
            return HE.getHouseholdWealth(householdId);
        }
        if (HS && typeof HS.getHouseholdWealth === 'function') {
            return HS.getHouseholdWealth(householdId);
        }
        var household = HS ? HS.getHousehold(householdId) : null;
        return household ? (household.wealth || 0) : 0;
    }

    function _updateHouseholdWealth(householdId, delta, reason) {
        var HS = _getState();
        var HE = _getEconomy();
        if (HE && typeof HE.updateHouseholdWealth === 'function') {
            return HE.updateHouseholdWealth(householdId, delta, reason);
        }
        if (HS && typeof HS.updateHouseholdWealth === 'function') {
            return HS.updateHouseholdWealth(householdId, delta, reason);
        }
        return 0;
    }

    function _getHouseholdDebt(householdId) {
        var HS = _getState();
        var HE = _getEconomy();
        if (HE && typeof HE.getHouseholdDebt === 'function') {
            return HE.getHouseholdDebt(householdId);
        }
        var household = HS ? HS.getHousehold(householdId) : null;
        return household ? (household.debt || 0) : 0;
    }

    function _modifyHouseholdDebt(householdId, delta) {
        var HS = _getState();
        var HE = _getEconomy();
        if (HE && typeof HE.modifyHouseholdDebt === 'function') {
            return HE.modifyHouseholdDebt(householdId, delta);
        }
        var household = HS ? HS.getHousehold(householdId) : null;
        if (!household) return 0;
        household.debt = Math.max(0, (household.debt || 0) + delta);
        return household.debt;
    }

    function _getHouseholdResources(householdId) {
        var HS = _getState();
        var HE = _getEconomy();
        if (HE && typeof HE.getHouseholdResources === 'function') {
            return HE.getHouseholdResources(householdId);
        }
        var household = HS ? HS.getHousehold(householdId) : null;
        return household ? (household.resources || { food: 0, livestock: 0, goods: 0 }) : { food: 0, livestock: 0, goods: 0 };
    }

    function _updateHouseholdResources(householdId, resourceType, delta) {
        var HS = _getState();
        var HE = _getEconomy();
        if (HE && typeof HE.updateHouseholdResources === 'function') {
            return HE.updateHouseholdResources(householdId, resourceType, delta);
        }
        var household = HS ? HS.getHousehold(householdId) : null;
        if (!household) return 0;
        if (!household.resources) household.resources = { food: 0, livestock: 0, goods: 0 };
        household.resources[resourceType] = Math.max(0, (household.resources[resourceType] || 0) + delta);
        return household.resources[resourceType];
    }

    function _getEconomicTier(wealth) {
        var HE = _getEconomy();
        if (HE && typeof HE.getEconomicTier === 'function') {
            return HE.getEconomicTier(wealth);
        }
        // Fallback tier calculation
        if (wealth > 1000) return { id: 'royal', label: 'Royal' };
        if (wealth > 500) return { id: 'very_noble', label: 'Very Noble' };
        if (wealth > 200) return { id: 'noble', label: 'Noble' };
        if (wealth > 120) return { id: 'wealthy', label: 'Wealthy' };
        if (wealth > 70) return { id: 'prosperous', label: 'Prosperous' };
        if (wealth > 30) return { id: 'moderate', label: 'Moderate' };
        if (wealth > 10) return { id: 'poor', label: 'Poor' };
        return { id: 'destitute', label: 'Destitute' };
    }

    function _calculateAnnualIncome(householdId) {
        var HE = _getEconomy();
        if (HE && typeof HE.calculateAnnualIncome === 'function') {
            return HE.calculateAnnualIncome(householdId);
        }
        var HS = _getState();
        var household = HS ? HS.getHousehold(householdId) : null;
        if (!household) return 0;
        var memberCount = household.members ? household.members.length : 1;
        var baseIncome = 50 + (memberCount - 1) * 10;
        var RS = typeof window.ResidenceSystem !== 'undefined' ? window.ResidenceSystem : null;
        if (RS && typeof RS.getTotalRentIncome === 'function') {
            baseIncome += RS.getTotalRentIncome(householdId, 'household');
        }
        return baseIncome;
    }

    function _calculateAnnualExpenses(householdId) {
        var HE = _getEconomy();
        if (HE && typeof HE.calculateAnnualExpenses === 'function') {
            return HE.calculateAnnualExpenses(householdId);
        }
        var HS = _getState();
        var household = HS ? HS.getHousehold(householdId) : null;
        if (!household) return 0;
        var memberCount = household.members ? household.members.length : 1;
        var staffCount = 0;
        if (household.members) {
            for (var i = 0; i < household.members.length; i++) {
                if (household.members[i].type === 'staff') staffCount++;
            }
        }
        var baseExpense = 20 + memberCount * 5 + staffCount * 3;
        return baseExpense;
    }

    function _processAnnualEconomy(householdId) {
        var HE = _getEconomy();
        if (HE && typeof HE.processAnnualEconomy === 'function') {
            return HE.processAnnualEconomy(householdId);
        }
        var HS = _getState();
        var household = HS ? HS.getHousehold(householdId) : null;
        if (!household) return { success: false, reason: 'Household not found' };
        
        var oldWealth = household.wealth || 0;
        var income = _calculateAnnualIncome(householdId);
        var expenses = _calculateAnnualExpenses(householdId);
        var netChange = income - expenses;
        var newWealth = Math.max(0, oldWealth + netChange);
        
        household.wealth = newWealth;
        household.updatedAt = Date.now();
        
        return {
            success: true,
            oldWealth: oldWealth,
            newWealth: newWealth,
            netChange: netChange,
            income: income,
            expenses: expenses
        };
    }

    function _getSalaryIncome(householdId, year) {
        var HE = _getEconomy();
        if (HE && typeof HE.getSalaryIncome === 'function') {
            return HE.getSalaryIncome(householdId, year);
        }
        return 0;
    }

    function _getTuitionExpenses(householdId, year) {
        var HE = _getEconomy();
        if (HE && typeof HE.getTuitionExpenses === 'function') {
            return HE.getTuitionExpenses(householdId, year);
        }
        return 0;
    }

    // =========================================================================
    // 6. ICON HELPERS
    // =========================================================================

    function _iconSpan(icon, title) {
        if (!icon) return '';
        var titleAttr = title ? ' title="' + _escapeHtml(title) + '"' : '';
        return '<span style="display:inline-flex;align-items:center;vertical-align:middle;' + (title ? 'cursor:help;' : '') + '"' + titleAttr + '>' + icon + '</span>';
    }

    // =========================================================================
    // 7. ECONOMY DATA FETCHER
    // =========================================================================

    var _cachedData = null;
    var _cacheHouseholdId = null;

    function _getEconomyData(householdId, forceRefresh) {
        if (!forceRefresh && _cachedData && _cacheHouseholdId === householdId) {
            return _cachedData;
        }

        var HS = _getState();
        if (!HS) {
            return { error: 'Household system not available' };
        }

        var household = HS.getHousehold(householdId);
        if (!household) {
            return { error: 'Household not found' };
        }

        var wealth = _getHouseholdWealth(householdId);
        var debt = _getHouseholdDebt(householdId);
        var resources = _getHouseholdResources(householdId);
        var annualIncome = _calculateAnnualIncome(householdId);
        var annualExpenses = _calculateAnnualExpenses(householdId);
        var netChange = annualIncome - annualExpenses;
        var tier = _getEconomicTier(wealth);
        var currentYear = _getCurrentYear();

        var salaryIncome = _getSalaryIncome(householdId, currentYear);
        var tuitionExpenses = _getTuitionExpenses(householdId, currentYear);

        var enterpriseSummaries = [];
        var enterpriseStats = null;
        var enterpriseValue = 0;

        var HQ = _getQueries();
        if (HQ && typeof HQ.getHouseholdEnterpriseSummaries === 'function') {
            enterpriseSummaries = HQ.getHouseholdEnterpriseSummaries(householdId);
        }
        if (HQ && typeof HQ.getHouseholdEnterpriseStats === 'function') {
            enterpriseStats = HQ.getHouseholdEnterpriseStats(householdId);
        }
        if (HQ && typeof HQ.getHouseholdEnterpriseValue === 'function') {
            enterpriseValue = HQ.getHouseholdEnterpriseValue(householdId);
        }

        var data = {
            household: household,
            wealth: wealth,
            debt: debt,
            resources: resources,
            annualIncome: annualIncome,
            annualExpenses: annualExpenses,
            netChange: netChange,
            tier: tier,
            currentYear: currentYear,
            salaryIncome: salaryIncome,
            tuitionExpenses: tuitionExpenses,
            enterpriseSummaries: enterpriseSummaries,
            enterpriseStats: enterpriseStats,
            enterpriseValue: enterpriseValue
        };

        _cachedData = data;
        _cacheHouseholdId = householdId;

        return data;
    }

    // =========================================================================
    // 8. RENDER FUNCTIONS
    // =========================================================================

    function _renderWealthSection(data) {
        var coinIcon = _getIconSafe('COIN');

        var wealthColor = data.wealth >= 0 ? 'var(--success)' : 'var(--danger)';
        var debtColor = data.debt > 0 ? 'var(--warn)' : 'var(--text)';
        var tierColor = data.tier && data.tier.id === 'destitute' ? 'var(--danger)' :
                        data.tier && data.tier.id === 'royal' ? 'var(--accent)' :
                        'var(--text)';

        return '' +
            '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px;">' +
                '<div style="background:var(--bg3);padding:10px;border-radius:6px;text-align:center;">' +
                    '<div style="font-size:0.55rem;color:var(--dim);">' + _iconSpan(coinIcon, 'Wealth') + ' Wealth</div>' +
                    '<div style="font-size:1rem;font-weight:bold;color:' + wealthColor + ';" id="ecoWealthDisplay">' + data.wealth + 'g</div>' +
                '</div>' +
                '<div style="background:var(--bg3);padding:10px;border-radius:6px;text-align:center;">' +
                    '<div style="font-size:0.55rem;color:var(--dim);">Debt</div>' +
                    '<div style="font-size:1rem;font-weight:bold;color:' + debtColor + ';" id="ecoDebtDisplay">' + data.debt + 'g</div>' +
                '</div>' +
                '<div style="background:var(--bg3);padding:10px;border-radius:6px;text-align:center;">' +
                    '<div style="font-size:0.55rem;color:var(--dim);">Tier</div>' +
                    '<div style="font-size:0.9rem;font-weight:bold;color:' + tierColor + ';" id="ecoTierDisplay">' + _escapeHtml(data.tier.label) + '</div>' +
                '</div>' +
            '</div>';
    }

    function _renderResourcesSection(data) {
        var foodIcon = _getIconSafe('CIRCLE_DOT');
        var livestockIcon = _getIconSafe('CIRCLE_DOT');
        var goodsIcon = _getIconSafe('CIRCLE_DOT');

        var resources = data.resources || { food: 0, livestock: 0, goods: 0 };

        return '' +
            '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px;">' +
                '<div style="background:var(--bg3);padding:8px;border-radius:6px;text-align:center;">' +
                    '<div style="font-size:0.55rem;color:var(--dim);">' + _iconSpan(foodIcon, 'Food') + ' Food</div>' +
                    '<div style="font-size:0.9rem;" id="ecoFoodDisplay">' + (resources.food || 0) + '</div>' +
                '</div>' +
                '<div style="background:var(--bg3);padding:8px;border-radius:6px;text-align:center;">' +
                    '<div style="font-size:0.55rem;color:var(--dim);">' + _iconSpan(livestockIcon, 'Livestock') + ' Livestock</div>' +
                    '<div style="font-size:0.9rem;" id="ecoLivestockDisplay">' + (resources.livestock || 0) + '</div>' +
                '</div>' +
                '<div style="background:var(--bg3);padding:8px;border-radius:6px;text-align:center;">' +
                    '<div style="font-size:0.55rem;color:var(--dim);">' + _iconSpan(goodsIcon, 'Goods') + ' Goods</div>' +
                    '<div style="font-size:0.9rem;" id="ecoGoodsDisplay">' + (resources.goods || 0) + '</div>' +
                '</div>' +
            '</div>';
    }

    function _renderIncomeExpensesSection(data) {
        var arrowUpIcon = _getIconSafe('ARROW_UP');
        var arrowDownIcon = _getIconSafe('ARROW_DOWN');

        var netColor = data.netChange >= 0 ? 'var(--success)' : 'var(--warn)';

        return '' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">' +
                '<div style="background:var(--bg3);padding:10px;border-radius:6px;text-align:center;">' +
                    '<div style="font-size:0.55rem;color:var(--dim);">' + _iconSpan(arrowUpIcon, 'Income') + ' Annual Income</div>' +
                    '<div style="font-size:0.9rem;color:var(--success);" id="ecoIncomeDisplay">+' + data.annualIncome + 'g</div>' +
                    (data.salaryIncome > 0 ? '<div style="font-size:0.5rem;color:var(--dim);">Includes ' + data.salaryIncome + 'g salary</div>' : '') +
                '</div>' +
                '<div style="background:var(--bg3);padding:10px;border-radius:6px;text-align:center;">' +
                    '<div style="font-size:0.55rem;color:var(--dim);">' + _iconSpan(arrowDownIcon, 'Expenses') + ' Annual Expenses</div>' +
                    '<div style="font-size:0.9rem;color:var(--warn);" id="ecoExpensesDisplay">-' + data.annualExpenses + 'g</div>' +
                    (data.tuitionExpenses > 0 ? '<div style="font-size:0.5rem;color:var(--dim);">Includes ' + data.tuitionExpenses + 'g tuition</div>' : '') +
                '</div>' +
            '</div>' +
            '<div style="text-align:center;padding:8px;background:var(--bg);border-radius:4px;margin-bottom:12px;">' +
                '<span style="font-size:0.8rem;font-weight:bold;color:' + netColor + ';" id="ecoNetDisplay">' +
                    'Net Change: ' + (data.netChange >= 0 ? '+' : '') + data.netChange + 'g' +
                '</span>' +
                '<span style="font-size:0.55rem;color:var(--dim);margin-left:12px;">' +
                    'Year ' + data.currentYear +
                '</span>' +
            '</div>';
    }

    function _renderEnterpriseSection(data) {
        if (!data.enterpriseSummaries || data.enterpriseSummaries.length === 0) {
            return '' +
                '<div style="background:var(--bg2);padding:10px;border-radius:6px;margin-bottom:12px;border:1px solid var(--border);">' +
                    '<div style="font-size:0.6rem;color:var(--dim);">No enterprises owned</div>' +
                '</div>';
        }

        var enterpriseIcon = _getIconSafe('INDUSTRY');

        var totalProfit = data.enterpriseStats ? data.enterpriseStats.totalProfit || 0 : 0;
        var profitColor = totalProfit >= 0 ? 'var(--success)' : 'var(--warn)';

        var enterpriseRows = data.enterpriseSummaries.slice(0, 5).map(function(s) {
            var profit = s.annualProfit || 0;
            var profitColor = profit >= 0 ? 'var(--success)' : 'var(--warn)';
            var statusColor = s.status === 'active' ? 'var(--success)' :
                             s.status === 'bankrupt' ? 'var(--danger)' :
                             'var(--warn)';
            return '<div style="display:flex;justify-content:space-between;padding:4px 8px;background:var(--bg);border-radius:4px;margin-bottom:2px;font-size:0.6rem;">' +
                '<span>' + _escapeHtml(s.name) + ' <span style="color:' + statusColor + ';font-size:0.5rem;">(' + _escapeHtml(s.status) + ')</span></span>' +
                '<span style="color:' + profitColor + ';">' + (profit >= 0 ? '+' : '') + profit + 'g</span>' +
                '</div>';
        }).join('');

        return '' +
            '<div style="background:var(--bg2);padding:10px;border-radius:6px;margin-bottom:12px;border:1px solid var(--border);">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
                    '<div style="font-size:0.6rem;color:var(--accent);">' + _iconSpan(enterpriseIcon, 'Enterprises') + ' Enterprises (' + data.enterpriseSummaries.length + ')</div>' +
                    '<div style="font-size:0.55rem;color:var(--dim);">' +
                        'Value: <strong>' + data.enterpriseValue + 'g</strong>' +
                        (data.enterpriseStats ? ' · Workers: ' + data.enterpriseStats.totalWorkers : '') +
                    '</div>' +
                '</div>' +
                '<div style="font-size:0.55rem;margin-bottom:4px;">' +
                    'Total Profit: <strong style="color:' + profitColor + ';" id="ecoEnterpriseProfitDisplay">' + (totalProfit >= 0 ? '+' : '') + totalProfit + 'g</strong>' +
                '</div>' +
                '<div style="max-height:120px;overflow-y:auto;">' + enterpriseRows + '</div>' +
                (data.enterpriseSummaries.length > 5 ? '<div style="text-align:center;font-size:0.5rem;color:var(--dim);padding-top:4px;">+' + (data.enterpriseSummaries.length - 5) + ' more</div>' : '') +
            '</div>';
    }

    function _renderActions(data) {
        var coinIcon = _getIconSafe('COIN');
        var refreshIcon = _getIconSafe('REFRESH');
        var chartIcon = _getIconSafe('CIRCLE_DOT');

        return '' +
            '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px;">' +
                '<button id="ecoWealthBtn" class="btn" style="padding:4px 12px;font-size:0.55rem;background:var(--accent-dim);border:1px solid var(--accent);border-radius:4px;cursor:pointer;">' + coinIcon + ' Manage Wealth</button>' +
                '<button id="ecoResourcesBtn" class="btn" style="padding:4px 12px;font-size:0.55rem;background:var(--accent-dim);border:1px solid var(--accent);border-radius:4px;cursor:pointer;">Manage Resources</button>' +
                '<button id="ecoIncomeBtn" class="btn" style="padding:4px 12px;font-size:0.55rem;background:var(--bg3);border:1px solid var(--border);border-radius:4px;cursor:pointer;">' + chartIcon + ' Income</button>' +
                '<button id="ecoExpensesBtn" class="btn" style="padding:4px 12px;font-size:0.55rem;background:var(--bg3);border:1px solid var(--border);border-radius:4px;cursor:pointer;">Expenses</button>' +
                '<button id="ecoProcessBtn" class="btn" style="padding:4px 12px;font-size:0.55rem;background:var(--accent);border:1px solid var(--accent);color:white;border-radius:4px;cursor:pointer;">' + refreshIcon + ' Process Year</button>' +
            '</div>';
    }

    // =========================================================================
    // 9. FAST UPDATE FUNCTIONS
    // =========================================================================

    function _updateDisplayValues(data) {
        var wealthEl = document.getElementById('ecoWealthDisplay');
        if (wealthEl) {
            wealthEl.textContent = data.wealth + 'g';
            wealthEl.style.color = data.wealth >= 0 ? 'var(--success)' : 'var(--danger)';
        }

        var debtEl = document.getElementById('ecoDebtDisplay');
        if (debtEl) {
            debtEl.textContent = data.debt + 'g';
            debtEl.style.color = data.debt > 0 ? 'var(--warn)' : 'var(--text)';
        }

        var tierEl = document.getElementById('ecoTierDisplay');
        if (tierEl && data.tier) {
            tierEl.textContent = data.tier.label;
            var tierColor = data.tier.id === 'destitute' ? 'var(--danger)' :
                            data.tier.id === 'royal' ? 'var(--accent)' :
                            'var(--text)';
            tierEl.style.color = tierColor;
        }

        var foodEl = document.getElementById('ecoFoodDisplay');
        if (foodEl && data.resources) {
            foodEl.textContent = data.resources.food || 0;
        }
        var livestockEl = document.getElementById('ecoLivestockDisplay');
        if (livestockEl && data.resources) {
            livestockEl.textContent = data.resources.livestock || 0;
        }
        var goodsEl = document.getElementById('ecoGoodsDisplay');
        if (goodsEl && data.resources) {
            goodsEl.textContent = data.resources.goods || 0;
        }

        var incomeEl = document.getElementById('ecoIncomeDisplay');
        if (incomeEl) {
            incomeEl.textContent = '+' + data.annualIncome + 'g';
        }

        var expensesEl = document.getElementById('ecoExpensesDisplay');
        if (expensesEl) {
            expensesEl.textContent = '-' + data.annualExpenses + 'g';
        }

        var netEl = document.getElementById('ecoNetDisplay');
        if (netEl) {
            netEl.textContent = 'Net Change: ' + (data.netChange >= 0 ? '+' : '') + data.netChange + 'g';
            netEl.style.color = data.netChange >= 0 ? 'var(--success)' : 'var(--warn)';
        }

        var profitEl = document.getElementById('ecoEnterpriseProfitDisplay');
        if (profitEl && data.enterpriseStats) {
            var totalProfit = data.enterpriseStats.totalProfit || 0;
            profitEl.textContent = (totalProfit >= 0 ? '+' : '') + totalProfit + 'g';
            profitEl.style.color = totalProfit >= 0 ? 'var(--success)' : 'var(--warn)';
        }
    }

    // =========================================================================
    // 10. MAIN RENDER FUNCTION
    // =========================================================================

    function renderHouseholdEconomyTab(containerId, householdId, forceRefresh) {
        if (_rendering) {
            return;
        }
        _rendering = true;

        try {
            var container = document.getElementById(containerId);
            if (!container) {
                console.warn('[EconomyTab] Container not found: ' + containerId);
                return;
            }

            if (!householdId) {
                householdId = _getCurrentHouseholdId();
            }

            if (!householdId) {
                container.innerHTML = '<div class="placeholder">No household selected</div>';
                return;
            }

            _currentHouseholdId = householdId;

            var data = _getEconomyData(householdId, forceRefresh);

            if (data.error) {
                container.innerHTML = '<div class="placeholder" style="color:var(--danger);">' + _escapeHtml(data.error) + '</div>';
                return;
            }

            if (container.querySelector('#ecoWealthDisplay')) {
                _updateDisplayValues(data);
                _rendering = false;
                return;
            }

            var html = '' +
                '<div style="max-width:650px;margin:0 auto;">' +
                    '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:16px;margin-bottom:12px;">' +
                        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
                            '<h3 style="font-size:0.7rem;color:var(--accent);margin:0;">Economic Summary</h3>' +
                            '<span style="font-size:0.55rem;color:var(--dim);">' + _escapeHtml(data.household.name) + '</span>' +
                        '</div>' +
                        _renderWealthSection(data) +
                        _renderResourcesSection(data) +
                        _renderIncomeExpensesSection(data) +
                        _renderEnterpriseSection(data) +
                        _renderActions(data) +
                    '</div>' +
                    '<div style="font-size:0.5rem;color:var(--dim);text-align:center;">' +
                        'Data for year ' + data.currentYear +
                        (data.salaryIncome > 0 ? ' · Includes salary tracking' : '') +
                        (data.tuitionExpenses > 0 ? ' · Includes tuition tracking' : '') +
                        (data.enterpriseSummaries && data.enterpriseSummaries.length > 0 ? ' · ' + data.enterpriseSummaries.length + ' enterprises' : '') +
                    '</div>' +
                '</div>';

            container.innerHTML = html;

            _attachEventHandlers(container, householdId);

        } catch (e) {
            console.error('[EconomyTab] Render error:', e);
            var container = document.getElementById(containerId);
            if (container) {
                container.innerHTML = '<div class="placeholder" style="color:var(--danger);">Error loading economy data</div>';
            }
        } finally {
            _rendering = false;
        }
    }

    // =========================================================================
    // 11. EVENT HANDLERS
    // =========================================================================

    function _attachEventHandlers(container, householdId) {
        container.addEventListener('click', function(e) {
            var target = e.target.closest('button');
            if (!target) return;

            if (target.id === 'ecoWealthBtn') {
                e.preventDefault();
                e.stopPropagation();
                _withModalLock(function() { _openWealthModal(householdId); });
                return;
            }

            if (target.id === 'ecoResourcesBtn') {
                e.preventDefault();
                e.stopPropagation();
                _withModalLock(function() { _openResourcesModal(householdId); });
                return;
            }

            if (target.id === 'ecoIncomeBtn') {
                e.preventDefault();
                e.stopPropagation();
                _withModalLock(function() { _openIncomeModal(householdId); });
                return;
            }

            if (target.id === 'ecoExpensesBtn') {
                e.preventDefault();
                e.stopPropagation();
                _withModalLock(function() { _openExpensesModal(householdId); });
                return;
            }

            if (target.id === 'ecoProcessBtn') {
                e.preventDefault();
                e.stopPropagation();
                _withModalLock(function() { _openProcessModal(householdId); });
                return;
            }
        });
    }

    // =========================================================================
    // 12. WEALTH MODAL
    // =========================================================================

    function _openWealthModal(householdId) {
        try {
            var HS = _getState();
            if (!HS) {
                _showToast('Household system not available', 'error');
                _releaseModalLock();
                return;
            }

            var wealth = _getHouseholdWealth(householdId);
            var debt = _getHouseholdDebt(householdId);
            var tier = _getEconomicTier(wealth);

            var content = '' +
                '<div style="margin-bottom:12px;">' +
                    '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px;background:var(--bg3);padding:10px;border-radius:6px;">' +
                        '<div style="text-align:center;"><span style="color:var(--dim);font-size:0.6rem;">Wealth</span><br><span style="font-size:1rem;font-weight:bold;">' + wealth + 'g</span></div>' +
                        '<div style="text-align:center;"><span style="color:var(--dim);font-size:0.6rem;">Debt</span><br><span style="font-size:1rem;font-weight:bold;color:' + (debt > 0 ? 'var(--warn)' : 'var(--text)') + ';">' + debt + 'g</span></div>' +
                        '<div style="text-align:center;"><span style="color:var(--dim);font-size:0.6rem;">Tier</span><br><span style="font-size:0.9rem;">' + _escapeHtml(tier.label) + '</span></div>' +
                    '</div>' +
                    '<div class="form-group" style="margin-bottom:12px;">' +
                        '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Modify Wealth</label>' +
                        '<div style="display:flex;gap:8px;">' +
                            '<input type="number" id="wealthDelta" value="0" style="flex:1;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                            '<input type="text" id="wealthReason" placeholder="Reason" style="flex:2;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                        '</div>' +
                        '<div style="display:flex;gap:4px;margin-top:4px;">' +
                            '<button id="wealthAddBtn" class="btn small" style="padding:2px 8px;font-size:0.5rem;background:var(--accent-dim);border:1px solid var(--accent);border-radius:3px;cursor:pointer;">Add</button>' +
                            '<button id="wealthSubtractBtn" class="btn small" style="padding:2px 8px;font-size:0.5rem;background:#8a3020;border:none;color:white;border-radius:3px;cursor:pointer;">Subtract</button>' +
                            '<button id="wealthSetBtn" class="btn small" style="padding:2px 8px;font-size:0.5rem;background:var(--bg3);border:1px solid var(--border);border-radius:3px;cursor:pointer;">Set</button>' +
                        '</div>' +
                    '</div>' +
                    '<div class="form-group" style="margin-bottom:12px;">' +
                        '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Modify Debt</label>' +
                        '<div style="display:flex;gap:8px;">' +
                            '<input type="number" id="debtDelta" value="0" style="flex:1;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                        '</div>' +
                        '<div style="display:flex;gap:4px;margin-top:4px;">' +
                            '<button id="debtAddBtn" class="btn small" style="padding:2px 8px;font-size:0.5rem;background:#8a3020;border:none;color:white;border-radius:3px;cursor:pointer;">Add Debt</button>' +
                            '<button id="debtSubtractBtn" class="btn small" style="padding:2px 8px;font-size:0.5rem;background:var(--accent-dim);border:1px solid var(--accent);border-radius:3px;cursor:pointer;">Pay Debt</button>' +
                        '</div>' +
                    '</div>' +
                '</div>';

            _openModal({
                title: 'Manage Wealth',
                content: content,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {
                    _closeTopModal();
                    _releaseModalLock();
                    var data = _getEconomyData(householdId, true);
                    _updateDisplayValues(data);
                },
                onCancel: function() {
                    _releaseModalLock();
                },
                onOpen: function() {
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
                            addBtn.onclick = function(e) {
                                e.stopPropagation();
                                var delta = Math.abs(getWealthDelta());
                                if (delta === 0) {
                                    _showToast('Please enter a value', 'warning');
                                    return;
                                }
                                _updateHouseholdWealth(householdId, delta, 'Added: ' + getWealthReason());
                                _showToast('Wealth increased by ' + delta, 'success');
                                _closeTopModal();
                                _releaseModalLock();
                                var data = _getEconomyData(householdId, true);
                                _updateDisplayValues(data);
                            };
                        }

                        var subBtn = document.getElementById('wealthSubtractBtn');
                        if (subBtn) {
                            subBtn.onclick = function(e) {
                                e.stopPropagation();
                                var delta = Math.abs(getWealthDelta());
                                if (delta === 0) {
                                    _showToast('Please enter a value', 'warning');
                                    return;
                                }
                                _updateHouseholdWealth(householdId, -delta, 'Subtracted: ' + getWealthReason());
                                _showToast('Wealth decreased by ' + delta, 'info');
                                _closeTopModal();
                                _releaseModalLock();
                                var data = _getEconomyData(householdId, true);
                                _updateDisplayValues(data);
                            };
                        }

                        var setBtn = document.getElementById('wealthSetBtn');
                        if (setBtn) {
                            setBtn.onclick = function(e) {
                                e.stopPropagation();
                                var delta = getWealthDelta();
                                if (delta < 0) {
                                    _showToast('Please enter a non-negative value', 'error');
                                    return;
                                }
                                var currentWealth = _getHouseholdWealth(householdId);
                                var diff = delta - currentWealth;
                                _updateHouseholdWealth(householdId, diff, 'Set to ' + delta + ': ' + getWealthReason());
                                _showToast('Wealth set to ' + delta + 'g', 'success');
                                _closeTopModal();
                                _releaseModalLock();
                                var data = _getEconomyData(householdId, true);
                                _updateDisplayValues(data);
                            };
                        }

                        var debtAddBtn = document.getElementById('debtAddBtn');
                        if (debtAddBtn) {
                            debtAddBtn.onclick = function(e) {
                                e.stopPropagation();
                                var delta = parseInt(document.getElementById('debtDelta').value) || 0;
                                if (delta <= 0) {
                                    _showToast('Please enter a positive value', 'warning');
                                    return;
                                }
                                _modifyHouseholdDebt(householdId, delta);
                                _showToast('Debt increased by ' + delta, 'info');
                                _closeTopModal();
                                _releaseModalLock();
                                var data = _getEconomyData(householdId, true);
                                _updateDisplayValues(data);
                            };
                        }

                        var debtSubBtn = document.getElementById('debtSubtractBtn');
                        if (debtSubBtn) {
                            debtSubBtn.onclick = function(e) {
                                e.stopPropagation();
                                var delta = parseInt(document.getElementById('debtDelta').value) || 0;
                                if (delta <= 0) {
                                    _showToast('Please enter a positive value', 'warning');
                                    return;
                                }
                                var currentDebt = _getHouseholdDebt(householdId);
                                _modifyHouseholdDebt(householdId, -Math.min(delta, currentDebt));
                                _showToast('Debt reduced', 'success');
                                _closeTopModal();
                                _releaseModalLock();
                                var data = _getEconomyData(householdId, true);
                                _updateDisplayValues(data);
                            };
                        }
                    }, 100);
                }
            });
        } catch (e) {
            console.error('[EconomyTab] Wealth modal error:', e);
            _showToast('Error opening wealth modal', 'error');
            _releaseModalLock();
        }
    }

    // =========================================================================
    // 13. RESOURCES MODAL
    // =========================================================================

    function _openResourcesModal(householdId) {
        try {
            var HS = _getState();
            if (!HS) {
                _showToast('Household system not available', 'error');
                _releaseModalLock();
                return;
            }

            var resources = _getHouseholdResources(householdId);
            var resourceTypes = ['food', 'livestock', 'goods'];
            var resourceLabels = { food: 'Food', livestock: 'Livestock', goods: 'Goods' };

            var resourcesHtml = '';
            for (var i = 0; i < resourceTypes.length; i++) {
                var type = resourceTypes[i];
                var value = resources[type] || 0;
                resourcesHtml +=
                    '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--bg2);border-radius:6px;margin-bottom:4px;">' +
                        '<span style="font-size:0.7rem;">' + resourceLabels[type] + '</span>' +
                        '<div style="display:flex;align-items:center;gap:8px;">' +
                            '<span style="font-size:1rem;font-weight:bold;">' + value + '</span>' +
                            '<div style="display:flex;gap:2px;">' +
                                '<button class="resource-add-btn btn small" data-type="' + type + '" style="padding:1px 6px;font-size:0.5rem;background:var(--accent-dim);border:1px solid var(--accent);border-radius:3px;cursor:pointer;">+</button>' +
                                '<button class="resource-sub-btn btn small" data-type="' + type + '" style="padding:1px 6px;font-size:0.5rem;background:#8a3020;border:none;color:white;border-radius:3px;cursor:pointer;">-</button>' +
                            '</div>' +
                        '</div>' +
                    '</div>';
            }

            resourcesHtml +=
                '<div style="margin-top:8px;">' +
                    '<div style="display:flex;gap:4px;flex-wrap:wrap;">' +
                        '<input type="number" id="resourceDeltaInput" value="1" style="width:60px;padding:4px 6px;background:var(--bg);border:1px solid var(--border);border-radius:4px;font-size:0.65rem;">' +
                        '<button id="resourceAddAllBtn" class="btn small" style="padding:2px 8px;font-size:0.5rem;background:var(--accent-dim);border:1px solid var(--accent);border-radius:3px;cursor:pointer;">Add to All</button>' +
                    '</div>' +
                '</div>';

            var content = '' +
                '<div style="margin-bottom:12px;">' +
                    '<div style="background:var(--bg3);padding:10px;border-radius:6px;margin-bottom:12px;text-align:center;font-size:0.55rem;color:var(--dim);">' +
                        'Manage household resources' +
                    '</div>' +
                    resourcesHtml +
                '</div>';

            _openModal({
                title: 'Manage Resources',
                content: content,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {
                    _closeTopModal();
                    _releaseModalLock();
                    var data = _getEconomyData(householdId, true);
                    _updateDisplayValues(data);
                },
                onCancel: function() {
                    _releaseModalLock();
                },
                onOpen: function() {
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

                            newBtn.onclick = function(e) {
                                e.stopPropagation();
                                var type = this.dataset.type;
                                var delta = getDelta();
                                _updateHouseholdResources(householdId, type, delta);
                                _showToast(type + ' increased by ' + delta, 'success');
                                _closeTopModal();
                                _releaseModalLock();
                                var data = _getEconomyData(householdId, true);
                                _updateDisplayValues(data);
                            };
                        });

                        var subBtns = document.querySelectorAll('.resource-sub-btn');
                        subBtns.forEach(function(btn) {
                            var newBtn = btn.cloneNode(true);
                            if (btn.parentNode) {
                                btn.parentNode.replaceChild(newBtn, btn);
                            }

                            newBtn.onclick = function(e) {
                                e.stopPropagation();
                                var type = this.dataset.type;
                                var delta = getDelta();
                                var current = resources[type] || 0;
                                var actualDelta = Math.min(delta, current);
                                _updateHouseholdResources(householdId, type, -actualDelta);
                                _showToast(type + ' decreased by ' + actualDelta, 'info');
                                _closeTopModal();
                                _releaseModalLock();
                                var data = _getEconomyData(householdId, true);
                                _updateDisplayValues(data);
                            };
                        });

                        var addAllBtn = document.getElementById('resourceAddAllBtn');
                        if (addAllBtn) {
                            addAllBtn.onclick = function(e) {
                                e.stopPropagation();
                                var delta = getDelta();
                                var types = ['food', 'livestock', 'goods'];
                                for (var i = 0; i < types.length; i++) {
                                    _updateHouseholdResources(householdId, types[i], delta);
                                }
                                _showToast('All resources increased by ' + delta, 'success');
                                _closeTopModal();
                                _releaseModalLock();
                                var data = _getEconomyData(householdId, true);
                                _updateDisplayValues(data);
                            };
                        }
                    }, 100);
                }
            });
        } catch (e) {
            console.error('[EconomyTab] Resources modal error:', e);
            _showToast('Error opening resources modal', 'error');
            _releaseModalLock();
        }
    }

    // =========================================================================
    // 14. INCOME MODAL
    // =========================================================================

    function _openIncomeModal(householdId) {
        try {
            var HS = _getState();
            if (!HS) {
                _showToast('Household system not available', 'error');
                _releaseModalLock();
                return;
            }

            var annualIncome = _calculateAnnualIncome(householdId);
            var currentYear = _getCurrentYear();
            var salaryIncome = _getSalaryIncome(householdId, currentYear);

            var household = HS.getHousehold(householdId);
            var memberCount = household && household.members ? household.members.length : 1;

            var breakdown = [];
            if (salaryIncome > 0) {
                breakdown.push({
                    source: { id: 'salary', name: 'Salary Income' },
                    amount: salaryIncome
                });
            }

            var HQ = _getQueries();
            if (HQ && typeof HQ.getHouseholdEnterpriseSummaries === 'function') {
                var summaries = HQ.getHouseholdEnterpriseSummaries(householdId);
                if (summaries && summaries.length > 0) {
                    var totalProfit = 0;
                    for (var i = 0; i < summaries.length; i++) {
                        totalProfit += summaries[i].annualProfit || 0;
                    }
                    if (totalProfit !== 0) {
                        breakdown.push({
                            source: { id: 'enterprise', name: 'Enterprise Profit' },
                            amount: totalProfit
                        });
                    }
                }
            }

            var baseIncome = 50 + (memberCount - 1) * 10;
            breakdown.push({
                source: { id: 'base', name: 'Base Income' },
                amount: baseIncome
            });

            var RS = typeof window.ResidenceSystem !== 'undefined' ? window.ResidenceSystem : null;
            if (RS && typeof RS.getTotalRentIncome === 'function') {
                var rentIncome = RS.getTotalRentIncome(householdId, 'household');
                if (rentIncome > 0) {
                    breakdown.push({
                        source: { id: 'rent', name: 'Rent Income' },
                        amount: rentIncome
                    });
                }
            }

            var breakdownHtml = breakdown.map(function(b) {
                return '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border-light);font-size:0.6rem;">' +
                    '<span>' + _escapeHtml(b.source.name) + '</span>' +
                    '<span>' + (b.amount >= 0 ? '+' : '') + b.amount + 'g</span>' +
                    '</div>';
            }).join('');

            var content = '' +
                '<div style="margin-bottom:12px;">' +
                    '<div style="background:var(--bg3);padding:10px;border-radius:6px;margin-bottom:12px;">' +
                        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
                            '<div><span style="color:var(--dim);font-size:0.6rem;">Annual Income</span><br><span style="font-size:1.1rem;font-weight:bold;color:var(--success);">' + annualIncome + 'g</span></div>' +
                            '<div><span style="color:var(--dim);font-size:0.6rem;">Total Sources</span><br><span style="font-size:0.9rem;">' + breakdown.length + '</span></div>' +
                        '</div>' +
                        (salaryIncome > 0 ? '<div style="font-size:0.55rem;color:var(--accent);margin-top:4px;">Includes ' + salaryIncome + 'g from salaries</div>' : '') +
                    '</div>' +
                    '<div style="margin-bottom:12px;">' +
                        '<div style="font-size:0.6rem;color:var(--accent);margin-bottom:4px;">Income Sources</div>' +
                        '<div style="background:var(--bg2);border-radius:6px;padding:8px;">' + breakdownHtml + '</div>' +
                    '</div>' +
                    '<div style="font-size:0.55rem;color:var(--dim);">Based on household size, location, member professions, salaries, enterprises, and rent</div>' +
                '</div>';

            _openModal({
                title: 'Income Breakdown',
                content: content,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {
                    _closeTopModal();
                    _releaseModalLock();
                },
                onCancel: function() {
                    _releaseModalLock();
                }
            });
        } catch (e) {
            console.error('[EconomyTab] Income modal error:', e);
            _showToast('Error opening income modal', 'error');
            _releaseModalLock();
        }
    }

    // =========================================================================
    // 15. EXPENSES MODAL
    // =========================================================================

    function _openExpensesModal(householdId) {
        try {
            var HS = _getState();
            if (!HS) {
                _showToast('Household system not available', 'error');
                _releaseModalLock();
                return;
            }

            var annualExpenses = _calculateAnnualExpenses(householdId);
            var currentYear = _getCurrentYear();
            var tuitionExpenses = _getTuitionExpenses(householdId, currentYear);

            var household = HS.getHousehold(householdId);
            var memberCount = household && household.members ? household.members.length : 1;
            var wealth = _getHouseholdWealth(householdId);

            var breakdown = [];

            var foodExpense = memberCount * 5;
            breakdown.push({
                category: { id: 'food', name: 'Food & Supplies' },
                amount: foodExpense
            });

            var staffCount = 0;
            if (household && household.members) {
                for (var i = 0; i < household.members.length; i++) {
                    if (household.members[i].type === 'staff') staffCount++;
                }
            }
            var staffExpense = staffCount * 3;
            if (staffExpense > 0) {
                breakdown.push({
                    category: { id: 'staff', name: 'Staff Wages' },
                    amount: staffExpense
                });
            }

            if (wealth > 100) {
                var luxuryExpense = Math.floor(5 + (wealth - 100) / 40);
                breakdown.push({
                    category: { id: 'luxury', name: 'Luxury Goods' },
                    amount: Math.min(luxuryExpense, 20)
                });
            }

            var debt = _getHouseholdDebt(householdId);
            if (debt > 0) {
                var debtPayment = Math.min(10, Math.floor(debt * 0.1));
                breakdown.push({
                    category: { id: 'debt', name: 'Debt Payments' },
                    amount: debtPayment
                });
            }

            if (tuitionExpenses > 0) {
                breakdown.push({
                    category: { id: 'tuition', name: 'Tuition' },
                    amount: tuitionExpenses
                });
            }

            var HQ = _getQueries();
            if (HQ && typeof HQ.getHouseholdEnterpriseSummaries === 'function') {
                var summaries = HQ.getHouseholdEnterpriseSummaries(householdId);
                if (summaries && summaries.length > 0) {
                    var totalLoss = 0;
                    for (var i = 0; i < summaries.length; i++) {
                        var profit = summaries[i].annualProfit || 0;
                        if (profit < 0) totalLoss += Math.abs(profit);
                    }
                    if (totalLoss > 0) {
                        breakdown.push({
                            category: { id: 'enterprise_loss', name: 'Enterprise Losses' },
                            amount: totalLoss
                        });
                    }
                }
            }

            var breakdownHtml = breakdown.map(function(b) {
                return '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border-light);font-size:0.6rem;">' +
                    '<span>' + _escapeHtml(b.category.name) + '</span>' +
                    '<span>' + b.amount + 'g</span>' +
                    '</div>';
            }).join('');

            var content = '' +
                '<div style="margin-bottom:12px;">' +
                    '<div style="background:var(--bg3);padding:10px;border-radius:6px;margin-bottom:12px;">' +
                        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
                            '<div><span style="color:var(--dim);font-size:0.6rem;">Annual Expenses</span><br><span style="font-size:1.1rem;font-weight:bold;color:var(--warn);">' + annualExpenses + 'g</span></div>' +
                            '<div><span style="color:var(--dim);font-size:0.6rem;">Categories</span><br><span style="font-size:0.9rem;">' + breakdown.length + '</span></div>' +
                        '</div>' +
                        (tuitionExpenses > 0 ? '<div style="font-size:0.55rem;color:var(--warn);margin-top:4px;">Includes ' + tuitionExpenses + 'g in tuition</div>' : '') +
                    '</div>' +
                    '<div style="margin-bottom:12px;">' +
                        '<div style="font-size:0.6rem;color:var(--accent);margin-bottom:4px;">Expense Categories</div>' +
                        '<div style="background:var(--bg2);border-radius:6px;padding:8px;">' + breakdownHtml + '</div>' +
                    '</div>' +
                    '<div style="font-size:0.55rem;color:var(--dim);">Based on household size, staff count, wealth, debt, tuition, and enterprise losses</div>' +
                '</div>';

            _openModal({
                title: 'Expense Breakdown',
                content: content,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {
                    _closeTopModal();
                    _releaseModalLock();
                },
                onCancel: function() {
                    _releaseModalLock();
                }
            });
        } catch (e) {
            console.error('[EconomyTab] Expenses modal error:', e);
            _showToast('Error opening expenses modal', 'error');
            _releaseModalLock();
        }
    }

    // =========================================================================
    // 16. PROCESS MODAL
    // =========================================================================

    function _openProcessModal(householdId) {
        try {
            var HS = _getState();
            if (!HS) {
                _showToast('Household system not available', 'error');
                _releaseModalLock();
                return;
            }

            var wealth = _getHouseholdWealth(householdId);
            var annualIncome = _calculateAnnualIncome(householdId);
            var annualExpenses = _calculateAnnualExpenses(householdId);
            var netChange = annualIncome - annualExpenses;

            var content = '' +
                '<div style="margin-bottom:12px;">' +
                    '<div style="background:var(--bg3);padding:10px;border-radius:6px;margin-bottom:12px;">' +
                        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">' +
                            '<div style="text-align:center;"><span style="color:var(--dim);font-size:0.55rem;">Current Wealth</span><br><span style="font-size:0.9rem;">' + wealth + 'g</span></div>' +
                            '<div style="text-align:center;"><span style="color:var(--dim);font-size:0.55rem;">Income</span><br><span style="font-size:0.9rem;color:var(--success);">+' + annualIncome + 'g</span></div>' +
                            '<div style="text-align:center;"><span style="color:var(--dim);font-size:0.55rem;">Expenses</span><br><span style="font-size:0.9rem;color:var(--warn);">-' + annualExpenses + 'g</span></div>' +
                        '</div>' +
                        '<div style="text-align:center;margin-top:8px;padding:6px;background:var(--bg);border-radius:4px;">' +
                            '<span style="font-size:0.8rem;font-weight:bold;color:' + (netChange >= 0 ? 'var(--success)' : 'var(--warn)') + ';">' +
                                'Net Change: ' + (netChange >= 0 ? '+' : '') + netChange + 'g' +
                            '</span>' +
                        '</div>' +
                        '<div style="font-size:0.55rem;color:var(--dim);margin-top:4px;text-align:center;">' +
                            'New Wealth: ' + (wealth + netChange) + 'g' +
                        '</div>' +
                    '</div>' +
                    '<div style="font-size:0.6rem;color:var(--warn);">Processing will apply annual income and expenses to the household.</div>' +
                    '<div style="font-size:0.55rem;color:var(--dim);margin-top:4px;">This also consumes food based on member count.</div>' +
                '</div>';

            _openModal({
                title: 'Process Annual Economy',
                content: content,
                confirmText: 'Process Year',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var result = _processAnnualEconomy(householdId);

                    if (result && result.success) {
                        var msg = 'Annual processing complete. Wealth: ' + result.oldWealth + ' → ' + result.newWealth + 'g';
                        _showToast(msg, 'success');
                        _closeTopModal();
                        _releaseModalLock();
                        var data = _getEconomyData(householdId, true);
                        renderHouseholdEconomyTab('tab-economy', householdId, true);
                        if (typeof window.renderHouseholdList === 'function') {
                            window.renderHouseholdList();
                        }
                        return true;
                    } else {
                        _showToast(result ? result.reason : 'Failed to process annual economy', 'error');
                        _releaseModalLock();
                        return false;
                    }
                },
                onCancel: function() {
                    _releaseModalLock();
                }
            });
        } catch (e) {
            console.error('[EconomyTab] Process modal error:', e);
            _showToast('Error opening process modal', 'error');
            _releaseModalLock();
        }
    }

    // =========================================================================
    // 17. REFRESH FUNCTION
    // =========================================================================

    function refreshHouseholdEconomyTab(householdId) {
        var containerId = 'tab-economy';
        var container = document.getElementById(containerId);
        if (!container) {
            var containers = document.querySelectorAll('.tab-pane[id*="economy"]');
            for (var i = 0; i < containers.length; i++) {
                if (containers[i].id) {
                    containerId = containers[i].id;
                    container = containers[i];
                    break;
                }
            }
        }

        if (!container) {
            console.warn('[EconomyTab] Container not found');
            return;
        }

        _cachedData = null;
        _cacheHouseholdId = null;
        renderHouseholdEconomyTab(containerId, householdId, true);
    }

    // =========================================================================
    // 18. TAB SYSTEM REGISTRATION
    // =========================================================================

    function registerEconomyTabRenderer() {
        if (typeof window.registerTabRenderer === 'function') {
            window.registerTabRenderer('economy', function(containerId, locationId, summary) {
                var householdId = _getCurrentHouseholdId();
                if (!householdId) {
                    var container = document.getElementById(containerId);
                    if (container) {
                        container.innerHTML = '<div class="placeholder">No household selected</div>';
                    }
                    return;
                }
                renderHouseholdEconomyTab(containerId, householdId);
            }, true);
            console.log('[HouseholdEconomyTab] Registered with tab system');
        }
    }

    // =========================================================================
    // 19. EXPORTS
    // =========================================================================

    window.renderHouseholdEconomyTab = renderHouseholdEconomyTab;
    window.refreshHouseholdEconomyTab = refreshHouseholdEconomyTab;
    window.registerEconomyTabRenderer = registerEconomyTabRenderer;

    // Auto-register if tab system is available
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(registerEconomyTabRenderer, 100);
        });
    } else {
        setTimeout(registerEconomyTabRenderer, 100);
    }

})();