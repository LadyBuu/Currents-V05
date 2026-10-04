/**
 * family-queries.js
 *
 * Semantic reads for family relationships.
 * Walks the parent_child graph in RelationshipState.
 * Returns defensive projections. Never live entities.
 *
 * PARENT_CHILD DIRECTION:
 *   participantA = parent
 *   participantB = child
 *
 * PARENT_TYPE (metadata.parentType): biological | legal | social
 * PARENT_ROLE (metadata.parentRole): father | mother | parent
 */

(function() {
    'use strict';

    var RQ = window.RelationshipQueries;
    var A  = window.RELATIONSHIP_ARCHETYPES;
    var STATUS = window.RELATIONSHIP_STATUS;
    var FR = window.FamilyRules;

    if (!RQ || !A || !STATUS || !FR) {
        throw new Error('family-queries.js: relationship-queries.js, relationship-types.js, family-rules.js must load first');
    }

    var PARENT_CHILD = A.PARENT_CHILD;

    // -------------------------------------------------------------------------
    // INTERNAL
    // -------------------------------------------------------------------------

    function _parentMeta(rel) {
        var m = rel.metadata || {};
        return {
            parentType: m.parentType || FR.PARENT_TYPE.BIOLOGICAL,
            parentRole: m.parentRole || FR.PARENT_ROLE.PARENT,
            biological: m.parentType === FR.PARENT_TYPE.BIOLOGICAL
        };
    }

    function _parentProjection(rel, parentId) {
        var meta = _parentMeta(rel);
        return {
            relationshipId: rel.id,
            parentId: parentId,
            startYear: rel.startYear,
            endYear: rel.endYear,
            status: rel.status,
            parentType: meta.parentType,
            parentRole: meta.parentRole,
            biological: meta.biological
        };
    }

    // -------------------------------------------------------------------------
    // PARENTS
    //
    // All of a child's parent relationships (any status), returned as
    // projections. Filter by activeOnly for current parents.
    // -------------------------------------------------------------------------

    function getParentRelationships(childId, options) {
        options = options || {};
        var rels = RQ.getByType(PARENT_CHILD, options);
        var out = [];
        for (var i = 0; i < rels.length; i++) {
            if (rels[i].participantB !== childId) continue;
            if (options.activeOnly && rels[i].status !== STATUS.ONGOING) continue;
            out.push(_parentProjection(rels[i], rels[i].participantA));
        }
        return out;
    }

    /**
     * Returns parents split by role. Any role can have multiple entries
     * (father figure + biological father are distinct facts).
     */
    function getParents(childId, options) {
        var rels = getParentRelationships(childId, options);
        var fathers = [];
        var mothers = [];
        var others = [];
        for (var i = 0; i < rels.length; i++) {
            var r = rels[i];
            if (r.parentRole === FR.PARENT_ROLE.FATHER) fathers.push(r);
            else if (r.parentRole === FR.PARENT_ROLE.MOTHER) mothers.push(r);
            else others.push(r);
        }
        return { fathers: fathers, mothers: mothers, others: others };
    }

    function getAllParentIds(childId, options) {
        var rels = getParentRelationships(childId, options);
        var ids = [];
        for (var i = 0; i < rels.length; i++) ids.push(rels[i].parentId);
        return ids;
    }

    function getBiologicalParentIds(childId, options) {
        var rels = getParentRelationships(childId, options);
        var ids = [];
        for (var i = 0; i < rels.length; i++) {
            if (rels[i].biological) ids.push(rels[i].parentId);
        }
        return ids;
    }

    function getLegalParentIds(childId, options) {
        var rels = getParentRelationships(childId, options);
        var ids = [];
        for (var i = 0; i < rels.length; i++) {
            if (rels[i].parentType === FR.PARENT_TYPE.LEGAL) ids.push(rels[i].parentId);
        }
        return ids;
    }

    function getSocialParentIds(childId, options) {
        var rels = getParentRelationships(childId, options);
        var ids = [];
        for (var i = 0; i < rels.length; i++) {
            if (rels[i].parentType === FR.PARENT_TYPE.SOCIAL) ids.push(rels[i].parentId);
        }
        return ids;
    }

    function hasLivingParent(childId, options) {
        if (typeof window.getCharacterById !== 'function') {
            throw new Error('family-queries.js: getCharacterById required for hasLivingParent');
        }
        var rels = getParentRelationships(childId, options);
        for (var i = 0; i < rels.length; i++) {
            var p = window.getCharacterById(rels[i].parentId);
            if (p && !p.isDeceased) return true;
        }
        return false;
    }

    // -------------------------------------------------------------------------
    // CHILDREN
    // -------------------------------------------------------------------------

    function getChildRelationships(parentId, options) {
        options = options || {};
        var rels = RQ.getByType(PARENT_CHILD, options);
        var out = [];
        for (var i = 0; i < rels.length; i++) {
            if (rels[i].participantA !== parentId) continue;
            if (options.activeOnly && rels[i].status !== STATUS.ONGOING) continue;
            out.push({
                relationshipId: rels[i].id,
                childId: rels[i].participantB,
                startYear: rels[i].startYear,
                endYear: rels[i].endYear,
                status: rels[i].status,
                parentType: (rels[i].metadata && rels[i].metadata.parentType) || FR.PARENT_TYPE.BIOLOGICAL,
                parentRole: (rels[i].metadata && rels[i].metadata.parentRole) || FR.PARENT_ROLE.PARENT
            });
        }
        return out;
    }

    function getChildren(parentId, options) {
        var rels = getChildRelationships(parentId, options);
        var ids = [];
        for (var i = 0; i < rels.length; i++) ids.push(rels[i].childId);
        return ids;
    }

    function hasChildren(parentId, options) {
        return getChildRelationships(parentId, options).length > 0;
    }

    // -------------------------------------------------------------------------
    // SIBLINGS
    //
    // Derived from shared parentage. Uses FamilyRules.deriveSiblingship.
    // -------------------------------------------------------------------------

    function getSiblingFacts(childId, options) {
        var bio = getBiologicalParentIds(childId, options);
        var legal = getLegalParentIds(childId, options);
        var social = getSocialParentIds(childId, options);
        return {
            biologicalParents: bio,
            legalParents: legal,
            socialParents: social
        };
    }

    /**
     * Returns all siblings of a character. Each entry includes the
     * derived sibling classification.
     */
    function getSiblings(childId, options) {
        var childFacts = getSiblingFacts(childId, options);
        if (childFacts.biologicalParents.length === 0 &&
            childFacts.legalParents.length === 0 &&
            childFacts.socialParents.length === 0) {
            return [];
        }

        // Collect candidate siblings: everyone who shares a parent with childId
        var candidateIds = new Set();
        var allParents = childFacts.biologicalParents
            .concat(childFacts.legalParents)
            .concat(childFacts.socialParents);

        for (var p = 0; p < allParents.length; p++) {
            var siblings = getChildren(allParents[p], options);
            for (var s = 0; s < siblings.length; s++) {
                if (siblings[s] !== childId) candidateIds.add(siblings[s]);
            }
        }

        var result = [];
        candidateIds.forEach(function(sibId) {
            var sibFacts = getSiblingFacts(sibId, options);
            var classification = FR.deriveSiblingship(childFacts, sibFacts);
            if (classification) {
                result.push({
                    siblingId: sibId,
                    siblingType: classification.type,
                    sharedBiologicalParents: classification.sharedBiologicalParents || [],
                    sharedLegalParents: classification.sharedLegalParents || [],
                    sharedSocialParents: classification.sharedSocialParents || []
                });
            }
        });
        return result;
    }

    function hasSibling(childId, options) {
        return getSiblings(childId, options).length > 0;
    }

    // -------------------------------------------------------------------------
    // GRANDPARENTS / GRANDCHILDREN
    // -------------------------------------------------------------------------

    /**
     * generation = 1: grandparents
     * generation = 2: great-grandparents
     * generation = 0: parents (returns biological parents)
     */
    function getGrandparents(childId, generation) {
        generation = (generation === undefined) ? 1 : generation;
        if (generation === 0) {
            return getBiologicalParentIds(childId, { activeOnly: true });
        }

        var current = getBiologicalParentIds(childId, { activeOnly: true });
        for (var g = 0; g < generation; g++) {
            var next = [];
            for (var i = 0; i < current.length; i++) {
                var parentIds = getBiologicalParentIds(current[i], { activeOnly: true });
                for (var j = 0; j < parentIds.length; j++) {
                    if (next.indexOf(parentIds[j]) === -1) next.push(parentIds[j]);
                }
            }
            current = next;
        }
        return current;
    }

    function getGrandchildren(parentId, options) {
        var children = getChildren(parentId, options);
        var out = [];
        for (var i = 0; i < children.length; i++) {
            var gcs = getChildren(children[i], options);
            for (var j = 0; j < gcs.length; j++) {
                if (out.indexOf(gcs[j]) === -1) out.push(gcs[j]);
            }
        }
        return out;
    }

    // -------------------------------------------------------------------------
    // SPOUSES
    //
    // Spouse = committed relationship with MARRIED attribute (or
    // HANDFASTED / CIVIL_UNION — configurable; here we use MARRIED).
    // -------------------------------------------------------------------------

    function getSpouseIds(characterId, options) {
        options = options || {};
        var ATTR = window.RELATIONSHIP_ATTRIBUTES;
        var committed = RQ.getByType(A.COMMITTED, { status: STATUS.ONGOING });
        var out = [];
        for (var i = 0; i < committed.length; i++) {
            var rel = committed[i];
            if (rel.participantA !== characterId && rel.participantB !== characterId) continue;
            if (!rel.attributes || rel.attributes.indexOf(ATTR.MARRIED) === -1) continue;
            var partnerId = rel.participantA === characterId
                ? rel.participantB
                : rel.participantA;
            out.push({
                spouseId: partnerId,
                relationshipId: rel.id,
                startYear: rel.startYear
            });
        }
        return out;
    }

    function hasSpouse(characterId) {
        return getSpouseIds(characterId).length > 0;
    }

    // -------------------------------------------------------------------------
    // KINSHIP
    // -------------------------------------------------------------------------

    function _ancestorGraphProvider(id) {
        // FamilyRules.classifyKinship expects { id, parents: [parentIds] }
        // biological parents only
        var parents = getBiologicalParentIds(id, { activeOnly: true });
        return { id: id, parents: parents };
    }

    function classifyKinship(aId, bId) {
        return FR.classifyKinship(aId, bId, _ancestorGraphProvider);
    }

    function isBloodRelated(aId, bId) {
        var k = classifyKinship(aId, bId);
        return k.type !== FR.KINSHIP.UNRELATED && k.type !== FR.KINSHIP.SELF;
    }

    // -------------------------------------------------------------------------
    // ORPHAN
    // -------------------------------------------------------------------------

    function isOrphan(childId) {
        var bio = getBiologicalParentIds(childId, { activeOnly: true });
        var legal = getLegalParentIds(childId, { activeOnly: true });

        if (typeof window.getCharacterById !== 'function') {
            throw new Error('family-queries.js: getCharacterById required for isOrphan');
        }

        var livingBio = bio.filter(function(id) {
            var c = window.getCharacterById(id);
            return c && !c.isDeceased;
        });
        var livingLegal = legal.filter(function(id) {
            var c = window.getCharacterById(id);
            return c && !c.isDeceased;
        });

        return FR.isOrphan({
            biologicalParents: bio,
            legalParents: legal,
            livingBiologicalParents: livingBio,
            livingLegalParents: livingLegal
        });
    }

    // -------------------------------------------------------------------------
    // STATISTICS
    // -------------------------------------------------------------------------

    function getFamilyStatistics(characterId) {
        if (typeof window.getCharacterById !== 'function') {
            throw new Error('family-queries.js: getCharacterById required');
        }
        var character = window.getCharacterById(characterId);
        if (!character) return null;

        var parents = getParents(characterId, { activeOnly: true });
        var children = getChildren(characterId, { activeOnly: true });
        var siblings = getSiblings(characterId, { activeOnly: true });
        var grandchildren = getGrandchildren(characterId, { activeOnly: true });
        var spouses = getSpouseIds(characterId);

        var livingChildren = children.filter(function(id) {
            var c = window.getCharacterById(id);
            return c && !c.isDeceased;
        });
        var livingSiblings = siblings.filter(function(s) {
            var c = window.getCharacterById(s.siblingId);
            return c && !c.isDeceased;
        });
        var livingGrandchildren = grandchildren.filter(function(id) {
            var c = window.getCharacterById(id);
            return c && !c.isDeceased;
        });

        return {
            characterId: characterId,
            parents: {
                fathers: parents.fathers,
                mothers: parents.mothers,
                others: parents.others,
                hasParents: (parents.fathers.length + parents.mothers.length + parents.others.length) > 0
            },
            children: {
                total: children.length,
                living: livingChildren.length,
                ids: children
            },
            siblings: {
                total: siblings.length,
                living: livingSiblings.length,
                entries: siblings
            },
            grandchildren: {
                total: grandchildren.length,
                living: livingGrandchildren.length,
                ids: grandchildren
            },
            spouses: spouses,
            isOrphan: isOrphan(characterId),
            hasChildren: children.length > 0
        };
    }

    // -------------------------------------------------------------------------

    window.FamilyQueries = {
        getParentRelationships: getParentRelationships,
        getParents: getParents,
        getAllParentIds: getAllParentIds,
        getBiologicalParentIds: getBiologicalParentIds,
        getLegalParentIds: getLegalParentIds,
        getSocialParentIds: getSocialParentIds,
        hasLivingParent: hasLivingParent,

        getChildRelationships: getChildRelationships,
        getChildren: getChildren,
        hasChildren: hasChildren,

        getSiblingFacts: getSiblingFacts,
        getSiblings: getSiblings,
        hasSibling: hasSibling,

        getGrandparents: getGrandparents,
        getGrandchildren: getGrandchildren,

        getSpouseIds: getSpouseIds,
        hasSpouse: hasSpouse,

        classifyKinship: classifyKinship,
        isBloodRelated: isBloodRelated,

        isOrphan: isOrphan,
        getFamilyStatistics: getFamilyStatistics
    };

})();
