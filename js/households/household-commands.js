/**
 * =============================================================================
 * STILL WATERS - HOUSEHOLD COMMANDS (household-commands.js)
 * =============================================================================
 *
 * LOCATION: js/systems/household/household-commands.js
 *
 * PURPOSE
 * -------
 * Canonical mutation API for household data. This module is the SINGLE
 * WRITE BOUNDARY for the household domain.
 *
 * CONVERGED PATTERN
 * -----------------
 *   - Commands mutate canonical records via HouseholdState primitives.
 *   - Every command ends with _commit(eventName, payload).
 *   - _commit does NOT save. It:
 *       hydrateFromMasterData()
 *       markDirty()
 *       publish(eventName, payload)
 *       dispatch CustomEvent(eventName, payload)
 *   - persist() is the ONLY place that calls saveMasterData().
 *   - Callers (modals, bootstraps, cross-domain orchestrators) call
 *     persist() once per batch.
 *
 * RESULT SHAPE
 * ------------
 *   { success: true,  data: ... }
 *   { success: false, code: 'SOME_CODE', reason: 'human message' }
 *
 * CROSS-DOMAIN RULES
 * ------------------
 *   - Enterprise ownership   → IndustryCommands (canonical)
 *   - Residence occupancy    → ResidenceSystem  (canonical)
 *   - Character reverse index→ CharacterCommands.updateCharacterFields
 *
 * These are verified at LOAD time. Missing required deps throw at load.
 * Optional deps (IndustryCommands, ResidenceSystem) are recorded as
 * present/absent at load; if absent, the commands that need them return
 * a structured failure instead of throwing at call time.
 *
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. LOAD-TIME DEPENDENCY VERIFICATION
    // =========================================================================

    function _requireFunction(name, fn) {
        if (typeof fn !== 'function') {
            throw new Error('HouseholdCommands: ' + name + ' is required');
        }
        return fn;
    }

    function _requireObject(name, obj) {
        if (typeof obj === 'undefined' || obj === null) {
            throw new Error('HouseholdCommands: ' + name + ' is required');
        }
        return obj;
    }

    // Hard dependencies — throw at load
    var _state = _requireObject('HouseholdState', window.HouseholdState);
    var _generateId = _requireFunction('generateId', window.generateId);
    var _getCharacterById = _requireFunction('getCharacterById', window.getCharacterById);
    var _getCurrentYearSafe = _requireFunction('getCurrentYearSafe', window.getCurrentYearSafe);
    var _saveMasterData = _requireFunction('saveMasterData', window.saveMasterData);

    // State internal API — verify the shape we depend on
    if (!_state._internal || typeof _state._internal !== 'object') {
        throw new Error('HouseholdCommands: HouseholdState._internal is required');
    }
    var _internal = _state._internal;
    _requireFunction('HouseholdState._internal.getHouseholdRecord', _internal.getHouseholdRecord);
    _requireFunction('HouseholdState._internal.getAllHouseholdRecords', _internal.getAllHouseholdRecords);
    _requireFunction('HouseholdState._internal.replaceHouseholds', _internal.replaceHouseholds);
    _requireFunction('HouseholdState._internal.getPositionRecord', _internal.getPositionRecord);
    _requireFunction('HouseholdState._internal.getAllPositionRecords', _internal.getAllPositionRecords);
    _requireFunction('HouseholdState._internal.replaceHouseholdPositions', _internal.replaceHouseholdPositions);
    _requireFunction('HouseholdState._internal.getAssignmentRecord', _internal.getAssignmentRecord);
    _requireFunction('HouseholdState._internal.getAllAssignmentRecords', _internal.getAllAssignmentRecords);
    _requireFunction('HouseholdState._internal.replaceHouseholdAssignments', _internal.replaceHouseholdAssignments);

    // Optional deps — recorded at load, checked at call time
    var _industryCommandsPresent = typeof window.IndustryCommands !== 'undefined' &&
        window.IndustryCommands !== null;
    var _residenceSystemPresent = typeof window.ResidenceSystem !== 'undefined' &&
        window.ResidenceSystem !== null;

    if (typeof window.markDataDirty !== 'function') {
        // markDataDirty is not yet universal across the codebase. We do not
        // throw; instead we degrade to a no-op with a one-time console warn.
        if (typeof console !== 'undefined' && console.warn) {
            console.warn('HouseholdCommands: window.markDataDirty is not defined. ' +
                'Dirty tracking will be a no-op for this domain.');
        }
    }

    // =========================================================================
    // 2. RESULT HELPERS
    // =========================================================================

    function _ok(data) {
        return { success: true, data: data === undefined ? null : data };
    }
    function _fail(code, reason, extra) {
        var result = { success: false, code: code, reason: reason || code };
        if (extra) {
            for (var k in extra) {
                if (Object.prototype.hasOwnProperty.call(extra, k)) {
                    result[k] = extra[k];
                }
            }
        }
        return result;
    }

    // =========================================================================
    // 3. YEAR / NUMBER VALIDATION
    // =========================================================================

    function _resolveYear(value) {
        if (value === undefined || value === null) return _getCurrentYearSafe();
        if (typeof value !== 'number' || !isFinite(value)) return null;
        return value;
    }
    function _resolveInt(value, fallback) {
        if (value === undefined || value === null) return fallback;
        if (typeof value !== 'number' || !isFinite(value)) return null;
        return Math.floor(value);
    }

    // =========================================================================
    // 4. COMMIT TAIL
    // =========================================================================
    //
    // _commit is NOT a persistence boundary. It hydrates the state index,
    // marks data dirty, publishes an in-process event, and dispatches a
    // cross-domain CustomEvent. The caller decides when to call persist().
    //
    // We call hydrateFromMasterData() rather than relying on the primitives
    // to do it, because some primitives may already have rebuilt indexes and
    // re-hydrating is cheap + idempotent. Belt and braces.
    // =========================================================================

    function _hydrateState() {
        if (typeof _state.hydrateFromMasterData === 'function') {
            _state.hydrateFromMasterData();
        } else if (typeof _state.refresh === 'function') {
            // Legacy state shape — refresh() reloads from masterData.
            _state.refresh();
        } else {
            // Last resort: rebuild caches only.
            if (typeof _state.invalidateCache === 'function') {
                _state.invalidateCache();
            }
        }
    }

    function _markDirty() {
        if (typeof window.markDataDirty === 'function') {
            try {
                window.markDataDirty();
            } catch (e) {
                // Non-fatal
            }
        }
        if (typeof _state.markDirty === 'function') {
            try {
                _state.markDirty();
            } catch (e) {
                // Non-fatal
            }
        }
    }

    function _publish(eventName, payload) {
        if (typeof _state.publish === 'function') {
            try {
                _state.publish(eventName, payload);
            } catch (e) {
                // Subscriber errors must not break the command.
            }
        } else if (typeof _state.subscribe === 'function' &&
                   typeof _state._notifySubscribers === 'function') {
            // Legacy state shape: no publish, use internal notifier.
            try {
                _state._notifySubscribers({ type: eventName, detail: payload });
            } catch (e) {
                // Non-fatal
            }
        }
    }

    function _dispatch(eventName, payload) {
        if (typeof window.dispatchEvent !== 'function') return;
        if (typeof window.CustomEvent !== 'function') return;
        try {
            window.dispatchEvent(new window.CustomEvent(eventName, {
                detail: payload || {}
            }));
        } catch (e) {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn('HouseholdCommands: failed to dispatch ' + eventName, e);
            }
        }
    }

    function _commit(eventName, payload) {
        _hydrateState();
        _markDirty();
        _publish(eventName, payload);
        _dispatch(eventName, payload);
    }

    // =========================================================================
    // 5. PERSIST BOUNDARY
    // =========================================================================
    //
    // The ONLY place in this module that writes to disk. UI/batch callers
    // call this once after a sequence of commands.
    // =========================================================================

    function persist() {
        try {
            var ok = _saveMasterData();
            if (ok === false) {
                return _fail('SAVE_FAILED', 'saveMasterData returned false');
            }
            return _ok(null);
        } catch (e) {
            return _fail('SAVE_FAILED', e && e.message ? e.message : 'Unknown save error');
        }
    }

    // =========================================================================
    // 6. MUTATION PRIMITIVES
    // =========================================================================
    //
    // Primitives are the only place that touch the live canonical arrays.
    // They do not call _commit. The calling command does.
    // =========================================================================

    function _addHouseholdRecord(record) {
        var all = _internal.getAllHouseholdRecords({ includeDeprecated: true });
        all.push(record);
        _internal.replaceHouseholds(all);
    }

    function _removeHouseholdRecord(householdId) {
        var all = _internal.getAllHouseholdRecords({ includeDeprecated: true });
        var next = [];
        for (var i = 0; i < all.length; i++) {
            if (all[i].id !== householdId) next.push(all[i]);
        }
        _internal.replaceHouseholds(next);
    }

    function _addPositionRecord(record) {
        var all = _internal.getAllPositionRecords();
        all.push(record);
        _internal.replaceHouseholdPositions(all);
    }

    function _removePositionRecord(positionId) {
        var all = _internal.getAllPositionRecords();
        var next = [];
        for (var i = 0; i < all.length; i++) {
            if (all[i].id !== positionId) next.push(all[i]);
        }
        _internal.replaceHouseholdPositions(next);
    }

    function _addAssignmentRecord(record) {
        var all = _internal.getAllAssignmentRecords();
        all.push(record);
        _internal.replaceHouseholdAssignments(all);
    }

    function _removeAssignmentRecord(assignmentId) {
        var all = _internal.getAllAssignmentRecords();
        var next = [];
        for (var i = 0; i < all.length; i++) {
            if (all[i].id !== assignmentId) next.push(all[i]);
        }
        _internal.replaceHouseholdAssignments(next);
    }

    // =========================================================================
    // 7. FIELD ALLOWLISTS
    // =========================================================================

    var _ALLOWED_HOUSEHOLD_UPDATE_FIELDS = {
        name: true,
        locationId: true,
        locationName: true,
        reputation: true,
        wealth: true,
        debt: true,
        powerScore: true,
        foundedYear: true,
        notes: true,
        // rename metadata (side-channels, not stored as top-level fields)
        renameYear: true,
        renameReason: true,
        changedBy: true
    };

    var _DOMAIN_OWNED_HOUSEHOLD_FIELDS = {
        members: 'Use HouseholdCommands.addMember / removeMember / transferMember.',
        departments: 'Use HouseholdCommands.addDepartment / removeDepartment.',
        enterprises: 'Use HouseholdCommands.setHouseholdEnterprises / addEnterpriseToHousehold / removeEnterpriseFromHousehold.',
        enterpriseHistory: 'Use HouseholdCommands.setHouseholdEnterprises.',
        residenceId: 'Use HouseholdCommands.associateWithResidence / disassociateFromResidence, or ResidenceSystem.assignHouseholdToUnit.',
        residenceUnitNumber: 'Use ResidenceSystem.assignHouseholdToUnit.',
        status: 'Use HouseholdCommands.setStatus.',
        nameHistory: 'Use HouseholdCommands.editNamePeriod / deleteNamePeriod.'
    };

    var _ALLOWED_POSITION_UPDATE_FIELDS = {
        name: true,
        departmentId: true,
        requiredRoleId: true,
        minSkillLevel: true,
        description: true,
        priority: true
    };

    // =========================================================================
    // 8. HOUSEHOLD LIFECYCLE
    // =========================================================================

    function createHousehold(data) {
        if (!data || typeof data !== 'object') {
            return _fail('INVALID_INPUT', 'Household data is required');
        }
        if (!data.name || typeof data.name !== 'string' || data.name.trim() === '') {
            return _fail('INVALID_NAME', 'Household name is required');
        }

        var year = _resolveYear(data.foundedYear);
        if (year === null) return _fail('INVALID_YEAR', 'Invalid founded year');

        var householdId = _generateId('house');
        var household = {
            id: householdId,
            name: data.name.trim(),
            locationId: data.locationId || null,
            locationName: data.locationName || null,
            departments: [],
            members: [],
            reputation: data.reputation !== undefined ? data.reputation : 10,
            wealth: data.wealth !== undefined ? data.wealth : 0,
            debt: data.debt !== undefined ? data.debt : 0,
            powerScore: data.powerScore !== undefined ? data.powerScore : 0,
            foundedYear: year,
            status: 'active',
            nameHistory: [{
                oldName: null,
                newName: data.name.trim(),
                year: year,
                reason: 'Founded',
                changedBy: data.founderId || null,
                timestamp: Date.now()
            }],
            currentNameSince: year,
            eventLog: [],
            notes: data.notes || '',
            enterprises: [],
            enterpriseHistory: [],
            economy: {},
            resources: { food: 0, livestock: 0, goods: 0 },
            residenceHistory: [],
            vacancyHistory: [],
            damageHistory: [],
            activityLog: [],
            crimeHistory: [],
            vendettas: [],
            alliances: [],
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        if (data.headId) {
            var head = _getCharacterById(data.headId);
            if (head) {
                household.members.push({
                    characterId: head.id,
                    characterName: (head.name || '') +
                        (head.surname ? ' ' + head.surname : ''),
                    type: 'family',
                    departmentId: null,
                    role: 'Head of Household',
                    isHead: true,
                    joinedYear: year,
                    headSince: year,
                    notes: 'Founding head of household'
                });
                head.household = householdId;
                head.householdId = householdId;
            }
        }

        _addHouseholdRecord(household);
        _commit('householdCreated', {
            householdId: householdId,
            name: household.name,
            year: year
        });

        if (typeof window.logEvent === 'function') {
            window.logEvent('household', 'Household Created',
                'Created household: ' + household.name, []);
        }

        return _ok({ householdId: householdId });
    }

    /**
     * Deletes a household permanently.
     *
     * Order of operations:
     *   1. If the household is occupying a residence, tell ResidenceSystem
     *      to mark that unit vacant. ResidenceSystem owns unit occupancy.
     *   2. Optionally clear the householdId on each member character via
     *      CharacterCommands.updateCharacterFields.
     *   3. Remove the household record.
     *   4. Commit.
     *
     * Caller is responsible for calling persist().
     */
    function deleteHousehold(householdId, options) {
        options = options || {};
        var household = _internal.getHouseholdRecord(householdId);
        if (!household) return _fail('NOT_FOUND', 'Household not found');

        var year = _resolveYear(options.year);
        if (year === null) return _fail('INVALID_YEAR', 'Invalid year');

        // Step 1: disassociate residence occupancy via ResidenceSystem
        var residenceId = household.residenceId || null;
        var unitNumber = household.residenceUnitNumber;
        if (residenceId) {
            if (!_residenceSystemPresent) {
                return _fail('RESIDENCE_SYSTEM_UNAVAILABLE',
                    'Household occupies a residence but ResidenceSystem is not loaded');
            }
            var rs = window.ResidenceSystem;
            var vacateResult = null;
            try {
                if (unitNumber !== null && unitNumber !== undefined &&
                    typeof rs.markUnitVacant === 'function') {
                    vacateResult = rs.markUnitVacant(
                        residenceId, unitNumber,
                        'Household deleted', year
                    );
                } else if (typeof rs.markResidenceVacant === 'function') {
                    vacateResult = rs.markResidenceVacant(
                        residenceId,
                        'Household deleted', year
                    );
                }
            } catch (e) {
                vacateResult = null;
            }
            if (!vacateResult || vacateResult.success === false) {
                if (typeof window.logEvent === 'function') {
                    window.logEvent('household', 'Delete Residence Cleanup Failed',
                        'Could not clear residence occupancy for ' +
                        household.name + ' (' + residenceId + ')', []);
                }
            }
        }

        // Step 2: clear character-side reverse index via CharacterCommands
        if (options.removeFromCharacters === true && Array.isArray(household.members)) {
            if (typeof window.CharacterCommands !== 'undefined' &&
                typeof window.CharacterCommands.updateCharacterFields === 'function') {
                for (var i = 0; i < household.members.length; i++) {
                    var memberId = household.members[i].characterId;
                    var character = null;
                    try {
                        character = _getCharacterById(memberId);
                    } catch (e) {
                        character = null;
                    }
                    if (!character) continue;
                    if (character.household !== householdId &&
                        character.householdId !== householdId) continue;

                    try {
                        window.CharacterCommands.updateCharacterFields(memberId, {
                            household: '',
                            householdId: ''
                        });
                    } catch (e) {
                        if (typeof console !== 'undefined' && console.warn) {
                            console.warn('HouseholdCommands.deleteHousehold: ' +
                                'could not clear reverse index for ' + memberId, e);
                        }
                    }
                }
            } else {
                if (typeof console !== 'undefined' && console.warn) {
                    console.warn('HouseholdCommands.deleteHousehold: ' +
                        'CharacterCommands.updateCharacterFields not available; ' +
                        'character.householdId will be stale for ' + household.name);
                }
            }
        }

        // Step 3: remove the household record
        _removeHouseholdRecord(householdId);

        _commit('householdDeleted', {
            householdId: householdId,
            name: household.name,
            year: year
        });

        if (typeof window.logEvent === 'function') {
            window.logEvent('household', 'Household Deleted',
                'Deleted household: ' + household.name, []);
        }

        return _ok({ householdId: householdId });
    }

    // =========================================================================
    // 9. HOUSEHOLD FIELD MUTATIONS
    // =========================================================================

    function _validateHouseholdUpdates(updates) {
        if (!updates || typeof updates !== 'object') {
            return _fail('INVALID_INPUT', 'Updates object is required');
        }
        for (var key in updates) {
            if (!Object.prototype.hasOwnProperty.call(updates, key)) continue;
            if (_ALLOWED_HOUSEHOLD_UPDATE_FIELDS[key]) continue;
            if (_DOMAIN_OWNED_HOUSEHOLD_FIELDS[key]) {
                return _fail('DOMAIN_OWNED_FIELD',
                    'Field "' + key + '" is owned by another domain. ' +
                    _DOMAIN_OWNED_HOUSEHOLD_FIELDS[key]);
            }
            return _fail('UNKNOWN_FIELD',
                'Field "' + key + '" is not an allowed household field');
        }
        return _ok(null);
    }

    function updateHousehold(householdId, updates, options) {
        options = options || {};
        var household = _internal.getHouseholdRecord(householdId);
        if (!household) return _fail('NOT_FOUND', 'Household not found');

        var allowlist = _validateHouseholdUpdates(updates);
        if (allowlist.success === false) return allowlist;

        var year = _getCurrentYearSafe();
        var changed = [];

        if (updates.name !== undefined && updates.name !== null) {
            var newName = String(updates.name).trim();
            if (newName === '') {
                return _fail('INVALID_NAME', 'Household name cannot be empty');
            }
            if (newName !== household.name) {
                if (!Array.isArray(household.nameHistory)) household.nameHistory = [];
                var renameYear = updates.renameYear !== undefined
                    ? updates.renameYear : year;
                household.nameHistory.push({
                    oldName: household.name,
                    newName: newName,
                    year: renameYear,
                    reason: updates.renameReason || 'Renamed',
                    changedBy: updates.changedBy || null,
                    timestamp: Date.now()
                });
                household.name = newName;
                household.currentNameSince = renameYear;
                changed.push('name');
            }
        }

        if (updates.locationId !== undefined) {
            household.locationId = updates.locationId || null;
            if (updates.locationName !== undefined) {
                household.locationName = updates.locationName || null;
            }
            changed.push('locationId');
        }

        var scalarFields = ['reputation', 'wealth', 'debt', 'powerScore',
            'foundedYear', 'notes'];
        for (var i = 0; i < scalarFields.length; i++) {
            var key = scalarFields[i];
            if (updates[key] !== undefined) {
                household[key] = updates[key];
                changed.push(key);
            }
        }

        if (changed.length === 0) {
            return _ok({ householdId: householdId, changed: false });
        }

        household.updatedAt = Date.now();

        _commit('householdUpdated', {
            householdId: householdId,
            changed: changed,
            year: year
        });

        return _ok({ householdId: householdId, changed: changed });
    }

    function setStatus(householdId, status, options) {
        options = options || {};
        var household = _internal.getHouseholdRecord(householdId);
        if (!household) return _fail('NOT_FOUND', 'Household not found');
        if (typeof status !== 'string' || status === '') {
            return _fail('INVALID_STATUS', 'Status must be a non-empty string');
        }
        if (household.status === status) {
            return _ok({ householdId: householdId, status: status, changed: false });
        }

        var oldStatus = household.status;
        household.status = status;
        household.updatedAt = Date.now();

        if (options.recordEvent === true) {
            if (!Array.isArray(household.eventLog)) household.eventLog = [];
            household.eventLog.push({
                year: options.year !== undefined ? options.year : _getCurrentYearSafe(),
                type: 'status_changed',
                from: oldStatus,
                to: status,
                reason: options.reason || null,
                timestamp: Date.now()
            });
        }

        _commit('householdStatusChanged', {
            householdId: householdId,
            from: oldStatus,
            to: status,
            reason: options.reason || null
        });

        return _ok({
            householdId: householdId,
            status: status,
            previousStatus: oldStatus
        });
    }

    function recordEvent(householdId, event) {
        var household = _internal.getHouseholdRecord(householdId);
        if (!household) return _fail('NOT_FOUND', 'Household not found');
        if (!event || typeof event !== 'object') {
            return _fail('INVALID_INPUT', 'Event must be an object');
        }

        if (!Array.isArray(household.eventLog)) household.eventLog = [];
        household.eventLog.push({
            year: event.year !== undefined ? event.year : _getCurrentYearSafe(),
            type: event.type || 'event',
            message: event.message || null,
            details: event.details || null,
            amount: event.amount !== undefined ? event.amount : null,
            timestamp: Date.now()
        });
        if (household.eventLog.length > 200) {
            household.eventLog = household.eventLog.slice(-200);
        }

        household.updatedAt = Date.now();

        _commit('householdEventRecorded', {
            householdId: householdId,
            eventType: event.type || 'event'
        });

        return _ok({ householdId: householdId });
    }

    // =========================================================================
    // 10. MEMBER MUTATIONS
    // =========================================================================

    function _findMember(household, characterId) {
        if (!Array.isArray(household.members)) return -1;
        for (var i = 0; i < household.members.length; i++) {
            if (household.members[i].characterId === characterId) return i;
        }
        return -1;
    }

    function _clearOtherHeads(household) {
        if (!Array.isArray(household.members)) return;
        for (var i = 0; i < household.members.length; i++) {
            if (household.members[i].isHead) {
                household.members[i].isHead = false;
                household.members[i].headSince = null;
            }
        }
    }

    function addMember(householdId, characterId, type, options) {
        options = options || {};
        var household = _internal.getHouseholdRecord(householdId);
        if (!household) return _fail('NOT_FOUND', 'Household not found');

        var character = _getCharacterById(characterId);
        if (!character) return _fail('CHARACTER_NOT_FOUND', 'Character not found');

        if (type !== 'family' && type !== 'staff') {
            return _fail('INVALID_TYPE', 'Member type must be "family" or "staff"');
        }
        if (_findMember(household, characterId) !== -1) {
            return _fail('ALREADY_MEMBER', 'Character is already a member');
        }

        var year = _resolveYear(options.joinedYear);
        if (year === null) return _fail('INVALID_YEAR', 'Invalid joined year');

        var role = options.role || (type === 'family' ? 'Family Member' : 'Staff');
        var isHead = options.isHead === true;

        if (isHead) _clearOtherHeads(household);

        if (!Array.isArray(household.members)) household.members = [];
        household.members.push({
            characterId: characterId,
            characterName: (character.name || '') +
                (character.surname ? ' ' + character.surname : ''),
            type: type,
            departmentId: options.departmentId || null,
            role: role,
            isHead: isHead,
            joinedYear: year,
            headSince: isHead ? year : null,
            notes: options.notes || ''
        });

        character.household = householdId;
        character.householdId = householdId;

        if (options.recordHistory !== false) {
            if (!Array.isArray(character.householdHistory)) {
                character.householdHistory = [];
            }
            character.householdHistory.push({
                householdId: householdId,
                householdName: household.name,
                joinedYear: year,
                leftYear: null,
                leftReason: null,
                role: role,
                isHead: isHead,
                timestamp: Date.now()
            });
        }

        household.updatedAt = Date.now();

        _commit('householdMemberAdded', {
            householdId: householdId,
            characterId: characterId,
            type: type,
            role: role,
            isHead: isHead,
            year: year
        });

        return _ok({
            householdId: householdId,
            characterId: characterId,
            role: role,
            isHead: isHead
        });
    }

    function removeMember(householdId, characterId, options) {
        options = options || {};
        var household = _internal.getHouseholdRecord(householdId);
        if (!household) return _fail('NOT_FOUND', 'Household not found');

        var character = _getCharacterById(characterId);
        if (!character) return _fail('CHARACTER_NOT_FOUND', 'Character not found');

        var idx = _findMember(household, characterId);
        if (idx === -1) return _fail('NOT_MEMBER', 'Character is not a member');

        var member = household.members[idx];
        var wasHead = member.isHead === true;

        var year = _resolveYear(options.leftYear);
        if (year === null) return _fail('INVALID_YEAR', 'Invalid left year');
        var reason = options.reason || 'Removed';

        household.members.splice(idx, 1);

        if (character.household === householdId) {
            character.household = '';
            character.householdId = '';
        }

        if (options.recordHistory !== false) {
            if (!Array.isArray(character.householdHistory)) {
                character.householdHistory = [];
            }
            for (var i = character.householdHistory.length - 1; i >= 0; i--) {
                var entry = character.householdHistory[i];
                if (entry.householdId === householdId && !entry.leftYear) {
                    entry.leftYear = year;
                    entry.leftReason = reason;
                    break;
                }
            }
        }

        household.updatedAt = Date.now();

        var successorId = null;
        if (wasHead) {
            successorId = RULES.pickSuccessor(household);
            if (successorId) {
                RULES.setHeadInternal(household, successorId, year,
                    'Succession after removal');
            }
        }

        _commit('householdMemberRemoved', {
            householdId: householdId,
            characterId: characterId,
            wasHead: wasHead,
            successorId: successorId,
            year: year
        });

        return _ok({
            householdId: householdId,
            characterId: characterId,
            wasHead: wasHead,
            successorId: successorId
        });
    }

    function updateMember(householdId, characterId, updates, options) {
        options = options || {};
        var household = _internal.getHouseholdRecord(householdId);
        if (!household) return _fail('NOT_FOUND', 'Household not found');

        var idx = _findMember(household, characterId);
        if (idx === -1) return _fail('NOT_MEMBER', 'Character is not a member');

        var member = household.members[idx];
        var changed = [];

        if (updates.role !== undefined && updates.role !== member.role) {
            member.role = updates.role;
            changed.push('role');
        }
        if (updates.type !== undefined && updates.type !== member.type) {
            if (updates.type !== 'family' && updates.type !== 'staff') {
                return _fail('INVALID_TYPE', 'Member type must be "family" or "staff"');
            }
            member.type = updates.type;
            changed.push('type');
        }
        if (updates.departmentId !== undefined) {
            member.departmentId = updates.departmentId;
            changed.push('departmentId');
        }
        if (updates.notes !== undefined) {
            member.notes = updates.notes;
            changed.push('notes');
        }
        if (updates.isHead === true && !member.isHead) {
            RULES.setHeadInternal(
                household, characterId,
                options.year !== undefined ? options.year : _getCurrentYearSafe(),
                options.reason || 'Appointed'
            );
            changed.push('isHead');
        }

        if (changed.length === 0) {
            return _ok({ householdId: householdId, changed: false });
        }

        household.updatedAt = Date.now();

        _commit('householdMemberUpdated', {
            householdId: householdId,
            characterId: characterId,
            changes: changed
        });

        return _ok({
            householdId: householdId,
            characterId: characterId,
            changes: changed
        });
    }

    function transferMember(characterId, targetHouseholdId, options) {
        options = options || {};
        var character = _getCharacterById(characterId);
        if (!character) return _fail('CHARACTER_NOT_FOUND', 'Character not found');
        if (character.isDeceased) {
            return _fail('CHARACTER_DECEASED', 'Cannot transfer deceased character');
        }

        var target = _internal.getHouseholdRecord(targetHouseholdId);
        if (!target) return _fail('TARGET_NOT_FOUND', 'Target household not found');

        var all = _internal.getAllHouseholdRecords({ includeDeprecated: true });
        var current = null;
        var currentIdx = -1;
        for (var i = 0; i < all.length; i++) {
            var idx = _findMember(all[i], characterId);
            if (idx !== -1) {
                current = all[i];
                currentIdx = idx;
                break;
            }
        }

        if (current && current.id === targetHouseholdId) {
            return _fail('ALREADY_MEMBER',
                'Character is already in the target household');
        }
        if (_findMember(target, characterId) !== -1) {
            return _fail('ALREADY_MEMBER',
                'Character is already in the target household');
        }

        var year = _resolveYear(options.year);
        if (year === null) return _fail('INVALID_YEAR', 'Invalid transfer year');
        var reason = options.reason || 'Transferred';

        var carriedRole = options.role || null;
        var carriedType = options.type || null;
        var carriedDepartmentId = options.departmentId || null;
        var carriedIsHead = options.isHead === true;

        if (current) {
            var member = current.members[currentIdx];
            if (!carriedRole) carriedRole = member.role;
            if (!carriedType) carriedType = member.type;
        }
        if (!carriedType) carriedType = 'family';
        if (!carriedRole) {
            carriedRole = carriedType === 'family' ? 'Family Member' : 'Staff';
        }

        var fromHouseholdId = null;
        var oldHeadSuccessor = null;

        if (current) {
            fromHouseholdId = current.id;
            var wasHead = current.members[currentIdx].isHead === true;
            current.members.splice(currentIdx, 1);
            current.updatedAt = Date.now();

            if (options.recordHistory !== false) {
                if (!Array.isArray(character.householdHistory)) {
                    character.householdHistory = [];
                }
                for (var h = character.householdHistory.length - 1; h >= 0; h--) {
                    var e = character.householdHistory[h];
                    if (e.householdId === current.id && !e.leftYear) {
                        e.leftYear = year;
                        e.leftReason = reason;
                        break;
                    }
                }
            }

            if (wasHead) {
                oldHeadSuccessor = RULES.pickSuccessor(current);
                if (oldHeadSuccessor) {
                    RULES.setHeadInternal(current, oldHeadSuccessor, year,
                        'Succession after transfer');
                }
            }
        }

        if (carriedIsHead) _clearOtherHeads(target);

        if (!Array.isArray(target.members)) target.members = [];
        target.members.push({
            characterId: characterId,
            characterName: (character.name || '') +
                (character.surname ? ' ' + character.surname : ''),
            type: carriedType,
            departmentId: carriedDepartmentId,
            role: carriedRole,
            isHead: carriedIsHead,
            joinedYear: year,
            headSince: carriedIsHead ? year : null,
            notes: options.notes || 'Transferred'
        });
        target.updatedAt = Date.now();

        character.household = targetHouseholdId;
        character.householdId = targetHouseholdId;

        if (options.recordHistory !== false) {
            if (!Array.isArray(character.householdHistory)) {
                character.householdHistory = [];
            }
            character.householdHistory.push({
                householdId: targetHouseholdId,
                householdName: target.name,
                joinedYear: year,
                leftYear: null,
                leftReason: null,
                role: carriedRole,
                isHead: carriedIsHead,
                timestamp: Date.now()
            });
        }

        _commit('householdMemberTransferred', {
            characterId: characterId,
            fromHouseholdId: fromHouseholdId,
            toHouseholdId: targetHouseholdId,
            role: carriedRole,
            isHead: carriedIsHead,
            year: year
        });

        return _ok({
            characterId: characterId,
            fromHouseholdId: fromHouseholdId,
            toHouseholdId: targetHouseholdId,
            role: carriedRole,
            isHead: carriedIsHead,
            year: year
        });
    }

    // =========================================================================
    // 11. HEAD MANAGEMENT
    // =========================================================================

    function setHead(householdId, characterId, options) {
        options = options || {};
        var household = _internal.getHouseholdRecord(householdId);
        if (!household) return _fail('NOT_FOUND', 'Household not found');

        var year = _resolveYear(options.year);
        if (year === null) return _fail('INVALID_YEAR', 'Invalid year');
        var reason = options.reason || 'Succession';

        if (characterId === null) {
            var oldHeadId = null;
            if (Array.isArray(household.members)) {
                for (var i = 0; i < household.members.length; i++) {
                    if (household.members[i].isHead) {
                        oldHeadId = household.members[i].characterId;
                        household.members[i].isHead = false;
                        household.members[i].headSince = null;
                        household.members[i].role = 'Family Member';
                    }
                }
            }
            household.updatedAt = Date.now();

            _commit('householdHeadCleared', {
                householdId: householdId,
                previousHeadId: oldHeadId,
                year: year
            });

            return _ok({ householdId: householdId, previousHeadId: oldHeadId });
        }

        if (_findMember(household, characterId) === -1) {
            // Delegate to addMember, which itself commits.
            return addMember(householdId, characterId, 'family', {
                role: 'Head of Household',
                joinedYear: year,
                isHead: true,
                notes: 'Appointed as head of household',
                recordHistory: options.recordHistory
            });
        }

        var ok = RULES.setHeadInternal(household, characterId, year, reason);
        if (!ok) return _fail('MEMBER_NOT_FOUND', 'Character is not a member');

        household.updatedAt = Date.now();

        _commit('householdHeadSet', {
            householdId: householdId,
            characterId: characterId,
            reason: reason,
            year: year
        });

        return _ok({
            householdId: householdId,
            characterId: characterId,
            year: year
        });
    }

    function autoAssignHead(householdId, options) {
        options = options || {};
        var household = _internal.getHouseholdRecord(householdId);
        if (!household) return _fail('NOT_FOUND', 'Household not found');

        var year = _resolveYear(options.year);
        if (year === null) return _fail('INVALID_YEAR', 'Invalid year');

        var successorId = RULES.pickSuccessor(household);
        if (!successorId) {
            household.status = 'vacant';
            household.updatedAt = Date.now();

            _commit('householdHeadAutoAssignFailed', {
                householdId: householdId,
                reason: 'No eligible successor',
                year: year
            });

            return _ok({ householdId: householdId, successorId: null, vacant: true });
        }

        RULES.setHeadInternal(household, successorId, year,
            options.reason || 'Auto-succession');
        household.updatedAt = Date.now();

        _commit('householdHeadAutoAssigned', {
            householdId: householdId,
            successorId: successorId,
            year: year
        });

        return _ok({
            householdId: householdId,
            successorId: successorId,
            vacant: false
        });
    }

    // =========================================================================
    // 12. DEPARTMENT MANAGEMENT
    // =========================================================================

    function addDepartment(householdId, name, options) {
        options = options || {};
        var household = _internal.getHouseholdRecord(householdId);
        if (!household) return _fail('NOT_FOUND', 'Household not found');

        if (!name || typeof name !== 'string' || name.trim() === '') {
            return _fail('INVALID_NAME', 'Department name is required');
        }

        var trimmed = name.trim();
        var departments = Array.isArray(household.departments)
            ? household.departments : [];

        for (var i = 0; i < departments.length; i++) {
            if ((departments[i].name || '').toLowerCase() === trimmed.toLowerCase()) {
                return _fail('DUPLICATE_NAME', 'Department already exists');
            }
        }

        var dept = {
            id: _generateId('dept'),
            name: trimmed,
            headId: null,
            headName: null,
            createdAt: Date.now()
        };

        if (options.headId) {
            var head = _getCharacterById(options.headId);
            if (head && _findMember(household, options.headId) !== -1) {
                dept.headId = head.id;
                dept.headName = (head.name || '') +
                    (head.surname ? ' ' + head.surname : '');
            }
        }

        departments.push(dept);
        household.departments = departments;
        household.updatedAt = Date.now();

        _commit('householdDepartmentAdded', {
            householdId: householdId,
            departmentId: dept.id,
            name: trimmed
        });

        return _ok({ departmentId: dept.id, householdId: householdId });
    }

    function removeDepartment(householdId, departmentId, options) {
        options = options || {};
        var household = _internal.getHouseholdRecord(householdId);
        if (!household) return _fail('NOT_FOUND', 'Household not found');

        var departments = Array.isArray(household.departments)
            ? household.departments : [];
        var idx = -1;
        for (var i = 0; i < departments.length; i++) {
            if (departments[i].id === departmentId) {
                idx = i;
                break;
            }
        }
        if (idx === -1) return _fail('NOT_FOUND', 'Department not found');

        if (options.transferMembers !== false && Array.isArray(household.members)) {
            for (var j = 0; j < household.members.length; j++) {
                if (household.members[j].departmentId === departmentId) {
                    household.members[j].departmentId = null;
                }
            }
        }

        departments.splice(idx, 1);
        household.updatedAt = Date.now();

        _commit('householdDepartmentRemoved', {
            householdId: householdId,
            departmentId: departmentId
        });

        return _ok({ householdId: householdId, departmentId: departmentId });
    }

    function updateDepartment(householdId, departmentId, updates) {
        var household = _internal.getHouseholdRecord(householdId);
        if (!household) return _fail('NOT_FOUND', 'Household not found');

        var departments = Array.isArray(household.departments)
            ? household.departments : [];
        var dept = null;
        for (var i = 0; i < departments.length; i++) {
            if (departments[i].id === departmentId) {
                dept = departments[i];
                break;
            }
        }
        if (!dept) return _fail('NOT_FOUND', 'Department not found');

        if (updates.name !== undefined && updates.name !== null) {
            var trimmed = String(updates.name).trim();
            if (trimmed === '') {
                return _fail('INVALID_NAME', 'Department name cannot be empty');
            }
            dept.name = trimmed;
        }

        if (updates.headId !== undefined) {
            if (updates.headId === null) {
                dept.headId = null;
                dept.headName = null;
            } else {
                var head = _getCharacterById(updates.headId);
                if (!head) return _fail('CHARACTER_NOT_FOUND', 'Character not found');
                if (_findMember(household, updates.headId) === -1) {
                    return _fail('NOT_MEMBER', 'Character is not a member');
                }
                dept.headId = head.id;
                dept.headName = (head.name || '') +
                    (head.surname ? ' ' + head.surname : '');
            }
        }

        household.updatedAt = Date.now();

        _commit('householdDepartmentUpdated', {
            householdId: householdId,
            departmentId: departmentId
        });

        return _ok({ householdId: householdId, departmentId: departmentId });
    }

    // =========================================================================
    // 13. NAME-PERIOD MUTATIONS
    // =========================================================================

    function editNamePeriod(householdId, periodIndex, updates) {
        var household = _internal.getHouseholdRecord(householdId);
        if (!household) return _fail('NOT_FOUND', 'Household not found');

        var history = Array.isArray(household.nameHistory)
            ? household.nameHistory : [];
        if (periodIndex < 0 || periodIndex >= history.length) {
            return _fail('INDEX_OUT_OF_RANGE', 'Name period index out of range');
        }

        var period = history[periodIndex];
        var allowed = ['oldName', 'newName', 'year', 'periodEnd', 'reason', 'changedBy'];
        for (var i = 0; i < allowed.length; i++) {
            var key = allowed[i];
            if (updates[key] !== undefined) period[key] = updates[key];
        }

        var isCurrent = (periodIndex === history.length - 1);
        if (isCurrent && updates.newName) {
            household.name = updates.newName;
            if (updates.year !== undefined) {
                household.currentNameSince = updates.year;
            }
        }

        household.updatedAt = Date.now();

        _commit('householdNamePeriodEdited', {
            householdId: householdId,
            periodIndex: periodIndex
        });

        return _ok({ householdId: householdId, periodIndex: periodIndex });
    }

    function deleteNamePeriod(householdId, periodIndex) {
        var household = _internal.getHouseholdRecord(householdId);
        if (!household) return _fail('NOT_FOUND', 'Household not found');

        var history = Array.isArray(household.nameHistory)
            ? household.nameHistory : [];
        if (history.length <= 1) {
            return _fail('CANNOT_DELETE_LAST',
                'Cannot delete the only name period');
        }
        if (periodIndex < 0 || periodIndex >= history.length) {
            return _fail('INDEX_OUT_OF_RANGE', 'Name period index out of range');
        }

        var isCurrent = (periodIndex === history.length - 1);
        history.splice(periodIndex, 1);

        if (isCurrent && history.length > 0) {
            var last = history[history.length - 1];
            household.name = last.newName;
            household.currentNameSince = last.year;
        }

        household.updatedAt = Date.now();

        _commit('householdNamePeriodDeleted', {
            householdId: householdId,
            periodIndex: periodIndex
        });

        return _ok({ householdId: householdId, periodIndex: periodIndex });
    }

    // =========================================================================
    // 14. RESIDENCE ASSOCIATION (REVERSE INDEX)
    // =========================================================================
    //
    // Residence occupancy is canonical on units. These commands only update
    // the household-side reverse index. ResidenceSystem drives these calls
    // when it mutates unit occupancy.
    // =========================================================================

    function associateWithResidence(householdId, residenceId, options) {
        options = options || {};
        var household = _internal.getHouseholdRecord(householdId);
        if (!household) return _fail('NOT_FOUND', 'Household not found');

        household.residenceId = residenceId;
        household.residenceName = options.residenceName || null;
        household.residenceType = options.residenceType || null;
        household.associatedYear = options.year !== undefined
            ? options.year : _getCurrentYearSafe();
        household.residenceUnitNumber = options.unitNumber !== undefined
            ? options.unitNumber : null;
        household.residenceNotes = options.notes || '';

        household.updatedAt = Date.now();

        _commit('householdResidenceAssociated', {
            householdId: householdId,
            residenceId: residenceId,
            unitNumber: household.residenceUnitNumber
        });

        return _ok({ householdId: householdId, residenceId: residenceId });
    }

    function disassociateFromResidence(householdId, residenceId, reason, year) {
        var household = _internal.getHouseholdRecord(householdId);
        if (!household) return _fail('NOT_FOUND', 'Household not found');

        var y = _resolveYear(year);
        if (y === null) return _fail('INVALID_YEAR', 'Invalid year');

        if (!Array.isArray(household.residenceHistory)) {
            household.residenceHistory = [];
        }
        household.residenceHistory.push({
            residenceId: residenceId || household.residenceId,
            residenceName: household.residenceName,
            action: 'disassociated',
            year: y,
            reason: reason || 'Disassociated',
            timestamp: Date.now()
        });

        household.residenceId = null;
        household.residenceName = null;
        household.residenceType = null;
        household.associatedYear = null;
        household.residenceUnitNumber = null;
        household.residenceNotes = null;

        household.updatedAt = Date.now();

        _commit('householdResidenceDisassociated', {
            householdId: householdId,
            residenceId: residenceId || null,
            year: y,
            reason: reason || 'Disassociated'
        });

        return _ok({ householdId: householdId, residenceId: residenceId || null });
    }

    // =========================================================================
    // 15. ENTERPRISE INDEX PRIMITIVES
    // =========================================================================
    //
    // Canonical enterprise ownership lives in Industry. The household's
    // enterprises[] array is a REVERSE INDEX. These commands own the index
    // mutation only; they do not call IndustryCommands. Cross-domain
    // orchestrators (HouseholdAssignment) should call both:
    //
    //     IndustryCommands.updateEnterprise(eId, { ownerId, ownerType, ... })
    //     HouseholdCommands.setHouseholdEnterprises(householdId, [ids])
    //
    // ...inside one batch, then call HouseholdCommands.persist().
    // =========================================================================

    function setHouseholdEnterprises(householdId, enterpriseIds, options) {
        options = options || {};
        var household = _internal.getHouseholdRecord(householdId);
        if (!household) return _fail('NOT_FOUND', 'Household not found');

        if (!Array.isArray(enterpriseIds)) {
            return _fail('INVALID_INPUT', 'enterpriseIds must be an array');
        }

        var year = _resolveYear(options.year);
        if (year === null) return _fail('INVALID_YEAR', 'Invalid year');

        var oldEnterprises = Array.isArray(household.enterprises)
            ? household.enterprises.slice() : [];

        household.enterprises = enterpriseIds.slice();

        if (!Array.isArray(household.enterpriseHistory)) {
            household.enterpriseHistory = [];
        }
        household.enterpriseHistory.push({
            year: year,
            action: options.reason || 'set_enterprises',
            oldEnterprises: oldEnterprises,
            newEnterprises: enterpriseIds.slice()
        });
        if (household.enterpriseHistory.length > 200) {
            household.enterpriseHistory =
                household.enterpriseHistory.slice(-200);
        }

        household.updatedAt = Date.now();

        _commit('householdEnterprisesSet', {
            householdId: householdId,
            year: year,
            enterpriseIds: enterpriseIds.slice()
        });

        return _ok({
            householdId: householdId,
            enterpriseIds: enterpriseIds.slice()
        });
    }

    function addEnterpriseToHousehold(householdId, enterpriseId, options) {
        options = options || {};
        var household = _internal.getHouseholdRecord(householdId);
        if (!household) return _fail('NOT_FOUND', 'Household not found');
        if (!enterpriseId) return _fail('INVALID_INPUT', 'enterpriseId is required');

        var year = _resolveYear(options.year);
        if (year === null) return _fail('INVALID_YEAR', 'Invalid year');

        if (!Array.isArray(household.enterprises)) household.enterprises = [];
        if (household.enterprises.indexOf(enterpriseId) !== -1) {
            return _ok({
                householdId: householdId,
                enterpriseId: enterpriseId,
                changed: false
            });
        }

        household.enterprises.push(enterpriseId);

        if (!Array.isArray(household.enterpriseHistory)) {
            household.enterpriseHistory = [];
        }
        household.enterpriseHistory.push({
            year: year,
            action: 'enterprise_added',
            enterpriseId: enterpriseId
        });

        household.updatedAt = Date.now();

        _commit('householdEnterpriseAdded', {
            householdId: householdId,
            enterpriseId: enterpriseId,
            year: year
        });

        return _ok({
            householdId: householdId,
            enterpriseId: enterpriseId,
            changed: true
        });
    }

    function removeEnterpriseFromHousehold(householdId, enterpriseId, options) {
        options = options || {};
        var household = _internal.getHouseholdRecord(householdId);
        if (!household) return _fail('NOT_FOUND', 'Household not found');
        if (!enterpriseId) return _fail('INVALID_INPUT', 'enterpriseId is required');

        var year = _resolveYear(options.year);
        if (year === null) return _fail('INVALID_YEAR', 'Invalid year');

        if (!Array.isArray(household.enterprises)) {
            return _ok({
                householdId: householdId,
                enterpriseId: enterpriseId,
                changed: false
            });
        }

        var idx = household.enterprises.indexOf(enterpriseId);
        if (idx === -1) {
            return _ok({
                householdId: householdId,
                enterpriseId: enterpriseId,
                changed: false
            });
        }

        household.enterprises.splice(idx, 1);

        if (!Array.isArray(household.enterpriseHistory)) {
            household.enterpriseHistory = [];
        }
        household.enterpriseHistory.push({
            year: year,
            action: 'enterprise_removed',
            enterpriseId: enterpriseId
        });

        household.updatedAt = Date.now();

        _commit('householdEnterpriseRemoved', {
            householdId: householdId,
            enterpriseId: enterpriseId,
            year: year
        });

        return _ok({
            householdId: householdId,
            enterpriseId: enterpriseId,
            changed: true
        });
    }

    // =========================================================================
    // 16. POSITION CRUD
    // =========================================================================

    function createPosition(data) {
        if (!data || !data.householdId) {
            return _fail('INVALID_INPUT',
                'Position data with householdId is required');
        }
        var household = _internal.getHouseholdRecord(data.householdId);
        if (!household) return _fail('NOT_FOUND', 'Household not found');
        if (!data.name || String(data.name).trim() === '') {
            return _fail('INVALID_NAME', 'Position name is required');
        }

        var position = {
            id: _generateId('hpos'),
            name: String(data.name).trim(),
            householdId: data.householdId,
            departmentId: data.departmentId || null,
            requiredRoleId: data.requiredRoleId || null,
            minSkillLevel: data.minSkillLevel !== undefined ? data.minSkillLevel : 0,
            description: data.description || '',
            priority: data.priority !== undefined ? data.priority : 10,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        _addPositionRecord(position);

        _commit('householdPositionCreated', {
            positionId: position.id,
            householdId: data.householdId,
            name: position.name
        });

        return _ok({ positionId: position.id });
    }

    function updatePosition(positionId, updates) {
        var position = _internal.getPositionRecord(positionId);
        if (!position) return _fail('NOT_FOUND', 'Position not found');

        for (var key in updates) {
            if (!Object.prototype.hasOwnProperty.call(updates, key)) continue;
            if (!_ALLOWED_POSITION_UPDATE_FIELDS[key]) {
                return _fail('UNKNOWN_FIELD',
                    'Field "' + key + '" is not an allowed position field');
            }
        }

        var allowed = ['name', 'departmentId', 'requiredRoleId',
            'minSkillLevel', 'description', 'priority'];
        for (var i = 0; i < allowed.length; i++) {
            var k = allowed[i];
            if (updates[k] !== undefined) position[k] = updates[k];
        }
        position.updatedAt = Date.now();

        var all = _internal.getAllPositionRecords();
        _internal.replaceHouseholdPositions(all);

        _commit('householdPositionUpdated', {
            positionId: positionId
        });

        return _ok({ positionId: positionId });
    }

    function deletePosition(positionId, options) {
        options = options || {};
        var position = _internal.getPositionRecord(positionId);
        if (!position) return _fail('NOT_FOUND', 'Position not found');

        _removePositionRecord(positionId);

        var removedAssignments = [];
        if (options.removeAssignments !== false) {
            var assignments = _internal.getAllAssignmentRecords();
            var filtered = [];
            for (var i = 0; i < assignments.length; i++) {
                if (assignments[i].positionId === positionId) {
                    removedAssignments.push(assignments[i].id);
                } else {
                    filtered.push(assignments[i]);
                }
            }
            _internal.replaceHouseholdAssignments(filtered);
        }

        _commit('householdPositionDeleted', {
            positionId: positionId,
            removedAssignments: removedAssignments
        });

        return _ok({
            positionId: positionId,
            removedAssignments: removedAssignments
        });
    }

    // =========================================================================
    // 17. ASSIGNMENT CRUD
    // =========================================================================

    function assignCharacterToPosition(positionId, characterId, options) {
        options = options || {};
        var position = _internal.getPositionRecord(positionId);
        if (!position) return _fail('POSITION_NOT_FOUND', 'Position not found');

        var character = _getCharacterById(characterId);
        if (!character) return _fail('CHARACTER_NOT_FOUND', 'Character not found');
        if (character.isDeceased) {
            return _fail('CHARACTER_DECEASED', 'Character is deceased');
        }

        var assignments = _internal.getAllAssignmentRecords();
        for (var j = 0; j < assignments.length; j++) {
            var a = assignments[j];
            if (a.positionId === positionId &&
                a.characterId === characterId &&
                (a.endYear === null || a.endYear === undefined)) {
                return _fail('ALREADY_ASSIGNED',
                    'Character already assigned to this position');
            }
        }

        var year = _resolveYear(options.startYear);
        if (year === null) return _fail('INVALID_YEAR', 'Invalid start year');

        var endYear = options.endYear !== undefined ? options.endYear : null;
        if (endYear !== null && endYear <= year) {
            return _fail('INVALID_YEAR_RANGE',
                'End year must be after start year');
        }

        var assignment = {
            id: _generateId('hass'),
            positionId: positionId,
            characterId: characterId,
            householdId: position.householdId,
            startYear: year,
            endYear: endYear,
            title: options.title || position.name,
            notes: options.notes || '',
            roleIdAtAssignment: options.roleIdAtAssignment || null,
            skillLevelAtAssignment: options.skillLevelAtAssignment !== undefined
                ? options.skillLevelAtAssignment : 0,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        _addAssignmentRecord(assignment);

        _commit('householdAssignmentCreated', {
            assignmentId: assignment.id,
            positionId: positionId,
            characterId: characterId,
            householdId: position.householdId
        });

        return _ok({ assignmentId: assignment.id });
    }

    function endAssignment(assignmentId, endYear, reason) {
        var assignment = _internal.getAssignmentRecord(assignmentId);
        if (!assignment) return _fail('NOT_FOUND', 'Assignment not found');
        if (assignment.endYear !== null && assignment.endYear !== undefined) {
            return _fail('ALREADY_ENDED', 'Assignment already ended');
        }

        var y = _resolveYear(endYear);
        if (y === null) return _fail('INVALID_YEAR', 'Invalid end year');
        if (assignment.startYear !== undefined &&
            assignment.startYear !== null &&
            y < assignment.startYear) {
            return _fail('INVALID_YEAR_RANGE',
                'End year must not precede start year');
        }

        assignment.endYear = y;
        assignment.endReason = reason || 'Term ended';
        assignment.updatedAt = Date.now();

        var all = _internal.getAllAssignmentRecords();
        _internal.replaceHouseholdAssignments(all);

        _commit('householdAssignmentEnded', {
            assignmentId: assignmentId,
            endYear: y,
            reason: assignment.endReason
        });

        return _ok({ assignmentId: assignmentId, endYear: y });
    }

    function deleteAssignment(assignmentId) {
        var assignment = _internal.getAssignmentRecord(assignmentId);
        if (!assignment) return _fail('NOT_FOUND', 'Assignment not found');

        _removeAssignmentRecord(assignmentId);

        _commit('householdAssignmentDeleted', {
            assignmentId: assignmentId
        });

        return _ok({ assignmentId: assignmentId });
    }

    // =========================================================================
    // 18. BULK OPERATIONS
    // =========================================================================

    function bulkAssign(assignments, options) {
        options = options || {};
        var succeeded = [];
        var failed = [];

        // Validate every entry FIRST, so a bad batch does not partially
        // commit. Assignment creation is the only primitive called per item;
        // we batch the commit at the end.
        var prepared = [];
        for (var i = 0; i < assignments.length; i++) {
            var a = assignments[i];
            var position = _internal.getPositionRecord(a.positionId);
            if (!position) {
                failed.push({ index: i, code: 'POSITION_NOT_FOUND',
                    reason: 'Position not found' });
                continue;
            }
            var character = null;
            try {
                character = _getCharacterById(a.characterId);
            } catch (e) {
                character = null;
            }
            if (!character) {
                failed.push({ index: i, code: 'CHARACTER_NOT_FOUND',
                    reason: 'Character not found' });
                continue;
            }
            if (character.isDeceased) {
                failed.push({ index: i, code: 'CHARACTER_DECEASED',
                    reason: 'Character is deceased' });
                continue;
            }

            var year = _resolveYear(a.startYear);
            if (year === null) {
                failed.push({ index: i, code: 'INVALID_YEAR',
                    reason: 'Invalid start year' });
                continue;
            }
            var endYear = a.endYear !== undefined ? a.endYear : null;
            if (endYear !== null && endYear <= year) {
                failed.push({ index: i, code: 'INVALID_YEAR_RANGE',
                    reason: 'End year must be after start year' });
                continue;
            }

            prepared.push({
                index: i,
                position: position,
                character: character,
                startYear: year,
                endYear: endYear,
                title: a.title || position.name,
                notes: a.notes || '',
                roleIdAtAssignment: a.roleIdAtAssignment || null,
                skillLevelAtAssignment: a.skillLevelAtAssignment !== undefined
                    ? a.skillLevelAtAssignment : 0
            });
        }

        // Apply all prepared assignments. Any duplicate-of-existing check
        // that fails here is reported per item; the batch still commits
        // what succeeded, because bulkAssign is documented as non-atomic.
        var allAssignments = _internal.getAllAssignmentRecords();
        var added = [];
        for (var p = 0; p < prepared.length; p++) {
            var prep = prepared[p];
            var dup = false;
            for (var q = 0; q < allAssignments.length; q++) {
                var existing = allAssignments[q];
                if (existing.positionId === prep.position.id &&
                    existing.characterId === prep.character.id &&
                    (existing.endYear === null || existing.endYear === undefined)) {
                    dup = true;
                    break;
                }
            }
            if (dup) {
                failed.push({ index: prep.index, code: 'ALREADY_ASSIGNED',
                    reason: 'Character already assigned to this position' });
                continue;
            }

            var assignment = {
                id: _generateId('hass'),
                positionId: prep.position.id,
                characterId: prep.character.id,
                householdId: prep.position.householdId,
                startYear: prep.startYear,
                endYear: prep.endYear,
                title: prep.title,
                notes: prep.notes,
                roleIdAtAssignment: prep.roleIdAtAssignment,
                skillLevelAtAssignment: prep.skillLevelAtAssignment,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            allAssignments.push(assignment);
            added.push(assignment.id);
            succeeded.push({ index: prep.index, assignmentId: assignment.id });
        }

        if (added.length > 0) {
            _internal.replaceHouseholdAssignments(allAssignments);
            _commit('householdAssignmentsBulkCreated', {
                count: added.length,
                assignmentIds: added
            });
        }

        return _ok({ succeeded: succeeded, failed: failed });
    }

    // =========================================================================
    // 19. REPAIR (diagnostics)
    // =========================================================================

    function repairMemberships(options) {
        options = options || {};
        var all = _internal.getAllHouseholdRecords({ includeDeprecated: true });
        var result = {
            householdsScanned: all.length,
            membersRemoved: 0,
            duplicateHeadsResolved: 0,
            successorsAssigned: 0
        };

        var year = _getCurrentYearSafe();
        var changed = false;

        for (var i = 0; i < all.length; i++) {
            var household = all[i];
            if (!Array.isArray(household.members)) continue;

            var kept = [];
            for (var j = 0; j < household.members.length; j++) {
                var m = household.members[j];
                var character = null;
                try {
                    character = _getCharacterById(m.characterId);
                } catch (e) {
                    character = null;
                }
                if (character) {
                    kept.push(m);
                } else {
                    result.membersRemoved++;
                    changed = true;
                }
            }
            household.members = kept;

            var heads = [];
            for (var k = 0; k < household.members.length; k++) {
                if (household.members[k].isHead) heads.push(household.members[k]);
            }
            if (heads.length > 1) {
                heads.sort(function(a, b) {
                    return (a.headSince || 0) - (b.headSince || 0);
                });
                for (var h = 1; h < heads.length; h++) {
                    heads[h].isHead = false;
                    heads[h].headSince = null;
                    heads[h].role = 'Family Member';
                    result.duplicateHeadsResolved++;
                    changed = true;
                }
            }

            var hasHead = false;
            for (var p = 0; p < household.members.length; p++) {
                if (household.members[p].isHead) {
                    hasHead = true;
                    break;
                }
            }
            if (!hasHead) {
                var successorId = RULES.pickSuccessor(household);
                if (successorId) {
                    RULES.setHeadInternal(household, successorId, year,
                        'Repair: auto-succession');
                    result.successorsAssigned++;
                    changed = true;
                }
            }
        }

        if (changed) {
            _commit('householdRepaired', result);
        }

        return _ok(result);
    }

    // =========================================================================
    // 20. RULES (private, extracted for future household-rules.js)
    // =========================================================================
    //
    // Succession policy lives here so it can be lifted into a pure
    // household-rules.js module later without touching call sites.
    // =========================================================================

    var RULES = (function() {

        function pickSuccessor(household) {
            if (!Array.isArray(household.members)) return null;

            var candidates = [];
            for (var i = 0; i < household.members.length; i++) {
                var m = household.members[i];
                if (m.type !== 'family') continue;

                var character = null;
                try {
                    character = _getCharacterById(m.characterId);
                } catch (e) {
                    character = null;
                }
                if (!character || character.isDeceased) continue;

                candidates.push({
                    id: m.characterId,
                    birthYear: character.birthYear !== undefined
                        ? character.birthYear : 9999
                });
            }
            if (candidates.length === 0) return null;
            candidates.sort(function(a, b) {
                return a.birthYear - b.birthYear;
            });
            return candidates[0].id;
        }

        function setHeadInternal(household, characterId, year, reason) {
            if (!Array.isArray(household.members)) return false;

            for (var i = 0; i < household.members.length; i++) {
                if (household.members[i].isHead) {
                    household.members[i].isHead = false;
                    household.members[i].headSince = null;
                    household.members[i].role = 'Family Member';
                }
            }

            for (var j = 0; j < household.members.length; j++) {
                if (household.members[j].characterId === characterId) {
                    household.members[j].isHead = true;
                    household.members[j].role = 'Head of Household';
                    household.members[j].headSince = year;
                    if (!Array.isArray(household.eventLog)) {
                        household.eventLog = [];
                    }
                    household.eventLog.push({
                        year: year,
                        type: 'head_appointed',
                        characterId: characterId,
                        reason: reason || null,
                        timestamp: Date.now()
                    });
                    return true;
                }
            }
            return false;
        }

        return {
            pickSuccessor: pickSuccessor,
            setHeadInternal: setHeadInternal
        };
    })();

    // =========================================================================
    // 21. EXPORTS
    // =========================================================================

    window.HouseholdCommands = {
        // Persistence boundary — the ONLY save call site
        persist: persist,

        // Household lifecycle
        createHousehold: createHousehold,
        deleteHousehold: deleteHousehold,

        // Household fields
        updateHousehold: updateHousehold,
        setStatus: setStatus,
        recordEvent: recordEvent,

        // Members
        addMember: addMember,
        removeMember: removeMember,
        updateMember: updateMember,
        transferMember: transferMember,

        // Head
        setHead: setHead,
        autoAssignHead: autoAssignHead,

        // Departments
        addDepartment: addDepartment,
        removeDepartment: removeDepartment,
        updateDepartment: updateDepartment,

        // Name periods
        editNamePeriod: editNamePeriod,
        deleteNamePeriod: deleteNamePeriod,

        // Residence association (reverse index only)
        associateWithResidence: associateWithResidence,
        disassociateFromResidence: disassociateFromResidence,

        // Enterprise index (reverse index only)
        setHouseholdEnterprises: setHouseholdEnterprises,
        addEnterpriseToHousehold: addEnterpriseToHousehold,
        removeEnterpriseFromHousehold: removeEnterpriseFromHousehold,

        // Positions
        createPosition: createPosition,
        updatePosition: updatePosition,
        deletePosition: deletePosition,

        // Assignments
        assignCharacterToPosition: assignCharacterToPosition,
        endAssignment: endAssignment,
        deleteAssignment: deleteAssignment,
        bulkAssign: bulkAssign,

        // Repair
        repairMemberships: repairMemberships
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.HouseholdCommands;
    }

})();
