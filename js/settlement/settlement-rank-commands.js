/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT RANK COMMANDS
 * js/settlement/settlement-rank-commands.js
 * =============================================================================
 *
 * (Header preserved — see current file. Only the time-dependency block
 * below changed.)
 *
 * Time dependency:
 *   window.getCurrentYear, defined in js/core/time.js. The deprecated
 *   window.getCurrentYearSafe alias is NOT used here.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    function _getSettlementQueries()  { return window.SettlementQueries; }
    function _getRankQueries()        { return window.SettlementRankQueries; }
    function _getRankRules()          { return window.SettlementRankRules; }
    function _getCommit()             { return window.SettlementCommandCommit; }
    function _getPopulationAccessor() { return window.getLocationPopulationCount; }
    function _getProsperityQueries()  { return window.SettlementProsperityQueries; }

    function _failure(code, details) {
        return { success: false, code: code, details: details || {} };
    }

    function _copyWith(source, overrides) {
        var copy = {};
        for (var key in source) {
            if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
            copy[key] = source[key];
        }
        for (var overrideKey in overrides) {
            if (!Object.prototype.hasOwnProperty.call(overrides, overrideKey)) continue;
            copy[overrideKey] = overrides[overrideKey];
        }
        return copy;
    }

    function _isFiniteNumber(value) {
        return typeof value === 'number' && isFinite(value);
    }

    function _currentYear() {
        if (typeof window.getCurrentYear !== 'function') {
            throw new Error(
                'settlement-rank-commands.js requires time.js (getCurrentYear).'
            );
        }
        return window.getCurrentYear();
    }

    function upgradeSettlementRank(locationId) {
        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) {
            return _failure('SETTLEMENT_NOT_FOUND', { locationId: locationId });
        }

        var population = _getPopulationAccessor()(locationId);
        if (!_isFiniteNumber(population)) {
            return _failure('POPULATION_UNAVAILABLE', { locationId: locationId });
        }

        var prosperity = _getProsperityQueries().getProsperityValue(locationId);
        if (!_isFiniteNumber(prosperity)) {
            return _failure('PROSPERITY_UNAVAILABLE', { locationId: locationId });
        }

        var evaluation = _getRankRules().evaluateUpgrade({
            currentRankId: settlement.rankId,
            population: population,
            prosperity: prosperity
        });

        if (!evaluation.eligible) {
            return _failure('UPGRADE_NOT_ELIGIBLE', {
                currentRankId: settlement.rankId,
                reasons: evaluation.reasons
            });
        }

        var currentRank = evaluation.currentRank;
        var nextRank = evaluation.nextRank;
        var currentYear = _currentYear();

        var candidate = _copyWith(settlement, {
            rankId: nextRank.id,
            lastUpgraded: currentYear
        });

        var publishedEvent = _getCommit().commit(locationId, candidate, {
            type: 'settlementUpgraded',
            fromRankId: currentRank.id,
            toRankId: nextRank.id,
            year: currentYear
        });

        return {
            success: true,
            locationId: locationId,
            fromRankId: currentRank.id,
            fromRankName: currentRank.name,
            toRankId: nextRank.id,
            toRankName: nextRank.name,
            year: currentYear,
            event: publishedEvent
        };
    }

    function setSettlementRank(locationId, rankId, options) {
        options = options || {};

        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) {
            return _failure('SETTLEMENT_NOT_FOUND', { locationId: locationId });
        }

        var rank = _getRankRules().getRankById(rankId);
        if (!rank) {
            return _failure('UNKNOWN_RANK', { rankId: rankId });
        }

        if (settlement.rankId === rank.id) {
            return {
                success: true,
                locationId: locationId,
                rankId: rank.id,
                rankName: rank.name,
                noop: true
            };
        }

        var previousRankId = settlement.rankId;
        var currentYear = _currentYear();

        var candidate = _copyWith(settlement, {
            rankId: rank.id,
            lastUpgraded: currentYear
        });

        var eventPayload = {
            type: 'settlementRankSet',
            fromRankId: previousRankId,
            toRankId: rank.id,
            year: currentYear
        };

        if (typeof options.reason === 'string' && options.reason.length > 0) {
            eventPayload.reason = options.reason;
        }

        var publishedEvent = _getCommit().commit(locationId, candidate, eventPayload);

        return {
            success: true,
            locationId: locationId,
            fromRankId: previousRankId,
            toRankId: rank.id,
            toRankName: rank.name,
            year: currentYear,
            noop: false,
            event: publishedEvent
        };
    }

    window.SettlementRankCommands = Object.freeze({
        upgradeSettlementRank: upgradeSettlementRank,
        setSettlementRank: setSettlementRank
    });

})();
