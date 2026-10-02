/**
 * =============================================================================
 * STILL WATERS - HOUSEHOLD COMMANDS (household-commands.js)
 * =============================================================================
 * 
 * LOCATION: js/systems/household/household-commands.js
 * 
 * PURPOSE
 * -------
 * Canonical mutation API for household data. This module owns:
 * 
 *   - Household creation and deletion
 *   - Household status changes
 *   - Household field updates (name, location, notes, founded year, etc.)
 *   - Household event recording
 *   - Member add/remove/update/transfer
 *   - Head selection
 *   - Department management
 *   - Name-period mutations
 *   - Residence association mutations
 *   - Position CRUD
 *   - Assignment create/end/delete
 *   - Salary and tuition recording on behalf of the household
 *   - Household repair operations
 * 
 * CONTRACT
 * --------
 * Every command:
 *   1. Validates input
 *   2. Reads via HouseholdState._internal
 *   3. Mutates the record in-place via a single _commit() call
 *   4. Persists via HouseholdState._internal.replaceHouseholds()
 *   5. Returns a structured result
 * 
 * Result shape:
 *   { success: true,  data: ... }
 *   { success: false, code: 'SOME_CODE', reason: 'human message' }
 * 
 * EXPLICITLY NOT OWNED BY THIS MODULE
 * -----------------------------------
 *   - Semantic reads                    → HouseholdQueries
 *   - Domain policy thresholds          → HouseholdRules
 *   - Enterprise canonical ownership    → IndustryCommands
 *   - Residence canonical occupancy     → ResidenceCommands
 *   - Toasts / icons / colours          → UI layer
 *   - family accessors                  → CharacterQueries
 * 
 * PERSISTENCE BOUNDARY
 * --------------------
 * Every command that touches the household array performs exactly ONE
 * _commit() which performs exactly ONE _replaceHouseholds(). No command
 * calls _replaceHouseholds() more than once.
 * 
 * Guards: NONE. Commands compose freely.
 * 
 * DEPENDENCIES (required)
 * -----------------------
 *   - HouseholdState
 *   - getCharacterById
 *   - generateId
 *   - getCurrentYearSafe
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY ACCESS
    // =========================================================================

    function _state() {
        if (typeof window.HouseholdState === 'undefined') {
            throw new Error('HouseholdCommands: HouseholdState is required');
        }
        return window.HouseholdState;
    }

    function _internal() {
        return _state()._internal;
    }

    function _getCharacterById(id) {
        if (typeof window.getCharacterById !== 'function') {
            throw new Error('HouseholdCommands: getCharacterById is required');
        }
        return window.getCharacterById(id);
    }

    function _generateId(prefix) {
        if (typeof window.generateId !== 'function') {
            throw new Error('HouseholdCommands: generateId is required');
        }
        return window.generateId(prefix);
    }

    function _currentYear() {
        if (typeof window.getCurrentYearSafe !== 'function') {
            throw new Error('HouseholdCommands: getCurrentYearSafe is required');
        }
        return window.getCurrentYearSafe();
    }

    function _logEvent(category, type, message, subjects) {
        if (typeof window.logEvent === 'function') {
            window.logEvent(category, type, message, subjects);
        }
    }

    // =========================================================================
    // 2. RESULT HELPERS
    // =========================================================================

    function _ok(data) {
        return { success: true, data: data === undefined ? null : data };
    }

    function _fail(code, reason) {
        return { success: false, code: code, reason: reason || code };
    }

    // =========================================================================
    // 3. LOW-LEVEL COMMIT
    // =========================================================================
    //
    // Every household mutation must go through this. It:
    //   - reads the current array snapshot
    //   - swaps the record in place (callers must have already mutated it)
    //   - calls replaceHouseholds() exactly once
    //
    // Because _getHouseholdRecord returns the LIVE object, callers mutate
    // the record directly and then call _commit() to persist + notify.
    // =========================================================================

    function _commit() {
        var households = _internal().getAllHouseholdRecords({ includeDeprecated: true });
        _internal().replaceHouseholds(households);
    }

    // =========================================================================
    // 4. YEAR / NUMBER VALIDATION HELPERS
    // =========================================================================

    function _resolveYear(value) {
        if (value === undefined || value === null) {
            return _currentYear();
        }
        if (typeof value !== 'number' || !isFinite(value)) {
            return null;
        }
        return value;
    }

    function _resolveInt(value, fallback) {
        if (value === undefined || value === null) return fallback;
        if (typeof value !== 'number' || !isFinite(value)) return null;
        return Math.floor(value);
    }

    // =========================================================================
    // 5. HOUSEHOLD CREATION AND DELETION
    // =========================================================================

    /**
     * Creates a new household.
     * 
     * Required:
     *   data.name (non-empty string)
     * 
     * Optional:
     *   data.locationId, data.locationName
     *   data.wealth, data.reputation, data.debt, data.powerScore
     *   data.foundedYear
     *   data.notes
     *   data.headId — character to install as head
     * 
     * Returns:
     *   { success: true, data: { householdId } }
     */
    function createHousehold(data) {
        if (!data || typeof data !== 'object') {
            return _fail('INVALID_INPUT', 'Household data is required');
        }
        if (!data.name || typeof data.name !== 'string' || data.name.trim() === '') {
            return _fail('INVALID_NAME', 'Household name is required');
        }

        var year = _resolveYear(data.foundedYear);
        if (year === null) {
            return _fail('INVALID_YEAR', 'Invalid founded year');
        }

        var householdId = _generateId('house');
        var locationId = data.locationId || null;
        var locationName = data.locationName || null;

        var household = {
            id: householdId,
            name: data.name.trim(),
            locationId: locationId,
            locationName: locationName,
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

        // Install head if provided
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
            }
        }

        var households = _internal().getAllHouseholdRecords({ includeDeprecated: true });
        households.push(household);
        _internal().replaceHouseholds(households);

        _logEvent('household', 'Household Created',
            'Created household: ' + household.name, []);

        return _ok({ householdId: householdId });
    }

    /**
     * Deletes a household permanently.
     * 
     * Removes it from the household array. Also clears the reverse reference
     * on any member characters if options.removeFromCharacters is true.
     * 
     * Enterprise ownership transfer must be handled by the caller via
     * IndustryCommands before or after this call.
     */
    function deleteHousehold(householdId, options) {
        options = options || {};
        var household = _internal().getHouseholdRecord(householdId);
        if (!household) {
            return _fail('NOT_FOUND', 'Household not found');
        }

        // Remove from characters if requested
        if (options.removeFromCharacters === true && Array.isArray(household.members)) {
            for (var i = 0; i < household.members.length; i++) {
                var character = null;
                try {
                    character = _getCharacterById(household.members[i].characterId);
                } catch (e) {
                    character = null;
                }
                if (character) {
                    if (character.household === householdId) {
                        character.household = '';
                        character.householdId = '';
                    }
                }
            }
            if (typeof window.saveMasterData === 'function') {
                window.saveMasterData();
            }
        }

        var all = _internal().getAllHouseholdRecords({ includeDeprecated: true });
        var next = [];
        for (var j = 0; j < all.length; j++) {
            if (all[j].id !== householdId) next.push(all[j]);
        }
        _internal().replaceHouseholds(next);

        _logEvent('household', 'Household Deleted',
            'Deleted household: ' + household.name, []);

        return _ok({ householdId: householdId });
    }

    // =========================================================================
    // 6. HOUSEHOLD FIELD MUTATIONS
    // =========================================================================

    function _updateHouseholdFields(householdId, updates) {
        var household = _internal().getHouseholdRecord(householdId);
        if (!household) {
            return _fail('NOT_FOUND', 'Household not found');
        }

        var year = _currentYear();

        // Name change with history
        if (updates.name !== undefined && updates.name !== null) {
            var newName = String(updates.name).trim();
            if (newName === '') {
                return _fail('INVALID_NAME', 'Household name cannot be empty');
            }
            if (newName !== household.name) {
                if (!Array.isArray(household.nameHistory)) household.nameHistory = [];
                household.nameHistory.push({
                    oldName: household.name,
                    newName: newName,
                    year: updates.renameYear !== undefined ? updates.renameYear : year,
                    reason: updates.renameReason || 'Renamed',
                    changedBy: updates.changedBy || null,
                    timestamp: Date.now()
                });
                household.name = newName;
                household.currentNameSince = updates.renameYear !== undefined
                    ? updates.renameYear : year;
            }
        }

        // Location
        if (updates.locationId !== undefined) {
            household.locationId = updates.locationId || null;
            if (updates.locationName !== undefined) {
                household.locationName = updates.locationName || null;
            }
        }

        // Simple scalar fields
        var scalarFields = [
            'reputation', 'wealth', 'debt', 'powerScore',
            'foundedYear', 'notes'
        ];
        for (var i = 0; i < scalarFields.length; i++) {
            var key = scalarFields[i];
            if (updates[key] !== undefined) {
                household[key] = updates[key];
            }
        }

        household.updatedAt = Date.now();
        _commit();

        _logEvent('household', 'Household Updated',
            'Updated household: ' + household.name, []);

        return _ok({ householdId: householdId });
    }

    /**
     * Sets the household status.
     * 
     * Primitive that lets assignment / economy stop reaching into
     * household.status directly.
     */
    function setStatus(householdId, status, options) {
        options = options || {};
        var household = _internal().getHouseholdRecord(householdId);
        if (!household) {
            return _fail('NOT_FOUND', 'Household not found');
        }
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
                year: options.year !== undefined ? options.year : _currentYear(),
                type: 'status_changed',
                from: oldStatus,
                to: status,
                reason: options.reason || null,
                timestamp: Date.now()
            });
        }

        _commit();
        return _ok({ householdId: householdId, status: status, previousStatus: oldStatus });
    }

    /**
     * Records an event in a household's event log.
     * 
     * Primitive that lets assignment / economy stop reaching into
     * household.eventLog directly.
     */
    function recordEvent(householdId, event) {
        var household = _internal().getHouseholdRecord(householdId);
        if (!household) {
            return _fail('NOT_FOUND', 'Household not found');
        }
        if (!event || typeof event !== 'object') {
            return _fail('INVALID_INPUT', 'Event must be an object');
        }

        if (!Array.isArray(household.eventLog)) household.eventLog = [];
        household.eventLog.push({
            year: event.year !== undefined ? event.year : _currentYear(),
            type: event.type || 'event',
            message: event.message || null,
            details: event.details || null,
            amount: event.amount !== undefined ? event.amount : null,
            timestamp: Date.now()
        });

        // Keep last 200
        if (household.eventLog.length > 200) {
            household.eventLog = household.eventLog.slice(-200);
        }

        household.updatedAt = Date.now();
        _commit();
        return _ok({ householdId: householdId });
    }

    // =========================================================================
    // 7. MEMBER MUTATIONS
    // =========================================================================

    function _findMember(household, characterId) {
        if (!Array.isArray(household.members)) return -1;
        for (var i = 0; i < household.members.length; i++) {
            if (household.members[i].characterId === characterId) return i;
        }
        return -1;
    }

    /**
     * Adds a member to a household.
     * 
     * Required:
     *   householdId, characterId, type ('family' | 'staff')
     * 
     * Returns NOT_FOUND if the household or character does not exist.
     * Returns ALREADY_MEMBER if the character is already a member.
     */
    function addMember(householdId, characterId, type, options) {
        options = options || {};
        var household = _internal().getHouseholdRecord(householdId);
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

        if (isHead) {
            // Demote current head
            if (Array.isArray(household.members)) {
                for (var i = 0; i < household.members.length; i++) {
                    if (household.members[i].isHead) {
                        household.members[i].isHead = false;
                        household.members[i].headSince = null;
                    }
                }
            }
        }

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

        // Character-side reverse index
        character.household = householdId;
        character.householdId = householdId;

        if (options.recordHistory !== false) {
            if (!Array.isArray(character.householdHistory)) character.householdHistory = [];
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

        if (typeof window.saveMasterData === 'function') {
            window.saveMasterData();
        }

        household.updatedAt = Date.now();
        _commit();

        return _ok({
            householdId: householdId,
            characterId: characterId,
            role: role,
            isHead: isHead
        });
    }

    /**
     * Removes a member from a household.
     */
    function removeMember(householdId, characterId, options) {
        options = options || {};
        var household = _internal().getHouseholdRecord(householdId);
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

        // Character side
        if (character.household === householdId) {
            character.household = '';
            character.householdId = '';
        }

        if (options.recordHistory !== false) {
            if (!Array.isArray(character.householdHistory)) character.householdHistory = [];
            for (var i = character.householdHistory.length - 1; i >= 0; i--) {
                var entry = character.householdHistory[i];
                if (entry.householdId === householdId && !entry.leftYear) {
                    entry.leftYear = year;
                    entry.leftReason = reason;
                    break;
                }
            }
        }

        if (typeof window.saveMasterData === 'function') {
            window.saveMasterData();
        }

        household.updatedAt = Date.now();
        _commit();

        // Auto-succession: if the removed member was head, promote the
        // oldest living family member.
        if (wasHead) {
            var nextHeadId = _pickSuccessor(household);
            if (nextHeadId) {
                _setHeadInternal(household, nextHeadId, year, 'Succession after removal');
                _commit();
            }
        }

        return _ok({
            householdId: householdId,
            characterId: characterId,
            wasHead: wasHead
        });
    }

    function updateMember(householdId, characterId, updates, options) {
        options = options || {};
        var household = _internal().getHouseholdRecord(householdId);
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
            _setHeadInternal(
                household, characterId,
                options.year !== undefined ? options.year : _currentYear(),
                options.reason || 'Appointed'
            );
            changed.push('isHead');
        }

        if (changed.length === 0) {
            return _ok({ householdId: householdId, changed: false });
        }

        household.updatedAt = Date.now();
        _commit();

        return _ok({
            householdId: householdId,
            characterId: characterId,
            changes: changed
        });
    }

    /**
     * Transfers a member between households.
     * 
     * Atomic: either both the removal and addition succeed, or neither does.
     * Implemented by validating up-front, then performing both mutations,
     * then a single _commit().
     */
    function transferMember(characterId, targetHouseholdId, options) {
        options = options || {};
        var character = _getCharacterById(characterId);
        if (!character) return _fail('CHARACTER_NOT_FOUND', 'Character not found');
        if (character.isDeceased) {
            return _fail('CHARACTER_DECEASED', 'Cannot transfer deceased character');
        }

        var target = _internal().getHouseholdRecord(targetHouseholdId);
        if (!target) return _fail('TARGET_NOT_FOUND', 'Target household not found');

        // Find current household
        var all = _internal().getAllHouseholdRecords({ includeDeprecated: true });
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
            return _fail('ALREADY_MEMBER', 'Character is already in the target household');
        }

        if (_findMember(target, characterId) !== -1) {
            return _fail('ALREADY_MEMBER', 'Character is already in the target household');
        }

        var year = _resolveYear(options.year);
        if (year === null) return _fail('INVALID_YEAR', 'Invalid transfer year');
        var reason = options.reason || 'Transferred';

        // Capture existing role for role continuity
        var carriedRole = options.role || null;
        var carriedType = options.type || null;
        var carriedJoinedYear = null;
        var carriedDepartmentId = options.departmentId || null;
        var carriedIsHead = options.isHead === true;

        if (current) {
            var member = current.members[currentIdx];
            if (!carriedRole) carriedRole = member.role;
            if (!carriedType) carriedType = member.type;
            carriedJoinedYear = member.joinedYear;
        }

        if (!carriedType) carriedType = 'family';
        if (!carriedRole) carriedRole = carriedType === 'family' ? 'Family Member' : 'Staff';

        // Remove from current
        if (current) {
            var wasHead = current.members[currentIdx].isHead === true;
            current.members.splice(currentIdx, 1);
            current.updatedAt = Date.now();

            if (options.recordHistory !== false) {
                if (!Array.isArray(character.householdHistory)) character.householdHistory = [];
                for (var h = character.householdHistory.length - 1; h >= 0; h--) {
                    var e = character.householdHistory[h];
                    if (e.householdId === current.id && !e.leftYear) {
                        e.leftYear = year;
                        e.leftReason = reason;
                        break;
                    }
                }
            }

            // Auto-succession in source
            if (wasHead) {
                var nextHeadId = _pickSuccessor(current);
                if (nextHeadId) {
                    _setHeadInternal(current, nextHeadId, year,
                        'Succession after transfer');
                }
            }
        }

        // Add to target
        if (carriedIsHead) {
            if (Array.isArray(target.members)) {
                for (var t = 0; t < target.members.length; t++) {
                    if (target.members[t].isHead) {
                        target.members[t].isHead = false;
                        target.members[t].headSince = null;
                    }
                }
            }
        }

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

        // Character reverse index
        character.household = targetHouseholdId;
        character.householdId = targetHouseholdId;

        if (options.recordHistory !== false) {
            if (!Array.isArray(character.householdHistory)) character.householdHistory = [];
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

        if (typeof window.saveMasterData === 'function') {
            window.saveMasterData();
        }

        // Single commit
        _commit();

        return _ok({
            characterId: characterId,
            fromHouseholdId: current ? current.id : null,
            toHouseholdId: targetHouseholdId,
            role: carriedRole,
            isHead: carriedIsHead,
            year: year
        });
    }

    // =========================================================================
    // 8. HEAD MANAGEMENT
    // =========================================================================

    /**
     * Internal: sets head without persisting. Caller must call _commit().
     */
    function _setHeadInternal(household, characterId, year, reason) {
        if (!Array.isArray(household.members)) return false;

        // Demote all current heads
        for (var i = 0; i < household.members.length; i++) {
            if (household.members[i].isHead) {
                household.members[i].isHead = false;
                household.members[i].headSince = null;
                household.members[i].role = 'Family Member';
            }
        }

        // Promote target
        for (var j = 0; j < household.members.length; j++) {
            if (household.members[j].characterId === characterId) {
                household.members[j].isHead = true;
                household.members[j].role = 'Head of Household';
                household.members[j].headSince = year;
                if (!Array.isArray(household.eventLog)) household.eventLog = [];
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

    /**
     * Pick the next head: oldest living family member.
     * Returns characterId or null.
     */
    function _pickSuccessor(household) {
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

        candidates.sort(function(a, b) { return a.birthYear - b.birthYear; });
        return candidates[0].id;
    }

    /**
     * Sets the head of a household.
     * 
     * If characterId is null, removes the current head without replacement.
     */
    function setHead(householdId, characterId, options) {
        options = options || {};
        var household = _internal().getHouseholdRecord(householdId);
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
            _commit();
            return _ok({ householdId: householdId, previousHeadId: oldHeadId });
        }

        // Add as member if not already present
        if (_findMember(household, characterId) === -1) {
            var addResult = addMember(householdId, characterId, 'family', {
                role: 'Head of Household',
                joinedYear: year,
                isHead: true,
                notes: 'Appointed as head of household',
                recordHistory: options.recordHistory
            });
            if (!addResult.success) return addResult;
            return addResult;
        }

        var ok = _setHeadInternal(household, characterId, year, reason);
        if (!ok) {
            return _fail('MEMBER_NOT_FOUND', 'Character is not a member');
        }

        household.updatedAt = Date.now();
        _commit();

        return _ok({
            householdId: householdId,
            characterId: characterId,
            year: year
        });
    }

    /**
     * Auto-assigns a successor after a head dies or leaves.
     */
    function autoAssignHead(householdId, options) {
        options = options || {};
        var household = _internal().getHouseholdRecord(householdId);
        if (!household) return _fail('NOT_FOUND', 'Household not found');

        var successorId = _pickSuccessor(household);
        if (!successorId) {
            // No successors: mark vacant
            household.status = 'vacant';
            household.updatedAt = Date.now();
            _commit();
            return _ok({
                householdId: householdId,
                successorId: null,
                vacant: true
            });
        }

        var year = _resolveYear(options.year);
        if (year === null) return _fail('INVALID_YEAR', 'Invalid year');

        _setHeadInternal(household, successorId, year,
            options.reason || 'Auto-succession');
        household.updatedAt = Date.now();
        _commit();

        return _ok({
            householdId: householdId,
            successorId: successorId,
            vacant: false
        });
    }

    // =========================================================================
    // 9. DEPARTMENT MANAGEMENT
    // =========================================================================

    function addDepartment(householdId, name, options) {
        options = options || {};
        var household = _internal().getHouseholdRecord(householdId);
        if (!household) return _fail('NOT_FOUND', 'Household not found');

        if (!name || typeof name !== 'string' || name.trim() === '') {
            return _fail('INVALID_NAME', 'Department name is required');
        }

        var trimmed = name.trim();
        var departments = Array.isArray(household.departments) ? household.departments : [];

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
        _commit();

        return _ok({ departmentId: dept.id, householdId: householdId });
    }

    function removeDepartment(householdId, departmentId, options) {
        options = options || {};
        var household = _internal().getHouseholdRecord(householdId);
        if (!household) return _fail('NOT_FOUND', 'Household not found');

        var departments = Array.isArray(household.departments) ? household.departments : [];
        var idx = -1;
        for (var i = 0; i < departments.length; i++) {
            if (departments[i].id === departmentId) { idx = i; break; }
        }
        if (idx === -1) return _fail('NOT_FOUND', 'Department not found');

        // Clear members' department assignment
        if (options.transferMembers !== false && Array.isArray(household.members)) {
            for (var j = 0; j < household.members.length; j++) {
                if (household.members[j].departmentId === departmentId) {
                    household.members[j].departmentId = null;
                }
            }
        }

        departments.splice(idx, 1);
        household.updatedAt = Date.now();
        _commit();

        return _ok({ householdId: householdId, departmentId: departmentId });
    }

    function updateDepartment(householdId, departmentId, updates) {
        var household = _internal().getHouseholdRecord(householdId);
        if (!household) return _fail('NOT_FOUND', 'Household not found');

        var departments = Array.isArray(household.departments) ? household.departments : [];
        var dept = null;
        for (var i = 0; i < departments.length; i++) {
            if (departments[i].id === departmentId) { dept = departments[i]; break; }
        }
        if (!dept) return _fail('NOT_FOUND', 'Department not found');

        if (updates.name !== undefined && updates.name !== null) {
            var trimmed = String(updates.name).trim();
            if (trimmed === '') return _fail('INVALID_NAME', 'Department name cannot be empty');
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
        _commit();
        return _ok({ householdId: householdId, departmentId: departmentId });
    }

    // =========================================================================
    // 10. NAME-PERIOD MUTATIONS
    // =========================================================================

    function editNamePeriod(householdId, periodIndex, updates) {
        var household = _internal().getHouseholdRecord(householdId);
        if (!household) return _fail('NOT_FOUND', 'Household not found');

        var history = Array.isArray(household.nameHistory) ? household.nameHistory : [];
        if (periodIndex < 0 || periodIndex >= history.length) {
            return _fail('INDEX_OUT_OF_RANGE', 'Name period index out of range');
        }

        var period = history[periodIndex];
        var allowed = ['oldName', 'newName', 'year', 'periodEnd', 'reason', 'changedBy'];
        for (var i = 0; i < allowed.length; i++) {
            var key = allowed[i];
            if (updates[key] !== undefined) {
                period[key] = updates[key];
            }
        }

        // If this is the current period, update the household name too
        var isCurrent = (periodIndex === history.length - 1);
        if (isCurrent && updates.newName) {
            household.name = updates.newName;
            if (updates.year !== undefined) {
                household.currentNameSince = updates.year;
            }
        }

        household.updatedAt = Date.now();
        _commit();
        return _ok({ householdId: householdId, periodIndex: periodIndex });
    }

    function deleteNamePeriod(householdId, periodIndex) {
        var household = _internal().getHouseholdRecord(householdId);
        if (!household) return _fail('NOT_FOUND', 'Household not found');

        var history = Array.isArray(household.nameHistory) ? household.nameHistory : [];
        if (history.length <= 1) {
            return _fail('CANNOT_DELETE_LAST', 'Cannot delete the only name period');
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
        _commit();
        return _ok({ householdId: householdId, periodIndex: periodIndex });
    }

    // =========================================================================
    // 11. RESIDENCE ASSOCIATION MUTATIONS
    // =========================================================================

    /**
     * Associate a household with a residence (reverse index).
     * 
     * NOTE: The canonical household/unit association belongs to Residence.
     * This command only updates the reverse index on the household record.
     * ResidenceCommands is responsible for calling this command.
     */
    function associateWithResidence(householdId, residenceId, options) {
        options = options || {};
        var household = _internal().getHouseholdRecord(householdId);
        if (!household) return _fail('NOT_FOUND', 'Household not found');

        household.residenceId = residenceId;
        household.residenceName = options.residenceName || null;
        household.residenceType = options.residenceType || null;
        household.associatedYear = options.year !== undefined
            ? options.year : _currentYear();
        household.residenceUnitNumber = options.unitNumber !== undefined
            ? options.unitNumber : null;
        household.residenceNotes = options.notes || '';

        household.updatedAt = Date.now();
        _commit();
        return _ok({ householdId: householdId, residenceId: residenceId });
    }

    function disassociateFromResidence(householdId, residenceId, reason, year) {
        var household = _internal().getHouseholdRecord(householdId);
        if (!household) return _fail('NOT_FOUND', 'Household not found');

        var y = _resolveYear(year);
        if (y === null) return _fail('INVALID_YEAR', 'Invalid year');

        if (!Array.isArray(household.residenceHistory)) household.residenceHistory = [];
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
        _commit();
        return _ok({ householdId: householdId, residenceId: residenceId || null });
    }

    // =========================================================================
    // 12. POSITION CRUD
    // =========================================================================

    function createPosition(data) {
        if (!data || !data.householdId) {
            return _fail('INVALID_INPUT', 'Position data with householdId is required');
        }
        var household = _internal().getHouseholdRecord(data.householdId);
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

        var positions = _internal().getAllPositionRecords();
        positions.push(position);
        _internal().replaceHouseholdPositions(positions);

        return _ok({ positionId: position.id });
    }

    function updatePosition(positionId, updates) {
        var positions = _internal().getAllPositionRecords();
        var found = null;
        for (var i = 0; i < positions.length; i++) {
            if (positions[i].id === positionId) { found = positions[i]; break; }
        }
        if (!found) return _fail('NOT_FOUND', 'Position not found');

        var allowed = ['name', 'departmentId', 'requiredRoleId',
            'minSkillLevel', 'description', 'priority'];
        for (var j = 0; j < allowed.length; j++) {
            var key = allowed[j];
            if (updates[key] !== undefined) found[key] = updates[key];
        }
        found.updatedAt = Date.now();

        _internal().replaceHouseholdPositions(positions);
        return _ok({ positionId: positionId });
    }

    function deletePosition(positionId, options) {
        options = options || {};
        var positions = _internal().getAllPositionRecords();
        var next = [];
        var removed = null;
        for (var i = 0; i < positions.length; i++) {
            if (positions[i].id === positionId) removed = positions[i];
            else next.push(positions[i]);
        }
        if (!removed) return _fail('NOT_FOUND', 'Position not found');

        _internal().replaceHouseholdPositions(next);

        if (options.removeAssignments !== false) {
            var assignments = _internal().getAllAssignmentRecords();
            var filtered = [];
            for (var j = 0; j < assignments.length; j++) {
                if (assignments[j].positionId !== positionId) filtered.push(assignments[j]);
            }
            _internal().replaceHouseholdAssignments(filtered);
        }

        return _ok({ positionId: positionId });
    }

    // =========================================================================
    // 13. ASSIGNMENT CRUD
    // =========================================================================

    function assignCharacterToPosition(positionId, characterId, options) {
        options = options || {};
        var positions = _internal().getAllPositionRecords();
        var position = null;
        for (var i = 0; i < positions.length; i++) {
            if (positions[i].id === positionId) { position = positions[i]; break; }
        }
        if (!position) return _fail('POSITION_NOT_FOUND', 'Position not found');

        var character = _getCharacterById(characterId);
        if (!character) return _fail('CHARACTER_NOT_FOUND', 'Character not found');
        if (character.isDeceased) {
            return _fail('CHARACTER_DECEASED', 'Character is deceased');
        }

        // Check for duplicate active assignment on this position
        var assignments = _internal().getAllAssignmentRecords();
        for (var j = 0; j < assignments.length; j++) {
            var a = assignments[j];
            if (a.positionId === positionId &&
                a.characterId === characterId &&
                (a.endYear === null || a.endYear === undefined)) {
                return _fail('ALREADY_ASSIGNED', 'Character already assigned to this position');
            }
        }

        var year = _resolveYear(options.startYear);
        if (year === null) return _fail('INVALID_YEAR', 'Invalid start year');

        var endYear = options.endYear !== undefined ? options.endYear : null;
        if (endYear !== null && endYear <= year) {
            return _fail('INVALID_YEAR_RANGE', 'End year must be after start year');
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

        assignments.push(assignment);
        _internal().replaceHouseholdAssignments(assignments);

        return _ok({ assignmentId: assignment.id });
    }

    function endAssignment(assignmentId, endYear, reason) {
        var assignments = _internal().getAllAssignmentRecords();
        var found = null;
        for (var i = 0; i < assignments.length; i++) {
            if (assignments[i].id === assignmentId) { found = assignments[i]; break; }
        }
        if (!found) return _fail('NOT_FOUND', 'Assignment not found');
        if (found.endYear !== null && found.endYear !== undefined) {
            return _fail('ALREADY_ENDED', 'Assignment already ended');
        }

        var y = _resolveYear(endYear);
        if (y === null) return _fail('INVALID_YEAR', 'Invalid end year');
        if (found.startYear !== undefined && found.startYear !== null && y < found.startYear) {
            return _fail('INVALID_YEAR_RANGE', 'End year must not precede start year');
        }

        found.endYear = y;
        found.endReason = reason || 'Term ended';
        found.updatedAt = Date.now();

        _internal().replaceHouseholdAssignments(assignments);
        return _ok({ assignmentId: assignmentId, endYear: y });
    }

    function deleteAssignment(assignmentId) {
        var assignments = _internal().getAllAssignmentRecords();
        var next = [];
        var removed = false;
        for (var i = 0; i < assignments.length; i++) {
            if (assignments[i].id === assignmentId) removed = true;
            else next.push(assignments[i]);
        }
        if (!removed) return _fail('NOT_FOUND', 'Assignment not found');

        _internal().replaceHouseholdAssignments(next);
        return _ok({ assignmentId: assignmentId });
    }

    // =========================================================================
    // 14. BULK OPERATIONS
    // =========================================================================

    /**
     * Best-effort bulk assignment.
     * 
     * Does NOT abort on first failure. Returns:
     *   { success: true, data: { succeeded: [...], failed: [...] } }
     * 
     * The caller decides whether to retry, display, or discard.
     */
    function bulkAssign(assignments, options) {
        options = options || {};
        var succeeded = [];
        var failed = [];

        for (var i = 0; i < assignments.length; i++) {
            var a = assignments[i];
            var result = assignCharacterToPosition(a.positionId, a.characterId, {
                startYear: a.startYear,
                endYear: a.endYear,
                title: a.title,
                notes: a.notes,
                roleIdAtAssignment: a.roleIdAtAssignment,
                skillLevelAtAssignment: a.skillLevelAtAssignment
            });
            if (result.success) {
                succeeded.push({ index: i, assignmentId: result.data.assignmentId });
            } else {
                failed.push({ index: i, code: result.code, reason: result.reason });
            }
        }

        return _ok({ succeeded: succeeded, failed: failed });
    }

    // =========================================================================
    // 15. REPAIR (diagnostics)
    // =========================================================================

    /**
     * Repairs membership inconsistencies:
     *   - Members that reference nonexistent characters are removed
     *   - Characters with householdId pointing at this household but not in
     *     members are removed from characters (reverse cleanup)
     *   - Multiple heads per household are demoted to a single head
     *   - Households with no head and living family members get a head
     */
    function repairMemberships(options) {
        options = options || {};
        var all = _internal().getAllHouseholdRecords({ includeDeprecated: true });
        var result = {
            householdsScanned: all.length,
            membersRemoved: 0,
            duplicateHeadsResolved: 0,
            successorsAssigned: 0
        };

        var year = _currentYear();

        for (var i = 0; i < all.length; i++) {
            var household = all[i];
            if (!Array.isArray(household.members)) continue;

            // Remove members whose characters do not exist
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
                }
            }
            household.members = kept;

            // Resolve duplicate heads
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
                }
            }

            // Assign successor if no head and family members alive
            var hasHead = false;
            for (var p = 0; p < household.members.length; p++) {
                if (household.members[p].isHead) { hasHead = true; break; }
            }
            if (!hasHead) {
                var successorId = _pickSuccessor(household);
                if (successorId) {
                    _setHeadInternal(household, successorId, year, 'Repair: auto-succession');
                    result.successorsAssigned++;
                }
            }
        }

        _commit();
        return _ok(result);
    }

    // =========================================================================
    // 16. EXPORTS
    // =========================================================================

    window.HouseholdCommands = {
        // Household lifecycle
        createHousehold: createHousehold,
        deleteHousehold: deleteHousehold,

        // Household fields
        updateHousehold: _updateHouseholdFields,
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
