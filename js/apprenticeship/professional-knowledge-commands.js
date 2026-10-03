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
 * DEPENDENCIES:
 *   - getCharacterById / getRoleById / getCurrentYearSafe / calculateAge
 *   - CharacterCommands.addProfession / updateProfession
 *   - saveMasterData
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

    function _getCharacterById(id) { return _dep('getCharacterById', window.getCharacterById)(id); }
    function _getRoleById(id)      { return _dep('getRoleById', window.getRoleById)(id); }
    function _getCurrentYear()     { return _dep('getCurrentYearSafe', window.getCurrentYearSafe)(); }
    function _saveMasterData()     { return _dep('saveMasterData', window.saveMasterData)(); }

    function _addProfession(cid, data) {
        return _dep('CharacterCommands.addProfession',
            window.CharacterCommands && window.CharacterCommands.addProfession)(cid, data);
    }
    function _updateProfession(cid, rid, updates) {
        return _dep('CharacterCommands.updateProfession',
            window.CharacterCommands && window.CharacterCommands.updateProfession)(cid, rid, updates);
    }
    function _getProfession(cid, rid) {
        return _dep('CharacterCommands.getProfession',
            window.CharacterCommands && window.CharacterCommands.getProfession)(cid, rid);
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
        if (typeof window.dispatchEvent === 'function') {
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
     */
    function preserveKnowledgeOnDeath(dyingId, heirId) {
        var dying = _getCharacterById(dyingId);
        var heir = _getCharacterById(heirId);
        if (!dying) return fail('DYING_NOT_FOUND', 'Dying character not found');
        if (!heir) return fail('HEIR_NOT_FOUND', 'Heir not found');
        if (!Array.isArray(dying.professions) || dying.professions.length === 0) {
            return ok({ preserved: [] });
        }

        var preserved = [];

        for (var i = 0; i < dying.professions.length; i++) {
            var prof = dying.professions[i];
            var skillLevel = typeof prof.skillLevel === 'number' ? prof.skillLevel : 0;
            if (skillLevel < 10) continue;

            var inheritedLevel = Math.max(0, Math.floor(skillLevel * 0.5));
            var roleId = prof.id;
            var role = _getRoleById(roleId);
            var roleName = role ? role.name : (prof.name || 'Unknown');

            var existing = _getProfession(heirId, roleId);

            if (existing) {
                // Never downgrade the heir's existing skill.
                var existingLevel = typeof existing.skillLevel === 'number' ? existing.skillLevel : 0;
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
            _saveMasterData();
            _notify('knowledgePreserved', {
                dyingId: dyingId,
                heirId: heirId,
                preserved: preserved
            });
            _notify('characterUpdated', {});
        }

        return ok({ preserved: preserved });
    }

    function assessKnowledgeLoss(characterId) {
        var char = _getCharacterById(characterId);
        if (!char) return fail('CHARACTER_NOT_FOUND', 'Character not found');

        var age = _calculateAge(char);
        var ageFactor = (age == null) ? 0 : Math.min(1, Math.max(0, (age - 50) / 50));
        var baseRisk = ageFactor * 0.5;

        var skills = [];
        if (Array.isArray(char.professions)) {
            for (var i = 0; i < char.professions.length; i++) {
                var prof = char.professions[i];
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
