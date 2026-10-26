/**
 * =============================================================================
 * STILL WATERS - HOUSEHOLD RULES (household-rules.js)
 * =============================================================================
 *
 * LOCATION: js/households/household-rules.js
 *
 * PURPOSE
 * -------
 * Pure policy for the household domain. Every function here is either:
 *
 *   - a pure calculation (no side effects, deterministic given inputs)
 *   - an explicitly-labelled helper that mutates a caller-supplied record
 *     (applyHeadChange) — nothing else is side-effecting
 *
 * This module is the SINGLE SOURCE OF TRUTH for:
 *
 *   - Succession policy (pickSuccessor, deriveDeprecationSuccessor)
 *   - Head-change application (applyHeadChange)
 *   - Economic policy (getEconomicTier, netAnnualChange,
 *     calculateAnnualDebtInterest, evaluateBankruptcy,
 *     calculateEnterpriseNet)
 *   - Service quality (calculateServiceQuality, calculateRecommendation)
 *   - Residence policy (calculateRepairCost, calculateRehabilitatedValue,
 *     calculateOccupiedUnitCount, calculateVacantUnitCount,
 *     isResidenceVacant, calculateUnitStats)
 *   - Household status (calculateHouseholdStatus, isHouseholdVacant)
 *   - Heir eligibility (filterEligibleHeirs)
 *   - Demographics (calculateDemographics)
 *
 * WHAT THIS MODULE IS NOT
 * -----------------------
 *   - Not state. State lives in household-state.js / residence-system.js.
 *   - Not persistence. Persistence lives in the commands' persist().
 *   - Not I/O. No window access except the constants dep, no fetch, no
 *     localStorage.
 *   - Not randomness. This module NEVER generates random numbers. Any
 *     function that needs a random value accepts it as a parameter.
 *   - Not the constants catalog. Every threshold, tier boundary, service
 *     type, and residence condition lives in household-constants.js. This
 *     module consumes them, it does not duplicate them.
 *
 * DESIGN NOTES
 * ------------
 *   - Rules functions take SNAPSHOTS and ids as inputs, not live canonical
 *     records. The one exception is applyHeadChange, which must mutate the
 *     passed household record — it is documented as such.
 *   - Rules functions call the caller-supplied character lookup
 *     (getCharacterById) when they need character data. This keeps this
 *     module decoupled from global state during tests.
 *   - Rules functions never persist. The caller (a command) persists.
 *   - Missing constants throw at load. This module has NO fallbacks.
 *     Prior revisions duplicated the economic and service catalogs
 *     "just in case constants.js wasn't loaded". That made three copies
 *     of every threshold and was the single largest divergence risk in
 *     the household subsystem. The fallbacks are gone.
 *
 * CONSUMERS
 * ---------
 *   household-commands.js     — pickSuccessor, applyHeadChange
 *   household-queries.js      — calculateHouseholdStatus,
 *                               calculateDemographics,
 *                               isHouseholdVacant, filterEligibleHeirs
 *   household-economy.js      — getEconomicTier, netAnnualChange,
 *                               calculateAnnualDebtInterest,
 *                               evaluateBankruptcy, calculateEnterpriseNet
 *   household-servant.js      — calculateServiceQuality,
 *                               calculateRecommendation
 *   residence-system.js       — calculateRepairCost,
 *                               calculateRehabilitatedValue,
 *                               calculateOccupiedUnitCount,
 *                               calculateVacantUnitCount,
 *                               isResidenceVacant,
 *                               calculateUnitStats
 *   household-view-models.js  — (indirect; view-models reads constants
 *                               directly for dropdowns/badges)
 *
 * LOAD ORDER
 * ----------
 *   household-constants.js
 *   household-rules.js        ← this file
 *   household-view-models.js
 *   household-orchestration.js
 *   household-state.js
 *   household-queries.js
 *   household-commands.js
 *   household-economy.js
 *   household-assignment.js
 *   household-servant.js
 *   residence-system.js
 *   household-bootstrap.js
 *   household-ui-list.js
 *   modals-*.js
 *
 * DEPENDENCIES
 * ------------
 *   - household-constants.js  (REQUIRED — throws if missing)
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. DEPENDENCY GUARD
    // =========================================================================

    if (typeof window.HouseholdConstants === 'undefined'
        || window.HouseholdConstants === null) {
        throw new Error(
            'household-rules.js: household-constants.js must load first ' +
            '(window.HouseholdConstants is missing).'
        );
    }

    var C = window.HouseholdConstants;

    // Sanity-check the specific sub-catalogs we consume. A missing catalog
    // means constants.js is stale (older version loaded). Fail loudly
    // rather than fall back to inline copies.
    var _REQUIRED_CONSTANTS = [
        'ECONOMIC_TIERS',
        'ECONOMIC_TIER_ORDER',
        'SERVICE_QUALITY_ORDER',
        'RESIDENCE_CONDITIONS',
        'CONDITION_MULTIPLIER',
        'THRESHOLDS'
    ];
    for (var _i = 0; _i < _REQUIRED_CONSTANTS.length; _i++) {
        if (typeof C[_REQUIRED_CONSTANTS[_i]] === 'undefined'
            || C[_REQUIRED_CONSTANTS[_i]] === null) {
            throw new Error(
                'household-rules.js: HouseholdConstants.' +
                _REQUIRED_CONSTANTS[_i] + ' is missing. ' +
                'The loaded household-constants.js is too old.'
            );
        }
    }

    // =========================================================================
    // 1. PRIVATE HELPERS
    // =========================================================================

    function _hasId(v) {
        return typeof v === 'string' && v.length > 0;
    }

    function _isFiniteNumber(v) {
        return typeof v === 'number' && isFinite(v);
    }

    function _readArray(v) {
        return Array.isArray(v) ? v : [];
    }

    function _intersect(a, b) {
        var out = [];
        for (var i = 0; i < a.length; i++) {
            if (b.indexOf(a[i]) !== -1) out.push(a[i]);
        }
        return out;
    }

    // =========================================================================
    // 2. SUCCESSION POLICY
    // =========================================================================

    /**
     * Picks the successor to a household headship.
     *
     * Policy: oldest living family member (by birth year). Ties broken by
     * member order in the household.members array (first encountered wins).
     * Staff are never successors. Deceased characters are excluded. A
     * member whose character cannot be resolved is excluded.
     *
     * @param {Object} household - household snapshot or canonical record.
     *   Must have a `members` array. Each member must have `characterId`
     *   and `type`. Only members with `type === 'family'` are eligible.
     * @param {Function} getCharacterById - callback for character lookup.
     *   Returns a projection or null.
     * @returns {string|null} characterId of the successor, or null.
     */
    function pickSuccessor(household, getCharacterById) {
        if (!household || !Array.isArray(household.members)) return null;
        if (typeof getCharacterById !== 'function') return null;

        var candidates = [];
        for (var i = 0; i < household.members.length; i++) {
            var m = household.members[i];
            if (!m || m.type !== 'family') continue;
            if (!_hasId(m.characterId)) continue;

            var character = null;
            try {
                character = getCharacterById(m.characterId);
            } catch (e) {
                character = null;
            }
            if (!character || character.isDeceased === true) continue;

            candidates.push({
                id: m.characterId,
                birthYear: _isFiniteNumber(character.birthYear)
                    ? character.birthYear
                    : 9999,
                order: i
            });
        }

        if (candidates.length === 0) return null;
        candidates.sort(function(a, b) {
            if (a.birthYear !== b.birthYear) return a.birthYear - b.birthYear;
            return a.order - b.order;
        });
        return candidates[0].id;
    }

    /**
     * Deprecation-fallback successor. Semantically identical to
     * pickSuccessor; kept as a distinct name so callers expressing
     * "the household is about to be deprecated, who inherits?" intent
     * can do so without a second code path. Delegates.
     *
     * @param {Object} household
     * @param {Function} getCharacterById
     * @returns {string|null}
     */
    function deriveDeprecationSuccessor(household, getCharacterById) {
        return pickSuccessor(household, getCharacterById);
    }

    /**
     * Applies a head change to a household record.
     *
     * MUTATES the passed household record. This is the ONE rules function
     * that mutates. It clears every existing head, sets the new head, and
     * appends an eventLog entry.
     *
     * Callers are commands (household-commands.js) running on the live
     * canonical record they are about to commit. Snapshot in, mutate out
     * does not apply here.
     *
     * @param {Object} household - live canonical household record.
     * @param {string} characterId - who should become head.
     * @param {number} year - when.
     * @param {string} reason - why.
     * @returns {boolean} true if the character was found and promoted.
     */
    function applyHeadChange(household, characterId, year, reason) {
        if (!household || !Array.isArray(household.members)) return false;
        if (!_hasId(characterId)) return false;

        // Clear every existing head.
        for (var i = 0; i < household.members.length; i++) {
            if (household.members[i] && household.members[i].isHead) {
                household.members[i].isHead = false;
                household.members[i].headSince = null;
                household.members[i].role = 'Family Member';
            }
        }

        // Set the new head.
        for (var j = 0; j < household.members.length; j++) {
            var m = household.members[j];
            if (!m || m.characterId !== characterId) continue;

            m.isHead = true;
            m.role = 'Head of Household';
            m.headSince = year;

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
        return false;
    }

    // =========================================================================
    // 3. ECONOMY POLICY
    // =========================================================================

    /**
     * Returns the economic tier for a wealth value. The tiers form a total
     * partition of [0, +Infinity), so this always returns a tier — the
     * destitute tier for invalid input.
     *
     * Pure. Delegates to HouseholdConstants.ECONOMIC_TIER_ORDER.
     *
     * @param {number} wealth
     * @returns {Object} tier object with {id, minWealth, maxWealth, label}
     */
    function getEconomicTier(wealth) {
        var w = _isFiniteNumber(wealth) ? wealth : 0;
        var tiers = C.ECONOMIC_TIER_ORDER;
        for (var i = 0; i < tiers.length; i++) {
            if (w >= tiers[i].minWealth && w <= tiers[i].maxWealth) {
                return tiers[i];
            }
        }
        // Unreachable with the current partition; defensive fallback.
        return tiers[0];
    }

    /**
     * Net annual change from income and expenses.
     * Pure.
     */
    function netAnnualChange(income, expenses) {
        var i = _isFiniteNumber(income) ? income : 0;
        var e = _isFiniteNumber(expenses) ? expenses : 0;
        return i - e;
    }

    /**
     * Annual debt interest for a debt value. Positive debt accrues at
     * THRESHOLDS.DEBT_INTEREST_RATE. Zero or negative debt accrues nothing.
     * Pure.
     */
    function calculateAnnualDebtInterest(debt) {
        var d = _isFiniteNumber(debt) ? debt : 0;
        if (d <= 0) return 0;
        return d * C.THRESHOLDS.DEBT_INTEREST_RATE;
    }

    /**
     * Whether a wealth value puts the household below the bankruptcy
     * threshold. Pure.
     *
     * @param {number} wealth
     * @param {number} [threshold] - override; defaults to
     *   THRESHOLDS.BANKRUPTCY.
     * @returns {boolean}
     */
    function evaluateBankruptcy(wealth, threshold) {
        var w = _isFiniteNumber(wealth) ? wealth : 0;
        var t = _isFiniteNumber(threshold)
            ? threshold
            : C.THRESHOLDS.BANKRUPTCY;
        return w < t;
    }

    /**
     * Enterprise net income/expense from a list of enterprise summaries.
     *
     * `summaries` are the objects returned by
     * IndustryQueries.getEnterpriseSummary(id). Public enterprises are
     * excluded (their profits belong to the Crown).
     *
     * Pure.
     *
     * @param {Array} summaries
     * @returns {{income: number, expense: number}}
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
            var profit = _isFiniteNumber(s.annualProfit) ? s.annualProfit : 0;
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
     *
     * The average of the two satisfactions is compared against each tier's
     * minSatisfaction, best-first. The first tier whose threshold the
     * average meets or exceeds wins. If neither satisfaction is a number,
     * both default to 70 (the "neutral" starting value used by
     * household-servant.js when creating a relationship).
     *
     * Pure.
     *
     * @param {number} employerSatisfaction - 0..100
     * @param {number} servantSatisfaction - 0..100
     * @returns {Object} SERVICE_QUALITY tier object
     */
    function calculateServiceQuality(employerSatisfaction, servantSatisfaction) {
        var e = _isFiniteNumber(employerSatisfaction) ? employerSatisfaction : 70;
        var s = _isFiniteNumber(servantSatisfaction) ? servantSatisfaction : 70;
        var avg = (e + s) / 2;

        var order = C.SERVICE_QUALITY_ORDER;
        for (var i = 0; i < order.length; i++) {
            if (avg >= order[i].minSatisfaction) return order[i];
        }
        // The last tier has minSatisfaction 0; this is unreachable.
        return order[order.length - 1];
    }

    /**
     * Recommendation string from a satisfaction score.
     * Pure.
     */
    function calculateRecommendation(satisfaction) {
        var s = _isFiniteNumber(satisfaction) ? satisfaction : 0;
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
     * Returns 0 for unknown conditions or missing residence.
     *
     * Pure.
     *
     * @param {Object} residence - residence snapshot with `condition` and
     *   `estimatedValue`. Missing estimatedValue defaults to
     *   THRESHOLDS.DEFAULT_ESTIMATED_VALUE.
     * @param {string} targetCondition - one of RESIDENCE_CONDITIONS ids.
     * @returns {number} repair cost in gold, or 0.
     */
    function calculateRepairCost(residence, targetCondition) {
        if (!residence) return 0;

        var currentCondition = residence.condition || 'good';
        var currentM = C.CONDITION_MULTIPLIER[currentCondition];
        var targetM = C.CONDITION_MULTIPLIER[targetCondition];
        if (typeof currentM !== 'number' || typeof targetM !== 'number') {
            return 0;
        }

        var baseValue = _isFiniteNumber(residence.estimatedValue)
            ? residence.estimatedValue
            : C.THRESHOLDS.DEFAULT_ESTIMATED_VALUE;

        var repairFactor = targetM - currentM;
        if (repairFactor <= 0) return 0;
        return Math.round(baseValue * repairFactor * 0.5);
    }

    /**
     * New estimated value after rehabilitation.
     *
     * Value grows by 5% of the multiplier change, applied to the old value.
     * Returns the old value for unknown conditions. Pure.
     *
     * @param {number} estimatedValue
     * @param {string} currentCondition
     * @param {string} targetCondition
     * @returns {number}
     */
    function calculateRehabilitatedValue(estimatedValue, currentCondition, targetCondition) {
        var oldValue = _isFiniteNumber(estimatedValue)
            ? estimatedValue
            : C.THRESHOLDS.DEFAULT_ESTIMATED_VALUE;

        var currentM = C.CONDITION_MULTIPLIER[currentCondition];
        var targetM = C.CONDITION_MULTIPLIER[targetCondition];
        if (typeof currentM !== 'number' || typeof targetM !== 'number') {
            return oldValue;
        }

        var factor = 1 + 0.05 * (targetM - currentM);
        if (factor <= 0) return oldValue;
        return Math.round(oldValue * factor);
    }

    /**
     * Count occupied units. A unit is occupied if it has a householdId,
     * is not demolished, and is not vacant. Pure.
     *
     * @param {Array} units
     * @returns {number}
     */
    function calculateOccupiedUnitCount(units) {
        if (!Array.isArray(units)) return 0;
        var n = 0;
        for (var i = 0; i < units.length; i++) {
            var u = units[i];
            if (!u || u.isDemolished === true) continue;
            if (u.isVacant !== true && _hasId(u.householdId)) n++;
        }
        return n;
    }

    /**
     * Count vacant (usable) units. Pure.
     *
     * @param {Array} units
     * @returns {number}
     */
    function calculateVacantUnitCount(units) {
        if (!Array.isArray(units)) return 0;
        var n = 0;
        for (var i = 0; i < units.length; i++) {
            var u = units[i];
            if (!u || u.isDemolished === true) continue;
            if (u.isVacant === true) n++;
        }
        return n;
    }

    /**
     * Whether a residence is vacant (no occupied units). Pure.
     *
     * A residence with zero units is vacant. A residence whose only units
     * are demolished is vacant.
     *
     * @param {Array} units
     * @returns {boolean}
     */
    function isResidenceVacant(units) {
        if (!Array.isArray(units)) return true;
        for (var i = 0; i < units.length; i++) {
            var u = units[i];
            if (!u || u.isDemolished === true) continue;
            if (u.isVacant !== true && _hasId(u.householdId)) return false;
        }
        return true;
    }

    /**
     * Full unit statistics for a residence's units. Pure.
     *
     * occupancyRate is a rounded integer 0..100. A residence with zero
     * usable units (all demolished, or empty) has occupancyRate 0.
     *
     * @param {Array} units
     * @returns {{total, usable, occupied, vacant, demolished, occupancyRate}}
     */
    function calculateUnitStats(units) {
        var total = Array.isArray(units) ? units.length : 0;
        var occupied = calculateOccupiedUnitCount(units);
        var vacant = calculateVacantUnitCount(units);
        var demolished = 0;
        if (Array.isArray(units)) {
            for (var i = 0; i < units.length; i++) {
                if (units[i] && units[i].isDemolished === true) demolished++;
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
    // 6. HOUSEHOLD STATUS AND VACANCY
    // =========================================================================

    /**
     * Derives household status from member counts and the persisted status.
     *
     * Precedence:
     *   1. 'destroyed'  (persisted)
     *   2. 'deprecated' (persisted)
     *   3. 'empty'      (totalMembers === 0)
     *   4. 'vacant'     (livingCount === 0, totalMembers > 0)
     *   5. 'declining'  (living/total ≤ 0.5 with ≥ 4 members)
     *   6. 'active'
     *
     * The caller computes the counts from member → character lookups and
     * passes them in. This function does not read state.
     *
     * Pure.
     *
     * @param {Object} counts - {livingCount, deceasedCount, missingCount,
     *   totalMembers}. Anything missing is treated as 0.
     * @param {string|null} persistedStatus
     * @returns {string} status id
     */
    function calculateHouseholdStatus(counts, persistedStatus) {
        var c = counts || {};
        var living = _isFiniteNumber(c.livingCount) ? c.livingCount : 0;
        var total = _isFiniteNumber(c.totalMembers) ? c.totalMembers : 0;

        if (persistedStatus === 'destroyed') return 'destroyed';
        if (persistedStatus === 'deprecated') return 'deprecated';

        if (total === 0) return 'empty';
        if (living === 0) return 'vacant';
        if (total > 3 && (living / total) <= 0.5) return 'declining';
        return 'active';
    }

    /**
     * Whether a household is effectively vacant.
     *
     * Vacant means: no members, OR no living members with a resolvable
     * character projection. A household whose members are all missing
     * (deleted characters) is vacant — no successor can be appointed.
     *
     * @param {Object} household - canonical household record
     * @param {Function} getCharacterById
     * @returns {boolean}
     */
    function isHouseholdVacant(household, getCharacterById) {
        if (!household) return true;
        if (!Array.isArray(household.members) || household.members.length === 0) {
            return true;
        }
        if (typeof getCharacterById !== 'function') return false;

        for (var i = 0; i < household.members.length; i++) {
            var m = household.members[i];
            if (!m || !_hasId(m.characterId)) continue;
            var character = null;
            try {
                character = getCharacterById(m.characterId);
            } catch (e) {
                character = null;
            }
            if (character && character.isDeceased !== true) return false;
        }
        return true;
    }

    // =========================================================================
    // 7. HEIR ELIGIBILITY
    // =========================================================================

    /**
     * Filters heir candidates by age range.
     *
     * @param {Array} candidates - [{id, age, ...}] already collected from
     *   HouseholdQueries.getHouseholdHeirs (which handles external
     *   children/siblings).
     * @param {Object} options - {minAge, maxAge}. Both optional.
     * @returns {Array} filtered candidates (same order).
     */
    function filterEligibleHeirs(candidates, options) {
        if (!Array.isArray(candidates)) return [];
        options = options || {};

        var minAge = _isFiniteNumber(options.minAge) ? options.minAge : null;
        var maxAge = _isFiniteNumber(options.maxAge) ? options.maxAge : null;

        if (minAge === null && maxAge === null) return candidates.slice();

        return candidates.filter(function(c) {
            if (!c || c.age === null || c.age === undefined) return false;
            if (minAge !== null && c.age < minAge) return false;
            if (maxAge !== null && c.age > maxAge) return false;
            return true;
        });
    }

    // =========================================================================
    // 8. DEMOGRAPHICS
    // =========================================================================

    /**
     * Aggregate demographic statistics from member projections.
     *
     * @param {Array} members - member projections from
     *   HouseholdQueries.getHouseholdMembers. Each must have `age`,
     *   `character.gender`, `isDeceased`, `isMissing`.
     * @returns {Object} demographic counts + byAgeGroup map
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
            if (!m) continue;
            stats.total++;

            if (m.isMissing) {
                stats.missing++;
                continue;
            }

            var c = m.character || {};
            if (c.gender === 'male') stats.male++;
            else if (c.gender === 'female') stats.female++;
            else stats.unknown++;

            if (m.isDeceased === true) stats.deceased++;
            else stats.living++;

            var age = m.age;
            if (age === null || age === undefined) {
                stats.ageUnknown++;
                continue;
            }
            if (!_isFiniteNumber(age) || age < 0) {
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
        deriveDeprecationSuccessor: deriveDeprecationSuccessor,
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
        isHouseholdVacant: isHouseholdVacant,

        // Demographics
        calculateDemographics: calculateDemographics,

        // Diagnostics
        version: 3,
        isPure: true,
        dependsOnConstants: true
    };

    window.HouseholdRules = api;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }

})();
