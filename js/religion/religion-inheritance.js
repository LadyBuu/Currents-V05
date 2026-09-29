/**
 * =============================================================================
 * STILL WATERS - RELIGION INHERITANCE (religion-inheritance.js)
 * =============================================================================
 * 
 * LOCATION: js/core/religion/religion-inheritance.js
 * 
 * Adapter around ReligionRules.resolveInheritance.
 * 
 * This module:
 *   - Fetches inheritance facts via ReligionQueries
 *   - Calls the pure rule engine (ReligionRules.resolveInheritance)
 *   - Delegates character assignment to ReligionCommands
 * 
 * This module does NOT contain rule logic. The rule matrix lives in
 * ReligionRules and is unit-tested there. This module is the concrete
 * adapter between "I have character and location IDs" and "I have a
 * verdict and an assignment."
 * 
 * DEPENDENCIES:
 *   - religion-rules.js: ReligionRules
 *   - religion-queries.js: ReligionQueries
 *   - religion-commands.js: ReligionCommands
 *   - religion-format.js: ReligionFormat
 *   - accessors.js: getCharacterById
 * 
 * ICON POLICY: No emojis. No icons in confirm/cancel buttons.
 * 
 * =============================================================================
 * PHASE 0 STABILISATION (2026):
 *   - Removed _processingInheritance re-entry guard.
 *   - Fixed year-zero bug.
 * 
 * PHASE 2 VOCABULARY CONSOLIDATION (2026):
 *   - Delegated to ReligionFormat for display names.
 * 
 * PHASE 3 BOUNDARY RESTRUCTURE (2026):
 *   - Removed direct character mutation. All assignment goes through
 *     ReligionCommands.
 *   - Removed local _getDominantReligion fallback.
 * 
 * PHASE 5 DOMAIN RULES AND VALIDATION EXTRACTION (2026):
 *   - Deleted _applyInheritanceRules, _applyRule, and the one-parent and
 *     both-parent resolution logic. Those are the rule engine and now live
 *     in ReligionRules.resolveInheritance.
 *   - Deleted local INHERITANCE_RULES accessor (was cached at first use).
 *     This module no longer needs the constants directly.
 *   - This module is now a thin adapter: fetch facts → call rules →
 *     delegate assignment.
 *   - getInheritanceDescription, getInheritanceSummary remain for now;
 *     Phase 5 file 4 moves them to ReligionQueries.
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY RESOLUTION
    // =========================================================================

    function _rules() {
        if (typeof window.ReligionRules === 'undefined') {
            throw new Error('ReligionInheritance requires ReligionRules.');
        }
        return window.ReligionRules;
    }

    function _queries() {
        if (typeof window.ReligionQueries === 'undefined') {
            throw new Error('ReligionInheritance requires ReligionQueries.');
        }
        return window.ReligionQueries;
    }

    function _commands() {
        if (typeof window.ReligionCommands === 'undefined') {
            throw new Error('ReligionInheritance requires ReligionCommands.');
        }
        return window.ReligionCommands;
    }

    function _format() {
        if (typeof window.ReligionFormat === 'undefined') {
            throw new Error('ReligionInheritance requires ReligionFormat.');
        }
        return window.ReligionFormat;
    }

    function _getCharacterById(id) {
        if (typeof window.getCharacterById !== 'function') {
            throw new Error('ReligionInheritance requires accessors.getCharacterById.');
        }
        return window.getCharacterById(id);
    }

    // =========================================================================
    // 2. FACT GATHERING
    // =========================================================================

    /**
     * Resolve inheritance for a child given parent and location IDs.
     * 
     * Returns the same shape as ReligionRules.resolveInheritance:
     *   { religionId, source, rule }
     * 
     * Callers who only want to know "what should this child inherit" use
     * this. Callers who want to assign it use inheritReligionForChild.
     */
    function getInheritedReligion(childId, motherId, fatherId, locationId) {
        // childId is accepted for API symmetry but not used by the rule
        // engine, which resolves purely from parent religions and location.
        return _rules().resolveInheritanceForChild(childId, motherId, fatherId, locationId);
    }

    // =========================================================================
    // 3. ASSIGNMENT
    // =========================================================================

    /**
     * Resolve inheritance and assign the result to the child via Commands.
     * 
     * Returns:
     *   {
     *     success: boolean,
     *     inherited: boolean,   // false when no religion resolves
     *     religion: object|null,
     *     source: 'mother'|'father'|'both'|'location'|null,
     *     rule: 'mother'|'father'|'both'|'dominant'|'none',
     *     data: object|null,    // command result payload
     *     reason: string
     *   }
     */
    function inheritReligionForChild(childId, motherId, fatherId, locationId, options) {
        options = options || {};

        var resolution = _rules().resolveInheritanceForChild(
            childId, motherId, fatherId, locationId
        );

        if (!resolution.religionId) {
            return {
                success: true,
                inherited: false,
                religion: null,
                source: null,
                rule: resolution.rule,
                data: null,
                reason: 'No religion to inherit'
            };
        }

        var child = _getCharacterById(childId);
        if (!child) {
            return {
                success: false,
                inherited: false,
                religion: null,
                source: resolution.source,
                rule: resolution.rule,
                data: null,
                reason: 'Child not found'
            };
        }

        var religion = _queries().getReligion(resolution.religionId);
        if (!religion) {
            return {
                success: false,
                inherited: false,
                religion: null,
                source: resolution.source,
                rule: resolution.rule,
                data: null,
                reason: 'Resolved religion not found'
            };
        }

        // Resolve year with explicit missing-value checks. Year 0 is valid.
        var resolvedYear;
        if (options.year !== undefined && options.year !== null) {
            resolvedYear = options.year;
        } else if (child.birthYear !== undefined && child.birthYear !== null) {
            resolvedYear = child.birthYear;
        } else {
            resolvedYear = 0;
        }

        var result = _commands().assignReligionToCharacter(
            childId,
            resolution.religionId,
            {
                year: resolvedYear,
                reason: 'inheritance',
                notes: 'Inherited from ' + _sourcePhrase(resolution.source),
                inherited: true,
                inheritedFrom: resolution.source
            }
        );

        return {
            success: result.success,
            inherited: result.success,
            religion: religion,
            source: resolution.source,
            rule: resolution.rule,
            data: result.data,
            reason: result.reason
        };
    }

    function _sourcePhrase(source) {
        switch (source) {
            case 'both': return 'both parents';
            case 'mother': return 'mother';
            case 'father': return 'father';
            case 'location': return 'location\'s dominant religion';
            default: return 'unknown source';
        }
    }

    // =========================================================================
    // 4. FORMATTING (delegates to ReligionFormat)
    // =========================================================================

    function getInheritanceRuleName(ruleType) {
        return _format().getInheritanceRuleName(ruleType);
    }

    function getInheritanceSource(motherId, fatherId, inheritedReligionId) {
        // Provenance helper for callers who only have IDs, not the resolution.
        // Returns 'mother', 'father', 'both', or 'location'. Does not consult
        // the rule engine because it is answering a purely observational
        // question about the current state of the parents.
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

    // =========================================================================
    // 5. SUMMARY HELPERS (moving to ReligionQueries in file 4)
    // =========================================================================

    function getInheritanceDescription(religionId) {
        var religion = _queries().getReligion(religionId);
        if (!religion) return 'No inheritance rules set';

        var rule = religion.inheritanceRule || { type: 'mother' };
        var ruleName = getInheritanceRuleName(rule.type);

        if (rule.type === 'both' && rule.priority) {
            var priorityName = getInheritanceRuleName(rule.priority);
            return ruleName + ' (priority: ' + priorityName + ')';
        }

        return ruleName;
    }

    function getInheritanceSummary(religionId) {
        var religion = _queries().getReligion(religionId);
        if (!religion) return null;

        var rule = religion.inheritanceRule || { type: 'mother' };

        return {
            religionId: religion.id,
            religionName: religion.name,
            ruleType: rule.type,
            ruleName: getInheritanceRuleName(rule.type),
            priority: (rule.priority !== undefined && rule.priority !== null) ? rule.priority : null,
            priorityName: rule.priority ? getInheritanceRuleName(rule.priority) : null,
            notes: rule.notes || '',
            description: getInheritanceDescription(religionId)
        };
    }

    // =========================================================================
    // 6. EXPORTS
    // =========================================================================

    window.ReligionInheritance = {
        // Core
        getInheritedReligion: getInheritedReligion,
        inheritReligionForChild: inheritReligionForChild,

        // Provenance
        getInheritanceSource: getInheritanceSource,

        // Formatting (delegates to ReligionFormat)
        getInheritanceRuleName: getInheritanceRuleName,

        // Summaries (moving to ReligionQueries in file 4)
        getInheritanceDescription: getInheritanceDescription,
        getInheritanceSummary: getInheritanceSummary
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { ReligionInheritance: window.ReligionInheritance };
    }

})();
