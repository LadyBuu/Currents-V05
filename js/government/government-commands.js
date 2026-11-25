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

    function _validateRequiredRankReference(rankId) {
        if (rankId == null || rankId === '') return null;
        var rankQueries = window.RankQueries;
        if (!rankQueries || typeof rankQueries.getRank !== 'function') {
            return 'Rank queries are unavailable; cannot validate the required rank';
        }
        try {
            if (!rankQueries.getRank(rankId)) {
                return 'Required rank "' + rankId + '" does not exist';
            }
        } catch (e) {
            return 'Required rank could not be verified; rank queries failed';
        }
        return null;
    }

    function _validateRequiredRoleReference(roleId) {
        if (roleId == null || roleId === '') return null;
        var roleQueries = window.RoleQueries;
        if (!roleQueries || typeof roleQueries.getRoleSummary !== 'function') {
            return 'Role queries are unavailable; cannot validate the required role';
        }
        try {
            if (!roleQueries.getRoleSummary(roleId)) {
                return 'Required role "' + roleId + '" does not exist';
            }
        } catch (e) {
            return 'Required role could not be verified; role queries failed';
        }
        return null;
    }

    function _validateAllowedRankReferences(rankIds) {
        if (rankIds == null) return null;
        if (!Array.isArray(rankIds)) return 'Allowed ranks must be an array';
        var rankQueries = window.RankQueries;
        if (!rankQueries || typeof rankQueries.getRank !== 'function') {
            return 'Rank queries are unavailable; cannot validate allowed ranks';
        }
        var seen = new Set();
        for (var i = 0; i < rankIds.length; i++) {
            var rankId = rankIds[i];
            if (typeof rankId !== 'string' || rankId.length === 0) {
                return 'Allowed rank IDs must be non-empty strings';
            }
            if (seen.has(rankId)) {
                return 'Allowed ranks contains duplicate rank ID "' + rankId + '"';
            }
            seen.add(rankId);
            try {
                if (!rankQueries.getRank(rankId)) {
                    return 'Allowed rank "' + rankId + '" does not exist';
                }
            } catch (e) {
                return 'Allowed rank "' + rankId + '" could not be verified';
            }
        }
        return null;
    }

    // Empty allowedRankIds means unrestricted leadership. A non-empty list
    // is an exact allowlist of the active Character Rank, not a minimum rank.
    function _validateLeaderRankForGovernmentType(placeId, governmentType) {
        if (!governmentType) return 'Government type could not be verified';
        if (!Array.isArray(governmentType.allowedRankIds)) {
            return 'Cannot verify the current leader because the government type rank allowlist is missing or malformed';
        }
        if (governmentType.allowedRankIds.length === 0) return null;

        if (typeof _LocationQueries.getCurrentLeader !== 'function' ||
            typeof _CharacterQueries.getCharacterFacts !== 'function') {
            return 'Cannot verify the current leader against this government type';
        }
        var leader;
        try {
            leader = _LocationQueries.getCurrentLeader(placeId);
        } catch (e) {
            return 'Cannot verify the current leader against this government type';
        }
        if (!leader) return null;

        var facts;
        try {
            facts = _CharacterQueries.getCharacterFacts(leader.characterId);
        } catch (e) {
            return 'Cannot verify the current leader rank';
        }
        if (!facts) return 'Cannot verify the current leader rank';
        if (governmentType.allowedRankIds.indexOf(facts.activeRankId) === -1) {
            return 'Current leader does not hold a rank allowed by government type "' +
                governmentType.name + '"';
        }
        return null;
    }

    function _validateLeaderCandidateForPlace(placeId, characterId) {
        if (typeof _LocationQueries.getPlaceSummary !== 'function') {
            return 'Cannot verify the location government type';
        }
        var place;
        try {
            place = _LocationQueries.getPlaceSummary(placeId);
        } catch (e) {
            return 'Cannot verify the location government type';
        }
        if (!place) return 'Location not found';
        if (!place.governmentTypeId) return null;

        var governmentType = State._getGovernmentTypeCanonical(place.governmentTypeId);
        if (!governmentType) {
            return 'The location references a missing government type';
        }
        if (!Array.isArray(governmentType.allowedRankIds)) {
            return 'The assigned government type has a missing or malformed rank allowlist; leader eligibility cannot be verified';
        }
        if (governmentType.allowedRankIds.length === 0) return null;

        var facts;
        try {
            facts = _CharacterQueries.getCharacterFacts(characterId);
        } catch (e) {
            return 'Cannot verify the candidate leader rank';
        }
        if (!facts) return 'Cannot verify the candidate leader rank';
        if (governmentType.allowedRankIds.indexOf(facts.activeRankId) === -1) {
            return 'This government type does not allow the candidate leader rank';
        }
        return null;
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
        var referenceCheck = _validateDepartmentReferences(data, null);
        if (!referenceCheck.valid) return _fail(referenceCheck.reason, C.CODES.VALIDATION);

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
        var referenceCheck = _validateDepartmentReferences(updates, dept);
        if (!referenceCheck.valid) return _fail(referenceCheck.reason, C.CODES.VALIDATION);

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

    function _deleteDepartmentCascadeInternal(departmentId, visited) {
        visited = visited || new Set();
        if (!departmentId || visited.has(departmentId)) return;
        visited.add(departmentId);
        var children = State._getDepartmentsByParentCanonical(departmentId);
        // Copy the array because removal mutates the hierarchy indexes.
        var snapshot = children.slice();
        for (var i = 0; i < snapshot.length; i++) {
            _deleteDepartmentCascadeInternal(snapshot[i].id, visited);
        }
        State._removeDepartment(departmentId);
    }

    function _validateDepartmentReferences(data, existingDepartment) {
        var locationId = data.locationId !== undefined
            ? data.locationId
            : existingDepartment && existingDepartment.locationId;
        if (!locationId || typeof _LocationQueries.getPlaceSummary !== 'function') {
            return { valid: false, reason: 'Department location cannot be verified: LocationQueries.getPlaceSummary unavailable' };
        }
        try {
            if (!_LocationQueries.getPlaceSummary(locationId)) {
                return { valid: false, reason: 'Department location does not exist' };
            }
        } catch (locationError) {
            return { valid: false, reason: 'Department location could not be verified' };
        }

        var parentId = data.parentDepartmentId !== undefined
            ? (data.parentDepartmentId || null)
            : existingDepartment && existingDepartment.parentDepartmentId;
        if (!parentId) return { valid: true };
        if (existingDepartment && parentId === existingDepartment.id) {
            return { valid: false, reason: 'Department cannot be its own parent' };
        }

        var parent = State._getDepartmentCanonical(parentId);
        if (!parent) {
            return { valid: false, reason: 'Parent department does not exist' };
        }

        // Walk upward from the proposed parent. Reaching the edited
        // department would make it a descendant of itself. A visited set
        // also rejects already-corrupt parent chains instead of looping.
        var visited = new Set();
        var current = parent;
        while (current) {
            if (visited.has(current.id)) {
                return { valid: false, reason: 'Existing department hierarchy contains a cycle' };
            }
            visited.add(current.id);
            if (existingDepartment && current.id === existingDepartment.id) {
                return { valid: false, reason: 'Cannot move a department beneath one of its descendants' };
            }
            if (!current.parentDepartmentId) break;
            current = State._getDepartmentCanonical(current.parentDepartmentId);
            if (!current) {
                return { valid: false, reason: 'Department hierarchy references a missing parent' };
            }
        }
        return { valid: true };
    }

    /**
     * Remove departments tied to deleted locations, including their
     * descendants so no child department is left with a dangling parent.
     * Government history is deliberately retained as an audit record.
     */
    function reconcileDeletedLocations(locationIds, options) {
        options = options || {};
        if (!Array.isArray(locationIds) || locationIds.length === 0) {
            return _ok({ removedDepartmentIds: [] });
        }
        try {
            var removedDepartmentIds = State._reconcileDeletedLocations(locationIds, options);
            if (options.dryRun === true) {
                return _ok({ removedDepartmentIds: removedDepartmentIds, dryRun: true });
            }
            if (removedDepartmentIds.length > 0 && options.deferCommit !== true) {
                _commit('governmentDepartmentsReconciled', {
                    departmentIds: removedDepartmentIds,
                    reason: 'location_deleted'
                });
            }
            return _ok({ removedDepartmentIds: removedDepartmentIds });
        } catch (error) {
            return _fail(
                'Government location reconciliation failed: ' +
                (error && error.message ? error.message : String(error)) +
                (error && error.rollbackError
                    ? '; rollback also failed: ' + error.rollbackError.message
                    : ''),
                C.CODES.INTERNAL
            );
        }
    }

    function _collectDepartmentSubtree(departmentId, collected) {
        if (!departmentId || collected.has(departmentId)) return;
        collected.add(departmentId);
        var children = State._getDepartmentsByParentCanonical(departmentId).slice();
        for (var i = 0; i < children.length; i++) {
            _collectDepartmentSubtree(children[i].id, collected);
        }
    }

    // ---- Position commands ---------------------------------------------------

    function addPosition(departmentId, data) {
        var dept = State._getDepartmentCanonical(departmentId);
        if (!dept) return _fail('Department not found', C.CODES.NOT_FOUND);

        var rankError = _validateRequiredRankReference(data && data.requiredRankId);
        if (rankError) return _fail(rankError, C.CODES.VALIDATION);
        var roleError = _validateRequiredRoleReference(data && data.requiredRoleId);
        if (roleError) return _fail(roleError, C.CODES.VALIDATION);
        if (data && data.parentPositionId &&
            !State._getPositionCanonical(departmentId, data.parentPositionId)) {
            return _fail('Parent position does not exist in this department', C.CODES.NOT_FOUND);
        }

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

        if (Object.prototype.hasOwnProperty.call(updates, 'requiredRankId')) {
            var rankError = _validateRequiredRankReference(updates.requiredRankId);
            if (rankError) return _fail(rankError, C.CODES.VALIDATION);
        }
        if (Object.prototype.hasOwnProperty.call(updates, 'requiredRoleId')) {
            var roleError = _validateRequiredRoleReference(updates.requiredRoleId);
            if (roleError) return _fail(roleError, C.CODES.VALIDATION);
        }

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

        var assignments = State._getAssignmentsForPositionCanonical(
            departmentId, positionId, false
        );
        if (assignments.length > 0) {
            var activeCount = 0;
            for (var assignmentIndex = 0; assignmentIndex < assignments.length; assignmentIndex++) {
                if (assignments[assignmentIndex].endYear == null) activeCount++;
            }
            return _fail(
                'Position has ' + assignments.length + ' assignment record(s)' +
                (activeCount ? ', including ' + activeCount + ' active' : '') +
                '. It cannot be deleted without orphaning assignment history.',
                C.CODES.HAS_ASSIGNMENTS
            );
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
        if (charFacts.isDeleted === true) return _fail('Character is soft-deleted', C.CODES.VALIDATION);

        var existing = State._getAssignmentsForPositionCanonical(departmentId, positionId, true);
        for (var i = 0; i < existing.length; i++) {
            if (existing[i].characterId === characterId) {
                return _fail('Character already assigned to this position', C.CODES.ALREADY_ASSIGNED);
            }
        }

        var effectiveStartYear = options.startYear != null ? options.startYear : _now();
        if (typeof window.isValidYear !== 'function' || window.isValidYear(effectiveStartYear) !== true) {
            return _fail('Start year must be a valid world year', C.CODES.VALIDATION);
        }
        if (options.endYear != null && (window.isValidYear(options.endYear) !== true || options.endYear <= effectiveStartYear)) {
            return _fail('End year must be a valid world year after the start year', C.CODES.VALIDATION);
        }
        if (options.title != null && typeof options.title !== 'string') return _fail('Assignment title must be a string', C.CODES.VALIDATION);
        if (options.notes != null && typeof options.notes !== 'string') return _fail('Assignment notes must be a string', C.CODES.VALIDATION);

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
                startYear: effectiveStartYear,
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

        if (!Array.isArray(assignments)) {
            return _fail('assignments must be an array', C.CODES.VALIDATION);
        }

        var dept = State._getDepartmentCanonical(departmentId);
        if (!dept) return _fail('Department not found', C.CODES.NOT_FOUND);

        var pos = State._getPositionCanonical(departmentId, positionId);
        if (!pos) return _fail('Position not found', C.CODES.NOT_FOUND);

        // Plan against both existing state and this batch. Without the batch
        // set, duplicate character IDs pass preflight because no assignment
        // has been written yet, producing duplicate active appointments.
        var plans = [];
        var seenCharacters = new Set();
        for (var i = 0; i < assignments.length; i++) {
            var input = assignments[i];
            if (!input || typeof input !== 'object' ||
                typeof input.characterId !== 'string' || input.characterId.length === 0) {
                failures.push({ input: input, reason: 'A valid characterId is required', code: C.CODES.VALIDATION });
                continue;
            }
            if (seenCharacters.has(input.characterId)) {
                failures.push({ input: input, reason: 'Character appears more than once in this batch', code: C.CODES.ALREADY_ASSIGNED });
                continue;
            }
            seenCharacters.add(input.characterId);
            var plan = _planAssignmentStandalone(departmentId, positionId, input.characterId, input);
            if (plan.success) plans.push({ input: input, data: plan.data });
            else failures.push({ input: input, reason: plan.reason, code: plan.code });
        }

        if (mode === 'atomic' && failures.length > 0) {
            return _fail('Bulk assignment aborted: ' + failures.length +
                ' invalid input(s)', C.CODES.ATOMIC_ABORT);
        }

        // Atomic mode snapshots every character field it may touch and the
        // department's existing assignment IDs before the first write. If a
        // later profession write fails, all earlier profession and
        // appointment writes are compensated before returning failure.
        var professionSnapshots = new Map();
        if (mode === 'atomic') {
            for (var snapshotIndex = 0; snapshotIndex < plans.length; snapshotIndex++) {
                var snapshotId = plans[snapshotIndex].data.characterId;
                if (!professionSnapshots.has(snapshotId)) {
                    var snapshotCharacter = _CharacterQueries.getCharacterById
                        ? _CharacterQueries.getCharacterById(snapshotId)
                        : null;
                    if (!snapshotCharacter) {
                        return _fail('Bulk assignment aborted: character could not be snapshotted (' + snapshotId + ')', C.CODES.ATOMIC_ABORT);
                    }
                    // Professions are intentionally absent from Character
                    // projections. Read them through their owning command API.
                    var snapshotProfessions = _CharacterCommands.getProfessions(snapshotId);
                    if (!Array.isArray(snapshotProfessions)) {
                        return _fail('Bulk assignment aborted: professions could not be snapshotted (' + snapshotId + ')', C.CODES.ATOMIC_ABORT);
                    }
                    professionSnapshots.set(snapshotId, snapshotProfessions.map(function (entry) {
                        return Object.assign({}, entry);
                    }));
                }
            }
        }

        for (var j = 0; j < plans.length; j++) {
            var res;
            try {
                res = _applyAssignmentPlan(departmentId, positionId, plans[j].data);
            } catch (applyError) {
                res = _fail(applyError && applyError.message
                    ? applyError.message
                    : 'Assignment apply threw an unknown error', C.CODES.PROFESSION_FAILED);
            }
            if (res && res.success) {
                applied.push(res.data);
                continue;
            }

            failures.push({ input: plans[j].input, reason: res.reason, code: res.code });
            if (mode === 'atomic') {
                var rollbackErrors = [];
                for (var rollbackAssignmentIndex = applied.length - 1; rollbackAssignmentIndex >= 0; rollbackAssignmentIndex--) {
                    var removed = State._removeAssignment(departmentId, applied[rollbackAssignmentIndex].assignmentId);
                    if (!removed) rollbackErrors.push('Could not remove assignment ' + applied[rollbackAssignmentIndex].assignmentId);
                }
                professionSnapshots.forEach(function (professions, characterId) {
                    var restored = _CharacterCommands.replaceProfessions(characterId, professions);
                    if (!restored || restored.success !== true) {
                        rollbackErrors.push('Could not restore professions for ' + characterId +
                            ': ' + ((restored && restored.reason) || 'unknown error'));
                    }
                });
                if (rollbackErrors.length > 0) {
                    _commit(C.EVENTS.CHARACTER_ASSIGNED, {
                        departmentId: departmentId,
                        positionId: positionId,
                        bulk: true,
                        rollbackFailed: true
                    });
                    return _fail('Atomic assignment failed and rollback was incomplete: ' + rollbackErrors.join('; '), C.CODES.ATOMIC_ABORT);
                }
                return _fail('Atomic assignment rolled back: ' + res.reason, C.CODES.ATOMIC_ABORT);
            }
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
        if (charFacts.isDeleted === true) return _fail('Character is soft-deleted', C.CODES.VALIDATION);

        var existing = State._getAssignmentsForPositionCanonical(departmentId, positionId, true);
        for (var i = 0; i < existing.length; i++) {
            if (existing[i].characterId === characterId) {
                return _fail('Already assigned', C.CODES.ALREADY_ASSIGNED);
            }
        }

        var effectiveStartYear = options.startYear != null ? options.startYear : _now();
        if (typeof window.isValidYear !== 'function' || window.isValidYear(effectiveStartYear) !== true) {
            return _fail('Start year must be a valid world year', C.CODES.VALIDATION);
        }
        if (options.endYear != null && (window.isValidYear(options.endYear) !== true || options.endYear <= effectiveStartYear)) {
            return _fail('End year must be a valid world year after the start year', C.CODES.VALIDATION);
        }
        if (options.title != null && typeof options.title !== 'string') return _fail('Assignment title must be a string', C.CODES.VALIDATION);
        if (options.notes != null && typeof options.notes !== 'string') return _fail('Assignment notes must be a string', C.CODES.VALIDATION);

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

        var rankError = _validateAllowedRankReferences(data.allowedRankIds || []);
        if (rankError) return _fail(rankError, C.CODES.VALIDATION);

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

        if (Object.prototype.hasOwnProperty.call(updates, 'allowedRankIds')) {
            var rankError = _validateAllowedRankReferences(updates.allowedRankIds || []);
            if (rankError) return _fail(rankError, C.CODES.VALIDATION);

            var placesUsingType;
            if (typeof _LocationQueries.getPlacesUsingGovernmentType !== 'function') {
                return _fail(
                    'Cannot verify current leaders: LocationQueries.getPlacesUsingGovernmentType unavailable',
                    C.CODES.VALIDATION
                );
            }
            try {
                placesUsingType = _LocationQueries.getPlacesUsingGovernmentType(typeId);
            } catch (e) {
                return _fail('Cannot verify current leaders for this government type', C.CODES.VALIDATION);
            }
            if (!Array.isArray(placesUsingType)) {
                return _fail('Cannot verify current leaders for this government type', C.CODES.VALIDATION);
            }
            var proposedType = {
                id: type.id,
                name: updates.name !== undefined ? updates.name : type.name,
                allowedRankIds: updates.allowedRankIds || []
            };
            for (var p = 0; p < placesUsingType.length; p++) {
                var leaderError = _validateLeaderRankForGovernmentType(
                    placesUsingType[p].id,
                    proposedType
                );
                if (leaderError) {
                    return _fail(
                        'Cannot update allowed ranks: ' + leaderError +
                        ' (location ' + placesUsingType[p].id + ')',
                        C.CODES.VALIDATION
                    );
                }
            }
        }

        var normalizedUpdates = Object.assign({}, updates);
        if (Object.prototype.hasOwnProperty.call(normalizedUpdates, 'allowedRankIds') &&
            normalizedUpdates.allowedRankIds == null) {
            normalizedUpdates.allowedRankIds = [];
        }
        State._updateGovernmentType(
            typeId,
            normalizedUpdates,
            C.ALLOWED_GOVERNMENT_TYPE_FIELDS
        );
        _commit(C.EVENTS.TYPE_UPDATED, { governmentTypeId: typeId });

        _log('government', 'type_updated', 'Government type "' + type.name + '" updated', []);
        return _ok({ id: typeId, governmentTypeId: typeId });
    }

    function deleteGovernmentType(typeId) {
        var type = State._getGovernmentTypeCanonical(typeId);
        if (!type) return _fail('Government type not found', C.CODES.NOT_FOUND);

        if (typeof _LocationQueries.getPlacesUsingGovernmentType !== 'function') {
            return _fail(
                'Cannot verify government type usage: LocationQueries.getPlacesUsingGovernmentType unavailable',
                C.CODES.VALIDATION
            );
        }
        var usage;
        try {
            usage = _LocationQueries.getPlacesUsingGovernmentType(typeId);
        } catch (usageError) {
            return _fail('Cannot verify whether this government type is in use', C.CODES.VALIDATION);
        }
        if (!Array.isArray(usage)) {
            return _fail('Cannot verify whether this government type is in use', C.CODES.VALIDATION);
        }
        if (usage.length > 0) {
            return _fail('Cannot delete: used by ' + usage.length +
                ' location(s)', C.CODES.IN_USE);
        }

        // Historical assignments retain governmentTypeId. Do not orphan
        // those records when removing an otherwise-unused type.
        var history;
        try {
            history = State.getGovernmentHistory();
        } catch (historyError) {
            return _fail('Cannot verify Government history references', C.CODES.VALIDATION);
        }
        if (!Array.isArray(history)) {
            return _fail('Cannot verify Government history references', C.CODES.VALIDATION);
        }
        var historicalReferences = history.filter(function(record) {
            return record && record.governmentTypeId === typeId;
        });
        if (historicalReferences.length > 0) {
            return _fail(
                'Cannot delete: referenced by ' + historicalReferences.length +
                ' Government history record(s). Keep the type for historical integrity.',
                C.CODES.IN_USE
            );
        }

        var name = type.name;
        State._removeGovernmentType(typeId);
        _commit(C.EVENTS.TYPE_DELETED, { governmentTypeId: typeId });

        _log('government', 'type_deleted', 'Government type "' + name + '" deleted', []);
        return _ok({ id: typeId });
    }

    // ---- Leader / place government (delegated to Location) -------------------

    function assignLeader(placeId, characterId, startYear, title) {
        var rankError = _validateLeaderCandidateForPlace(placeId, characterId);
        if (rankError) return _fail(rankError, C.CODES.VALIDATION);

        var effectiveStartYear = startYear == null ? _now() : startYear;
        if (typeof window.isValidYear !== 'function' ||
            window.isValidYear(effectiveStartYear) !== true) {
            return _fail('Leader start year must be a valid world year', C.CODES.VALIDATION);
        }
        var result = _LocationCommands.assignLeader(placeId, characterId, effectiveStartYear, title);
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
                startYear: effectiveStartYear,
                title: title || null,
                recordedAt: _now()
            });
            _commit(C.EVENTS.LEADER_ASSIGNED, { placeId: placeId, characterId: characterId });
        }

        return wrapped;
    }

    function endLeaderTerm(placeId, characterId, endYear) {
        var effectiveEndYear = endYear == null ? _now() : endYear;
        if (typeof window.isValidYear !== 'function' ||
            window.isValidYear(effectiveEndYear) !== true) {
            return _fail('Leader end year must be a valid world year', C.CODES.VALIDATION);
        }
        var result = _LocationCommands.endLeaderTerm(placeId, characterId, effectiveEndYear);
        var wrapped = _wrapLocationResult(result);

        if (wrapped.success) {
            _log('leadership', 'term_ended', 'Leader term ended at ' + placeId, []);
            State._addGovernmentHistory({
                id: window.generateId('govhist'),
                locationId: placeId,
                characterId: characterId,
                eventType: C.GOVERNMENT_HISTORY_EVENT_TYPES.LEADER_TERM_ENDED,
                endYear: effectiveEndYear,
                recordedAt: _now()
            });
            _commit(C.EVENTS.LEADER_TERM_ENDED, { placeId: placeId, characterId: characterId });
        }

        return wrapped;
    }

    function assignGovernmentToPlace(placeId, govTypeId, govStyle) {
        if (!_LocationQueries.getPlaceSummary(placeId)) {
            return _fail('Location not found', C.CODES.NOT_FOUND);
        }
        var nextGovernmentType = govTypeId
            ? State._getGovernmentTypeCanonical(govTypeId)
            : null;
        if (govTypeId && !nextGovernmentType) {
            return _fail('Government type not found', C.CODES.NOT_FOUND);
        }
        if (nextGovernmentType) {
            var leaderError = _validateLeaderRankForGovernmentType(placeId, nextGovernmentType);
            if (leaderError) return _fail(leaderError, C.CODES.VALIDATION);
        }
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
        reconcileDeletedLocations: reconcileDeletedLocations,

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
