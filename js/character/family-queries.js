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
 *
 * OUT OF SCOPE:
 *   - Edge validity policy        → family-rules.js
 *   - Mutations                   → family-commands.js
 *   - Aggregation                 → family-statistics.js
 *   - Persistence                 → family-state.js + storage.js
 *
 * READING CONTRACT:
 *   - Every returned object is a fresh projection. No live edge objects
 *     escape this module.
 *   - Missing input returns null (singular) or [] (collection).
 *   - This module does not classify siblings, orphan status, or kinship
 *     itself. It gathers parentage facts and calls FamilyRules.
 *
 * PROVIDER CONTRACT:
 *   getAncestorProvider() returns a pure function usable by FamilyRules
 *   for kinship classification and cycle detection. The provider walks
 *   biological parent edges only. Legal and social parentage does not
 *   participate in blood kinship.
 *
 * DEPENDENCIES (REQUIRED):
 *   - family-state.js:  FamilyState
 *   - family-rules.js:  FamilyRules
 *
 * ICON POLICY: No emojis. No icons.
 *
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

    var FS = window.FamilyState;
    var FR = window.FamilyRules;

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

    // =========================================================================
    // 2. EDGE PROJECTIONS
    // =========================================================================

    /**
     * Returns a projection of an edge by id, or null.
     */
    function getEdge(id) {
        if (!_hasId(id)) return null;
        return _readEdge(id);
    }

    /**
     * Returns every edge where parentId matches.
     * Options: { status: 'ongoing' | 'ended', parentType, parentRole }
     */
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

    /**
     * Returns every edge where childId matches.
     */
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

    /**
     * Returns every active parent of a child, as projections.
     * Options: { parentType, parentRole, includeEnded }
     */
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

    /**
     * Groups parents by role. Each role's list may contain multiple
     * entries (biological, legal, social). Callers who want a single
     * biological father or mother read that specific sub-array.
     */
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

    /**
     * Returns the ids of the biological parents of a child.
     * Uses biological edges only. Legal and social parentage does not
     * appear here.
     */
    function getBiologicalParentIds(childId) {
        if (!_hasId(childId)) return [];
        var edges = getEdgesForChild(childId, {
            status: 'ongoing',
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

    function getLegalParentIds(childId) {
        if (!_hasId(childId)) return [];
        var edges = getEdgesForChild(childId, {
            status: 'ongoing',
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

    function getSocialParentIds(childId) {
        if (!_hasId(childId)) return [];
        var edges = getEdgesForChild(childId, {
            status: 'ongoing',
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

    /**
     * Returns all parent ids across every classification.
     */
    function getAllParentIds(childId) {
        if (!_hasId(childId)) return [];
        var edges = getEdgesForChild(childId, { status: 'ongoing' });
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

    /**
     * Returns every active child of a parent, as projections.
     */
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

    function getChildIds(parentId) {
        if (!_hasId(parentId)) return [];
        var edges = getEdgesForParent(parentId, { status: 'ongoing' });
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

    function getBiologicalChildIds(parentId) {
        if (!_hasId(parentId)) return [];
        var edges = getEdgesForParent(parentId, {
            status: 'ongoing',
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

    // =========================================================================
    // 5. SIBLING FACTS AND CLASSIFICATION
    // =========================================================================

    /**
     * Gathers the parentage facts FamilyRules.deriveSiblingship needs.
     * Pure projection.
     */
    function getSiblingFacts(childId) {
        return {
            biologicalParents: getBiologicalParentIds(childId),
            legalParents: getLegalParentIds(childId),
            socialParents: getSocialParentIds(childId)
        };
    }

    /**
     * Returns sibling projections for a child.
     *
     * Each entry:
     *   {
     *     siblingId,
     *     primaryType: 'full' | 'half' | 'adoptive' | 'step',
     *     sharedBiologicalParents: [ids],
     *     sharedLegalParents: [ids],
     *     sharedSocialParents: [ids]
     *   }
     *
     * Candidate discovery uses shared parents, then delegates
     * classification to FamilyRules.deriveSiblingship.
     */
    function getSiblings(childId) {
        if (!_hasId(childId)) return [];

        var childFacts = getSiblingFacts(childId);
        var allParents = []
            .concat(childFacts.biologicalParents)
            .concat(childFacts.legalParents)
            .concat(childFacts.socialParents);

        if (allParents.length === 0) return [];

        var candidateIds = new Set();
        for (var i = 0; i < allParents.length; i++) {
            var candidateChildren = getChildIds(allParents[i]);
            for (var j = 0; j < candidateChildren.length; j++) {
                if (candidateChildren[j] !== childId) {
                    candidateIds.add(candidateChildren[j]);
                }
            }
        }

        var result = [];
        candidateIds.forEach(function (sibId) {
            var sibFacts = getSiblingFacts(sibId);
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

    /**
     * Returns grandparent ids, or great-grandparent ids for
     * generation > 1, walking biological parentage only.
     */
    function getGrandparentIds(childId, generation) {
        if (!_hasId(childId)) return [];
        generation = (generation === undefined || generation === null) ? 1 : generation;
        if (generation < 1) return [];

        var current = getBiologicalParentIds(childId);
        for (var g = 0; g < generation; g++) {
            var next = [];
            var seen = {};
            for (var i = 0; i < current.length; i++) {
                var grandparents = getBiologicalParentIds(current[i]);
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

    function getGrandchildIds(parentId, generation) {
        if (!_hasId(parentId)) return [];
        generation = (generation === undefined || generation === null) ? 1 : generation;
        if (generation < 1) return [];

        var current = getBiologicalChildIds(parentId);
        for (var g = 0; g < generation; g++) {
            var next = [];
            var seen = {};
            for (var i = 0; i < current.length; i++) {
                var grandchildren = getBiologicalChildIds(current[i]);
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

    /**
     * Returns a pure function suitable for FamilyRules.classifyKinship,
     * isBloodRelated, and wouldCreateBiologicalCycle.
     *
     *   provider(characterId) → { id, parents: [biologicalParentId] } | null
     *
     * Biological parentage only. Legal and social parentage does not
     * participate in blood kinship or cycle detection.
     *
     * The provider never throws. If FamilyState returns no edges for an
     * id, the provider returns null (no such character from the rules'
     * point of view). If FamilyState returns edges with an id that no
     * longer resolves, the edges are still returned; this is a self-heal
     * path and the caller's migration is responsible for cleanup.
     */
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

    // =========================================================================
    // 9. ORPHAN / ANY PARENT
    // =========================================================================

    /**
     * Facts used by FamilyRules.isOrphan:
     *   livingBiologicalParents, livingLegalParents
     *
     * The "living" filter requires CharacterState. This module does not
     * reach into CharacterState directly; it expects the caller to pass
     * a predicate. When no predicate is supplied, all active parents are
     * treated as living, and the result reflects structural orphanhood.
     */
    function isOrphan(childId, isLiving) {
        if (!_hasId(childId)) return null;
        if (typeof isLiving !== 'function') {
            isLiving = function () { return true; };
        }
        var livingBio = getBiologicalParentIds(childId).filter(isLiving);
        var livingLegal = getLegalParentIds(childId).filter(isLiving);
        var result = FR.isOrphan({
            livingBiologicalParents: livingBio,
            livingLegalParents: livingLegal
        });
        return result.valid ? result.value : null;
    }

    function hasAnyParent(childId) {
        if (!_hasId(childId)) return null;
        var result = FR.hasAnyParent({
            biologicalParents: getBiologicalParentIds(childId),
            legalParents: getLegalParentIds(childId),
            socialParents: getSocialParentIds(childId)
        });
        return result.valid ? result.value : null;
    }

    // =========================================================================
    // 10. EXPORTS
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

        // Siblings
        getSiblingFacts: getSiblingFacts,
        getSiblings: getSiblings,

        // Grandparents / grandchildren
        getGrandparentIds: getGrandparentIds,
        getGrandchildIds: getGrandchildIds,

        // Provider
        getAncestorProvider: getAncestorProvider,

        // Kinship
        classifyKinship: classifyKinship,
        isBloodRelated: isBloodRelated,

        // Orphan
        isOrphan: isOrphan,
        hasAnyParent: hasAnyParent
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.FamilyQueries;
    }
})();
