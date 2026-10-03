/**
 * =============================================================================
 * STILL WATERS - FAMILY RULES (js/character/family-rules.js)
 * =============================================================================
 *
 * Pure policy for family relationships. Sole owner of parentage meaning
 * and kinship classification.
 *
 * OWNERSHIP (frozen):
 *
 *     FamilyState (internal to family-commands.js + family-queries.js)
 *         owns the canonical parent_child edges for the character subsystem
 *
 *     FamilyRules
 *         owns what those edges mean
 *
 *     FamilyQueries
 *         traverses edges and asks FamilyRules for interpretation
 *
 *     FamilyCommands
 *         validates via FamilyRules, mutates canonical edges, commits
 *
 *     FamilyStatistics
 *         aggregates FamilyQueries projections
 *
 * There is no separate relationship-state file. Parentage lives entirely
 * inside the family domain. The `motherId` / `fatherId` / `adoptedParents`
 * fields on the character record are deprecated compatibility slots and
 * are neither read nor written by this module.
 *
 * SCOPE:
 *   - Parent role vocabulary and normalisation
 *   - Parent assignment validation
 *   - Sibling classification (multi-classification)
 *   - Kinship classification (bounded traversal)
 *   - Biological cycle detection (unbounded traversal)
 *   - Orphan classification
 *   - Adoption validation
 *
 * OUT OF SCOPE:
 *   - Graph traversal for queries     → family-queries.js
 *   - Mutations                       → family-commands.js
 *   - Aggregation                     → family-statistics.js
 *   - Legitimacy policy               → not implemented here; see note below
 *
 * VOCABULARY:
 *   Parent types:  biological | legal | social
 *   Parent roles:  father | mother | parent
 *
 *   Roles are labels. They are not gender constraints. A female character
 *   may occupy the 'father' role; a male character may occupy the 'mother'
 *   role. normalizeParentRole() uses gender as a hint only when no explicit
 *   role is given, and preserves an explicit role verbatim.
 *
 * LEGITIMACY:
 *   Legitimacy is a historical/legal concept that requires canonical state
 *   this codebase does not currently define. canLegitimize() is deliberately
 *   absent. When legitimacy state is introduced, it gets its own rules
 *   module and this file is not amended.
 *
 * PROVIDER CONTRACT (for classifyKinship, isBloodRelated, and
 * wouldCreateBiologicalCycle):
 *
 *   provider(characterId) → { id: string, parents: string[] } | null
 *
 *   - Must be pure: same input, same output, no side effects.
 *   - Must return null for "no such character". Must not return undefined.
 *   - Must not throw. A provider that throws is a broken dependency and
 *     the exception propagates to the caller. The rules layer does not
 *     swallow it.
 *
 *   FamilyQueries supplies the provider. It walks the canonical
 *   parent_child edges and returns the biological parent ids.
 *
 * DEPENDENCIES (REQUIRED): None.
 *   This module is pure and can load before any other module in the
 *   character subsystem.
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. VOCABULARY
    // =========================================================================

    var PARENT_TYPE = {
        BIOLOGICAL: 'biological',
        LEGAL: 'legal',
        SOCIAL: 'social'
    };

    var PARENT_ROLE = {
        FATHER: 'father',
        MOTHER: 'mother',
        PARENT: 'parent'
    };

    var SIBLING_TYPE = {
        FULL: 'full',
        HALF: 'half',
        STEP: 'step',
        ADOPTIVE: 'adoptive'
    };

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

    // Bounded traversal for kinship classification. Kinship beyond this
    // depth is reported as UNRELATED because it has no useful presentation.
    var MAX_KINSHIP_DEPTH = 6;

    // =========================================================================
    // 2. BASIC HELPERS
    // =========================================================================

    function _hasId(v) {
        return typeof v === 'string' && v.length > 0;
    }

    function _isValidParentType(type) {
        return type === PARENT_TYPE.BIOLOGICAL
            || type === PARENT_TYPE.LEGAL
            || type === PARENT_TYPE.SOCIAL;
    }

    function _isValidParentRole(role) {
        return role === PARENT_ROLE.FATHER
            || role === PARENT_ROLE.MOTHER
            || role === PARENT_ROLE.PARENT;
    }

    function _readArray(v) {
        return Array.isArray(v) ? v : [];
    }

    function _intersect(a, b) {
        var out = [];
        for (var i = 0; i < a.length; i++) {
            if (b.indexOf(a[i]) !== -1) out.push(a[i]);
        }
        return out;
    }

    // =========================================================================
    // 3. PARENT ROLE
    // =========================================================================

    /**
     * Resolves a parent role.
     *
     *   - Missing requested role: inferred from gender.
     *   - Valid explicit role: preserved verbatim.
     *   - Invalid explicit role: rejected.
     *
     * Returns { ok: true, value: role } or { ok: false, reason }.
     *
     * Gender is a hint, not a constraint. A female character with no
     * explicit role receives MOTHER. A male character with no explicit
     * role receives FATHER. A character with unknown or missing gender
     * receives PARENT. An explicit valid role is always honoured,
     * regardless of gender.
     */
    function normalizeParentRole(requestedRole, gender) {
        if (requestedRole === undefined || requestedRole === null) {
            if (gender === 'male') return { ok: true, value: PARENT_ROLE.FATHER };
            if (gender === 'female') return { ok: true, value: PARENT_ROLE.MOTHER };
            return { ok: true, value: PARENT_ROLE.PARENT };
        }
        if (!_isValidParentRole(requestedRole)) {
            return { ok: false, reason: 'invalid_parent_role: ' + String(requestedRole) };
        }
        return { ok: true, value: requestedRole };
    }

    function isBiological(type) {
        return type === PARENT_TYPE.BIOLOGICAL;
    }

    function isValidParentType(type) {
        return _isValidParentType(type);
    }

    function isValidParentRole(role) {
        return _isValidParentRole(role);
    }

    // =========================================================================
    // 4. PARENT ASSIGNMENT
    // =========================================================================

    /**
     * Can a parent relationship be assigned?
     *
     * facts: {
     *   childId,
     *   parentId,
     *   parentType,                              required
     *   parentRole,                              required; must be valid
     *   childAgeAtStart,                         optional
     *   parentAgeAtStart,                        optional
     *   existingBiologicalParentsAtSameRole,     [ids]; used only when parentType is BIOLOGICAL
     *   allowReplace                             boolean; permits replacing an existing biological parent at the same role
     * }
     *
     * Structural rules only:
     *   - childId and parentId are required and must differ
     *   - parentType must be biological, legal, or social
     *   - parentRole must be father, mother, or parent
     *   - parentAgeAtStart must not be less than childAgeAtStart when
     *     both are supplied (a purely structural sanity check; not a
     *     realism check, and no minimum gap is enforced)
     *   - a child may have at most one biological parent per role
     *     (father, mother, parent) unless allowReplace is true. Legal and
     *     social parentage does not conflict.
     *
     * Returns { valid: boolean, errors: string[] }.
     */
    function canSetParent(facts) {
        var errors = [];

        if (!facts || typeof facts !== 'object') {
            return { valid: false, errors: ['missing_facts'] };
        }
        if (!_hasId(facts.childId)) errors.push('missing_child_id');
        if (!_hasId(facts.parentId)) errors.push('missing_parent_id');
        if (_hasId(facts.childId) && facts.childId === facts.parentId) {
            errors.push('same_person');
        }
        if (!_isValidParentType(facts.parentType)) {
            errors.push('invalid_parent_type');
        }
        if (!_isValidParentRole(facts.parentRole)) {
            errors.push('invalid_parent_role');
        }

        if (typeof facts.parentAgeAtStart === 'number'
            && typeof facts.childAgeAtStart === 'number'
            && facts.parentAgeAtStart < facts.childAgeAtStart) {
            errors.push('parent_younger_than_child');
        }

        if (facts.parentType === PARENT_TYPE.BIOLOGICAL
            && facts.allowReplace !== true) {
            var existing = _readArray(facts.existingBiologicalParentsAtSameRole);
            for (var i = 0; i < existing.length; i++) {
                if (existing[i] !== facts.parentId) {
                    errors.push('biological_role_already_filled:' + facts.parentRole);
                    break;
                }
            }
        }

        return { valid: errors.length === 0, errors: errors };
    }

    // =========================================================================
    // 5. SIBLING CLASSIFICATION
    // =========================================================================

    /**
     * Classifies the sibling relationship between two children given
     * their parentage facts.
     *
     * Each input:
     *   { biologicalParents: [ids], legalParents: [ids], socialParents: [ids] }
     *
     * Returns null if they are not siblings by any classification.
     *
     * Returns a multi-classification object:
     *   {
     *     primaryType: 'full' | 'half' | 'step' | 'adoptive',
     *     sharedBiologicalParents: [ids],
     *     sharedLegalParents:      [ids],
     *     sharedSocialParents:     [ids]
     *   }
     *
     * primaryType is the strongest classification. Callers that need a
     * single label read primaryType. Callers that need full overlap read
     * the three shared-parent arrays. A pair may share a biological
     * parent and a legal parent simultaneously; primaryType reflects the
     * stronger link, and both links are reported.
     *
     * Precedence: full > half > adoptive > step.
     */
    function deriveSiblingship(aParents, bParents) {
        if (!aParents || !bParents) return null;

        var aBio = _readArray(aParents.biologicalParents);
        var bBio = _readArray(bParents.biologicalParents);
        var aLegal = _readArray(aParents.legalParents);
        var bLegal = _readArray(bParents.legalParents);
        var aSocial = _readArray(aParents.socialParents);
        var bSocial = _readArray(bParents.socialParents);

        var sharedBio = _intersect(aBio, bBio);
        var sharedLegal = _intersect(aLegal, bLegal);
        var sharedSocial = _intersect(aSocial, bSocial);

        if (sharedBio.length === 0
            && sharedLegal.length === 0
            && sharedSocial.length === 0) {
            return null;
        }

        var primaryType;
        if (sharedBio.length >= 2) primaryType = SIBLING_TYPE.FULL;
        else if (sharedBio.length === 1) primaryType = SIBLING_TYPE.HALF;
        else if (sharedLegal.length > 0) primaryType = SIBLING_TYPE.ADOPTIVE;
        else primaryType = SIBLING_TYPE.STEP;

        return {
            primaryType: primaryType,
            sharedBiologicalParents: sharedBio,
            sharedLegalParents: sharedLegal,
            sharedSocialParents: sharedSocial
        };
    }

    // =========================================================================
    // 6. KINSHIP CLASSIFICATION (bounded traversal)
    // =========================================================================
    //
    // Kinship is computed through biological ancestry only. The provider
    // returns biological parents. Legal and social parentage does not
    // create blood kinship.
    //
    // Traversal is bounded by MAX_KINSHIP_DEPTH. Beyond that depth, the
    // pair is reported as UNRELATED. Cycle detection uses a separate,
    // unbounded traversal.

    /**
     * classifyKinship(aId, bId, provider) → { type, ... }
     *
     * Types and their extra fields:
     *   SELF, UNRELATED, SIBLING          — no extra fields
     *   PARENT, CHILD                     — generations: 1
     *   GRANDPARENT, GRANDCHILD           — generations: 2
     *   GREAT_GRANDPARENT                 — generations: n
     *   GREAT_GRANDCHILD                  — generations: n
     *   AUNT_UNCLE, NIECE_NEPHEW          — no extra fields
     *   COUSIN                            — degree, removed
     */
    function classifyKinship(aId, bId, provider) {
        if (!_hasId(aId) || !_hasId(bId)) return { type: KINSHIP.UNRELATED };
        if (aId === bId) return { type: KINSHIP.SELF };
        if (typeof provider !== 'function') return { type: KINSHIP.UNRELATED };

        var aAnc = _collectAncestorsBounded(aId, provider, MAX_KINSHIP_DEPTH);
        var bAnc = _collectAncestorsBounded(bId, provider, MAX_KINSHIP_DEPTH);

        if (aAnc.has(bId)) {
            var aGen = aAnc.get(bId);
            if (aGen === 1) return { type: KINSHIP.PARENT, generations: 1 };
            if (aGen === 2) return { type: KINSHIP.GRANDPARENT, generations: 2 };
            return { type: KINSHIP.GREAT_GRANDPARENT, generations: aGen };
        }
        if (bAnc.has(aId)) {
            var bGen = bAnc.get(aId);
            if (bGen === 1) return { type: KINSHIP.CHILD, generations: 1 };
            if (bGen === 2) return { type: KINSHIP.GRANDCHILD, generations: 2 };
            return { type: KINSHIP.GREAT_GRANDCHILD, generations: bGen };
        }

        var common = null;
        aAnc.forEach(function (aDist, ancestorId) {
            if (!bAnc.has(ancestorId)) return;
            var bDist = bAnc.get(ancestorId);
            if (common === null || (aDist + bDist) < (common.aDist + common.bDist)) {
                common = { ancestorId: ancestorId, aDist: aDist, bDist: bDist };
            }
        });

        if (!common) return { type: KINSHIP.UNRELATED };

        var ad = common.aDist;
        var bd = common.bDist;

        if (ad === 1 && bd === 1) return { type: KINSHIP.SIBLING };
        if (ad === 2 && bd === 1) return { type: KINSHIP.AUNT_UNCLE };
        if (ad === 1 && bd === 2) return { type: KINSHIP.NIECE_NEPHEW };
        if (ad === 2 && bd === 2) {
            return { type: KINSHIP.COUSIN, degree: 1, removed: 0 };
        }

        return {
            type: KINSHIP.COUSIN,
            degree: Math.min(ad, bd) - 1,
            removed: Math.abs(ad - bd)
        };
    }

    function isBloodRelated(aId, bId, provider) {
        var k = classifyKinship(aId, bId, provider);
        return k.type !== KINSHIP.UNRELATED && k.type !== KINSHIP.SELF;
    }

    // =========================================================================
    // 7. CYCLE DETECTION (unbounded traversal)
    // =========================================================================
    //
    // Cycle prevention is not the same problem as kinship classification.
    // A cycle of any depth is invalid. Traversal terminates naturally on
    // graph exhaustion or on revisit; there is no artificial depth limit.
    //
    // Providers that could throw on cycle (e.g. an infinite provider) are
    // the caller's responsibility. A real graph terminates.

    /**
     * Returns true if setting `candidateAncestorId` as a biological
     * parent of `childId` would create a cycle. Walks upward from the
     * candidate and looks for the child.
     */
    function wouldCreateBiologicalCycle(childId, candidateAncestorId, provider) {
        if (!_hasId(childId) || !_hasId(candidateAncestorId)) return false;
        if (childId === candidateAncestorId) return true;
        if (typeof provider !== 'function') return false;

        var visited = new Set();
        var stack = [candidateAncestorId];

        while (stack.length > 0) {
            var currentId = stack.pop();
            if (currentId === childId) return true;
            if (visited.has(currentId)) continue;
            visited.add(currentId);

            var node = provider(currentId);
            if (!node || !Array.isArray(node.parents)) continue;

            for (var i = 0; i < node.parents.length; i++) {
                var pid = node.parents[i];
                if (_hasId(pid) && !visited.has(pid)) {
                    stack.push(pid);
                }
            }
        }

        return false;
    }

    // =========================================================================
    // 8. ORPHAN / ANY PARENT
    // =========================================================================

    /**
     * facts: {
     *   livingBiologicalParents: [ids],
     *   livingLegalParents: [ids]
     * }
     *
     * Returns { valid: true, value: boolean } when facts are supplied,
     * or { valid: false, errors: ['missing_facts'] } otherwise.
     *
     * An orphan is a child with no living biological parent and no
     * living legal parent. Social parents do not prevent orphanhood.
     */
    function isOrphan(facts) {
        if (!facts || typeof facts !== 'object') {
            return { valid: false, errors: ['missing_facts'] };
        }
        var livingBio = _readArray(facts.livingBiologicalParents);
        var livingLegal = _readArray(facts.livingLegalParents);
        return {
            valid: true,
            value: livingBio.length === 0 && livingLegal.length === 0
        };
    }

    /**
     * facts: {
     *   biologicalParents: [ids],
     *   legalParents: [ids],
     *   socialParents: [ids]
     * }
     *
     * Returns { valid: true, value: boolean } when facts are supplied,
     * or { valid: false, errors: ['missing_facts'] } otherwise.
     */
    function hasAnyParent(facts) {
        if (!facts || typeof facts !== 'object') {
            return { valid: false, errors: ['missing_facts'] };
        }
        return {
            valid: true,
            value: _readArray(facts.biologicalParents).length > 0
                || _readArray(facts.legalParents).length > 0
                || _readArray(facts.socialParents).length > 0
        };
    }

    // =========================================================================
    // 9. ADOPTION
    // =========================================================================

    /**
     * Can an adoption be created?
     *
     * facts: {
     *   childId,
     *   adopterIds: [ids],
     *   childHasLivingBiologicalParents: boolean,
     *   biologicalParentsConsent:        boolean,
     *   conflictWithExistingLegalParentAtRole: boolean,
     *   allowReplace:                    boolean
     * }
     *
     * Rules:
     *   - childId required
     *   - at least one adopter required
     *   - adopter must not be the child
     *   - if the child has living biological parents, the caller must
     *     supply biologicalParentsConsent === true OR bypassConsent === true.
     *     The rule does not invent consent policy; it requires the fact.
     *   - replacing an existing legal parent at the same role requires
     *     allowReplace === true.
     *
     * Returns { valid: boolean, errors: string[] }.
     */
    function canCreateAdoption(facts) {
        var errors = [];
        if (!facts || typeof facts !== 'object') {
            return { valid: false, errors: ['missing_facts'] };
        }

        if (!_hasId(facts.childId)) errors.push('missing_child_id');

        var adopters = _readArray(facts.adopterIds);
        if (adopters.length === 0) errors.push('missing_adopter');
        for (var i = 0; i < adopters.length; i++) {
            if (adopters[i] === facts.childId) {
                errors.push('self_adoption');
                break;
            }
        }

        if (facts.childHasLivingBiologicalParents === true
            && facts.biologicalParentsConsent !== true
            && facts.bypassConsent !== true) {
            errors.push('missing_biological_parent_consent');
        }

        if (facts.conflictWithExistingLegalParentAtRole === true
            && facts.allowReplace !== true) {
            errors.push('legal_role_already_filled');
        }

        return { valid: errors.length === 0, errors: errors };
    }

    // =========================================================================
    // 10. INTERNAL — BOUNDED ANCESTOR COLLECTION
    // =========================================================================

    function _collectAncestorsBounded(startId, provider, maxDepth) {
        var result = new Map();
        var visited = new Set([startId]);
        var queue = [{ id: startId, depth: 0 }];

        while (queue.length > 0) {
            var current = queue.shift();
            if (current.depth >= maxDepth) continue;

            var node = provider(current.id);
            if (!node || !Array.isArray(node.parents)) continue;

            for (var i = 0; i < node.parents.length; i++) {
                var pid = node.parents[i];
                if (!_hasId(pid)) continue;
                var dist = current.depth + 1;

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

    // =========================================================================
    // 11. EXPORTS
    // =========================================================================

    window.FamilyRules = {
        // Vocabulary
        PARENT_TYPE: PARENT_TYPE,
        PARENT_ROLE: PARENT_ROLE,
        SIBLING_TYPE: SIBLING_TYPE,
        KINSHIP: KINSHIP,

        // Parent role
        normalizeParentRole: normalizeParentRole,
        isBiological: isBiological,
        isValidParentType: isValidParentType,
        isValidParentRole: isValidParentRole,

        // Parent assignment
        canSetParent: canSetParent,

        // Sibling classification
        deriveSiblingship: deriveSiblingship,

        // Kinship
        classifyKinship: classifyKinship,
        isBloodRelated: isBloodRelated,

        // Cycle
        wouldCreateBiologicalCycle: wouldCreateBiologicalCycle,

        // Orphan
        isOrphan: isOrphan,
        hasAnyParent: hasAnyParent,

        // Adoption
        canCreateAdoption: canCreateAdoption
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.FamilyRules;
    }
})();
