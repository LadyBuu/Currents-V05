/**
 * =============================================================================
 * SETTLEMENT QUERIES - All read operations for settlement system
 * =============================================================================
 * 
 * This file contains ALL read-only queries for settlement data:
 * - Settlement summary and details
 * - Rank queries
 * - Feature queries
 * - Economic queries
 * - Statistics and analytics
 * - Comparison and ranking
 * - LITERACY STATS (getSettlementLiteracyStats)
 * - ROLE-SETTLEMENT INTEGRATION (NEW)
 * 
 * No side effects, no mutations. Uses caching for performance.
 * 
 * DEPENDENCIES:
 *   - settlement-state.js (SettlementState)
 *   - settlement-economy.js (SettlementEconomy)
 *   - accessors.js (getPlaceById, getPlaces, getCurrentYear)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARD
    // =========================================================================

    var _processingQuery = false;

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getPlaceById(id) {
        return typeof window.getPlaceById === 'function' ? window.getPlaceById(id) : null;
    }

    function _getPlaces() {
        return typeof window.getPlaces === 'function' ? window.getPlaces() : [];
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

    function _getSettlementRanks() {
        return SettlementState._getAllRanks();
    }

    function _getSettlementData(locationId) {
        return SettlementState.getSettlementData(locationId);
    }

    function _getSettlementFeatures(locationId) {
        return SettlementState.getSettlementFeatures(locationId);
    }

    function _getSettlementBudget(locationId) {
        return SettlementState.getSettlementBudget(locationId);
    }

    function _getSettlementEmployment(locationId) {
        return SettlementState.getSettlementEmployment(locationId);
    }

    function _getCharacters() {
        return typeof window.getCharacters === 'function' ? window.getCharacters() : [];
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

    function _getRoleById(id) {
        if (typeof window.getRoleById === 'function') {
            return window.getRoleById(id);
        }
        if (typeof window.RoleState !== 'undefined') {
            return window.RoleState.getRole(id);
        }
        return null;
    }

    function _getRoleCategories() {
        if (typeof window.getRoleCategories === 'function') {
            return window.getRoleCategories();
        }
        if (typeof window.RoleState !== 'undefined') {
            return window.RoleState.getCategories();
        }
        return {};
    }

    function _getAllSubLocationIds(locationId) {
        if (typeof LocationState !== 'undefined' && LocationState.getAllSubLocationIds) {
            return LocationState.getAllSubLocationIds(locationId);
        }
        return [locationId];
    }

    // =========================================================================
    // 3. CORE SUMMARY QUERIES
    // =========================================================================

    function getSettlementSummary(locationId) {
        if (_processingQuery) {
            return null;
        }
        _processingQuery = true;

        try {
            var place = _getPlaceById(locationId);
            if (!place) return null;

            var data = _getSettlementData(locationId);
            if (!data) return null;

            var population = _getLocationPopulationCount(locationId);
            var ranks = _getSettlementRanks();
            var rank = ranks.find(function(r) { return r.id === data.rankId; });
            if (!rank) {
                rank = ranks[0];
            }

            var features = _getSettlementFeatures(locationId);

            var prosperityDescription = 'Stable';
            if (data.prosperity >= 90) prosperityDescription = 'Thriving';
            else if (data.prosperity >= 70) prosperityDescription = 'Prosperous';
            else if (data.prosperity >= 50) prosperityDescription = 'Stable';
            else if (data.prosperity >= 30) prosperityDescription = 'Struggling';
            else if (data.prosperity >= 10) prosperityDescription = 'Poor';
            else prosperityDescription = 'Desperate';

            var canUpgrade = false;
            var nextRank = null;
            var upgradeInfo = getUpgradeInfo(locationId);
            if (upgradeInfo) {
                canUpgrade = upgradeInfo.canUpgrade;
                nextRank = upgradeInfo.nextRank;
            }

            var totalDebt = data.totalDebt || 0;
            var wealth = data.wealth || 0;

            return {
                id: locationId,
                name: place.displayName,
                rank: rank,
                population: population,
                features: features,
                prosperity: {
                    value: data.prosperity || 50,
                    description: prosperityDescription
                },
                wealth: wealth,
                totalDebt: totalDebt,
                netWorth: wealth - totalDebt,
                foundedYear: data.foundedYear,
                lastUpgraded: data.lastUpgraded,
                specializationRoleId: data.specializationRoleId || null,
                canUpgrade: canUpgrade,
                nextRank: nextRank,
                taxRate: data.taxRate || 10,
                tradeTariff: data.tradeTariff || 5,
                industryTaxRate: data.industryTaxRate || 8,
                spending: {
                    military: data.militarySpending || 0,
                    infrastructure: data.infrastructureSpending || 0,
                    education: data.educationSpending || 0
                },
                justice: {
                    severity: data.justiceSeverity || 'medium',
                    hasWatch: data.hasWatch || false,
                    watchSize: data.watchSize || 0
                },
                crimeRate: data.crimeRate || 0.05,
                notes: data.notes || '',
                history: data.history || []
            };

        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 4. RANK QUERIES
    // =========================================================================

    function getSettlementRank(locationId) {
        if (_processingQuery) {
            return null;
        }
        _processingQuery = true;

        try {
            var ranks = _getSettlementRanks();
            var data = _getSettlementData(locationId);
            if (!data) return ranks[0] || null;

            var rank = ranks.find(function(r) { return r.id === data.rankId; });
            return rank || ranks[0] || null;

        } finally {
            _processingQuery = false;
        }
    }

    function getUpgradeInfo(locationId) {
        if (_processingQuery) {
            return null;
        }
        _processingQuery = true;

        try {
            var data = _getSettlementData(locationId);
            if (!data) return null;

            var ranks = _getSettlementRanks();
            var currentRank = ranks.find(function(r) { return r.id === data.rankId; });
            if (!currentRank) return null;

            var sortedRanks = ranks.slice().sort(function(a, b) { return a.order - b.order; });
            var currentIndex = sortedRanks.findIndex(function(r) { return r.id === data.rankId; });

            if (currentIndex === -1 || currentIndex >= sortedRanks.length - 1) {
                return { canUpgrade: false, nextRank: null, reason: 'Already at maximum rank' };
            }

            var nextRank = sortedRanks[currentIndex + 1];
            var population = _getLocationPopulationCount(locationId);

            return {
                canUpgrade: population >= nextRank.minPopulation,
                nextRank: nextRank,
                requiredPopulation: nextRank.minPopulation,
                currentPopulation: population,
                reason: population >= nextRank.minPopulation ? 'Ready to upgrade' : 'Need ' + (nextRank.minPopulation - population) + ' more people'
            };

        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 5. FEATURE QUERIES
    // =========================================================================

    function getSettlementFeatures(locationId) {
        if (_processingQuery) {
            return [];
        }
        _processingQuery = true;

        try {
            return _getSettlementFeatures(locationId);

        } finally {
            _processingQuery = false;
        }
    }

    function getAllFeatures() {
        if (_processingQuery) {
            return [];
        }
        _processingQuery = true;

        try {
            return SettlementState._getAllFeatures();

        } finally {
            _processingQuery = false;
        }
    }

    function getFeatureById(featureId) {
        if (_processingQuery) {
            return null;
        }
        _processingQuery = true;

        try {
            var features = SettlementState._getAllFeatures();
            return features.find(function(f) { return f.id === featureId; }) || null;

        } finally {
            _processingQuery = false;
        }
    }

    function getFeaturesByCategory(category) {
        if (_processingQuery) {
            return [];
        }
        _processingQuery = true;

        try {
            var features = SettlementState._getAllFeatures();
            return features.filter(function(f) { return f.category === category; });

        } finally {
            _processingQuery = false;
        }
    }

    function getFeatureCategories() {
        if (_processingQuery) {
            return {};
        }
        _processingQuery = true;

        try {
            var features = SettlementState._getAllFeatures();
            var categories = {};
            for (var i = 0; i < features.length; i++) {
                var cat = features[i].category || 'uncategorized';
                if (!categories[cat]) categories[cat] = [];
                categories[cat].push(features[i]);
            }
            return categories;

        } finally {
            _processingQuery = false;
        }
    }

    function canAffordFeature(locationId, featureId) {
        if (_processingQuery) {
            return false;
        }
        _processingQuery = true;

        try {
            var data = _getSettlementData(locationId);
            if (!data) return false;

            var feature = getFeatureById(featureId);
            if (!feature) return false;

            return (data.wealth || 0) >= feature.cost;

        } finally {
            _processingQuery = false;
        }
    }

    function wouldCreateDebt(locationId, featureId) {
        if (_processingQuery) {
            return false;
        }
        _processingQuery = true;

        try {
            var data = _getSettlementData(locationId);
            if (!data) return false;

            var feature = getFeatureById(featureId);
            if (!feature) return false;

            return (data.wealth || 0) < feature.cost;

        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 6. ECONOMIC QUERIES
    // =========================================================================

    function getSettlementBudget(locationId) {
        if (_processingQuery) {
            return null;
        }
        _processingQuery = true;

        try {
            return _getSettlementBudget(locationId);

        } finally {
            _processingQuery = false;
        }
    }

    function getSettlementEmployment(locationId) {
        if (_processingQuery) {
            return null;
        }
        _processingQuery = true;

        try {
            return _getSettlementEmployment(locationId);

        } finally {
            _processingQuery = false;
        }
    }

    function getTradeStatus(locationId) {
        if (_processingQuery) {
            return null;
        }
        _processingQuery = true;

        try {
            var features = _getSettlementFeatures(locationId);
            var data = _getSettlementData(locationId);
            if (!data) return null;

            var tradeBonus = 1.0;
            var tradeFeatures = 0;

            for (var i = 0; i < features.length; i++) {
                if (features[i].tradeBonus) {
                    tradeBonus += (features[i].tradeBonus - 1);
                    tradeFeatures++;
                }
            }

            var industries = typeof window.IndustryQueries !== 'undefined' ? window.IndustryQueries : null;
            if (industries) {
                var enterprises = industries.getLocationEnterprisesSummary(locationId);
                for (var i = 0; i < enterprises.length; i++) {
                    if (enterprises[i].category === 'commercial') {
                        tradeBonus += 0.02;
                        tradeFeatures++;
                    }
                }
            }

            var status = 'minor';
            var description = 'Minor trading center';
            if (tradeBonus > 0.5) { status = 'regional'; description = 'Regional trading center'; }
            if (tradeBonus > 1.0) { status = 'major'; description = 'Major trading hub'; }
            if (tradeBonus > 2.0) { status = 'hub'; description = 'Regional trade hub'; }
            if (tradeBonus > 3.0) { status = 'metropolis'; description = 'Trade metropolis'; }

            return {
                status: status,
                tradeFeatures: tradeFeatures,
                totalBonus: tradeBonus,
                description: description + ' with ' + tradeFeatures + ' commercial facilities'
            };

        } finally {
            _processingQuery = false;
        }
    }

    function getSettlementIncome(locationId) {
        if (_processingQuery) {
            return 0;
        }
        _processingQuery = true;

        try {
            var data = _getSettlementData(locationId);
            if (!data) return 0;

            var budget = _getSettlementBudget(locationId);
            return budget ? budget.totalIncome || 0 : 0;

        } finally {
            _processingQuery = false;
        }
    }

    function getSettlementExpenses(locationId) {
        if (_processingQuery) {
            return 0;
        }
        _processingQuery = true;

        try {
            var data = _getSettlementData(locationId);
            if (!data) return 0;

            var budget = _getSettlementBudget(locationId);
            return budget ? budget.totalExpenses || 0 : 0;

        } finally {
            _processingQuery = false;
        }
    }

    function getSettlementSurplus(locationId) {
        if (_processingQuery) {
            return 0;
        }
        _processingQuery = true;

        try {
            var data = _getSettlementData(locationId);
            if (!data) return 0;

            var budget = _getSettlementBudget(locationId);
            return budget ? budget.annualSurplus || 0 : 0;

        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 7. LITERACY STATS - CRITICAL
    // =========================================================================

    function getSettlementLiteracyStats(locationId) {
        if (_processingQuery) {
            return {
                locationId: locationId,
                totalPopulation: 0,
                literateCount: 0,
                literacyRate: 0,
                educationLevels: { illiterate: 0, basic: 0, literate: 0, educated: 0, scholar: 0 },
                hasSchools: false
            };
        }
        _processingQuery = true;

        try {
            if (typeof SettlementEconomy !== 'undefined' && SettlementEconomy.getSettlementLiteracyStats) {
                return SettlementEconomy.getSettlementLiteracyStats(locationId);
            }

            var emptyResult = {
                locationId: locationId,
                totalPopulation: 0,
                literateCount: 0,
                literacyRate: 0,
                educationLevels: { illiterate: 0, basic: 0, literate: 0, educated: 0, scholar: 0 },
                hasSchools: false
            };

            if (!locationId) return emptyResult;

            var characters = _getCharacters();
            var locationIds = _getAllSubLocationIds(locationId);
            var locationIdSet = new Set(locationIds);

            var displayNameToId = {};
            var places = _getPlaces();
            for (var i = 0; i < places.length; i++) {
                displayNameToId[places[i].displayName] = places[i].id;
            }

            var total = 0;
            var literate = 0;
            var educationLevels = {
                illiterate: 0,
                basic: 0,
                literate: 0,
                educated: 0,
                scholar: 0
            };

            var hasLiteracySystem = typeof window.isLiterate === 'function' &&
                                   typeof window.getEducationLevel === 'function';

            for (var i = 0; i < characters.length; i++) {
                var char = characters[i];
                if (char.isDeceased) continue;

                var charLocation = typeof window.getCurrentLocation === 'function' ?
                    window.getCurrentLocation(char) : 'Unknown';
                var charLocationId = displayNameToId[charLocation];

                if (charLocationId && locationIdSet.has(charLocationId)) {
                    total++;

                    if (hasLiteracySystem) {
                        if (window.isLiterate(char.id)) {
                            literate++;
                        }
                        var eduLevel = window.getEducationLevel(char.id);
                        if (eduLevel && educationLevels[eduLevel.id] !== undefined) {
                            educationLevels[eduLevel.id]++;
                        }
                    } else {
                        var literacyLevel = (char.subjectProgress && char.subjectProgress.literacy) ?
                            char.subjectProgress.literacy.level || 0 : 0;
                        if (literacyLevel >= 30) literate++;

                        if (literacyLevel >= 70) educationLevels.scholar++;
                        else if (literacyLevel >= 50) educationLevels.educated++;
                        else if (literacyLevel >= 30) educationLevels.literate++;
                        else if (literacyLevel >= 10) educationLevels.basic++;
                        else educationLevels.illiterate++;
                    }
                }
            }

            var hasSchools = false;
            var features = _getSettlementFeatures(locationId);
            for (var i = 0; i < features.length; i++) {
                if (features[i].id === 'school' || features[i].id === 'library') {
                    hasSchools = true;
                    break;
                }
            }

            return {
                locationId: locationId,
                totalPopulation: total,
                literateCount: literate,
                literacyRate: total > 0 ? Math.round((literate / total) * 100) : 0,
                educationLevels: educationLevels,
                hasSchools: hasSchools
            };

        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 8. STATISTICS QUERIES
    // =========================================================================

    function getSettlementStatistics(locationId) {
        if (_processingQuery) {
            return null;
        }
        _processingQuery = true;

        try {
            var summary = getSettlementSummary(locationId);
            if (!summary) return null;

            var features = _getSettlementFeatures(locationId);
            var budget = _getSettlementBudget(locationId);
            var employment = _getSettlementEmployment(locationId);
            var trade = getTradeStatus(locationId);

            return {
                locationId: locationId,
                locationName: summary.name,
                rank: summary.rank.name,
                population: summary.population,
                prosperity: summary.prosperity.value,
                wealth: summary.wealth,
                debt: summary.totalDebt,
                netWorth: summary.netWorth,
                featureCount: features.length,
                features: features.map(function(f) { return f.name; }),
                budget: budget,
                employment: employment,
                trade: trade,
                taxRate: summary.taxRate,
                crimeRate: summary.crimeRate,
                spending: summary.spending
            };

        } finally {
            _processingQuery = false;
        }
    }

    function getGlobalSettlementStatistics() {
        if (_processingQuery) {
            return null;
        }
        _processingQuery = true;

        try {
            var places = _getPlaces();
            var stats = {
                totalSettlements: 0,
                totalPopulation: 0,
                totalWealth: 0,
                totalDebt: 0,
                averageProsperity: 0,
                byRank: {},
                byStatus: {},
                largest: null,
                wealthiest: null,
                mostProsperous: null
            };

            var prosperitySum = 0;
            var count = 0;

            for (var i = 0; i < places.length; i++) {
                var place = places[i];
                var summary = getSettlementSummary(place.id);
                if (!summary) continue;

                stats.totalSettlements++;
                stats.totalPopulation += summary.population || 0;
                stats.totalWealth += summary.wealth || 0;
                stats.totalDebt += summary.totalDebt || 0;

                var rankName = summary.rank ? summary.rank.name : 'Unknown';
                stats.byRank[rankName] = (stats.byRank[rankName] || 0) + 1;

                var prosperityValue = summary.prosperity ? summary.prosperity.value : 0;
                prosperitySum += prosperityValue;
                count++;

                if (!stats.largest || (summary.population || 0) > stats.largest.population) {
                    stats.largest = { name: summary.name, population: summary.population || 0 };
                }
                if (!stats.wealthiest || (summary.wealth || 0) > stats.wealthiest.wealth) {
                    stats.wealthiest = { name: summary.name, wealth: summary.wealth || 0 };
                }
                if (!stats.mostProsperous || prosperityValue > stats.mostProsperous.prosperity) {
                    stats.mostProsperous = { name: summary.name, prosperity: prosperityValue };
                }
            }

            stats.averageProsperity = count > 0 ? Math.round(prosperitySum / count) : 0;

            return stats;

        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 9. RANKING QUERIES
    // =========================================================================

    function getLargestSettlements(limit) {
        if (_processingQuery) {
            return [];
        }
        _processingQuery = true;

        try {
            limit = limit || 10;
            var places = _getPlaces();
            var results = [];

            for (var i = 0; i < places.length; i++) {
                var population = _getLocationPopulationCount(places[i].id);
                results.push({
                    locationId: places[i].id,
                    locationName: places[i].displayName,
                    population: population
                });
            }

            results.sort(function(a, b) { return b.population - a.population; });
            return results.slice(0, limit);

        } finally {
            _processingQuery = false;
        }
    }

    function getWealthiestSettlements(limit) {
        if (_processingQuery) {
            return [];
        }
        _processingQuery = true;

        try {
            limit = limit || 10;
            var places = _getPlaces();
            var results = [];

            for (var i = 0; i < places.length; i++) {
                var data = _getSettlementData(places[i].id);
                results.push({
                    locationId: places[i].id,
                    locationName: places[i].displayName,
                    wealth: data ? data.wealth || 0 : 0
                });
            }

            results.sort(function(a, b) { return b.wealth - a.wealth; });
            return results.slice(0, limit);

        } finally {
            _processingQuery = false;
        }
    }

    function getMostProsperousSettlements(limit) {
        if (_processingQuery) {
            return [];
        }
        _processingQuery = true;

        try {
            limit = limit || 10;
            var places = _getPlaces();
            var results = [];

            for (var i = 0; i < places.length; i++) {
                var data = _getSettlementData(places[i].id);
                results.push({
                    locationId: places[i].id,
                    locationName: places[i].displayName,
                    prosperity: data ? data.prosperity || 50 : 50
                });
            }

            results.sort(function(a, b) { return b.prosperity - a.prosperity; });
            return results.slice(0, limit);

        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 10. ROLE-SETTLEMENT INTEGRATION (NEW)
    // =========================================================================

    /**
     * Gets all roles present in a settlement (with counts)
     * @param {string} locationId - Settlement location ID
     * @returns {Object} Role distribution
     */
    function getSettlementRoles(locationId) {
        if (_processingQuery) {
            return {};
        }
        _processingQuery = true;

        try {
            if (!locationId) return {};

            // Use LocationQueries if available
            if (typeof LocationQueries !== 'undefined' && 
                LocationQueries.getRolesAtLocation) {
                return LocationQueries.getRolesAtLocation(locationId);
            }

            // Fallback implementation
            var characters = _getCharacters();
            var locationIds = _getAllSubLocationIds(locationId);
            var locationIdSet = new Set(locationIds);
            var roles = {};

            for (var i = 0; i < characters.length; i++) {
                var char = characters[i];
                if (char.isDeceased) continue;

                var charLocationId = _getCurrentLocationId(char);
                if (charLocationId && locationIdSet.has(charLocationId)) {
                    if (char.professions) {
                        for (var j = 0; j < char.professions.length; j++) {
                            var prof = char.professions[j];
                            if (!roles[prof.id]) {
                                var role = _getRoleById(prof.id);
                                roles[prof.id] = {
                                    id: prof.id,
                                    name: prof.name || (role ? role.name : prof.id),
                                    count: 0
                                };
                            }
                            roles[prof.id].count++;
                        }
                    }
                }
            }

            return roles;

        } finally {
            _processingQuery = false;
        }
    }

    /**
     * Gets characters in a settlement with a specific role
     * @param {string} locationId - Settlement location ID
     * @param {string} roleId - Role ID
     * @param {boolean} mastersOnly - Only masters (skill 76+)
     * @returns {Array} Character objects
     */
    function getSettlementCharactersByRole(locationId, roleId, mastersOnly) {
        if (_processingQuery) {
            return [];
        }
        _processingQuery = true;

        try {
            if (!locationId || !roleId) return [];

            // Use LocationQueries if available
            if (typeof LocationQueries !== 'undefined' &&
                LocationQueries.getCharactersByRoleAtLocation) {
                return LocationQueries.getCharactersByRoleAtLocation(locationId, roleId, mastersOnly);
            }

            // Fallback implementation
            var characters = _getCharacters();
            var locationIds = _getAllSubLocationIds(locationId);
            var locationIdSet = new Set(locationIds);
            var results = [];

            for (var i = 0; i < characters.length; i++) {
                var char = characters[i];
                if (char.isDeceased) continue;

                var charLocationId = _getCurrentLocationId(char);
                if (!charLocationId || !locationIdSet.has(charLocationId)) continue;

                if (char.professions) {
                    for (var j = 0; j < char.professions.length; j++) {
                        var prof = char.professions[j];
                        if (prof.id === roleId) {
                            var skillLevel = prof.skillLevel || 0;
                            if (mastersOnly && skillLevel < 76) continue;
                            results.push(char);
                            break;
                        }
                    }
                }
            }

            return results;

        } finally {
            _processingQuery = false;
        }
    }

    /**
     * Gets role statistics for a settlement
     * @param {string} locationId - Settlement location ID
     * @returns {Object} Role statistics
     */
    function getSettlementRoleStats(locationId) {
        if (_processingQuery) {
            return null;
        }
        _processingQuery = true;

        try {
            if (!locationId) return null;

            var roles = getSettlementRoles(locationId);
            var roleIds = Object.keys(roles);
            var total = 0;

            for (var i = 0; i < roleIds.length; i++) {
                total += roles[roleIds[i]].count;
            }

            var place = _getPlaceById(locationId);
            var categories = _getRoleCategories();

            var stats = {
                settlementId: locationId,
                settlementName: place ? place.displayName : 'Unknown',
                totalProfessions: total,
                uniqueRoles: roleIds.length,
                topRoles: [],
                byCategory: {}
            };

            // Get top 5 roles
            var sorted = roleIds.slice().sort(function(a, b) {
                return roles[b].count - roles[a].count;
            });

            for (var i = 0; i < Math.min(5, sorted.length); i++) {
                var id = sorted[i];
                var role = roles[id];
                stats.topRoles.push({
                    id: id,
                    name: role.name,
                    count: role.count,
                    percentage: total > 0 ? Math.round((role.count / total) * 100) : 0
                });
            }

            // Group by category
            for (var i = 0; i < roleIds.length; i++) {
                var id = roleIds[i];
                var role = roles[id];
                var roleObj = _getRoleById(id);
                var category = roleObj ? (roleObj.category || 'uncategorized') : 'uncategorized';

                if (!stats.byCategory[category]) {
                    var catName = categories[category] ? categories[category].name : 'Uncategorized';
                    stats.byCategory[category] = {
                        id: category,
                        name: catName,
                        count: 0,
                        roles: []
                    };
                }
                stats.byCategory[category].count += role.count;
                stats.byCategory[category].roles.push({
                    id: id,
                    name: role.name,
                    count: role.count
                });
            }

            // Sort categories by count
            var catKeys = Object.keys(stats.byCategory);
            var sortedCats = {};
            catKeys.sort(function(a, b) {
                return stats.byCategory[b].count - stats.byCategory[a].count;
            });
            for (var i = 0; i < catKeys.length; i++) {
                sortedCats[catKeys[i]] = stats.byCategory[catKeys[i]];
            }
            stats.byCategory = sortedCats;

            return stats;

        } finally {
            _processingQuery = false;
        }
    }

    /**
     * Gets master concentration in a settlement
     * @param {string} locationId - Settlement location ID
     * @param {string} roleId - Optional role ID filter
     * @returns {Object} Master statistics
     */
    function getSettlementMasterStats(locationId, roleId) {
        if (_processingQuery) {
            return null;
        }
        _processingQuery = true;

        try {
            if (!locationId) return null;

            var locationIds = _getAllSubLocationIds(locationId);
            var locationIdSet = new Set(locationIds);
            var characters = _getCharacters();
            var masters = [];
            var masterCount = 0;
            var byRole = {};

            for (var i = 0; i < characters.length; i++) {
                var char = characters[i];
                if (char.isDeceased) continue;

                var charLocationId = _getCurrentLocationId(char);
                if (!charLocationId || !locationIdSet.has(charLocationId)) continue;

                if (char.professions) {
                    for (var j = 0; j < char.professions.length; j++) {
                        var prof = char.professions[j];
                        var skillLevel = prof.skillLevel || 0;
                        if (skillLevel >= 76) {
                            if (!roleId || prof.id === roleId) {
                                if (!byRole[prof.id]) {
                                    var role = _getRoleById(prof.id);
                                    byRole[prof.id] = {
                                        id: prof.id,
                                        name: prof.name || (role ? role.name : prof.id),
                                        count: 0,
                                        masters: []
                                    };
                                }
                                byRole[prof.id].count++;
                                byRole[prof.id].masters.push({
                                    id: char.id,
                                    name: char.name + (char.surname ? ' ' + char.surname : ''),
                                    skillLevel: skillLevel
                                });
                                masterCount++;
                                masters.push(char);
                            }
                        }
                    }
                }
            }

            var place = _getPlaceById(locationId);

            return {
                settlementId: locationId,
                settlementName: place ? place.displayName : 'Unknown',
                totalMasters: masterCount,
                uniqueMasterRoles: Object.keys(byRole).length,
                byRole: byRole,
                masters: masters.slice(0, 50) // Limit for performance
            };

        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 11. EXPORTS
    // =========================================================================

    window.SettlementQueries = {
        getSettlementSummary: getSettlementSummary,
        getSettlementRank: getSettlementRank,
        getUpgradeInfo: getUpgradeInfo,
        getSettlementFeatures: getSettlementFeatures,
        getAllFeatures: getAllFeatures,
        getFeatureById: getFeatureById,
        getFeaturesByCategory: getFeaturesByCategory,
        getFeatureCategories: getFeatureCategories,
        canAffordFeature: canAffordFeature,
        wouldCreateDebt: wouldCreateDebt,
        getSettlementBudget: getSettlementBudget,
        getSettlementEmployment: getSettlementEmployment,
        getTradeStatus: getTradeStatus,
        getSettlementIncome: getSettlementIncome,
        getSettlementExpenses: getSettlementExpenses,
        getSettlementSurplus: getSettlementSurplus,
        getSettlementLiteracyStats: getSettlementLiteracyStats,
        getSettlementStatistics: getSettlementStatistics,
        getGlobalSettlementStatistics: getGlobalSettlementStatistics,
        getLargestSettlements: getLargestSettlements,
        getWealthiestSettlements: getWealthiestSettlements,
        getMostProsperousSettlements: getMostProsperousSettlements,
        // NEW: Role-settlement integration
        getSettlementRoles: getSettlementRoles,
        getSettlementCharactersByRole: getSettlementCharactersByRole,
        getSettlementRoleStats: getSettlementRoleStats,
        getSettlementMasterStats: getSettlementMasterStats
    };

})();