/**
 * government-commands.js
 * Write layer. Single transaction boundary per command. No toasts.
 * Result contract: { success: true, data } | { success: false, reason, code? }
 *
 * Cross-domain mutations (leader, place government, justice, watch, salary
 * payment) delegate to the owning domain. This module does not write to
 * Location, Settlement, Household, or Character canonical data directly.
 */
(function() {
    'use strict';

    var _CharacterCommands   = window.CharacterCommands;
    var _CharacterQueries    = window.CharacterQueries;
    var _LocationQueries     = window.LocationQueries;
    var _LocationCommands    = window.LocationCommands;
    var _HouseholdCommands   = window.HouseholdCommands;
    var _HouseholdQueries    = window.HouseholdQueries;
    var _SettlementQueries   = window.SettlementQueries;
    var _SettlementGovCmds   = window.SettlementGovernmentCommands;
    var _Rules               = window.GovernmentRules;

    if (!_CharacterQueries)  throw new Error('government-commands.js requires CharacterQueries');
    if (!_LocationQueries)   throw new Error('government-commands.js requires LocationQueries');
    if (!_LocationCommands)  throw new Error('government-commands.js requires LocationCommands');
    if (!_SettlementQueries) throw new Error('government-commands.js requires SettlementQueries');
    if (!_SettlementGovCmds) throw new Error('government-commands.js requires SettlementGovernmentCommands');
    if (!window.GovernmentQueries) throw new Error('government-commands.js requires GovernmentQueries');
    if (!window.GovernmentState)   throw new Error('government-commands.js requires GovernmentState');
    if (!_Rules)                   throw new Error('government-commands.js requires GovernmentRules');

    var State = window.GovernmentState;
    var Queries = window.GovernmentQueries;

    function _now() { return window.getCurrentYearSafe(); }

    function _ok(data) { return { success: true, data: data }; }
    function _fail(reason, code) { return { success: false, reason: reason, code: code || null }; }

    // ---- Transaction boundary ------------------------------------------------

    function _commit() {
        if (typeof window.saveMasterData === 'function') window.saveMasterData(true);
        State.invalidateCache();
        if (typeof window.invalidateAccessorCaches === 'function') window.invalidateAccessorCaches();
    }

    function _log(category, type, message, subjects) {
        if (typeof window.logEvent === 'function') window.logEvent(category, type, message, subjects || []);
    }

    var _warnedMissingHousehold = false;
    function _warnHouseholdOnce() {
        if (_warnedMissingHousehold) return;
        _warnedMissingHousehold = true;
        if (typeof console !== 'undefined' && console.warn) {
            console.warn('government-commands.js: HouseholdCommands/HouseholdQueries not loaded; salary payment skipped.');
        }
    }

    // ---- Salary payment (cross-domain delegation) ----------------------------
    // Called immediately after a successful assignment. Salary is a cross-domain
    // side effect, not a validity condition: if Household is unavailable the
    // assignment still succeeds; the salary is skipped and logged once.
    //
    // Returns { paid: bool, amount?: number, householdId?: string, reason?: string }
    // so the caller can include the outcome in the assignment result.

    function _payAssignmentSalary(characterId, position, dept) {
        if (!_HouseholdCommands || !_HouseholdQueries) {
            _warnHouseholdOnce();
            return { paid: false, reason: 'household-modules-unavailable' };
        }
        if (!window.GovernmentEconomy ||
            typeof window.GovernmentEconomy.calculatePositionSalary !== 'function') {
            return { paid: false, reason: 'economy-unavailable' };
        }

        var salary = window.GovernmentEconomy.calculatePositionSalary(dept.id, position.id);
        if (salary == null || salary <= 0) {
            return { paid: false, reason: 'no-salary' };
        }

        var household = _HouseholdQueries.getCharacterHousehold(characterId);
        if (!household) {
            return { paid: false, reason: 'no-household' };
        }

        var reason = 'Government salary: ' + position.name + ' (' + dept.name + ')';
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
            'Salary ' + salary + ' gold paid to household "' + household.name + '" for ' + position.name,
            []);

        return { paid: true, amount: salary, householdId: household.id };
    }

    // ---- Department commands -------------------------------------------------

    function createDepartment(data) {
        var v = _Rules.validateDepartment(data, false);
        if (!v.valid) return _fail(v.reason, 'VALIDATION');

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

        State._addDepartmentRecord(dept);
        _commit();

        var loc = _LocationQueries.getPlaceSummary
            ? _LocationQueries.getPlaceSummary(dept.locationId)
            : null;
        _log('government', 'department_created',
            'Department "' + dept.name + '" created at ' +
            (loc ? loc.displayName : dept.locationId), []);

        return _ok({ id: dept.id, departmentId: dept.id });
    }

    function updateDepartment(departmentId, updates) {
        var dept = State._getDepartmentRecord(departmentId);
        if (!dept) return _fail('Department not found', 'NOT_FOUND');

        var v = _Rules.validateDepartment(updates, true, departmentId);
        if (!v.valid) return _fail(v.reason, 'VALIDATION');

        State._updateDepartmentRecord(departmentId, updates);
        _commit();

        _log('government', 'department_updated', 'Department "' + dept.name + '" updated', []);
        return _ok({ id: departmentId, departmentId: departmentId });
    }

    function deleteDepartment(departmentId, options) {
        options = options || {};
        var dept = State._getDepartmentRecord(departmentId);
        if (!dept) return _fail('Department not found', 'NOT_FOUND');

        var cascade = !!options.cascade;
        var impact = Queries.getDepartmentDeletionImpact(departmentId);

        if (!cascade) {
            if (impact.hasChildren) {
                return _fail('Department has ' + impact.childDepartmentCount +
                    ' child departments. Use cascade to delete them.', 'HAS_CHILDREN');
            }
            if (impact.hasActiveAssignments) {
                return _fail('Department has ' + impact.activeAssignmentCount +
                    ' active assignments. Use cascade to remove them.', 'HAS_ASSIGNMENTS');
            }
        }

        var name = dept.name;
        _deleteDepartmentCascadeInternal(departmentId);
        _commit();

        _log('government', 'department_deleted',
            'Department "' + name + '" deleted' + (cascade ? ' (cascade)' : ''), []);

        return _ok({ id: departmentId });
    }

    function _deleteDepartmentCascadeInternal(departmentId) {
        var children = State._getDepartmentRecordsByParent(departmentId);
        for (var i = 0; i < children.length; i++) {
            _deleteDepartmentCascadeInternal(children[i].id);
        }
        State._deleteDepartmentRecord(departmentId);
    }

    // ---- Position commands ---------------------------------------------------

    function addPosition(departmentId, data) {
        var dept = State._getDepartmentRecord(departmentId);
        if (!dept) return _fail('Department not found', 'NOT_FOUND');

        var v = _Rules.validatePosition(data, false);
        if (!v.valid) return _fail(v.reason, 'VALIDATION');

        var position = {
            id: window.generateId('govpos'),
            name: data.name.trim(),
            description: data.description || '',
            priority: data.priority != null ? data.priority : _Rules.DEFAULT_POSITION_PRIORITY,
            parentPositionId: data.parentPositionId || null,
            requiredRoleId: data.requiredRoleId || null,
            minSkillLevel: data.minSkillLevel != null ? data.minSkillLevel : _Rules.DEFAULT_MIN_SKILL_LEVEL,
            genderRestriction: data.genderRestriction || 'either',
            requiredRankId: data.requiredRankId || null,
            minExperience: data.minExperience != null ? data.minExperience : 0,
            salaryOverrides: []
        };

        State._addPositionRecord(departmentId, position);
        _commit();

        _log('government', 'position_added',
            'Position "' + position.name + '" added to "' + dept.name + '"', []);

        return _ok({ id: position.id, positionId: position.id, departmentId: departmentId });
    }

    function updatePosition(departmentId, positionId, updates) {
        var dept = State._getDepartmentRecord(departmentId);
        if (!dept) return _fail('Department not found', 'NOT_FOUND');

        var pos = State._getPositionRecord(departmentId, positionId);
        if (!pos) return _fail('Position not found', 'NOT_FOUND');

        var v = _Rules.validatePosition(updates, true);
        if (!v.valid) return _fail(v.reason, 'VALIDATION');

        if (updates.parentPositionId !== undefined && updates.parentPositionId) {
            var hier = _Rules.validatePositionHierarchy(
                departmentId,
                positionId,
                updates.parentPositionId,
                State._getPositionRecord
            );
            if (!hier.valid) return _fail(hier.reason, 'CYCLE');
        }

        State._updatePositionRecord(departmentId, positionId, updates);
        _commit();

        _log('government', 'position_updated',
            'Position "' + pos.name + '" updated in "' + dept.name + '"', []);

        return _ok({ id: positionId, positionId: positionId, departmentId: departmentId });
    }

    function deletePosition(departmentId, positionId) {
        var dept = State._getDepartmentRecord(departmentId);
        if (!dept) return _fail('Department not found', 'NOT_FOUND');

        var pos = State._getPositionRecord(departmentId, positionId);
        if (!pos) return _fail('Position not found', 'NOT_FOUND');

        var active = State._getAssignmentRecordsForPosition(departmentId, positionId, true);
        if (active.length > 0) {
            return _fail('Position has ' + active.length + ' active assignment(s). Remove them first.', 'HAS_ASSIGNMENTS');
        }

        State._deletePositionRecord(departmentId, positionId);
        _commit();

        _log('government', 'position_deleted',
            'Position "' + pos.name + '" deleted from "' + dept.name + '"', []);

        return _ok({ id: positionId });
    }

    // ---- Assignment commands -------------------------------------------------

    function assignCharacterToPosition(departmentId, positionId, characterId, options) {
        var result = _assignInternal(departmentId, positionId, characterId, options || {});
        if (!result.success) return result;

        _commit();
        _emitAssignmentEvent(result.data);

        // Salary payment is a cross-domain side effect. It runs after the
        // assignment commit so a salary failure cannot leave a half-applied
        // assignment. The outcome is included in the result.
        var salaryOutcome = _payAssignmentSalary(
            characterId,
            State._getPositionRecord(departmentId, positionId),
            State._getDepartmentRecord(departmentId)
        );
        result.data.salary = salaryOutcome;

        return result;
    }

    function _assignInternal(departmentId, positionId, characterId, options) {
        var dept = State._getDepartmentRecord(departmentId);
        if (!dept) return _fail('Department not found', 'NOT_FOUND');

        var pos = State._getPositionRecord(departmentId, positionId);
        if (!pos) return _fail('Position not found', 'NOT_FOUND');

        var charFacts = _CharacterQueries.getCharacterFacts(characterId);
        if (!charFacts) return _fail('Character not found', 'NOT_FOUND');
        if (charFacts.isDeceased) return _fail('Character is deceased', 'DECEASED');

        var existing = State._getAssignmentRecordsForPosition(departmentId, positionId, true);
        for (var i = 0; i < existing.length; i++) {
            if (existing[i].characterId === characterId) {
                return _fail('Character already assigned to this position', 'ALREADY_ASSIGNED');
            }
        }

        var plan = _Rules.planAssignment({
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
                    : _Rules.DEFAULT_SKILL_LEVEL,
                addRoleIfMissing: options.addRoleIfMissing !== false
            }
        });

        if (!plan.valid) return _fail(plan.reason, plan.code || 'INELIGIBLE');

        if (plan.roleToAdd && _CharacterCommands) {
            var addResult = _CharacterCommands.addProfession(characterId, plan.roleToAdd.roleId, {
                skillLevel: plan.roleToAdd.skillLevel,
                startYear: plan.startYear
            });
            if (!addResult || !addResult.success) {
                return _fail('Failed to add required profession', 'PROFESSION_FAILED');
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

        State._addAssignmentRecord(departmentId, assignment);
        return _ok({
            assignmentId: assignment.id,
            departmentId: departmentId,
            characterId: characterId
        });
    }

    function _emitAssignmentEvent(data) {
        var dept = State._getDepartmentRecord(data.departmentId);
        var asg = State._getAssignmentRecord(data.departmentId, data.assignmentId);
        var pos = asg ? State._getPositionRecord(data.departmentId, asg.positionId) : null;
        var charFacts = _CharacterQueries.getCharacterFacts(data.characterId);
        _log('government', 'character_assigned',
            (charFacts ? charFacts.fullName : data.characterId) +
            ' assigned to "' + (pos ? pos.name : '?') + '" in "' + (dept ? dept.name : '?') + '"', []);
    }

    function endAssignment(departmentId, assignmentId, endYear, reason) {
        var dept = State._getDepartmentRecord(departmentId);
        if (!dept) return _fail('Department not found', 'NOT_FOUND');

        var a = State._getAssignmentRecord(departmentId, assignmentId);
        if (!a) return _fail('Assignment not found', 'NOT_FOUND');
        if (a.endYear !== null && a.endYear !== undefined) return _fail('Assignment already ended', 'ALREADY_ENDED');

        var endYearValue = endYear != null ? endYear : _now();
        if (endYearValue <= a.startYear) {
            return _fail('End year must be after start year (' + a.startYear + ')', 'VALIDATION');
        }

        State._updateAssignmentRecord(departmentId, assignmentId, {
            endYear: endYearValue,
            endReason: reason || 'Term ended'
        });
        _commit();

        var charFacts = _CharacterQueries.getCharacterFacts(a.characterId);
        _log('government', 'assignment_ended',
            (charFacts ? charFacts.fullName : a.characterId) + ' ended assignment at "' + dept.name + '"' +
            (reason ? ' (' + reason + ')' : ''), []);

        return _ok({ id: assignmentId });
    }

    function removeAssignment(departmentId, assignmentId) {
        var dept = State._getDepartmentRecord(departmentId);
        if (!dept) return _fail('Department not found', 'NOT_FOUND');

        var a = State._getAssignmentRecord(departmentId, assignmentId);
        if (!a) return _fail('Assignment not found', 'NOT_FOUND');

        State._deleteAssignmentRecord(departmentId, assignmentId);
        _commit();

        var charFacts = _CharacterQueries.getCharacterFacts(a.characterId);
        _log('government', 'assignment_removed',
            (charFacts ? charFacts.fullName : a.characterId) + ' removed from assignment at "' + dept.name + '"', []);

        return _ok({ id: assignmentId });
    }

    function bulkAssignCharacters(departmentId, positionId, assignments, options) {
        options = options || {};
        var mode = options.mode === 'atomic' ? 'atomic' : 'best-effort';
        var applied = [];
        var failures = [];

        var plans = [];
        for (var i = 0; i < assignments.length; i++) {
            var input = assignments[i];
            var plan = _planAssignmentStandalone(departmentId, positionId, input.characterId, input);
            if (plan.success) plans.push({ input: input, data: plan.data });
            else failures.push({ input: input, reason: plan.reason, code: plan.code });
        }

        if (mode === 'atomic' && failures.length > 0) {
            return _fail('Bulk assignment aborted: ' + failures.length + ' invalid input(s)', 'ATOMIC_ABORT');
        }

        var dept = State._getDepartmentRecord(departmentId);
        var pos = State._getPositionRecord(departmentId, positionId);

        for (var j = 0; j < plans.length; j++) {
            var res = _applyAssignmentPlan(departmentId, positionId, plans[j].data);
            if (res.success) {
                applied.push(res.data);
                // Pay salary per successful assignment.
                var salary = _payAssignmentSalary(plans[j].data.characterId, pos, dept);
                res.data.salary = salary;
            } else {
                failures.push({ input: plans[j].input, reason: res.reason, code: res.code });
            }
        }

        if (applied.length > 0) _commit();

        return _ok({
            applied: applied.length,
            failed: failures.length,
            results: applied,
            failures: failures
        });
    }

    function _planAssignmentStandalone(departmentId, positionId, characterId, options) {
        var dept = State._getDepartmentRecord(departmentId);
        if (!dept) return _fail('Department not found', 'NOT_FOUND');
        var pos = State._getPositionRecord(departmentId, positionId);
        if (!pos) return _fail('Position not found', 'NOT_FOUND');
        var charFacts = _CharacterQueries.getCharacterFacts(characterId);
        if (!charFacts) return _fail('Character not found', 'NOT_FOUND');
        if (charFacts.isDeceased) return _fail('Character is deceased', 'DECEASED');

        var existing = State._getAssignmentRecordsForPosition(departmentId, positionId, true);
        for (var i = 0; i < existing.length; i++) {
            if (existing[i].characterId === characterId) return _fail('Already assigned', 'ALREADY_ASSIGNED');
        }

        var plan = _Rules.planAssignment({
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
                    : _Rules.DEFAULT_SKILL_LEVEL,
                addRoleIfMissing: options.addRoleIfMissing !== false
            }
        });
        if (!plan.valid) return _fail(plan.reason, plan.code || 'INELIGIBLE');

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

        if (plan.roleToAdd && _CharacterCommands) {
            var addResult = _CharacterCommands.addProfession(planData.characterId, plan.roleToAdd.roleId, {
                skillLevel: plan.roleToAdd.skillLevel,
                startYear: plan.startYear
            });
            if (!addResult || !addResult.success) {
                return _fail('Failed to add required profession', 'PROFESSION_FAILED');
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
        State._addAssignmentRecord(departmentId, assignment);
        _log('government', 'character_assigned',
            charFacts.fullName + ' assigned to "' + pos.name + '" (bulk)', []);
        return _ok({ assignmentId: assignment.id, characterId: planData.characterId });
    }

    // ---- Salary override (position) ------------------------------------------

    function updatePositionSalary(departmentId, positionId, newSalary, options) {
        options = options || {};
        var dept = State._getDepartmentRecord(departmentId);
        if (!dept) return _fail('Department not found', 'NOT_FOUND');

        var pos = State._getPositionRecord(departmentId, positionId);
        if (!pos) return _fail('Position not found', 'NOT_FOUND');

        var v = _Rules.validateSalaryUpdate(positionId, newSalary);
        if (!v.valid) return _fail(v.reason, 'VALIDATION');

        State._appendSalaryOverrideRecord(departmentId, positionId, {
            salary: newSalary,
            year: options.year != null ? options.year : _now(),
            reason: options.reason || 'Manual adjustment'
        });
        _commit();

        _log('economy', 'salary_overridden',
            'Salary for "' + pos.name + '" in "' + dept.name + '" set to ' + newSalary, []);

        return _ok({ positionId: positionId, salary: newSalary });
    }

    // ---- Government type commands --------------------------------------------

    function createGovernmentType(data) {
        var v = _Rules.validateGovernmentType(data, false);
        if (!v.valid) return _fail(v.reason, 'VALIDATION');

        var type = {
            id: window.generateId('govtype'),
            name: data.name.trim(),
            description: data.description || '',
            allowedRankIds: (data.allowedRankIds || []).slice(),
            icon: data.icon || ''
        };

        State._addGovernmentTypeRecord(type);
        _commit();

        _log('government', 'type_created', 'Government type "' + type.name + '" created', []);
        return _ok({ id: type.id, governmentTypeId: type.id });
    }

    function updateGovernmentType(typeId, updates) {
        var type = State._getGovernmentTypeRecord(typeId);
        if (!type) return _fail('Government type not found', 'NOT_FOUND');

        var v = _Rules.validateGovernmentType(updates, true);
        if (!v.valid) return _fail(v.reason, 'VALIDATION');

        State._updateGovernmentTypeRecord(typeId, {
            name: updates.name !== undefined ? updates.name : undefined,
            description: updates.description,
            allowedRankIds: updates.allowedRankIds,
            icon: updates.icon
        });
        _commit();

        _log('government', 'type_updated', 'Government type "' + type.name + '" updated', []);
        return _ok({ id: typeId, governmentTypeId: typeId });
    }

    function deleteGovernmentType(typeId) {
        var type = State._getGovernmentTypeRecord(typeId);
        if (!type) return _fail('Government type not found', 'NOT_FOUND');

        var usage = _LocationQueries.getPlacesUsingGovernmentType
            ? _LocationQueries.getPlacesUsingGovernmentType(typeId)
            : [];
        if (usage && usage.length > 0) {
            return _fail('Cannot delete: used by ' + usage.length + ' location(s)', 'IN_USE');
        }

        var name = type.name;
        State._deleteGovernmentTypeRecord(typeId);
        _commit();

        _log('government', 'type_deleted', 'Government type "' + name + '" deleted', []);
        return _ok({ id: typeId });
    }

    // ---- Leader / place government (delegated to Location) -------------------

    function assignLeader(placeId, characterId, startYear, title) {
        var result = _LocationCommands.assignLeader(placeId, characterId, startYear, title);
        if (result && result.success !== false) {
            var c = _CharacterQueries.getCharacterFacts(characterId);
            _log('leadership', 'assigned',
                (c ? c.fullName : characterId) + ' assigned as leader of ' + placeId, []);
        }
        return _wrapLocationResult(result);
    }

    function endLeaderTerm(placeId, characterId, endYear) {
        var result = _LocationCommands.endLeaderTerm(placeId, characterId, endYear);
        if (result && result.success !== false) {
            _log('leadership', 'term_ended', 'Leader term ended at ' + placeId, []);
        }
        return _wrapLocationResult(result);
    }

    function assignGovernmentToPlace(placeId, govTypeId, govStyle) {
        var result = _LocationCommands.assignGovernment(placeId, govTypeId, govStyle);
        if (result && result.success !== false) {
            _log('government', 'assigned_to_place', 'Government assigned to ' + placeId, []);
        }
        return _wrapLocationResult(result);
    }

    function _wrapLocationResult(result) {
        if (result === true || (result && result.success !== false)) {
            return _ok(result === true ? null : result.data || null);
        }
        return _fail((result && result.reason) || 'Location command failed', 'LOCATION_FAILED');
    }

    // ---- Justice / watch (delegated to Settlement) ---------------------------

    function updateJusticeSeverity(locationId, severity) {
        var result = _SettlementGovCmds.setJusticeSeverity(locationId, severity);
        if (result && result.success) {
            _log('justice', 'severity_updated',
                'Justice severity at ' + locationId + ' set to ' + severity, []);
        }
        return _wrapSettlementResult(result);
    }

    function updateWatch(locationId, hasWatch, size) {
        var result = _SettlementGovCmds.setWatch(locationId, {
            hasWatch: !!hasWatch,
            watchSize: hasWatch ? (size != null ? size : 0) : 0
        });
        if (result && result.success) {
            _log('justice', 'watch_updated', 'Watch at ' + locationId + ' updated', []);
        }
        return _wrapSettlementResult(result);
    }

    function _wrapSettlementResult(result) {
        if (result && result.success) return _ok(result);
        if (result && result.code) return _fail(result.reason || result.code, result.code);
        return _fail('Settlement command failed', 'SETTLEMENT_FAILED');
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

        // Government types
        createGovernmentType: createGovernmentType,
        updateGovernmentType: updateGovernmentType,
        deleteGovernmentType: deleteGovernmentType,

        // Leader / place government (delegated)
        assignLeader: assignLeader,
        endLeaderTerm: endLeaderTerm,
        assignGovernmentToPlace: assignGovernmentToPlace,

        // Justice (delegated)
        updateJusticeSeverity: updateJusticeSeverity,
        updateWatch: updateWatch,

        // Transaction helper
        _commit: _commit
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.GovernmentCommands;
    }
})();
