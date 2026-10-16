/**
 * government-commands.js
 * Write layer. One transaction boundary per command. No save in the commit.
 * Result contract: { success: true, data } | { success: false, reason, code? }
 *
 * Commit tail: hydrateFromMasterData → markDirty → publish → dispatchEvent.
 * Persistence is a separate, explicit call: GovernmentCommands.persist().
 *
 * Cross-domain mutations (leader, place government, justice, watch) delegate
 * to the owning domain's commands. Salary payment is not part of the
 * assignment transaction — see paySalaryForAssignment.
 */
(function() {
    'use strict';

    var C                       = window.GovernmentConstants;
    var State                   = window.GovernmentState;
    var Queries                 = window.GovernmentQueries;
    var Rules                   = window.GovernmentRules;
    var _CharacterCommands      = window.CharacterCommands;
    var _CharacterQueries       = window.CharacterQueries;
    var _LocationQueries        = window.LocationQueries;
    var _LocationCommands       = window.LocationCommands;
    var _HouseholdCommands      = window.HouseholdCommands;
    var _HouseholdQueries       = window.HouseholdQueries;
    var _SettlementQueries      = window.SettlementQueries;
    var _SettlementGovCmds      = window.SettlementGovernmentCommands;

    if (!C)                       throw new Error('government-commands.js requires GovernmentConstants');
    if (!State)                   throw new Error('government-commands.js requires GovernmentState');
    if (!Queries)                 throw new Error('government-commands.js requires GovernmentQueries');
    if (!Rules)                   throw new Error('government-commands.js requires GovernmentRules');
    if (!_CharacterCommands)      throw new Error('government-commands.js requires CharacterCommands');
    if (!_CharacterQueries)       throw new Error('government-commands.js requires CharacterQueries');
    if (!_LocationQueries)        throw new Error('government-commands.js requires LocationQueries');
    if (!_LocationCommands)       throw new Error('government-commands.js requires LocationCommands');
    if (!_HouseholdCommands)      throw new Error('government-commands.js requires HouseholdCommands');
    if (!_HouseholdQueries)       throw new Error('government-commands.js requires HouseholdQueries');
    if (!_SettlementQueries)      throw new Error('government-commands.js requires SettlementQueries');
    if (!_SettlementGovCmds)      throw new Error('government-commands.js requires SettlementGovernmentCommands');

    // Load-time verification of the specific cross-domain methods we call.
    if (typeof _CharacterCommands.addProfession !== 'function') {
        throw new Error('government-commands.js: CharacterCommands.addProfession required');
    }
    if (typeof _LocationCommands.assignLeader !== 'function') {
        throw new Error('government-commands.js: LocationCommands.assignLeader required');
    }
    if (typeof _LocationCommands.endLeaderTerm !== 'function') {
        throw new Error('government-commands.js: LocationCommands.endLeaderTerm required');
    }
    if (typeof _LocationCommands.assignGovernment !== 'function') {
        throw new Error('government-commands.js: LocationCommands.assignGovernment required');
    }
    if (typeof _SettlementGovCmds.setJusticeSeverity !== 'function') {
        throw new Error('government-commands.js: SettlementGovernmentCommands.setJusticeSeverity required');
    }
    if (typeof _SettlementGovCmds.setWatch !== 'function') {
        throw new Error('government-commands.js: SettlementGovernmentCommands.setWatch required');
    }

    // ---- Helpers -------------------------------------------------------------

    function _now() { return window.getCurrentYearSafe(); }
    function _ok(data) { return { success: true, data: data }; }
    function _fail(reason, code) { return { success: false, reason: reason, code: code || null }; }

    function _log(category, type, message, subjects) {
        if (typeof window.logEvent === 'function') {
            window.logEvent(category, type, message, subjects || []);
        }
    }

    // ---- Commit tail ---------------------------------------------------------
    // State is always the source of truth for indexes after a mutation.
    // markDataDirty is idempotent; primitives already called it.

    function _commit(eventName, payload) {
        State.hydrateFromMasterData();
        window.markDataDirty();
        State.publish(eventName, payload);
        if (eventName && C.EVENTS[eventName]) {
            _dispatch(C.EVENTS[eventName], payload);
        } else if (eventName && eventName.indexOf('government') === 0) {
            _dispatch(eventName, payload);
        }
    }

    function _dispatch(eventName, detail) {
        if (typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
            try {
                window.dispatchEvent(new CustomEvent(eventName, { detail: detail || null }));
            } catch (e) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error('government-commands.js: dispatch failed', eventName, e);
                }
            }
        }
    }

    // ---- Persistence ---------------------------------------------------------

    function persist() {
        if (typeof window.saveMasterData !== 'function') {
            return { success: false, reason: 'saveMasterData unavailable', code: C.CODES.SAVE_UNAVAILABLE };
        }
        try {
            var ok = window.saveMasterData();
            return ok === true
                ? { success: true }
                : { success: false, reason: 'save returned false', code: C.CODES.SAVE_FAILED };
        } catch (e) {
            return { success: false, reason: e.message, code: C.CODES.SAVE_FAILED };
        }
    }

    // ---- Field validation ----------------------------------------------------

    function _validateFieldAllowlist(updates, allowed, context) {
        if (!updates) return null;
        var keys = Object.keys(updates);
        for (var i = 0; i < keys.length; i++) {
            var k = keys[i];
            if (allowed.indexOf(k) !== -1) continue;
            if (C.DOMAIN_OWNED_FIELDS[k]) {
                return 'Field "' + k + '" is owned by ' + C.DOMAIN_OWNED_FIELDS[k] +
                    '; use ' + C.DOMAIN_OWNED_FIELDS[k] + ' instead';
            }
            return 'Field "' + k + '" is not updatable on ' + context;
        }
        return null;
    }

    // ---- Department commands -------------------------------------------------

    function createDepartment(data) {
        var v = Rules.validateDepartment(data, false);
        if (!v.valid) return _fail(v.reason, C.CODES.VALIDATION);

        var dept = {
            id: window.generateId('govdept'),
            name: data.name.trim(),
            description: data.description || '',
            locationId: data.locationId,
            parentDepartmentId: data.parentDepartmentId || null,
            positions: [],
            assignments: [],
            isDeprecated: false,
            createdAt: _now(),
            updatedAt: _now()
        };

        State._addDepartment(dept);
        _commit(C.STATE_EVENTS.UI_STATE_CHANGED, null);

        var loc = _LocationQueries.getPlaceSummary
            ? _LocationQueries.getPlaceSummary(dept.locationId)
            : null;
        _log('government', 'department_created',
            'Department "' + dept.name + '" created at ' +
            (loc ? loc.displayName : dept.locationId), []);

        return _ok({ id: dept.id, departmentId: dept.id });
    }

    function updateDepartment(departmentId, updates) {
        var dept = State._getDepartmentCanonical(departmentId);
        if (!dept) return _fail('Department not found', C.CODES.NOT_FOUND);

        var fieldErr = _validateFieldAllowlist(updates, C.ALLOWED_DEPARTMENT_FIELDS, 'department');
        if (fieldErr) return _fail(fieldErr, C.CODES.VALIDATION);

        var v = Rules.validateDepartment(updates, true, departmentId);
        if (!v.valid) return _fail(v.reason, C.CODES.VALIDATION);

        State._updateDepartment(departmentId, updates, C.ALLOWED_DEPARTMENT_FIELDS);
        _commit(C.EVENTS.DEPARTMENT_UPDATED, { departmentId: departmentId });

        _log('government', 'department_updated', 'Department "' + dept.name + '" updated', []);
        return _ok({ id: departmentId, departmentId: departmentId });
    }

    function deleteDepartment(departmentId, options) {
        options = options || {};
        var dept = State._getDepartmentCanonical(departmentId);
        if (!dept) return _fail('Department not found', C.CODES.NOT_FOUND);

        var cascade = !!options.cascade;
        var impact = Queries.getDepartmentDeletionImpact(departmentId);

        if (!cascade) {
            if (impact.hasChildren) {
                return _fail('Department has ' + impact.childDepartmentCount +
                    ' child departments. Use cascade to delete them.', C.CODES.HAS_CHILDREN);
            }
            if (impact.hasActiveAssignments) {
                return _fail('Department has ' + impact.activeAssignmentCount +
                    ' active assignments. Use cascade to remove them.', C.CODES.HAS_ASSIGNMENTS);
            }
        }

        var name = dept.name;
        _deleteDepartmentCascadeInternal(departmentId);
        _commit(C.EVENTS.DEPARTMENT_DELETED, { departmentId: departmentId });

        _log('government', 'department_deleted',
            'Department "' + name + '" deleted' + (cascade ? ' (cascade)' : ''), []);

        return _ok({ id: departmentId });
    }

    function _deleteDepartmentCascadeInternal(departmentId) {
        var children = State._getDepartmentsByParentCanonical(departmentId);
        // Copy the array — _removeDepartment mutates indexes.
        var snapshot = children.slice();
        for (var i = 0; i < snapshot.length; i++) {
            _deleteDepartmentCascadeInternal(snapshot[i].id);
        }
        State._removeDepartment(departmentId);
    }

    // ---- Position commands ---------------------------------------------------

    function addPosition(departmentId, data) {
        var dept = State._getDepartmentCanonical(departmentId);
        if (!dept) return _fail('Department not found', C.CODES.NOT_FOUND);

        var v = Rules.validatePosition(data, false);
        if (!v.valid) return _fail(v.reason, C.CODES.VALIDATION);

        var position = {
            id: window.generateId('govpos'),
            name: data.name.trim(),
            description: data.description || '',
            priority: data.priority != null ? data.priority : C.DEFAULT_POSITION_PRIORITY,
            parentPositionId: data.parentPositionId || null,
            requiredRoleId: data.requiredRoleId || null,
            minSkillLevel: data.minSkillLevel != null ? data.minSkillLevel : C.DEFAULT_MIN_SKILL_LEVEL,
            genderRestriction: data.genderRestriction || C.GENDER_EITHER,
            requiredRankId: data.requiredRankId || null,
            minExperience: data.minExperience != null ? data.minExperience : 0,
            salaryOverrides: []
        };

        State._addPosition(departmentId, position);
        _commit(C.EVENTS.POSITION_ADDED, { departmentId: departmentId, positionId: position.id });

        _log('government', 'position_added',
            'Position "' + position.name + '" added to "' + dept.name + '"', []);

        return _ok({ id: position.id, positionId: position.id, departmentId: departmentId });
    }

    function updatePosition(departmentId, positionId, updates) {
        var dept = State._getDepartmentCanonical(departmentId);
        if (!dept) return _fail('Department not found', C.CODES.NOT_FOUND);

        var pos = State._getPositionCanonical(departmentId, positionId);
        if (!pos) return _fail('Position not found', C.CODES.NOT_FOUND);

        var fieldErr = _validateFieldAllowlist(updates, C.ALLOWED_POSITION_FIELDS, 'position');
        if (fieldErr) return _fail(fieldErr, C.CODES.VALIDATION);

        var v = Rules.validatePosition(updates, true);
        if (!v.valid) return _fail(v.reason, C.CODES.VALIDATION);

        if (updates.parentPositionId !== undefined && updates.parentPositionId) {
            var hier = Rules.validatePositionHierarchy(
                departmentId,
                positionId,
                updates.parentPositionId,
                State._getPositionCanonical
            );
            if (!hier.valid) return _fail(hier.reason, C.CODES.CYCLE);
        }

        State._updatePosition(departmentId, positionId, updates, C.ALLOWED_POSITION_FIELDS);
        _commit(C.EVENTS.POSITION_UPDATED, { departmentId: departmentId, positionId: positionId });

        _log('government', 'position_updated',
            'Position "' + pos.name + '" updated in "' + dept.name + '"', []);

        return _ok({ id: positionId, positionId: positionId, departmentId: departmentId });
    }

    function deletePosition(departmentId, positionId) {
        var dept = State._getDepartmentCanonical(departmentId);
        if (!dept) return _fail('Department not found', C.CODES.NOT_FOUND);

        var pos = State._getPositionCanonical(departmentId, positionId);
        if (!pos) return _fail('Position not found', C.CODES.NOT_FOUND);

        var active = State._getAssignmentsForPositionCanonical(departmentId, positionId, true);
        if (active.length > 0) {
            return _fail('Position has ' + active.length +
                ' active assignment(s). Remove them first.', C.CODES.HAS_ASSIGNMENTS);
        }

        State._removePosition(departmentId, positionId);
        _commit(C.EVENTS.POSITION_DELETED, { departmentId: departmentId, positionId: positionId });

        _log('government', 'position_deleted',
            'Position "' + pos.name + '" deleted from "' + dept.name + '"', []);

        return _ok({ id: positionId });
    }

    // ---- Assignment commands -------------------------------------------------

    function assignCharacterToPosition(departmentId, positionId, characterId, options) {
        options = options || {};

        var dept = State._getDepartmentCanonical(departmentId);
        if (!dept) return _fail('Department not found', C.CODES.NOT_FOUND);

        var pos = State._getPositionCanonical(departmentId, positionId);
        if (!pos) return _fail('Position not found', C.CODES.NOT_FOUND);

        var charFacts = _CharacterQueries.getCharacterFacts(characterId);
        if (!charFacts) return _fail('Character not found', C.CODES.NOT_FOUND);
        if (charFacts.isDeceased) return _fail('Character is deceased', C.CODES.DECEASED);

        var existing = State._getAssignmentsForPositionCanonical(departmentId, positionId, true);
        for (var i = 0; i < existing.length; i++) {
            if (existing[i].characterId === characterId) {
                return _fail('Character already assigned to this position', C.CODES.ALREADY_ASSIGNED);
            }
        }

        var plan = Rules.planAssignment({
            position: {
                requiredRoleId: pos.requiredRoleId,
                minSkillLevel: pos.minSkillLevel,
                genderRestriction: pos.genderRestriction,
                requiredRankId: pos.requiredRankId,
                minExperience: pos.minExperience
            },
            character: charFacts,
            options: {
                startYear: options.startYear != null ? options.startYear : _now(),
                defaultSkillLevel: options.defaultSkillLevel != null
                    ? options.defaultSkillLevel
                    : C.DEFAULT_SKILL_LEVEL,
                addRoleIfMissing: options.addRoleIfMissing !== false
            }
        });

        if (!plan.valid) return _fail(plan.reason, plan.code || C.CODES.INELIGIBLE);

        if (plan.roleToAdd) {
            var addResult = _CharacterCommands.addProfession(characterId, plan.roleToAdd.roleId, {
                skillLevel: plan.roleToAdd.skillLevel,
                startYear: plan.startYear
            });
            if (!addResult || !addResult.success) {
                return _fail('Failed to add required profession', C.CODES.PROFESSION_FAILED);
            }
        }

        var assignment = {
            id: window.generateId('govassign'),
            positionId: positionId,
            characterId: characterId,
            characterName: charFacts.fullName,
            startYear: plan.startYear,
            endYear: options.endYear != null ? options.endYear : null,
            endReason: null,
            title: options.title || pos.name,
            notes: options.notes || '',
            roleIdAtAssignment: pos.requiredRoleId || null,
            skillLevelAtAssignment: plan.skillLevel != null ? plan.skillLevel : null
        };

        State._addAssignment(departmentId, assignment);
        _commit(C.EVENTS.CHARACTER_ASSIGNED, {
            departmentId: departmentId,
            positionId: positionId,
            assignmentId: assignment.id,
            characterId: characterId
        });

        _log('government', 'character_assigned',
            charFacts.fullName + ' assigned to "' + pos.name + '" in "' + dept.name + '"', []);

        return _ok({
            assignmentId: assignment.id,
            departmentId: departmentId,
            positionId: positionId,
            characterId: characterId
        });
    }

    function endAssignment(departmentId, assignmentId, endYear, reason) {
        var dept = State._getDepartmentCanonical(departmentId);
        if (!dept) return _fail('Department not found', C.CODES.NOT_FOUND);

        var a = State._getAssignmentCanonical(departmentId, assignmentId);
        if (!a) return _fail('Assignment not found', C.CODES.NOT_FOUND);
        if (a.endYear !== null && a.endYear !== undefined) {
            return _fail('Assignment already ended', C.CODES.ALREADY_ENDED);
        }

        var endYearValue = endYear != null ? endYear : _now();
        if (endYearValue <= a.startYear) {
            return _fail('End year must be after start year (' + a.startYear + ')', C.CODES.VALIDATION);
        }

        State._updateAssignment(departmentId, assignmentId, {
            endYear: endYearValue,
            endReason: reason || C.ASSIGNMENT_DEFAULT_END_REASON
        }, C.ALLOWED_ASSIGNMENT_FIELDS);

        _commit(C.EVENTS.ASSIGNMENT_ENDED, {
            departmentId: departmentId,
            assignmentId: assignmentId
        });

        var charFacts = _CharacterQueries.getCharacterFacts(a.characterId);
        _log('government', 'assignment_ended',
            (charFacts ? charFacts.fullName : a.characterId) +
            ' ended assignment at "' + dept.name + '"' +
            (reason ? ' (' + reason + ')' : ''), []);

        return _ok({ id: assignmentId });
    }

    function removeAssignment(departmentId, assignmentId) {
        var dept = State._getDepartmentCanonical(departmentId);
        if (!dept) return _fail('Department not found', C.CODES.NOT_FOUND);

        var a = State._getAssignmentCanonical(departmentId, assignmentId);
        if (!a) return _fail('Assignment not found', C.CODES.NOT_FOUND);

        State._removeAssignment(departmentId, assignmentId);
        _commit(C.EVENTS.ASSIGNMENT_REMOVED, {
            departmentId: departmentId,
            assignmentId: assignmentId
        });

        var charFacts = _CharacterQueries.getCharacterFacts(a.characterId);
        _log('government', 'assignment_removed',
            (charFacts ? charFacts.fullName : a.characterId) +
            ' removed from assignment at "' + dept.name + '"', []);

        return _ok({ id: assignmentId });
    }

    function bulkAssignCharacters(departmentId, positionId, assignments, options) {
        options = options || {};
        var mode = options.mode === 'atomic' ? 'atomic' : 'best-effort';
        var applied = [];
        var failures = [];

        var dept = State._getDepartmentCanonical(departmentId);
        if (!dept) return _fail('Department not found', C.CODES.NOT_FOUND);

        var pos = State._getPositionCanonical(departmentId, positionId);
        if (!pos) return _fail('Position not found', C.CODES.NOT_FOUND);

        // Pass 1: plan each input against the current state.
        var plans = [];
        for (var i = 0; i < assignments.length; i++) {
            var input = assignments[i];
            var plan = _planAssignmentStandalone(departmentId, positionId, input.characterId, input);
            if (plan.success) plans.push({ input: input, data: plan.data });
            else failures.push({ input: input, reason: plan.reason, code: plan.code });
        }

        if (mode === 'atomic' && failures.length > 0) {
            return _fail('Bulk assignment aborted: ' + failures.length +
                ' invalid input(s)', C.CODES.ATOMIC_ABORT);
        }

        // Pass 2: apply. Each apply mutates State but does not commit.
        for (var j = 0; j < plans.length; j++) {
            var res = _applyAssignmentPlan(departmentId, positionId, plans[j].data);
            if (res.success) applied.push(res.data);
            else failures.push({ input: plans[j].input, reason: res.reason, code: res.code });
        }

        if (applied.length > 0) {
            _commit(C.EVENTS.CHARACTER_ASSIGNED, {
                departmentId: departmentId,
                positionId: positionId,
                bulk: true,
                applied: applied.length
            });
        }

        return _ok({
            applied: applied.length,
            failed: failures.length,
            results: applied,
            failures: failures
        });
    }

    function _planAssignmentStandalone(departmentId, positionId, characterId, options) {
        var dept = State._getDepartmentCanonical(departmentId);
        if (!dept) return _fail('Department not found', C.CODES.NOT_FOUND);

        var pos = State._getPositionCanonical(departmentId, positionId);
        if (!pos) return _fail('Position not found', C.CODES.NOT_FOUND);

        var charFacts = _CharacterQueries.getCharacterFacts(characterId);
        if (!charFacts) return _fail('Character not found', C.CODES.NOT_FOUND);
        if (charFacts.isDeceased) return _fail('Character is deceased', C.CODES.DECEASED);

        var existing = State._getAssignmentsForPositionCanonical(departmentId, positionId, true);
        for (var i = 0; i < existing.length; i++) {
            if (existing[i].characterId === characterId) {
                return _fail('Already assigned', C.CODES.ALREADY_ASSIGNED);
            }
        }

        var plan = Rules.planAssignment({
            position: {
                requiredRoleId: pos.requiredRoleId,
                minSkillLevel: pos.minSkillLevel,
                genderRestriction: pos.genderRestriction,
                requiredRankId: pos.requiredRankId,
                minExperience: pos.minExperience
            },
            character: charFacts,
            options: {
                startYear: options.startYear != null ? options.startYear : _now(),
                defaultSkillLevel: options.defaultSkillLevel != null
                    ? options.defaultSkillLevel
                    : C.DEFAULT_SKILL_LEVEL,
                addRoleIfMissing: options.addRoleIfMissing !== false
            }
        });
        if (!plan.valid) return _fail(plan.reason, plan.code || C.CODES.INELIGIBLE);

        return _ok({
            characterId: characterId,
            pos: pos,
            charFacts: charFacts,
            plan: plan,
            options: options
        });
    }

    function _applyAssignmentPlan(departmentId, positionId, planData) {
        var plan = planData.plan;
        var pos = planData.pos;
        var charFacts = planData.charFacts;
        var options = planData.options;

        if (plan.roleToAdd) {
            var addResult = _CharacterCommands.addProfession(planData.characterId, plan.roleToAdd.roleId, {
                skillLevel: plan.roleToAdd.skillLevel,
                startYear: plan.startYear
            });
            if (!addResult || !addResult.success) {
                return _fail('Failed to add required profession', C.CODES.PROFESSION_FAILED);
            }
        }

        var assignment = {
            id: window.generateId('govassign'),
            positionId: positionId,
            characterId: planData.characterId,
            characterName: charFacts.fullName,
            startYear: plan.startYear,
            endYear: options.endYear != null ? options.endYear : null,
            endReason: null,
            title: options.title || pos.name,
            notes: options.notes || '',
            roleIdAtAssignment: pos.requiredRoleId || null,
            skillLevelAtAssignment: plan.skillLevel != null ? plan.skillLevel : null
        };
        State._addAssignment(departmentId, assignment);
        return _ok({ assignmentId: assignment.id, characterId: planData.characterId });
    }

    // ---- Salary override (position) ------------------------------------------

    function updatePositionSalary(departmentId, positionId, newSalary, options) {
        options = options || {};
        var dept = State._getDepartmentCanonical(departmentId);
        if (!dept) return _fail('Department not found', C.CODES.NOT_FOUND);

        var pos = State._getPositionCanonical(departmentId, positionId);
        if (!pos) return _fail('Position not found', C.CODES.NOT_FOUND);

        var v = Rules.validateSalaryUpdate(positionId, newSalary);
        if (!v.valid) return _fail(v.reason, C.CODES.VALIDATION);

        State._appendSalaryOverride(departmentId, positionId, {
            salary: newSalary,
            year: options.year != null ? options.year : _now(),
            reason: options.reason || 'Manual adjustment'
        });

        _commit(C.EVENTS.SALARY_OVERRIDDEN, {
            departmentId: departmentId,
            positionId: positionId,
            salary: newSalary
        });

        _log('economy', 'salary_overridden',
            'Salary for "' + pos.name + '" in "' + dept.name + '" set to ' + newSalary, []);

        return _ok({ positionId: positionId, salary: newSalary });
    }

    // ---- Salary payment (cross-domain, separate transaction) -----------------
    // Salary is not part of the assignment command. The caller (modal / view
    // model) invokes paySalaryForAssignment after a successful assignment and
    // then persists the household change via HouseholdCommands' own path.

    function paySalaryForAssignment(departmentId, positionId, characterId) {
        var dept = State._getDepartmentCanonical(departmentId);
        if (!dept) return { paid: false, reason: 'department-not-found' };

        var pos = State._getPositionCanonical(departmentId, positionId);
        if (!pos) return { paid: false, reason: 'position-not-found' };

        if (!window.GovernmentEconomy ||
            typeof window.GovernmentEconomy.calculatePositionSalary !== 'function') {
            return { paid: false, reason: 'economy-unavailable' };
        }

        var salary = window.GovernmentEconomy.calculatePositionSalary(departmentId, positionId);
        if (salary == null || salary <= 0) {
            return { paid: false, reason: 'no-salary' };
        }

        var household = _HouseholdQueries.getCharacterHousehold(characterId);
        if (!household) return { paid: false, reason: 'no-household' };

        var reason = 'Government salary: ' + pos.name + ' (' + dept.name + ')';
        var result = null;

        if (typeof _HouseholdCommands.adjustWealth === 'function') {
            result = _HouseholdCommands.adjustWealth(household.id, salary, { reason: reason });
        } else if (typeof _HouseholdCommands.creditWealth === 'function') {
            result = _HouseholdCommands.creditWealth(household.id, salary, reason);
        } else {
            return { paid: false, reason: 'no-wealth-command' };
        }

        if (!result || result.success === false) {
            _log('economy', 'government_salary_failed',
                'Failed to pay salary to ' + characterId + ': ' +
                ((result && result.reason) || 'unknown'), []);
            return { paid: false, reason: (result && result.reason) || 'command-failed' };
        }

        _log('economy', 'government_salary_paid',
            'Salary ' + salary + ' gold paid to household "' + household.name +
            '" for ' + pos.name, []);

        return { paid: true, amount: salary, householdId: household.id };
    }

    // ---- Government type commands --------------------------------------------

    function createGovernmentType(data) {
        var v = Rules.validateGovernmentType(data, false);
        if (!v.valid) return _fail(v.reason, C.CODES.VALIDATION);

        var type = {
            id: window.generateId('govtype'),
            name: data.name.trim(),
            description: data.description || '',
            allowedRankIds: (data.allowedRankIds || []).slice(),
            icon: data.icon || ''
        };

        State._addGovernmentType(type);
        _commit(C.EVENTS.TYPE_CREATED, { governmentTypeId: type.id });

        _log('government', 'type_created', 'Government type "' + type.name + '" created', []);
        return _ok({ id: type.id, governmentTypeId: type.id });
    }

    function updateGovernmentType(typeId, updates) {
        var type = State._getGovernmentTypeCanonical(typeId);
        if (!type) return _fail('Government type not found', C.CODES.NOT_FOUND);

        var fieldErr = _validateFieldAllowlist(updates, C.ALLOWED_GOVERNMENT_TYPE_FIELDS, 'government type');
        if (fieldErr) return _fail(fieldErr, C.CODES.VALIDATION);

        var v = Rules.validateGovernmentType(updates, true);
        if (!v.valid) return _fail(v.reason, C.CODES.VALIDATION);

        State._updateGovernmentType(typeId, updates, C.ALLOWED_GOVERNMENT_TYPE_FIELDS);
        _commit(C.EVENTS.TYPE_UPDATED, { governmentTypeId: typeId });

        _log('government', 'type_updated', 'Government type "' + type.name + '" updated', []);
        return _ok({ id: typeId, governmentTypeId: typeId });
    }

    function deleteGovernmentType(typeId) {
        var type = State._getGovernmentTypeCanonical(typeId);
        if (!type) return _fail('Government type not found', C.CODES.NOT_FOUND);

        var usage = _LocationQueries.getPlacesUsingGovernmentType
            ? _LocationQueries.getPlacesUsingGovernmentType(typeId)
            : [];
        if (usage && usage.length > 0) {
            return _fail('Cannot delete: used by ' + usage.length +
                ' location(s)', C.CODES.IN_USE);
        }

        var name = type.name;
        State._removeGovernmentType(typeId);
        _commit(C.EVENTS.TYPE_DELETED, { governmentTypeId: typeId });

        _log('government', 'type_deleted', 'Government type "' + name + '" deleted', []);
        return _ok({ id: typeId });
    }

    // ---- Leader / place government (delegated to Location) -------------------

    function assignLeader(placeId, characterId, startYear, title) {
        var result = _LocationCommands.assignLeader(placeId, characterId, startYear, title);
        var wrapped = _wrapLocationResult(result);

        if (wrapped.success) {
            var c = _CharacterQueries.getCharacterFacts(characterId);
            _log('leadership', 'assigned',
                (c ? c.fullName : characterId) + ' assigned as leader of ' + placeId, []);
            State._addGovernmentHistory({
                id: window.generateId('govhist'),
                locationId: placeId,
                characterId: characterId,
                characterName: c ? c.fullName : null,
                eventType: C.GOVERNMENT_HISTORY_EVENT_TYPES.LEADER_ASSIGNED,
                startYear: startYear,
                title: title || null,
                recordedAt: _now()
            });
            _commit(C.EVENTS.LEADER_ASSIGNED, { placeId: placeId, characterId: characterId });
        }

        return wrapped;
    }

    function endLeaderTerm(placeId, characterId, endYear) {
        var result = _LocationCommands.endLeaderTerm(placeId, characterId, endYear);
        var wrapped = _wrapLocationResult(result);

        if (wrapped.success) {
            _log('leadership', 'term_ended', 'Leader term ended at ' + placeId, []);
            State._addGovernmentHistory({
                id: window.generateId('govhist'),
                locationId: placeId,
                characterId: characterId,
                eventType: C.GOVERNMENT_HISTORY_EVENT_TYPES.LEADER_TERM_ENDED,
                endYear: endYear,
                recordedAt: _now()
            });
            _commit(C.EVENTS.LEADER_TERM_ENDED, { placeId: placeId, characterId: characterId });
        }

        return wrapped;
    }

    function assignGovernmentToPlace(placeId, govTypeId, govStyle) {
        var result = _LocationCommands.assignGovernment(placeId, govTypeId, govStyle);
        var wrapped = _wrapLocationResult(result);

        if (wrapped.success) {
            _log('government', 'assigned_to_place', 'Government assigned to ' + placeId, []);
            State._addGovernmentHistory({
                id: window.generateId('govhist'),
                locationId: placeId,
                governmentTypeId: govTypeId,
                governmentStyle: govStyle || null,
                eventType: C.GOVERNMENT_HISTORY_EVENT_TYPES.GOVERNMENT_ASSIGNED,
                recordedAt: _now()
            });
            _commit(C.EVENTS.GOVERNMENT_ASSIGNED_TO_PLACE, {
                placeId: placeId,
                governmentTypeId: govTypeId
            });
        }

        return wrapped;
    }

    function _wrapLocationResult(result) {
        if (result === true || (result && result.success !== false)) {
            return _ok(result === true ? null : result.data || null);
        }
        return _fail((result && result.reason) || 'Location command failed',
            C.CODES.LOCATION_FAILED);
    }

    // ---- Justice / watch (delegated to Settlement) ---------------------------

    function updateJusticeSeverity(locationId, severity) {
        var result = _SettlementGovCmds.setJusticeSeverity(locationId, severity);
        var wrapped = _wrapSettlementResult(result);

        if (wrapped.success) {
            _log('justice', 'severity_updated',
                'Justice severity at ' + locationId + ' set to ' + severity, []);
            _commit(C.EVENTS.JUSTICE_SEVERITY_UPDATED, {
                locationId: locationId,
                severity: severity
            });
        }

        return wrapped;
    }

    function updateWatch(locationId, hasWatch, size) {
        var result = _SettlementGovCmds.setWatch(locationId, {
            hasWatch: !!hasWatch,
            watchSize: hasWatch ? (size != null ? size : 0) : 0
        });
        var wrapped = _wrapSettlementResult(result);

        if (wrapped.success) {
            _log('justice', 'watch_updated', 'Watch at ' + locationId + ' updated', []);
            _commit(C.EVENTS.WATCH_UPDATED, { locationId: locationId });
        }

        return wrapped;
    }

    function _wrapSettlementResult(result) {
        if (result && result.success) return _ok(result);
        if (result && result.code) return _fail(result.reason || result.code, result.code);
        return _fail('Settlement command failed', C.CODES.SETTLEMENT_FAILED);
    }

    // ---- Export --------------------------------------------------------------

    window.GovernmentCommands = {
        // Departments
        createDepartment: createDepartment,
        updateDepartment: updateDepartment,
        deleteDepartment: deleteDepartment,

        // Positions
        addPosition: addPosition,
        updatePosition: updatePosition,
        deletePosition: deletePosition,
        updatePositionSalary: updatePositionSalary,

        // Assignments
        assignCharacterToPosition: assignCharacterToPosition,
        endAssignment: endAssignment,
        removeAssignment: removeAssignment,
        bulkAssignCharacters: bulkAssignCharacters,

        // Salary payment (cross-domain, separate transaction)
        paySalaryForAssignment: paySalaryForAssignment,

        // Government types
        createGovernmentType: createGovernmentType,
        updateGovernmentType: updateGovernmentType,
        deleteGovernmentType: deleteGovernmentType,

        // Leader / place government (delegated)
        assignLeader: assignLeader,
        endLeaderTerm: endLeaderTerm,
        assignGovernmentToPlace: assignGovernmentToPlace,

        // Justice / watch (delegated)
        updateJusticeSeverity: updateJusticeSeverity,
        updateWatch: updateWatch,

        // Persistence
        persist: persist
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.GovernmentCommands;
    }
})();
