/**
 * STILL WATERS - EDUCATION LEARNING
 * Pure learning mechanics: read proficiency, read education level, read
 * literacy, ensure character education record. No commands, no persistence,
 * no demographics, no formatting. Demographics live in education-queries.js.
 * Mutation (advanceLearning) lives in education-commands.js.
 */

(function() {
    'use strict';

    var RULES = window.EducationRules;
    if (!RULES) {
        throw new Error('education-learning.js requires education-rules.js');
    }

    // --- Dependencies: no fallbacks. ---

    function _getCharacterById(id) {
        if (typeof window.getCharacterById !== 'function') {
            throw new Error('education-learning.js requires getCharacterById');
        }
        return window.getCharacterById(id);
    }

    function _getRoleById(id) {
        if (typeof window.getRoleById === 'function') {
            return window.getRoleById(id);
        }
        if (typeof window.RoleState !== 'undefined' && typeof window.RoleState.getRole === 'function') {
            return window.RoleState.getRole(id);
        }
        throw new Error('education-learning.js requires getRoleById');
    }

    // --- Hydration (explicit) ---

    /**
     * Ensure a character has the canonical education fields.
     * Mutates the character. Called by hydration / Character Commands.
     * Reads never call this.
     */
    function ensureCharacterEducationRecord(character) {
        if (!character) return character;

        if (!character.subjectProgress) character.subjectProgress = {};
        if (character.isLiterate === undefined) character.isLiterate = false;
        if (!character.education) character.education = {};
        if (!character.educationHistory) character.educationHistory = [];

        return character;
    }

    // --- Proficiency reads ---

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

    // --- Classification reads ---

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
     * Canonical literacy predicate. Literacy subject level is the source of truth.
     * `character.isLiterate` is a materialized milestone maintained by
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

    // --- Exports ---

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
