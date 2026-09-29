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
 * DEPENDENCIES:
 *   - religion-state.js: ReligionState
 *   - religion-queries.js: ReligionQueries
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
 *   - Deleted local INHERITANCE_RULES fallback. Now reads from
 *     ReligionConstants.INHERITANCE_RULES.
 *   - Deleted local getInheritanceRuleName. Delegates to ReligionFormat.
 *   - Note: the "parent's rule governs in one-parent case" behaviour is
 *     still the pre-Phase-5 implementation. Phase 5 will verify it against
 *     the ADR's explicit rule matrix and may adjust the semantics.
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getReligion(id) {
        if (typeof window.ReligionState !== 'undefined' &&
            typeof window.ReligionState.getReligion === 'function') {
            return window.ReligionState.getReligion(id);
        }
        return null;
    }

    function _getAllReligions(options) {
        if (typeof window.ReligionState !== 'undefined' &&
            typeof window.ReligionState.getAllReligions === 'function') {
            return window.ReligionState.getAllReligions(options);
        }
        return [];
    }

    function _getCharacterById(id) {
        if (typeof window.getCharacterById === 'function') {
            return window.getCharacterById(id);
        }
        return null;
    }

    function _getDominantReligion(locationId) {
        if (typeof window.ReligionQueries !== 'undefined' &&
            typeof window.ReligionQueries.getDominantReligion === 'function') {
            return window.ReligionQueries.getDominantReligion(locationId);
        }

        // Fallback: find dominant manually. Phase 3 removes this once the
        // dependency is required.
        if (!locationId) return null;

        var allReligions = _getAllReligions({ includeDeprecated: false });
        var maxCount = 0;
        var dominant = null;

        for (var i = 0; i < allReligions.length; i++) {
            var religion = allReligions[i];
            var count = 0;

            if (typeof window.ReligionState !== 'undefined' &&
                typeof window.ReligionState.getFollowersByLocation === 'function') {
                count = window.ReligionState.getFollowersByLocation(religion.id, locationId).length;
            }

            if (count > maxCount) {
                maxCount = count;
                dominant = religion;
            }
        }

        return dominant;
    }

    function _getFollowerCount(religionId) {
        if (typeof window.ReligionState !== 'undefined' &&
            typeof window.ReligionState.getFollowerCount === 'function') {
            return window.ReligionState.getFollowerCount(religionId);
        }
        return 0;
    }

    // =========================================================================
    // 2. INHERITANCE RULES REFERENCE
    // =========================================================================
    // Reads from ReligionConstants. No local fallback map — that was deleted
    // in Phase 2 because it duplicated the canonical vocabulary.
    // If ReligionConstants is missing, that is a load-order bug and should
    // surface loudly (ADR Decision 8).

    function _getInheritanceRules() {
        if (typeof window.ReligionConstants === 'undefined' ||
            !window.ReligionConstants.INHERITANCE_RULES) {
            throw new Error(
                'ReligionInheritance requires ReligionConstants.INHERITANCE_RULES. ' +
                'Check script order in index.html.'
            );
        }
        return window.ReligionConstants.INHERITANCE_RULES;
    }

    // Cached at first use so we don't do the typeof dance on every call.
    var INHERITANCE_RULES = null;

    function _rules() {
        if (INHERITANCE_RULES === null) {
            INHERITANCE_RULES = _getInheritanceRules();
        }
        return INHERITANCE_RULES;
    }

    // =========================================================================
    // 3. CORE INHERITANCE FUNCTION
    // =========================================================================

    function getInheritedReligion(childId, motherId, fatherId, locationId) {
        var RULES = _rules();

        var mother = motherId ? _getCharacterById(motherId) : null;
        var father = fatherId ? _getCharacterById(fatherId) : null;

        var motherReligion = mother && mother.religionId ? _getReligion(mother.religionId) : null;
        var fatherReligion = father && father.religionId ? _getReligion(father.religionId) : null;

        // If no parents have religions, check location
        if (!motherReligion && !fatherReligion) {
            if (locationId) {
                var dominant = _getDominantReligion(locationId);
                if (dominant && !dominant.isDeprecated) {
                    return dominant;
                }
            }
            return null;
        }

        // Only mother has a religion
        if (motherReligion && !fatherReligion) {
            var motherRule = motherReligion.inheritanceRule || { type: RULES.MOTHER };
            if (motherRule.type === RULES.NONE) {
                if (locationId) {
                    var dominant = _getDominantReligion(locationId);
                    if (dominant && !dominant.isDeprecated) {
                        return dominant;
                    }
                }
                return null;
            }
            return motherReligion;
        }

        // Only father has a religion
        if (fatherReligion && !motherReligion) {
            var fatherRule = fatherReligion.inheritanceRule || { type: RULES.FATHER };
            if (fatherRule.type === RULES.NONE) {
                if (locationId) {
                    var dominant = _getDominantReligion(locationId);
                    if (dominant && !dominant.isDeprecated) {
                        return dominant;
                    }
                }
                return null;
            }
            return fatherReligion;
        }

        // Both parents have religions - apply inheritance rules
        return _applyInheritanceRules(
            motherReligion,
            fatherReligion,
            locationId
        );
    }

    // =========================================================================
    // 4. INHERITANCE RULE APPLICATION
    // =========================================================================

    function _applyInheritanceRules(motherReligion, fatherReligion, locationId) {
        var RULES = _rules();
        var motherRule = motherReligion.inheritanceRule || { type: RULES.MOTHER };
        var fatherRule = fatherReligion.inheritanceRule || { type: RULES.FATHER };

        // If both religions have the same rule type, follow it
        if (motherRule.type === fatherRule.type) {
            return _applyRule(motherReligion, fatherReligion, motherRule.type, locationId);
        }

        // Different rules - mother's rule governs (historical default, will
        // be confirmed against the ADR rule matrix in Phase 5).
        if (motherRule.type === RULES.NONE) {
            if (fatherRule.type === RULES.NONE) {
                if (locationId) {
                    var dominant = _getDominantReligion(locationId);
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

        // Different non-NONE rules - use mother's rule as tiebreaker
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

                if (priority === RULES.MOTHER) {
                    return motherReligion;
                } else if (priority === RULES.FATHER) {
                    return fatherReligion;
                }

                return motherReligion;

            case RULES.DOMINANT:
                if (locationId) {
                    var dominant = _getDominantReligion(locationId);
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
    // 6. HELPER FUNCTIONS
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
        var religion = _getReligion(religionId);
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
        var religion = _getReligion(religionId);
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
    // 7. BATCH INHERITANCE (For children system)
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
                reason: 'Child not found'
            };
        }

        // Year: explicit missing check, year 0 is valid.
        var resolvedYear;
        if (optionsObj.year !== undefined && optionsObj.year !== null) {
            resolvedYear = optionsObj.year;
        } else if (child.birthYear !== undefined && child.birthYear !== null) {
            resolvedYear = child.birthYear;
        } else {
            resolvedYear = 0;
        }

        var source = getInheritanceSource(motherId, fatherId, inheritedReligion.id);

        // Preferred path: delegate to ReligionCommands
        if (typeof window.ReligionCommands !== 'undefined' &&
            typeof window.ReligionCommands.assignReligionToCharacter === 'function') {
            var result = window.ReligionCommands.assignReligionToCharacter(
                childId,
                inheritedReligion.id,
                {
                    year: resolvedYear,
                    reason: 'inheritance',
                    notes: 'Inherited from ' + (source === 'both' ? 'both parents' :
                                                 source === 'mother' ? 'mother' :
                                                 source === 'father' ? 'father' :
                                                 'location\'s dominant religion'),
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

        // Fallback: direct assignment (Phase 3 will remove this path)
        if (!child.religionHistory) {
            child.religionHistory = [];
        }

        child.religionHistory.push({
            id: 'inherit_' + Date.now(),
            characterId: childId,
            fromReligionId: null,
            fromReligionName: 'None',
            toReligionId: inheritedReligion.id,
            toReligionName: inheritedReligion.name,
            year: resolvedYear,
            reason: 'inheritance',
            notes: 'Inherited from ' + (source === 'both' ? 'both parents' :
                                         source === 'mother' ? 'mother' :
                                         source === 'father' ? 'father' :
                                         'location\'s dominant religion'),
            inherited: true,
            inheritedFrom: source,
            timestamp: Date.now()
        });

        child.religionId = inheritedReligion.id;

        if (typeof window.saveMasterData === 'function') {
            window.saveMasterData();
        }

        return {
            success: true,
            inherited: true,
            religion: inheritedReligion,
            source: source,
            data: child,
            reason: 'Religion inherited successfully'
        };
    }

    // =========================================================================
    // 8. INHERITANCE STATISTICS
    // =========================================================================

    function getInheritanceStatistics(religionId) {
        var RULES = _rules();
        var religion = _getReligion(religionId);
        if (!religion) return null;

        var rule = religion.inheritanceRule || { type: RULES.MOTHER };

        return {
            religionId: religion.id,
            religionName: religion.name,
            ruleType: rule.type,
            ruleName: getInheritanceRuleName(rule.type),
            priority: rule.priority !== undefined && rule.priority !== null ? rule.priority : null,
            priorityName: rule.priority ? getInheritanceRuleName(rule.priority) : null,
            followerCount: _getFollowerCount(religionId),
            hasChildren: true
        };
    }

    function getAllInheritanceSummaries() {
        var allReligions = _getAllReligions({ includeDeprecated: false });
        var summaries = [];

        for (var i = 0; i < allReligions.length; i++) {
            var summary = getInheritanceSummary(allReligions[i].id);
            if (summary) {
                summaries.push(summary);
            }
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

        // Constants reference (delegates to ReligionConstants on access)
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
