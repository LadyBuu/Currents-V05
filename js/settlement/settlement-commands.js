/**
 * =============================================================================
 * SETTLEMENT COMMANDS - All write operations for settlement management
 * =============================================================================
 * 
 * This file contains ALL write operations for settlement management:
 * - Feature management (build, remove, demolish)
 * - Settlement management (upgrade, specialization)
 * - State enterprise management
 * - Tax/rate management
 * - Justice/watch management
 * - ANNUAL PROCESSING (processAnnualSettlementUpdate, processAllSettlements)
 * - SETTLEMENT ROLE COMMANDS (NEW)
 * 
 * DEPENDENCIES:
 *   - settlement-state.js (SettlementState)
 *   - settlement-economy.js (SettlementEconomy)
 *   - accessors.js (getPlaceById, getCharacterById, getCurrentYear)
 *   - eventLogger.js (logEvent)
 *   - storage.js (saveMasterData)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARD
    // =========================================================================

    var _processingCommand = false;

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getPlaceById(id) {
        return typeof window.getPlaceById === 'function' ? window.getPlaceById(id) : null;
    }

    function _getPlaces() {
        return typeof window.getPlaces === 'function' ? window.getPlaces() : [];
    }

    function _getCharacterById(id) {
        return typeof window.getCharacterById === 'function' ? window.getCharacterById(id) : null;
    }

    function _getCharacters() {
        return typeof window.getCharacters === 'function' ? window.getCharacters() : [];
    }

    function _getCurrentYear() {
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

    function _saveMasterData() {
        if (typeof window.saveMasterData === 'function') window.saveMasterData();
    }

    function _logEvent(category, type, message, subjects) {
        if (typeof window.logEvent === 'function') {
            window.logEvent(category, type, message, subjects);
        }
    }

    function _showToast(message, type) {
        if (typeof window.showToast === 'function') {
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

    function _getRoleById(id) {
        if (typeof window.getRoleById === 'function') {
            return window.getRoleById(id);
        }
        return null;
    }

    function _getSettlementRanks() {
        return SettlementState._getAllRanks();
    }

    function _getSettlementData(locationId) {
        return SettlementState.getSettlementData(locationId);
    }

    function _getSettlementFeatures(locationId) {
        return SettlementState.getSettlementFeatures(locationId);
    }

    function _getStateEnterpriseIds(locationId) {
        return SettlementState.getStateEnterpriseIds(locationId);
    }

    function _getAllSubLocationIds(locationId) {
        if (typeof LocationState !== 'undefined' && LocationState.getAllSubLocationIds) {
            return LocationState.getAllSubLocationIds(locationId);
        }
        return [locationId];
    }

    function _getCurrentLocationId(character) {
        if (!character) return null;

        if (character.moves && character.moves.length > 0) {
            var sortedMoves = character.moves.slice().sort(function(a, b) {
                return (b.year || 0) - (a.year || 0);
            });
            var lastMove = sortedMoves[0];
            if (lastMove && lastMove.locationId) {
                return lastMove.locationId;
            }
        }

        if (character.currentLocationId) return character.currentLocationId;
        if (character.birthplaceId) return character.birthplaceId;

        return null;
    }

    // =========================================================================
    // 3. VALIDATION HELPERS
    // =========================================================================

    function _validateFeature(locationId, featureId) {
        var place = _getPlaceById(locationId);
        if (!place) {
            return { valid: false, reason: 'Location not found' };
        }

        var features = SettlementState._getAllFeatures();
        var feature = features.find(function(f) { return f.id === featureId; });
        if (!feature) {
            return { valid: false, reason: 'Feature not found' };
        }

        var data = _getSettlementData(locationId);
        if (!data) {
            return { valid: false, reason: 'Settlement data not found' };
        }

        if (data.featureIds && data.featureIds.indexOf(featureId) !== -1) {
            return { valid: false, reason: 'Feature already built' };
        }

        return { valid: true, feature: feature };
    }

    // =========================================================================
    // 4. FEATURE COMMANDS
    // =========================================================================

    function buildFeature(locationId, featureId) {
        if (_processingCommand) {
            return { success: false, reason: 'Command already processing' };
        }
        _processingCommand = true;

        try {
            var validation = _validateFeature(locationId, featureId);
            if (!validation.valid) {
                _showToast(validation.reason, 'error');
                return { success: false, reason: validation.reason };
            }

            var feature = validation.feature;
            var data = _getSettlementData(locationId);

            var wealth = data.wealth || 0;
            var cost = feature.cost || 0;

            data.wealth = wealth - cost;
            if (data.wealth < 0) {
                data.totalDebt = Math.abs(data.wealth);
            }

            SettlementState._addFeature(locationId, featureId);

            SettlementState._addHistoryEntry(locationId, {
                year: _getCurrentYear(),
                type: 'feature_built',
                featureId: featureId,
                featureName: feature.name,
                cost: cost,
                newWealth: data.wealth,
                newDebt: data.totalDebt
            });

            _logEvent('settlement', 'feature_built',
                'Built "' + feature.name + '" at ' + (_getPlaceById(locationId)?.displayName || 'Unknown'),
                []);

            _showToast('Built "' + feature.name + '"', 'success');
            return { success: true, data: { featureId: featureId, cost: cost, newWealth: data.wealth } };

        } finally {
            _processingCommand = false;
        }
    }

    function removeFeature(locationId, featureId) {
        if (_processingCommand) {
            return { success: false, reason: 'Command already processing' };
        }
        _processingCommand = true;

        try {
            var features = _getSettlementFeatures(locationId);
            var feature = features.find(function(f) { return f.id === featureId; });
            if (!feature) {
                _showToast('Feature not found', 'error');
                return { success: false, reason: 'Feature not found' };
            }

            var refund = feature.cost || 0;
            var data = _getSettlementData(locationId);

            data.wealth = (data.wealth || 0) + refund;
            if (data.wealth < 0) {
                data.totalDebt = Math.abs(data.wealth);
            } else {
                data.totalDebt = 0;
            }

            SettlementState._removeFeature(locationId, featureId);

            SettlementState._addHistoryEntry(locationId, {
                year: _getCurrentYear(),
                type: 'feature_removed',
                featureId: featureId,
                featureName: feature.name,
                refund: refund,
                newWealth: data.wealth,
                newDebt: data.totalDebt
            });

            _logEvent('settlement', 'feature_removed',
                'Removed "' + feature.name + '" from ' + (_getPlaceById(locationId)?.displayName || 'Unknown'),
                []);

            _showToast('Removed "' + feature.name + '" - ' + refund + ' gold refunded', 'info');
            return { success: true, data: { featureId: featureId, refund: refund, newWealth: data.wealth } };

        } finally {
            _processingCommand = false;
        }
    }

    function demolishFeature(locationId, featureId) {
        if (_processingCommand) {
            return { success: false, reason: 'Command already processing' };
        }
        _processingCommand = true;

        try {
            var features = _getSettlementFeatures(locationId);
            var feature = features.find(function(f) { return f.id === featureId; });
            if (!feature) {
                _showToast('Feature not found', 'error');
                return { success: false, reason: 'Feature not found' };
            }

            SettlementState._removeFeature(locationId, featureId);

            SettlementState._addHistoryEntry(locationId, {
                year: _getCurrentYear(),
                type: 'feature_demolished',
                featureId: featureId,
                featureName: feature.name,
                newWealth: (_getSettlementData(locationId) || {}).wealth || 0,
                newDebt: (_getSettlementData(locationId) || {}).totalDebt || 0
            });

            _logEvent('settlement', 'feature_demolished',
                'Demolished "' + feature.name + '" at ' + (_getPlaceById(locationId)?.displayName || 'Unknown'),
                []);

            _showToast('Demolished "' + feature.name + '"', 'warning');
            return { success: true, data: { featureId: featureId } };

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 5. UPGRADE COMMANDS
    // =========================================================================

    function upgradeSettlement(locationId) {
        if (_processingCommand) {
            return { success: false, reason: 'Command already processing' };
        }
        _processingCommand = true;

        try {
            var place = _getPlaceById(locationId);
            if (!place) {
                _showToast('Location not found', 'error');
                return { success: false, reason: 'Location not found' };
            }

            var data = _getSettlementData(locationId);
            if (!data) {
                _showToast('Settlement data not found', 'error');
                return { success: false, reason: 'Settlement data not found' };
            }

            var ranks = _getSettlementRanks();
            var currentRank = ranks.find(function(r) { return r.id === data.rankId; });
            if (!currentRank) {
                _showToast('Current rank not found', 'error');
                return { success: false, reason: 'Current rank not found' };
            }

            var sortedRanks = ranks.slice().sort(function(a, b) { return a.order - b.order; });
            var currentIndex = sortedRanks.findIndex(function(r) { return r.id === data.rankId; });
            if (currentIndex === -1 || currentIndex >= sortedRanks.length - 1) {
                _showToast('Already at maximum rank', 'info');
                return { success: false, reason: 'Already at maximum rank' };
            }

            var nextRank = sortedRanks[currentIndex + 1];
            var population = _getLocationPopulationCount(locationId);

            if (population < nextRank.minPopulation) {
                _showToast('Need ' + (nextRank.minPopulation - population) + ' more people', 'warning');
                return { success: false, reason: 'Not enough population' };
            }

            var oldRank = data.rankId;
            data.rankId = nextRank.id;
            data.lastUpgraded = _getCurrentYear();

            SettlementState._updateSettlementData(locationId, {
                rankId: nextRank.id,
                lastUpgraded: data.lastUpgraded
            });

            SettlementState._addHistoryEntry(locationId, {
                year: _getCurrentYear(),
                type: 'upgraded',
                fromRank: oldRank,
                toRank: nextRank.id,
                population: population
            });

            _logEvent('settlement', 'upgraded',
                place.displayName + ' upgraded from ' + oldRank + ' to ' + nextRank.id,
                []);

            _showToast(place.displayName + ' upgraded to ' + nextRank.name + '!', 'success');
            return { success: true, data: { oldRank: oldRank, newRank: nextRank.id, population: population } };

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 6. SPECIALIZATION COMMANDS
    // =========================================================================

    function setSpecialization(locationId, roleId) {
        if (_processingCommand) {
            return { success: false, reason: 'Command already processing' };
        }
        _processingCommand = true;

        try {
            var place = _getPlaceById(locationId);
            if (!place) {
                _showToast('Location not found', 'error');
                return { success: false, reason: 'Location not found' };
            }

            if (roleId) {
                var role = _getRoleById(roleId);
                if (!role) {
                    _showToast('Role not found', 'error');
                    return { success: false, reason: 'Role not found' };
                }
            }

            var data = _getSettlementData(locationId);
            if (!data) {
                _showToast('Settlement data not found', 'error');
                return { success: false, reason: 'Settlement data not found' };
            }

            var oldRole = data.specializationRoleId;
            data.specializationRoleId = roleId || null;

            SettlementState._updateSettlementData(locationId, {
                specializationRoleId: data.specializationRoleId
            });

            SettlementState._addHistoryEntry(locationId, {
                year: _getCurrentYear(),
                type: 'specialization_set',
                oldRole: oldRole,
                newRole: roleId
            });

            _logEvent('settlement', 'specialization_set',
                place.displayName + ' specialization set to ' + (roleId || 'none'),
                []);

            _showToast('Specialization set', 'success');
            return { success: true, data: { oldRole: oldRole, newRole: roleId } };

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 7. WEALTH & DEBT COMMANDS
    // =========================================================================

    function updateWealth(locationId, delta, reason) {
        if (_processingCommand) {
            return { success: false, reason: 'Command already processing' };
        }
        _processingCommand = true;

        try {
            var data = _getSettlementData(locationId);
            if (!data) {
                return { success: false, reason: 'Settlement data not found' };
            }

            data.wealth = (data.wealth || 0) + delta;
            if (data.wealth < 0) {
                data.totalDebt = Math.abs(data.wealth);
            } else {
                data.totalDebt = 0;
            }

            SettlementState._updateSettlementData(locationId, {
                wealth: data.wealth,
                totalDebt: data.totalDebt
            });

            SettlementState._addHistoryEntry(locationId, {
                year: _getCurrentYear(),
                type: 'wealth_change',
                amount: delta,
                reason: reason || 'Wealth adjustment',
                newWealth: data.wealth,
                newDebt: data.totalDebt
            });

            return { success: true, data: { newWealth: data.wealth, newDebt: data.totalDebt } };

        } finally {
            _processingCommand = false;
        }
    }

    function updateDebt(locationId, delta, reason) {
        if (_processingCommand) {
            return { success: false, reason: 'Command already processing' };
        }
        _processingCommand = true;

        try {
            var data = _getSettlementData(locationId);
            if (!data) {
                return { success: false, reason: 'Settlement data not found' };
            }

            data.totalDebt = Math.max(0, (data.totalDebt || 0) + delta);

            SettlementState._updateSettlementData(locationId, {
                totalDebt: data.totalDebt
            });

            SettlementState._addHistoryEntry(locationId, {
                year: _getCurrentYear(),
                type: 'debt_change',
                amount: delta,
                reason: reason || 'Debt adjustment',
                newDebt: data.totalDebt
            });

            return { success: true, data: { newDebt: data.totalDebt } };

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 8. TAX & RATE COMMANDS
    // =========================================================================

    function updateTaxRate(locationId, rate) {
        if (_processingCommand) {
            return { success: false, reason: 'Command already processing' };
        }
        _processingCommand = true;

        try {
            if (rate < 0 || rate > 50) {
                _showToast('Tax rate must be between 0 and 50', 'error');
                return { success: false, reason: 'Invalid tax rate' };
            }

            var data = _getSettlementData(locationId);
            if (!data) {
                return { success: false, reason: 'Settlement data not found' };
            }

            var oldRate = data.taxRate;
            data.taxRate = rate;

            SettlementState._updateSettlementData(locationId, { taxRate: rate });

            SettlementState._addHistoryEntry(locationId, {
                year: _getCurrentYear(),
                type: 'tax_rate_change',
                oldRate: oldRate,
                newRate: rate
            });

            _showToast('Tax rate updated to ' + rate + '%', 'success');
            return { success: true, data: { oldRate: oldRate, newRate: rate } };

        } finally {
            _processingCommand = false;
        }
    }

    function updateTradeTariff(locationId, tariff) {
        if (_processingCommand) {
            return { success: false, reason: 'Command already processing' };
        }
        _processingCommand = true;

        try {
            if (tariff < 0 || tariff > 30) {
                _showToast('Trade tariff must be between 0 and 30', 'error');
                return { success: false, reason: 'Invalid trade tariff' };
            }

            var data = _getSettlementData(locationId);
            if (!data) {
                return { success: false, reason: 'Settlement data not found' };
            }

            var oldTariff = data.tradeTariff;
            data.tradeTariff = tariff;

            SettlementState._updateSettlementData(locationId, { tradeTariff: tariff });

            SettlementState._addHistoryEntry(locationId, {
                year: _getCurrentYear(),
                type: 'trade_tariff_change',
                oldTariff: oldTariff,
                newTariff: tariff
            });

            _showToast('Trade tariff updated to ' + tariff + '%', 'success');
            return { success: true, data: { oldTariff: oldTariff, newTariff: tariff } };

        } finally {
            _processingCommand = false;
        }
    }

    function updateIndustryTaxRate(locationId, rate) {
        if (_processingCommand) {
            return { success: false, reason: 'Command already processing' };
        }
        _processingCommand = true;

        try {
            if (rate < 0 || rate > 30) {
                _showToast('Industry tax rate must be between 0 and 30', 'error');
                return { success: false, reason: 'Invalid industry tax rate' };
            }

            var data = _getSettlementData(locationId);
            if (!data) {
                return { success: false, reason: 'Settlement data not found' };
            }

            var oldRate = data.industryTaxRate;
            data.industryTaxRate = rate;

            SettlementState._updateSettlementData(locationId, { industryTaxRate: rate });

            SettlementState._addHistoryEntry(locationId, {
                year: _getCurrentYear(),
                type: 'industry_tax_rate_change',
                oldRate: oldRate,
                newRate: rate
            });

            _showToast('Industry tax rate updated to ' + rate + '%', 'success');
            return { success: true, data: { oldRate: oldRate, newRate: rate } };

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 9. SPENDING COMMANDS
    // =========================================================================

    function updateMilitarySpending(locationId, amount) {
        if (_processingCommand) {
            return { success: false, reason: 'Command already processing' };
        }
        _processingCommand = true;

        try {
            if (amount < 0) {
                _showToast('Spending cannot be negative', 'error');
                return { success: false, reason: 'Invalid spending amount' };
            }

            var data = _getSettlementData(locationId);
            if (!data) {
                return { success: false, reason: 'Settlement data not found' };
            }

            data.militarySpending = amount;

            SettlementState._updateSettlementData(locationId, { militarySpending: amount });

            _showToast('Military spending updated', 'success');
            return { success: true, data: { militarySpending: amount } };

        } finally {
            _processingCommand = false;
        }
    }

    function updateInfrastructureSpending(locationId, amount) {
        if (_processingCommand) {
            return { success: false, reason: 'Command already processing' };
        }
        _processingCommand = true;

        try {
            if (amount < 0) {
                _showToast('Spending cannot be negative', 'error');
                return { success: false, reason: 'Invalid spending amount' };
            }

            var data = _getSettlementData(locationId);
            if (!data) {
                return { success: false, reason: 'Settlement data not found' };
            }

            data.infrastructureSpending = amount;

            SettlementState._updateSettlementData(locationId, { infrastructureSpending: amount });

            _showToast('Infrastructure spending updated', 'success');
            return { success: true, data: { infrastructureSpending: amount } };

        } finally {
            _processingCommand = false;
        }
    }

    function updateEducationSpending(locationId, amount) {
        if (_processingCommand) {
            return { success: false, reason: 'Command already processing' };
        }
        _processingCommand = true;

        try {
            if (amount < 0) {
                _showToast('Spending cannot be negative', 'error');
                return { success: false, reason: 'Invalid spending amount' };
            }

            var data = _getSettlementData(locationId);
            if (!data) {
                return { success: false, reason: 'Settlement data not found' };
            }

            data.educationSpending = amount;

            SettlementState._updateSettlementData(locationId, { educationSpending: amount });

            _showToast('Education spending updated', 'success');
            return { success: true, data: { educationSpending: amount } };

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 10. JUSTICE & WATCH COMMANDS
    // =========================================================================

    function updateJusticeSeverity(locationId, severity) {
        if (_processingCommand) {
            return { success: false, reason: 'Command already processing' };
        }
        _processingCommand = true;

        try {
            var validSeverities = ['lenient', 'medium', 'harsh', 'extreme'];
            if (validSeverities.indexOf(severity) === -1) {
                _showToast('Invalid severity. Options: lenient, medium, harsh, extreme', 'error');
                return { success: false, reason: 'Invalid severity' };
            }

            var data = _getSettlementData(locationId);
            if (!data) {
                return { success: false, reason: 'Settlement data not found' };
            }

            data.justiceSeverity = severity;

            SettlementState._updateSettlementData(locationId, { justiceSeverity: severity });

            _showToast('Justice severity updated to ' + severity, 'success');
            return { success: true, data: { justiceSeverity: severity } };

        } finally {
            _processingCommand = false;
        }
    }

    function updateWatch(locationId, hasWatch, size) {
        if (_processingCommand) {
            return { success: false, reason: 'Command already processing' };
        }
        _processingCommand = true;

        try {
            if (hasWatch && (!size || size < 1)) {
                _showToast('Watch size must be at least 1', 'error');
                return { success: false, reason: 'Invalid watch size' };
            }

            var data = _getSettlementData(locationId);
            if (!data) {
                return { success: false, reason: 'Settlement data not found' };
            }

            data.hasWatch = !!hasWatch;
            data.watchSize = hasWatch ? (size || 0) : 0;

            SettlementState._updateSettlementData(locationId, {
                hasWatch: data.hasWatch,
                watchSize: data.watchSize
            });

            _showToast(hasWatch ? 'Watch established with ' + size + ' members' : 'Watch disbanded', 'success');
            return { success: true, data: { hasWatch: data.hasWatch, watchSize: data.watchSize } };

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 11. STATE ENTERPRISE COMMANDS
    // =========================================================================

    function createStateEnterprise(locationId, data) {
        if (_processingCommand) {
            return { success: false, reason: 'Command already processing' };
        }
        _processingCommand = true;

        try {
            if (typeof window.IndustryCommands === 'undefined') {
                _showToast('Industry system not available', 'error');
                return { success: false, reason: 'Industry system not available' };
            }

            data = data || {};
            data.ownerType = 'state';
            data.ownerId = locationId;
            data.ownerName = 'State of ' + (_getPlaceById(locationId)?.displayName || 'Unknown');

            var result = window.IndustryCommands.createEnterprise(data);
            if (result && result.success) {
                SettlementState._addStateEnterprise(locationId, result.data.id);

                SettlementState._addHistoryEntry(locationId, {
                    year: _getCurrentYear(),
                    type: 'state_enterprise_created',
                    enterpriseId: result.data.id,
                    enterpriseName: result.data.name
                });

                _logEvent('settlement', 'state_enterprise_created',
                    'Created state enterprise "' + result.data.name + '" at ' + (_getPlaceById(locationId)?.displayName || 'Unknown'),
                    []);

                _showToast('State enterprise created: ' + result.data.name, 'success');
                return { success: true, data: result.data };
            } else {
                _showToast('Failed to create state enterprise: ' + (result ? result.reason : 'Unknown error'), 'error');
                return { success: false, reason: result ? result.reason : 'Unknown error' };
            }

        } finally {
            _processingCommand = false;
        }
    }

    function removeStateEnterprise(locationId, enterpriseId) {
        if (_processingCommand) {
            return { success: false, reason: 'Command already processing' };
        }
        _processingCommand = true;

        try {
            var result = SettlementState._removeStateEnterprise(locationId, enterpriseId);
            if (result) {
                SettlementState._addHistoryEntry(locationId, {
                    year: _getCurrentYear(),
                    type: 'state_enterprise_removed',
                    enterpriseId: enterpriseId
                });

                _showToast('State enterprise removed', 'info');
                return { success: true };
            }

            _showToast('Failed to remove state enterprise', 'error');
            return { success: false, reason: 'Enterprise not found' };

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 12. SETTLEMENT ROLE COMMANDS (NEW)
    // =========================================================================

    /**
     * Assigns a role to a character at a settlement
     * @param {string} locationId - Settlement location ID
     * @param {string} characterId - Character ID
     * @param {string} roleId - Role ID
     * @param {Object} options - Assignment options
     * @returns {Object} Result object
     */
    function assignSettlementRole(locationId, characterId, roleId, options) {
        if (_processingCommand) {
            return { success: false, reason: 'Command already processing' };
        }
        _processingCommand = true;

        try {
            var place = _getPlaceById(locationId);
            if (!place) {
                _showToast('Location not found', 'error');
                return { success: false, reason: 'Location not found' };
            }

            var character = _getCharacterById(characterId);
            if (!character) {
                _showToast('Character not found', 'error');
                return { success: false, reason: 'Character not found' };
            }

            var role = _getRoleById(roleId);
            if (!role) {
                _showToast('Role not found', 'error');
                return { success: false, reason: 'Role not found' };
            }

            // Check if character is at this settlement
            var charLocationId = _getCurrentLocationId(character);
            var locationIds = _getAllSubLocationIds(locationId);
            var locationIdSet = new Set(locationIds);

            if (!charLocationId || !locationIdSet.has(charLocationId)) {
                _showToast('Character is not located in this settlement', 'warning');
                return { success: false, reason: 'Character not at location' };
            }

            // Use RoleCommands to assign
            if (typeof window.RoleCommands !== 'undefined' && 
                window.RoleCommands.assignRoleToCharacter) {
                var result = window.RoleCommands.assignRoleToCharacter(characterId, roleId, options);
                if (result && result.success) {
                    _logEvent('settlement', 'role_assigned',
                        'Assigned ' + role.name + ' to ' + character.name + ' at ' + place.displayName,
                        [character]);
                    _showToast('Assigned ' + role.name + ' to ' + character.name, 'success');
                    return result;
                } else {
                    _showToast('Failed to assign role: ' + (result?.reason || 'Unknown error'), 'error');
                    return result || { success: false, reason: 'Assignment failed' };
                }
            }

            return { success: false, reason: 'Role assignment not available' };

        } finally {
            _processingCommand = false;
        }
    }

    /**
     * Removes a role from a character at a settlement
     * @param {string} locationId - Settlement location ID
     * @param {string} characterId - Character ID
     * @param {string} roleId - Role ID
     * @returns {Object} Result object
     */
    function removeSettlementRole(locationId, characterId, roleId) {
        if (_processingCommand) {
            return { success: false, reason: 'Command already processing' };
        }
        _processingCommand = true;

        try {
            var place = _getPlaceById(locationId);
            if (!place) {
                _showToast('Location not found', 'error');
                return { success: false, reason: 'Location not found' };
            }

            var character = _getCharacterById(characterId);
            if (!character) {
                _showToast('Character not found', 'error');
                return { success: false, reason: 'Character not found' };
            }

            var role = _getRoleById(roleId);
            if (!role) {
                _showToast('Role not found', 'error');
                return { success: false, reason: 'Role not found' };
            }

            // Use RoleCommands to remove
            if (typeof window.RoleCommands !== 'undefined' && 
                window.RoleCommands.removeRoleFromCharacter) {
                var result = window.RoleCommands.removeRoleFromCharacter(characterId, roleId);
                if (result && result.success) {
                    _logEvent('settlement', 'role_removed',
                        'Removed ' + role.name + ' from ' + character.name + ' at ' + place.displayName,
                        [character]);
                    _showToast('Removed ' + role.name + ' from ' + character.name, 'info');
                    return result;
                } else {
                    _showToast('Failed to remove role: ' + (result?.reason || 'Unknown error'), 'error');
                    return result || { success: false, reason: 'Removal failed' };
                }
            }

            return { success: false, reason: 'Role removal not available' };

        } finally {
            _processingCommand = false;
        }
    }

    /**
     * Updates skill level for a character's role at a settlement
     * @param {string} locationId - Settlement location ID
     * @param {string} characterId - Character ID
     * @param {string} roleId - Role ID
     * @param {number} skillLevel - New skill level (0-100)
     * @returns {Object} Result object
     */
    function updateSettlementCharacterSkill(locationId, characterId, roleId, skillLevel) {
        if (_processingCommand) {
            return { success: false, reason: 'Command already processing' };
        }
        _processingCommand = true;

        try {
            var place = _getPlaceById(locationId);
            if (!place) {
                _showToast('Location not found', 'error');
                return { success: false, reason: 'Location not found' };
            }

            var character = _getCharacterById(characterId);
            if (!character) {
                _showToast('Character not found', 'error');
                return { success: false, reason: 'Character not found' };
            }

            // Use RoleCommands to update skill
            if (typeof window.RoleCommands !== 'undefined' && 
                window.RoleCommands.updateCharacterSkill) {
                var result = window.RoleCommands.updateCharacterSkill(characterId, roleId, skillLevel);
                if (result && result.success) {
                    _logEvent('settlement', 'skill_updated',
                        'Updated ' + character.name + '\'s skill to ' + skillLevel + ' at ' + place.displayName,
                        [character]);
                    _showToast('Skill updated to ' + skillLevel, 'success');
                    return result;
                } else {
                    _showToast('Failed to update skill: ' + (result?.reason || 'Unknown error'), 'error');
                    return result || { success: false, reason: 'Update failed' };
                }
            }

            return { success: false, reason: 'Skill update not available' };

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 13. ANNUAL PROCESSING - CRITICAL
    // =========================================================================

    function processAnnualSettlementUpdate(locationId) {
        if (_processingCommand) {
            return { success: false, reason: 'Command already processing' };
        }
        _processingCommand = true;

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
            var taxIncome = SettlementEconomy.calculateTaxIncome(locationId);
            var tradeIncome = SettlementEconomy.calculateTradeIncome(locationId);
            var industryIncome = SettlementEconomy.calculateIndustryIncome(locationId);
            var stateIncome = SettlementEconomy.calculateStateEnterpriseIncome(locationId);
            var totalIncome = taxIncome + tradeIncome + industryIncome + stateIncome;

            // 3. Calculate expenses
            var maintenance = SettlementEconomy.calculateMaintenanceCosts(locationId);
            var wages = SettlementEconomy.calculateWageCosts(locationId);
            var spending = SettlementEconomy.calculateSpendingCosts(locationId);
            var totalExpenses = maintenance + wages + spending;

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
                    other: 0
                },
                expenses: {
                    maintenance: Math.floor(maintenance),
                    wages: Math.floor(wages),
                    construction: 0,
                    military: data.militarySpending || 0,
                    education: data.educationSpending || 0,
                    infrastructure: data.infrastructureSpending || 0,
                    other: 0
                },
                annualSurplus: Math.floor(surplus),
                totalIncome: Math.floor(totalIncome),
                totalExpenses: Math.floor(totalExpenses)
            };

            // 8. Update prosperity (includes role factors)
            var prosperity = SettlementEconomy.calculateProsperity(locationId);
            data.prosperity = prosperity;

            // 9. Update employment
            var employment = SettlementEconomy.calculateEmployment(locationId);
            data.employment = employment;

            // 10. Update crime rate
            var crimeRate = SettlementEconomy.calculateCrimeRate(locationId);
            data.crimeRate = crimeRate;

            // 11. Update rank
            var currentRank = _getSettlementRanks().find(function(r) { return r.id === data.rankId; });
            var newRank = null;
            for (var i = 0; i < _getSettlementRanks().length; i++) {
                var r = _getSettlementRanks()[i];
                var pop = _getLocationPopulationCount(locationId);
                if (pop >= r.minPopulation && pop <= r.maxPopulation) {
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
                    population: _getLocationPopulationCount(locationId)
                });
            }

            // 12. Save all changes
            SettlementState._updateSettlementData(locationId, {
                wealth: data.wealth,
                totalDebt: data.totalDebt,
                budget: data.budget,
                prosperity: data.prosperity,
                employment: data.employment,
                crimeRate: data.crimeRate,
                rankId: data.rankId,
                lastUpgraded: data.lastUpgraded
            });

            // 13. Log event
            _logEvent('settlement', 'annual_processed',
                place.displayName + ' processed: ' + Math.floor(totalIncome) + ' income, ' +
                Math.floor(totalExpenses) + ' expenses, ' +
                (surplus >= 0 ? '+' : '') + Math.floor(surplus) + ' surplus' +
                ' (Prosperity: ' + prosperity + '%)',
                []);

            return {
                success: true,
                locationId: locationId,
                year: _getCurrentYear(),
                rank: data.rankId,
                prosperity: data.prosperity,
                surplus: Math.floor(surplus),
                wealth: data.wealth,
                debt: data.totalDebt,
                employment: data.employment,
                crimeRate: data.crimeRate,
                summary: 'Settlement processed: Prosperity ' + data.prosperity + '%, Surplus ' +
                    Math.floor(surplus) + ' gold' +
                    (data.totalDebt > 0 ? ' (Debt: ' + data.totalDebt + ' gold)' : '')
            };

        } finally {
            _processingCommand = false;
        }
    }

    function processAllSettlements() {
        if (_processingCommand) {
            return { success: false, reason: 'Command already processing' };
        }
        _processingCommand = true;

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
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 14. EXPORTS
    // =========================================================================

    window.SettlementCommands = {
        buildFeature: buildFeature,
        removeFeature: removeFeature,
        demolishFeature: demolishFeature,
        upgradeSettlement: upgradeSettlement,
        setSpecialization: setSpecialization,
        updateWealth: updateWealth,
        updateDebt: updateDebt,
        updateTaxRate: updateTaxRate,
        updateTradeTariff: updateTradeTariff,
        updateIndustryTaxRate: updateIndustryTaxRate,
        updateMilitarySpending: updateMilitarySpending,
        updateInfrastructureSpending: updateInfrastructureSpending,
        updateEducationSpending: updateEducationSpending,
        updateJusticeSeverity: updateJusticeSeverity,
        updateWatch: updateWatch,
        createStateEnterprise: createStateEnterprise,
        removeStateEnterprise: removeStateEnterprise,
        processAnnualSettlementUpdate: processAnnualSettlementUpdate,
        processAllSettlements: processAllSettlements,
        validateFeature: _validateFeature,
        // NEW: Role-settlement commands
        assignSettlementRole: assignSettlementRole,
        removeSettlementRole: removeSettlementRole,
        updateSettlementCharacterSkill: updateSettlementCharacterSkill
    };

})();