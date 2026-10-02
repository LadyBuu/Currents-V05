/**
 * relationship-finder-queries.js
 *
 * Structured report + connection path for the Relationship Finder UI.
 * Reads via RelationshipQueries, FamilyQueries, CharacterQueries.
 * No mutation, no policy, no persistence.
 *
 * Returns plain projections. Never live entities.
 */

(function() {
    'use strict';

    var RQ = window.RelationshipQueries;
    var FQ = window.FamilyQueries;
    var FR = window.FamilyRules;
    var A  = window.RELATIONSHIP_ARCHETYPES;
    var STATUS = window.RELATIONSHIP_STATUS;

    if (!RQ || !FQ || !FR || !A || !STATUS) {
        throw new Error('relationship-finder-queries.js: relationship-queries, family-queries, family-rules, relationship-types required');
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
        if (!character) return 0;
        if (typeof window.calculateAge === 'function') {
            return window.calculateAge(
                character.birthYear,
                character.isDeceased,
                character.deathYear
            );
        }
        return 0;
    }

    function _location(character) {
        if (!character) return null;
        if (typeof window.getCurrentLocation === 'function') {
            return window.getCurrentLocation(character) || null;
        }
        return null;
    }

    function _rankSymbol(character) {
        if (!character) return null;
        if (typeof window.getActiveRankDisplay === 'function') {
            var r = window.getActiveRankDisplay(character);
            return r ? (r.symbol || null) : null;
        }
        return null;
    }

    function _characterProjection(id) {
        var c = _getCharacter(id);
        if (!c) return null;
        return {
            id: c.id,
            name: c.name,
            surname: c.surname || '',
            gender: c.gender || null,
            isDeceased: !!c.isDeceased,
            age: _age(c),
            location: _location(c),
            rankSymbol: _rankSymbol(c)
        };
    }

    // -------------------------------------------------------------------------
    // RELATIONSHIP SUMMARY
    // -------------------------------------------------------------------------

    /**
     * Returns { related, kinshipType, isBloodRelated, commonAncestors,
     *           existingRelationships }
     */
    function _relationshipSummary(aId, bId) {
        var kinship = FQ.classifyKinship(aId, bId);
        var isBlood = kinship.type !== FR.KINSHIP.UNRELATED &&
                      kinship.type !== FR.KINSHIP.SELF;

        var commonAncestors = _findCommonAncestors(aId, bId);

        var between = RQ.getBetween(aId, bId);
        var existingRelationships = between.map(function(rel) {
            return {
                relationshipId: rel.id,
                type: rel.type,
                status: rel.status,
                startYear: rel.startYear,
                endYear: rel.endYear
            };
        });

        return {
            related: isBlood || existingRelationships.length > 0,
            isBloodRelated: isBlood,
            kinshipType: kinship.type,
            kinshipDegree: kinship.degree !== undefined ? kinship.degree : null,
            kinshipRemoved: kinship.removed !== undefined ? kinship.removed : null,
            commonAncestors: commonAncestors,
            existingRelationships: existingRelationships
        };
    }

    function _findCommonAncestors(aId, bId) {
        // Blood ancestors only
        var aAnc = _collectBiologicalAncestors(aId, 6);
        var bAnc = _collectBiologicalAncestors(bId, 6);
        var out = [];
        aAnc.forEach(function(_, ancId) {
            if (bAnc.has(ancId)) {
                var c = _characterProjection(ancId);
                if (c) out.push(c);
            }
        });
        return out;
    }

    function _collectBiologicalAncestors(startId, maxDepth) {
        var result = new Map();
        var queue = [{ id: startId, depth: 0 }];
        var visited = new Set([startId]);

        while (queue.length) {
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

    // -------------------------------------------------------------------------
    // CONNECTION PATH (BFS over RelationshipState)
    // -------------------------------------------------------------------------

    /**
     * Graph = all active relationships in RelationshipState.
     * Returns array of steps: [{ characterId, viaRelationshipId, viaType }]
     * or null if no path.
     */
    function findConnectionPath(aId, bId, options) {
        options = options || {};
        var maxDepth = options.maxDepth !== undefined ? options.maxDepth : 6;
        if (!aId || !bId) return null;
        if (aId === bId) return [{ characterId: aId, viaRelationshipId: null, viaType: null }];

        var visited = new Set([aId]);
        var queue = [{
            id: aId,
            path: [{ characterId: aId, viaRelationshipId: null, viaType: null }]
        }];

        while (queue.length) {
            var current = queue.shift();
            if (current.path.length - 1 >= maxDepth) continue;

            var rels = RQ.getForCharacter(current.id, { status: STATUS.ONGOING });
            for (var i = 0; i < rels.length; i++) {
                var rel = rels[i];
                var neighborId = rel.participantA === current.id
                    ? rel.participantB
                    : rel.participantA;

                if (neighborId === bId) {
                    return current.path.concat([{
                        characterId: neighborId,
                        viaRelationshipId: rel.id,
                        viaType: rel.type
                    }]);
                }

                if (!visited.has(neighborId)) {
                    visited.add(neighborId);
                    queue.push({
                        id: neighborId,
                        path: current.path.concat([{
                            characterId: neighborId,
                            viaRelationshipId: rel.id,
                            viaType: rel.type
                        }])
                    });
                }
            }
        }
        return null;
    }

    // -------------------------------------------------------------------------
    // FULL REPORT
    // -------------------------------------------------------------------------

    function getReport(aId, bId, options) {
        options = options || {};
        var currentYear = _getCurrentYear();

        var char1 = _characterProjection(aId);
        var char2 = _characterProjection(bId);
        if (!char1 || !char2) return null;

        var relSummary = _relationshipSummary(aId, bId);
        var path = findConnectionPath(aId, bId, {
            maxDepth: options.maxDepth !== undefined ? options.maxDepth : 6
        });

        var socialDistance = path ? path.length - 1 : -1;

        return {
            character1: char1,
            character2: char2,
            relationship: relSummary,
            connection: {
                path: path,
                socialDistance: socialDistance
            },
            currentYear: currentYear
        };
    }

    // -------------------------------------------------------------------------

    window.RelationshipFinderQueries = {
        getReport: getReport,
        findConnectionPath: findConnectionPath,
        findCommonAncestors: _findCommonAncestors
    };

})();
