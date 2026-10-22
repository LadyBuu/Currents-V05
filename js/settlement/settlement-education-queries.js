/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT EDUCATION QUERIES
 * js/settlement/settlement-education-queries.js
 * =============================================================================
 *
 * EDUCATION QUERIES.
 *
 * Read-only queries about education and literacy within a settlement.
 *
 * Location hierarchy:
 *   Owned by LocationQueries. Corrected from
 *   LocationState.getAllSubLocationIds to
 *   LocationQueries.getAllSubLocationIds.
 *
 * DEPENDENCIES (REQUIRED at load):
 *   - SettlementQueries
 *   - SettlementFeatureQueries
 *   - SettlementEducationDefinitions
 *   - LocationQueries
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

    function _getFeatureQueries() {
        return window.SettlementFeatureQueries;
    }

    function _getEducationDefinitions() {
        return window.SettlementEducationDefinitions;
    }

    function _getLocationQueries() {
        return window.LocationQueries;
    }

    function _getCharacterQueries() {
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
        var ids = _getLocationQueries().getAllSubLocationIds(locationId);
        if (ids && ids.length > 0) return ids;
        return [locationId];
    }

    function _isEducationFeature(feature) {
        if (!feature) return false;
        if (typeof feature.educationBonus === 'number' && feature.educationBonus > 1.0) return true;
        if (typeof feature.literacyBonus === 'number' && feature.literacyBonus > 0) return true;
        return false;
    }

    function _calculateAge(birthYear, isDeceased, deathYear) {
        if (typeof window.calculateAge !== 'function') {
            throw new Error(
                'settlement-education-queries.js requires time.js (calculateAge).'
            );
        }
        return window.calculateAge(birthYear, isDeceased, deathYear);
    }

    // =========================================================================
    // 3. BASIC SCHOOL QUERIES
    // =========================================================================

    function getSchoolCount(locationId) {
        var features = _getFeatureQueries().getSettlementFeatures(locationId);
        if (features === null) return null;
        var count = 0;
        for (var i = 0; i < features.length; i++) {
            if (_isEducationFeature(features[i])) count++;
        }
        return count;
    }

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

    function hasSchools(locationId) {
        var count = getSchoolCount(locationId);
        return count === null ? null : count > 0;
    }

    // =========================================================================
    // 4. LITERACY AND EDUCATION LEVELS
    // =========================================================================

    function getLiteracyStats(locationId) {
        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) return null;

        var educationLevels = _getEducationLevelsInOrder();
        var levelCounts = {};
        for (var i = 0; i < educationLevels.length; i++) {
            levelCounts[educationLevels[i].id] = 0;
        }

        var locationIds = _getLocationIdsForSettlement(locationId);
        var characters = _getCharacterQueries().getCharactersInLocations(locationIds);

        var total = 0;
        var literate = 0;

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
