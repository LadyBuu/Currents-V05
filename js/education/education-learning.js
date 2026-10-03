/**
 * STILL WATERS - EDUCATION LEARNING
 * Pure learning mechanics: read proficiency, read education level, read
 * literacy, ensure character education record. No commands except the
 * cross-domain write in ensureCharacterEducationRecord, which routes
 * through CharacterCommands.
 *
 * Demographics live in education-queries.js. Mutation (advanceLearning)
 * lives in education-commands.js.
 *
 * Ownership:
 *   - character.subjectProgress, character.isLiterate, character.education,
 *     character.educationHistory are education-owned fields on the character
 *     record, written only through CharacterCommands.updateEducationRecord.
 *   - role records are owned by RoleState; this module reads via RoleState.
 *
 * DEPENDENCIES (required, checked lazily):
 *   - education-rules.js    (EducationRules)
 *   - accessors.js          (getCharacterById)
 *   - role-state.js         (RoleState)
 *   - character-commands.js (CharacterCommands) — write path only
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

    function _getRoleById(id) {
        if (typeof window.RoleState === 'undefined' ||
            typeof window.RoleState.getRole !== 'function') {
            throw new Error('education-learning.js requires RoleState.getRole');
        }
        return window.RoleState.getRole(id);
    }

    function _characterCommands() {
        if (typeof window.CharacterCommands === 'undefined' ||
            typeof window.CharacterCommands.updateEducationRecord !== 'function') {
            throw new Error(
                'education-learning.js requires CharacterCommands.updateEducationRecord'
            );
        }
        return window.CharacterCommands;
    }

    // =========================================================================
    // 2. HYDRATION (explicit; routed through CharacterCommands)
    // =========================================================================
    //
    // Ensures the character record has the canonical education fields.
    // Reads never call this. Only hydration / enrolment paths call it, and
    // it writes through CharacterCommands so the write boundary is uniform.
    //
    // The function is idempotent: if the fields already exist, it does
    // nothing and returns a success result without touching state.

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

        var patch = {};
        if (needsSubjectProgress) patch.subjectProgress = {};
        if (needsIsLiterate) patch.isLiterate = false;
        if (needsEducation) patch.education = {};
        if (needsEducationHistory) patch.educationHistory = [];

        var result = _characterCommands().updateEducationRecord(character.id, patch);
        if (!result || !result.success) {
            return {
                success: false,
                reason: (result && result.reason) || 'Failed to initialise education record.'
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
     * does not exist. Uses RULES.getEducationLevelForLiteracy — the only
     * place the threshold table is interpreted.
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
     * Canonical literacy predicate. Literacy subject level is the source of
     * truth. `character.isLiterate` is a materialized milestone maintained by
     * EducationCommands.advanceLearning and is not consulted here — otherwise
     * the two can drift.
     */
    function isLiterate(characterId) {
        var character = _getCharacterById(characterId);
        if (!character) return false;

        var literacy = 0;
        if (character.subjectProgress &&
            character.subjectProgress.literacy &&
            typeof character.subjectProgress.literacy.level === 'number') {
            literacy = character.subjectProgress.literacy.level;
        }
        return RULES.isLiterateAtLevel(literacy);
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
