/**
 * family-rules.js
 *
 * Pure family/kinship policy.
 * No I/O, no state, no mutation.
 *
 * All functions operate on explicit facts (parentage lists, ages) and
 * return decisions or derived relationships. The caller supplies the
 * graph; this module never reaches into state.
 */

(function() {
    'use strict';

    // Parentage classification ids (stable; UI maps to labels)
    var PARENT_TYPE = {
        BIOLOGICAL: 'biological',
        LEGAL: 'legal',
        SOCIAL: 'social'
    };

    // Parent role ids
    var PARENT_ROLE = {
        FATHER: 'father',
        MOTHER: 'mother',
        PARENT: 'parent' // unknown/other
    };

    // Sibling classification ids
    var SIBLING_TYPE = {
        FULL: 'full',
        HALF: 'half',
        STEP: 'step',
        ADOPTIVE: 'adoptive'
    };

    // Kinship classification ids
    var KINSHIP = {
        SELF: 'self',
        PARENT: 'parent',
        CHILD: 'child',
        SIBLING: 'sibling',
        GRANDPARENT: 'grandparent',
        GRANDCHILD: 'grandchild',
        GREAT_GRANDPARENT: 'great_grandparent',
        GREAT_GRANDCHILD: 'great_grandchild',
        AUNT_UNCLE: 'aunt_uncle',
        NIECE_NEPHEW: 'niece_nephew',
        COUSIN: 'cousin',
        UNRELATED: 'unrelated'
    };

    // -------------------------------------------------------------------------
    // BASIC VALIDATION
    // -------------------------------------------------------------------------

    /**
     * Can a parent relationship be assigned?
     * facts: {
     *   childId, parentId,
     *   childAgeAtStart, parentAgeAtStart,
     *   parentRole,
     *   existingParentsOfChild: [{ parentId, role, type }],
     *   parentGender
     * }
     */
    function canSetParent(facts) {
        var errors = [];
        if (!facts) return { valid: false, errors: ['missing_facts'] };
        if (!facts.childId || !facts.parentId) errors.push('missing_id');
        if (facts.childId === facts.parentId) errors.push('same_person');

        if (typeof facts.parentAgeAtStart === 'number' &&
            typeof facts.childAgeAtStart === 'number' &&
            facts.parentAgeAtStart < facts.childAgeAtStart) {
            errors.push('parent_younger_than_child');
        }

        // Existing parent at the same role with a different id
        var existing = facts.existingParentsOfChild || [];
        for (var i = 0; i < existing.length; i++) {
            if (existing[i].parentId === facts.parentId) continue;
            if (existing[i].role === facts.parentRole) {
                errors.push('role_already_filled:' + facts.parentRole);
                break;
            }
        }

        return { valid: errors.length === 0, errors: errors };
    }

    /**
     * Is this a valid parent role for the given gender?
     * Gender is a hint, not a requirement — PARENT covers all cases.
     */
    function normalizeParentRole(requestedRole, gender) {
        if (requestedRole === PARENT_ROLE.FATHER) return PARENT_ROLE.FATHER;
        if (requestedRole === PARENT_ROLE.MOTHER) return PARENT_ROLE.MOTHER;
        if (requestedRole === PARENT_ROLE.PARENT) return PARENT_ROLE.PARENT;
        if (gender === 'male') return PARENT_ROLE.FATHER;
        if (gender === 'female') return PARENT_ROLE.MOTHER;
        return PARENT_ROLE.PARENT;
    }

    function isBiological(type) {
        return type === PARENT_TYPE.BIOLOGICAL;
    }

    function isLegalOrSocial(type) {
        return type === PARENT_TYPE.LEGAL || type === PARENT_TYPE.SOCIAL;
    }

    // -------------------------------------------------------------------------
    // SIBLING DERIVATION
    //
    // Given parentage for two children, classify their sibling relationship.
    // Facts for each child: { biologicalParents: [ids], legalParents: [ids],
    //                         socialParents: [ids] }
    // -------------------------------------------------------------------------

    function deriveSiblingship(aParents, bParents) {
        if (!aParents || !bParents) return null;

        var aBio = aParents.biologicalParents || [];
        var bBio = bParents.biologicalParents || [];
        var aLegal = aParents.legalParents || [];
        var bLegal = bParents.legalParents || [];
        var aSocial = aParents.socialParents || [];
        var bSocial = bParents.socialParents || [];

        var sharedBio = _intersect(aBio, bBio);
        if (sharedBio.length === 2) {
            return { type: SIBLING_TYPE.FULL, sharedBiologicalParents: sharedBio };
        }
        if (sharedBio.length === 1) {
            return { type: SIBLING_TYPE.HALF, sharedBiologicalParents: sharedBio };
        }

        var sharedLegal = _intersect(aLegal, bLegal);
        if (sharedLegal.length > 0) {
            return { type: SIBLING_TYPE.ADOPTIVE, sharedLegalParents: sharedLegal };
        }

        var sharedSocial = _intersect(aSocial, bSocial);
        if (sharedSocial.length > 0) {
            return { type: SIBLING_TYPE.STEP, sharedSocialParents: sharedSocial };
        }

        return null;
    }

    function _intersect(a, b) {
        var out = [];
        for (var i = 0; i < a.length; i++) {
            if (b.indexOf(a[i]) !== -1) out.push(a[i]);
        }
        return out;
    }

    // -------------------------------------------------------------------------
    // KINSHIP / CONSANGUINITY
    //
    // Operates on an explicit ancestor graph.
    // ancestorGraphProvider(id) returns { id, parents: [parentId] }
    // where parents are BIOLOGICAL parents only.
    //
    // classifyKinship(a, b, provider) computes the closest blood kinship.
    // -------------------------------------------------------------------------

    function classifyKinship(aId, bId, ancestorGraphProvider) {
        if (!aId || !bId) return { type: KINSHIP.UNRELATED };
        if (aId === bId) return { type: KINSHIP.SELF };

        var aAncestors = _collectAncestors(aId, ancestorGraphProvider, 6);
        var bAncestors = _collectAncestors(bId, ancestorGraphProvider, 6);

        // Direct: is b an ancestor of a?
        if (aAncestors.has(bId)) {
            var aGen = aAncestors.get(bId);
            if (aGen === 1) return { type: KINSHIP.PARENT, generations: 1 };
            if (aGen === 2) return { type: KINSHIP.GRANDPARENT, generations: 2 };
            return { type: KINSHIP.GREAT_GRANDPARENT, generations: aGen };
        }

        // Direct: is a an ancestor of b?
        if (bAncestors.has(aId)) {
            var bGen = bAncestors.get(aId);
            if (bGen === 1) return { type: KINSHIP.CHILD, generations: 1 };
            if (bGen === 2) return { type: KINSHIP.GRANDCHILD, generations: 2 };
            return { type: KINSHIP.GREAT_GRANDCHILD, generations: bGen };
        }

        // Find common ancestors and their generation distances
        var commonGen = null; // { ancestorId, aDist, bDist }
        aAncestors.forEach(function(aDist, ancestorId) {
            if (!bAncestors.has(ancestorId)) return;
            var bDist = bAncestors.get(ancestorId);
            if (commonGen === null ||
                (aDist + bDist) < (commonGen.aDist + commonGen.bDist)) {
                commonGen = { ancestorId: ancestorId, aDist: aDist, bDist: bDist };
            }
        });

        if (!commonGen) return { type: KINSHIP.UNRELATED };

        var ad = commonGen.aDist;
        var bd = commonGen.bDist;

        // Sibling: shared parent at distance 1 each
        if (ad === 1 && bd === 1) return { type: KINSHIP.SIBLING };

        // Aunt/uncle: shared grandparent at distance 2/1
        if (ad === 2 && bd === 1) return { type: KINSHIP.AUNT_UNCLE };
        if (ad === 1 && bd === 2) return { type: KINSHIP.NIECE_NEPHEW };

        // Cousin: shared grandparent at distance 2/2
        if (ad === 2 && bd === 2) return { type: KINSHIP.COUSIN, degree: 1, removed: 0 };

        // General cousin case: min(ad,bd) determines degree, |ad-bd| determines removal
        var degree = Math.min(ad, bd) - 1;
        var removed = Math.abs(ad - bd);
        return { type: KINSHIP.COUSIN, degree: degree, removed: removed };
    }

    /**
     * Returns a Map<ancestorId, generationDistance> for all ancestors
     * within maxDepth. Does not include self.
     */
    function _collectAncestors(startId, provider, maxDepth) {
        var result = new Map();
        var queue = [{ id: startId, depth: 0 }];
        var visited = new Set([startId]);

        while (queue.length > 0) {
            var cur = queue.shift();
            if (cur.depth >= maxDepth) continue;

            var node = provider(cur.id);
            if (!node || !node.parents) continue;

            for (var i = 0; i < node.parents.length; i++) {
                var pid = node.parents[i];
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

    /**
     * Is a blood relationship? Only direct ancestry and shared
     * biological ancestors count.
     */
    function isBloodRelated(aId, bId, ancestorGraphProvider) {
        var k = classifyKinship(aId, bId, ancestorGraphProvider);
        return k.type !== KINSHIP.UNRELATED && k.type !== KINSHIP.SELF;
    }

    // -------------------------------------------------------------------------
    // ORPHAN / PARENTAGE HELPERS
    // -------------------------------------------------------------------------

    /**
     * Facts: { biologicalParents: [ids], legalParents: [ids],
     *          livingBiologicalParents: [ids], livingLegalParents: [ids] }
     */
    function isOrphan(facts) {
        if (!facts) return false;
        var livingBio = facts.livingBiologicalParents || [];
        var livingLegal = facts.livingLegalParents || [];
        return livingBio.length === 0 && livingLegal.length === 0;
    }

    /**
     * Does the child have any parent of the given classification?
     * facts: { biologicalParents, legalParents, socialParents }
     */
    function hasAnyParent(facts) {
        if (!facts) return false;
        return (facts.biologicalParents && facts.biologicalParents.length > 0) ||
               (facts.legalParents && facts.legalParents.length > 0) ||
               (facts.socialParents && facts.socialParents.length > 0);
    }

    // -------------------------------------------------------------------------
    // ADOPTION / LEGITIMIZATION
    // -------------------------------------------------------------------------

    /**
     * Can an adoption be created?
     * facts: {
     *   childId, adopterIds: [ids],
     *   childHasLivingBiologicalParents: boolean,
     *   conflictWithExistingLegalParentAtRole: boolean,
     *   adoptionType
     * }
     */
    function canCreateAdoption(facts) {
        var errors = [];
        if (!facts) return { valid: false, errors: ['missing_facts'] };
        if (!facts.childId) errors.push('missing_child');
        if (!Array.isArray(facts.adopterIds) || facts.adopterIds.length === 0) {
            errors.push('missing_adopter');
        }
        if (facts.adopterIds && facts.adopterIds.indexOf(facts.childId) !== -1) {
            errors.push('self_adoption');
        }
        return { valid: errors.length === 0, errors: errors };
    }

    /**
     * Can a legitimization occur?
     * Legitimization requires at least one biological parent to be known,
     * and the child must currently be classified as illegitimate.
     */
    function canLegitimize(facts) {
        var errors = [];
        if (!facts) return { valid: false, errors: ['missing_facts'] };
        if (!facts.childId) errors.push('missing_child');
        if (!facts.fatherId && !facts.motherId) errors.push('no_parent');
        if (facts.alreadyLegitimate) errors.push('already_legitimate');
        return { valid: errors.length === 0, errors: errors };
    }

    // -------------------------------------------------------------------------

    window.FamilyRules = {
        PARENT_TYPE: PARENT_TYPE,
        PARENT_ROLE: PARENT_ROLE,
        SIBLING_TYPE: SIBLING_TYPE,
        KINSHIP: KINSHIP,

        canSetParent: canSetParent,
        normalizeParentRole: normalizeParentRole,
        isBiological: isBiological,
        isLegalOrSocial: isLegalOrSocial,

        deriveSiblingship: deriveSiblingship,

        classifyKinship: classifyKinship,
        isBloodRelated: isBloodRelated,

        isOrphan: isOrphan,
        hasAnyParent: hasAnyParent,

        canCreateAdoption: canCreateAdoption,
        canLegitimize: canLegitimize
    };

})();
