/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT LAW QUERIES
 * js/settlement/settlement-law-queries.js
 * =============================================================================
 *
 * CIVIL LAW QUERIES.
 *
 * This file provides read-only queries over a settlement's civil laws. It
 * answers:
 *   - how many civil laws does a settlement have?
 *   - what are all its civil laws?
 *   - what is a specific civil law by id?
 *   - which civil laws belong to a given domain?
 *   - which civil laws have a given severity?
 *   - which civil laws are enforced?
 *   - which civil laws map to a given crime type?
 *   - what are the aggregate statistics of a settlement's laws?
 *
 * It is a query module. It:
 *   - reads canonical settlement data through SettlementQueries
 *   - does not mutate anything
 *   - does not persist
 *   - does not display UI
 *   - does not fabricate missing values
 *   - does not use recursion guards
 *
 * Contract reference: Settlement Architecture Contracts §10 (Query
 * Contract), §11 (Query Results and Missing Data), §32 (Completion
 * Standard).
 *
 * Civil law storage:
 *
 *   Civil laws are stored on the settlement record as `settlement.civilLaws`,
 *   an array of law objects. This module reads that array directly. It does
 *   not delegate to a foreign law system. The law schema itself (valid
 *   ids, severities, types, domains) is owned by SettlementLawDefinitions;
 *   this module does not re-validate. Validation happens in rules, not in
 *   queries.
 *
 * Missing data:
 *
 *   - settlement missing            → queries return null
 *   - settlement exists, no laws    → queries return [] or 0
 *   - law id not found              → getCivilLaw returns null
 *
 *   These three states are kept distinct.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCIES
    // =========================================================================

    function _getSettlementQueries() {
        return window.SettlementQueries;
    }

    // =========================================================================
    // 2. HELPERS
    // =========================================================================

    function _getLawsArray(locationId) {
        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) return null;
        if (!settlement.civilLaws) return [];
        return settlement.civilLaws;
    }

    function _isEnforced(law) {
        return !!(law && law.crimeMapping && law.crimeMapping.isEnforced === true);
    }

    // =========================================================================
    // 3. BASIC QUERIES
    // =========================================================================

    /**
     * Returns the number of civil laws in a settlement.
     * Returns null if the settlement does not exist.
     *
     * @param {string} locationId
     * @returns {number|null}
     */
    function getCivilLawCount(locationId) {
        var laws = _getLawsArray(locationId);
        return laws === null ? null : laws.length;
    }

    /**
     * Returns all civil laws for a settlement, in stored order.
     * Returns null if the settlement does not exist. Returns an empty
     * array if the settlement exists but has no laws.
     *
     * @param {string} locationId
     * @returns {Array<Object>|null}
     */
    function getCivilLaws(locationId) {
        var laws = _getLawsArray(locationId);
        if (laws === null) return null;
        return laws.slice();
    }

    /**
     * Returns a single civil law by id, or null if not found or the
     * settlement does not exist.
     *
     * @param {string} locationId
     * @param {string} lawId
     * @returns {Object|null}
     */
    function getCivilLaw(locationId, lawId) {
        if (lawId === null || lawId === undefined) return null;
        var laws = _getLawsArray(locationId);
        if (laws === null) return null;
        for (var i = 0; i < laws.length; i++) {
            if (laws[i] && laws[i].id === lawId) return laws[i];
        }
        return null;
    }

    /**
     * Returns true if a settlement has a civil law with the given id.
     * Returns null if the settlement does not exist.
     *
     * @param {string} locationId
     * @param {string} lawId
     * @returns {boolean|null}
     */
    function hasCivilLaw(locationId, lawId) {
        if (lawId === null || lawId === undefined) return false;
        var laws = _getLawsArray(locationId);
        if (laws === null) return null;
        for (var i = 0; i < laws.length; i++) {
            if (laws[i] && laws[i].id === lawId) return true;
        }
        return false;
    }

    // =========================================================================
    // 4. FILTERED QUERIES
    // =========================================================================

    /**
     * Returns all civil laws in a given domain.
     * Returns null if the settlement does not exist. Returns [] if none
     * match.
     *
     * @param {string} locationId
     * @param {string} domain
     * @returns {Array<Object>|null}
     */
    function getCivilLawsByDomain(locationId, domain) {
        var laws = _getLawsArray(locationId);
        if (laws === null) return null;
        if (domain === null || domain === undefined) return [];
        var result = [];
        for (var i = 0; i < laws.length; i++) {
            if (laws[i] && laws[i].domain === domain) {
                result.push(laws[i]);
            }
        }
        return result;
    }

    /**
     * Returns all civil laws of a given type.
     * Returns null if the settlement does not exist. Returns [] if none
     * match.
     *
     * @param {string} locationId
     * @param {string} type
     * @returns {Array<Object>|null}
     */
    function getCivilLawsByType(locationId, type) {
        var laws = _getLawsArray(locationId);
        if (laws === null) return null;
        if (type === null || type === undefined) return [];
        var result = [];
        for (var i = 0; i < laws.length; i++) {
            if (laws[i] && laws[i].type === type) {
                result.push(laws[i]);
            }
        }
        return result;
    }

    /**
     * Returns all civil laws of a given severity.
     * Returns null if the settlement does not exist. Returns [] if none
     * match.
     *
     * @param {string} locationId
     * @param {string} severity
     * @returns {Array<Object>|null}
     */
    function getCivilLawsBySeverity(locationId, severity) {
        var laws = _getLawsArray(locationId);
        if (laws === null) return null;
        if (severity === null || severity === undefined) return [];
        var result = [];
        for (var i = 0; i < laws.length; i++) {
            if (laws[i] && laws[i].severity === severity) {
                result.push(laws[i]);
            }
        }
        return result;
    }

    /**
     * Returns all enforced civil laws.
     * Returns null if the settlement does not exist. Returns [] if none
     * are enforced.
     *
     * @param {string} locationId
     * @returns {Array<Object>|null}
     */
    function getEnforcedCivilLaws(locationId) {
        var laws = _getLawsArray(locationId);
        if (laws === null) return null;
        var result = [];
        for (var i = 0; i < laws.length; i++) {
            if (_isEnforced(laws[i])) {
                result.push(laws[i]);
            }
        }
        return result;
    }

    /**
     * Returns all civil laws mapped to a given crime type.
     * Returns null if the settlement does not exist. Returns [] if none
     * match.
     *
     * @param {string} locationId
     * @param {string} crimeType
     * @returns {Array<Object>|null}
     */
    function getCivilLawsByCrimeType(locationId, crimeType) {
        var laws = _getLawsArray(locationId);
        if (laws === null) return null;
        if (crimeType === null || crimeType === undefined) return [];
        var result = [];
        for (var i = 0; i < laws.length; i++) {
            var law = laws[i];
            if (law && law.crimeMapping && law.crimeMapping.crimeType === crimeType) {
                result.push(law);
            }
        }
        return result;
    }

    /**
     * Returns enforced civil laws mapped to a given crime type.
     * Returns null if the settlement does not exist. Returns [] if none
     * match.
     *
     * @param {string} locationId
     * @param {string} crimeType
     * @returns {Array<Object>|null}
     */
    function getEnforcedCivilLawsByCrimeType(locationId, crimeType) {
        var laws = _getLawsArray(locationId);
        if (laws === null) return null;
        if (crimeType === null || crimeType === undefined) return [];
        var result = [];
        for (var i = 0; i < laws.length; i++) {
            var law = laws[i];
            if (law
                && law.crimeMapping
                && law.crimeMapping.crimeType === crimeType
                && law.crimeMapping.isEnforced === true) {
                result.push(law);
            }
        }
        return result;
    }

    // =========================================================================
    // 5. STATISTICS
    // =========================================================================

    /**
     * Returns aggregate statistics about a settlement's civil laws.
     * Returns null if the settlement does not exist.
     *
     * Result shape:
     *   {
     *     totalLaws: number,
     *     enforced: number,
     *     notEnforced: number,
     *     byDomain: { [domainId]: count },
     *     byType: { [typeId]: count },
     *     bySeverity: { [severityId]: count }
     *   }
     *
     * Every map includes only the ids that actually appear. Consumers
     * that need a complete table can iterate the definition catalogs.
     *
     * @param {string} locationId
     * @returns {Object|null}
     */
    function getCivilLawStatistics(locationId) {
        var laws = _getLawsArray(locationId);
        if (laws === null) return null;

        var stats = {
            totalLaws: laws.length,
            enforced: 0,
            notEnforced: 0,
            byDomain: {},
            byType: {},
            bySeverity: {}
        };

        for (var i = 0; i < laws.length; i++) {
            var law = laws[i];
            if (!law) continue;

            if (_isEnforced(law)) {
                stats.enforced++;
            } else {
                stats.notEnforced++;
            }

            if (law.domain) {
                stats.byDomain[law.domain] = (stats.byDomain[law.domain] || 0) + 1;
            }
            if (law.type) {
                stats.byType[law.type] = (stats.byType[law.type] || 0) + 1;
            }
            if (law.severity) {
                stats.bySeverity[law.severity] = (stats.bySeverity[law.severity] || 0) + 1;
            }
        }

        return stats;
    }

    // =========================================================================
    // 6. EXPORTS
    // =========================================================================

    window.SettlementLawQueries = Object.freeze({
        getCivilLawCount: getCivilLawCount,
        getCivilLaws: getCivilLaws,
        getCivilLaw: getCivilLaw,
        hasCivilLaw: hasCivilLaw,
        getCivilLawsByDomain: getCivilLawsByDomain,
        getCivilLawsByType: getCivilLawsByType,
        getCivilLawsBySeverity: getCivilLawsBySeverity,
        getEnforcedCivilLaws: getEnforcedCivilLaws,
        getCivilLawsByCrimeType: getCivilLawsByCrimeType,
        getEnforcedCivilLawsByCrimeType: getEnforcedCivilLawsByCrimeType,
        getCivilLawStatistics: getCivilLawStatistics
    });

})();
