/**
 * =============================================================================
 * STILL WATERS - RELIGION INHERITANCE (religion-inheritance.js)
 * =============================================================================
 *
 * LOCATION: js/core/religion/religion-inheritance.js
 *
 * Thin adapter between the pure inheritance rule engine and the command that
 * assigns religion to a character.
 *
 * This module is NOT a domain layer. It is orchestration + one observer
 * function. The actual algorithm lives in ReligionRules.resolveInheritance.
 * The actual assignment lives in ReligionCommands.assignReligionToCharacter.
 *
 * It owns:
 *   - inheritReligionForChild: fetch child → call rules → call commands
 *   - getInheritanceSource:    given a child's religion and their parents,
 *                              report where it came from (post-hoc observer)
 *
 * It does NOT own:
 *   - the inheritance algorithm           (ReligionRules.resolveInheritance)
 *   - the assignment mutation             (ReligionCommands.assignReligionToCharacter)
 *   - display names                       (ReligionFormat)
 *   - inheritance summaries/statistics    (ReligionQueries)
 *   - display of inheritance rules        (ReligionViewModels)
 *
 * PUBLIC API
 * ----------
 *   getInheritedReligion(childId, motherId, fatherId, locationId)
 *       Returns { religionId, source, rule }. No mutation. Delegates to
 *       ReligionRules.resolveInheritanceForChild. Despite the name, it does
 *       NOT return a religion object — it returns the resolution verdict.
 *       Callers who want the religion object should look up religionId.
 *
 *   inheritReligionForChild(childId, motherId, fatherId, locationId, options?)
 *       Resolves, then assigns via ReligionCommands. Returns:
 *         {
 *           success: boolean,
 *           inherited: boolean,           // true if assignment happened
 *           religion: object | null,      // the religion that was assigned
 *           source: 'mother' | 'father' | 'both' | 'location' | null,
 *           rule: 'mother' | 'father' | 'both' | 'dominant' | 'none',
 *           data: object | null,          // commands' result data
 *           reason: string
 *         }
 *
 *   getInheritanceSource(motherId, fatherId, inheritedReligionId)
 *       Post-hoc observer. Answers "given the parents' current religions and
 *       a resulting religion, which parent did the child inherit from?"
 *       Returns 'mother' | 'father' | 'both' | 'location' | null.
 *       Distinct from the rule engine: the engine answers "what should the
 *       child inherit?" — this function answers "given what actually
 *       happened, where did it come from?"
 *
 * DEPENDENCIES:
 *   - religion-rules.js:    ReligionRules
 *   - religion-queries.js:  ReligionQueries
 *   - religion-commands.js: ReligionCommands
 *   - accessors.js:         getCharacterById
 *
 * ICON POLICY: No emojis. No icons in confirm/cancel buttons.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Phase 0: removed recursion guard, fixed year-zero bug.
 *   Phase 2: display names delegated to ReligionFormat.
 *   Phase 3: removed direct character mutation; removed local
 *            _getDominantReligion fallback.
 *   Phase 5: rule logic moved to ReligionRules; this file became a thin
 *            adapter.
 *   Phase 6: deleted getInheritanceSummary/Description/RuleName wrappers
 *            (moved to ReligionQueries / ReligionFormat). Deleted the
 *            exported _sourcePhrase surface (inlined use).
 *   Phase 7 (current): converge to the reference pattern.
 *     - Header documents role as thin adapter + observer.
 *     - Return shapes documented.
 *     - Load-time verification.
 *     - No behavioural change.
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
     *
     * Returns { religionId, source, rule }. No mutation. Pure delegation to
     * ReligionRules.resolveInheritanceForChild, which reads Queries to build
     * the facts and then calls the pure engine.
     *
     * Despite the name, this does not return a religion object — it returns
     * the resolution verdict. Callers who want the religion object should
     * look up `religionId` via ReligionQueries.getReligion.
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
     *     inherited: boolean,      // true if assignment happened
     *     religion: object|null,   // the religion that was assigned
     *     source: 'mother'|'father'|'both'|'location'|null,
     *     rule: 'mother'|'father'|'both'|'dominant'|'none',
     *     data: object|null,       // commands' result data
     *     reason: string
     *   }
     *
     * This function does not save. It calls ReligionCommands, which marks
     * data dirty but does not persist. The caller (usually the birth/adoption
     * command in the children domain, or a modal) is responsible for calling
     * ReligionCommands.persist() once at the end of the batch.
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

    /**
     * Human-readable phrase for an inheritance source.
     *
     * This is not a display label (those live in ReligionFormat). It is a
     * note fragment inserted into a conversion event's `notes` field. The
     * distinction matters: display labels are presentation, this is stored
     * data. If the note text needs to change, it changes here; if the display
     * label needs to change, it changes in ReligionFormat.
     */
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
    // 4. PROVENANCE HELPER (post-hoc observer)
    // =========================================================================
    //
    // Answers "given the current state of the parents and a resulting religion,
    // where did it come from?" Distinct from the rule engine, which answers
    // "what should the child inherit?" This function is a post-hoc observer:
    // it reads the current parent state and reports what it sees.
    //
    // Post-hoc means: if a parent's religion changed after the child was
    // assigned, this function will report the current state, not the state
    // at assignment time. If you need the state at assignment time, read the
    // child's religionHistory event instead.

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
    // 5. LOAD-TIME VERIFICATION
    // =========================================================================

    (function _verifyLoadTimeDependencies() {
        if (!window.ReligionRules) {
            throw new Error(
                'religion-inheritance.js loaded but window.ReligionRules is missing. ' +
                'Check script tag order (religion-rules.js must load first).'
            );
        }
        if (!window.ReligionQueries) {
            throw new Error(
                'religion-inheritance.js loaded but window.ReligionQueries is missing. ' +
                'Check script tag order (religion-queries.js must load first).'
            );
        }
        if (!window.ReligionCommands) {
            throw new Error(
                'religion-inheritance.js loaded but window.ReligionCommands is missing. ' +
                'Check script tag order (religion-commands.js must load first).'
            );
        }
        if (typeof window.getCharacterById !== 'function') {
            throw new Error(
                'religion-inheritance.js loaded but window.getCharacterById is missing. ' +
                'Check script tag order (accessors.js must load first).'
            );
        }
    })();

    // =========================================================================
    // 6. EXPORTS
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
