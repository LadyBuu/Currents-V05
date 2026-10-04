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
 *   4. Commits ONE transaction (via ProfessionalCommands, which commits
 *      the underlying relationship edge)
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
 *   This module owns the apprenticeship lifecycle: its creation, its
 *   progression, its teaching, its completion, and its termination. It
 *   does NOT own:
 *
 *     character.professions       → CharacterCommands
 *     relationship edges          → ProfessionalCommands (thin wrapper
 *                                    over RelationshipCommands)
 *     role catalogue              → RoleState / RoleQueries
 *     specialization membership   → RoleRules.validateSpecialization
 *     teaching policy             → ApprenticeshipRules
 *     edge read projections       → ApprenticeshipQueries / ProfessionalQueries
 *
 *   Skill progression and profession updates are written through
 *   CharacterCommands.updateProfession and CharacterCommands.addProfession.
 *
 *   Edge creation, metadata updates, and edge termination are written
 *   through ProfessionalCommands.createEdge, updateEdgeMetadata, endEdge.
 *
 *   ApprenticeshipCommands orchestrates; the owning modules write the data.
 *
 * METADATA SHAPE (owned by this module)
 *
 *   {
 *     roleId: string,
 *     roleName: string,
 *     startSkill: number,
 *     stage: string,                    // stage id, refreshed on write
 *     teachingHistory: Array,
 *     notes: string
 *   }
 *
 *   Note: there is NO metadata.skillLevel. The canonical skill lives on
 *   the profession record (character.professions[i].skillLevel) and is
 *   read via CharacterCommands.getProfession. There is also NO
 *   metadata.specializationsTaught. Specializations learned are stored
 *   on the profession record as `profession.specs`, owned by
 *   CharacterCommands.
 *
 * NOT PERMITTED in this file:
 *   - window.masterData direct manipulation
 *   - Direct writes to character.professions
 *   - Direct writes to RelationshipState
 *   - Math.random() (roll is injected from a canonical RNG)
 *   - Fallback dependencies
 *
 * DEPENDENCIES (must be loaded first):
 *   - apprenticeship-constants.js    (APPRENTICESHIP_STAGES, APPRENTICESHIP_STATUS, TEACHING_CONSTANTS)
 *   - apprenticeship-rules.js        (ApprenticeshipRules)
 *   - apprenticeship-queries.js      (ApprenticeshipQueries)
 *   - professional-commands.js       (ProfessionalCommands)
 *   - role-rules.js                  (RoleRules.validateSpecialization)
 *   - character-commands.js          (CharacterCommands)
 *   - accessors.js                   (getCharacterById, getRoleById)
 *   - time.js                        (getCurrentYearSafe)
 *   - storage.js                     (saveMasterData)
 *   - relationship-types.js          (RELATIONSHIP_ARCHETYPES, RELATIONSHIP_STATUS)
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
        typeof window.ProfessionalCommands.endEdge !== 'function' ||
        typeof window.ProfessionalCommands.removeEdge !== 'function') {
        throw new Error(
            'apprenticeship-commands.js requires professional-commands.js ' +
            '(ProfessionalCommands.createEdge/updateEdgeMetadata/endEdge/removeEdge) first.'
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

    /**
     * Reads the canonical skill for (characterId, roleId). Returns null if
     * the character does not hold the role.
     */
    function _getSkill(characterId, roleId) {
        return _queries().getSkillLevel(characterId, roleId);
    }

    /**
     * Reads the profession record for (characterId, roleId), or null.
     */
    function _getProfession(characterId, roleId) {
        return _characterCommands().getProfession(characterId, roleId);
    }

    /**
     * Returns the metadata of an apprenticeship, with defaults applied.
     */
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

    /**
     * Ensures the apprentice holds the role at the given skill level.
     * If they hold it at a higher level, leaves it alone. Never downgrades.
     */
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

    /**
     * @param {Object} args
     * @param {string} args.masterId
     * @param {string} args.apprenticeId
     * @param {string} args.roleId
     * @param {number} [args.startYear]
     * @param {number} [args.initialSkill]
     * @param {string} [args.notes]
     */
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

        // ---- Cross-domain: ensure the apprentice holds the profession ----
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

        // ---- Relationship edge ----
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
            return fail(edge.code || 'EDGE_CREATE_FAILED', edge.message || 'Failed to create apprenticeship');
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
    // 7. UPDATE (details only — not progression)
    // =========================================================================

    /**
     * @param {string} masterId
     * @param {string} apprenticeId
     * @param {Object} updates
     * @param {string} updates.roleId    REQUIRED
     * @param {string} [updates.status]
     * @param {number} [updates.startYear]
     * @param {number} [updates.skillLevel]
     * @param {string} [updates.notes]
     */
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

        if (typeof updates.notes === 'string') meta.notes = updates.notes;

        // Edge metadata patch. startYear/status are edge-level, not metadata.
        var metaResult = _professionalCommands().updateEdgeMetadata(rel.id, meta);
        if (!metaResult.success) {
            return fail(metaResult.code || 'METADATA_UPDATE_FAILED',
                metaResult.message || 'Failed to update apprenticeship metadata');
        }

        if (updates.status) {
            var statusResult = _professionalCommands().endEdge(
                rel.id, _getCurrentYear(), updates.status
            );
            if (!statusResult.success) {
                return fail(statusResult.code || 'STATUS_UPDATE_FAILED',
                    statusResult.message || 'Failed to update apprenticeship status');
            }
        } else if (updates.startYear !== undefined) {
            // startYear is edge-level; not currently exposed by ProfessionalCommands.
            // Leaving the caller's intent silently unmet is worse than failing.
            return fail(
                'START_YEAR_NOT_UPDATABLE',
                'startYear cannot be changed on an existing apprenticeship'
            );
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
    // 8. PROGRESS (skill +N)
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
    // 9. TEACH (single method application — roll is injected)
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

        // Return the current list from the profession record (canonical).
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

        // CANCELLED is a status value; the relationship registry may not
        // accept it directly. Fall back to endEdge with a reason that
        // records the intent. The status itself is set by the registry.
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

    /**
     * Removes every apprenticeship edge referencing the character, whether
     * as master or apprentice. Used by delete-cleanup. Emits one commit.
     *
     * @param {string} characterId
     */
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
    // 14. ANNUAL ADVANCEMENT (batch)
    // =========================================================================

    /**
     * Advance every active apprenticeship by one year of training.
     *
     * Each skill write goes through CharacterCommands.updateProfession.
     * The relationship metadata is updated once per apprenticeship via
     * ProfessionalCommands.updateEdgeMetadata. The commit fires once at
     * the end of the batch.
     */
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
    //
    // When a role is deleted, every apprenticeship referencing that role
    // must be cancelled. RoleCommands dispatches 'roleDeleted'. We listen.

    function _handleRoleDeleted(event) {
        var roleId = event && event.detail && event.detail.roleId;
        if (!roleId) return;

        var active;
        try {
            active = _queries().getApprenticeshipsByRole(roleId);
        } catch (err) {
            // A query failure here must not silently skip the cleanup.
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
            // Each cancel commits and notifies. Acceptable for now; batch
            // later if the notification volume becomes a problem.
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
