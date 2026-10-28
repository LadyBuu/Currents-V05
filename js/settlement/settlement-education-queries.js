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
 * CHARACTER ENUMERATION:
 *   Settlements span a location subtree (a country's towns, a region's
 *   villages, etc.). To compute literacy and education-level statistics,
 *   this module needs every living character whose CURRENT location is
 *   anywhere in that subtree.
 *
 *   "Current location" in the settlement domain is the SEMANTIC notion
 *   owned by world.js::getCurrentLocationId — it honors the explicit
 *   currentLocationId field, the moves-based fallback, and the
 *   birthplace fallback. It is NOT the raw currentLocationId field.
 *
 *   The prior revision called CharacterQueries.getCharactersInLocations,
 *   which filters on c.currentLocationId === locationId. That missed
 *   characters placed via moves (their currentLocationId field is null,
 *   but their latest move points into the subtree), and included
 *   characters whose raw field pointed into the subtree but whose
 *   latest move pointed elsewhere. The under/over-count propagated
 *   into SettlementProsperityQueries.getProsperity, which reads
 *   literacy rate to compute a modifier.
 *
 *   This revision enumerates characters via
 *   CharacterQueries.getAllCharacters() and filters through
 *   LocationQueries.getCurrentLocationId, matching the pattern already
 *   used by location-view-models.js::buildBulkMoveModel and by the
 *   settlement economy / employment / religion / prosperity queries.
 *
 * EDUCATION LEVEL DERIVATION:
 *   The prior revision called CharacterQueries.getEducationLevelId to
 *   resolve a character's education level. That method is not present
 *   on the character-queries.js surface in the current build. This
 *   revision derives the level locally from the character projection:
 *
 *     - character.isLiterate !== true  → illiterate
 *     - otherwise, from character.subjectProgress, pick the highest
 *       level key present (basic / literate / educated / scholar)
 *
 *   The derivation is a settlement-domain read of fields that already
 *   exist on the character projection. It does not duplicate any
 *   character-factory logic; it does not depend on EducationQueries.
 *   If CharacterQueries later exposes a canonical education-level
 *   method, this module can switch to it as a drop-in replacement
 *   without changing the returned shape.
 *
 * DEPENDENCIES (REQUIRED at load):
 *   - SettlementQueries
 *   - SettlementFeatureQueries
 *   - SettlementEducationDefinitions
 *   - LocationQueries
 *   - CharacterQueries
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - Character enumeration switched from
 *       CharacterQueries.getCharactersInLocations (raw-field filter) to
 *       a fresh filter over CharacterQueries.getAllCharacters using
 *       LocationQueries.getCurrentLocationId. This matches the fix
 *       already applied in location-view-models.js::buildBulkMoveModel
 *       and in settlement-prosperity-queries.js. Under-counts literacy
 *       (and downstream prosperity) are fixed.
 *     - Education level resolution switched from
 *       CharacterQueries.getEducationLevelId (not present on the
 *       character-queries.js surface) to a local derivation from
 *       character.isLiterate and character.subjectProgress. The
 *       returned level id matches the education-definitions ids.
 *     - Header CHARACTER ENUMERATION and EDUCATION LEVEL DERIVATION
 *       sections added.
 *     - No public signature change, no public return-shape change.
 *   Previous revisions:
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
        if (!levelId) return null;
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

    /**
     * Resolves the education level id for a character, based on fields
     * present on the character projection.
     *
     * Derivation (see EDUCATION LEVEL DERIVATION in the module header):
     *   - isLiterate !== true           → 'illiterate'
     *   - isLiterate === true, but no
     *     subjectProgress data          → 'literate'
     *   - isLiterate === true with
     *     subjectProgress showing a
     *     higher tier                   → that tier id
     *
     * The higher tiers correspond to the ids declared in
     * SettlementEducationDefinitions: 'basic', 'literate', 'educated',
     * 'scholar'. The ordering used to pick the highest tier matches the
     * definitions' `order` field.
     *
     * @param {Object} character - character projection
     * @returns {string|null} level id or null if the character is missing
     */
    function _deriveEducationLevelId(character) {
        if (!character) return null;

        if (character.isLiterate !== true) {
            return 'illiterate';
        }

        // Literate baseline. subjectProgress may promote to a higher tier.
        var bestLevelId = 'literate';
        var bestOrder = 2;  // literate.order per definitions

        var progress = character.subjectProgress;
        if (progress && typeof progress === 'object') {
            var keys = Object.keys(progress);
            for (var i = 0; i < keys.length; i++) {
                var entry = progress[keys[i]];
                if (!entry || typeof entry !== 'object') continue;

                var key = keys[i];
                var tierOrder = _tierOrderForKey(key);
                if (tierOrder === null) continue;

                if (tierOrder > bestOrder) {
                    var level = _getEducationLevelById(key);
                    if (level) {
                        bestLevelId = level.id;
                        bestOrder = level.order;
                    }
                }
            }
        }

        return bestLevelId;
    }

    /**
     * Maps a subject-progress key to an education-level tier order.
     * Returns null when the key is not an education-level key.
     *
     * Recognized keys match SettlementEducationDefinitions ids that are
     * ordered above 'literate' — namely 'educated' and 'scholar'. The
     * lower tiers are not represented in subjectProgress; a literate
     * character who has not progressed further is the default.
     *
     * @private
     * @param {string} key
     * @returns {number|null}
     */
    function _tierOrderForKey(key) {
        if (key === 'educated') return 3;
        if (key === 'scholar') return 4;
        return null;
    }

    /**
     * Enumerates every living character whose resolved current location
     * is anywhere in the settlement's location subtree.
     *
     * Uses LocationQueries.getCurrentLocationId (the semantic resolver)
     * rather than CharacterQueries.getCharactersInLocations (the raw-
     * field filter). See CHARACTER ENUMERATION in the module header.
     *
     * @private
     * @param {string} locationId
     * @returns {Array<Object>} character projections
     */
    function _getCharactersInSettlement(locationId) {
        var locationIds = _getLocationIdsForSettlement(locationId);
        var idSet = {};
        for (var i = 0; i < locationIds.length; i++) {
            idSet[locationIds[i]] = true;
        }

        var allCharacters = _getCharacterQueries().getAllCharacters();
        if (!Array.isArray(allCharacters)) return [];

        var result = [];
        for (var j = 0; j < allCharacters.length; j++) {
            var character = allCharacters[j];
            if (!character || !character.id) continue;
            if (character.isDeceased === true) continue;

            var resolvedId = _getLocationQueries().getCurrentLocationId(character.id);
            if (resolvedId && idSet[resolvedId]) {
                result.push(character);
            }
        }
        return result;
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

        var characters = _getCharactersInSettlement(locationId);

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

            total++;

            var levelId = _deriveEducationLevelId(character);
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
