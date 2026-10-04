/**
 * =============================================================================
 * STILL WATERS - CHILDREN STATISTICS (js/character/children-statistics.js)
 * =============================================================================
 *
 * Aggregate analytics over pregnancy, surrogacy, and adoption data.
 *
 * SCOPE:
 *   - Pregnancy counts (total, by outcome, by mother)
 *   - Fertility statistics (conception rate, miscarriage rate,
 *     stillbirth rate, maternal death rate, multiple-birth rate)
 *   - Surrogacy statistics (count, by type, by status, by intended
 *     parent, by surrogate, children born)
 *   - Adoption statistics (count, by type, by status, active vs ended,
 *     adoptions per adopter, adopted children per parent)
 *   - Birth statistics (births per year, by gender, by parent)
 *   - Family-population statistics per parent (children total, living,
 *     biological, adopted, surrogacy-born)
 *
 * OUT OF SCOPE:
 *   - Raw reads              -> children-queries.js
 *   - Mortality analytics    -> mortality-statistics.js
 *   - Character statistics   -> character-statistics.js
 *   - Mutation               -> children-commands.js
 *
 * COMPOSITION:
 *   ChildrenStatistics -> ChildrenQueries
 *                      -> CharacterState (for enumeration only)
 *                      -> FamilyQueries (for parent edges)
 *                      -> CharacterCommands (for professions, not used)
 *
 * CONTRACT:
 *   - Pure aggregation. No caching. No mutation. Reentrant.
 *   - Missing required dependency throws at load.
 *   - Missing optional dependency (FamilyQueries) causes the
 *     parent-edge-based aggregates to throw when called, not to
 *     silently return zero. The module fails loudly rather than
 *     fabricating.
 *   - Empty input returns zero-valued statistics, not null. There is
 *     no such thing as "no statistics"; there is only "zero births".
 *
 * DEPENDENCIES (REQUIRED):
 *   - children-state.js:     ChildrenState
 *   - children-queries.js:   ChildrenQueries
 *   - character-state.js:    CharacterState
 *
 * DEPENDENCIES (OPTIONAL, required for specific functions):
 *   - family-queries.js:     FamilyQueries
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    if (!window.ChildrenState) {
        throw new Error(
            'children-statistics.js: children-state.js must load first.'
        );
    }
    if (!window.ChildrenQueries) {
        throw new Error(
            'children-statistics.js: children-queries.js must load first.'
        );
    }
    if (!window.CharacterState) {
        throw new Error(
            'children-statistics.js: character-state.js must load first.'
        );
    }

    var ChS = window.ChildrenState;
    var ChQ = window.ChildrenQueries;
    var CS  = window.CharacterState;

    // =========================================================================
    // 1. HELPERS
    // =========================================================================

    function _hasId(v) {
        return typeof v === 'string' && v.length > 0;
    }

    function _increment(map, key) {
        if (key === null || key === undefined) return;
        map[key] = (map[key] || 0) + 1;
    }

    function _requireFamilyQueries() {
        if (!window.FamilyQueries) {
            throw new Error(
                'children-statistics.js: family-queries.js is required ' +
                'for parent-edge aggregates.'
            );
        }
        return window.FamilyQueries;
    }

    // =========================================================================
    // 2. PREGNANCY STATISTICS
    // =========================================================================

    /**
     * Population-wide pregnancy statistics.
     *
     * Returns:
     * {
     *   totalPregnancies,
     *   byOutcome: { live_birth, stillbirth, miscarriage, none },
     *   liveBirths,
     *   stillbirths,
     *   miscarriages,
     *   multipleBirths,
     *   withComplications,
     *   maternalDeaths,
     *   conceptionRate,
     *   liveBirthRate,
     *   miscarriageRate,
     *   stillbirthRate,
     *   maternalDeathRate,
     *   multipleBirthRate
     * }
     */
    function getPregnancyStatistics() {
        var allIds = ChS.allPregnancyIds();
        var stats = {
            totalPregnancies: allIds.length,
            byOutcome: {
                live_birth: 0,
                stillbirth: 0,
                miscarriage: 0,
                none: 0
            },
            liveBirths: 0,
            stillbirths: 0,
            miscarriages: 0,
            multipleBirths: 0,
            withComplications: 0,
            maternalDeaths: 0,
            conceptionRate: 0,
            liveBirthRate: 0,
            miscarriageRate: 0,
            stillbirthRate: 0,
            maternalDeathRate: 0,
            multipleBirthRate: 0
        };

        for (var i = 0; i < allIds.length; i++) {
            var record = ChS.getPregnancyCopy(allIds[i]);
            if (!record) continue;

            _increment(stats.byOutcome, record.outcome);

            if (record.outcome === 'live_birth') stats.liveBirths++;
            else if (record.outcome === 'stillbirth') stats.stillbirths++;
            else if (record.outcome === 'miscarriage') stats.miscarriages++;

            if (record.isMultiple) stats.multipleBirths++;
            if (record.hasComplications) stats.withComplications++;
            if (record.maternalDeath) stats.maternalDeaths++;
        }

        var total = stats.totalPregnancies;
        if (total > 0) {
            stats.conceptionRate = 1;
            stats.liveBirthRate = stats.liveBirths / total;
            stats.miscarriageRate = stats.miscarriages / total;
            stats.stillbirthRate = stats.stillbirths / total;
            stats.maternalDeathRate = stats.maternalDeaths / total;
            stats.multipleBirthRate = stats.multipleBirths / total;
        }

        return stats;
    }

    /**
     * Pregnancy statistics for a single mother.
     */
    function getMotherPregnancyStatistics(motherId) {
        if (!_hasId(motherId)) return null;

        var records = ChQ.getPregnanciesForMother(motherId);
        var stats = {
            motherId: motherId,
            totalPregnancies: records.length,
            byOutcome: {
                live_birth: 0,
                stillbirth: 0,
                miscarriage: 0,
                none: 0
            },
            liveBirths: 0,
            stillbirths: 0,
            miscarriages: 0,
            multipleBirths: 0,
            withComplications: 0,
            maternalDeaths: 0,
            totalChildren: 0,
            livingChildren: 0
        };

        for (var i = 0; i < records.length; i++) {
            var r = records[i];
            _increment(stats.byOutcome, r.outcome);

            if (r.outcome === 'live_birth') stats.liveBirths++;
            else if (r.outcome === 'stillbirth') stats.stillbirths++;
            else if (r.outcome === 'miscarriage') stats.miscarriages++;

            if (r.isMultiple) stats.multipleBirths++;
            if (r.hasComplications) stats.withComplications++;
            if (r.maternalDeath) stats.maternalDeaths++;

            for (var j = 0; j < r.childIds.length; j++) {
                stats.totalChildren++;
                var child = CS.getCharacter(r.childIds[j]);
                if (child && child.isDeceased !== true) {
                    stats.livingChildren++;
                }
            }
        }

        return stats;
    }

    /**
     * Pregnancy statistics for a father (all pregnancies he fathered).
     */
    function getFatherPregnancyStatistics(fatherId) {
        if (!_hasId(fatherId)) return null;

        var records = ChQ.getPregnanciesInvolvingCharacter(fatherId).filter(function (r) {
            return r.fatherId === fatherId;
        });

        var stats = {
            fatherId: fatherId,
            totalPregnancies: records.length,
            liveBirths: 0,
            stillbirths: 0,
            miscarriages: 0,
            totalChildren: 0,
            livingChildren: 0
        };

        for (var i = 0; i < records.length; i++) {
            var r = records[i];
            if (r.outcome === 'live_birth') stats.liveBirths++;
            else if (r.outcome === 'stillbirth') stats.stillbirths++;
            else if (r.outcome === 'miscarriage') stats.miscarriages++;

            for (var j = 0; j < r.childIds.length; j++) {
                stats.totalChildren++;
                var child = CS.getCharacter(r.childIds[j]);
                if (child && child.isDeceased !== true) {
                    stats.livingChildren++;
                }
            }
        }

        return stats;
    }

    // =========================================================================
    // 3. BIRTH STATISTICS
    // =========================================================================

    /**
     * Population-wide birth statistics from pregnancy records.
     *
     * Returns:
     * {
     *   totalBirths,          live_birth + stillbirth events
     *   livingBirths,         live_birth outcomes
     *   stillbirths,
     *   byYear: {},
     *   byGender: { male, female, unknown }
     * }
     */
    function getBirthStatistics() {
        var allIds = ChS.allPregnancyIds();
        var stats = {
            totalBirths: 0,
            livingBirths: 0,
            stillbirths: 0,
            byYear: {},
            byGender: { male: 0, female: 0, unknown: 0 }
        };

        for (var i = 0; i < allIds.length; i++) {
            var record = ChS.getPregnancyCopy(allIds[i]);
            if (!record) continue;
            if (record.outcome !== 'live_birth' && record.outcome !== 'stillbirth') {
                continue;
            }

            stats.totalBirths++;
            if (record.outcome === 'live_birth') stats.livingBirths++;
            else stats.stillbirths++;

            if (typeof record.birthYear === 'number') {
                _increment(stats.byYear, String(record.birthYear));
            }

            for (var j = 0; j < record.childIds.length; j++) {
                var child = CS.getCharacter(record.childIds[j]);
                if (!child) continue;
                if (child.gender === 'male') stats.byGender.male++;
                else if (child.gender === 'female') stats.byGender.female++;
                else stats.byGender.unknown++;
            }
        }

        return stats;
    }

    // =========================================================================
    // 4. SURROGACY STATISTICS
    // =========================================================================

    function getSurrogacyStatistics() {
        var allIds = ChS.allSurrogacyIds();
        var stats = {
            totalArrangements: allIds.length,
            byType: { traditional: 0, gestational: 0 },
            byStatus: { active: 0, completed: 0, cancelled: 0 },
            totalChildrenBorn: 0,
            totalActiveArrangements: 0,
            totalCompletedArrangements: 0,
            totalCancelledArrangements: 0
        };

        for (var i = 0; i < allIds.length; i++) {
            var record = ChS.getSurrogacyCopy(allIds[i]);
            if (!record) continue;

            _increment(stats.byType, record.type);
            _increment(stats.byStatus, record.status);

            if (record.status === 'active') stats.totalActiveArrangements++;
            else if (record.status === 'completed') stats.totalCompletedArrangements++;
            else if (record.status === 'cancelled') stats.totalCancelledArrangements++;

            stats.totalChildrenBorn += record.childIds.length;
        }

        return stats;
    }

    function getSurrogateStatistics(surrogateId) {
        if (!_hasId(surrogateId)) return null;

        var arrangements = ChQ.getSurrogacyArrangementsBySurrogate(surrogateId);
        var stats = {
            surrogateId: surrogateId,
            totalArrangements: arrangements.length,
            completedArrangements: 0,
            activeArrangements: 0,
            cancelledArrangements: 0,
            totalChildrenBorn: 0
        };

        for (var i = 0; i < arrangements.length; i++) {
            var r = arrangements[i];
            if (r.status === 'completed') stats.completedArrangements++;
            else if (r.status === 'active') stats.activeArrangements++;
            else if (r.status === 'cancelled') stats.cancelledArrangements++;

            stats.totalChildrenBorn += r.childIds.length;
        }

        return stats;
    }

    function getIntendedParentSurrogacyStatistics(characterId) {
        if (!_hasId(characterId)) return null;

        var arrangements = ChQ.getSurrogacyArrangementsForIntendedParent(characterId);
        var stats = {
            characterId: characterId,
            totalArrangements: arrangements.length,
            completedArrangements: 0,
            activeArrangements: 0,
            cancelledArrangements: 0,
            totalChildrenReceived: 0
        };

        for (var i = 0; i < arrangements.length; i++) {
            var r = arrangements[i];
            if (r.status === 'completed') stats.completedArrangements++;
            else if (r.status === 'active') stats.activeArrangements++;
            else if (r.status === 'cancelled') stats.cancelledArrangements++;

            stats.totalChildrenReceived += r.childIds.length;
        }

        return stats;
    }

    // =========================================================================
    // 5. ADOPTION STATISTICS
    // =========================================================================

    function getAdoptionStatistics() {
        var allIds = ChS.allAdoptionIds();
        var stats = {
            totalAdoptions: allIds.length,
            byType: { legal: 0, guardianship: 0, foster: 0 },
            byStatus: { active: 0, ended: 0, dissolved: 0 },
            activeAdoptions: 0,
            endedAdoptions: 0,
            dissolvedAdoptions: 0,
            uniqueAdopters: 0,
            uniqueAdoptedChildren: 0,
            averageDurationYears: 0
        };

        var adopterSet = {};
        var childSet = {};
        var totalDuration = 0;
        var durationCount = 0;

        for (var i = 0; i < allIds.length; i++) {
            var record = ChS.getAdoptionCopy(allIds[i]);
            if (!record) continue;

            _increment(stats.byType, record.type);
            _increment(stats.byStatus, record.status);

            if (record.status === 'active') stats.activeAdoptions++;
            else if (record.status === 'ended') stats.endedAdoptions++;
            else if (record.status === 'dissolved') stats.dissolvedAdoptions++;

            adopterSet[record.adopterId] = true;
            childSet[record.childId] = true;

            if (typeof record.year === 'number'
                && typeof record.endYear === 'number'
                && record.endYear >= record.year) {
                totalDuration += record.endYear - record.year;
                durationCount++;
            }
        }

        stats.uniqueAdopters = Object.keys(adopterSet).length;
        stats.uniqueAdoptedChildren = Object.keys(childSet).length;
        stats.averageDurationYears = durationCount > 0
            ? Math.round(totalDuration / durationCount)
            : 0;

        return stats;
    }

    function getAdopterStatistics(adopterId) {
        if (!_hasId(adopterId)) return null;

        var records = ChQ.getAdoptionsForAdopter(adopterId);
        var stats = {
            adopterId: adopterId,
            totalAdoptions: records.length,
            activeAdoptions: 0,
            endedAdoptions: 0,
            dissolvedAdoptions: 0,
            byType: { legal: 0, guardianship: 0, foster: 0 },
            adoptedChildIds: []
        };

        var seen = {};
        for (var i = 0; i < records.length; i++) {
            var r = records[i];
            if (r.status === 'active') stats.activeAdoptions++;
            else if (r.status === 'ended') stats.endedAdoptions++;
            else if (r.status === 'dissolved') stats.dissolvedAdoptions++;

            _increment(stats.byType, r.type);

            if (!seen[r.childId]) {
                seen[r.childId] = true;
                stats.adoptedChildIds.push(r.childId);
            }
        }

        return stats;
    }

    function getAdoptedChildStatistics(childId) {
        if (!_hasId(childId)) return null;

        var records = ChQ.getAdoptionsForChild(childId);
        var stats = {
            childId: childId,
            totalAdoptionRecords: records.length,
            activeAdoptionRecords: 0,
            endedAdoptionRecords: 0,
            dissolvedAdoptionRecords: 0,
            adopterIds: []
        };

        var seen = {};
        for (var i = 0; i < records.length; i++) {
            var r = records[i];
            if (r.status === 'active') stats.activeAdoptionRecords++;
            else if (r.status === 'ended') stats.endedAdoptionRecords++;
            else if (r.status === 'dissolved') stats.dissolvedAdoptionRecords++;

            if (!seen[r.adopterId]) {
                seen[r.adopterId] = true;
                stats.adopterIds.push(r.adopterId);
            }
        }

        return stats;
    }

    // =========================================================================
    // 6. PER-PARENT FAMILY STATISTICS
    // =========================================================================

    /**
     * Aggregate child statistics for a parent, combining:
     *   - biological and legal edges via FamilyQueries
     *   - surrogacy-born children via ChildrenQueries
     *
     * Returns:
     * {
     *   parentId,
     *   totalChildren,
     *   livingChildren,
     *   deceasedChildren,
     *   biologicalChildren,
     *   adoptedChildren,
     *   surrogacyChildren,
     *   byGender: { male, female, unknown }
     * }
     *
     * Requires FamilyQueries.
     */
    function getParentChildStatistics(parentId) {
        if (!_hasId(parentId)) return null;

        var FQ = _requireFamilyQueries();

        var all = ChQ.getAllChildIdsForParent(parentId);
        var bioIds = FQ.getBiologicalChildIds(parentId);
        var adoptedRecords = ChQ.getActiveAdoptionsForAdopter(parentId);
        var surrogacyIds = ChQ.getSurrogacyChildrenForIntendedParent(parentId);

        var biologicalSet = {};
        for (var b = 0; b < bioIds.length; b++) biologicalSet[bioIds[b]] = true;

        var adoptedSet = {};
        for (var a = 0; a < adoptedRecords.length; a++) {
            adoptedSet[adoptedRecords[a].childId] = true;
        }

        var surrogacySet = {};
        for (var s = 0; s < surrogacyIds.length; s++) {
            surrogacySet[surrogacyIds[s]] = true;
        }

        var stats = {
            parentId: parentId,
            totalChildren: all.length,
            livingChildren: 0,
            deceasedChildren: 0,
            biologicalChildren: bioIds.length,
            adoptedChildren: adoptedRecords.length,
            surrogacyChildren: surrogacyIds.length,
            byGender: { male: 0, female: 0, unknown: 0 }
        };

        for (var i = 0; i < all.length; i++) {
            var child = CS.getCharacter(all[i]);
            if (!child) continue;

            if (child.isDeceased === true) stats.deceasedChildren++;
            else stats.livingChildren++;

            if (child.gender === 'male') stats.byGender.male++;
            else if (child.gender === 'female') stats.byGender.female++;
            else stats.byGender.unknown++;
        }

        return stats;
    }

    // =========================================================================
    // 7. EXPORTS
    // =========================================================================

    window.ChildrenStatistics = {
        // Pregnancy
        getPregnancyStatistics: getPregnancyStatistics,
        getMotherPregnancyStatistics: getMotherPregnancyStatistics,
        getFatherPregnancyStatistics: getFatherPregnancyStatistics,

        // Birth
        getBirthStatistics: getBirthStatistics,

        // Surrogacy
        getSurrogacyStatistics: getSurrogacyStatistics,
        getSurrogateStatistics: getSurrogateStatistics,
        getIntendedParentSurrogacyStatistics: getIntendedParentSurrogacyStatistics,

        // Adoption
        getAdoptionStatistics: getAdoptionStatistics,
        getAdopterStatistics: getAdopterStatistics,
        getAdoptedChildStatistics: getAdoptedChildStatistics,

        // Per-parent family statistics
        getParentChildStatistics: getParentChildStatistics
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.ChildrenStatistics;
    }
})();
