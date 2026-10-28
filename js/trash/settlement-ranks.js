/**
 * =============================================================================
 * SETTLEMENT RANKS - Business logic for settlement ranks js/settlement/settlement-ranks.js
 * =============================================================================
 * 
 * This file contains business logic for:
 * - Rank definitions
 * - Rank calculation from population
 * - Rank upgrade validation
 * - Rank effects (tax, prosperity, population modifiers)
 * 
 * DEPENDENCIES:
 *   - settlement-state.js (SettlementState)
 *   - accessors.js (getPlaceById, getCurrentYear)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARD
    // =========================================================================

    var _processingRanks = false;

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getLocationPopulationCount(locationId) {
        if (typeof window.getLocationPopulationCount === 'function') {
            return window.getLocationPopulationCount(locationId);
        }
        return 0;
    }

    function _getSettlementRanks() {
        return SettlementState._getAllRanks();
    }

    function _getSettlementData(locationId) {
        return SettlementState.getSettlementData(locationId);
    }

    // =========================================================================
    // 3. RANK DEFINITIONS
    // =========================================================================

    function getAllRanks() {
        if (_processingRanks) {
            return [];
        }
        _processingRanks = true;

        try {
            return _getSettlementRanks();

        } finally {
            _processingRanks = false;
        }
    }

    function getRankById(rankId) {
        if (_processingRanks) {
            return null;
        }
        _processingRanks = true;

        try {
            var ranks = getAllRanks();
            return ranks.find(function(r) { return r.id === rankId; }) || null;

        } finally {
            _processingRanks = false;
        }
    }

    function getRankFromPopulation(population) {
        if (_processingRanks) {
            return null;
        }
        _processingRanks = true;

        try {
            var ranks = getAllRanks();
            var sortedRanks = ranks.slice().sort(function(a, b) { return a.order - b.order; });

            for (var i = sortedRanks.length - 1; i >= 0; i--) {
                if (population >= sortedRanks[i].minPopulation) {
                    return sortedRanks[i];
                }
            }

            return sortedRanks[0] || null;

        } finally {
            _processingRanks = false;
        }
    }

    // =========================================================================
    // 4. RANK CALCULATION
    // =========================================================================

    function getSettlementRank(locationId) {
        if (_processingRanks) {
            return null;
        }
        _processingRanks = true;

        try {
            var population = _getLocationPopulationCount(locationId);
            return getRankFromPopulation(population);

        } finally {
            _processingRanks = false;
        }
    }

    function getNextRank(locationId) {
        if (_processingRanks) {
            return null;
        }
        _processingRanks = true;

        try {
            var currentRank = getSettlementRank(locationId);
            if (!currentRank) return null;

            var ranks = getAllRanks();
            var sortedRanks = ranks.slice().sort(function(a, b) { return a.order - b.order; });
            var currentIndex = sortedRanks.findIndex(function(r) { return r.id === currentRank.id; });

            if (currentIndex === -1 || currentIndex >= sortedRanks.length - 1) {
                return null;
            }

            return sortedRanks[currentIndex + 1];

        } finally {
            _processingRanks = false;
        }
    }

    function canUpgrade(locationId) {
        if (_processingRanks) {
            return false;
        }
        _processingRanks = true;

        try {
            var nextRank = getNextRank(locationId);
            if (!nextRank) return false;

            var population = _getLocationPopulationCount(locationId);
            return population >= nextRank.minPopulation;

        } finally {
            _processingRanks = false;
        }
    }

    function getUpgradeRequirements(locationId) {
        if (_processingRanks) {
            return null;
        }
        _processingRanks = true;

        try {
            var currentRank = getSettlementRank(locationId);
            var nextRank = getNextRank(locationId);
            var population = _getLocationPopulationCount(locationId);

            if (!currentRank) return null;

            var result = {
                currentRank: currentRank,
                nextRank: nextRank,
                currentPopulation: population,
                canUpgrade: false,
                requirements: []
            };

            if (!nextRank) {
                result.requirements.push('Already at maximum rank');
                return result;
            }

            var populationNeeded = nextRank.minPopulation - population;
            if (populationNeeded > 0) {
                result.requirements.push('Need ' + populationNeeded + ' more people (currently ' + population + ', need ' + nextRank.minPopulation + ')');
            }

            var data = _getSettlementData(locationId);
            var prosperity = data ? data.prosperity || 50 : 50;
            if (prosperity < 50) {
                result.requirements.push('Prosperity too low (currently ' + prosperity + '%, need 50%)');
            }

            result.canUpgrade = populationNeeded <= 0 && prosperity >= 50;

            return result;

        } finally {
            _processingRanks = false;
        }
    }

    // =========================================================================
    // 5. RANK EFFECTS
    // =========================================================================

    function getRankTaxBonus(rankId) {
        if (_processingRanks) {
            return 0;
        }
        _processingRanks = true;

        try {
            var rank = getRankById(rankId);
            if (!rank) return 0;

            return rank.baseTax || 5;

        } finally {
            _processingRanks = false;
        }
    }

    function getRankProsperityModifier(rankId) {
        if (_processingRanks) {
            return 1;
        }
        _processingRanks = true;

        try {
            var rank = getRankById(rankId);
            if (!rank) return 1;

            var modifiers = {
                'hamlet': 0.8,
                'village': 0.9,
                'town': 1.0,
                'city': 1.1,
                'metropolis': 1.2
            };

            return modifiers[rankId] || 1.0;

        } finally {
            _processingRanks = false;
        }
    }

    function getRankPopulationModifier(rankId) {
        if (_processingRanks) {
            return 1;
        }
        _processingRanks = true;

        try {
            var rank = getRankById(rankId);
            if (!rank) return 1;

            var modifiers = {
                'hamlet': 1.0,
                'village': 1.1,
                'town': 1.2,
                'city': 1.3,
                'metropolis': 1.4
            };

            return modifiers[rankId] || 1.0;

        } finally {
            _processingRanks = false;
        }
    }

    // =========================================================================
    // 6. EXPORTS
    // =========================================================================

    window.SettlementRanks = {
        getAllRanks: getAllRanks,
        getRankById: getRankById,
        getRankFromPopulation: getRankFromPopulation,
        getSettlementRank: getSettlementRank,
        getNextRank: getNextRank,
        canUpgrade: canUpgrade,
        getUpgradeRequirements: getUpgradeRequirements,
        getRankTaxBonus: getRankTaxBonus,
        getRankProsperityModifier: getRankProsperityModifier,
        getRankPopulationModifier: getRankPopulationModifier
    };

})();
