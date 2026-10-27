/**
 * =============================================================================
 * STILL WATERS - RELIGION RULES (religion-rules.js)
 * =============================================================================
 *
 * LOCATION: js/religion/religion-rules.js
 *
 * Domain rules for religion operations. Answers "is this allowed?" without
 * performing the operation.
 *
 * Scope:
 *   - Conversion eligibility
 *   - Leadership eligibility
 *   - Deprecation eligibility
 *   - Reactivation eligibility
 *   - Deletion eligibility
 *   - Character religion assignment eligibility
 *   - Inheritance resolution (pure rule engine)
 *
 * Out of scope (belongs in ReligionValidation):
 *   - Enum membership
 *   - Required fields
 *   - Type checks
 *
 * Out of scope (belongs in Commands):
 *   - Performing the mutation
 *   - Persisting
 *   - Notifying subscribers
 *
 * Rules are pure: facts in, verdict out. They never mutate anything.
 *
 * TWO ENTRY POINTS FOR INHERITANCE
 * --------------------------------
 *   resolveInheritance(facts)                    ← pure, no reads
 *   resolveInheritanceForChild(childId, ...)     ← convenience, reads
 *
 * The pure engine takes resolved facts (motherReligion, fatherReligion,
 * dominantReligion) and returns a verdict. No Queries, no State, no
 * accessors. Deterministic. This is what unit tests use.
 *
 * The convenience wrapper fetches the facts from Queries + accessors and
 * delegates to the engine. It is provided so callers do not have to know
 * the exact shape of the facts object. It reads; it does not mutate.
 * Callers who want provable purity call the engine directly.
 *
 * VERDICT SHAPES
 * --------------
 *   can* functions: { allowed: boolean, reason: string | null }
 *   resolveInheritance / resolveInheritanceForChild:
 *       { religionId: string | null, source: ..., rule: ... }
 *
 * DEPENDENCIES:
 *   - religion-queries.js:  ReligionQueries
 *   - religion-constants.js: ReligionConstants
 *   - accessors.js:          getCharacterById
 *
 * ICON POLICY: No emojis. No icons in confirm/cancel buttons.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Phase 5: new module. Extracted rule logic from religion-commands.js and
 *            religion-inheritance.js. Pure engine + convenience wrapper
 *            split.
 *   Phase 7 (current): converge to the reference pattern.
 *     - Header documents the read path in resolveInheritanceForChild.
 *     - Load-time verification.
 *     - Removed unused RULES local in resolveInheritance.
 *     - No behavioural change.
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY RESOLUTION
    // =========================================================================

    function _queries() {
        if (typeof window.ReligionQueries === 'undefined') {
            throw new Error('ReligionRules requires ReligionQueries.');
        }
        return window.ReligionQueries;
    }

    function _constants() {
        if (typeof window.ReligionConstants === 'undefined') {
            throw new Error('ReligionRules requires ReligionConstants.');
        }
        return window.ReligionConstants;
    }

    function _getCharacterById(id) {
        if (typeof window.getCharacterById !== 'function') {
            throw new Error('ReligionRules requires accessors.getCharacterById.');
        }
        return window.getCharacterById(id);
    }

    function _allow() {
        return { allowed: true, reason: null };
    }

    function _deny(reason) {
        return { allowed: false, reason: reason };
    }

    // =========================================================================
    // 2. CONVERSION ELIGIBILITY
    // =========================================================================

    /**
     * Can this character convert to this religion?
     *
     * Checks:
     *   - target religion exists and is not deprecated
     *   - current religion (if any) allows conversion out
     *   - target religion allows conversion in
     *   - not already a member (converting to same religion is a no-op)
     *
     * Returns { allowed, reason }.
     */
    function canConvert(characterId, targetReligionId, options) {
        var character = _getCharacterById(characterId);
        if (!character) {
            return _deny('Character not found');
        }

        var targetReligion = _queries().getReligion(targetReligionId);
        if (!targetReligion) {
            return _deny('Target religion not found');
        }

        if (targetReligion.isDeprecated) {
            return _deny('Cannot convert to deprecated religion');
        }

        // Already a member — no-op allowed, but flagged.
        if (character.religionId === targetReligionId) {
            return _deny('Character already follows this religion');
        }

        if (character.religionId) {
            var currentReligion = _queries().getReligion(character.religionId);
            if (currentReligion && currentReligion.allowsConversion === false) {
                return _deny('Conversion not allowed by current religion');
            }
        }

        if (targetReligion.allowsConversion === false) {
            return _deny('Conversion not allowed by target religion');
        }

        return _allow();
    }

    /**
     * Can this character be assigned a religion at all?
     *
     * Distinct from canConvert because assignment to a first religion has
     * different semantics: no "current religion" check applies.
     */
    function canAssignReligion(characterId, religionId, options) {
        var character = _getCharacterById(characterId);
        if (!character) {
            return _deny('Character not found');
        }

        var religion = _queries().getReligion(religionId);
        if (!religion) {
            return _deny('Religion not found');
        }

        if (religion.isDeprecated) {
            return _deny('Cannot assign deprecated religion');
        }

        return _allow();
    }

    /**
     * Can this character's religion be removed?
     */
    function canRemoveReligion(characterId) {
        var character = _getCharacterById(characterId);
        if (!character) {
            return _deny('Character not found');
        }
        if (!character.religionId) {
            return _deny('Character has no religion to remove');
        }
        return _allow();
    }

    // =========================================================================
    // 3. LEADERSHIP ELIGIBILITY
    // =========================================================================

    /**
     * Can this character become the leader of this religion at this year?
     *
     * Checks:
     *   - religion exists
     *   - character exists and is living
     *   - startYear is not before the current leader's startYear
     *
     * Returns { allowed, reason }.
     */
    function canSetLeader(religionId, characterId, options) {
        options = options || {};

        var religion = _queries().getReligion(religionId);
        if (!religion) {
            return _deny('Religion not found');
        }

        var character = _getCharacterById(characterId);
        if (!character) {
            return _deny('Character not found');
        }

        if (character.isDeceased) {
            return _deny('Cannot appoint a deceased character as leader');
        }

        // Chronology check: new term cannot begin before the current term began.
        if (religion.leader && religion.leader.startYear !== undefined && religion.leader.startYear !== null) {
            var currentStart = religion.leader.startYear;
            var newStart = options.startYear;
            if (newStart !== undefined && newStart !== null && newStart < currentStart) {
                return _deny('New leader term cannot begin before the current term began (' + currentStart + ')');
            }
        }

        return _allow();
    }

    /**
     * Can this leader's term be ended at this year?
     */
    function canEndLeaderTerm(religionId, characterId, endYear, options) {
        var religion = _queries().getReligion(religionId);
        if (!religion) {
            return _deny('Religion not found');
        }

        if (!religion.leader) {
            return _deny('Religion has no leader');
        }

        if (religion.leader.characterId !== characterId) {
            return _deny('Character is not the current leader');
        }

        // Chronology: endYear cannot be before startYear.
        if (endYear !== undefined && endYear !== null && religion.leader.startYear !== undefined) {
            if (endYear < religion.leader.startYear) {
                return _deny('Leader term cannot end before it began (year ' + religion.leader.startYear + ')');
            }
        }

        return _allow();
    }

    // =========================================================================
    // 4. RELIGION LIFECYCLE ELIGIBILITY
    // =========================================================================

    function canDeprecate(religionId) {
        var religion = _queries().getReligion(religionId);
        if (!religion) {
            return _deny('Religion not found');
        }
        if (religion.isDeprecated) {
            return _deny('Religion is already deprecated');
        }
        return _allow();
    }

    function canReactivate(religionId) {
        var religion = _queries().getReligion(religionId);
        if (!religion) {
            return _deny('Religion not found');
        }
        if (!religion.isDeprecated) {
            return _deny('Religion is not deprecated');
        }
        return _allow();
    }

    function canDelete(religionId) {
        var religion = _queries().getReligion(religionId);
        if (!religion) {
            return _deny('Religion not found');
        }

        var followers = _queries().getFollowerCount(religionId);
        if (followers > 0) {
            return _deny('Cannot delete religion with ' + followers +
                         ' followers. Deprecate it instead.');
        }

        return _allow();
    }

    // =========================================================================
    // 5. INHERITANCE RULE ENGINE (pure)
    // =========================================================================
    // Per ADR Decision 12. Pure. Takes facts. Returns verdict + provenance.
    //
    // Input: { motherReligion, fatherReligion, dominantReligion }
    //   motherReligion   — religion object or null
    //   fatherReligion   — religion object or null
    //   dominantReligion — religion object or null (resolved by caller
    //                      from a location)
    //
    // Output: { religionId, source, rule }
    //   religionId — religion id to inherit, or null
    //   source     — 'mother' | 'father' | 'both' | 'location' | null
    //   rule       — the inheritance rule that was applied:
    //                'mother' | 'father' | 'both' | 'dominant' | 'none'
    //
    // This function does not read anything. It uses only its facts argument.
    // Callers who want to fetch facts use resolveInheritanceForChild.

    function resolveInheritance(facts) {
        facts = facts || {};

        var motherReligion = facts.motherReligion || null;
        var fatherReligion = facts.fatherReligion || null;
        var dominantReligion = facts.dominantReligion || null;

        // Deprecated religions cannot be inherited.
        if (motherReligion && motherReligion.isDeprecated) motherReligion = null;
        if (fatherReligion && fatherReligion.isDeprecated) fatherReligion = null;
        if (dominantReligion && dominantReligion.isDeprecated) dominantReligion = null;

        // Neither parent has a religion.
        if (!motherReligion && !fatherReligion) {
            return _resolveNoParentReligion(dominantReligion);
        }

        // Only one parent has a religion. That parent's rule governs.
        if (motherReligion && !fatherReligion) {
            return _resolveOneParent(motherReligion, 'mother', dominantReligion);
        }
        if (fatherReligion && !motherReligion) {
            return _resolveOneParent(fatherReligion, 'father', dominantReligion);
        }

        // Both parents. Apply the both-parent conflict rules.
        return _resolveBothParents(motherReligion, fatherReligion, dominantReligion);
    }

    function _resolveNoParentReligion(dominantReligion) {
        if (dominantReligion) {
            return {
                religionId: dominantReligion.id,
                source: 'location',
                rule: 'dominant'
            };
        }
        return { religionId: null, source: null, rule: 'none' };
    }

    function _resolveOneParent(parentReligion, parentSource, dominantReligion) {
        var RULES = _constants().INHERITANCE_RULES;
        var rule = parentReligion.inheritanceRule || { type: RULES.MOTHER };
        var ruleType = rule.type || RULES.MOTHER;

        switch (ruleType) {
            case RULES.NONE:
                // Parent's rule says no inheritance at all.
                return { religionId: null, source: null, rule: 'none' };

            case RULES.DOMINANT:
                // Parent's rule says defer to location's dominant.
                if (dominantReligion) {
                    return {
                        religionId: dominantReligion.id,
                        source: 'location',
                        rule: 'dominant'
                    };
                }
                return { religionId: null, source: null, rule: 'dominant' };

            case RULES.MOTHER:
            case RULES.FATHER:
                // The other parent has no religion. The rule's target
                // (mother/father) refers to a parent who is not available;
                // the parent who actually has a religion governs.
                return {
                    religionId: parentReligion.id,
                    source: parentSource,
                    rule: ruleType
                };

            case RULES.BOTH:
                // Only one parent has a religion. "Both" cannot apply.
                // The parent with a religion governs.
                return {
                    religionId: parentReligion.id,
                    source: parentSource,
                    rule: 'both'
                };

            default:
                return {
                    religionId: parentReligion.id,
                    source: parentSource,
                    rule: ruleType
                };
        }
    }

    function _resolveBothParents(motherReligion, fatherReligion, dominantReligion) {
        var RULES = _constants().INHERITANCE_RULES;

        var motherRule = motherReligion.inheritanceRule || { type: RULES.MOTHER };
        var fatherRule = fatherReligion.inheritanceRule || { type: RULES.FATHER };
        var motherType = motherRule.type || RULES.MOTHER;
        var fatherType = fatherRule.type || RULES.FATHER;

        // Same religion on both sides.
        if (motherReligion.id === fatherReligion.id) {
            return {
                religionId: motherReligion.id,
                source: 'both',
                rule: motherType
            };
        }

        // NONE precedence: if either parent's rule says none, no parental
        // inheritance. Fall back to location dominant if available.
        if (motherType === RULES.NONE || fatherType === RULES.NONE) {
            if (dominantReligion) {
                return {
                    religionId: dominantReligion.id,
                    source: 'location',
                    rule: 'dominant'
                };
            }
            return { religionId: null, source: null, rule: 'none' };
        }

        // Same non-NONE rule type: apply directly.
        // Different non-NONE rules: mother's rule governs (ADR Decision 12).
        // Both branches call _applySharedRule with motherType.
        return _applySharedRule(motherType, motherReligion, fatherReligion, dominantReligion);
    }

    function _applySharedRule(ruleType, motherReligion, fatherReligion, dominantReligion) {
        var RULES = _constants().INHERITANCE_RULES;

        switch (ruleType) {
            case RULES.MOTHER:
                return { religionId: motherReligion.id, source: 'mother', rule: 'mother' };

            case RULES.FATHER:
                return { religionId: fatherReligion.id, source: 'father', rule: 'father' };

            case RULES.BOTH: {
                // Both parents have different religions. Use the mother's
                // religion's priority field.
                var priority = motherReligion.inheritanceRule &&
                               motherReligion.inheritanceRule.priority !== undefined &&
                               motherReligion.inheritanceRule.priority !== null
                    ? motherReligion.inheritanceRule.priority
                    : RULES.MOTHER;

                if (priority === RULES.FATHER) {
                    return { religionId: fatherReligion.id, source: 'father', rule: 'both' };
                }
                return { religionId: motherReligion.id, source: 'mother', rule: 'both' };
            }

            case RULES.DOMINANT:
                if (dominantReligion) {
                    return { religionId: dominantReligion.id, source: 'location', rule: 'dominant' };
                }
                return { religionId: null, source: null, rule: 'dominant' };

            case RULES.NONE:
                return { religionId: null, source: null, rule: 'none' };

            default:
                return { religionId: null, source: null, rule: ruleType };
        }
    }

    // =========================================================================
    // 6. CONVENIENCE WRAPPER (reads, then delegates)
    // =========================================================================

    /**
     * Fetch facts and run resolveInheritance. This is the practical entry
     * point for callers who have character IDs, not facts.
     *
     * Reads from Queries and accessors. Does not mutate. Does not assign.
     * Assignment is the caller's job (see ReligionInheritance.inheritReligionForChild
     * for the standard assignment path).
     *
     * Callers who want provable purity (unit tests, replay) call
     * resolveInheritance directly with facts they build themselves.
     */
    function resolveInheritanceForChild(childId, motherId, fatherId, locationId) {
        var mother = motherId ? _getCharacterById(motherId) : null;
        var father = fatherId ? _getCharacterById(fatherId) : null;

        var motherReligion = mother && mother.religionId
            ? _queries().getReligion(mother.religionId)
            : null;
        var fatherReligion = father && father.religionId
            ? _queries().getReligion(father.religionId)
            : null;

        // Only compute dominant if needed by the rules. For simplicity, we
        // fetch it whenever a location is provided; the rule engine decides
        // whether to use it.
        var dominantReligion = locationId
            ? _queries().getDominantReligion(locationId)
            : null;

        return resolveInheritance({
            motherReligion: motherReligion,
            fatherReligion: fatherReligion,
            dominantReligion: dominantReligion
        });
    }

    // =========================================================================
    // 7. LOAD-TIME VERIFICATION
    // =========================================================================

    (function _verifyLoadTimeDependencies() {
        if (!window.ReligionQueries) {
            throw new Error(
                'religion-rules.js loaded but window.ReligionQueries is missing. ' +
                'Check script tag order (religion-queries.js must load first).'
            );
        }
        if (!window.ReligionConstants) {
            throw new Error(
                'religion-rules.js loaded but window.ReligionConstants is missing. ' +
                'Check script tag order (religion-constants.js must load first).'
            );
        }
        if (typeof window.getCharacterById !== 'function') {
            throw new Error(
                'religion-rules.js loaded but window.getCharacterById is missing. ' +
                'Check script tag order (accessors.js must load first).'
            );
        }
    })();

    // =========================================================================
    // 8. EXPORTS
    // =========================================================================

    window.ReligionRules = {
        // Conversion
        canConvert: canConvert,
        canAssignReligion: canAssignReligion,
        canRemoveReligion: canRemoveReligion,

        // Leadership
        canSetLeader: canSetLeader,
        canEndLeaderTerm: canEndLeaderTerm,

        // Lifecycle
        canDeprecate: canDeprecate,
        canReactivate: canReactivate,
        canDelete: canDelete,

        // Inheritance
        resolveInheritance: resolveInheritance,
        resolveInheritanceForChild: resolveInheritanceForChild
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { ReligionRules: window.ReligionRules };
    }

})();
