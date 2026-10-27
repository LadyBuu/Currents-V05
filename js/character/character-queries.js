/**
 * =============================================================================
 * STILL WATERS - FAMILY QUERIES (js/character/family-queries.js)
 * =============================================================================
 *
 * Semantic reads over the canonical parent_child edge collection.
 *
 * SCOPE:
 *   - Traversal of parent_child edges
 *   - Projection of edges into family-shaped objects
 *   - Composition of FamilyRules classification into results
 *   - Construction of the biological ancestor provider used by
 *     FamilyRules.classifyKinship, isBloodRelated, and
 *     wouldCreateBiologicalCycle
 *   - Kinship wrappers (cousins, aunts/uncles, nieces/nephews)
 *   - Numeric kinship closeness
 *   - Kinship-based filters (isFirstCousin, isAuntOrUncle, ...)
 *
 * OUT OF SCOPE:
 *   - Edge validity policy        -> family-rules.js
 *   - Mutations                   -> family-commands.js
 *   - Aggregation                 -> family-statistics.js
 *   - Persistence                 -> family-state.js + storage.js
 *
 * READING CONTRACT:
 *   - Every returned object is a fresh projection. No live edge objects
 *     escape this module.
 *   - Missing input returns null (singular) or [] (collection).
 *   - This module does not classify siblings, orphan status, or kinship
 *     itself. It gathers parentage facts and calls FamilyRules.
 *
 * OPTIONS:
 *   Every function that returns a collection of related-character ids
 *   accepts an optional `options` object. The only recognised option is:
 *
 *     { includeEnded: boolean }
 *
 *   Default (missing or false) filters to edges with status === 'ongoing'.
 *   `includeEnded: true` includes both ongoing and ended edges.
 *
 *   This option is deliberately named `includeEnded` rather than
 *   `activeOnly` to match the option shape of `getParents` and
 *   `getChildren`. Family edges are primarily the *current* family
 *   structure; the option opts into history. The relationship domain's
 *   `activeOnly` is a different concept (a record is either active or
 *   historical); family edges are the same edge with a status field.
 *
 *   Functions that accept `includeEnded`:
 *     getChildIds, getBiologicalChildIds, getLegalChildIds,
 *     getAllParentIds, getBiologicalParentIds, getLegalParentIds,
 *     getSocialParentIds, getSiblingFacts, getSiblings,
 *     getGrandparentIds, getGrandchildIds.
 *
 * PROVIDER CONTRACT:
 *   getAncestorProvider() returns a pure function usable by FamilyRules
 *   for kinship classification and cycle detection. The provider walks
 *   biological parent edges only. Legal and social parentage does not
 *   participate in blood kinship.
 *
 * KINSHIP WRAPPERS:
 *   The wrappers below (cousins, aunts/uncles, nieces/nephews) iterate
 *   CharacterState's collection and classify each candidate against the
 *   subject using FamilyRules.classifyKinship. They are O(n) per call.
 *   Fine for populations in the low thousands. If they become hot,
 *   reverse indexes belong in FamilyState.
 *
 * NUMERIC CLOSENESS:
 *   getKinshipCloseness returns an integer:
 *     0   self
 *     1   parent / child
 *     2   sibling / grandparent / grandchild
 *     3   aunt/uncle / niece/nephew
 *     4   first cousin
 *     5+  more distant cousins (degree + 1)
 *     99  unrelated
 *   The numeric value is a projection of the same classification that
 *   classifyKinship computes. It is defined here, not in FamilyRules,
 *   because it is a query-facing convenience metric.
 *
 * DEPENDENCIES (REQUIRED):
 *   - family-state.js:    FamilyState
 *   - family-rules.js:    FamilyRules
 *   - character-state.js: CharacterState (for candidate iteration and
 *                         for existence checks)
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision (Phase 2.1):
 *     - getChildIds, getBiologicalChildIds, getLegalChildIds,
 *       getAllParentIds, getBiologicalParentIds, getLegalParentIds,
 *       and getSocialParentIds now accept { includeEnded: boolean }.
 *       Default behaviour (no options) is unchanged: ongoing only.
 *       The previous implementations ignored any options argument,
 *       which silently dropped ended edges. Callers that passed
 *       { activeOnly: false } were silently getting ongoing-only
 *       results; that pattern was a bug in the callers, not in this
 *       module, but the module now accepts the intended option so
 *       callers can express the intent.
 *     - getSiblingFacts, getSiblings, getGrandparentIds, and
 *       getGrandchildIds thread the option through to the underlying
 *       parent/child id readers, so kinship wrappers can traverse
 *       through ended edges when the caller opts in.
 *     - Header READING CONTRACT adds the OPTIONS section.
 *     - No behavioural change for callers that pass no options.
 * =============================================================================
 */

(function () {
    'use strict';

    if (!window.FamilyState) {
        throw new Error(
            'family-queries.js: family-state.js must load first.'
        );
    }
    if (!window.FamilyRules) {
        throw new Error(
            'family-queries.js: family-rules.js must load first.'
        );
    }
    if (!window.CharacterState) {
        throw new Error(
            'family-queries.js: character-state.js must load first.'
        );
    }

    var FS = window.FamilyState;
    var FR = window.FamilyRules;
    var CS = window.CharacterState;

    // =========================================================================
    // 1. HELPERS
    // =========================================================================

    function _hasId(v) {
        return typeof v === 'string' && v.length > 0;
    }

    function _isMissing(v) {
        return v === undefined || v === null;
    }

    function _readEdge(id) {
        return FS.getEdgeCopy(id);
    }

    function _allCharacterIds() {
        var all = CS.getAllCharacters();
        var out = [];
        for (var i = 0; i < all.length; i++) {
            if (all[i] && _hasId(all[i].id)) out.push(all[i].id);
        }
        return out;
    }

    /**
     * Resolves the edge-status filter from a caller-supplied options
     * object. Returns 'ongoing' for the default, null for
     * includeEnded: true.
     *
     * The two cases are distinct: 'ongoing' filters to active edges,
     * null means "no status filter" (all edges).
     */
    function _resolveStatusFilter(options) {
        options = options || {};
        return options.includeEnded === true ? null : 'ongoing';
    }

    // =========================================================================
    // 2. EDGE PROJECTIONS
    // =========================================================================

    function getEdge(id) {
        if (!_hasId(id)) return null;
        return _readEdge(id);
    }

    function getEdgesForParent(parentId, options) {
        if (!_hasId(parentId)) return [];
        options = options || {};
        var ids = FS.idsForParent(parentId);
        var out = [];
        for (var i = 0; i < ids.length; i++) {
            var e = _readEdge(ids[i]);
            if (!e) continue;
            if (options.status && e.status !== options.status) continue;
            if (options.parentType && e.parentType !== options.parentType) continue;
            if (options.parentRole && e.parentRole !== options.parentRole) continue;
            out.push(e);
        }
        return out;
    }

    function getEdgesForChild(childId, options) {
        if (!_hasId(childId)) return [];
        options = options || {};
        var ids = FS.idsForChild(childId);
        var out = [];
        for (var i = 0; i < ids.length; i++) {
            var e = _readEdge(ids[i]);
            if (!e) continue;
            if (options.status && e.status !== options.status) continue;
            if (options.parentType && e.parentType !== options.parentType) continue;
            if (options.parentRole && e.parentRole !== options.parentRole) continue;
            out.push(e);
        }
        return out;
    }

    // =========================================================================
    // 3. PARENT LOOKUPS
    // =========================================================================

    function getParents(childId, options) {
        if (!_hasId(childId)) return [];
        options = options || {};
        var status = options.includeEnded === true ? null : 'ongoing';
        return getEdgesForChild(childId, {
            status: status,
            parentType: options.parentType,
            parentRole: options.parentRole
        });
    }

    function getParentsByRole(childId) {
        var parents = getParents(childId);
        var fathers = [];
        var mothers = [];
        var others = [];
        for (var i = 0; i < parents.length; i++) {
            var p = parents[i];
            if (p.parentRole === FR.PARENT_ROLE.FATHER) fathers.push(p);
            else if (p.parentRole === FR.PARENT_ROLE.MOTHER) mothers.push(p);
            else others.push(p);
        }
        return { fathers: fathers, mothers: mothers, others: others };
    }

    function getBiologicalParentIds(childId, options) {
        if (!_hasId(childId)) return [];
        var status = _resolveStatusFilter(options);
        var edges = getEdgesForChild(childId, {
            status: status,
            parentType: FR.PARENT_TYPE.BIOLOGICAL
        });
        var out = [];
        var seen = {};
        for (var i = 0; i < edges.length; i++) {
            var id = edges[i].parentId;
            if (!seen[id]) {
                seen[id] = true;
                out.push(id);
            }
        }
        return out;
    }

    function getLegalParentIds(childId, options) {
        if (!_hasId(childId)) return [];
        var status = _resolveStatusFilter(options);
        var edges = getEdgesForChild(childId, {
            status: status,
            parentType: FR.PARENT_TYPE.LEGAL
        });
        var out = [];
        var seen = {};
        for (var i = 0; i < edges.length; i++) {
            var id = edges[i].parentId;
            if (!seen[id]) {
                seen[id] = true;
                out.push(id);
            }
        }
        return out;
    }

    function getSocialParentIds(childId, options) {
        if (!_hasId(childId)) return [];
        var status = _resolveStatusFilter(options);
        var edges = getEdgesForChild(childId, {
            status: status,
            parentType: FR.PARENT_TYPE.SOCIAL
        });
        var out = [];
        var seen = {};
        for (var i = 0; i < edges.length; i++) {
            var id = edges[i].parentId;
            if (!seen[id]) {
                seen[id] = true;
                out.push(id);
            }
        }
        return out;
    }

    function getAllParentIds(childId, options) {
        if (!_hasId(childId)) return [];
        var status = _resolveStatusFilter(options);
        var edges = getEdgesForChild(childId, { status: status });
        var out = [];
        var seen = {};
        for (var i = 0; i < edges.length; i++) {
            var id = edges[i].parentId;
            if (!seen[id]) {
                seen[id] = true;
                out.push(id);
            }
        }
        return out;
    }

    // =========================================================================
    // 4. CHILD LOOKUPS
    // =========================================================================

    function getChildren(parentId, options) {
        if (!_hasId(parentId)) return [];
        options = options || {};
        var status = options.includeEnded === true ? null : 'ongoing';
        return getEdgesForParent(parentId, {
            status: status,
            parentType: options.parentType,
            parentRole: options.parentRole
        });
    }

    function getChildIds(parentId, options) {
        if (!_hasId(parentId)) return [];
        var status = _resolveStatusFilter(options);
        var edges = getEdgesForParent(parentId, { status: status });
        var out = [];
        var seen = {};
        for (var i = 0; i < edges.length; i++) {
            var id = edges[i].childId;
            if (!seen[id]) {
                seen[id] = true;
                out.push(id);
            }
        }
        return out;
    }

    function getBiologicalChildIds(parentId, options) {
        if (!_hasId(parentId)) return [];
        var status = _resolveStatusFilter(options);
        var edges = getEdgesForParent(parentId, {
            status: status,
            parentType: FR.PARENT_TYPE.BIOLOGICAL
        });
        var out = [];
        var seen = {};
        for (var i = 0; i < edges.length; i++) {
            var id = edges[i].childId;
            if (!seen[id]) {
                seen[id] = true;
                out.push(id);
            }
        }
        return out;
    }

    function getLegalChildIds(parentId, options) {
        if (!_hasId(parentId)) return [];
        var status = _resolveStatusFilter(options);
        var edges = getEdgesForParent(parentId, {
            status: status,
            parentType: FR.PARENT_TYPE.LEGAL
        });
        var out = [];
        var seen = {};
        for (var i = 0; i < edges.length; i++) {
            var id = edges[i].childId;
            if (!seen[id]) {
                seen[id] = true;
                out.push(id);
            }
        }
        return out;
    }

    // =========================================================================
    // 5. SIBLING FACTS AND CLASSIFICATION
    // =========================================================================

    function getSiblingFacts(childId, options) {
        return {
            biologicalParents: getBiologicalParentIds(childId, options),
            legalParents: getLegalParentIds(childId, options),
            socialParents: getSocialParentIds(childId, options)
        };
    }

    function getSiblings(childId, options) {
        if (!_hasId(childId)) return [];

        var childFacts = getSiblingFacts(childId, options);
        var allParents = []
            .concat(childFacts.biologicalParents)
            .concat(childFacts.legalParents)
            .concat(childFacts.socialParents);

        if (allParents.length === 0) return [];

        // When the caller opts into ended edges, sibling discovery must
        // also traverse ended parent edges (otherwise a sibling who
        // shares an ended biological edge would be missed). The child
        // list is fetched with the same options for consistency.
        var status = _resolveStatusFilter(options);

        var candidateIds = new Set();
        for (var i = 0; i < allParents.length; i++) {
            var parentEdges = getEdgesForParent(allParents[i], { status: status });
            for (var j = 0; j < parentEdges.length; j++) {
                if (parentEdges[j].childId !== childId) {
                    candidateIds.add(parentEdges[j].childId);
                }
            }
        }

        var result = [];
        candidateIds.forEach(function (sibId) {
            var sibFacts = getSiblingFacts(sibId, options);
            var classification = FR.deriveSiblingship(childFacts, sibFacts);
            if (!classification) return;
            result.push({
                siblingId: sibId,
                primaryType: classification.primaryType,
                sharedBiologicalParents: classification.sharedBiologicalParents,
                sharedLegalParents: classification.sharedLegalParents,
                sharedSocialParents: classification.sharedSocialParents
            });
        });
        return result;
    }

    // =========================================================================
    // 6. GRANDPARENTS / GRANDCHILDREN
    // =========================================================================

    function getGrandparentIds(childId, generation, options) {
        if (!_hasId(childId)) return [];
        generation = (generation === undefined || generation === null) ? 1 : generation;
        if (generation < 1) return [];

        var current = getBiologicalParentIds(childId, options);
        for (var g = 0; g < generation; g++) {
            var next = [];
            var seen = {};
            for (var i = 0; i < current.length; i++) {
                var grandparents = getBiologicalParentIds(current[i], options);
                for (var j = 0; j < grandparents.length; j++) {
                    var pid = grandparents[j];
                    if (!seen[pid]) {
                        seen[pid] = true;
                        next.push(pid);
                    }
                }
            }
            current = next;
            if (current.length === 0) break;
        }
        return current;
    }

    function getGrandchildIds(parentId, generation, options) {
        if (!_hasId(parentId)) return [];
        generation = (generation === undefined || generation === null) ? 1 : generation;
        if (generation < 1) return [];

        var current = getBiologicalChildIds(parentId, options);
        for (var g = 0; g < generation; g++) {
            var next = [];
            var seen = {};
            for (var i = 0; i < current.length; i++) {
                var grandchildren = getBiologicalChildIds(current[i], options);
                for (var j = 0; j < grandchildren.length; j++) {
                    var cid = grandchildren[j];
                    if (!seen[cid]) {
                        seen[cid] = true;
                        next.push(cid);
                    }
                }
            }
            current = next;
            if (current.length === 0) break;
        }
        return current;
    }

    // =========================================================================
    // 7. PROVIDER FOR FAMILY RULES
    // =========================================================================

    function getAncestorProvider() {
        return function provider(characterId) {
            if (!_hasId(characterId)) return null;
            var parents = getBiologicalParentIds(characterId);
            return { id: characterId, parents: parents };
        };
    }

    // =========================================================================
    // 8. KINSHIP
    // =========================================================================

    function classifyKinship(aId, bId) {
        if (!_hasId(aId) || !_hasId(bId)) return null;
        var provider = getAncestorProvider();
        return FR.classifyKinship(aId, bId, provider);
    }

    function isBloodRelated(aId, bId) {
        if (!_hasId(aId) || !_hasId(bId)) return false;
        var provider = getAncestorProvider();
        return FR.isBloodRelated(aId, bId, provider);
    }

    /**
     * Numeric kinship closeness between two characters.
     *
     * Returns:
     *   0   self
     *   1   parent / child
     *   2   sibling / grandparent / grandchild
     *   3   aunt/uncle / niece/nephew
     *   4   first cousin
     *   5+  more distant cousins
     *   99  unrelated
     *   null for missing ids
     */
    function getKinshipCloseness(aId, bId) {
        if (!_hasId(aId) || !_hasId(bId)) return null;
        var k = classifyKinship(aId, bId);
        if (!k) return null;

        switch (k.type) {
            case FR.KINSHIP.SELF: return 0;
            case FR.KINSHIP.PARENT: return 1;
            case FR.KINSHIP.CHILD: return 1;
            case FR.KINSHIP.SIBLING: return 2;
            case FR.KINSHIP.GRANDPARENT: return 2;
            case FR.KINSHIP.GRANDCHILD: return 2;
            case FR.KINSHIP.GREAT_GRANDPARENT: return 2;
            case FR.KINSHIP.GREAT_GRANDCHILD: return 2;
            case FR.KINSHIP.AUNT_UNCLE: return 3;
            case FR.KINSHIP.NIECE_NEPHEW: return 3;
            case FR.KINSHIP.COUSIN:
                if (typeof k.degree === 'number') {
                    return Math.max(4, k.degree + 3);
                }
                return 4;
            default: return 99;
        }
    }

    // =========================================================================
    // 9. KINSHIP WRAPPERS
    // =========================================================================

    /**
     * Returns the ids of every first cousin of the given character.
     * First cousin: shared grandparent, distance 2 each.
     */
    function getFirstCousinIds(characterId) {
        if (!_hasId(characterId)) return [];
        var out = [];
        var candidates = _allCharacterIds();
        for (var i = 0; i < candidates.length; i++) {
            var cid = candidates[i];
            if (cid === characterId) continue;
            var k = classifyKinship(characterId, cid);
            if (!k) continue;
            if (k.type !== FR.KINSHIP.COUSIN) continue;
            if (k.degree === 1 && k.removed === 0) out.push(cid);
        }
        return out;
    }

    /**
     * Returns the ids of every cousin of the given character, with
     * their classification.
     *
     * Each entry: { cousinId, degree, removed }
     */
    function getCousins(characterId) {
        if (!_hasId(characterId)) return [];
        var out = [];
        var candidates = _allCharacterIds();
        for (var i = 0; i < candidates.length; i++) {
            var cid = candidates[i];
            if (cid === characterId) continue;
            var k = classifyKinship(characterId, cid);
            if (!k || k.type !== FR.KINSHIP.COUSIN) continue;
            out.push({
                cousinId: cid,
                degree: typeof k.degree === 'number' ? k.degree : null,
                removed: typeof k.removed === 'number' ? k.removed : null
            });
        }
        return out;
    }

    /**
     * Returns the ids of every aunt or uncle of the given character.
     */
    function getAuntAndUncleIds(characterId) {
        if (!_hasId(characterId)) return [];
        var out = [];
        var candidates = _allCharacterIds();
        for (var i = 0; i < candidates.length; i++) {
            var cid = candidates[i];
            if (cid === characterId) continue;
            var k = classifyKinship(characterId, cid);
            if (!k) continue;
            if (k.type !== FR.KINSHIP.AUNT_UNCLE) continue;
            out.push(cid);
        }
        return out;
    }

    /**
     * Returns the ids of every niece or nephew of the given character.
     */
    function getNieceAndNephewIds(characterId) {
        if (!_hasId(characterId)) return [];
        var out = [];
        var candidates = _allCharacterIds();
        for (var i = 0; i < candidates.length; i++) {
            var cid = candidates[i];
            if (cid === characterId) continue;
            var k = classifyKinship(characterId, cid);
            if (!k) continue;
            if (k.type !== FR.KINSHIP.NIECE_NEPHEW) continue;
            out.push(cid);
        }
        return out;
    }

    /**
     * Returns the ids of every biological grandparent of a generation.
     * Generation 1 = grandparents, 2 = great-grandparents.
     * Alias of getGrandparentIds for readability.
     */
    function getGrandparents(characterId, generation, options) {
        return getGrandparentIds(characterId, generation, options);
    }

    /**
     * Returns the ids of every biological grandchild of a generation.
     * Alias of getGrandchildIds for readability.
     */
    function getGrandchildren(parentId, generation, options) {
        return getGrandchildIds(parentId, generation, options);
    }

    /**
     * Predicates. All take two character ids.
     */
    function isFirstCousin(aId, bId) {
        if (!_hasId(aId) || !_hasId(bId)) return false;
        var k = classifyKinship(aId, bId);
        if (!k || k.type !== FR.KINSHIP.COUSIN) return false;
        return k.degree === 1 && k.removed === 0;
    }

    function isAuntOrUncle(aId, bId) {
        if (!_hasId(aId) || !_hasId(bId)) return false;
        var k = classifyKinship(aId, bId);
        return k && k.type === FR.KINSHIP.AUNT_UNCLE;
    }

    function isNieceOrNephew(aId, bId) {
        if (!_hasId(aId) || !_hasId(bId)) return false;
        var k = classifyKinship(aId, bId);
        return k && k.type === FR.KINSHIP.NIECE_NEPHEW;
    }

    function isGrandparent(aId, bId) {
        if (!_hasId(aId) || !_hasId(bId)) return false;
        var k = classifyKinship(aId, bId);
        return k && (k.type === FR.KINSHIP.GRANDPARENT
                  || k.type === FR.KINSHIP.GREAT_GRANDPARENT);
    }

    function isGrandchild(aId, bId) {
        if (!_hasId(aId) || !_hasId(bId)) return false;
        var k = classifyKinship(aId, bId);
        return k && (k.type === FR.KINSHIP.GRANDCHILD
                  || k.type === FR.KINSHIP.GREAT_GRANDCHILD);
    }

    // =========================================================================
    // 10. ORPHAN / ANY PARENT
    // =========================================================================

    function isOrphan(childId, isLiving, options) {
        if (!_hasId(childId)) return null;
        if (typeof isLiving !== 'function') {
            isLiving = function () { return true; };
        }
        var livingBio = getBiologicalParentIds(childId, options).filter(isLiving);
        var livingLegal = getLegalParentIds(childId, options).filter(isLiving);
        var result = FR.isOrphan({
            livingBiologicalParents: livingBio,
            livingLegalParents: livingLegal
        });
        return result.valid ? result.value : null;
    }

    function hasAnyParent(childId, options) {
        if (!_hasId(childId)) return null;
        var result = FR.hasAnyParent({
            biologicalParents: getBiologicalParentIds(childId, options),
            legalParents: getLegalParentIds(childId, options),
            socialParents: getSocialParentIds(childId, options)
        });
        return result.valid ? result.value : null;
    }

    // =========================================================================
    // 11. EXPORTS
    // =========================================================================

    window.FamilyQueries = {
        // Edge projection
        getEdge: getEdge,
        getEdgesForParent: getEdgesForParent,
        getEdgesForChild: getEdgesForChild,

        // Parents
        getParents: getParents,
        getParentsByRole: getParentsByRole,
        getBiologicalParentIds: getBiologicalParentIds,
        getLegalParentIds: getLegalParentIds,
        getSocialParentIds: getSocialParentIds,
        getAllParentIds: getAllParentIds,

        // Children
        getChildren: getChildren,
        getChildIds: getChildIds,
        getBiologicalChildIds: getBiologicalChildIds,
        getLegalChildIds: getLegalChildIds,

        // Siblings
        getSiblingFacts: getSiblingFacts,
        getSiblings: getSiblings,

        // Grandparents / grandchildren
        getGrandparentIds: getGrandparentIds,
        getGrandchildIds: getGrandchildIds,
        getGrandparents: getGrandparents,
        getGrandchildren: getGrandchildren,

        // Provider
        getAncestorProvider: getAncestorProvider,

        // Kinship
        classifyKinship: classifyKinship,
        isBloodRelated: isBloodRelated,
        getKinshipCloseness: getKinshipCloseness,

        // Kinship wrappers
        getFirstCousinIds: getFirstCousinIds,
        getCousins: getCousins,
        getAuntAndUncleIds: getAuntAndUncleIds,
        getNieceAndNephewIds: getNieceAndNephewIds,

        // Predicates
        isFirstCousin: isFirstCousin,
        isAuntOrUncle: isAuntOrUncle,
        isNieceOrNephew: isNieceOrNephew,
        isGrandparent: isGrandparent,
        isGrandchild: isGrandchild,

        // Orphan
        isOrphan: isOrphan,
        hasAnyParent: hasAnyParent
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.FamilyQueries;
    }
})();
