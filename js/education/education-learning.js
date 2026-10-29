/**
 * =============================================================================
 * STILL WATERS - EDUCATION LEARNING
 * js/systems/education/education-learning.js
 * =============================================================================
 *
 * Proficiency, literacy, and education level reads. Plus a single hydration
 * helper that routes every write through CharacterCommands.
 *
 * OWNERSHIP
 *
 *   Reads touch character-owned education fields THROUGH CharacterCommands,
 *   not off the getCharacterById result. Writes route through
 *   CharacterCommands as well:
 *
 *     ensureCharacterEducationRecord → CharacterCommands.initializeEducationContainers
 *
 *   If CharacterCommands is missing, ensureCharacterEducationRecord fails
 *   loudly, and reads fall through to the projection path with a one-shot
 *   warning (see READS THROUGH CHARACTERCOMMANDS). There is no degraded
 *   mode for writes.
 *
 * READS THROUGH CHARACTERCOMMANDS
 *
 *   Prior revisions read `character.subjectProgress` directly off the
 *   window.getCharacterById result. Under the documented load order,
 *   that result is the PROJECTION installed by character-queries.js /
 *   the shim, not the live entity from accessors.js. Whether the
 *   projection includes `subjectProgress` is not documented by
 *   character-queries.js, and if it does not, every proficiency read
 *   here silently returns 0 — an invisible education-query bug.
 *
 *   This revision reads through:
 *
 *     CharacterCommands.getSubjectProgress(characterId, key)
 *     CharacterCommands.getSubjectProgressAll(characterId)
 *
 *   Both are the canonical readers for the character-owned
 *   subjectProgress store. If those accessors are not present on
 *   CharacterCommands today, this module falls through to the
 *   getCharacterById result read and logs a ONE-SHOT console.warn
 *   naming the missing accessor. The warning is per-process, not
 *   per-call, so a hot read loop does not flood the console.
 *
 *   This matches apprenticeship-queries.js::getTeachableSkills, which
 *   reads through CharacterCommands.getProfessions rather than
 *   character.professions directly, for the same reason: some character
 *   projections strip the field, and relying on it would silently
 *   return empty results for those callers.
 *
 *   If character-commands.js later gains getSubjectProgress and
 *   getSubjectProgressAll, the fallback branch becomes unreachable and
 *   can be deleted. Until then, the fallback preserves the prior
 *   behaviour and makes the gap visible via the one-shot warning.
 *
 * CHARACTER PROJECTION CONTRACT
 *
 *   Reads of `character.subjectProgress` are now routed through
 *   CharacterCommands (see READS THROUGH CHARACTERCOMMANDS). The only
 *   remaining direct reads of the projection are:
 *
 *     ensureCharacterEducationRecord  probes the CALLER-SUPPLIED object
 *                                     for the presence of container
 *                                     fields, to decide whether to ask
 *                                     CharacterCommands to initialize
 *                                     them. The probes are ADVISORY: if
 *                                     the caller passed the projection
 *                                     (which may not include these
 *                                     fields), the probe may say
 *                                     "needs init" when canonical state
 *                                     already has them. The subsequent
 *                                     initializeEducationContainers call
 *                                     is idempotent, so the re-init is
 *                                     harmless. The probe does NOT
 *                                     determine canonical state.
 *
 *   This module does NOT read `name`, `surname`, `birthYear`,
 *   `isDeceased`, `deathYear`, or `isLiterate` off the projection. Every
 *   one of those is either read through CharacterCommands or not read
 *   at all.
 *
 * LITERACY
 *
 *   character.isLiterate is a materialized flag with a single writer
 *   (CharacterCommands.setLiterate) and a single reader
 *   (CharacterCommands.isLiterate). education-learning.isLiterate
 *   delegates to that reader.
 *
 *   The threshold predicate lives in education-rules.isLiterateAtLevel.
 *   It is used by education-commands.advanceLearning to decide when to
 *   flip the flag, and nowhere else.
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
 *
 * DEPENDENCIES (required for reads to use the canonical path):
 *   - character-commands.js  (CharacterCommands.getSubjectProgress,
 *                             CharacterCommands.getSubjectProgressAll)
 *     If absent, reads fall back to the character projection with a
 *     one-shot warning. See READS THROUGH CHARACTERCOMMANDS.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - _readSubjectProgress and _readAllSubjectProgress added. Reads of
 *       character.subjectProgress now route through
 *       CharacterCommands.getSubjectProgress / getSubjectProgressAll
 *       when available. If those accessors are absent (they may not
 *       exist in the current character-commands.js), the reads fall
 *       through to the getCharacterById result read with a ONE-SHOT
 *       console.warn. Prior revisions read the projection directly,
 *       which could silently return 0 for every character if the
 *       projection strips subjectProgress. See READS THROUGH
 *       CHARACTERCOMMANDS.
 *     - isLiterate no longer does a redundant getCharacterById fetch.
 *       The command-layer reader returns false for missing characters,
 *       so the fetch only served as a null check. Behaviourally
 *       identical.
 *     - Header CHARACTER PROJECTION CONTRACT and READS THROUGH
 *       CHARACTERCOMMANDS sections added.
 *     - No other behavioural change. Every public read's return shape
 *       is unchanged.
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
    // 2. SUBJECT-PROGRESS READ ACCESSORS
    // =========================================================================
    //
    // Canonical path: CharacterCommands.getSubjectProgress / getSubjectProgressAll.
    // Fallback path: read from the getCharacterById result (the projection).
    //
    // One-shot warning per missing accessor, not per call. See READS
    // THROUGH CHARACTERCOMMANDS in the header.

    var _warnedMissingAccessor = {
        getSubjectProgress: false,
        getSubjectProgressAll: false
    };

    function _warnOnce(methodName) {
        if (_warnedMissingAccessor[methodName]) return;
        _warnedMissingAccessor[methodName] = true;
        if (window.console && typeof window.console.warn === 'function') {
            window.console.warn(
                'education-learning.js: CharacterCommands.' + methodName +
                ' is not available. Falling back to the getCharacterById ' +
                'projection. If the projection does not include ' +
                'character.subjectProgress, reads will return 0 for every ' +
                'character. Add the accessor to character-commands.js to ' +
                'close this gap. (This warning fires once per process.)'
            );
        }
    }

    /**
     * Returns a single subject's progress record for a character, or null
     * if the character does not exist or the key is absent.
     *
     * Canonical path reads through CharacterCommands.getSubjectProgress.
     * Fallback path reads character.subjectProgress[key] off the
     * getCharacterById result.
     *
     * @param {string} characterId
     * @param {string} key
     * @returns {Object|null}
     */
    function _readSubjectProgress(characterId, key) {
        if (!characterId || !key) return null;

        var CC = _characterCommands();
        if (typeof CC.getSubjectProgress === 'function') {
            var fromCommand = CC.getSubjectProgress(characterId, key);
            return fromCommand || null;
        }

        _warnOnce('getSubjectProgress');

        var character = _getCharacterById(characterId);
        if (!character || !character.subjectProgress) return null;
        var record = character.subjectProgress[key];
        return record || null;
    }

    /**
     * Returns the full subjectProgress map for a character, or {} if the
     * character does not exist or has no progress.
     *
     * Canonical path reads through CharacterCommands.getSubjectProgressAll.
     * Fallback path reads character.subjectProgress off the
     * getCharacterById result.
     *
     * @param {string} characterId
     * @returns {Object<string, Object>}
     */
    function _readAllSubjectProgress(characterId) {
        if (!characterId) return {};

        var CC = _characterCommands();
        if (typeof CC.getSubjectProgressAll === 'function') {
            var fromCommand = CC.getSubjectProgressAll(characterId);
            return fromCommand || {};
        }

        _warnOnce('getSubjectProgressAll');

        var character = _getCharacterById(characterId);
        if (!character || !character.subjectProgress) return {};
        return character.subjectProgress;
    }

    // =========================================================================
    // 3. HYDRATION (explicit; routed through CharacterCommands)
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
    // The caller-supplied object is probed to decide whether the call is
    // necessary. See CHARACTER PROJECTION CONTRACT in the header: the
    // probes are advisory, and the initialization call is idempotent, so
    // a spurious init is harmless.
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
    // 4. PROFICIENCY READS
    // =========================================================================

    /**
     * Get proficiency level for a curriculum item.
     * Returns 0 if the character has no record for that item.
     * Returns null if the character does not exist.
     */
    function getProficiency(characterId, curriculumItem) {
        var character = _getCharacterById(characterId);
        if (!character) return null;

        var key = RULES.progressKeyFor(curriculumItem);
        var record = _readSubjectProgress(characterId, key);
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
        if (!character) return [];

        var map = _readAllSubjectProgress(characterId);
        if (!map || typeof map !== 'object') return [];

        var out = [];
        for (var key in map) {
            if (!Object.prototype.hasOwnProperty.call(map, key)) continue;
            var p = map[key];
            if (!p || typeof p !== 'object') continue;
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
    // 5. CLASSIFICATION READS
    // =========================================================================

    /**
     * Get the education level for a character. Returns null if the character
     * does not exist.
     *
     * Derived classification. Reads the literacy proficiency level via
     * _readSubjectProgress and asks EducationRules for the highest level
     * whose threshold is met. This is a read of an education-owned field
     * and does not touch character.isLiterate.
     */
    function getEducationLevel(characterId) {
        var character = _getCharacterById(characterId);
        if (!character) return null;

        var literacy = 0;
        var record = _readSubjectProgress(characterId, 'literacy');
        if (record && typeof record.level === 'number') {
            literacy = record.level;
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
        return _characterCommands().isLiterate(characterId) === true;
    }

    // =========================================================================
    // 6. EXPORTS
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
