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
 *   - accessors.js: getCharacterById
 * 
 * ICON POLICY: No emojis. No icons in confirm/cancel buttons.
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARD
    // =========================================================================

    var _processingInheritance = false;

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
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

        // Fallback: find dominant manually
        if (!locationId) return null;

        var allReligions = _getAllReligions({ includeDeprecated: false });
        var maxCount = 0;
        var dominant = null;

        for (var i = 0; i < allReligions.length; i++) {
            var religion = allReligions[i];
            var count = 0;

            // Count followers at this location
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
    // 3. INHERITANCE RULES REFERENCE
    // =========================================================================

    var INHERITANCE_RULES = window.INHERITANCE_RULES || {
        MOTHER: 'mother',
        FATHER: 'father',
        BOTH: 'both',
        DOMINANT: 'dominant',
        NONE: 'none'
    };

    // =========================================================================
    // 4. CORE INHERITANCE FUNCTION
    // =========================================================================

    function getInheritedReligion(childId, motherId, fatherId, locationId) {
        if (_processingInheritance) return null;
        _processingInheritance = true;

        try {
            // Get child's current religion (if any)
            var child = _getCharacterById(childId);

            // Get mother and father
            var mother = motherId ? _getCharacterById(motherId) : null;
            var father = fatherId ? _getCharacterById(fatherId) : null;

            // Get their religions
            var motherReligion = mother && mother.religionId ? _getReligion(mother.religionId) : null;
            var fatherReligion = father && father.religionId ? _getReligion(father.religionId) : null;

            // If no parents have religions, check location
            if (!motherReligion && !fatherReligion) {
                // Check if location has a dominant religion
                if (locationId) {
                    var dominant = _getDominantReligion(locationId);
                    if (dominant && !dominant.isDeprecated) {
                        return dominant;
                    }
                }
                return null;
            }

            // Determine which parent's religion to use for inheritance rule
            // If only one parent has a religion, use that one
            if (motherReligion && !fatherReligion) {
                var motherRule = motherReligion.inheritanceRule || { type: INHERITANCE_RULES.MOTHER };
                if (motherRule.type === INHERITANCE_RULES.NONE) {
                    // Check location as fallback
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

            if (fatherReligion && !motherReligion) {
                var fatherRule = fatherReligion.inheritanceRule || { type: INHERITANCE_RULES.FATHER };
                if (fatherRule.type === INHERITANCE_RULES.NONE) {
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
            var result = _applyInheritanceRules(
                motherReligion,
                fatherReligion,
                locationId
            );

            return result;

        } finally {
            _processingInheritance = false;
        }
    }

    // =========================================================================
    // 5. INHERITANCE RULE APPLICATION
    // =========================================================================

    function _applyInheritanceRules(motherReligion, fatherReligion, locationId) {
        // Get the inheritance rules from both religions
        var motherRule = motherReligion.inheritanceRule || { type: INHERITANCE_RULES.MOTHER };
        var fatherRule = fatherReligion.inheritanceRule || { type: INHERITANCE_RULES.FATHER };

        // If both religions have the same rule type, follow it
        if (motherRule.type === fatherRule.type) {
            return _applyRule(motherReligion, fatherReligion, motherRule.type, locationId);
        }

        // Different rules - check which one to follow
        // Priority: Mother's rule takes precedence (historical default)
        // But we check if either rule is NONE first
        if (motherRule.type === INHERITANCE_RULES.NONE) {
            // Mother says no inheritance - check father
            if (fatherRule.type === INHERITANCE_RULES.NONE) {
                // Both say none - check location
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

        if (fatherRule.type === INHERITANCE_RULES.NONE) {
            // Father says none - use mother's rule
            return _applyRule(motherReligion, fatherReligion, motherRule.type, locationId);
        }

        // Different non-NONE rules - use mother's rule as tiebreaker
        return _applyRule(motherReligion, fatherReligion, motherRule.type, locationId);
    }

    // =========================================================================
    // 6. RULE EXECUTION
    // =========================================================================

    function _applyRule(motherReligion, fatherReligion, ruleType, locationId) {
        switch (ruleType) {
            case INHERITANCE_RULES.MOTHER:
                return motherReligion;

            case INHERITANCE_RULES.FATHER:
                return fatherReligion;

            case INHERITANCE_RULES.BOTH:
                // If both parents have same religion, use it
                if (motherReligion.id === fatherReligion.id) {
                    return motherReligion;
                }

                // Different religions - check priority
                var motherRule = motherReligion.inheritanceRule || { priority: INHERITANCE_RULES.MOTHER };
                var fatherRule = fatherReligion.inheritanceRule || { priority: INHERITANCE_RULES.FATHER };

                var priority = motherRule.priority || INHERITANCE_RULES.MOTHER;
                if (priority === INHERITANCE_RULES.MOTHER) {
                    return motherReligion;
                } else if (priority === INHERITANCE_RULES.FATHER) {
                    return fatherReligion;
                }

                // Default to mother
                return motherReligion;

            case INHERITANCE_RULES.DOMINANT:
                if (locationId) {
                    var dominant = _getDominantReligion(locationId);
                    if (dominant && !dominant.isDeprecated) {
                        return dominant;
                    }
                }
                // Fallback to mother if no dominant
                return motherReligion;

            case INHERITANCE_RULES.NONE:
            default:
                return null;
        }
    }

    // =========================================================================
    // 7. HELPER FUNCTIONS
    // =========================================================================

    function getInheritanceRuleName(ruleType) {
        var names = {
            'mother': 'Mother\'s Religion',
            'father': 'Father\'s Religion',
            'both': 'Both Parents (if same)',
            'dominant': 'Location\'s Dominant Religion',
            'none': 'No Inheritance'
        };
        return names[ruleType] || ruleType;
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
        var religion = _getReligion(religionId);
        if (!religion) return 'No inheritance rules set';

        var rule = religion.inheritanceRule || { type: INHERITANCE_RULES.MOTHER };
        var ruleName = getInheritanceRuleName(rule.type);

        if (rule.type === INHERITANCE_RULES.BOTH && rule.priority) {
            var priorityName = getInheritanceRuleName(rule.priority);
            return ruleName + ' (priority: ' + priorityName + ')';
        }

        return ruleName;
    }

    function getInheritanceSummary(religionId) {
        var religion = _getReligion(religionId);
        if (!religion) return null;

        var rule = religion.inheritanceRule || { type: INHERITANCE_RULES.MOTHER };

        return {
            religionId: religion.id,
            religionName: religion.name,
            ruleType: rule.type,
            ruleName: getInheritanceRuleName(rule.type),
            priority: rule.priority || null,
            priorityName: rule.priority ? getInheritanceRuleName(rule.priority) : null,
            notes: rule.notes || '',
            description: getInheritanceDescription(religionId)
        };
    }

    // =========================================================================
    // 8. BATCH INHERITANCE (For children system)
    // =========================================================================

    function inheritReligionForChild(childId, motherId, fatherId, locationId, options) {
        if (_processingInheritance) return null;
        _processingInheritance = true;

        try {
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

            // Assign the religion to the child
            if (typeof window.ReligionCommands !== 'undefined' &&
                typeof window.ReligionCommands.assignReligionToCharacter === 'function') {
                var source = getInheritanceSource(motherId, fatherId, inheritedReligion.id);

                var result = window.ReligionCommands.assignReligionToCharacter(
                    childId,
                    inheritedReligion.id,
                    {
                        year: optionsObj.year || (child.birthYear || 0),
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

            // Fallback: direct assignment
            if (!child.religionHistory) {
                child.religionHistory = [];
            }

            var source = getInheritanceSource(motherId, fatherId, inheritedReligion.id);

            child.religionHistory.push({
                id: 'inherit_' + Date.now(),
                characterId: childId,
                fromReligionId: null,
                fromReligionName: 'None',
                toReligionId: inheritedReligion.id,
                toReligionName: inheritedReligion.name,
                year: optionsObj.year || (child.birthYear || 0),
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

        } catch (e) {
            return {
                success: false,
                inherited: false,
                reason: e.message || 'Unknown error'
            };
        } finally {
            _processingInheritance = false;
        }
    }

    // =========================================================================
    // 9. INHERITANCE STATISTICS
    // =========================================================================

    function getInheritanceStatistics(religionId) {
        if (_processingInheritance) return null;
        _processingInheritance = true;

        try {
            var religion = _getReligion(religionId);
            if (!religion) return null;

            var rule = religion.inheritanceRule || { type: INHERITANCE_RULES.MOTHER };

            return {
                religionId: religion.id,
                religionName: religion.name,
                ruleType: rule.type,
                ruleName: getInheritanceRuleName(rule.type),
                priority: rule.priority || null,
                priorityName: rule.priority ? getInheritanceRuleName(rule.priority) : null,
                followerCount: _getFollowerCount(religionId),
                hasChildren: true
            };
        } finally {
            _processingInheritance = false;
        }
    }

    function getAllInheritanceSummaries() {
        if (_processingInheritance) return [];
        _processingInheritance = true;

        try {
            var allReligions = _getAllReligions({ includeDeprecated: false });
            var summaries = [];

            for (var i = 0; i < allReligions.length; i++) {
                var summary = getInheritanceSummary(allReligions[i].id);
                if (summary) {
                    summaries.push(summary);
                }
            }

            return summaries;
        } finally {
            _processingInheritance = false;
        }
    }

    // =========================================================================
    // 10. EXPORTS
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

        // Constants reference
        INHERITANCE_RULES: INHERITANCE_RULES
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            ReligionInheritance: window.ReligionInheritance
        };
    }

})();