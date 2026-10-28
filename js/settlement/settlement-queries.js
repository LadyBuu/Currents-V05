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
 * SETTLEMENT DATA ACCESS CONTRACT:
 *
 *   Different reads need different reference semantics. This module
 *   exposes three tiers, each documented at the call site:
 *
 *   1. LIVE CANONICAL RECORD (getSettlementData)
 *
 *      Returns the exact object stored at
 *      masterData.data.settlementData[locationId], or null.
 *
 *      This is the CANONICAL ACCESSOR for commands and internal query
 *      composition. Every command that needs to build a candidate
 *      record reads through this method, clones with its own
 *      _copyWith helper, mutates the clone, and hands the clone to
 *      SettlementCommandCommit.commit. Because commit REPLACES the
 *      record with the candidate, the live reference the command read
 *      is never mutated in place.
 *
 *      Callers that are NOT commands should not mutate the returned
 *      object. The object is canonical. A mutation here is a bug; the
 *      canonical record is not a scratchpad.
 *
 *   2. SHALLOW COPY (getAllSettlements)
 *
 *      Returns [{ locationId, data }, ...] where each `data` is a
 *      shallow copy of the canonical settlement record. Nested
 *      arrays (annualHistory, civilLaws, demolitionHistory, featureIds)
 *      are NOT deep-cloned. The copy is safe for consumers that
 *      replace scalar fields (wealth, taxRate, etc.) or append to
 *      arrays without sharing them; it is NOT safe for consumers that
 *      mutate a nested array in place.
 *
 *      The reasoning: the annual processor and the ViewModels both
 *      build their own candidates before committing. The shallow
 *      copy is exactly the boundary those callers need, without the
 *      cost of a full deep clone of every settlement for a batch
 *      read. If a future consumer needs full isolation, it clones the
 *      nested fields itself, or reads getSettlementData and clones.
 *
 *   3. PRIMITIVE / CLONE (all other reads)
 *
 *      getFeatureIds returns a defensive slice of the canonical id
 *      array. Scalar reads (getTaxRate, getWealth, etc.) return the
 *      primitive value directly. getBudgetAllocation constructs a
 *      fresh object from the canonical scalars. getCurrentRank
 *      delegates to SettlementRankQueries and returns whatever that
 *      query returns.
 *
 *   The rule: mutate nothing. Live and shallow-copy reads are
 *   optimizations for trusted callers, not licenses to write. If a
 *   mutation is needed, go through a command.
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
 *   either the live canonical object (getSettlementData) or a shallow
 *   copy of it (getAllSettlements). If callers need to modify it, they
 *   go through a command.
 *
 * TIME DEPENDENCY:
 *
 *   No function in this module reads window.getCurrentYear directly.
 *   The two facts that depend on the clock are:
 *
 *     - settlement.budgetAllocationYear (a stored canonical field —
 *       read verbatim by getBudgetAllocation; the caller compares
 *       it against getCurrentYear as needed);
 *
 *     - the upgrade eligibility computation (delegated to
 *       SettlementRankQueries.getUpgradeStatus, which composes
 *       prosperity via SettlementProsperityQueries.getProsperityValue,
 *       and thus indirectly reads the clock).
 *
 *   When the year transition lands, the only file in this module's
 *   transitive dependency graph that needs an explicit year is
 *   SettlementProsperityQueries.getProsperity (via the leader tenure
 *   bonus). If that function gains an options.year parameter, this
 *   module's getCurrentRank and getUpgradeStatus get it for free
 *   because they delegate. This module itself does not need a year
 *   parameter, because every fact it exposes is either year-agnostic
 *   (wealth, taxRate, featureIds) or a stored year (budgetAllocationYear)
 *   that the caller interprets against its own clock.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - getAllSettlements now returns SHALLOW COPIES of the canonical
 *       settlement records. The prior revision returned
 *       [{ locationId, data }, ...] where `data` was the live
 *       canonical object. A consumer that mutated a scalar field
 *       (e.g. annual processor's _copyWith, which the current
 *       implementation correctly avoids doing) would have silently
 *       corrupted canonical data. The shallow copy makes the standard
 *       "read then build candidate" pattern safe without a deep
 *       clone per settlement.
 *     - getFeatureIds now returns a defensive slice of the canonical
 *       feature-id array. The prior revision returned the live array,
 *       so a caller that pushed to or spliced it mutated canonical
 *       state.
 *     - Header SETTLEMENT DATA ACCESS CONTRACT section added,
 *       documenting the three reference tiers (live, shallow copy,
 *       primitive/clone) and which methods use which.
 *     - Header TIME DEPENDENCY section added, documenting that this
 *       module reads no clock directly and that the year-transition
 *       integration point is SettlementProsperityQueries (via the
 *       leader tenure bonus).
 *     - No public signature change. getAllSettlements and getFeatureIds
 *       return the same shapes; only the reference identity of the
 *       returned records changed.
 *   Previous revisions:
 *     - Initial implementation.
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

    /**
     * Shallow-copies a settlement record. Scalars are copied by value;
     * nested arrays and objects are copied by REFERENCE (not deep-cloned).
     *
     * See SETTLEMENT DATA ACCESS CONTRACT in the module header for the
     * reasoning and the mutation rules that follow from it.
     *
     * @private
     * @param {Object} record
     * @returns {Object}
     */
    function _shallowCopyRecord(record) {
        if (!record || typeof record !== 'object') return record;
        var copy = {};
        for (var key in record) {
            if (!Object.prototype.hasOwnProperty.call(record, key)) continue;
            copy[key] = record[key];
        }
        return copy;
    }

    // =========================================================================
    // 2. BASIC SETTLEMENT READS
    // =========================================================================

    /**
     * Returns the canonical settlement record for a location, or null if
     * no settlement exists there.
     *
     * The returned object is LIVE. Commands and internal query
     * composition read through this method and then build a separate
     * candidate before committing. Callers that are not commands must
     * not mutate it.
     *
     * See SETTLEMENT DATA ACCESS CONTRACT in the module header.
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
     * Returns all settlement records as an array of
     * { locationId, data } entries, in an unspecified order.
     *
     * Each `data` is a SHALLOW COPY of the canonical record. Scalars
     * are independent; nested arrays and objects are shared with the
     * canonical record. See SETTLEMENT DATA ACCESS CONTRACT in the
     * module header.
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
            result.push({
                locationId: id,
                data: _shallowCopyRecord(data)
            });
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
     * Returns the settlement's feature id list as a defensive copy, or
     * an empty array if the settlement has none. Returns null if the
     * settlement does not exist.
     *
     * The returned array is a NEW array. Mutating it does not affect
     * canonical state.
     *
     * @param {string} locationId
     * @returns {string[]|null}
     */
    function getFeatureIds(locationId) {
        var settlement = getSettlementData(locationId);
        if (!settlement) return null;
        if (!Array.isArray(settlement.featureIds)) return [];
        return settlement.featureIds.slice();
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

    /**
     * Returns a fresh object summarizing the settlement's budget
     * allocation fields, or null when the settlement does not exist.
     *
     * Every field is a primitive. The returned object is safe to
     * mutate.
     *
     * @param {string} locationId
     * @returns {Object|null}
     */
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

        // Features (ids only, defensive copy)
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
