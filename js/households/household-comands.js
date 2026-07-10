/**
 * =============================================================================
 * HOUSEHOLD COMMANDS (household-commands.js)
 * =============================================================================
 * 
 * PURPOSE: All write operations for households (member management, transfers,
 *          department management, succession). Separates business logic from
 *          UI and data access.
 * 
 * DEPENDS ON:
 *   - household-state.js (HouseholdState)
 *   - accessors.js (for getCharacterById, getCharacters, getCurrentYear)
 *   - storage.js (for saveMasterData)
 * 
 * EXPORTS:
 *   - HouseholdCommands.addMember()         - Add member to household
 *   - HouseholdCommands.removeMember()      - Remove member from household
 *   - HouseholdCommands.updateMember()      - Update member role/type
 *   - HouseholdCommands.transferMember()    - Transfer member between households
 *   - HouseholdCommands.setHead()           - Set household head
 *   - HouseholdCommands.addDepartment()     - Add department
 *   - HouseholdCommands.removeDepartment()  - Remove department
 *   - HouseholdCommands.updateDepartment()  - Update department
 *   - HouseholdCommands.setDepartmentHead() - Set department head
 *   - HouseholdCommands.recordHistory()     - Record household change in history
 *   - HouseholdCommands.repairMemberships() - Fix broken member references
 *   - HouseholdCommands.fixCharacterHousehold() - Fix single character membership
 * 
 * FEATURES RETAINED:
 *   - All member management operations
 *   - Department management
 *   - Head of household management
 *   - History recording
 *   - Member transfer between households
 *   - Repair functions for data consistency
 *   - Validation and error handling
 *   - Activity logging
 *   - Event logging
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. RECURSION GUARD
    // =========================================================================

    var _processingCommand = false;
    var _recordingHistory = false;

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getCurrentYear() {
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

    function _getPlaceById(id) {
        if (typeof window.getPlaceById === 'function') {
            return window.getPlaceById(id);
        }
        return null;
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
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        } else if (typeof window.showToastMessage === 'function') {
            window.showToastMessage(message, type);
        }
    }

    function _escapeHtml(str) {
        if (typeof window.escapeHtml === 'function') {
            return window.escapeHtml(str);
        }
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // =========================================================================
    // 2. HOUSEHOLD STATE REFERENCE
    // =========================================================================

    var _state = window.HouseholdState;

    // =========================================================================
    // 3. INTERNAL HELPERS
    // =========================================================================

    /**
     * Generates a unique ID
     * @private
     */
    function _generateId(prefix) {
        if (typeof window.generateId === 'function') {
            return window.generateId(prefix);
        }
        return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    }

    /**
     * Logs an activity event for a household
     * @private
     */
    function _addActivityLog(householdId, action, details, actorId) {
        var household = _state.getHousehold(householdId);
        if (!household) return false;
        
        if (!household.activityLog) {
            household.activityLog = [];
        }
        
        household.activityLog.push({
            year: _getCurrentYear(),
            action: action,
            details: details,
            actorId: actorId || null,
            timestamp: Date.now()
        });
        
        // Trim log to 100 entries
        if (household.activityLog.length > 100) {
            household.activityLog = household.activityLog.slice(-100);
        }
        
        // Save via state
        _state.updateHousehold(householdId, {
            activityLog: household.activityLog
        }, { recordHistory: false });
        
        return true;
    }

    /**
     * Records a household change in a character's history
     * @private
     */
    function _recordCharacterHouseholdChange(characterId, householdId, year, action, reason, options) {
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

    /**
     * Validates a character can be added to a household
     * @private
     */
    function _validateMemberAddition(householdId, characterId, type) {
        var household = _state.getHousehold(householdId);
        if (!household) {
            return { valid: false, reason: 'Household not found' };
        }
        
        var character = _getCharacterById(characterId);
        if (!character) {
            return { valid: false, reason: 'Character not found' };
        }
        
        // Check if already a member
        if (household.members) {
            for (var i = 0; i < household.members.length; i++) {
                if (household.members[i].characterId === characterId) {
                    return { valid: false, reason: 'Character is already a member' };
                }
            }
        }
        
        if (type !== 'family' && type !== 'staff') {
            return { valid: false, reason: 'Invalid member type' };
        }
        
        return { valid: true, reason: '' };
    }

    /**
     * Updates household status based on members
     * @private
     */
    function _updateHouseholdStatus(householdId) {
        var household = _state.getHousehold(householdId);
        if (!household) return;
        
        var status = _state.getHouseholdStatus(householdId);
        if (status.status !== household.status) {
            _state.updateHousehold(householdId, {
                status: status.status
            }, { recordHistory: false });
        }
    }

    // =========================================================================
    // 4. MEMBER MANAGEMENT
    // =========================================================================

    /**
     * Adds a member to a household
     * @param {string} householdId - Household ID
     * @param {string} characterId - Character ID
     * @param {string} type - 'family' or 'staff'
     * @param {Object} options - Options
     * @param {string} options.role - Role/title
     * @param {number} options.joinedYear - Year joined (defaults to current)
     * @param {boolean} options.isHead - Whether this member is head
     * @param {string} options.departmentId - Department ID
     * @param {string} options.notes - Notes
     * @param {boolean} options.recordHistory - Record in character history (default: true)
     * @returns {Object} Result object
     */
    function addMember(householdId, characterId, type, options) {
        if (_processingCommand) {
            return { success: false, reason: 'Command already in progress' };
        }
        _processingCommand = true;
        
        try {
            options = options || {};
            
            // Validate
            var validation = _validateMemberAddition(householdId, characterId, type);
            if (!validation.valid) {
                return { success: false, reason: validation.reason };
            }
            
            var household = _state.getHousehold(householdId);
            var character = _getCharacterById(characterId);
            var joinedYear = options.joinedYear || _getCurrentYear();
            var role = options.role || (type === 'family' ? 'Family Member' : 'Staff');
            var isHead = options.isHead || false;
            
            // Create member object
            var member = {
                characterId: characterId,
                characterName: (character.name || '') + (character.surname ? ' ' + character.surname : ''),
                type: type,
                departmentId: options.departmentId || null,
                role: role,
                isHead: isHead,
                joinedYear: joinedYear,
                headSince: isHead ? joinedYear : null,
                notes: options.notes || ''
            };
            
            // Add to household
            if (!household.members) {
                household.members = [];
            }
            household.members.push(member);
            
            // Update household
            var updates = {
                members: household.members,
                updatedAt: Date.now()
            };
            
            _state.updateHousehold(householdId, updates, { recordHistory: false });
            
            // If this is a head, remove head status from other members
            if (isHead) {
                for (var i = 0; i < household.members.length; i++) {
                    if (household.members[i].characterId !== characterId && household.members[i].isHead) {
                        household.members[i].isHead = false;
                        household.members[i].headSince = null;
                    }
                }
                _state.updateHousehold(householdId, { members: household.members }, { recordHistory: false });
            }
            
            // Record in character history
            if (options.recordHistory !== false) {
                _recordCharacterHouseholdChange(characterId, householdId, joinedYear, 'joined',
                    options.notes || 'Added to household as ' + type + (role ? ' (' + role + ')' : ''),
                    { newRole: role, isHead: isHead });
            }
            
            // Update character's household reference
            if (character) {
                character.household = householdId;
                character.householdId = householdId;
                _saveMasterData();
            }
            
            // Log activity
            _addActivityLog(householdId, 'member_added',
                (character.name || 'Unknown') + ' added as ' + type + (role ? ' (' + role + ')' : ''),
                characterId);
            
            // Log event
            _logEvent('household', 'Member Added',
                (character.name || 'Unknown') + ' added to ' + household.name + ' as ' + type,
                [character]);
            
            // Update status
            _updateHouseholdStatus(householdId);
            
            // Invalidate caches
            if (typeof window.invalidateAccessorCaches === 'function') {
                window.invalidateAccessorCaches();
            }
            
            return {
                success: true,
                member: member,
                household: household,
                character: character
            };
            
        } finally {
            _processingCommand = false;
        }
    }

    /**
     * Removes a member from a household
     * @param {string} householdId - Household ID
     * @param {string} characterId - Character ID
     * @param {Object} options - Options
     * @param {string} options.reason - Reason for removal
     * @param {number} options.leftYear - Year left (defaults to current)
     * @param {boolean} options.recordHistory - Record in character history (default: true)
     * @returns {Object} Result object
     */
    function removeMember(householdId, characterId, options) {
        if (_processingCommand) {
            return { success: false, reason: 'Command already in progress' };
        }
        _processingCommand = true;
        
        try {
            options = options || {};
            
            var household = _state.getHousehold(householdId);
            if (!household) {
                return { success: false, reason: 'Household not found' };
            }
            
            var character = _getCharacterById(characterId);
            if (!character) {
                return { success: false, reason: 'Character not found' };
            }
            
            var leftYear = options.leftYear || _getCurrentYear();
            var reason = options.reason || 'Removed';
            
            // Find member
            var memberIndex = -1;
            var member = null;
            for (var i = 0; i < household.members.length; i++) {
                if (household.members[i].characterId === characterId) {
                    memberIndex = i;
                    member = household.members[i];
                    break;
                }
            }
            
            if (memberIndex === -1) {
                return { success: false, reason: 'Character is not a member' };
            }
            
            // Check if this is the head
            var wasHead = member.isHead;
            
            // Remove from household
            household.members.splice(memberIndex, 1);
            
            // Update household
            var updates = {
                members: household.members,
                updatedAt: Date.now()
            };
            
            _state.updateHousehold(householdId, updates, { recordHistory: false });
            
            // Record in character history
            if (options.recordHistory !== false) {
                _recordCharacterHouseholdChange(characterId, null, leftYear, 'left',
                    reason || 'Left ' + household.name,
                    { previousHouseholdId: householdId, previousHouseholdName: household.name });
            }
            
            // Clear character's household reference
            if (character.household === householdId) {
                character.household = '';
                character.householdId = '';
                _saveMasterData();
            }
            
            // If this was the head, assign new head
            if (wasHead) {
                var newHead = null;
                for (var i = 0; i < household.members.length; i++) {
                    if (household.members[i].type === 'family' && !household.members[i].isHead) {
                        var candidate = _getCharacterById(household.members[i].characterId);
                        if (candidate && !candidate.isDeceased) {
                            newHead = candidate;
                            break;
                        }
                    }
                }
                
                if (newHead) {
                    setHead(householdId, newHead.id, { leftYear: leftYear });
                }
            }
            
            // Log activity
            _addActivityLog(householdId, 'member_removed',
                (character.name || 'Unknown') + ' removed (' + reason + ')',
                characterId);
            
            // Log event
            _logEvent('household', 'Member Removed',
                (character.name || 'Unknown') + ' removed from ' + household.name,
                [character]);
            
            // Update status
            _updateHouseholdStatus(householdId);
            
            // Invalidate caches
            if (typeof window.invalidateAccessorCaches === 'function') {
                window.invalidateAccessorCaches();
            }
            
            return {
                success: true,
                member: member,
                household: household,
                character: character,
                wasHead: wasHead
            };
            
        } finally {
            _processingCommand = false;
        }
    }

    /**
     * Updates a member's role or other properties
     * @param {string} householdId - Household ID
     * @param {string} characterId - Character ID
     * @param {Object} updates - Updates to apply
     * @param {string} updates.role - New role
     * @param {string} updates.type - New type ('family' or 'staff')
     * @param {string} updates.departmentId - New department ID
     * @param {boolean} updates.isHead - Whether this member is head
     * @param {string} updates.notes - New notes
     * @param {number} updates.joinedYear - New joined year
     * @param {boolean} options.recordHistory - Record in character history (default: true)
     * @returns {Object} Result object
     */
    function updateMember(householdId, characterId, updates, options) {
        if (_processingCommand) {
            return { success: false, reason: 'Command already in progress' };
        }
        _processingCommand = true;
        
        try {
            options = options || {};
            
            var household = _state.getHousehold(householdId);
            if (!household) {
                return { success: false, reason: 'Household not found' };
            }
            
            var character = _getCharacterById(characterId);
            if (!character) {
                return { success: false, reason: 'Character not found' };
            }
            
            // Find member
            var member = null;
            var memberIndex = -1;
            for (var i = 0; i < household.members.length; i++) {
                if (household.members[i].characterId === characterId) {
                    member = household.members[i];
                    memberIndex = i;
                    break;
                }
            }
            
            if (!member) {
                return { success: false, reason: 'Character is not a member' };
            }
            
            // Track old values for logging
            var oldRole = member.role;
            var oldType = member.type;
            var oldIsHead = member.isHead;
            
            // Apply updates
            var allowedFields = ['role', 'type', 'departmentId', 'isHead', 'notes', 'joinedYear'];
            var changed = false;
            
            for (var i = 0; i < allowedFields.length; i++) {
                var field = allowedFields[i];
                if (updates[field] !== undefined) {
                    if (field === 'isHead') {
                        member.isHead = updates[field];
                        if (member.isHead) {
                            member.headSince = member.headSince || _getCurrentYear();
                        } else {
                            member.headSince = null;
                        }
                    } else {
                        member[field] = updates[field];
                    }
                    changed = true;
                }
            }
            
            if (!changed) {
                return { success: false, reason: 'No changes to apply' };
            }
            
            // Update household
            _state.updateHousehold(householdId, { members: household.members }, { recordHistory: false });
            
            // If this is now a head, remove head status from other members
            if (member.isHead && !oldIsHead) {
                for (var i = 0; i < household.members.length; i++) {
                    if (household.members[i].characterId !== characterId && household.members[i].isHead) {
                        household.members[i].isHead = false;
                        household.members[i].headSince = null;
                    }
                }
                _state.updateHousehold(householdId, { members: household.members }, { recordHistory: false });
            }
            
            // Record in character history
            if (options.recordHistory !== false && member.role !== oldRole) {
                _recordCharacterHouseholdChange(characterId, householdId, _getCurrentYear(), 'transferred',
                    'Role changed from ' + oldRole + ' to ' + member.role,
                    { newRole: member.role });
            }
            
            // Log activity
            var details = [];
            if (member.role !== oldRole) details.push('role: ' + oldRole + ' → ' + member.role);
            if (member.type !== oldType) details.push('type: ' + oldType + ' → ' + member.type);
            if (member.isHead !== oldIsHead) details.push('head: ' + (oldIsHead ? 'yes' : 'no') + ' → ' + (member.isHead ? 'yes' : 'no'));
            
            _addActivityLog(householdId, 'member_updated',
                (character.name || 'Unknown') + ' updated: ' + details.join(', '),
                characterId);
            
            // Update status
            _updateHouseholdStatus(householdId);
            
            // Invalidate caches
            if (typeof window.invalidateAccessorCaches === 'function') {
                window.invalidateAccessorCaches();
            }
            
            return {
                success: true,
                member: member,
                household: household,
                character: character,
                changes: details
            };
            
        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 5. MEMBER TRANSFER
    // =========================================================================

    /**
     * Transfers a member from one household to another
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
     * @returns {Object} Result object
     */
    function transferMember(characterId, targetHouseholdId, options) {
        if (_processingCommand) {
            return { success: false, reason: 'Command already in progress' };
        }
        _processingCommand = true;
        
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
                var removeResult = removeMember(currentHousehold.id, characterId, {
                    reason: 'Transferred to ' + targetHousehold.name + ': ' + reason,
                    leftYear: year,
                    recordHistory: options.recordHistory !== false
                });
                
                if (!removeResult.success) {
                    return { success: false, reason: 'Failed to remove from current household: ' + removeResult.reason };
                }
            }
            
            // Add to target household
            var memberType = options.type || (existingMember ? existingMember.type : 'family');
            var memberRole = options.role || (existingMember ? existingMember.role : 'Family Member');
            
            var addResult = addMember(targetHouseholdId, characterId, memberType, {
                role: memberRole,
                joinedYear: year,
                isHead: options.isHead || false,
                departmentId: options.departmentId || null,
                notes: options.notes || 'Transferred from ' + (currentHousehold ? currentHousehold.name : 'unknown'),
                recordHistory: options.recordHistory !== false
            });
            
            if (!addResult.success) {
                // Rollback: add back to original household
                if (currentHousehold && existingMember) {
                    addMember(currentHousehold.id, characterId, currentMemberData.type || 'family', {
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
            
            // Log activity in both households
            if (currentHousehold) {
                _addActivityLog(currentHousehold.id, 'member_transferred_out',
                    (character.name || 'Unknown') + ' transferred to ' + targetHousehold.name + ': ' + reason,
                    characterId);
            }
            
            _addActivityLog(targetHouseholdId, 'member_transferred_in',
                (character.name || 'Unknown') + ' transferred from ' + (currentHousehold ? currentHousehold.name : 'None') + ': ' + reason,
                characterId);
            
            // Log event
            _logEvent('household', 'Member Transferred',
                (character.name || 'Unknown') + ' transferred from ' + (currentHousehold ? currentHousehold.name : 'None') + ' to ' + targetHousehold.name,
                [character]);
            
            // Invalidate caches
            if (typeof window.invalidateAccessorCaches === 'function') {
                window.invalidateAccessorCaches();
            }
            
            return {
                success: true,
                character: character,
                fromHousehold: currentHousehold,
                toHousehold: targetHousehold,
                year: year,
                reason: reason
            };
            
        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 6. HEAD OF HOUSEHOLD MANAGEMENT
    // =========================================================================

    /**
     * Sets the head of a household
     * @param {string} householdId - Household ID
     * @param {string} characterId - Character ID (or null to remove head)
     * @param {Object} options - Options
     * @param {number} options.year - Year of succession (defaults to current)
     * @param {string} options.reason - Reason for change
     * @param {boolean} options.recordHistory - Record in character history (default: true)
     * @returns {Object} Result object
     */
    function setHead(householdId, characterId, options) {
        if (_processingCommand) {
            return { success: false, reason: 'Command already in progress' };
        }
        _processingCommand = true;
        
        try {
            options = options || {};
            
            var household = _state.getHousehold(householdId);
            if (!household) {
                return { success: false, reason: 'Household not found' };
            }
            
            var year = options.year || _getCurrentYear();
            var reason = options.reason || 'Succession';
            
            // If removing head
            if (characterId === null) {
                var oldHead = null;
                for (var i = 0; i < household.members.length; i++) {
                    if (household.members[i].isHead) {
                        oldHead = household.members[i];
                        household.members[i].isHead = false;
                        household.members[i].headSince = null;
                        household.members[i].role = 'Family Member';
                    }
                }
                
                _state.updateHousehold(householdId, { members: household.members }, { recordHistory: false });
                
                if (oldHead) {
                    _recordCharacterHouseholdChange(oldHead.characterId, householdId, year, 'transferred',
                        'Stepped down as head of household',
                        { newRole: 'Family Member' });
                }
                
                _addActivityLog(householdId, 'head_removed', 'Head of household removed');
                
                return { success: true, oldHead: oldHead };
            }
            
            // Find character and member
            var character = _getCharacterById(characterId);
            if (!character) {
                return { success: false, reason: 'Character not found' };
            }
            
            var member = null;
            var memberIndex = -1;
            for (var i = 0; i < household.members.length; i++) {
                if (household.members[i].characterId === characterId) {
                    member = household.members[i];
                    memberIndex = i;
                    break;
                }
            }
            
            // If character is not a member, add them as family
            if (!member) {
                var addResult = addMember(householdId, characterId, 'family', {
                    role: 'Head of Household',
                    joinedYear: year,
                    isHead: true,
                    notes: 'Appointed as head of household',
                    recordHistory: options.recordHistory !== false
                });
                
                if (!addResult.success) {
                    return { success: false, reason: 'Failed to add character as member: ' + addResult.reason };
                }
                
                _addActivityLog(householdId, 'head_appointed',
                    (character.name || 'Unknown') + ' appointed as head',
                    characterId);
                
                return {
                    success: true,
                    character: character,
                    member: addResult.member,
                    year: year,
                    isNewMember: true
                };
            }
            
            // Remove existing head
            var oldHead = null;
            for (var i = 0; i < household.members.length; i++) {
                if (household.members[i].isHead) {
                    oldHead = household.members[i];
                    household.members[i].isHead = false;
                    household.members[i].headSince = null;
                    household.members[i].role = 'Family Member';
                }
            }
            
            // Set new head
            member.isHead = true;
            member.role = 'Head of Household';
            member.headSince = year;
            
            _state.updateHousehold(householdId, { members: household.members }, { recordHistory: false });
            
            // Record history
            if (options.recordHistory !== false) {
                _recordCharacterHouseholdChange(characterId, householdId, year, 'transferred',
                    'Became head of household' + (oldHead ? ' (replacing ' + oldHead.characterName + ')' : ''),
                    { newRole: 'Head of Household' });
                
                if (oldHead) {
                    _recordCharacterHouseholdChange(oldHead.characterId, householdId, year, 'transferred',
                        'Stepped down as head of household',
                        { newRole: 'Family Member' });
                }
            }
            
            // Log activity
            _addActivityLog(householdId, 'head_changed',
                (character.name || 'Unknown') + ' became head' + (oldHead ? ' (replacing ' + oldHead.characterName + ')' : ''),
                characterId);
            
            // Log event
            _logEvent('household', 'Head Changed',
                (character.name || 'Unknown') + ' became head of ' + household.name,
                [character]);
            
            // Update status
            _updateHouseholdStatus(householdId);
            
            // Invalidate caches
            if (typeof window.invalidateAccessorCaches === 'function') {
                window.invalidateAccessorCaches();
            }
            
            return {
                success: true,
                character: character,
                member: member,
                oldHead: oldHead,
                year: year
            };
            
        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 7. DEPARTMENT MANAGEMENT
    // =========================================================================

    /**
     * Adds a department to a household
     * @param {string} householdId - Household ID
     * @param {string} name - Department name
     * @param {Object} options - Options
     * @param {string} options.headId - Department head character ID
     * @returns {Object} Result object
     */
    function addDepartment(householdId, name, options) {
        if (_processingCommand) {
            return { success: false, reason: 'Command already in progress' };
        }
        _processingCommand = true;
        
        try {
            options = options || {};
            
            var household = _state.getHousehold(householdId);
            if (!household) {
                return { success: false, reason: 'Household not found' };
            }
            
            if (!name || name.trim() === '') {
                return { success: false, reason: 'Department name is required' };
            }
            
            var trimmedName = name.trim();
            
            // Check for duplicate
            if (household.departments) {
                for (var i = 0; i < household.departments.length; i++) {
                    if (household.departments[i].name.toLowerCase() === trimmedName.toLowerCase()) {
                        return { success: false, reason: 'Department with this name already exists' };
                    }
                }
            }
            
            var department = {
                id: _generateId('dept'),
                name: trimmedName,
                headId: null,
                headName: null,
                createdAt: Date.now()
            };
            
            // Set head if provided
            if (options.headId) {
                var headChar = _getCharacterById(options.headId);
                if (headChar) {
                    // Check if character is a member
                    var isMember = false;
                    for (var i = 0; i < household.members.length; i++) {
                        if (household.members[i].characterId === options.headId) {
                            isMember = true;
                            break;
                        }
                    }
                    
                    if (isMember) {
                        department.headId = options.headId;
                        department.headName = (headChar.name || '') + (headChar.surname ? ' ' + headChar.surname : '');
                    }
                }
            }
            
            if (!household.departments) {
                household.departments = [];
            }
            household.departments.push(department);
            
            _state.updateHousehold(householdId, { departments: household.departments }, { recordHistory: false });
            
            // If head set, update member
            if (department.headId) {
                for (var i = 0; i < household.members.length; i++) {
                    if (household.members[i].characterId === department.headId) {
                        household.members[i].departmentId = department.id;
                        household.members[i].isHead = true;
                        break;
                    }
                }
                _state.updateHousehold(householdId, { members: household.members }, { recordHistory: false });
            }
            
            _addActivityLog(householdId, 'department_added', 'Added department: ' + trimmedName);
            
            // Invalidate caches
            if (typeof window.invalidateAccessorCaches === 'function') {
                window.invalidateAccessorCaches();
            }
            
            return {
                success: true,
                department: department,
                household: household
            };
            
        } finally {
            _processingCommand = false;
        }
    }

    /**
     * Removes a department from a household
     * @param {string} householdId - Household ID
     * @param {string} departmentId - Department ID
     * @param {Object} options - Options
     * @param {boolean} options.transferMembers - Transfer members to no department (default: true)
     * @returns {Object} Result object
     */
    function removeDepartment(householdId, departmentId, options) {
        if (_processingCommand) {
            return { success: false, reason: 'Command already in progress' };
        }
        _processingCommand = true;
        
        try {
            options = options || {};
            
            var household = _state.getHousehold(householdId);
            if (!household) {
                return { success: false, reason: 'Household not found' };
            }
            
            if (!household.departments) {
                return { success: false, reason: 'No departments found' };
            }
            
            var departmentIndex = -1;
            var department = null;
            for (var i = 0; i < household.departments.length; i++) {
                if (household.departments[i].id === departmentId) {
                    departmentIndex = i;
                    department = household.departments[i];
                    break;
                }
            }
            
            if (departmentIndex === -1) {
                return { success: false, reason: 'Department not found' };
            }
            
            // Remove department from members
            if (options.transferMembers !== false) {
                for (var i = 0; i < household.members.length; i++) {
                    if (household.members[i].departmentId === departmentId) {
                        household.members[i].departmentId = null;
                        if (household.members[i].isHead && !household.members[i].isHead) {
                            household.members[i].isHead = false;
                        }
                    }
                }
                _state.updateHousehold(householdId, { members: household.members }, { recordHistory: false });
            }
            
            var departmentName = department.name;
            household.departments.splice(departmentIndex, 1);
            
            _state.updateHousehold(householdId, { departments: household.departments }, { recordHistory: false });
            
            _addActivityLog(householdId, 'department_deleted', 'Deleted department: ' + departmentName);
            
            // Invalidate caches
            if (typeof window.invalidateAccessorCaches === 'function') {
                window.invalidateAccessorCaches();
            }
            
            return {
                success: true,
                department: department,
                household: household
            };
            
        } finally {
            _processingCommand = false;
        }
    }

    /**
     * Updates a department
     * @param {string} householdId - Household ID
     * @param {string} departmentId - Department ID
     * @param {Object} updates - Updates to apply
     * @param {string} updates.name - New name
     * @param {string} updates.headId - New head character ID
     * @returns {Object} Result object
     */
    function updateDepartment(householdId, departmentId, updates) {
        if (_processingCommand) {
            return { success: false, reason: 'Command already in progress' };
        }
        _processingCommand = true;
        
        try {
            var household = _state.getHousehold(householdId);
            if (!household) {
                return { success: false, reason: 'Household not found' };
            }
            
            if (!household.departments) {
                return { success: false, reason: 'No departments found' };
            }
            
            var department = null;
            var departmentIndex = -1;
            for (var i = 0; i < household.departments.length; i++) {
                if (household.departments[i].id === departmentId) {
                    department = household.departments[i];
                    departmentIndex = i;
                    break;
                }
            }
            
            if (!department) {
                return { success: false, reason: 'Department not found' };
            }
            
            var changed = false;
            
            // Update name
            if (updates.name && updates.name.trim()) {
                var trimmedName = updates.name.trim();
                if (trimmedName !== department.name) {
                    department.name = trimmedName;
                    changed = true;
                }
            }
            
            // Update head
            if (updates.headId !== undefined) {
                // Clear old head
                if (department.headId) {
                    for (var i = 0; i < household.members.length; i++) {
                        if (household.members[i].characterId === department.headId) {
                            household.members[i].isHead = false;
                            break;
                        }
                    }
                }
                
                if (updates.headId === null) {
                    department.headId = null;
                    department.headName = null;
                    changed = true;
                } else {
                    var headChar = _getCharacterById(updates.headId);
                    if (headChar) {
                        // Check if character is a member
                        var isMember = false;
                        for (var i = 0; i < household.members.length; i++) {
                            if (household.members[i].characterId === updates.headId) {
                                isMember = true;
                                break;
                            }
                        }
                        
                        if (isMember) {
                            department.headId = updates.headId;
                            department.headName = (headChar.name || '') + (headChar.surname ? ' ' + headChar.surname : '');
                            changed = true;
                            
                            // Set member as head of this department
                            for (var i = 0; i < household.members.length; i++) {
                                if (household.members[i].characterId === updates.headId) {
                                    household.members[i].isHead = true;
                                    household.members[i].departmentId = departmentId;
                                    break;
                                }
                            }
                        }
                    }
                }
            }
            
            if (!changed) {
                return { success: false, reason: 'No changes to apply' };
            }
            
            // Save department
            household.departments[departmentIndex] = department;
            _state.updateHousehold(householdId, { 
                departments: household.departments,
                members: household.members
            }, { recordHistory: false });
            
            _addActivityLog(householdId, 'department_updated', 
                'Updated department: ' + department.name);
            
            // Invalidate caches
            if (typeof window.invalidateAccessorCaches === 'function') {
                window.invalidateAccessorCaches();
            }
            
            return {
                success: true,
                department: department,
                household: household
            };
            
        } finally {
            _processingCommand = false;
        }
    }

    /**
     * Sets the head of a department
     * @param {string} householdId - Household ID
     * @param {string} departmentId - Department ID
     * @param {string} characterId - Character ID (or null to remove)
     * @returns {Object} Result object
     */
    function setDepartmentHead(householdId, departmentId, characterId) {
        return updateDepartment(householdId, departmentId, { headId: characterId });
    }

    // =========================================================================
    // 8. REPAIR FUNCTIONS
    // =========================================================================

    /**
     * Repairs household memberships across all characters and households
     * @param {Object} options - Options
     * @param {boolean} options.saveAfter - Save after repair (default: true)
     * @param {boolean} options.verbose - Log details (default: false)
     * @returns {Object} Repair results
     */
    function repairMemberships(options) {
        options = options || {};
        var saveAfter = options.saveAfter !== false;
        var verbose = options.verbose || false;
        
        if (_processingCommand) {
            return { success: false, reason: 'Command already in progress' };
        }
        _processingCommand = true;
        
        try {
            var characters = _getCharacters();
            var households = _state.getAllHouseholds({ includeDeprecated: true });
            
            var results = {
                householdsChecked: households.length,
                charactersChecked: characters.length,
                charactersAddedToMembers: 0,
                charactersRemovedFromMembers: 0,
                householdsWithMissingMembers: 0,
                householdsFixed: 0,
                details: [],
                errors: []
            };
            
            // Build character map
            var charMap = {};
            for (var i = 0; i < characters.length; i++) {
                charMap[characters[i].id] = characters[i];
            }
            
            // Build household map
            var householdMap = {};
            for (var i = 0; i < households.length; i++) {
                householdMap[households[i].id] = households[i];
            }
            
            // Step 1: Ensure all households have members array
            for (var i = 0; i < households.length; i++) {
                var h = households[i];
                if (!h.members) {
                    h.members = [];
                    results.householdsWithMissingMembers++;
                    results.details.push({
                        household: h.name || h.id,
                        action: 'created_members_array',
                        message: 'Created members array for "' + (h.name || h.id) + '"'
                    });
                }
            }
            
            // Step 2: Find characters with household references
            var charsWithHousehold = characters.filter(function(c) { 
                return c.household || c.householdId; 
            });
            
            if (verbose) {
                console.log('📊 Found ' + charsWithHousehold.length + ' characters with household references');
            }
            
            // Step 3: Ensure characters are in members arrays
            for (var i = 0; i < charsWithHousehold.length; i++) {
                var c = charsWithHousehold[i];
                var householdId = c.household || c.householdId;
                if (!householdId) continue;
                
                var h = householdMap[householdId];
                if (!h) {
                    results.errors.push({
                        character: c.name || c.id,
                        householdId: householdId,
                        message: 'Character "' + (c.name || c.id) + '" references household ' + householdId + ' which doesn\'t exist'
                    });
                    continue;
                }
                
                if (!h.members) h.members = [];
                
                var isInMembers = h.members.some(function(m) { 
                    return m.characterId === c.id; 
                });
                
                if (!isInMembers) {
                    var memberEntry = {
                        characterId: c.id,
                        characterName: (c.name || '') + (c.surname ? ' ' + c.surname : ''),
                        type: 'family',
                        role: 'Member',
                        isHead: false,
                        joinedYear: c.birthYear || _getCurrentYear(),
                        notes: 'Added by repair function'
                    };
                    
                    // Check if character was head in history
                    if (c.householdHistory) {
                        for (var j = 0; j < c.householdHistory.length; j++) {
                            var entry = c.householdHistory[j];
                            if (entry.householdId === householdId && entry.isHead) {
                                memberEntry.isHead = true;
                                memberEntry.role = 'Head of Household';
                                memberEntry.headSince = entry.joinedYear || entry.year || _getCurrentYear();
                                break;
                            }
                        }
                    }
                    
                    h.members.push(memberEntry);
                    results.charactersAddedToMembers++;
                    results.details.push({
                        character: c.name || c.id,
                        household: h.name || h.id,
                        action: 'added_to_members',
                        isHead: memberEntry.isHead,
                        message: 'Added "' + (c.name || c.id) + '" to "' + (h.name || h.id) + '" members' + (memberEntry.isHead ? ' as Head' : '')
                    });
                }
            }
            
            // Step 4: Remove characters from members if they don't have household reference
            for (var i = 0; i < households.length; i++) {
                var h = households[i];
                if (!h.members) continue;
                
                var toRemove = [];
                for (var j = 0; j < h.members.length; j++) {
                    var m = h.members[j];
                    var c = charMap[m.characterId];
                    if (!c) {
                        toRemove.push({ index: j, member: m, reason: 'character_not_found' });
                        continue;
                    }
                    
                    var hasHouseholdRef = c.household === h.id || c.householdId === h.id;
                    if (!hasHouseholdRef && !c.isDeceased) {
                        var hasHistory = false;
                        if (c.householdHistory) {
                            for (var k = 0; k < c.householdHistory.length; k++) {
                                if (c.householdHistory[k].householdId === h.id && !c.householdHistory[k].leftYear) {
                                    hasHistory = true;
                                    break;
                                }
                            }
                        }
                        if (!hasHistory) {
                            toRemove.push({ index: j, member: m, reason: 'no_household_reference' });
                        }
                    }
                }
                
                toRemove.sort(function(a, b) { return b.index - a.index; });
                for (var j = 0; j < toRemove.length; j++) {
                    var item = toRemove[j];
                    var m = item.member;
                    h.members.splice(item.index, 1);
                    results.charactersRemovedFromMembers++;
                    results.details.push({
                        character: m.characterName || m.characterId,
                        household: h.name || h.id,
                        action: 'removed_from_members',
                        reason: item.reason,
                        message: 'Removed "' + (m.characterName || m.characterId) + '" from "' + (h.name || h.id) + '" members (' + item.reason + ')'
                    });
                }
            }
            
            // Step 5: Ensure head is properly set
            for (var i = 0; i < households.length; i++) {
                var h = households[i];
                if (!h.members || h.members.length === 0) continue;
                
                var livingHeads = h.members.filter(function(m) {
                    var c = charMap[m.characterId];
                    return c && !c.isDeceased && m.isHead;
                });
                
                if (livingHeads.length > 1) {
                    livingHeads.sort(function(a, b) { 
                        return (a.headSince || 0) - (b.headSince || 0); 
                    });
                    livingHeads.forEach(function(m, index) {
                        if (index > 0) {
                            m.isHead = false;
                            m.role = 'Family Member';
                            results.details.push({
                                character: m.characterName || m.characterId,
                                household: h.name || h.id,
                                action: 'removed_duplicate_head',
                                message: 'Removed duplicate head "' + (m.characterName || m.characterId) + '" from "' + (h.name || h.id) + '"'
                            });
                        }
                    });
                }
                
                var livingFamily = h.members.filter(function(m) {
                    var c = charMap[m.characterId];
                    return c && !c.isDeceased && m.type === 'family';
                });
                
                if (livingFamily.length > 0 && livingHeads.length === 0) {
                    livingFamily.sort(function(a, b) {
                        var cA = charMap[a.characterId];
                        var cB = charMap[b.characterId];
                        var ageA = cA ? _getCurrentYear() - (cA.birthYear || 0) : 0;
                        var ageB = cB ? _getCurrentYear() - (cB.birthYear || 0) : 0;
                        return ageB - ageA;
                    });
                    
                    var newHead = livingFamily[0];
                    var c = charMap[newHead.characterId];
                    newHead.isHead = true;
                    newHead.role = 'Head of Household';
                    newHead.headSince = _getCurrentYear();
                    
                    results.details.push({
                        character: c ? c.name : newHead.characterId,
                        household: h.name || h.id,
                        action: 'auto_assigned_head',
                        message: 'Auto-assigned "' + (c ? c.name : newHead.characterId) + '" as head of "' + (h.name || h.id) + '"'
                    });
                }
            }
            
            // Step 6: Update household status
            for (var i = 0; i < households.length; i++) {
                _updateHouseholdStatus(households[i].id);
            }
            
            // Step 7: Save
            if (saveAfter) {
                _saveMasterData();
                if (typeof window.invalidateAccessorCaches === 'function') {
                    window.invalidateAccessorCaches();
                }
            }
            
            if (verbose) {
                console.log('📊 Repair Results:');
                console.log('   Characters added to members: ' + results.charactersAddedToMembers);
                console.log('   Characters removed from members: ' + results.charactersRemovedFromMembers);
                console.log('   Households with missing members: ' + results.householdsWithMissingMembers);
                console.log('   Details: ' + results.details.length + ' entries');
                console.log('   Errors: ' + results.errors.length);
            }
            
            return results;
            
        } finally {
            _processingCommand = false;
        }
    }

    /**
     * Fix a single character's household membership
     * @param {string} characterId - Character ID
     * @param {string} householdId - Household ID (or null to remove)
     * @param {Object} options - Options
     * @param {string} options.role - Role (default: 'Family Member')
     * @param {number} options.joinedYear - Year joined (default: current)
     * @param {boolean} options.isHead - Whether to make head
     * @param {string} options.notes - Notes
     * @returns {Object} Result object
     */
    function fixCharacterHousehold(characterId, householdId, options) {
        if (_processingCommand) {
            return { success: false, reason: 'Command already in progress' };
        }
        _processingCommand = true;
        
        try {
            options = options || {};
            
            var character = _getCharacterById(characterId);
            if (!character) {
                return { success: false, reason: 'Character not found' };
            }
            
            var currentHouseholdId = character.household || character.householdId || null;
            
            // If removing from household
            if (!householdId) {
                if (currentHouseholdId) {
                    var removeResult = removeMember(currentHouseholdId, characterId, {
                        reason: 'Removed by repair function',
                        recordHistory: false
                    });
                    
                    if (removeResult.success) {
                        return { 
                            success: true, 
                            action: 'removed', 
                            character: character.name || 'Unknown' 
                        };
                    } else {
                        return { 
                            success: false, 
                            reason: 'Failed to remove: ' + removeResult.reason 
                        };
                    }
                }
                return { 
                    success: true, 
                    action: 'already_removed', 
                    character: character.name || 'Unknown' 
                };
            }
            
            var targetHousehold = _state.getHousehold(householdId);
            if (!targetHousehold) {
                return { success: false, reason: 'Target household not found' };
            }
            
            // If already in target
            if (currentHouseholdId === householdId) {
                return { 
                    success: true, 
                    action: 'already_member', 
                    character: character.name || 'Unknown' 
                };
            }
            
            // Remove from current household if any
            if (currentHouseholdId) {
                removeMember(currentHouseholdId, characterId, {
                    reason: 'Moved to ' + targetHousehold.name + ' by repair function',
                    recordHistory: false
                });
            }
            
            // Add to new household
            var joinedYear = options.joinedYear || character.birthYear || _getCurrentYear();
            var role = options.role || 'Family Member';
            var isHead = options.isHead || false;
            
            var addResult = addMember(householdId, characterId, 'family', {
                role: role,
                joinedYear: joinedYear,
                isHead: isHead,
                notes: options.notes || 'Fixed by repair function',
                recordHistory: false
            });
            
            if (addResult.success) {
                return {
                    success: true,
                    action: 'added',
                    character: character.name || 'Unknown',
                    household: targetHousehold.name
                };
            } else {
                return {
                    success: false,
                    reason: 'Failed to add: ' + addResult.reason
                };
            }
            
        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 9. PUBLIC API - HISTORY
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
    function recordHistory(characterId, householdId, year, action, reason, options) {
        return _recordCharacterHouseholdChange(characterId, householdId, year, action, reason, options);
    }

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

    window.HouseholdCommands = {
        // Member management
        addMember: addMember,
        removeMember: removeMember,
        updateMember: updateMember,
        transferMember: transferMember,
        
        // Head management
        setHead: setHead,
        
        // Department management
        addDepartment: addDepartment,
        removeDepartment: removeDepartment,
        updateDepartment: updateDepartment,
        setDepartmentHead: setDepartmentHead,
        
        // History
        recordHistory: recordHistory,
        
        // Repair
        repairMemberships: repairMemberships,
        fixCharacterHousehold: fixCharacterHousehold
    };

    // ES Module exports
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            addMember: addMember,
            removeMember: removeMember,
            updateMember: updateMember,
            transferMember: transferMember,
            setHead: setHead,
            addDepartment: addDepartment,
            removeDepartment: removeDepartment,
            updateDepartment: updateDepartment,
            setDepartmentHead: setDepartmentHead,
            recordHistory: recordHistory,
            repairMemberships: repairMemberships,
            fixCharacterHousehold: fixCharacterHousehold
        };
    }

})();