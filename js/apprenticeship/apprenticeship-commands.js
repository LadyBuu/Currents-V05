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
 *     specialization membership   → inline _validateSpecialization
 *     teaching policy             → ApprenticeshipRules
 *
 * SPECIALIZATION VALIDATION
 *
 *   Specialization membership validation used to live in role-rules.js as
 *   RoleRules.validateSpecialization. role-rules.js has been removed as
 *   dead code (it was never called by role-commands.js, which validated
 *   inline). The membership check now lives in this module as
 *   _validateSpecialization, which is the sole validator for the
 *   apprenticeship domain's use of role.specializations.
 *
 *   The check is narrow: it verifies that `specialization` appears in
 *   `role.specializations`. It does NOT validate that the role exists
 *   (that is checked by the caller before this function runs), and it
 *   does NOT consult any other domain's rules.
 *
 * ROLE READS
 *
 *   Two role-read intents exist in this module and are handled separately:
 *
 *     _getRoleById(id)          — LENIENT. Used only for display-name
 *                                 resolution. Prefers RoleState.getRole
 *                                 (returns clones). Falls back to
 *                                 window.getRoleById ONLY when RoleState
 *                                 is unavailable. After the role-system.js
 *                                 compatibility shim loads, window.getRoleById
 *                                 also resolves to RoleState.getRole (clones),
 *                                 so the fallback is a compatibility path,
 *                                 not a live-record path. Callers must
 *                                 tolerate a null return.
 *
 *     _requireRoleForWrite(id)  — STRICT. Used by write paths that must
 *                                 have the role record. Throws when the
 *                                 role is missing.
 *
 *   This matches education-commands.js's _getRoleById / _requireRoleForWrite
 *   split.
 *
 * PERSISTENCE
 *
 *   Commands in this module do NOT call saveMasterData. They mutate
 *   in-memory state (via CharacterCommands, RoleCommands, and
 *   ProfessionalCommands), which in turn mark data dirty through
 *   RelationshipState and the character mutation boundary. The caller
 *   is responsible for calling ApprenticeshipCommands.persist() exactly
 *   once per batch, after every command in the batch has succeeded.
 *
 *   Modal callers (modals-apprenticeship.js) call persist() once per
 *   user action, at the end of the successful command chain. Batch
 *   callers (advanceApprenticeshipSkills, the annual pipeline) call
 *   persist() once at the end.
 *
 *   persist() returns { success, reason }. On saveMasterData() returning
 *   false, it reads window.getLastSaveError() for the underlying error.
 *   This matches RoleCommands.persist() and EducationCommands.persist().
 *
 * SKILL PROGRESSION
 *
 *   Role skill progression routes through
 *   RoleCommands.recordCharacterSkillProgress, not
 *   CharacterCommands.updateProfession. The former enforces the
 *   non-decreasing invariant; the latter is a blind write (the
 *   administrative override path). Prior revisions called
 *   updateProfession directly, which meant an apprenticeship write could
 *   lower a character's canonical role skill if it read a stale value.
 *   The invariant is now enforced by the role domain, not re-implemented
 *   here. See RoleCommands.recordCharacterSkillProgress.
 *
 *   Role creation (when a character does not yet hold a role and the
 *   apprenticeship grants it) still calls CharacterCommands.addProfession.
 *   That is a creation, not a progression; the invariant does not apply.
 *
 * RANDOMNESS
 *
 *   Rolls go through window.Random.next (the canonical RNG stream used
 *   by affair-commands.js, jealousy-commands.js, and
 *   relationship-integrations.js). A legacy window.randomNext fallback
 *   is honoured for older callers, matching
 *   relationship-integrations.js. There is no Math.random() call and no
 *   window.RNG reference (window.RNG does not exist in this tree).
 *
 * METADATA SHAPE (owned by this module)
 *
 *   {
 *     roleId: string,
 *     roleName: string,
 *     startSkill: number,
 *     stage: string,
 *     teachingHistory: Array,   // unbounded growth; see education-doc §10
 *     notes: string
 *   }
 *
 *   startYear is an EDGE field, not metadata. It is patched through
 *   ProfessionalCommands.updateEdgeFields.
 *
 * MULTI-ROLE DISAMBIGUATION
 *
 *   A character may have concurrent apprenticeships with multiple masters
 *   for different roles. The singular query
 *   getOngoingApprenticeship(masterId, apprenticeId) throws when the pair
 *   has more than one ongoing apprenticeship (see
 *   apprenticeship-queries.js's ROLEID CONTRACT).
 *
 *   To avoid the throw, progressApprenticeship, teachSkill, and
 *   teachSpecialization accept an OPTIONAL roleId argument. When supplied,
 *   the command disambiguates. When omitted and the pair has multiple
 *   ongoing apprenticeships, the command returns
 *   { success: false, code: 'MULTIPLE_ROLES' } — a structured failure,
 *   not an exception.
 *
 * PARTIAL-TRANSACTION ROLLBACK
 *
 *   createApprenticeship writes a profession record to the apprentice
 *   BEFORE creating the apprenticeship edge. If the edge creation fails,
 *   the profession write is a half-transaction: the apprentice now holds
 *   a role they did not have, or has a higher skill than before.
 *
 *   The command captures the pre-state (existedBefore, previousSkillLevel)
 *   and, on edge creation failure, restores it: updateProfession back to
 *   previousSkillLevel if existedBefore; removeProfession if not. Revert
 *   failures are logged but do not change the returned result — the edge
 *   failure is the reported outcome. This is the same half-transaction
 *   discipline professional-knowledge-commands.js documents for its
 *   death-cascade caller.
 *
 * DEPENDENCIES (must be loaded first):
 *   - apprenticeship-constants.js
 *   - apprenticeship-rules.js
 *   - apprenticeship-queries.js
 *   - professional-commands.js
 *   - character-commands.js
 *   - role-commands.js      (recordCharacterSkillProgress)
 *   - accessors.js
 *   - time.js               (getCurrentYear)
 *   - storage.js            (saveMasterData, getLastSaveError)
 *   - relationship-types.js
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - Role reads split into _getRoleById (lenient, display-only) and
 *       _requireRoleForWrite (strict, write paths). Prior revisions used
 *       a single lenient helper. See ROLE READS.
 *     - progressApprenticeship, teachSkill, teachSpecialization accept
 *       an optional roleId. When omitted and the pair has multiple
 *       ongoing apprenticeships, they return
 *       { code: 'MULTIPLE_ROLES' } instead of letting the query throw.
 *       See MULTI-ROLE DISAMBIGUATION.
 *     - Skill progression now routes through
 *       RoleCommands.recordCharacterSkillProgress instead of
 *       CharacterCommands.updateProfession. This enforces the
 *       non-decreasing invariant at the domain layer, matching the
 *       deferred consolidation in education-doc §9. Role creation
 *       (addProfession) is unchanged. See SKILL PROGRESSION.
 *     - _handleRoleDeleted wraps each cancelApprenticeship in a
 *       try/catch and calls persist() once after the loop. Prior
 *       revisions let a single throw abort the loop, orphaning the
 *       remaining apprenticeships. See _handleRoleDeleted.
 *     - updateApprenticeship gates updateEdgeMetadata on metaChanged.
 *       Prior revisions always wrote metadata, even for status-only or
 *       startYear-only updates.
 *     - updateApprenticeship's endEdge call now runs only when
 *       updates.status actually differs from rel.status. Prior revisions
 *       called endEdge even for a same-status no-op, which likely failed
 *       or corrupted the edge.
 *     - createApprenticeship captures the profession pre-state and
 *       restores it on edge creation failure. See PARTIAL-TRANSACTION
 *       ROLLBACK.
 *     - No other behavioural change.
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
    if (!window.CharacterCommands) {
        throw new Error(
            'apprenticeship-commands.js requires character-commands.js first.'
        );
    }
    if (!window.RoleCommands ||
        typeof window.RoleCommands.recordCharacterSkillProgress !== 'function') {
        throw new Error(
            'apprenticeship-commands.js requires role-commands.js ' +
            '(RoleCommands.recordCharacterSkillProgress) first.'
        );
    }
    if (!window.RELATIONSHIP_ARCHETYPES || !window.RELATIONSHIP_STATUS) {
        throw new Error(
            'apprenticeship-commands.js requires relationship-types.js first.'
        );
    }

    var _REQUIRED_CHARACTER_METHODS = [
        'getProfession',
        'updateProfession',
        'addProfession',
        'addProfessionSpecialization',
        'removeProfession'
    ];
    for (var _cm = 0; _cm < _REQUIRED_CHARACTER_METHODS.length; _cm++) {
        var _methodName = _REQUIRED_CHARACTER_METHODS[_cm];
        if (typeof window.CharacterCommands[_methodName] !== 'function') {
            throw new Error(
                'apprenticeship-commands.js requires ' +
                'CharacterCommands.' + _methodName + ' (load character-commands.js first).'
            );
        }
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

    /**
     * LENIENT role read. Display-name resolution only.
     * Prefers RoleState.getRole (clones). Falls back to window.getRoleById
     * (which under the documented load order is also RoleState.getRole via
     * role-system.js). Returns null when neither is available.
     * See ROLE READS in the header.
     */
    function _getRoleById(id) {
        if (!id) return null;
        if (window.RoleState && typeof window.RoleState.getRole === 'function') {
            return window.RoleState.getRole(id);
        }
        if (typeof window.getRoleById === 'function') {
            return window.getRoleById(id);
        }
        return null;
    }

    /**
     * STRICT role read. Throws when the role is missing or no reader is
     * available. See ROLE READS in the header.
     */
    function _requireRoleForWrite(id) {
        if (!id || typeof id !== 'string') {
            throw new Error('ApprenticeshipCommands: role id is required for write');
        }
        var role = _getRoleById(id);
        if (!role) {
            throw new Error('ApprenticeshipCommands: role not found: ' + id);
        }
        return role;
    }

    function _getCurrentYear() {
        if (typeof window.getCurrentYear !== 'function') {
            throw new Error('ApprenticeshipCommands: missing getCurrentYear');
        }
        return window.getCurrentYear();
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

    function _roleCommands() {
        return window.RoleCommands;
    }

    function _roll() {
        if (window.Random && typeof window.Random.next === 'function') {
            return window.Random.next();
        }
        if (typeof window.randomNext === 'function') {
            return window.randomNext();
        }
        throw new Error(
            'ApprenticeshipCommands: canonical RNG (window.Random.next or ' +
            'window.randomNext) not available.'
        );
    }

    // =========================================================================
    // 3. SPECIALIZATION VALIDATION
    // =========================================================================

    function _validateSpecialization(role, specialization) {
        if (!role || typeof role !== 'object') {
            return {
                valid: false,
                code: 'MISSING_ROLE',
                reason: 'Role is required.'
            };
        }
        if (typeof specialization !== 'string' || specialization.trim() === '') {
            return {
                valid: false,
                code: 'MISSING_SPECIALIZATION',
                reason: 'Specialization must be a non-empty string.'
            };
        }
        if (!Array.isArray(role.specializations)) {
            return {
                valid: false,
                code: 'ROLE_HAS_NO_SPECIALIZATIONS',
                reason: 'Role "' + (role.name || role.id) +
                        '" has no specialization catalogue.'
            };
        }
        var target = specialization.trim();
        for (var i = 0; i < role.specializations.length; i++) {
            if (role.specializations[i] === target) {
                return { valid: true };
            }
        }
        return {
            valid: false,
            code: 'UNKNOWN_SPECIALIZATION',
            reason: 'Specialization "' + target + '" is not registered on role "' +
                    (role.name || role.id) + '".'
        };
    }

    // =========================================================================
    // 4. NOTIFICATION
    // =========================================================================

    function _notify(eventName, payload) {
        if (typeof window.dispatchEvent === 'function' &&
            typeof window.CustomEvent === 'function') {
            window.dispatchEvent(new CustomEvent(eventName, { detail: payload || {} }));
        }
    }

    function _commitAndNotify(payload) {
        _notify('apprenticeshipUpdated', payload);
        _notify('characterUpdated', payload);
    }

    // =========================================================================
    // 5. PERSISTENCE
    // =========================================================================

    function persist() {
        if (typeof window.saveMasterData !== 'function') {
            return { success: false, reason: 'saveMasterData is not available.' };
        }
        try {
            var ok = window.saveMasterData();
            if (ok === true) return { success: true };
            var reason = 'saveMasterData returned false';
            if (typeof window.getLastSaveError === 'function') {
                var err = window.getLastSaveError();
                if (err && err.message) reason = err.message;
            }
            return { success: false, reason: reason };
        } catch (e) {
            return {
                success: false,
                reason: e && e.message ? e.message : 'saveMasterData threw'
            };
        }
    }

    // =========================================================================
    // 6. RESULT HELPERS
    // =========================================================================

    function ok(data)           { return { success: true, data: data }; }
    function fail(code, reason) { return { success: false, code: code, reason: reason }; }

    // =========================================================================
    // 7. SHARED HELPERS
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

    /**
     * Ensures the apprentice's profession record is at least at
     * `skillLevel`.
     *
     * Two paths:
     *   - profession exists:  call RoleCommands.recordCharacterSkillProgress
     *                         (non-decreasing invariant enforced by role domain)
     *   - profession missing: call CharacterCommands.addProfession (creation,
     *                         not progression; invariant does not apply)
     *
     * Returns { success, updated, existedBefore, previousSkillLevel, profession }.
     * existedBefore and previousSkillLevel are captured for the caller's
     * partial-transaction rollback (see PARTIAL-TRANSACTION ROLLBACK).
     */
    function _ensureProfession(characterId, roleId, roleName, roleBaseSalary,
                                skillLevel, startYear, notes) {
        var CC = _characterCommands();
        var existing = CC.getProfession(characterId, roleId);

        if (existing) {
            var previousSkillLevel = typeof existing.skillLevel === 'number'
                ? existing.skillLevel
                : 0;

            if (previousSkillLevel >= skillLevel) {
                return {
                    success: true,
                    updated: false,
                    existedBefore: true,
                    previousSkillLevel: previousSkillLevel,
                    profession: existing
                };
            }

            var progressResult = _roleCommands().recordCharacterSkillProgress(
                characterId, roleId, skillLevel
            );
            if (!progressResult || progressResult.success !== true) {
                return {
                    success: false,
                    reason: (progressResult && progressResult.reason)
                        ? progressResult.reason
                        : 'Failed to record skill progression'
                };
            }

            return {
                success: true,
                updated: progressResult.unchanged !== true,
                existedBefore: true,
                previousSkillLevel: previousSkillLevel,
                profession: CC.getProfession(characterId, roleId)
            };
        }

        var baseSalary = (typeof roleBaseSalary === 'number' && isFinite(roleBaseSalary))
            ? roleBaseSalary
            : 0;

        var addResult = CC.addProfession(characterId, {
            id: roleId,
            name: roleName,
            skillLevel: skillLevel,
            startYear: startYear,
            primary: false,
            notes: notes || '',
            specs: [],
            baseSalary: baseSalary,
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
        return {
            success: true,
            updated: false,
            existedBefore: false,
            previousSkillLevel: null,
            profession: addResult.profession
        };
    }

    /**
     * Best-effort revert of _ensureProfession's effects on edge creation
     * failure. See PARTIAL-TRANSACTION ROLLBACK in the header.
     */
    function _revertEnsureProfession(characterId, roleId, capture) {
        if (!capture) return;
        var CC = _characterCommands();
        try {
            if (capture.existedBefore === true) {
                if (typeof capture.previousSkillLevel === 'number') {
                    CC.updateProfession(characterId, roleId, {
                        skillLevel: capture.previousSkillLevel
                    });
                }
            } else {
                if (typeof CC.removeProfession === 'function') {
                    CC.removeProfession(characterId, roleId);
                }
            }
        } catch (e) {
            if (window.console && typeof window.console.error === 'function') {
                window.console.error(
                    'apprenticeship-commands: revert of profession write failed for ' +
                    characterId + '/' + roleId + ':', e
                );
            }
        }
    }

    // =========================================================================
    // 8. CREATE
    // =========================================================================

    function createApprenticeship(args) {
        args = args || {};

        var master = _getCharacterById(args.masterId);
        var apprentice = _getCharacterById(args.apprenticeId);
        var role = args.roleId ? _getRoleById(args.roleId) : null;

        if (!master) return fail('MASTER_NOT_FOUND', 'Master not found');
        if (!apprentice) return fail('APPRENTICE_NOT_FOUND', 'Apprentice not found');
        if (!role) return fail('ROLE_NOT_FOUND', 'Role not found: ' + args.roleId);

        var startYear = (args.startYear !== undefined && args.startYear !== null)
            ? args.startYear
            : _getCurrentYear();
        if (typeof startYear !== 'number' || !isFinite(startYear)) {
            return fail('INVALID_START_YEAR', 'startYear must be a finite number');
        }

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
        var initialStage = _rules().getStageForSkill(resolvedInitialSkill);

        // Profession write is the preparatory step. Capture pre-state
        // for the edge-failure revert. See PARTIAL-TRANSACTION ROLLBACK.
        var ensure = _ensureProfession(
            apprentice.id,
            role.id,
            role.name,
            role.baseSalary,
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
            // Edge creation is the atomic commit point. Revert the
            // preparatory profession write. See PARTIAL-TRANSACTION
            // ROLLBACK.
            _revertEnsureProfession(apprentice.id, role.id, ensure);
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
    // 9. UPDATE
    // =========================================================================

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
        var metaChanged = false;

        var statusChanged = false;
        if (updates.status && updates.status !== rel.status) {
            var transition = _rules().validateStatusTransition(rel.status, updates.status);
            if (!transition.valid) return fail(transition.code, transition.reason);
            statusChanged = true;
        }

        // ---- Skill ----
        if (updates.skillLevel !== undefined) {
            if (!_rules().isSkillInRange(updates.skillLevel)) {
                return fail('INVALID_SKILL', 'Skill must be 0-100');
            }
            var progressResult = _roleCommands().recordCharacterSkillProgress(
                apprenticeId, meta.roleId, updates.skillLevel
            );
            if (!progressResult || progressResult.success !== true) {
                return fail(
                    'SKILL_UPDATE_FAILED',
                    (progressResult && progressResult.reason)
                        ? progressResult.reason
                        : 'Skill update failed'
                );
            }
            var newStage = _rules().getStageForSkill(updates.skillLevel).id;
            if (meta.stage !== newStage) {
                meta.stage = newStage;
                metaChanged = true;
            }
        }

        // ---- Notes ----
        if (typeof updates.notes === 'string' && updates.notes !== meta.notes) {
            meta.notes = updates.notes;
            metaChanged = true;
        }

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

        // ---- Metadata (conditional write) ----
        if (metaChanged) {
            var metaResult = _professionalCommands().updateEdgeMetadata(rel.id, meta);
            if (!metaResult.success) {
                return fail(metaResult.code || 'METADATA_UPDATE_FAILED',
                    metaResult.message || 'Failed to update apprenticeship metadata');
            }
        }

        // ---- Status (only when it actually changed) ----
        if (statusChanged) {
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
    // 10. PROGRESS
    // =========================================================================

    /**
     * Advances the apprentice's skill by `amount`.
     *
     * roleId is OPTIONAL. When supplied, disambiguates multi-role pairs.
     * When omitted and the pair has multiple ongoing apprenticeships,
     * returns { code: 'MULTIPLE_ROLES' } rather than throwing.
     * See MULTI-ROLE DISAMBIGUATION.
     */
    function progressApprenticeship(masterId, apprenticeId, amount, roleId) {
        amount = amount != null ? amount : TEACH.DEFAULT_PROGRESS_GAIN;

        var rel;
        if (roleId) {
            rel = _queries().getApprenticeship(masterId, apprenticeId, roleId);
            if (!rel) return fail('NOT_FOUND', 'No ongoing apprenticeship for role ' + roleId);
            if (rel.status !== STATUS.ONGOING) {
                return fail('NOT_ONGOING', 'Apprenticeship is not ongoing');
            }
        } else {
            try {
                rel = _queries().getOngoingApprenticeship(masterId, apprenticeId);
            } catch (e) {
                return fail('MULTIPLE_ROLES',
                    'Multiple ongoing apprenticeships between ' + masterId +
                    ' and ' + apprenticeId + '; pass roleId to disambiguate.');
            }
            if (!rel) return fail('NOT_FOUND', 'No ongoing apprenticeship');
        }

        var meta = _readMetadata(rel);
        if (!meta.roleId) return fail('NO_ROLE', 'Apprenticeship has no role');

        var currentSkill = _getSkill(apprenticeId, meta.roleId);
        if (currentSkill === null) currentSkill = 0;

        var newSkill = _rules().clampSkill(currentSkill + amount);
        var newStage = _rules().getStageForSkill(newSkill);

        var progressResult = _roleCommands().recordCharacterSkillProgress(
            apprenticeId, meta.roleId, newSkill
        );
        if (!progressResult || progressResult.success !== true) {
            return fail(
                'SKILL_UPDATE_FAILED',
                (progressResult && progressResult.reason)
                    ? progressResult.reason
                    : 'Failed to update profession skill'
            );
        }

        // If the invariant held (unchanged), the effective gain is 0.
        var effectiveNewSkill = progressResult.unchanged === true
            ? currentSkill
            : newSkill;

        meta.stage = _rules().getStageForSkill(effectiveNewSkill).id;
        meta.teachingHistory.push({
            type: 'progress',
            gain: effectiveNewSkill - currentSkill,
            newLevel: effectiveNewSkill,
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
            newSkill: effectiveNewSkill,
            gained: effectiveNewSkill - currentSkill,
            stage: newStage,
            eligibleForCompletion: effectiveNewSkill >= TEACH.COMPLETION_SKILL
        });
    }

    // =========================================================================
    // 11. TEACH
    // =========================================================================

    /**
     * Teaches a skill. roleId is OPTIONAL; see progressApprenticeship.
     */
    function teachSkill(masterId, apprenticeId, methodId, roleId) {
        var rel;
        if (roleId) {
            rel = _queries().getApprenticeship(masterId, apprenticeId, roleId);
            if (!rel) return fail('NOT_FOUND', 'No ongoing apprenticeship for role ' + roleId);
            if (rel.status !== STATUS.ONGOING) {
                return fail('NOT_ONGOING', 'Apprenticeship is not ongoing');
            }
        } else {
            try {
                rel = _queries().getOngoingApprenticeship(masterId, apprenticeId);
            } catch (e) {
                return fail('MULTIPLE_ROLES',
                    'Multiple ongoing apprenticeships between ' + masterId +
                    ' and ' + apprenticeId + '; pass roleId to disambiguate.');
            }
            if (!rel) return fail('NOT_FOUND', 'No ongoing apprenticeship');
        }

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

        var effectiveNewSkill = currentSkill;
        if (outcome.success) {
            var progressResult = _roleCommands().recordCharacterSkillProgress(
                apprenticeId, meta.roleId, outcome.newSkill
            );
            if (!progressResult || progressResult.success !== true) {
                return fail(
                    'SKILL_UPDATE_FAILED',
                    (progressResult && progressResult.reason)
                        ? progressResult.reason
                        : 'Failed to update profession skill'
                );
            }
            effectiveNewSkill = progressResult.unchanged === true
                ? currentSkill
                : outcome.newSkill;
            meta.stage = _rules().getStageForSkill(effectiveNewSkill).id;
        }

        meta.teachingHistory.push({
            type: 'teach_skill',
            method: methodId,
            success: outcome.success,
            gain: effectiveNewSkill - currentSkill,
            newLevel: effectiveNewSkill,
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
            gain: effectiveNewSkill - currentSkill,
            newSkill: effectiveNewSkill,
            oldSkill: currentSkill,
            successChance: outcome.successChance,
            roll: outcome.roll,
            eligibleForCompletion: effectiveNewSkill >= TEACH.COMPLETION_SKILL
        });
    }

    // =========================================================================
    // 12. TEACH SPECIALIZATION
    // =========================================================================

    /**
     * Teaches a specialization. roleId is OPTIONAL; see
     * progressApprenticeship.
     */
    function teachSpecialization(masterId, apprenticeId, specialization, roleId) {
        var rel;
        if (roleId) {
            rel = _queries().getApprenticeship(masterId, apprenticeId, roleId);
            if (!rel) return fail('NOT_FOUND', 'No ongoing apprenticeship for role ' + roleId);
            if (rel.status !== STATUS.ONGOING) {
                return fail('NOT_ONGOING', 'Apprenticeship is not ongoing');
            }
        } else {
            try {
                rel = _queries().getOngoingApprenticeship(masterId, apprenticeId);
            } catch (e) {
                return fail('MULTIPLE_ROLES',
                    'Multiple ongoing apprenticeships between ' + masterId +
                    ' and ' + apprenticeId + '; pass roleId to disambiguate.');
            }
            if (!rel) return fail('NOT_FOUND', 'No ongoing apprenticeship');
        }

        var meta = _readMetadata(rel);
        if (!meta.roleId) return fail('NO_ROLE', 'Apprenticeship has no role');

        var role = _getRoleById(meta.roleId);
        if (!role) return fail('ROLE_NOT_FOUND', 'Role not found: ' + meta.roleId);

        var specValidation = _validateSpecialization(role, specialization);
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
    // 13. COMPLETE
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
    // 14. TERMINATE / CANCEL
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
        if (rel.status === 'cancelled') {
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
    // 15. BATCH CLEANUP
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
    // 16. ANNUAL ADVANCEMENT
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

            var progressResult = _roleCommands().recordCharacterSkillProgress(
                projected.apprenticeId, projected.roleId, progress.newSkill
            );
            if (!progressResult || progressResult.success !== true) continue;

            var effectiveNewSkill = progressResult.unchanged === true
                ? currentSkill
                : progress.newSkill;
            if (effectiveNewSkill <= currentSkill) continue;

            var rel = _queries().getApprenticeshipById(projected.id);
            if (!rel) continue;
            var meta = _readMetadata(rel);
            meta.stage = _rules().getStageForSkill(effectiveNewSkill).id;
            meta.teachingHistory.push({
                type: 'annual_advance',
                gain: effectiveNewSkill - currentSkill,
                newLevel: effectiveNewSkill,
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
                newSkill: effectiveNewSkill,
                gained: effectiveNewSkill - currentSkill,
                eligibleForCompletion: effectiveNewSkill >= TEACH.COMPLETION_SKILL
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
    // 17. CROSS-DOMAIN LISTENER
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

        var cancelled = 0;
        var failed = 0;
        for (var i = 0; i < active.length; i++) {
            var a = active[i];
            if (a.status !== STATUS.ONGOING) continue;
            try {
                var result = cancelApprenticeship(
                    a.masterId,
                    a.apprenticeId,
                    a.roleId,
                    'Role deleted: ' + roleId
                );
                if (result.success) cancelled++;
                else failed++;
            } catch (e) {
                failed++;
                if (window.console && typeof window.console.error === 'function') {
                    window.console.error(
                        'apprenticeship-commands: cancelApprenticeship threw during ' +
                        'roleDeleted handler for apprenticeship ' + a.id + ':', e
                    );
                }
            }
        }

        if (cancelled > 0) {
            var persistResult = persist();
            if (!persistResult.success) {
                if (window.console && typeof window.console.error === 'function') {
                    window.console.error(
                        'apprenticeship-commands: persist failed after roleDeleted ' +
                        'cancelled ' + cancelled + ' apprenticeship(s):', persistResult.reason
                    );
                }
            }
        }

        if (failed > 0 && window.console && typeof window.console.warn === 'function') {
            window.console.warn(
                'apprenticeship-commands: roleDeleted handler cancelled ' +
                cancelled + ' apprenticeship(s), ' + failed + ' failed.'
            );
        }
    }

    if (typeof window.addEventListener === 'function') {
        window.addEventListener('roleDeleted', _handleRoleDeleted);
    }

    // =========================================================================
    // 18. EXPORTS
    // =========================================================================

    window.ApprenticeshipCommands = {
        persist: persist,

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
