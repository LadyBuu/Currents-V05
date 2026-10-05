/**
 * STILL WATERS - EDUCATION RULES
 * Pure policy: level thresholds, literacy, graduation eligibility, learning
 * calculation. No state, no persistence, no I/O, no randomness.
 * Callers own side effects.
 *
 * CONTRACT
 *
 *   - Every function is deterministic.
 *   - No fallbacks. Missing constants throw at load.
 *   - Input coercion is explicit and documented. Silent coercion is avoided
 *     except where documented.
 *   - progressKeyFor is the single source of truth for the subject/key
 *     convention. No other module may reconstruct the key inline.
 *
 * LITERACY
 *
 *   The threshold is BASIC.literacy (30). Two predicates interpret it:
 *
 *     isLiterateAtLevel(level)             — boolean, level >= threshold.
 *                                            Used by writers to decide when to
 *                                            flip character.isLiterate.
 *     getEducationLevelForLiteracy(level)  — classification. Returns the
 *                                            highest level whose threshold is
 *                                            met. Used for display and for
 *                                            eligible-student projections.
 *
 *   Any non-numeric input is treated as 0 by both predicates.
 *
 * GRADUATION
 *
 *   isGraduationEligible is the only implementation of graduation readiness.
 *   It requires requiredYears completed AND every curriculum item at or
 *   above GRADUATION_PROFICIENCY (90). EducationCommands.graduateStudent
 *   caps the character's curriculum proficiencies at MAX_PROFICIENCY (100)
 *   at the moment of graduation.
 */

(function() {
    'use strict';

    var LEVELS = window.EDUCATION_LEVELS;
    if (!LEVELS) {
        throw new Error('education-rules.js requires education-constants.js (EDUCATION_LEVELS)');
    }

    var LITERACY_THRESHOLD = LEVELS.BASIC.literacy; // 30
    var GRADUATION_PROFICIENCY = 90;
    var MAX_PROFICIENCY = 100;
    var LITERACY_SUBJECT_ID = 'literacy';

    // Level lookup ordered by literacy threshold ascending. Built once.
    var _levelsOrdered = (function() {
        var arr = [];
        for (var k in LEVELS) {
            if (Object.prototype.hasOwnProperty.call(LEVELS, k)) {
                arr.push(LEVELS[k]);
            }
        }
        arr.sort(function(a, b) { return a.literacy - b.literacy; });
        return arr;
    })();

    // =========================================================================
    // 1. LEVEL CLASSIFICATION
    // =========================================================================

    /**
     * Highest education level whose literacy threshold is met.
     *
     * Threshold-based, not dependent on object property order. Any non-numeric
     * input is treated as 0. Returns the ILLITERATE level for input below the
     * BASIC threshold.
     */
    function getEducationLevelForLiteracy(literacyLevel) {
        var literacy = (typeof literacyLevel === 'number' && isFinite(literacyLevel))
            ? literacyLevel
            : 0;
        var highest = LEVELS.ILLITERATE;
        for (var i = 0; i < _levelsOrdered.length; i++) {
            if (literacy >= _levelsOrdered[i].literacy) {
                highest = _levelsOrdered[i];
            }
        }
        return highest;
    }

    /**
     * Canonical literacy predicate. Literacy subject level is the source of
     * truth. character.isLiterate is a materialized cache, kept in sync by
     * EducationCommands.advanceLearning; it is not consulted here.
     *
     * Any non-numeric input is treated as 0.
     */
    function isLiterateAtLevel(literacyLevel) {
        var literacy = (typeof literacyLevel === 'number' && isFinite(literacyLevel))
            ? literacyLevel
            : 0;
        return literacy >= LITERACY_THRESHOLD;
    }

    // =========================================================================
    // 2. LEARNING CALCULATION
    // =========================================================================

    /**
     * Compute a new proficiency value from a current value and a progress
     * amount. Validates inputs. Does not mutate.
     *
     * @throws {Error} if currentLevel is negative, non-finite, or not a number
     * @throws {Error} if progress is negative, non-finite, or not a number
     */
    function calculateLearningResult(currentLevel, progress) {
        if (typeof currentLevel !== 'number' || !isFinite(currentLevel)) {
            throw new Error(
                'calculateLearningResult: currentLevel must be a finite number'
            );
        }
        if (currentLevel < 0) {
            throw new Error(
                'calculateLearningResult: currentLevel must be non-negative'
            );
        }
        if (typeof progress !== 'number' || !isFinite(progress)) {
            throw new Error(
                'calculateLearningResult: progress must be a finite number'
            );
        }
        if (progress < 0) {
            throw new Error(
                'calculateLearningResult: progress must be non-negative'
            );
        }
        var clamped = Math.min(MAX_PROFICIENCY, currentLevel + progress);
        return {
            oldLevel: currentLevel,
            newLevel: clamped,
            increased: clamped - currentLevel
        };
    }

    // =========================================================================
    // 3. GRADUATION ELIGIBILITY
    // =========================================================================

    /**
     * Whether a character meets all requirements to graduate from an
     * institution. Caller supplies current proficiencies as a lookup:
     * { [subjectKey]: level }.
     *
     * @param {Object} params
     * @param {number} params.yearsEnrolled
     * @param {number} params.requiredYears
     * @param {Array}  params.curriculum      Curriculum items from the institution.
     * @param {Object} params.proficiencyByKey Map of subjectProgress keys to levels.
     *
     * @returns {{ eligible: boolean, missing: Array<string>, reason: string|null }}
     *   reason is 'insufficient_years' or 'insufficient_proficiency' when not
     *   eligible, otherwise null. missing is an array of curriculum item ids
     *   that fell below GRADUATION_PROFICIENCY, or [] if the shortfall was
     *   years alone.
     */
    function isGraduationEligible(params) {
        var yearsEnrolled = params.yearsEnrolled;
        var requiredYears = params.requiredYears;
        var curriculum = params.curriculum || [];
        var proficiency = params.proficiencyByKey || {};

        if (yearsEnrolled < requiredYears) {
            return {
                eligible: false,
                missing: [],
                reason: 'insufficient_years'
            };
        }

        var missing = [];
        for (var i = 0; i < curriculum.length; i++) {
            var item = curriculum[i];
            if (!item || !item.id || !item.type) {
                // Malformed curriculum item. Treat as unmet rather than skip.
                missing.push(item && item.id ? item.id : '(malformed)');
                continue;
            }
            var key = progressKeyFor(item);
            var level = proficiency[key] || 0;
            if (level < GRADUATION_PROFICIENCY) {
                missing.push(item.id);
            }
        }

        if (missing.length > 0) {
            return {
                eligible: false,
                missing: missing,
                reason: 'insufficient_proficiency'
            };
        }

        return { eligible: true, missing: [], reason: null };
    }

    // =========================================================================
    // 4. SUBJECT KEY CONVENTION
    // =========================================================================

    /**
     * Progress key for a curriculum item. Central so every module agrees.
     * Subject keys are the bare subject id. Role keys are prefixed with
     * 'role_'. This is the only place the convention is defined.
     *
     * @throws {Error} if curriculumItem is null/undefined or lacks id/type
     */
    function progressKeyFor(curriculumItem) {
        if (!curriculumItem) {
            throw new Error('progressKeyFor: curriculumItem is required');
        }
        if (!curriculumItem.id || !curriculumItem.type) {
            throw new Error('progressKeyFor: curriculumItem requires id and type');
        }
        return curriculumItem.type === 'role'
            ? 'role_' + curriculumItem.id
            : curriculumItem.id;
    }

    // =========================================================================
    // 5. EXPORTS
    // =========================================================================

    window.EducationRules = {
        LITERACY_THRESHOLD: LITERACY_THRESHOLD,
        GRADUATION_PROFICIENCY: GRADUATION_PROFICIENCY,
        MAX_PROFICIENCY: MAX_PROFICIENCY,
        LITERACY_SUBJECT_ID: LITERACY_SUBJECT_ID,

        getEducationLevelForLiteracy: getEducationLevelForLiteracy,
        isLiterateAtLevel: isLiterateAtLevel,
        calculateLearningResult: calculateLearningResult,
        isGraduationEligible: isGraduationEligible,
        progressKeyFor: progressKeyFor
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.EducationRules;
    }
})();