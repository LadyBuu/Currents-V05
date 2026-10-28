/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT RELIGION QUERIES
 * js/settlement/settlement-religion-queries.js
 * =============================================================================
 *
 * SETTLEMENT RELIGION QUERIES.
 *
 * Read-only queries about religion within a settlement.
 *
 * Location hierarchy:
 *   Owned by LocationQueries. Corrected from
 *   LocationState.getAllSubLocationIds to
 *   LocationQueries.getAllSubLocationIds.
 *
 * MISSING-VALUE SEMANTICS:
 *   Three distinct states are now distinguished and exposed separately:
 *
 *     'available'         the calculation produced a meaningful result
 *     'no_population'     the settlement has zero counted population —
 *                         unity and dominant religion are undefined,
 *                         not fabricated. Unity returns null; dominant
 *                         religion returns null.
 *     'no_breakdown'      ReligionQueries returned no breakdown object —
 *                         the religion domain is unavailable or the
 *                         breakdown could not be composed. Unity returns
 *                         null; dominant religion returns null.
 *
 *   The prior revision returned 50 for unity when total === 0, which
 *   fabricated a domain value. It collapsed "zero population" and
 *   "breakdown unavailable" into the same number, and the fabricated
 *   50 flowed into SettlementProsperityQueries.modifiers.religiousUnity
 *   as a neutral reading that looked correct but was meaningless.
 *
 *   Per settlement-docs.txt §4 and §19, missing data is not converted
 *   into a domain fact. Unity and dominant religion now return null
 *   when the inputs are unavailable, and the caller distinguishes the
 *   two states by reading the corresponding *Status query.
 *
 * RELIGIOUS UNITY DEFINITION:
 *   Unity measures how religiously homogeneous a settlement is.
 *
 *     unity = 50 + (dominantProportion * 50)
 *
 *   where dominantProportion is the fraction of the population
 *   belonging to the largest religion (including unaffiliated if it
 *   is the largest single group).
 *
 *   Two penalties apply on top of the base:
 *     - unaffiliated population: -min(10, unaffiliated / 10)
 *     - small dominant group bonus: +2 if the dominant group has > 10
 *       members (a small absolute number is treated as evidence that
 *       the settlement is still forming).
 *
 *   The result is clamped to [0, 100] and rounded. The two bonuses
 *   are preserved from the prior revision; only the "no population"
 *   and "no breakdown" cases change.
 *
 * DOMINANT RELIGION DEFINITION:
 *   The dominant religion is the single religion with the highest
 *   member count, IF that count is strictly greater than the
 *   unaffiliated count. If unaffiliated membership is at least as
 *   large as any religion, there is no dominant religion (the
 *   settlement is majority unaffiliated).
 *
 *   The prior revision returned null in both the "no religions" case
 *   and the "unaffiliated majority" case. Those are now distinguished
 *   by the reason code on the status query.
 *
 * DEPENDENCIES (REQUIRED at load):
 *   - SettlementQueries
 *   - LocationQueries
 *   - ReligionQueries
 *   - CharacterQueries
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - getReligiousUnity no longer returns 50 when total === 0 or
 *       when the breakdown is missing. It returns null for both, and
 *       the two are distinguished via the new getReligiousUnityStatus
 *       helper.
 *     - getDominantReligion no longer returns null for both "no
 *       religions" and "unaffiliated majority". getDominantReligionStatus
 *       exposes the reason.
 *     - getReligiousBreakdown now validates the shape returned by
 *       ReligionQueries.getReligiousBreakdownForLocations and returns
 *       null for a malformed or missing breakdown instead of letting
 *       the wrong shape flow into getReligiousUnity.
 *     - Header MISSING-VALUE SEMANTICS, RELIGIOUS UNITY DEFINITION, and
 *       DOMINANT RELIGION DEFINITION sections added.
 *     - No public signature change to any existing function. The
 *       existing functions getReligiousUnity and getDominantReligion
 *       keep their names and continue to return number|null and
 *       Object|null respectively; the only behavioral change is the
 *       replacement of the fabricated 50 with null in the two
 *       unavailable cases.
 *   Previous revisions:
 *     - Corrected from LocationState.getAllSubLocationIds to
 *       LocationQueries.getAllSubLocationIds.
 *     - Initial implementation.
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

    function _getLocationQueries() {
        return window.LocationQueries;
    }

    function _getReligionQueries() {
        return window.ReligionQueries;
    }

    function _getCharacterQueries() {
        return window.CharacterQueries;
    }

    // =========================================================================
    // 2. HELPERS
    // =========================================================================

    function _getLocationIdsForSettlement(locationId) {
        var ids = _getLocationQueries().getAllSubLocationIds(locationId);
        if (ids && ids.length > 0) return ids;
        return [locationId];
    }

    function _isActivePlace(place) {
        if (!place) return false;
        return place.isActive !== false;
    }

    /**
     * Normalizes a breakdown object returned by
     * ReligionQueries.getReligiousBreakdownForLocations into the shape
     * this module expects:
     *
     *   {
     *     byReligion: { [religionId]: { count: number } },
     *     unaffiliated: number,
     *     total: number
     *   }
     *
     * Returns null when the input is malformed. Callers treat null as
     * "breakdown unavailable" and return null from the corresponding
     * query — they do not fabricate a value.
     *
     * @private
     * @param {*} raw
     * @returns {Object|null}
     */
    function _normalizeBreakdown(raw) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

        var byReligion = raw.byReligion;
        var unaffiliated = raw.unaffiliated;
        var total = raw.total;

        if (typeof unaffiliated !== 'number' || !isFinite(unaffiliated) || unaffiliated < 0) {
            return null;
        }
        if (typeof total !== 'number' || !isFinite(total) || total < 0) {
            return null;
        }
        if (!byReligion || typeof byReligion !== 'object' || Array.isArray(byReligion)) {
            return null;
        }

        return {
            byReligion: byReligion,
            unaffiliated: unaffiliated,
            total: total
        };
    }

    /**
     * Returns the religion id and count of the largest religion entry
     * in the breakdown. Does not consider unaffiliated. Returns
     * { id: null, count: 0 } when there are no religions.
     *
     * @private
     */
    function _largestReligion(breakdown) {
        var maxCount = 0;
        var dominantId = null;

        var byReligion = breakdown.byReligion;
        for (var religionId in byReligion) {
            if (!Object.prototype.hasOwnProperty.call(byReligion, religionId)) continue;
            var entry = byReligion[religionId];
            var count = entry && typeof entry.count === 'number' ? entry.count : 0;
            if (count > maxCount) {
                maxCount = count;
                dominantId = religionId;
            }
        }

        return { id: dominantId, count: maxCount };
    }

    // =========================================================================
    // 3. PLACES OF WORSHIP
    // =========================================================================

    function getPlacesOfWorship(locationId) {
        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) return null;

        var locationIds = _getLocationIdsForSettlement(locationId);
        var religionQueries = _getReligionQueries();
        var result = [];

        for (var i = 0; i < locationIds.length; i++) {
            var places = religionQueries.getPlacesOfWorshipByLocation(locationIds[i]);
            if (!places) continue;
            for (var j = 0; j < places.length; j++) {
                result.push(places[j]);
            }
        }

        return result;
    }

    function getPlaceOfWorshipCount(locationId) {
        var places = getPlacesOfWorship(locationId);
        return places === null ? null : places.length;
    }

    function getActivePlaceOfWorshipCount(locationId) {
        var places = getPlacesOfWorship(locationId);
        if (places === null) return null;
        var count = 0;
        for (var i = 0; i < places.length; i++) {
            if (_isActivePlace(places[i])) count++;
        }
        return count;
    }

    // =========================================================================
    // 4. RELIGIOUS BREAKDOWN
    // =========================================================================

    /**
     * Returns the religious breakdown for a settlement, or null when
     * the settlement does not exist or the breakdown is unavailable.
     *
     * The returned object has the shape:
     *   { byReligion: { [religionId]: { count: number } },
     *     unaffiliated: number,
     *     total: number }
     *
     * Returns null when the raw breakdown from ReligionQueries is
     * missing or malformed. See MISSING-VALUE SEMANTICS in the module
     * header.
     *
     * @param {string} locationId
     * @returns {Object|null}
     */
    function getReligiousBreakdown(locationId) {
        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) return null;

        var locationIds = _getLocationIdsForSettlement(locationId);
        var raw = _getReligionQueries().getReligiousBreakdownForLocations(locationIds);
        return _normalizeBreakdown(raw);
    }

    // =========================================================================
    // 5. DOMINANT RELIGION (DERIVED)
    // =========================================================================

    /**
     * Returns the dominant religion as a full religion record, or null
     * when no dominant religion exists (either no population, no
     * religions, or unaffiliated majority), or when the settlement does
     * not exist.
     *
     * Callers that need to distinguish the reasons read
     * getDominantReligionStatus.
     *
     * @param {string} locationId
     * @returns {Object|null}
     */
    function getDominantReligion(locationId) {
        var status = getDominantReligionStatus(locationId);
        return status.religion;
    }

    /**
     * Returns the dominant religion together with the reason it is or
     * is not defined.
     *
     * Returns:
     *   {
     *     religion: Object|null,
     *     religionId: string|null,
     *     reason: 'available' | 'no_population' | 'no_breakdown' |
     *             'unaffiliated_majority' | 'no_religions' |
     *             'settlement_not_found'
     *   }
     *
     *   'available'             a dominant religion was resolved
     *   'no_population'         the settlement has zero counted
     *                           population; there is no dominant group
     *   'no_breakdown'          the breakdown is unavailable; cannot
     *                           determine a dominant religion
     *   'unaffiliated_majority' unaffiliated is >= the largest
     *                           religion's count; no religion is
     *                           dominant
     *   'no_religions'          there are no religions in the
     *                           breakdown at all
     *   'settlement_not_found'  the settlement itself does not exist
     *
     * @param {string} locationId
     * @returns {{
     *   religion: Object|null,
     *   religionId: string|null,
     *   reason: string
     * }}
     */
    function getDominantReligionStatus(locationId) {
        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) {
            return { religion: null, religionId: null, reason: 'settlement_not_found' };
        }

        var breakdown = getReligiousBreakdown(locationId);
        if (!breakdown) {
            return { religion: null, religionId: null, reason: 'no_breakdown' };
        }

        if (breakdown.total === 0) {
            return { religion: null, religionId: null, reason: 'no_population' };
        }

        var largest = _largestReligion(breakdown);
        if (largest.id === null) {
            return { religion: null, religionId: null, reason: 'no_religions' };
        }

        if (breakdown.unaffiliated >= largest.count) {
            return { religion: null, religionId: null, reason: 'unaffiliated_majority' };
        }

        var religionQueries = _getReligionQueries();
        var religion = religionQueries.getReligion(largest.id);
        if (!religion) {
            // The breakdown named a religion id, but ReligionQueries could
            // not resolve it. That is a data integrity problem; treat as
            // unavailable rather than reporting a null-id success.
            return { religion: null, religionId: null, reason: 'no_breakdown' };
        }

        return { religion: religion, religionId: largest.id, reason: 'available' };
    }

    // =========================================================================
    // 6. RELIGIOUS UNITY (DERIVED)
    // =========================================================================

    /**
     * Returns the religious unity of a settlement as a number in
     * [0, 100], or null when the unity cannot be determined (zero
     * population or breakdown unavailable).
     *
     * See RELIGIOUS UNITY DEFINITION in the module header for the
     * calculation. See MISSING-VALUE SEMANTICS for the null cases.
     *
     * Callers that need to distinguish the reasons read
     * getReligiousUnityStatus.
     *
     * @param {string} locationId
     * @returns {number|null}
     */
    function getReligiousUnity(locationId) {
        var status = getReligiousUnityStatus(locationId);
        return status.unity;
    }

    /**
     * Returns the religious unity together with the reason it is or is
     * not defined.
     *
     * Returns:
     *   {
     *     unity: number|null,
     *     reason: 'available' | 'no_population' | 'no_breakdown' |
     *             'settlement_not_found'
     *   }
     *
     * @param {string} locationId
     * @returns {{ unity: number|null, reason: string }}
     */
    function getReligiousUnityStatus(locationId) {
        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) {
            return { unity: null, reason: 'settlement_not_found' };
        }

        var breakdown = getReligiousBreakdown(locationId);
        if (!breakdown) {
            return { unity: null, reason: 'no_breakdown' };
        }

        if (breakdown.total === 0) {
            return { unity: null, reason: 'no_population' };
        }

        var byReligion = breakdown.byReligion;
        var total = breakdown.total;
        var unaffiliated = breakdown.unaffiliated;

        // Find the largest single group. Unaffiliated competes with the
        // largest religion for "dominant group" status for the purposes
        // of the unity calculation, matching the prior revision's
        // behavior.
        var largest = _largestReligion(breakdown);
        var maxCount = largest.count;

        if (unaffiliated > maxCount) {
            maxCount = unaffiliated;
        }

        var dominantProportion = total > 0 ? maxCount / total : 0;
        var unity = 50 + (dominantProportion * 50);

        if (unaffiliated > 0) {
            unity -= Math.min(10, unaffiliated / 10);
        }

        if (maxCount > 10) {
            unity = Math.min(100, unity + 2);
        }

        if (unity < 0) unity = 0;
        if (unity > 100) unity = 100;

        return { unity: Math.round(unity), reason: 'available' };
    }

    // =========================================================================
    // 7. EXPORTS
    // =========================================================================

    window.SettlementReligionQueries = Object.freeze({
        // Places of worship
        getPlacesOfWorship: getPlacesOfWorship,
        getPlaceOfWorshipCount: getPlaceOfWorshipCount,
        getActivePlaceOfWorshipCount: getActivePlaceOfWorshipCount,

        // Breakdown
        getReligiousBreakdown: getReligiousBreakdown,

        // Dominant religion
        getDominantReligion: getDominantReligion,
        getDominantReligionStatus: getDominantReligionStatus,

        // Religious unity
        getReligiousUnity: getReligiousUnity,
        getReligiousUnityStatus: getReligiousUnityStatus
    });

})();
