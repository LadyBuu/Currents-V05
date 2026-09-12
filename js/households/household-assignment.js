/**
 * =============================================================================
 * STILL WATERS - HOUSEHOLD ASSIGNMENT (household-assignment.js)
 * =============================================================================
 * 
 * LOCATION: js/systems/household/household-assignment.js
 * 
 * Business logic for assigning characters to households, inheritance, transfers,
 * cadet branches, mergers, splits, and enterprise transfer on inheritance.
 * 
 * DEPENDENCIES:
 *   - household-state.js - HouseholdState
 *   - household-commands.js - HouseholdCommands
 *   - household-queries.js - HouseholdQueries
 *   - household-economy.js - HouseholdEconomy
 *   - accessors.js - getCharacterById, getCharacters, getCurrentYear
 *   - family.js - getSpouses, getChildren, getParents
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getState() {
        return typeof window.HouseholdState !== 'undefined' ? window.HouseholdState : null;
    }

    function _getCommands() {
        return typeof window.HouseholdCommands !== 'undefined' ? window.HouseholdCommands : null;
    }

    function _getQueries() {
        return typeof window.HouseholdQueries !== 'undefined' ? window.HouseholdQueries : null;
    }

    function _getEconomy() {
        return typeof window.HouseholdEconomy !== 'undefined' ? window.HouseholdEconomy : null;
    }

    function _getCharacterById(id) {
        if (typeof window.getCharacterById === 'function') {
            return window.getCharacterById(id);
        }
        return null;
    }

    function _getCharacters() {
        if (typeof window.getCharacters === 'function') {
            return window.getCharacters();
        }
        return [];
    }

    function _getCurrentYear() {
    // Delegates to time.js — do not add fallback logic here.
    return typeof window.getCurrentYearSafe === 'function'
        ? window.getCurrentYearSafe()
        : 1250;
}

    function _showToast(message, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(message, type);
        } else if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        }
    }

    function _saveMasterData() {
        if (typeof window.saveMasterData === 'function') {
            window.saveMasterData();
        }
    }

    // Family functions (if available)
    function _getSpouses(characterId) {
        if (typeof window.getSpouses === 'function') {
            return window.getSpouses(characterId);
        }
        return [];
    }

    function _getChildren(characterId) {
        if (typeof window.getChildren === 'function') {
            return window.getChildren(characterId);
        }
        return [];
    }

    function _getParents(characterId) {
        if (typeof window.getParents === 'function') {
            return window.getParents(characterId);
        }
        return { mother: null, father: null };
    }

    // =========================================================================
    // 2. RECURSION GUARDS
    // =========================================================================

    var _processingAssignment = false;
    var _recordingHistory = false;

    // =========================================================================
    // 3. NEWBORN ASSIGNMENT
    // =========================================================================

    function assignNewbornToHousehold(childId, motherId, fatherId, options) {
        if (_processingAssignment) {
            return { success: false, reason: 'Already processing' };
        }
        _processingAssignment = true;

        try {
            var state = _getState();
            var commands = _getCommands();
            if (!state || !commands) {
                return { success: false, reason: 'Household system not available' };
            }

            options = options || {};
            var year = options.year || _getCurrentYear();

            var child = _getCharacterById(childId);
            if (!child) {
                return { success: false, reason: 'Child character not found' };
            }

            // Determine household
            var householdId = options.householdId;

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

            if (!householdId) {
                // Find any household in the same location
                var allHouseholds = state.getAllHouseholds();
                for (var i = 0; i < allHouseholds.length; i++) {
                    if (allHouseholds[i].locationId === child.currentLocationId) {
                        householdId = allHouseholds[i].id;
                        break;
                    }
                }
            }

            if (!householdId) {
                return { success: false, reason: 'No suitable household found' };
            }

            var household = state.getHousehold(householdId);
            if (!household) {
                return { success: false, reason: 'Household not found' };
            }

            // Add member
            var result = commands.addMember(householdId, childId, 'family', {
                role: options.role || 'Child',
                joinedYear: year,
                isHead: false,
                departmentId: options.departmentId || null,
                notes: options.notes || 'Newborn assigned to household',
                recordHistory: options.recordHistory !== false
            });

            if (!result.success) {
                return { success: false, reason: result.reason || 'Failed to add member' };
            }

            // Assign residence if provided
            if (options.residenceId) {
                state.associateHouseholdWithResidence(householdId, options.residenceId, {
                    residenceName: options.residenceName || null,
                    residenceType: options.residenceType || null,
                    year: year,
                    unitNumber: options.unitNumber || null,
                    notes: 'Assigned with newborn'
                });
            }

            _showToast('Newborn ' + (child.name || '') + ' assigned to ' + household.name, 'success');

            return {
                success: true,
                child: child,
                household: household,
                year: year,
                role: options.role || 'Child',
                unitAssigned: !!options.residenceId,
                unitNumber: options.unitNumber || null
            };

        } finally {
            _processingAssignment = false;
        }
    }

    // =========================================================================
    // 4. SPOUSE ASSIGNMENT
    // =========================================================================

    function assignToSpouseHousehold(characterId, spouseId, options) {
        if (_processingAssignment) {
            return { success: false, reason: 'Already processing' };
        }
        _processingAssignment = true;

        try {
            var state = _getState();
            var commands = _getCommands();
            if (!state || !commands) {
                return { success: false, reason: 'Household system not available' };
            }

            options = options || {};
            var year = options.marriageYear || _getCurrentYear();

            var character = _getCharacterById(characterId);
            var spouse = _getCharacterById(spouseId);

            if (!character) {
                return { success: false, reason: 'Character not found' };
            }
            if (!spouse) {
                return { success: false, reason: 'Spouse not found' };
            }

            var spouseHousehold = state.getCharacterHousehold(spouseId);
            if (!spouseHousehold) {
                return { success: false, reason: 'Spouse has no household' };
            }

            var patrilocal = options.patrilocal !== undefined ? options.patrilocal : true;

            // Determine which household to join
            var targetHouseholdId;
            if (patrilocal) {
                // Join spouse's household
                targetHouseholdId = spouseHousehold.id;
            } else {
                // Join character's own household
                var charHousehold = state.getCharacterHousehold(characterId);
                targetHouseholdId = charHousehold ? charHousehold.id : spouseHousehold.id;
            }

            // Transfer character
            var result = commands.transferMember(characterId, targetHouseholdId, {
                year: year,
                reason: options.reason || 'Marriage to ' + (spouse.name || ''),
                role: options.role || 'Spouse',
                type: 'family',
                departmentId: options.departmentId || null,
                isHead: false,
                recordHistory: options.recordHistory !== false
            });

            if (!result.success) {
                return { success: false, reason: result.reason || 'Failed to transfer character' };
            }

            _showToast(character.name + ' joined ' + spouseHousehold.name + ' as spouse', 'success');

            return {
                success: true,
                character: character,
                spouse: spouse,
                household: spouseHousehold,
                year: year,
                patrilocal: patrilocal
            };

        } finally {
            _processingAssignment = false;
        }
    }

    // =========================================================================
    // 5. INHERITANCE (Updated with Enterprise Transfer)
    // =========================================================================

    function processHouseholdInheritanceOnDeath(characterId, options) {
        if (_processingAssignment) {
            return [];
        }
        _processingAssignment = true;

        try {
            var state = _getState();
            var commands = _getCommands();
            if (!state || !commands) {
                return [];
            }

            options = options || {};
            var year = options.deathYear || _getCurrentYear();

            var character = _getCharacterById(characterId);
            if (!character) {
                return [];
            }

            var results = [];

            // Find households where character is head
            var allHouseholds = state.getAllHouseholds();
            for (var i = 0; i < allHouseholds.length; i++) {
                var h = allHouseholds[i];
                if (!h.members) continue;

                for (var j = 0; j < h.members.length; j++) {
                    if (h.members[j].characterId === characterId && h.members[j].isHead) {
                        // This household needs a new head
                        var heirs = getHouseholdHeirs(h.id, characterId, {
                            includeExternal: options.includeExternal !== false,
                            maxAge: options.maxAge || 60,
                            minAge: options.minAge || 16
                        });

                        if (heirs.length > 0) {
                            // Transfer to first heir
                            var heirResult = transferHouseholdToHeir(h.id, heirs[0].id, {
                                year: year,
                                recordHistory: options.recordHistory !== false,
                                role: options.heirRole || 'Head'
                            });
                            results.push({
                                householdId: h.id,
                                householdName: h.name,
                                action: 'transferred',
                                heir: heirs[0],
                                result: heirResult
                            });
                        } else if (options.autoTransfer !== false) {
                            // No heirs - mark as vacant
                            if (!h.eventLog) h.eventLog = [];
                            h.eventLog.push({
                                year: year,
                                type: 'vacant',
                                message: 'Household became vacant after death of ' + (character.name || '')
                            });
                            h.status = 'vacant';

                            // Save household
                            var households = state.getAllHouseholds({ includeDeprecated: true });
                            var idx = -1;
                            for (var k = 0; k < households.length; k++) {
                                if (households[k].id === h.id) {
                                    idx = k;
                                    break;
                                }
                            }
                            if (idx !== -1) {
                                households[idx] = h;
                                state._setHouseholds(households);
                            }

                            results.push({
                                householdId: h.id,
                                householdName: h.name,
                                action: 'vacant',
                                reason: 'No eligible heirs found'
                            });
                        }
                    }
                }
            }

            return results;

        } finally {
            _processingAssignment = false;
        }
    }

    function getHouseholdHeirs(householdId, deceasedId, options) {
        if (_processingAssignment) return [];
        _processingAssignment = true;

        try {
            var state = _getState();
            if (!state) return [];

            options = options || {};
            var household = state.getHousehold(householdId);
            if (!household) return [];

            var candidates = [];

            // 1. Family members (preference order)
            if (household.members) {
                for (var i = 0; i < household.members.length; i++) {
                    var member = household.members[i];
                    if (member.characterId === deceasedId) continue;

                    var character = _getCharacterById(member.characterId);
                    if (!character) continue;

                    // Check age
                    var age = _getCurrentYear() - (character.birthYear || 0);
                    if (options.minAge !== undefined && age < options.minAge) continue;
                    if (options.maxAge !== undefined && age > options.maxAge) continue;

                    candidates.push({
                        id: character.id,
                        name: character.name + (character.surname ? ' ' + character.surname : ''),
                        age: age,
                        isHead: member.isHead || false,
                        type: member.type || 'family',
                        relation: 'member'
                    });
                }
            }

            // 2. External family members (if allowed)
            if (options.includeExternal !== false) {
                // Get children from deceased
                var children = _getChildren(deceasedId);
                for (var i = 0; i < children.length; i++) {
                    var child = _getCharacterById(children[i]);
                    if (!child) continue;
                    if (child.isDeceased) continue;

                    // Check if already in household
                    var alreadyInHousehold = false;
                    if (household.members) {
                        for (var j = 0; j < household.members.length; j++) {
                            if (household.members[j].characterId === child.id) {
                                alreadyInHousehold = true;
                                break;
                            }
                        }
                    }
                    if (alreadyInHousehold) continue;

                    var age = _getCurrentYear() - (child.birthYear || 0);
                    if (options.minAge !== undefined && age < options.minAge) continue;
                    if (options.maxAge !== undefined && age > options.maxAge) continue;

                    candidates.push({
                        id: child.id,
                        name: child.name + (child.surname ? ' ' + child.surname : ''),
                        age: age,
                        isHead: false,
                        type: 'external',
                        relation: 'child'
                    });
                }

                // Get siblings
                var parents = _getParents(deceasedId);
                if (parents.father) {
                    var siblings = _getChildren(parents.father);
                    for (var i = 0; i < siblings.length; i++) {
                        if (siblings[i] === deceasedId) continue;
                        var sibling = _getCharacterById(siblings[i]);
                        if (!sibling) continue;
                        if (sibling.isDeceased) continue;

                        var alreadyInHousehold = false;
                        if (household.members) {
                            for (var j = 0; j < household.members.length; j++) {
                                if (household.members[j].characterId === sibling.id) {
                                    alreadyInHousehold = true;
                                    break;
                                }
                            }
                        }
                        if (alreadyInHousehold) continue;

                        var age = _getCurrentYear() - (sibling.birthYear || 0);
                        if (options.minAge !== undefined && age < options.minAge) continue;
                        if (options.maxAge !== undefined && age > options.maxAge) continue;

                        candidates.push({
                            id: sibling.id,
                            name: sibling.name + (sibling.surname ? ' ' + sibling.surname : ''),
                            age: age,
                            isHead: false,
                            type: 'external',
                            relation: 'sibling'
                        });
                    }
                }
            }

            // Sort by priority: head > family member > external, then age (older first)
            candidates.sort(function(a, b) {
                var priorityA = a.isHead ? 0 : (a.type === 'family' ? 1 : 2);
                var priorityB = b.isHead ? 0 : (b.type === 'family' ? 1 : 2);
                if (priorityA !== priorityB) return priorityA - priorityB;
                // Older first
                return (b.age || 0) - (a.age || 0);
            });

            return candidates;

        } finally {
            _processingAssignment = false;
        }
    }

    function transferHouseholdToHeir(householdId, heirId, options) {
        if (_processingAssignment) {
            return { success: false, reason: 'Already processing' };
        }
        _processingAssignment = true;

        try {
            var state = _getState();
            var commands = _getCommands();
            var queries = _getQueries();
            if (!state || !commands) {
                return { success: false, reason: 'Household system not available' };
            }

            options = options || {};
            var year = options.year || _getCurrentYear();

            var household = state.getHousehold(householdId);
            if (!household) {
                return { success: false, reason: 'Household not found' };
            }

            var heir = _getCharacterById(heirId);
            if (!heir) {
                return { success: false, reason: 'Heir not found' };
            }

            // Check if heir is already a member
            var isMember = false;
            if (household.members) {
                for (var i = 0; i < household.members.length; i++) {
                    if (household.members[i].characterId === heirId) {
                        isMember = true;
                        break;
                    }
                }
            }

            if (!isMember) {
                // Add heir to household
                var addResult = commands.addMember(householdId, heirId, 'family', {
                    role: options.role || 'Head',
                    joinedYear: year,
                    isHead: true,
                    notes: options.notes || 'Inherited household as head',
                    recordHistory: options.recordHistory !== false
                });
                if (!addResult.success) {
                    return { success: false, reason: addResult.reason || 'Failed to add heir' };
                }
            } else {
                // Set as head
                var setResult = commands.setHead(householdId, heirId, {
                    year: year,
                    reason: 'Inheritance',
                    recordHistory: options.recordHistory !== false
                });
                if (!setResult.success) {
                    return { success: false, reason: setResult.reason || 'Failed to set head' };
                }
            }

            // =========================================================================
            // ENTERPRISE TRANSFER ON INHERITANCE (NEW)
            // =========================================================================

            if (queries && typeof queries.getHouseholdEnterprises === 'function') {
                var enterprises = queries.getHouseholdEnterprises(householdId);
                var transferredCount = 0;

                // Update enterprise ownership to heir's household
                if (typeof window.IndustryCommands !== 'undefined') {
                    for (var i = 0; i < enterprises.length; i++) {
                        var e = enterprises[i];
                        // Update ownership to heir's household
                        var updateResult = window.IndustryCommands.updateEnterprise(e.id, {
                            ownerId: heirId,
                            ownerType: 'household',
                            ownerName: null  // Will be auto-filled from household name
                        });
                        if (updateResult && updateResult.success) {
                            transferredCount++;
                            // Add to heir's enterprise list
                            state.addEnterpriseToHousehold(heirId, e.id, year);
                        }
                    }
                }

                if (transferredCount > 0) {
                    _showToast('Transferred ' + transferredCount + ' enterprises to ' + heir.name, 'success');
                }
            }

            // Update household status
            household.status = 'active';
            if (!household.eventLog) household.eventLog = [];
            household.eventLog.push({
                year: year,
                type: 'inheritance',
                message: 'Household inherited by ' + (heir.name || ''),
                heirId: heirId
            });

            // Save changes
            var households = state.getAllHouseholds({ includeDeprecated: true });
            var idx = -1;
            for (var i = 0; i < households.length; i++) {
                if (households[i].id === householdId) {
                    idx = i;
                    break;
                }
            }
            if (idx !== -1) {
                households[idx] = household;
                state._setHouseholds(households);
            }

            _showToast('Household ' + household.name + ' transferred to ' + (heir.name || ''), 'success');

            return {
                success: true,
                household: household,
                heir: heir,
                year: year,
                isNewMember: !isMember
            };

        } finally {
            _processingAssignment = false;
        }
    }

    // =========================================================================
    // 6. TRANSFERS
    // =========================================================================

    function transferCharacterToHousehold(characterId, targetHouseholdId, options) {
        if (_processingAssignment) {
            return { success: false, reason: 'Already processing' };
        }
        _processingAssignment = true;

        try {
            var commands = _getCommands();
            if (!commands) {
                return { success: false, reason: 'Household commands not available' };
            }

            options = options || {};
            var year = options.year || _getCurrentYear();

            var character = _getCharacterById(characterId);
            if (!character) {
                return { success: false, reason: 'Character not found' };
            }

            var result = commands.transferMember(characterId, targetHouseholdId, {
                year: year,
                reason: options.reason || 'Transferred',
                role: options.role || null,
                type: options.type || 'family',
                departmentId: options.departmentId || null,
                isHead: options.isHead || false,
                recordHistory: options.recordHistory !== false,
                notes: options.notes || ''
            });

            if (!result.success) {
                return { success: false, reason: result.reason || 'Failed to transfer' };
            }

            _showToast(character.name + ' transferred to new household', 'success');

            return {
                success: true,
                character: character,
                fromHousehold: result.fromHousehold,
                toHousehold: result.toHousehold,
                year: year,
                reason: options.reason || 'Transferred'
            };

        } finally {
            _processingAssignment = false;
        }
    }

    // =========================================================================
    // 7. HOUSEHOLD MANAGEMENT (Updated with Enterprise Transfer)
    // =========================================================================

    function createCadetBranch(householdId, newHouseholdName, memberIds, options) {
        if (_processingAssignment) {
            return { success: false, reason: 'Already processing' };
        }
        _processingAssignment = true;

        try {
            var state = _getState();
            var commands = _getCommands();
            var queries = _getQueries();
            if (!state || !commands) {
                return { success: false, reason: 'Household system not available' };
            }

            options = options || {};
            var year = options.year || _getCurrentYear();

            var parentHousehold = state.getHousehold(householdId);
            if (!parentHousehold) {
                return { success: false, reason: 'Parent household not found' };
            }

            if (!memberIds || memberIds.length === 0) {
                return { success: false, reason: 'No members to transfer' };
            }

            // Create new household
            var newHousehold = {
                id: _generateId('house'),
                name: newHouseholdName || (parentHousehold.name + ' Cadet'),
                locationId: options.locationId || parentHousehold.locationId,
                locationName: options.locationName || parentHousehold.locationName,
                departments: [],
                members: [],
                reputation: options.reputation || 10,
                wealth: options.wealth || 0,
                powerScore: 0,
                foundedYear: year,
                status: 'active',
                nameHistory: [{ oldName: null, newName: newHouseholdName || (parentHousehold.name + ' Cadet'), year: year, reason: 'Cadet branch creation' }],
                currentNameSince: year,
                notes: options.notes || 'Cadet branch of ' + parentHousehold.name,
                enterprises: options.transferEnterprises ? [] : [],
                enterpriseHistory: [],
                eventLog: [],
                createdAt: Date.now(),
                updatedAt: Date.now()
            };

            // Add to state
            var households = state.getAllHouseholds({ includeDeprecated: true });
            households.push(newHousehold);
            state._setHouseholds(households);

            var headId = options.headId || memberIds[0];
            var transferred = 0;

            // Transfer members
            for (var i = 0; i < memberIds.length; i++) {
                var memberId = memberIds[i];
                var result = commands.transferMember(memberId, newHousehold.id, {
                    year: year,
                    reason: 'Cadet branch creation',
                    role: (memberId === headId) ? (options.headRole || 'Head') : (options.memberRole || 'Member'),
                    type: 'family',
                    isHead: (memberId === headId),
                    recordHistory: options.recordHistory !== false
                });
                if (result.success) {
                    transferred++;
                }
            }

            // =========================================================================
            // ENTERPRISE TRANSFER TO CADET BRANCH (NEW)
            // =========================================================================

            if (options.transferEnterprises && queries && typeof window.IndustryCommands !== 'undefined') {
                var enterprisesToTransfer = options.enterpriseIds || [];
                var transferredEnterprises = 0;

                for (var i = 0; i < enterprisesToTransfer.length; i++) {
                    var eId = enterprisesToTransfer[i];
                    var result = window.IndustryCommands.updateEnterprise(eId, {
                        ownerId: newHousehold.id,
                        ownerType: 'household',
                        ownerName: null
                    });
                    if (result && result.success) {
                        state.addEnterpriseToHousehold(newHousehold.id, eId, year);
                        state.removeEnterpriseFromHousehold(householdId, eId, year);
                        transferredEnterprises++;
                    }
                }

                if (transferredEnterprises > 0) {
                    _showToast('Transferred ' + transferredEnterprises + ' enterprises to cadet branch', 'success');
                }
            }

            _showToast('Cadet branch created: ' + newHousehold.name, 'success');

            return {
                success: true,
                newHousehold: newHousehold,
                parentHousehold: parentHousehold,
                transferred: transferred,
                year: year,
                headId: headId
            };

        } finally {
            _processingAssignment = false;
        }
    }

    function mergeHouseholds(householdId1, householdId2, survivingHouseholdId, options) {
        if (_processingAssignment) {
            return { success: false, reason: 'Already processing' };
        }
        _processingAssignment = true;

        try {
            var state = _getState();
            var commands = _getCommands();
            var queries = _getQueries();
            if (!state || !commands) {
                return { success: false, reason: 'Household system not available' };
            }

            options = options || {};
            var year = options.mergeYear || _getCurrentYear();

            var h1 = state.getHousehold(householdId1);
            var h2 = state.getHousehold(householdId2);
            if (!h1 || !h2) {
                return { success: false, reason: 'One or both households not found' };
            }

            if (survivingHouseholdId !== householdId1 && survivingHouseholdId !== householdId2) {
                return { success: false, reason: 'Surviving household must be one of the two' };
            }

            var survivor = survivingHouseholdId === householdId1 ? h1 : h2;
            var absorbed = survivingHouseholdId === householdId1 ? h2 : h1;

            // Move members from absorbed to survivor
            if (absorbed.members) {
                for (var i = 0; i < absorbed.members.length; i++) {
                    var member = absorbed.members[i];
                    var result = commands.transferMember(member.characterId, survivor.id, {
                        year: year,
                        reason: options.reason || 'Household merge',
                        role: member.role || null,
                        type: member.type || 'family',
                        departmentId: member.departmentId || null,
                        isHead: false,
                        recordHistory: options.recordHistory !== false
                    });
                }
            }

            // =========================================================================
            // ENTERPRISE TRANSFER ON MERGE (NEW)
            // =========================================================================

            if (queries && typeof window.IndustryCommands !== 'undefined') {
                var enterprises = queries.getHouseholdEnterprises(absorbed.id);
                var transferredCount = 0;

                for (var i = 0; i < enterprises.length; i++) {
                    var e = enterprises[i];
                    var result = window.IndustryCommands.updateEnterprise(e.id, {
                        ownerId: survivor.id,
                        ownerType: 'household',
                        ownerName: null
                    });
                    if (result && result.success) {
                        state.addEnterpriseToHousehold(survivor.id, e.id, year);
                        transferredCount++;
                    }
                }

                if (transferredCount > 0) {
                    _showToast('Transferred ' + transferredCount + ' enterprises to merged household', 'success');
                }
            }

            // Mark absorbed household as deprecated
            absorbed.status = 'deprecated';
            if (!absorbed.eventLog) absorbed.eventLog = [];
            absorbed.eventLog.push({
                year: year,
                type: 'merged',
                message: 'Merged into ' + survivor.name
            });

            // Update survivor
            if (options.newHeadId) {
                commands.setHead(survivor.id, options.newHeadId, {
                    year: year,
                    reason: 'Household merge',
                    recordHistory: options.recordHistory !== false
                });
            }

            // Save changes
            var households = state.getAllHouseholds({ includeDeprecated: true });
            var idx1 = -1, idx2 = -1, idxS = -1;
            for (var i = 0; i < households.length; i++) {
                if (households[i].id === householdId1) idx1 = i;
                if (households[i].id === householdId2) idx2 = i;
                if (households[i].id === survivingHouseholdId) idxS = i;
            }
            if (idx1 !== -1) households[idx1] = h1;
            if (idx2 !== -1) households[idx2] = h2;
            if (idxS !== -1) households[idxS] = survivor;
            state._setHouseholds(households);

            _showToast('Households merged: ' + survivor.name, 'success');

            return {
                success: true,
                survivor: survivor,
                merged: absorbed,
                transferred: absorbed.members ? absorbed.members.length : 0,
                year: year
            };

        } finally {
            _processingAssignment = false;
        }
    }

    function splitHousehold(householdId, newHouseholdName, memberIds, options) {
        if (_processingAssignment) {
            return { success: false, reason: 'Already processing' };
        }
        _processingAssignment = true;

        try {
            var state = _getState();
            var commands = _getCommands();
            if (!state || !commands) {
                return { success: false, reason: 'Household system not available' };
            }

            options = options || {};
            var year = options.splitYear || _getCurrentYear();

            var parentHousehold = state.getHousehold(householdId);
            if (!parentHousehold) {
                return { success: false, reason: 'Parent household not found' };
            }

            if (!memberIds || memberIds.length === 0) {
                return { success: false, reason: 'No members to transfer' };
            }

            // Create new household
            var newHousehold = {
                id: _generateId('house'),
                name: newHouseholdName || (parentHousehold.name + ' Split'),
                locationId: options.locationId || parentHousehold.locationId,
                locationName: options.locationName || parentHousehold.locationName,
                departments: [],
                members: [],
                reputation: options.newReputation || 10,
                wealth: options.newWealth || 0,
                powerScore: 0,
                foundedYear: year,
                status: 'active',
                nameHistory: [{ oldName: null, newName: newHouseholdName || (parentHousehold.name + ' Split'), year: year, reason: 'Split from ' + parentHousehold.name }],
                currentNameSince: year,
                notes: options.notes || 'Split from ' + parentHousehold.name,
                enterprises: [],
                enterpriseHistory: [],
                eventLog: [],
                createdAt: Date.now(),
                updatedAt: Date.now()
            };

            // Add to state
            var households = state.getAllHouseholds({ includeDeprecated: true });
            households.push(newHousehold);
            state._setHouseholds(households);

            var headId = options.newHeadId || memberIds[0];
            var transferred = 0;

            // Transfer members
            for (var i = 0; i < memberIds.length; i++) {
                var memberId = memberIds[i];
                var result = commands.transferMember(memberId, newHousehold.id, {
                    year: year,
                    reason: 'Household split',
                    role: (memberId === headId) ? (options.headRole || 'Head') : (options.memberRole || 'Member'),
                    type: 'family',
                    isHead: (memberId === headId),
                    recordHistory: options.recordHistory !== false
                });
                if (result.success) {
                    transferred++;
                }
            }

            // Handle enterprise transfer (optional)
            if (options.transferEnterprises && typeof window.IndustryCommands !== 'undefined') {
                var enterprisesToTransfer = options.enterpriseIds || [];
                var transferredEnterprises = 0;

                for (var i = 0; i < enterprisesToTransfer.length; i++) {
                    var eId = enterprisesToTransfer[i];
                    var result = window.IndustryCommands.updateEnterprise(eId, {
                        ownerId: newHousehold.id,
                        ownerType: 'household',
                        ownerName: null
                    });
                    if (result && result.success) {
                        state.addEnterpriseToHousehold(newHousehold.id, eId, year);
                        state.removeEnterpriseFromHousehold(householdId, eId, year);
                        transferredEnterprises++;
                    }
                }

                if (transferredEnterprises > 0) {
                    _showToast('Transferred ' + transferredEnterprises + ' enterprises to split household', 'success');
                }
            }

            _showToast('Household split: ' + newHousehold.name, 'success');

            return {
                success: true,
                newHousehold: newHousehold,
                parentHousehold: parentHousehold,
                transferred: transferred,
                year: year,
                headId: headId
            };

        } finally {
            _processingAssignment = false;
        }
    }

    function autoAssignHouseholdHead(householdId, deceasedId, options) {
        if (_processingAssignment) {
            return { success: false, reason: 'Already processing' };
        }
        _processingAssignment = true;

        try {
            var state = _getState();
            var commands = _getCommands();
            if (!state || !commands) {
                return { success: false, reason: 'Household system not available' };
            }

            options = options || {};
            var year = options.successionYear || _getCurrentYear();

            var household = state.getHousehold(householdId);
            if (!household) {
                return { success: false, reason: 'Household not found' };
            }

            // Get eligible heirs
            var heirs = getHouseholdHeirs(householdId, deceasedId, {
                includeExternal: true,
                maxAge: options.maxAge || 60,
                minAge: options.minAge || 16
            });

            if (heirs.length === 0) {
                if (options.skipIfOnlyMember !== false) {
                    var members = household.members || [];
                    if (members.length <= 1) {
                        // Only the deceased - mark as vacant
                        household.status = 'vacant';
                        if (!household.eventLog) household.eventLog = [];
                        household.eventLog.push({
                            year: year,
                            type: 'vacant',
                            message: 'Household became vacant after death of sole member'
                        });

                        var households = state.getAllHouseholds({ includeDeprecated: true });
                        var idx = -1;
                        for (var i = 0; i < households.length; i++) {
                            if (households[i].id === householdId) {
                                idx = i;
                                break;
                            }
                        }
                        if (idx !== -1) {
                            households[idx] = household;
                            state._setHouseholds(households);
                        }

                        return {
                            success: true,
                            newHead: null,
                            newHeadName: null,
                            year: year,
                            household: household,
                            abandoned: true,
                            abandonedYear: year
                        };
                    }
                }
                return {
                    success: false,
                    reason: 'No eligible heirs found'
                };
            }

            // Assign first heir as head
            var heir = heirs[0];
            var result = commands.setHead(householdId, heir.id, {
                year: year,
                reason: 'Auto-succession after death of ' + (deceasedId || 'previous head'),
                recordHistory: options.recordHistory !== false
            });

            if (result.success) {
                _showToast(heir.name + ' became head of ' + household.name, 'success');
                return {
                    success: true,
                    newHead: heir,
                    newHeadName: heir.name,
                    year: year,
                    household: household,
                    abandoned: false
                };
            }

            return {
                success: false,
                reason: result.reason || 'Failed to assign new head'
            };

        } finally {
            _processingAssignment = false;
        }
    }

    // =========================================================================
    // 8. HELPER - Generate ID
    // =========================================================================

    function _generateId(prefix) {
        if (typeof window.generateId === 'function') {
            return window.generateId(prefix);
        }
        return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    }

    // =========================================================================
    // 9. EXPORTS
    // =========================================================================

    window.HouseholdAssignment = {
        // Newborn Assignment
        assignNewbornToHousehold: assignNewbornToHousehold,

        // Spouse Assignment
        assignToSpouseHousehold: assignToSpouseHousehold,

        // Inheritance (Updated with Enterprise Transfer)
        processHouseholdInheritanceOnDeath: processHouseholdInheritanceOnDeath,
        getHouseholdHeirs: getHouseholdHeirs,
        transferHouseholdToHeir: transferHouseholdToHeir,

        // Transfers
        transferCharacterToHousehold: transferCharacterToHousehold,

        // Household Management (Updated with Enterprise Transfer)
        createCadetBranch: createCadetBranch,
        mergeHouseholds: mergeHouseholds,
        splitHousehold: splitHousehold,
        autoAssignHouseholdHead: autoAssignHouseholdHead
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.HouseholdAssignment;
    }

})();