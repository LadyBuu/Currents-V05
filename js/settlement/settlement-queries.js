/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT QUERIES
 * js/settlement/settlement-queries.js
 * =============================================================================
 *
 * TOP-LEVEL SETTLEMENT READ LAYER.
 *
 * This file provides read-only queries over canonical settlement data and
 * its derived values. It is the single entry point for callers that need
 * to read settlement facts.
 *
 * It is a query module. It:
 *   - reads canonical settlement data
 *   - composes other query modules where appropriate
 *   - does not mutate anything
 *   - does not persist
 *   - does not create settlement records
 *   - does not display UI
 *   - does not fabricate missing values
 *   - does not use recursion guards
 *
 * Contract reference: Settlement Architecture Contracts §6 (Settlement
 * State Contract), §10 (Query Contract), §11 (Query Results and Missing
 * Data), §32 (Completion Standard).
 *
 * Scope discipline:
 *
 *   This module reads canonical settlement data. It does NOT own
 *   definitions, rules, calculations, foreign-domain facts, or
 *   presentation. Where those are needed, this module calls the owning
 *   module's query API. In particular:
 *
 *     - Rank data         -> SettlementRankQueries
 *     - Fiscal limits     -> SettlementFiscalDefinitions (definitions)
 *     - Foreign domains   -> their respective queries (Population,
 *                            Religion, Industry, Character, Place)
 *
 *   It does not implement its own version of any of those queries.
 *
 * Canonical storage access:
 *
 *   Canonical settlement data is stored at
 *   masterData.data.settlementData[locationId]. This module reads it
 *   directly. It does not go through SettlementState for reads, because
 *   State is a derived index and subscription layer, not the owner of
 *   canonical data. If in the future canonical storage is moved behind a
 *   dedicated accessor, this module will call that accessor instead.
 *
 * Missing data:
 *
 *   A missing settlement record returns null. It does not return a
 *   fabricated default. A settlement that exists is always returned as
 *   the canonical object; callers must not mutate it. If they need to
 *   modify it, they go through a command.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. CANONICAL STORAGE ACCESS
    // =========================================================================

    function _getCanonicalStore() {
        if (!window.masterData || !window.masterData.data) return null;
        return window.masterData.data.settlementData || null;
    }

    // =========================================================================
    // 2. BASIC SETTLEMENT READS
    // =========================================================================

    /**
     * Returns the canonical settlement record for a location, or null if
     * no settlement exists there.
     *
     * The returned object is canonical. Callers must not mutate it.
     *
     * @param {string} locationId
     * @returns {Object|null}
     */
    function getSettlementData(locationId) {
        if (locationId === null || locationId === undefined) return null;
        var store = _getCanonicalStore();
        if (!store) return null;
        return store[locationId] || null;
    }

    /**
     * Returns true if a settlement exists for the given location.
     * @param {string} locationId
     * @returns {boolean}
     */
    function hasSettlement(locationId) {
        return getSettlementData(locationId) !== null;
    }

    /**
     * Returns all settlement records as an array of { locationId, data }
     * entries, in an unspecified order. Consumers that need an ordering
     * apply it themselves or use the sort options below.
     *
     * @returns {Array<{ locationId: string, data: Object }>}
     */
    function getAllSettlements() {
        var store = _getCanonicalStore();
        if (!store) return [];
        var result = [];
        for (var id in store) {
            if (!Object.prototype.hasOwnProperty.call(store, id)) continue;
            var data = store[id];
            if (!data) continue;
            result.push({ locationId: id, data: data });
        }
        return result;
    }

    /**
     * Returns the number of settlement records.
     * @returns {number}
     */
    function getSettlementCount() {
        var store = _getCanonicalStore();
        if (!store) return 0;
        var count = 0;
        for (var id in store) {
            if (Object.prototype.hasOwnProperty.call(store, id) && store[id]) {
                count++;
            }
        }
        return count;
    }

    // =========================================================================
    // 3. FEATURE IDS (canonical read only)
    // =========================================================================
    //
    // Settlement features are referenced by id in `settlement.featureIds`.
    // The feature definitions themselves are owned by
    // SettlementFeatureDefinitions. This module returns the ids; the
    // caller resolves them against the definitions if it needs details.
    //

    /**
     * Returns the settlement's feature id list, or an empty array if the
     * settlement has none. Returns null if the settlement does not exist.
     *
     * @param {string} locationId
     * @returns {string[]|null}
     */
    function getFeatureIds(locationId) {
        var settlement = getSettlementData(locationId);
        if (!settlement) return null;
        if (!settlement.featureIds) return [];
        return settlement.featureIds;
    }

    // =========================================================================
    // 4. BASIC POLICY READS
    // =========================================================================
    //
    // These queries return the raw canonical values. They do not apply
    // defaults and do not clamp. If a required field is missing from the
    // canonical record, that is a data integrity problem and is reported
    // as null. Callers that need to distinguish "missing" from "zero" can
    // inspect the returned value directly.
    //

    function getTaxRate(locationId) {
        var s = getSettlementData(locationId);
        return s ? s.taxRate : null;
    }

    function getTradeTariff(locationId) {
        var s = getSettlementData(locationId);
        return s ? s.tradeTariff : null;
    }

    function getIndustryTaxRate(locationId) {
        var s = getSettlementData(locationId);
        return s ? s.industryTaxRate : null;
    }

    function getWealth(locationId) {
        var s = getSettlementData(locationId);
        return s ? s.wealth : null;
    }

    function getTotalDebt(locationId) {
        var s = getSettlementData(locationId);
        return s ? s.totalDebt : null;
    }

    function getRankId(locationId) {
        var s = getSettlementData(locationId);
        return s ? s.rankId : null;
    }

    function getSpecializationRoleId(locationId) {
        var s = getSettlementData(locationId);
        return s ? s.specializationRoleId : null;
    }

    function getGovernmentType(locationId) {
        var s = getSettlementData(locationId);
        return s ? s.governmentType : null;
    }

    function getJusticeSeverity(locationId) {
        var s = getSettlementData(locationId);
        return s ? s.justiceSeverity : null;
    }

    function getUseReligiousLawsAsCivil(locationId) {
        var s = getSettlementData(locationId);
        return s ? s.useReligiousLawsAsCivil : null;
    }

    function getHasWatch(locationId) {
        var s = getSettlementData(locationId);
        return s ? s.hasWatch : null;
    }

    function getWatchSize(locationId) {
        var s = getSettlementData(locationId);
        return s ? s.watchSize : null;
    }

    // =========================================================================
    // 5. BUDGET ALLOCATION READS
    // =========================================================================

    function getBudgetAllocation(locationId) {
        var s = getSettlementData(locationId);
        if (!s) return null;
        return {
            educationBudget: s.educationBudget === undefined ? null : s.educationBudget,
            governmentSalaryBudget: s.governmentSalaryBudget === undefined ? null : s.governmentSalaryBudget,
            infrastructureBudget: s.infrastructureBudget === undefined ? null : s.infrastructureBudget,
            militaryBudget: s.militaryBudget === undefined ? null : s.militaryBudget,
            budgetAllocationYear: s.budgetAllocationYear === undefined ? null : s.budgetAllocationYear
        };
    }

    function getEducationBudget(locationId) {
        var s = getSettlementData(locationId);
        return s ? (s.educationBudget === undefined ? null : s.educationBudget) : null;
    }

    function getGovernmentSalaryBudget(locationId) {
        var s = getSettlementData(locationId);
        return s ? (s.governmentSalaryBudget === undefined ? null : s.governmentSalaryBudget) : null;
    }

    // =========================================================================
    // 6. COMPOSED QUERIES
    // =========================================================================
    //
    // These compose other query modules. They do not reimplement the
    // foreign-domain logic. When a required foreign query is unavailable,
    // the call throws, which is an application initialization error.
    //

    /**
     * Returns the current rank definition for a settlement, or null if
     * the settlement does not exist or the rank id is unknown.
     *
     * Delegates to SettlementRankQueries.
     *
     * @param {string} locationId
     * @returns {Object|null}
     */
    function getCurrentRank(locationId) {
        return window.SettlementRankQueries.getCurrentRank(locationId);
    }

    // =========================================================================
    // 7. EXPORTS
    // =========================================================================

    window.SettlementQueries = Object.freeze({
        // Basic
        getSettlementData: getSettlementData,
        hasSettlement: hasSettlement,
        getAllSettlements: getAllSettlements,
        getSettlementCount: getSettlementCount,

        // Features (ids only)
        getFeatureIds: getFeatureIds,

        // Policy reads
        getTaxRate: getTaxRate,
        getTradeTariff: getTradeTariff,
        getIndustryTaxRate: getIndustryTaxRate,
        getWealth: getWealth,
        getTotalDebt: getTotalDebt,
        getRankId: getRankId,
        getSpecializationRoleId: getSpecializationRoleId,
        getGovernmentType: getGovernmentType,
        getJusticeSeverity: getJusticeSeverity,
        getUseReligiousLawsAsCivil: getUseReligiousLawsAsCivil,
        getHasWatch: getHasWatch,
        getWatchSize: getWatchSize,

        // Budget allocation
        getBudgetAllocation: getBudgetAllocation,
        getEducationBudget: getEducationBudget,
        getGovernmentSalaryBudget: getGovernmentSalaryBudget,

        // Composed
        getCurrentRank: getCurrentRank
    });

})();
