/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT RELIGION QUERIES
 * js/settlement/settlement-religion-queries.js
 * =============================================================================
 *
 * SETTLEMENT RELIGION QUERIES.
 *
 * This file provides read-only queries about religion within a
 * settlement. It answers:
 *   - how many places of worship does a settlement have?
 *   - what places of worship are associated with a settlement?
 *   - what is the settlement's dominant religion?
 *   - what is the settlement's religious unity value?
 *   - how is the settlement's population distributed across religions?
 *
 * It is a query module. It:
 *   - reads canonical settlement data through SettlementQueries
 *   - reads worship-place entities and religion entities through the
 *     Religion domain
 *   - reads character religion through the Character domain
 *   - does not mutate anything
 *   - does not persist
 *   - does not display UI
 *   - does not fabricate missing values
 *   - does not use recursion guards
 *
 * Contract reference: Settlement Architecture Contracts §10 (Query
 * Contract), §11 (Query Results and Missing Data), §20 (Place of Worship
 * Contract), §32 (Completion Standard).
 *
 * Ownership:
 *
 *   Per §20, worship-place entities belong to the Religion domain.
 *   Religion owns:
 *     - the worship-place record (id, name, type, religion, active state)
 *     - the worship-place's locationId linkage
 *
 *   Settlement owns only a local relationship if one is needed for
 *   settlement-specific facts. Under the current architecture, no such
 *   facts exist, so this module does not read `settlement.placesOfWorship`
 *   at all. It reads places of worship by asking Religion for all worship
 *   places whose locationId is within this settlement's location set.
 *
 *   `dominantReligionId` and `religiousUnity` are derived, per §20 and the
 *   accompanying correction. This module exposes them as derived values;
 *   it does not treat a stored settlement field as authoritative for them.
 *   If a later requirement introduces a settlement-authored override (e.g.
 *   an official religion distinct from the mathematically dominant one),
 *   that override is a distinct canonical field with its own commands and
 *   queries. It is not handled here until the contract is amended.
 *
 * Missing data:
 *
 *   - settlement missing                  → queries return null
 *   - settlement exists, no worship       → queries return [] or 0
 *   - Religion subsystem missing          → the call throws (required)
 *   - character location unavailable      → not counted
 *   - no religion has any followers       → dominantReligion null
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

    function _getLocationState() {
        return window.LocationState;
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
        var locationState = _getLocationState();
        if (typeof locationState.getAllSubLocationIds === 'function') {
            var ids = locationState.getAllSubLocationIds(locationId);
            if (ids && ids.length > 0) return ids;
        }
        return [locationId];
    }

    function _isActivePlace(place) {
        if (!place) return false;
        // Religion owns the active state. The convention is `isActive`
        // with a boolean value. A missing `isActive` field is treated as
        // active; if the religion system later changes this convention,
        // this function is the single place to update.
        return place.isActive !== false;
    }

    // =========================================================================
    // 3. PLACES OF WORSHIP
    // =========================================================================

    /**
     * Returns all places of worship located in a settlement's location
     * set (the settlement's own location plus any sub-locations).
     *
     * Returns null if the settlement does not exist. Returns [] if there
     * are no places of worship.
     *
     * @param {string} locationId
     * @returns {Array<Object>|null}
     */
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

    /**
     * Returns the number of places of worship in a settlement.
     * Returns null if the settlement does not exist.
     *
     * @param {string} locationId
     * @returns {number|null}
     */
    function getPlaceOfWorshipCount(locationId) {
        var places = getPlacesOfWorship(locationId);
        return places === null ? null : places.length;
    }

    /**
     * Returns the number of active places of worship in a settlement.
     * Returns null if the settlement does not exist.
     *
     * @param {string} locationId
     * @returns {number|null}
     */
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
    //
    // The Religion domain owns the raw religious breakdown of a location
    // set. This module reads it through ReligionQueries and does not
    // compute the breakdown itself.
    //

    /**
     * Returns the religious breakdown of a settlement's location set.
     *
     * Returns null if the settlement does not exist.
     *
     * Result shape (as provided by ReligionQueries.getReligiousBreakdown):
     *   {
     *     byReligion: { [religionId]: { id, name, count } },
     *     total: number,
     *     unaffiliated: number
     *   }
     *
     * @param {string} locationId
     * @returns {Object|null}
     */
    function getReligiousBreakdown(locationId) {
        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) return null;

        var locationIds = _getLocationIdsForSettlement(locationId);
        return _getReligionQueries().getReligiousBreakdownForLocations(locationIds);
    }

    // =========================================================================
    // 5. DOMINANT RELIGION (DERIVED)
    // =========================================================================
    //
    // Dominant religion is derived, per §20. The rule:
    //   - the religion with the highest follower count in the settlement
    //     is the dominant religion
    //   - if the unaffiliated count exceeds the highest religion count,
    //     there is no dominant religion
    //   - if no religion has any followers and there are no unaffiliated
    //     individuals, there is no dominant religion
    //
    // This rule is a query-level derivation. It is not a policy decision.
    // If a settlement policy override is ever introduced, that is a
    // distinct canonical field with its own semantics, and this function
    // is where the override is honoured. Until the contract is amended,
    // no override exists.
    //

    /**
     * Returns the dominant religion of a settlement, or null if there is
     * no dominant religion.
     *
     * Returns null if the settlement does not exist.
     *
     * @param {string} locationId
     * @returns {Object|null}   religion record
     */
    function getDominantReligion(locationId) {
        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) return null;

        var breakdown = getReligiousBreakdown(locationId);
        if (!breakdown) return null;

        var byReligion = breakdown.byReligion || {};
        var unaffiliated = breakdown.unaffiliated || 0;

        var maxCount = 0;
        var dominantId = null;

        for (var religionId in byReligion) {
            if (!Object.prototype.hasOwnProperty.call(byReligion, religionId)) continue;
            var entry = byReligion[religionId];
            var count = entry && typeof entry.count === 'number' ? entry.count : 0;
            if (count > maxCount) {
                maxCount = count;
                dominantId = religionId;
            }
        }

        if (maxCount === 0) return null;
        if (unaffiliated > maxCount) return null;

        var religionQueries = _getReligionQueries();
        return religionQueries.getReligion(dominantId);
    }

    // =========================================================================
    // 6. RELIGIOUS UNITY (DERIVED)
    // =========================================================================
    //
    // Religious unity is a derived measure, per §20. The rule:
    //   - 50 is the neutral baseline
    //   - the dominant religion's share of the population raises unity
    //     proportionally, up to +50
    //   - unaffiliated presence applies a small penalty
    //   - a strong dominant religion (>= 10 followers) applies a small
    //     bonus
    //   - the result is clamped to [0, 100]
    //
    // This is a domain rule. It is exposed here as a query over the
    // canonical inputs. When the rule is complex enough to warrant its
    // own module, it moves to SettlementReligionRules. For now, the rule
    // is small enough to live here, and it is documented.
    //

    /**
     * Returns the religious unity value of a settlement as an integer
     * in [0, 100]. Returns null if the settlement does not exist.
     *
     * @param {string} locationId
     * @returns {number|null}
     */
    function getReligiousUnity(locationId) {
        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) return null;

        var breakdown = getReligiousBreakdown(locationId);
        if (!breakdown) return 50;

        var byReligion = breakdown.byReligion || {};
        var total = breakdown.total || 0;
        var unaffiliated = breakdown.unaffiliated || 0;

        if (total === 0) return 50;

        var maxCount = 0;
        for (var religionId in byReligion) {
            if (!Object.prototype.hasOwnProperty.call(byReligion, religionId)) continue;
            var entry = byReligion[religionId];
            var count = entry && typeof entry.count === 'number' ? entry.count : 0;
            if (count > maxCount) maxCount = count;
        }

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

        return Math.round(unity);
    }

    // =========================================================================
    // 7. EXPORTS
    // =========================================================================

    window.SettlementReligionQueries = Object.freeze({
        getPlacesOfWorship: getPlacesOfWorship,
        getPlaceOfWorshipCount: getPlaceOfWorshipCount,
        getActivePlaceOfWorshipCount: getActivePlaceOfWorshipCount,
        getReligiousBreakdown: getReligiousBreakdown,
        getDominantReligion: getDominantReligion,
        getReligiousUnity: getReligiousUnity
    });

})();
