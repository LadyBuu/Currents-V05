/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT TAB UI (settlementTab.js)
 * =============================================================================
 * 
 * UPDATED: Full integration with SettlementState, SettlementCommands,
 *          SettlementQueries, SettlementEconomy, SettlementFeatures,
 *          SettlementRanks, and EducationSystem
 * 
 * FEATURES:
 * - Settlement overview with rank, prosperity, wealth, population
 * - Settlement features management (view/add/remove)
 * - Settlement specialization display
 * - Trade hub status
 * - Industrial development
 * - Settlement upgrade management
 * - Crime and justice overview
 * - Education and literacy stats
 * - Educational institutions viewer (read-only)
 * - Annual processing
 * - Budget allocation display
 * - Public enterprise display
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARD
    // =========================================================================

    var _rendering = false;
    var _processingAction = false;

    // =========================================================================
    // 2. SVG ICON HELPERS
    // =========================================================================

    function _getIcon(name, fallback) {
        if (typeof window.Icons !== 'undefined' && window.Icons[name]) {
            return window.Icons[name];
        }
        return fallback || '●';
    }

    function _getCheckIcon() { return _getIcon('CHECK', '✓'); }
    function _getCrossIcon() { return _getIcon('X', '✗'); }
    function _getCircleIcon() { return _getIcon('CIRCLE', '●'); }
    function _getHomeIcon() { return _getIcon('HOME', '⌂'); }
    function _getWarningIcon() { return _getIcon('WARNING', '⚠'); }
    function _getRefreshIcon() { return _getIcon('REFRESH', '⟳'); }
    function _getSearchIcon() { return _getIcon('SEARCH', '⌕'); }
    function _getStarIcon() { return _getIcon('STAR', '★'); }
    function _getGearIcon() { return _getIcon('GEAR', '⚙'); }
    function _getBookIcon() { return _getIcon('BOOK', '📚'); }
    function _getShieldIcon() { return _getIcon('SHIELD', '🛡'); }
    function _getSwordIcon() { return _getIcon('SWORD', '⚔'); }
    function _getCrownIcon() { return _getIcon('CROWN', '👑'); }
    function _getPersonIcon() { return _getIcon('PERSON', '👤'); }
    function _getFlagIcon() { return _getIcon('FLAG', '🏴'); }
    function _getCoinIcon() { return _getIcon('COIN', '♢'); }

    // =========================================================================
    // 3. DEPENDENCY WRAPPERS
    // =========================================================================

    function _escapeHtml(str) {
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function _showToast(message, type) {
        if (typeof window._showToast === 'function') return window._showToast(message, type);
        if (typeof window.showToast === 'function') return window.showToast(message, type);
        console.log('[' + (type || 'info') + '] ' + message);
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

    function _getCharacterById(id) {
        return typeof window.getCharacterById === 'function' ? window.getCharacterById(id) : null;
    }

    function _getCharacters() {
        return typeof window.getCharacters === 'function' ? window.getCharacters() : [];
    }

    function _getLocationPopulationCount(locationId) {
        return typeof window.getLocationPopulationCount === 'function' ? 
            window.getLocationPopulationCount(locationId) : 0;
    }

    function _getRoleById(id) {
        if (typeof window.getRoleById === 'function') return window.getRoleById(id);
        return null;
    }

    // =========================================================================
    // 4. SETTLEMENT SYSTEM WRAPPERS
    // =========================================================================

    // State
    var _state = window.SettlementState;
    var _commands = window.SettlementCommands;
    var _queries = window.SettlementQueries;
    var _economy = window.SettlementEconomy;
    var _features = window.SettlementFeatures;
    var _ranks = window.SettlementRanks;

    function _getSettlementSummary(locationId) {
        return _queries ? _queries.getSettlementSummary(locationId) : null;
    }

    function _getSettlementFeatures(locationId) {
        return _queries ? _queries.getSettlementFeatures(locationId) : [];
    }

    function _getAllSettlementFeatures() {
        return _features ? _features.getAllFeatures() : [];
    }

    function _getFeatureCategories() {
        return _features ? _features.getFeatureCategories() : {};
    }

    function _getSettlementRank(locationId) {
        return _ranks ? _ranks.getSettlementRank(locationId) : null;
    }

    function _canUpgrade(locationId) {
        return _ranks ? _ranks.canUpgrade(locationId) : false;
    }

    function _getUpgradeRequirements(locationId) {
        return _ranks ? _ranks.getUpgradeRequirements(locationId) : null;
    }

    function _calculateTradeStatus(locationId) {
        return _queries ? _queries.getTradeStatus(locationId) : null;
    }

    function _calculateCrimeRate(locationId) {
        return _economy ? _economy.calculateCrimeRate(locationId) : 0.05;
    }

    function _calculateProsperity(locationId) {
        return _economy ? _economy.calculateProsperity(locationId) : 50;
    }

    function _getSettlementLiteracyStats(locationId) {
        return _queries ? _queries.getSettlementLiteracyStats(locationId) : null;
    }

    function _getSettlementEducationStats(locationId) {
        return _queries ? _queries.getSettlementEducationStats(locationId) : null;
    }

    function _getSettlementSchools(locationId) {
        return _queries ? _queries.getSettlementSchools(locationId, {}) : [];
    }

    function _getSettlementBudgetSummary(locationId) {
        return _queries ? _queries.getSettlementBudgetSummary(locationId) : null;
    }

    function _getPublicEnterpriseSummary(locationId) {
        return _queries ? _queries.getPublicEnterpriseSummary(locationId) : null;
    }

    function _getSettlementApprenticeshipDensity(locationId) {
        return _queries ? _queries.getSettlementApprenticeshipDensity(locationId) : null;
    }

    function _getSettlementRoleStats(locationId) {
        return _queries ? _queries.getSettlementRoleStats(locationId) : null;
    }

    function _processAnnualSettlementUpdate(locationId) {
        return _commands ? _commands.processAnnualSettlementUpdate(locationId) : null;
    }

    // =========================================================================
    // 5. MODAL DELEGATION
    // =========================================================================

    function _openSettlementDetailsModal(locationId, onRefresh) {
        if (typeof window.openSettlementDetailsModal === 'function') {
            return window.openSettlementDetailsModal(locationId, onRefresh);
        }
        _showToast('Settlement details modal not available', 'error');
    }

    function _openManageFeaturesModal(locationId, onSuccess) {
        if (typeof window.openManageFeaturesModal === 'function') {
            return window.openManageFeaturesModal(locationId, onSuccess);
        }
        _showToast('Manage features modal not available', 'error');
    }

    function _openUpgradeSettlementModal(locationId, onSuccess) {
        if (typeof window.openUpgradeSettlementModal === 'function') {
            return window.openUpgradeSettlementModal(locationId, onSuccess);
        }
        _showToast('Upgrade settlement modal not available', 'error');
    }

    function _openSettlementSpecializationModal(locationId, onSuccess) {
        if (typeof window.openSettlementSpecializationModal === 'function') {
            return window.openSettlementSpecializationModal(locationId, onSuccess);
        }
        _showToast('Specialization modal not available', 'error');
    }

    function _openSettlementBudgetModal(locationId) {
        if (typeof window.openSettlementBudgetModal === 'function') {
            return window.openSettlementBudgetModal(locationId);
        }
        _showToast('Budget modal not available', 'error');
    }

    function _openEmploymentManagementModal(locationId) {
        if (typeof window.openEmploymentManagementModal === 'function') {
            return window.openEmploymentManagementModal(locationId);
        }
        _showToast('Employment modal not available', 'error');
    }

    function _openStateEnterpriseManagementModal(locationId, onSuccess) {
        if (typeof window.openStateEnterpriseManagementModal === 'function') {
            return window.openStateEnterpriseManagementModal(locationId, onSuccess);
        }
        _showToast('State enterprise modal not available', 'error');
    }

    function _openSettlementRolesModal(locationId) {
        if (typeof window.openSettlementRolesModal === 'function') {
            return window.openSettlementRolesModal(locationId);
        }
        _showToast('Roles modal not available', 'error');
    }

    function _openSettlementApprenticeshipsModal(locationId) {
        if (typeof window.openSettlementApprenticeshipsModal === 'function') {
            return window.openSettlementApprenticeshipsModal(locationId);
        }
        _showToast('Apprenticeships modal not available', 'error');
    }

    function _openSettlementEducationModal(locationId) {
        if (typeof window.openSettlementEducationModal === 'function') {
            return window.openSettlementEducationModal(locationId);
        }
        _showToast('Education modal not available', 'error');
    }

    function _openTaxRateManagementModal(locationId, onSuccess) {
        if (typeof window.openTaxRateManagementModal === 'function') {
            return window.openTaxRateManagementModal(locationId, onSuccess);
        }
        _showToast('Tax rate modal not available', 'error');
    }

    function _openJusticeManagementModal(locationId, onSuccess) {
        if (typeof window.openJusticeManagementModal === 'function') {
            return window.openJusticeManagementModal(locationId, onSuccess);
        }
        _showToast('Justice modal not available', 'error');
    }

    // =========================================================================
    // 6. MAIN RENDER FUNCTION
    // =========================================================================

    function renderSettlementTab(containerId, placeId, onRefresh) {
        if (_rendering) return;
        _rendering = true;

        try {
            var container = document.getElementById(containerId);
            if (!container) return;

            var place = _getPlaceById(placeId);
            if (!place) {
                container.innerHTML = '<div class="empty-state">' + _getHomeIcon() + ' Location not found</div>';
                return;
            }

            // Get all settlement data using the new system
            var settlement = _getSettlementSummary(placeId);
            if (!settlement) {
                container.innerHTML = `
                    <div class="empty-state" style="padding: 40px; text-align: center; color: var(--dim);">
                        <div style="font-size: 3rem; margin-bottom: 16px;">${_getGearIcon()}</div>
                        <h3>No Settlement Data</h3>
                        <p style="font-size: 0.8rem;">This location has not been initialized as a settlement yet.</p>
                        <button id="initSettlementBtn" class="btn primary" style="margin-top: 16px;">
                            ${_getCheckIcon()} Initialize Settlement
                        </button>
                    </div>
                `;

                var initBtn = document.getElementById('initSettlementBtn');
                if (initBtn) {
                    initBtn.onclick = function() {
                        if (typeof window.getOrCreateSettlementData === 'function') {
                            window.getOrCreateSettlementData(placeId);
                            _showToast(_getCheckIcon() + ' Settlement initialized!', 'success');
                            if (onRefresh) onRefresh();
                        }
                    };
                }
                return;
            }

            // Get additional data
            var literacyStats = _getSettlementLiteracyStats(placeId);
            var educationStats = _getSettlementEducationStats(placeId);
            var schools = _getSettlementSchools(placeId);
            var budgetSummary = _getSettlementBudgetSummary(placeId);
            var publicEnterpriseSummary = _getPublicEnterpriseSummary(placeId);
            var apprenticeshipDensity = _getSettlementApprenticeshipDensity(placeId);
            var roleStats = _getSettlementRoleStats(placeId);
            var tradeStatus = _calculateTradeStatus(placeId);
            var crimeRate = _calculateCrimeRate(placeId);
            var prosperity = _calculateProsperity(placeId);
            var canUpgrade = _canUpgrade(placeId);
            var upgradeReqs = _getUpgradeRequirements(placeId);

            // Build the settlement tab HTML
            var html = `
                <div class="settlement-tab" style="padding: 16px;">
                    ${renderHeader(settlement, canUpgrade, upgradeReqs)}
                    ${renderOverview(settlement, prosperity)}
                    ${renderStats(settlement, literacyStats, educationStats, crimeRate)}
                    ${renderBudgetAllocation(budgetSummary)}
                    ${renderPublicEnterprises(publicEnterpriseSummary)}
                    ${renderEducationInstitutions(schools, educationStats)}
                    ${renderSettlementFeatures(placeId, settlement)}
                    ${renderTradeIndustry(tradeStatus)}
                    ${renderRolesAndApprenticeships(roleStats, apprenticeshipDensity)}
                    ${renderActions(settlement, placeId, canUpgrade, upgradeReqs)}
                </div>
            `;

            container.innerHTML = html;
            attachSettlementTabHandlers(placeId, onRefresh);

        } finally {
            _rendering = false;
        }
    }

    // =========================================================================
    // 7. SECTION RENDERERS
    // =========================================================================

    function renderHeader(settlement, canUpgrade, upgradeReqs) {
        var rankName = settlement.rank ? settlement.rank.name : 'Unknown';
        var rankIcon = settlement.rank && settlement.rank.icon ? settlement.rank.icon : _getHomeIcon();

        return `
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 20px;">
                <div>
                    <h2 style="margin: 0;">${_getHomeIcon()} ${_escapeHtml(settlement.name)}</h2>
                    <div style="font-size: 0.7rem; color: var(--dim); margin-top: 4px;">
                        ${rankIcon} ${_escapeHtml(rankName)} • ${settlement.population || 0} population • Founded ${settlement.foundedYear || 'Unknown'}
                        ${settlement.lastUpgraded ? ' • Last upgraded: ' + settlement.lastUpgraded : ''}
                    </div>
                </div>
                <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                    <span style="background: var(--accent); color: var(--bg); padding: 4px 12px; border-radius: 12px; font-size: 0.7rem; font-weight: bold;">
                        ${rankIcon} ${_escapeHtml(rankName)}
                    </span>
                    ${canUpgrade ? `
                        <button id="upgradeBtn" class="btn success" style="font-size: 0.7rem; padding: 4px 12px;">
                            ${_getStarIcon()} Upgrade Available!
                        </button>
                    ` : ''}
                    <button id="detailsBtn" class="btn small" style="font-size: 0.7rem; padding: 4px 10px;">
                        ${_getCircleIcon()} Details
                    </button>
                </div>
            </div>
        `;
    }

    function renderOverview(settlement, prosperity) {
        var prosperityColor = prosperity >= 70 ? 'var(--success)' : 
                           prosperity >= 40 ? 'var(--accent)' : 'var(--warn)';
        
        var prosperityIcon = prosperity >= 70 ? _getStarIcon() :
                           prosperity >= 40 ? _getCheckIcon() : _getWarningIcon();

        var wealth = settlement.wealth || 0;
        var debt = settlement.totalDebt || 0;
        var netWorth = wealth - debt;
        var netWorthColor = netWorth >= 0 ? 'var(--success)' : 'var(--danger)';

        return `
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 12px; margin-bottom: 20px;">
                <div class="overview-card" style="background: var(--bg2); padding: 16px; border-radius: 8px; border-left: 4px solid ${prosperityColor};">
                    <div style="font-size: 0.6rem; color: var(--dim); text-transform: uppercase; letter-spacing: 0.5px;">${prosperityIcon} Prosperity</div>
                    <div style="font-size: 1.5rem; font-weight: bold; color: ${prosperityColor};">${prosperity}%</div>
                    <div style="font-size: 0.75rem; color: var(--dim);">${settlement.prosperity ? settlement.prosperity.description : 'Stable'}</div>
                </div>
                <div class="overview-card" style="background: var(--bg2); padding: 16px; border-radius: 8px; border-left: 4px solid var(--accent);">
                    <div style="font-size: 0.6rem; color: var(--dim); text-transform: uppercase; letter-spacing: 0.5px;">${_getCoinIcon()} Wealth</div>
                    <div style="font-size: 1.5rem; font-weight: bold; color: var(--accent);">${wealth.toLocaleString()} <span style="font-size: 0.8rem; font-weight: normal;">gold</span></div>
                    <div style="font-size: 0.75rem; color: ${netWorthColor};">Net: ${netWorth.toLocaleString()} gold</div>
                </div>
                <div class="overview-card" style="background: var(--bg2); padding: 16px; border-radius: 8px; border-left: 4px solid ${debt > 0 ? 'var(--danger)' : 'var(--success)'};">
                    <div style="font-size: 0.6rem; color: var(--dim); text-transform: uppercase; letter-spacing: 0.5px;">${_getShieldIcon()} Debt</div>
                    <div style="font-size: 1.5rem; font-weight: bold; color: ${debt > 0 ? 'var(--danger)' : 'var(--success)'};">${debt.toLocaleString()} <span style="font-size: 0.8rem; font-weight: normal;">gold</span></div>
                    <div style="font-size: 0.75rem; color: var(--dim);">${debt > 0 ? 'Interest: ' + Math.floor(debt * 0.05) + 'g/year' : 'Debt-free'}</div>
                </div>
                <div class="overview-card" style="background: var(--bg2); padding: 16px; border-radius: 8px; border-left: 4px solid var(--accent);">
                    <div style="font-size: 0.6rem; color: var(--dim); text-transform: uppercase; letter-spacing: 0.5px;">${_getPersonIcon()} Population</div>
                    <div style="font-size: 1.5rem; font-weight: bold;">${settlement.population || 0}</div>
                    <div style="font-size: 0.75rem; color: var(--dim);">${settlement.rank ? settlement.rank.name : 'Unknown'}</div>
                </div>
            </div>
        `;
    }

    function renderStats(settlement, literacyStats, educationStats, crimeRate) {
        var literacyColor = literacyStats && literacyStats.literacyRate > 70 ? 'var(--success)' :
                           literacyStats && literacyStats.literacyRate > 40 ? 'var(--accent)' : 'var(--warn)';
        
        var crimeColor = crimeRate < 0.1 ? 'var(--success)' : 
                       crimeRate < 0.2 ? 'var(--accent)' : 
                       crimeRate < 0.3 ? 'var(--warn)' : 'var(--danger)';

        var taxRate = settlement.taxRate || 10;
        var tradeTariff = settlement.tradeTariff || 5;
        var industryTax = settlement.industryTaxRate || 8;

        return `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-bottom: 20px;">
                <div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 0.5rem; color: var(--dim); text-transform: uppercase;">${_getBookIcon()} Literacy</div>
                    <div style="font-size: 1.2rem; font-weight: bold; color: ${literacyColor};">
                        ${literacyStats ? literacyStats.literacyRate.toFixed(1) : '0'}%
                    </div>
                    <div style="font-size: 0.6rem; color: var(--dim);">
                        ${literacyStats ? literacyStats.literateCount : 0} literate
                    </div>
                </div>
                <div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 0.5rem; color: var(--dim); text-transform: uppercase;">${_getHomeIcon()} Schools</div>
                    <div style="font-size: 1.2rem; font-weight: bold;">${educationStats ? educationStats.totalInstitutions : 0}</div>
                    <div style="font-size: 0.6rem; color: var(--dim);">
                        ${educationStats ? educationStats.totalStudents : 0} students
                    </div>
                </div>
                <div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 0.5rem; color: var(--dim); text-transform: uppercase;">${_getCircleIcon()} Crime</div>
                    <div style="font-size: 1.2rem; font-weight: bold; color: ${crimeColor};">
                        ${(crimeRate * 100).toFixed(1)}%
                    </div>
                    <div style="font-size: 0.6rem; color: var(--dim);">
                        ${settlement.justice && settlement.justice.hasWatch ? 'Watch: ' + (settlement.justice.watchSize || 0) : 'No watch'}
                    </div>
                </div>
                <div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 0.5rem; color: var(--dim); text-transform: uppercase;">${_getGearIcon()} Rates</div>
                    <div style="font-size: 0.9rem; font-weight: bold;">Tax: ${taxRate}%</div>
                    <div style="font-size: 0.55rem; color: var(--dim);">Tariff: ${tradeTariff}% • Ind: ${industryTax}%</div>
                </div>
                ${settlement.specializationRoleId ? `
                    <div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center; grid-column: span 2;">
                        <div style="font-size: 0.5rem; color: var(--dim); text-transform: uppercase;">${_getStarIcon()} Specialization</div>
                        <div style="font-size: 0.9rem; font-weight: bold; color: var(--accent);">
                            ${_escapeHtml(settlement.specializationRoleId)}
                        </div>
                        <div style="font-size: 0.6rem; color: var(--dim);">
                            Income Bonus: +${Math.round((_economy ? _economy.calculateSpecializationIncomeBonus(settlement.id) : 1) * 100 - 100)}%
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }

    function renderBudgetAllocation(budgetSummary) {
        if (!budgetSummary || budgetSummary.budgetAllocation.total === 0) {
            return `
                <div style="background: var(--bg2); padding: 12px 16px; border-radius: 8px; margin-bottom: 20px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div style="font-size: 0.7rem; font-weight: bold;">${_getCoinIcon()} Budget Allocation</div>
                        <span style="font-size: 0.55rem; color: var(--dim);">No allocations made</span>
                    </div>
                </div>
            `;
        }

        var allocation = budgetSummary.budgetAllocation;
        var total = allocation.total || 1;

        return `
            <div style="background: var(--bg2); padding: 12px 16px; border-radius: 8px; margin-bottom: 20px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <div style="font-size: 0.7rem; font-weight: bold;">${_getCoinIcon()} Budget Allocation (${allocation.year})</div>
                    <span style="font-size: 0.55rem; color: var(--dim);">Total: ${total} gold</span>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 8px;">
                    ${allocation.education > 0 ? `
                        <div style="background: var(--bg); padding: 6px 10px; border-radius: 4px; text-align: center; font-size: 0.55rem;">
                            <div style="color: var(--dim);">${_getBookIcon()} Education</div>
                            <div style="font-weight: bold;">${allocation.education} (${Math.round(allocation.education / total * 100)}%)</div>
                        </div>
                    ` : ''}
                    ${allocation.governmentSalaries > 0 ? `
                        <div style="background: var(--bg); padding: 6px 10px; border-radius: 4px; text-align: center; font-size: 0.55rem;">
                            <div style="color: var(--dim);">${_getCrownIcon()} Government</div>
                            <div style="font-weight: bold;">${allocation.governmentSalaries} (${Math.round(allocation.governmentSalaries / total * 100)}%)</div>
                        </div>
                    ` : ''}
                    ${allocation.infrastructure > 0 ? `
                        <div style="background: var(--bg); padding: 6px 10px; border-radius: 4px; text-align: center; font-size: 0.55rem;">
                            <div style="color: var(--dim);">${_getGearIcon()} Infrastructure</div>
                            <div style="font-weight: bold;">${allocation.infrastructure} (${Math.round(allocation.infrastructure / total * 100)}%)</div>
                        </div>
                    ` : ''}
                    ${allocation.military > 0 ? `
                        <div style="background: var(--bg); padding: 6px 10px; border-radius: 4px; text-align: center; font-size: 0.55rem;">
                            <div style="color: var(--dim);">${_getSwordIcon()} Military</div>
                            <div style="font-weight: bold;">${allocation.military} (${Math.round(allocation.military / total * 100)}%)</div>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    function renderPublicEnterprises(publicEnterpriseSummary) {
        if (!publicEnterpriseSummary || publicEnterpriseSummary.total === 0) {
            return '';
        }

        return `
            <div style="background: var(--bg2); padding: 12px 16px; border-radius: 8px; margin-bottom: 20px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <div style="font-size: 0.7rem; font-weight: bold;">${_getGearIcon()} Public Enterprises (${publicEnterpriseSummary.total})</div>
                    <span style="font-size: 0.55rem; color: ${publicEnterpriseSummary.totalProfit >= 0 ? 'var(--success)' : 'var(--danger)'};">
                        Total Profit: ${publicEnterpriseSummary.totalProfit >= 0 ? '+' : ''}${publicEnterpriseSummary.totalProfit} gold
                    </span>
                </div>
                <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                    ${publicEnterpriseSummary.enterprises.slice(0, 5).map(function(e) {
                        var profitColor = e.profit >= 0 ? 'var(--success)' : 'var(--danger)';
                        return `
                            <span style="font-size: 0.55rem; background: var(--bg); padding: 2px 8px; border-radius: 4px; border-left: 2px solid ${profitColor};">
                                ${_escapeHtml(e.name)} (${e.workers} workers, ${e.profit >= 0 ? '+' : ''}${e.profit}g)
                            </span>
                        `;
                    }).join('')}
                    ${publicEnterpriseSummary.total > 5 ? `<span style="font-size: 0.55rem; color: var(--dim);">+${publicEnterpriseSummary.total - 5} more</span>` : ''}
                </div>
            </div>
        `;
    }

    function renderEducationInstitutions(schools, educationStats) {
        if (!schools || schools.length === 0) {
            return `
                <div style="background: var(--bg2); padding: 12px 16px; border-radius: 8px; margin-bottom: 20px;">
                    <div style="font-size: 0.7rem; font-weight: bold; margin-bottom: 8px;">${_getBookIcon()} Educational Institutions</div>
                    <div style="text-align: center; padding: 12px; color: var(--dim); font-size: 0.7rem;">
                        ${_getCrossIcon()} No educational institutions in this location.
                        ${educationStats && educationStats.educationBudget > 0 ? ' (Budget: ' + educationStats.educationBudget + 'g allocated)' : ''}
                    </div>
                </div>
            `;
        }

        var html = `
            <div style="background: var(--bg2); padding: 12px 16px; border-radius: 8px; margin-bottom: 20px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <div style="font-size: 0.7rem; font-weight: bold;">${_getBookIcon()} Educational Institutions (${schools.length})</div>
                    <span style="font-size: 0.55rem; color: var(--dim);">
                        ${educationStats ? educationStats.totalStudents + ' students · ' + educationStats.totalTeachers + ' teachers' : ''}
                        ${educationStats && educationStats.educationBudget > 0 ? ' · Budget: ' + educationStats.educationBudget + 'g' : ''}
                    </span>
                </div>
                <div style="display: flex; flex-direction: column; gap: 8px;">
        `;

        for (var i = 0; i < schools.length; i++) {
            var s = schools[i];
            var capacityColor = s.capacityUsed > 90 ? 'var(--warn)' : 
                               s.capacityUsed > 70 ? 'var(--accent)' : 'var(--success)';
            
            html += `
                <div style="background: var(--bg); padding: 8px 12px; border-radius: 6px; border-left: 3px solid ${capacityColor};">
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 4px;">
                        <div>
                            <span style="font-weight: bold; font-size: 0.75rem;">${_escapeHtml(s.name)}</span>
                            <span style="font-size: 0.5rem; color: var(--dim); margin-left: 6px;">${_escapeHtml(s.type)}</span>
                            ${s.isSpecialized ? `<span style="font-size: 0.5rem; color: var(--accent);">${_getStarIcon()} Specialized</span>` : ''}
                        </div>
                        <div style="font-size: 0.55rem; color: var(--dim); display: flex; gap: 8px;">
                            <span>${_getPersonIcon()} ${s.studentCount}/${s.capacity}</span>
                            <span style="color: ${capacityColor};">${s.capacityUsed}%</span>
                            <span>${_getStarIcon()} ${s.reputation}</span>
                            <span>${s.ownershipType === 'public' ? '🏛' : '🏠'}</span>
                        </div>
                    </div>
                    ${s.taughtRoles && s.taughtRoles.length > 0 ? `
                        <div style="font-size: 0.5rem; color: var(--dim); margin-top: 4px;">
                            Teaches: ${s.taughtRoles.map(function(r) { return _escapeHtml(r); }).join(', ')}
                        </div>
                    ` : ''}
                </div>
            `;
        }

        html += `
                </div>
            </div>
        `;

        return html;
    }

    function renderSettlementFeatures(placeId, settlement) {
        var features = settlement.features || [];
        
        if (features.length === 0) {
            return `
                <div style="background: var(--bg2); padding: 12px 16px; border-radius: 8px; margin-bottom: 20px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <div style="font-size: 0.7rem; font-weight: bold;">${_getGearIcon()} Features</div>
                        <button id="manageFeaturesBtn" class="btn small" style="font-size: 0.6rem; padding: 3px 10px;">
                            ${_getCheckIcon()} Add Features
                        </button>
                    </div>
                    <div style="text-align: center; padding: 12px; color: var(--dim); font-size: 0.7rem;">
                        ${_getCrossIcon()} No features built yet.
                    </div>
                </div>
            `;
        }

        // Group by category
        var categories = {};
        for (var i = 0; i < features.length; i++) {
            var cat = features[i].category || 'uncategorized';
            if (!categories[cat]) categories[cat] = [];
            categories[cat].push(features[i]);
        }

        var categoryIcons = {
            defensive: _getShieldIcon(),
            civic: _getHomeIcon(),
            military: _getSwordIcon(),
            commercial: _getCoinIcon(),
            infrastructure: _getGearIcon(),
            aesthetic: _getStarIcon()
        };

        var html = `
            <div style="background: var(--bg2); padding: 12px 16px; border-radius: 8px; margin-bottom: 20px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <div style="font-size: 0.7rem; font-weight: bold;">${_getGearIcon()} Features (${features.length})</div>
                    <button id="manageFeaturesBtn" class="btn small" style="font-size: 0.6rem; padding: 3px 10px;">
                        ${_getCheckIcon()} Manage Features
                    </button>
                </div>
        `;

        var catNames = Object.keys(categories).sort();
        for (var i = 0; i < catNames.length; i++) {
            var cat = catNames[i];
            var catFeatures = categories[cat];
            var catIcon = categoryIcons[cat] || _getCircleIcon();
            
            html += `
                <div style="margin-bottom: 6px;">
                    <div style="font-size: 0.55rem; color: var(--accent); text-transform: capitalize;">${catIcon} ${cat}</div>
                    <div style="display: flex; flex-wrap: wrap; gap: 4px;">
            `;

            for (var j = 0; j < catFeatures.length; j++) {
                var f = catFeatures[j];
                var maint = f.maintenance ? ' (' + f.maintenance + 'g/yr)' : '';
                html += `
                    <span style="font-size: 0.55rem; background: var(--bg); padding: 2px 8px; border-radius: 12px; border-left: 2px solid var(--accent);">
                        ${f.icon || _getGearIcon()} ${_escapeHtml(f.name)}${maint}
                    </span>
                `;
            }

            html += `
                    </div>
                </div>
            `;
        }

        html += `
            </div>
        `;

        return html;
    }

    function renderTradeIndustry(tradeStatus) {
        if (!tradeStatus) {
            return `
                <div style="background: var(--bg2); padding: 12px 16px; border-radius: 8px; margin-bottom: 20px;">
                    <div style="font-size: 0.7rem; font-weight: bold;">${_getCoinIcon()} Trade & Industry</div>
                    <div style="text-align: center; padding: 12px; color: var(--dim); font-size: 0.7rem;">
                        No trade data available
                    </div>
                </div>
            `;
        }

        var statusIcons = {
            minor: _getCircleIcon(),
            regional: _getHomeIcon(),
            major: _getStarIcon(),
            hub: _getStarIcon(),
            metropolis: _getCrownIcon()
        };

        var statusColors = {
            minor: 'var(--dim)',
            regional: 'var(--accent)',
            major: 'var(--success)',
            hub: 'var(--success)',
            metropolis: 'var(--gold)'
        };

        var icon = statusIcons[tradeStatus.status] || _getCircleIcon();
        var color = statusColors[tradeStatus.status] || 'var(--dim)';

        return `
            <div style="background: var(--bg2); padding: 12px 16px; border-radius: 8px; margin-bottom: 20px;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                    <div>
                        <div style="font-size: 0.7rem; font-weight: bold;">${_getCoinIcon()} Trade & Industry</div>
                        <div style="font-size: 0.6rem; color: var(--dim);">
                            ${tradeStatus.tradeFeatures} commercial features
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <span style="font-size: 1.2rem; color: ${color};">${icon}</span>
                        <div>
                            <div style="font-weight: bold; color: ${color};">${_escapeHtml(tradeStatus.description)}</div>
                            <div style="font-size: 0.55rem; color: var(--dim);">
                                +${((tradeStatus.totalBonus - 1) * 100).toFixed(0)}% trade bonus
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    function renderRolesAndApprenticeships(roleStats, apprenticeshipDensity) {
        var html = '';

        if (roleStats && roleStats.totalProfessions > 0) {
            var topRoles = roleStats.topRoles || [];
            html += `
                <div style="background: var(--bg2); padding: 12px 16px; border-radius: 8px; margin-bottom: 20px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <div style="font-size: 0.7rem; font-weight: bold;">${_getPersonIcon()} Roles (${roleStats.totalProfessions} professions)</div>
                        <span style="font-size: 0.55rem; color: var(--dim);">${roleStats.uniqueRoles} unique roles</span>
                    </div>
                    <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                        ${topRoles.slice(0, 8).map(function(r) {
                            return `
                                <span style="font-size: 0.55rem; background: var(--bg); padding: 2px 8px; border-radius: 12px; border-left: 2px solid var(--accent);">
                                    ${_escapeHtml(r.name)} (${r.count})
                                </span>
                            `;
                        }).join('')}
                        ${topRoles.length > 8 ? `<span style="font-size: 0.55rem; color: var(--dim);">+${topRoles.length - 8} more</span>` : ''}
                    </div>
                    ${apprenticeshipDensity && apprenticeshipDensity.totalApprentices > 0 ? `
                        <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--border-light); font-size: 0.55rem; color: var(--dim);">
                            ${_getCrownIcon()} ${apprenticeshipDensity.totalMasters} masters · 
                            ${_getPersonIcon()} ${apprenticeshipDensity.totalApprentices} apprentices · 
                            Ratio: ${apprenticeshipDensity.masterToApprenticeRatio}:1
                            (${apprenticeshipDensity.apprenticeDensity.toFixed(1)}% density)
                        </div>
                    ` : ''}
                </div>
            `;
        }

        return html;
    }

    function renderActions(settlement, placeId, canUpgrade, upgradeReqs) {
        var nextRankName = upgradeReqs && upgradeReqs.nextRank ? upgradeReqs.nextRank.name : 'Next Rank';
        var popNeeded = upgradeReqs ? upgradeReqs.requiredPopulation - upgradeReqs.currentPopulation : 0;

        return `
            <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--border);">
                <button id="manageFeaturesBtn2" class="btn primary" style="font-size: 0.75rem; padding: 6px 14px;">
                    ${_getGearIcon()} Manage Features
                </button>
                <button id="specializationBtn" class="btn" style="font-size: 0.75rem; padding: 6px 14px;">
                    ${_getStarIcon()} Set Specialization
                </button>
                <button id="budgetBtn" class="btn" style="font-size: 0.75rem; padding: 6px 14px;">
                    ${_getCoinIcon()} Budget
                </button>
                <button id="taxBtn" class="btn" style="font-size: 0.75rem; padding: 6px 14px;">
                    ${_getCircleIcon()} Rates
                </button>
                <button id="justiceBtn" class="btn" style="font-size: 0.75rem; padding: 6px 14px;">
                    ${_getShieldIcon()} Justice
                </button>
                <button id="enterprisesBtn" class="btn" style="font-size: 0.75rem; padding: 6px 14px;">
                    ${_getGearIcon()} Enterprises
                </button>
                <button id="employmentBtn" class="btn" style="font-size: 0.75rem; padding: 6px 14px;">
                    ${_getPersonIcon()} Employment
                </button>
                <button id="rolesBtn" class="btn" style="font-size: 0.75rem; padding: 6px 14px;">
                    ${_getPersonIcon()} Roles
                </button>
                <button id="apprenticeshipsBtn" class="btn" style="font-size: 0.75rem; padding: 6px 14px;">
                    ${_getCrownIcon()} Apprentices
                </button>
                <button id="educationBtn" class="btn" style="font-size: 0.75rem; padding: 6px 14px;">
                    ${_getBookIcon()} Education
                </button>
                ${canUpgrade ? `
                    <button id="upgradeBtn2" class="btn success" style="font-size: 0.75rem; padding: 6px 14px;">
                        ${_getStarIcon()} Upgrade to ${nextRankName}
                    </button>
                ` : `
                    ${upgradeReqs && upgradeReqs.nextRank ? `
                        <button id="upgradeBtn2" class="btn" disabled style="font-size: 0.75rem; padding: 6px 14px; opacity: 0.5; cursor: not-allowed;">
                            ${_getWarningIcon()} Need ${popNeeded} more people for ${nextRankName}
                        </button>
                    ` : ''}
                `}
                <button id="processYearBtn" class="btn" style="font-size: 0.75rem; padding: 6px 14px;">
                    ${_getRefreshIcon()} Process Year
                </button>
            </div>
        `;
    }

    // =========================================================================
    // 8. EVENT HANDLERS
    // =========================================================================

    function attachSettlementTabHandlers(placeId, onRefresh) {
        var manageBtns = document.querySelectorAll('#manageFeaturesBtn, #manageFeaturesBtn2');
        for (var i = 0; i < manageBtns.length; i++) {
            var btn = manageBtns[i];
            if (!btn._clickAttached) {
                btn.addEventListener('click', function() {
                    _openManageFeaturesModal(placeId, function() {
                        if (onRefresh) onRefresh();
                    });
                });
                btn._clickAttached = true;
            }
        }

        var specBtn = document.getElementById('specializationBtn');
        if (specBtn && !specBtn._clickAttached) {
            specBtn.addEventListener('click', function() {
                _openSettlementSpecializationModal(placeId, function() {
                    if (onRefresh) onRefresh();
                });
            });
            specBtn._clickAttached = true;
        }

        var budgetBtn = document.getElementById('budgetBtn');
        if (budgetBtn && !budgetBtn._clickAttached) {
            budgetBtn.addEventListener('click', function() {
                _openSettlementBudgetModal(placeId);
            });
            budgetBtn._clickAttached = true;
        }

        var taxBtn = document.getElementById('taxBtn');
        if (taxBtn && !taxBtn._clickAttached) {
            taxBtn.addEventListener('click', function() {
                _openTaxRateManagementModal(placeId, function() {
                    if (onRefresh) onRefresh();
                });
            });
            taxBtn._clickAttached = true;
        }

        var justiceBtn = document.getElementById('justiceBtn');
        if (justiceBtn && !justiceBtn._clickAttached) {
            justiceBtn.addEventListener('click', function() {
                _openJusticeManagementModal(placeId, function() {
                    if (onRefresh) onRefresh();
                });
            });
            justiceBtn._clickAttached = true;
        }

        var enterprisesBtn = document.getElementById('enterprisesBtn');
        if (enterprisesBtn && !enterprisesBtn._clickAttached) {
            enterprisesBtn.addEventListener('click', function() {
                _openStateEnterpriseManagementModal(placeId, function() {
                    if (onRefresh) onRefresh();
                });
            });
            enterprisesBtn._clickAttached = true;
        }

        var employmentBtn = document.getElementById('employmentBtn');
        if (employmentBtn && !employmentBtn._clickAttached) {
            employmentBtn.addEventListener('click', function() {
                _openEmploymentManagementModal(placeId);
            });
            employmentBtn._clickAttached = true;
        }

        var rolesBtn = document.getElementById('rolesBtn');
        if (rolesBtn && !rolesBtn._clickAttached) {
            rolesBtn.addEventListener('click', function() {
                _openSettlementRolesModal(placeId);
            });
            rolesBtn._clickAttached = true;
        }

        var apprenticeshipsBtn = document.getElementById('apprenticeshipsBtn');
        if (apprenticeshipsBtn && !apprenticeshipsBtn._clickAttached) {
            apprenticeshipsBtn.addEventListener('click', function() {
                _openSettlementApprenticeshipsModal(placeId);
            });
            apprenticeshipsBtn._clickAttached = true;
        }

        var educationBtn = document.getElementById('educationBtn');
        if (educationBtn && !educationBtn._clickAttached) {
            educationBtn.addEventListener('click', function() {
                _openSettlementEducationModal(placeId);
            });
            educationBtn._clickAttached = true;
        }

        var upgradeBtns = document.querySelectorAll('#upgradeBtn, #upgradeBtn2');
        for (var i = 0; i < upgradeBtns.length; i++) {
            var btn = upgradeBtns[i];
            if (!btn._clickAttached && !btn.disabled) {
                btn.addEventListener('click', function() {
                    _openUpgradeSettlementModal(placeId, function() {
                        if (onRefresh) onRefresh();
                    });
                });
                btn._clickAttached = true;
            }
        }

        var detailsBtn = document.getElementById('detailsBtn');
        if (detailsBtn && !detailsBtn._clickAttached) {
            detailsBtn.addEventListener('click', function() {
                _openSettlementDetailsModal(placeId, function() {
                    if (onRefresh) onRefresh();
                });
            });
            detailsBtn._clickAttached = true;
        }

        var processBtn = document.getElementById('processYearBtn');
        if (processBtn && !processBtn._clickAttached) {
            processBtn.addEventListener('click', function() {
                var result = _processAnnualSettlementUpdate(placeId);
                if (result && result.success) {
                    _showToast(_getCheckIcon() + ' Year processed: ' + result.summary, 'success');
                    if (onRefresh) onRefresh();
                } else {
                    _showToast(_getCrossIcon() + ' Failed to process year: ' + (result ? result.reason : 'Unknown'), 'error');
                }
            });
            processBtn._clickAttached = true;
        }
    }

    // =========================================================================
    // 9. EXPORTS
    // =========================================================================

    window.renderSettlementTab = renderSettlementTab;
    window.attachSettlementTabHandlers = attachSettlementTabHandlers;


})();