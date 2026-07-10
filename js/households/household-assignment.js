/**
 * =============================================================================
 * HOUSEHOLD ASSIGNMENT (household-assignment.js)
 * =============================================================================
 * 
 * PURPOSE: Business logic for assigning characters to households, including
 *          newborn assignment, spouse household assignment, inheritance,
 *          household transfers, cadet branches, merging, and splitting.
 * 
 * DEPENDS ON:
 *   - household-state.js (HouseholdState)
 *   - household-commands.js (HouseholdCommands)
 *   - household-queries.js (HouseholdQueries)
 *   - accessors.js (getCharacterById, getCharacters, getCurrentYear)
 *   - family.js (getSpouses, getChildren, getParents)
 * 
 * EXPORTS:
 *   - assignNewbornToHousehold() - Assign newborn to parent's household
 *   - assignToSpouseHousehold() - Assign character to spouse's household
 *   - processHouseholdInheritanceOnDeath() - Process inheritance when character dies
 *   - getHouseholdHeirs() - Get eligible heirs for a household
 *   - transferHouseholdToHeir() - Transfer household to heir
 *   - transferCharacterToHousehold() - Transfer character between households
 *   - createCadetBranch() - Create cadet branch from existing household
 *   - mergeHouseholds() - Merge two households into one
 *   - splitHousehold() - Split a household into two
 *   - autoAssignHouseholdHead() - Auto-assign head on death
 *   - recordHouseholdChange() - Record household change in character history
 * 
 * ICON POLICY:
 *   - All icons from icons.js via _getIcon()
 *   - NO emojis
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. RECURSION GUARD
    // =========================================================================

    var _processingAssignment = false;
    var _recordingHistory = false;

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getCurrentYear() {
        if (typeof window._getCurrentYear === 'function') {
            return window._getCurrentYear();
        }
        if (typeof window.getCurrentYearSafe === 'function') {
            return window.getCurrentYearSafe();
        }
        if (typeof window.getCurrentYear === 'function') {
            return window.getCurrentYear();
        }
        return 1250;
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
        return window.masterData?.data?.characters || [];
    }

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
        return [];
    }

    function _calculateAge(birthYear, isDeceased, deathYear) {
        if (typeof window.calculateAge === 'function') {
            return window.calculateAge(birthYear, isDeceased, deathYear);
        }
        var currentYear = _getCurrentYear();
        if (!birthYear) return 0;
        if (isDeceased && deathYear) return Math.max(0, deathYear - birthYear);
        return Math.max(0, currentYear - birthYear);
    }

    function _saveMasterData() {
        if (typeof window.saveMasterData === 'function') {
            window.saveMasterData();
        }
    }

    function _logEvent(category, type, message, subjects) {
        if (typeof window.logEvent === 'function') {
            window.logEvent(category, type, message, subjects);
        }
    }

    function _showToast(message, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(message, type);
        } else if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        } else if (typeof window.showToastMessage === 'function') {
            window.showToastMessage(message, type);
        }
    }

    function _getIcon(name) {
        if (typeof window._getIcon === 'function') {
            return window._getIcon(name);
        }
        if (window.Icons && window.Icons[name]) {
            return window.Icons[name];
        }
        return '';
    }

    // =========================================================================
    // 2. STATE AND COMMANDS REFERENCE
    // =========================================================================

    var _state = window.HouseholdState;
    var _commands = window.HouseholdCommands;

    // =========================================================================
    // 3. ICON HELPERS
    // =========================================================================

    function _getIconSafe(name) {
        var icon = _getIcon(name);
        return icon || '';
    }

    // =========================================================================
    // 4. RECORD HOUSEHOLD CHANGE - UNIFIED
    // =========================================================================

    /**
     * Records a household change in a character's history
     * @param {string} characterId - Character ID
     * @param {string|null} householdId - Household ID (null if leaving)
     * @param {number} year - Year of change
     * @param {string} action - 'joined', 'left', 'born', 'inherited', 'created', 'dissolved'
     * @param {string} reason - Reason for change
     * @param {Object} options - Additional options
     * @returns {boolean} True if recorded
     */
    function recordHouseholdChange(characterId, householdId, year, action, reason, options) {
        if (_recordingHistory) return false;
        _recordingHistory = true;

        try {
            var character = _getCharacterById(characterId);
            if (!character) return false;

            if (!character.householdHistory) {
                character.householdHistory = [];
            }

            var currentYear = year || _getCurrentYear();
            var household = householdId ? _state.getHousehold(householdId) : null;
            var householdName = household ? household.name : (options.previousHouseholdName || null);

            // Handle leaving action
            if (action === 'left' || action === 'dissolved' || action === 'removed') {
                var previousHouseholdId = options.previousHouseholdId || householdId;
                var membershipFound = false;

                for (var i = 0; i < character.householdHistory.length; i++) {
                    if (character.householdHistory[i].householdId === previousHouseholdId && 
                        !character.householdHistory[i].leftYear) {
                        character.householdHistory[i].leftYear = currentYear;
                        character.householdHistory[i].leftReason = reason || 'Left';
                        membershipFound = true;
                        break;
                    }
                }

                if (!membershipFound) {
                    var existingEntry = null;
                    for (var i = 0; i < character.householdHistory.length; i++) {
                        if (character.householdHistory[i].householdId === previousHouseholdId) {
                            existingEntry = character.householdHistory[i];
                            break;
                        }
                    }

                    if (existingEntry) {
                        existingEntry.leftYear = currentYear;
                        existingEntry.leftReason = reason || 'Left';
                        if (!existingEntry.joinedYear) {
                            existingEntry.joinedYear = currentYear;
                        }
                        if (!existingEntry.householdName) {
                            existingEntry.householdName = options.previousHouseholdName || 'Unknown';
                        }
                    } else {
                        character.householdHistory.push({
                            householdId: previousHouseholdId,
                            householdName: options.previousHouseholdName || 'Unknown Household',
                            joinedYear: currentYear,
                            leftYear: currentYear,
                            leftReason: reason || 'Left',
                            role: options.role || null,
                            isHead: options.isHead || false,
                            timestamp: Date.now()
                        });
                    }
                }

                // Clear character's household reference if leaving
                if (character.household === previousHouseholdId) {
                    character.household = '';
                    character.householdId = '';
                }

            // Handle joining action
            } else if (action === 'joined' || action === 'born' || action === 'created' || action === 'inherited') {
                var existingActive = null;
                for (var i = 0; i < character.householdHistory.length; i++) {
                    if (character.householdHistory[i].householdId === householdId && 
                        !character.householdHistory[i].leftYear) {
                        existingActive = character.householdHistory[i];
                        break;
                    }
                }

                if (existingActive) {
                    if (options.newRole) existingActive.role = options.newRole;
                    if (options.isHead !== undefined) existingActive.isHead = options.isHead;
                    if (year && !existingActive.joinedYear) existingActive.joinedYear = currentYear;
                } else {
                    var existingEntry = null;
                    for (var i = 0; i < character.householdHistory.length; i++) {
                        if (character.householdHistory[i].householdId === householdId) {
                            existingEntry = character.householdHistory[i];
                            break;
                        }
                    }

                    if (existingEntry) {
                        existingEntry.leftYear = null;
                        existingEntry.leftReason = null;
                        existingEntry.joinedYear = currentYear;
                        if (options.newRole) existingEntry.role = options.newRole;
                        if (options.isHead !== undefined) existingEntry.isHead = options.isHead;
                        existingEntry.householdName = householdName || existingEntry.householdName;
                        existingEntry.timestamp = Date.now();
                    } else {
                        character.householdHistory.push({
                            householdId: householdId,
                            householdName: householdName || 'Unknown Household',
                            joinedYear: currentYear,
                            leftYear: null,
                            leftReason: null,
                            role: options.newRole || 'Member',
                            isHead: options.isHead || false,
                            timestamp: Date.now()
                        });
                    }
                }

                // Update character's household reference
                character.household = householdId || '';
                character.householdId = householdId || '';
            }

            // Sort history
            character.householdHistory.sort(function(a, b) {
                return (a.joinedYear || 0) - (b.joinedYear || 0);
            });

            _saveMasterData();
            return true;

        } finally {
            _recordingHistory = false;
        }
    }

    // =========================================================================
    // 5. NEWBORN ASSIGNMENT
    // =========================================================================

    /**
     * Assign a newborn to a household
     * @param {string} childId - Child character ID
     * @param {string} motherId - Mother character ID
     * @param {string} fatherId - Father character ID (optional)
     * @param {Object} options - Options
     * @param {string} options.householdId - Specific household to assign to (overrides parent detection)
     * @param {number} options.year - Year of birth (defaults to current year)
     * @param {string} options.role - Role for the child (defaults to 'Family Member')
     * @param {boolean} options.recordHistory - Record in character history (default: true)
     * @param {string} options.unitNumber - Specific unit number to assign to
     * @param {string} options.residenceId - Residence ID for unit assignment
     * @returns {Object} Result object
     */
    function assignNewbornToHousehold(childId, motherId, fatherId, options) {
        if (_processingAssignment) {
            return { success: false, reason: 'Already processing an assignment' };
        }
        _processingAssignment = true;

        try {
            options = options || {};

            var child = _getCharacterById(childId);
            if (!child) {
                return { success: false, reason: 'Child not found' };
            }

            var year = options.year || _getCurrentYear();
            var role = options.role || 'Family Member';
            var recordHistory = options.recordHistory !== false;

            // Determine which household to use
            var householdId = options.householdId || null;
            var household = null;

            if (householdId) {
                household = _state.getHousehold(householdId);
                if (!household) {
                    return { success: false, reason: 'Specified household not found' };
                }
            } else {
                // Try mother's household first
                if (motherId) {
                    var mother = _getCharacterById(motherId);
                    if (mother) {
                        household = _state.getCharacterHousehold(mother.id);
                        if (household) {
                            householdId = household.id;
                        }
                    }
                }

                // Try father's household if no mother's household
                if (!householdId && fatherId) {
                    var father = _getCharacterById(fatherId);
                    if (father) {
                        household = _state.getCharacterHousehold(father.id);
                        if (household) {
                            householdId = household.id;
                        }
                    }
                }
            }

            if (!householdId) {
                return { success: false, reason: 'No suitable household found for newborn' };
            }

            household = _state.getHousehold(householdId);
            if (!household) {
                return { success: false, reason: 'Household not found' };
            }

            // Add child to household
            var result = _commands.addMember(householdId, childId, 'family', {
                role: role,
                joinedYear: year,
                isHead: false,
                notes: options.notes || 'Born into household',
                recordHistory: recordHistory
            });

            if (!result || !result.success) {
                return { success: false, reason: 'Failed to add newborn to household: ' + (result ? result.reason : 'Unknown error') };
            }

            // Record history
            if (recordHistory) {
                recordHouseholdChange(childId, householdId, year, 'born',
                    'Born into ' + household.name,
                    { newRole: role });
            }

            // Add activity log
            if (typeof _commands.addActivityLog === 'function') {
                _commands.addActivityLog(householdId, 'newborn_added',
                    'Newborn ' + (child.name || 'child') + ' added to household',
                    childId);
            }

            // Assign to unit if specified
            if (options.residenceId && options.unitNumber) {
                var unitResult = _assignChildToUnit(
                    childId,
                    householdId,
                    options.residenceId,
                    options.unitNumber,
                    year,
                    options
                );
                if (unitResult && unitResult.success) {
                    result.unitAssigned = true;
                    result.unitNumber = options.unitNumber;
                }
            } else {
                // Try to assign to parent's unit
                var parentId = motherId || fatherId;
                if (parentId) {
                    var parent = _getCharacterById(parentId);
                    if (parent) {
                        var parentHousehold = _state.getCharacterHousehold(parent.id);
                        if (parentHousehold && parentHousehold.id === householdId) {
                            var parentUnit = _findParentUnit(parentHousehold.id, parentId);
                            if (parentUnit && parentUnit.residenceId) {
                                var parentUnitResult = _assignChildToUnit(
                                    childId,
                                    householdId,
                                    parentUnit.residenceId,
                                    parentUnit.unitNumber,
                                    year,
                                    options
                                );
                                if (parentUnitResult && parentUnitResult.success) {
                                    result.unitAssigned = true;
                                    result.unitNumber = parentUnit.unitNumber;
                                }
                            }
                        }
                    }
                }
            }

            _logEvent('household', 'Newborn Assigned',
                (child.name || 'Newborn') + ' added to ' + household.name,
                [child]);

            return {
                success: true,
                child: child,
                household: household,
                year: year,
                role: role
            };

        } finally {
            _processingAssignment = false;
        }
    }

    /**
     * Helper: Assign child to a unit
     * @private
     */
    function _assignChildToUnit(childId, householdId, residenceId, unitNumber, year, options) {
        // Check if residence system is available
        if (typeof window.ResidenceCommands !== 'undefined' && 
            typeof window.ResidenceCommands.assignHouseholdToUnit === 'function') {
            return window.ResidenceCommands.assignHouseholdToUnit(
                residenceId,
                unitNumber,
                householdId,
                null, // householdName will be looked up
                year,
                { notes: 'Newborn assigned to unit ' + unitNumber, reason: 'newborn_assignment' }
            );
        }
        return { success: false, reason: 'Residence system not available' };
    }

    /**
     * Helper: Find parent's unit
     * @private
     */
    function _findParentUnit(householdId, parentId) {
        if (typeof window.ResidenceQueries !== 'undefined' && 
            typeof window.ResidenceQueries.getHouseholdUnits === 'function') {
            var units = window.ResidenceQueries.getHouseholdUnits(householdId);
            if (units.length > 0) {
                return units[0];
            }
        }
        return null;
    }

    // =========================================================================
    // 6. SPOUSE HOUSEHOLD ASSIGNMENT
    // =========================================================================

    /**
     * Assign a character to their spouse's household (patrilocal/matrilocal)
     * @param {string} characterId - Character ID
     * @param {string} spouseId - Spouse character ID
     * @param {Object} options - Options
     * @param {number} options.marriageYear - Year of marriage (defaults to current)
     * @param {boolean} options.patrilocal - True for patrilocal (wife moves to husband), false for matrilocal (husband moves to wife) (default: true)
     * @param {string} options.role - Role for the character (defaults to 'Family Member')
     * @param {boolean} options.recordHistory - Record in character history (default: true)
     * @returns {Object} Result object
     */
    function assignToSpouseHousehold(characterId, spouseId, options) {
        if (_processingAssignment) {
            return { success: false, reason: 'Already processing an assignment' };
        }
        _processingAssignment = true;

        try {
            options = options || {};

            var character = _getCharacterById(characterId);
            var spouse = _getCharacterById(spouseId);

            if (!character || !spouse) {
                return { success: false, reason: 'Character not found' };
            }

            if (character.isDeceased) {
                return { success: false, reason: 'Cannot assign deceased character' };
            }

            if (spouse.isDeceased) {
                return { success: false, reason: 'Spouse is deceased' };
            }

            var spouseHousehold = _state.getCharacterHousehold(spouseId);
            if (!spouseHousehold) {
                return { success: false, reason: 'Spouse has no household' };
            }

            var year = options.marriageYear || _getCurrentYear();
            var patrilocal = options.patrilocal !== false;
            var role = options.role || 'Family Member';
            var recordHistory = options.recordHistory !== false;

            // Determine which direction the move goes
            // Patrilocal: character moves to spouse's household
            // Matrilocal: spouse moves to character's household
            var targetHouseholdId;
            var targetCharacterId;

            if (patrilocal) {
                targetHouseholdId = spouseHousehold.id;
                targetCharacterId = spouseId;
            } else {
                var characterHousehold = _state.getCharacterHousehold(characterId);
                if (!characterHousehold) {
                    return { success: false, reason: 'Character has no household to receive spouse' };
                }
                targetHouseholdId = characterHousehold.id;
                targetCharacterId = characterId;
            }

            var currentHousehold = _state.getCharacterHousehold(characterId);

            // If already in the target household
            if (currentHousehold && currentHousehold.id === targetHouseholdId) {
                return { success: true, action: 'already_together', household: currentHousehold };
            }

            // Remove from current household if any
            if (currentHousehold) {
                var removeResult = _commands.removeMember(currentHousehold.id, characterId, {
                    reason: 'Moved to spouse\'s household',
                    leftYear: year,
                    recordHistory: recordHistory
                });

                if (!removeResult || !removeResult.success) {
                    return { success: false, reason: 'Failed to remove from current household' };
                }
            }

            // Add to spouse's household
            var addResult = _commands.addMember(targetHouseholdId, characterId, 'family', {
                role: role,
                joinedYear: year,
                isHead: false,
                notes: 'Moved to spouse\'s household',
                recordHistory: recordHistory
            });

            if (!addResult || !addResult.success) {
                return { success: false, reason: 'Failed to add to spouse\'s household' };
            }

            // Record history
            if (recordHistory) {
                recordHouseholdChange(characterId, targetHouseholdId, year, 'joined',
                    'Moved to spouse\'s household',
                    { newRole: role });
            }

            // Log event
            _logEvent('household', 'Spouse Household Assignment',
                character.name + ' moved to ' + spouse.name + '\'s household',
                [character, spouse]);

            return {
                success: true,
                character: character,
                spouse: spouse,
                household: _state.getHousehold(targetHouseholdId),
                year: year,
                patrilocal: patrilocal
            };

        } finally {
            _processingAssignment = false;
        }
    }

    // =========================================================================
    // 7. HOUSEHOLD INHERITANCE
    // =========================================================================

    /**
     * Process household inheritance when a character dies
     * @param {string} characterId - Character ID
     * @param {Object} options - Options
     * @param {number} options.deathYear - Year of death (defaults to current)
     * @param {boolean} options.autoTransfer - Auto-transfer to heir (default: true)
     * @param {boolean} options.recordHistory - Record in character history (default: true)
     * @returns {Array} Results for each household affected
     */
    function processHouseholdInheritanceOnDeath(characterId, options) {
        if (_processingAssignment) {
            return [{ success: false, reason: 'Already processing an assignment' }];
        }
        _processingAssignment = true;

        try {
            options = options || {};
            var character = _getCharacterById(characterId);
            if (!character) {
                return [{ success: false, reason: 'Character not found' }];
            }

            var currentYear = options.deathYear || _getCurrentYear();
            var autoTransfer = options.autoTransfer !== false;
            var recordHistory = options.recordHistory !== false;
            var results = [];

            var households = _state.getAllHouseholds();

            for (var i = 0; i < households.length; i++) {
                var household = households[i];
                var isMember = false;
                var isHead = false;

                // Check if character is a member
                if (household.members) {
                    for (var j = 0; j < household.members.length; j++) {
                        if (household.members[j].characterId === characterId) {
                            isMember = true;
                            if (household.members[j].isHead) {
                                isHead = true;
                            }
                            break;
                        }
                    }
                }

                if (!isMember) continue;

                // If character is head, process succession
                if (isHead) {
                    if (autoTransfer) {
                        var heirs = getHouseholdHeirs(household.id, characterId);
                        if (heirs.length > 0) {
                            var heir = heirs[0].character;
                            var transferResult = transferHouseholdToHeir(household.id, heir.id, {
                                year: currentYear,
                                recordHistory: recordHistory
                            });

                            results.push({
                                household: household.name,
                                heir: heir.name,
                                success: transferResult.success,
                                reason: transferResult.success ? 'Succession complete' : transferResult.reason,
                                householdId: household.id,
                                heirId: heir.id
                            });
                        } else {
                            // No eligible heirs - mark as abandoned
                            _state.updateHousehold(household.id, {
                                status: 'abandoned',
                                abandonedYear: currentYear
                            }, { recordHistory: false });

                            results.push({
                                household: household.name,
                                heir: null,
                                success: false,
                                reason: 'No eligible heirs found - household abandoned',
                                householdId: household.id,
                                abandoned: true
                            });
                        }
                    } else {
                        results.push({
                            household: household.name,
                            heir: null,
                            success: false,
                            reason: 'Auto-transfer disabled - manual intervention required',
                            householdId: household.id,
                            requiresManualAction: true
                        });
                    }
                } else {
                    // Character is a member but not head - just remove them
                    if (recordHistory) {
                        recordHouseholdChange(characterId, household.id, currentYear, 'left',
                            'Died while member of household',
                            { previousHouseholdId: household.id, previousHouseholdName: household.name });
                    }

                    results.push({
                        household: household.name,
                        success: true,
                        reason: 'Member removed from household',
                        householdId: household.id,
                        action: 'member_removed'
                    });
                }
            }

            return results;

        } finally {
            _processingAssignment = false;
        }
    }

    // =========================================================================
    // 8. HOUSEHOLD HEIRS
    // =========================================================================

    /**
     * Get eligible heirs for a household
     * @param {string} householdId - Household ID
     * @param {string} deceasedId - Deceased character ID (exclude from heirs)
     * @param {Object} options - Options
     * @param {boolean} options.includeExternal - Include external candidates (default: true)
     * @param {number} options.maxAge - Maximum age for heirs (default: 100)
     * @param {number} options.minAge - Minimum age for heirs (default: 0)
     * @returns {Array} Array of heir candidates
     */
    function getHouseholdHeirs(householdId, deceasedId, options) {
        if (_processingAssignment) {
            return [];
        }
        _processingAssignment = true;

        try {
            options = options || {};
            var includeExternal = options.includeExternal !== false;
            var maxAge = options.maxAge || 100;
            var minAge = options.minAge || 0;

            var household = _state.getHousehold(householdId);
            if (!household) return [];

            var familyMembers = [];
            var allCharacters = _getCharacters();
            var charMap = {};
            for (var i = 0; i < allCharacters.length; i++) {
                charMap[allCharacters[i].id] = allCharacters[i];
            }

            // First, check family members in the household
            if (household.members) {
                for (var i = 0; i < household.members.length; i++) {
                    var member = household.members[i];
                    if (member.type !== 'family') continue;
                    if (member.characterId === deceasedId) continue;

                    var character = charMap[member.characterId];
                    if (!character) continue;
                    if (character.isDeceased) continue;

                    var age = _calculateAge(character.birthYear, false, null);
                    if (age < minAge || age > maxAge) continue;

                    familyMembers.push({
                        character: character,
                        member: member,
                        priority: 1,
                        source: 'household_member'
                    });
                }
            }

            // If no eligible members, check children (external)
            if (familyMembers.length === 0 && includeExternal) {
                var children = _getChildren(deceasedId);
                for (var i = 0; i < children.length; i++) {
                    var child = children[i];
                    if (child.isDeceased) continue;

                    var age = _calculateAge(child.birthYear, false, null);
                    if (age < minAge || age > maxAge) continue;

                    // Check if child is already in a different household
                    var childHousehold = _state.getCharacterHousehold(child.id);
                    if (childHousehold && childHousehold.id !== householdId) {
                        familyMembers.push({
                            character: child,
                            member: null,
                            priority: 2,
                            source: 'external_child',
                            household: childHousehold
                        });
                    } else if (!childHousehold) {
                        familyMembers.push({
                            character: child,
                            member: null,
                            priority: 3,
                            source: 'unattached_child'
                        });
                    }
                }
            }

            // Sort by priority, then age (oldest first)
            familyMembers.sort(function(a, b) {
                if (a.priority !== b.priority) return a.priority - b.priority;
                var ageA = _calculateAge(a.character.birthYear, false, null);
                var ageB = _calculateAge(b.character.birthYear, false, null);
                return ageB - ageA;
            });

            return familyMembers;

        } finally {
            _processingAssignment = false;
        }
    }

    // =========================================================================
    // 9. TRANSFER HOUSEHOLD TO HEIR
    // =========================================================================

    /**
     * Transfer a household to an heir
     * @param {string} householdId - Household ID
     * @param {string} heirId - Heir character ID
     * @param {Object} options - Options
     * @param {number} options.year - Year of succession (defaults to current)
     * @param {boolean} options.recordHistory - Record in character history (default: true)
     * @param {string} options.role - Role for heir (defaults to 'Head of Household')
     * @returns {Object} Result object
     */
    function transferHouseholdToHeir(householdId, heirId, options) {
        if (_processingAssignment) {
            return { success: false, reason: 'Already processing an assignment' };
        }
        _processingAssignment = true;

        try {
            options = options || {};

            var household = _state.getHousehold(householdId);
            if (!household) {
                return { success: false, reason: 'Household not found' };
            }

            var heir = _getCharacterById(heirId);
            if (!heir) {
                return { success: false, reason: 'Heir not found' };
            }

            if (heir.isDeceased) {
                return { success: false, reason: 'Heir is deceased' };
            }

            var currentYear = options.year || _getCurrentYear();
            var recordHistory = options.recordHistory !== false;
            var role = options.role || 'Head of Household';

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

            // If not a member, add them
            if (!isMember) {
                var addResult = _commands.addMember(householdId, heirId, 'family', {
                    role: role,
                    joinedYear: currentYear,
                    isHead: true,
                    notes: 'Inherited household through succession',
                    recordHistory: recordHistory
                });

                if (!addResult || !addResult.success) {
                    return { success: false, reason: 'Failed to add heir to household' };
                }
            } else {
                // Set as head
                var headResult = _commands.setHead(householdId, heirId, {
                    year: currentYear,
                    reason: 'Inheritance',
                    recordHistory: recordHistory
                });

                if (!headResult || !headResult.success) {
                    return { success: false, reason: 'Failed to set heir as head' };
                }

                // Update role
                _commands.updateMember(householdId, heirId, {
                    role: role,
                    isHead: true
                }, { recordHistory: recordHistory });
            }

            // Record history
            if (recordHistory) {
                recordHouseholdChange(heirId, householdId, currentYear, 'inherited',
                    'Inherited household ' + household.name,
                    { newRole: role, isHead: true });
            }

            // Add activity log
            if (typeof _commands.addActivityLog === 'function') {
                _commands.addActivityLog(householdId, 'inherited',
                    (heir.name + ' ' + (heir.surname || '')).trim() + ' inherited household',
                    heirId);
            }

            _logEvent('household', 'Household Inherited',
                (heir.name + ' ' + (heir.surname || '')).trim() + ' inherited ' + household.name,
                [heir]);

            return {
                success: true,
                household: household,
                heir: heir,
                year: currentYear,
                isNewMember: !isMember
            };

        } finally {
            _processingAssignment = false;
        }
    }

    // =========================================================================
    // 10. TRANSFER CHARACTER TO HOUSEHOLD
    // =========================================================================

    /**
     * Transfer a character from one household to another
     * @param {string} characterId - Character ID
     * @param {string} targetHouseholdId - Target household ID
     * @param {Object} options - Options
     * @param {number} options.year - Transfer year (defaults to current)
     * @param {string} options.reason - Transfer reason
     * @param {string} options.role - New role (defaults to existing)
     * @param {string} options.type - New type (defaults to existing)
     * @param {string} options.departmentId - New department ID
     * @param {boolean} options.isHead - Whether to make head
     * @param {boolean} options.recordHistory - Record in character history (default: true)
     * @param {string} options.notes - Notes
     * @returns {Object} Result object
     */
    function transferCharacterToHousehold(characterId, targetHouseholdId, options) {
        if (_processingAssignment) {
            return { success: false, reason: 'Already processing an assignment' };
        }
        _processingAssignment = true;

        try {
            options = options || {};

            var character = _getCharacterById(characterId);
            if (!character) {
                return { success: false, reason: 'Character not found' };
            }

            if (character.isDeceased) {
                return { success: false, reason: 'Cannot transfer deceased character' };
            }

            var targetHousehold = _state.getHousehold(targetHouseholdId);
            if (!targetHousehold) {
                return { success: false, reason: 'Target household not found' };
            }

            var currentHousehold = _state.getCharacterHousehold(characterId);
            var year = options.year || _getCurrentYear();
            var reason = options.reason || 'Transferred';
            var recordHistory = options.recordHistory !== false;

            // If already in target
            if (currentHousehold && currentHousehold.id === targetHouseholdId) {
                return { success: false, reason: 'Character is already in this household' };
            }

            // Get existing member data
            var existingMember = null;
            var currentMemberData = {};

            if (currentHousehold && currentHousehold.members) {
                for (var i = 0; i < currentHousehold.members.length; i++) {
                    if (currentHousehold.members[i].characterId === characterId) {
                        existingMember = currentHousehold.members[i];
                        currentMemberData = {
                            type: existingMember.type,
                            role: existingMember.role,
                            joinedYear: existingMember.joinedYear,
                            departmentId: existingMember.departmentId,
                            isHead: existingMember.isHead
                        };
                        break;
                    }
                }
            }

            // Remove from current household
            if (currentHousehold) {
                var removeResult = _commands.removeMember(currentHousehold.id, characterId, {
                    reason: 'Transferred to ' + targetHousehold.name + ': ' + reason,
                    leftYear: year,
                    recordHistory: recordHistory
                });

                if (!removeResult || !removeResult.success) {
                    return { success: false, reason: 'Failed to remove from current household: ' + removeResult.reason };
                }
            }

            // Add to target household
            var memberType = options.type || (existingMember ? existingMember.type : 'family');
            var memberRole = options.role || (existingMember ? existingMember.role : 'Family Member');
            var isHead = options.isHead || false;

            var addResult = _commands.addMember(targetHouseholdId, characterId, memberType, {
                role: memberRole,
                joinedYear: year,
                isHead: isHead,
                departmentId: options.departmentId || null,
                notes: options.notes || 'Transferred from ' + (currentHousehold ? currentHousehold.name : 'unknown'),
                recordHistory: recordHistory
            });

            if (!addResult || !addResult.success) {
                // Rollback: add back to original household
                if (currentHousehold && existingMember) {
                    _commands.addMember(currentHousehold.id, characterId, currentMemberData.type || 'family', {
                        role: currentMemberData.role || 'Family Member',
                        joinedYear: currentMemberData.joinedYear || year,
                        isHead: currentMemberData.isHead || false,
                        departmentId: currentMemberData.departmentId || null,
                        notes: 'Rollback from transfer to ' + targetHousehold.name,
                        recordHistory: false
                    });
                }
                return { success: false, reason: 'Failed to add to target household: ' + addResult.reason };
            }

            // Record history
            if (recordHistory) {
                recordHouseholdChange(characterId, targetHouseholdId, year, 'joined',
                    'Transferred from ' + (currentHousehold ? currentHousehold.name : 'unknown') + ' to ' + targetHousehold.name,
                    { newRole: memberRole, isHead: isHead });
            }

            // Add activity logs
            if (typeof _commands.addActivityLog === 'function') {
                if (currentHousehold) {
                    _commands.addActivityLog(currentHousehold.id, 'member_transferred_out',
                        (character.name + ' ' + (character.surname || '')).trim() + ' transferred to ' + targetHousehold.name + ': ' + reason,
                        characterId);
                }
                _commands.addActivityLog(targetHouseholdId, 'member_transferred_in',
                    (character.name + ' ' + (character.surname || '')).trim() + ' transferred from ' + (currentHousehold ? currentHousehold.name : 'None') + ': ' + reason,
                    characterId);
            }

            _logEvent('household', 'Member Transferred',
                (character.name + ' ' + (character.surname || '')).trim() + ' transferred from ' + (currentHousehold ? currentHousehold.name : 'None') + ' to ' + targetHousehold.name,
                [character]);

            return {
                success: true,
                character: character,
                fromHousehold: currentHousehold,
                toHousehold: targetHousehold,
                year: year,
                reason: reason
            };

        } finally {
            _processingAssignment = false;
        }
    }

    // =========================================================================
    // 11. CREATE CADET BRANCH
    // =========================================================================

    /**
     * Create a cadet branch from an existing household
     * @param {string} householdId - Parent household ID
     * @param {string} newHouseholdName - Name for the cadet branch
     * @param {Array} memberIds - Array of character IDs to transfer
     * @param {Object} options - Options
     * @param {string} options.headId - Character ID for the new head (defaults to first member)
     * @param {number} options.year - Year of creation (defaults to current)
     * @param {string} options.reason - Reason for creation
     * @param {string} options.notes - Notes
     * @param {string} options.locationId - Location for new household (defaults to parent)
     * @param {boolean} options.recordHistory - Record in character history (default: true)
     * @param {string} options.residenceId - Residence to assign
     * @param {number} options.unitNumber - Unit number in residence
     * @returns {Object} Result object
     */
    function createCadetBranch(householdId, newHouseholdName, memberIds, options) {
        if (_processingAssignment) {
            return { success: false, reason: 'Already processing an assignment' };
        }
        _processingAssignment = true;

        try {
            options = options || {};

            var household = _state.getHousehold(householdId);
            if (!household) {
                return { success: false, reason: 'Parent household not found' };
            }

            if (!newHouseholdName || newHouseholdName.trim() === '') {
                return { success: false, reason: 'New household name is required' };
            }

            if (!memberIds || memberIds.length === 0) {
                return { success: false, reason: 'At least one member is required' };
            }

            var year = options.year || _getCurrentYear();
            var reason = options.reason || 'Cadet branch established';
            var recordHistory = options.recordHistory !== false;
            var headId = options.headId || memberIds[0];

            // Validate members
            var validMembers = [];
            if (household.members) {
                for (var i = 0; i < memberIds.length; i++) {
                    for (var j = 0; j < household.members.length; j++) {
                        if (household.members[j].characterId === memberIds[i]) {
                            validMembers.push(household.members[j]);
                            break;
                        }
                    }
                }
            }

            if (validMembers.length === 0) {
                return { success: false, reason: 'No valid members to transfer' };
            }

            // Create new household
            var locationId = options.locationId || household.locationId;
            var newHousehold = _state.createHousehold(newHouseholdName, locationId, {
                foundedYear: year,
                notes: options.notes || 'Cadet branch of ' + household.name,
                reputation: Math.max(1, (household.reputation || 50) - 10),
                founderId: headId
            });

            if (!newHousehold) {
                return { success: false, reason: 'Failed to create cadet branch' };
            }

            // Transfer members
            var transferred = 0;
            for (var i = 0; i < validMembers.length; i++) {
                var member = validMembers[i];
                var character = _getCharacterById(member.characterId);
                if (!character) continue;

                var isHead = (headId === character.id);

                // Remove from parent
                _commands.removeMember(householdId, character.id, {
                    reason: 'Left to join cadet branch ' + newHousehold.name,
                    leftYear: year,
                    recordHistory: recordHistory
                });

                // Add to new household
                _commands.addMember(newHousehold.id, character.id, member.type, {
                    role: isHead ? 'Head of Household' : (member.role || 'Family Member'),
                    joinedYear: year,
                    isHead: isHead,
                    notes: 'Transferred to cadet branch',
                    recordHistory: recordHistory
                });

                // Record history
                if (recordHistory) {
                    recordHouseholdChange(character.id, newHousehold.id, year, 'joined',
                        'Joined cadet branch ' + newHousehold.name,
                        { newRole: isHead ? 'Head of Household' : 'Family Member' });
                }

                transferred++;
            }

            // Add activity logs
            if (typeof _commands.addActivityLog === 'function') {
                _commands.addActivityLog(householdId, 'cadet_branch_created',
                    'Created cadet branch ' + newHousehold.name + ' with ' + transferred + ' members');

                _commands.addActivityLog(newHousehold.id, 'cadet_branch_established',
                    'Established as cadet branch of ' + household.name + ' with ' + transferred + ' members');
            }

            // Assign to residence if specified
            if (options.residenceId && options.unitNumber) {
                if (typeof window.ResidenceCommands !== 'undefined' && 
                    typeof window.ResidenceCommands.assignHouseholdToUnit === 'function') {
                    window.ResidenceCommands.assignHouseholdToUnit(
                        options.residenceId,
                        options.unitNumber,
                        newHousehold.id,
                        newHousehold.name,
                        year,
                        { notes: 'Cadet branch assigned to unit', reason: 'cadet_branch' }
                    );
                }
            }

            _logEvent('household', 'Cadet Branch Created',
                'Cadet branch ' + newHousehold.name + ' created from ' + household.name + ' with ' + transferred + ' members',
                []);

            return {
                success: true,
                newHousehold: newHousehold,
                parentHousehold: household,
                transferred: transferred,
                year: year,
                headId: headId
            };

        } finally {
            _processingAssignment = false;
        }
    }

    // =========================================================================
    // 12. MERGE HOUSEHOLDS
    // =========================================================================

    /**
     * Merge two households into one
     * @param {string} householdId1 - First household ID
     * @param {string} householdId2 - Second household ID
     * @param {string} survivingHouseholdId - ID of the household that survives
     * @param {Object} options - Options
     * @param {number} options.mergeYear - Year of merge (defaults to current)
     * @param {string} options.reason - Merge reason
     * @param {boolean} options.recordHistory - Record in character history (default: true)
     * @param {string} options.newHeadId - New head ID (optional)
     * @returns {Object} Result object
     */
    function mergeHouseholds(householdId1, householdId2, survivingHouseholdId, options) {
        if (_processingAssignment) {
            return { success: false, reason: 'Already processing an assignment' };
        }
        _processingAssignment = true;

        try {
            options = options || {};

            var h1 = _state.getHousehold(householdId1);
            var h2 = _state.getHousehold(householdId2);
            var survivor = _state.getHousehold(survivingHouseholdId);

            if (!h1 || !h2 || !survivor) {
                return { success: false, reason: 'One or more households not found' };
            }

            if (survivingHouseholdId !== householdId1 && survivingHouseholdId !== householdId2) {
                return { success: false, reason: 'Survivor must be one of the merging households' };
            }

            var mergedId = (survivingHouseholdId === householdId1) ? householdId2 : householdId1;
            var merged = (survivingHouseholdId === householdId1) ? h2 : h1;
            var year = options.mergeYear || _getCurrentYear();
            var reason = options.reason || 'Household merge';
            var recordHistory = options.recordHistory !== false;

            // Transfer all members from merged to survivor
            var transferred = 0;
            if (merged.members) {
                var membersToTransfer = merged.members.slice();
                for (var i = 0; i < membersToTransfer.length; i++) {
                    var member = membersToTransfer[i];
                    var character = _getCharacterById(member.characterId);
                    if (!character) continue;

                    // Remove from merged
                    _commands.removeMember(merged.id, character.id, {
                        reason: 'Merged into ' + survivor.name,
                        leftYear: year,
                        recordHistory: recordHistory
                    });

                    // Add to survivor
                    var isHead = (options.newHeadId && options.newHeadId === character.id) || false;
                    _commands.addMember(survivor.id, character.id, member.type, {
                        role: isHead ? 'Head of Household' : (member.role || 'Family Member'),
                        joinedYear: year,
                        isHead: isHead,
                        notes: 'Merged from ' + merged.name,
                        recordHistory: recordHistory
                    });

                    if (recordHistory) {
                        recordHouseholdChange(character.id, survivor.id, year, 'joined',
                            'Joined through household merge: ' + reason,
                            { newRole: member.role || 'Family Member' });
                    }

                    transferred++;
                }
            }

            // Set new head if specified
            if (options.newHeadId) {
                _commands.setHead(survivor.id, options.newHeadId, {
                    year: year,
                    reason: 'Merge: ' + reason,
                    recordHistory: recordHistory
                });
            }

            // Merge wealth and reputation
            var survivorWealth = survivor.wealth || 0;
            var mergedWealth = merged.wealth || 0;
            var newWealth = survivorWealth + mergedWealth;

            _state.updateHousehold(survivor.id, {
                wealth: newWealth,
                reputation: Math.min(100, ((survivor.reputation || 50) + (merged.reputation || 50)) / 2)
            }, { recordHistory: false });

            // Delete merged household
            _state.deleteHousehold(merged.id, { force: true });

            // Add activity logs
            if (typeof _commands.addActivityLog === 'function') {
                _commands.addActivityLog(survivor.id, 'merged_with',
                    'Merged with ' + merged.name + ' (' + transferred + ' members)');
            }

            _logEvent('household', 'Households Merged',
                survivor.name + ' merged with ' + merged.name + ' (' + transferred + ' members)',
                []);

            return {
                success: true,
                survivor: survivor,
                merged: merged,
                transferred: transferred,
                year: year
            };

        } finally {
            _processingAssignment = false;
        }
    }

    // =========================================================================
    // 13. SPLIT HOUSEHOLD
    // =========================================================================

    /**
     * Split a household into two
     * @param {string} householdId - Household ID
     * @param {string} newHouseholdName - Name for the new household
     * @param {Array} memberIds - Array of character IDs to transfer
     * @param {Object} options - Options
     * @param {string} options.newHeadId - Character ID for the new head (defaults to first member)
     * @param {number} options.splitYear - Year of split (defaults to current)
     * @param {string} options.reason - Split reason
     * @param {string} options.notes - Notes
     * @param {string} options.locationId - Location for new household (defaults to parent)
     * @param {boolean} options.recordHistory - Record in character history (default: true)
     * @param {string} options.residenceId - Residence to assign
     * @param {number} options.unitNumber - Unit number in residence
     * @param {number} options.newWealth - Wealth for new household
     * @param {number} options.newReputation - Reputation for new household
     * @returns {Object} Result object
     */
    function splitHousehold(householdId, newHouseholdName, memberIds, options) {
        if (_processingAssignment) {
            return { success: false, reason: 'Already processing an assignment' };
        }
        _processingAssignment = true;

        try {
            options = options || {};

            var household = _state.getHousehold(householdId);
            if (!household) {
                return { success: false, reason: 'Household not found' };
            }

            if (!newHouseholdName || newHouseholdName.trim() === '') {
                return { success: false, reason: 'New household name is required' };
            }

            if (!memberIds || memberIds.length === 0) {
                return { success: false, reason: 'At least one member is required' };
            }

            var year = options.splitYear || _getCurrentYear();
            var reason = options.reason || 'Household split';
            var recordHistory = options.recordHistory !== false;
            var headId = options.newHeadId || memberIds[0];

            // Validate members
            var validMembers = [];
            if (household.members) {
                for (var i = 0; i < memberIds.length; i++) {
                    for (var j = 0; j < household.members.length; j++) {
                        if (household.members[j].characterId === memberIds[i]) {
                            validMembers.push(household.members[j]);
                            break;
                        }
                    }
                }
            }

            if (validMembers.length === 0) {
                return { success: false, reason: 'No valid members to transfer' };
            }

            // Create new household
            var locationId = options.locationId || household.locationId;
            var newHousehold = _state.createHousehold(newHouseholdName, locationId, {
                foundedYear: year,
                notes: options.notes || 'Split from ' + household.name,
                reputation: options.newReputation || Math.max(1, (household.reputation || 50) - 5),
                wealth: options.newWealth || Math.floor((household.wealth || 0) * 0.3),
                founderId: headId
            });

            if (!newHousehold) {
                return { success: false, reason: 'Failed to create split household' };
            }

            // Transfer members
            var transferred = 0;
            for (var i = 0; i < validMembers.length; i++) {
                var member = validMembers[i];
                var character = _getCharacterById(member.characterId);
                if (!character) continue;

                var isHead = (headId === character.id);

                // Remove from parent
                _commands.removeMember(householdId, character.id, {
                    reason: 'Left to join split household: ' + reason,
                    leftYear: year,
                    recordHistory: recordHistory
                });

                // Add to new household
                _commands.addMember(newHousehold.id, character.id, member.type, {
                    role: isHead ? 'Head of Household' : (member.role || 'Family Member'),
                    joinedYear: year,
                    isHead: isHead,
                    notes: 'Transferred to split household',
                    recordHistory: recordHistory
                });

                if (recordHistory) {
                    recordHouseholdChange(character.id, newHousehold.id, year, 'joined',
                        'Joined split household ' + newHousehold.name,
                        { newRole: isHead ? 'Head of Household' : 'Family Member' });
                }

                transferred++;
            }

            // Reduce parent wealth
            if (options.newWealth) {
                var parentWealth = household.wealth || 0;
                _state.updateHousehold(householdId, {
                    wealth: Math.max(0, parentWealth - options.newWealth)
                }, { recordHistory: false });
            }

            // Add activity logs
            if (typeof _commands.addActivityLog === 'function') {
                _commands.addActivityLog(householdId, 'split',
                    'Household split - created ' + newHousehold.name + ' with ' + transferred + ' members');

                _commands.addActivityLog(newHousehold.id, 'created_by_split',
                    'Created by split from ' + household.name + ' with ' + transferred + ' members');
            }

            // Assign to residence if specified
            if (options.residenceId && options.unitNumber) {
                if (typeof window.ResidenceCommands !== 'undefined' && 
                    typeof window.ResidenceCommands.assignHouseholdToUnit === 'function') {
                    window.ResidenceCommands.assignHouseholdToUnit(
                        options.residenceId,
                        options.unitNumber,
                        newHousehold.id,
                        newHousehold.name,
                        year,
                        { notes: 'Split household assigned to unit', reason: 'household_split' }
                    );
                }
            }

            _logEvent('household', 'Household Split',
                household.name + ' split - created ' + newHousehold.name + ' with ' + transferred + ' members',
                []);

            return {
                success: true,
                newHousehold: newHousehold,
                parentHousehold: household,
                transferred: transferred,
                year: year,
                headId: headId
            };

        } finally {
            _processingAssignment = false;
        }
    }

    // =========================================================================
    // 14. AUTO-ASSIGN HOUSEHOLD HEAD
    // =========================================================================

    /**
     * Auto-assign a new head when the current head dies
     * @param {string} householdId - Household ID
     * @param {string} deceasedId - Deceased character ID
     * @param {Object} options - Options
     * @param {number} options.successionYear - Year of succession (defaults to current)
     * @param {boolean} options.recordHistory - Record in character history (default: true)
     * @param {boolean} options.skipIfOnlyMember - Skip if only one member remains (default: false)
     * @returns {Object} Result object
     */
    function autoAssignHouseholdHead(householdId, deceasedId, options) {
        if (_processingAssignment) {
            return { success: false, reason: 'Already processing an assignment' };
        }
        _processingAssignment = true;

        try {
            options = options || {};

            var household = _state.getHousehold(householdId);
            if (!household) {
                return { success: false, reason: 'Household not found' };
            }

            var currentYear = options.successionYear || _getCurrentYear();

            // Get living family members (excluding deceased)
            var familyMembers = [];
            if (household.members) {
                for (var i = 0; i < household.members.length; i++) {
                    var member = household.members[i];
                    if (member.type !== 'family') continue;
                    if (member.characterId === deceasedId) continue;

                    var character = _getCharacterById(member.characterId);
                    if (!character) continue;
                    if (character.isDeceased) continue;

                    familyMembers.push({
                        character: character,
                        member: member
                    });
                }
            }

            if (familyMembers.length === 0) {
                // No living family members - household becomes abandoned
                _state.updateHousehold(householdId, {
                    status: 'abandoned',
                    abandonedYear: currentYear
                }, { recordHistory: false });

                if (typeof _commands.addActivityLog === 'function') {
                    _commands.addActivityLog(householdId, 'abandoned',
                        'Household abandoned - no living family members to inherit');
                }

                _logEvent('household', 'Succession Failed',
                    household.name + ' has no living family members to inherit - household abandoned',
                    []);

                return {
                    success: false,
                    reason: 'No living family members - household abandoned',
                    abandoned: true,
                    abandonedYear: currentYear
                };
            }

            // Skip if only one member remains
            if (options.skipIfOnlyMember && familyMembers.length === 1) {
                return {
                    success: false,
                    reason: 'Only one member remains - skipping auto-assignment'
                };
            }

            // Sort by age (oldest first)
            familyMembers.sort(function(a, b) {
                var ageA = _calculateAge(a.character.birthYear, false, null);
                var ageB = _calculateAge(b.character.birthYear, false, null);
                return ageB - ageA;
            });

            var newHead = familyMembers[0];
            var headResult = _commands.setHead(householdId, newHead.character.id, {
                year: currentYear,
                reason: 'Succession',
                recordHistory: options.recordHistory !== false
            });

            if (!headResult || !headResult.success) {
                return { success: false, reason: 'Failed to assign new head' };
            }

            if (typeof _commands.addActivityLog === 'function') {
                _commands.addActivityLog(householdId, 'head_succession',
                    (newHead.character.name + ' ' + (newHead.character.surname || '')).trim() + ' became head through succession' +
                    (deceasedId ? ' (replacing ' + (_getCharacterById(deceasedId) ? _getCharacterById(deceasedId).name : 'deceased member') + ')' : ''),
                    newHead.character.id);
            }

            _logEvent('household', 'Head Succession',
                (newHead.character.name + ' ' + (newHead.character.surname || '')).trim() + ' became head of ' + household.name + ' through succession',
                [newHead.character]);

            return {
                success: true,
                newHead: newHead.character,
                newHeadName: (newHead.character.name + ' ' + (newHead.character.surname || '')).trim(),
                year: currentYear,
                household: household.name
            };

        } finally {
            _processingAssignment = false;
        }
    }

    // =========================================================================
    // 15. EXPORTS
    // =========================================================================

    window.HouseholdAssignment = {
        // Newborn
        assignNewbornToHousehold: assignNewbornToHousehold,

        // Spouse
        assignToSpouseHousehold: assignToSpouseHousehold,

        // Inheritance
        processHouseholdInheritanceOnDeath: processHouseholdInheritanceOnDeath,
        getHouseholdHeirs: getHouseholdHeirs,
        transferHouseholdToHeir: transferHouseholdToHeir,

        // Transfers
        transferCharacterToHousehold: transferCharacterToHousehold,

        // Household management
        createCadetBranch: createCadetBranch,
        mergeHouseholds: mergeHouseholds,
        splitHousehold: splitHousehold,

        // Head succession
        autoAssignHouseholdHead: autoAssignHouseholdHead,

        // History
        recordHouseholdChange: recordHouseholdChange
    };

    // Legacy aliases for backward compatibility
    window.assignNewbornToHousehold = assignNewbornToHousehold;
    window.assignToSpouseHousehold = assignToSpouseHousehold;
    window.processHouseholdInheritanceOnDeath = processHouseholdInheritanceOnDeath;
    window.getHouseholdHeirs = getHouseholdHeirs;
    window.transferHouseholdToHeir = transferHouseholdToHeir;
    window.transferCharacterToHousehold = transferCharacterToHousehold;
    window.createCadetBranch = createCadetBranch;
    window.mergeHouseholds = mergeHouseholds;
    window.splitHousehold = splitHousehold;
    window.autoAssignHouseholdHead = autoAssignHouseholdHead;
    window.recordHouseholdChange = recordHouseholdChange;

    // ES Module exports
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            assignNewbornToHousehold: assignNewbornToHousehold,
            assignToSpouseHousehold: assignToSpouseHousehold,
            processHouseholdInheritanceOnDeath: processHouseholdInheritanceOnDeath,
            getHouseholdHeirs: getHouseholdHeirs,
            transferHouseholdToHeir: transferHouseholdToHeir,
            transferCharacterToHousehold: transferCharacterToHousehold,
            createCadetBranch: createCadetBranch,
            mergeHouseholds: mergeHouseholds,
            splitHousehold: splitHousehold,
            autoAssignHouseholdHead: autoAssignHouseholdHead,
            recordHouseholdChange: recordHouseholdChange
        };
    }

})();