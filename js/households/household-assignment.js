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
 *   - import HouseholdState or mutate its canonical arrays
 *   - mutate any domain record in place
 *   - call HouseholdState._internal.replaceHouseholds
 *   - return live canonical objects
 *   - show toasts
 *   - use a global _processing guard
 *   - fabricate domain defaults
 *
 * CONVERGED PATTERN NOTES
 * -----------------------
 *   - Enterprise index mutation is now HouseholdCommands'
 *     responsibility (setHouseholdEnterprises / addEnterpriseToHousehold /
 *     removeEnterpriseFromHousehold). This module calls those primitives
 *     instead of touching State.
 *   - Every orchestration ends with a single _finish() that fires the
 *     domain event and calls HouseholdCommands.persist() exactly once.
 *   - Compound operations (merge, split, cadet) batch their member
 *     transfers and persist once at the end.
 *   - Partial failures are reported explicitly. The outer result is
 *     success:false with partial:true when some steps succeeded.
 *
 * RESULT SHAPE
 * ------------
 *   { success: true,  data: ... }
 *   { success: false, code: 'SOME_CODE', reason: 'human message',
 *     partial: true (when partial mutation occurred),
 *     ...extra fields (transferred, failed, enterpriseTransfer, etc.) }
 *
 * REFERENCE YEARS
 * ---------------
 * All operations accept an explicit year for historical context. If
 * omitted, the current simulation year is used. Heir discovery always
 * uses the operation year so historical deaths produce historically
 * correct ages.
 *
 * CROSS-DOMAIN
 * ------------
 *   - Enterprise ownership → IndustryCommands.updateEnterprise
 *   - Household index      → HouseholdCommands.setHouseholdEnterprises
 *   - Character reverse    → HouseholdCommands.addMember/transferMember
 *
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. LOAD-TIME DEPENDENCY VERIFICATION
    // =========================================================================

    function _requireObject(name, obj) {
        if (typeof obj === 'undefined' || obj === null) {
            throw new Error('HouseholdAssignment: ' + name + ' is required');
        }
        return obj;
    }

    function _requireFunction(name, fn) {
        if (typeof fn !== 'function') {
            throw new Error('HouseholdAssignment: ' + name + ' is required');
        }
        return fn;
    }

    // Required
    var _commands = _requireObject('HouseholdCommands', window.HouseholdCommands);
    _requireFunction('HouseholdCommands.addMember', _commands.addMember);
    _requireFunction('HouseholdCommands.transferMember', _commands.transferMember);
    _requireFunction('HouseholdCommands.setHead', _commands.setHead);
    _requireFunction('HouseholdCommands.setStatus', _commands.setStatus);
    _requireFunction('HouseholdCommands.createHousehold', _commands.createHousehold);
    _requireFunction('HouseholdCommands.updateHousehold', _commands.updateHousehold);
    _requireFunction('HouseholdCommands.recordEvent', _commands.recordEvent);
    _requireFunction('HouseholdCommands.persist', _commands.persist);
    _requireFunction('HouseholdCommands.setHouseholdEnterprises',
        _commands.setHouseholdEnterprises);
    _requireFunction('HouseholdCommands.addEnterpriseToHousehold',
        _commands.addEnterpriseToHousehold);
    _requireFunction('HouseholdCommands.removeEnterpriseFromHousehold',
        _commands.removeEnterpriseFromHousehold);

    var _queries = _requireObject('HouseholdQueries', window.HouseholdQueries);
    _requireFunction('HouseholdQueries.getHousehold', _queries.getHousehold);
    _requireFunction('HouseholdQueries.getHouseholdMembers',
        _queries.getHouseholdMembers);
    _requireFunction('HouseholdQueries.getHouseholdsByMember',
        _queries.getHouseholdsByMember);
    _requireFunction('HouseholdQueries.getHouseholdsHeadedBy',
        _queries.getHouseholdsHeadedBy);
    _requireFunction('HouseholdQueries.getHouseholdHeirs',
        _queries.getHouseholdHeirs);
    _requireFunction('HouseholdQueries.getCharacterHousehold',
        _queries.getCharacterHousehold);
    _requireFunction('HouseholdQueries.getHouseholdsByLocation',
        _queries.getHouseholdsByLocation);
    _requireFunction('HouseholdQueries.getHouseholdEnterprises',
        _queries.getHouseholdEnterprises);

    var _getCharacterById = _requireFunction('getCharacterById',
        window.getCharacterById);
    var _getCurrentYearSafe = _requireFunction('getCurrentYearSafe',
        window.getCurrentYearSafe);

    // Optional — required at call time when enterprises need transferring
    var _industryCommandsPresent = typeof window.IndustryCommands !== 'undefined' &&
        window.IndustryCommands !== null;

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
        if (value === undefined || value === null) return _getCurrentYearSafe();
        if (typeof value !== 'number' || !isFinite(value)) return null;
        return value;
    }

    // =========================================================================
    // 3. ORCHESTRATION FINISHER
    // =========================================================================
    //
    // Every public orchestration ends with _finish. It:
    //   - fires the domain event on HouseholdState (via command's publish path)
    //   - dispatches a CustomEvent for cross-domain listeners
    //   - calls HouseholdCommands.persist() exactly once
    //
    // The caller has already mutated canonical records via HouseholdCommands
    // primitives. _finish is the batch close.
    // =========================================================================

    function _dispatch(eventName, payload) {
        if (typeof window.dispatchEvent !== 'function') return;
        if (typeof window.CustomEvent !== 'function') return;
        try {
            window.dispatchEvent(new window.CustomEvent(eventName, {
                detail: payload || {}
            }));
        } catch (e) {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn('HouseholdAssignment: failed to dispatch ' + eventName, e);
            }
        }
    }

    function _finish(eventName, payload) {
        _dispatch(eventName, payload || {});
        var persistResult = _commands.persist();
        if (!persistResult || persistResult.success === false) {
            return _fail(
                (persistResult && persistResult.code) || 'PERSIST_FAILED',
                (persistResult && persistResult.reason) || 'Failed to persist'
            );
        }
        return _ok(null);
    }

    // =========================================================================
    // 4. NEWBORN ASSIGNMENT
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
            if (mother) {
                var motherH = _queries.getCharacterHousehold(motherId);
                if (motherH) householdId = motherH.id;
            }
        }

        if (!householdId && fatherId) {
            var father = _getCharacterById(fatherId);
            if (father) {
                var fatherH = _queries.getCharacterHousehold(fatherId);
                if (fatherH) householdId = fatherH.id;
            }
        }

        if (!householdId && child.currentLocationId) {
            var locationHouseholds = _queries.getHouseholdsByLocation(
                child.currentLocationId
            );
            if (locationHouseholds.length > 0) {
                householdId = locationHouseholds[0].id;
            }
        }

        if (!householdId) {
            return _fail('NO_HOUSEHOLD',
                'No suitable household found for newborn');
        }

        var household = _queries.getHousehold(householdId);
        if (!household) {
            return _fail('HOUSEHOLD_NOT_FOUND',
                'Resolved household does not exist');
        }

        // If already a member, succeed without change.
        var existingMembers = _queries.getHouseholdMembers(householdId);
        for (var i = 0; i < existingMembers.length; i++) {
            if (existingMembers[i].characterId === childId) {
                return _ok({
                    childId: childId,
                    householdId: householdId,
                    householdName: household.name,
                    year: year,
                    alreadyMember: true,
                    changed: false
                });
            }
        }

        var role = options.role || 'Child';
        var addResult = _commands.addMember(householdId, childId, 'family', {
            role: role,
            joinedYear: year,
            isHead: false,
            departmentId: options.departmentId || null,
            notes: options.notes || 'Newborn assigned to household',
            recordHistory: options.recordHistory !== false
        });

        if (!addResult.success) {
            return _fail(addResult.code || 'ADD_MEMBER_FAILED', addResult.reason);
        }

        // Single persist for the orchestration
        var finish = _finish('householdNewbornAssigned', {
            childId: childId,
            householdId: householdId,
            year: year,
            role: role
        });

        if (!finish.success) return finish;

        if (typeof window.logEvent === 'function') {
            window.logEvent('household', 'Newborn Assigned',
                (child.name || 'Unknown') + ' assigned to ' + household.name,
                [child]);
        }

        return _ok({
            childId: childId,
            householdId: householdId,
            householdName: household.name,
            year: year,
            role: role,
            alreadyMember: false,
            changed: true
        });
    }

    // =========================================================================
    // 5. SPOUSE ASSIGNMENT
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

        var spouseHousehold = _queries.getCharacterHousehold(spouseId);
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
            var charHousehold = _queries.getCharacterHousehold(characterId);
            targetHouseholdId = charHousehold ? charHousehold.id : spouseHousehold.id;
            targetHouseholdName = charHousehold ? charHousehold.name : spouseHousehold.name;
        }

        // If already in target, succeed without change.
        var current = _queries.getCharacterHousehold(characterId);
        if (current && current.id === targetHouseholdId) {
            return _ok({
                characterId: characterId,
                spouseId: spouseId,
                householdId: targetHouseholdId,
                householdName: targetHouseholdName,
                year: year,
                patrilocal: patrilocal,
                alreadyMember: true,
                changed: false
            });
        }

        var role = options.role || 'Spouse';
        var transferResult = _commands.transferMember(characterId, targetHouseholdId, {
            year: year,
            reason: options.reason || ('Marriage to ' + (spouse.name || 'spouse')),
            role: role,
            type: 'family',
            departmentId: options.departmentId || null,
            isHead: false,
            recordHistory: options.recordHistory !== false
        });

        if (!transferResult.success) {
            return _fail(transferResult.code || 'TRANSFER_FAILED',
                transferResult.reason);
        }

        var finish = _finish('householdSpouseJoined', {
            characterId: characterId,
            spouseId: spouseId,
            householdId: targetHouseholdId,
            year: year,
            patrilocal: patrilocal
        });

        if (!finish.success) return finish;

        if (typeof window.logEvent === 'function') {
            window.logEvent('household', 'Spouse Joined',
                character.name + ' joined ' + targetHouseholdName + ' as spouse',
                [character, spouse]);
        }

        return _ok({
            characterId: characterId,
            spouseId: spouseId,
            householdId: targetHouseholdId,
            householdName: targetHouseholdName,
            year: year,
            patrilocal: patrilocal,
            alreadyMember: false,
            changed: true
        });
    }

    // =========================================================================
    // 6. ENTERPRISE TRANSFER (PURE ORCHESTRATION)
    // =========================================================================
    //
    // Canonical enterprise ownership lives in Industry. The household's
    // enterprises[] array is a reverse index, mutated via HouseholdCommands.
    //
    // This function:
    //   1. Reads the current enterprise list from the from-household via
    //      HouseholdQueries (defensive snapshot).
    //   2. Calls IndustryCommands.updateEnterprise for each enterprise.
    //   3. Calls HouseholdCommands.setHouseholdEnterprises on both sides
    //      to update the reverse index.
    //
    // It does NOT touch HouseholdState. It does NOT persist. The caller
    // (via _finish) persists once.
    // =========================================================================

    function _transferEnterprises(fromHouseholdId, toHouseholdId, year, options) {
        options = options || {};

        if (!_industryCommandsPresent) {
            return {
                transferred: 0,
                skipped: 0,
                reason: 'IndustryCommands not available',
                failures: []
            };
        }

        var industryCommands = window.IndustryCommands;
        if (typeof industryCommands.updateEnterprise !== 'function') {
            return {
                transferred: 0,
                skipped: 0,
                reason: 'IndustryCommands.updateEnterprise not available',
                failures: []
            };
        }

        var enterprises = _queries.getHouseholdEnterprises(fromHouseholdId);
        if (!Array.isArray(enterprises) || enterprises.length === 0) {
            return { transferred: 0, skipped: 0, failures: [] };
        }

        var toRecord = _queries.getHousehold(toHouseholdId);
        var toOwnerId = options.ownerId || toHouseholdId;
        var toOwnerType = options.ownerType || 'household';

        var transferred = 0;
        var skipped = 0;
        var failures = [];
        var movedIds = [];

        for (var i = 0; i < enterprises.length; i++) {
            var e = enterprises[i];
            var updateResult = industryCommands.updateEnterprise(e.id, {
                ownerId: toOwnerId,
                ownerType: toOwnerType,
                ownerName: toRecord ? toRecord.name : null
            });

            if (updateResult && updateResult.success === true) {
                transferred++;
                movedIds.push(e.id);
            } else {
                skipped++;
                failures.push({
                    enterpriseId: e.id,
                    reason: updateResult ? updateResult.reason : 'Unknown'
                });
            }
        }

        if (movedIds.length > 0) {
            // Update source household index: remove moved enterprises
            var sourceEnterprises = _queries.getHouseholdEnterprises(fromHouseholdId);
            var remaining = [];
            var movedSet = {};
            for (var m = 0; m < movedIds.length; m++) movedSet[movedIds[m]] = true;
            for (var s = 0; s < sourceEnterprises.length; s++) {
                if (!movedSet[sourceEnterprises[s].id]) {
                    remaining.push(sourceEnterprises[s].id);
                }
            }
            _commands.setHouseholdEnterprises(fromHouseholdId, remaining, {
                year: year,
                reason: 'transferred_to_' + toHouseholdId
            });

            // Update target household index: add moved enterprises
            var targetEnterprises = _queries.getHouseholdEnterprises(toHouseholdId);
            var merged = [];
            var seen = {};
            for (var t = 0; t < targetEnterprises.length; t++) {
                if (!seen[targetEnterprises[t].id]) {
                    seen[targetEnterprises[t].id] = true;
                    merged.push(targetEnterprises[t].id);
                }
            }
            for (var v = 0; v < movedIds.length; v++) {
                if (!seen[movedIds[v]]) {
                    seen[movedIds[v]] = true;
                    merged.push(movedIds[v]);
                }
            }
            _commands.setHouseholdEnterprises(toHouseholdId, merged, {
                year: year,
                reason: 'received_from_' + fromHouseholdId
            });
        }

        return {
            transferred: transferred,
            skipped: skipped,
            failures: failures
        };
    }

    function _transferSelectedEnterprises(fromHouseholdId, toHouseholdId,
                                          enterpriseIds, year) {
        if (!Array.isArray(enterpriseIds) || enterpriseIds.length === 0) {
            return { transferred: 0, skipped: 0, failures: [] };
        }

        if (!_industryCommandsPresent) {
            return {
                transferred: 0,
                skipped: 0,
                reason: 'IndustryCommands not available',
                failures: []
            };
        }

        var industryCommands = window.IndustryCommands;
        if (typeof industryCommands.updateEnterprise !== 'function') {
            return {
                transferred: 0,
                skipped: 0,
                reason: 'IndustryCommands.updateEnterprise not available',
                failures: []
            };
        }

        var toRecord = _queries.getHousehold(toHouseholdId);

        var transferred = 0;
        var skipped = 0;
        var failures = [];
        var movedIds = [];

        for (var i = 0; i < enterpriseIds.length; i++) {
            var eId = enterpriseIds[i];
            var result = industryCommands.updateEnterprise(eId, {
                ownerId: toHouseholdId,
                ownerType: 'household',
                ownerName: toRecord ? toRecord.name : null
            });
            if (result && result.success === true) {
                transferred++;
                movedIds.push(eId);
            } else {
                skipped++;
                failures.push({
                    enterpriseId: eId,
                    reason: result ? result.reason : 'Unknown'
                });
            }
        }

        if (movedIds.length > 0) {
            // Source: remove moved
            var sourceEnterprises = _queries.getHouseholdEnterprises(fromHouseholdId);
            var movedSet = {};
            for (var m = 0; m < movedIds.length; m++) movedSet[movedIds[m]] = true;
            var remaining = [];
            for (var s = 0; s < sourceEnterprises.length; s++) {
                if (!movedSet[sourceEnterprises[s].id]) {
                    remaining.push(sourceEnterprises[s].id);
                }
            }
            _commands.setHouseholdEnterprises(fromHouseholdId, remaining, {
                year: year,
                reason: 'transferred_selected_to_' + toHouseholdId
            });

            // Target: add moved
            var targetEnterprises = _queries.getHouseholdEnterprises(toHouseholdId);
            var seen = {};
            var merged = [];
            for (var t = 0; t < targetEnterprises.length; t++) {
                if (!seen[targetEnterprises[t].id]) {
                    seen[targetEnterprises[t].id] = true;
                    merged.push(targetEnterprises[t].id);
                }
            }
            for (var v = 0; v < movedIds.length; v++) {
                if (!seen[movedIds[v]]) {
                    seen[movedIds[v]] = true;
                    merged.push(movedIds[v]);
                }
            }
            _commands.setHouseholdEnterprises(toHouseholdId, merged, {
                year: year,
                reason: 'received_selected_from_' + fromHouseholdId
            });
        }

        return {
            transferred: transferred,
            skipped: skipped,
            failures: failures
        };
    }

    // =========================================================================
    // 7. INHERITANCE
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
     * Each household in the loop is its own orchestration and persists
     * once. This is deliberate: inheritance across multiple households is
     * rare, and each household's succession is a discrete domain
     * operation. If a caller wants to batch the whole loop into one save,
     * they can call HouseholdCommands.persist() after this function
     * returns (it will be a redundant no-op if nothing else is dirty).
     *
     * options:
     *   deathYear, includeExternal, minAge, maxAge, heirRole,
     *   autoTransfer, recordHistory, transferEnterprises
     */
    function processHouseholdInheritanceOnDeath(characterId, options) {
        options = options || {};

        var character = _getCharacterById(characterId);
        if (!character) return _fail('CHARACTER_NOT_FOUND', 'Character not found');

        var year = _resolveYear(options.deathYear);
        if (year === null) return _fail('INVALID_YEAR', 'Invalid death year');

        var households = _queries.getHouseholdsHeadedBy(characterId);
        if (households.length === 0) {
            return _ok({
                processed: [],
                deathYear: year,
                reason: 'Character was not a head of any household'
            });
        }

        var processed = [];
        var anyPartial = false;

        for (var i = 0; i < households.length; i++) {
            var h = households[i];

            var heirs = _queries.getHouseholdHeirs(h.id, characterId, {
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

                if (!heirResult.success) {
                    anyPartial = true;
                }

                processed.push({
                    householdId: h.id,
                    householdName: h.name,
                    action: 'transferred',
                    heirId: heirs[0].id,
                    heirName: heirs[0].displayName,
                    success: heirResult.success === true,
                    transferResult: heirResult
                });
            } else if (options.autoTransfer !== false) {
                var vacateResult = _commands.setStatus(h.id, 'vacant', {
                    year: year,
                    reason: 'No eligible heirs after death of ' +
                        (character.name || 'head'),
                    recordEvent: true
                });

                var finish = _finish('householdInheritanceVacated', {
                    householdId: h.id,
                    year: year,
                    reason: 'No eligible heirs'
                });

                if (!finish.success) anyPartial = true;

                processed.push({
                    householdId: h.id,
                    householdName: h.name,
                    action: 'vacant',
                    reason: 'No eligible heirs found',
                    success: vacateResult.success === true && finish.success === true,
                    vacateResult: vacateResult,
                    persistResult: finish.success ? null : finish
                });
            }
        }

        if (anyPartial) {
            return _fail('PARTIAL_INHERITANCE',
                'One or more households failed to inherit',
                { processed: processed, deathYear: year, partial: true });
        }

        return _ok({ processed: processed, deathYear: year });
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

        var household = _queries.getHousehold(householdId);
        if (!household) return _fail('HOUSEHOLD_NOT_FOUND', 'Household not found');

        var heir = _getCharacterById(heirId);
        if (!heir) return _fail('HEIR_NOT_FOUND', 'Heir character not found');

        var year = _resolveYear(options.year);
        if (year === null) return _fail('INVALID_YEAR', 'Invalid transfer year');

        // Determine if heir is already a member
        var members = _queries.getHouseholdMembers(householdId);
        var isMember = false;
        for (var i = 0; i < members.length; i++) {
            if (members[i].characterId === heirId) {
                isMember = true;
                break;
            }
        }

        var headResult;
        if (!isMember) {
            headResult = _commands.addMember(householdId, heirId, 'family', {
                role: options.role || 'Head',
                joinedYear: year,
                isHead: true,
                notes: options.notes || 'Inherited household as head',
                recordHistory: options.recordHistory !== false
            });
        } else {
            headResult = _commands.setHead(householdId, heirId, {
                year: year,
                reason: 'Inheritance'
            });
        }

        if (!headResult.success) {
            return _fail(headResult.code || 'HEAD_ASSIGN_FAILED',
                headResult.reason);
        }

        // Enterprise transfer
        var enterpriseTransfer = null;
        if (options.transferEnterprises !== false) {
            var heirHousehold = _queries.getCharacterHousehold(heirId);
            if (heirHousehold && heirHousehold.id !== householdId) {
                enterpriseTransfer = _transferEnterprises(
                    householdId, heirHousehold.id, year
                );
            } else if (heirHousehold && heirHousehold.id === householdId) {
                enterpriseTransfer = {
                    transferred: 0,
                    skipped: 0,
                    reason: 'Heir is member of same household',
                    failures: []
                };
            }
        }

        // Ensure household is active
        if (household.status !== 'active') {
            _commands.setStatus(householdId, 'active', {
                year: year,
                reason: 'Inheritance'
            });
        }

        var finish = _finish('householdInherited', {
            householdId: householdId,
            heirId: heirId,
            year: year,
            enterpriseTransfer: enterpriseTransfer
        });

        if (!finish.success) return finish;

        if (typeof window.logEvent === 'function') {
            window.logEvent('household', 'Household Inherited',
                household.name + ' inherited by ' + (heir.name || 'heir'),
                [heir]);
        }

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
        return _queries.getHouseholdHeirs(householdId, deceasedId, {
            referenceYear: options.referenceYear !== undefined
                ? options.referenceYear : options.year,
            includeExternal: options.includeExternal,
            minAge: options.minAge,
            maxAge: options.maxAge
        });
    }

    // =========================================================================
    // 8. TRANSFER
    // =========================================================================

    function transferCharacterToHousehold(characterId, targetHouseholdId, options) {
        options = options || {};
        var year = _resolveYear(options.year);
        if (year === null) return _fail('INVALID_YEAR', 'Invalid transfer year');

        var character = _getCharacterById(characterId);
        if (!character) return _fail('CHARACTER_NOT_FOUND', 'Character not found');

        var result = _commands.transferMember(characterId, targetHouseholdId, {
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

        var finish = _finish('householdMemberTransferred', {
            characterId: characterId,
            toHouseholdId: targetHouseholdId,
            year: year
        });

        if (!finish.success) return finish;

        return _ok(result.data);
    }

    // =========================================================================
    // 9. HOUSEHOLD MANAGEMENT
    // =========================================================================

    /**
     * Creates a cadet branch. New household is created via
     * HouseholdCommands.createHousehold, then members are transferred.
     *
     * Batch model: all mutations happen, then a single persist at the end.
     * Partial failure returns { transferred, failed } and success:false
     * with partial:true.
     *
     * options:
     *   year, locationId, locationName, headId, headRole, memberRole,
     *   reputation, wealth, notes, recordHistory, transferEnterprises,
     *   enterpriseIds
     */
    function createCadetBranch(parentHouseholdId, newHouseholdName, memberIds, options) {
        options = options || {};

        var parent = _queries.getHousehold(parentHouseholdId);
        if (!parent) return _fail('PARENT_NOT_FOUND', 'Parent household not found');

        if (!Array.isArray(memberIds) || memberIds.length === 0) {
            return _fail('NO_MEMBERS', 'No members to transfer');
        }

        var year = _resolveYear(options.year);
        if (year === null) return _fail('INVALID_YEAR', 'Invalid year');

        var headId = options.headId || memberIds[0];
        var locationId = options.locationId || parent.locationId;
        var locationName = options.locationName || parent.locationName;

        var createResult = _commands.createHousehold({
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

        for (var i = 0; i < memberIds.length; i++) {
            var memberId = memberIds[i];
            if (memberId === headId) {
                transferred.push(memberId);
                continue;
            }

            var tResult = _commands.transferMember(memberId, newHouseholdId, {
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
        if (options.transferEnterprises === true &&
            Array.isArray(options.enterpriseIds) &&
            options.enterpriseIds.length > 0) {
            enterpriseTransfer = _transferSelectedEnterprises(
                parentHouseholdId, newHouseholdId, options.enterpriseIds, year
            );
        }

        var finish = _finish('householdCadetBranchCreated', {
            newHouseholdId: newHouseholdId,
            parentHouseholdId: parentHouseholdId,
            headId: headId,
            year: year,
            transferredCount: transferred.length,
            failedCount: failed.length
        });

        if (!finish.success) {
            return _fail('PERSIST_FAILED',
                finish.reason,
                {
                    newHouseholdId: newHouseholdId,
                    parentHouseholdId: parentHouseholdId,
                    transferred: transferred,
                    failed: failed,
                    partial: true
                });
        }

        if (typeof window.logEvent === 'function') {
            window.logEvent('household', 'Cadet Branch Created',
                'Created cadet branch: ' +
                (newHouseholdName || (parent.name + ' Cadet')), []);
        }

        if (failed.length > 0) {
            return _fail('PARTIAL_CADET_BRANCH',
                'Cadet branch created but some members failed to transfer',
                {
                    newHouseholdId: newHouseholdId,
                    parentHouseholdId: parentHouseholdId,
                    transferred: transferred,
                    failed: failed,
                    headId: headId,
                    year: year,
                    enterpriseTransfer: enterpriseTransfer,
                    partial: true
                });
        }

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
     * Enterprises are transferred via IndustryCommands + HouseholdCommands
     * index primitives. Absorbed household is marked deprecated.
     *
     * Batch model: all mutations happen, then a single persist at the end.
     */
    function mergeHouseholds(householdId1, householdId2, survivingHouseholdId, options) {
        options = options || {};

        if (survivingHouseholdId !== householdId1 &&
            survivingHouseholdId !== householdId2) {
            return _fail('INVALID_SURVIVOR',
                'Surviving household must be one of the two');
        }

        var h1 = _queries.getHousehold(householdId1);
        var h2 = _queries.getHousehold(householdId2);
        if (!h1) return _fail('NOT_FOUND', 'Household 1 not found');
        if (!h2) return _fail('NOT_FOUND', 'Household 2 not found');

        var year = _resolveYear(options.mergeYear || options.year);
        if (year === null) return _fail('INVALID_YEAR', 'Invalid year');

        var survivorId = survivingHouseholdId;
        var absorbedId = survivingHouseholdId === householdId1
            ? householdId2 : householdId1;
        var survivor = survivingHouseholdId === householdId1 ? h1 : h2;
        var absorbed = survivingHouseholdId === householdId1 ? h2 : h1;

        // Move members from absorbed to survivor
        var absorbedMembers = _queries.getHouseholdMembers(absorbedId);
        var transferred = [];
        var failed = [];

        for (var i = 0; i < absorbedMembers.length; i++) {
            var m = absorbedMembers[i];
            var result = _commands.transferMember(m.characterId, survivorId, {
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
                failed.push({
                    characterId: m.characterId,
                    reason: result.reason
                });
            }
        }

        // Enterprise transfer
        var enterpriseTransfer = null;
        if (options.transferEnterprises !== false) {
            enterpriseTransfer = _transferEnterprises(absorbedId, survivorId, year);
        }

        // Optional new head
        if (options.newHeadId) {
            var headResult = _commands.setHead(survivorId, options.newHeadId, {
                year: year,
                reason: 'Household merge'
            });
            if (!headResult.success) {
                failed.push({ step: 'setHead', reason: headResult.reason });
            }
        }

        // Mark absorbed household deprecated
        _commands.setStatus(absorbedId, 'deprecated', {
            year: year,
            reason: 'Merged into ' + survivor.name,
            recordEvent: true
        });

        var finish = _finish('householdsMerged', {
            survivorId: survivorId,
            absorbedId: absorbedId,
            year: year,
            transferredCount: transferred.length,
            failedCount: failed.length
        });

        if (!finish.success) {
            return _fail('PERSIST_FAILED', finish.reason, {
                survivorId: survivorId,
                absorbedId: absorbedId,
                transferred: transferred,
                failed: failed,
                year: year,
                partial: true
            });
        }

        if (typeof window.logEvent === 'function') {
            window.logEvent('household', 'Households Merged',
                absorbed.name + ' merged into ' + survivor.name, []);
        }

        if (failed.length > 0) {
            return _fail('PARTIAL_MERGE',
                'Households merged but some steps failed',
                {
                    survivorId: survivorId,
                    absorbedId: absorbedId,
                    transferred: transferred,
                    failed: failed,
                    year: year,
                    enterpriseTransfer: enterpriseTransfer,
                    partial: true
                });
        }

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

        var parent = _queries.getHousehold(householdId);
        if (!parent) return _fail('PARENT_NOT_FOUND', 'Parent household not found');

        if (!Array.isArray(memberIds) || memberIds.length === 0) {
            return _fail('NO_MEMBERS', 'No members to transfer');
        }

        var year = _resolveYear(options.splitYear || options.year);
        if (year === null) return _fail('INVALID_YEAR', 'Invalid year');

        var headId = options.newHeadId || memberIds[0];
        var locationId = options.locationId || parent.locationId;
        var locationName = options.locationName || parent.locationName;

        var createResult = _commands.createHousehold({
            name: newHouseholdName || (parent.name + ' Split'),
            locationId: locationId,
            locationName: locationName,
            foundedYear: year,
            reputation: options.newReputation !== undefined
                ? options.newReputation : 10,
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

            var tResult = _commands.transferMember(memberId, newHouseholdId, {
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
        if (options.transferEnterprises === true &&
            Array.isArray(options.enterpriseIds) &&
            options.enterpriseIds.length > 0) {
            enterpriseTransfer = _transferSelectedEnterprises(
                householdId, newHouseholdId, options.enterpriseIds, year
            );
        }

        var finish = _finish('householdSplit', {
            newHouseholdId: newHouseholdId,
            parentHouseholdId: householdId,
            headId: headId,
            year: year,
            transferredCount: transferred.length,
            failedCount: failed.length
        });

        if (!finish.success) {
            return _fail('PERSIST_FAILED', finish.reason, {
                newHouseholdId: newHouseholdId,
                parentHouseholdId: householdId,
                transferred: transferred,
                failed: failed,
                partial: true
            });
        }

        if (typeof window.logEvent === 'function') {
            window.logEvent('household', 'Household Split',
                parent.name + ' split into ' +
                (newHouseholdName || (parent.name + ' Split')), []);
        }

        if (failed.length > 0) {
            return _fail('PARTIAL_SPLIT',
                'Household split but some members failed to transfer',
                {
                    newHouseholdId: newHouseholdId,
                    parentHouseholdId: householdId,
                    transferred: transferred,
                    failed: failed,
                    headId: headId,
                    year: year,
                    enterpriseTransfer: enterpriseTransfer,
                    partial: true
                });
        }

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

        var household = _queries.getHousehold(householdId);
        if (!household) return _fail('NOT_FOUND', 'Household not found');

        var year = _resolveYear(options.successionYear || options.year);
        if (year === null) return _fail('INVALID_YEAR', 'Invalid year');

        var heirs = _queries.getHouseholdHeirs(householdId, deceasedId, {
            referenceYear: year,
            includeExternal: true,
            minAge: options.minAge !== undefined ? options.minAge : 16,
            maxAge: options.maxAge !== undefined ? options.maxAge : 60
        });

        if (heirs.length === 0) {
            var vacateResult = _commands.setStatus(householdId, 'vacant', {
                year: year,
                reason: 'No eligible heirs after death of ' +
                    (deceasedId || 'previous head'),
                recordEvent: true
            });

            var finishVacant = _finish('householdHeadAutoAssignVacated', {
                householdId: householdId,
                year: year
            });

            if (!finishVacant.success) return finishVacant;

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
        var headResult = _commands.setHead(householdId, heir.id, {
            year: year,
            reason: 'Auto-succession after death of ' +
                (deceasedId || 'previous head')
        });

        if (!headResult.success) {
            return _fail(headResult.code || 'HEAD_ASSIGN_FAILED',
                headResult.reason);
        }

        var finish = _finish('householdHeadAutoAssigned', {
            householdId: householdId,
            newHeadId: heir.id,
            year: year
        });

        if (!finish.success) return finish;

        if (typeof window.logEvent === 'function') {
            window.logEvent('household', 'Head Assigned',
                heir.displayName + ' became head of ' + household.name, []);
        }

        return _ok({
            householdId: householdId,
            newHeadId: heir.id,
            newHeadName: heir.displayName,
            year: year,
            vacant: false
        });
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
