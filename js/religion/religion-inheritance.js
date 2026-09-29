/**
 * =============================================================================
 * STILL WATERS - RELIGION INHERITANCE (religion-inheritance.js)
 * =============================================================================
 * 
 * LOCATION: js/core/religion/religion-inheritance.js
 * 
 * Child religion inheritance logic.
 * Determines which religion a child inherits based on:
 *   - Mother's religion
 *   - Father's religion
 *   - Location's dominant religion
 *   - Religion's inheritance rules (configurable per religion)
 * 
 * This module is READ-ONLY. It resolves which religion a child should
 * inherit. It does NOT mutate character records. When assignment is
 * required, callers delegate to ReligionCommands.
 * 
 * DEPENDENCIES:
 *   - religion-queries.js: ReligionQueries
 *   - religion-commands.js: ReligionCommands (for assignment)
 *   - religion-constants.js: ReligionConstants (INHERITANCE_RULES)
 *   - religion-format.js: ReligionFormat (display names)
 *   - accessors.js: getCharacterById
 * 
 * ICON POLICY: No emojis. No icons in confirm/cancel buttons.
 * 
 * =============================================================================
 * PHASE 0 STABILISATION (2026):
 *   - Removed _processingInheritance re-entry guard.
 *   - Fixed year-zero bug in inheritReligionForChild.
 * 
 * PHASE 2 VOCABULARY CONSOLIDATION (2026):
 *   - Deleted local INHERITANCE_RULES fallback. Reads from ReligionConstants.
 *   - Deleted local getInheritanceRuleName. Delegates to ReligionFormat.
 * 
 * PHASE 3 BOUNDARY RESTRUCTURE (2026):
 *   - Deleted direct-mutation fallback in inheritReligionForChild. Character
 *     mutation goes through ReligionCommands.assignReligionToCharacter.
 *     If the command is missing, that is a load-order bug and we fail loudly
 *     (ADR Decision 8).
 *   - Deleted local _getDominantReligion fallback implementation. Uses
 *     ReligionQueries.getDominantReligion.
 *   - Deleted local _getFollowerCount helper (unused once statistics move).
 *   - getInheritanceStatistics simplified: no follower count (that is a
 *     religion-level statistic; Queries owns it). Statistics fully migrate
 *     to ReligionQueries in Phase 5.
 * 
 * NOTE: The rule semantics (one-parent case, both-parent conflict tiebreaker,
 * DOMINANT fallback to mother) are still the Phase 0 behavior. Phase 5 will
 * verify them against the ADR rule matrix and add unit tests. Phase 3 does
 * not change behavior; it only removes mutation and fallbacks.
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getQueries() {
        if (typeof window.ReligionQueries === 'undefined') {
            throw new Error('ReligionInheritance requires ReligionQueries.');
        }
        return window.ReligionQueries;
    }

    function _getCommands() {
        if (typeof window.ReligionCommands === 'undefined') {
            throw new Error('ReligionInheritance requires ReligionCommands.');
        }
        return window.ReligionCommands;
    }

    function _getCharacterById(id) {
        if (typeof window.getCharacterById !== 'function') {
            throw new Error('ReligionInheritance requires accessors.getCharacterById.');
        }
        return window.getCharacterById(id);
    }

    // =========================================================================
    // 2. INHERITANCE RULES REFERENCE
    // =========================================================================

    function _rules() {
        if (typeof window.ReligionConstants === 'undefined' ||
            !window.ReligionConstants.INHERITANCE_RULES) {
            throw new Error(
                'ReligionInheritance requires ReligionConstants.INHERITANCE_RULES. ' +
                'Check script order in index.html.'
            );
        }
        return window.ReligionConstants.INHERITANCE_RULES;
    }

    // =========================================================================
    // 3. CORE INHERITANCE FUNCTION
    // =========================================================================

    function getInheritedReligion(childId, motherId, fatherId, locationId) {
        var RULES = _rules();
        var queries = _getQueries();

        var mother = motherId ? _getCharacterById(motherId) : null;
        var father = fatherId ? _getCharacterById(fatherId) : null;

        var motherReligion = mother && mother.religionId
            ? queries.getReligion(mother.religionId)
            : null;
        var fatherReligion = father && father.religionId
            ? queries.getReligion(father.religionId)
            : null;

        // No parent has a religion — fall back to location dominant.
        if (!motherReligion && !fatherReligion) {
            if (locationId) {
                var dominant = queries.getDominantReligion(locationId);
                if (dominant && !dominant.isDeprecated) {
                    return dominant;
                }
            }
            return null;
        }

        // Only mother has a religion.
        if (motherReligion && !fatherReligion) {
            var motherRule = motherReligion.inheritanceRule || { type: RULES.MOTHER };
            if (motherRule.type === RULES.NONE) {
                if (locationId) {
                    var dominant = queries.getDominantReligion(locationId);
                    if (dominant && !dominant.isDeprecated) {
                        return dominant;
                    }
                }
                return null;
            }
            return motherReligion;
        }

        // Only father has a religion.
        if (fatherReligion && !motherReligion) {
            var fatherRule = fatherReligion.inheritanceRule || { type: RULES.FATHER };
            if (fatherRule.type === RULES.NONE) {
                if (locationId) {
                    var dominant = queries.getDominantReligion(locationId);
                    if (dominant && !dominant.isDeprecated) {
                        return dominant;
                    }
                }
                return null;
            }
            return fatherReligion;
        }

        // Both parents have religions.
        return _applyInheritanceRules(motherReligion, fatherReligion, locationId);
    }

    // =========================================================================
    // 4. INHERITANCE RULE APPLICATION
    // =========================================================================

    function _applyInheritanceRules(motherReligion, fatherReligion, locationId) {
        var RULES = _rules();
        var motherRule = motherReligion.inheritanceRule || { type: RULES.MOTHER };
        var fatherRule = fatherReligion.inheritanceRule || { type: RULES.FATHER };

        // Same rule type — apply directly.
        if (motherRule.type === fatherRule.type) {
            return _applyRule(motherReligion, fatherReligion, motherRule.type, locationId);
        }

        // Different rules — mother's rule governs (with NONE precedence).
        if (motherRule.type === RULES.NONE) {
            if (fatherRule.type === RULES.NONE) {
                if (locationId) {
                    var dominant = _getQueries().getDominantReligion(locationId);
                    if (dominant && !dominant.isDeprecated) {
                        return dominant;
                    }
                }
                return null;
            }
            return _applyRule(motherReligion, fatherReligion, fatherRule.type, locationId);
        }

        if (fatherRule.type === RULES.NONE) {
            return _applyRule(motherReligion, fatherReligion, motherRule.type, locationId);
        }

        // Different non-NONE rules — mother's rule as tiebreaker.
        return _applyRule(motherReligion, fatherReligion, motherRule.type, locationId);
    }

    // =========================================================================
    // 5. RULE EXECUTION
    // =========================================================================

    function _applyRule(motherReligion, fatherReligion, ruleType, locationId) {
        var RULES = _rules();

        switch (ruleType) {
            case RULES.MOTHER:
                return motherReligion;

            case RULES.FATHER:
                return fatherReligion;

            case RULES.BOTH:
                if (motherReligion.id === fatherReligion.id) {
                    return motherReligion;
                }

                var motherRule = motherReligion.inheritanceRule || { priority: RULES.MOTHER };
                var priority = motherRule.priority !== undefined && motherRule.priority !== null
                    ? motherRule.priority
                    : RULES.MOTHER;

                if (priority === RULES.MOTHER) return motherReligion;
                if (priority === RULES.FATHER) return fatherReligion;
                return motherReligion;

            case RULES.DOMINANT:
                if (locationId) {
                    var dominant = _getQueries().getDominantReligion(locationId);
                    if (dominant && !dominant.isDeprecated) {
                        return dominant;
                    }
                }
                return motherReligion;

            case RULES.NONE:
            default:
                return null;
        }
    }

    // =========================================================================
    // 6. HELPERS
    // =========================================================================

    function getInheritanceRuleName(ruleType) {
        if (typeof window.ReligionFormat !== 'undefined' &&
            typeof window.ReligionFormat.getInheritanceRuleName === 'function') {
            return window.ReligionFormat.getInheritanceRuleName(ruleType);
        }
        return ruleType;
    }

    function getInheritanceSource(motherId, fatherId, inheritedReligionId) {
        if (!inheritedReligionId) return null;

        var mother = motherId ? _getCharacterById(motherId) : null;
        var father = fatherId ? _getCharacterById(fatherId) : null;

        var motherHas = mother && mother.religionId === inheritedReligionId;
        var fatherHas = father && father.religionId === inheritedReligionId;

        if (motherHas && fatherHas) return 'both';
        if (motherHas) return 'mother';
        if (fatherHas) return 'father';
        return 'location';
    }

    function getInheritanceDescription(religionId) {
        var RULES = _rules();
        var religion = _getQueries().getReligion(religionId);
        if (!religion) return 'No inheritance rules set';

        var rule = religion.inheritanceRule || { type: RULES.MOTHER };
        var ruleName = getInheritanceRuleName(rule.type);

        if (rule.type === RULES.BOTH && rule.priority) {
            var priorityName = getInheritanceRuleName(rule.priority);
            return ruleName + ' (priority: ' + priorityName + ')';
        }

        return ruleName;
    }

    function getInheritanceSummary(religionId) {
        var RULES = _rules();
        var religion = _getQueries().getReligion(religionId);
        if (!religion) return null;

        var rule = religion.inheritanceRule || { type: RULES.MOTHER };

        return {
            religionId: religion.id,
            religionName: religion.name,
            ruleType: rule.type,
            ruleName: getInheritanceRuleName(rule.type),
            priority: rule.priority !== undefined && rule.priority !== null ? rule.priority : null,
            priorityName: rule.priority ? getInheritanceRuleName(rule.priority) : null,
            notes: rule.notes || '',
            description: getInheritanceDescription(religionId)
        };
    }

    // =========================================================================
    // 7. INHERITANCE ASSIGNMENT (delegates to Commands)
    // =========================================================================

    function inheritReligionForChild(childId, motherId, fatherId, locationId, options) {
        var optionsObj = options || {};
        var inheritedReligion = getInheritedReligion(childId, motherId, fatherId, locationId);

        if (!inheritedReligion) {
            return {
                success: true,
                inherited: false,
                reason: 'No religion to inherit'
            };
        }

        var child = _getCharacterById(childId);
        if (!child) {
            return {
                success: false,
                inherited: false,
                reason: 'Child not found'
            };
        }

        // Resolve year with explicit missing-value checks. Year 0 is valid.
        var resolvedYear;
        if (optionsObj.year !== undefined && optionsObj.year !== null) {
            resolvedYear = optionsObj.year;
        } else if (child.birthYear !== undefined && child.birthYear !== null) {
            resolvedYear = child.birthYear;
        } else {
            resolvedYear = 0;
        }

        var source = getInheritanceSource(motherId, fatherId, inheritedReligion.id);

        // Delegate the character mutation to Commands. No fallback path.
        var result = _getCommands().assignReligionToCharacter(
            childId,
            inheritedReligion.id,
            {
                year: resolvedYear,
                reason: 'inheritance',
                notes: 'Inherited from ' +
                    (source === 'both' ? 'both parents'
                     : source === 'mother' ? 'mother'
                     : source === 'father' ? 'father'
                     : 'location\'s dominant religion'),
                inherited: true,
                inheritedFrom: source
            }
        );

        return {
            success: result.success,
            inherited: result.success,
            religion: inheritedReligion,
            source: source,
            data: result.data,
            reason: result.reason
        };
    }

    // =========================================================================
    // 8. STATISTICS (moved to ReligionQueries in Phase 5)
    // =========================================================================

    function getInheritanceStatistics(religionId) {
        var RULES = _rules();
        var religion = _getQueries().getReligion(religionId);
        if (!religion) return null;

        var rule = religion.inheritanceRule || { type: RULES.MOTHER };

        // Follower count moved out: it is a religion-level statistic, owned by
        // ReligionQueries.getReligionStatistics. The hasChildren field was
        // meaningless and has been removed.
        return {
            religionId: religion.id,
            religionName: religion.name,
            ruleType: rule.type,
            ruleName: getInheritanceRuleName(rule.type),
            priority: rule.priority !== undefined && rule.priority !== null ? rule.priority : null,
            priorityName: rule.priority ? getInheritanceRuleName(rule.priority) : null
        };
    }

    function getAllInheritanceSummaries() {
        var allReligions = _getQueries().getAllReligions({ includeDeprecated: false });
        var summaries = [];
        for (var i = 0; i < allReligions.length; i++) {
            var summary = getInheritanceSummary(allReligions[i].id);
            if (summary) summaries.push(summary);
        }
        return summaries;
    }

    // =========================================================================
    // 9. EXPORTS
    // =========================================================================

    window.ReligionInheritance = {
        // Core
        getInheritedReligion: getInheritedReligion,
        inheritReligionForChild: inheritReligionForChild,

        // Helpers
        getInheritanceRuleName: getInheritanceRuleName,
        getInheritanceSource: getInheritanceSource,
        getInheritanceDescription: getInheritanceDescription,
        getInheritanceSummary: getInheritanceSummary,

        // Statistics
        getInheritanceStatistics: getInheritanceStatistics,
        getAllInheritanceSummaries: getAllInheritanceSummaries,

        // Constants reference (lazy, delegates to ReligionConstants)
        get INHERITANCE_RULES() {
            return _rules();
        }
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            ReligionInheritance: window.ReligionInheritance
        };
    }

})();
