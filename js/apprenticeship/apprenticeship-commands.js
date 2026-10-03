/**
 * =============================================================================
 * STILL WATERS - APPRENTICESHIP COMMANDS
 * js/apprenticeship/apprenticeship-commands.js
 * =============================================================================
 *
 * Mutating operations. Each public command:
 *   1. Reads facts via Queries
 *   2. Validates via Rules
 *   3. Applies mutations
 *   4. Commits ONE transaction
 *   5. Dispatches ONE notification
 *   6. Returns a structured result
 *
 * Contract (all commands):
 *   { success: true,  data: {...} }
 *   { success: false, code: '...', reason: '...' }
 *
 * NOT permitted in this file:
 *   - window.masterData direct manipulation
 *   - Math.random() (roll is injected from a canonical RNG)
 *   - Fallback dependencies
 *   - Cross-domain state mutation (use orchestrator for that)
 * =============================================================================
 */

(function () {
    'use strict';

    var STAGES = window.APPRENTICESHIP_STAGES || {};
    var STATUS = window.APPRENTICESHIP_STATUS || {};
    var TEACH  = window.TEACHING_CONSTANTS || {};

    // =========================================================================
    // 1. DEPENDENCIES (authoritative — fail loudly)
    // =========================================================================

    function _dep(name, fn) {
        if (typeof fn !== 'function') {
            throw new Error('ApprenticeshipCommands: missing dependency ' + name);
        }
        return fn;
    }
    function _getCharacterById(id)     { return _dep('getCharacterById', window.getCharacterById)(id); }
    function _getRoleById(id)          { return _dep('getRoleById', window.getRoleById)(id); }
    function _getCurrentYear()         { return _dep('getCurrentYearSafe', window.getCurrentYearSafe)(); }
    function _createRelationship(a,b,o){ return _dep('createRelationship', window.createRelationship)(a,b,o); }
    function _updateRelationship(id,u) { return _dep('updateRelationship', window.updateRelationship)(id,u); }
    function _endRelationship(id,y,r)  { return _dep('endRelationship', window.endRelationship)(id,y,r); }
    function _saveMasterData()         { return _dep('saveMasterData', window.saveMasterData)(); }
    function _assignRoleToCharacter(cid, rid, opts) {
        return _dep('RoleCommands.assignRoleToCharacter',
                    window.RoleCommands && window.RoleCommands.assignRoleToCharacter)(cid, rid, opts);
    }
    function _updateRoleSkill(cid, rid, level) {
        return _dep('RoleCommands.setSkillLevel',
                    window.RoleCommands && window.RoleCommands.setSkillLevel)(cid, rid, level);
    }
    function _roll() {
        // Canonical RNG — the simulation engine provides it.
        if (typeof window.RNG !== 'undefined' && typeof window.RNG.next === 'function') {
            return window.RNG.next();
        }
        throw new Error('ApprenticeshipCommands: canonical RNG (window.RNG.next) not available');
    }

    // =========================================================================
    // 2. NOTIFICATION (one per command)
    // =========================================================================

    function _notify(eventName, payload) {
        if (typeof window.dispatchEvent === 'function') {
            window.dispatchEvent(new CustomEvent(eventName, { detail: payload || {} }));
        }
    }

    function _commitAndNotify(payload) {
        _saveMasterData();
        _notify('apprenticeshipUpdated', payload);
        _notify('characterUpdated', payload);
    }

    // =========================================================================
    // 3. RESULT HELPERS
    // =========================================================================

    function ok(data)         { return { success: true, data: data }; }
    function fail(code, reason) { return { success: false, code: code, reason: reason }; }

    // =========================================================================
    // 4. CREATE
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

        var masterSkill = window.ApprenticeshipQueries.getSkillLevel(master.id, role.id);
        var existingForRole = window.ApprenticeshipQueries.getApprenticeship(
            master.id, apprentice.id, role.id
        );

        var initialSkill = args.initialSkill != null
            ? args.initialSkill
            : TEACH.DEFAULT_INITIAL_SKILL;

        var validation = window.ApprenticeshipRules.validateCreation({
            master: { id: master.id, name: master.name, isDeceased: !!master.isDeceased, skillLevel: masterSkill },
            apprentice: { id: apprentice.id, name: apprentice.name, isDeceased: !!apprentice.isDeceased },
            role: { id: role.id, name: role.name },
            initialSkill: initialSkill,
            existsActiveForRole: !!existingForRole
        });
        if (!validation.valid) return fail(validation.code, validation.reason);

        var startYear = args.startYear != null ? args.startYear : _getCurrentYear();
        var initialStage = window.ApprenticeshipRules.getStageForSkill(initialSkill);

        // ---- Cross-domain: assign role first (so failure aborts cleanly) ----
        var assignResult = _assignRoleToCharacter(apprentice.id, role.id, {
            skillLevel: initialSkill,
            startYear: startYear,
            primary: false,
            notes: 'Apprenticeship under ' + master.name + (args.notes ? ' (' + args.notes + ')' : '')
        });
        if (!assignResult || !assignResult.success) {
            return fail(
                'ROLE_ASSIGNMENT_FAILED',
                (assignResult && assignResult.reason) || 'Failed to assign role to apprentice'
            );
        }

        // ---- Relationship ----
        var archetypes = window.RELATIONSHIP_ARCHETYPES;
        var relationship = _createRelationship(master.id, apprentice.id, {
            type: archetypes.APPRENTICESHIP,
            status: STATUS.ONGOING,
            startYear: startYear,
            metadata: {
                roleId: role.id,
                roleName: role.name,
                startSkill: initialSkill,
                skillLevel: initialSkill,   // cache
                stage: initialStage.id,
                specializationsTaught: [],
                teachingHistory: [],
                notes: args.notes || ''
            }
        });
        if (!relationship) {
            return fail('RELATIONSHIP_CREATE_FAILED', 'Failed to create apprenticeship relationship');
        }

        _commitAndNotify({
            action: 'createApprenticeship',
            masterId: master.id,
            apprenticeId: apprentice.id,
            roleId: role.id
        });

        return ok({
            apprenticeship: window.ApprenticeshipQueries.getApprenticeshipDetails(
                master.id, apprentice.id, role.id
            ),
            roleAssignment: assignResult
        });
    }

    // =========================================================================
    // 5. UPDATE (details only — not progression)
    // =========================================================================

    function updateApprenticeship(masterId, apprenticeId, updates) {
        updates = updates || {};
        var rel = window.ApprenticeshipQueries.getApprenticeship(masterId, apprenticeId, updates.roleId);
        if (!rel) return fail('NOT_FOUND', 'Apprenticeship not found');

        var nextStatus = updates.status;
        if (nextStatus && nextStatus !== rel.status) {
            var transition = window.ApprenticeshipRules.validateStatusTransition(rel.status, nextStatus);
            if (!transition.valid) return fail(transition.code, transition.reason);
        }

        var meta = Object.assign({}, rel.metadata || {});
        var patch = {};

        if (updates.notes !== undefined)      meta.notes = updates.notes;
        if (updates.specializationsTaught !== undefined) {
            meta.specializationsTaught = (updates.specializationsTaught || []).slice();
        }

        if (updates.skillLevel !== undefined) {
            // Manual skill change is a role-command, not metadata-only.
            var roleId = meta.roleId;
            if (!roleId) return fail('NO_ROLE', 'Cannot update skill without a role');
            var setResult = _updateRoleSkill(apprenticeId, roleId, updates.skillLevel);
            if (!setResult || !setResult.success) {
                return fail('SKILL_UPDATE_FAILED', (setResult && setResult.reason) || 'Skill update failed');
            }
            meta.skillLevel = updates.skillLevel;
            meta.stage = window.ApprenticeshipRules.getStageForSkill(updates.skillLevel).id;
        }

        if (updates.startYear !== undefined) patch.startYear = updates.startYear;
        if (nextStatus) patch.status = nextStatus;
        patch.metadata = meta;

        _updateRelationship(rel.id, patch);
        _commitAndNotify({
            action: 'updateApprenticeship',
            masterId: masterId,
            apprenticeId: apprenticeId,
            roleId: meta.roleId
        });

        return ok(window.ApprenticeshipQueries.getApprenticeshipDetails(masterId, apprenticeId, meta.roleId));
    }

    // =========================================================================
    // 6. PROGRESS (skill +5 style)
    // =========================================================================

    function progressApprenticeship(masterId, apprenticeId, amount) {
        amount = amount != null ? amount : TEACH.DEFAULT_PROGRESS_GAIN;
        var rel = window.ApprenticeshipQueries.getApprenticeship(masterId, apprenticeId, null);
        if (!rel) return fail('NOT_FOUND', 'Apprenticeship not found');
        if (rel.status !== STATUS.ONGOING) return fail('NOT_ONGOING', 'Apprenticeship is not ongoing');

        var meta = Object.assign({}, rel.metadata || {});
        var roleId = meta.roleId;
        if (!roleId) return fail('NO_ROLE', 'Apprenticeship has no role');

        var currentSkill = window.ApprenticeshipQueries.getSkillLevel(apprenticeId, roleId);
        var newSkill = window.ApprenticeshipRules.clampSkill(currentSkill + amount);
        var newStage = window.ApprenticeshipRules.getStageForSkill(newSkill);

        var skillResult = _updateRoleSkill(apprenticeId, roleId, newSkill);
        if (!skillResult || !skillResult.success) {
            return fail('SKILL_UPDATE_FAILED', 'Failed to update role skill');
        }

        meta.skillLevel = newSkill;
        meta.stage = newStage.id;
        if (!meta.teachingHistory) meta.teachingHistory = [];
        meta.teachingHistory.push({
            type: 'progress',
            gain: newSkill - currentSkill,
            newLevel: newSkill,
            year: _getCurrentYear()
        });

        _updateRelationship(rel.id, { metadata: meta });
        _commitAndNotify({
            action: 'progressApprenticeship',
            masterId: masterId,
            apprenticeId: apprenticeId,
            roleId: roleId
        });

        var eligibleForCompletion = newSkill >= TEACH.COMPLETION_SKILL;

        return ok({
            oldSkill: currentSkill,
            newSkill: newSkill,
            gained: newSkill - currentSkill,
            stage: newStage,
            eligibleForCompletion: eligibleForCompletion
        });
    }

    // =========================================================================
    // 7. TEACH (single method application — roll is injected)
    // =========================================================================

    function teachSkill(masterId, apprenticeId, methodId) {
        var rel = window.ApprenticeshipQueries.getApprenticeship(masterId, apprenticeId, null);
        if (!rel) return fail('NOT_FOUND', 'Apprenticeship not found');
        if (rel.status !== STATUS.ONGOING) return fail('NOT_ONGOING', 'Apprenticeship is not ongoing');

        var meta = Object.assign({}, rel.metadata || {});
        var roleId = meta.roleId;
        if (!roleId) return fail('NO_ROLE', 'Apprenticeship has no role');

        var masterSkill = window.ApprenticeshipQueries.getSkillLevel(masterId, roleId);
        if (!window.ApprenticeshipRules.canTeach(masterSkill)) {
            return fail('MASTER_SKILL_TOO_LOW', 'Master lacks skill to teach');
        }

        var methods = window.SKILL_TRANSFER_METHODS || {};
        var method = null;
        for (var key in methods) {
            if (methods[key].id === methodId) { method = methods[key]; break; }
        }
        if (!method) return fail('UNKNOWN_METHOD', 'Unknown teaching method: ' + methodId);

        var currentSkill = window.ApprenticeshipQueries.getSkillLevel(apprenticeId, roleId);
        var outcome = window.ApprenticeshipRules.calculateTeachingOutcome({
            currentSkill: currentSkill,
            method: method,
            roll: _roll()
        });

        if (outcome.success) {
            var skillResult = _updateRoleSkill(apprenticeId, roleId, outcome.newSkill);
            if (!skillResult || !skillResult.success) {
                return fail('SKILL_UPDATE_FAILED', 'Failed to update role skill');
            }
            meta.skillLevel = outcome.newSkill;
            meta.stage = window.ApprenticeshipRules.getStageForSkill(outcome.newSkill).id;
        }

        if (!meta.teachingHistory) meta.teachingHistory = [];
        meta.teachingHistory.push({
            type: 'teach_skill',
            method: methodId,
            success: outcome.success,
            gain: outcome.gain,
            newLevel: outcome.newSkill,
            year: _getCurrentYear()
        });

        _updateRelationship(rel.id, { metadata: meta });
        _commitAndNotify({
            action: 'teachSkill',
            masterId: masterId,
            apprenticeId: apprenticeId,
            roleId: roleId,
            methodId: methodId
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
    // 8. TEACH SPECIALIZATION (stored on the profession record)
    // =========================================================================

    function teachSpecialization(masterId, apprenticeId, specialization) {
        var rel = window.ApprenticeshipQueries.getApprenticeship(masterId, apprenticeId, null);
        if (!rel) return fail('NOT_FOUND', 'Apprenticeship not found');
        if (rel.status !== STATUS.ONGOING) return fail('NOT_ONGOING', 'Apprenticeship is not ongoing');

        var meta = Object.assign({}, rel.metadata || {});
        var roleId = meta.roleId;
        if (!roleId) return fail('NO_ROLE', 'Apprenticeship has no role');

        if (typeof window.RoleCommands === 'undefined' ||
            typeof window.RoleCommands.addSpecialization !== 'function') {
            return fail('MISSING_DEPENDENCY', 'RoleCommands.addSpecialization not available');
        }
        var addResult = window.RoleCommands.addSpecialization(apprenticeId, roleId, specialization);
        if (!addResult || !addResult.success) {
            return fail('SPECIALIZATION_ADD_FAILED', (addResult && addResult.reason) || 'Failed to add specialization');
        }

        if (!meta.specializationsTaught) meta.specializationsTaught = [];
        if (meta.specializationsTaught.indexOf(specialization) === -1) {
            meta.specializationsTaught = meta.specializationsTaught.slice();
            meta.specializationsTaught.push(specialization);
        }

        _updateRelationship(rel.id, { metadata: meta });
        _commitAndNotify({
            action: 'teachSpecialization',
            masterId: masterId,
            apprenticeId: apprenticeId,
            roleId: roleId,
            specialization: specialization
        });

        return ok({
            specialization: specialization,
            specializationsTaught: meta.specializationsTaught.slice()
        });
    }

    // =========================================================================
    // 9. COMPLETE
    // =========================================================================

    function completeApprenticeship(masterId, apprenticeId, roleId) {
        var rel = window.ApprenticeshipQueries.getApprenticeship(masterId, apprenticeId, roleId);
        if (!rel) return fail('NOT_FOUND', 'Apprenticeship not found');

        var meta = rel.metadata || {};
        var currentSkill = window.ApprenticeshipQueries.getSkillLevel(apprenticeId, meta.roleId);

        var canComplete = window.ApprenticeshipRules.canComplete({
            status: rel.status,
            skillLevel: currentSkill
        });
        if (!canComplete.valid) return fail(canComplete.code, canComplete.reason);

        var nextMeta = Object.assign({}, meta);
        nextMeta.skillLevel = currentSkill;
        nextMeta.stage = window.ApprenticeshipRules.getStageForSkill(currentSkill).id;
        nextMeta.completedYear = _getCurrentYear();

        _updateRelationship(rel.id, {
            status: STATUS.COMPLETED,
            endYear: _getCurrentYear(),
            metadata: nextMeta
        });
        _commitAndNotify({
            action: 'completeApprenticeship',
            masterId: masterId,
            apprenticeId: apprenticeId,
            roleId: meta.roleId
        });

        return ok(window.ApprenticeshipQueries.getApprenticeshipDetails(masterId, apprenticeId, meta.roleId));
    }

    // =========================================================================
    // 10. TERMINATE / CANCEL
    // =========================================================================

    function terminateApprenticeship(masterId, apprenticeId, reason) {
        var rel = window.ApprenticeshipQueries.getApprenticeship(masterId, apprenticeId, null);
        if (!rel) return fail('NOT_FOUND', 'Apprenticeship not found');

        var transition = window.ApprenticeshipRules.validateStatusTransition(rel.status, STATUS.ENDED);
        if (!transition.valid) return fail(transition.code, transition.reason);

        var ended = _endRelationship(rel.id, _getCurrentYear(), reason || 'Terminated');
        if (!ended) return fail('END_FAILED', 'Failed to end relationship');

        _commitAndNotify({
            action: 'terminateApprenticeship',
            masterId: masterId,
            apprenticeId: apprenticeId,
            roleId: (rel.metadata && rel.metadata.roleId) || null
        });

        return ok({ terminated: true });
    }

    function cancelApprenticeship(masterId, apprenticeId, reason) {
        var rel = window.ApprenticeshipQueries.getApprenticeship(masterId, apprenticeId, null);
        if (!rel) return fail('NOT_FOUND', 'Apprenticeship not found');
        if (rel.status === STATUS.CANCELLED) return ok({ cancelled: true, alreadyCancelled: true });

        _updateRelationship(rel.id, {
            status: STATUS.CANCELLED,
            endYear: _getCurrentYear(),
            metadata: Object.assign({}, rel.metadata || {}, {
                cancelReason: reason || 'Cancelled'
            })
        });
        _commitAndNotify({
            action: 'cancelApprenticeship',
            masterId: masterId,
            apprenticeId: apprenticeId,
            roleId: (rel.metadata && rel.metadata.roleId) || null
        });

        return ok({ cancelled: true });
    }

    // =========================================================================
    // 11. ANNUAL ADVANCEMENT (batch)
    // =========================================================================

    /**
     * Advance every active apprenticeship by one year of training.
     * Applies as ONE transaction.
     */
    function advanceApprenticeshipSkills(year) {
        year = year != null ? year : _getCurrentYear();
        var active = window.ApprenticeshipQueries.getActiveApprenticeships();
        if (!active.length) return ok({ year: year, advanced: [] });

        var advanced = [];
        for (var i = 0; i < active.length; i++) {
            var projected = active[i];
            var masterSkill = window.ApprenticeshipQueries.getSkillLevel(
                projected.masterId, projected.roleId
            );

            var progress = window.ApprenticeshipRules.calculateAnnualProgress({
                masterSkill: masterSkill,
                currentSkill: projected.skillLevel
            });
            if (progress.gain <= 0) continue;

            var skillResult = _updateRoleSkill(
                projected.apprenticeId, projected.roleId, progress.newSkill
            );
            if (!skillResult || !skillResult.success) continue;

            var rel = window.ApprenticeshipQueries.getApprenticeshipById(projected.id);
            var meta = Object.assign({}, rel.metadata || {});
            meta.skillLevel = progress.newSkill;
            meta.stage = window.ApprenticeshipRules.getStageForSkill(progress.newSkill).id;
            if (!meta.teachingHistory) meta.teachingHistory = [];
            meta.teachingHistory.push({
                type: 'annual_advance',
                gain: progress.gain,
                newLevel: progress.newSkill,
                year: year
            });
            _updateRelationship(rel.id, { metadata: meta });

            advanced.push({
                apprenticeshipId: rel.id,
                masterId: projected.masterId,
                apprenticeId: projected.apprenticeId,
                roleId: projected.roleId,
                oldSkill: projected.skillLevel,
                newSkill: progress.newSkill,
                gained: progress.gain,
                eligibleForCompletion: progress.newSkill >= TEACH.COMPLETION_SKILL
            });
        }

        if (advanced.length > 0) {
            _commitAndNotify({ action: 'advanceApprenticeshipSkills', year: year, count: advanced.length });
        }
        return ok({ year: year, advanced: advanced });
    }

    // =========================================================================
    // 12. EXPORTS
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
        advanceApprenticeshipSkills: advanceApprenticeshipSkills
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.ApprenticeshipCommands;
    }
})();
