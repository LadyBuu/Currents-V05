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
 *   Owned by LocationQueries. The settlement's location subtree is
 *   enumerated via LocationQueries.getAllSubLocationIds, matching the
 *   pattern used by settlement-education-queries.js and
 *   settlement-prosperity-queries.js.
 *
 * BREAKDOWN SHAPE CONTRACT:
 *   Settlement needs the per-religion counts across a location SUBTREE.
 *   That aggregation is owned by ReligionQueries:
 *
 *     ReligionQueries.getReligiousBreakdownForLocations(locationIds)
 *       -> { byReligion: { [religionId]: { count: number } },
 *            unaffiliated: number,
 *            total: number }
 *
 *   Settlement does NOT call ReligionQueries.getReligiousBreakdown
 *   (the single-location variant returning the flat per-religion map
 *   with `unaffiliated: { name, count }`). The flat map is a
 *   religion-side convenience shape; it does not aggregate across a
 *   subtree, and its unaffiliated bucket is an object, not a number.
 *   Prior revisions of this module called a phantom
 *   getReligiousBreakdownForLocations that did not exist on
 *   ReligionQueries; every settlement religious-unity query threw
 *   TypeError on first call. The religion-queries.js current revision
 *   exports the function with the shape this module expects.
 *
 *   _normalizeBreakdown validates the shape strictly. A missing or
 *   malformed breakdown is reported as unavailable (reason:
 *   'no_breakdown'), never coerced into a fabricated zero.
 *
 * MISSING-VALUE SEMANTICS:
 *   Three distinct states, exposed separately:
 *
 *     'available'         the calculation produced a meaningful result
 *     'no_population'     the settlement's subtree has zero counted
 *                         population. Unity and dominant religion are
 *                         undefined, not fabricated.
 *     'no_breakdown'      ReligionQueries returned no usable breakdown
 *                         object. Unity and dominant religion are
 *                         undefined.
 *
 *   Prior revisions returned 50 for unity when total === 0, which
 *   fabricated a domain value. That is prohibited by
 *   settlement-docs.txt §4 (MISSING-VALUE SEMANTICS). Unity and
 *   dominant religion now return null in the unavailable cases, and
 *   the reason code tells the caller which case it was.
 *
 * RELIGIOUS UNITY DEFINITION:
 *   unity = 50 + (dominantProportion * 50)
 *
 *   where dominantProportion is the fraction of the population
 *   belonging to the largest religion (including unaffiliated if it
 *   is the largest single group). Two penalties/bonuses on the base:
 *     - unaffiliated population: -min(10, unaffiliated / 10)
 *     - small dominant group bonus: +2 if the dominant group has > 10
 *       members
 *
 *   Clamped to [0, 100], rounded.
 *
 * DOMINANT RELIGION DEFINITION:
 *   The single religion with the highest member count, IF that count
 *   is strictly greater than the unaffiliated count. If unaffiliated
 *   is at least as large as the largest religion, there is no
 *   dominant religion (majority unaffiliated).
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
 *     - getReligiousBreakdown now calls
 *       ReligionQueries.getReligiousBreakdownForLocations(locationIds)
 *       (plural, array) and returns the aggregate shape
 *       { byReligion, unaffiliated, total }. Prior revisions called the
 *       same name but religion-queries.js did not export it, so every
 *       call threw TypeError.
 *     - _normalizeBreakdown now validates the aggregate shape strictly:
 *       byReligion must be a non-null object, unaffiliated and total
 *       must be finite non-negative numbers. A malformed shape is
 *       reported as null (→ reason 'no_breakdown'), not coerced.
 *     - getReligiousUnityStatus and getDominantReligionStatus now
 *       distinguish 'no_population' (total === 0 with a valid
 *       breakdown) from 'no_breakdown' (breakdown itself unavailable).
 *       Prior revisions collapsed both into a single null value.
 *     - Header BREAKDOWN SHAPE CONTRACT section added, documenting why
 *       settlement uses the plural aggregate form and not the flat
 *       single-location form.
 *     - No behavioral change to getPlacesOfWorship,
 *       getPlaceOfWorshipCount, or getActivePlaceOfWorshipCount.
 *   Previous revisions:
 *     - getReligiousUnity / getDominantReligion stopped returning a
 *       fabricated 50 for zero-population.
 *     - _normalizeBreakdown validation added.
 *     - Corrected from LocationState.getAllSubLocationIds to
 *       LocationQueries.getAllSubLocationIds.
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

    function _isFiniteNumber(v) {
        return typeof v === 'number' && isFinite(v);
    }

    function _isFiniteNonNegativeNumber(v) {
        return _isFiniteNumber(v) && v >= 0;
    }

    /**
     * Validates the aggregate breakdown shape returned by
     * ReligionQueries.getReligiousBreakdownForLocations:
     *
     *   {
     *     byReligion: { [religionId]: { count: number } },
     *     unaffiliated: number,
     *     total: number
     *   }
     *
     * Returns the normalized object, or null when the shape is malformed
     * or missing. Callers treat null as "breakdown unavailable" (reason
     * 'no_breakdown') and do NOT fabricate a value.
     *
     * Strict rules:
     *   - raw must be a non-null, non-array object
     *   - raw.byReligion must be a non-null, non-array object
     *   - each entry must be an object with a finite non-negative count
     *   - raw.unaffiliated must be a finite non-negative number
     *   - raw.total must be a finite non-negative number
     *   - raw.unaffiliated <= raw.total
     *
     * @private
     * @param {*} raw
     * @returns {Object|null}
     */
    function _normalizeBreakdown(raw) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

        var byReligionRaw = raw.byReligion;
        if (!byReligionRaw || typeof byReligionRaw !== 'object'
            || Array.isArray(byReligionRaw)) {
            return null;
        }

        var byReligion = {};
        for (var religionId in byReligionRaw) {
            if (!Object.prototype.hasOwnProperty.call(byReligionRaw, religionId)) {
                continue;
            }
            var entry = byReligionRaw[religionId];
            if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
                return null;
            }
            var count = entry.count;
            if (!_isFiniteNonNegativeNumber(count)) return null;
            byReligion[religionId] = { count: count };
        }

        var unaffiliated = raw.unaffiliated;
        var total = raw.total;
        if (!_isFiniteNonNegativeNumber(unaffiliated)) return null;
        if (!_isFiniteNonNegativeNumber(total)) return null;
        if (unaffiliated > total) return null;

        return {
            byReligion: byReligion,
            unaffiliated: unaffiliated,
            total: total
        };
    }

    /**
     * Returns the religion id and count of the largest religion entry
     * in the breakdown. Does not consider unaffiliated.
     * Returns { id: null, count: 0 } when there are no religions.
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
            var count = entry && _isFiniteNumber(entry.count) ? entry.count : 0;
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
    // 4. RELIGIOUS BREAKDOWN (aggregate across subtree)
    // =========================================================================

    /**
     * Returns the religious breakdown for a settlement's location
     * subtree, or null when the settlement does not exist or the
     * breakdown is unavailable/malformed.
     *
     * Shape (see BREAKDOWN SHAPE CONTRACT in the header):
     *   {
     *     byReligion: { [religionId]: { count: number } },
     *     unaffiliated: number,
     *     total: number
     *   }
     *
     * @param {string} locationId
     * @returns {Object|null}
     */
    function getReligiousBreakdown(locationId) {
        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) return null;

        var locationIds = _getLocationIdsForSettlement(locationId);
        var religionQueries = _getReligionQueries();

        if (typeof religionQueries.getReligiousBreakdownForLocations !== 'function') {
            // The religion module is loaded but does not expose the
            // aggregate function. That is a load-order or version
            // mismatch; report as unavailable rather than throw.
            if (typeof console !== 'undefined' && console.warn) {
                console.warn(
                    'settlement-religion-queries: ' +
                    'ReligionQueries.getReligiousBreakdownForLocations is missing. ' +
                    'Check religion-queries.js version.'
                );
            }
            return null;
        }

        var raw = religionQueries.getReligiousBreakdownForLocations(locationIds);
        return _normalizeBreakdown(raw);
    }

    // =========================================================================
    // 5. DOMINANT RELIGION (DERIVED)
    // =========================================================================

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
     * @param {string} locationId
     * @returns {{ religion: Object|null, religionId: string|null, reason: string }}
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
            // Breakdown named a religion id, but ReligionQueries could
            // not resolve it. Data integrity issue; treat as unavailable
            // rather than reporting a null-id success.
            return { religion: null, religionId: null, reason: 'no_breakdown' };
        }

        return { religion: religion, religionId: largest.id, reason: 'available' };
    }

    // =========================================================================
    // 6. RELIGIOUS UNITY (DERIVED)
    // =========================================================================

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

        var total = breakdown.total;
        var unaffiliated = breakdown.unaffiliated;

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
