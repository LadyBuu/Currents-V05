/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT EDUCATION QUERIES
 * js/settlement/settlement-education-queries.js
 * =============================================================================
 *
 * EDUCATION QUERIES.
 *
 * This file provides read-only queries about education and literacy
 * within a settlement. It answers:
 *   - how many schools does a settlement have?
 *   - what is a settlement's literacy rate?
 *   - how is a settlement's population distributed across education
 *     levels?
 *   - what is the student-to-teacher ratio?
 *   - does a settlement have sufficient school capacity?
 *
 * It is a query module. It:
 *   - reads canonical settlement data through SettlementQueries
 *   - reads education levels from SettlementEducationDefinitions
 *   - reads feature-based education facts from SettlementFeatureQueries
 *   - reads population and character location data through canonical
 *     query modules
 *   - does not mutate anything
 *   - does not persist
 *   - does not display UI
 *   - does not fabricate missing values
 *   - does not use recursion guards
 *
 * Contract reference: Settlement Architecture Contracts §10 (Query
 * Contract), §11 (Query Results and Missing Data), §32 (Completion
 * Standard).
 *
 * Scope discipline:
 *
 *   Education is a cross-domain concern. This module composes facts from:
 *     - Settlement (does the settlement have a school feature?)
 *     - Character (which characters live in the settlement?)
 *     - Education domain (what is each character's education level?)
 *     - Location (population and sub-location hierarchy)
 *
 *   The canonical source for a character's education level and literacy
 *   status is the Education domain. This module reads it through the
 *   Education queries API. It does not maintain a second education
 *   system. It does not read `character.subjectProgress.literacy`
 *   directly. That legacy field is not the canonical source under the
 *   new architecture.
 *
 *   If the Education domain exposes different accessors than those named
 *   here, this module is the single place to update; no other module
 *   should reach into education state directly.
 *
 * Missing data:
 *
 *   - settlement missing             → queries return null
 *   - settlement has no schools      → counts of 0, ratios null
 *   - education subsystem missing    → the call throws (required dep)
 *   - character location unavailable → treated as not-in-settlement
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

    function _getFeatureQueries() {
        return window.SettlementFeatureQueries;
    }

    function _getEducationDefinitions() {
        return window.SettlementEducationDefinitions;
    }

    function _getLocationState() {
        // Required: provides sub-location hierarchy for "characters in
        // this settlement" queries.
        return window.LocationState;
    }

    function _getCharacterQueries() {
        // Required: provides character location and education level.
        return window.CharacterQueries;
    }

    // =========================================================================
    // 2. HELPERS
    // =========================================================================

    function _getEducationLevelsInOrder() {
        var levels = _getEducationDefinitions().EDUCATION_LEVELS;
        var copy = levels.slice();
        copy.sort(function (a, b) { return a.order - b.order; });
        return copy;
    }

    function _getEducationLevelById(levelId) {
        var levels = _getEducationDefinitions().EDUCATION_LEVELS;
        for (var i = 0; i < levels.length; i++) {
            if (levels[i].id === levelId) return levels[i];
        }
        return null;
    }

    function _getLocationIdsForSettlement(locationId) {
        // Includes the settlement's own location plus any sub-locations.
        var locationState = _getLocationState();
        if (typeof locationState.getAllSubLocationIds === 'function') {
            var ids = locationState.getAllSubLocationIds(locationId);
            if (ids && ids.length > 0) return ids;
        }
        return [locationId];
    }

    function _isFeatureCategory(feature, categoryId) {
        return feature && feature.category === categoryId;
    }

    function _isEducationFeature(feature) {
        // A feature is treated as an education facility if it provides
        // educationBonus > 1.0 or literacyBonus > 0. This avoids
        // hardcoding feature ids here while still identifying the
        // education-relevant subset of the catalog.
        if (!feature) return false;
        if (typeof feature.educationBonus === 'number' && feature.educationBonus > 1.0) return true;
        if (typeof feature.literacyBonus === 'number' && feature.literacyBonus > 0) return true;
        return false;
    }

    // =========================================================================
    // 3. BASIC SCHOOL QUERIES
    // =========================================================================

    /**
     * Returns the number of education facilities in a settlement.
     * Returns null if the settlement does not exist.
     *
     * @param {string} locationId
     * @returns {number|null}
     */
    function getSchoolCount(locationId) {
        var features = _getFeatureQueries().getSettlementFeatures(locationId);
        if (features === null) return null;
        var count = 0;
        for (var i = 0; i < features.length; i++) {
            if (_isEducationFeature(features[i])) count++;
        }
        return count;
    }

    /**
     * Returns the education facilities built in a settlement, in the
     * order they appear in the settlement's feature list.
     * Returns null if the settlement does not exist. Returns [] if none.
     *
     * @param {string} locationId
     * @returns {Array<Object>|null}
     */
    function getSchools(locationId) {
        var features = _getFeatureQueries().getSettlementFeatures(locationId);
        if (features === null) return null;
        var result = [];
        for (var i = 0; i < features.length; i++) {
            if (_isEducationFeature(features[i])) {
                result.push(features[i]);
            }
        }
        return result;
    }

    /**
     * Returns true if a settlement has at least one education facility.
     * Returns null if the settlement does not exist.
     *
     * @param {string} locationId
     * @returns {boolean|null}
     */
    function hasSchools(locationId) {
        var count = getSchoolCount(locationId);
        return count === null ? null : count > 0;
    }

    // =========================================================================
    // 4. LITERACY AND EDUCATION LEVELS
    // =========================================================================
    //
    // Character education is owned by the Education domain. This module
    // asks the Character domain for the characters in a settlement, and
    // then asks the Education domain for each character's education level.
    //
    // Population and character aggregation can be expensive; this
    // function iterates once and produces all education-level counters in
    // the same pass.
    //

    /**
     * Returns literacy and education-level statistics for a settlement.
     * Returns null if the settlement does not exist.
     *
     * Result shape:
     *   {
     *     totalPopulation: number,        // characters in settlement
     *     literateCount: number,
     *     literacyRate: number,           // 0-100 integer
     *     educationLevels: {
     *       [levelId]: number
     *     },
     *     hasSchools: boolean,
     *     schoolCount: number
     *   }
     *
     * @param {string} locationId
     * @returns {Object|null}
     */
    function getLiteracyStats(locationId) {
        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) return null;

        var educationLevels = _getEducationLevelsInOrder();
        var levelCounts = {};
        for (var i = 0; i < educationLevels.length; i++) {
            levelCounts[educationLevels[i].id] = 0;
        }

        var locationIds = _getLocationIdsForSettlement(locationId);
        var locationIdSet = {};
        for (var j = 0; j < locationIds.length; j++) {
            locationIdSet[locationIds[j]] = true;
        }

        var characters = _getCharacterQueries().getCharactersInLocations(locationIds);

        var total = 0;
        var literate = 0;

        // "Literate" means level order >= literate's order. We resolve
        // the literate threshold from the education definitions so this
        // module does not hardcode the id.
        var literateThreshold = 0;
        for (var k = 0; k < educationLevels.length; k++) {
            if (educationLevels[k].id === 'literate') {
                literateThreshold = educationLevels[k].order;
                break;
            }
        }

        for (var m = 0; m < characters.length; m++) {
            var character = characters[m];
            if (!character) continue;
            if (character.isDeceased) continue;

            total++;

            var levelId = _getCharacterQueries().getEducationLevelId(character.id);
            var level = levelId ? _getEducationLevelById(levelId) : null;
            if (level) {
                levelCounts[level.id] = (levelCounts[level.id] || 0) + 1;
                if (level.order >= literateThreshold) {
                    literate++;
                }
            } else {
                // No education level available: count as illiterate.
                // This is a domain rule, not a query fabrication. The
                // "illiterate" level is present in every level set.
                if (levelCounts.illiterate !== undefined) {
                    levelCounts.illiterate++;
                }
            }
        }

        var schoolCount = getSchoolCount(locationId);

        return {
            totalPopulation: total,
            literateCount: literate,
            literacyRate: total > 0 ? Math.round((literate / total) * 100) : 0,
            educationLevels: levelCounts,
            hasSchools: schoolCount !== null && schoolCount > 0,
            schoolCount: schoolCount === null ? 0 : schoolCount
        };
    }

    // =========================================================================
    // 5. TEACHING CAPACITY
    // =========================================================================
    //
    // The education system tracks teachers and students separately from
    // settlement population. This query returns what the settlement knows
    // about its own education facilities. Detailed capacity per school is
    // provided by the Education domain; this module provides the
    // settlement-level aggregate.
    //

    /**
     * Returns aggregate capacity and staffing information for a
     * settlement's education facilities.
     *
     * Returns null if the settlement does not exist.
     *
     * Result shape:
     *   {
     *     schoolCount: number,
     *     totalCapacity: number,
     *     totalStudents: number,
     *     totalTeachers: number,
     *     studentTeacherRatio: number|null,   // null if no teachers
     *     capacityUsed: number,               // 0-100 integer
     *     needsMoreSchools: boolean,
     *     capacityGap: number
     *   }
     *
     * If the Education domain does not expose per-school capacity or
     * staffing data, the numeric fields are 0 and the boolean is
     * computed from school existence alone. The shape of the result
     * remains stable; the values are simply less informative.
     *
     * @param {string} locationId
     * @returns {Object|null}
     */
    function getEducationCapacity(locationId) {
        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) return null;

        var schools = getSchools(locationId);
        if (schools === null) return null;

        var result = {
            schoolCount: schools.length,
            totalCapacity: 0,
            totalStudents: 0,
            totalTeachers: 0,
            studentTeacherRatio: null,
            capacityUsed: 0,
            needsMoreSchools: false,
            capacityGap: 0
        };

        var educationQueries = window.EducationQueries;
        if (educationQueries && typeof educationQueries.getSchoolCapacity === 'function') {
            for (var i = 0; i < schools.length; i++) {
                var capacity = educationQueries.getSchoolCapacity(locationId, schools[i].id);
                if (!capacity) continue;
                result.totalCapacity += capacity.capacity || 0;
                result.totalStudents += capacity.students || 0;
                result.totalTeachers += capacity.teachers || 0;
            }

            if (result.totalTeachers > 0) {
                result.studentTeacherRatio = Math.round(result.totalStudents / result.totalTeachers);
            }

            if (result.totalCapacity > 0) {
                result.capacityUsed = Math.round((result.totalStudents / result.totalCapacity) * 100);
            }

            result.capacityGap = Math.max(0, result.totalStudents - result.totalCapacity);
            result.needsMoreSchools = result.capacityGap > 0;
        } else {
            // Education domain does not currently expose capacity data.
            // Report what we can: school count. Everything else stays at
            // its neutral value. This is not fabrication; it is the
            // correct value for "no data available".
            result.needsMoreSchools = false;
        }

        return result;
    }

    // =========================================================================
    // 6. EXPORTS
    // =========================================================================

    window.SettlementEducationQueries = Object.freeze({
        getSchoolCount: getSchoolCount,
        getSchools: getSchools,
        hasSchools: hasSchools,
        getLiteracyStats: getLiteracyStats,
        getEducationCapacity: getEducationCapacity
    });

})();
