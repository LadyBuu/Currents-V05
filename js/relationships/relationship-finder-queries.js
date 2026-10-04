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
 * Load order: after relationship-queries.js, family-queries.js,
 * family-rules.js.
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

    function _getCurrentYear() {
        if (typeof window.getCurrentYearSafe !== 'function') {
            throw new Error('relationship-finder-queries.js: getCurrentYearSafe required');
        }
        return window.getCurrentYearSafe();
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
    // PARENTAGE NEIGHBORHOOD
    //
    // The Finder's BFS traverses parentage plus relationship records.
    // Parentage neighbors come from FamilyQueries. We expand a
    // character to: biological parents, legal parents, social parents,
    // and biological/legal/social children. Sibling edges are NOT
    // added; they are derivable from shared parents and are reported
    // through kinship, not traversed.
    // -------------------------------------------------------------------------

    function _parentageNeighbors(characterId) {
        var parents = FQ.getAllParentIds(characterId, { activeOnly: false });
        var children = FQ.getChildIds(characterId, { activeOnly: false });

        var seen = {};
        var out = [];
        var i;
        for (i = 0; i < parents.length; i++) {
            var p = parents[i];
            if (p === characterId) continue;
            if (seen[p]) continue;
            seen[p] = true;
            out.push(p);
        }
        for (i = 0; i < children.length; i++) {
            var c = children[i];
            if (c === characterId) continue;
            if (seen[c]) continue;
            seen[c] = true;
            out.push(c);
        }
        return out;
    }

    function _parentageEdges(characterId) {
        // Returns edge projections describing each parentage connection
        // from characterId to a neighbor. Used by the path builder so
        // that steps carry their viaType.
        var edges = [];

        var parents = FQ.getParents(characterId, { activeOnly: false });
        var allParents = []
            .concat(parents.fathers)
            .concat(parents.mothers)
            .concat(parents.others);
        for (var i = 0; i < allParents.length; i++) {
            var p = allParents[i];
            edges.push({
                from: characterId,
                to: p.parentId,
                viaRelationshipId: p.relationshipId,
                viaType: A.PARENT_CHILD,
                viaRole: 'child_to_parent'
            });
        }

        var children = FQ.getChildRelationships(characterId, { activeOnly: false });
        for (var j = 0; j < children.length; j++) {
            var c = children[j];
            edges.push({
                from: characterId,
                to: c.childId,
                viaRelationshipId: c.relationshipId,
                viaType: A.PARENT_CHILD,
                viaRole: 'parent_to_child'
            });
        }

        return edges;
    }

    // -------------------------------------------------------------------------
    // RELATIONSHIP NEIGHBORHOOD
    //
    // Uses RelationshipQueries.getNeighborIds for the graph walk and
    // reconstructs edges via a small helper. The graph includes all
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

    function _allNeighbors(characterId, options) {
        var seen = {};
        var out = [];

        var p = _parentageNeighbors(characterId);
        for (var i = 0; i < p.length; i++) {
            if (!seen[p[i]]) { seen[p[i]] = true; out.push(p[i]); }
        }

        var r = RQ.getNeighborIds(characterId, options);
        for (var j = 0; j < r.length; j++) {
            if (!seen[r[j]]) { seen[r[j]] = true; out.push(r[j]); }
        }

        return out;
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

            var parents = FQ.getBiologicalParentIds(cur.id, { activeOnly: false });
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

        var currentYear = _getCurrentYear();

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
