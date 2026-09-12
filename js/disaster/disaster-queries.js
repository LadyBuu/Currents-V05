/**
 * =============================================================================
 * STILL WATERS - DISASTER QUERIES (disaster-queries.js)
 * =============================================================================
 * 
 * LOCATION: js/core/disaster/disaster-queries.js
 * 
 * This file contains ALL read operations for disasters.
 * 
 * EXPORTED FUNCTIONS:
 *   - DisasterQueries.getDisaster(id)
 *   - DisasterQueries.getAllDisasters()
 *   - DisasterQueries.getDisastersByLocation(locationId)
 *   - DisasterQueries.getDisastersInYearRange(startYear, endYear)
 *   - DisasterQueries.getDisasterCount()
 *   - DisasterQueries.getDisasterTypeCount(disasterId)
 *   - DisasterQueries.getDisasterStats(locationId)
 *   - DisasterQueries.getDisasterTypeDistribution()
 *   - DisasterQueries.getDisasterSeverityStats()
 *   - DisasterQueries.getMostRecentDisaster(locationId)
 *   - DisasterQueries.getDeadliestDisasters(limit)
 *   - DisasterQueries.getLocationDisasterRisk(locationId)
 *   - DisasterQueries.getDestructionStatistics(locationId) - NEW
 *   - DisasterQueries.getDestroyedItems(disasterId, type) - NEW
 *   - DisasterQueries.getLocationDestroyedItems(locationId, options) - NEW
 * 
 * DEPENDENCIES:
 *   - disaster-state.js: DisasterState
 *   - disaster-constants.js: DISASTER_TYPES
 *   - accessors.js: getPlaceById
 * 
 * ICON POLICY: No emojis. No icons.
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getDisasterTypes() {
        return window.DISASTER_TYPES || [];
    }

    function _getPlaceById(id) {
        if (typeof window.getPlaceById === 'function') {
            return window.getPlaceById(id);
        }
        return null;
    }

    function _getPlaceName(id) {
        if (typeof window.getPlaceName === 'function') {
            return window.getPlaceName(id);
        }
        var place = _getPlaceById(id);
        return place ? place.displayName : 'Unknown';
    }

    function _getCurrentYear() {
    // Delegates to time.js — do not add fallback logic here.
    return typeof window.getCurrentYearSafe === 'function'
        ? window.getCurrentYearSafe()
        : 1250;
}

    // =========================================================================
    // 2. DISASTER QUERIES (Wrappers around DisasterState)
    // =========================================================================

    function getDisaster(disasterId) {
        return window.DisasterState.getDisaster(disasterId);
    }

    function getAllDisasters() {
        return window.DisasterState.getAllDisasters();
    }

    function getDisastersByLocation(locationId) {
        return window.DisasterState.getDisastersByLocation(locationId);
    }

    function getDisastersInYearRange(startYear, endYear) {
        return window.DisasterState.getDisastersInYearRange(startYear, endYear);
    }

    function getDisasterCount() {
        return window.DisasterState.getDisasterCount();
    }

    function getDisasterTypeCount(disasterId) {
        return window.DisasterState.getDisasterTypeCount(disasterId);
    }

    // =========================================================================
    // 3. DISASTER STATISTICS
    // =========================================================================

    function getDisasterStats(locationId) {
        var disasters = locationId ? getDisastersByLocation(locationId) : getAllDisasters();

        var stats = {
            total: disasters.length,
            totalDeaths: 0,
            totalProsperityLoss: 0,
            totalSchoolsDestroyed: 0,
            averageSeverity: 0,
            byType: {},
            byYear: {},
            deadliest: null,
            mostRecent: null
        };

        if (disasters.length === 0) {
            return stats;
        }

        var totalSeverity = 0;
        var maxDeaths = 0;
        var mostRecentYear = 0;

        for (var i = 0; i < disasters.length; i++) {
            var d = disasters[i];
            stats.totalDeaths += d.deaths || 0;
            stats.totalProsperityLoss += d.prosperityLoss || 0;
            stats.totalSchoolsDestroyed += d.schoolsDestroyed || 0;
            totalSeverity += d.severity || 0;

            // By type
            var typeKey = d.disasterType || d.disasterId || 'Unknown';
            stats.byType[typeKey] = (stats.byType[typeKey] || 0) + 1;

            // By year
            var yearKey = d.year || 0;
            stats.byYear[yearKey] = (stats.byYear[yearKey] || 0) + 1;

            // Deadliest
            if ((d.deaths || 0) > maxDeaths) {
                maxDeaths = d.deaths || 0;
                stats.deadliest = d;
            }

            // Most recent
            if ((d.year || 0) > mostRecentYear) {
                mostRecentYear = d.year || 0;
                stats.mostRecent = d;
            }
        }

        stats.averageSeverity = totalSeverity / disasters.length;

        return stats;
    }

    function getDisasterTypeDistribution() {
        var disasters = getAllDisasters();
        var distribution = {};

        for (var i = 0; i < disasters.length; i++) {
            var d = disasters[i];
            var type = d.disasterType || d.disasterId || 'Unknown';
            distribution[type] = (distribution[type] || 0) + 1;
        }

        return distribution;
    }

    function getDisasterSeverityStats() {
        var disasters = getAllDisasters();
        var stats = {
            min: Infinity,
            max: 0,
            average: 0,
            total: 0,
            distribution: {
                low: 0,     // 1-25
                medium: 0,  // 26-50
                high: 0,    // 51-75
                critical: 0 // 76-100
            }
        };

        if (disasters.length === 0) {
            stats.min = 0;
            return stats;
        }

        var totalSeverity = 0;

        for (var i = 0; i < disasters.length; i++) {
            var severity = disasters[i].severity || 0;
            totalSeverity += severity;

            if (severity < stats.min) stats.min = severity;
            if (severity > stats.max) stats.max = severity;

            if (severity <= 25) stats.distribution.low++;
            else if (severity <= 50) stats.distribution.medium++;
            else if (severity <= 75) stats.distribution.high++;
            else stats.distribution.critical++;
        }

        stats.average = totalSeverity / disasters.length;
        stats.total = disasters.length;

        return stats;
    }

    function getMostRecentDisaster(locationId) {
        var disasters = locationId ? getDisastersByLocation(locationId) : getAllDisasters();

        if (disasters.length === 0) return null;

        var mostRecent = disasters[0];
        for (var i = 1; i < disasters.length; i++) {
            if ((disasters[i].year || 0) > (mostRecent.year || 0)) {
                mostRecent = disasters[i];
            }
        }

        return mostRecent;
    }

    function getDeadliestDisasters(limit) {
        limit = limit || 5;
        var disasters = getAllDisasters();

        var sorted = disasters.slice().sort(function(a, b) {
            return (b.deaths || 0) - (a.deaths || 0);
        });

        return sorted.slice(0, limit);
    }

    function getLocationDisasterRisk(locationId) {
        var disasters = getDisastersByLocation(locationId);
        var risk = {
            score: 0,
            level: 'low',
            history: disasters.length,
            mostCommon: null,
            deadliest: null,
            totalDeaths: 0
        };

        if (disasters.length === 0) return risk;

        risk.totalDeaths = 0;
        var typeCounts = {};

        for (var i = 0; i < disasters.length; i++) {
            var d = disasters[i];
            risk.totalDeaths += d.deaths || 0;

            var type = d.disasterType || d.disasterId || 'Unknown';
            typeCounts[type] = (typeCounts[type] || 0) + 1;

            if (!risk.deadliest || (d.deaths || 0) > (risk.deadliest.deaths || 0)) {
                risk.deadliest = d;
            }
        }

        // Most common type
        var maxCount = 0;
        for (var type in typeCounts) {
            if (typeCounts.hasOwnProperty(type) && typeCounts[type] > maxCount) {
                maxCount = typeCounts[type];
                risk.mostCommon = type;
            }
        }

        // Calculate risk score (0-100)
        risk.score = Math.min(100, disasters.length * 5 + risk.totalDeaths * 0.1);

        if (risk.score < 25) risk.level = 'low';
        else if (risk.score < 50) risk.level = 'moderate';
        else if (risk.score < 75) risk.level = 'high';
        else risk.level = 'critical';

        return risk;
    }

    // =========================================================================
    // 4. DESTRUCTION STATISTICS (NEW)
    // =========================================================================

    /**
     * Gets destruction statistics for a location
     * @param {string} locationId - The location ID
     * @returns {Object} - Destruction statistics
     */
    function getDestructionStatistics(locationId) {
        var stats = {
            locationId: locationId,
            totalDisasters: 0,
            totalDestructions: {
                features: 0,
                schools: 0,
                enterprises: 0,
                residences: 0,
                households: 0
            },
            totalLoss: 0,
            byDisasterType: {},
            recentDestructions: [],
            worstDisaster: null
        };

        try {
            var disasters = getDisastersByLocation(locationId);
            if (!disasters || disasters.length === 0) return stats;

            stats.totalDisasters = disasters.length;

            var worstLoss = 0;

            for (var i = 0; i < disasters.length; i++) {
                var disaster = disasters[i];
                var damage = disaster.structuralDamage;
                if (!damage) continue;

                // Accumulate totals
                stats.totalDestructions.features += damage.featuresDestroyed || 0;
                stats.totalDestructions.schools += damage.schoolsDestroyed || 0;
                stats.totalDestructions.enterprises += damage.enterprisesDestroyed || 0;
                stats.totalDestructions.residences += damage.residencesDemolished || 0;
                stats.totalDestructions.households += damage.householdsDestroyed || 0;
                stats.totalLoss += damage.totalLoss || 0;

                // By disaster type
                var type = disaster.disasterId || 'unknown';
                if (!stats.byDisasterType[type]) {
                    stats.byDisasterType[type] = {
                        count: 0,
                        totalLoss: 0,
                        destructions: { features: 0, schools: 0, enterprises: 0, residences: 0, households: 0 }
                    };
                }
                stats.byDisasterType[type].count++;
                stats.byDisasterType[type].totalLoss += damage.totalLoss || 0;
                stats.byDisasterType[type].destructions.features += damage.featuresDestroyed || 0;
                stats.byDisasterType[type].destructions.schools += damage.schoolsDestroyed || 0;
                stats.byDisasterType[type].destructions.enterprises += damage.enterprisesDestroyed || 0;
                stats.byDisasterType[type].destructions.residences += damage.residencesDemolished || 0;
                stats.byDisasterType[type].destructions.households += damage.householdsDestroyed || 0;

                // Track worst disaster
                if ((damage.totalLoss || 0) > worstLoss) {
                    worstLoss = damage.totalLoss || 0;
                    stats.worstDisaster = {
                        id: disaster.id,
                        type: disaster.disasterType,
                        year: disaster.year,
                        totalLoss: damage.totalLoss,
                        featuresDestroyed: damage.featuresDestroyed || 0,
                        schoolsDestroyed: damage.schoolsDestroyed || 0,
                        enterprisesDestroyed: damage.enterprisesDestroyed || 0,
                        residencesDemolished: damage.residencesDemolished || 0,
                        householdsDestroyed: damage.householdsDestroyed || 0
                    };
                }

                // Recent destructions (last 5)
                if (stats.recentDestructions.length < 5) {
                    stats.recentDestructions.push({
                        disasterId: disaster.id,
                        type: disaster.disasterType,
                        year: disaster.year,
                        totalLoss: damage.totalLoss || 0,
                        destructions: {
                            features: damage.featuresDestroyed || 0,
                            schools: damage.schoolsDestroyed || 0,
                            enterprises: damage.enterprisesDestroyed || 0,
                            residences: damage.residencesDemolished || 0,
                            households: damage.householdsDestroyed || 0
                        }
                    });
                }
            }

            // Sort recent by year (newest first)
            stats.recentDestructions.sort(function(a, b) {
                return (b.year || 0) - (a.year || 0);
            });

        } catch (e) {
            // Error getting stats
        }

        return stats;
    }

    /**
     * Gets all destroyed items from a disaster
     * @param {string} disasterId - The disaster ID
     * @param {string} type - Optional: 'features', 'schools', 'enterprises', 'residences', 'households'
     * @returns {Array} - List of destroyed items
     */
    function getDestroyedItems(disasterId, type) {
        try {
            var disaster = getDisaster(disasterId);
            if (!disaster) return [];

            var damage = disaster.structuralDamage;
            if (!damage) return [];

            if (type) {
                return damage.destructionList ? damage.destructionList[type] || [] : [];
            }

            // Return all
            var all = [];
            var lists = damage.destructionList || {};
            for (var key in lists) {
                if (lists.hasOwnProperty(key)) {
                    var items = lists[key] || [];
                    for (var i = 0; i < items.length; i++) {
                        all.push({ ...items[i], category: key });
                    }
                }
            }
            return all;
        } catch (e) {
            return [];
        }
    }

    /**
     * Gets all destroyed items for a location
     * @param {string} locationId - Location ID
     * @param {Object} options - Filter options
     * @param {string} options.type - Filter by type
     * @param {number} options.limit - Max items to return
     * @returns {Array} - Array of destroyed items
     */
    function getLocationDestroyedItems(locationId, options) {
        options = options || {};
        var result = [];
        var limit = options.limit || 50;

        try {
            var disasters = getDisastersByLocation(locationId);
            if (!disasters || disasters.length === 0) return result;

            // Collect from all disasters
            for (var i = 0; i < disasters.length; i++) {
                var disaster = disasters[i];
                var damage = disaster.structuralDamage;
                if (!damage) continue;

                var lists = damage.destructionList || {};
                for (var key in lists) {
                    if (lists.hasOwnProperty(key)) {
                        if (options.type && options.type !== key) continue;
                        var items = lists[key] || [];
                        for (var j = 0; j < items.length; j++) {
                            result.push({
                                ...items[j],
                                category: key,
                                disasterId: disaster.id,
                                disasterType: disaster.disasterType,
                                disasterYear: disaster.year
                            });
                        }
                    }
                }
            }

            // Sort by year (most recent first)
            result.sort(function(a, b) {
                return (b.year || 0) - (a.year || 0);
            });

            // Apply limit
            if (result.length > limit) {
                result = result.slice(0, limit);
            }

        } catch (e) {
            // Error getting items
        }

        return result;
    }

    /**
     * Gets destruction statistics across all locations
     * @returns {Object} - Global destruction statistics
     */
    function getGlobalDestructionStatistics() {
        var stats = {
            totalDisasters: 0,
            totalDestructions: {
                features: 0,
                schools: 0,
                enterprises: 0,
                residences: 0,
                households: 0
            },
            totalLoss: 0,
            byDisasterType: {},
            byLocation: {},
            worstDisaster: null,
            deadliestDisaster: null
        };

        try {
            var disasters = getAllDisasters();
            stats.totalDisasters = disasters.length;

            var worstLoss = 0;
            var maxDeaths = 0;

            for (var i = 0; i < disasters.length; i++) {
                var disaster = disasters[i];
                var damage = disaster.structuralDamage;
                if (!damage) continue;

                // Accumulate totals
                stats.totalDestructions.features += damage.featuresDestroyed || 0;
                stats.totalDestructions.schools += damage.schoolsDestroyed || 0;
                stats.totalDestructions.enterprises += damage.enterprisesDestroyed || 0;
                stats.totalDestructions.residences += damage.residencesDemolished || 0;
                stats.totalDestructions.households += damage.householdsDestroyed || 0;
                stats.totalLoss += damage.totalLoss || 0;

                // By disaster type
                var type = disaster.disasterId || 'unknown';
                if (!stats.byDisasterType[type]) {
                    stats.byDisasterType[type] = {
                        count: 0,
                        totalLoss: 0,
                        destructions: { features: 0, schools: 0, enterprises: 0, residences: 0, households: 0 }
                    };
                }
                stats.byDisasterType[type].count++;
                stats.byDisasterType[type].totalLoss += damage.totalLoss || 0;
                stats.byDisasterType[type].destructions.features += damage.featuresDestroyed || 0;
                stats.byDisasterType[type].destructions.schools += damage.schoolsDestroyed || 0;
                stats.byDisasterType[type].destructions.enterprises += damage.enterprisesDestroyed || 0;
                stats.byDisasterType[type].destructions.residences += damage.residencesDemolished || 0;
                stats.byDisasterType[type].destructions.households += damage.householdsDestroyed || 0;

                // By location
                var locationKey = disaster.locationId || 'unknown';
                if (!stats.byLocation[locationKey]) {
                    stats.byLocation[locationKey] = {
                        count: 0,
                        totalLoss: 0,
                        destructions: { features: 0, schools: 0, enterprises: 0, residences: 0, households: 0 }
                    };
                }
                stats.byLocation[locationKey].count++;
                stats.byLocation[locationKey].totalLoss += damage.totalLoss || 0;
                stats.byLocation[locationKey].destructions.features += damage.featuresDestroyed || 0;
                stats.byLocation[locationKey].destructions.schools += damage.schoolsDestroyed || 0;
                stats.byLocation[locationKey].destructions.enterprises += damage.enterprisesDestroyed || 0;
                stats.byLocation[locationKey].destructions.residences += damage.residencesDemolished || 0;
                stats.byLocation[locationKey].destructions.households += damage.householdsDestroyed || 0;

                // Track worst disaster
                if ((damage.totalLoss || 0) > worstLoss) {
                    worstLoss = damage.totalLoss || 0;
                    stats.worstDisaster = {
                        id: disaster.id,
                        type: disaster.disasterType,
                        year: disaster.year,
                        location: disaster.locationName,
                        totalLoss: damage.totalLoss,
                        featuresDestroyed: damage.featuresDestroyed || 0,
                        schoolsDestroyed: damage.schoolsDestroyed || 0,
                        enterprisesDestroyed: damage.enterprisesDestroyed || 0,
                        residencesDemolished: damage.residencesDemolished || 0,
                        householdsDestroyed: damage.householdsDestroyed || 0
                    };
                }

                // Track deadliest disaster
                if ((disaster.deaths || 0) > maxDeaths) {
                    maxDeaths = disaster.deaths || 0;
                    stats.deadliestDisaster = {
                        id: disaster.id,
                        type: disaster.disasterType,
                        year: disaster.year,
                        location: disaster.locationName,
                        deaths: disaster.deaths || 0,
                        severity: disaster.severity || 0
                    };
                }
            }

        } catch (e) {
            // Error getting stats
        }

        return stats;
    }

    /**
     * Gets destruction statistics by disaster type
     * @param {string} disasterId - The disaster type ID
     * @returns {Object} - Destruction statistics for that type
     */
    function getDisasterTypeDestructionStats(disasterId) {
        var stats = {
            disasterId: disasterId,
            count: 0,
            totalLoss: 0,
            destructions: {
                features: 0,
                schools: 0,
                enterprises: 0,
                residences: 0,
                households: 0
            },
            averageLoss: 0,
            locations: []
        };

        try {
            var disasters = getAllDisasters();
            var typeDisasters = disasters.filter(function(d) {
                return d.disasterId === disasterId || d.disasterType === disasterId;
            });

            stats.count = typeDisasters.length;

            var locationMap = {};

            for (var i = 0; i < typeDisasters.length; i++) {
                var disaster = typeDisasters[i];
                var damage = disaster.structuralDamage;
                if (!damage) continue;

                stats.totalLoss += damage.totalLoss || 0;
                stats.destructions.features += damage.featuresDestroyed || 0;
                stats.destructions.schools += damage.schoolsDestroyed || 0;
                stats.destructions.enterprises += damage.enterprisesDestroyed || 0;
                stats.destructions.residences += damage.residencesDemolished || 0;
                stats.destructions.households += damage.householdsDestroyed || 0;

                var locationKey = disaster.locationId || 'unknown';
                if (!locationMap[locationKey]) {
                    locationMap[locationKey] = {
                        locationId: disaster.locationId,
                        locationName: disaster.locationName || 'Unknown',
                        count: 0,
                        totalLoss: 0
                    };
                }
                locationMap[locationKey].count++;
                locationMap[locationKey].totalLoss += damage.totalLoss || 0;
            }

            stats.locations = Object.values(locationMap);
            stats.locations.sort(function(a, b) {
                return b.totalLoss - a.totalLoss;
            });

            stats.averageLoss = stats.count > 0 ? stats.totalLoss / stats.count : 0;

        } catch (e) {
            // Error getting stats
        }

        return stats;
    }

    // =========================================================================
    // 5. EXPORTS
    // =========================================================================

    window.DisasterQueries = {
        // Basic queries
        getDisaster: getDisaster,
        getAllDisasters: getAllDisasters,
        getDisastersByLocation: getDisastersByLocation,
        getDisastersInYearRange: getDisastersInYearRange,
        getDisasterCount: getDisasterCount,
        getDisasterTypeCount: getDisasterTypeCount,

        // Statistics
        getDisasterStats: getDisasterStats,
        getDisasterTypeDistribution: getDisasterTypeDistribution,
        getDisasterSeverityStats: getDisasterSeverityStats,
        getMostRecentDisaster: getMostRecentDisaster,
        getDeadliestDisasters: getDeadliestDisasters,
        getLocationDisasterRisk: getLocationDisasterRisk,

        // NEW: Destruction statistics
        getDestructionStatistics: getDestructionStatistics,
        getDestroyedItems: getDestroyedItems,
        getLocationDestroyedItems: getLocationDestroyedItems,
        getGlobalDestructionStatistics: getGlobalDestructionStatistics,
        getDisasterTypeDestructionStats: getDisasterTypeDestructionStats
    };

    // Legacy aliases
    window._disasterQueries = window.DisasterQueries;

})();