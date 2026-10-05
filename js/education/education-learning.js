/**
 * STILL WATERS - EDUCATION LEARNING
 * Proficiency, literacy, and education level reads. Plus a single hydration
 * helper that routes every write through CharacterCommands.
 *
 * OWNERSHIP
 *
 *   Reads touch character fields directly because reads are free. Writes
 *   never touch character fields directly — they route through
 *   CharacterCommands:
 *
 *     ensureCharacterEducationRecord → CharacterCommands.initializeEducationContainers
 *
 *   If CharacterCommands is missing, ensureCharacterEducationRecord fails
 *   loudly. There is no degraded mode.
 *
 * LITERACY
 *
 *   character.isLiterate is a materialized flag with a single writer
 *   (CharacterCommands.setLiterate) and a single reader
 *   (CharacterCommands.isLiterate). education-learning.isLiterate delegates
 *   to that reader.
 *
 *   The threshold predicate lives in education-rules.isLiterateAtLevel. It is
 *   used by education-commands.advanceLearning to decide when to flip the
 *   flag, and nowhere else.
 *
 *   Two reads of the same fact, one writer. No drift.
 *
 * READS IN THIS MODULE
 *
 *   getProficiency, getSubjectProficiency, getCharacterProficiencies,
 *   getEducationLevel, isLiterate
 *
 * WRITES IN THIS MODULE
 *
 *   ensureCharacterEducationRecord (routed through CharacterCommands)
 *
 * DEPENDENCIES (required):
 *   - education-rules.js     (EducationRules)
 *   - accessors.js           (getCharacterById)
 *   - character-commands.js  (CharacterCommands) — write path and literacy
 * =============================================================================
 */

(function() {
    'use strict';

    var RULES = window.EducationRules;
    if (!RULES) {
        throw new Error('education-learning.js requires education-rules.js');
    }

    // =========================================================================
    // 1. DEPENDENCIES (no fallbacks)
    // =========================================================================

    function _getCharacterById(id) {
        if (typeof window.getCharacterById !== 'function') {
            throw new Error('education-learning.js requires getCharacterById');
        }
        return window.getCharacterById(id);
    }

    function _characterCommands() {
        if (typeof window.CharacterCommands === 'undefined') {
            throw new Error(
                'education-learning.js requires CharacterCommands to write ' +
                'character-owned education fields.'
            );
        }
        return window.CharacterCommands;
    }

    // =========================================================================
    // 2. HYDRATION (explicit; routed through CharacterCommands)
    // =========================================================================
    //
    // Ensures the character record has the canonical education fields:
    //
    //   character.subjectProgress   object
    //   character.isLiterate        boolean
    //   character.education         object
    //   character.educationHistory  array
    //
    // All four are created by CharacterCommands.initializeEducationContainers,
    // which is idempotent. Reads never call this. Only hydration and
    // enrolment paths call it.
    //
    // Returns { success, initialized?, reason? }.

    function ensureCharacterEducationRecord(character) {
        if (!character) {
            return { success: false, reason: 'Character is required.' };
        }
        if (typeof character.id !== 'string' || !character.id) {
            return { success: false, reason: 'Character has no id.' };
        }

        var needsSubjectProgress = !character.subjectProgress
            || typeof character.subjectProgress !== 'object';
        var needsIsLiterate = character.isLiterate === undefined;
        var needsEducation = !character.education
            || typeof character.education !== 'object';
        var needsEducationHistory = !Array.isArray(character.educationHistory);

        if (!needsSubjectProgress && !needsIsLiterate
            && !needsEducation && !needsEducationHistory) {
            return { success: true, initialized: false };
        }

        var result = _characterCommands().initializeEducationContainers(character.id);
        if (!result || result.success !== true) {
            return {
                success: false,
                reason: (result && result.reason)
                    || 'Failed to initialise education containers.'
            };
        }

        return { success: true, initialized: true };
    }

    // =========================================================================
    // 3. PROFICIENCY READS
    // =========================================================================

    /**
     * Get proficiency level for a curriculum item.
     * Returns 0 if the character has no record for that item.
     * Returns null if the character does not exist.
     */
    function getProficiency(characterId, curriculumItem) {
        var character = _getCharacterById(characterId);
        if (!character) return null;
        if (!character.subjectProgress) return 0;

        var key = RULES.progressKeyFor(curriculumItem);
        var record = character.subjectProgress[key];
        return record ? (record.level || 0) : 0;
    }

    /**
     * Get proficiency level by subject id. The id may be either a bare
     * subject id or a 'role_<roleId>' key.
     */
    function getSubjectProficiency(characterId, subjectId) {
        if (!subjectId || typeof subjectId !== 'string') {
            throw new Error('getSubjectProficiency: subjectId is required');
        }
        var isRole = subjectId.indexOf('role_') === 0;
        return getProficiency(characterId, {
            id: isRole ? subjectId.substring(5) : subjectId,
            type: isRole ? 'role' : 'subject'
        });
    }

    /**
     * Get all proficiencies for a character as structured records.
     * Does not resolve role names — that is a UI/projection concern.
     *
     * @returns {Array<{ id, type, roleId, level, lastStudied }>}
     */
    function getCharacterProficiencies(characterId) {
        var character = _getCharacterById(characterId);
        if (!character || !character.subjectProgress) return [];

        var out = [];
        for (var key in character.subjectProgress) {
            if (!character.subjectProgress.hasOwnProperty(key)) continue;
            var p = character.subjectProgress[key];
            out.push({
                id: key,
                type: p.type || 'subject',
                roleId: p.roleId || null,
                level: p.level || 0,
                lastStudied: p.lastStudied || null
            });
        }

        out.sort(function(a, b) { return b.level - a.level; });
        return out;
    }

    // =========================================================================
    // 4. CLASSIFICATION READS
    // =========================================================================

    /**
     * Get the education level for a character. Returns null if the character
     * does not exist.
     *
     * Derived classification. Reads the literacy proficiency level directly
     * and asks EducationRules for the highest level whose threshold is met.
     * This is a read of an education-owned field and does not touch
     * character.isLiterate.
     */
    function getEducationLevel(characterId) {
        var character = _getCharacterById(characterId);
        if (!character) return null;

        var literacy = 0;
        if (character.subjectProgress &&
            character.subjectProgress.literacy &&
            typeof character.subjectProgress.literacy.level === 'number') {
            literacy = character.subjectProgress.literacy.level;
        }

        return RULES.getEducationLevelForLiteracy(literacy);
    }

    /**
     * Canonical literacy predicate. Delegates to CharacterCommands.isLiterate,
     * which reads character.isLiterate. That flag is written by
     * CharacterCommands.setLiterate.
     *
     * Returns false if the character does not exist.
     */
    function isLiterate(characterId) {
        if (!characterId) return false;
        var character = _getCharacterById(characterId);
        if (!character) return false;
        return _characterCommands().isLiterate(characterId) === true;
    }

    // =========================================================================
    // 5. EXPORTS
    // =========================================================================

    window.EducationLearning = {
        ensureCharacterEducationRecord: ensureCharacterEducationRecord,

        getProficiency: getProficiency,
        getSubjectProficiency: getSubjectProficiency,
        getCharacterProficiencies: getCharacterProficiencies,

        getEducationLevel: getEducationLevel,
        isLiterate: isLiterate
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.EducationLearning;
    }
})();