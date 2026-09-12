/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT QUERIES js/settlement/settlement-queries.js
 * =============================================================================
 * 
 * LOCATION: js/systems/settlement/settlement-queries.js
 * 
 * All read-only queries for settlement data.
 * 
 * UPDATED: Added civil law queries wrapping GovernmentLaws.
 * 
 * DEPENDENCIES:
 *   - settlement-state.js: SettlementState
 *   - government-laws.js: GovernmentLaws
 *   - accessors.js: getPlaceById, getPlaces, getCurrentYear
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

    function _getSettlementData(locationId) {
        if (typeof window.SettlementState !== 'undefined' &&
            typeof window.SettlementState.getSettlementData === 'function') {
            return window.SettlementState.getSettlementData(locationId);
        }
        if (typeof window.getSettlementData === 'function') {
            return window.getSettlementData(locationId);
        }
        return null;
    }

    function _getAllSettlementData() {
        if (typeof window.SettlementState !== 'undefined' &&
            typeof window.SettlementState.getAllSettlementData === 'function') {
            return window.SettlementState.getAllSettlementData();
        }
        if (typeof window.getAllSettlementData === 'function') {
            return window.getAllSettlementData();
        }
        return {};
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

    function _getCurrentYear() {
    // Delegates to time.js — do not add fallback logic here.
    return typeof window.getCurrentYearSafe === 'function'
        ? window.getCurrentYearSafe()
        : 1250;
}

    // =========================================================================
    // 3. BASIC QUERIES
    // =========================================================================

    /**
     * Gets settlement data for a location
     * @param {string} locationId - Location ID
     * @returns {Object|null} Settlement data or null
     */
    function getSettlementData(locationId) {
        if (_processingQuery) return null;
        _processingQuery = true;

        try {
            return _getSettlementData(locationId);
        } finally {
            _processingQuery = false;
        }
    }

    /**
     * Gets all settlement data
     * @returns {Object} Object mapping locationId to settlement data
     */
    function getAllSettlementData() {
        if (_processingQuery) return {};
        _processingQuery = true;

        try {
            return _getAllSettlementData();
        } finally {
            _processingQuery = false;
        }
    }

    /**
     * Gets settlements with data
     * @returns {Array} Array of settlement data objects
     */
    function getSettlements() {
        if (_processingQuery) return [];
        _processingQuery = true;

        try {
            var all = _getAllSettlementData();
            var result = [];
            for (var id in all) {
                if (all.hasOwnProperty(id)) {
                    result.push(all[id]);
                }
            }
            return result;
        } finally {
            _processingQuery = false;
        }
    }

    /**
     * Gets settlement count
     * @returns {number} Number of settlements with data
     */
    function getSettlementCount() {
        if (_processingQuery) return 0;
        _processingQuery = true;

        try {
            var all = _getAllSettlementData();
            return Object.keys(all).length;
        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 4. CIVIL LAWS (WRAPPERS FOR GovernmentLaws)
    // =========================================================================

    /**
     * Gets all civil laws for a settlement
     * @param {string} locationId - Settlement location ID
     * @returns {Array} Array of law objects
     */
    function getCivilLaws(locationId) {
        if (_processingQuery) return [];
        _processingQuery = true;

        try {
            if (typeof window.GovernmentLaws !== 'undefined' &&
                typeof window.GovernmentLaws.getCivilLaws === 'function') {
                return window.GovernmentLaws.getCivilLaws(locationId);
            }
            return [];
        } finally {
            _processingQuery = false;
        }
    }

    /**
     * Gets civil laws by domain
     * @param {string} locationId - Settlement location ID
     * @param {string} domain - Law domain
     * @returns {Array} Array of law objects
     */
    function getCivilLawsByDomain(locationId, domain) {
        if (_processingQuery) return [];
        _processingQuery = true;

        try {
            if (typeof window.GovernmentLaws !== 'undefined' &&
                typeof window.GovernmentLaws.getCivilLawsByDomain === 'function') {
                return window.GovernmentLaws.getCivilLawsByDomain(locationId, domain);
            }
            return [];
        } finally {
            _processingQuery = false;
        }
    }

    /**
     * Gets enforced civil laws
     * @param {string} locationId - Settlement location ID
     * @returns {Array} Array of law objects
     */
    function getEnforcedCivilLaws(locationId) {
        if (_processingQuery) return [];
        _processingQuery = true;

        try {
            if (typeof window.GovernmentLaws !== 'undefined' &&
                typeof window.GovernmentLaws.getEnforcedCivilLaws === 'function') {
                return window.GovernmentLaws.getEnforcedCivilLaws(locationId);
            }
            return [];
        } finally {
            _processingQuery = false;
        }
    }

    /**
     * Gets a single civil law by ID
     * @param {string} locationId - Settlement location ID
     * @param {string} lawId - Law ID
     * @returns {Object|null} Law object or null
     */
    function getCivilLaw(locationId, lawId) {
        if (_processingQuery) return null;
        _processingQuery = true;

        try {
            if (typeof window.GovernmentLaws !== 'undefined' &&
                typeof window.GovernmentLaws.getCivilLaw === 'function') {
                return window.GovernmentLaws.getCivilLaw(locationId, lawId);
            }
            return null;
        } finally {
            _processingQuery = false;
        }
    }

    /**
     * Gets civil law count
     * @param {string} locationId - Settlement location ID
     * @returns {number} Number of laws
     */
    function getCivilLawCount(locationId) {
        if (_processingQuery) return 0;
        _processingQuery = true;

        try {
            if (typeof window.GovernmentLaws !== 'undefined' &&
                typeof window.GovernmentLaws.getCivilLawCount === 'function') {
                return window.GovernmentLaws.getCivilLawCount(locationId);
            }
            return 0;
        } finally {
            _processingQuery = false;
        }
    }

    /**
     * Gets civil laws by crime type
     * @param {string} locationId - Settlement location ID
     * @param {string} crimeType - Crime type
     * @returns {Array} Array of law objects
     */
    function getCivilLawsByCrimeType(locationId, crimeType) {
        if (_processingQuery) return [];
        _processingQuery = true;

        try {
            if (typeof window.GovernmentLaws !== 'undefined' &&
                typeof window.GovernmentLaws.getCivilLawsByCrimeType === 'function') {
                return window.GovernmentLaws.getCivilLawsByCrimeType(locationId, crimeType);
            }
            return [];
        } finally {
            _processingQuery = false;
        }
    }

    /**
     * Gets enforced civil laws by crime type
     * @param {string} locationId - Settlement location ID
     * @param {string} crimeType - Crime type
     * @returns {Array} Array of law objects
     */
    function getEnforcedCivilLawsByCrimeType(locationId, crimeType) {
        if (_processingQuery) return [];
        _processingQuery = true;

        try {
            if (typeof window.GovernmentLaws !== 'undefined' &&
                typeof window.GovernmentLaws.getEnforcedCivilLawsByCrimeType === 'function') {
                return window.GovernmentLaws.getEnforcedCivilLawsByCrimeType(locationId, crimeType);
            }
            return [];
        } finally {
            _processingQuery = false;
        }
    }

    /**
     * Gets civil law statistics for a settlement
     * @param {string} locationId - Settlement location ID
     * @returns {Object|null} Statistics object or null
     */
    function getCivilLawStatistics(locationId) {
        if (_processingQuery) return null;
        _processingQuery = true;

        try {
            if (typeof window.GovernmentLaws !== 'undefined' &&
                typeof window.GovernmentLaws.getCivilLawStatistics === 'function') {
                return window.GovernmentLaws.getCivilLawStatistics(locationId);
            }
            return null;
        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 5. APPLICABLE LAWS (Aggregates civil + religious)
    // =========================================================================

    /**
     * Gets all applicable laws for a character at a location
     * @param {string} locationId - Location ID
     * @param {string} characterId - Character ID (optional, for religious laws)
     * @param {string} domain - Optional domain filter
     * @returns {Array} Array of law objects with source info
     */
    function getApplicableLaws(locationId, characterId, domain) {
        if (_processingQuery) return [];
        _processingQuery = true;

        try {
            var laws = [];
            var settlement = _getSettlementData(locationId);

            if (!settlement) return [];

            // 1. Civil laws (always apply to all residents)
            var civilLaws = getCivilLaws(locationId);
            for (var i = 0; i < civilLaws.length; i++) {
                laws.push({
                    law: civilLaws[i],
                    source: 'civil',
                    sourceId: locationId,
                    sourceName: settlement.locationName || 'Unknown'
                });
            }

            // 2. Religious laws (apply to followers, or all if theocracy)
            var character = null;
            if (characterId && typeof window.getCharacterById === 'function') {
                character = window.getCharacterById(characterId);
            }

            var applyReligiousToAll = settlement.useReligiousLawsAsCivil || 
                                       settlement.governmentType === 'theocracy';

            var religionId = character ? character.religionId : null;

            if (applyReligiousToAll) {
                // Find dominant religion or use character's religion
                var targetReligionId = religionId || settlement.dominantReligionId;
                if (targetReligionId && typeof window.ReligionLaws !== 'undefined') {
                    var religiousLaws = window.ReligionLaws.getLawsByReligion(targetReligionId);
                    var religion = typeof window.ReligionState !== 'undefined' ?
                        window.ReligionState.getReligion(targetReligionId) : null;
                    for (var i = 0; i < religiousLaws.length; i++) {
                        laws.push({
                            law: religiousLaws[i],
                            source: 'religious',
                            sourceId: targetReligionId,
                            sourceName: religion ? religion.name : 'Unknown'
                        });
                    }
                }
            } else if (religionId) {
                // Only followers get religious laws
                var religiousLaws = [];
                if (typeof window.ReligionLaws !== 'undefined') {
                    religiousLaws = window.ReligionLaws.getLawsByReligion(religionId);
                }
                var religion = typeof window.ReligionState !== 'undefined' ?
                    window.ReligionState.getReligion(religionId) : null;
                for (var i = 0; i < religiousLaws.length; i++) {
                    laws.push({
                        law: religiousLaws[i],
                        source: 'religious',
                        sourceId: religionId,
                        sourceName: religion ? religion.name : 'Unknown'
                    });
                }
            }

            // Filter by domain if specified
            if (domain) {
                laws = laws.filter(function(item) {
                    return item.law.domain === domain;
                });
            }

            return laws;

        } finally {
            _processingQuery = false;
        }
    }

    /**
     * Checks if a law is applicable to a character
     * @param {string} locationId - Location ID
     * @param {string} characterId - Character ID
     * @param {string} lawId - Law ID
     * @returns {boolean} True if applicable
     */
    function isLawApplicable(locationId, characterId, lawId) {
        if (_processingQuery) return false;
        _processingQuery = true;

        try {
            var laws = getApplicableLaws(locationId, characterId);
            for (var i = 0; i < laws.length; i++) {
                if (laws[i].law.id === lawId) {
                    return true;
                }
            }
            return false;
        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 6. STATISTICS
    // =========================================================================

    /**
     * Gets global settlement statistics
     * @returns {Object} Statistics object
     */
    function getGlobalSettlementStatistics() {
        if (_processingQuery) return null;
        _processingQuery = true;

        try {
            var all = _getAllSettlementData();
            var stats = {
                totalSettlements: Object.keys(all).length,
                totalPopulation: 0,
                averageProsperity: 0,
                averageCrimeRate: 0,
                averageReligiousUnity: 0,
                byGovernmentType: {},
                withWatch: 0,
                byJusticeSeverity: {}
            };

            var totalProsperity = 0;
            var totalCrimeRate = 0;
            var totalReligiousUnity = 0;
            var count = 0;

            for (var id in all) {
                if (all.hasOwnProperty(id)) {
                    var data = all[id];
                    count++;

                    stats.totalPopulation += data.population || 0;
                    totalProsperity += data.prosperity || 0;
                    totalCrimeRate += data.crimeRate || 0;
                    totalReligiousUnity += data.religiousUnity || 0;

                    var govType = data.governmentType || 'none';
                    if (!stats.byGovernmentType[govType]) {
                        stats.byGovernmentType[govType] = 0;
                    }
                    stats.byGovernmentType[govType]++;

                    if (data.hasWatch) {
                        stats.withWatch++;
                    }

                    var severity = data.justiceSeverity || 'medium';
                    if (!stats.byJusticeSeverity[severity]) {
                        stats.byJusticeSeverity[severity] = 0;
                    }
                    stats.byJusticeSeverity[severity]++;
                }
            }

            stats.averageProsperity = count > 0 ? Math.round(totalProsperity / count) : 0;
            stats.averageCrimeRate = count > 0 ? Math.round((totalCrimeRate / count) * 100) / 100 : 0;
            stats.averageReligiousUnity = count > 0 ? Math.round(totalReligiousUnity / count) : 0;

            return stats;

        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 7. COMPARISON
    // =========================================================================

    /**
     * Compares two settlements
     * @param {string} locationId1 - First location ID
     * @param {string} locationId2 - Second location ID
     * @returns {Object|null} Comparison object
     */
    function compareSettlements(locationId1, locationId2) {
        if (_processingQuery) return null;
        _processingQuery = true;

        try {
            var data1 = _getSettlementData(locationId1);
            var data2 = _getSettlementData(locationId2);

            if (!data1 || !data2) return null;

            var place1 = _getPlaceById(locationId1);
            var place2 = _getPlaceById(locationId2);

            return {
                settlement1: {
                    id: locationId1,
                    name: place1 ? place1.displayName : 'Unknown',
                    prosperity: data1.prosperity || 0,
                    crimeRate: data1.crimeRate || 0,
                    religiousUnity: data1.religiousUnity || 0,
                    population: data1.population || 0,
                    governmentType: data1.governmentType || 'none',
                    hasWatch: data1.hasWatch || false,
                    lawCount: getCivilLawCount(locationId1)
                },
                settlement2: {
                    id: locationId2,
                    name: place2 ? place2.displayName : 'Unknown',
                    prosperity: data2.prosperity || 0,
                    crimeRate: data2.crimeRate || 0,
                    religiousUnity: data2.religiousUnity || 0,
                    population: data2.population || 0,
                    governmentType: data2.governmentType || 'none',
                    hasWatch: data2.hasWatch || false,
                    lawCount: getCivilLawCount(locationId2)
                },
                differences: {
                    prosperity: (data1.prosperity || 0) - (data2.prosperity || 0),
                    crimeRate: (data1.crimeRate || 0) - (data2.crimeRate || 0),
                    religiousUnity: (data1.religiousUnity || 0) - (data2.religiousUnity || 0),
                    population: (data1.population || 0) - (data2.population || 0)
                }
            };

        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 8. EXPORTS
    // =========================================================================

    window.SettlementQueries = {
        // Basic
        getSettlementData: getSettlementData,
        getAllSettlementData: getAllSettlementData,
        getSettlements: getSettlements,
        getSettlementCount: getSettlementCount,

        // Civil Laws (wrappers)
        getCivilLaws: getCivilLaws,
        getCivilLawsByDomain: getCivilLawsByDomain,
        getEnforcedCivilLaws: getEnforcedCivilLaws,
        getCivilLaw: getCivilLaw,
        getCivilLawCount: getCivilLawCount,
        getCivilLawsByCrimeType: getCivilLawsByCrimeType,
        getEnforcedCivilLawsByCrimeType: getEnforcedCivilLawsByCrimeType,
        getCivilLawStatistics: getCivilLawStatistics,

        // Applicable Laws (aggregated)
        getApplicableLaws: getApplicableLaws,
        isLawApplicable: isLawApplicable,

        // Statistics
        getGlobalSettlementStatistics: getGlobalSettlementStatistics,

        // Comparison
        compareSettlements: compareSettlements
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            SettlementQueries: window.SettlementQueries
        };
    }

})();