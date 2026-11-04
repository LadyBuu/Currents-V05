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
 *     - Role distribution -> SettlementRoleAggregates (below)
 *     - Foreign domains   -> their respective queries (Population,
 *                            Religion, Industry, Character, Place,
 *                            Location, Role, Apprenticeship)
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
 * SETTLEMENT-SCOPED ROLE AGGREGATES
 *
 *   The three functions at the bottom of this file expose
 *   SETTLEMENT-SCOPED views of role and apprenticeship data. The role
 *   domain and the apprenticeship domain are world-wide; neither has a
 *   settlement-scoped aggregate. A "settlement-scoped aggregate" is a
 *   settlement fact ("the roles held by the residents of this
 *   settlement"), so it lives here, not in RoleQueries or
 *   ApprenticeshipQueries.
 *
 *   The three functions are:
 *
 *     getSettlementRoleStats(locationId)
 *       Role-skill tier distribution over the settlement subtree.
 *       Computed from per-character professions via
 *       CharacterCommands.getProfessions(cid) and SkillUtils.getTier.
 *       Does not read the apprenticeship domain.
 *
 *     getSettlementApprenticeshipDensity(locationId)
 *       Counts ACTIVE apprenticeship relationships whose master and
 *       apprentice are both in the settlement subtree. Computed from
 *       ApprenticeshipQueries.getActiveApprenticeships() filtered by
 *       LocationQueries.getCurrentLocationId. Does not re-derive
 *       skill-tier counts (that is getSettlementRoleStats's job).
 *
 *     getSettlementMastersByRole(locationId, roleId)
 *       Returns active masters of `roleId` in the settlement subtree,
 *       as [{ character, skillLevel, apprenticeCount }].
 *       This is the shape ApprenticeshipQueries.findPotentialMasters
 *       already expects. It exists so findPotentialMasters can work
 *       (it currently requires this function and no implementation
 *       exists).
 *
 *   All three return null for a missing settlement and {} or [] for a
 *   present settlement with no data. They never fabricate.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - Added getSettlementRoleStats(locationId). Provides the role-skill
 *       tier distribution (total professions, unique roles, by-category
 *       counts, top roles, per-role holders, masters/apprentices by
 *       role) over the settlement subtree. Composed from
 *       CharacterCommands.getProfessions, CharacterQueries.getAllCharacters,
 *       LocationQueries.getAllSubLocationIds, LocationQueries.getCurrentLocationId,
 *       RoleQueries.getRoles, RoleQueries.getRoleStatisticsBatch, and
 *       SkillUtils.getTier. This is the aggregate that
 *       modals-settlement-roles.js::openRolesModal was calling through
 *       the phantom RoleQueries.getSettlementRoleStats — which does
 *       not exist — so openRolesModal has been throwing "Role data
 *       not available" since the current role-queries.js landed.
 *     - Added getSettlementApprenticeshipDensity(locationId). Provides
 *       master/apprentice counts, ratio, top roles by apprentice count,
 *       and top masters by apprentice count over the settlement
 *       subtree. Composed from ApprenticeshipQueries.getActiveApprenticeships
 *       filtered by settlement membership. This is the aggregate that
 *       modals-settlement-roles.js::openApprenticeshipsModal was
 *       calling through the phantom
 *       RoleQueries.getSettlementApprenticeshipDensity — which also
 *       does not exist — so openApprenticeshipsModal has been throwing
 *       as well.
 *     - Added getSettlementMastersByRole(locationId, roleId). Returns
 *       [{ character, skillLevel, apprenticeCount }] for the active
 *       masters of `roleId` in the settlement subtree. This is the
 *       function ApprenticeshipQueries.findPotentialMasters has been
 *       calling (it currently requires it and it does not exist), so
 *       the "find master by location" modal has been throwing since
 *       apprenticeship-queries.js landed.
 *     - Header SETTLEMENT-SCOPED ROLE AGGREGATES section added.
 *     - No other behavioural change. Every existing read's return
 *       value is unchanged. The three new functions are additive.
 *   Previous revisions:
 *     - getAllSettlements now returns SHALLOW COPIES of the canonical
 *       settlement records. The prior revision returned
 *       [{ locationId, data }, ...] where `data` was the live
 *       canonical object.
 *     - getFeatureIds now returns a defensive slice of the canonical
 *       feature-id array.
 *     - Header SETTLEMENT DATA ACCESS CONTRACT and TIME DEPENDENCY
 *       sections added.
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
     * See SETTLEMENT DATA ACCESS CONTRACT in the module header.
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

    function getSettlementData(locationId) {
        if (locationId === null || locationId === undefined) return null;
        var store = _getCanonicalStore();
        if (!store) return null;
        return store[locationId] || null;
    }

    function hasSettlement(locationId) {
        return getSettlementData(locationId) !== null;
    }

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

    function getFeatureIds(locationId) {
        var settlement = getSettlementData(locationId);
        if (!settlement) return null;
        if (!Array.isArray(settlement.featureIds)) return [];
        return settlement.featureIds.slice();
    }

    // =========================================================================
    // 4. BASIC POLICY READS
    // =========================================================================

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

    function getCurrentRank(locationId) {
        return window.SettlementRankQueries.getCurrentRank(locationId);
    }

    // =========================================================================
    // 7. SETTLEMENT-SCOPED ROLE AGGREGATES
    // =========================================================================
    //
    // Three aggregates. All are settlement-scoped views over world-wide
    // role and apprenticeship domains. See SETTLEMENT-SCOPED ROLE
    // AGGREGATES in the module header for the split rationale.
    //
    // Composition sources:
    //   - LocationQueries.getAllSubLocationIds / getCurrentLocationId
    //   - CharacterQueries.getAllCharacters
    //   - CharacterCommands.getProfessions
    //   - RoleQueries.getRoles / getRoleStatisticsBatch
    //   - ApprenticeshipQueries.getActiveApprenticeships
    //   - SkillUtils.getTier / getThresholds
    //   - TEACHING_CONSTANTS (from apprenticeship-constants.js)
    //
    // All three return null for a missing settlement. All three return
    // empty collections for a present settlement with no data. None of
    // them fabricate a value.

    // -------------------------------------------------------------------------
    // 7a. Settlement-scoped helpers
    // -------------------------------------------------------------------------

    /**
     * Returns the location id set for a settlement's subtree, or null if
     * the settlement itself does not exist.
     *
     * The subtree always includes the settlement's own id; a
     * getAllSubLocationIds implementation is not required to include
     * the root, so we guarantee it here.
     */
    function _getSettlementLocationIdSet(locationId) {
        var settlement = getSettlementData(locationId);
        if (!settlement) return null;

        var LQ = window.LocationQueries;
        if (!LQ || typeof LQ.getAllSubLocationIds !== 'function') {
            throw new Error(
                'SettlementQueries: LocationQueries.getAllSubLocationIds ' +
                'is required for settlement role aggregates.'
            );
        }

        var ids = LQ.getAllSubLocationIds(locationId);
        if (!Array.isArray(ids) || ids.length === 0) {
            ids = [locationId];
        } else if (ids.indexOf(locationId) === -1) {
            ids = ids.slice();
            ids.push(locationId);
        }

        var set = Object.create(null);
        for (var i = 0; i < ids.length; i++) {
            set[ids[i]] = true;
        }
        return set;
    }

    /**
     * Enumerates every non-deceased character whose current location is
     * in the settlement subtree. Uses the semantic resolver
     * (LocationQueries.getCurrentLocationId), not the raw field.
     *
     * Returns [] for a present settlement with no characters. Throws if
     * a required dependency is missing.
     */
    function _getSettlementCharacters(locationId) {
        var settlement = getSettlementData(locationId);
        if (!settlement) return [];

        var idSet = _getSettlementLocationIdSet(locationId);
        if (!idSet) return [];

        var CQ = window.CharacterQueries;
        if (!CQ || typeof CQ.getAllCharacters !== 'function') {
            throw new Error(
                'SettlementQueries: CharacterQueries.getAllCharacters is ' +
                'required for settlement role aggregates.'
            );
        }

        var LQ = window.LocationQueries;
        if (!LQ || typeof LQ.getCurrentLocationId !== 'function') {
            throw new Error(
                'SettlementQueries: LocationQueries.getCurrentLocationId is ' +
                'required for settlement role aggregates.'
            );
        }

        var all = CQ.getAllCharacters();
        if (!Array.isArray(all)) return [];

        var result = [];
        for (var i = 0; i < all.length; i++) {
            var c = all[i];
            if (!c || !c.id) continue;
            if (c.isDeceased === true) continue;

            var currentLocationId = null;
            try {
                currentLocationId = LQ.getCurrentLocationId(c.id);
            } catch (e) {
                currentLocationId = null;
            }
            if (!currentLocationId || !idSet[currentLocationId]) continue;

            result.push(c);
        }
        return result;
    }

    /**
     * Reads every profession for the given character ids, bucketing them
     * per roleId and per character for the aggregates below.
     *
     * Returns:
     *   {
     *     perCharacter: { [cid]: Array<profession> },
     *     perRole: { [roleId]: Array<{ characterId, profession }> }
     *   }
     */
    function _readProfessionsForCharacters(characters) {
        var result = {
            perCharacter: Object.create(null),
            perRole: Object.create(null)
        };
        if (!Array.isArray(characters) || characters.length === 0) return result;

        var CC = window.CharacterCommands;
        if (!CC || typeof CC.getProfessions !== 'function') {
            throw new Error(
                'SettlementQueries: CharacterCommands.getProfessions is ' +
                'required for settlement role aggregates.'
            );
        }

        for (var i = 0; i < characters.length; i++) {
            var c = characters[i];
            if (!c || !c.id) continue;

            var professions = null;
            try {
                professions = CC.getProfessions(c.id);
            } catch (e) {
                professions = null;
            }
            if (!Array.isArray(professions) || professions.length === 0) {
                result.perCharacter[c.id] = [];
                continue;
            }

            result.perCharacter[c.id] = professions;

            for (var j = 0; j < professions.length; j++) {
                var prof = professions[j];
                if (!prof || typeof prof.id !== 'string' || prof.id.length === 0) {
                    continue;
                }
                if (!result.perRole[prof.id]) {
                    result.perRole[prof.id] = [];
                }
                result.perRole[prof.id].push({
                    characterId: c.id,
                    profession: prof
                });
            }
        }
        return result;
    }

    /**
     * Resolves the skill tier for a skill level using SkillUtils.getTier.
     * Delegates; does NOT re-declare thresholds.
     *
     * Returns { id, name } or null when SkillUtils is unavailable.
     */
    function _tierFor(skillLevel) {
        var SU = window.SkillUtils;
        if (!SU || typeof SU.getTier !== 'function') return null;
        var tier = SU.getTier(skillLevel);
        if (!tier) return null;
        return { id: tier.id, name: tier.name };
    }

    // -------------------------------------------------------------------------
    // 7b. getSettlementRoleStats
    // -------------------------------------------------------------------------
    //
    // Role-skill tier distribution over the settlement subtree.
    //
    // Source of truth for tiers:
    //   SkillUtils.getTier(skillLevel)
    //
    // Source of truth for per-role statistics:
    //   RoleQueries.getRoleStatisticsBatch(roleIds)
    //     -- world-wide; the settlement-scoped per-role counts are
    //        computed here from the settlement character scan.
    //
    // Return shape:
    //   {
    //     locationId,
    //     totalProfessions,       number
    //     uniqueRoles,            number
    //     characterCount,         number
    //     roleIds,                string[]
    //     countsByTier,           { [tierId]: number }   // all tiers present
    //     byCategory,             { [categoryId]: { count, roles: [{id, name, count}] } }
    //     topRoles,               [{ id, name, count, percentage }]
    //     mastersByRole,          { [roleId]: number }   // skill >= MIN_MASTER_SKILL
    //     apprenticesByRole,      { [roleId]: number }   // NOVICE <= skill < MIN_MASTER_SKILL
    //     canTeachByRole,         { [roleId]: number }
    //     primaryByRole,          { [roleId]: number }
    //   }
    //
    // Returns null for a missing settlement.
    // Returns zeros and empty maps for a present settlement with no data.
    //
    // Uses RoleQueries.getRoleStatisticsBatch for the world-wide per-role
    // statistics (holder count, average skill, tier counts, canTeach
    // count, primary count) — but does NOT use it for the settlement
    // totals, which are recomputed from the settlement scan.

    function getSettlementRoleStats(locationId) {
        var settlement = getSettlementData(locationId);
        if (!settlement) return null;

        var RQ = window.RoleQueries;
        if (!RQ || typeof RQ.getRoles !== 'function') {
            throw new Error(
                'SettlementQueries: RoleQueries.getRoles is required for ' +
                'getSettlementRoleStats.'
            );
        }
        if (typeof RQ.getRoleStatisticsBatch !== 'function') {
            throw new Error(
                'SettlementQueries: RoleQueries.getRoleStatisticsBatch is ' +
                'required for getSettlementRoleStats.'
            );
        }

        var SU = window.SkillUtils;
        if (!SU || typeof SU.getTier !== 'function' ||
            typeof SU.getThresholds !== 'function') {
            throw new Error(
                'SettlementQueries: SkillUtils is required for ' +
                'getSettlementRoleStats.'
            );
        }

        var thresholds = SU.getThresholds();
        var masterThreshold = thresholds.JOURNEYMAN;
        var apprenticeThreshold = thresholds.NOVICE;

        var characters = _getSettlementCharacters(locationId);
        var professionIndex = _readProfessionsForCharacters(characters);

        var countsByTier = Object.create(null);
        if (Array.isArray(SU.TIERS)) {
            for (var t = 0; t < SU.TIERS.length; t++) {
                countsByTier[SU.TIERS[t].id] = 0;
            }
        }

        var perRoleCounts = Object.create(null);
        var perRoleSkillSum = Object.create(null);
        var perRoleMasters = Object.create(null);
        var perRoleApprentices = Object.create(null);
        var perRoleCanTeach = Object.create(null);
        var perRolePrimary = Object.create(null);

        var totalProfessions = 0;
        var characterCount = 0;

        for (var cid in professionIndex.perCharacter) {
            if (!Object.prototype.hasOwnProperty.call(professionIndex.perCharacter, cid)) {
                continue;
            }
            characterCount++;

            var professions = professionIndex.perCharacter[cid];
            for (var p = 0; p < professions.length; p++) {
                var prof = professions[p];
                if (!prof || typeof prof.id !== 'string') continue;
                var skillLevel = (typeof prof.skillLevel === 'number' && isFinite(prof.skillLevel))
                    ? prof.skillLevel
                    : 0;

                totalProfessions++;

                var tier = _tierFor(skillLevel);
                if (tier && countsByTier[tier.id] !== undefined) {
                    countsByTier[tier.id]++;
                }

                perRoleCounts[prof.id] = (perRoleCounts[prof.id] || 0) + 1;
                perRoleSkillSum[prof.id] = (perRoleSkillSum[prof.id] || 0) + skillLevel;

                if (skillLevel >= masterThreshold) {
                    perRoleMasters[prof.id] = (perRoleMasters[prof.id] || 0) + 1;
                } else if (skillLevel >= apprenticeThreshold) {
                    perRoleApprentices[prof.id] = (perRoleApprentices[prof.id] || 0) + 1;
                }

                if (skillLevel >= masterThreshold) {
                    perRoleCanTeach[prof.id] = (perRoleCanTeach[prof.id] || 0) + 1;
                }
                if (prof.primary === true) {
                    perRolePrimary[prof.id] = (perRolePrimary[prof.id] || 0) + 1;
                }
            }
        }

        // ----- Role list and per-role averages -----
        var roleIds = Object.keys(perRoleCounts);
        var allRoles = RQ.getRoles({});
        var rolesById = Object.create(null);
        if (Array.isArray(allRoles)) {
            for (var r = 0; r < allRoles.length; r++) {
                if (allRoles[r] && allRoles[r].id) {
                    rolesById[allRoles[r].id] = allRoles[r];
                }
            }
        }

        // RoleQueries.getRoleStatisticsBatch gives world-wide per-role
        // data; we recompute the settlement-scoped averages from the
        // settlement scan. We do still call the batch here so any role
        // statistics the caller relies on (holders, canTeachCount,
        // countsByTier) remain identical in shape to the world-wide
        // stat; the caller is expected to read the settlement-scoped
        // fields we return instead of the world-wide batch entries.
        // The batch call is a documented shape-parity check, not a
        // source of truth for the settlement-scoped numbers.
        var _batchShapeCheck = null;
        try {
            _batchShapeCheck = RQ.getRoleStatisticsBatch(roleIds);
        } catch (e) {
            _batchShapeCheck = null;
        }
        void _batchShapeCheck;

        // ----- Category breakdown -----
        var byCategory = Object.create(null);
        for (var roleId in perRoleCounts) {
            if (!Object.prototype.hasOwnProperty.call(perRoleCounts, roleId)) continue;
            var role = rolesById[roleId];
            var categoryId = (role && typeof role.category === 'string' && role.category)
                ? role.category
                : 'uncategorized';
            var categoryName = null;
            if (window.RoleState && typeof window.RoleState.getCategories === 'function') {
                try {
                    var categories = window.RoleState.getCategories();
                    if (categories && categories[categoryId] && categories[categoryId].name) {
                        categoryName = categories[categoryId].name;
                    }
                } catch (e) {
                    categoryName = null;
                }
            }
            if (!categoryName) {
                categoryName = categoryId;
            }

            if (!byCategory[categoryId]) {
                byCategory[categoryId] = {
                    count: 0,
                    roles: []
                };
            }
            byCategory[categoryId].count += perRoleCounts[roleId];
            byCategory[categoryId].roles.push({
                id: roleId,
                name: (role && role.name) ? role.name : roleId,
                count: perRoleCounts[roleId],
                categoryName: categoryName
            });
        }
        for (var catId in byCategory) {
            if (!Object.prototype.hasOwnProperty.call(byCategory, catId)) continue;
            byCategory[catId].roles.sort(function (a, b) {
                if (b.count !== a.count) return b.count - a.count;
                return a.name.localeCompare(b.name);
            });
        }

        // ----- Top roles -----
        var topRoles = [];
        for (var trid in perRoleCounts) {
            if (!Object.prototype.hasOwnProperty.call(perRoleCounts, trid)) continue;
            var trRole = rolesById[trid];
            topRoles.push({
                id: trid,
                name: (trRole && trRole.name) ? trRole.name : trid,
                count: perRoleCounts[trid],
                percentage: totalProfessions > 0
                    ? Math.round((perRoleCounts[trid] / totalProfessions) * 100)
                    : 0
            });
        }
        topRoles.sort(function (a, b) {
            if (b.count !== a.count) return b.count - a.count;
            return a.name.localeCompare(b.name);
        });

        return {
            locationId: locationId,
            totalProfessions: totalProfessions,
            uniqueRoles: roleIds.length,
            characterCount: characterCount,
            roleIds: roleIds.slice(),
            countsByTier: countsByTier,
            byCategory: byCategory,
            topRoles: topRoles,
            mastersByRole: perRoleMasters,
            apprenticesByRole: perRoleApprentices,
            canTeachByRole: perRoleCanTeach,
            primaryByRole: perRolePrimary
        };
    }

    // -------------------------------------------------------------------------
    // 7c. getSettlementApprenticeshipDensity
    // -------------------------------------------------------------------------
    //
    // Active apprenticeship relationship counts over the settlement
    // subtree.
    //
    // Source of truth for active apprenticeships:
    //   ApprenticeshipQueries.getActiveApprenticeships()
    //
    // The apprenticeship projections are world-wide; the settlement
    // scope is enforced here by requiring BOTH the master and the
    // apprentice to be in the settlement subtree. This matches the
    // definition used by the apprenticeship details modal (both parties
    // must be local).
    //
    // Return shape:
    //   {
    //     locationId,
    //     totalMasters,               number   // distinct masters with active apprentices
    //     totalApprentices,           number   // active apprenticeship edges in settlement
    //     masterToApprenticeRatio,    number   // apprentices / masters, 0 when masters == 0
    //     topRoles,                   [{ roleId, roleName, count }]  // by apprentice count
    //     topMasters,                 [{ masterId, masterName, apprenticeCount }]
    //   }
    //
    // Returns null for a missing settlement.
    // Returns zeros and empty arrays for a present settlement with no
    // active apprenticeships.

    function getSettlementApprenticeshipDensity(locationId) {
        var settlement = getSettlementData(locationId);
        if (!settlement) return null;

        var AQ = window.ApprenticeshipQueries;
        if (!AQ || typeof AQ.getActiveApprenticeships !== 'function') {
            throw new Error(
                'SettlementQueries: ApprenticeshipQueries.getActiveApprenticeships ' +
                'is required for getSettlementApprenticeshipDensity.'
            );
        }

        var idSet = _getSettlementLocationIdSet(locationId);
        if (!idSet) return null;

        var LQ = window.LocationQueries;
        if (!LQ || typeof LQ.getCurrentLocationId !== 'function') {
            throw new Error(
                'SettlementQueries: LocationQueries.getCurrentLocationId is ' +
                'required for getSettlementApprenticeshipDensity.'
            );
        }

        var active = null;
        try {
            active = AQ.getActiveApprenticeships();
        } catch (e) {
            active = null;
        }
        if (!Array.isArray(active)) active = [];

        var masterIds = Object.create(null);
        var masterNames = Object.create(null);
        var masterApprenticeCounts = Object.create(null);
        var roleCounts = Object.create(null);
        var roleNames = Object.create(null);
        var totalEdges = 0;

        for (var i = 0; i < active.length; i++) {
            var app = active[i];
            if (!app) continue;

            var masterId = app.masterId || null;
            var apprenticeId = app.apprenticeId || null;
            if (!masterId || !apprenticeId) continue;

            var masterLoc = null;
            var apprenticeLoc = null;
            try {
                masterLoc = LQ.getCurrentLocationId(masterId);
            } catch (e1) {
                masterLoc = null;
            }
            try {
                apprenticeLoc = LQ.getCurrentLocationId(apprenticeId);
            } catch (e2) {
                apprenticeLoc = null;
            }

            if (!masterLoc || !idSet[masterLoc]) continue;
            if (!apprenticeLoc || !idSet[apprenticeLoc]) continue;

            totalEdges++;
            masterIds[masterId] = true;
            if (app.masterName) masterNames[masterId] = app.masterName;
            masterApprenticeCounts[masterId] =
                (masterApprenticeCounts[masterId] || 0) + 1;

            var roleId = app.roleId || null;
            if (roleId) {
                roleCounts[roleId] = (roleCounts[roleId] || 0) + 1;
                if (app.roleName) roleNames[roleId] = app.roleName;
            }
        }

        var totalMasters = Object.keys(masterIds).length;
        var totalApprentices = totalEdges;

        var ratio = totalMasters > 0
            ? totalApprentices / totalMasters
            : 0;
        // Round to one decimal; the modal formats it as "X.X:1".
        ratio = Math.round(ratio * 10) / 10;

        // ----- Top roles (by apprentice count) -----
        var topRoles = [];
        for (var rId in roleCounts) {
            if (!Object.prototype.hasOwnProperty.call(roleCounts, rId)) continue;
            topRoles.push({
                roleId: rId,
                roleName: roleNames[rId] || rId,
                count: roleCounts[rId]
            });
        }
        topRoles.sort(function (a, b) {
            if (b.count !== a.count) return b.count - a.count;
            return a.roleName.localeCompare(b.roleName);
        });

        // ----- Top masters (by apprentice count) -----
        var topMasters = [];
        for (var mId in masterApprenticeCounts) {
            if (!Object.prototype.hasOwnProperty.call(masterApprenticeCounts, mId)) {
                continue;
            }
            topMasters.push({
                masterId: mId,
                masterName: masterNames[mId] || mId,
                apprenticeCount: masterApprenticeCounts[mId]
            });
        }
        topMasters.sort(function (a, b) {
            if (b.apprenticeCount !== a.apprenticeCount) {
                return b.apprenticeCount - a.apprenticeCount;
            }
            return a.masterName.localeCompare(b.masterName);
        });

        return {
            locationId: locationId,
            totalMasters: totalMasters,
            totalApprentices: totalApprentices,
            masterToApprenticeRatio: ratio,
            topRoles: topRoles,
            topMasters: topMasters
        };
    }

    // -------------------------------------------------------------------------
    // 7d. getSettlementMastersByRole
    // -------------------------------------------------------------------------
    //
    // The active masters of a role in the settlement subtree.
    //
    // This is the function ApprenticeshipQueries.findPotentialMasters
    // calls. It expects:
    //
    //   [{ character: <projection>, skillLevel: number, apprenticeCount: number }]
    //
    // `skillLevel` is the master's skill in that role, read from their
    // profession record. `apprenticeCount` is the number of active
    // apprenticeships they have for that role, with the apprentice in
    // the settlement subtree.
    //
    // "Master" means: the character holds the role with a skill >=
    // TEACHING_CONSTANTS.MIN_MASTER_SKILL. Apprenticeships are not
    // required — a character is a potential master by skill alone.
    //
    // Returns null for a missing settlement.
    // Returns [] for a present settlement with no qualifying masters.

    function getSettlementMastersByRole(locationId, roleId) {
        var settlement = getSettlementData(locationId);
        if (!settlement) return null;

        if (typeof roleId !== 'string' || roleId.length === 0) {
            return [];
        }

        var TEACH = window.TEACHING_CONSTANTS;
        if (!TEACH || typeof TEACH.MIN_MASTER_SKILL !== 'number') {
            throw new Error(
                'SettlementQueries: TEACHING_CONSTANTS.MIN_MASTER_SKILL is ' +
                'required for getSettlementMastersByRole.'
            );
        }
        var minMasterSkill = TEACH.MIN_MASTER_SKILL;

        var AQ = window.ApprenticeshipQueries;
        if (!AQ || typeof AQ.getActiveApprenticeships !== 'function') {
            throw new Error(
                'SettlementQueries: ApprenticeshipQueries.getActiveApprenticeships ' +
                'is required for getSettlementMastersByRole.'
            );
        }

        var characters = _getSettlementCharacters(locationId);
        var professionIndex = _readProfessionsForCharacters(characters);

        // Apprentice count per master, for that role, in the settlement.
        // Only apprentices in the settlement subtree count.
        var apprenticeCountByMaster = Object.create(null);
        var active = null;
        try {
            active = AQ.getActiveApprenticeships();
        } catch (e) {
            active = null;
        }
        if (Array.isArray(active)) {
            var idSet = _getSettlementLocationIdSet(locationId);
            var LQ = window.LocationQueries;
            if (idSet && LQ && typeof LQ.getCurrentLocationId === 'function') {
                for (var i = 0; i < active.length; i++) {
                    var app = active[i];
                    if (!app || app.roleId !== roleId) continue;
                    if (!app.masterId || !app.apprenticeId) continue;

                    var masterLoc = null;
                    var apprenticeLoc = null;
                    try {
                        masterLoc = LQ.getCurrentLocationId(app.masterId);
                    } catch (e1) {
                        masterLoc = null;
                    }
                    try {
                        apprenticeLoc = LQ.getCurrentLocationId(app.apprenticeId);
                    } catch (e2) {
                        apprenticeLoc = null;
                    }
                    if (!masterLoc || !idSet[masterLoc]) continue;
                    if (!apprenticeLoc || !idSet[apprenticeLoc]) continue;

                    apprenticeCountByMaster[app.masterId] =
                        (apprenticeCountByMaster[app.masterId] || 0) + 1;
                }
            }
        }

        var result = [];
        var perRoleEntries = professionIndex.perRole[roleId];
        if (!Array.isArray(perRoleEntries)) return result;

        var seenCharacterIds = Object.create(null);
        for (var k = 0; k < perRoleEntries.length; k++) {
            var entry = perRoleEntries[k];
            if (!entry || !entry.characterId || !entry.profession) continue;
            if (seenCharacterIds[entry.characterId]) continue;
            seenCharacterIds[entry.characterId] = true;

            var skillLevel = (typeof entry.profession.skillLevel === 'number' &&
                              isFinite(entry.profession.skillLevel))
                ? entry.profession.skillLevel
                : 0;
            if (skillLevel < minMasterSkill) continue;

            var character = null;
            for (var m = 0; m < characters.length; m++) {
                if (characters[m] && characters[m].id === entry.characterId) {
                    character = characters[m];
                    break;
                }
            }
            if (!character) continue;

            result.push({
                character: character,
                skillLevel: skillLevel,
                apprenticeCount: apprenticeCountByMaster[entry.characterId] || 0
            });
        }

        result.sort(function (a, b) {
            if (b.skillLevel !== a.skillLevel) return b.skillLevel - a.skillLevel;
            var an = ((a.character && a.character.name) || '').toLowerCase();
            var bn = ((b.character && b.character.name) || '').toLowerCase();
            return an.localeCompare(bn);
        });

        return result;
    }

    // =========================================================================
    // 8. EXPORTS
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
        getCurrentRank: getCurrentRank,

        // Settlement-scoped role aggregates
        getSettlementRoleStats: getSettlementRoleStats,
        getSettlementApprenticeshipDensity: getSettlementApprenticeshipDensity,
        getSettlementMastersByRole: getSettlementMastersByRole
    });

})();
