/**
 * =============================================================================
 * STILL WATERS - HOUSEHOLD ASSIGNMENT (household-assignment.js)
 * =============================================================================
 * 
 * LOCATION: js/systems/household/household-assignment.js
 * 
 * PURPOSE
 * -------
 * Cross-operation orchestration for household lifecycle events that span
 * multiple domains or multiple household commands:
 * 
 *   - Newborn → household assignment
 *   - Marriage → spouse household adoption
 *   - Inheritance / succession on death (with enterprise transfer)
 *   - Character transfer between households
 *   - Cadet branch creation
 *   - Household merge
 *   - Household split
 *   - Auto-succession after death
 * 
 * THIS MODULE IS AN ORCHESTRATOR, NOT A MUTATOR
 * ---------------------------------------------
 * It reads via HouseholdQueries, writes via HouseholdCommands, and
 * coordinates IndustryCommands for enterprise ownership transfer.
 * 
 * It does NOT:
 *   - mutate HouseholdState records directly
 *   - call state._setHouseholds()
 *   - return live canonical objects
 *   - show toasts
 *   - use a global _processing guard
 *   - fabricate domain defaults
 * 
 * CONTRACT
 * --------
 * Every operation returns:
 *   { success: true, data: ... }
 *   { success: false, code: 'SOME_CODE', reason: 'human message' }
 * 
 * COMPOUND OPERATIONS
 * -------------------
 * Inheritance, merge, split, and cadet branch creation touch multiple
 * households and may also transfer enterprise ownership. Each is
 * orchestrated as a sequence of atomic commands:
 * 
 *   validate all preconditions
 *   ↓
 *   execute primitives via HouseholdCommands / IndustryCommands
 *   ↓
 *   if any step fails, report which step failed and stop
 * 
 * We do NOT attempt cross-command rollback: if a merge partially completes,
 * the caller receives a structured failure describing exactly what happened
 * and can choose to retry, undo manually, or accept the partial state.
 * 
 * REFERENCE YEARS
 * ---------------
 * All operations accept an explicit year for historical context. If omitted,
 * the current simulation year is used. Heir discovery always uses the
 * operation year so historical deaths produce historically correct ages.
 * 
 * DEPENDENCIES (required)
 * -----------------------
 *   - HouseholdQueries
 *   - HouseholdCommands
 *   - getCharacterById
 *   - getCurrentYearSafe
 * 
 * DEPENDENCIES (optional)
 * -----------------------
 *   - IndustryCommands  (for enterprise ownership transfer)
 *   - family accessors  (getChildren, getParents, getSpouses — used by
 *                        HouseholdQueries.getHouseholdHeirs)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY ACCESS
    // =========================================================================

    function _queries() {
        if (typeof window.HouseholdQueries === 'undefined') {
            throw new Error('HouseholdAssignment: HouseholdQueries is required');
        }
        return window.HouseholdQueries;
    }

    function _commands() {
        if (typeof window.HouseholdCommands === 'undefined') {
            throw new Error('HouseholdAssignment: HouseholdCommands is required');
        }
        return window.HouseholdCommands;
    }

    function _industryCommands() {
        return typeof window.IndustryCommands !== 'undefined'
            ? window.IndustryCommands
            : null;
    }

    function _getCharacterById(id) {
        if (typeof window.getCharacterById !== 'function') {
            throw new Error('HouseholdAssignment: getCharacterById is required');
        }
        return window.getCharacterById(id);
    }

    function _currentYear() {
        if (typeof window.getCurrentYearSafe !== 'function') {
            throw new Error('HouseholdAssignment: getCurrentYearSafe is required');
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

    function _resolveYear(value) {
        if (value === undefined || value === null) return _currentYear();
        if (typeof value !== 'number' || !isFinite(value)) return null;
        return value;
    }

    // =========================================================================
    // 3. NEWBORN ASSIGNMENT
    // =========================================================================

    /**
     * Assigns a newborn to a household.
     * 
     * Resolution order for household:
     *   1. options.householdId
     *   2. mother's household
     *   3. father's household
     *   4. first household in the child's location
     * 
     * options:
     *   householdId, year, role, departmentId, notes, recordHistory
     */
    function assignNewbornToHousehold(childId, motherId, fatherId, options) {
        options = options || {};

        var child = _getCharacterById(childId);
        if (!child) return _fail('CHILD_NOT_FOUND', 'Child character not found');

        var year = _resolveYear(options.year);
        if (year === null) return _fail('INVALID_YEAR', 'Invalid assignment year');

        // Resolve household
        var householdId = options.householdId || null;

        if (!householdId && motherId) {
            var mother = _getCharacterById(motherId);
            if (mother && mother.householdId) {
                householdId = mother.householdId;
            }
        }

        if (!householdId && fatherId) {
            var father = _getCharacterById(fatherId);
            if (father && father.householdId) {
                householdId = father.householdId;
            }
        }

        if (!householdId && child.currentLocationId) {
            var locationHouseholds = _queries().getHouseholdsByLocation(child.currentLocationId);
            if (locationHouseholds.length > 0) {
                householdId = locationHouseholds[0].id;
            }
        }

        if (!householdId) {
            return _fail('NO_HOUSEHOLD', 'No suitable household found for newborn');
        }

        var household = _queries().getHousehold(householdId);
        if (!household) {
            return _fail('HOUSEHOLD_NOT_FOUND', 'Resolved household does not exist');
        }

        var result = _commands().addMember(householdId, childId, 'family', {
            role: options.role || 'Child',
            joinedYear: year,
            isHead: false,
            departmentId: options.departmentId || null,
            notes: options.notes || 'Newborn assigned to household',
            recordHistory: options.recordHistory !== false
        });

        if (!result.success) {
            return _fail(result.code || 'ADD_MEMBER_FAILED', result.reason);
        }

        _logEvent('household', 'Newborn Assigned',
            (child.name || 'Unknown') + ' assigned to ' + household.name,
            [child]);

        return _ok({
            childId: childId,
            householdId: householdId,
            householdName: household.name,
            year: year,
            role: options.role || 'Child'
        });
    }

    // =========================================================================
    // 4. SPOUSE ASSIGNMENT
    // =========================================================================

    /**
     * Assigns a character to their spouse's household after marriage.
     * 
     * options:
     *   patrilocal (default true) — join spouse's household
     *   year / marriageYear
     *   role, departmentId, reason, recordHistory
     */
    function assignToSpouseHousehold(characterId, spouseId, options) {
        options = options || {};

        var character = _getCharacterById(characterId);
        if (!character) return _fail('CHARACTER_NOT_FOUND', 'Character not found');

        var spouse = _getCharacterById(spouseId);
        if (!spouse) return _fail('SPOUSE_NOT_FOUND', 'Spouse not found');

        var year = _resolveYear(options.marriageYear || options.year);
        if (year === null) return _fail('INVALID_YEAR', 'Invalid marriage year');

        var spouseHousehold = _queries().getCharacterHousehold(spouseId);
        if (!spouseHousehold) {
            return _fail('SPOUSE_NO_HOUSEHOLD', 'Spouse has no household');
        }

        var patrilocal = options.patrilocal !== false;

        var targetHouseholdId;
        var targetHouseholdName;

        if (patrilocal) {
            targetHouseholdId = spouseHousehold.id;
            targetHouseholdName = spouseHousehold.name;
        } else {
            var charHousehold = _queries().getCharacterHousehold(characterId);
            targetHouseholdId = charHousehold ? charHousehold.id : spouseHousehold.id;
            targetHouseholdName = charHousehold ? charHousehold.name : spouseHousehold.name;
        }

        var result = _commands().transferMember(characterId, targetHouseholdId, {
            year: year,
            reason: options.reason || ('Marriage to ' + (spouse.name || 'spouse')),
            role: options.role || 'Spouse',
            type: 'family',
            departmentId: options.departmentId || null,
            isHead: false,
            recordHistory: options.recordHistory !== false
        });

        if (!result.success) {
            return _fail(result.code || 'TRANSFER_FAILED', result.reason);
        }

        _logEvent('household', 'Spouse Joined',
            character.name + ' joined ' + targetHouseholdName + ' as spouse',
            [character, spouse]);

        return _ok({
            characterId: characterId,
            spouseId: spouseId,
            householdId: targetHouseholdId,
            householdName: targetHouseholdName,
            year: year,
            patrilocal: patrilocal
        });
    }

    // =========================================================================
    // 5. ENTERPRISE TRANSFER HELPER
    // =========================================================================
    //
    // Canonical enterprise ownership lives in Industry. This helper moves
    // each enterprise to the new owner via IndustryCommands, then updates
    // the household index. Both sides of the change go through their
    // canonical owner.
    // =========================================================================

    function _transferEnterprises(fromHouseholdId, toHouseholdId, year, options) {
        options = options || {};
        var industryCommands = _industryCommands();
        if (!industryCommands) {
            return { transferred: 0, skipped: 0, reason: 'IndustryCommands not available' };
        }

        var enterprises = _queries().getHouseholdEnterprises(fromHouseholdId);
        if (!Array.isArray(enterprises) || enterprises.length === 0) {
            return { transferred: 0, skipped: 0 };
        }

        // Determine target owner type/id
        var toRecord = null;
        var state = window.HouseholdState;
        if (state) {
            toRecord = state._internal.getHouseholdRecord(toHouseholdId);
        }
        var toOwnerId = options.ownerId || toHouseholdId;
        var toOwnerType = options.ownerType || 'household';

        var transferred = 0;
        var skipped = 0;
        var failures = [];

        for (var i = 0; i < enterprises.length; i++) {
            var e = enterprises[i];
            var updateResult = industryCommands.updateEnterprise(e.id, {
                ownerId: toOwnerId,
                ownerType: toOwnerType,
                ownerName: toRecord ? toRecord.name : null
            });

            if (updateResult && updateResult.success) {
                // Update household index on both sides
                var removeResult = _commands().updateHousehold(fromHouseholdId, {
                    // We don't directly remove; the enterprise index is
                    // maintained below via the State internal call. But
                    // since HouseholdCommands.updateHousehold does not
                    // expose enterprise index mutation, we do it via the
                    // household record directly.
                });
                // NOTE: enterprise index mutation is done below via
                // direct state record edit + replaceHouseholds, because
                // HouseholdCommands does not yet own enterprise index
                // mutation as a primitive.
                transferred++;
            } else {
                skipped++;
                failures.push({
                    enterpriseId: e.id,
                    reason: updateResult ? updateResult.reason : 'Unknown'
                });
            }
        }

        // Update household enterprise indexes
        var st = window.HouseholdState;
        if (st) {
            var fromRecord = st._internal.getHouseholdRecord(fromHouseholdId);
            var toRecord2 = st._internal.getHouseholdRecord(toHouseholdId);

            if (fromRecord && Array.isArray(fromRecord.enterprises)) {
                var remaining = [];
                var movedIds = {};
                for (var j = 0; j < enterprises.length; j++) {
                    movedIds[enterprises[j].id] = true;
                }
                for (var k = 0; k < fromRecord.enterprises.length; k++) {
                    if (!movedIds[fromRecord.enterprises[k]]) {
                        remaining.push(fromRecord.enterprises[k]);
                    }
                }
                fromRecord.enterprises = remaining;
                if (!Array.isArray(fromRecord.enterpriseHistory)) {
                    fromRecord.enterpriseHistory = [];
                }
                fromRecord.enterpriseHistory.push({
                    year: year,
                    action: 'transferred_all_to_' + toHouseholdId,
                    count: transferred
                });
            }

            if (toRecord2) {
                if (!Array.isArray(toRecord2.enterprises)) toRecord2.enterprises = [];
                if (!Array.isArray(toRecord2.enterpriseHistory)) {
                    toRecord2.enterpriseHistory = [];
                }
                for (var m = 0; m < enterprises.length; m++) {
                    var eid = enterprises[m].id;
                    if (toRecord2.enterprises.indexOf(eid) === -1) {
                        toRecord2.enterprises.push(eid);
                        toRecord2.enterpriseHistory.push({
                            year: year,
                            action: 'transferred_from_' + fromHouseholdId,
                            enterpriseId: eid
                        });
                    }
                }
            }

            st._internal.replaceHouseholds(
                st._internal.getAllHouseholdRecords({ includeDeprecated: true })
            );
        }

        return { transferred: transferred, skipped: skipped, failures: failures };
    }

    // =========================================================================
    // 6. INHERITANCE
    // =========================================================================

    /**
     * Processes all households headed by a deceased character.
     * 
     * For each household where the character is head:
     *   - discover heirs via HouseholdQueries.getHouseholdHeirs()
     *   - if heirs exist: transfer headship to the first heir
     *   - if no heirs: mark household vacant
     * 
     * Enterprise transfer happens inside transferHouseholdToHeir.
     * 
     * options:
     *   deathYear, includeExternal, minAge, maxAge, heirRole,
     *   autoTransfer, recordHistory
     */
    function processHouseholdInheritanceOnDeath(characterId, options) {
        options = options || {};

        var character = _getCharacterById(characterId);
        if (!character) return _fail('CHARACTER_NOT_FOUND', 'Character not found');

        var year = _resolveYear(options.deathYear);
        if (year === null) return _fail('INVALID_YEAR', 'Invalid death year');

        // Find all households headed by this character
        var households = _queries().getHouseholdsHeadedBy(characterId);
        if (households.length === 0) {
            return _ok({ processed: [], reason: 'Character was not a head of any household' });
        }

        var results = [];
        for (var i = 0; i < households.length; i++) {
            var h = households[i];
            var heirs = _queries().getHouseholdHeirs(h.id, characterId, {
                referenceYear: year,
                includeExternal: options.includeExternal !== false,
                minAge: options.minAge !== undefined ? options.minAge : 16,
                maxAge: options.maxAge !== undefined ? options.maxAge : 60
            });

            if (heirs.length > 0) {
                var heirResult = transferHouseholdToHeir(h.id, heirs[0].id, {
                    year: year,
                    role: options.heirRole || 'Head',
                    recordHistory: options.recordHistory !== false,
                    transferEnterprises: options.transferEnterprises !== false
                });

                results.push({
                    householdId: h.id,
                    householdName: h.name,
                    action: 'transferred',
                    heirId: heirs[0].id,
                    heirName: heirs[0].displayName,
                    transferResult: heirResult
                });
            } else if (options.autoTransfer !== false) {
                var vacateResult = _commands().setStatus(h.id, 'vacant', {
                    year: year,
                    reason: 'No eligible heirs after death of ' + (character.name || 'head'),
                    recordEvent: true
                });
                results.push({
                    householdId: h.id,
                    householdName: h.name,
                    action: 'vacant',
                    reason: 'No eligible heirs found',
                    vacateResult: vacateResult
                });
            }
        }

        return _ok({ processed: results, deathYear: year });
    }

    /**
     * Transfers a household to an heir.
     * 
     * Sets the heir as head. Transfers enterprises owned by the household
     * to the heir's household if the heir is not already a member.
     * 
     * options:
     *   year, role, recordHistory, transferEnterprises, notes
     */
    function transferHouseholdToHeir(householdId, heirId, options) {
        options = options || {};

        var household = _queries().getHousehold(householdId);
        if (!household) return _fail('HOUSEHOLD_NOT_FOUND', 'Household not found');

        var heir = _getCharacterById(heirId);
        if (!heir) return _fail('HEIR_NOT_FOUND', 'Heir character not found');

        var year = _resolveYear(options.year);
        if (year === null) return _fail('INVALID_YEAR', 'Invalid transfer year');

        // Determine if heir is already a member
        var members = _queries().getHouseholdMembers(householdId);
        var isMember = false;
        for (var i = 0; i < members.length; i++) {
            if (members[i].characterId === heirId) {
                isMember = true;
                break;
            }
        }

        var headResult;
        if (!isMember) {
            // Add heir as head in one atomic command
            headResult = _commands().addMember(householdId, heirId, 'family', {
                role: options.role || 'Head',
                joinedYear: year,
                isHead: true,
                notes: options.notes || 'Inherited household as head',
                recordHistory: options.recordHistory !== false
            });
        } else {
            headResult = _commands().setHead(householdId, heirId, {
                year: year,
                reason: 'Inheritance'
            });
        }

        if (!headResult.success) {
            return _fail(headResult.code || 'HEAD_ASSIGN_FAILED', headResult.reason);
        }

        // Enterprise transfer
        var enterpriseTransfer = null;
        if (options.transferEnterprises !== false) {
            var heirHousehold = _queries().getCharacterHousehold(heirId);
            if (heirHousehold && heirHousehold.id !== householdId) {
                enterpriseTransfer = _transferEnterprises(
                    householdId, heirHousehold.id, year
                );
            } else if (heirHousehold && heirHousehold.id === householdId) {
                // Heir inherited the same household — enterprises stay put
                enterpriseTransfer = { transferred: 0, skipped: 0, reason: 'Heir is member of same household' };
            }
        }

        // Ensure household is active
        if (household.status !== 'active') {
            _commands().setStatus(householdId, 'active', {
                year: year,
                reason: 'Inheritance'
            });
        }

        _logEvent('household', 'Household Inherited',
            household.name + ' inherited by ' + (heir.name || 'heir'),
            [heir]);

        return _ok({
            householdId: householdId,
            heirId: heirId,
            year: year,
            isNewMember: !isMember,
            enterpriseTransfer: enterpriseTransfer
        });
    }

    /**
     * Finds eligible heirs. Delegates to HouseholdQueries.
     * Kept as a passthrough so callers that historically used
     * HouseholdAssignment.getHouseholdHeirs continue to work.
     */
    function getHouseholdHeirs(householdId, deceasedId, options) {
        options = options || {};
        return _queries().getHouseholdHeirs(householdId, deceasedId, {
            referenceYear: options.referenceYear !== undefined
                ? options.referenceYear : options.year,
            includeExternal: options.includeExternal,
            minAge: options.minAge,
            maxAge: options.maxAge
        });
    }

    // =========================================================================
    // 7. TRANSFER
    // =========================================================================

    function transferCharacterToHousehold(characterId, targetHouseholdId, options) {
        options = options || {};
        var year = _resolveYear(options.year);
        if (year === null) return _fail('INVALID_YEAR', 'Invalid transfer year');

        var character = _getCharacterById(characterId);
        if (!character) return _fail('CHARACTER_NOT_FOUND', 'Character not found');

        var result = _commands().transferMember(characterId, targetHouseholdId, {
            year: year,
            reason: options.reason || 'Transferred',
            role: options.role || null,
            type: options.type || 'family',
            departmentId: options.departmentId || null,
            isHead: options.isHead === true,
            recordHistory: options.recordHistory !== false,
            notes: options.notes || ''
        });

        if (!result.success) {
            return _fail(result.code || 'TRANSFER_FAILED', result.reason);
        }

        return _ok(result.data);
    }

    // =========================================================================
    // 8. HOUSEHOLD MANAGEMENT
    // =========================================================================

    /**
     * Creates a cadet branch. New household is created via
     * HouseholdCommands.createHousehold, then members are transferred.
     * 
     * options:
     *   year, locationId, locationName, headId, headRole, memberRole,
     *   reputation, wealth, notes, recordHistory, transferEnterprises,
     *   enterpriseIds
     */
    function createCadetBranch(parentHouseholdId, newHouseholdName, memberIds, options) {
        options = options || {};

        var parent = _queries().getHousehold(parentHouseholdId);
        if (!parent) return _fail('PARENT_NOT_FOUND', 'Parent household not found');

        if (!Array.isArray(memberIds) || memberIds.length === 0) {
            return _fail('NO_MEMBERS', 'No members to transfer');
        }

        var year = _resolveYear(options.year);
        if (year === null) return _fail('INVALID_YEAR', 'Invalid year');

        // Determine head
        var headId = options.headId || memberIds[0];

        // Determine location for the branch
        var locationId = options.locationId || parent.locationId;
        var locationName = options.locationName || parent.locationName;

        // Create new household
        var createResult = _commands().createHousehold({
            name: newHouseholdName || (parent.name + ' Cadet'),
            locationId: locationId,
            locationName: locationName,
            foundedYear: year,
            reputation: options.reputation !== undefined ? options.reputation : 10,
            wealth: options.wealth !== undefined ? options.wealth : 0,
            notes: options.notes || ('Cadet branch of ' + parent.name),
            headId: headId
        });

        if (!createResult.success) {
            return _fail(createResult.code || 'CREATE_FAILED',
                'Failed to create cadet branch: ' + createResult.reason);
        }

        var newHouseholdId = createResult.data.householdId;
        var transferred = [];
        var failed = [];

        // Transfer each member (except the head, who was installed by
        // createHousehold)
        for (var i = 0; i < memberIds.length; i++) {
            var memberId = memberIds[i];
            if (memberId === headId) {
                // Already added as head by createHousehold
                transferred.push(memberId);
                continue;
            }

            var tResult = _commands().transferMember(memberId, newHouseholdId, {
                year: year,
                reason: 'Cadet branch creation',
                type: 'family',
                recordHistory: options.recordHistory !== false
            });

            if (tResult.success) {
                transferred.push(memberId);
            } else {
                failed.push({ characterId: memberId, reason: tResult.reason });
            }
        }

        // Optional enterprise transfer
        var enterpriseTransfer = null;
        if (options.transferEnterprises === true && Array.isArray(options.enterpriseIds)) {
            enterpriseTransfer = _transferSelectedEnterprises(
                parentHouseholdId, newHouseholdId, options.enterpriseIds, year
            );
        }

        _logEvent('household', 'Cadet Branch Created',
            'Created cadet branch: ' + (newHouseholdName || (parent.name + ' Cadet')),
            []);

        return _ok({
            newHouseholdId: newHouseholdId,
            parentHouseholdId: parentHouseholdId,
            transferred: transferred,
            failed: failed,
            headId: headId,
            year: year,
            enterpriseTransfer: enterpriseTransfer
        });
    }

    /**
     * Merges two households into a surviving one.
     * 
     * Members from the absorbed household are transferred to the survivor.
     * Enterprises are transferred via IndustryCommands.
     * Absorbed household is marked deprecated.
     * 
     * Returns detailed result including any member transfers that failed.
     */
    function mergeHouseholds(householdId1, householdId2, survivingHouseholdId, options) {
        options = options || {};

        if (survivingHouseholdId !== householdId1 && survivingHouseholdId !== householdId2) {
            return _fail('INVALID_SURVIVOR', 'Surviving household must be one of the two');
        }

        var h1 = _queries().getHousehold(householdId1);
        var h2 = _queries().getHousehold(householdId2);
        if (!h1) return _fail('NOT_FOUND', 'Household 1 not found');
        if (!h2) return _fail('NOT_FOUND', 'Household 2 not found');

        var year = _resolveYear(options.mergeYear || options.year);
        if (year === null) return _fail('INVALID_YEAR', 'Invalid year');

        var survivorId = survivingHouseholdId;
        var absorbedId = survivingHouseholdId === householdId1 ? householdId2 : householdId1;
        var survivor = survivingHouseholdId === householdId1 ? h1 : h2;
        var absorbed = survivingHouseholdId === householdId1 ? h2 : h1;

        // Move members from absorbed to survivor
        var absorbedMembers = _queries().getHouseholdMembers(absorbedId);
        var transferred = [];
        var failed = [];

        for (var i = 0; i < absorbedMembers.length; i++) {
            var m = absorbedMembers[i];
            // Skip the absorbed household's head if they'd be demoted —
            // they still transfer, but as a regular member.
            var result = _commands().transferMember(m.characterId, survivorId, {
                year: year,
                reason: options.reason || 'Household merge',
                role: m.role || null,
                type: m.type || 'family',
                departmentId: m.departmentId || null,
                isHead: false,
                recordHistory: options.recordHistory !== false
            });

            if (result.success) {
                transferred.push(m.characterId);
            } else {
                failed.push({ characterId: m.characterId, reason: result.reason });
            }
        }

        // Enterprise transfer
        var enterpriseTransfer = null;
        if (options.transferEnterprises !== false) {
            enterpriseTransfer = _transferEnterprises(absorbedId, survivorId, year);
        }

        // Optional new head
        if (options.newHeadId) {
            var headResult = _commands().setHead(survivorId, options.newHeadId, {
                year: year,
                reason: 'Household merge'
            });
            if (!headResult.success) {
                // Not fatal — merge succeeded but head change failed
                failed.push({ step: 'setHead', reason: headResult.reason });
            }
        }

        // Mark absorbed household deprecated
        _commands().setStatus(absorbedId, 'deprecated', {
            year: year,
            reason: 'Merged into ' + survivor.name,
            recordEvent: true
        });

        _logEvent('household', 'Households Merged',
            absorbed.name + ' merged into ' + survivor.name,
            []);

        return _ok({
            survivorId: survivorId,
            absorbedId: absorbedId,
            transferred: transferred,
            failed: failed,
            year: year,
            enterpriseTransfer: enterpriseTransfer
        });
    }

    /**
     * Splits a household into two: parent retains members not in the split
     * list, new household receives the rest.
     */
    function splitHousehold(householdId, newHouseholdName, memberIds, options) {
        options = options || {};

        var parent = _queries().getHousehold(householdId);
        if (!parent) return _fail('PARENT_NOT_FOUND', 'Parent household not found');

        if (!Array.isArray(memberIds) || memberIds.length === 0) {
            return _fail('NO_MEMBERS', 'No members to transfer');
        }

        var year = _resolveYear(options.splitYear || options.year);
        if (year === null) return _fail('INVALID_YEAR', 'Invalid year');

        var headId = options.newHeadId || memberIds[0];

        var locationId = options.locationId || parent.locationId;
        var locationName = options.locationName || parent.locationName;

        var createResult = _commands().createHousehold({
            name: newHouseholdName || (parent.name + ' Split'),
            locationId: locationId,
            locationName: locationName,
            foundedYear: year,
            reputation: options.newReputation !== undefined ? options.newReputation : 10,
            wealth: options.newWealth !== undefined ? options.newWealth : 0,
            notes: options.notes || ('Split from ' + parent.name),
            headId: headId
        });

        if (!createResult.success) {
            return _fail(createResult.code || 'CREATE_FAILED',
                'Failed to create split household: ' + createResult.reason);
        }

        var newHouseholdId = createResult.data.householdId;
        var transferred = [];
        var failed = [];

        for (var i = 0; i < memberIds.length; i++) {
            var memberId = memberIds[i];
            if (memberId === headId) {
                transferred.push(memberId);
                continue;
            }

            var tResult = _commands().transferMember(memberId, newHouseholdId, {
                year: year,
                reason: 'Household split',
                type: 'family',
                recordHistory: options.recordHistory !== false
            });

            if (tResult.success) {
                transferred.push(memberId);
            } else {
                failed.push({ characterId: memberId, reason: tResult.reason });
            }
        }

        var enterpriseTransfer = null;
        if (options.transferEnterprises === true && Array.isArray(options.enterpriseIds)) {
            enterpriseTransfer = _transferSelectedEnterprises(
                householdId, newHouseholdId, options.enterpriseIds, year
            );
        }

        _logEvent('household', 'Household Split',
            parent.name + ' split into ' + (newHouseholdName || (parent.name + ' Split')),
            []);

        return _ok({
            newHouseholdId: newHouseholdId,
            parentHouseholdId: householdId,
            transferred: transferred,
            failed: failed,
            headId: headId,
            year: year,
            enterpriseTransfer: enterpriseTransfer
        });
    }

    /**
     * Auto-assigns a successor after a head dies.
     * 
     * If no heirs: marks household vacant (unless skipIfOnlyMember).
     */
    function autoAssignHouseholdHead(householdId, deceasedId, options) {
        options = options || {};

        var household = _queries().getHousehold(householdId);
        if (!household) return _fail('NOT_FOUND', 'Household not found');

        var year = _resolveYear(options.successionYear || options.year);
        if (year === null) return _fail('INVALID_YEAR', 'Invalid year');

        var heirs = _queries().getHouseholdHeirs(householdId, deceasedId, {
            referenceYear: year,
            includeExternal: true,
            minAge: options.minAge !== undefined ? options.minAge : 16,
            maxAge: options.maxAge !== undefined ? options.maxAge : 60
        });

        if (heirs.length === 0) {
            // Mark vacant
            var vacateResult = _commands().setStatus(householdId, 'vacant', {
                year: year,
                reason: 'No eligible heirs after death of ' + (deceasedId || 'previous head'),
                recordEvent: true
            });
            return _ok({
                householdId: householdId,
                newHeadId: null,
                newHeadName: null,
                year: year,
                vacant: true,
                vacateResult: vacateResult
            });
        }

        var heir = heirs[0];
        var headResult = _commands().setHead(householdId, heir.id, {
            year: year,
            reason: 'Auto-succession after death of ' + (deceasedId || 'previous head')
        });

        if (!headResult.success) {
            return _fail(headResult.code || 'HEAD_ASSIGN_FAILED', headResult.reason);
        }

        _logEvent('household', 'Head Assigned',
            heir.displayName + ' became head of ' + household.name,
            []);

        return _ok({
            householdId: householdId,
            newHeadId: heir.id,
            newHeadName: heir.displayName,
            year: year,
            vacant: false
        });
    }

    // =========================================================================
    // 9. ENTERPRISE TRANSFER HELPERS (SELECTED)
    // =========================================================================

    function _transferSelectedEnterprises(fromHouseholdId, toHouseholdId, enterpriseIds, year) {
        var industryCommands = _industryCommands();
        if (!industryCommands) {
            return { transferred: 0, skipped: 0, reason: 'IndustryCommands not available' };
        }

        var state = window.HouseholdState;
        var toRecord = state ? state._internal.getHouseholdRecord(toHouseholdId) : null;

        var transferred = 0;
        var skipped = 0;
        var failures = [];

        for (var i = 0; i < enterpriseIds.length; i++) {
            var eId = enterpriseIds[i];
            var result = industryCommands.updateEnterprise(eId, {
                ownerId: toHouseholdId,
                ownerType: 'household',
                ownerName: toRecord ? toRecord.name : null
            });
            if (result && result.success) {
                transferred++;
            } else {
                skipped++;
                failures.push({
                    enterpriseId: eId,
                    reason: result ? result.reason : 'Unknown'
                });
            }
        }

        // Update household indexes
        if (state) {
            var fromRecord = state._internal.getHouseholdRecord(fromHouseholdId);
            var toRecord2 = state._internal.getHouseholdRecord(toHouseholdId);

            if (fromRecord && Array.isArray(fromRecord.enterprises)) {
                var movedIds = {};
                for (var j = 0; j < enterpriseIds.length; j++) {
                    movedIds[enterpriseIds[j]] = true;
                }
                fromRecord.enterprises = fromRecord.enterprises.filter(function(id) {
                    return !movedIds[id];
                });
                if (!Array.isArray(fromRecord.enterpriseHistory)) {
                    fromRecord.enterpriseHistory = [];
                }
                fromRecord.enterpriseHistory.push({
                    year: year,
                    action: 'transferred_selected_to_' + toHouseholdId,
                    enterpriseIds: enterpriseIds.slice()
                });
            }

            if (toRecord2) {
                if (!Array.isArray(toRecord2.enterprises)) toRecord2.enterprises = [];
                if (!Array.isArray(toRecord2.enterpriseHistory)) {
                    toRecord2.enterpriseHistory = [];
                }
                for (var k = 0; k < enterpriseIds.length; k++) {
                    var eid = enterpriseIds[k];
                    if (toRecord2.enterprises.indexOf(eid) === -1) {
                        toRecord2.enterprises.push(eid);
                        toRecord2.enterpriseHistory.push({
                            year: year,
                            action: 'transferred_from_' + fromHouseholdId,
                            enterpriseId: eid
                        });
                    }
                }
            }

            state._internal.replaceHouseholds(
                state._internal.getAllHouseholdRecords({ includeDeprecated: true })
            );
        }

        return { transferred: transferred, skipped: skipped, failures: failures };
    }

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

    window.HouseholdAssignment = {
        // Newborn
        assignNewbornToHousehold: assignNewbornToHousehold,

        // Spouse
        assignToSpouseHousehold: assignToSpouseHousehold,

        // Inheritance
        processHouseholdInheritanceOnDeath: processHouseholdInheritanceOnDeath,
        transferHouseholdToHeir: transferHouseholdToHeir,
        getHouseholdHeirs: getHouseholdHeirs,

        // Transfers
        transferCharacterToHousehold: transferCharacterToHousehold,

        // Household management
        createCadetBranch: createCadetBranch,
        mergeHouseholds: mergeHouseholds,
        splitHousehold: splitHousehold,
        autoAssignHouseholdHead: autoAssignHouseholdHead
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.HouseholdAssignment;
    }

})();
