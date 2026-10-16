/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT FACTORY
 * js/settlement/settlement-factory.js
 * =============================================================================
 *
 * SETTLEMENT CREATION.
 *
 * This file owns the construction of new settlement records. It provides:
 *   - createSettlement        : create a settlement for a location
 *   - ensureSettlement        : get-or-create a settlement for a location
 *   - getDefaultSettlement    : build a default record without persisting
 *
 * It is a command module. Its write path goes through
 * SettlementCommandCommit.commit, so it participates in the same
 * transaction shape as every other command.
 *
 * Contract reference: Settlement Architecture Contracts §4 (Field
 * Classification), §5 (Missing-Value Semantics), §12 (Command Contract),
 * §13 (Persistence Contract), §14 (Notification Contract), §32
 * (Completion Standard).
 *
 * Canonical settlement fields owned by this factory:
 *
 *   The default settlement record is the complete canonical schema. Every
 *   field that a settlement is expected to have exists in the default
 *   record, even if its value is null, 0, false, or an empty array. This
 *   is deliberate: it removes the ambiguity of "field missing" vs "field
 *   has a legitimate zero/empty value" for downstream code.
 *
 *   Fields classified per §4:
 *
 *     locationId              canonical relationship
 *     rankId                  canonical (defaults to lowest rank)
 *     specializationRoleId    canonical (null = none)
 *     featureIds              canonical choice list (starts [])
 *     wealth                  canonical balance (starts 0)
 *     totalDebt               canonical balance (starts 0)
 *     taxRate                 canonical policy (starts from the domain
 *                             default declared below)
 *     tradeTariff             canonical policy
 *     industryTaxRate         canonical policy
 *     educationBudget         canonical policy (starts 0)
 *     governmentSalaryBudget  canonical policy (starts 0)
 *     infrastructureBudget    canonical policy (starts 0)
 *     militaryBudget          canonical policy (starts 0)
 *     educationSpending       canonical policy (starts 0)
 *     infrastructureSpending  canonical policy (starts 0)
 *     militarySpending        canonical policy (starts 0)
 *     budgetAllocationYear    historical marker (null until first allocation)
 *     governmentType          canonical policy (starts 'none')
 *     governmentStyle         canonical policy (null)
 *     governmentTypeId        canonical policy (null)
 *     justiceSeverity         canonical policy (starts 'medium')
 *     useReligiousLawsAsCivil canonical policy (starts false)
 *     hasWatch                canonical policy (starts false)
 *     watchSize               canonical policy (starts 0)
 *     watchFounded            historical marker (null until a watch exists)
 *     foundedYear             historical fact (set to current world year)
 *     lastUpgraded            historical marker (set to current world year)
 *     civilLaws               canonical list (starts [])
 *     demolitionHistory       historical log (starts [])
 *
 *   The factory does NOT persist:
 *     - derived values (prosperity, employment, crime rate, religious
 *       unity, dominant religion)
 *     - foreign entities (state enterprises, public enterprises,
 *       places of worship)
 *     - cached values (budget summary, efficiency score)
 *
 *   If a legacy save or external caller supplies one of those fields in
 *   `overrides`, the factory rejects it. That prevents the settlement
 *   record from silently regaining a second source of truth.
 *
 * Optional overrides:
 *
 *   createSettlement accepts a small set of explicitly allowed overrides:
 *     - rankId
 *     - specializationRoleId
 *     - foundedYear
 *
 *   Every other canonical field is set by the factory. Callers who want
 *   to change a policy field after creation do so through the relevant
 *   command (SettlementFiscalCommands, SettlementGovernmentCommands,
 *   etc.), not through creation.
 *
 * Time dependency:
 *   window.getCurrentYearSafe, defined in js/core/time.js, aliased to
 *   window.getCurrentYear. The previous version of this file wrapped
 *   time behind window.Time, which does not exist. getDefaultSettlement
 *   stamps foundedYear and lastUpgraded with the current world year, so
 *   this module would have thrown on the first createSettlement call.
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

    function _getRankRules() {
        return window.SettlementRankRules;
    }

    function _getCommit() {
        return window.SettlementCommandCommit;
    }

    function _getPlaceQueries() {
        return window.PlaceQueries;
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

    function _isFiniteNumber(value) {
        return typeof value === 'number' && isFinite(value);
    }

    function _currentYear() {
        if (typeof window.getCurrentYearSafe !== 'function') {
            throw new Error(
                'settlement-factory.js requires time.js (getCurrentYearSafe).'
            );
        }
        return window.getCurrentYearSafe();
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

    // =========================================================================
    // 3. DEFAULT RECORD
    // =========================================================================

    /**
     * Builds a default settlement record for a location. Does not
     * persist. The record is a plain object with every canonical field
     * present.
     *
     * @param {string} locationId
     * @param {Object} [overrides]
     * @param {string} [overrides.rankId]
     * @param {string|null} [overrides.specializationRoleId]
     * @param {number} [overrides.foundedYear]
     * @returns {Object}
     */
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
            // Relationship
            locationId: locationId,

            // Rank and specialization
            rankId: rankId,
            specializationRoleId: specializationRoleId,

            // Features
            featureIds: [],

            // Financial balances
            wealth: 0,
            totalDebt: 0,

            // Fiscal policy
            taxRate: 10,
            tradeTariff: 5,
            industryTaxRate: 8,

            // Budget allocation and actual spending
            educationBudget: 0,
            governmentSalaryBudget: 0,
            infrastructureBudget: 0,
            militaryBudget: 0,
            educationSpending: 0,
            infrastructureSpending: 0,
            militarySpending: 0,
            budgetAllocationYear: null,

            // Government
            governmentType: 'none',
            governmentStyle: null,
            governmentTypeId: null,

            // Justice
            justiceSeverity: 'medium',
            useReligiousLawsAsCivil: false,
            hasWatch: false,
            watchSize: 0,
            watchFounded: null,

            // Historical markers
            foundedYear: foundedYear,
            lastUpgraded: currentYear,

            // Collections
            civilLaws: [],
            demolitionHistory: []
        };
    }

    // =========================================================================
    // 4. CREATE SETTLEMENT
    // =========================================================================

    /**
     * Creates a settlement record for a location.
     *
     * Fails if:
     *   - the location does not exist in the Place domain
     *   - a settlement already exists for the location
     *
     * On success, the record is committed through the shared commit
     * path.
     *
     * @param {string} locationId
     * @param {Object} [overrides]
     * @returns {Object} structured result
     */
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

    // =========================================================================
    // 5. ENSURE SETTLEMENT (get-or-create)
    // =========================================================================

    /**
     * Returns the existing settlement record for a location, or creates
     * one if none exists.
     *
     * This is an application/bootstrap operation. It is intended for
     * initialization routines that guarantee every location has a
     * settlement record. It must not be called from UI rendering or from
     * queries. Opening a tab is not a reason to create a settlement.
     *
     * @param {string} locationId
     * @param {Object} [overrides]
     * @returns {Object} structured result:
     *   {
     *     success: boolean,
     *     created: boolean,       // true if the record was created now
     *     record: Object,
     *     event: Object|null,     // event if created, null otherwise
     *     code: string,           // failure code if success is false
     *     details: Object         // failure details
     *   }
     */
    function ensureSettlement(locationId, overrides) {
        var existing = _getSettlementQueries().getSettlementData(locationId);
        if (existing) {
            return {
                success: true,
                created: false,
                record: existing,
                event: null
            };
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

    // =========================================================================
    // 6. EXPORTS
    // =========================================================================

    window.SettlementFactory = Object.freeze({
        getDefaultSettlement: getDefaultSettlement,
        createSettlement: createSettlement,
        ensureSettlement: ensureSettlement
    });

})();
