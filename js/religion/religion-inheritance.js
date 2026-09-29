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
 * DEPENDENCIES:
 *   - religion-rules.js: ReligionRules
 *   - religion-queries.js: ReligionQueries
 *   - religion-commands.js: ReligionCommands
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
 *   - Delegated display names to ReligionFormat.
 * 
 * PHASE 3 BOUNDARY RESTRUCTURE (2026):
 *   - Removed direct character mutation.
 *   - Removed local _getDominantReligion fallback.
 * 
 * PHASE 5 DOMAIN RULES AND VALIDATION EXTRACTION (2026):
 *   - Rule logic moved to ReligionRules.resolveInheritance.
 *   - This file became a thin adapter.
 * 
 * PHASE 6 CLEANUP (2026):
 *   - Deleted getInheritanceSummary and getInheritanceDescription wrappers.
 *     ReligionQueries owns inheritance summaries and descriptions now.
 *   - Deleted getInheritanceRuleName wrapper. ReligionFormat owns display
 *     names.
 *   - Deleted the module-private _sourcePhrase helper's export surface
 *     dependency by inlining its use. Only inheritReligionForChild uses it.
 *   - This file is now: fetch facts → call rules → delegate assignment.
 *     Nothing else.
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

    function _getCharacterById(id) {
        if (typeof window.getCharacterById !== 'function') {
            throw new Error('ReligionInheritance requires accessors.getCharacterById.');
        }
        return window.getCharacterById(id);
    }

    // =========================================================================
    // 2. RESOLUTION (delegates to rules)
    // =========================================================================

    /**
     * Resolve the inherited religion for a child.
     * Returns: { religionId, source, rule }
     * 
     * Callers who only want to know what the child should inherit use this.
     * Callers who want to assign it use inheritReligionForChild.
     */
    function getInheritedReligion(childId, motherId, fatherId, locationId) {
        return _rules().resolveInheritanceForChild(childId, motherId, fatherId, locationId);
    }

    // =========================================================================
    // 3. ASSIGNMENT (delegates to commands)
    // =========================================================================

    /**
     * Resolve inheritance and assign the result to the child via Commands.
     * 
     * Returns:
     *   {
     *     success: boolean,
     *     inherited: boolean,
     *     religion: object|null,
     *     source: 'mother'|'father'|'both'|'location'|null,
     *     rule: 'mother'|'father'|'both'|'dominant'|'none',
     *     data: object|null,
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

        // Year: explicit missing-value checks. Year 0 is valid.
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
    // 4. PROVENANCE HELPER
    // =========================================================================
    // Answers "given the current state of the parents and a resulting religion,
    // where did it come from?" Distinct from the rule engine, which answers
    // "what should the child inherit?" This function is a post-hoc observer.

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

    // =========================================================================
    // 5. EXPORTS
    // =========================================================================

    window.ReligionInheritance = {
        // Core adapter
        getInheritedReligion: getInheritedReligion,
        inheritReligionForChild: inheritReligionForChild,

        // Provenance
        getInheritanceSource: getInheritanceSource
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { ReligionInheritance: window.ReligionInheritance };
    }

})();
