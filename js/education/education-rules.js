/**
 * STILL WATERS - EDUCATION RULES
 * Pure policy: level thresholds, literacy, graduation eligibility, learning
 * calculation. No state, no persistence, no I/O. Callers own side effects.
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
            if (LEVELS.hasOwnProperty(k)) arr.push(LEVELS[k]);
        }
        arr.sort(function(a, b) { return a.literacy - b.literacy; });
        return arr;
    })();

    /**
     * Highest education level whose literacy threshold is met.
     * Threshold-based, not dependent on object property order.
     */
    function getEducationLevelForLiteracy(literacyLevel) {
        var literacy = literacyLevel || 0;
        var highest = LEVELS.ILLITERATE;
        for (var i = 0; i < _levelsOrdered.length; i++) {
            if (literacy >= _levelsOrdered[i].literacy) {
                highest = _levelsOrdered[i];
            }
        }
        return highest;
    }

    /**
     * Canonical literacy predicate. Literacy subject level is the source of truth.
     * `character.isLiterate` is a materialized milestone and must be kept in
     * sync by the Command that advances literacy; it is not consulted here.
     */
    function isLiterateAtLevel(literacyLevel) {
        return (literacyLevel || 0) >= LITERACY_THRESHOLD;
    }

    /**
     * Compute a new proficiency value from a current value and a progress amount.
     * Validates progress. Does not mutate.
     */
    function calculateLearningResult(currentLevel, progress) {
        if (typeof currentLevel !== 'number' || !isFinite(currentLevel) || currentLevel < 0) {
            throw new Error('calculateLearningResult: currentLevel must be a non-negative finite number');
        }
        if (typeof progress !== 'number' || !isFinite(progress) || progress < 0) {
            throw new Error('calculateLearningResult: progress must be a non-negative finite number');
        }
        var clamped = Math.min(MAX_PROFICIENCY, currentLevel + progress);
        return {
            oldLevel: currentLevel,
            newLevel: clamped,
            increased: clamped - currentLevel
        };
    }

    /**
     * Whether a character meets all requirements to graduate from an institution.
     * Caller supplies current proficiencies as a lookup: { [subjectId]: level }.
     *
     * @param {Object} params
     * @param {number} params.yearsEnrolled
     * @param {number} params.requiredYears
     * @param {Array}  params.curriculum      - Curriculum items from the institution.
     * @param {Object} params.proficiencyByKey - Map of subjectProgress keys to levels.
     * @returns {{ eligible: boolean, missing: Array<string>, reason: string|null }}
     */
    function isGraduationEligible(params) {
        var yearsEnrolled = params.yearsEnrolled;
        var requiredYears = params.requiredYears;
        var curriculum = params.curriculum || [];
        var proficiency = params.proficiencyByKey || {};

        if (yearsEnrolled < requiredYears) {
            return { eligible: false, missing: [], reason: 'insufficient_years' };
        }

        var missing = [];
        for (var i = 0; i < curriculum.length; i++) {
            var item = curriculum[i];
            var key = item.type === 'role' ? 'role_' + item.id : item.id;
            var level = proficiency[key] || 0;
            if (level < GRADUATION_PROFICIENCY) {
                missing.push(item.id);
            }
        }

        if (missing.length > 0) {
            return { eligible: false, missing: missing, reason: 'insufficient_proficiency' };
        }

        return { eligible: true, missing: [], reason: null };
    }

    /**
     * Progress key for a curriculum item. Central so every module agrees.
     */
    function progressKeyFor(curriculumItem) {
        if (!curriculumItem) {
            throw new Error('progressKeyFor: curriculumItem is required');
        }
        return curriculumItem.type === 'role'
            ? 'role_' + curriculumItem.id
            : curriculumItem.id;
    }

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
