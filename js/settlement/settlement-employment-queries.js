/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT EMPLOYMENT QUERIES
 * js/settlement/settlement-employment-queries.js
 * =============================================================================
 *
 * EMPLOYMENT QUERIES.
 *
 * This file provides read-only queries about employment within a
 * settlement. It answers:
 *   - how many workers does a settlement have?
 *   - how many are employed, and by whom (state, private, public)?
 *   - how many are unemployed?
 *   - what is the employment rate?
 *   - what is the average wage?
 *
 * It is a query module. It:
 *   - reads canonical settlement data through SettlementQueries
 *   - reads population through the canonical population accessor
 *   - reads enterprises through IndustryQueries
 *   - does not mutate anything
 *   - does not persist
 *   - does not display UI
 *   - does not fabricate missing values
 *   - does not use recursion guards
 *
 * Contract reference: Settlement Architecture Contracts §10 (Query
 * Contract), §11 (Query Results and Missing Data), §19 (Enterprise
 * Ownership Contract), §32 (Completion Standard).
 *
 * Scope discipline:
 *
 *   Employment is a derived value. It is calculated from:
 *     - population (working-age population)
 *     - enterprises located in the settlement (worker counts, wages)
 *
 *   The canonical enterprise records belong to the Industry domain.
 *   This module reads them through IndustryQueries. It does not maintain
 *   a second store of worker counts. It does not read a persisted
 *   `settlement.employment` object as authoritative; if that object
 *   exists in old save data, it is a stale cache and is ignored.
 *
 *   The working-age fraction (currently 0.6 of population) is a domain
 *   constant for employment calculation. It is defined once, here, as
 *   WORKING_AGE_FRACTION. If it changes, it changes in one place.
 *
 * Missing data:
 *
 *   - settlement missing             → queries return null
 *   - population unavailable         → returns null (not zero)
 *   - no enterprises                 → employment is legitimate zeros
 *   - IndustryQueries missing        → the call throws (required)
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

    function _getIndustryQueries() {
        return window.IndustryQueries;
    }

    function _getPopulationAccessor() {
        return window.getLocationPopulationCount;
    }

    function _getLocationState() {
        return window.LocationState;
    }

    // =========================================================================
    // 2. CONSTANTS
    // =========================================================================

    // Fraction of total population considered working-age. This is a
    // domain constant. It is not read from anywhere else. If the world
    // model changes (aging, dependency ratios), this value changes here.
    var WORKING_AGE_FRACTION = 0.6;

    // =========================================================================
    // 3. HELPERS
    // =========================================================================

    function _getLocationIdsForSettlement(locationId) {
        var locationState = _getLocationState();
        if (typeof locationState.getAllSubLocationIds === 'function') {
            var ids = locationState.getAllSubLocationIds(locationId);
            if (ids && ids.length > 0) return ids;
        }
        return [locationId];
    }

    /**
     * Returns all enterprises whose locationId is within the settlement's
     * location set. Reads enterprise summaries from IndustryQueries.
     */
    function _getSettlementEnterprises(locationId) {
        var locationIds = _getLocationIdsForSettlement(locationId);
        var industryQueries = _getIndustryQueries();
        var result = [];

        for (var i = 0; i < locationIds.length; i++) {
            var enterprises = industryQueries.getLocationEnterprisesSummary(locationIds[i]);
            if (!enterprises) continue;
            for (var j = 0; j < enterprises.length; j++) {
                result.push(enterprises[j]);
            }
        }

        return result;
    }

    /**
     * Classifies an enterprise summary by ownership category.
     * Returns 'state', 'public', or 'private'.
     *
     * Per §19, ownership is owned by Industry. The category is determined
     * from the enterprise's own ownership fields, not from any settlement
     * membership array.
     */
    function _classifyOwnership(enterprise) {
        if (!enterprise) return 'private';

        if (enterprise.ownerType === 'state') return 'state';
        if (enterprise.ownerType === 'settlement') return 'public';
        if (enterprise.ownershipType === 'public') return 'public';
        if (enterprise.ownershipType === 'state') return 'state';

        return 'private';
    }

    // =========================================================================
    // 4. EMPLOYMENT CALCULATION
    // =========================================================================

    /**
     * Returns employment statistics for a settlement.
     *
     * Returns null if the settlement does not exist, or if the
     * population accessor returns a non-numeric value for the
     * settlement. A missing population is not the same as a population
     * of zero.
     *
     * Result shape:
     *   {
     *     workingAgePopulation: number,
     *     totalEmployed: number,
     *     stateEmployed: number,
     *     publicEmployed: number,
     *     privateEmployed: number,
     *     unemployed: number,
     *     employmentRate: number,      // integer 0-100
     *     averageWage: number,         // integer
     *     totalWages: number           // integer
     *   }
     *
     * @param {string} locationId
     * @returns {Object|null}
     */
    function getEmployment(locationId) {
        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) return null;

        var population = _getPopulationAccessor()(locationId);
        if (typeof population !== 'number' || !isFinite(population)) {
            return null;
        }

        var workingAgePopulation = Math.max(0, Math.floor(population * WORKING_AGE_FRACTION));

        var enterprises = _getSettlementEnterprises(locationId);

        var stateEmployed = 0;
        var publicEmployed = 0;
        var privateEmployed = 0;
        var totalWages = 0;

        for (var i = 0; i < enterprises.length; i++) {
            var enterprise = enterprises[i];
            if (!enterprise) continue;

            var workerCount = typeof enterprise.workerCount === 'number'
                ? enterprise.workerCount
                : 0;
            if (workerCount <= 0) continue;

            var wages = typeof enterprise.wages === 'number'
                ? enterprise.wages
                : 0;

            var category = _classifyOwnership(enterprise);
            if (category === 'state') {
                stateEmployed += workerCount;
            } else if (category === 'public') {
                publicEmployed += workerCount;
            } else {
                privateEmployed += workerCount;
            }

            totalWages += workerCount * wages;
        }

        var totalEmployed = stateEmployed + publicEmployed + privateEmployed;
        var unemployed = Math.max(0, workingAgePopulation - totalEmployed);

        var employmentRate = workingAgePopulation > 0
            ? Math.round((totalEmployed / workingAgePopulation) * 100)
            : 0;

        if (employmentRate > 100) employmentRate = 100;

        var averageWage = totalEmployed > 0
            ? Math.round(totalWages / totalEmployed)
            : 0;

        return {
            workingAgePopulation: workingAgePopulation,
            totalEmployed: totalEmployed,
            stateEmployed: stateEmployed,
            publicEmployed: publicEmployed,
            privateEmployed: privateEmployed,
            unemployed: unemployed,
            employmentRate: employmentRate,
            averageWage: averageWage,
            totalWages: totalWages
        };
    }

    // =========================================================================
    // 5. FOCUSED QUERIES
    // =========================================================================

    /**
     * Returns the total number of workers employed in a settlement, or
     * null if unavailable.
     *
     * @param {string} locationId
     * @returns {number|null}
     */
    function getTotalWorkers(locationId) {
        var employment = getEmployment(locationId);
        return employment ? employment.totalEmployed : null;
    }

    /**
     * Returns the number of unemployed working-age individuals in a
     * settlement, or null if unavailable.
     *
     * @param {string} locationId
     * @returns {number|null}
     */
    function getUnemployed(locationId) {
        var employment = getEmployment(locationId);
        return employment ? employment.unemployed : null;
    }

    /**
     * Returns the employment rate as an integer percentage, or null if
     * unavailable.
     *
     * @param {string} locationId
     * @returns {number|null}
     */
    function getEmploymentRate(locationId) {
        var employment = getEmployment(locationId);
        return employment ? employment.employmentRate : null;
    }

    /**
     * Returns the average wage in a settlement, or null if unavailable.
     *
     * @param {string} locationId
     * @returns {number|null}
     */
    function getAverageWage(locationId) {
        var employment = getEmployment(locationId);
        return employment ? employment.averageWage : null;
    }

    // =========================================================================
    // 6. EXPORTS
    // =========================================================================

    window.SettlementEmploymentQueries = Object.freeze({
        getEmployment: getEmployment,
        getTotalWorkers: getTotalWorkers,
        getUnemployed: getUnemployed,
        getEmploymentRate: getEmploymentRate,
        getAverageWage: getAverageWage,
        WORKING_AGE_FRACTION: WORKING_AGE_FRACTION
    });

})();
