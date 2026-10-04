/**
 * =============================================================================
 * STILL WATERS - CHILDREN QUERIES (js/character/children-queries.js)
 * =============================================================================
 *
 * Read-only projections for pregnancy, surrogacy, and adoption metadata.
 *
 * SCOPE:
 *   - Pregnancy record projections (by id, by mother, by child)
 *   - Surrogacy arrangement projections (by id, by intended parent,
 *     by surrogate)
 *   - Adoption metadata projections (by id, by child, by adopter)
 *   - Combined per-character views (children of a parent, adoptions of
 *     a character, pregnancies of a mother)
 *   - Co-parent resolution for a child (which parent is the other one)
 *
 * OUT OF SCOPE:
 *   - Parent edges                 -> family-queries.js
 *   - Character projections        -> character-queries.js
 *   - Child summaries              -> character-queries.js
 *   - Aggregate statistics         -> children-statistics.js
 *   - Policy                       -> children-rules.js
 *   - Mutation                     -> children-commands.js
 *
 * CONTRACT:
 *   - Every returned object is a fresh projection. No live record
 *     objects escape this module.
 *   - Missing input returns null (singular) or [] (collection).
 *   - Missing required dependency throws at load.
 *   - This module does not classify, validate, or decide anything.
 *     It reads and projects.
 *
 * COMPOSITION:
 *   Projections that reference characters return ids only. Callers who
 *   need names/summaries compose with CharacterQueries.
 *
 *   Projections that reference parent edges compose FamilyQueries.
 *   Births, adoptions, and surrogacy all name a child; the child's
 *   parents are read from FamilyQueries, not from this module.
 *
 * DEPENDENCIES (REQUIRED):
 *   - children-state.js:  ChildrenState
 *   - family-queries.js:  FamilyQueries
 *
 * DEPENDENCIES (OPTIONAL):
 *   - children-rules.js:  ChildrenRules (only for enum passthrough)
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    if (!window.ChildrenState) {
        throw new Error(
            'children-queries.js: children-state.js must load first.'
        );
    }
    if (!window.FamilyQueries) {
        throw new Error(
            'children-queries.js: family-queries.js must load first.'
        );
    }

    var ChS = window.ChildrenState;
    var FQ = window.FamilyQueries;

    // =========================================================================
    // 1. HELPERS
    // =========================================================================

    function _hasId(v) {
        return typeof v === 'string' && v.length > 0;
    }

    // =========================================================================
    // 2. PREGNANCY PROJECTIONS
    // =========================================================================

    /**
     * Returns a pregnancy projection by id, or null.
     */
    function getPregnancyRecord(pregnancyId) {
        if (!_hasId(pregnancyId)) return null;
        return ChS.getPregnancyCopy(pregnancyId);
    }

    /**
     * Returns all pregnancy records for a mother, ordered by
     * conceptionYear ascending.
     */
    function getPregnanciesForMother(motherId) {
        if (!_hasId(motherId)) return [];
        var ids = ChS.pregnancyIdsForMother(motherId);
        var records = [];
        for (var i = 0; i < ids.length; i++) {
            var r = ChS.getPregnancyCopy(ids[i]);
            if (r) records.push(r);
        }
        records.sort(function (a, b) {
            var ya = a.conceptionYear === null ? 0 : a.conceptionYear;
            var yb = b.conceptionYear === null ? 0 : b.conceptionYear;
            return ya - yb;
        });
        return records;
    }

    /**
     * Returns the pregnancy record that produced a given child, or null.
     * A child can have at most one pregnancy record under the current
     * schema; the first match is returned.
     */
    function getPregnancyForChild(childId) {
        if (!_hasId(childId)) return null;
        var ids = ChS.pregnancyIdsForChild(childId);
        if (ids.length === 0) return null;
        return ChS.getPregnancyCopy(ids[0]);
    }

    /**
     * Returns all pregnancies involving a character, either as mother
     * or as father. Ordered by conceptionYear ascending.
     */
    function getPregnanciesInvolvingCharacter(characterId) {
        if (!_hasId(characterId)) return [];

        var all = [];
        var seen = {};

        // As mother.
        var motherIds = ChS.pregnancyIdsForMother(characterId);
        for (var i = 0; i < motherIds.length; i++) {
            if (!seen[motherIds[i]]) {
                seen[motherIds[i]] = true;
                var r = ChS.getPregnancyCopy(motherIds[i]);
                if (r) all.push(r);
            }
        }

        // As father — walk every pregnancy. There is no father index;
        // the set is small enough at world scale that a linear scan is
        // acceptable. If the population grows, add a _pregnanciesByFather
        // index in ChildrenState.
        var allIds = ChS.allPregnancyIds();
        for (var j = 0; j < allIds.length; j++) {
            if (seen[allIds[j]]) continue;
            var rec = ChS.getPregnancyCopy(allIds[j]);
            if (rec && rec.fatherId === characterId) {
                seen[allIds[j]] = true;
                all.push(rec);
            }
        }

        all.sort(function (a, b) {
            var ya = a.conceptionYear === null ? 0 : a.conceptionYear;
            var yb = b.conceptionYear === null ? 0 : b.conceptionYear;
            return ya - yb;
        });
        return all;
    }

    /**
     * Returns the pregnancy record for the child born to (motherId,
     * fatherId) closest to the given year, or null. Used when a caller
     * needs to locate the specific pregnancy that produced a child.
     */
    function findPregnancyForChildBirth(childId) {
        return getPregnancyForChild(childId);
    }

    // =========================================================================
    // 3. SURROGACY PROJECTIONS
    // =========================================================================

    function getSurrogacyArrangement(arrangementId) {
        if (!_hasId(arrangementId)) return null;
        return ChS.getSurrogacyCopy(arrangementId);
    }

    function getSurrogacyArrangementsForIntendedParent(characterId) {
        if (!_hasId(characterId)) return [];
        var ids = ChS.surrogacyIdsForIntendedParent(characterId);
        var records = [];
        for (var i = 0; i < ids.length; i++) {
            var r = ChS.getSurrogacyCopy(ids[i]);
            if (r) records.push(r);
        }
        records.sort(function (a, b) {
            return a.arrangementYear - b.arrangementYear;
        });
        return records;
    }

    function getSurrogacyArrangementsBySurrogate(surrogateId) {
        if (!_hasId(surrogateId)) return [];
        var ids = ChS.surrogacyIdsForSurrogate(surrogateId);
        var records = [];
        for (var i = 0; i < ids.length; i++) {
            var r = ChS.getSurrogacyCopy(ids[i]);
            if (r) records.push(r);
        }
        records.sort(function (a, b) {
            return a.arrangementYear - b.arrangementYear;
        });
        return records;
    }

    /**
     * Returns every child id produced by an arrangement.
     */
    function getChildrenFromSurrogacyArrangement(arrangementId) {
        var arrangement = getSurrogacyArrangement(arrangementId);
        if (!arrangement) return [];
        return arrangement.childIds.slice();
    }

    /**
     * Returns every child id born via surrogacy for a given intended
     * parent (including the co-parent's view).
     */
    function getSurrogacyChildrenForIntendedParent(characterId) {
        if (!_hasId(characterId)) return [];
        var arrangements = getSurrogacyArrangementsForIntendedParent(characterId);
        var childIds = [];
        var seen = {};
        for (var i = 0; i < arrangements.length; i++) {
            var kids = arrangements[i].childIds;
            for (var j = 0; j < kids.length; j++) {
                if (!seen[kids[j]]) {
                    seen[kids[j]] = true;
                    childIds.push(kids[j]);
                }
            }
        }
        return childIds;
    }

    /**
     * Returns true if the character was born via surrogacy.
     * A character is a surrogacy child if any arrangement lists them
     * in childIds.
     */
    function isSurrogacyChild(childId) {
        if (!_hasId(childId)) return false;
        var pregnancyId = ChS.pregnancyIdsForChild(childId)[0];
        // No pregnancy record → potentially surrogacy-born, need to scan.
        // Under the current schema, surrogacy children are not added to
        // pregnancyRecords; they are added to a surrogacy arrangement's
        // childIds. So we scan the arrangements for a matching child.
        var allIds = ChS.allSurrogacyIds();
        for (var i = 0; i < allIds.length; i++) {
            var arrangement = ChS.getSurrogacyCopy(allIds[i]);
            if (!arrangement) continue;
            if (arrangement.childIds.indexOf(childId) !== -1) return true;
        }
        return false;
    }

    /**
     * Returns the surrogacy arrangement that produced a given child,
     * or null.
     */
    function getSurrogacyArrangementForChild(childId) {
        if (!_hasId(childId)) return null;
        var allIds = ChS.allSurrogacyIds();
        for (var i = 0; i < allIds.length; i++) {
            var arrangement = ChS.getSurrogacyCopy(allIds[i]);
            if (!arrangement) continue;
            if (arrangement.childIds.indexOf(childId) !== -1) return arrangement;
        }
        return null;
    }

    /**
     * Returns a projection of the genetic parents of a surrogacy child,
     * or null if the child is not surrogacy-born.
     *
     * Does not resolve character objects; returns ids. Callers who need
     * summaries compose with CharacterQueries.
     */
    function getSurrogacyGeneticParents(childId) {
        var arrangement = getSurrogacyArrangementForChild(childId);
        if (!arrangement) return null;

        return {
            geneticMotherId: arrangement.eggDonorId,
            geneticFatherId: arrangement.spermDonorId,
            birthMotherId: arrangement.surrogateId,
            intendedParentId: arrangement.intendedParentId,
            intendedPartnerId: arrangement.intendedPartnerId
        };
    }

    // =========================================================================
    // 4. ADOPTION METADATA PROJECTIONS
    // =========================================================================

    function getAdoptionRecord(adoptionId) {
        if (!_hasId(adoptionId)) return null;
        return ChS.getAdoptionCopy(adoptionId);
    }

    function getAdoptionsForChild(childId) {
        if (!_hasId(childId)) return [];
        var ids = ChS.adoptionIdsForChild(childId);
        var records = [];
        for (var i = 0; i < ids.length; i++) {
            var r = ChS.getAdoptionCopy(ids[i]);
            if (r) records.push(r);
        }
        records.sort(function (a, b) { return a.year - b.year; });
        return records;
    }

    function getActiveAdoptionsForChild(childId) {
        return getAdoptionsForChild(childId).filter(function (r) {
            return r.status === 'active';
        });
    }

    function getAdoptionsForAdopter(adopterId) {
        if (!_hasId(adopterId)) return [];
        var ids = ChS.adoptionIdsForAdopter(adopterId);
        var records = [];
        for (var i = 0; i < ids.length; i++) {
            var r = ChS.getAdoptionCopy(ids[i]);
            if (r) records.push(r);
        }
        records.sort(function (a, b) { return a.year - b.year; });
        return records;
    }

    function getActiveAdoptionsForAdopter(adopterId) {
        return getAdoptionsForAdopter(adopterId).filter(function (r) {
            return r.status === 'active';
        });
    }

    /**
     * Returns the adoption metadata record between an adopter and a
     * child, or null. Uses the pair as the key. If multiple records
     * exist for the same pair (e.g. an ended adoption followed by a
     * new one), returns the most recent active record, or the most
     * recent record overall if none is active.
     */
    function getAdoptionRecordForPair(adopterId, childId) {
        if (!_hasId(adopterId) || !_hasId(childId)) return null;
        var records = getAdoptionsForChild(childId).filter(function (r) {
            return r.adopterId === adopterId;
        });
        if (records.length === 0) return null;
        // Records sorted ascending by year. Prefer active.
        for (var i = records.length - 1; i >= 0; i--) {
            if (records[i].status === 'active') return records[i];
        }
        return records[records.length - 1];
    }

    function isAdoptedChild(childId) {
        if (!_hasId(childId)) return false;
        return getActiveAdoptionsForChild(childId).length > 0;
    }

    function isAdoptiveParent(adopterId) {
        if (!_hasId(adopterId)) return false;
        return getActiveAdoptionsForAdopter(adopterId).length > 0;
    }

    // =========================================================================
    // 5. CHARACTER-CENTRIC COMPOSITIONS
    // =========================================================================

    /**
     * Returns the ids of every child a character is a parent of,
     * combining:
     *   - biological/legal parent edges from FamilyQueries
     *   - surrogacy arrangements where the character is intended parent
     *
     * Deduplicated.
     */
    function getAllChildIdsForParent(parentId) {
        if (!_hasId(parentId)) return [];

        var seen = {};
        var out = [];

        var familyChildren = FQ.getChildIds(parentId);
        for (var i = 0; i < familyChildren.length; i++) {
            if (!seen[familyChildren[i]]) {
                seen[familyChildren[i]] = true;
                out.push(familyChildren[i]);
            }
        }

        var surrogacyChildren = getSurrogacyChildrenForIntendedParent(parentId);
        for (var j = 0; j < surrogacyChildren.length; j++) {
            if (!seen[surrogacyChildren[j]]) {
                seen[surrogacyChildren[j]] = true;
                out.push(surrogacyChildren[j]);
            }
        }

        return out;
    }

    /**
     * Returns the ids of every parent a character has, combining:
     *   - biological/legal parent edges from FamilyQueries
     *   - surrogacy arrangement intended parents
     *
     * The surrogate is not included unless a parent edge exists.
     * Deduplicated.
     */
    function getAllParentIdsForChild(childId) {
        if (!_hasId(childId)) return [];

        var seen = {};
        var out = [];

        var familyParents = FQ.getAllParentIds(childId);
        for (var i = 0; i < familyParents.length; i++) {
            if (!seen[familyParents[i]]) {
                seen[familyParents[i]] = true;
                out.push(familyParents[i]);
            }
        }

        var arrangement = getSurrogacyArrangementForChild(childId);
        if (arrangement) {
            if (_hasId(arrangement.intendedParentId)
                && !seen[arrangement.intendedParentId]) {
                seen[arrangement.intendedParentId] = true;
                out.push(arrangement.intendedParentId);
            }
            if (_hasId(arrangement.intendedPartnerId)
                && !seen[arrangement.intendedPartnerId]) {
                seen[arrangement.intendedPartnerId] = true;
                out.push(arrangement.intendedPartnerId);
            }
        }

        return out;
    }

    /**
     * Returns the projection of a single birth, combining:
     *   - the character projection (name, gender, birth year)
     *   - the pregnancy record (outcome, complications, maternal death)
     *   - the surrogacy arrangement, if any
     *
     * Does not resolve names. Callers compose with CharacterQueries.
     */
    function getBirthProjection(childId) {
        if (!_hasId(childId)) return null;

        var pregnancy = getPregnancyForChild(childId);
        var arrangement = getSurrogacyArrangementForChild(childId);
        var motherIds = FQ.getBiologicalParentIds(childId);

        return {
            childId: childId,
            motherId: motherIds.length > 0 ? motherIds[0] : null,
            pregnancy: pregnancy,
            surrogacy: arrangement
        };
    }

    /**
     * Returns a full pregnancy history projection for a mother.
     * Wraps getPregnanciesForMother with per-record outcome and child
     * summaries appended.
     *
     * The returned records are the same shape as getPregnanciesForMother,
     * with an added `children` array of child ids.
     */
    function getPregnancyHistoryForMother(motherId) {
        var records = getPregnanciesForMother(motherId);
        var out = [];
        for (var i = 0; i < records.length; i++) {
            var r = records[i];
            out.push({
                id: r.id,
                conceptionYear: r.conceptionYear,
                birthYear: r.birthYear,
                outcome: r.outcome,
                fetusCount: r.fetusCount,
                isMultiple: r.isMultiple,
                hasComplications: r.hasComplications,
                maternalDeath: r.maternalDeath,
                attemptNumber: r.attemptNumber,
                fatherId: r.fatherId,
                children: r.childIds.slice(),
                notes: r.notes
            });
        }
        return out;
    }

    // =========================================================================
    // 6. COUNTS
    // =========================================================================

    function getPregnancyCountForMother(motherId) {
        if (!_hasId(motherId)) return 0;
        return ChS.pregnancyIdsForMother(motherId).length;
    }

    function getSurrogacyCountForIntendedParent(characterId) {
        if (!_hasId(characterId)) return 0;
        return ChS.surrogacyIdsForIntendedParent(characterId).length;
    }

    function getSurrogacyCountForSurrogate(surrogateId) {
        if (!_hasId(surrogateId)) return 0;
        return ChS.surrogacyIdsForSurrogate(surrogateId).length;
    }

    function getAdoptionCountForChild(childId) {
        if (!_hasId(childId)) return 0;
        return ChS.adoptionIdsForChild(childId).length;
    }

    function getAdoptionCountForAdopter(adopterId) {
        if (!_hasId(adopterId)) return 0;
        return ChS.adoptionIdsForAdopter(adopterId).length;
    }

    // =========================================================================
    // 7. EXPORTS
    // =========================================================================

    window.ChildrenQueries = {
        // Pregnancy
        getPregnancyRecord: getPregnancyRecord,
        getPregnanciesForMother: getPregnanciesForMother,
        getPregnancyForChild: getPregnancyForChild,
        getPregnanciesInvolvingCharacter: getPregnanciesInvolvingCharacter,
        findPregnancyForChildBirth: findPregnancyForChildBirth,
        getPregnancyHistoryForMother: getPregnancyHistoryForMother,

        // Surrogacy
        getSurrogacyArrangement: getSurrogacyArrangement,
        getSurrogacyArrangementsForIntendedParent: getSurrogacyArrangementsForIntendedParent,
        getSurrogacyArrangementsBySurrogate: getSurrogacyArrangementsBySurrogate,
        getChildrenFromSurrogacyArrangement: getChildrenFromSurrogacyArrangement,
        getSurrogacyChildrenForIntendedParent: getSurrogacyChildrenForIntendedParent,
        getSurrogacyArrangementForChild: getSurrogacyArrangementForChild,
        isSurrogacyChild: isSurrogacyChild,
        getSurrogacyGeneticParents: getSurrogacyGeneticParents,

        // Adoption metadata
        getAdoptionRecord: getAdoptionRecord,
        getAdoptionsForChild: getAdoptionsForChild,
        getActiveAdoptionsForChild: getActiveAdoptionsForChild,
        getAdoptionsForAdopter: getAdoptionsForAdopter,
        getActiveAdoptionsForAdopter: getActiveAdoptionsForAdopter,
        getAdoptionRecordForPair: getAdoptionRecordForPair,
        isAdoptedChild: isAdoptedChild,
        isAdoptiveParent: isAdoptiveParent,

        // Character-centric compositions
        getAllChildIdsForParent: getAllChildIdsForParent,
        getAllParentIdsForChild: getAllParentIdsForChild,
        getBirthProjection: getBirthProjection,

        // Counts
        getPregnancyCountForMother: getPregnancyCountForMother,
        getSurrogacyCountForIntendedParent: getSurrogacyCountForIntendedParent,
        getSurrogacyCountForSurrogate: getSurrogacyCountForSurrogate,
        getAdoptionCountForChild: getAdoptionCountForChild,
        getAdoptionCountForAdopter: getAdoptionCountForAdopter
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.ChildrenQueries;
    }
})();
