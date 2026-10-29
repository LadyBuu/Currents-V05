/**
 * =============================================================================
 * STILL WATERS - PROFESSIONAL KNOWLEDGE COMMANDS
 * js/apprenticeship/professional-knowledge-commands.js
 * =============================================================================
 *
 * LOCATION: js/apprenticeship/professional-knowledge-commands.js
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
 *   RoleCommands.recordCharacterSkillProgress, which fire markDataDirty
 *   through the character and role mutation boundaries respectively.
 *   The caller is responsible for flushing at the end of the enclosing
 *   batch.
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
 * HALF-TRANSACTION RISK
 *
 *   preserveKnowledgeOnDeath writes each dying profession to the heir
 *   independently. If step 3 fails, steps 1 and 2 are already in
 *   memory. This command does NOT revert on partial failure — the
 *   caller's death cascade is the atomic boundary (see PERSISTENCE).
 *   Failures within the loop are logged via console.warn but do not
 *   abort the loop, matching the discipline used by
 *   character-lifecycle.js's death cascade: a single failing role
 *   should not prevent the other roles from being preserved.
 *
 * ROLE READS
 *
 *   _getRoleById is LENIENT. It prefers RoleState.getRole (returns
 *   clones). When RoleState is available and the role is missing, it
 *   returns null (a legitimate missing-data case). When RoleState is
 *   NOT available but window.getRoleById is, it uses that. When NEITHER
 *   is available, it throws — a load-order regression must surface as
 *   an error, not as a null role name silently substituted by
 *   prof.name.
 *
 *   Prior revisions returned null when neither was available, which
 *   violated the module's own "NO FALLBACKS" contract and masked a
 *   load-order bug as a data-integrity issue. See ROLE READS in
 *   REFACTOR HISTORY.
 *
 *   _requireRoleForWrite(id) is STRICT. Unused by this module today
 *   (both write paths operate on professions, not roles), but present
 *   so any future write path that needs the role record has one
 *   consistent strict accessor to call.
 *
 * SKILL PROGRESSION
 *
 *   Role skill progression routes through
 *   RoleCommands.recordCharacterSkillProgress, not
 *   CharacterCommands.updateProfession. The former enforces the
 *   non-decreasing invariant; the latter is a blind write (the
 *   administrative override path). Prior revisions called
 *   updateProfession directly with a self-implemented non-decreasing
 *   check, which preserved the invariant by construction but bypassed
 *   the domain-layer enforcement. The invariant is now enforced by the
 *   role domain, matching apprenticeship-commands.js's consolidation.
 *
 *   Role creation (when the heir does not yet hold a role) still calls
 *   CharacterCommands.addProfession. That is a creation, not a
 *   progression; the invariant does not apply.
 *
 * CHARACTER PROJECTION CONTRACT
 *
 *   Several functions here read window.getCharacterById and access
 *   fields off the result:
 *
 *     preserveKnowledgeOnDeath    reads dying.name (for the
 *                                 "Inherited from" note)
 *     assessKnowledgeLoss         reads char.birthYear, char.isDeceased,
 *                                 char.deathYear (via _calculateAge)
 *
 *   Under the documented load order, window.getCharacterById resolves
 *   to the projection installed by character-queries.js / the shim, not
 *   the live entity from accessors.js. The projection includes `name`
 *   (a base scalar), `birthYear`, `isDeceased`, and `deathYear` (all
 *   base scalars used by the character summary projection). The reads
 *   here work identically against the projection and the live entity.
 *
 *   This module does NOT depend on any projection field beyond those
 *   four. If character-queries.js ever drops one, the reads here break
 *   silently; that is the contract this note exists to enforce. See
 *   names.js's CHARACTER LOOKUP CONTRACT section for the same pattern.
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
 *   - role-commands.js            (RoleCommands.recordCharacterSkillProgress)
 *   - character-commands.js       (addProfession, updateProfession,
 *                                  getProfession, getProfessions)
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - _getRoleById now throws when NEITHER RoleState.getRole NOR
 *       window.getRoleById is available. Prior revisions returned null,
 *       violating the module's own NO FALLBACKS contract and masking a
 *       load-order bug as a data-integrity issue. The role-missing-but-
 *       provider-available case still returns null (legitimate
 *       missing-data). _requireRoleForWrite added for symmetry with
 *       education-commands.js / apprenticeship-commands.js, even though
 *       this module has no role writes today.
 *     - preserveKnowledgeOnDeath now routes the "raise heir to inherited
 *       level" write through RoleCommands.recordCharacterSkillProgress
 *       instead of CharacterCommands.updateProfession. The
 *       non-decreasing invariant is now enforced by the role domain,
 *       not re-implemented here. The pre-write guard
 *       `existingLevel < inheritedLevel` is kept as a fast path
 *       (avoids a role-domain call when no change is needed). Role
 *       creation (heir does not hold the role) still calls addProfession.
 *       See SKILL PROGRESSION.
 *     - preserveKnowledgeOnDeath's result gains an `alreadyAtOrAbove`
 *       array: roles where the heir was already at or above the
 *       inherited level. `preserved` still records only the roles that
 *       were raised. Informational.
 *     - Header CHARACTER PROJECTION CONTRACT and HALF-TRANSACTION RISK
 *       sections added.
 *     - No other behavioural change to assessKnowledgeLoss.
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
     * LENIENT role read.
     *
     *   - RoleState available + role found   → clone
     *   - RoleState available + role missing → null (missing data)
     *   - RoleState absent + getRoleById available → result of that call
     *   - Both providers absent → THROW (load-order regression)
     *
     * See ROLE READS in the header.
     */
    function _getRoleById(id) {
        if (!id) return null;

        var hasRoleState = (typeof window.RoleState !== 'undefined' &&
                            typeof window.RoleState.getRole === 'function');
        var hasAccessor = (typeof window.getRoleById === 'function');

        if (hasRoleState) {
            return window.RoleState.getRole(id);
        }
        if (hasAccessor) {
            return window.getRoleById(id);
        }

        throw new Error(
            'ProfessionalKnowledgeCommands: no role reader available. ' +
            'Load role-state.js (RoleState.getRole) or accessors.js ' +
            '(getRoleById) before using this module.'
        );
    }

    /**
     * STRICT role read. Throws when the role is missing.
     *
     * Unused by this module today (both write paths operate on
     * professions, not roles). Present so any future write path that
     * needs the role record has a single strict accessor, matching
     * education-commands.js / apprenticeship-commands.js.
     */
    function _requireRoleForWrite(id) {
        if (!id || typeof id !== 'string') {
            throw new Error(
                'ProfessionalKnowledgeCommands: role id is required for write'
            );
        }
        var role = _getRoleById(id);
        if (!role) {
            throw new Error(
                'ProfessionalKnowledgeCommands: role not found: ' + id
            );
        }
        return role;
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

    /**
     * Required role-commands reader for skill progression. Throws if
     * RoleCommands or the specific method is missing.
     */
    function _recordCharacterSkillProgress(cid, rid, level) {
        if (!window.RoleCommands ||
            typeof window.RoleCommands.recordCharacterSkillProgress !== 'function') {
            throw new Error(
                'ProfessionalKnowledgeCommands requires ' +
                'RoleCommands.recordCharacterSkillProgress'
            );
        }
        return window.RoleCommands.recordCharacterSkillProgress(cid, rid, level);
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
     *
     * For each profession on the dying character with skill >= 10:
     *   - compute inheritedLevel = floor(skillLevel * 0.5)
     *   - if the heir already holds the role at >= inheritedLevel,
     *     record the role in `alreadyAtOrAbove` and do nothing
     *   - if the heir holds the role at < inheritedLevel, call
     *     RoleCommands.recordCharacterSkillProgress to raise it
     *   - if the heir does not hold the role, call
     *     CharacterCommands.addProfession to create it at inheritedLevel
     *
     * Does NOT flush to storage. See PERSISTENCE in the module header.
     *
     * Does NOT revert on partial failure — the caller's death cascade
     * is the atomic boundary. See HALF-TRANSACTION RISK.
     *
     * @param {string} dyingId
     * @param {string} heirId
     * @returns {{
     *   success: boolean,
     *   data?: {
     *     preserved: Array<{roleId, roleName, originalLevel, inheritedLevel}>,
     *     alreadyAtOrAbove: Array<{roleId, roleName, heirLevel, inheritedLevel}>
     *   },
     *   code?: string,
     *   reason?: string
     * }}
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
            return ok({ preserved: [], alreadyAtOrAbove: [] });
        }

        var preserved = [];
        var alreadyAtOrAbove = [];

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
                var existingLevel = typeof existing.skillLevel === 'number'
                    ? existing.skillLevel
                    : 0;

                if (existingLevel >= inheritedLevel) {
                    // Heir already at or above the inherited level. No
                    // write; record for the caller's visibility.
                    alreadyAtOrAbove.push({
                        roleId: roleId,
                        roleName: roleName,
                        heirLevel: existingLevel,
                        inheritedLevel: inheritedLevel
                    });
                    continue;
                }

                // Route through RoleCommands.recordCharacterSkillProgress
                // so the non-decreasing invariant is enforced by the role
                // domain. See SKILL PROGRESSION in the header.
                var progressResult = _recordCharacterSkillProgress(
                    heirId, roleId, inheritedLevel
                );
                if (!progressResult || progressResult.success !== true) {
                    if (window.console && typeof window.console.warn === 'function') {
                        window.console.warn(
                            'ProfessionalKnowledgeCommands: skill progression ' +
                            'failed for heir ' + heirId + ' role ' + roleId +
                            ' (' + (progressResult && progressResult.reason
                                ? progressResult.reason
                                : 'unknown') + '); other roles continue.'
                        );
                    }
                    continue;
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
                if (!addResult || !addResult.success) {
                    if (window.console && typeof window.console.warn === 'function') {
                        window.console.warn(
                            'ProfessionalKnowledgeCommands: addProfession ' +
                            'failed for heir ' + heirId + ' role ' + roleId +
                            ' (' + (addResult && addResult.reason
                                ? addResult.reason
                                : 'unknown') + '); other roles continue.'
                        );
                    }
                    continue;
                }
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

        return ok({
            preserved: preserved,
            alreadyAtOrAbove: alreadyAtOrAbove
        });
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
