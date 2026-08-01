/**
 * =============================================================================
 * SETTLEMENT ECONOMY TAB - UI for settlement economy management
 * =============================================================================
 * 
 * This file provides the complete UI for the Settlement Economy tab.
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARD
    // =========================================================================

    var _rendering = false;
    var _modalOpen = false;

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

    function _getIcon(name) {
        if (window.Icons && window.Icons[name]) {
            return window.Icons[name];
        }
        if (window.Icons && window.Icons.CIRCLE) {
            return window.Icons.CIRCLE;
        }
        return '';
    }

    function _getPlaceById(id) {
        return typeof window.getPlaceById === 'function' ? window.getPlaceById(id) : null;
    }

    function _getCurrentYear() {
        if (typeof window._getCurrentYear === 'function') return window._getCurrentYear();
        if (typeof window.getCurrentYearSafe === 'function') return window.getCurrentYearSafe();
        if (typeof window.getCurrentYear === 'function') return window.getCurrentYear();
        return 1250;
    }

    function _getLocationPopulationCount(locationId) {
        if (typeof window.getLocationPopulationCount === 'function') {
            return window.getLocationPopulationCount(locationId);
        }
        return 0;
    }

    function _getSettlementData(locationId) {
        if (typeof SettlementState !== 'undefined' && SettlementState.getSettlementData) {
            return SettlementState.getSettlementData(locationId);
        }
        return null;
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

    function _getSettlementBudgetAllocation(locationId) {
        if (typeof SettlementState !== 'undefined' && SettlementState.getSettlementBudgetAllocation) {
            return SettlementState.getSettlementBudgetAllocation(locationId);
        }
        return null;
    }

    // =========================================================================
    // 3. UPDATE COMMANDS
    // =========================================================================

    function _updateTaxRate(locationId, rate) {
        if (typeof SettlementCommands !== 'undefined' && SettlementCommands.updateTaxRate) {
            return SettlementCommands.updateTaxRate(locationId, rate);
        }
        return null;
    }

    function _updateTradeTariff(locationId, tariff) {
        if (typeof SettlementCommands !== 'undefined' && SettlementCommands.updateTradeTariff) {
            return SettlementCommands.updateTradeTariff(locationId, tariff);
        }
        return null;
    }

    function _updateIndustryTaxRate(locationId, rate) {
        if (typeof SettlementCommands !== 'undefined' && SettlementCommands.updateIndustryTaxRate) {
            return SettlementCommands.updateIndustryTaxRate(locationId, rate);
        }
        return null;
    }

    function _updateMilitarySpending(locationId, amount) {
        if (typeof SettlementCommands !== 'undefined' && SettlementCommands.updateMilitarySpending) {
            return SettlementCommands.updateMilitarySpending(locationId, amount);
        }
        return null;
    }

    function _updateInfrastructureSpending(locationId, amount) {
        if (typeof SettlementCommands !== 'undefined' && SettlementCommands.updateInfrastructureSpending) {
            return SettlementCommands.updateInfrastructureSpending(locationId, amount);
        }
        return null;
    }

    function _updateEducationSpending(locationId, amount) {
        if (typeof SettlementCommands !== 'undefined' && SettlementCommands.updateEducationSpending) {
            return SettlementCommands.updateEducationSpending(locationId, amount);
        }
        return null;
    }

    function _updateJusticeSeverity(locationId, severity) {
        if (typeof SettlementCommands !== 'undefined' && SettlementCommands.updateJusticeSeverity) {
            return SettlementCommands.updateJusticeSeverity(locationId, severity);
        }
        return null;
    }

    function _updateWatch(locationId, hasWatch, size) {
        if (typeof SettlementCommands !== 'undefined' && SettlementCommands.updateWatch) {
            return SettlementCommands.updateWatch(locationId, hasWatch, size);
        }
        return null;
    }

    function _updateWealth(locationId, delta, reason) {
        if (typeof SettlementCommands !== 'undefined' && SettlementCommands.updateWealth) {
            return SettlementCommands.updateWealth(locationId, delta, reason);
        }
        return null;
    }

    function _updateDebt(locationId, delta, reason) {
        if (typeof SettlementCommands !== 'undefined' && SettlementCommands.updateDebt) {
            return SettlementCommands.updateDebt(locationId, delta, reason);
        }
        return null;
    }

    function _allocateEducationBudget(locationId, amount, year) {
        if (typeof SettlementCommands !== 'undefined' && SettlementCommands.allocateEducationBudget) {
            return SettlementCommands.allocateEducationBudget(locationId, amount, year);
        }
        return null;
    }

    function _allocateGovernmentSalaryBudget(locationId, amount, year) {
        if (typeof SettlementCommands !== 'undefined' && SettlementCommands.allocateGovernmentSalaryBudget) {
            return SettlementCommands.allocateGovernmentSalaryBudget(locationId, amount, year);
        }
        return null;
    }

    // =========================================================================
    // 4. ICON HELPERS
    // =========================================================================

    function _icon(name) {
        return _getIcon(name);
    }

    // =========================================================================
    // 5. MAIN RENDER FUNCTION
    // =========================================================================

    function renderSettlementEconomy(containerId, locationId, summary) {
        if (_rendering) {
            return;
        }
        _rendering = true;

        try {
            var container = document.getElementById(containerId);
            if (!container) {
                _rendering = false;
                return;
            }

            if (!summary) {
                summary = _getSettlementSummary(locationId);
                if (!summary) {
                    var data = _getSettlementData(locationId);
                    if (data) {
                        var ranks = typeof SettlementState !== 'undefined' && SettlementState._getAllRanks ? 
                            SettlementState._getAllRanks() : [];
                        var rank = null;
                        for (var i = 0; i < ranks.length; i++) {
                            if (ranks[i].id === data.rankId) {
                                rank = ranks[i];
                                break;
                            }
                        }
                        summary = {
                            name: data.locationName || locationId,
                            rank: rank || { id: data.rankId, name: data.rankId || 'Unknown' },
                            prosperity: { value: data.prosperity || 50, description: 'Stable' },
                            wealth: data.wealth || 0,
                            totalDebt: data.totalDebt || 0,
                            netWorth: (data.wealth || 0) - (data.totalDebt || 0),
                            taxRate: data.taxRate || 10,
                            tradeTariff: data.tradeTariff || 5,
                            industryTaxRate: data.industryTaxRate || 8,
                            crimeRate: data.crimeRate || 0.05,
                            foundedYear: data.foundedYear || 1250,
                            lastUpgraded: data.lastUpgraded || 1250,
                            specializationRoleId: data.specializationRoleId || null,
                            features: [],
                            justice: {
                                severity: data.justiceSeverity || 'medium',
                                hasWatch: data.hasWatch || false,
                                watchSize: data.watchSize || 0
                            },
                            spending: {
                                military: data.militarySpending || 0,
                                infrastructure: data.infrastructureSpending || 0,
                                education: data.educationSpending || 0
                            }
                        };
                    }
                }
            }

            if (!summary) {
                container.innerHTML = '<div class="empty-state">No settlement data found. Select a location with a settlement.</div>';
                _rendering = false;
                return;
            }

            var place = _getPlaceById(locationId);
            if (!place) {
                container.innerHTML = '<div class="empty-state">Location not found</div>';
                _rendering = false;
                return;
            }

            var population = _getLocationPopulationCount(locationId);
            var budget = _getSettlementBudget(locationId);
            var employment = _getSettlementEmployment(locationId);
            var surplus = _calculateSurplus(locationId);
            var debtRatio = _getDebtRatio(locationId);
            var efficiency = _getEfficiencyScore(locationId);

            var LOC = _icon('LOCATION');
            var COIN = _icon('COIN');
            var CIRCLE = _icon('CIRCLE_DOT');
            var WARNING = _icon('WARNING');
            var SHIELD = _icon('SHIELD');
            var PERSON = _icon('PERSON');
            var STAR = _icon('STAR_4');
            var REFRESH = _icon('REFRESH');
            var GEAR = _icon('GEAR');
            var EDIT = _icon('EDIT');

            var content = '<div style="padding: 4px;">';

            // HEADER
            content += '<div style="background: var(--bg2); padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; border: 1px solid var(--border);">' +
                '<div>' +
                '<div style="font-size: 0.8rem; font-weight: bold; color: var(--accent-light);">' + LOC + ' ' + _escapeHtml(place.displayName) + '</div>' +
                '<div style="font-size: 0.6rem; color: var(--dim);">Population: ' + population.toLocaleString() + ' · Rank: ' + _escapeHtml(summary.rank ? summary.rank.name : 'Unknown') + '</div>' +
                '</div>' +
                '<div style="text-align: right;">' +
                '<div style="font-size: 0.7rem; color: var(--text);">Prosperity: <span style="color: ' + (summary.prosperity && summary.prosperity.value >= 70 ? 'var(--success)' : summary.prosperity && summary.prosperity.value >= 40 ? 'var(--accent)' : 'var(--danger)') + '; font-weight: bold;">' + (summary.prosperity ? summary.prosperity.value : 50) + '%</span></div>' +
                '<div style="font-size: 0.6rem; color: var(--dim);">' + (summary.prosperity ? summary.prosperity.description : 'Stable') + '</div>' +
                '</div>' +
                '</div>';

            // WEALTH & DEBT SUMMARY
            var netWorth = (summary.wealth || 0) - (summary.totalDebt || 0);
            content += '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 12px; margin-bottom: 16px;">' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center; border: 1px solid var(--border);">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">' + COIN + ' Wealth</div>' +
                '<div style="font-size: 1.1rem; font-weight: bold; color: ' + ((summary.wealth || 0) >= 0 ? 'var(--success)' : 'var(--danger)') + ';">' + (summary.wealth || 0) + 'g</div>' +
                '</div>' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center; border: 1px solid var(--border);">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Debt</div>' +
                '<div style="font-size: 1.1rem; font-weight: bold; color: ' + ((summary.totalDebt || 0) > 0 ? 'var(--danger-lt)' : 'var(--success)') + ';">' + (summary.totalDebt || 0) + 'g</div>' +
                '</div>' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center; border: 1px solid var(--border);">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Debt Ratio</div>' +
                '<div style="font-size: 1.1rem; font-weight: bold; color: ' + (debtRatio > 50 ? 'var(--danger)' : debtRatio > 25 ? 'var(--warn)' : 'var(--success)') + ';">' + debtRatio + '%</div>' +
                '</div>' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center; border: 1px solid var(--border);">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Net Worth</div>' +
                '<div style="font-size: 1.1rem; font-weight: bold; color: ' + (netWorth >= 0 ? 'var(--success)' : 'var(--danger)') + ';">' + netWorth + 'g</div>' +
                '</div>' +
                '</div>';

            // TAX RATES - EDITABLE INLINE
            content += '<div style="background: var(--bg2); padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; border: 1px solid var(--border);">' +
                '<div style="font-size: 0.7rem; color: var(--accent-light); font-weight: bold; margin-bottom: 8px;">' + GEAR + ' Tax Rates & Tariffs</div>' +
                '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;">' +
                
                // Tax Rate
                '<div style="background: var(--bg); padding: 8px 12px; border-radius: 4px; border: 1px solid var(--border-light);">' +
                '<div style="font-size: 0.5rem; color: var(--dim);">Tax Rate</div>' +
                '<div style="display: flex; gap: 6px; align-items: center; margin-top: 4px;">' +
                '<input type="number" id="taxRateInput" value="' + (summary.taxRate || 10) + '" min="0" max="50" style="width: 60px; padding: 4px 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; color: var(--text); font-size: 0.7rem;">' +
                '<span style="font-size: 0.55rem; color: var(--dim);">%</span>' +
                '<button class="tax-update-btn" data-field="taxRate" style="font-size: 0.5rem; padding: 2px 8px; background: var(--accent); border: none; border-radius: 3px; cursor: pointer; color: #ffffff;">' + EDIT + '</button>' +
                '</div>' +
                '</div>' +

                // Trade Tariff
                '<div style="background: var(--bg); padding: 8px 12px; border-radius: 4px; border: 1px solid var(--border-light);">' +
                '<div style="font-size: 0.5rem; color: var(--dim);">Trade Tariff</div>' +
                '<div style="display: flex; gap: 6px; align-items: center; margin-top: 4px;">' +
                '<input type="number" id="tradeTariffInput" value="' + (summary.tradeTariff || 5) + '" min="0" max="30" style="width: 60px; padding: 4px 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; color: var(--text); font-size: 0.7rem;">' +
                '<span style="font-size: 0.55rem; color: var(--dim);">%</span>' +
                '<button class="tax-update-btn" data-field="tradeTariff" style="font-size: 0.5rem; padding: 2px 8px; background: var(--accent); border: none; border-radius: 3px; cursor: pointer; color: #ffffff;">' + EDIT + '</button>' +
                '</div>' +
                '</div>' +

                // Industry Tax Rate
                '<div style="background: var(--bg); padding: 8px 12px; border-radius: 4px; border: 1px solid var(--border-light);">' +
                '<div style="font-size: 0.5rem; color: var(--dim);">Industry Tax</div>' +
                '<div style="display: flex; gap: 6px; align-items: center; margin-top: 4px;">' +
                '<input type="number" id="industryTaxRateInput" value="' + (summary.industryTaxRate || 8) + '" min="0" max="30" style="width: 60px; padding: 4px 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; color: var(--text); font-size: 0.7rem;">' +
                '<span style="font-size: 0.55rem; color: var(--dim);">%</span>' +
                '<button class="tax-update-btn" data-field="industryTaxRate" style="font-size: 0.5rem; padding: 2px 8px; background: var(--accent); border: none; border-radius: 3px; cursor: pointer; color: #ffffff;">' + EDIT + '</button>' +
                '</div>' +
                '</div>' +

                '</div>' +
                '</div>';

            // SPENDING CONTROLS
            content += '<div style="background: var(--bg2); padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; border: 1px solid var(--border);">' +
                '<div style="font-size: 0.7rem; color: var(--accent-light); font-weight: bold; margin-bottom: 8px;">' + COIN + ' Spending Controls</div>' +
                '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;">' +

                // Military
                '<div style="background: var(--bg); padding: 8px 12px; border-radius: 4px; border: 1px solid var(--border-light);">' +
                '<div style="font-size: 0.5rem; color: var(--dim);">Military</div>' +
                '<div style="display: flex; gap: 6px; align-items: center; margin-top: 4px;">' +
                '<input type="number" id="militarySpendingInput" value="' + (summary.spending.military || 0) + '" min="0" step="5" style="width: 70px; padding: 4px 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; color: var(--text); font-size: 0.7rem;">' +
                '<span style="font-size: 0.55rem; color: var(--dim);">g/yr</span>' +
                '<button class="spending-update-btn" data-field="military" style="font-size: 0.5rem; padding: 2px 8px; background: var(--accent); border: none; border-radius: 3px; cursor: pointer; color: #ffffff;">' + EDIT + '</button>' +
                '</div>' +
                '</div>' +

                // Infrastructure
                '<div style="background: var(--bg); padding: 8px 12px; border-radius: 4px; border: 1px solid var(--border-light);">' +
                '<div style="font-size: 0.5rem; color: var(--dim);">Infrastructure</div>' +
                '<div style="display: flex; gap: 6px; align-items: center; margin-top: 4px;">' +
                '<input type="number" id="infrastructureSpendingInput" value="' + (summary.spending.infrastructure || 0) + '" min="0" step="5" style="width: 70px; padding: 4px 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; color: var(--text); font-size: 0.7rem;">' +
                '<span style="font-size: 0.55rem; color: var(--dim);">g/yr</span>' +
                '<button class="spending-update-btn" data-field="infrastructure" style="font-size: 0.5rem; padding: 2px 8px; background: var(--accent); border: none; border-radius: 3px; cursor: pointer; color: #ffffff;">' + EDIT + '</button>' +
                '</div>' +
                '</div>' +

                // Education
                '<div style="background: var(--bg); padding: 8px 12px; border-radius: 4px; border: 1px solid var(--border-light);">' +
                '<div style="font-size: 0.5rem; color: var(--dim);">Education</div>' +
                '<div style="display: flex; gap: 6px; align-items: center; margin-top: 4px;">' +
                '<input type="number" id="educationSpendingInput" value="' + (summary.spending.education || 0) + '" min="0" step="5" style="width: 70px; padding: 4px 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; color: var(--text); font-size: 0.7rem;">' +
                '<span style="font-size: 0.55rem; color: var(--dim);">g/yr</span>' +
                '<button class="spending-update-btn" data-field="education" style="font-size: 0.5rem; padding: 2px 8px; background: var(--accent); border: none; border-radius: 3px; cursor: pointer; color: #ffffff;">' + EDIT + '</button>' +
                '</div>' +
                '</div>' +

                '</div>' +
                '</div>';

            // BUDGET SECTION
            var totalIncome = budget ? budget.totalIncome || 0 : 0;
            var totalExpenses = budget ? budget.totalExpenses || 0 : 0;
            var annualSurplus = budget ? budget.annualSurplus || 0 : 0;

            content += '<div style="background: var(--bg2); padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; border: 1px solid var(--border);">' +
                '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 4px;">' +
                '<div style="font-size: 0.7rem; color: var(--accent-light); font-weight: bold;">' + COIN + ' Annual Budget</div>' +
                '</div>' +
                '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;">' +
                '<div style="background: var(--bg); padding: 8px; border-radius: 6px; text-align: center; border: 1px solid var(--border-light);">' +
                '<div style="font-size: 0.5rem; color: var(--dim);">Total Income</div>' +
                '<div style="font-size: 0.9rem; font-weight: bold; color: var(--success);">' + totalIncome + 'g</div>' +
                '</div>' +
                '<div style="background: var(--bg); padding: 8px; border-radius: 6px; text-align: center; border: 1px solid var(--border-light);">' +
                '<div style="font-size: 0.5rem; color: var(--dim);">Total Expenses</div>' +
                '<div style="font-size: 0.9rem; font-weight: bold; color: var(--danger);">' + totalExpenses + 'g</div>' +
                '</div>' +
                '<div style="background: var(--bg); padding: 8px; border-radius: 6px; text-align: center; border: 1px solid var(--border-light);">' +
                '<div style="font-size: 0.5rem; color: var(--dim);">Surplus</div>' +
                '<div style="font-size: 0.9rem; font-weight: bold; color: ' + (annualSurplus >= 0 ? 'var(--success)' : 'var(--danger)') + ';">' + (annualSurplus >= 0 ? '+' : '') + annualSurplus + 'g</div>' +
                '</div>' +
                '</div>' +
                (budget ? _renderBudgetBreakdown(budget) : '') +
                '</div>';

            // ACTION BUTTONS
            content += '<div style="display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 16px;">' +
                '<button class="economy-action-btn" data-action="justice" style="font-size: 0.6rem; padding: 4px 12px; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer; color: var(--text);">' + SHIELD + ' Justice</button>' +
                '<button class="economy-action-btn" data-action="budget" style="font-size: 0.6rem; padding: 4px 12px; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer; color: var(--text);">' + COIN + ' Budget</button>' +
                '<button class="economy-action-btn" data-action="debt" style="font-size: 0.6rem; padding: 4px 12px; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer; color: var(--text);">' + COIN + ' Debt</button>' +
                '<button class="economy-action-btn" data-action="report" style="font-size: 0.6rem; padding: 4px 12px; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer; color: var(--text);">' + CIRCLE + ' Report</button>' +
                '<button class="economy-action-btn" data-action="efficiency" style="font-size: 0.6rem; padding: 4px 12px; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer; color: var(--text);">' + STAR + ' Efficiency</button>' +
                '<button class="economy-action-btn" data-action="employment" style="font-size: 0.6rem; padding: 4px 12px; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer; color: var(--text);">' + PERSON + ' Employment</button>' +
                '<button class="economy-action-btn" data-action="refresh" style="font-size: 0.6rem; padding: 4px 12px; background: var(--bg3); border: 1px solid var(--accent); border-radius: 4px; cursor: pointer; color: var(--accent-light);">' + REFRESH + ' Refresh</button>' +
                '</div>';

            // EMPLOYMENT SUMMARY
            if (employment) {
                content += '<div style="background: var(--bg2); padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; border: 1px solid var(--border);">' +
                    '<div style="font-size: 0.7rem; color: var(--accent-light); font-weight: bold; margin-bottom: 6px;">' + PERSON + ' Employment</div>' +
                    '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 8px;">' +
                    '<div style="background: var(--bg); padding: 6px; border-radius: 4px; text-align: center; border: 1px solid var(--border-light);">' +
                    '<div style="font-size: 0.45rem; color: var(--dim);">Workers</div>' +
                    '<div style="font-size: 0.8rem; font-weight: bold; color: var(--text);">' + employment.totalWorkers + '</div>' +
                    '</div>' +
                    '<div style="background: var(--bg); padding: 6px; border-radius: 4px; text-align: center; border: 1px solid var(--border-light);">' +
                    '<div style="font-size: 0.45rem; color: var(--dim);">Unemployed</div>' +
                    '<div style="font-size: 0.8rem; font-weight: bold; color: ' + (employment.unemployed > 0 ? 'var(--danger-lt)' : 'var(--success)') + ';">' + employment.unemployed + '</div>' +
                    '</div>' +
                    '<div style="background: var(--bg); padding: 6px; border-radius: 4px; text-align: center; border: 1px solid var(--border-light);">' +
                    '<div style="font-size: 0.45rem; color: var(--dim);">Employment Rate</div>' +
                    '<div style="font-size: 0.8rem; font-weight: bold; color: ' + (employment.employmentRate >= 70 ? 'var(--success)' : employment.employmentRate >= 40 ? 'var(--warn)' : 'var(--danger)') + ';">' + employment.employmentRate + '%</div>' +
                    '</div>' +
                    '<div style="background: var(--bg); padding: 6px; border-radius: 4px; text-align: center; border: 1px solid var(--border-light);">' +
                    '<div style="font-size: 0.45rem; color: var(--dim);">Avg Wage</div>' +
                    '<div style="font-size: 0.8rem; font-weight: bold; color: var(--text);">' + employment.averageWage + 'g</div>' +
                    '</div>' +
                    '</div>' +
                    '</div>';
            }

            // EFFICIENCY SCORE
            if (efficiency) {
                var ratingColor = efficiency.efficiency >= 80 ? 'var(--success)' :
                                 efficiency.efficiency >= 60 ? 'var(--accent)' :
                                 efficiency.efficiency >= 40 ? 'var(--warn)' : 'var(--danger)';
                content += '<div style="background: var(--bg2); padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; border: 1px solid var(--border);">' +
                    '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 4px;">' +
                    '<span style="font-size: 0.65rem; color: var(--dim);">' + STAR + ' Efficiency Score</span>' +
                    '<span style="font-size: 0.7rem; font-weight: bold; color: ' + ratingColor + ';">' + efficiency.efficiency + ' — ' + efficiency.rating + '</span>' +
                    '</div>' +
                    '<div style="width: 100%; height: 4px; background: var(--bg3); border-radius: 2px; overflow: hidden; margin-top: 4px;">' +
                    '<div style="width: ' + Math.min(100, efficiency.efficiency) + '%; height: 100%; background: ' + ratingColor + '; border-radius: 2px;"></div>' +
                    '</div>' +
                    '</div>';
            }

            // INFO FOOTER
            content += '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim);">' +
                CIRCLE + ' Settlement economy data is updated annually. Use the inline controls above to adjust taxes and spending.' +
                '</div>';

            content += '</div>';

            container.innerHTML = content;

            _attachActionListeners(container, locationId);

        } finally {
            _rendering = false;
        }
    }

    // =========================================================================
    // 6. RENDER BUDGET BREAKDOWN
    // =========================================================================

    function _renderBudgetBreakdown(budget) {
        var html = '<div style="margin-top: 8px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 0.55rem;">';

        // Income
        html += '<div style="background: var(--bg); padding: 8px; border-radius: 4px; border: 1px solid var(--border-light);">' +
            '<div style="color: var(--accent-light); font-weight: bold; margin-bottom: 4px;">Income</div>';
        var incomeItems = [
            { key: 'taxes', label: 'Taxes', value: budget.income.taxes || 0 },
            { key: 'trade', label: 'Trade Tariffs', value: budget.income.trade || 0 },
            { key: 'industry', label: 'Industry Tax', value: budget.income.industry || 0 },
            { key: 'stateEnterprises', label: 'State Enterprises', value: budget.income.stateEnterprises || 0 },
            { key: 'publicEnterprises', label: 'Public Enterprises', value: budget.income.publicEnterprises || 0 },
            { key: 'other', label: 'Other', value: budget.income.other || 0 }
        ];
        for (var i = 0; i < incomeItems.length; i++) {
            var item = incomeItems[i];
            if (item.value > 0 || i < 3) {
                html += '<div style="display: flex; justify-content: space-between; padding: 2px 0; border-bottom: 1px solid var(--border-light);">' +
                    '<span style="color: var(--dim);">' + item.label + '</span>' +
                    '<span style="color: var(--text);">' + item.value + 'g</span>' +
                    '</div>';
            }
        }
        html += '</div>';

        // Expenses
        html += '<div style="background: var(--bg); padding: 8px; border-radius: 4px; border: 1px solid var(--border-light);">' +
            '<div style="color: var(--danger); font-weight: bold; margin-bottom: 4px;">Expenses</div>';
        var expenseItems = [
            { key: 'maintenance', label: 'Maintenance', value: budget.expenses.maintenance || 0 },
            { key: 'wages', label: 'Wages', value: budget.expenses.wages || 0 },
            { key: 'military', label: 'Military', value: budget.expenses.military || 0 },
            { key: 'education', label: 'Education', value: budget.expenses.education || 0 },
            { key: 'infrastructure', label: 'Infrastructure', value: budget.expenses.infrastructure || 0 },
            { key: 'construction', label: 'Construction', value: budget.expenses.construction || 0 },
            { key: 'governmentSalaries', label: 'Gov Salaries', value: budget.expenses.governmentSalaries || 0 },
            { key: 'other', label: 'Other', value: budget.expenses.other || 0 }
        ];
        for (var i = 0; i < expenseItems.length; i++) {
            var item = expenseItems[i];
            if (item.value > 0 || i < 3) {
                html += '<div style="display: flex; justify-content: space-between; padding: 2px 0; border-bottom: 1px solid var(--border-light);">' +
                    '<span style="color: var(--dim);">' + item.label + '</span>' +
                    '<span style="color: var(--text);">' + item.value + 'g</span>' +
                    '</div>';
            }
        }
        html += '</div>';

        html += '</div>';
        return html;
    }

    // =========================================================================
    // 7. ACTION EVENT LISTENERS
    // =========================================================================

    function _attachActionListeners(container, locationId) {
        // Tax update buttons
        var taxBtns = container.querySelectorAll('.tax-update-btn');
        for (var i = 0; i < taxBtns.length; i++) {
            (function(btn) {
                btn.addEventListener('click', function() {
                    var field = this.dataset.field;
                    var input = null;
                    var updateFn = null;
                    var currentValue = 0;
                    var summary = _getSettlementSummary(locationId);

                    switch (field) {
                        case 'taxRate':
                            input = document.getElementById('taxRateInput');
                            updateFn = _updateTaxRate;
                            currentValue = summary ? summary.taxRate || 10 : 10;
                            break;
                        case 'tradeTariff':
                            input = document.getElementById('tradeTariffInput');
                            updateFn = _updateTradeTariff;
                            currentValue = summary ? summary.tradeTariff || 5 : 5;
                            break;
                        case 'industryTaxRate':
                            input = document.getElementById('industryTaxRateInput');
                            updateFn = _updateIndustryTaxRate;
                            currentValue = summary ? summary.industryTaxRate || 8 : 8;
                            break;
                    }

                    if (!input || !updateFn) return;

                    var newValue = parseInt(input.value);
                    if (isNaN(newValue) || newValue < 0) {
                        _showToast('Please enter a valid value', 'error');
                        return;
                    }

                    // Validate range
                    var max = field === 'taxRate' ? 50 : 30;
                    if (newValue > max) {
                        _showToast('Value must be between 0 and ' + max, 'error');
                        return;
                    }

                    if (newValue === currentValue) {
                        _showToast('No change', 'info');
                        return;
                    }

                    var result = updateFn(locationId, newValue);
                    if (result && result.success) {
                        _showToast(field.replace(/([A-Z])/g, ' $1') + ' updated to ' + newValue + '%', 'success');
                        // Re-render the tab to show updated values
                        renderSettlementEconomy('tab-economy', locationId, _getSettlementSummary(locationId));
                    } else {
                        _showToast('Failed to update: ' + (result ? result.reason : 'Unknown error'), 'error');
                    }
                });
            })(taxBtns[i]);
        }

        // Spending update buttons
        var spendBtns = container.querySelectorAll('.spending-update-btn');
        for (var i = 0; i < spendBtns.length; i++) {
            (function(btn) {
                btn.addEventListener('click', function() {
                    var field = this.dataset.field;
                    var input = null;
                    var updateFn = null;
                    var summary = _getSettlementSummary(locationId);

                    switch (field) {
                        case 'military':
                            input = document.getElementById('militarySpendingInput');
                            updateFn = _updateMilitarySpending;
                            break;
                        case 'infrastructure':
                            input = document.getElementById('infrastructureSpendingInput');
                            updateFn = _updateInfrastructureSpending;
                            break;
                        case 'education':
                            input = document.getElementById('educationSpendingInput');
                            updateFn = _updateEducationSpending;
                            break;
                    }

                    if (!input || !updateFn) return;

                    var newValue = parseInt(input.value);
                    if (isNaN(newValue) || newValue < 0) {
                        _showToast('Please enter a valid amount', 'error');
                        return;
                    }

                    var result = updateFn(locationId, newValue);
                    if (result && result.success) {
                        _showToast(field.charAt(0).toUpperCase() + field.slice(1) + ' spending updated to ' + newValue + 'g', 'success');
                        renderSettlementEconomy('tab-economy', locationId, _getSettlementSummary(locationId));
                    } else {
                        _showToast('Failed to update spending: ' + (result ? result.reason : 'Unknown error'), 'error');
                    }
                });
            })(spendBtns[i]);
        }

        // Action buttons
        var btns = container.querySelectorAll('.economy-action-btn');
        for (var i = 0; i < btns.length; i++) {
            (function(btn) {
                btn.addEventListener('click', function() {
                    var action = this.dataset.action;
                    switch (action) {
                        case 'justice':
                            _openJusticeModal(locationId);
                            break;
                        case 'budget':
                            _openBudgetAllocationModal(locationId);
                            break;
                        case 'debt':
                            _openDebtModal(locationId);
                            break;
                        case 'report':
                            _openFinancialReportModal(locationId);
                            break;
                        case 'efficiency':
                            _openEfficiencyModal(locationId);
                            break;
                        case 'employment':
                            _openEmploymentModal(locationId);
                            break;
                        case 'refresh':
                            renderSettlementEconomy('tab-economy', locationId, _getSettlementSummary(locationId));
                            break;
                    }
                });
            })(btns[i]);
        }
    }

    // =========================================================================
    // 8. JUSTICE MODAL
    // =========================================================================

    function _openJusticeModal(locationId) {
        if (_modalOpen) return;
        _modalOpen = true;

        try {
            var summary = _getSettlementSummary(locationId);
            if (!summary) {
                _showToast('Settlement data not found', 'error');
                _modalOpen = false;
                return;
            }

            var place = _getPlaceById(locationId);
            var CIRCLE = _icon('CIRCLE_DOT');
            var WARNING = _icon('WARNING');

            var crimeRate = summary.crimeRate || 0;
            var severity = summary.justice.severity || 'medium';
            var hasWatch = summary.justice.hasWatch || false;
            var watchSize = summary.justice.watchSize || 0;

            var content = '<div style="padding: 4px;">' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; margin-bottom: 16px; border: 1px solid var(--border);">' +
                '<strong style="color: var(--accent-light);">Justice & Watch Management</strong>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">' + _escapeHtml(place ? place.displayName : 'Unknown') + '</div>' +
                '</div>';

            if (crimeRate > 0.2) {
                content += '<div style="background: rgba(200, 68, 68, 0.15); padding: 8px 12px; border-radius: 6px; margin-bottom: 12px; border-left: 3px solid var(--danger);">' +
                    WARNING + ' Crime rate is high: ' + Math.round(crimeRate * 100) + '%' +
                    '</div>';
            }

            content +=
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent-light); margin-bottom: 4px;">Justice Severity</label>' +
                '<select id="justiceSeverityInput" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);">' +
                '<option value="lenient" ' + (severity === 'lenient' ? 'selected' : '') + '>Lenient</option>' +
                '<option value="medium" ' + (severity === 'medium' ? 'selected' : '') + '>Medium</option>' +
                '<option value="harsh" ' + (severity === 'harsh' ? 'selected' : '') + '>Harsh</option>' +
                '<option value="extreme" ' + (severity === 'extreme' ? 'selected' : '') + '>Extreme</option>' +
                '</select>' +
                '<small style="font-size: 0.5rem; color: var(--dim);">Harsher justice reduces crime but may affect prosperity</small>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">' +
                '<input type="checkbox" id="hasWatchInput" ' + (hasWatch ? 'checked' : '') + ' style="width:16px;height:16px;">' +
                '<span style="font-size: 0.7rem; color: var(--text);">Has Watch / Guard Force</span>' +
                '</label>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent-light); margin-bottom: 4px;">Watch Size</label>' +
                '<input type="number" id="watchSizeInput" value="' + (watchSize || 0) + '" min="0" step="5" style="width: 120px; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);">' +
                '<small style="font-size: 0.5rem; color: var(--dim);">Larger watch reduces crime but costs more</small>' +
                '</div>' +

                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim);">' +
                CIRCLE + ' Current crime rate: ' + Math.round(crimeRate * 100) + '%' +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Justice & Watch Management',
                content: content,
                confirmText: 'Save Changes',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var severity = document.getElementById('justiceSeverityInput').value;
                    var hasWatch = document.getElementById('hasWatchInput').checked;
                    var watchSize = parseInt(document.getElementById('watchSizeInput').value) || 0;

                    var results = [];
                    if (severity !== (summary.justice.severity || 'medium')) {
                        results.push(_updateJusticeSeverity(locationId, severity));
                    }
                    if (hasWatch !== (summary.justice.hasWatch || false) || watchSize !== (summary.justice.watchSize || 0)) {
                        results.push(_updateWatch(locationId, hasWatch, watchSize));
                    }

                    var success = results.every(function(r) { return r && r.success; });
                    if (success) {
                        _showToast('Justice system updated', 'success');
                        _closeTopModal();
                        renderSettlementEconomy('tab-economy', locationId, _getSettlementSummary(locationId));
                    } else {
                        _showToast('Failed to update justice system', 'error');
                    }
                    _modalOpen = false;
                    return true;
                },
                onCancel: function() {
                    _modalOpen = false;
                }
            });

        } catch(e) {
            _modalOpen = false;
            _showToast('Error opening justice modal', 'error');
        }
    }

    // =========================================================================
    // 9. BUDGET ALLOCATION MODAL
    // =========================================================================

    function _openBudgetAllocationModal(locationId) {
        if (_modalOpen) return;
        _modalOpen = true;

        try {
            var summary = _getSettlementSummary(locationId);
            if (!summary) {
                _showToast('Settlement data not found', 'error');
                _modalOpen = false;
                return;
            }

            var place = _getPlaceById(locationId);
            var CIRCLE = _icon('CIRCLE_DOT');
            var data = _getSettlementData(locationId);

            var currentEducationBudget = data ? data.educationBudget || 0 : 0;
            var currentGovSalaryBudget = data ? data.governmentSalaryBudget || 0 : 0;
            var currentInfrastructureBudget = data ? data.infrastructureBudget || 0 : 0;
            var currentMilitaryBudget = data ? data.militaryBudget || 0 : 0;

            var content = '<div style="padding: 4px;">' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; margin-bottom: 16px; border: 1px solid var(--border);">' +
                '<strong style="color: var(--accent-light);">Budget Allocation</strong>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">' + _escapeHtml(place ? place.displayName : 'Unknown') + '</div>' +
                '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 4px;">Available Wealth: ' + summary.wealth + 'g</div>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent-light); margin-bottom: 4px;">Education Budget</label>' +
                '<input type="number" id="educationBudgetInput" value="' + currentEducationBudget + '" min="0" step="5" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);">' +
                '<small style="font-size: 0.5rem; color: var(--dim);">Funds schools and literacy programs</small>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent-light); margin-bottom: 4px;">Government Salary Budget</label>' +
                '<input type="number" id="govSalaryBudgetInput" value="' + currentGovSalaryBudget + '" min="0" step="5" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);">' +
                '<small style="font-size: 0.5rem; color: var(--dim);">Salaries for government officials</small>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent-light); margin-bottom: 4px;">Infrastructure Budget</label>' +
                '<input type="number" id="infrastructureBudgetInput" value="' + currentInfrastructureBudget + '" min="0" step="5" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);">' +
                '<small style="font-size: 0.5rem; color: var(--dim);">Roads, bridges, and public works</small>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent-light); margin-bottom: 4px;">Military Budget</label>' +
                '<input type="number" id="militaryBudgetInput" value="' + currentMilitaryBudget + '" min="0" step="5" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);">' +
                '<small style="font-size: 0.5rem; color: var(--dim);">Defense and security</small>' +
                '</div>' +

                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim);">' +
                CIRCLE + ' Allocations are deducted from wealth. Annual interest on debt is 5%.' +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Budget Allocation',
                content: content,
                confirmText: 'Allocate Budget',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var edu = parseInt(document.getElementById('educationBudgetInput').value) || 0;
                    var gov = parseInt(document.getElementById('govSalaryBudgetInput').value) || 0;
                    var infra = parseInt(document.getElementById('infrastructureBudgetInput').value) || 0;
                    var mil = parseInt(document.getElementById('militaryBudgetInput').value) || 0;

                    var totalAllocation = edu + gov + infra + mil;
                    if (totalAllocation > summary.wealth) {
                        _showToast('Total allocation (' + totalAllocation + 'g) exceeds wealth (' + summary.wealth + 'g)', 'error');
                        return false;
                    }

                    var results = [];
                    if (edu !== currentEducationBudget) {
                        results.push(_allocateEducationBudget(locationId, edu, _getCurrentYear()));
                    }
                    if (gov !== currentGovSalaryBudget) {
                        results.push(_allocateGovernmentSalaryBudget(locationId, gov, _getCurrentYear()));
                    }

                    var success = results.every(function(r) { return r && r.success; });
                    if (success) {
                        _showToast('Budget allocated successfully', 'success');
                        _closeTopModal();
                        renderSettlementEconomy('tab-economy', locationId, _getSettlementSummary(locationId));
                    } else {
                        _showToast('Failed to allocate budget', 'error');
                    }
                    _modalOpen = false;
                    return true;
                },
                onCancel: function() {
                    _modalOpen = false;
                }
            });

        } catch(e) {
            _modalOpen = false;
            _showToast('Error opening budget modal', 'error');
        }
    }

    // =========================================================================
    // 10. DEBT MODAL
    // =========================================================================

    function _openDebtModal(locationId) {
        if (_modalOpen) return;
        _modalOpen = true;

        try {
            var summary = _getSettlementSummary(locationId);
            if (!summary) {
                _showToast('Settlement data not found', 'error');
                _modalOpen = false;
                return;
            }

            var place = _getPlaceById(locationId);
            var CIRCLE = _icon('CIRCLE_DOT');
            var WARNING = _icon('WARNING');
            var debtRatio = _getDebtRatio(locationId);

            var content = '<div style="padding: 4px;">' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; margin-bottom: 16px; border: 1px solid var(--border);">' +
                '<strong style="color: var(--accent-light);">Debt Management</strong>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">' + _escapeHtml(place ? place.displayName : 'Unknown') + '</div>' +
                '</div>' +

                '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center; border: 1px solid var(--border);">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Total Debt</div>' +
                '<div style="font-size: 1.2rem; font-weight: bold; color: ' + (summary.totalDebt > 0 ? 'var(--danger-lt)' : 'var(--success)') + ';">' + summary.totalDebt + 'g</div>' +
                '</div>' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center; border: 1px solid var(--border);">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Debt Ratio</div>' +
                '<div style="font-size: 1.2rem; font-weight: bold; color: ' + (debtRatio > 50 ? 'var(--danger)' : debtRatio > 25 ? 'var(--warn)' : 'var(--success)') + ';">' + debtRatio + '%</div>' +
                '</div>' +
                '</div>';

            if (summary.totalDebt > 0) {
                content +=
                    '<div style="background: rgba(200, 68, 68, 0.15); padding: 12px; border-radius: 8px; margin-bottom: 16px; border-left: 3px solid var(--danger);">' +
                    WARNING + ' Debt incurs 5% annual interest. Currently paying ' + Math.floor(summary.totalDebt * 0.05) + 'g/year in interest.' +
                    '</div>' +

                    '<div class="form-group" style="margin-bottom: 12px;">' +
                    '<label style="display: block; font-size: 0.7rem; color: var(--accent-light); margin-bottom: 4px;">Repay Debt</label>' +
                    '<div style="display: flex; gap: 8px; align-items: center;">' +
                    '<input type="number" id="repayAmount" value="0" min="0" max="' + summary.wealth + '" style="width: 120px; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);">' +
                    '<span style="font-size: 0.55rem; color: var(--dim);">Max: ' + summary.wealth + 'g</span>' +
                    '<button id="repayAllBtn" class="btn" style="font-size: 0.6rem; padding: 4px 10px; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer; color: var(--text);">' + _icon('ARROW_RIGHT') + ' Repay All</button>' +
                    '</div>' +
                    '<small style="font-size: 0.5rem; color: var(--dim);">Using wealth to repay debt reduces interest payments</small>' +
                    '</div>';
            } else {
                content += '<div style="background: rgba(74, 158, 106, 0.15); padding: 12px; border-radius: 8px; margin-bottom: 16px; border-left: 3px solid var(--success);">' +
                    'Settlement has no debt' +
                    '</div>';
            }

            content +=
                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim);">' +
                CIRCLE + ' Wealth: ' + summary.wealth + 'g · Net Worth: ' + summary.netWorth + 'g' +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Debt Management',
                content: content,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {
                    _modalOpen = false;
                },
                onCancel: function() {
                    _modalOpen = false;
                }
            });

            setTimeout(function() {
                var repayAllBtn = document.getElementById('repayAllBtn');
                if (repayAllBtn) {
                    repayAllBtn.addEventListener('click', function() {
                        var repayInput = document.getElementById('repayAmount');
                        if (repayInput) {
                            repayInput.value = Math.min(summary.totalDebt, summary.wealth);
                        }
                    });
                }

                var repayInput = document.getElementById('repayAmount');
                if (repayInput && summary.totalDebt > 0) {
                    var modalFooter = document.querySelector('.modal-footer');
                    if (modalFooter) {
                        var confirmBtn = modalFooter.querySelector('.confirm-btn');
                        if (confirmBtn) {
                            confirmBtn.textContent = 'Repay & Close';
                            confirmBtn.onclick = function() {
                                var amount = parseInt(document.getElementById('repayAmount').value) || 0;
                                if (amount <= 0) {
                                    _showToast('Enter a valid amount to repay', 'error');
                                    return false;
                                }
                                if (amount > summary.wealth) {
                                    _showToast('Not enough wealth to repay ' + amount + 'g', 'error');
                                    return false;
                                }
                                if (amount > summary.totalDebt) {
                                    _showToast('Cannot repay more than total debt (' + summary.totalDebt + 'g)', 'error');
                                    return false;
                                }

                                _confirmDialog(
                                    'Repay ' + amount + 'g of debt? This will reduce your wealth by ' + amount + 'g.',
                                    'Confirm Repayment',
                                    function() {
                                        var wealthResult = _updateWealth(locationId, -amount, 'Debt repayment');
                                        if (wealthResult && wealthResult.success) {
                                            var debtResult = _updateDebt(locationId, -amount, 'Debt repayment');
                                            if (debtResult && debtResult.success) {
                                                _showToast('Repaid ' + amount + 'g of debt', 'success');
                                                _closeTopModal();
                                                renderSettlementEconomy('tab-economy', locationId, _getSettlementSummary(locationId));
                                            }
                                        }
                                        _modalOpen = false;
                                    }
                                );
                                return false;
                            };
                        }
                    }
                }
            }, 150);

        } catch(e) {
            _modalOpen = false;
            _showToast('Error opening debt modal', 'error');
        }
    }

    // =========================================================================
    // 11. FINANCIAL REPORT MODAL
    // =========================================================================

    function _openFinancialReportModal(locationId) {
        if (_modalOpen) return;
        _modalOpen = true;

        try {
            var place = _getPlaceById(locationId);
            var report = _getFinancialReport(locationId, 5);
            if (!report) {
                _showToast('Financial report not available', 'error');
                _modalOpen = false;
                return;
            }

            var summary = report.summary;
            var CIRCLE = _icon('CIRCLE_DOT');
            var COIN = _icon('COIN');

            var content = '<div style="padding: 4px;">' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; margin-bottom: 16px; border: 1px solid var(--border);">' +
                '<strong style="color: var(--accent-light);">' + COIN + ' Financial Report</strong>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">' + _escapeHtml(place ? place.displayName : 'Unknown') + ' — 5 Year Summary</div>' +
                '</div>' +

                '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 16px;">' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center; border: 1px solid var(--border);">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Avg Income</div>' +
                '<div style="font-size: 1rem; font-weight: bold; color: var(--success);">' + summary.averageIncome + 'g</div>' +
                '</div>' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center; border: 1px solid var(--border);">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Avg Expenses</div>' +
                '<div style="font-size: 1rem; font-weight: bold; color: var(--danger);">' + summary.averageExpenses + 'g</div>' +
                '</div>' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center; border: 1px solid var(--border);">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Avg Surplus</div>' +
                '<div style="font-size: 1rem; font-weight: bold; color: ' + (summary.averageSurplus >= 0 ? 'var(--success)' : 'var(--danger)') + ';">' + (summary.averageSurplus >= 0 ? '+' : '') + summary.averageSurplus + 'g</div>' +
                '</div>' +
                '</div>' +

                '<div style="background: var(--bg3); padding: 8px; border-radius: 6px; border: 1px solid var(--border-light);">' +
                '<div style="font-size: 0.6rem; color: var(--dim); margin-bottom: 4px;">Yearly Breakdown</div>';

            for (var i = 0; i < report.reports.length; i++) {
                var r = report.reports[i];
                var isSurplus = r.surplus >= 0;
                content += '<div style="display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px solid var(--border-light); font-size: 0.55rem;">' +
                    '<span style="color: var(--dim);">' + r.year + '</span>' +
                    '<span style="color: var(--text);">Income: ' + r.income + 'g</span>' +
                    '<span style="color: var(--text);">Expenses: ' + r.expenses + 'g</span>' +
                    '<span style="color: ' + (isSurplus ? 'var(--success)' : 'var(--danger)') + ';">Surplus: ' + (isSurplus ? '+' : '') + r.surplus + 'g</span>' +
                    '</div>';
            }

            content +=
                '</div>' +
                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim); margin-top: 12px;">' +
                CIRCLE + ' Based on current economic conditions. Historical data is simulated.' +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Financial Report',
                content: content,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {
                    _modalOpen = false;
                },
                onCancel: function() {
                    _modalOpen = false;
                }
            });

        } catch(e) {
            _modalOpen = false;
            _showToast('Error opening financial report', 'error');
        }
    }

    // =========================================================================
    // 12. EFFICIENCY MODAL
    // =========================================================================

    function _openEfficiencyModal(locationId) {
        if (_modalOpen) return;
        _modalOpen = true;

        try {
            var place = _getPlaceById(locationId);
            var score = _getEfficiencyScore(locationId);
            if (!score) {
                _showToast('Efficiency score not available', 'error');
                _modalOpen = false;
                return;
            }

            var CIRCLE = _icon('CIRCLE_DOT');
            var STAR = _icon('STAR_4');

            var ratingColor = score.efficiency >= 80 ? 'var(--success)' :
                             score.efficiency >= 60 ? 'var(--accent)' :
                             score.efficiency >= 40 ? 'var(--warn)' :
                             score.efficiency >= 20 ? 'var(--danger)' : 'var(--danger-dark)';

            var content = '<div style="padding: 4px;">' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; margin-bottom: 16px; border: 1px solid var(--border);">' +
                '<strong style="color: var(--accent-light);">' + STAR + ' Government Efficiency</strong>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">' + _escapeHtml(place ? place.displayName : 'Unknown') + '</div>' +
                '</div>' +

                '<div style="text-align: center; padding: 20px; background: var(--bg3); border-radius: 8px; margin-bottom: 16px; border: 1px solid var(--border);">' +
                '<div style="font-size: 3rem; font-weight: bold; color: ' + ratingColor + ';">' + score.efficiency + '</div>' +
                '<div style="font-size: 1rem; font-weight: bold; color: ' + ratingColor + ';">' + score.rating + '</div>' +
                '</div>' +

                '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 6px; border: 1px solid var(--border);">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Income</div>' +
                '<div style="font-size: 1rem; font-weight: bold; color: var(--text);">' + score.income + 'g</div>' +
                '</div>' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 6px; border: 1px solid var(--border);">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Expenses</div>' +
                '<div style="font-size: 1rem; font-weight: bold; color: var(--danger);">' + score.expenses + 'g</div>' +
                '</div>' +
                '</div>' +

                '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 6px; border: 1px solid var(--border);">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Population</div>' +
                '<div style="font-size: 1rem; font-weight: bold; color: var(--text);">' + score.population + '</div>' +
                '</div>' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 6px; border: 1px solid var(--border);">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Income per Capita</div>' +
                '<div style="font-size: 1rem; font-weight: bold; color: var(--text);">' + score.incomePerCapita + 'g</div>' +
                '</div>' +
                '</div>' +

                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim);">' +
                CIRCLE + ' Efficiency score measures how effectively the settlement generates income relative to expenses.' +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Efficiency Score',
                content: content,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {
                    _modalOpen = false;
                },
                onCancel: function() {
                    _modalOpen = false;
                }
            });

        } catch(e) {
            _modalOpen = false;
            _showToast('Error opening efficiency modal', 'error');
        }
    }

    // =========================================================================
    // 13. EMPLOYMENT MODAL
    // =========================================================================

    function _openEmploymentModal(locationId) {
        if (_modalOpen) return;
        _modalOpen = true;

        try {
            var place = _getPlaceById(locationId);
            var employment = _getSettlementEmployment(locationId);
            if (!employment) {
                _showToast('Employment data not available', 'error');
                _modalOpen = false;
                return;
            }

            var population = _getLocationPopulationCount(locationId);
            var adults = Math.max(0, Math.floor(population * 0.6));
            var CIRCLE = _icon('CIRCLE_DOT');
            var PERSON = _icon('PERSON');

            var content = '<div style="padding: 4px;">' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; margin-bottom: 16px; border: 1px solid var(--border);">' +
                '<strong style="color: var(--accent-light);">' + PERSON + ' Employment Report</strong>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">' + _escapeHtml(place ? place.displayName : 'Unknown') + '</div>' +
                '</div>' +

                '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 16px;">' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center; border: 1px solid var(--border);">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Total Workers</div>' +
                '<div style="font-size: 1.2rem; font-weight: bold; color: var(--text);">' + employment.totalWorkers + '</div>' +
                '</div>' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center; border: 1px solid var(--border);">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Unemployed</div>' +
                '<div style="font-size: 1.2rem; font-weight: bold; color: ' + (employment.unemployed > 0 ? 'var(--danger-lt)' : 'var(--success)') + ';">' + employment.unemployed + '</div>' +
                '</div>' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center; border: 1px solid var(--border);">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Employment Rate</div>' +
                '<div style="font-size: 1.2rem; font-weight: bold; color: ' + (employment.employmentRate >= 70 ? 'var(--success)' : employment.employmentRate >= 40 ? 'var(--warn)' : 'var(--danger)') + ';">' + employment.employmentRate + '%</div>' +
                '</div>' +
                '</div>' +

                '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; border: 1px solid var(--border);">' +
                '<div style="font-size: 0.65rem; color: var(--accent-light); margin-bottom: 6px;">Employment Breakdown</div>' +
                '<div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid var(--border-light); font-size: 0.6rem;">' +
                '<span style="color: var(--dim);">State Employed</span>' +
                '<span style="color: var(--text);">' + employment.stateEmployed + '</span>' +
                '</div>' +
                '<div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid var(--border-light); font-size: 0.6rem;">' +
                '<span style="color: var(--dim);">Private Employed</span>' +
                '<span style="color: var(--text);">' + employment.privateEmployed + '</span>' +
                '</div>' +
                '<div style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 0.6rem;">' +
                '<span style="color: var(--dim);">Unemployed</span>' +
                '<span style="color: var(--danger-lt);">' + employment.unemployed + '</span>' +
                '</div>' +
                '</div>' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; border: 1px solid var(--border);">' +
                '<div style="font-size: 0.65rem; color: var(--accent-light); margin-bottom: 6px;">Wage Information</div>' +
                '<div style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 0.6rem;">' +
                '<span style="color: var(--dim);">Average Wage</span>' +
                '<span style="color: var(--text);">' + employment.averageWage + 'g/year</span>' +
                '</div>' +
                '<div style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 0.6rem;">' +
                '<span style="color: var(--dim);">Adult Population</span>' +
                '<span style="color: var(--text);">' + adults + '</span>' +
                '</div>' +
                '</div>' +
                '</div>' +

                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim);">' +
                CIRCLE + ' Employment data is calculated from all enterprises in this location. Create more enterprises to increase employment.' +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Employment Report',
                content: content,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {
                    _modalOpen = false;
                },
                onCancel: function() {
                    _modalOpen = false;
                }
            });

        } catch(e) {
            _modalOpen = false;
            _showToast('Error opening employment modal', 'error');
        }
    }

    // =========================================================================
    // 14. REGISTER WITH TAB SYSTEM
    // =========================================================================

    if (typeof window.registerTabRenderer === 'function') {
        window.registerTabRenderer('economy', renderSettlementEconomy, true);
    }

    // =========================================================================
    // 15. EXPORTS
    // =========================================================================

    window.renderSettlementEconomy = renderSettlementEconomy;
    window._renderSettlementEconomy = renderSettlementEconomy;

})();