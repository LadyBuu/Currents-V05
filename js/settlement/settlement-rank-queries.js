/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT RANK QUERIES
 * js/settlement/settlement-rank-queries.js
 * =============================================================================
 *
 * RANK QUERIES.
 *
 * This file provides read-only queries about settlement ranks. It answers:
 *   - what is the current rank of a settlement?
 *   - which rank is a given population eligible for?
 *   - what is the next rank above a settlement's current rank?
 *   - is a settlement currently eligible to upgrade?
 *   - what are the reasons an upgrade is or is not possible?
 *
 * It is a query module. It:
 *   - composes RankRules with the canonical settlement read API
 *   - reads population through the canonical population accessor
 *   - reads prosperity through SettlementProsperityQueries
 *   - does not mutate anything
 *   - does not persist
 *   - does not display UI
 *   - does not fabricate missing values
 *   - does not use recursion guards
 *
 * Contract reference: Settlement Architecture Contracts §10 (Query
 * Contract), §11 (Query Results and Missing Data), §17 (Rank Contract),
 * §22 (Prosperity Contract), §32 (Completion Standard).
 *
 * Design notes:
 *   - Population is a foreign-domain input. This module reads it through
 *     the canonical population accessor when available, otherwise it
 *     reports the input as unavailable rather than substituting a number.
 *   - `rankId` is canonical. This module reads it but never writes it.
 *   - `prosperity` is a derived value owned by SettlementProsperityQueries.
 *     This module reads it through that query, exclusively. The previous
 *     version of this file fell back to settlement.prosperity, which is
 *     not written by SettlementFactory; the fallback only ever produced
 *     PROSPERITY_UNAVAILABLE and hid the real cause (a missing or
 *     misloaded prosperity module). The fallback is removed here too,
 *     matching the fix in settlement-rank-commands.js.
 *   - When a required input is unavailable, the query returns a structured
 *     result indicating that availability, rather than a fabricated value.
 *   - There is no `_processingQuery` guard. Queries may call one another.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY ACCESS
    // =========================================================================
    //
    // Required dependencies are accessed directly. They are not probed with
    // `typeof X !== 'undefined'`. If a required dependency is missing, the
    // call will throw, which is the correct behavior for an application
    // initialization error.
    //

    function _getRankRules() {
        return window.SettlementRankRules;
    }

    function _getSettlementQueries() {
        return window.SettlementQueries;
    }

    function _getProsperityQueries() {
        return window.SettlementProsperityQueries;
    }

    function _getPopulationAccessor() {
        // Population is owned by the Location/Population domain. The
        // accessor is expected to exist. If it does not, calling this
        // function will throw, which is intentional.
        return window.getLocationPopulationCount;
    }

    // =========================================================================
    // 2. BASIC RANK QUERIES
    // =========================================================================

    /**
     * Returns the current rank of a settlement based on its canonical
     * `rankId`.
     *
     * @param {string} locationId
     * @returns {Object|null} rank definition, or null if the settlement
     *   does not exist or its rankId does not match a known rank.
     */
    function getCurrentRank(locationId) {
        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) return null;
        if (!settlement.rankId) return null;
        return _getRankRules().getRankById(settlement.rankId);
    }

    /**
     * Returns the rank that a given population qualifies for.
     *
     * @param {number} population
     * @returns {Object|null}
     */
    function getEligibleRankFromPopulation(population) {
        return _getRankRules().getRankFromPopulation(population);
    }

    /**
     * Returns the eligible rank for a settlement's current population.
     * Population is read through the canonical population accessor.
     *
     * @param {string} locationId
     * @returns {Object|null}
     */
    function getEligibleRank(locationId) {
        var population = _getPopulationAccessor()(locationId);
        if (typeof population !== 'number' || !isFinite(population)) {
            return null;
        }
        return _getRankRules().getRankFromPopulation(population);
    }

    /**
     * Returns the next rank above the settlement's current rank, or null
     * if the settlement is at maximum rank or the rank id is unknown.
     *
     * @param {string} locationId
     * @returns {Object|null}
     */
    function getNextRankForSettlement(locationId) {
        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement || !settlement.rankId) return null;
        return _getRankRules().getNextRank(settlement.rankId);
    }

    // =========================================================================
    // 3. UPGRADE ELIGIBILITY
    // =========================================================================
    //
    // This query gathers the inputs needed by the upgrade rule and returns
    // the rule's structured evaluation, augmented with the settlement's
    // current rank and current eligible rank for convenience.
    //
    // If a required input is unavailable, the result reports that
    // unavailability in the reasons list rather than substituting a
    // fabricated number.
    //
    // Prosperity is read exclusively through SettlementProsperityQueries.
    // The settlement record does not store a derived prosperity value
    // under the new architecture, so there is no fallback field to read.
    //

    /**
     * @param {string} locationId
     * @returns {Object}
     *   {
     *     available: boolean,          // false if required inputs are missing
     *     eligible: boolean,
     *     currentRank: Object|null,
     *     eligibleRank: Object|null,
     *     nextRank: Object|null,
     *     reasons: Array<Object>
     *   }
     */
    function getUpgradeStatus(locationId) {
        var settlement = _getSettlementQueries().getSettlementData(locationId);

        var result = {
            available: false,
            eligible: false,
            currentRank: null,
            eligibleRank: null,
            nextRank: null,
            reasons: []
        };

        if (!settlement) {
            result.reasons.push({
                code: 'SETTLEMENT_NOT_FOUND',
                locationId: locationId
            });
            return result;
        }

        var population = _getPopulationAccessor()(locationId);
        var populationAvailable =
            typeof population === 'number' && isFinite(population);

        // Prosperity is derived. Read it from the prosperity query
        // module. If that module is missing, this call throws — a
        // load-order bug, not a fabricated value.
        var prosperity = _getProsperityQueries().getProsperityValue(locationId);
        var prosperityAvailable =
            typeof prosperity === 'number' && isFinite(prosperity);

        result.currentRank = _getRankRules().getRankById(settlement.rankId);
        if (populationAvailable) {
            result.eligibleRank = _getRankRules().getRankFromPopulation(population);
        }
        result.nextRank = _getRankRules().getNextRank(settlement.rankId);

        if (!populationAvailable) {
            result.reasons.push({
                code: 'POPULATION_UNAVAILABLE',
                locationId: locationId
            });
        }
        if (!prosperityAvailable) {
            result.reasons.push({
                code: 'PROSPERITY_UNAVAILABLE',
                locationId: locationId
            });
        }

        if (!populationAvailable || !prosperityAvailable) {
            // Cannot run the rule without both inputs. Report unavailable.
            return result;
        }

        var evaluation = _getRankRules().evaluateUpgrade({
            currentRankId: settlement.rankId,
            population: population,
            prosperity: prosperity
        });

        result.available = true;
        result.eligible = evaluation.eligible;
        result.reasons = result.reasons.concat(evaluation.reasons);
        return result;
    }

    // =========================================================================
    // 4. EXPORTS
    // =========================================================================

    window.SettlementRankQueries = Object.freeze({
        getCurrentRank: getCurrentRank,
        getEligibleRankFromPopulation: getEligibleRankFromPopulation,
        getEligibleRank: getEligibleRank,
        getNextRankForSettlement: getNextRankForSettlement,
        getUpgradeStatus: getUpgradeStatus
    });

})();
