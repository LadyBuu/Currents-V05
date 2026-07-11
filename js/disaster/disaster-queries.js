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
    // 4. EXPORTS
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
        getLocationDisasterRisk: getLocationDisasterRisk
    };

    // Legacy aliases
    window._disasterQueries = window.DisasterQueries;

})();