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
 *   EducationLearning.getEducationLevel(characterId) is the canonical
 *   classifier. It reads only the character's literacy subject progress
 *   and delegates thresholds to EducationRules. Trade/profession skill
 *   levels cannot promote a character to an academic education tier.
 *
 *   Settlement uses the returned education-level id to populate its
 *   distribution. The physical school count is separate: only the
 *   Settlement feature with id "school" counts as a school. Each school
 *   feature is joined to Education institutions at the same location;
 *   institution records remain the authority for enrollment, capacity,
 *   teachers and curriculum.
 *
 * LOCATION SCOPE:
 *   A settlement includes itself and every descendant location. The
 *   selected location is always included even when it has children.
 *
 * DEPENDENCIES (REQUIRED at load):
 *   - SettlementQueries
 *   - SettlementFeatureQueries
 *   - SettlementEducationDefinitions
 *   - LocationQueries
 *   - CharacterQueries
 *   - EducationLearning
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - School counts now include only the physical "school" feature;
 *       libraries remain education-adjacent features, not schools.
 *     - School feature records are joined to institution summaries by
 *       location. Capacity and enrollment are read from EducationQueries.
 *     - Literacy tiers now come from EducationLearning, the canonical
 *       Education-domain classifier, rather than settlement-local skill
 *       thresholds or the cached isLiterate flag.
 *     - Settlement subtree enumeration always includes the selected
 *       location as well as descendants.
 * =============================================================================
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
        var ids = [locationId];
        var descendants = _getLocationQueries().getAllSubLocationIds(locationId) || [];
        var seen = Object.create(null);
        seen[locationId] = true;
        for (var i = 0; i < descendants.length; i++) {
            var id = descendants[i];
            if (!id || seen[id]) continue;
            seen[id] = true;
            ids.push(id);
        }
        return ids;
    }

    // A school building is a Settlement feature. Libraries and other
    // education-adjacent features may affect literacy, but are not schools.
    function _isEducationFeature(feature) {
        return !!feature && feature.id === 'school';
    }

    /**
     * Resolves the education level id for a character, based on the
     * fields present on the character projection.
     *
     * Derivation (see EDUCATION LEVEL DERIVATION and EDUCATION LEVEL
     * THRESHOLDS in the module header):
     *
     *   - isLiterate !== true           → 'illiterate'
     *   - isLiterate === true, but no
     *     subjectProgress data          → 'literate' (baseline)
     *   - isLiterate === true with
     *     subjectProgress entries       → highest tier reached by the
     *                                     maximum entry.level, mapped
     *                                     through the thresholds
     *
     * The subjectProgress entries are read by their `level` field,
     * NOT by their key name. Keys are subject/role ids (e.g.
     * 'blacksmith', 'mathematics'), not education-level ids.
     *
     * @param {Object} character - character projection
     * @returns {string|null} level id or null if the character is missing
     */
    function _deriveEducationLevelId(character) {
        if (!character || !character.id) return null;
        var learning = window.EducationLearning;
        if (!learning || typeof learning.getEducationLevel !== 'function') {
            throw new Error(
                'SettlementEducationQueries requires EducationLearning.getEducationLevel.'
            );
        }
        var level = learning.getEducationLevel(character.id);
        return level && typeof level.id === 'string' ? level.id : null;
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

    function getSchools(locationId) {
        var locationIds = _getLocationIdsForSettlement(locationId);
        var allInstitutions = window.EducationQueries &&
            typeof window.EducationQueries.getInstitutionsInRegion === 'function'
            ? window.EducationQueries.getInstitutionsInRegion(locationId, true)
            : null;
        if (!Array.isArray(allInstitutions)) return null;

        var institutionsByLocation = Object.create(null);
        for (var i = 0; i < allInstitutions.length; i++) {
            var institution = allInstitutions[i];
            if (!institution || !institution.locationId) continue;
            if (!institutionsByLocation[institution.locationId]) {
                institutionsByLocation[institution.locationId] = [];
            }
            institutionsByLocation[institution.locationId].push(institution);
        }

        var result = [];
        for (var l = 0; l < locationIds.length; l++) {
            var currentLocationId = locationIds[l];
            var features = _getFeatureQueries().getSettlementFeatures(currentLocationId);
            if (features === null) continue;
            for (var f = 0; f < features.length; f++) {
                if (!_isEducationFeature(features[f])) continue;
                result.push(Object.assign({}, features[f], {
                    featureId: features[f].id,
                    feature: features[f],
                    locationId: currentLocationId,
                    institutions: (institutionsByLocation[currentLocationId] || []).slice(),
                    institutionIds: (institutionsByLocation[currentLocationId] || []).map(function (inst) {
                        return inst.id;
                    })
                }));
            }
        }
        return result;
    }

    function getSchoolCount(locationId) {
        var schools = getSchools(locationId);
        return schools === null ? null : schools.length;
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

        var educationQueries = window.EducationQueries;
        if (!educationQueries ||
            typeof educationQueries.getLocationEducationSummary !== 'function') {
            return null;
        }
        var summary = educationQueries.getLocationEducationSummary(locationId, true);
        if (!summary) return null;

        var totalCapacity = Number(summary.totalCapacity) || 0;
        var totalStudents = Number(summary.currentStudents) || 0;
        var totalTeachers = Number(summary.totalTeachers) || 0;
        var capacityGap = Math.max(0, totalStudents - totalCapacity);

        return {
            schoolCount: schools.length,
            institutionCount: Number(summary.institutionCount) || 0,
            totalCapacity: totalCapacity,
            totalStudents: totalStudents,
            totalTeachers: totalTeachers,
            studentTeacherRatio: totalTeachers > 0
                ? Math.round(totalStudents / totalTeachers) : null,
            capacityUsed: totalCapacity > 0
                ? Math.round((totalStudents / totalCapacity) * 100) : 0,
            needsMoreSchools: capacityGap > 0,
            capacityGap: capacityGap
        };
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
