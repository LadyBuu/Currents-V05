/**
 * relationship-finder-queries.js
 *
 * Structured report + connection path for the Relationship Finder UI.
 *
 * The Finder is a two-graph traversal:
 *   1. FamilyState (parentage edges)      — via FamilyQueries
 *   2. RelationshipState (all non-family) — via RelationshipQueries
 *
 * Kinship (sibling, grandparent, aunt/uncle, cousin, etc.) is derived
 * by FamilyRules.classifyKinship. It is NOT traversed as an edge. The
 * BFS graph is parentage + actual relationship records.
 *
 * Owns:
 *   - getReport(aId, bId) — combined character projection, kinship,
 *     existing relationship edges, connection path, social distance
 *   - findConnectionPath(aId, bId) — BFS over the union graph
 *   - findCommonAncestors(aId, bId) — biological ancestors shared
 *     between two characters
 *
 * Depends on:
 *   - FamilyQueries for parentage and kinship
 *   - FamilyRules for kinship classification
 *   - RelationshipQueries for the non-family graph
 *   - Character accessors for names, ages, locations
 *
 * Does NOT own:
 *   - state access (goes through queries)
 *   - mutation
 *   - persistence
 *   - randomness
 *   - policy
 *
 * Every returned value is a defensive projection. Never a live record.
 * Unknown inputs return null or []. No fabrication.
 *
 * GRAPH TRAVERSAL:
 *   Parentage edges are fetched with { includeEnded: true }. The Finder
 *   is a historical-graph finder: two characters whose only connection
 *   is an ended parent edge (an adoption that was dissolved, a
 *   biological edge that was superseded) are still "connected" for the
 *   purpose of the report. The report distinguishes active edges from
 *   ended edges in the `existingRelationships` array; the BFS does not.
 *
 * PARENTAGE EDGE SHAPE:
 *   FamilyQueries.getParentsByRole and FamilyQueries.getChildren both
 *   return EDGE WRAPPERS with a canonical `id` field. Do NOT read
 *   `.relationshipId` from them — that field does not exist on family
 *   edges. The previous revision read it, so every parentage step in
 *   the path carried `viaRelationshipId: undefined`. Fixed here.
 *
 * PARENT_CHILD TYPE:
 *   Parentage edges carry `viaType: 'parent_child'` (a literal string).
 *   RELATIONSHIP_ARCHETYPES does NOT declare a PARENT_CHILD constant —
 *   parentage is not a relationship archetype; it lives in FamilyState.
 *   The previous revision read A.PARENT_CHILD, which is undefined, so
 *   every parentage step in the path carried `viaType: undefined`.
 *
 * Load order: after relationship-queries.js, family-queries.js,
 * family-rules.js.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision (Phase 2.1):
 *     - _parentageEdges: FQ.getChildRelationships (which does not exist)
 *       replaced with FQ.getChildren. This was a live crash: every call
 *       to findConnectionPath and getReport threw TypeError.
 *     - _parentageEdges: parent and child edge wrappers now read .id
 *       (not .relationshipId). Family edges carry .id; .relationshipId
 *       was always undefined, so every parentage step carried
 *       viaRelationshipId: undefined.
 *     - _parentageEdges: uses the literal 'parent_child' for viaType.
 *       A.PARENT_CHILD is undefined (parentage is not a relationship
 *       archetype; it lives in FamilyState). Every parentage step
 *       previously carried viaType: undefined.
 *     - _parentageEdges and _parentageNeighbors: fetch edges with
 *       { includeEnded: true }. The Finder traverses the historical
 *       graph; the previous code intended this but expressed it as
 *       { activeOnly: false }, which FamilyQueries ignored.
 *     - Deleted _allNeighbors and _parentageNeighbors. Both were dead
 *       code (no callers), and the live graph walk uses edge-based
 *       traversal via _allEdges.
 *     - getReport's currentYear field no longer throws if time.js is
 *       missing. It is sourced from _getCurrentYearOrNull, matching
 *       the rest of the report's no-fabrication rule.
 *     - No other behavioural change.
 * =============================================================================
 */

(function() {
    'use strict';

    var RQ = window.RelationshipQueries;
    var FQ = window.FamilyQueries;
    var FR = window.FamilyRules;

    var A = window.RELATIONSHIP_ARCHETYPES;
    var STATUS = window.RELATIONSHIP_STATUS;

    if (!RQ || !FQ || !FR || !A || !STATUS) {
        throw new Error('relationship-finder-queries.js: relationship-queries.js, family-queries.js, family-rules.js must load first');
    }

    // -------------------------------------------------------------------------
    // DEPENDENCIES
    // -------------------------------------------------------------------------

    function _getCharacter(id) {
        if (typeof window.getCharacterById !== 'function') {
            throw new Error('relationship-finder-queries.js: getCharacterById required');
        }
        return window.getCharacterById(id);
    }

    function _getCurrentYearOrNull() {
        if (typeof window.getCurrentYear !== 'function') return null;
        var year = window.getCurrentYear();
        return typeof year === 'number' && Number.isFinite(year) ? year : null;
    }

    function _age(character) {
        if (!character) return null;
        if (typeof character.birthYear !== 'number') return null;
        if (typeof window.calculateAge === 'function') {
            return window.calculateAge(
                character.birthYear,
                character.isDeceased,
                character.deathYear
            );
        }
        return null;
    }

    function _location(character) {
        if (!character) return null;
        if (typeof window.getCurrentLocation !== 'function') return null;
        var loc = window.getCurrentLocation(character);
        return (loc === undefined) ? null : loc;
    }

    function _rankSymbol(character) {
        if (!character) return null;
        if (typeof window.getActiveRankDisplay !== 'function') return null;
        var r = window.getActiveRankDisplay(character);
        return r ? (r.symbol || null) : null;
    }

    function _characterProjection(id) {
        var c = _getCharacter(id);
        if (!c) return null;
        return {
            id: c.id,
            name: typeof c.name === 'string' ? c.name : null,
            surname: typeof c.surname === 'string' ? c.surname : '',
            gender: typeof c.gender === 'string' ? c.gender : null,
            isDeceased: !!c.isDeceased,
            age: _age(c),
            location: _location(c),
            rankSymbol: _rankSymbol(c)
        };
    }

    // -------------------------------------------------------------------------
    // PARENTAGE EDGE PROJECTION
    //
    // The Finder's BFS traverses parentage plus relationship records.
    // Parentage edges come from FamilyQueries. Each edge is projected
    // into the same { from, to, viaRelationshipId, viaType, viaRole }
    // shape that relationship edges use, so the path builder can read
    // them uniformly.
    //
    // Two facts are load-bearing and easy to get wrong:
    //   1. Family edge wrappers carry `.id`, not `.relationshipId`.
    //   2. The parentage archetype is 'parent_child' (a literal).
    //      RELATIONSHIP_ARCHETYPES.PARENT_CHILD does not exist.
    //
    // Both were wrong in the previous revision. Both are correct here.
    // -------------------------------------------------------------------------

    var PARENT_CHILD_TYPE = 'parent_child';

    function _parentageEdges(characterId) {
        var edges = [];

        // Parent-side edges (this character is the child).
        // getParentsByRole returns edge wrappers with .id, .parentId,
        // .childId, .parentType, .parentRole. It uses the default
        // (ongoing) filter; ended parent edges are also traversed
        // here because the Finder is a historical-graph finder.
        var parents = FQ.getParentsByRole(characterId);
        var allParents = []
            .concat(parents.fathers)
            .concat(parents.mothers)
            .concat(parents.others);
        for (var i = 0; i < allParents.length; i++) {
            var p = allParents[i];
            edges.push({
                from: characterId,
                to: p.parentId,
                viaRelationshipId: p.id,
                viaType: PARENT_CHILD_TYPE,
                viaRole: 'child_to_parent'
            });
        }

        // Also include ended parent edges. getParentsByRole uses the
        // default filter; we need the full set for traversal.
        var allParentsAllStatus = FQ.getParents(characterId, { includeEnded: true });
        for (var p2 = 0; p2 < allParentsAllStatus.length; p2++) {
            var pe = allParentsAllStatus[p2];
            // Skip ongoing edges already added above.
            if (pe.status === 'ongoing') continue;
            edges.push({
                from: characterId,
                to: pe.parentId,
                viaRelationshipId: pe.id,
                viaType: PARENT_CHILD_TYPE,
                viaRole: 'child_to_parent'
            });
        }

        // Child-side edges (this character is the parent).
        // getChildren returns edge wrappers with .id, .parentId, .childId.
        // includeEnded: true so the Finder traverses historical edges.
        var children = FQ.getChildren(characterId, { includeEnded: true });
        for (var j = 0; j < children.length; j++) {
            var c = children[j];
            edges.push({
                from: characterId,
                to: c.childId,
                viaRelationshipId: c.id,
                viaType: PARENT_CHILD_TYPE,
                viaRole: 'parent_to_child'
            });
        }

        return edges;
    }

    // -------------------------------------------------------------------------
    // RELATIONSHIP NEIGHBORHOOD
    //
    // Uses RelationshipQueries.getForCharacter for the graph walk and
    // projects each record into the edge shape. The graph includes all
    // non-family archetypes: romantic, friendship, rivalry, enmity,
    // professional. It does NOT include parentage (that comes from
    // FamilyState).
    // -------------------------------------------------------------------------

    function _relationshipEdges(characterId, options) {
        options = options || {};
        var records = options.activeOnly === false
            ? RQ.getForCharacter(characterId)
            : RQ.getForCharacter(characterId, { activeOnly: true });

        var edges = [];
        for (var i = 0; i < records.length; i++) {
            var r = records[i];
            var otherId = r.participantA === characterId
                ? r.participantB
                : r.participantA;
            edges.push({
                from: characterId,
                to: otherId,
                viaRelationshipId: r.id,
                viaType: r.type,
                viaStatus: r.status
            });
        }
        return edges;
    }

    function _allEdges(characterId, options) {
        return _parentageEdges(characterId)
            .concat(_relationshipEdges(characterId, options));
    }

    // -------------------------------------------------------------------------
    // CONNECTION PATH (BFS over union graph)
    //
    // Returns an array of steps:
    //   [{ characterId, viaRelationshipId, viaType, viaRole?, viaStatus? }]
    //
    // The first step has viaRelationshipId === null (start).
    // Returns null if no path within maxDepth.
    // -------------------------------------------------------------------------

    function findConnectionPath(aId, bId, options) {
        options = options || {};
        var maxDepth = (typeof options.maxDepth === 'number') ? options.maxDepth : 6;

        if (typeof aId !== 'string' || typeof bId !== 'string') return null;
        if (aId === bId) {
            return [{ characterId: aId, viaRelationshipId: null, viaType: null }];
        }

        var visited = new Set([aId]);
        var queue = [{
            id: aId,
            path: [{ characterId: aId, viaRelationshipId: null, viaType: null }]
        }];

        while (queue.length > 0) {
            var current = queue.shift();
            if (current.path.length - 1 >= maxDepth) continue;

            var edges = _allEdges(current.id, options);
            for (var i = 0; i < edges.length; i++) {
                var edge = edges[i];
                var neighborId = edge.to;
                if (!neighborId) continue;

                if (neighborId === bId) {
                    return current.path.concat([{
                        characterId: neighborId,
                        viaRelationshipId: edge.viaRelationshipId,
                        viaType: edge.viaType,
                        viaRole: edge.viaRole || null,
                        viaStatus: edge.viaStatus || null
                    }]);
                }

                if (!visited.has(neighborId)) {
                    visited.add(neighborId);
                    queue.push({
                        id: neighborId,
                        path: current.path.concat([{
                            characterId: neighborId,
                            viaRelationshipId: edge.viaRelationshipId,
                            viaType: edge.viaType,
                            viaRole: edge.viaRole || null,
                            viaStatus: edge.viaStatus || null
                        }])
                    });
                }
            }
        }
        return null;
    }

    // -------------------------------------------------------------------------
    // COMMON ANCESTORS
    //
    // Biological ancestors only. Kinship terminology is derived from
    // FamilyRules; this helper collects the raw shared ids.
    // -------------------------------------------------------------------------

    function _collectBiologicalAncestors(startId, maxDepth) {
        var result = new Map();
        var queue = [{ id: startId, depth: 0 }];
        var visited = new Set([startId]);

        while (queue.length > 0) {
            var cur = queue.shift();
            if (cur.depth >= maxDepth) continue;

            var parents = FQ.getBiologicalParentIds(cur.id, { includeEnded: true });
            for (var i = 0; i < parents.length; i++) {
                var pid = parents[i];
                var dist = cur.depth + 1;
                if (!result.has(pid) || result.get(pid) > dist) {
                    result.set(pid, dist);
                }
                if (!visited.has(pid)) {
                    visited.add(pid);
                    queue.push({ id: pid, depth: dist });
                }
            }
        }
        return result;
    }

    function findCommonAncestors(aId, bId, options) {
        options = options || {};
        var maxDepth = (typeof options.maxDepth === 'number') ? options.maxDepth : 6;

        if (typeof aId !== 'string' || typeof bId !== 'string') return [];
        if (aId === bId) return [];

        var aAnc = _collectBiologicalAncestors(aId, maxDepth);
        var bAnc = _collectBiologicalAncestors(bId, maxDepth);

        var out = [];
        aAnc.forEach(function(aDist, ancId) {
            if (!bAnc.has(ancId)) return;
            var projection = _characterProjection(ancId);
            if (projection) {
                projection.distanceA = aDist;
                projection.distanceB = bAnc.get(ancId);
                out.push(projection);
            }
        });

        // Sort by closest total distance, then by name for stability.
        out.sort(function(x, y) {
            var dx = x.distanceA + x.distanceB;
            var dy = y.distanceA + y.distanceB;
            if (dx !== dy) return dx - dy;
            var nx = (x.name || '') + ' ' + (x.surname || '');
            var ny = (y.name || '') + ' ' + (y.surname || '');
            return nx.localeCompare(ny);
        });

        return out;
    }

    // -------------------------------------------------------------------------
    // RELATIONSHIP SUMMARY
    // -------------------------------------------------------------------------

    function _relationshipSummary(aId, bId) {
        var kinship = FQ.classifyKinship(aId, bId);
        var isBlood =
            kinship.type !== FR.KINSHIP.UNRELATED &&
            kinship.type !== FR.KINSHIP.SELF;

        var between = RQ.getBetween(aId, bId);
        var existing = [];
        for (var i = 0; i < between.length; i++) {
            var r = between[i];
            existing.push({
                relationshipId: r.id,
                type: r.type,
                status: r.status,
                startYear: r.startYear,
                endYear: r.endYear,
                attributes: r.attributes.slice()
            });
        }

        return {
            related: isBlood || existing.length > 0,
            isBloodRelated: isBlood,
            kinshipType: kinship.type,
            kinshipDegree: (kinship.degree !== undefined) ? kinship.degree : null,
            kinshipRemoved: (kinship.removed !== undefined) ? kinship.removed : null,
            existingRelationships: existing
        };
    }

    // -------------------------------------------------------------------------
    // FULL REPORT
    // -------------------------------------------------------------------------

    function getReport(aId, bId, options) {
        options = options || {};

        var char1 = _characterProjection(aId);
        var char2 = _characterProjection(bId);
        if (!char1 || !char2) return null;

        var currentYear = _getCurrentYearOrNull();

        var relSummary = _relationshipSummary(aId, bId);

        var path = findConnectionPath(aId, bId, {
            maxDepth: (typeof options.maxDepth === 'number') ? options.maxDepth : 6
        });

        var socialDistance = path ? path.length - 1 : -1;

        var commonAncestors = findCommonAncestors(aId, bId, {
            maxDepth: (typeof options.maxDepth === 'number') ? options.maxDepth : 6
        });

        return {
            character1: char1,
            character2: char2,
            relationship: relSummary,
            commonAncestors: commonAncestors,
            connection: {
                path: path,
                socialDistance: socialDistance
            },
            currentYear: currentYear
        };
    }

    // -------------------------------------------------------------------------
    // EXPORTS
    // -------------------------------------------------------------------------

    window.RelationshipFinderQueries = {
        getReport: getReport,
        findConnectionPath: findConnectionPath,
        findCommonAncestors: findCommonAncestors
    };

})();
