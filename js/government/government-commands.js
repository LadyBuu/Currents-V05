/**
 * government-commands.js
 * Write layer. Single transaction boundary per command. No toasts. No cross-domain mutation.
 * Result contract: { success: true, data } | { success: false, reason, code? }
 */
(function() {
    'use strict';

    var _CharacterCommands = window.CharacterCommands;
    var _CharacterQueries  = window.CharacterQueries;
    var _LocationQueries   = window.LocationQueries;
    var _HouseholdCommands = window.HouseholdCommands;
    var _HouseholdQueries  = window.HouseholdQueries;
    var _SettlementQueries = window.SettlementQueries;
    var _Rules             = window.GovernmentRules;

    if (!_CharacterQueries) throw new Error('government-commands.js requires CharacterQueries');
    if (!_LocationQueries)  throw new Error('government-commands.js requires LocationQueries');
    if (!_SettlementQueries) throw new Error('government-commands.js requires SettlementQueries');
    if (!window.GovernmentQueries) throw new Error('government-commands.js requires GovernmentQueries');
    if (!window.GovernmentState)   throw new Error('government-commands.js requires GovernmentState');

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

        var loc = _LocationQueries.getPlaceSummary(dept.locationId);
        _log('government', 'department_created',
            'Department "' + dept.name + '" created at ' + (loc ? loc.displayName : dept.locationId), []);

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
            var hier = _Rules.validatePositionHierarchy(departmentId, positionId, updates.parentPositionId);
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
        _maybeScheduleSalaryPayment(result.data);

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
                defaultSkillLevel: options.defaultSkillLevel != null ? options.defaultSkillLevel : _Rules.DEFAULT_SKILL_LEVEL,
                addRoleIfMissing: options.addRoleIfMissing !== false
            }
        });

        if (!plan.valid) return _fail(plan.reason, plan.code || 'INELIGIBLE');

        // Cross-domain: add profession if the plan requires it. This is part of the
        // assignment operation and must succeed for the assignment to be valid.
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
        return _ok({ assignmentId: assignment.id, departmentId: departmentId, characterId: characterId });
    }

    function _emitAssignmentEvent(data) {
        var dept = State._getDepartmentRecord(data.departmentId);
        var pos = State._getPositionRecord(data.departmentId, State._getAssignmentRecord(data.departmentId, data.assignmentId).positionId);
        var charFacts = _CharacterQueries.getCharacterFacts(data.characterId);
        _log('government', 'character_assigned',
            (charFacts ? charFacts.fullName : data.characterId) +
            ' assigned to "' + (pos ? pos.name : '?') + '" in "' + (dept ? dept.name : '?') + '"', []);
    }

    function _maybeScheduleSalaryPayment(data) {
        // Salary is a separate cross-domain operation owned by the salary scheduler,
        // not a side effect of assignment. Do not pay here.
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

        // Phase 1: plan all
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

        // Phase 2: apply
        for (var j = 0; j < plans.length; j++) {
            var res = _applyAssignmentPlan(departmentId, positionId, plans[j].data);
            if (res.success) applied.push(res.data);
            else failures.push({ input: plans[j].input, reason: res.reason, code: res.code });
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
                defaultSkillLevel: options.defaultSkillLevel != null ? options.defaultSkillLevel : _Rules.DEFAULT_SKILL_LEVEL,
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

    // ---- Leader / government placement (delegated to Location) ---------------

    function assignLeader(placeId, characterId, startYear, title) {
        if (typeof window.LocationCommands === 'undefined' ||
            typeof window.LocationCommands.assignLeader !== 'function') {
            return _fail('LocationCommands.assignLeader unavailable', 'DEPENDENCY');
        }
        var result = window.LocationCommands.assignLeader(placeId, characterId, startYear, title);
        if (result && result.success) {
            _log('leadership', 'assigned',
                (window.CharacterQueries.getCharacterFacts(characterId) || {}).fullName +
                ' assigned as leader of ' + placeId, []);
        }
        return result;
    }

    function endLeaderTerm(placeId, characterId, endYear) {
        if (typeof window.LocationCommands === 'undefined' ||
            typeof window.LocationCommands.endLeaderTerm !== 'function') {
            return _fail('LocationCommands.endLeaderTerm unavailable', 'DEPENDENCY');
        }
        var result = window.LocationCommands.endLeaderTerm(placeId, characterId, endYear);
        if (result && result.success) {
            _log('leadership', 'term_ended',
                'Leader term ended at ' + placeId, []);
        }
        return result;
    }

    function assignGovernmentToPlace(placeId, govTypeId, govStyle) {
        if (typeof window.LocationCommands === 'undefined' ||
            typeof window.LocationCommands.setGovernment !== 'function') {
            return _fail('LocationCommands.setGovernment unavailable', 'DEPENDENCY');
        }
        var result = window.LocationCommands.setGovernment(placeId, govTypeId, govStyle);
        if (result && result.success) {
            _log('government', 'assigned_to_place',
                'Government assigned to ' + placeId, []);
        }
        return result;
    }

    // ---- Justice / watch (delegated to Settlement) ---------------------------

    function updateJusticeSeverity(locationId, severity) {
        if (typeof window.SettlementCommands === 'undefined' ||
            typeof window.SettlementCommands.updateJusticeSeverity !== 'function') {
            return _fail('SettlementCommands.updateJusticeSeverity unavailable', 'DEPENDENCY');
        }
        var result = window.SettlementCommands.updateJusticeSeverity(locationId, severity);
        if (result && result.success) {
            _log('justice', 'severity_updated', 'Justice severity at ' + locationId + ' set to ' + severity, []);
        }
        return result;
    }

    function updateWatch(locationId, hasWatch, size) {
        if (typeof window.SettlementCommands === 'undefined' ||
            typeof window.SettlementCommands.updateWatch !== 'function') {
            return _fail('SettlementCommands.updateWatch unavailable', 'DEPENDENCY');
        }
        var result = window.SettlementCommands.updateWatch(locationId, hasWatch, size);
        if (result && result.success) {
            _log('justice', 'watch_updated', 'Watch at ' + locationId + ' updated', []);
        }
        return result;
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

        // Leader / place assignment (delegated)
        assignLeader: assignLeader,
        endLeaderTerm: endLeaderTerm,
        assignGovernmentToPlace: assignGovernmentToPlace,

        // Justice (delegated)
        updateJusticeSeverity: updateJusticeSeverity,
        updateWatch: updateWatch,

        // Transaction helper for compound commands (internal use)
        _commit: _commit
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.GovernmentCommands;
    }
})();
