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
 * - SETTLEMENT ROLE COMMANDS
 * - SETTLEMENT EDUCATION SPENDING (ENHANCED)
 * - BUDGET ALLOCATION
 * - PUBLIC ENTERPRISE PROFIT COLLECTION
 * - DEMOLISHED FEATURES TRACKING
 * - PLACES OF WORSHIP MANAGEMENT (NEW)
 * - RELIGIOUS UNITY CALCULATION (NEW)
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

    function _getSettlementEducationStats(locationId) {
        if (typeof SettlementQueries !== 'undefined' && SettlementQueries.getSettlementEducationStats) {
            return SettlementQueries.getSettlementEducationStats(locationId);
        }
        return null;
    }

    function _getPlaceOfWorship(placeId) {
        if (typeof window.ReligionCommands !== 'undefined' &&
            typeof window.ReligionCommands.getPlaceOfWorship === 'function') {
            return window.ReligionCommands.getPlaceOfWorship(placeId);
        }
        return null;
    }

    function _getReligion(religionId) {
        if (typeof window.ReligionState !== 'undefined' &&
            typeof window.ReligionState.getReligion === 'function') {
            return window.ReligionState.getReligion(religionId);
        }
        return null;
    }

    function _getReligionQueries() {
        return typeof window.ReligionQueries !== 'undefined' ? window.ReligionQueries : null;
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

            var demolitionRecord = {
                featureId: featureId,
                featureName: feature.name,
                category: feature.category || 'uncategorized',
                demolishedAt: _getCurrentYear(),
                demolishedReason: 'Demolished',
                destroyedBy: 'manual',
                disasterId: null,
                timestamp: Date.now()
            };

            SettlementState._removeFeature(locationId, featureId);

            recordFeatureDemolition(locationId, featureId, demolitionRecord);

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

            var oldAmount = data.educationSpending || 0;
            data.educationSpending = amount;

            SettlementState._updateSettlementData(locationId, { educationSpending: amount });

            _logEvent('settlement', 'education_spending_changed',
                'Education spending for ' + (_getPlaceById(locationId)?.displayName || 'Unknown') + 
                ' changed from ' + oldAmount + ' to ' + amount,
                []);

            _showToast('Education spending updated to ' + amount + ' gold/year', 'success');

            var eduStats = _getSettlementEducationStats(locationId);
            if (eduStats) {
                var coverage = eduStats.coverageRatio || 0;
                var schools = eduStats.totalInstitutions || 0;
                var message = '';

                if (amount === 0 && schools > 0) {
                    message = 'Schools need funding to operate effectively';
                } else if (amount > 0 && coverage < 50) {
                    message = 'Consider building more schools in addition to funding';
                } else if (amount > 0 && schools === 0) {
                    message = 'Education spending allocated but no schools exist to receive it';
                }

                if (message) {
                    _showToast(message, 'warning');
                }
            }

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
    // 12. PLACES OF WORSHIP COMMANDS (NEW)
    // =========================================================================

    /**
     * Adds a place of worship to a settlement
     * @param {string} locationId - Settlement location ID
     * @param {string} placeId - Place of worship ID
     * @param {Object} options - Options
     * @param {boolean} options.updateDominant - Auto-update dominant religion (default: true)
     * @param {boolean} options.silent - Suppress toast (default: false)
     * @returns {Object} Result
     */
    function addPlaceOfWorshipToSettlement(locationId, placeId, options) {
        if (_processingCommand) {
            return { success: false, reason: 'Command already processing' };
        }
        _processingCommand = true;

        try {
            var place = _getPlaceById(locationId);
            if (!place) {
                return { success: false, reason: 'Location not found' };
            }

            var settlement = _getSettlementData(locationId);
            if (!settlement) {
                return { success: false, reason: 'Settlement data not found' };
            }

            options = options || {};
            var updateDominant = options.updateDominant !== false;
            var silent = options.silent || false;

            // Check if place already exists in this settlement
            if (settlement.placesOfWorship && settlement.placesOfWorship.indexOf(placeId) !== -1) {
                return { success: false, reason: 'Place of worship already in this settlement' };
            }

            // Get place details from Religion system
            var placeData = _getPlaceOfWorship(placeId);
            if (!placeData) {
                return { success: false, reason: 'Place of worship not found' };
            }

            // Add to settlement
            SettlementState._addPlaceOfWorship(locationId, placeId);

            SettlementState._addHistoryEntry(locationId, {
                year: _getCurrentYear(),
                type: 'place_of_worship_added',
                placeId: placeId,
                placeName: placeData.name || 'Unknown',
                religionId: placeData.religionId || null,
                religionName: placeData.religionName || 'Unknown'
            });

            // Update dominant religion if needed
            if (updateDominant) {
                updateDominantReligion(locationId);
            }

            if (!silent) {
                var placeName = placeData.name || 'Place of worship';
                var religionName = placeData.religionName || 'Unknown';
                _showToast('Added "' + placeName + '" to ' + place.displayName + ' (' + religionName + ')', 'success');
            }

            _logEvent('settlement', 'place_of_worship_added',
                'Added place of worship "' + (placeData.name || placeId) + '" to ' + place.displayName +
                ' (Religion: ' + (placeData.religionName || 'Unknown') + ')',
                []);

            return {
                success: true,
                data: {
                    locationId: locationId,
                    placeId: placeId,
                    placeName: placeData.name || 'Unknown',
                    religionId: placeData.religionId || null,
                    religionName: placeData.religionName || 'Unknown'
                }
            };

        } finally {
            _processingCommand = false;
        }
    }

    /**
     * Removes a place of worship from a settlement
     * @param {string} locationId - Settlement location ID
     * @param {string} placeId - Place of worship ID
     * @param {Object} options - Options
     * @param {boolean} options.updateDominant - Auto-update dominant religion (default: true)
     * @param {boolean} options.silent - Suppress toast (default: false)
     * @returns {Object} Result
     */
    function removePlaceOfWorshipFromSettlement(locationId, placeId, options) {
        if (_processingCommand) {
            return { success: false, reason: 'Command already processing' };
        }
        _processingCommand = true;

        try {
            var place = _getPlaceById(locationId);
            if (!place) {
                return { success: false, reason: 'Location not found' };
            }

            var settlement = _getSettlementData(locationId);
            if (!settlement) {
                return { success: false, reason: 'Settlement data not found' };
            }

            options = options || {};
            var updateDominant = options.updateDominant !== false;
            var silent = options.silent || false;

            // Check if place exists in this settlement
            if (!settlement.placesOfWorship || settlement.placesOfWorship.indexOf(placeId) === -1) {
                return { success: false, reason: 'Place of worship not in this settlement' };
            }

            // Get place details from Religion system
            var placeData = _getPlaceOfWorship(placeId);
            var placeName = placeData ? placeData.name || placeId : placeId;

            SettlementState._removePlaceOfWorship(locationId, placeId);

            SettlementState._addHistoryEntry(locationId, {
                year: _getCurrentYear(),
                type: 'place_of_worship_removed',
                placeId: placeId,
                placeName: placeName
            });

            // Update dominant religion if needed
            if (updateDominant) {
                updateDominantReligion(locationId);
            }

            if (!silent) {
                _showToast('Removed "' + placeName + '" from ' + place.displayName, 'info');
            }

            _logEvent('settlement', 'place_of_worship_removed',
                'Removed place of worship "' + placeName + '" from ' + place.displayName,
                []);

            return {
                success: true,
                data: {
                    locationId: locationId,
                    placeId: placeId,
                    placeName: placeName
                }
            };

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 13. DOMINANT RELIGION UPDATE (NEW)
    // =========================================================================

    /**
     * Updates the dominant religion for a settlement based on followers
     * @param {string} locationId - Settlement location ID
     * @param {Object} options - Options
     * @param {boolean} options.silent - Suppress toast (default: true)
     * @returns {Object} Result
     */
    function updateDominantReligion(locationId, options) {
        if (_processingCommand) {
            return { success: false, reason: 'Command already processing' };
        }
        _processingCommand = true;

        try {
            var settlement = _getSettlementData(locationId);
            if (!settlement) {
                return { success: false, reason: 'Settlement data not found' };
            }

            options = options || {};
            var silent = options.silent !== false;

            var religionQueries = _getReligionQueries();
            if (!religionQueries) {
                return { success: false, reason: 'ReligionQueries not available' };
            }

            // Get dominant religion
            var dominant = religionQueries.getDominantReligion(locationId);
            var oldDominantId = settlement.dominantReligionId;

            if (dominant) {
                settlement.dominantReligionId = dominant.id;
                SettlementState._setDominantReligion(locationId, dominant.id);
            } else {
                settlement.dominantReligionId = null;
                SettlementState._setDominantReligion(locationId, null);
            }

            // Calculate religious unity
            var religiousUnity = calculateReligiousUnity(locationId);
            settlement.religiousUnity = religiousUnity;
            SettlementState._setReligiousUnity(locationId, religiousUnity);

            // Log change
            if (oldDominantId !== settlement.dominantReligionId) {
                var place = _getPlaceById(locationId);
                var oldName = oldDominantId ? _getReligion(oldDominantId)?.name || 'Unknown' : 'None';
                var newName = settlement.dominantReligionId ? _getReligion(settlement.dominantReligionId)?.name || 'Unknown' : 'None';

                SettlementState._addHistoryEntry(locationId, {
                    year: _getCurrentYear(),
                    type: 'dominant_religion_changed',
                    oldDominant: oldDominantId,
                    newDominant: settlement.dominantReligionId,
                    oldName: oldName,
                    newName: newName,
                    religiousUnity: religiousUnity
                });

                if (!silent && oldDominantId !== settlement.dominantReligionId) {
                    _showToast('Dominant religion changed: ' + oldName + ' → ' + newName, 'info');
                }

                _logEvent('settlement', 'dominant_religion_changed',
                    'Dominant religion at ' + (place?.displayName || locationId) +
                    ' changed from ' + oldName + ' to ' + newName +
                    ' (Unity: ' + religiousUnity + '%)',
                    []);
            }

            return {
                success: true,
                data: {
                    locationId: locationId,
                    dominantReligionId: settlement.dominantReligionId,
                    dominantReligionName: settlement.dominantReligionId ? 
                        _getReligion(settlement.dominantReligionId)?.name || 'Unknown' : 'None',
                    religiousUnity: religiousUnity
                }
            };

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 14. RELIGIOUS UNITY CALCULATION (NEW)
    // =========================================================================

    /**
     * Calculates religious unity for a settlement (0-100)
     * Higher = more homogeneous, lower = more diverse
     * @param {string} locationId - Settlement location ID
     * @returns {number} Religious unity score (0-100)
     */
    function calculateReligiousUnity(locationId) {
        if (_processingCommand) {
            return 50;
        }
        _processingCommand = true;

        try {
            var settlement = _getSettlementData(locationId);
            if (!settlement) {
                return 50;
            }

            // Get religious breakdown from ReligionQueries
            var religionQueries = _getReligionQueries();
            if (!religionQueries) {
                return 50;
            }

            var breakdown = religionQueries.getReligiousBreakdown(locationId);
            if (!breakdown || !breakdown.byReligion) {
                return 50;
            }

            var religions = breakdown.byReligion;
            var total = breakdown.total || 0;

            // Also get unaffiliated
            var unaffiliated = breakdown.unaffiliated || 0;

            if (total === 0) {
                return 50;
            }

            // Calculate the proportion of the dominant religion
            var maxCount = 0;
            var dominantId = null;

            for (var id in religions) {
                if (religions.hasOwnProperty(id)) {
                    var count = religions[id].count || 0;
                    if (count > maxCount) {
                        maxCount = count;
                        dominantId = id;
                    }
                }
            }

            // Also consider unaffiliated as a "group"
            if (unaffiliated > maxCount) {
                maxCount = unaffiliated;
            }

            // Unity = dominant proportion * 100
            // With a baseline of 50% (equal distribution)
            var dominantProportion = total > 0 ? maxCount / total : 0;

            // Scale: 50% dominant = 50 unity, 100% dominant = 100 unity
            var unity = 50 + (dominantProportion * 50);

            // Penalize if there's a large unaffiliated population
            var unaffiliatedPenalty = unaffiliated > 0 ? Math.min(10, unaffiliated / 10) : 0;
            unity = Math.max(0, unity - unaffiliatedPenalty);

            // Bonus for having a dominant religion with many followers
            if (dominantId && maxCount > 10) {
                unity = Math.min(100, unity + 2);
            }

            return Math.round(Math.min(100, Math.max(0, unity)));

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 15. SETTLEMENT ROLE COMMANDS
    // =========================================================================

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

            var charLocationId = _getCurrentLocationId(character);
            var locationIds = _getAllSubLocationIds(locationId);
            var locationIdSet = new Set(locationIds);

            if (!charLocationId || !locationIdSet.has(charLocationId)) {
                _showToast('Character is not located in this settlement', 'warning');
                return { success: false, reason: 'Character not at location' };
            }

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
    // 16. BUDGET ALLOCATION COMMANDS
    // =========================================================================

    function allocateGovernmentSalaryBudget(locationId, amount, year) {
        if (_processingCommand) {
            return { success: false, reason: 'Command already processing' };
        }
        _processingCommand = true;

        try {
            var data = _getSettlementData(locationId);
            if (!data) {
                return { success: false, reason: 'Settlement data not found' };
            }

            var currentYear = year || _getCurrentYear();
            var actualAmount = Math.max(0, amount);

            if (actualAmount > (data.wealth || 0)) {
                _showToast('Insufficient settlement wealth for allocation', 'warning');
                return { 
                    success: false, 
                    reason: 'Insufficient wealth', 
                    available: data.wealth || 0,
                    required: actualAmount
                };
            }

            data.wealth = (data.wealth || 0) - actualAmount;

            data.governmentSalaryBudget = actualAmount;
            data.budgetAllocationYear = currentYear;

            SettlementState._updateSettlementData(locationId, {
                wealth: data.wealth,
                governmentSalaryBudget: actualAmount,
                budgetAllocationYear: currentYear
            });

            SettlementState._addHistoryEntry(locationId, {
                year: currentYear,
                type: 'government_budget_allocated',
                amount: actualAmount,
                newWealth: data.wealth,
                newDebt: data.totalDebt
            });

            _logEvent('settlement', 'government_budget_allocated',
                'Allocated ' + actualAmount + ' gold for government salaries at ' + 
                (_getPlaceById(locationId)?.displayName || 'Unknown'),
                []);

            _showToast('Allocated ' + actualAmount + ' gold for government salaries', 'success');

            return { 
                success: true, 
                data: { 
                    amount: actualAmount, 
                    newWealth: data.wealth,
                    year: currentYear
                } 
            };

        } finally {
            _processingCommand = false;
        }
    }

    function allocateEducationBudget(locationId, amount, year) {
        if (_processingCommand) {
            return { success: false, reason: 'Command already processing' };
        }
        _processingCommand = true;

        try {
            var data = _getSettlementData(locationId);
            if (!data) {
                return { success: false, reason: 'Settlement data not found' };
            }

            var currentYear = year || _getCurrentYear();
            var actualAmount = Math.max(0, amount);

            if (actualAmount > (data.wealth || 0)) {
                _showToast('Insufficient settlement wealth for allocation', 'warning');
                return { 
                    success: false, 
                    reason: 'Insufficient wealth', 
                    available: data.wealth || 0,
                    required: actualAmount
                };
            }

            data.wealth = (data.wealth || 0) - actualAmount;

            data.educationBudget = actualAmount;
            data.educationSpending = actualAmount;
            data.budgetAllocationYear = currentYear;

            SettlementState._updateSettlementData(locationId, {
                wealth: data.wealth,
                educationBudget: actualAmount,
                educationSpending: actualAmount,
                budgetAllocationYear: currentYear
            });

            if (typeof window.EducationCommands !== 'undefined' && 
                typeof window.EducationCommands.receiveSettlementBudget === 'function') {
                window.EducationCommands.receiveSettlementBudget(locationId, actualAmount, currentYear);
            } else {
                _logEvent('settlement', 'education_budget_stored',
                    'Education budget of ' + actualAmount + ' gold stored for ' + 
                    (_getPlaceById(locationId)?.displayName || 'Unknown'),
                    []);
            }

            SettlementState._addHistoryEntry(locationId, {
                year: currentYear,
                type: 'education_budget_allocated',
                amount: actualAmount,
                newWealth: data.wealth,
                newDebt: data.totalDebt
            });

            _logEvent('settlement', 'education_budget_allocated',
                'Allocated ' + actualAmount + ' gold for education at ' + 
                (_getPlaceById(locationId)?.displayName || 'Unknown'),
                []);

            _showToast('Allocated ' + actualAmount + ' gold for education', 'success');

            return { 
                success: true, 
                data: { 
                    amount: actualAmount, 
                    newWealth: data.wealth,
                    year: currentYear
                } 
            };

        } finally {
            _processingCommand = false;
        }
    }

    function getGovernmentSalaryRequirements(locationId) {
        if (_processingCommand) {
            return { total: 0, details: [] };
        }
        _processingCommand = true;

        try {
            if (typeof window.GovernmentEconomy !== 'undefined' && 
                typeof window.GovernmentEconomy.calculateDepartmentSalaryRequirements === 'function') {
                return window.GovernmentEconomy.calculateDepartmentSalaryRequirements(locationId);
            }

            var departments = window.GovernmentState ? 
                window.GovernmentState.getDepartmentsByLocation(locationId) : [];
            var total = 0;
            var details = [];

            for (var i = 0; i < departments.length; i++) {
                var dept = departments[i];
                var assignments = window.GovernmentState.getAssignmentsForDepartment(dept.id, true);
                var deptTotal = 0;

                for (var j = 0; j < assignments.length; j++) {
                    var salary = 10;
                    if (typeof window.GovernmentEconomy !== 'undefined' && 
                        typeof window.GovernmentEconomy.calculatePositionSalary === 'function') {
                        salary = window.GovernmentEconomy.calculatePositionSalary(
                            assignments[j].positionId, dept
                        );
                    }
                    deptTotal += salary;
                }

                total += deptTotal;
                details.push({
                    departmentId: dept.id,
                    departmentName: dept.name,
                    salaryRequirement: deptTotal,
                    positionCount: assignments.length
                });
            }

            return { total: total, details: details };

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 17. PUBLIC ENTERPRISE PROFIT COLLECTION
    // =========================================================================

    function collectPublicEnterpriseProfits(locationId, year) {
        if (_processingCommand) {
            return { success: false, reason: 'Command already processing' };
        }
        _processingCommand = true;

        try {
            var data = _getSettlementData(locationId);
            if (!data) {
                return { success: false, reason: 'Settlement data not found' };
            }

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
                    year: year || _getCurrentYear(),
                    type: 'public_enterprise_profit',
                    totalProfit: totalProfit,
                    details: details,
                    newWealth: data.wealth
                });

                _logEvent('settlement', 'public_enterprise_profit_collected',
                    'Collected ' + totalProfit + ' gold from public enterprises at ' + 
                    (_getPlaceById(locationId)?.displayName || 'Unknown'),
                []);

                _showToast('Collected ' + totalProfit + ' gold from public enterprises', 'success');
            }

            return {
                success: true,
                locationId: locationId,
                totalProfit: totalProfit,
                enterprises: details,
                newWealth: data.wealth
            };

        } finally {
            _processingCommand = false;
        }
    }

    function getPublicEnterpriseSummary(locationId) {
        if (_processingCommand) {
            return { total: 0, enterprises: [], totalProfit: 0 };
        }
        _processingCommand = true;

        try {
            var publicEnterprises = SettlementState.getPublicEnterprises(locationId);
            var totalProfit = 0;
            var totalWealth = 0;
            var details = [];

            for (var i = 0; i < publicEnterprises.length; i++) {
                var enterprise = publicEnterprises[i];
                var summary = null;

                if (typeof window.IndustryQueries !== 'undefined') {
                    summary = window.IndustryQueries.getEnterpriseSummary(enterprise.id);
                }

                if (summary) {
                    totalProfit += summary.annualProfit || 0;
                    totalWealth += summary.wealth || 0;
                    details.push({
                        enterpriseId: enterprise.id,
                        enterpriseName: enterprise.name,
                        profit: summary.annualProfit || 0,
                        wealth: summary.wealth || 0,
                        workers: summary.workerCount || 0,
                        status: summary.status || 'active'
                    });
                }
            }

            return {
                locationId: locationId,
                total: details.length,
                totalProfit: totalProfit,
                totalWealth: totalWealth,
                enterprises: details
            };

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 18. DEMOLISHED FEATURES TRACKING
    // =========================================================================

    function getDemolishedFeatures(locationId) {
        try {
            var settlement = _getSettlementData(locationId);
            if (!settlement) return [];

            return settlement.demolishedFeatures || [];
        } catch (e) {
            return [];
        }
    }

    function recordFeatureDemolition(locationId, featureId, record) {
        try {
            var settlement = _getSettlementData(locationId);
            if (!settlement) return false;

            settlement.demolishedFeatures = settlement.demolishedFeatures || [];
            settlement.demolishedFeatures.push({
                featureId: featureId,
                demolishedAt: record.demolishedAt || _getCurrentYear(),
                demolishedReason: record.demolishedReason || 'Demolished',
                destroyedBy: record.destroyedBy || 'manual',
                disasterId: record.disasterId || null,
                timestamp: Date.now()
            });

            SettlementState._updateSettlementData(locationId, {
                demolishedFeatures: settlement.demolishedFeatures
            });

            return true;
        } catch (e) {
            return false;
        }
    }

    function getSettlementDemolitionStats(locationId) {
        var stats = {
            totalFeatures: 0,
            byDestroyedBy: {},
            recentDemolitions: []
        };

        try {
            var features = getDemolishedFeatures(locationId);
            stats.totalFeatures = features.length;

            for (var i = 0; i < features.length; i++) {
                var f = features[i];

                var destroyedBy = f.destroyedBy || 'unknown';
                if (!stats.byDestroyedBy[destroyedBy]) {
                    stats.byDestroyedBy[destroyedBy] = 0;
                }
                stats.byDestroyedBy[destroyedBy]++;

                if (stats.recentDemolitions.length < 5) {
                    stats.recentDemolitions.push({
                        featureId: f.featureId,
                        destroyedAt: f.demolishedAt,
                        destroyedBy: f.destroyedBy,
                        reason: f.demolishedReason
                    });
                }
            }

            stats.recentDemolitions.sort(function(a, b) {
                return (b.destroyedAt || 0) - (a.destroyedAt || 0);
            });

        } catch (e) {
            // Error getting stats
        }

        return stats;
    }

    // =========================================================================
    // 19. ANNUAL PROCESSING - CRITICAL
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
            var publicIncome = SettlementEconomy.calculatePublicEnterpriseIncome(locationId); // NEW
            var totalIncome = taxIncome + tradeIncome + industryIncome + stateIncome + publicIncome;

            // 3. Calculate expenses
            var maintenance = SettlementEconomy.calculateMaintenanceCosts(locationId);
            var wages = SettlementEconomy.calculateWageCosts(locationId);
            var spending = SettlementEconomy.calculateSpendingCosts(locationId);
            var govSalaries = SettlementEconomy.calculateGovernmentSalaryExpenses(locationId);
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
                    publicEnterprises: Math.floor(publicIncome), // NEW
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

            // 12. Update dominant religion (NEW)
            updateDominantReligion(locationId, { silent: true });

            // 13. Collect public enterprise profits
            var profitResult = collectPublicEnterpriseProfits(locationId, _getCurrentYear());

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
            _logEvent('settlement', 'annual_processed',
                place.displayName + ' processed: ' + Math.floor(totalIncome) + ' income, ' +
                Math.floor(totalExpenses) + ' expenses, ' +
                (surplus >= 0 ? '+' : '') + Math.floor(surplus) + ' surplus' +
                ' (Prosperity: ' + prosperity + '%, Education Spend: ' + (data.educationSpending || 0) + ')' +
                (data.dominantReligionId ? ', Dominant Religion: ' + (_getReligion(data.dominantReligionId)?.name || 'Unknown') : '') +
                (data.religiousUnity ? ', Unity: ' + data.religiousUnity + '%' : '') +
                (profitResult.totalProfit > 0 ? ', Public enterprise profit: ' + profitResult.totalProfit : ''),
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
                educationSpending: data.educationSpending || 0,
                publicEnterpriseProfit: profitResult.totalProfit || 0,
                // NEW: Religion data
                dominantReligionId: data.dominantReligionId,
                dominantReligionName: data.dominantReligionId ? 
                    (_getReligion(data.dominantReligionId)?.name || 'Unknown') : 'None',
                religiousUnity: data.religiousUnity || 50,
                summary: 'Settlement processed: Prosperity ' + data.prosperity + '%, Surplus ' +
                    Math.floor(surplus) + ' gold' +
                    (data.totalDebt > 0 ? ' (Debt: ' + data.totalDebt + ' gold)' : '') +
                    (data.educationSpending > 0 ? ' (Education: ' + data.educationSpending + ' gold)' : '') +
                    (profitResult.totalProfit > 0 ? ' (Public Enterprise Profit: ' + profitResult.totalProfit + ')' : '') +
                    (data.dominantReligionId ? ' (Dominant: ' + (_getReligion(data.dominantReligionId)?.name || 'Unknown') + ')' : '') +
                    (data.religiousUnity ? ' (Unity: ' + data.religiousUnity + '%)' : '')
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
    // 20. EXPORTS
    // =========================================================================

    window.SettlementCommands = {
        // Feature management
        buildFeature: buildFeature,
        removeFeature: removeFeature,
        demolishFeature: demolishFeature,
        
        // Settlement management
        upgradeSettlement: upgradeSettlement,
        setSpecialization: setSpecialization,
        
        // Wealth & Debt
        updateWealth: updateWealth,
        updateDebt: updateDebt,
        
        // Tax & Rate
        updateTaxRate: updateTaxRate,
        updateTradeTariff: updateTradeTariff,
        updateIndustryTaxRate: updateIndustryTaxRate,
        
        // Spending
        updateMilitarySpending: updateMilitarySpending,
        updateInfrastructureSpending: updateInfrastructureSpending,
        updateEducationSpending: updateEducationSpending,
        
        // Justice & Watch
        updateJusticeSeverity: updateJusticeSeverity,
        updateWatch: updateWatch,
        
        // State Enterprises
        createStateEnterprise: createStateEnterprise,
        removeStateEnterprise: removeStateEnterprise,
        
        // Annual Processing
        processAnnualSettlementUpdate: processAnnualSettlementUpdate,
        processAllSettlements: processAllSettlements,
        
        // Validation
        validateFeature: _validateFeature,
        
        // Role-settlement commands
        assignSettlementRole: assignSettlementRole,
        removeSettlementRole: removeSettlementRole,
        updateSettlementCharacterSkill: updateSettlementCharacterSkill,
        
        // Budget allocation commands
        allocateGovernmentSalaryBudget: allocateGovernmentSalaryBudget,
        allocateEducationBudget: allocateEducationBudget,
        getGovernmentSalaryRequirements: getGovernmentSalaryRequirements,
        
        // Public enterprise commands
        collectPublicEnterpriseProfits: collectPublicEnterpriseProfits,
        getPublicEnterpriseSummary: getPublicEnterpriseSummary,
        
        // Demolished features tracking
        getDemolishedFeatures: getDemolishedFeatures,
        recordFeatureDemolition: recordFeatureDemolition,
        getSettlementDemolitionStats: getSettlementDemolitionStats,

        // ================================================================
        // NEW: Places of Worship commands
        // ================================================================
        addPlaceOfWorshipToSettlement: addPlaceOfWorshipToSettlement,
        removePlaceOfWorshipFromSettlement: removePlaceOfWorshipFromSettlement,
        updateDominantReligion: updateDominantReligion,
        calculateReligiousUnity: calculateReligiousUnity
    };

    // Legacy aliases
    window._buildFeature = buildFeature;
    window._removeFeature = removeFeature;
    window._demolishFeature = demolishFeature;
    window._upgradeSettlement = upgradeSettlement;
    window._setSpecialization = setSpecialization;
    window._updateWealth = updateWealth;
    window._updateDebt = updateDebt;
    window._updateTaxRate = updateTaxRate;
    window._updateTradeTariff = updateTradeTariff;
    window._updateIndustryTaxRate = updateIndustryTaxRate;
    window._updateMilitarySpending = updateMilitarySpending;
    window._updateInfrastructureSpending = updateInfrastructureSpending;
    window._updateEducationSpending = updateEducationSpending;
    window._updateJusticeSeverity = updateJusticeSeverity;
    window._updateWatch = updateWatch;
    window._createStateEnterprise = createStateEnterprise;
    window._removeStateEnterprise = removeStateEnterprise;
    window._processAnnualSettlementUpdate = processAnnualSettlementUpdate;
    window._processAllSettlements = processAllSettlements;
    window._assignSettlementRole = assignSettlementRole;
    window._removeSettlementRole = removeSettlementRole;
    window._updateSettlementCharacterSkill = updateSettlementCharacterSkill;
    window._allocateGovernmentSalaryBudget = allocateGovernmentSalaryBudget;
    window._allocateEducationBudget = allocateEducationBudget;
    window._getGovernmentSalaryRequirements = getGovernmentSalaryRequirements;
    window._collectPublicEnterpriseProfits = collectPublicEnterpriseProfits;
    window._getPublicEnterpriseSummary = getPublicEnterpriseSummary;
    window._getDemolishedFeatures = getDemolishedFeatures;
    window._recordFeatureDemolition = recordFeatureDemolition;
    window._getSettlementDemolitionStats = getSettlementDemolitionStats;
    // NEW: Places of Worship aliases
    window._addPlaceOfWorshipToSettlement = addPlaceOfWorshipToSettlement;
    window._removePlaceOfWorshipFromSettlement = removePlaceOfWorshipFromSettlement;
    window._updateDominantReligion = updateDominantReligion;
    window._calculateReligiousUnity = calculateReligiousUnity;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.SettlementCommands;
    }

})();