/**
 * =============================================================================
 * STILL WATERS - HOUSEHOLD RULES (household-rules.js)
 * =============================================================================
 *
 * LOCATION: js/systems/household/household-rules.js
 *
 * PURPOSE
 * -------
 * Pure policy for the household domain. Every function here is either:
 *
 *   - a pure calculation (no side effects, deterministic given inputs)
 *   - an explicitly-labeled helper that mutates a passed-in record
 *     (applyHeadChange) — everything else is side-effect free
 *
 * WHAT THIS MODULE IS NOT
 * -----------------------
 *   - Not state. State lives in household-state.js / residence-system.js.
 *   - Not persistence. Persistence lives in commands' persist() methods.
 *   - Not I/O. No window access, no fetch, no localStorage.
 *   - Not randomness. The one randomness call (economic event probability)
 *     stays in household-economy.js.
 *
 * DESIGN NOTES
 * ------------
 *   - Rules functions take *snapshots* and *ids* as inputs, not live
 *     canonical records. The one exception is applyHeadChange, which must
 *     mutate the passed household record — it is documented as such.
 *   - Rules functions call the caller-supplied character lookup
 *     (getCharacterById) when they need character data. This keeps the
 *     module decoupled from global window state during tests.
 *   - Rules functions never persist. The caller (a command) persists.
 *
 * CONSUMERS
 * ---------
 *   household-commands.js     — pickSuccessor, applyHeadChange,
 *                               getEconomicTier, netAnnualChange
 *   household-queries.js      — calculateHouseholdStatus, calculateDemographics,
 *                               filterEligibleHeirs
 *   household-economy.js      — getEconomicTier, calculateEnterpriseNet,
 *                               netAnnualChange, calculateAnnualDebtInterest,
 *                               evaluateBankruptcy
 *   household-servant.js      — calculateServiceQuality, calculateRecommendation
 *   residence-system.js       — calculateRepairCost, calculateOccupiedUnitCount,
 *                               calculateVacantUnitCount, isResidenceVacant,
 *                               calculateUnitStats, calculateConditionChange,
 *                               calculateRehabilitatedValue
 *
 * LOAD ORDER
 * ----------
 *   household-constants.js
 *   household-rules.js        ← this file
 *   household-state.js
 *   household-queries.js
 *   household-commands.js
 *   household-economy.js
 *   household-assignment.js
 *   household-servant.js
 *   residence-system.js
 *   household-bootstrap.js
 *
 * DEPENDENCIES
 * ------------
 *   - household-constants.js (optional — falls back to inline thresholds
 *     if missing; see _constants())
 *
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY ACCESS
    // =========================================================================

    /**
     * Constants are optional for this module. If household-constants.js is
     * not loaded, we use inline fallbacks so the rules functions still
     * return the correct values. This lets rules be unit-tested without
     * loading the entire domain.
     */
    function _constants() {
        return typeof window.HouseholdConstants !== 'undefined'
            ? window.HouseholdConstants
            : null;
    }

    function _threshold(key, fallback) {
        var c = _constants();
        if (c && c.THRESHOLDS && c.THRESHOLDS[key] !== undefined) {
            return c.THRESHOLDS[key];
        }
        return fallback;
    }

    function _conditionMultiplier(conditionId, fallback) {
        var c = _constants();
        if (c && c.CONDITION_MULTIPLIER &&
            c.CONDITION_MULTIPLIER[conditionId] !== undefined) {
            return c.CONDITION_MULTIPLIER[conditionId];
        }
        return fallback;
    }

    function _serviceQualityOrder() {
        var c = _constants();
        if (c && Array.isArray(c.SERVICE_QUALITY_ORDER)) {
            return c.SERVICE_QUALITY_ORDER;
        }
        // Inline fallback matching household-constants.js
        return [
            { id: 'excellent',      name: 'Excellent',      minSatisfaction: 90 },
            { id: 'good',           name: 'Good',           minSatisfaction: 70 },
            { id: 'average',        name: 'Average',        minSatisfaction: 50 },
            { id: 'poor',           name: 'Poor',           minSatisfaction: 30 },
            { id: 'unsatisfactory', name: 'Unsatisfactory', minSatisfaction: 0 }
        ];
    }

    function _economicTiers() {
        var c = _constants();
        if (c && c.ECONOMIC_TIERS) {
            return c.ECONOMIC_TIERS;
        }
        // Inline fallback matching household-constants.js
        return {
            DESTITUTE:  { id: 'destitute',  minWealth: 0,    maxWealth: 10,       label: 'Destitute' },
            POOR:       { id: 'poor',       minWealth: 11,   maxWealth: 30,       label: 'Poor' },
            MODERATE:   { id: 'moderate',   minWealth: 31,   maxWealth: 70,       label: 'Moderate' },
            PROSPEROUS: { id: 'prosperous', minWealth: 71,   maxWealth: 120,      label: 'Prosperous' },
            WEALTHY:    { id: 'wealthy',    minWealth: 121,  maxWealth: 200,      label: 'Wealthy' },
            NOBLE:      { id: 'noble',      minWealth: 201,  maxWealth: 500,      label: 'Noble' },
            VERY_NOBLE: { id: 'very_noble', minWealth: 501,  maxWealth: 1000,     label: 'High Noble' },
            ROYAL:      { id: 'royal',      minWealth: 1001, maxWealth: Infinity, label: 'Royal' }
        };
    }

    // =========================================================================
    // 2. SUCCESSION POLICY
    // =========================================================================

    /**
     * Picks the successor to a household headship.
     *
     * Policy: oldest living family member (by birth year). Ties broken by
     * member order in the array. Staff are never successors. Deceased
     * characters are excluded.
     *
     * @param {Object} household - household snapshot or canonical record.
     *   Must have a `members` array. Members must have `characterId` and
     *   `type`. The `type` must be 'family' for the member to be eligible.
     * @param {Function} getCharacterById - callback for character lookup.
     * @returns {string|null} characterId of the successor, or null.
     */
    function pickSuccessor(household, getCharacterById) {
        if (!household || !Array.isArray(household.members)) return null;
        if (typeof getCharacterById !== 'function') return null;

        var candidates = [];
        for (var i = 0; i < household.members.length; i++) {
            var m = household.members[i];
            if (m.type !== 'family') continue;

            var character = null;
            try {
                character = getCharacterById(m.characterId);
            } catch (e) {
                character = null;
            }
            if (!character || character.isDeceased) continue;

            candidates.push({
                id: m.characterId,
                birthYear: character.birthYear !== undefined
                    ? character.birthYear
                    : 9999
            });
        }

        if (candidates.length === 0) return null;
        candidates.sort(function(a, b) {
            return a.birthYear - b.birthYear;
        });
        return candidates[0].id;
    }

    /**
     * Applies a head change to a household record.
     *
     * MUTATES the passed household record. This is the ONE rules function
     * that mutates. It clears every existing head, sets the new head, and
     * appends an eventLog entry.
     *
     * @param {Object} household - live canonical household record. This
     *   function is called from within a command, on the record the command
     *   is about to commit.
     * @param {string} characterId - who should become head.
     * @param {number} year - when.
     * @param {string} reason - why.
     * @returns {boolean} true if the character was found and promoted.
     */
    function applyHeadChange(household, characterId, year, reason) {
        if (!household || !Array.isArray(household.members)) return false;

        // Clear all existing heads
        for (var i = 0; i < household.members.length; i++) {
            if (household.members[i].isHead) {
                household.members[i].isHead = false;
                household.members[i].headSince = null;
                household.members[i].role = 'Family Member';
            }
        }

        // Set the new head
        for (var j = 0; j < household.members.length; j++) {
            if (household.members[j].characterId === characterId) {
                household.members[j].isHead = true;
                household.members[j].role = 'Head of Household';
                household.members[j].headSince = year;

                if (!Array.isArray(household.eventLog)) {
                    household.eventLog = [];
                }
                household.eventLog.push({
                    year: year,
                    type: 'head_appointed',
                    characterId: characterId,
                    reason: reason || null,
                    timestamp: Date.now()
                });
                return true;
            }
        }
        return false;
    }

    // =========================================================================
    // 3. ECONOMY POLICY
    // =========================================================================

    /**
     * Returns the economic tier for a wealth value.
     * Pure. Tiers loaded from household-constants.js or inline fallback.
     */
    function getEconomicTier(wealth) {
        var w = typeof wealth === 'number' && isFinite(wealth) ? wealth : 0;
        var tiers = _economicTiers();
        var keys = Object.keys(tiers);
        for (var i = 0; i < keys.length; i++) {
            var tier = tiers[keys[i]];
            if (w >= tier.minWealth && w <= tier.maxWealth) return tier;
        }
        return tiers.DESTITUTE;
    }

    /**
     * Net annual change from income and expenses.
     * Pure.
     */
    function netAnnualChange(income, expenses) {
        var i = typeof income === 'number' && isFinite(income) ? income : 0;
        var e = typeof expenses === 'number' && isFinite(expenses) ? expenses : 0;
        return i - e;
    }

    /**
     * Annual debt interest for a debt value.
     * Pure.
     */
    function calculateAnnualDebtInterest(debt) {
        var d = typeof debt === 'number' && isFinite(debt) ? debt : 0;
        if (d <= 0) return 0;
        var rate = _threshold('DEBT_INTEREST_RATE', 0.05);
        return d * rate;
    }

    /**
     * Whether a wealth value puts the household below the bankruptcy
     * threshold.
     * Pure.
     */
    function evaluateBankruptcy(wealth, threshold) {
        var w = typeof wealth === 'number' && isFinite(wealth) ? wealth : 0;
        var t = typeof threshold === 'number'
            ? threshold
            : _threshold('BANKRUPTCY', -50);
        return w < t;
    }

    /**
     * Enterprise net income/expense from a list of enterprise summaries.
     *
     * `summaries` are the objects returned by
     * `IndustryQueries.getEnterpriseSummary(id)`. Public enterprises are
     * excluded (their profits belong to the Crown).
     *
     * Pure.
     */
    function calculateEnterpriseNet(summaries) {
        var income = 0;
        var expense = 0;
        if (!Array.isArray(summaries)) {
            return { income: 0, expense: 0 };
        }
        for (var i = 0; i < summaries.length; i++) {
            var s = summaries[i];
            if (!s) continue;
            if (s.ownershipType === 'public') continue;
            var profit = typeof s.annualProfit === 'number' ? s.annualProfit : 0;
            if (profit > 0) income += profit;
            else if (profit < 0) expense += -profit;
        }
        return { income: income, expense: expense };
    }

    // =========================================================================
    // 4. SERVICE POLICY
    // =========================================================================

    /**
     * Service quality tier from average employer + servant satisfaction.
     * Pure.
     */
    function calculateServiceQuality(employerSatisfaction, servantSatisfaction) {
        var e = typeof employerSatisfaction === 'number'
            ? employerSatisfaction : 70;
        var s = typeof servantSatisfaction === 'number'
            ? servantSatisfaction : 70;
        var avg = (e + s) / 2;

        var order = _serviceQualityOrder();
        for (var i = 0; i < order.length; i++) {
            if (avg >= order[i].minSatisfaction) return order[i];
        }
        // Fallback — should never hit
        return order[order.length - 1];
    }

    /**
     * Recommendation string from satisfaction.
     * Pure.
     */
    function calculateRecommendation(satisfaction) {
        var s = typeof satisfaction === 'number' ? satisfaction : 0;
        if (s >= 90) return 'highly recommended';
        if (s >= 70) return 'recommended';
        if (s >= 50) return 'recommended with reservations';
        return 'not recommended';
    }

    // =========================================================================
    // 5. RESIDENCE POLICY
    // =========================================================================

    /**
     * Repair cost from current condition to target condition.
     *
     * Cost = baseValue × (targetMultiplier − currentMultiplier) × 0.5
     * Returns 0 if target is worse than or equal to current (no repair).
     *
     * @param {Object} residence - residence snapshot with `condition` and
     *   `estimatedValue`. If missing, uses default estimated value 500.
     * @param {string} targetCondition - one of RESIDENCE_CONDITIONS ids.
     * @returns {number} repair cost in gold, or 0.
     */
    function calculateRepairCost(residence, targetCondition) {
        if (!residence) return 0;

        var currentCondition = residence.condition || 'good';
        var currentM = _conditionMultiplier(currentCondition, undefined);
        var targetM = _conditionMultiplier(targetCondition, undefined);
        if (currentM === undefined || targetM === undefined) return 0;

        var baseValue = residence.estimatedValue !== undefined
            ? residence.estimatedValue
            : _threshold('DEFAULT_ESTIMATED_VALUE', 500);

        var repairFactor = targetM - currentM;
        if (repairFactor <= 0) return 0;
        return Math.round(baseValue * repairFactor * 0.5);
    }

    /**
     * New estimated value after rehabilitation.
     * Value grows by 5% of the multiplier change, applied to old value.
     * Pure.
     */
    function calculateRehabilitatedValue(estimatedValue,
                                          currentCondition,
                                          targetCondition) {
        var oldValue = typeof estimatedValue === 'number' && isFinite(estimatedValue)
            ? estimatedValue
            : _threshold('DEFAULT_ESTIMATED_VALUE', 500);
        var currentM = _conditionMultiplier(currentCondition, undefined);
        var targetM = _conditionMultiplier(targetCondition, undefined);
        if (currentM === undefined || targetM === undefined) return oldValue;

        var factor = 1 + 0.05 * (targetM - currentM);
        if (factor <= 0) return oldValue;
        return Math.round(oldValue * factor);
    }

    /**
     * Count occupied units. A unit is occupied if it has a householdId,
     * is not demolished, and is not vacant.
     * Pure.
     */
    function calculateOccupiedUnitCount(units) {
        if (!Array.isArray(units)) return 0;
        var n = 0;
        for (var i = 0; i < units.length; i++) {
            var u = units[i];
            if (!u.isDemolished && !u.isVacant && u.householdId) n++;
        }
        return n;
    }

    /**
     * Count vacant (usable) units.
     * Pure.
     */
    function calculateVacantUnitCount(units) {
        if (!Array.isArray(units)) return 0;
        var n = 0;
        for (var i = 0; i < units.length; i++) {
            var u = units[i];
            if (!u.isDemolished && u.isVacant) n++;
        }
        return n;
    }

    /**
     * Whether a residence is vacant (no occupied units).
     * Pure.
     */
    function isResidenceVacant(units) {
        if (!Array.isArray(units)) return true;
        if (units.length === 0) return true;
        for (var i = 0; i < units.length; i++) {
            var u = units[i];
            if (!u.isDemolished && !u.isVacant && u.householdId) return false;
        }
        return true;
    }

    /**
     * Full unit statistics for a residence's units.
     * Pure.
     */
    function calculateUnitStats(units) {
        var total = Array.isArray(units) ? units.length : 0;
        var occupied = calculateOccupiedUnitCount(units);
        var vacant = calculateVacantUnitCount(units);
        var demolished = 0;
        if (Array.isArray(units)) {
            for (var i = 0; i < units.length; i++) {
                if (units[i].isDemolished) demolished++;
            }
        }
        var usable = total - demolished;
        return {
            total: total,
            usable: usable,
            occupied: occupied,
            vacant: vacant,
            demolished: demolished,
            occupancyRate: usable > 0
                ? Math.round((occupied / usable) * 100)
                : 0
        };
    }

    // =========================================================================
    // 6. HEIR ELIGIBILITY
    // =========================================================================

    /**
     * Filters heir candidates by age range.
     *
     * @param {Array} candidates - [{id, age, ...}] from
     *   HouseholdQueries.getHouseholdHeirs (which already handles
     *   external children/siblings).
     * @param {Object} options - {minAge, maxAge}. Both optional.
     * @returns {Array} filtered candidates (same order).
     */
    function filterEligibleHeirs(candidates, options) {
        if (!Array.isArray(candidates)) return [];
        options = options || {};

        var minAge = options.minAge !== undefined && options.minAge !== null
            ? options.minAge : null;
        var maxAge = options.maxAge !== undefined && options.maxAge !== null
            ? options.maxAge : null;

        if (minAge === null && maxAge === null) return candidates.slice();

        return candidates.filter(function(c) {
            if (c.age === null || c.age === undefined) return false;
            if (minAge !== null && c.age < minAge) return false;
            if (maxAge !== null && c.age > maxAge) return false;
            return true;
        });
    }

    // =========================================================================
    // 7. HOUSEHOLD STATUS
    // =========================================================================

    /**
     * Derives household status from member counts and persisted status.
     *
     * Precedence:
     *   1. 'destroyed' (persisted)
     *   2. 'deprecated' (persisted)
     *   3. 'empty' (no members)
     *   4. 'vacant' (all deceased)
     *   5. 'declining' (>half deceased, at least 4 members)
     *   6. 'active'
     *
     * @param {Object} counts - {livingCount, deceasedCount, missingCount,
     *   totalMembers}. Caller computes these from member lookups.
     * @param {string|null} persistedStatus - household.status
     * @returns {string} status id
     */
    function calculateHouseholdStatus(counts, persistedStatus) {
        var c = counts || {};
        var living = typeof c.livingCount === 'number' ? c.livingCount : 0;
        var total = typeof c.totalMembers === 'number' ? c.totalMembers : 0;

        if (persistedStatus === 'destroyed') return 'destroyed';
        if (persistedStatus === 'deprecated') return 'deprecated';

        var isEmpty = total === 0;
        var isVacant = living === 0 && total > 0;
        var isDeclining = living > 0 && total > 3 &&
            (living / total) <= 0.5;

        if (isEmpty) return 'empty';
        if (isVacant) return 'vacant';
        if (isDeclining) return 'declining';
        return 'active';
    }

    // =========================================================================
    // 8. DEMOGRAPHICS
    // =========================================================================

    /**
     * Aggregate demographic statistics from member projections.
     *
     * @param {Array} members - member projections from
     *   HouseholdQueries.getHouseholdMembers. Must have `age`,
     *   `character.gender`, `isDeceased`, `isMissing`.
     * @returns {Object} stats
     */
    function calculateDemographics(members) {
        var stats = {
            total: 0, male: 0, female: 0, unknown: 0,
            children: 0, youth: 0, adults: 0, elders: 0,
            ageUnknown: 0, living: 0, deceased: 0, missing: 0,
            byAgeGroup: {}
        };

        if (!Array.isArray(members)) return stats;

        for (var i = 0; i < members.length; i++) {
            var m = members[i];
            stats.total++;

            if (m.isMissing) {
                stats.missing++;
                continue;
            }

            var c = m.character || {};
            if (c.gender === 'male') stats.male++;
            else if (c.gender === 'female') stats.female++;
            else stats.unknown++;

            if (m.isDeceased) stats.deceased++;
            else stats.living++;

            var age = m.age;
            if (age === null || age === undefined) {
                stats.ageUnknown++;
                continue;
            }

            if (age < 18) stats.children++;
            else if (age < 26) stats.youth++;
            else if (age < 60) stats.adults++;
            else stats.elders++;

            var group;
            if (age < 10) group = '0-9';
            else if (age < 20) group = '10-19';
            else if (age < 30) group = '20-29';
            else if (age < 40) group = '30-39';
            else if (age < 50) group = '40-49';
            else if (age < 60) group = '50-59';
            else if (age < 70) group = '60-69';
            else if (age < 80) group = '70-79';
            else group = '80+';

            if (!stats.byAgeGroup[group]) stats.byAgeGroup[group] = 0;
            stats.byAgeGroup[group]++;
        }

        return stats;
    }

    // =========================================================================
    // 9. EXPORTS
    // =========================================================================

    var api = {
        // Succession
        pickSuccessor: pickSuccessor,
        applyHeadChange: applyHeadChange,

        // Economy
        getEconomicTier: getEconomicTier,
        netAnnualChange: netAnnualChange,
        calculateAnnualDebtInterest: calculateAnnualDebtInterest,
        evaluateBankruptcy: evaluateBankruptcy,
        calculateEnterpriseNet: calculateEnterpriseNet,

        // Service
        calculateServiceQuality: calculateServiceQuality,
        calculateRecommendation: calculateRecommendation,

        // Residence
        calculateRepairCost: calculateRepairCost,
        calculateRehabilitatedValue: calculateRehabilitatedValue,
        calculateOccupiedUnitCount: calculateOccupiedUnitCount,
        calculateVacantUnitCount: calculateVacantUnitCount,
        isResidenceVacant: isResidenceVacant,
        calculateUnitStats: calculateUnitStats,

        // Heirs
        filterEligibleHeirs: filterEligibleHeirs,

        // Household status
        calculateHouseholdStatus: calculateHouseholdStatus,

        // Demographics
        calculateDemographics: calculateDemographics,

        // Diagnostics
        version: 1,
        isPure: true
    };

    window.HouseholdRules = api;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }

})();
