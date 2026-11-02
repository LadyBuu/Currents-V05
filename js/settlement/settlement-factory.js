/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT FACTORY
 * js/settlement/settlement-factory.js
 * =============================================================================
 *
 * (Header preserved — see current file. Only the time-dependency block,
 * the BASE PROSPERITY FIELD section, and the refactor history changed.)
 *
 * Time dependency:
 *   window.getCurrentYear, defined in js/core/time.js. The deprecated
 *   window.getCurrentYearSafe alias is NOT used here.
 *
 * BASE PROSPERITY FIELD:
 *   `baseProsperity` is a canonical settlement field, initialized by
 *   this factory and persisted with the settlement record. It is the
 *   neutral baseline input to prosperity-derived calculations that
 *   cannot call SettlementProsperityQueries without creating a query
 *   cycle.
 *
 *   Rationale:
 *   - SettlementProsperityQueries.getProsperity consumes the crime rate
 *     (via SettlementCrimeQueries.getCrimeRateValue) as one of its
 *     modifiers.
 *   - SettlementCrimeQueries consumes prosperity as one of its
 *     modifiers.
 *
 *   If crime read its prosperity modifier by calling
 *   SettlementProsperityQueries.getProsperityValue, the two modules
 *   would form a cycle (crime → prosperity → crime), which the
 *   architecture explicitly forbids (§20 RECURSION GUARD POLICY
 *   prohibits masking cycles with flags; the dependency graph must be
 *   acyclic).
 *
 *   baseProsperity breaks the cycle: it is a stored input that crime
 *   reads directly (`settlement.baseProsperity`) without asking
 *   SettlementProsperityQueries. The real prosperity VALUE is still
 *   derived by SettlementProsperityQueries.getProsperity, which does
 *   NOT read baseProsperity — it uses SettlementProsperityDefinitions.
 *   BASE_PROSPERITY as its constant baseline. baseProsperity exists
 *   only for callers that need a stored prosperity input outside the
 *   prosperity query itself.
 *
 *   Coupling: the factory's default (50) MUST equal
 *   SettlementProsperityDefinitions.BASE_PROSPERITY (50). If that
 *   constant changes, this default must change with it, or freshly
 *   created settlements will diverge from the freshness baseline used
 *   by the prosperity calculation. This is a data-level invariant that
 *   the code cannot enforce without an import cycle, so it is
 *   documented here and checked by the settlement-docs consistency
 *   pass.
 *
 *   A future revision may add
 *   SettlementProsperityCommands.setBaseProsperity(locationId, value)
 *   to allow explicit adjustment. Until then, baseProsperity is set by
 *   the factory and never modified by a command; it is a read-only
 *   input from the domain's perspective.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - getDefaultSettlement now initializes baseProsperity: 50. This
 *       is the canonical prosperity input read by
 *       SettlementCrimeQueries.getCrimeRate. Prior revisions read
 *       settlement.prosperity, which the factory never set, so the
 *       prosperity term in the crime rate calculation was silently
 *       zero for every settlement.
 *     - Header BASE PROSPERITY FIELD section added, documenting the
 *       field's purpose, its role in breaking the crime ↔ prosperity
 *       query cycle, and its coupling to
 *       SettlementProsperityDefinitions.BASE_PROSPERITY.
 *     - No other field or behaviour change. Every other default value
 *       is byte-identical to the prior revision.
 *   Previous revision:
 *     - Time dependency updated to use window.getCurrentYear rather
 *       than the deprecated window.getCurrentYearSafe alias.
 * =============================================================================
 */

(function () {
    'use strict';

    function _getSettlementQueries() { return window.SettlementQueries; }
    function _getRankRules()        { return window.SettlementRankRules; }
    function _getCommit()           { return window.SettlementCommandCommit; }
    function _getPlaceQueries()     { return window.PlaceQueries; }

    function _failure(code, details) {
        return { success: false, code: code, details: details || {} };
    }

    function _isFiniteNumber(value) {
        return typeof value === 'number' && isFinite(value);
    }

    function _currentYear() {
        if (typeof window.getCurrentYear !== 'function') {
            throw new Error(
                'settlement-factory.js requires time.js (getCurrentYear).'
            );
        }
        return window.getCurrentYear();
    }

    function _getLowestRank() {
        var ranks = _getRankRules().getAllRanks();
        if (!ranks || ranks.length === 0) {
            throw new Error(
                'SettlementFactory: no ranks defined. ' +
                'SettlementRankDefinitions must declare at least one rank.'
            );
        }
        return ranks[0];
    }

    function getDefaultSettlement(locationId, overrides) {
        overrides = overrides || {};

        var currentYear = _currentYear();
        var lowestRank = _getLowestRank();

        var rankId = lowestRank.id;
        if (overrides.rankId !== undefined && overrides.rankId !== null) {
            var rank = _getRankRules().getRankById(overrides.rankId);
            if (!rank) {
                throw new Error(
                    'SettlementFactory: unknown rankId "' + overrides.rankId + '"'
                );
            }
            rankId = rank.id;
        }

        var specializationRoleId = null;
        if (overrides.specializationRoleId !== undefined && overrides.specializationRoleId !== null) {
            specializationRoleId = overrides.specializationRoleId;
        }

        var foundedYear = currentYear;
        if (_isFiniteNumber(overrides.foundedYear)) {
            foundedYear = overrides.foundedYear;
        }

        return {
            locationId: locationId,
            rankId: rankId,
            specializationRoleId: specializationRoleId,
            featureIds: [],
            wealth: 0,
            totalDebt: 0,
            taxRate: 10,
            tradeTariff: 5,
            industryTaxRate: 8,
            educationBudget: 0,
            governmentSalaryBudget: 0,
            infrastructureBudget: 0,
            militaryBudget: 0,
            educationSpending: 0,
            infrastructureSpending: 0,
            militarySpending: 0,
            budgetAllocationYear: null,
            governmentType: 'none',
            governmentStyle: null,
            governmentTypeId: null,
            justiceSeverity: 'medium',
            useReligiousLawsAsCivil: false,
            hasWatch: false,
            watchSize: 0,
            watchFounded: null,
            foundedYear: foundedYear,
            lastUpgraded: currentYear,
            // Neutral prosperity baseline input. MUST equal
            // SettlementProsperityDefinitions.BASE_PROSPERITY (currently
            // 50). See BASE PROSPERITY FIELD in the module header.
            baseProsperity: 50,
            civilLaws: [],
            demolitionHistory: []
        };
    }

    function createSettlement(locationId, overrides) {
        if (typeof locationId !== 'string' || locationId.length === 0) {
            return _failure('INVALID_LOCATION_ID', { locationId: locationId });
        }

        var place = _getPlaceQueries().getPlaceById(locationId);
        if (!place) {
            return _failure('LOCATION_NOT_FOUND', { locationId: locationId });
        }

        var existing = _getSettlementQueries().getSettlementData(locationId);
        if (existing) {
            return _failure('SETTLEMENT_ALREADY_EXISTS', { locationId: locationId });
        }

        var record;
        try {
            record = getDefaultSettlement(locationId, overrides || {});
        } catch (err) {
            return _failure('INVALID_CREATION_ARGUMENTS', {
                message: err && err.message ? err.message : String(err)
            });
        }

        var publishedEvent = _getCommit().commit(locationId, record, {
            type: 'settlementCreated',
            rankId: record.rankId,
            foundedYear: record.foundedYear
        });

        return {
            success: true,
            locationId: locationId,
            record: record,
            event: publishedEvent
        };
    }

    function ensureSettlement(locationId, overrides) {
        var existing = _getSettlementQueries().getSettlementData(locationId);
        if (existing) {
            return { success: true, created: false, record: existing, event: null };
        }

        var createResult = createSettlement(locationId, overrides);
        if (!createResult.success) {
            return {
                success: false,
                created: false,
                record: null,
                event: null,
                code: createResult.code,
                details: createResult.details
            };
        }

        return {
            success: true,
            created: true,
            record: createResult.record,
            event: createResult.event
        };
    }

    window.SettlementFactory = Object.freeze({
        getDefaultSettlement: getDefaultSettlement,
        createSettlement: createSettlement,
        ensureSettlement: ensureSettlement
    });

})();
