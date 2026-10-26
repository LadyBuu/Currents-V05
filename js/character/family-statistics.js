/**
 * =============================================================================
 * STILL WATERS - FAMILY STATISTICS (js/character/family-statistics.js)
 * =============================================================================
 *
 * LOCATION: js/character/family-statistics.js
 *
 * Aggregate family measurements for a character.
 *
 * SCOPE:
 *   - Counting parents, children, siblings, grandchildren
 *   - Classifying children (biological / adopted)
 *   - Classifying siblings (full / half / adoptive via FamilyRules.deriveSiblingship)
 *   - Determining orphan status
 *   - Producing a single statistics object suitable for UI and succession
 *
 * OUT OF SCOPE:
 *   - Reading the family graph            -> family-queries.js
 *   - Deciding what a "spouse" is         -> future relationship domain
 *   - Determining heirs                   -> future succession domain
 *   - Presentation                        -> modals / character-ui-list.js
 *
 * DEPENDENCIES (REQUIRED):
 *   - family-queries.js:    FamilyQueries (parents, children, siblings,
 *                                          grandparents, grandchildren,
 *                                          orphan)
 *   - family-rules.js:      FamilyRules   (sibling classification
 *                                          via deriveSiblingship)
 *   - character-queries.js: CharacterQueries
 *                                       (character summary projections
 *                                        used to enrich ids with names,
 *                                        ages, life status)
 *
 * SPOUSE / PARTNER SEMANTICS:
 *   This module no longer produces partner or spouse counts.
 *
 *   The pre-refactor version did, by consulting window.RelationshipQueries,
 *   which no longer exists in the tree (per character-doc.txt §9, the
 *   relationship domain was deleted during the character refactor).
 *   Keeping a reference to a deleted module's API only produced a
 *   silent "partners: []" for every character.
 *
 *   When the relationship domain is reintroduced, it should add a
 *   dedicated relationship-statistics module. It should NOT bolt
 *   spouse counts back onto family-statistics, because spouse and
 *   family are different concerns with different ownership.
 *
 * RETURN SHAPE:
 *   Every returned object uses plain field names, not wrapper records.
 *   The wrappers produced by FamilyQueries are unwrapped here — the
 *   caller is a UI or a succession rule, and neither should have to
 *   know about edge ids or shared-biological-parent arrays unless
 *   they ask for them.
 *
 *   The one exception is the child and sibling "all" arrays: those
 *   preserve the classification flags (biological / adopted / full /
 *   half / adoptive) because callers reasonably need them.
 *
 * RELATIONSHIP TO CHARACTERQUERIES.getCharacterSummary:
 *   The summary projection embeds a small "family" block (father,
 *   mother, childCount, hasChildren). That block answers "what does
 *   this character look like on a card". This module answers "what is
 *   the full family count and classification". They overlap by design:
 *   the summary is for display; this module is for aggregation. Do
 *   not consolidate them — the summary is called on every render of
 *   every character, and this module is called when a caller actually
 *   needs the aggregate picture.
 *
 * DEPENDENCIES (REQUIRED at load):
 *   - FamilyQueries
 *   - FamilyRules
 *   - CharacterQueries
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 0. DEPENDENCY GUARDS
    // =========================================================================

    function _requireDependencies() {
        if (typeof window.FamilyQueries === 'undefined') {
            throw new Error(
                'family-statistics.js: family-queries.js must load first.'
            );
        }
        if (typeof window.FamilyRules === 'undefined') {
            throw new Error(
                'family-statistics.js: family-rules.js must load first.'
            );
        }
        if (typeof window.CharacterQueries === 'undefined') {
            throw new Error(
                'family-statistics.js: character-queries.js must load first.'
            );
        }
    }

    _requireDependencies();

    var FQ = window.FamilyQueries;
    var FR = window.FamilyRules;
    var CQ = window.CharacterQueries;

    // =========================================================================
    // 1. INTERNAL HELPERS
    // =========================================================================

    function _hasId(v) {
        return typeof v === 'string' && v.length > 0;
    }

    function _isMissing(v) {
        return v === undefined || v === null;
    }

    /**
     * Returns a projection for a character id, or null.
     * Does not throw for missing characters; the caller handles absence.
     */
    function _project(id) {
        if (!_hasId(id)) return null;
        return CQ.getCharacterSummary(id);
    }

    function _isLiving(projection) {
        return !!projection && projection.isDeceased !== true;
    }

    function _isLivingId(id) {
        return _isLiving(_project(id));
    }

    /**
     * Sorts ids by birth year ascending, using projection.birthYear.
     * Ids whose projection cannot be resolved, or whose birthYear is
     * missing/invalid, sort to the end in their input order.
     *
     * Non-mutating. Returns a new array.
     */
    function _sortIdsByBirthYear(ids) {
        if (!Array.isArray(ids) || ids.length === 0) return [];

        var entries = [];
        for (var i = 0; i < ids.length; i++) {
            var id = ids[i];
            var projection = _project(id);
            var birthYear = projection && typeof projection.birthYear === 'number'
                && Number.isFinite(projection.birthYear)
                ? projection.birthYear
                : null;
            entries.push({
                id: id,
                projection: projection,
                birthYear: birthYear,
                originalIndex: i
            });
        }

        entries.sort(function (a, b) {
            var aMissing = a.birthYear === null;
            var bMissing = b.birthYear === null;
            if (aMissing && bMissing) return a.originalIndex - b.originalIndex;
            if (aMissing) return 1;
            if (bMissing) return -1;
            if (a.birthYear !== b.birthYear) return a.birthYear - b.birthYear;
            return a.originalIndex - b.originalIndex;
        });

        var out = [];
        for (var j = 0; j < entries.length; j++) {
            out.push(entries[j].id);
        }
        return out;
    }

    /**
     * Extracts the first father edge and first mother edge from a
     * FamilyQueries.getParents edge list. The edge wrappers carry
     * parentRole; if multiple edges share a role, the first biological
     * one wins, then the first legal, then the first social.
     */
    function _pickParentEdgeByRole(edges, role) {
        if (!Array.isArray(edges) || edges.length === 0) return null;

        var bio = null;
        var legal = null;
        var social = null;
        var any = null;

        for (var i = 0; i < edges.length; i++) {
            var e = edges[i];
            if (!e || e.parentRole !== role) continue;
            if (!any) any = e;
            if (e.parentType === 'biological' && !bio) bio = e;
            else if (e.parentType === 'legal' && !legal) legal = e;
            else if (e.parentType === 'social' && !social) social = e;
        }

        return bio || legal || social || any;
    }

    // =========================================================================
    // 2. PARENTS
    // =========================================================================

    function _collectParents(characterId) {
        var edges = FQ.getParents(characterId);
        if (!Array.isArray(edges)) edges = [];

        var biological = 0;
        var legal = 0;
        var social = 0;
        var seenIds = {};

        var distinctParentIds = [];
        for (var i = 0; i < edges.length; i++) {
            var e = edges[i];
            if (!e || !_hasId(e.parentId)) continue;
            if (e.parentType === 'biological') biological++;
            else if (e.parentType === 'legal') legal++;
            else if (e.parentType === 'social') social++;

            if (!seenIds[e.parentId]) {
                seenIds[e.parentId] = true;
                distinctParentIds.push(e.parentId);
            }
        }

        var fatherEdge = _pickParentEdgeByRole(edges, 'father');
        var motherEdge = _pickParentEdgeByRole(edges, 'mother');

        return {
            total: distinctParentIds.length,
            fatherId: fatherEdge ? fatherEdge.parentId : null,
            motherId: motherEdge ? motherEdge.parentId : null,
            biological: biological,
            legal: legal,
            social: social,
            ids: distinctParentIds,
            hasParents: distinctParentIds.length > 0
        };
    }

    // =========================================================================
    // 3. CHILDREN
    // =========================================================================

    function _collectChildren(characterId) {
        // getChildIds returns a deduplicated list of ongoing children.
        var childIds = FQ.getChildIds(characterId);
        if (!Array.isArray(childIds)) childIds = [];

        // Biological vs legal distinction: getBiologicalChildIds returns
        // a list of child ids for biological edges only. Anything in
        // childIds but NOT in biologicalChildIds is a child of this
        // character by a non-biological edge (legal adoption, foster,
        // etc.). We do not try to split legal vs social here because
        // FamilyQueries does not expose getSocialChildIds; the sum
        // biological + adopted = total is enough for the statistics
        // object, and callers who need legal-vs-social granularity can
        // call FamilyQueries directly.
        var biologicalChildIds = FQ.getBiologicalChildIds(characterId);
        if (!Array.isArray(biologicalChildIds)) biologicalChildIds = [];

        var biologicalSet = {};
        for (var b = 0; b < biologicalChildIds.length; b++) {
            if (_hasId(biologicalChildIds[b])) biologicalSet[biologicalChildIds[b]] = true;
        }

        var living = 0;
        var biological = 0;
        var adopted = 0;
        var normalized = [];

        for (var i = 0; i < childIds.length; i++) {
            var cid = childIds[i];
            if (!_hasId(cid)) continue;
            var projection = _project(cid);
            if (!projection) continue;

            var isBio = biologicalSet[cid] === true;
            var isAdopt = !isBio;
            if (isBio) biological++;
            if (isAdopt) adopted++;
            if (_isLiving(projection)) living++;

            normalized.push({
                id: cid,
                character: projection,
                biological: isBio,
                adopted: isAdopt,
                birthYear: typeof projection.birthYear === 'number'
                    ? projection.birthYear
                    : null
            });
        }

        var orderedIds = _sortIdsByBirthYear(childIds);

        // Re-order the normalized array to match the sorted order.
        var byId = {};
        for (var n = 0; n < normalized.length; n++) {
            byId[normalized[n].id] = normalized[n];
        }
        var orderedNormalized = [];
        for (var o = 0; o < orderedIds.length; o++) {
            var entry = byId[orderedIds[o]];
            if (entry) orderedNormalized.push(entry);
        }

        var eldestId = orderedNormalized.length > 0 ? orderedNormalized[0].id : null;
        var youngestId = orderedNormalized.length > 0
            ? orderedNormalized[orderedNormalized.length - 1].id
            : null;

        return {
            total: normalized.length,
            living: living,
            biological: biological,
            adopted: adopted,
            eldestId: eldestId,
            youngestId: youngestId,
            all: orderedNormalized
        };
    }

    // =========================================================================
    // 4. SIBLINGS
    // =========================================================================

    function _collectSiblings(characterId) {
        // getSiblings returns wrapper records:
        //   { siblingId, primaryType, sharedBiologicalParents,
        //     sharedLegalParents, sharedSocialParents }
        // primaryType is 'full' | 'half' | 'step' | 'adoptive'.
        var wrappers = FQ.getSiblings(characterId);
        if (!Array.isArray(wrappers)) wrappers = [];

        var living = 0;
        var full = 0;
        var half = 0;
        var adoptive = 0;
        var step = 0;
        var normalized = [];

        for (var i = 0; i < wrappers.length; i++) {
            var w = wrappers[i];
            if (!w || !_hasId(w.siblingId)) continue;
            var projection = _project(w.siblingId);
            if (!projection) continue;

            var type = w.primaryType;
            if (type === 'full') full++;
            else if (type === 'half') half++;
            else if (type === 'adoptive') adoptive++;
            else if (type === 'step') step++;
            if (_isLiving(projection)) living++;

            normalized.push({
                id: w.siblingId,
                character: projection,
                primaryType: type,
                full: type === 'full',
                half: type === 'half',
                adoptive: type === 'adoptive',
                step: type === 'step',
                birthYear: typeof projection.birthYear === 'number'
                    ? projection.birthYear
                    : null
            });
        }

        // Sort by birth year (ascending), same rule as children.
        var orderedIds = _sortIdsByBirthYear(
            normalized.map(function (n) { return n.id; })
        );
        var byId = {};
        for (var n = 0; n < normalized.length; n++) {
            byId[normalized[n].id] = normalized[n];
        }
        var orderedNormalized = [];
        for (var o = 0; o < orderedIds.length; o++) {
            var entry = byId[orderedIds[o]];
            if (entry) orderedNormalized.push(entry);
        }

        var eldestId = orderedNormalized.length > 0 ? orderedNormalized[0].id : null;
        var youngestId = orderedNormalized.length > 0
            ? orderedNormalized[orderedNormalized.length - 1].id
            : null;

        return {
            total: normalized.length,
            living: living,
            full: full,
            half: half,
            adoptive: adoptive,
            step: step,
            eldestId: eldestId,
            youngestId: youngestId,
            all: orderedNormalized
        };
    }

    // =========================================================================
    // 5. GRANDCHILDREN
    // =========================================================================

    function _collectGrandchildren(characterId) {
        var ids = FQ.getGrandchildIds(characterId, 1);
        if (!Array.isArray(ids)) ids = [];

        var living = 0;
        var normalized = [];
        for (var i = 0; i < ids.length; i++) {
            var id = ids[i];
            if (!_hasId(id)) continue;
            var projection = _project(id);
            if (!projection) continue;
            if (_isLiving(projection)) living++;
            normalized.push({
                id: id,
                character: projection
            });
        }

        return {
            total: normalized.length,
            living: living,
            all: normalized
        };
    }

    // =========================================================================
    // 6. ORPHAN STATUS
    // =========================================================================

    function _computeIsOrphan(characterId) {
        // FamilyQueries.isOrphan expects (childId, isLivingFn) and
        // returns true / false / null (null when the child doesn't
        // exist, which we've already ruled out by this point).
        if (typeof FQ.isOrphan !== 'function') return false;
        var result = FQ.isOrphan(characterId, _isLivingId);
        return result === true;
    }

    // =========================================================================
    // 7. PUBLIC API
    // =========================================================================

    /**
     * Returns comprehensive family statistics for a character.
     *
     * @param {string} characterId
     * @returns {{
     *   characterId: string,
     *   parents: {
     *     total, hasParents, fatherId, motherId,
     *     biological, legal, social, ids
     *   },
     *   children: {
     *     total, living, biological, adopted,
     *     eldestId, youngestId,
     *     all: Array<{ id, character, biological, adopted, birthYear }>
     *   },
     *   siblings: {
     *     total, living, full, half, adoptive, step,
     *     eldestId, youngestId,
     *     all: Array<{ id, character, primaryType,
     *                  full, half, adoptive, step, birthYear }>
     *   },
     *   grandchildren: {
     *     total, living,
     *     all: Array<{ id, character }>
     *   },
     *   isOrphan: boolean,
     *   hasParents: boolean,
     *   hasChildren: boolean,
     *   hasSiblings: boolean,
     *   totalFamilyMembers: number
     * }|null}
     */
    function getFamilyStatistics(characterId) {
        if (!_hasId(characterId)) return null;

        var summary = _project(characterId);
        if (!summary) return null;

        var parents       = _collectParents(characterId);
        var children      = _collectChildren(characterId);
        var siblings      = _collectSiblings(characterId);
        var grandchildren = _collectGrandchildren(characterId);
        var isOrphan      = _computeIsOrphan(characterId);

        // Deduplicated total, excluding self. Built from ids only; the
        // projections are not re-fetched here.
        var seen = new Set();
        function addIds(list) {
            for (var i = 0; i < list.length; i++) {
                if (_hasId(list[i])) seen.add(list[i]);
            }
        }
        addIds(parents.ids);
        addIds(children.all.map(function (c) { return c.id; }));
        addIds(siblings.all.map(function (s) { return s.id; }));
        addIds(grandchildren.all.map(function (g) { return g.id; }));
        seen.delete(characterId);

        return {
            characterId: characterId,
            parents: parents,
            children: children,
            siblings: siblings,
            grandchildren: grandchildren,
            isOrphan: isOrphan,
            hasParents: parents.hasParents,
            hasChildren: children.total > 0,
            hasSiblings: siblings.total > 0,
            totalFamilyMembers: seen.size
        };
    }

    /**
     * Lightweight summary suitable for UI rendering. Avoids the full
     * statistics object when only counts are needed.
     *
     * @param {string} characterId
     * @returns {{
     *   childCount: number,
     *   livingChildCount: number,
     *   siblingCount: number,
     *   grandchildCount: number,
     *   isOrphan: boolean
     * }|null}
     */
    function getFamilySummary(characterId) {
        if (!_hasId(characterId)) return null;

        var summary = _project(characterId);
        if (!summary) return null;

        var childIds = FQ.getChildIds(characterId);
        if (!Array.isArray(childIds)) childIds = [];

        var livingChildCount = 0;
        for (var i = 0; i < childIds.length; i++) {
            if (_isLivingId(childIds[i])) livingChildCount++;
        }

        var siblingWrappers = FQ.getSiblings(characterId);
        if (!Array.isArray(siblingWrappers)) siblingWrappers = [];

        var grandchildIds = FQ.getGrandchildIds(characterId, 1);
        if (!Array.isArray(grandchildIds)) grandchildIds = [];

        return {
            childCount: childIds.length,
            livingChildCount: livingChildCount,
            siblingCount: siblingWrappers.length,
            grandchildCount: grandchildIds.length,
            isOrphan: _computeIsOrphan(characterId)
        };
    }

    // =========================================================================
    // 8. EXPORTS
    // =========================================================================

    window.FamilyStatistics = {
        getFamilyStatistics: getFamilyStatistics,
        getFamilySummary: getFamilySummary
    };

    // Convenience global. CharacterLifecycle and modals both expect this
    // to exist on the module namespace; keeping it on window as a
    // top-level function matches the existing call pattern in the
    // fixed callers.
    window.getFamilyStatistics = getFamilyStatistics;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.FamilyStatistics;
    }
})();
