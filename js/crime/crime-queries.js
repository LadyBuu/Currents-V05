/**
 * =============================================================================
 * STILL WATERS - CRIME & VENDETTA QUERIES (crime-queries.js)
 * =============================================================================
 * 
 * LOCATION: js/core/crime/crime-queries.js
 * 
 * This file contains ALL read operations for crimes and vendettas.
 * 
 * EXPORTED FUNCTIONS:
 *   - CrimeQueries.getCrime(id)
 *   - CrimeQueries.getAllCrimes()
 *   - CrimeQueries.getCrimesByCharacter(characterId)
 *   - CrimeQueries.getCrimesByType(type)
 *   - CrimeQueries.getCrimesByLocation(locationId)
 *   - CrimeQueries.getUnsolvedCrimes()
 *   - CrimeQueries.getCrimeCount()
 *   - CrimeQueries.getVendetta(id)
 *   - CrimeQueries.getAllVendettas(options)
 *   - CrimeQueries.getVendettasByHousehold(householdId, options)
 *   - CrimeQueries.getVendettasByCharacter(characterId, options)
 *   - CrimeQueries.getActiveVendettas(householdId)
 *   - CrimeQueries.getVendettaCount()
 *   - CrimeQueries.getLocationCrimeStats(locationId, year)
 *   - CrimeQueries.getCrimeTrends(locationId, years)
 *   - CrimeQueries.getCrimeTypeDistribution(locationId)
 *   - CrimeQueries.getOverallCrimeStats()
 *   - CrimeQueries.getCrimeSeverityStats()
 *   - CrimeQueries.getCrimeRateByLocation(locationId)
 *   - CrimeQueries.getCrimeClearanceRate()
 *   - CrimeQueries.getVendettaStats(householdId)
 * 
 * DEPENDENCIES:
 *   - crime-state.js: CrimeState
 *   - accessors.js: getCharacterById, getPlaceById, getPlaces
 *   - time.js: getCurrentYearSafe
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

    function _getCurrentYear() {
    // Delegates to time.js — do not add fallback logic here.
    return typeof window.getCurrentYearSafe === 'function'
        ? window.getCurrentYearSafe()
        : 1250;
}

    function _getCharacterById(id) {
        if (typeof window.getCharacterById === 'function') {
            return window.getCharacterById(id);
        }
        return null;
    }

    function _getPlaceById(id) {
        if (typeof window.getPlaceById === 'function') {
            return window.getPlaceById(id);
        }
        return null;
    }

    function _getPlaces() {
        if (typeof window.getPlaces === 'function') {
            return window.getPlaces();
        }
        return [];
    }

    function _getLocationPopulationCount(locationId) {
        if (typeof window.getLocationPopulationCount === 'function') {
            return window.getLocationPopulationCount(locationId);
        }
        return 1000;
    }

    function _getCrimeTypes() {
        return window.CRIME_TYPES || {
            MURDER: 'murder',
            EXECUTION: 'execution',
            THEFT: 'theft',
            ADULTERY: 'adultery',
            TREASON: 'treason'
        };
    }

    // =========================================================================
    // 2. CRIME QUERIES (Wrappers around CrimeState)
    // =========================================================================

    function getCrime(crimeId) {
        return window.CrimeState.getCrime(crimeId);
    }

    function getAllCrimes() {
        return window.CrimeState.getAllCrimes();
    }

    function getCrimesByCharacter(characterId) {
        return window.CrimeState.getCrimesByCharacter(characterId);
    }

    function getCrimesByType(type) {
        return window.CrimeState.getCrimesByType(type);
    }

    function getCrimesByLocation(locationId) {
        return window.CrimeState.getCrimesByLocation(locationId);
    }

    function getUnsolvedCrimes() {
        return window.CrimeState.getUnsolvedCrimes();
    }

    function getCrimeCount() {
        return window.CrimeState.getCrimeCount();
    }

    // =========================================================================
    // 3. VENDETTA QUERIES (Wrappers around CrimeState)
    // =========================================================================

    function getVendetta(vendettaId) {
        return window.CrimeState.getVendetta(vendettaId);
    }

    function getAllVendettas(options) {
        return window.CrimeState.getAllVendettas(options);
    }

    function getVendettasByHousehold(householdId, options) {
        return window.CrimeState.getVendettasByHousehold(householdId, options);
    }

    function getVendettasByCharacter(characterId, options) {
        return window.CrimeState.getVendettasByCharacter(characterId, options);
    }

    function getActiveVendettas(householdId) {
        return window.CrimeState.getActiveVendettas(householdId);
    }

    function getVendettaCount() {
        return window.CrimeState.getVendettaCount();
    }

    // =========================================================================
    // 4. CRIME STATISTICS
    // =========================================================================

    /**
     * Gets crime statistics for a location
     * @param {string} locationId - Location ID
     * @param {number} year - Optional year filter
     * @returns {Object} Crime statistics
     */
    function getLocationCrimeStats(locationId, year) {
        var targetYear = year || _getCurrentYear();
        var allCrimes = getAllCrimes();
        var locationCrimes = allCrimes.filter(function(c) {
            return c.locationId === locationId;
        });

        if (year) {
            locationCrimes = locationCrimes.filter(function(c) {
                return c.year >= year - 5 && c.year <= year;
            });
        }

        var recentCrimes = locationCrimes.filter(function(c) {
            return c.year >= targetYear - 5;
        });

        var solvedCount = 0;
        for (var i = 0; i < locationCrimes.length; i++) {
            if (locationCrimes[i].solved) solvedCount++;
        }

        var unsolvedCount = locationCrimes.length - solvedCount;
        var solvedRate = locationCrimes.length > 0 ? (solvedCount / locationCrimes.length) * 100 : 0;

        var typeDistribution = {};
        for (var i = 0; i < locationCrimes.length; i++) {
            var crime = locationCrimes[i];
            typeDistribution[crime.type] = (typeDistribution[crime.type] || 0) + 1;
        }

        var yearlyTrends = {};
        for (var i = 0; i < locationCrimes.length; i++) {
            var crime = locationCrimes[i];
            if (!yearlyTrends[crime.year]) {
                yearlyTrends[crime.year] = { total: 0, solved: 0 };
            }
            yearlyTrends[crime.year].total++;
            if (crime.solved) yearlyTrends[crime.year].solved++;
        }

        var severityBreakdown = {
            low: 0,
            medium: 0,
            high: 0,
            critical: 0
        };

        for (var i = 0; i < locationCrimes.length; i++) {
            var severity = locationCrimes[i].severity || 5;
            if (severity <= 3) severityBreakdown.low++;
            else if (severity >= 4 && severity <= 6) severityBreakdown.medium++;
            else if (severity >= 7 && severity <= 8) severityBreakdown.high++;
            else if (severity >= 9) severityBreakdown.critical++;
        }

        var mostCommon = null;
        var mostCommonCount = 0;
        for (var type in typeDistribution) {
            if (typeDistribution.hasOwnProperty(type) && typeDistribution[type] > mostCommonCount) {
                mostCommonCount = typeDistribution[type];
                mostCommon = type;
            }
        }

        return {
            locationId: locationId,
            totalCrimes: locationCrimes.length,
            recentCrimes: recentCrimes.length,
            unsolvedCrimes: unsolvedCount,
            solvedRate: solvedRate,
            typeDistribution: typeDistribution,
            yearlyTrends: yearlyTrends,
            severityBreakdown: severityBreakdown,
            crimeRatePerCapita: locationCrimes.length / Math.max(1, _getLocationPopulationCount(locationId)),
            mostCommonCrime: mostCommon
        };
    }

    /**
     * Gets crime trends over time for a location
     * @param {string} locationId - Location ID
     * @param {number} years - Number of years to look back (default: 10)
     * @returns {Array} Array of yearly crime data
     */
    function getCrimeTrends(locationId, years) {
        years = years || 10;
        var allCrimes = getAllCrimes();
        var currentYear = _getCurrentYear();
        var trends = [];

        for (var y = currentYear - years + 1; y <= currentYear; y++) {
            var yearCrimes = allCrimes.filter(function(c) {
                return c.locationId === locationId && c.year === y;
            });

            var solvedCount = 0;
            for (var i = 0; i < yearCrimes.length; i++) {
                if (yearCrimes[i].solved) solvedCount++;
            }

            trends.push({
                year: y,
                total: yearCrimes.length,
                solved: solvedCount,
                unsolved: yearCrimes.length - solvedCount,
                solveRate: yearCrimes.length > 0 ? (solvedCount / yearCrimes.length) * 100 : 0
            });
        }

        return trends;
    }

    /**
     * Gets crime type distribution for a location
     * @param {string} locationId - Location ID
     * @returns {Object} Type distribution
     */
    function getCrimeTypeDistribution(locationId) {
        var stats = getLocationCrimeStats(locationId);
        return stats.typeDistribution;
    }

    /**
     * Gets overall crime statistics
     * @returns {Object} Overall crime statistics
     */
    function getOverallCrimeStats() {
        var allCrimes = getAllCrimes();
        var currentYear = _getCurrentYear();

        var recentCrimes = allCrimes.filter(function(c) {
            return c.year >= currentYear - 5;
        });

        var typeDistribution = {};
        for (var i = 0; i < allCrimes.length; i++) {
            var crime = allCrimes[i];
            typeDistribution[crime.type] = (typeDistribution[crime.type] || 0) + 1;
        }

        var solvedCount = 0;
        for (var i = 0; i < allCrimes.length; i++) {
            if (allCrimes[i].solved) solvedCount++;
        }

        var solvedRate = allCrimes.length > 0 ? (solvedCount / allCrimes.length) * 100 : 0;

        var severityBreakdown = {
            low: 0,
            medium: 0,
            high: 0,
            critical: 0
        };

        var totalSeverity = 0;
        for (var i = 0; i < allCrimes.length; i++) {
            var severity = allCrimes[i].severity || 5;
            totalSeverity += severity;
            if (severity <= 3) severityBreakdown.low++;
            else if (severity >= 4 && severity <= 6) severityBreakdown.medium++;
            else if (severity >= 7 && severity <= 8) severityBreakdown.high++;
            else if (severity >= 9) severityBreakdown.critical++;
        }

        var locationStats = [];
        var locationGroups = {};
        for (var i = 0; i < allCrimes.length; i++) {
            var crime = allCrimes[i];
            if (crime.locationId) {
                if (!locationGroups[crime.locationId]) {
                    locationGroups[crime.locationId] = [];
                }
                locationGroups[crime.locationId].push(crime);
            }
        }

        for (var locId in locationGroups) {
            if (locationGroups.hasOwnProperty(locId)) {
                var crimes = locationGroups[locId];
                var place = _getPlaceById(locId);
                var locSolvedCount = 0;
                for (var j = 0; j < crimes.length; j++) {
                    if (crimes[j].solved) locSolvedCount++;
                }
                locationStats.push({
                    locationId: locId,
                    locationName: place ? place.displayName : 'Unknown',
                    crimeCount: crimes.length,
                    solveRate: crimes.length > 0 ? (locSolvedCount / crimes.length) * 100 : 0
                });
            }
        }

        locationStats.sort(function(a, b) {
            return b.crimeCount - a.crimeCount;
        });

        return {
            totalCrimes: allCrimes.length,
            recentCrimes: recentCrimes.length,
            solvedRate: solvedRate,
            unsolvedCrimes: allCrimes.length - solvedCount,
            typeDistribution: typeDistribution,
            severityBreakdown: severityBreakdown,
            locationsWithMostCrime: locationStats.slice(0, 10),
            averageCrimeSeverity: allCrimes.length > 0 ? totalSeverity / allCrimes.length : 0
        };
    }

    /**
     * Gets crime severity statistics
     * @returns {Object} Severity statistics
     */
    function getCrimeSeverityStats() {
        var allCrimes = getAllCrimes();
        var bySeverity = {};
        var totalSeverity = 0;
        var sorted = [];

        for (var i = 0; i < allCrimes.length; i++) {
            var severity = allCrimes[i].severity || 5;
            bySeverity[severity] = (bySeverity[severity] || 0) + 1;
            totalSeverity += severity;
            sorted.push(severity);
        }

        sorted.sort(function(a, b) { return a - b; });

        var median = 0;
        if (sorted.length > 0) {
            var mid = Math.floor(sorted.length / 2);
            if (sorted.length % 2 === 0) {
                median = (sorted[mid - 1] + sorted[mid]) / 2;
            } else {
                median = sorted[mid];
            }
        }

        return {
            bySeverity: bySeverity,
            average: allCrimes.length > 0 ? totalSeverity / allCrimes.length : 0,
            median: median
        };
    }

    /**
     * Gets crime rate per capita for a location
     * @param {string} locationId - Location ID
     * @returns {number} Crime rate (0-1)
     */
    function getCrimeRateByLocation(locationId) {
        var stats = getLocationCrimeStats(locationId);
        return Math.min(1, stats.crimeRatePerCapita);
    }

    /**
     * Gets crime clearance rate
     * @returns {Object} Clearance rate statistics
     */
    function getCrimeClearanceRate() {
        var crimeTypes = _getCrimeTypes();
        var allCrimes = getAllCrimes();

        var solvedCount = 0;
        for (var i = 0; i < allCrimes.length; i++) {
            if (allCrimes[i].solved) solvedCount++;
        }

        var clearanceRate = allCrimes.length > 0 ? (solvedCount / allCrimes.length) * 100 : 0;

        var byType = {};
        for (var type in crimeTypes) {
            if (crimeTypes.hasOwnProperty(type)) {
                var typeCrimes = allCrimes.filter(function(c) {
                    return c.type === crimeTypes[type];
                });
                var typeSolved = 0;
                for (var j = 0; j < typeCrimes.length; j++) {
                    if (typeCrimes[j].solved) typeSolved++;
                }
                byType[crimeTypes[type]] = typeCrimes.length > 0 ? (typeSolved / typeCrimes.length) * 100 : 0;
            }
        }

        return {
            overallClearanceRate: clearanceRate,
            solvedCrimes: solvedCount,
            unsolvedCrimes: allCrimes.length - solvedCount,
            byType: byType
        };
    }

    /**
     * Gets vendetta statistics
     * @param {string} householdId - Optional household ID filter
     * @returns {Object} Vendetta statistics
     */
    function getVendettaStats(householdId) {
        var vendettas = householdId ?
            getVendettasByHousehold(householdId, { includeResolved: true }) :
            getAllVendettas({ includeResolved: true });

        var stats = {
            total: vendettas.length,
            active: 0,
            escalated: 0,
            resolved: 0,
            totalDeaths: 0,
            averageDeaths: 0,
            byHousehold: {}
        };

        for (var i = 0; i < vendettas.length; i++) {
            var v = vendettas[i];
            if (v.status === 'active') stats.active++;
            else if (v.status === 'escalated') stats.escalated++;
            else if (v.status === 'resolved') stats.resolved++;
            stats.totalDeaths += v.bodyCount || 0;

            // Group by household
            if (v.householdAId) {
                if (!stats.byHousehold[v.householdAId]) {
                    stats.byHousehold[v.householdAId] = { name: v.householdAName, count: 0 };
                }
                stats.byHousehold[v.householdAId].count++;
            }
            if (v.householdBId) {
                if (!stats.byHousehold[v.householdBId]) {
                    stats.byHousehold[v.householdBId] = { name: v.householdBName, count: 0 };
                }
                stats.byHousehold[v.householdBId].count++;
            }
        }

        stats.averageDeaths = stats.total > 0 ? stats.totalDeaths / stats.total : 0;

        return stats;
    }

    // =========================================================================
    // 5. EXPORTS
    // =========================================================================

    window.CrimeQueries = {
        // Crime queries
        getCrime: getCrime,
        getAllCrimes: getAllCrimes,
        getCrimesByCharacter: getCrimesByCharacter,
        getCrimesByType: getCrimesByType,
        getCrimesByLocation: getCrimesByLocation,
        getUnsolvedCrimes: getUnsolvedCrimes,
        getCrimeCount: getCrimeCount,

        // Vendetta queries
        getVendetta: getVendetta,
        getAllVendettas: getAllVendettas,
        getVendettasByHousehold: getVendettasByHousehold,
        getVendettasByCharacter: getVendettasByCharacter,
        getActiveVendettas: getActiveVendettas,
        getVendettaCount: getVendettaCount,

        // Statistics
        getLocationCrimeStats: getLocationCrimeStats,
        getCrimeTrends: getCrimeTrends,
        getCrimeTypeDistribution: getCrimeTypeDistribution,
        getOverallCrimeStats: getOverallCrimeStats,
        getCrimeSeverityStats: getCrimeSeverityStats,
        getCrimeRateByLocation: getCrimeRateByLocation,
        getCrimeClearanceRate: getCrimeClearanceRate,
        getVendettaStats: getVendettaStats
    };

    // Legacy aliases
    window._crimeQueries = window.CrimeQueries;

})();