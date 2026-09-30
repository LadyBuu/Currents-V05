/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT RANK RULES
 * js/settlement/settlement-rank-rules.js
 * =============================================================================
 *
 * PURE RANK RULES.
 *
 * This file contains pure functions over rank definitions. It answers:
 *   - which ranks exist (delegates to definitions)
 *   - which rank a given population qualifies for
 *   - which rank follows a given rank
 *   - whether a settlement is eligible to upgrade
 *
 * It is pure. It has no dependencies beyond SettlementRankDefinitions.
 * It does not read canonical settlement state. It does not mutate
 * anything. It does not persist. It does not display UI. It does not
 * fabricate missing values. It does not use recursion guards.
 *
 * Contract reference: Settlement Architecture Contracts §9 (Rules
 * Contract), §17 (Rank Contract), §32 (Completion Standard).
 *
 * Design notes:
 *   - `rankId` is canonical settlement state. This module does not read
 *     it. Callers pass the current rank id and the current population.
 *   - Rules return structured results, not bare booleans and not human
 *     strings. Human-readable messages belong to the application/UI layer.
 *   - Missing or unknown rank ids are not replaced with a fallback rank.
 *     They produce an explicit error result.
 *   - Population of 0 is a legitimate value. It is not treated as missing.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCIES
    // =========================================================================

    function _getRanks() {
        return window.SettlementRankDefinitions.RANKS;
    }

    // Ranks are declared in ascending order of `order`. We cache a sorted
    // copy once so lookups do not re-sort on every call. Definitions are
    // frozen, so the sorted copy is stable for the lifetime of the module.

    var _sortedRanksCache = null;

    function _getSortedRanks() {
        if (_sortedRanksCache !== null) {
            return _sortedRanksCache;
        }
        var ranks = _getRanks().slice();
        ranks.sort(function (a, b) { return a.order - b.order; });
        _sortedRanksCache = ranks;
        return _sortedRanksCache;
    }

    // =========================================================================
    // 2. LOOKUPS
    // =========================================================================

    /**
     * Returns all rank definitions in ascending order.
     * @returns {Array}
     */
    function getAllRanks() {
        return _getSortedRanks();
    }

    /**
     * Returns a rank definition by id, or null if no such rank exists.
     * @param {string} rankId
     * @returns {Object|null}
     */
    function getRankById(rankId) {
        if (rankId === null || rankId === undefined) {
            return null;
        }
        var ranks = _getRanks();
        for (var i = 0; i < ranks.length; i++) {
            if (ranks[i].id === rankId) {
                return ranks[i];
            }
        }
        return null;
    }

    /**
     * Returns the rank whose population bounds contain the given
     * population. Population is a non-negative integer.
     *
     * Population 0 is a legitimate value and returns the lowest rank.
     *
     * @param {number} population
     * @returns {Object|null}
     */
    function getRankFromPopulation(population) {
        if (typeof population !== 'number' || !isFinite(population) || population < 0) {
            return null;
        }
        var ranks = _getSortedRanks();
        for (var i = ranks.length - 1; i >= 0; i--) {
            if (population >= ranks[i].minPopulation) {
                return ranks[i];
            }
        }
        return null;
    }

    /**
     * Returns the next rank above the given rank id, or null if the given
     * rank is already the highest, or if the rank id is unknown.
     *
     * @param {string} rankId
     * @returns {Object|null}
     */
    function getNextRank(rankId) {
        var ranks = _getSortedRanks();
        for (var i = 0; i < ranks.length; i++) {
            if (ranks[i].id === rankId) {
                if (i + 1 < ranks.length) {
                    return ranks[i + 1];
                }
                return null;
            }
        }
        return null;
    }

    /**
     * Returns the previous rank below the given rank id, or null if the
     * given rank is already the lowest, or if the rank id is unknown.
     *
     * @param {string} rankId
     * @returns {Object|null}
     */
    function getPreviousRank(rankId) {
        var ranks = _getSortedRanks();
        for (var i = 0; i < ranks.length; i++) {
            if (ranks[i].id === rankId) {
                if (i - 1 >= 0) {
                    return ranks[i - 1];
                }
                return null;
            }
        }
        return null;
    }

    // =========================================================================
    // 3. UPGRADE EVALUATION
    // =========================================================================
    //
    // The upgrade rule consults:
    //   - current rank id (canonical settlement state)
    //   - current population (foreign-domain input; passed by caller)
    //   - minimum prosperity (policy; frozen here as a rule constant)
    //
    // The result is a structured object. It does not contain human-readable
    // strings. It does not fabricate missing inputs. It reports every
    // reason the upgrade is not permitted, in a stable order.
    //
    // Reason codes:
    //   UNKNOWN_CURRENT_RANK     - rankId does not match any definition
    //   ALREADY_MAX_RANK         - no next rank exists
    //   INSUFFICIENT_POPULATION  - population below next rank minPopulation
    //   INSUFFICIENT_PROSPERITY  - prosperity below required threshold
    //

    var MIN_PROSPERITY_FOR_UPGRADE = 50;

    /**
     * Evaluates whether a settlement may upgrade from its current rank.
     *
     * @param {Object} input
     * @param {string} input.currentRankId
     * @param {number} input.population
     * @param {number} input.prosperity
     * @returns {Object} structured result:
     *   {
     *     eligible: boolean,
     *     currentRank: Object|null,
     *     nextRank: Object|null,
     *     reasons: Array<{ code: string, ...details }>
     *   }
     */
    function evaluateUpgrade(input) {
        input = input || {};

        var result = {
            eligible: false,
            currentRank: null,
            nextRank: null,
            reasons: []
        };

        var currentRank = getRankById(input.currentRankId);
        if (!currentRank) {
            result.reasons.push({
                code: 'UNKNOWN_CURRENT_RANK',
                currentRankId: input.currentRankId
            });
            return result;
        }
        result.currentRank = currentRank;

        var nextRank = getNextRank(currentRank.id);
        if (!nextRank) {
            result.reasons.push({
                code: 'ALREADY_MAX_RANK',
                currentRankId: currentRank.id
            });
            return result;
        }
        result.nextRank = nextRank;

        if (typeof input.population !== 'number' || !isFinite(input.population)) {
            result.reasons.push({
                code: 'INSUFFICIENT_POPULATION',
                required: nextRank.minPopulation,
                actual: null
            });
            return result;
        }

        if (input.population < nextRank.minPopulation) {
            result.reasons.push({
                code: 'INSUFFICIENT_POPULATION',
                required: nextRank.minPopulation,
                actual: input.population,
                deficit: nextRank.minPopulation - input.population
            });
        }

        if (typeof input.prosperity !== 'number' || !isFinite(input.prosperity)) {
            result.reasons.push({
                code: 'INSUFFICIENT_PROSPERITY',
                required: MIN_PROSPERITY_FOR_UPGRADE,
                actual: null
            });
            return result;
        }

        if (input.prosperity < MIN_PROSPERITY_FOR_UPGRADE) {
            result.reasons.push({
                code: 'INSUFFICIENT_PROSPERITY',
                required: MIN_PROSPERITY_FOR_UPGRADE,
                actual: input.prosperity,
                deficit: MIN_PROSPERITY_FOR_UPGRADE - input.prosperity
            });
        }

        result.eligible = result.reasons.length === 0;
        return result;
    }

    // =========================================================================
    // 4. EXPORTS
    // =========================================================================

    window.SettlementRankRules = Object.freeze({
        getAllRanks: getAllRanks,
        getRankById: getRankById,
        getRankFromPopulation: getRankFromPopulation,
        getNextRank: getNextRank,
        getPreviousRank: getPreviousRank,
        evaluateUpgrade: evaluateUpgrade,
        MIN_PROSPERITY_FOR_UPGRADE: MIN_PROSPERITY_FOR_UPGRADE
    });

})();
