/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT EMPLOYMENT QUERIES
 * js/settlement/settlement-employment-queries.js
 * =============================================================================
 *
 * EMPLOYMENT QUERIES.
 *
 * Read-only queries about employment within a settlement.
 *
 * Location hierarchy:
 *   Owned by LocationQueries. Corrected from
 *   LocationState.getAllSubLocationIds to
 *   LocationQueries.getAllSubLocationIds.
 *
 * DEPENDENCIES (REQUIRED at load):
 *   - SettlementQueries
 *   - IndustryQueries
 *   - LocationQueries
 *   - getLocationPopulationCount
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

    function _getLocationQueries() {
        return window.LocationQueries;
    }

    // =========================================================================
    // 2. CONSTANTS
    // =========================================================================

    var WORKING_AGE_FRACTION = 0.6;

    // =========================================================================
    // 3. HELPERS
    // =========================================================================

    function _getLocationIdsForSettlement(locationId) {
        var ids = _getLocationQueries().getAllSubLocationIds(locationId);
        if (ids && ids.length > 0) return ids;
        return [locationId];
    }

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

    function getTotalWorkers(locationId) {
        var employment = getEmployment(locationId);
        return employment ? employment.totalEmployed : null;
    }

    function getUnemployed(locationId) {
        var employment = getEmployment(locationId);
        return employment ? employment.unemployed : null;
    }

    function getEmploymentRate(locationId) {
        var employment = getEmployment(locationId);
        return employment ? employment.employmentRate : null;
    }

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
