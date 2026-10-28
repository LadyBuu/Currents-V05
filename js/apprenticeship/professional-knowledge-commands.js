/**
 * =============================================================================
 * STILL WATERS - PROFESSIONAL KNOWLEDGE COMMANDS
 * js/apprenticeship/professional-knowledge-commands.js
 * =============================================================================
 *
 * Knowledge preservation and inheritance on death.
 *
 * This command lives in the apprenticeship folder because apprenticeship is
 * the primary producer of professional skill progression, and knowledge
 * preservation is the transfer of accumulated skill across generations. It
 * operates across all professions, not only apprenticed ones.
 *
 * Contract (matches ApprenticeshipCommands):
 *   { success: true,  data: {...} }
 *   { success: false, code: '...', reason: '...' }
 *
 * PERSISTENCE
 *
 *   preserveKnowledgeOnDeath does NOT call saveMasterData. It mutates
 *   in-memory state via CharacterCommands.addProfession /
 *   updateProfession, which fire markDataDirty through the character
 *   mutation boundary. The caller is responsible for flushing at the
 *   end of the enclosing batch.
 *
 *   This matters because knowledge preservation is typically invoked as
 *   one step in a larger death cascade that also ends relationships,
 *   deprecates ranks, closes family edges, and records the death
 *   itself. If this command flushed eagerly and the cascade failed at
 *   a later step, the knowledge preservation would be committed while
 *   the death was not — a half-transaction.
 *
 *   Callers of preserveKnowledgeOnDeath must ensure that a flush
 *   happens after the cascade completes successfully. The character
 *   subsystem's death flow already does this at its own boundary.
 *
 *   assessKnowledgeLoss is a pure read and never mutates. It does not
 *   flush.
 *
 *   If a caller of preserveKnowledgeOnDeath is not part of a death
 *   cascade, it must call window.saveMasterData() (or a domain
 *   persist() wrapper) after the preservation succeeds, exactly once
 *   per batch.
 *
 * ROLE READS
 *
 *   _getRoleById prefers RoleState.getRole (returns clones) and falls
 *   back to window.getRoleById (accessors.js, live records) only when
 *   RoleState is unavailable. This matches apprenticeship-commands.js
 *   and education-commands.js and ensures this module observes the same
 *   role shape as the rest of the apprenticeship domain.
 *
 * NO FALLBACKS
 *
 *   If CharacterCommands is missing, the module fails loudly on first
 *   use. There is no silent empty-list fallback — a load-order bug must
 *   surface as an error, not as "no professions preserved."
 *
 * DEPENDENCIES:
 *   - accessors.js                (getCharacterById, getRoleById fallback)
 *   - time.js                     (getCurrentYear, calculateAge)
 *   - role-state.js               (RoleState.getRole — preferred reader)
 *   - character-commands.js       (addProfession, updateProfession,
 *                                  getProfession, getProfessions)
 *
 * =============================================================================
 */

(function () {
    'use strict';

    function _dep(name, fn) {
        if (typeof fn !== 'function') {
            throw new Error('ProfessionalKnowledgeCommands: missing ' + name);
        }
        return fn;
    }

    function _getCharacterById(id) {
        return _dep('getCharacterById', window.getCharacterById)(id);
    }

    /**
     * Role reads prefer RoleState (returns clones) and fall back to
     * accessors' window.getRoleById only when RoleState is unavailable.
     * See ROLE READS in the module header.
     */
    function _getRoleById(id) {
        if (window.RoleState && typeof window.RoleState.getRole === 'function') {
            return window.RoleState.getRole(id);
        }
        if (typeof window.getRoleById === 'function') {
            return window.getRoleById(id);
        }
        return null;
    }

    function _getCurrentYear() {
        return _dep('getCurrentYear', window.getCurrentYear)();
    }

    /**
     * Required character-commands reader. Throws if CharacterCommands or
     * the specific method is missing — no silent fallbacks. See NO
     * FALLBACKS in the module header.
     */
    function _characterCommandsMethod(name) {
        if (!window.CharacterCommands
            || typeof window.CharacterCommands[name] !== 'function') {
            throw new Error(
                'ProfessionalKnowledgeCommands requires ' +
                'CharacterCommands.' + name
            );
        }
        return window.CharacterCommands[name];
    }

    function _addProfession(cid, data) {
        return _characterCommandsMethod('addProfession')(cid, data);
    }

    function _updateProfession(cid, rid, updates) {
        return _characterCommandsMethod('updateProfession')(cid, rid, updates);
    }

    function _getProfession(cid, rid) {
        return _characterCommandsMethod('getProfession')(cid, rid);
    }

    function _getProfessions(cid) {
        return _characterCommandsMethod('getProfessions')(cid);
    }

    function _calculateAge(char) {
        if (typeof window.calculateAge === 'function') {
            return window.calculateAge(char.birthYear, char.isDeceased, char.deathYear);
        }
        return null;
    }

    function ok(data)           { return { success: true, data: data }; }
    function fail(code, reason) { return { success: false, code: code, reason: reason }; }

    function _notify(eventName, payload) {
        if (typeof window.dispatchEvent === 'function'
            && typeof window.CustomEvent === 'function') {
            window.dispatchEvent(new CustomEvent(eventName, { detail: payload || {} }));
        }
    }

    /**
     * Preserve knowledge from dying character to heir.
     * Inherits half the skill level of each profession >= 10.
     *
     * Uses CharacterCommands for all profession mutations so that the
     * character-commands ownership contract on `character.professions` is
     * respected.
     *
     * Does NOT flush to storage. See PERSISTENCE in the module header.
     * The caller flushes at the end of the enclosing batch.
     *
     * Idempotency: the inherited skill level is always
     *   floor(originalLevel * 0.5)
     *
     * If the heir already holds the role at a level >= the inherited
     * level, no update is applied. If the heir holds the role at a
     * lower level, the heir is raised to the inherited level. Repeated
     * calls (which should not happen, but could if a caller retries
     * after a cascade failure) therefore converge to the same state —
     * the highest inherited level per role wins.
     *
     * @param {string} dyingId
     * @param {string} heirId
     * @returns {{ success: boolean, data?: { preserved: Array }, code?: string, reason?: string }}
     */
    function preserveKnowledgeOnDeath(dyingId, heirId) {
        var dying = _getCharacterById(dyingId);
        var heir = _getCharacterById(heirId);
        if (!dying) return fail('DYING_NOT_FOUND', 'Dying character not found');
        if (!heir) return fail('HEIR_NOT_FOUND', 'Heir not found');

        // The character projection may or may not include professions.
        // Read them through CharacterCommands to be certain. This mirrors
        // the fix in apprenticeship-queries.getTeachableSkills.
        var dyingProfessions = _getProfessions(dyingId);

        if (!Array.isArray(dyingProfessions) || dyingProfessions.length === 0) {
            return ok({ preserved: [] });
        }

        var preserved = [];

        for (var i = 0; i < dyingProfessions.length; i++) {
            var prof = dyingProfessions[i];
            var skillLevel = typeof prof.skillLevel === 'number' ? prof.skillLevel : 0;
            if (skillLevel < 10) continue;

            var inheritedLevel = Math.max(0, Math.floor(skillLevel * 0.5));
            var roleId = prof.id;
            var role = _getRoleById(roleId);
            var roleName = role ? role.name : (prof.name || 'Unknown');

            var existing = _getProfession(heirId, roleId);

            if (existing) {
                // Never downgrade the heir's existing skill.
                var existingLevel = typeof existing.skillLevel === 'number'
                    ? existing.skillLevel
                    : 0;
                if (existingLevel < inheritedLevel) {
                    var updateResult = _updateProfession(heirId, roleId, {
                        skillLevel: inheritedLevel
                    });
                    if (!updateResult || !updateResult.success) continue;
                }
            } else {
                var addResult = _addProfession(heirId, {
                    id: roleId,
                    name: roleName,
                    skillLevel: inheritedLevel,
                    startYear: _getCurrentYear(),
                    notes: 'Inherited from ' + dying.name,
                    specs: []
                });
                if (!addResult || !addResult.success) continue;
            }

            preserved.push({
                roleId: roleId,
                roleName: roleName,
                originalLevel: skillLevel,
                inheritedLevel: inheritedLevel
            });
        }

        if (preserved.length > 0) {
            _notify('knowledgePreserved', {
                dyingId: dyingId,
                heirId: heirId,
                preserved: preserved
            });
            _notify('characterUpdated', {
                action: 'preserveKnowledgeOnDeath',
                dyingId: dyingId,
                heirId: heirId
            });
        }

        return ok({ preserved: preserved });
    }

    /**
     * Assesses the risk of knowledge loss if the character dies. Pure
     * read; never mutates, never flushes.
     *
     * @param {string} characterId
     * @returns {{ success: boolean, data?: Object, code?: string, reason?: string }}
     */
    function assessKnowledgeLoss(characterId) {
        var char = _getCharacterById(characterId);
        if (!char) return fail('CHARACTER_NOT_FOUND', 'Character not found');

        var age = _calculateAge(char);
        var ageFactor = (age == null) ? 0 : Math.min(1, Math.max(0, (age - 50) / 50));
        var baseRisk = ageFactor * 0.5;

        var professions = _getProfessions(characterId);

        var skills = [];
        if (Array.isArray(professions)) {
            for (var i = 0; i < professions.length; i++) {
                var prof = professions[i];
                var skillLevel = typeof prof.skillLevel === 'number' ? prof.skillLevel : 0;
                var lossRisk = baseRisk * (1 - (skillLevel / 100));
                skills.push({
                    roleId: prof.id,
                    roleName: prof.name || 'Unknown',
                    skillLevel: skillLevel,
                    lossRisk: Math.min(0.9, Math.max(0, lossRisk))
                });
            }
        }

        return ok({
            risk: Math.min(0.9, baseRisk),
            age: age,
            skills: skills
        });
    }

    window.ProfessionalKnowledgeCommands = {
        preserveKnowledgeOnDeath: preserveKnowledgeOnDeath,
        assessKnowledgeLoss: assessKnowledgeLoss
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.ProfessionalKnowledgeCommands;
    }
})();
