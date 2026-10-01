/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT RANK COMMANDS
 * js/settlement/settlement-rank-commands.js
 * =============================================================================
 *
 * RANK MUTATION COMMANDS.
 *
 * This file contains commands that change a settlement's canonical rank:
 *   - upgradeSettlementRank : promote the settlement to the next rank
 *   - setSettlementRank     : explicitly set the rank (for corrections,
 *                             migrations, and exceptional events)
 *
 * Both commands are one logical transaction:
 *
 *   read canonical
 *     ↓
 *   validate (via SettlementRankRules)
 *     ↓
 *   build candidate
 *     ↓
 *   commit candidate        (SettlementCommandCommit.commit)
 *     ↓
 *   return structured result
 *
 * The commit helper owns the write / rebuild / persist / publish
 * sequence. This module does not reimplement any part of it.
 *
 * Contract reference: Settlement Architecture Contracts §5 (Missing-Value
 * Semantics), §9 (Rules Contract), §12 (Command Contract), §13
 * (Persistence Contract), §14 (Notification Contract), §17 (Rank
 * Contract), §32 (Completion Standard).
 *
 * Domain decisions applied:
 *   - `rankId` is canonical. Population determines eligibility. It does
 *     not determine current rank.
 *   - upgradeSettlementRank consults SettlementRankRules.evaluateUpgrade
 *     and rejects if the settlement is not eligible.
 *   - setSettlementRank is a lower-level command for exceptional uses
 *     (migration, correction, scripted world events). It does not
 *     consult upgrade rules. It validates that the target rank exists.
 *   - `lastUpgraded` is set to the current world year on a rank change.
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

    function _getRankQueries() {
        return window.SettlementRankQueries;
    }

    function _getRankRules() {
        return window.SettlementRankRules;
    }

    function _getCommit() {
        return window.SettlementCommandCommit;
    }

    function _getTime() {
        return window.Time;
    }

    function _getPopulationAccessor() {
        return window.getLocationPopulationCount;
    }

    // =========================================================================
    // 2. HELPERS
    // =========================================================================

    function _failure(code, details) {
        return {
            success: false,
            code: code,
            details: details || {}
        };
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

    // =========================================================================
    // 3. UPGRADE SETTLEMENT RANK
    // =========================================================================
    //
    // The command consults the upgrade rule and rejects if the settlement
    // is not eligible. It does not clamp, coerce, or fabricate any input
    // the rule needs.
    //

    /**
     * @param {string} locationId
     * @returns {Object} structured result
     */
    function upgradeSettlementRank(locationId) {
        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) {
            return _failure('SETTLEMENT_NOT_FOUND', { locationId: locationId });
        }

        var population = _getPopulationAccessor()(locationId);
        if (!_isFiniteNumber(population)) {
            return _failure('POPULATION_UNAVAILABLE', {
                locationId: locationId
            });
        }

        // Prosperity is derived. The settlement record may not store it
        // under the new architecture. Read it from the prosperity query
        // module.
        var prosperity = null;
        if (window.SettlementProsperityQueries
            && typeof window.SettlementProsperityQueries.getProsperityValue === 'function') {
            prosperity = window.SettlementProsperityQueries.getProsperityValue(locationId);
        } else {
            // Fallback: if the settlement record still stores a
            // prosperity value during migration, use it. This branch is
            // removed once the migration to derived prosperity is
            // complete.
            prosperity = _isFiniteNumber(settlement.prosperity)
                ? settlement.prosperity
                : null;
        }

        if (!_isFiniteNumber(prosperity)) {
            return _failure('PROSPERITY_UNAVAILABLE', {
                locationId: locationId
            });
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

        var currentYear = _getTime().getCurrentYear();

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

    // =========================================================================
    // 4. SET SETTLEMENT RANK (explicit)
    // =========================================================================
    //
    // Lower-level command for exceptional uses: migrations, corrections,
    // scripted world events that directly assign a rank.
    //
    // It validates that the target rank exists but does not consult
    // upgrade eligibility. If the caller needs eligibility enforcement,
    // they call upgradeSettlementRank instead.
    //

    /**
     * @param {string} locationId
     * @param {string} rankId
     * @param {Object} [options]
     * @param {string} [options.reason]
     * @returns {Object} structured result
     */
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
        var currentYear = _getTime().getCurrentYear();

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

    // =========================================================================
    // 5. EXPORTS
    // =========================================================================

    window.SettlementRankCommands = Object.freeze({
        upgradeSettlementRank: upgradeSettlementRank,
        setSettlementRank: setSettlementRank
    });

})();
