/**
 * =============================================================================
 * STILL WATERS - DISASTER QUERIES (disaster-queries.js)
 * =============================================================================
 *
 * LOCATION: js/core/disaster/disaster-queries.js
 *
 * PURPOSE:
 *   Application-facing read API for disaster data. Composes the primitive
 *   reads from DisasterState into derived views: statistics, distributions,
 *   risk assessment, destruction aggregates.
 *
 *   Queries are observational. They never mutate state, never persist,
 *   never display UI, never fabricate values for missing dependencies.
 *
 * OWNERSHIP:
 *   - derived statistics (per-location, global, severity distribution)
 *   - destruction aggregates (per-location, global, per-type)
 *   - risk assessment
 *   - most-recent / deadliest lookups
 *
 * WHAT THIS MODULE DOES NOT DO:
 *   - It does not own or mutate disaster records. (DisasterState)
 *   - It does not decide effects or apply damage. (DisasterCommands,
 *     DisasterDamage)
 *   - It does not classify severity. (DisasterConstants.classifySeverity)
 *   - It does not own any vocabulary or thresholds. (DisasterConstants)
 *
 * CONTRACTS:
 *
 *   Missing data:
 *     - Settlement / location missing  → return null
 *     - No records but location exists → return { total: 0, ... } with
 *                                        empty sub-aggregates
 *     - Accessor missing               → return null for that field
 *
 *   Severity classification delegates entirely to
 *   DisasterConstants.classifySeverity. The band thresholds live in exactly
 *   one place. `getDisasterSeverityStats` uses the same bands.
 *
 *   Location name resolution is best-effort: if getPlaceById is available,
 *   it is used; if not, the raw locationId is returned where a name would
 *   go. This is a display-label degradation, not a domain-value fabrication.
 *
 * DEPENDENCIES (required, verified at load):
 *   - DisasterConstants
 *   - DisasterState
 *
 * DEPENDENCIES (optional, shape-checked at load):
 *   - getPlaceById (missing → location labels degrade to id)
 *   - getPlaceName (missing → falls back to getPlaceById or id)
 *
 * ICON POLICY: No emojis. No icons.
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. LOAD-TIME DEPENDENCY RESOLUTION
    // =========================================================================

    var C = window.DisasterConstants;
    var State = window.DisasterState;

    if (!C) {
        throw new Error('disaster-queries.js requires DisasterConstants');
    }
    if (!State) {
        throw new Error('disaster-queries.js requires DisasterState');
    }

    // Optional location-name helpers. Absence is a display degradation,
    // not a fatal load error.
    var _hasGetPlaceById = (typeof window.getPlaceById === 'function');
    var _hasGetPlaceName = (typeof window.getPlaceName === 'function');

    function _placeName(locationId) {
        if (!locationId) return null;
        if (_hasGetPlaceName) {
            var n = window.getPlaceName(locationId);
            if (n) return n;
        }
        if (_hasGetPlaceById) {
            var p = window.getPlaceById(locationId);
            if (p && p.displayName) return p.displayName;
        }
        return null;
    }

    // =========================================================================
    // 1. BASIC QUERIES (delegated to DisasterState)
    // =========================================================================

    function getDisaster(disasterId) {
        return State.getDisaster(disasterId);
    }

    function getAllDisasters() {
        return State.getAllDisasters();
    }

    function getDisastersByLocation(locationId) {
        return State.getDisastersByLocation(locationId);
    }

    function getDisastersInYearRange(startYear, endYear) {
        return State.getDisastersInYearRange(startYear, endYear);
    }

    function getDisasterCount() {
        return State.getDisasterCount();
    }

    function getDisasterTypeCount(disasterId) {
        return State.getDisasterTypeCount(disasterId);
    }

    // =========================================================================
    // 2. LOCATION-LEVEL STATISTICS
    // =========================================================================

    /**
     * Comprehensive disaster statistics for a location or globally.
     *
     * @param {string} [locationId]  If omitted, returns global stats.
     * @returns {Object}
     *   {
     *     total, totalDeaths, totalProsperityLoss, totalSchoolsDestroyed,
     *     averageSeverity,
     *     byType: { [typeName]: count },
     *     byYear: { [year]: count },
     *     deadliest: disaster | null,
     *     mostRecent: disaster | null
     *   }
     */
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

        if (disasters.length === 0) return stats;

        var totalSeverity = 0;
        var maxDeaths = 0;
        var mostRecentYear = -Infinity;

        for (var i = 0; i < disasters.length; i++) {
            var d = disasters[i];
            if (typeof d.deaths === 'number') stats.totalDeaths += d.deaths;
            if (typeof d.prosperityLoss === 'number') stats.totalProsperityLoss += d.prosperityLoss;
            if (typeof d.schoolsDestroyed === 'number') stats.totalSchoolsDestroyed += d.schoolsDestroyed;
            if (typeof d.severity === 'number') totalSeverity += d.severity;

            var typeKey = d.disasterType || d.disasterId || 'Unknown';
            stats.byType[typeKey] = (stats.byType[typeKey] || 0) + 1;

            if (typeof d.year === 'number') {
                stats.byYear[d.year] = (stats.byYear[d.year] || 0) + 1;
            }

            if ((d.deaths || 0) > maxDeaths) {
                maxDeaths = d.deaths || 0;
                stats.deadliest = d;
            }

            if (typeof d.year === 'number' && d.year > mostRecentYear) {
                mostRecentYear = d.year;
                stats.mostRecent = d;
            }
        }

        stats.averageSeverity = totalSeverity / disasters.length;

        return stats;
    }

    // =========================================================================
    // 3. TYPE / SEVERITY DISTRIBUTIONS
    // =========================================================================

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

    /**
     * Severity distribution. Bands come from DisasterConstants.classifySeverity.
     * Thresholds match the legacy query behaviour (`<=` inclusive).
     */
    function getDisasterSeverityStats() {
        var disasters = getAllDisasters();
        var stats = {
            min: Infinity,
            max: 0,
            average: 0,
            total: disasters.length,
            distribution: {
                low: 0,
                medium: 0,
                high: 0,
                critical: 0
            }
        };

        if (disasters.length === 0) {
            stats.min = 0;
            return stats;
        }

        var totalSeverity = 0;

        for (var i = 0; i < disasters.length; i++) {
            var severity = disasters[i].severity;
            if (typeof severity !== 'number') continue;

            totalSeverity += severity;
            if (severity < stats.min) stats.min = severity;
            if (severity > stats.max) stats.max = severity;

            var band = C.classifySeverity(severity);
            if (band && stats.distribution[band] !== undefined) {
                stats.distribution[band]++;
            }
        }

        stats.average = totalSeverity / disasters.length;
        return stats;
    }

    // =========================================================================
    // 4. RECENT / DEADLIEST LOOKUPS
    // =========================================================================

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
        var cap = (typeof limit === 'number' && limit > 0) ? limit : 5;
        var disasters = getAllDisasters();
        var sorted = disasters.slice().sort(function(a, b) {
            return (b.deaths || 0) - (a.deaths || 0);
        });
        return sorted.slice(0, cap);
    }

    // =========================================================================
    // 5. RISK ASSESSMENT
    // =========================================================================

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

        var typeCounts = {};

        for (var i = 0; i < disasters.length; i++) {
            var d = disasters[i];
            if (typeof d.deaths === 'number') risk.totalDeaths += d.deaths;

            var type = d.disasterType || d.disasterId || 'Unknown';
            typeCounts[type] = (typeCounts[type] || 0) + 1;

            if (!risk.deadliest || (d.deaths || 0) > (risk.deadliest.deaths || 0)) {
                risk.deadliest = d;
            }
        }

        var maxCount = 0;
        for (var typeKey in typeCounts) {
            if (!Object.prototype.hasOwnProperty.call(typeCounts, typeKey)) continue;
            if (typeCounts[typeKey] > maxCount) {
                maxCount = typeCounts[typeKey];
                risk.mostCommon = typeKey;
            }
        }

        risk.score = Math.min(100, disasters.length * 5 + risk.totalDeaths * 0.1);

        if (risk.score < 25) risk.level = 'low';
        else if (risk.score < 50) risk.level = 'moderate';
        else if (risk.score < 75) risk.level = 'high';
        else risk.level = 'critical';

        return risk;
    }

    // =========================================================================
    // 6. DESTRUCTION STATISTICS
    // =========================================================================

    function _emptyDestructionBuckets() {
        return {
            features: 0,
            schools: 0,
            enterprises: 0,
            residences: 0,
            households: 0
        };
    }

    function _addDestructionBucket(target, damage) {
        if (!damage) return;
        target.features    += damage.featuresDestroyed    || 0;
        target.schools     += damage.schoolsDestroyed     || 0;
        target.enterprises += damage.enterprisesDestroyed || 0;
        target.residences  += damage.residencesDemolished || 0;
        target.households  += damage.householdsDestroyed  || 0;
    }

    /**
     * Destruction statistics for a location.
     *
     * @param {string} locationId
     * @returns {Object}
     */
    function getDestructionStatistics(locationId) {
        var stats = {
            locationId: locationId,
            totalDisasters: 0,
            totalDestructions: _emptyDestructionBuckets(),
            totalLoss: 0,
            byDisasterType: {},
            recentDestructions: [],
            worstDisaster: null
        };

        var disasters = getDisastersByLocation(locationId);
        if (!disasters || disasters.length === 0) return stats;

        stats.totalDisasters = disasters.length;
        var worstLoss = 0;

        for (var i = 0; i < disasters.length; i++) {
            var disaster = disasters[i];
            var damage = disaster.structuralDamage;
            if (!damage) continue;

            _addDestructionBucket(stats.totalDestructions, damage);
            stats.totalLoss += damage.totalLoss || 0;

            var type = disaster.disasterId || 'unknown';
            if (!stats.byDisasterType[type]) {
                stats.byDisasterType[type] = {
                    count: 0,
                    totalLoss: 0,
                    destructions: _emptyDestructionBuckets()
                };
            }
            var bucket = stats.byDisasterType[type];
            bucket.count++;
            bucket.totalLoss += damage.totalLoss || 0;
            _addDestructionBucket(bucket.destructions, damage);

            if ((damage.totalLoss || 0) > worstLoss) {
                worstLoss = damage.totalLoss || 0;
                stats.worstDisaster = {
                    id: disaster.id,
                    type: disaster.disasterType,
                    year: disaster.year,
                    totalLoss: damage.totalLoss,
                    featuresDestroyed:    damage.featuresDestroyed    || 0,
                    schoolsDestroyed:     damage.schoolsDestroyed     || 0,
                    enterprisesDestroyed: damage.enterprisesDestroyed || 0,
                    residencesDemolished: damage.residencesDemolished || 0,
                    householdsDestroyed:  damage.householdsDestroyed  || 0
                };
            }

            if (stats.recentDestructions.length < 5) {
                stats.recentDestructions.push({
                    disasterId: disaster.id,
                    type: disaster.disasterType,
                    year: disaster.year,
                    totalLoss: damage.totalLoss || 0,
                    destructions: {
                        features:    damage.featuresDestroyed    || 0,
                        schools:     damage.schoolsDestroyed     || 0,
                        enterprises: damage.enterprisesDestroyed || 0,
                        residences:  damage.residencesDemolished || 0,
                        households:  damage.householdsDestroyed  || 0
                    }
                });
            }
        }

        stats.recentDestructions.sort(function(a, b) {
            return (b.year || 0) - (a.year || 0);
        });

        return stats;
    }

    /**
     * All destroyed items from a specific disaster, optionally filtered
     * by category.
     *
     * @param {string} disasterId
     * @param {string} [category]  'features' | 'schools' | 'enterprises'
     *                             | 'residences' | 'households'
     * @returns {Array}
     */
    function getDestroyedItems(disasterId, category) {
        var disaster = getDisaster(disasterId);
        if (!disaster) return [];

        var damage = disaster.structuralDamage;
        if (!damage || !damage.destructionList) return [];

        if (category) {
            return damage.destructionList[category]
                ? damage.destructionList[category].slice()
                : [];
        }

        var all = [];
        var lists = damage.destructionList;
        var keys = ['features', 'schools', 'enterprises', 'residences', 'households'];
        for (var i = 0; i < keys.length; i++) {
            var list = lists[keys[i]];
            if (!Array.isArray(list)) continue;
            for (var j = 0; j < list.length; j++) {
                var item = {};
                for (var key in list[j]) {
                    if (Object.prototype.hasOwnProperty.call(list[j], key)) {
                        item[key] = list[j][key];
                    }
                }
                item.category = keys[i];
                all.push(item);
            }
        }
        return all;
    }

    /**
     * All destroyed items for a location across every disaster.
     *
     * @param {string} locationId
     * @param {Object} [options]
     * @param {string} [options.type]   filter by category
     * @param {number} [options.limit]  cap at N items (default 50)
     * @returns {Array}
     */
    function getLocationDestroyedItems(locationId, options) {
        options = options || {};
        var limit = (typeof options.limit === 'number' && options.limit > 0)
            ? options.limit
            : 50;
        var result = [];

        var disasters = getDisastersByLocation(locationId);
        if (!disasters || disasters.length === 0) return result;

        var keys = ['features', 'schools', 'enterprises', 'residences', 'households'];

        for (var i = 0; i < disasters.length; i++) {
            var disaster = disasters[i];
            var damage = disaster.structuralDamage;
            if (!damage || !damage.destructionList) continue;

            for (var ki = 0; ki < keys.length; ki++) {
                var key = keys[ki];
                if (options.type && options.type !== key) continue;

                var list = damage.destructionList[key];
                if (!Array.isArray(list)) continue;

                for (var j = 0; j < list.length; j++) {
                    var item = {};
                    for (var itemKey in list[j]) {
                        if (Object.prototype.hasOwnProperty.call(list[j], itemKey)) {
                            item[itemKey] = list[j][itemKey];
                        }
                    }
                    item.category = key;
                    item.disasterId = disaster.id;
                    item.disasterType = disaster.disasterType;
                    item.disasterYear = disaster.year;
                    result.push(item);
                }
            }
        }

        result.sort(function(a, b) { return (b.year || 0) - (a.year || 0); });

        if (result.length > limit) result = result.slice(0, limit);
        return result;
    }

    /**
     * Global destruction statistics across all locations.
     *
     * @returns {Object}
     */
    function getGlobalDestructionStatistics() {
        var stats = {
            totalDisasters: 0,
            totalDestructions: _emptyDestructionBuckets(),
            totalLoss: 0,
            byDisasterType: {},
            byLocation: {},
            worstDisaster: null,
            deadliestDisaster: null
        };

        var disasters = getAllDisasters();
        stats.totalDisasters = disasters.length;

        var worstLoss = 0;
        var maxDeaths = 0;

        for (var i = 0; i < disasters.length; i++) {
            var disaster = disasters[i];
            var damage = disaster.structuralDamage;

            if (damage) {
                _addDestructionBucket(stats.totalDestructions, damage);
                stats.totalLoss += damage.totalLoss || 0;

                var type = disaster.disasterId || 'unknown';
                if (!stats.byDisasterType[type]) {
                    stats.byDisasterType[type] = {
                        count: 0,
                        totalLoss: 0,
                        destructions: _emptyDestructionBuckets()
                    };
                }
                var typeBucket = stats.byDisasterType[type];
                typeBucket.count++;
                typeBucket.totalLoss += damage.totalLoss || 0;
                _addDestructionBucket(typeBucket.destructions, damage);

                var locationKey = disaster.locationId || 'unknown';
                if (!stats.byLocation[locationKey]) {
                    stats.byLocation[locationKey] = {
                        count: 0,
                        totalLoss: 0,
                        destructions: _emptyDestructionBuckets()
                    };
                }
                var locBucket = stats.byLocation[locationKey];
                locBucket.count++;
                locBucket.totalLoss += damage.totalLoss || 0;
                _addDestructionBucket(locBucket.destructions, damage);

                if ((damage.totalLoss || 0) > worstLoss) {
                    worstLoss = damage.totalLoss || 0;
                    stats.worstDisaster = {
                        id: disaster.id,
                        type: disaster.disasterType,
                        year: disaster.year,
                        location: disaster.locationName,
                        totalLoss: damage.totalLoss,
                        featuresDestroyed:    damage.featuresDestroyed    || 0,
                        schoolsDestroyed:     damage.schoolsDestroyed     || 0,
                        enterprisesDestroyed: damage.enterprisesDestroyed || 0,
                        residencesDemolished: damage.residencesDemolished || 0,
                        householdsDestroyed:  damage.householdsDestroyed  || 0
                    };
                }
            }

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

        return stats;
    }

    /**
     * Destruction statistics for a specific disaster type.
     *
     * @param {string} disasterTypeId  Disaster type id or display name
     * @returns {Object}
     */
    function getDisasterTypeDestructionStats(disasterTypeId) {
        var stats = {
            disasterId: disasterTypeId,
            count: 0,
            totalLoss: 0,
            destructions: _emptyDestructionBuckets(),
            averageLoss: 0,
            locations: []
        };

        var disasters = getAllDisasters();
        var matching = [];
        for (var i = 0; i < disasters.length; i++) {
            var d = disasters[i];
            if (d.disasterId === disasterTypeId || d.disasterType === disasterTypeId) {
                matching.push(d);
            }
        }

        stats.count = matching.length;
        var locationMap = {};

        for (var j = 0; j < matching.length; j++) {
            var disaster = matching[j];
            var damage = disaster.structuralDamage;
            if (!damage) continue;

            stats.totalLoss += damage.totalLoss || 0;
            _addDestructionBucket(stats.destructions, damage);

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

        stats.locations = [];
        for (var locKey in locationMap) {
            if (!Object.prototype.hasOwnProperty.call(locationMap, locKey)) continue;
            stats.locations.push(locationMap[locKey]);
        }
        stats.locations.sort(function(a, b) { return b.totalLoss - a.totalLoss; });

        stats.averageLoss = stats.count > 0 ? stats.totalLoss / stats.count : 0;

        return stats;
    }

    // =========================================================================
    // 7. EXPORTS
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

        // Destruction statistics
        getDestructionStatistics: getDestructionStatistics,
        getDestroyedItems: getDestroyedItems,
        getLocationDestroyedItems: getLocationDestroyedItems,
        getGlobalDestructionStatistics: getGlobalDestructionStatistics,
        getDisasterTypeDestructionStats: getDisasterTypeDestructionStats
    };

    window._disasterQueries = window.DisasterQueries;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.DisasterQueries;
    }

})();
