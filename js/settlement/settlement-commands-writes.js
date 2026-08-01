/**
 * =============================================================================
 * SETTLEMENT COMMANDS WRITES - All write operations except annual processing js/settlement/settlements-commands-writes.js
 * =============================================================================
 * 
 * This file contains ALL write operations for settlement management:
 * - Feature management (build, remove, demolish)
 * - Settlement management (upgrade, specialization)
 * - State enterprise management
 * - Tax/rate management
 * - Justice/watch management
 * - Wealth & debt commands
 * - Spending commands
 * - Settlement role commands
 * - Budget allocation commands
 * - Public enterprise commands
 * - Places of worship commands
 * - Religious unity calculation
 * - CIVIL LAW COMMANDS (NEW)
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
    var _getCharacterById = core.getCharacterById || function(id) { return typeof window.getCharacterById === 'function' ? window.getCharacterById(id) : null; };
    var _getCurrentYear = core.getCurrentYear || function() { return typeof window.getCurrentYearSafe === 'function' ? window.getCurrentYearSafe() : 1250; };
    var _getLocationPopulationCount = core.getLocationPopulationCount || function(locationId) { return typeof window.getLocationPopulationCount === 'function' ? window.getLocationPopulationCount(locationId) : 0; };
    var _logEvent = core.logEvent || function() {};
    var _showToast = core.showToast || function(msg, type) { alert(msg); };
    var _getRoleById = core.getRoleById || function(id) { return typeof window.getRoleById === 'function' ? window.getRoleById(id) : null; };
    var _getSettlementRanks = core.getSettlementRanks || function() { return SettlementState._getAllRanks(); };
    var _getSettlementData = core.getSettlementData || function(locationId) { return SettlementState.getSettlementData(locationId); };
    var _getSettlementFeatures = core.getSettlementFeatures || function(locationId) { return SettlementState.getSettlementFeatures(locationId); };
    var _validateFeature = core.validateFeature || function(locationId, featureId) {
        var place = _getPlaceById(locationId);
        if (!place) return { valid: false, reason: 'Location not found' };
        var features = SettlementState._getAllFeatures();
        var feature = features.find(function(f) { return f.id === featureId; });
        if (!feature) return { valid: false, reason: 'Feature not found' };
        var data = _getSettlementData(locationId);
        if (!data) return { valid: false, reason: 'Settlement data not found' };
        if (data.featureIds && data.featureIds.indexOf(featureId) !== -1) return { valid: false, reason: 'Feature already built' };
        return { valid: true, feature: feature };
    };
    var _recordFeatureDemolition = core.recordFeatureDemolition || function() {};
    var _getAllSubLocationIds = core.getAllSubLocationIds || function(locationId) {
        if (typeof LocationState !== 'undefined' && LocationState.getAllSubLocationIds) {
            return LocationState.getAllSubLocationIds(locationId);
        }
        return [locationId];
    };
    var _getCurrentLocationId = core.getCurrentLocationId || function(character) {
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
    };
    var _getReligion = core.getReligion || function(religionId) {
        if (typeof window.ReligionState !== 'undefined' &&
            typeof window.ReligionState.getReligion === 'function') {
            return window.ReligionState.getReligion(religionId);
        }
        return null;
    };
    var _getPlaceOfWorship = core.getPlaceOfWorship || function(placeId) {
        if (typeof window.ReligionCommands !== 'undefined' &&
            typeof window.ReligionCommands.getPlaceOfWorship === 'function') {
            return window.ReligionCommands.getPlaceOfWorship(placeId);
        }
        return null;
    };
    var _getReligionQueries = core.getReligionQueries || function() {
        return typeof window.ReligionQueries !== 'undefined' ? window.ReligionQueries : null;
    };
    var _getSettlementEducationStats = core.getSettlementEducationStats || function(locationId) {
        if (typeof SettlementQueries !== 'undefined' && SettlementQueries.getSettlementEducationStats) {
            return SettlementQueries.getSettlementEducationStats(locationId);
        }
        return null;
    };

    function _getProcessingCommand() { return core.getProcessingCommand ? core.getProcessingCommand() : false; }
    function _setProcessingCommand(val) { if (core.setProcessingCommand) core.setProcessingCommand(val); }

    // =========================================================================
    // 2. FEATURE COMMANDS
    // =========================================================================

    function buildFeature(locationId, featureId) {
        if (_getProcessingCommand()) {
            return { success: false, reason: 'Command already processing' };
        }
        _setProcessingCommand(true);

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
            _setProcessingCommand(false);
        }
    }

    function removeFeature(locationId, featureId) {
        if (_getProcessingCommand()) {
            return { success: false, reason: 'Command already processing' };
        }
        _setProcessingCommand(true);

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
            _setProcessingCommand(false);
        }
    }

    function demolishFeature(locationId, featureId) {
        if (_getProcessingCommand()) {
            return { success: false, reason: 'Command already processing' };
        }
        _setProcessingCommand(true);

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

            _recordFeatureDemolition(locationId, featureId, demolitionRecord);

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
            _setProcessingCommand(false);
        }
    }

    // =========================================================================
    // 3. UPGRADE COMMANDS
    // =========================================================================

    function upgradeSettlement(locationId) {
        if (_getProcessingCommand()) {
            return { success: false, reason: 'Command already processing' };
        }
        _setProcessingCommand(true);

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
            _setProcessingCommand(false);
        }
    }

    // =========================================================================
    // 4. SPECIALIZATION COMMANDS
    // =========================================================================

    function setSpecialization(locationId, roleId) {
        if (_getProcessingCommand()) {
            return { success: false, reason: 'Command already processing' };
        }
        _setProcessingCommand(true);

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
            _setProcessingCommand(false);
        }
    }

    // =========================================================================
    // 5. WEALTH & DEBT COMMANDS
    // =========================================================================

    function updateWealth(locationId, delta, reason) {
        if (_getProcessingCommand()) {
            return { success: false, reason: 'Command already processing' };
        }
        _setProcessingCommand(true);

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
            _setProcessingCommand(false);
        }
    }

    function updateDebt(locationId, delta, reason) {
        if (_getProcessingCommand()) {
            return { success: false, reason: 'Command already processing' };
        }
        _setProcessingCommand(true);

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
            _setProcessingCommand(false);
        }
    }

    // =========================================================================
    // 6. TAX & RATE COMMANDS
    // =========================================================================

    function updateTaxRate(locationId, rate) {
        if (_getProcessingCommand()) {
            return { success: false, reason: 'Command already processing' };
        }
        _setProcessingCommand(true);

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
            _setProcessingCommand(false);
        }
    }

    function updateTradeTariff(locationId, tariff) {
        if (_getProcessingCommand()) {
            return { success: false, reason: 'Command already processing' };
        }
        _setProcessingCommand(true);

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
            _setProcessingCommand(false);
        }
    }

    function updateIndustryTaxRate(locationId, rate) {
        if (_getProcessingCommand()) {
            return { success: false, reason: 'Command already processing' };
        }
        _setProcessingCommand(true);

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
            _setProcessingCommand(false);
        }
    }

    // =========================================================================
    // 7. SPENDING COMMANDS
    // =========================================================================

    function updateMilitarySpending(locationId, amount) {
        if (_getProcessingCommand()) {
            return { success: false, reason: 'Command already processing' };
        }
        _setProcessingCommand(true);

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
            _setProcessingCommand(false);
        }
    }

    function updateInfrastructureSpending(locationId, amount) {
        if (_getProcessingCommand()) {
            return { success: false, reason: 'Command already processing' };
        }
        _setProcessingCommand(true);

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
            _setProcessingCommand(false);
        }
    }

    function updateEducationSpending(locationId, amount) {
        if (_getProcessingCommand()) {
            return { success: false, reason: 'Command already processing' };
        }
        _setProcessingCommand(true);

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
            _setProcessingCommand(false);
        }
    }

    // =========================================================================
    // 8. JUSTICE & WATCH COMMANDS
    // =========================================================================

    function updateJusticeSeverity(locationId, severity) {
        if (_getProcessingCommand()) {
            return { success: false, reason: 'Command already processing' };
        }
        _setProcessingCommand(true);

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
            _setProcessingCommand(false);
        }
    }

    function updateWatch(locationId, hasWatch, size) {
        if (_getProcessingCommand()) {
            return { success: false, reason: 'Command already processing' };
        }
        _setProcessingCommand(true);

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
            _setProcessingCommand(false);
        }
    }

    // =========================================================================
    // 9. STATE ENTERPRISE COMMANDS
    // =========================================================================

    function createStateEnterprise(locationId, data) {
        if (_getProcessingCommand()) {
            return { success: false, reason: 'Command already processing' };
        }
        _setProcessingCommand(true);

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
            _setProcessingCommand(false);
        }
    }

    function removeStateEnterprise(locationId, enterpriseId) {
        if (_getProcessingCommand()) {
            return { success: false, reason: 'Command already processing' };
        }
        _setProcessingCommand(true);

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
            _setProcessingCommand(false);
        }
    }

    // =========================================================================
    // 10. SETTLEMENT ROLE COMMANDS
    // =========================================================================

    function assignSettlementRole(locationId, characterId, roleId, options) {
        if (_getProcessingCommand()) {
            return { success: false, reason: 'Command already processing' };
        }
        _setProcessingCommand(true);

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
            _setProcessingCommand(false);
        }
    }

    function removeSettlementRole(locationId, characterId, roleId) {
        if (_getProcessingCommand()) {
            return { success: false, reason: 'Command already processing' };
        }
        _setProcessingCommand(true);

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
            _setProcessingCommand(false);
        }
    }

    function updateSettlementCharacterSkill(locationId, characterId, roleId, skillLevel) {
        if (_getProcessingCommand()) {
            return { success: false, reason: 'Command already processing' };
        }
        _setProcessingCommand(true);

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
            _setProcessingCommand(false);
        }
    }

    // =========================================================================
    // 11. BUDGET ALLOCATION COMMANDS
    // =========================================================================

    function allocateGovernmentSalaryBudget(locationId, amount, year) {
        if (_getProcessingCommand()) {
            return { success: false, reason: 'Command already processing' };
        }
        _setProcessingCommand(true);

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
            _setProcessingCommand(false);
        }
    }

    function allocateEducationBudget(locationId, amount, year) {
        if (_getProcessingCommand()) {
            return { success: false, reason: 'Command already processing' };
        }
        _setProcessingCommand(true);

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
            _setProcessingCommand(false);
        }
    }

    function getGovernmentSalaryRequirements(locationId) {
        if (_getProcessingCommand()) {
            return { total: 0, details: [] };
        }
        _setProcessingCommand(true);

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
            _setProcessingCommand(false);
        }
    }

    // =========================================================================
    // 12. PUBLIC ENTERPRISE COMMANDS
    // =========================================================================

    function collectPublicEnterpriseProfits(locationId, year) {
        if (_getProcessingCommand()) {
            return { success: false, reason: 'Command already processing' };
        }
        _setProcessingCommand(true);

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
            _setProcessingCommand(false);
        }
    }

    function getPublicEnterpriseSummary(locationId) {
        if (_getProcessingCommand()) {
            return { total: 0, enterprises: [], totalProfit: 0 };
        }
        _setProcessingCommand(true);

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
            _setProcessingCommand(false);
        }
    }

    // =========================================================================
    // 13. PLACES OF WORSHIP COMMANDS
    // =========================================================================

    function addPlaceOfWorshipToSettlement(locationId, placeId, options) {
        if (_getProcessingCommand()) {
            return { success: false, reason: 'Command already processing' };
        }
        _setProcessingCommand(true);

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

            if (settlement.placesOfWorship && settlement.placesOfWorship.indexOf(placeId) !== -1) {
                return { success: false, reason: 'Place of worship already in this settlement' };
            }

            var placeData = _getPlaceOfWorship(placeId);
            if (!placeData) {
                return { success: false, reason: 'Place of worship not found' };
            }

            SettlementState._addPlaceOfWorship(locationId, placeId);

            SettlementState._addHistoryEntry(locationId, {
                year: _getCurrentYear(),
                type: 'place_of_worship_added',
                placeId: placeId,
                placeName: placeData.name || 'Unknown',
                religionId: placeData.religionId || null,
                religionName: placeData.religionName || 'Unknown'
            });

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
            _setProcessingCommand(false);
        }
    }

    function removePlaceOfWorshipFromSettlement(locationId, placeId, options) {
        if (_getProcessingCommand()) {
            return { success: false, reason: 'Command already processing' };
        }
        _setProcessingCommand(true);

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

            if (!settlement.placesOfWorship || settlement.placesOfWorship.indexOf(placeId) === -1) {
                return { success: false, reason: 'Place of worship not in this settlement' };
            }

            var placeData = _getPlaceOfWorship(placeId);
            var placeName = placeData ? placeData.name || placeId : placeId;

            SettlementState._removePlaceOfWorship(locationId, placeId);

            SettlementState._addHistoryEntry(locationId, {
                year: _getCurrentYear(),
                type: 'place_of_worship_removed',
                placeId: placeId,
                placeName: placeName
            });

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
            _setProcessingCommand(false);
        }
    }

    // =========================================================================
    // 14. DOMINANT RELIGION UPDATE
    // =========================================================================

    function updateDominantReligion(locationId, options) {
        if (_getProcessingCommand()) {
            return { success: false, reason: 'Command already processing' };
        }
        _setProcessingCommand(true);

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

            var dominant = religionQueries.getDominantReligion(locationId);
            var oldDominantId = settlement.dominantReligionId;

            if (dominant) {
                settlement.dominantReligionId = dominant.id;
                SettlementState._setDominantReligion(locationId, dominant.id);
            } else {
                settlement.dominantReligionId = null;
                SettlementState._setDominantReligion(locationId, null);
            }

            var religiousUnity = calculateReligiousUnity(locationId);
            settlement.religiousUnity = religiousUnity;
            SettlementState._setReligiousUnity(locationId, religiousUnity);

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
            _setProcessingCommand(false);
        }
    }

    // =========================================================================
    // 15. RELIGIOUS UNITY CALCULATION
    // =========================================================================

    function calculateReligiousUnity(locationId) {
        if (_getProcessingCommand()) {
            return 50;
        }
        _setProcessingCommand(true);

        try {
            var settlement = _getSettlementData(locationId);
            if (!settlement) {
                return 50;
            }

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
            var unaffiliated = breakdown.unaffiliated || 0;

            if (total === 0) {
                return 50;
            }

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

            if (unaffiliated > maxCount) {
                maxCount = unaffiliated;
            }

            var dominantProportion = total > 0 ? maxCount / total : 0;
            var unity = 50 + (dominantProportion * 50);

            var unaffiliatedPenalty = unaffiliated > 0 ? Math.min(10, unaffiliated / 10) : 0;
            unity = Math.max(0, unity - unaffiliatedPenalty);

            if (dominantId && maxCount > 10) {
                unity = Math.min(100, unity + 2);
            }

            return Math.round(Math.min(100, Math.max(0, unity)));

        } finally {
            _setProcessingCommand(false);
        }
    }

    // =========================================================================
    // 16. CIVIL LAW COMMANDS (NEW)
    // =========================================================================

    /**
     * Adds a civil law to a settlement
     * @param {string} locationId - Settlement location ID
     * @param {Object} lawData - Law data
     * @returns {Object} Result
     */
    function addCivilLaw(locationId, lawData) {
        if (_getProcessingCommand()) {
            return { success: false, reason: 'Command already processing' };
        }
        _setProcessingCommand(true);

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

            if (!lawData.name || lawData.name.trim() === '') {
                _showToast('Law name is required', 'error');
                return { success: false, reason: 'Law name is required' };
            }

            // Validate domain
            var validDomains = ['marriage', 'behavior', 'worship', 'food', 'social', 
                               'economic', 'political', 'sexual', 'violence', 'death'];
            if (lawData.domain && validDomains.indexOf(lawData.domain) === -1) {
                _showToast('Invalid law domain', 'error');
                return { success: false, reason: 'Invalid law domain' };
            }

            // Validate severity
            var validSeverities = ['minor', 'major', 'mortal'];
            if (lawData.severity && validSeverities.indexOf(lawData.severity) === -1) {
                _showToast('Invalid law severity', 'error');
                return { success: false, reason: 'Invalid law severity' };
            }

            // Validate law type
            var validTypes = ['law', 'taboo', 'guideline'];
            if (lawData.type && validTypes.indexOf(lawData.type) === -1) {
                _showToast('Invalid law type', 'error');
                return { success: false, reason: 'Invalid law type' };
            }

            // Validate crime type if provided
            if (lawData.crimeType && window.CRIME_TYPES) {
                var crimeTypes = Object.values(window.CRIME_TYPES);
                if (crimeTypes.indexOf(lawData.crimeType) === -1) {
                    _showToast('Invalid crime type', 'error');
                    return { success: false, reason: 'Invalid crime type' };
                }
            }

            var law = {
                id: 'civillaw_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8),
                name: lawData.name.trim(),
                type: lawData.type || 'law',
                lawCategory: 'civil',
                domain: lawData.domain || 'behavior',
                description: lawData.description || '',
                severity: lawData.severity || 'minor',
                crimeMapping: {
                    crimeType: lawData.crimeType || null,
                    crimeSeverity: lawData.crimeSeverity || null,
                    isEnforced: lawData.isEnforced || false,
                    punishment: lawData.punishment || null,
                    notes: lawData.crimeNotes || ''
                },
                createdAt: Date.now(),
                updatedAt: Date.now(),
                notes: lawData.notes || ''
            };

            // Check for duplicate name
            var existingLaws = data.civilLaws || [];
            for (var i = 0; i < existingLaws.length; i++) {
                if (existingLaws[i].name.toLowerCase() === law.name.toLowerCase()) {
                    _showToast('A law with this name already exists', 'warning');
                    return { success: false, reason: 'Duplicate law name' };
                }
            }

            SettlementState._addCivilLaw(locationId, law);

            SettlementState._addHistoryEntry(locationId, {
                year: _getCurrentYear(),
                type: 'civil_law_added',
                lawId: law.id,
                lawName: law.name,
                domain: law.domain,
                severity: law.severity
            });

            _logEvent('settlement', 'civil_law_added',
                'Added civil law "' + law.name + '" to ' + place.displayName + 
                ' (Domain: ' + law.domain + ', Severity: ' + law.severity + ')',
                []);

            _showToast('Civil law added: ' + law.name, 'success');

            return { success: true, data: law };

        } finally {
            _setProcessingCommand(false);
        }
    }

    /**
     * Updates a civil law
     * @param {string} locationId - Settlement location ID
     * @param {string} lawId - Law ID
     * @param {Object} updates - Updates to apply
     * @returns {Object} Result
     */
    function updateCivilLaw(locationId, lawId, updates) {
        if (_getProcessingCommand()) {
            return { success: false, reason: 'Command already processing' };
        }
        _setProcessingCommand(true);

        try {
            var place = _getPlaceById(locationId);
            if (!place) {
                _showToast('Location not found', 'error');
                return { success: false, reason: 'Location not found' };
            }

            var data = _getSettlementData(locationId);
            if (!data || !data.civilLaws) {
                _showToast('Settlement or laws not found', 'error');
                return { success: false, reason: 'Settlement or laws not found' };
            }

            var law = SettlementState.getCivilLaw(locationId, lawId);
            if (!law) {
                _showToast('Law not found', 'error');
                return { success: false, reason: 'Law not found' };
            }

            // Validate updates
            if (updates.domain !== undefined) {
                var validDomains = ['marriage', 'behavior', 'worship', 'food', 'social', 
                                   'economic', 'political', 'sexual', 'violence', 'death'];
                if (validDomains.indexOf(updates.domain) === -1) {
                    _showToast('Invalid law domain', 'error');
                    return { success: false, reason: 'Invalid law domain' };
                }
            }

            if (updates.severity !== undefined) {
                var validSeverities = ['minor', 'major', 'mortal'];
                if (validSeverities.indexOf(updates.severity) === -1) {
                    _showToast('Invalid law severity', 'error');
                    return { success: false, reason: 'Invalid law severity' };
                }
            }

            if (updates.type !== undefined) {
                var validTypes = ['law', 'taboo', 'guideline'];
                if (validTypes.indexOf(updates.type) === -1) {
                    _showToast('Invalid law type', 'error');
                    return { success: false, reason: 'Invalid law type' };
                }
            }

            if (updates.crimeType !== undefined && updates.crimeType !== null && window.CRIME_TYPES) {
                var crimeTypes = Object.values(window.CRIME_TYPES);
                if (crimeTypes.indexOf(updates.crimeType) === -1) {
                    _showToast('Invalid crime type', 'error');
                    return { success: false, reason: 'Invalid crime type' };
                }
            }

            // Check for duplicate name if name is being changed
            if (updates.name !== undefined) {
                var existingLaws = data.civilLaws || [];
                for (var i = 0; i < existingLaws.length; i++) {
                    if (existingLaws[i].id !== lawId && 
                        existingLaws[i].name.toLowerCase() === updates.name.trim().toLowerCase()) {
                        _showToast('A law with this name already exists', 'warning');
                        return { success: false, reason: 'Duplicate law name' };
                    }
                }
            }

            var result = SettlementState._updateCivilLaw(locationId, lawId, updates);

            if (result) {
                SettlementState._addHistoryEntry(locationId, {
                    year: _getCurrentYear(),
                    type: 'civil_law_updated',
                    lawId: lawId,
                    lawName: updates.name || law.name
                });

                _logEvent('settlement', 'civil_law_updated',
                    'Updated civil law "' + (updates.name || law.name) + '" at ' + place.displayName,
                    []);

                _showToast('Civil law updated: ' + (updates.name || law.name), 'success');

                return { success: true, data: SettlementState.getCivilLaw(locationId, lawId) };
            }

            return { success: false, reason: 'Failed to update civil law' };

        } finally {
            _setProcessingCommand(false);
        }
    }

    /**
     * Removes a civil law
     * @param {string} locationId - Settlement location ID
     * @param {string} lawId - Law ID
     * @returns {Object} Result
     */
    function removeCivilLaw(locationId, lawId) {
        if (_getProcessingCommand()) {
            return { success: false, reason: 'Command already processing' };
        }
        _setProcessingCommand(true);

        try {
            var place = _getPlaceById(locationId);
            if (!place) {
                _showToast('Location not found', 'error');
                return { success: false, reason: 'Location not found' };
            }

            var data = _getSettlementData(locationId);
            if (!data || !data.civilLaws) {
                _showToast('Settlement or laws not found', 'error');
                return { success: false, reason: 'Settlement or laws not found' };
            }

            var law = SettlementState.getCivilLaw(locationId, lawId);
            if (!law) {
                _showToast('Law not found', 'error');
                return { success: false, reason: 'Law not found' };
            }

            var lawName = law.name;

            var result = SettlementState._removeCivilLaw(locationId, lawId);

            if (result) {
                SettlementState._addHistoryEntry(locationId, {
                    year: _getCurrentYear(),
                    type: 'civil_law_removed',
                    lawId: lawId,
                    lawName: lawName
                });

                _logEvent('settlement', 'civil_law_removed',
                    'Removed civil law "' + lawName + '" from ' + place.displayName,
                    []);

                _showToast('Civil law removed: ' + lawName, 'info');

                return { success: true };
            }

            return { success: false, reason: 'Failed to remove civil law' };

        } finally {
            _setProcessingCommand(false);
        }
    }

    /**
     * Gets all civil laws for a settlement
     * @param {string} locationId - Settlement location ID
     * @returns {Array} Array of law objects
     */
    function getCivilLaws(locationId) {
        if (_getProcessingCommand()) {
            return [];
        }
        _setProcessingCommand(true);

        try {
            return SettlementState.getCivilLaws(locationId);
        } finally {
            _setProcessingCommand(false);
        }
    }

    /**
     * Gets a single civil law by ID
     * @param {string} locationId - Settlement location ID
     * @param {string} lawId - Law ID
     * @returns {Object|null} Law object or null
     */
    function getCivilLaw(locationId, lawId) {
        if (_getProcessingCommand()) {
            return null;
        }
        _setProcessingCommand(true);

        try {
            return SettlementState.getCivilLaw(locationId, lawId);
        } finally {
            _setProcessingCommand(false);
        }
    }

    // =========================================================================
    // 17. EXPORTS
    // =========================================================================

    window.SettlementCommands = window.SettlementCommands || {};

    // Feature management
    window.SettlementCommands.buildFeature = buildFeature;
    window.SettlementCommands.removeFeature = removeFeature;
    window.SettlementCommands.demolishFeature = demolishFeature;

    // Settlement management
    window.SettlementCommands.upgradeSettlement = upgradeSettlement;
    window.SettlementCommands.setSpecialization = setSpecialization;

    // Wealth & Debt
    window.SettlementCommands.updateWealth = updateWealth;
    window.SettlementCommands.updateDebt = updateDebt;

    // Tax & Rate
    window.SettlementCommands.updateTaxRate = updateTaxRate;
    window.SettlementCommands.updateTradeTariff = updateTradeTariff;
    window.SettlementCommands.updateIndustryTaxRate = updateIndustryTaxRate;

    // Spending
    window.SettlementCommands.updateMilitarySpending = updateMilitarySpending;
    window.SettlementCommands.updateInfrastructureSpending = updateInfrastructureSpending;
    window.SettlementCommands.updateEducationSpending = updateEducationSpending;

    // Justice & Watch
    window.SettlementCommands.updateJusticeSeverity = updateJusticeSeverity;
    window.SettlementCommands.updateWatch = updateWatch;

    // State Enterprises
    window.SettlementCommands.createStateEnterprise = createStateEnterprise;
    window.SettlementCommands.removeStateEnterprise = removeStateEnterprise;

    // Validation
    window.SettlementCommands.validateFeature = _validateFeature;

    // Role commands
    window.SettlementCommands.assignSettlementRole = assignSettlementRole;
    window.SettlementCommands.removeSettlementRole = removeSettlementRole;
    window.SettlementCommands.updateSettlementCharacterSkill = updateSettlementCharacterSkill;

    // Budget allocation commands
    window.SettlementCommands.allocateGovernmentSalaryBudget = allocateGovernmentSalaryBudget;
    window.SettlementCommands.allocateEducationBudget = allocateEducationBudget;
    window.SettlementCommands.getGovernmentSalaryRequirements = getGovernmentSalaryRequirements;

    // Public enterprise commands
    window.SettlementCommands.collectPublicEnterpriseProfits = collectPublicEnterpriseProfits;
    window.SettlementCommands.getPublicEnterpriseSummary = getPublicEnterpriseSummary;

    // Places of Worship commands
    window.SettlementCommands.addPlaceOfWorshipToSettlement = addPlaceOfWorshipToSettlement;
    window.SettlementCommands.removePlaceOfWorshipFromSettlement = removePlaceOfWorshipFromSettlement;
    window.SettlementCommands.updateDominantReligion = updateDominantReligion;
    window.SettlementCommands.calculateReligiousUnity = calculateReligiousUnity;

    // ================================================================
    // CIVIL LAW COMMANDS (NEW)
    // ================================================================
    window.SettlementCommands.addCivilLaw = addCivilLaw;
    window.SettlementCommands.updateCivilLaw = updateCivilLaw;
    window.SettlementCommands.removeCivilLaw = removeCivilLaw;
    window.SettlementCommands.getCivilLaws = getCivilLaws;
    window.SettlementCommands.getCivilLaw = getCivilLaw;

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
    window._assignSettlementRole = assignSettlementRole;
    window._removeSettlementRole = removeSettlementRole;
    window._updateSettlementCharacterSkill = updateSettlementCharacterSkill;
    window._allocateGovernmentSalaryBudget = allocateGovernmentSalaryBudget;
    window._allocateEducationBudget = allocateEducationBudget;
    window._getGovernmentSalaryRequirements = getGovernmentSalaryRequirements;
    window._collectPublicEnterpriseProfits = collectPublicEnterpriseProfits;
    window._getPublicEnterpriseSummary = getPublicEnterpriseSummary;
    window._addPlaceOfWorshipToSettlement = addPlaceOfWorshipToSettlement;
    window._removePlaceOfWorshipFromSettlement = removePlaceOfWorshipFromSettlement;
    window._updateDominantReligion = updateDominantReligion;
    window._calculateReligiousUnity = calculateReligiousUnity;
    window._addCivilLaw = addCivilLaw;
    window._updateCivilLaw = updateCivilLaw;
    window._removeCivilLaw = removeCivilLaw;
    window._getCivilLaws = getCivilLaws;
    window._getCivilLaw = getCivilLaw;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.SettlementCommands;
    }

})();