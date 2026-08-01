/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT TAB UI (js/ui/wm-settlement-tab-ui.js)
 * =============================================================================
 * 
 * UPDATED: Uses Settlement System (v4.0) with Civil Laws support
 * 
 * This file contains the settlement management tab for World Manager
 * 
 * Features:
 * - Settlement overview (rank, prosperity, wealth, population)
 * - Settlement features management (view/add/remove)
 * - Settlement specialization display
 * - Trade hub status
 * - Industrial development
 * - Settlement upgrade management
 * - Crime and justice overview
 * - Education and literacy stats
 * - Educational institutions viewer (read-only)
 * - Annual processing
 * - Feature filtering by category
 * - CIVIL LAWS management (NEW)
 * 
 * DEPENDENCIES:
 *   - accessors.js (getPlaceById, getCharacterById, getLocationPopulationCount)
 *   - settlement-state.js (SettlementState)
 *   - settlement-commands-writes.js (SettlementCommands)
 *   - settlement-queries.js (SettlementQueries)
 *   - settlement-economy-core.js (SettlementEconomy)
 *   - educationSystem.js (getInstitutionsAtLocation, getInstitutionStudents, etc.)
 *   - modals-settlement-core.js (settlement modals)
 *   - core/ui/ui.js (escapeHtml, showToast)
 * 
 * =============================================================================
 */

// =============================================================================
// 1. SVG ICON HELPERS
// =============================================================================

function _getIcon(name, fallback) {
    if (typeof window.Icons !== 'undefined' && window.Icons[name]) {
        return window.Icons[name];
    }
    return fallback || '●';
}

function _getCheckIcon() {
    return _getIcon('CHECK', '✓');
}

function _getCrossIcon() {
    return _getIcon('X', '✗');
}

function _getCircleIcon() {
    return _getIcon('CIRCLE', '●');
}

function _getHomeIcon() {
    return _getIcon('HOME', '⌂');
}

function _getWarningIcon() {
    return _getIcon('WARNING', '⚠');
}

function _getRefreshIcon() {
    return _getIcon('REFRESH', '⟳');
}

function _getSearchIcon() {
    return _getIcon('SEARCH', '⌕');
}

function _getStarIcon() {
    return _getIcon('STAR', '★');
}

function _getGearIcon() {
    return _getIcon('GEAR', '⚙');
}

function _getBookIcon() {
    return _getIcon('BOOK', '📚');
}

function _getShieldIcon() {
    return _getIcon('SHIELD', '🛡');
}

function _getSwordIcon() {
    return _getIcon('SWORD', '⚔');
}

function _getCrownIcon() {
    return _getIcon('CROWN', '👑');
}

function _getPersonIcon() {
    return _getIcon('PERSON', '👤');
}

function _getFlagIcon() {
    return _getIcon('FLAG', '🏴');
}

// =============================================================================
// 2. DEPENDENCY WRAPPERS - Settlement System (v4.0)
// =============================================================================

function _escapeHtml(str) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
    if (!str) return '';
    return String(str).replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

function _showToast(message, type) {
    if (typeof window.showToast === 'function') {
        window.showToast(message, type);
    } else if (typeof window.showToastMessage === 'function') {
        window.showToastMessage(message, type);
    } else {
        console.log('[' + (type || 'info') + '] ' + message);
    }
}

function _getPlaceById(id) {
    return typeof window.getPlaceById === 'function' ? window.getPlaceById(id) : null;
}

function _getCharacterById(id) {
    return typeof window.getCharacterById === 'function' ? window.getCharacterById(id) : null;
}

function _getLocationPopulationCount(locationId) {
    return typeof window.getLocationPopulationCount === 'function' ? 
        window.getLocationPopulationCount(locationId) : 0;
}

// =============================================================================
// 3. SETTLEMENT SYSTEM WRAPPERS (NEW v4.0)
// =============================================================================

// Settlement State
function _getSettlementData(placeId) {
    if (typeof window.SettlementState !== 'undefined' && 
        typeof window.SettlementState.getSettlementData === 'function') {
        return window.SettlementState.getSettlementData(placeId);
    }
    return null;
}

function _getAllSettlements(options) {
    if (typeof window.SettlementState !== 'undefined' && 
        typeof window.SettlementState.getAllSettlements === 'function') {
        return window.SettlementState.getAllSettlements(options || {});
    }
    return [];
}

function _getSettlementFeatures(placeId) {
    if (typeof window.SettlementState !== 'undefined' && 
        typeof window.SettlementState.getSettlementFeatures === 'function') {
        return window.SettlementState.getSettlementFeatures(placeId);
    }
    return [];
}

function _getSettlementBudget(placeId) {
    if (typeof window.SettlementState !== 'undefined' && 
        typeof window.SettlementState.getSettlementBudget === 'function') {
        return window.SettlementState.getSettlementBudget(placeId);
    }
    return null;
}

function _getSettlementEmployment(placeId) {
    if (typeof window.SettlementState !== 'undefined' && 
        typeof window.SettlementState.getSettlementEmployment === 'function') {
        return window.SettlementState.getSettlementEmployment(placeId);
    }
    return null;
}

function _getSettlementHistory(placeId) {
    if (typeof window.SettlementState !== 'undefined' && 
        typeof window.SettlementState.getSettlementHistory === 'function') {
        return window.SettlementState.getSettlementHistory(placeId);
    }
    return [];
}

// Civil Laws (NEW)
function _getCivilLaws(placeId) {
    if (typeof window.SettlementState !== 'undefined' && 
        typeof window.SettlementState.getCivilLaws === 'function') {
        return window.SettlementState.getCivilLaws(placeId);
    }
    return [];
}

function _getCivilLawsByDomain(placeId, domain) {
    if (typeof window.SettlementState !== 'undefined' && 
        typeof window.SettlementState.getCivilLawsByDomain === 'function') {
        return window.SettlementState.getCivilLawsByDomain(placeId, domain);
    }
    return [];
}

function _getEnforcedCivilLaws(placeId) {
    if (typeof window.SettlementState !== 'undefined' && 
        typeof window.SettlementState.getEnforcedCivilLaws === 'function') {
        return window.SettlementState.getEnforcedCivilLaws(placeId);
    }
    return [];
}

function _getCivilLawCount(placeId) {
    if (typeof window.SettlementState !== 'undefined' && 
        typeof window.SettlementState.getCivilLawCount === 'function') {
        return window.SettlementState.getCivilLawCount(placeId);
    }
    return 0;
}

// Settlement Commands
function _buildFeature(locationId, featureId) {
    if (typeof window.SettlementCommands !== 'undefined' && 
        typeof window.SettlementCommands.buildFeature === 'function') {
        return window.SettlementCommands.buildFeature(locationId, featureId);
    }
    return null;
}

function _removeFeature(locationId, featureId) {
    if (typeof window.SettlementCommands !== 'undefined' && 
        typeof window.SettlementCommands.removeFeature === 'function') {
        return window.SettlementCommands.removeFeature(locationId, featureId);
    }
    return null;
}

function _demolishFeature(locationId, featureId) {
    if (typeof window.SettlementCommands !== 'undefined' && 
        typeof window.SettlementCommands.demolishFeature === 'function') {
        return window.SettlementCommands.demolishFeature(locationId, featureId);
    }
    return null;
}

function _upgradeSettlement(locationId) {
    if (typeof window.SettlementCommands !== 'undefined' && 
        typeof window.SettlementCommands.upgradeSettlement === 'function') {
        return window.SettlementCommands.upgradeSettlement(locationId);
    }
    return null;
}

function _setSpecialization(locationId, roleId) {
    if (typeof window.SettlementCommands !== 'undefined' && 
        typeof window.SettlementCommands.setSpecialization === 'function') {
        return window.SettlementCommands.setSpecialization(locationId, roleId);
    }
    return null;
}

function _updateWealth(locationId, delta, reason) {
    if (typeof window.SettlementCommands !== 'undefined' && 
        typeof window.SettlementCommands.updateWealth === 'function') {
        return window.SettlementCommands.updateWealth(locationId, delta, reason);
    }
    return null;
}

function _updateDebt(locationId, delta, reason) {
    if (typeof window.SettlementCommands !== 'undefined' && 
        typeof window.SettlementCommands.updateDebt === 'function') {
        return window.SettlementCommands.updateDebt(locationId, delta, reason);
    }
    return null;
}

function _updateTaxRate(locationId, rate) {
    if (typeof window.SettlementCommands !== 'undefined' && 
        typeof window.SettlementCommands.updateTaxRate === 'function') {
        return window.SettlementCommands.updateTaxRate(locationId, rate);
    }
    return null;
}

function _updateJusticeSeverity(locationId, severity) {
    if (typeof window.SettlementCommands !== 'undefined' && 
        typeof window.SettlementCommands.updateJusticeSeverity === 'function') {
        return window.SettlementCommands.updateJusticeSeverity(locationId, severity);
    }
    return null;
}

function _updateWatch(locationId, hasWatch, size) {
    if (typeof window.SettlementCommands !== 'undefined' && 
        typeof window.SettlementCommands.updateWatch === 'function') {
        return window.SettlementCommands.updateWatch(locationId, hasWatch, size);
    }
    return null;
}

// Civil Law Commands (NEW)
function _addCivilLaw(locationId, lawData) {
    if (typeof window.SettlementCommands !== 'undefined' && 
        typeof window.SettlementCommands.addCivilLaw === 'function') {
        return window.SettlementCommands.addCivilLaw(locationId, lawData);
    }
    return null;
}

function _updateCivilLaw(locationId, lawId, updates) {
    if (typeof window.SettlementCommands !== 'undefined' && 
        typeof window.SettlementCommands.updateCivilLaw === 'function') {
        return window.SettlementCommands.updateCivilLaw(locationId, lawId, updates);
    }
    return null;
}

function _removeCivilLaw(locationId, lawId) {
    if (typeof window.SettlementCommands !== 'undefined' && 
        typeof window.SettlementCommands.removeCivilLaw === 'function') {
        return window.SettlementCommands.removeCivilLaw(locationId, lawId);
    }
    return null;
}

// Settlement Queries
function _getGlobalSettlementStatistics() {
    if (typeof window.SettlementQueries !== 'undefined' && 
        typeof window.SettlementQueries.getGlobalSettlementStatistics === 'function') {
        return window.SettlementQueries.getGlobalSettlementStatistics();
    }
    return null;
}

function _compareSettlements(locationId1, locationId2) {
    if (typeof window.SettlementQueries !== 'undefined' && 
        typeof window.SettlementQueries.compareSettlements === 'function') {
        return window.SettlementQueries.compareSettlements(locationId1, locationId2);
    }
    return null;
}

// Settlement Economy
function _calculateProsperity(locationId) {
    if (typeof window.SettlementEconomy !== 'undefined' && 
        typeof window.SettlementEconomy.calculateProsperity === 'function') {
        return window.SettlementEconomy.calculateProsperity(locationId);
    }
    return 50;
}

function _calculateCrimeRate(locationId) {
    if (typeof window.SettlementEconomy !== 'undefined' && 
        typeof window.SettlementEconomy.calculateCrimeRate === 'function') {
        return window.SettlementEconomy.calculateCrimeRate(locationId);
    }
    return 0.05;
}

function _calculateTaxIncome(locationId) {
    if (typeof window.SettlementEconomy !== 'undefined' && 
        typeof window.SettlementEconomy.calculateTaxIncome === 'function') {
        return window.SettlementEconomy.calculateTaxIncome(locationId);
    }
    return 0;
}

function _calculateTotalIncome(locationId) {
    if (typeof window.SettlementEconomy !== 'undefined' && 
        typeof window.SettlementEconomy.calculateTotalIncome === 'function') {
        return window.SettlementEconomy.calculateTotalIncome(locationId);
    }
    return 0;
}

function _calculateTotalExpenses(locationId) {
    if (typeof window.SettlementEconomy !== 'undefined' && 
        typeof window.SettlementEconomy.calculateTotalExpenses === 'function') {
        return window.SettlementEconomy.calculateTotalExpenses(locationId);
    }
    return 0;
}

function _calculateSurplus(locationId) {
    if (typeof window.SettlementEconomy !== 'undefined' && 
        typeof window.SettlementEconomy.calculateSurplus === 'function') {
        return window.SettlementEconomy.calculateSurplus(locationId);
    }
    return 0;
}

function _getFinancialReport(locationId, years) {
    if (typeof window.SettlementEconomy !== 'undefined' && 
        typeof window.SettlementEconomy.getFinancialReport === 'function') {
        return window.SettlementEconomy.getFinancialReport(locationId, years || 10);
    }
    return null;
}

function _getDebtRatio(locationId) {
    if (typeof window.SettlementEconomy !== 'undefined' && 
        typeof window.SettlementEconomy.getDebtRatio === 'function') {
        return window.SettlementEconomy.getDebtRatio(locationId);
    }
    return 0;
}

// Settlement Ranks
function _getAllRanks() {
    if (typeof window.SettlementRanks !== 'undefined' && 
        typeof window.SettlementRanks.getAllRanks === 'function') {
        return window.SettlementRanks.getAllRanks();
    }
    return [];
}

function _getRankById(rankId) {
    if (typeof window.SettlementRanks !== 'undefined' && 
        typeof window.SettlementRanks.getRankById === 'function') {
        return window.SettlementRanks.getRankById(rankId);
    }
    return null;
}

function _getRankFromPopulation(population) {
    if (typeof window.SettlementRanks !== 'undefined' && 
        typeof window.SettlementRanks.getRankFromPopulation === 'function') {
        return window.SettlementRanks.getRankFromPopulation(population);
    }
    return null;
}

function _canUpgrade(locationId) {
    if (typeof window.SettlementRanks !== 'undefined' && 
        typeof window.SettlementRanks.canUpgrade === 'function') {
        return window.SettlementRanks.canUpgrade(locationId);
    }
    return false;
}

function _getUpgradeRequirements(locationId) {
    if (typeof window.SettlementRanks !== 'undefined' && 
        typeof window.SettlementRanks.getUpgradeRequirements === 'function') {
        return window.SettlementRanks.getUpgradeRequirements(locationId);
    }
    return null;
}

// Settlement Features
function _getAllFeatures() {
    if (typeof window.SettlementFeatures !== 'undefined' && 
        typeof window.SettlementFeatures.getAllFeatures === 'function') {
        return window.SettlementFeatures.getAllFeatures();
    }
    return [];
}

function _getFeatureById(featureId) {
    if (typeof window.SettlementFeatures !== 'undefined' && 
        typeof window.SettlementFeatures.getFeatureById === 'function') {
        return window.SettlementFeatures.getFeatureById(featureId);
    }
    return null;
}

function _getFeaturesByCategory(category) {
    if (typeof window.SettlementFeatures !== 'undefined' && 
        typeof window.SettlementFeatures.getFeaturesByCategory === 'function') {
        return window.SettlementFeatures.getFeaturesByCategory(category);
    }
    return [];
}

function _getFeatureCategories() {
    if (typeof window.SettlementFeatures !== 'undefined' && 
        typeof window.SettlementFeatures.getFeatureCategories === 'function') {
        return window.SettlementFeatures.getFeatureCategories();
    }
    return [];
}

function _canAffordFeature(locationId, featureId) {
    if (typeof window.SettlementFeatures !== 'undefined' && 
        typeof window.SettlementFeatures.canAffordFeature === 'function') {
        return window.SettlementFeatures.canAffordFeature(locationId, featureId);
    }
    return false;
}

function _getFeatureCost(featureId) {
    if (typeof window.SettlementFeatures !== 'undefined' && 
        typeof window.SettlementFeatures.getFeatureCost === 'function') {
        return window.SettlementFeatures.getFeatureCost(featureId);
    }
    return 0;
}

function _getFeatureMaintenance(featureId) {
    if (typeof window.SettlementFeatures !== 'undefined' && 
        typeof window.SettlementFeatures.getFeatureMaintenance === 'function') {
        return window.SettlementFeatures.getFeatureMaintenance(featureId);
    }
    return 0;
}

function _getFeatureEffects(featureId) {
    if (typeof window.SettlementFeatures !== 'undefined' && 
        typeof window.SettlementFeatures.getFeatureEffects === 'function') {
        return window.SettlementFeatures.getFeatureEffects(featureId);
    }
    return {};
}

// Annual Processing
function _processAnnualSettlementUpdate(locationId) {
    if (typeof window.SettlementAnnual !== 'undefined' && 
        typeof window.SettlementAnnual.processAnnualSettlementUpdate === 'function') {
        return window.SettlementAnnual.processAnnualSettlementUpdate(locationId);
    }
    return null;
}

// =============================================================================
// 4. MODAL DELEGATION - Settlement Modals (v4.0)
// =============================================================================

function _openSettlementFeaturesModal(placeId, onSuccess) {
    if (typeof window.openManageFeaturesModal === 'function') {
        window.openManageFeaturesModal(placeId, onSuccess);
    } else {
        _showToast(_getCrossIcon() + ' Settlement features modal not available', 'error');
    }
}

function _openSettlementUpgradeModal(placeId, onSuccess) {
    if (typeof window.openUpgradeSettlementModal === 'function') {
        window.openUpgradeSettlementModal(placeId, onSuccess);
    } else {
        _showToast(_getCrossIcon() + ' Settlement upgrade modal not available', 'error');
    }
}

function _openSettlementSpecializationModal(placeId, onSuccess) {
    if (typeof window.openSettlementSpecializationModal === 'function') {
        window.openSettlementSpecializationModal(placeId, onSuccess);
    } else {
        _showToast(_getCrossIcon() + ' Settlement specialization modal not available', 'error');
    }
}

function _openSettlementBudgetModal(placeId) {
    if (typeof window.openSettlementBudgetModal === 'function') {
        window.openSettlementBudgetModal(placeId);
    } else {
        _showToast(_getCrossIcon() + ' Settlement budget modal not available', 'error');
    }
}

function _openManageCivilLawsModal(placeId, onSuccess) {
    if (typeof window.openManageCivilLawsModal === 'function') {
        window.openManageCivilLawsModal(placeId, onSuccess);
    } else {
        _showToast(_getCrossIcon() + ' Civil laws modal not available', 'error');
    }
}

// =============================================================================
// 5. RENDERING FUNCTIONS
// =============================================================================

function renderSettlementTab(containerId, placeId, onRefresh) {
    var container = document.getElementById(containerId);
    if (!container) return;
    
    var place = _getPlaceById(placeId);
    if (!place) {
        container.innerHTML = '<div class="empty-state">' + _getHomeIcon() + ' Location not found</div>';
        return;
    }
    
    // Get all settlement data using new SettlementState
    var settlement = _getSettlementData(placeId);
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
            initBtn.addEventListener('click', function() {
                if (typeof window.initializeSettlement === 'function') {
                    window.initializeSettlement(placeId);
                    _showToast(_getCheckIcon() + ' Settlement initialized!', 'success');
                    if (onRefresh) onRefresh();
                }
            });
        }
        return;
    }
    
    // Get additional data from new systems
    var rank = _getRankById(settlement.rankId);
    var features = _getAllFeatures();
    var featureCategories = _getFeatureCategories();
    var prosperity = _calculateProsperity(placeId);
    var crimeRate = _calculateCrimeRate(placeId);
    var surplus = _calculateSurplus(placeId);
    var debtRatio = _getDebtRatio(placeId);
    var civilLaws = _getCivilLaws(placeId);
    var canUpgrade = _canUpgrade(placeId);
    var upgradeRequirements = _getUpgradeRequirements(placeId);
    
    // Build the settlement tab HTML
    var html = `
        <div class="settlement-tab" style="padding: 16px;">
            <div class="settlement-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 20px;">
                <div>
                    <h2 style="margin: 0;">${_getHomeIcon()} ${_escapeHtml(place.displayName)}</h2>
                    <div style="font-size: 0.7rem; color: var(--dim); margin-top: 4px;">
                        ${rank ? _escapeHtml(rank.name) : 'Unknown'} • ${settlement.population || 0} population • Founded ${settlement.foundedYear || 'Unknown'}
                    </div>
                </div>
                <div style="display: flex; gap: 8px; align-items: center;">
                    <span class="rank-badge" style="background: var(--accent); color: var(--bg); padding: 4px 12px; border-radius: 12px; font-size: 0.7rem; font-weight: bold;">
                        ${rank && rank.symbol ? rank.symbol : _getStarIcon()} ${rank ? _escapeHtml(rank.name) : 'Unknown'}
                    </span>
                    ${canUpgrade ? `
                        <button id="upgradeBtn" class="btn success" style="font-size: 0.7rem; padding: 4px 12px;">
                            ${_getStarIcon()} Upgrade Available!
                        </button>
                    ` : ''}
                </div>
            </div>
            
            ${renderSettlementOverview(settlement, prosperity, surplus, debtRatio)}
            ${renderSettlementStats(settlement, placeId)}
            ${renderEducationInstitutions(placeId)}
            ${renderSettlementFeatures(placeId, settlement, features)}
            ${renderCivilLawsSection(placeId, civilLaws)}
            ${renderTradeIndustry(settlement, placeId)}
            ${renderCrimeJustice(settlement, placeId, crimeRate)}
            ${renderBudgetSection(settlement, placeId)}
            ${renderActions(settlement, placeId, canUpgrade, upgradeRequirements)}
        </div>
    `;
    
    container.innerHTML = html;
    attachSettlementTabHandlers(placeId, onRefresh);
}

function renderSettlementOverview(settlement, prosperity, surplus, debtRatio) {
    var prosperityColor = prosperity >= 70 ? 'var(--success)' : 
                           (prosperity >= 40 ? 'var(--accent)' : 'var(--warn)');
    
    var prosperityIcon = prosperity >= 70 ? _getStarIcon() :
                         (prosperity >= 40 ? _getCheckIcon() : _getWarningIcon());
    
    var surplusColor = surplus >= 0 ? 'var(--success)' : 'var(--danger)';
    var surplusIcon = surplus >= 0 ? _getCheckIcon() : _getCrossIcon();
    
    var debtColor = debtRatio < 0.3 ? 'var(--success)' : 
                    (debtRatio < 0.6 ? 'var(--warn)' : 'var(--danger)');
    
    return `
        <div class="settlement-overview" style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 20px;">
            <div class="overview-card" style="background: var(--bg2); padding: 16px; border-radius: 8px; border-left: 4px solid ${prosperityColor};">
                <div style="font-size: 0.6rem; color: var(--dim); text-transform: uppercase; letter-spacing: 0.5px;">${prosperityIcon} Prosperity</div>
                <div style="font-size: 1.5rem; font-weight: bold; color: ${prosperityColor};">
                    ${prosperity.toFixed(1)}%
                </div>
                <div style="font-size: 0.75rem; color: var(--dim);">
                    ${prosperity >= 70 ? 'Thriving' : prosperity >= 40 ? 'Stable' : 'Struggling'}
                </div>
            </div>
            <div class="overview-card" style="background: var(--bg2); padding: 16px; border-radius: 8px; border-left: 4px solid var(--accent);">
                <div style="font-size: 0.6rem; color: var(--dim); text-transform: uppercase; letter-spacing: 0.5px;">${_getCircleIcon()} Wealth</div>
                <div style="font-size: 1.5rem; font-weight: bold; color: var(--accent);">
                    ${(settlement.wealth || 0).toLocaleString()} <span style="font-size: 0.8rem; font-weight: normal;">gold</span>
                </div>
                <div style="font-size: 0.75rem; color: ${surplusColor};">
                    ${surplusIcon} Surplus: ${(surplus || 0).toLocaleString()} gold
                </div>
            </div>
            <div class="overview-card" style="background: var(--bg2); padding: 16px; border-radius: 8px; border-left: 4px solid ${debtColor};">
                <div style="font-size: 0.6rem; color: var(--dim); text-transform: uppercase; letter-spacing: 0.5px;">${_getWarningIcon()} Debt</div>
                <div style="font-size: 1.5rem; font-weight: bold; color: ${debtColor};">
                    ${(settlement.totalDebt || 0).toLocaleString()} <span style="font-size: 0.8rem; font-weight: normal;">gold</span>
                </div>
                <div style="font-size: 0.75rem; color: var(--dim);">
                    ${debtRatio < 0.3 ? 'Healthy' : debtRatio < 0.6 ? 'Moderate' : 'High'} (${(debtRatio * 100).toFixed(1)}% of wealth)
                </div>
            </div>
        </div>
    `;
}

function renderSettlementStats(settlement, placeId) {
    var specializations = settlement.specializations || [];
    var specRole = settlement.specializationRoleId;
    var literacyStats = _getSettlementLiteracyStats(placeId);
    var institutions = _getInstitutionsAtLocation(placeId);
    var employment = _getSettlementEmployment(placeId);
    var civilLawCount = _getCivilLawCount(placeId);
    
    var totalStudents = 0;
    for (var i = 0; i < institutions.length; i++) {
        var students = _getInstitutionStudents(institutions[i].id);
        totalStudents += (students ? students.length : 0);
    }
    
    var literacyColor = literacyStats.literacyRate > 70 ? 'var(--success)' :
                          (literacyStats.literacyRate > 40 ? 'var(--accent)' : 'var(--warn)');
    
    var employmentRate = employment ? employment.employmentRate || 0 : 0;
    var empColor = employmentRate > 80 ? 'var(--success)' :
                   (employmentRate > 60 ? 'var(--accent)' : 'var(--warn)');
    
    return `
        <div class="settlement-stats" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; margin-bottom: 20px;">
            <div class="stat-card" style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">
                <div style="font-size: 0.5rem; color: var(--dim); text-transform: uppercase;">${_getPersonIcon()} Population</div>
                <div style="font-size: 1.2rem; font-weight: bold;">${settlement.population || 0}</div>
            </div>
            <div class="stat-card" style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">
                <div style="font-size: 0.5rem; color: var(--dim); text-transform: uppercase;">${_getBookIcon()} Literacy</div>
                <div style="font-size: 1.2rem; font-weight: bold; color: ${literacyColor};">
                    ${(literacyStats.literacyRate || 0).toFixed(1)}%
                </div>
                <div style="font-size: 0.6rem; color: var(--dim);">
                    ${literacyStats.literateCount || 0} literate
                </div>
            </div>
            <div class="stat-card" style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">
                <div style="font-size: 0.5rem; color: var(--dim); text-transform: uppercase;">${_getHomeIcon()} Schools</div>
                <div style="font-size: 1.2rem; font-weight: bold;">${institutions.length}</div>
                <div style="font-size: 0.6rem; color: var(--dim);">
                    ${totalStudents} students
                </div>
            </div>
            <div class="stat-card" style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">
                <div style="font-size: 0.5rem; color: var(--dim); text-transform: uppercase;">${_getGearIcon()} Employment</div>
                <div style="font-size: 1.2rem; font-weight: bold; color: ${empColor};">
                    ${(employmentRate || 0).toFixed(1)}%
                </div>
                <div style="font-size: 0.6rem; color: var(--dim);">
                    ${(employment && employment.totalWorkers) || 0} workers
                </div>
            </div>
            <div class="stat-card" style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">
                <div style="font-size: 0.5rem; color: var(--dim); text-transform: uppercase;">${_getShieldIcon()} Civil Laws</div>
                <div style="font-size: 1.2rem; font-weight: bold; color: var(--accent);">
                    ${civilLawCount}
                </div>
                <div style="font-size: 0.6rem; color: var(--dim);">
                    ${civilLawCount > 0 ? 'Laws enacted' : 'No laws'}
                </div>
            </div>
            ${specRole ? `
                <div class="stat-card" style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center; grid-column: span 2;">
                    <div style="font-size: 0.5rem; color: var(--dim); text-transform: uppercase;">${_getGearIcon()} Specialization</div>
                    <div style="font-size: 0.9rem; font-weight: bold; color: var(--accent);">
                        ${_escapeHtml(specRole)}
                    </div>
                    ${specializations.length > 0 ? `
                        <div style="font-size: 0.6rem; color: var(--dim); margin-top: 4px;">
                            ${specializations.map(function(s) { return _escapeHtml(s); }).join(' • ')}
                        </div>
                    ` : ''}
                </div>
            ` : ''}
        </div>
    `;
}

function renderEducationInstitutions(placeId) {
    var institutions = _getInstitutionsAtLocation(placeId);
    
    if (!institutions || institutions.length === 0) {
        return `
            <div class="education-section" style="background: var(--bg2); padding: 16px; border-radius: 8px; margin-bottom: 20px;">
                <div style="font-size: 0.8rem; font-weight: bold; margin-bottom: 12px;">${_getBookIcon()} Educational Institutions</div>
                <div style="text-align: center; padding: 20px; color: var(--dim); font-size: 0.8rem;">
                    ${_getCrossIcon()} No educational institutions in this location.
                </div>
            </div>
        `;
    }
    
    var html = `
        <div class="education-section" style="background: var(--bg2); padding: 16px; border-radius: 8px; margin-bottom: 20px;">
            <div style="font-size: 0.8rem; font-weight: bold; margin-bottom: 12px;">${_getBookIcon()} Educational Institutions (${institutions.length})</div>
            <div style="display: flex; flex-direction: column; gap: 12px;">
    `;
    
    for (var i = 0; i < institutions.length; i++) {
        html += renderInstitutionCard(institutions[i]);
    }
    
    html += `
            </div>
        </div>
    `;
    
    return html;
}

function renderInstitutionCard(institution) {
    var students = _getInstitutionStudents(institution.id) || [];
    var teachers = _getInstitutionTeachers(institution.id) || [];
    var graduates = _getInstitutionGraduates(institution.id) || [];
    
    var reputationColor = institution.reputation >= 70 ? 'var(--success)' :
                           (institution.reputation >= 40 ? 'var(--accent)' : 'var(--warn)');
    
    // Get headmaster name
    var headmasterName = 'None';
    if (institution.headmaster) {
        if (typeof institution.headmaster === 'object') {
            headmasterName = institution.headmaster.name || 'Unknown';
        } else {
            var char = _getCharacterById(institution.headmaster);
            headmasterName = char ? char.name : 'Unknown';
        }
    }
    
    var institutionIcon = institution.icon || _getBookIcon();
    
    var html = `
        <div class="institution-card" style="background: var(--bg); padding: 12px 16px; border-radius: 8px; border-left: 3px solid ${reputationColor};">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 8px;">
                <div>
                    <div style="font-weight: bold; font-size: 0.9rem;">
                        ${institutionIcon} ${_escapeHtml(institution.name)}
                    </div>
                    <div style="font-size: 0.65rem; color: var(--dim);">
                        ${_escapeHtml(institution.typeName || 'School')}
                        ${institution.foundedYear ? ' • Founded ' + institution.foundedYear : ''}
                        ${institution.isSpecialized ? ' • ' + _getGearIcon() + ' Specialized' : ''}
                    </div>
                </div>
                <div style="display: flex; gap: 12px; font-size: 0.65rem; flex-wrap: wrap;">
                    <span title="Students" style="display: flex; align-items: center; gap: 3px;">
                        ${_getPersonIcon()} ${students.length}
                    </span>
                    <span title="Teachers" style="display: flex; align-items: center; gap: 3px;">
                        ${_getPersonIcon()} ${teachers.length}
                    </span>
                    <span title="Graduates" style="display: flex; align-items: center; gap: 3px;">
                        ${_getStarIcon()} ${graduates.length}
                    </span>
                    <span title="Reputation" style="display: flex; align-items: center; gap: 3px; color: ${reputationColor};">
                        ${_getStarIcon()} ${institution.reputation || 50}
                    </span>
                </div>
            </div>
            
            ${institution.curriculum && institution.curriculum.length > 0 ? `
                <div style="margin-top: 6px; display: flex; flex-wrap: wrap; gap: 4px;">
                    ${institution.curriculum.slice(0, 8).map(function(item) {
                        return `
                            <span style="font-size: 0.55rem; background: var(--bg2); padding: 2px 8px; border-radius: 10px;">
                                ${item.icon || _getBookIcon()} ${_escapeHtml(item.name)}
                            </span>
                        `;
                    }).join('')}
                    ${institution.curriculum.length > 8 ? `
                        <span style="font-size: 0.55rem; color: var(--dim);">+${institution.curriculum.length - 8} more</span>
                    ` : ''}
                </div>
            ` : ''}
            
            <div style="margin-top: 6px; display: flex; flex-wrap: wrap; gap: 6px; font-size: 0.6rem; color: var(--dim);">
                ${institution.maxStudents ? 'Capacity: ' + students.length + '/' + institution.maxStudents : ''}
                ${institution.costPerYear ? ' • Cost: ' + institution.costPerYear + ' gold/year' : ''}
                ${headmasterName !== 'None' ? ' • Headmaster: ' + _escapeHtml(headmasterName) : ''}
            </div>
            
            ${students.length > 0 ? `
                <div style="margin-top: 6px; font-size: 0.6rem; color: var(--dim);">
                    <span style="font-weight: bold;">${_getPersonIcon()} Students:</span>
                    ${students.slice(0, 5).map(function(s) {
                        var char = _getCharacterById(s.studentId);
                        return _escapeHtml(char ? char.name : 'Unknown');
                    }).join(', ')}
                    ${students.length > 5 ? ' +' + (students.length - 5) + ' more' : ''}
                </div>
            ` : ''}
            
            ${teachers.length > 0 ? `
                <div style="margin-top: 4px; font-size: 0.6rem; color: var(--dim);">
                    <span style="font-weight: bold;">${_getPersonIcon()} Teachers:</span>
                    ${teachers.slice(0, 5).map(function(t) {
                        var char = _getCharacterById(t.teacherId);
                        return _escapeHtml(char ? char.name : 'Unknown');
                    }).join(', ')}
                    ${teachers.length > 5 ? ' +' + (teachers.length - 5) + ' more' : ''}
                </div>
            ` : ''}
        </div>
    `;
    
    return html;
}

function renderSettlementFeatures(placeId, settlement, allFeatures) {
    var featureIds = settlement.featureIds || [];
    var features = [];
    for (var i = 0; i < featureIds.length; i++) {
        var feature = _getFeatureById(featureIds[i]);
        if (feature) features.push(feature);
    }
    
    var categories = _getFeatureCategories();
    var categoryKeys = Object.keys(categories);
    
    var categoryIcons = {
        defensive: _getShieldIcon(),
        commercial: _getCircleIcon(),
        craft: _getGearIcon(),
        industrial: _getGearIcon(),
        agricultural: _getHomeIcon(),
        civic: _getHomeIcon(),
        military: _getSwordIcon(),
        aesthetic: _getStarIcon(),
        infrastructure: _getGearIcon()
    };
    
    var featuresHtml = '';
    
    // Show features by category
    for (var c = 0; c < categoryKeys.length; c++) {
        var category = categoryKeys[c];
        var categoryFeatures = features.filter(function(f) { return f.category === category; });
        if (categoryFeatures.length === 0) continue;
        
        var catName = categories[category] ? categories[category].name : category;
        featuresHtml += `
            <div style="margin-bottom: 12px;">
                <div style="font-size: 0.7rem; color: var(--accent); margin-bottom: 6px; text-transform: capitalize;">
                    ${categoryIcons[category] || _getCircleIcon()} ${_escapeHtml(catName)}
                </div>
                <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                    ${categoryFeatures.map(function(f) { return renderFeatureBadge(f); }).join('')}
                </div>
            </div>
        `;
    }
    
    // Show uncategorized features
    var uncategorized = features.filter(function(f) { 
        return !f.category || categoryKeys.indexOf(f.category) === -1; 
    });
    if (uncategorized.length > 0) {
        featuresHtml += `
            <div style="margin-bottom: 12px;">
                <div style="font-size: 0.7rem; color: var(--dim); margin-bottom: 6px;">${_getCircleIcon()} Other Features</div>
                <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                    ${uncategorized.map(function(f) { return renderFeatureBadge(f); }).join('')}
                </div>
            </div>
        `;
    }
    
    if (features.length === 0) {
        featuresHtml = `
            <div style="text-align: center; padding: 20px; color: var(--dim); font-size: 0.8rem;">
                ${_getCrossIcon()} No features built yet. Add features to develop your settlement!
            </div>
        `;
    }
    
    return `
        <div class="settlement-features" style="background: var(--bg2); padding: 16px; border-radius: 8px; margin-bottom: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <div style="font-size: 0.8rem; font-weight: bold;">${_getGearIcon()} Features (${features.length})</div>
                <button id="manageFeaturesBtn" class="btn" style="font-size: 0.7rem; padding: 4px 12px;">
                    ${_getCheckIcon()} Manage Features
                </button>
            </div>
            ${featuresHtml}
        </div>
    `;
}

function renderFeatureBadge(feature) {
    var color = feature.category === 'industrial' ? 'var(--warn)' :
                  feature.category === 'commercial' ? 'var(--success)' :
                  feature.category === 'defensive' ? 'var(--danger)' :
                  feature.category === 'military' ? 'var(--danger)' :
                  feature.category === 'agricultural' ? 'var(--success)' :
                  'var(--accent)';
    
    var icon = feature.icon || _getGearIcon();
    
    return `
        <span style="display: inline-flex; align-items: center; gap: 4px; background: var(--bg); padding: 4px 10px; border-radius: 12px; font-size: 0.65rem; border-left: 2px solid ${color};">
            ${icon} ${_escapeHtml(feature.name)}
            ${feature.maintenance ? ' <span style="color:var(--dim);font-size:0.5rem;">(' + feature.maintenance + '/yr)</span>' : ''}
        </span>
    `;
}

// =============================================================================
// 5.1 CIVIL LAWS SECTION (NEW)
// =============================================================================

function renderCivilLawsSection(placeId, civilLaws) {
    if (!civilLaws || civilLaws.length === 0) {
        return `
            <div class="civil-laws-section" style="background: var(--bg2); padding: 16px; border-radius: 8px; margin-bottom: 20px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                    <div style="font-size: 0.8rem; font-weight: bold;">${_getShieldIcon()} Civil Laws</div>
                    <button id="manageCivilLawsBtn" class="btn" style="font-size: 0.7rem; padding: 4px 12px;">
                        ${_getCheckIcon()} Add Law
                    </button>
                </div>
                <div style="text-align: center; padding: 20px; color: var(--dim); font-size: 0.8rem;">
                    ${_getCrossIcon()} No civil laws established in this settlement.
                </div>
            </div>
        `;
    }
    
    // Group laws by domain
    var domains = {};
    for (var i = 0; i < civilLaws.length; i++) {
        var law = civilLaws[i];
        var domain = law.domain || 'other';
        if (!domains[domain]) domains[domain] = [];
        domains[domain].push(law);
    }
    
    var domainNames = {
        'violence': 'Violence & Crime',
        'property': 'Property & Land',
        'trade': 'Trade & Commerce',
        'family': 'Family & Marriage',
        'religion': 'Religion & Belief',
        'government': 'Government & Administration',
        'military': 'Military & Defense',
        'education': 'Education & Learning',
        'other': 'Other Laws'
    };
    
    var domainIcons = {
        'violence': _getShieldIcon(),
        'property': _getHomeIcon(),
        'trade': _getCircleIcon(),
        'family': _getHeartIcon(),
        'religion': _getStarIcon(),
        'government': _getCrownIcon(),
        'military': _getSwordIcon(),
        'education': _getBookIcon(),
        'other': _getGearIcon()
    };
    
    var html = `
        <div class="civil-laws-section" style="background: var(--bg2); padding: 16px; border-radius: 8px; margin-bottom: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <div style="font-size: 0.8rem; font-weight: bold;">${_getShieldIcon()} Civil Laws (${civilLaws.length})</div>
                <button id="manageCivilLawsBtn" class="btn" style="font-size: 0.7rem; padding: 4px 12px;">
                    ${_getCheckIcon()} Manage Laws
                </button>
            </div>
    `;
    
    for (var domain in domains) {
        if (domains.hasOwnProperty(domain)) {
            var domainLaws = domains[domain];
            var domainName = domainNames[domain] || domain;
            var domainIcon = domainIcons[domain] || _getGearIcon();
            
            html += `
                <div style="margin-bottom: 10px;">
                    <div style="font-size: 0.65rem; color: var(--accent); margin-bottom: 4px;">
                        ${domainIcon} ${_escapeHtml(domainName)}
                    </div>
                    <div style="display: flex; flex-wrap: wrap; gap: 6px;">
            `;
            
            for (var j = 0; j < domainLaws.length; j++) {
                var law = domainLaws[j];
                var severityColor = law.severity === 'mortal' ? 'var(--danger)' :
                                   (law.severity === 'major' ? 'var(--warn)' : 'var(--accent)');
                var lawIcon = law.type === 'taboo' ? _getWarningIcon() :
                             (law.type === 'guideline' ? _getCircleIcon() : _getShieldIcon());
                
                html += `
                    <span style="display: inline-flex; align-items: center; gap: 4px; background: var(--bg); padding: 3px 8px; border-radius: 10px; font-size: 0.6rem; border-left: 2px solid ${severityColor};">
                        ${lawIcon} ${_escapeHtml(law.name)}
                        <span style="color: var(--dim); font-size: 0.5rem;">
                            ${law.isEnforced ? '✓' : '✗'}
                        </span>
                    </span>
                `;
            }
            
            html += `
                    </div>
                </div>
            `;
        }
    }
    
    html += `
        </div>
    `;
    
    return html;
}

// =============================================================================
// 5.2 TRADE & INDUSTRY
// =============================================================================

function renderTradeIndustry(settlement, placeId) {
    // Use settlement data for trade status
    var tradeFeatures = settlement.featureIds ? 
        settlement.featureIds.filter(function(id) { 
            var f = _getFeatureById(id);
            return f && (f.category === 'commercial' || f.category === 'trade');
        }).length : 0;
    
    var tradeStatus = tradeFeatures >= 5 ? 'hub' :
                      tradeFeatures >= 3 ? 'major' :
                      tradeFeatures >= 1 ? 'regional' : 'minor';
    
    var statusColors = {
        minor: 'var(--dim)',
        regional: 'var(--accent)',
        major: 'var(--success)',
        hub: 'var(--success)',
        metropolis: 'var(--gold)'
    };
    
    var statusIcons = {
        minor: _getCircleIcon(),
        regional: _getHomeIcon(),
        major: _getStarIcon(),
        hub: _getStarIcon(),
        metropolis: _getCrownIcon()
    };
    
    var tradeIcon = statusIcons[tradeStatus] || _getCircleIcon();
    var industryIcon = settlement.stateEnterpriseIds && settlement.stateEnterpriseIds.length > 0 ? 
        _getGearIcon() : _getHomeIcon();
    
    var industrialBonus = settlement.stateEnterpriseIds ? 
        settlement.stateEnterpriseIds.length * 0.05 : 0;
    
    return `
        <div class="trade-industry" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px;">
            <div class="trade-section" style="background: var(--bg2); padding: 16px; border-radius: 8px;">
                <div style="font-size: 0.7rem; color: var(--dim); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">
                    ${tradeIcon} Trade Status
                </div>
                <div style="display: flex; align-items: center; gap: 12px;">
                    <span style="font-size: 1.5rem;">${tradeIcon}</span>
                    <div>
                        <div style="font-weight: bold; color: ${statusColors[tradeStatus] || 'var(--dim)'};">
                            ${tradeStatus.charAt(0).toUpperCase() + tradeStatus.slice(1)}
                        </div>
                        <div style="font-size: 0.65rem; color: var(--dim);">
                            ${tradeFeatures} commercial features • ${(tradeFeatures * 5)}% trade bonus
                        </div>
                    </div>
                </div>
            </div>
            <div class="industry-section" style="background: var(--bg2); padding: 16px; border-radius: 8px;">
                <div style="font-size: 0.7rem; color: var(--dim); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">
                    ${industryIcon} Industry
                </div>
                <div style="display: flex; align-items: center; gap: 12px;">
                    <span style="font-size: 1.5rem;">${industryIcon}</span>
                    <div>
                        <div style="font-weight: bold;">
                            ${settlement.stateEnterpriseIds && settlement.stateEnterpriseIds.length > 0 ? 
                                'Industrial (' + settlement.stateEnterpriseIds.length + ' enterprises)' : 
                                'Pre-industrial'}
                        </div>
                        <div style="font-size: 0.65rem; color: var(--dim);">
                            ${settlement.stateEnterpriseIds && settlement.stateEnterpriseIds.length > 0 ? 
                                (industrialBonus * 100).toFixed(0) + '% production bonus' : 
                                'No industrial facilities'}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// =============================================================================
// 5.3 CRIME & JUSTICE
// =============================================================================

function renderCrimeJustice(settlement, placeId, crimeRate) {
    var justiceSeverity = settlement.justiceSeverity || 'medium';
    var hasWatch = settlement.hasWatch || false;
    var watchSize = settlement.watchSize || 0;
    
    var crimeColor = crimeRate < 0.1 ? 'var(--success)' : 
                       crimeRate < 0.2 ? 'var(--accent)' : 
                       crimeRate < 0.3 ? 'var(--warn)' : 'var(--danger)';
    
    var crimeIcon = crimeRate < 0.1 ? _getCheckIcon() : 
                     crimeRate < 0.2 ? _getCircleIcon() : 
                     crimeRate < 0.3 ? _getWarningIcon() : _getCrossIcon();
    
    var severityColor = {
        'lenient': 'var(--accent)',
        'medium': 'var(--warn)',
        'harsh': 'var(--danger)',
        'extreme': 'var(--danger)'
    };
    
    return `
        <div class="crime-justice" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px;">
            <div class="crime-section" style="background: var(--bg2); padding: 16px; border-radius: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <div style="font-size: 0.7rem; color: var(--dim); text-transform: uppercase; letter-spacing: 0.5px;">
                        ${_getShieldIcon()} Crime & Justice
                    </div>
                    <span style="font-size: 0.6rem; color: ${crimeColor};">
                        ${hasWatch ? _getPersonIcon() + ' ' + watchSize + ' watch' : _getCrossIcon() + ' No watch'}
                    </span>
                </div>
                <div style="display: flex; align-items: center; gap: 12px;">
                    <span style="font-size: 1.5rem; color: ${crimeColor};">${crimeIcon}</span>
                    <div>
                        <div style="font-weight: bold; color: ${crimeColor};">
                            ${(crimeRate * 100).toFixed(1)}% crime rate
                        </div>
                        <div style="font-size: 0.65rem; color: var(--dim);">
                            <span style="color: ${severityColor[justiceSeverity] || 'var(--dim)'}">
                                ${_escapeHtml(justiceSeverity.charAt(0).toUpperCase() + justiceSeverity.slice(1))}
                            </span>
                            ${hasWatch ? ' • ' + _getShieldIcon() + ' Protected' : ' • ' + _getCrossIcon() + ' Unprotected'}
                        </div>
                    </div>
                </div>
            </div>
            <div class="education-section" style="background: var(--bg2); padding: 16px; border-radius: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <div style="font-size: 0.7rem; color: var(--dim); text-transform: uppercase; letter-spacing: 0.5px;">
                        ${_getBookIcon()} Education
                    </div>
                    <span style="font-size: 0.6rem; color: var(--accent);">
                        ${settlement.educationBudget > 0 ? _getHomeIcon() + ' Funded' : _getCrossIcon() + ' Unfunded'}
                    </span>
                </div>
                <div style="display: flex; align-items: center; gap: 12px;">
                    <span style="font-size: 1.5rem; color: var(--accent);">${_getBookIcon()}</span>
                    <div>
                        <div style="font-weight: bold; color: var(--accent);">
                            ${settlement.educationBudget || 0} gold/year
                        </div>
                        <div style="font-size: 0.65rem; color: var(--dim);">
                            ${settlement.educationSpending > 0 ? settlement.educationSpending + ' spent' : 'No spending'}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// =============================================================================
// 5.4 BUDGET SECTION
// =============================================================================

function renderBudgetSection(settlement, placeId) {
    var budget = _getSettlementBudget(placeId);
    var employment = _getSettlementEmployment(placeId);
    
    if (!budget) {
        return `
            <div class="budget-section" style="background: var(--bg2); padding: 16px; border-radius: 8px; margin-bottom: 20px;">
                <div style="font-size: 0.8rem; font-weight: bold; margin-bottom: 12px;">${_getCircleIcon()} Budget</div>
                <div style="text-align: center; padding: 20px; color: var(--dim); font-size: 0.8rem;">
                    ${_getCrossIcon()} No budget data available.
                </div>
            </div>
        `;
    }
    
    var totalIncome = budget.totalIncome || 0;
    var totalExpenses = budget.totalExpenses || 0;
    var surplus = budget.annualSurplus || 0;
    var surplusColor = surplus >= 0 ? 'var(--success)' : 'var(--danger)';
    var surplusIcon = surplus >= 0 ? _getCheckIcon() : _getCrossIcon();
    
    var incomeBreakdown = budget.income || {};
    var expenseBreakdown = budget.expenses || {};
    
    return `
        <div class="budget-section" style="background: var(--bg2); padding: 16px; border-radius: 8px; margin-bottom: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <div style="font-size: 0.8rem; font-weight: bold;">${_getCircleIcon()} Budget</div>
                <button id="budgetBtn" class="btn" style="font-size: 0.7rem; padding: 4px 12px;">
                    ${_getGearIcon()} Manage Budget
                </button>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                <div>
                    <div style="font-size: 0.6rem; color: var(--dim); text-transform: uppercase; letter-spacing: 0.5px;">Income</div>
                    <div style="font-size: 1.2rem; font-weight: bold; color: var(--success);">
                        ${totalIncome.toLocaleString()} gold
                    </div>
                    <div style="font-size: 0.6rem; color: var(--dim);">
                        ${incomeBreakdown.taxes ? 'Taxes: ' + incomeBreakdown.taxes.toLocaleString() : ''}
                        ${incomeBreakdown.trade ? ' • Trade: ' + incomeBreakdown.trade.toLocaleString() : ''}
                        ${incomeBreakdown.industry ? ' • Industry: ' + incomeBreakdown.industry.toLocaleString() : ''}
                    </div>
                </div>
                <div>
                    <div style="font-size: 0.6rem; color: var(--dim); text-transform: uppercase; letter-spacing: 0.5px;">Expenses</div>
                    <div style="font-size: 1.2rem; font-weight: bold; color: var(--danger);">
                        ${totalExpenses.toLocaleString()} gold
                    </div>
                    <div style="font-size: 0.6rem; color: var(--dim);">
                        ${expenseBreakdown.maintenance ? 'Maintenance: ' + expenseBreakdown.maintenance.toLocaleString() : ''}
                        ${expenseBreakdown.wages ? ' • Wages: ' + expenseBreakdown.wages.toLocaleString() : ''}
                        ${expenseBreakdown.military ? ' • Military: ' + expenseBreakdown.military.toLocaleString() : ''}
                    </div>
                </div>
            </div>
            <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border); text-align: center;">
                <span style="font-weight: bold; color: ${surplusColor};">
                    ${surplusIcon} Surplus: ${surplus.toLocaleString()} gold
                </span>
                ${employment ? `
                    <span style="margin-left: 16px; color: var(--dim); font-size: 0.7rem;">
                        Employment: ${(employment.employmentRate || 0).toFixed(1)}%
                    </span>
                ` : ''}
                <span style="margin-left: 16px; color: var(--dim); font-size: 0.7rem;">
                    Tax Rate: ${settlement.taxRate || 0}%
                </span>
            </div>
        </div>
    `;
}

// =============================================================================
// 6. ACTION BUTTONS
// =============================================================================

function renderActions(settlement, placeId, canUpgrade, upgradeRequirements) {
    var nextRankName = 'Next Rank';
    if (upgradeRequirements && upgradeRequirements.nextRank) {
        nextRankName = _escapeHtml(upgradeRequirements.nextRank.name);
    }
    
    var requiredPop = upgradeRequirements ? upgradeRequirements.requiredPopulation || 0 : 0;
    var currentPop = settlement.population || 0;
    
    return `
        <div class="settlement-actions" style="display: flex; flex-wrap: wrap; gap: 10px; margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--border);">
            <button id="manageFeaturesBtn2" class="btn primary" style="font-size: 0.8rem;">
                ${_getGearIcon()} Manage Features
            </button>
            <button id="specializationBtn" class="btn" style="font-size: 0.8rem;">
                ${_getStarIcon()} Set Specialization
            </button>
            <button id="budgetBtn2" class="btn" style="font-size: 0.8rem;">
                ${_getCircleIcon()} Budget
            </button>
            <button id="civilLawsBtn" class="btn" style="font-size: 0.8rem;">
                ${_getShieldIcon()} Civil Laws
            </button>
            ${canUpgrade ? `
                <button id="upgradeBtn2" class="btn success" style="font-size: 0.8rem;">
                    ${_getStarIcon()} Upgrade to ${nextRankName}
                </button>
            ` : `
                <button id="upgradeBtn2" class="btn" disabled style="font-size: 0.8rem; opacity: 0.5; cursor: not-allowed;">
                    ${_getWarningIcon()} Need ${requiredPop - currentPop} more people
                </button>
            `}
            <button id="processYearBtn" class="btn" style="font-size: 0.8rem;">
                ${_getRefreshIcon()} Process Year
            </button>
        </div>
    `;
}

// =============================================================================
// 7. HANDLER FUNCTIONS
// =============================================================================

function attachSettlementTabHandlers(placeId, onRefresh) {
    // Manage Features (both buttons)
    var manageBtns = document.querySelectorAll('#manageFeaturesBtn, #manageFeaturesBtn2');
    for (var i = 0; i < manageBtns.length; i++) {
        var btn = manageBtns[i];
        if (!btn._clickAttached) {
            btn.addEventListener('click', function() {
                _openSettlementFeaturesModal(placeId, function() {
                    if (onRefresh) onRefresh();
                });
            });
            btn._clickAttached = true;
        }
    }
    
    // Manage Civil Laws
    var civilLawsBtns = document.querySelectorAll('#manageCivilLawsBtn, #civilLawsBtn');
    for (var i = 0; i < civilLawsBtns.length; i++) {
        var btn = civilLawsBtns[i];
        if (!btn._clickAttached) {
            btn.addEventListener('click', function() {
                _openManageCivilLawsModal(placeId, function() {
                    if (onRefresh) onRefresh();
                });
            });
            btn._clickAttached = true;
        }
    }
    
    // Budget buttons
    var budgetBtns = document.querySelectorAll('#budgetBtn, #budgetBtn2');
    for (var i = 0; i < budgetBtns.length; i++) {
        var btn = budgetBtns[i];
        if (!btn._clickAttached) {
            btn.addEventListener('click', function() {
                _openSettlementBudgetModal(placeId);
            });
            btn._clickAttached = true;
        }
    }
    
    // Specialization button
    var specBtn = document.getElementById('specializationBtn');
    if (specBtn && !specBtn._clickAttached) {
        specBtn.addEventListener('click', function() {
            _openSettlementSpecializationModal(placeId, function() {
                if (onRefresh) onRefresh();
            });
        });
        specBtn._clickAttached = true;
    }
    
    // Upgrade buttons
    var upgradeBtns = document.querySelectorAll('#upgradeBtn, #upgradeBtn2');
    for (var i = 0; i < upgradeBtns.length; i++) {
        var btn = upgradeBtns[i];
        if (!btn._clickAttached && !btn.disabled) {
            btn.addEventListener('click', function() {
                _openSettlementUpgradeModal(placeId, function() {
                    if (onRefresh) onRefresh();
                });
            });
            btn._clickAttached = true;
        }
    }
    
    // Process Year button
    var processBtn = document.getElementById('processYearBtn');
    if (processBtn && !processBtn._clickAttached) {
        processBtn.addEventListener('click', function() {
            var result = _processAnnualSettlementUpdate(placeId);
            if (result) {
                _showToast(_getCheckIcon() + ' Year processed: ' + result.summary, 'success');
                if (onRefresh) onRefresh();
            } else {
                _showToast(_getCrossIcon() + ' Failed to process year', 'error');
            }
        });
        processBtn._clickAttached = true;
    }
}

// =============================================================================
// 8. EXPORTS
// =============================================================================

window.renderSettlementTab = renderSettlementTab;
window.attachSettlementTabHandlers = attachSettlementTabHandlers;

// ES Module exports
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        renderSettlementTab: renderSettlementTab,
        attachSettlementTabHandlers: attachSettlementTabHandlers
    };
}
