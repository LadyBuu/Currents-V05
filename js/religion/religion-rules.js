/**
 * =============================================================================
 * STILL WATERS - RELIGION RULES (religion-rules.js)
 * =============================================================================
 * 
 * LOCATION: js/core/religion/religion-rules.js
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
 * Rules are pure: state in, verdict out. They never mutate anything.
 * 
 * DEPENDENCIES:
 *   - religion-queries.js: ReligionQueries
 *   - religion-constants.js: ReligionConstants
 * 
 * ICON POLICY: No emojis. No icons in confirm/cancel buttons.
 * 
 * =============================================================================
 * PHASE 5 DOMAIN RULES AND VALIDATION EXTRACTION (2026):
 *   - New module. Extracted rule logic from religion-commands.js
 *     (conversion allowed, deprecated checks) and religion-inheritance.js
 *     (the inheritance algorithm).
 *   - resolveInheritance is the pure rule engine described in ADR
 *     Decision 12. Takes facts, returns verdict + provenance.
 *   - All can* functions return { allowed, reason } or { allowed: true }.
 * 
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
    // 5. INHERITANCE RULE ENGINE
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

    function resolveInheritance(facts) {
        facts = facts || {};
        var RULES = _constants().INHERITANCE_RULES;

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
                // If this parent is the father, and their rule says mother,
                // but the mother has no religion — the rule cannot resolve.
                // Fall back to the parent who actually has a religion.
                return {
                    religionId: parentReligion.id,
                    source: parentSource,
                    rule: ruleType
                };

            case RULES.FATHER:
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
        if (motherType === fatherType) {
            return _applySharedRule(motherType, motherReligion, fatherReligion, dominantReligion);
        }

        // Different non-NONE rules: mother's rule governs (per ADR Decision 12).
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
    // 6. CONVENIENCE RULE HELPERS (used by commands)
    // =========================================================================

    /**
     * Fetch facts and run resolveInheritance. This is the practical entry
     * point for callers who have character IDs, not facts.
     * 
     * Note: this still calls Queries (reads), never Commands. It does not
     * perform assignment. Assignment is the caller's job.
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
    // 7. EXPORTS
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
