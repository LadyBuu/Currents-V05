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
 * Prosperity source:
 *   Prosperity is a derived value owned by SettlementProsperityQueries.
 *   The settlement record does not store it. upgradeSettlementRank
 *   reads it through the prosperity query. There is no fallback to a
 *   persisted field — a persisted field does not exist under the new
 *   architecture and pretending it might would hide configuration bugs.
 *
 * Time dependency:
 *   window.getCurrentYearSafe, defined in js/core/time.js, aliased to
 *   window.getCurrentYear. The previous version of this file wrapped
 *   time behind window.Time, which does not exist.
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

    function _getPopulationAccessor() {
        return window.getLocationPopulationCount;
    }

    function _getProsperityQueries() {
        return window.SettlementProsperityQueries;
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

    function _currentYear() {
        if (typeof window.getCurrentYearSafe !== 'function') {
            throw new Error(
                'settlement-rank-commands.js requires time.js (getCurrentYearSafe).'
            );
        }
        return window.getCurrentYearSafe();
    }

    // =========================================================================
    // 3. UPGRADE SETTLEMENT RANK
    // =========================================================================
    //
    // The command consults the upgrade rule and rejects if the settlement
    // is not eligible. It does not clamp, coerce, or fabricate any input
    // the rule needs.
    //
    // Prosperity is read exclusively from SettlementProsperityQueries.
    // The previous version of this file fell back to settlement.prosperity
    // if the prosperity query module was missing. That field is not
    // written by SettlementFactory, so the fallback never succeeded. It
    // also masked the real failure — the prosperity module not being
    // loaded — behind a false "PROSPERITY_UNAVAILABLE". The fallback is
    // removed.
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

        var prosperity = _getProsperityQueries().getProsperityValue(locationId);
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

    // =========================================================================
    // 5. EXPORTS
    // =========================================================================

    window.SettlementRankCommands = Object.freeze({
        upgradeSettlementRank: upgradeSettlementRank,
        setSettlementRank: setSettlementRank
    });

})();
