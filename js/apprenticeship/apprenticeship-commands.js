/**
 * =============================================================================
 * STILL WATERS - APPRENTICESHIP COMMANDS
 * js/apprenticeship/apprenticeship-commands.js
 * =============================================================================
 *
 * Mutating operations for apprenticeship lifecycle. Each public command:
 *
 *   1. Reads facts via Queries
 *   2. Validates via Rules
 *   3. Applies mutations
 *   4. Commits ONE transaction
 *   5. Dispatches ONE notification
 *   6. Returns a structured result
 *
 * Contract (all commands):
 *
 *   { success: true,  data: {...} }
 *   { success: false, code: '...', reason: '...' }
 *
 * OWNERSHIP
 *
 *   This module owns the apprenticeship lifecycle. It does NOT own:
 *
 *     character.professions       → CharacterCommands
 *     relationship edges          → ProfessionalCommands
 *     role catalogue              → RoleState / RoleQueries
 *     specialization membership   → RoleRules.validateSpecialization
 *     teaching policy             → ApprenticeshipRules
 *
 * METADATA SHAPE (owned by this module)
 *
 *   {
 *     roleId: string,
 *     roleName: string,
 *     startSkill: number,
 *     stage: string,
 *     teachingHistory: Array,
 *     notes: string
 *   }
 *
 *   startYear is an EDGE field, not metadata. It is patched through
 *   ProfessionalCommands.updateEdgeFields.
 *
 * DEPENDENCIES (must be loaded first):
 *   - apprenticeship-constants.js
 *   - apprenticeship-rules.js
 *   - apprenticeship-queries.js
 *   - professional-commands.js
 *   - role-rules.js
 *   - character-commands.js
 *   - accessors.js
 *   - time.js
 *   - storage.js
 *   - relationship-types.js
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. HARD DEPENDENCY CHECK
    // =========================================================================

    if (!window.ApprenticeshipRules ||
        typeof window.ApprenticeshipRules.getStageForSkill !== 'function') {
        throw new Error(
            'apprenticeship-commands.js requires apprenticeship-rules.js first.'
        );
    }
    if (!window.ApprenticeshipQueries) {
        throw new Error(
            'apprenticeship-commands.js requires apprenticeship-queries.js first.'
        );
    }
    if (!window.ProfessionalCommands ||
        typeof window.ProfessionalCommands.createEdge !== 'function' ||
        typeof window.ProfessionalCommands.updateEdgeMetadata !== 'function' ||
        typeof window.ProfessionalCommands.updateEdgeFields !== 'function' ||
        typeof window.ProfessionalCommands.endEdge !== 'function' ||
        typeof window.ProfessionalCommands.removeEdge !== 'function') {
        throw new Error(
            'apprenticeship-commands.js requires professional-commands.js ' +
            '(createEdge/updateEdgeMetadata/updateEdgeFields/endEdge/removeEdge) first.'
        );
    }
    if (!window.RoleRules ||
        typeof window.RoleRules.validateSpecialization !== 'function') {
        throw new Error(
            'apprenticeship-commands.js requires role-rules.js ' +
            '(RoleRules.validateSpecialization) first.'
        );
    }
    if (!window.CharacterCommands) {
        throw new Error(
            'apprenticeship-commands.js requires character-commands.js first.'
        );
    }
    if (!window.RELATIONSHIP_ARCHETYPES || !window.RELATIONSHIP_STATUS) {
        throw new Error(
            'apprenticeship-commands.js requires relationship-types.js first.'
        );
    }

    var A = window.RELATIONSHIP_ARCHETYPES;
    var STATUS = window.RELATIONSHIP_STATUS;
    var TEACH = window.TEACHING_CONSTANTS;

    var APPRENTICESHIP = A.APPRENTICESHIP;

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getCharacterById(id) {
        if (typeof window.getCharacterById !== 'function') {
            throw new Error('ApprenticeshipCommands: missing getCharacterById');
        }
        return window.getCharacterById(id);
    }

    function _getRoleById(id) {
        if (typeof window.getRoleById !== 'function') {
            throw new Error('ApprenticeshipCommands: missing getRoleById');
        }
        return window.getRoleById(id);
    }

    function _getCurrentYear() {
        if (typeof window.getCurrentYearSafe !== 'function') {
            throw new Error('ApprenticeshipCommands: missing getCurrentYearSafe');
        }
        return window.getCurrentYearSafe();
    }

    function _saveMasterData() {
        if (typeof window.saveMasterData !== 'function') {
            throw new Error('ApprenticeshipCommands: missing saveMasterData');
        }
        return window.saveMasterData();
    }

    function _professionalCommands() {
        return window.ProfessionalCommands;
    }

    function _characterCommands() {
        return window.CharacterCommands;
    }

    function _queries() {
        return window.ApprenticeshipQueries;
    }

    function _rules() {
        return window.ApprenticeshipRules;
    }

    function _roll() {
        if (typeof window.RNG !== 'undefined' && typeof window.RNG.next === 'function') {
            return window.RNG.next();
        }
        throw new Error(
            'ApprenticeshipCommands: canonical RNG (window.RNG.next) not available'
        );
    }

    // =========================================================================
    // 3. NOTIFICATION
    // =========================================================================

    function _notify(eventName, payload) {
        if (typeof window.dispatchEvent === 'function' &&
            typeof window.CustomEvent === 'function') {
            window.dispatchEvent(new CustomEvent(eventName, { detail: payload || {} }));
        }
    }

    function _commitAndNotify(payload) {
        _saveMasterData();
        _notify('apprenticeshipUpdated', payload);
        _notify('characterUpdated', payload);
    }

    // =========================================================================
    // 4. RESULT HELPERS
    // =========================================================================

    function ok(data)           { return { success: true, data: data }; }
    function fail(code, reason) { return { success: false, code: code, reason: reason }; }

    // =========================================================================
    // 5. SHARED HELPERS
    // =========================================================================

    function _getSkill(characterId, roleId) {
        return _queries().getSkillLevel(characterId, roleId);
    }

    function _getProfession(characterId, roleId) {
        return _characterCommands().getProfession(characterId, roleId);
    }

    function _readMetadata(rel) {
        var meta = rel && rel.metadata ? rel.metadata : {};
        return {
            roleId: meta.roleId || null,
            roleName: meta.roleName || null,
            startSkill: typeof meta.startSkill === 'number' ? meta.startSkill : null,
            stage: meta.stage || null,
            teachingHistory: Array.isArray(meta.teachingHistory)
                ? meta.teachingHistory.slice()
                : [],
            notes: typeof meta.notes === 'string' ? meta.notes : ''
        };
    }

    function _ensureProfession(characterId, roleId, roleName, skillLevel, startYear, notes) {
        var CC = _characterCommands();
        var existing = CC.getProfession(characterId, roleId);

        if (existing) {
            var existingSkill = typeof existing.skillLevel === 'number'
                ? existing.skillLevel
                : 0;
            if (existingSkill >= skillLevel) {
                return { success: true, updated: false, profession: existing };
            }
            var updateResult = CC.updateProfession(characterId, roleId, {
                skillLevel: skillLevel
            });
            if (!updateResult || !updateResult.success) {
                return {
                    success: false,
                    reason: (updateResult && updateResult.reason)
                        ? updateResult.reason
                        : 'Failed to update profession'
                };
            }
            return { success: true, updated: true, profession: updateResult.profession };
        }

        var addResult = CC.addProfession(characterId, {
            id: roleId,
            name: roleName,
            skillLevel: skillLevel,
            startYear: startYear,
            primary: false,
            notes: notes || '',
            specs: [],
            baseSalary: 0,
            customSalary: null,
            salaryHistory: [],
            salaryLastCalculated: null,
            paysSalary: true
        });
        if (!addResult || !addResult.success) {
            return {
                success: false,
                reason: (addResult && addResult.reason)
                    ? addResult.reason
                    : 'Failed to add profession'
            };
        }
        return { success: true, updated: false, profession: addResult.profession };
    }

    // =========================================================================
    // 6. CREATE
    // =========================================================================

    function createApprenticeship(args) {
        args = args || {};

        var master = _getCharacterById(args.masterId);
        var apprentice = _getCharacterById(args.apprenticeId);
        var role = args.roleId ? _getRoleById(args.roleId) : null;

        if (!master) return fail('MASTER_NOT_FOUND', 'Master not found');
        if (!apprentice) return fail('APPRENTICE_NOT_FOUND', 'Apprentice not found');
        if (!role) return fail('ROLE_NOT_FOUND', 'Role not found: ' + args.roleId);

        var masterSkill = _getSkill(master.id, role.id);
        if (masterSkill === null) masterSkill = 0;

        var existingForRole = _queries().getApprenticeship(master.id, apprentice.id, role.id);

        var initialSkill = args.initialSkill != null
            ? args.initialSkill
            : TEACH.DEFAULT_INITIAL_SKILL;

        var apprenticeProfession = _getProfession(apprentice.id, role.id);
        var apprenticeExistingSkill = apprenticeProfession &&
            typeof apprenticeProfession.skillLevel === 'number'
            ? apprenticeProfession.skillLevel
            : 0;

        var validation = _rules().validateCreation({
            master: {
                id: master.id,
                name: master.name,
                isDeceased: !!master.isDeceased,
                skillLevel: masterSkill
            },
            apprentice: {
                id: apprentice.id,
                name: apprentice.name,
                isDeceased: !!apprentice.isDeceased,
                existingSkill: apprenticeExistingSkill
            },
            role: { id: role.id, name: role.name },
            initialSkill: initialSkill,
            existsActiveForRole: !!existingForRole
        });
        if (!validation.valid) return fail(validation.code, validation.reason);

        var resolvedInitialSkill = validation.resolvedInitialSkill;
        var startYear = args.startYear != null ? args.startYear : _getCurrentYear();
        var initialStage = _rules().getStageForSkill(resolvedInitialSkill);

        var ensure = _ensureProfession(
            apprentice.id,
            role.id,
            role.name,
            resolvedInitialSkill,
            startYear,
            'Apprenticeship under ' + master.name +
                (args.notes ? ' (' + args.notes + ')' : '')
        );
        if (!ensure.success) {
            return fail('PROFESSION_WRITE_FAILED', ensure.reason);
        }

        var edge = _professionalCommands().createEdge({
            archetype: 'apprenticeship',
            participantA: master.id,
            participantB: apprentice.id,
            startYear: startYear,
            metadata: {
                roleId: role.id,
                roleName: role.name,
                startSkill: resolvedInitialSkill,
                stage: initialStage.id,
                teachingHistory: [],
                notes: args.notes || ''
            }
        });
        if (!edge.success) {
            return fail(edge.code || 'EDGE_CREATE_FAILED',
                edge.message || 'Failed to create apprenticeship');
        }

        _commitAndNotify({
            action: 'createApprenticeship',
            masterId: master.id,
            apprenticeId: apprentice.id,
            roleId: role.id,
            relationshipId: edge.relationshipId
        });

        return ok({
            apprenticeship: _queries().getApprenticeshipDetails(
                master.id, apprentice.id, role.id
            ),
            relationshipId: edge.relationshipId
        });
    }

    // =========================================================================
    // 7. UPDATE
    // =========================================================================
    //
    // Two write paths are used here:
    //
    //   1. metadata (skill-derived stage, notes) → updateEdgeMetadata
    //   2. edge-level fields (startYear)          → updateEdgeFields
    //
    // Skill changes go through CharacterCommands.updateProfession.
    // Status changes go through endEdge (see terminate/complete/cancel).

    function updateApprenticeship(masterId, apprenticeId, updates) {
        updates = updates || {};

        if (!updates.roleId) {
            return fail('MISSING_ROLE', 'roleId is required to identify the apprenticeship');
        }

        var rel = _queries().getApprenticeship(masterId, apprenticeId, updates.roleId);
        if (!rel) return fail('NOT_FOUND', 'Apprenticeship not found');

        if (rel.status !== STATUS.ONGOING) {
            return fail('NOT_ONGOING', 'Cannot update a non-ongoing apprenticeship');
        }

        var meta = _readMetadata(rel);

        if (updates.status && updates.status !== rel.status) {
            var transition = _rules().validateStatusTransition(rel.status, updates.status);
            if (!transition.valid) return fail(transition.code, transition.reason);
        }

        // ---- Skill ----
        if (updates.skillLevel !== undefined) {
            if (!_rules().isSkillInRange(updates.skillLevel)) {
                return fail('INVALID_SKILL', 'Skill must be 0-100');
            }
            var updateResult = _characterCommands().updateProfession(
                apprenticeId, meta.roleId, { skillLevel: updates.skillLevel }
            );
            if (!updateResult || !updateResult.success) {
                return fail(
                    'SKILL_UPDATE_FAILED',
                    (updateResult && updateResult.reason) || 'Skill update failed'
                );
            }
            meta.stage = _rules().getStageForSkill(updates.skillLevel).id;
        }

        // ---- Notes ----
        if (typeof updates.notes === 'string') meta.notes = updates.notes;

        // ---- Edge-level fields (startYear) ----
        if (updates.startYear !== undefined &&
            updates.startYear !== rel.startYear) {

            if (typeof updates.startYear !== 'number' || !isFinite(updates.startYear)) {
                return fail('INVALID_START_YEAR', 'startYear must be a finite number');
            }

            var fieldResult = _professionalCommands().updateEdgeFields(rel.id, {
                startYear: updates.startYear
            });
            if (!fieldResult.success) {
                return fail(fieldResult.code || 'START_YEAR_UPDATE_FAILED',
                    fieldResult.message || 'Failed to update start year');
            }
        }

        // ---- Metadata (one call, after all metadata changes are staged) ----
        var metaResult = _professionalCommands().updateEdgeMetadata(rel.id, meta);
        if (!metaResult.success) {
            return fail(metaResult.code || 'METADATA_UPDATE_FAILED',
                metaResult.message || 'Failed to update apprenticeship metadata');
        }

        // ---- Status ----
        if (updates.status) {
            var statusResult = _professionalCommands().endEdge(
                rel.id, _getCurrentYear(), updates.status
            );
            if (!statusResult.success) {
                return fail(statusResult.code || 'STATUS_UPDATE_FAILED',
                    statusResult.message || 'Failed to update apprenticeship status');
            }
        }

        _commitAndNotify({
            action: 'updateApprenticeship',
            masterId: masterId,
            apprenticeId: apprenticeId,
            roleId: meta.roleId,
            relationshipId: rel.id
        });

        return ok({
            apprenticeship: _queries().getApprenticeshipDetails(
                masterId, apprenticeId, meta.roleId
            )
        });
    }

    // =========================================================================
    // 8. PROGRESS
    // =========================================================================

    function progressApprenticeship(masterId, apprenticeId, amount) {
        amount = amount != null ? amount : TEACH.DEFAULT_PROGRESS_GAIN;

        var rel = _queries().getOngoingApprenticeship(masterId, apprenticeId);
        if (!rel) return fail('NOT_FOUND', 'No ongoing apprenticeship');

        var meta = _readMetadata(rel);
        if (!meta.roleId) return fail('NO_ROLE', 'Apprenticeship has no role');

        var currentSkill = _getSkill(apprenticeId, meta.roleId);
        if (currentSkill === null) currentSkill = 0;

        var newSkill = _rules().clampSkill(currentSkill + amount);
        var newStage = _rules().getStageForSkill(newSkill);

        var updateResult = _characterCommands().updateProfession(
            apprenticeId, meta.roleId, { skillLevel: newSkill }
        );
        if (!updateResult || !updateResult.success) {
            return fail(
                'SKILL_UPDATE_FAILED',
                (updateResult && updateResult.reason) || 'Failed to update profession skill'
            );
        }

        meta.stage = newStage.id;
        meta.teachingHistory.push({
            type: 'progress',
            gain: newSkill - currentSkill,
            newLevel: newSkill,
            year: _getCurrentYear()
        });

        var metaResult = _professionalCommands().updateEdgeMetadata(rel.id, meta);
        if (!metaResult.success) {
            return fail(metaResult.code || 'METADATA_UPDATE_FAILED',
                metaResult.message || 'Failed to update apprenticeship metadata');
        }

        _commitAndNotify({
            action: 'progressApprenticeship',
            masterId: masterId,
            apprenticeId: apprenticeId,
            roleId: meta.roleId,
            relationshipId: rel.id
        });

        return ok({
            oldSkill: currentSkill,
            newSkill: newSkill,
            gained: newSkill - currentSkill,
            stage: newStage,
            eligibleForCompletion: newSkill >= TEACH.COMPLETION_SKILL
        });
    }

    // =========================================================================
    // 9. TEACH
    // =========================================================================

    function teachSkill(masterId, apprenticeId, methodId) {
        var rel = _queries().getOngoingApprenticeship(masterId, apprenticeId);
        if (!rel) return fail('NOT_FOUND', 'No ongoing apprenticeship');

        var meta = _readMetadata(rel);
        if (!meta.roleId) return fail('NO_ROLE', 'Apprenticeship has no role');

        var masterSkill = _getSkill(masterId, meta.roleId);
        if (masterSkill === null) masterSkill = 0;
        if (!_rules().canTeach(masterSkill)) {
            return fail('MASTER_SKILL_TOO_LOW', 'Master lacks skill to teach');
        }

        var methods = window.SKILL_TRANSFER_METHODS || {};
        var method = null;
        for (var key in methods) {
            if (Object.prototype.hasOwnProperty.call(methods, key) &&
                methods[key].id === methodId) {
                method = methods[key];
                break;
            }
        }
        if (!method) return fail('UNKNOWN_METHOD', 'Unknown teaching method: ' + methodId);

        var currentSkill = _getSkill(apprenticeId, meta.roleId);
        if (currentSkill === null) currentSkill = 0;

        var outcome = _rules().calculateTeachingOutcome({
            currentSkill: currentSkill,
            method: method,
            roll: _roll()
        });

        if (outcome.success) {
            var updateResult = _characterCommands().updateProfession(
                apprenticeId, meta.roleId, { skillLevel: outcome.newSkill }
            );
            if (!updateResult || !updateResult.success) {
                return fail(
                    'SKILL_UPDATE_FAILED',
                    (updateResult && updateResult.reason) || 'Failed to update profession skill'
                );
            }
            meta.stage = _rules().getStageForSkill(outcome.newSkill).id;
        }

        meta.teachingHistory.push({
            type: 'teach_skill',
            method: methodId,
            success: outcome.success,
            gain: outcome.gain,
            newLevel: outcome.newSkill,
            year: _getCurrentYear()
        });

        var metaResult = _professionalCommands().updateEdgeMetadata(rel.id, meta);
        if (!metaResult.success) {
            return fail(metaResult.code || 'METADATA_UPDATE_FAILED',
                metaResult.message || 'Failed to update apprenticeship metadata');
        }

        _commitAndNotify({
            action: 'teachSkill',
            masterId: masterId,
            apprenticeId: apprenticeId,
            roleId: meta.roleId,
            methodId: methodId,
            relationshipId: rel.id
        });

        return ok({
            success: outcome.success,
            gain: outcome.gain,
            newSkill: outcome.newSkill,
            oldSkill: currentSkill,
            successChance: outcome.successChance,
            roll: outcome.roll,
            eligibleForCompletion: outcome.newSkill >= TEACH.COMPLETION_SKILL
        });
    }

    // =========================================================================
    // 10. TEACH SPECIALIZATION
    // =========================================================================

    function teachSpecialization(masterId, apprenticeId, specialization) {
        var rel = _queries().getOngoingApprenticeship(masterId, apprenticeId);
        if (!rel) return fail('NOT_FOUND', 'No ongoing apprenticeship');

        var meta = _readMetadata(rel);
        if (!meta.roleId) return fail('NO_ROLE', 'Apprenticeship has no role');

        var role = _getRoleById(meta.roleId);
        if (!role) return fail('ROLE_NOT_FOUND', 'Role not found: ' + meta.roleId);

        var specValidation = window.RoleRules.validateSpecialization(role, specialization);
        if (!specValidation.valid) {
            return fail(specValidation.code, specValidation.reason);
        }

        var addResult = _characterCommands().addProfessionSpecialization(
            apprenticeId, meta.roleId, specialization
        );
        if (!addResult || !addResult.success) {
            return fail(
                'SPECIALIZATION_ADD_FAILED',
                (addResult && addResult.reason) || 'Failed to add specialization'
            );
        }

        _commitAndNotify({
            action: 'teachSpecialization',
            masterId: masterId,
            apprenticeId: apprenticeId,
            roleId: meta.roleId,
            specialization: specialization,
            relationshipId: rel.id
        });

        var profession = _getProfession(apprenticeId, meta.roleId);
        return ok({
            specialization: specialization,
            specializations: profession && Array.isArray(profession.specs)
                ? profession.specs.slice()
                : []
        });
    }

    // =========================================================================
    // 11. COMPLETE
    // =========================================================================

    function completeApprenticeship(masterId, apprenticeId, roleId) {
        if (!roleId) {
            return fail('MISSING_ROLE', 'roleId is required to identify the apprenticeship');
        }

        var rel = _queries().getApprenticeship(masterId, apprenticeId, roleId);
        if (!rel) return fail('NOT_FOUND', 'Apprenticeship not found');

        var meta = _readMetadata(rel);
        var currentSkill = _getSkill(apprenticeId, meta.roleId);
        if (currentSkill === null) currentSkill = 0;

        var canComplete = _rules().canComplete({
            status: rel.status,
            skillLevel: currentSkill
        });
        if (!canComplete.valid) return fail(canComplete.code, canComplete.reason);

        meta.stage = _rules().getStageForSkill(currentSkill).id;

        var metaResult = _professionalCommands().updateEdgeMetadata(rel.id, meta);
        if (!metaResult.success) {
            return fail(metaResult.code || 'METADATA_UPDATE_FAILED',
                metaResult.message || 'Failed to update apprenticeship metadata');
        }

        var endResult = _professionalCommands().endEdge(
            rel.id, _getCurrentYear(), 'completed'
        );
        if (!endResult.success) {
            return fail(endResult.code || 'END_FAILED',
                endResult.message || 'Failed to end apprenticeship');
        }

        _commitAndNotify({
            action: 'completeApprenticeship',
            masterId: masterId,
            apprenticeId: apprenticeId,
            roleId: meta.roleId,
            relationshipId: rel.id
        });

        return ok({
            apprenticeship: _queries().getApprenticeshipDetails(
                masterId, apprenticeId, meta.roleId
            )
        });
    }

    // =========================================================================
    // 12. TERMINATE / CANCEL
    // =========================================================================

    function terminateApprenticeship(masterId, apprenticeId, roleId, reason) {
        if (!roleId) {
            return fail('MISSING_ROLE', 'roleId is required to identify the apprenticeship');
        }

        var rel = _queries().getApprenticeship(masterId, apprenticeId, roleId);
        if (!rel) return fail('NOT_FOUND', 'Apprenticeship not found');

        var transition = _rules().validateStatusTransition(rel.status, STATUS.ENDED);
        if (!transition.valid) return fail(transition.code, transition.reason);

        var endResult = _professionalCommands().endEdge(
            rel.id, _getCurrentYear(), reason || 'Terminated'
        );
        if (!endResult.success) {
            return fail(endResult.code || 'END_FAILED',
                endResult.message || 'Failed to end apprenticeship');
        }

        _commitAndNotify({
            action: 'terminateApprenticeship',
            masterId: masterId,
            apprenticeId: apprenticeId,
            roleId: roleId,
            relationshipId: rel.id
        });

        return ok({ terminated: true });
    }

    function cancelApprenticeship(masterId, apprenticeId, roleId, reason) {
        if (!roleId) {
            return fail('MISSING_ROLE', 'roleId is required to identify the apprenticeship');
        }

        var rel = _queries().getApprenticeship(masterId, apprenticeId, roleId);
        if (!rel) return fail('NOT_FOUND', 'Apprenticeship not found');
        if (rel.status === STATUS.CANCELLED) {
            return ok({ cancelled: true, alreadyCancelled: true });
        }

        var endResult = _professionalCommands().endEdge(
            rel.id, _getCurrentYear(), reason || 'Cancelled'
        );
        if (!endResult.success) {
            return fail(endResult.code || 'CANCEL_FAILED',
                endResult.message || 'Failed to cancel apprenticeship');
        }

        _commitAndNotify({
            action: 'cancelApprenticeship',
            masterId: masterId,
            apprenticeId: apprenticeId,
            roleId: roleId,
            relationshipId: rel.id
        });

        return ok({ cancelled: true });
    }

    // =========================================================================
    // 13. BATCH CLEANUP
    // =========================================================================

    function removeAllReferencesTo(characterId) {
        if (typeof characterId !== 'string' || characterId.length === 0) {
            return fail('MISSING_ID', 'characterId is required');
        }

        var asMaster = _queries().getApprenticeshipsByMaster(characterId);
        var asApprentice = _queries().getApprenticeshipsByApprentice(characterId);

        var ids = {};
        for (var i = 0; i < asMaster.length; i++) ids[asMaster[i].id] = true;
        for (var j = 0; j < asApprentice.length; j++) ids[asApprentice[j].id] = true;

        var removed = 0;
        for (var id in ids) {
            if (!Object.prototype.hasOwnProperty.call(ids, id)) continue;
            var result = _professionalCommands().removeEdge(id);
            if (result && result.success) removed++;
        }

        if (removed > 0) {
            _commitAndNotify({
                action: 'removeAllReferencesTo',
                characterId: characterId,
                removed: removed
            });
        }

        return ok({ removed: removed });
    }

    // =========================================================================
    // 14. ANNUAL ADVANCEMENT
    // =========================================================================

    function advanceApprenticeshipSkills(year) {
        year = year != null ? year : _getCurrentYear();
        var active = _queries().getActiveApprenticeships();
        if (!active.length) return ok({ year: year, advanced: [] });

        var advanced = [];
        for (var i = 0; i < active.length; i++) {
            var projected = active[i];
            if (!projected.roleId) continue;

            var masterSkill = _getSkill(projected.masterId, projected.roleId);
            if (masterSkill === null) masterSkill = 0;

            var currentSkill = _getSkill(projected.apprenticeId, projected.roleId);
            if (currentSkill === null) currentSkill = 0;

            var progress = _rules().calculateAnnualProgress({
                masterSkill: masterSkill,
                currentSkill: currentSkill
            });
            if (progress.gain <= 0) continue;

            var updateResult = _characterCommands().updateProfession(
                projected.apprenticeId, projected.roleId,
                { skillLevel: progress.newSkill }
            );
            if (!updateResult || !updateResult.success) continue;

            var rel = _queries().getApprenticeshipById(projected.id);
            if (!rel) continue;
            var meta = _readMetadata(rel);
            meta.stage = _rules().getStageForSkill(progress.newSkill).id;
            meta.teachingHistory.push({
                type: 'annual_advance',
                gain: progress.gain,
                newLevel: progress.newSkill,
                year: year
            });

            var metaResult = _professionalCommands().updateEdgeMetadata(rel.id, meta);
            if (!metaResult.success) continue;

            advanced.push({
                apprenticeshipId: rel.id,
                masterId: projected.masterId,
                apprenticeId: projected.apprenticeId,
                roleId: projected.roleId,
                oldSkill: currentSkill,
                newSkill: progress.newSkill,
                gained: progress.gain,
                eligibleForCompletion: progress.newSkill >= TEACH.COMPLETION_SKILL
            });
        }

        if (advanced.length > 0) {
            _commitAndNotify({
                action: 'advanceApprenticeshipSkills',
                year: year,
                count: advanced.length
            });
        }
        return ok({ year: year, advanced: advanced });
    }

    // =========================================================================
    // 15. CROSS-DOMAIN LISTENER
    // =========================================================================

    function _handleRoleDeleted(event) {
        var roleId = event && event.detail && event.detail.roleId;
        if (!roleId) return;

        var active;
        try {
            active = _queries().getApprenticeshipsByRole(roleId);
        } catch (err) {
            if (window.console && typeof window.console.error === 'function') {
                window.console.error(
                    'apprenticeship-commands: roleDeleted handler failed to ' +
                    'read apprenticeships for role ' + roleId + ':', err
                );
            }
            return;
        }

        for (var i = 0; i < active.length; i++) {
            var a = active[i];
            if (a.status !== STATUS.ONGOING) continue;
            cancelApprenticeship(
                a.masterId,
                a.apprenticeId,
                a.roleId,
                'Role deleted: ' + roleId
            );
        }
    }

    if (typeof window.addEventListener === 'function') {
        window.addEventListener('roleDeleted', _handleRoleDeleted);
    }

    // =========================================================================
    // 16. EXPORTS
    // =========================================================================

    window.ApprenticeshipCommands = {
        createApprenticeship: createApprenticeship,
        updateApprenticeship: updateApprenticeship,
        progressApprenticeship: progressApprenticeship,
        teachSkill: teachSkill,
        teachSpecialization: teachSpecialization,
        completeApprenticeship: completeApprenticeship,
        terminateApprenticeship: terminateApprenticeship,
        cancelApprenticeship: cancelApprenticeship,
        removeAllReferencesTo: removeAllReferencesTo,
        advanceApprenticeshipSkills: advanceApprenticeshipSkills
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.ApprenticeshipCommands;
    }
})();
