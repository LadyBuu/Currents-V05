/**
 * =============================================================================
 * SETTLEMENT COMMANDS CORE - Infrastructure for settlement commands js/settlement/settlement-commands-core.js
 * =============================================================================
 * 
 * This file contains the core infrastructure for settlement commands:
 * - Recursion guards
 * - Dependency wrappers
 * - Validation helpers
 * - Shared utilities
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
    // Delegates to time.js — do not add fallback logic here.
    return typeof window.getCurrentYearSafe === 'function'
        ? window.getCurrentYearSafe()
        : 1250;
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
    // 4. SHARED UTILITIES
    // =========================================================================

    function _recordFeatureDemolition(locationId, featureId, record) {
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

    function _getDemolishedFeatures(locationId) {
        try {
            var settlement = _getSettlementData(locationId);
            if (!settlement) return [];
            return settlement.demolishedFeatures || [];
        } catch (e) {
            return [];
        }
    }

    function _getSettlementDemolitionStats(locationId) {
        var stats = {
            totalFeatures: 0,
            byDestroyedBy: {},
            recentDemolitions: []
        };

        try {
            var features = _getDemolishedFeatures(locationId);
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
    // 5. EXPORTS - CORE INFRASTRUCTURE
    // =========================================================================

    // Export all dependencies and utilities for use by command files
    window._SettlementCommandsCore = {
        // Guards
        getProcessingCommand: function() { return _processingCommand; },
        setProcessingCommand: function(val) { _processingCommand = val; },

        // Dependency wrappers
        getPlaceById: _getPlaceById,
        getPlaces: _getPlaces,
        getCharacterById: _getCharacterById,
        getCharacters: _getCharacters,
        getCurrentYear: _getCurrentYear,
        getLocationPopulationCount: _getLocationPopulationCount,
        saveMasterData: _saveMasterData,
        logEvent: _logEvent,
        showToast: _showToast,
        getIcon: _getIcon,
        getRoleById: _getRoleById,
        getSettlementRanks: _getSettlementRanks,
        getSettlementData: _getSettlementData,
        getSettlementFeatures: _getSettlementFeatures,
        getStateEnterpriseIds: _getStateEnterpriseIds,
        getAllSubLocationIds: _getAllSubLocationIds,
        getCurrentLocationId: _getCurrentLocationId,
        getSettlementEducationStats: _getSettlementEducationStats,
        getPlaceOfWorship: _getPlaceOfWorship,
        getReligion: _getReligion,
        getReligionQueries: _getReligionQueries,

        // Validation
        validateFeature: _validateFeature,

        // Utilities
        recordFeatureDemolition: _recordFeatureDemolition,
        getDemolishedFeatures: _getDemolishedFeatures,
        getSettlementDemolitionStats: _getSettlementDemolitionStats
    };

})();