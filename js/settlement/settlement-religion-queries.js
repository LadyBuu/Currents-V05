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
 * DEPENDENCIES (REQUIRED at load):
 *   - SettlementQueries
 *   - LocationQueries
 *   - ReligionQueries
 *   - CharacterQueries
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

    function getReligiousBreakdown(locationId) {
        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) return null;

        var locationIds = _getLocationIdsForSettlement(locationId);
        return _getReligionQueries().getReligiousBreakdownForLocations(locationIds);
    }

    // =========================================================================
    // 5. DOMINANT RELIGION (DERIVED)
    // =========================================================================

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
