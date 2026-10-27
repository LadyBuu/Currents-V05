/**
 * =============================================================================
 * STILL WATERS - CRIME & VENDETTA QUERIES (crime-queries.js)
 * =============================================================================
 *
 * LOCATION: js/crime/crime-queries.js
 *
 * PURPOSE:
 *   Application-facing read API for crime and vendetta data. This module
 *   composes the primitive reads from CrimeState into derived views:
 *   statistics, trends, distributions, clearance metrics.
 *
 *   Queries are observational. They never mutate state, never persist,
 *   never display UI, never fabricate values for missing dependencies.
 *
 * OWNERSHIP:
 *   - derived statistics (location stats, overall stats, severity bands)
 *   - trends over time
 *   - distributions (type, severity, location)
 *   - clearance metrics
 *
 * WHAT THIS MODULE DOES NOT DO:
 *   - It does not own or mutate crime records. (CrimeState)
 *   - It does not decide legal consequences. (CrimeLawIntegration)
 *   - It does not orchestrate workflows. (CrimeCommands)
 *   - It does not classify severity. (CrimeConstants.classifySeverity)
 *   - It does not own severity bands, window defaults, or any other
 *     domain vocabulary. (CrimeConstants)
 *
 * CONTRACTS:
 *
 *   Time window semantics:
 *     All statistics functions that accept an optional `year` parameter use
 *     it as an ANALYSIS REFERENCE YEAR, not a filter on the underlying
 *     dataset. `totalCrimes` always means "all recorded crimes for this
 *     location (or globally)". Functions that need a window state the
 *     window explicitly, and their results include a `period` object:
 *         { startYear, endYear, windowYears }
 *
 *   Crime burden semantics:
 *     The metric formerly called `crimeRatePerCapita` was crimes divided by
 *     current population across all history. That is not a rate. This
 *     module exposes it as `crimeBurden` (historical recorded crimes per
 *     current resident) and documents it as such. A separate
 *     `recentCrimeBurden` is provided for the recent window.
 *
 *   includeResolved:
 *     Resolved vendettas are INCLUDED by default. Callers pass
 *     { includeResolved: false } to exclude them. This matches CrimeState.
 *
 * TIME CONTRACT:
 *   Uses window.getCurrentYear from js/core/time.js. The deprecated
 *   window.getCurrentYearSafe alias is NOT used.
 *
 * DEPENDENCIES (required, verified at load):
 *   - CrimeConstants
 *   - CrimeState
 *   - getCurrentYear
 *   - getPlaceById (optional; used only for location labels in aggregated
 *     stats — absence degrades the label to 'Unknown', not the metric)
 *   - getLocationPopulationCount (optional; used for burden metrics —
 *     absence returns null burden, as documented)
 *
 * Missing required dependencies fail loudly at load, not at call time.
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. LOAD-TIME DEPENDENCY RESOLUTION
    // =========================================================================

    var C = window.CrimeConstants;
    var State = window.CrimeState;

    if (!C) {
        throw new Error('crime-queries.js requires CrimeConstants');
    }
    if (!State) {
        throw new Error('crime-queries.js requires CrimeState');
    }
    if (typeof window.getCurrentYear !== 'function') {
        throw new Error('crime-queries.js requires getCurrentYear');
    }

    // =========================================================================
    // 1. INTERNAL HELPERS
    // =========================================================================

    function _getCurrentYear() {
        if (typeof window.getCurrentYear !== 'function') {
            throw new Error(
                'crime-queries.js requires time.js (getCurrentYear).'
            );
        }
        return window.getCurrentYear();
    }

    function _getPlaceById(id) {
        if (typeof window.getPlaceById !== 'function') return null;
        return window.getPlaceById(id);
    }

    function _getLocationPopulationCount(locationId) {
        if (typeof window.getLocationPopulationCount === 'function') {
            return window.getLocationPopulationCount(locationId);
        }
        // Population is optional input for burden calculations. If the
        // accessor is unavailable, burden cannot be computed and is
        // reported as null. A fabricated population would silently distort
        // the metric.
        return null;
    }

    // Severity classification and band values live in CrimeConstants.
    // Re-exported below for callers that still read from CrimeQueries.
    var _classifySeverity = C.classifySeverity;
    var SEVERITY_BANDS = C.SEVERITY_BANDS;

    function _emptySeverityBreakdown() {
        var breakdown = {};
        breakdown[SEVERITY_BANDS.LOW] = 0;
        breakdown[SEVERITY_BANDS.MEDIUM] = 0;
        breakdown[SEVERITY_BANDS.HIGH] = 0;
        breakdown[SEVERITY_BANDS.CRITICAL] = 0;
        return breakdown;
    }

    // =========================================================================
    // 2. AGGREGATION PRIMITIVES (compose these instead of re-scanning)
    // =========================================================================

    function _groupByYear(crimes) {
        var out = {};
        for (var i = 0; i < crimes.length; i++) {
            var c = crimes[i];
            if (typeof c.year !== 'number') continue;
            if (!out[c.year]) out[c.year] = { total: 0, solved: 0, unsolved: 0, crimes: [] };
            out[c.year].total++;
            if (c.solved) out[c.year].solved++;
            else out[c.year].unsolved++;
            out[c.year].crimes.push(c);
        }
        return out;
    }

    function _groupByType(crimes) {
        var out = {};
        for (var i = 0; i < crimes.length; i++) {
            var t = crimes[i].type || 'unknown';
            out[t] = (out[t] || 0) + 1;
        }
        return out;
    }

    function _groupByLocation(crimes) {
        var out = {};
        for (var i = 0; i < crimes.length; i++) {
            var loc = crimes[i].locationId;
            if (!loc) continue;
            if (!out[loc]) out[loc] = [];
            out[loc].push(crimes[i]);
        }
        return out;
    }

    function _countSolved(crimes) {
        var n = 0;
        for (var i = 0; i < crimes.length; i++) {
            if (crimes[i].solved) n++;
        }
        return n;
    }

    function _calculateSolveRate(crimes) {
        if (crimes.length === 0) return 0;
        return (_countSolved(crimes) / crimes.length) * 100;
    }

    function _severityBreakdown(crimes) {
        var out = _emptySeverityBreakdown();
        for (var i = 0; i < crimes.length; i++) {
            var band = _classifySeverity(crimes[i].severity);
            if (band) out[band]++;
        }
        return out;
    }

    function _filterByYearWindow(crimes, startYear, endYear) {
        var out = [];
        for (var i = 0; i < crimes.length; i++) {
            var y = crimes[i].year;
            if (typeof y !== 'number') continue;
            if (y >= startYear && y <= endYear) out.push(crimes[i]);
        }
        return out;
    }

    // =========================================================================
    // 3. CRIME QUERIES (delegated to CrimeState)
    // =========================================================================

    function getCrime(crimeId) {
        return State.getCrime(crimeId);
    }

    function getAllCrimes() {
        return State.getAllCrimes();
    }

    function getCrimesByPerpetrator(characterId) {
        return State.getCrimesByPerpetrator(characterId);
    }

    function getCrimesByVictim(characterId) {
        return State.getCrimesByVictim(characterId);
    }

    function getCrimesInvolvingCharacter(characterId) {
        return State.getCrimesInvolvingCharacter(characterId);
    }

    /**
     * Legacy alias. Historically returned crimes where the character was
     * the perpetrator. Prefer getCrimesByPerpetrator or
     * getCrimesInvolvingCharacter in new code.
     */
    function getCrimesByCharacter(characterId) {
        return State.getCrimesByPerpetrator(characterId);
    }

    function getCrimesByType(type) {
        return State.getCrimesByType(type);
    }

    function getCrimesByLocation(locationId) {
        return State.getCrimesByLocation(locationId);
    }

    function getUnsolvedCrimes() {
        return State.getUnsolvedCrimes();
    }

    function getCrimeCount() {
        return State.getCrimeCount();
    }

    // =========================================================================
    // 4. VENDETTA QUERIES (delegated to CrimeState)
    // =========================================================================

    function getVendetta(vendettaId) {
        return State.getVendetta(vendettaId);
    }

    function getAllVendettas(options) {
        return State.getAllVendettas(options);
    }

    function getVendettasByHousehold(householdId, options) {
        return State.getVendettasByHousehold(householdId, options);
    }

    function getVendettasByCharacter(characterId, options) {
        return State.getVendettasByCharacter(characterId, options);
    }

    function getActiveVendettas(householdId) {
        return State.getActiveVendettas(householdId);
    }

    function getActiveVendettaBetween(householdAId, householdBId) {
        return State.getActiveVendettaBetween(householdAId, householdBId);
    }

    function getVendettaCount() {
        return State.getVendettaCount();
    }

    // =========================================================================
    // 5. LOCATION CRIME STATISTICS
    // =========================================================================

    /**
     * Crime statistics for a location.
     *
     * `year` is an analysis reference year. It determines the window used
     * for `recentCrimes` and `recentCrimeBurden`. It does NOT filter
     * `totalCrimes`, `unsolvedCrimes`, `typeDistribution`, or
     * `severityBreakdown`; those always cover the full recorded history
     * for this location.
     *
     * @param {string} locationId
     * @param {number} [year]  Defaults to current year.
     * @param {number} [windowYears]  Defaults to C.DEFAULT_STATS_WINDOW_YEARS.
     * @returns {Object}
     */
    function getLocationCrimeStats(locationId, year, windowYears) {
        var targetYear = (typeof year === 'number') ? year : _getCurrentYear();
        var window = (typeof windowYears === 'number' && windowYears > 0)
            ? windowYears
            : C.DEFAULT_STATS_WINDOW_YEARS;

        var allLocationCrimes = getCrimesByLocation(locationId);

        var recentCrimes = _filterByYearWindow(
            allLocationCrimes,
            targetYear - window + 1,
            targetYear
        );

        var solvedCount = _countSolved(allLocationCrimes);
        var unsolvedCount = allLocationCrimes.length - solvedCount;
        var solvedRate = _calculateSolveRate(allLocationCrimes);

        var typeDistribution = _groupByType(allLocationCrimes);
        var yearlyTrends = _groupByYear(allLocationCrimes);
        var severityBreakdown = _severityBreakdown(allLocationCrimes);

        var mostCommon = null;
        var mostCommonCount = 0;
        for (var type in typeDistribution) {
            if (Object.prototype.hasOwnProperty.call(typeDistribution, type) &&
                typeDistribution[type] > mostCommonCount) {
                mostCommonCount = typeDistribution[type];
                mostCommon = type;
            }
        }

        var population = _getLocationPopulationCount(locationId);
        var crimeBurden = (typeof population === 'number' && population > 0)
            ? allLocationCrimes.length / population
            : null;
        var recentCrimeBurden = (typeof population === 'number' && population > 0)
            ? recentCrimes.length / population
            : null;

        return {
            locationId: locationId,
            totalCrimes: allLocationCrimes.length,
            recentCrimes: recentCrimes.length,
            unsolvedCrimes: unsolvedCount,
            solvedCount: solvedCount,
            solvedRate: solvedRate,
            typeDistribution: typeDistribution,
            yearlyTrends: yearlyTrends,
            severityBreakdown: severityBreakdown,
            mostCommonCrime: mostCommon,

            // Documented metric: historical recorded crimes per current
            // resident. Not a rate; not temporal. Null if population unknown.
            crimeBurden: crimeBurden,
            recentCrimeBurden: recentCrimeBurden,

            // The explicit window this stats call used.
            period: {
                referenceYear: targetYear,
                windowYears: window,
                startYear: targetYear - window + 1,
                endYear: targetYear
            }
        };
    }

    // =========================================================================
    // 6. TRENDS
    // =========================================================================

    /**
     * Yearly crime trends for a location. Each entry covers one year and
     * is emitted in ascending year order.
     *
     * @param {string} locationId
     * @param {number} [years]  Defaults to C.DEFAULT_TREND_YEARS.
     * @param {number} [endYear]  Reference year. Defaults to current year.
     */
    function getCrimeTrends(locationId, years, endYear) {
        var span = (typeof years === 'number' && years > 0)
            ? years
            : C.DEFAULT_TREND_YEARS;
        var last = (typeof endYear === 'number') ? endYear : _getCurrentYear();

        var all = getCrimesByLocation(locationId);
        var grouped = _groupByYear(all);

        var out = [];
        for (var y = last - span + 1; y <= last; y++) {
            var bucket = grouped[y] || { total: 0, solved: 0, unsolved: 0 };
            out.push({
                year: y,
                total: bucket.total,
                solved: bucket.solved,
                unsolved: bucket.unsolved,
                solveRate: bucket.total > 0 ? (bucket.solved / bucket.total) * 100 : 0
            });
        }
        return out;
    }

    // =========================================================================
    // 7. DISTRIBUTIONS
    // =========================================================================

    function getCrimeTypeDistribution(locationId) {
        return _groupByType(getCrimesByLocation(locationId));
    }

    // =========================================================================
    // 8. OVERALL STATISTICS
    // =========================================================================

    /**
     * Global crime statistics.
     *
     * `year` is the analysis reference year for the "recent" window.
     * All-time aggregates are always all-time.
     *
     * @param {number} [year]
     * @param {number} [windowYears]  Defaults to C.DEFAULT_STATS_WINDOW_YEARS.
     */
    function getOverallCrimeStats(year, windowYears) {
        var targetYear = (typeof year === 'number') ? year : _getCurrentYear();
        var window = (typeof windowYears === 'number' && windowYears > 0)
            ? windowYears
            : C.DEFAULT_STATS_WINDOW_YEARS;

        var allCrimes = getAllCrimes();
        var recentCrimes = _filterByYearWindow(
            allCrimes,
            targetYear - window + 1,
            targetYear
        );

        var solvedCount = _countSolved(allCrimes);
        var typeDistribution = _groupByType(allCrimes);
        var severityBreakdown = _severityBreakdown(allCrimes);

        var totalSeverity = 0;
        var severityCount = 0;
        for (var i = 0; i < allCrimes.length; i++) {
            if (typeof allCrimes[i].severity === 'number') {
                totalSeverity += allCrimes[i].severity;
                severityCount++;
            }
        }
        var averageCrimeSeverity = severityCount > 0 ? totalSeverity / severityCount : null;

        var locationGroups = _groupByLocation(allCrimes);
        var locationStats = [];
        for (var locId in locationGroups) {
            if (!Object.prototype.hasOwnProperty.call(locationGroups, locId)) continue;
            var locCrimes = locationGroups[locId];
            var place = _getPlaceById(locId);
            locationStats.push({
                locationId: locId,
                locationName: place ? place.displayName : 'Unknown',
                crimeCount: locCrimes.length,
                solvedCount: _countSolved(locCrimes),
                solveRate: _calculateSolveRate(locCrimes)
            });
        }
        locationStats.sort(function(a, b) { return b.crimeCount - a.crimeCount; });

        return {
            totalCrimes: allCrimes.length,
            recentCrimes: recentCrimes.length,
            solvedCount: solvedCount,
            unsolvedCrimes: allCrimes.length - solvedCount,
            solvedRate: _calculateSolveRate(allCrimes),
            typeDistribution: typeDistribution,
            severityBreakdown: severityBreakdown,
            locationsWithMostCrime: locationStats.slice(0, 10),
            averageCrimeSeverity: averageCrimeSeverity,
            period: {
                referenceYear: targetYear,
                windowYears: window,
                startYear: targetYear - window + 1,
                endYear: targetYear
            }
        };
    }

    /**
     * Severity statistics: distribution, average, median.
     */
    function getCrimeSeverityStats() {
        var allCrimes = getAllCrimes();
        var bySeverity = {};
        var numeric = [];

        for (var i = 0; i < allCrimes.length; i++) {
            var s = allCrimes[i].severity;
            if (typeof s !== 'number') continue;
            bySeverity[s] = (bySeverity[s] || 0) + 1;
            numeric.push(s);
        }

        numeric.sort(function(a, b) { return a - b; });

        var median = null;
        if (numeric.length > 0) {
            var mid = Math.floor(numeric.length / 2);
            median = (numeric.length % 2 === 0)
                ? (numeric[mid - 1] + numeric[mid]) / 2
                : numeric[mid];
        }

        var sum = 0;
        for (var j = 0; j < numeric.length; j++) sum += numeric[j];
        var average = numeric.length > 0 ? sum / numeric.length : null;

        return {
            count: numeric.length,
            bySeverity: bySeverity,
            average: average,
            median: median,
            bands: _severityBreakdown(allCrimes)
        };
    }

    // =========================================================================
    // 9. CLEARANCE
    // =========================================================================

    /**
     * Crime clearance metrics.
     *
     * "Clearance" here means the crime has been marked solved in the
     * record. That is the only sense in which the term is used in this
     * simulation. Real-world criminology uses a broader definition; this
     * module does not.
     */
    function getCrimeClearanceRate() {
        var allCrimes = getAllCrimes();
        var solvedCount = _countSolved(allCrimes);

        var overallClearanceRate = allCrimes.length > 0
            ? (solvedCount / allCrimes.length) * 100
            : 0;

        var byType = {};
        var typeValues = C.getAllCrimeTypes();
        for (var i = 0; i < typeValues.length; i++) {
            var type = typeValues[i];
            var typeCrimes = getCrimesByType(type);
            byType[type] = {
                total: typeCrimes.length,
                solved: _countSolved(typeCrimes),
                clearanceRate: _calculateSolveRate(typeCrimes)
            };
        }

        return {
            overallClearanceRate: overallClearanceRate,
            solvedCrimes: solvedCount,
            unsolvedCrimes: allCrimes.length - solvedCount,
            byType: byType
        };
    }

    // =========================================================================
    // 10. VENDETTA STATISTICS
    // =========================================================================

    /**
     * Vendetta statistics.
     *
     * When `householdId` is supplied, the filter means "vendettas involving
     * this household". The `byHousehold` map therefore contains both sides
     * of every vendetta returned — the queried household and its opponents.
     * This is deliberate: it exposes the network around a household.
     *
     * `bodyCount` is not read from a stored counter; the death count is
     * derived from `deaths.length` in each record.
     */
    function getVendettaStats(householdId) {
        var vendettas = householdId
            ? getVendettasByHousehold(householdId, { includeResolved: true })
            : getAllVendettas({ includeResolved: true });

        var statuses = C.VENDETTA_STATUS;

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
            if (v.status === statuses.ACTIVE) stats.active++;
            else if (v.status === statuses.ESCALATED) stats.escalated++;
            else if (v.status === statuses.RESOLVED) stats.resolved++;

            var deaths = Array.isArray(v.deaths) ? v.deaths.length : 0;
            stats.totalDeaths += deaths;

            if (v.householdAId) {
                if (!stats.byHousehold[v.householdAId]) {
                    stats.byHousehold[v.householdAId] = {
                        name: v.householdAName || 'Unknown',
                        count: 0
                    };
                }
                stats.byHousehold[v.householdAId].count++;
            }
            if (v.householdBId) {
                if (!stats.byHousehold[v.householdBId]) {
                    stats.byHousehold[v.householdBId] = {
                        name: v.householdBName || 'Unknown',
                        count: 0
                    };
                }
                stats.byHousehold[v.householdBId].count++;
            }
        }

        stats.averageDeaths = stats.total > 0
            ? stats.totalDeaths / stats.total
            : 0;

        return stats;
    }

    // =========================================================================
    // 11. LEGACY / PRESENTATION-ADJACENT HELPERS
    // =========================================================================

    /**
     * Returns a normalised burden value in [0, 1]. Provided for UI code
     * that expects a bounded scalar. This is a lossy transformation; the
     * unclamped `crimeBurden` remains available on the location stats
     * result for callers that need it.
     */
    function getNormalizedCrimeBurden(locationId, year, windowYears) {
        var stats = getLocationCrimeStats(locationId, year, windowYears);
        if (typeof stats.crimeBurden !== 'number') return null;
        if (stats.crimeBurden <= 0) return 0;
        if (stats.crimeBurden >= 1) return 1;
        return stats.crimeBurden;
    }

    // Legacy alias. Documented as lossy; prefer getNormalizedCrimeBurden.
    function getCrimeRateByLocation(locationId) {
        return getNormalizedCrimeBurden(locationId);
    }

    // =========================================================================
    // 12. EXPORTS
    // =========================================================================

    window.CrimeQueries = {
        // Crime queries
        getCrime: getCrime,
        getAllCrimes: getAllCrimes,
        getCrimesByPerpetrator: getCrimesByPerpetrator,
        getCrimesByVictim: getCrimesByVictim,
        getCrimesInvolvingCharacter: getCrimesInvolvingCharacter,
        getCrimesByCharacter: getCrimesByCharacter, // legacy alias -> perpetrator
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
        getActiveVendettaBetween: getActiveVendettaBetween,
        getVendettaCount: getVendettaCount,

        // Statistics
        getLocationCrimeStats: getLocationCrimeStats,
        getCrimeTrends: getCrimeTrends,
        getCrimeTypeDistribution: getCrimeTypeDistribution,
        getOverallCrimeStats: getOverallCrimeStats,
        getCrimeSeverityStats: getCrimeSeverityStats,
        getCrimeClearanceRate: getCrimeClearanceRate,
        getVendettaStats: getVendettaStats,

        // Bounded scalars for UI
        getNormalizedCrimeBurden: getNormalizedCrimeBurden,
        getCrimeRateByLocation: getCrimeRateByLocation, // legacy alias

        // Severity band constants (read-only view; owned by CrimeConstants)
        SEVERITY_BANDS: SEVERITY_BANDS
    };

    window._crimeQueries = window.CrimeQueries;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CrimeQueries;
    }

})();
